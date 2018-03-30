import { PoolResource, PoolResourceStatus, PoolResourceStatusNames } from './PoolResource';
import { CircularQueue } from './CircularQueue';

export abstract class Factory<O> {
  async abstract create(): Promise<O>;
  async abstract destroy(resource: O): Promise<void>;
  async abstract validate(resource: O): Promise<boolean>;
}

export interface PoolOptions {
  maxSize: number,
  minSize?: number,
  maxWaitingClients?: number,
  testOnBorrow?: boolean,
  testOnRelease?: boolean,
  acquireTimeoutMillis?: number,
  maxConcurrentCreate?: number,

  evictionRunIntervalMillis?: number,
  numTestsPerRun?: number,
  idleTimeoutMillis?: number,
}
const RESOURCEID_FIELD = '__resourceID';

enum PoolStatus {
  NOT_STARTED,
  STARTING,
  STARTED,
  STOPPING,
  STOPPED,
}
const PoolStatusNames = ['NOT_STARTED', 'STARTING', 'STARTED', 'STOPPING', 'STOPPED'];

const DEFAULT_POOL_OPTIONS: PoolOptions = {
  maxConcurrentCreate: 3,
  maxSize: 10,
  minSize: 1,
  testOnBorrow: true,
  maxWaitingClients: 10,
  acquireTimeoutMillis: 1000,
};

class UnfulfilledRequest<O> {
  timeoutMs: number;
  timer: NodeJS.Timer;
  rejectMethod: (err: any) => void;
  resolveMethod: (o: O) => void;
  resolved = false;
  constructor(resolve: (o: O) => void, reject: (err: any) => void, timeout: number) {
    this.resolveMethod = resolve;
    this.rejectMethod = reject;
    this.timer = setTimeout(() => this.timeout(), timeout);
    this.timeoutMs = timeout;
  }
  resolve(r: PoolResource<O>, pool: Pool<O>) {
    if (this.resolved) {
      // Somehow this got resolved in the nextTick.... probably a recent timeout... let's send
      pool.doFastDispatch(r);
      return;
    }
    this.resolved = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.resolveMethod(r.getResource());
  }
  reject(e: any) {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.rejectMethod(e);
  }
  timeout() {
    this.timer = null;
    this.reject(new Error(`Acquire timed out after ${this.timeoutMs} ms`));
  }
}

export class Pool<O> {
  private static poolIdCounter = 0;
  poolId: string;
  poolOptions: PoolOptions;
  factory: Factory<O>;
  private resourceId = 1;

  private allResources: CircularQueue<PoolResource<O>>;
  private availableResources: CircularQueue<PoolResource<O>>;
  private unfulfilledRequests: Array<UnfulfilledRequest<O>> = [];
  private status = PoolStatus.NOT_STARTED;

  constructor(factory: Factory<O>, poolOptions: PoolOptions) {
    this.factory = factory;
    this.poolId = `${Pool.poolIdCounter++}_`;
    this.poolOptions = {...DEFAULT_POOL_OPTIONS, ...poolOptions};
    this.allResources = new CircularQueue<PoolResource<O>>(this.poolOptions.maxSize);
    this.availableResources = new CircularQueue<PoolResource<O>>(this.poolOptions.maxSize);
  }
  async start() {
    if (this.status !== PoolStatus.NOT_STARTED) {
      throw new Error('Pool already started');
    }
    this.switchStatus(PoolStatus.STARTING);
    await this.checkMinSize();
    this.switchStatus(PoolStatus.STARTED);
  }
  async stop() {
    this.switchStatus(PoolStatus.STOPPING);
    // Destroy all available resources
    while (!this.availableResources.isEmpty()) {
      const poolResource = this.availableResources.shift();
      this.destroyPoolResource(poolResource);
    }
    while (this.unfulfilledRequests.length > 0) {
      const unfulfilledRequest = this.unfulfilledRequests.pop();
      unfulfilledRequest.reject(new Error('Pool shutting down'));
    }
    this.allResources.forEach((poolResource) => {
      if (poolResource.getStatus() === PoolResourceStatus.LENT) {
        poolResource.registerStatusChangeListerner(() => this.destroyPoolResource(poolResource));
      }
    });
    this.switchStatus(PoolStatus.STOPPED);
  }
  async acquire(): Promise<O> {
    if (this.status !== PoolStatus.STARTED) {
      throw new Error(`Invalid pool state (${PoolStatusNames[this.status]}), can't acquire connections`);
    }
    while (!this.availableResources.isEmpty()) {
      const poolResource = this.acquireAvailablePoolResource();
      if (poolResource) {
        if (this.poolOptions.testOnBorrow) {
          const ok = await this.factory.validate(poolResource.getResource());
          if (ok) {
            return poolResource.getResource();
          } else {
            this.destroyPoolResource(poolResource);
          }
        } else {
          return poolResource.getResource();
        }
      }
    }
    if (this.unfulfilledRequests.length < this.poolOptions.maxWaitingClients) {
      // There's still space in the queue
      this.createNewIfPossible(); // No Await here on purpose!!!! This is sent to the background
      return await new Promise<O>((resolve, reject) => {
        const unfulfilledRequest = new UnfulfilledRequest<O>(resolve, reject, this.poolOptions.acquireTimeoutMillis);
        this.unfulfilledRequests.push(unfulfilledRequest);
      });
    } else {
      throw new Error(`Max waiting clients reached`);
    }
  }
  async release(resource: O) {
    if (!Object.hasOwnProperty.call(resource, RESOURCEID_FIELD)) {
      throw new Error(`Resource is not a managed resource`);
    }
    const resourceId: string = resource[RESOURCEID_FIELD];
    if (!resourceId.startsWith(this.poolId)) {
      throw new Error(`Resource is not managed by this pool`);
    }
    const poolResource = this.allResources.find((pr) => pr.getResourceId() === resourceId);
    if (!poolResource) {
      // This resource is no longer managed by this pool. Will ignore it
      return;
    }
    if (this.poolOptions.testOnRelease) {
      const valid = await this.factory.validate(resource);
      if (valid) {
        this.doFastDispatch(poolResource);
      } else {
        this.destroyPoolResource(poolResource);
      }
    } else {
      this.doFastDispatch(poolResource);
    }
  }
  public getNumAvailable(): number {
    return this.availableResources.getSize();
  }
  public getStatusCounts(): number[] {
    const counts = [];
    PoolResourceStatusNames.forEach(() => counts.push(0));
    this.allResources.forEach((poolResource) => { counts[poolResource.getStatus()]++; });
    return counts;
  }
  public getNumConnectionsInState(status: PoolResourceStatus): number {
    return this.allResources.count((val) => val.getStatus() === status);
  }
  private switchStatus(newStatus: PoolStatus) {
    if (this.status !== (newStatus - 1)) {
      throw new Error(`Can't move from status ${PoolStatusNames[this.status]} to ${PoolStatusNames[newStatus]}`);
    }
    this.status = newStatus;
  }
  private acquireAvailablePoolResource(): PoolResource<O> {
    const poolResource = this.availableResources.shift();
    if (!this.poolOptions.testOnBorrow || this.isValid(poolResource)) {
      this.markResourceAsLent(poolResource);
      return poolResource;
    } else {
      this.destroyPoolResource(poolResource);
    }
    return undefined;
  }
  private isValid(poolResource: PoolResource<O>) {
    return this.factory.validate(poolResource.getResource());
  }
  private destroyPoolResource(poolResource: PoolResource<O>) {
    poolResource.setStatus(PoolResourceStatus.DESTROYED);
    this.allResources.fastRemove(poolResource);
    try {
      this.factory.destroy(poolResource.getResource()); // No await on purpose.
    } catch (e) {
      // tslint:disable-next-line:no-console
      console.log(e, 'There was an error destroying resource');
    }
    this.checkMinSize();
  }
  public getPoolSize(): number {
    return this.allResources.getSize();
  }
  private async checkMinSize() {
    while ((this.status === PoolStatus.STARTING || this.status === PoolStatus.STARTED) &&
        this.getPoolSize() < this.poolOptions.minSize) {
      // Need to request connections
      await this.createNewIfPossible(); // No await on purpose
    }
  }
  private markResourceAsLent(poolResource: PoolResource<O>) {
    poolResource.setStatus(PoolResourceStatus.LENT);
  }
  doFastDispatch(poolResource: PoolResource<O>) {
    if (this.status >= PoolStatus.STOPPING) {
      this.destroyPoolResource(poolResource);
      return;
    }
    poolResource.setStatus(PoolResourceStatus.FAST_DISPATCH);
    if (this.unfulfilledRequests.length > 0) {
      const unfulfilledRequest = this.unfulfilledRequests.pop();
      this.fulfillUnfulfilled(unfulfilledRequest, poolResource);
    } else {
      this.doMakeAvailable(poolResource);
    }
  }
  private doMakeAvailable(poolResource: PoolResource<O>) {
    poolResource.setStatus(PoolResourceStatus.AVAILABLE);
    this.availableResources.push(poolResource);
  }
  private fulfillUnfulfilled(unfulfilledRequest: UnfulfilledRequest<O>, poolResource: PoolResource<O>) {
    if (unfulfilledRequest.resolved) {
      this.doFastDispatch(poolResource);
    } else {
      this.markResourceAsLent(poolResource);
      process.nextTick((r) => unfulfilledRequest.resolve(r, this), poolResource);
    }
  }
  private async createNewIfPossible() {
    if (this.allResources.isFull()) {
      return;
    }
    const resource = await this.factory.create();
    const resourceId = `${this.poolId}${this.resourceId++}`;
    resource[RESOURCEID_FIELD] = resourceId;
    const poolResouce = new PoolResource<O>(resourceId, resource);
    this.allResources.push(poolResouce);
    this.doFastDispatch(poolResouce);
  }
  getOptions(): PoolOptions {
    return {...this.poolOptions};
  }
}

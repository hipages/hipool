export enum PoolResourceStatus {
  NEW,
  FAST_DISPATCH,
  AVAILABLE,
  LENT,
  DESTROYED,
}

export const PoolResourceStatusNames = ['NEW', 'FAST_DISPATCH', 'AVAILABLE', 'LENT', 'DESTROYED'];

export class PoolResource<O> {
  resouceId: string;
  resource: O;
  status = PoolResourceStatus.NEW;
  statusChangeListeners: ((from: PoolResourceStatus, to: PoolResourceStatus) => void)[] = [];

  constructor(resouceId: string, resource: O) {
    this.resource = resource;
    this.resouceId = resouceId;
  }
  getResource(): O {
    return this.resource;
  }
  getResourceId(): string {
    return this.resouceId;
  }
  getStatus(): PoolResourceStatus {
    return this.status;
  }
  setStatus(newStatus: PoolResourceStatus) {
    if (newStatus === this.status) {
      return;
    }
    if (!this.canSwitch(this.status, newStatus)) {
      throw new Error(`Invalid state transition from ${this.status} to ${newStatus}`);
    }
    const oldStatus = this.status;
    this.status = newStatus;
    if (this.statusChangeListeners.length > 0) {
      process.nextTick(this.statusChangeListeners.pop(), oldStatus, newStatus);
    }
  }
  // tslint:disable-next-line:prefer-function-over-method
  private canSwitch(from: PoolResourceStatus, to: PoolResourceStatus): boolean {
    return true;
  }
  public registerStatusChangeListerner(listener: (from: PoolResourceStatus, to: PoolResourceStatus) => void) {
    this.statusChangeListeners.push(listener);
  }
}

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
    this.status = newStatus;
  }
  // tslint:disable-next-line:prefer-function-over-method
  private canSwitch(from: PoolResourceStatus, to: PoolResourceStatus): boolean {
    return true;
  }
}

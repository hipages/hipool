import { suite, test, slow, timeout, skip } from 'mocha-typescript';
import * as must from 'must';
import { Factory as GPFactory, createPool } from 'generic-pool';
import { Pool, Factory } from '../src/Pool';
import { PoolResourceStatus, PoolResourceStatusNames } from '../src/PoolResource';

class MockConn {
  constructor(public id: number) {}
}

function sleep(ms): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function doYield(): Promise<void> {
  return new Promise<void>((resolve) => process.nextTick(resolve));
}

class MockConnFactory extends Factory<MockConn> {
  id = 0;
  async create(): Promise<MockConn> {
    return new MockConn(this.id++);
  }
  // tslint:disable-next-line:prefer-function-over-method
  async destroy(resource: MockConn): Promise<void> {
    return;
  }
  // tslint:disable-next-line:prefer-function-over-method
  async validate(resource: MockConn): Promise<boolean> {
    await doYield();
    return true;
  }
}


class GPMockConnFactory implements GPFactory<MockConn> {
  id = 0;
  async create(): Promise<MockConn> {
    return new MockConn(this.id++);
  }
  // tslint:disable-next-line:prefer-function-over-method
  async destroy(resource: MockConn): Promise<undefined> {
    return undefined;
  }
  // tslint:disable-next-line:prefer-function-over-method
  async validate(resource: MockConn): Promise<boolean> {
    await doYield();
    return true;
  }
}

const warmupAcquires = 5000;
const numAcquires = 50000;

suite('Benchmark', () => {
  suite('hiPool', () => {
    test('Acquires no test on borrow', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200, testOnBorrow: false});
      await pool.start();
      for (let i = 0; i < warmupAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const acum = [0, 0];
      for (let i = 0; i < numAcquires; i++) {
        const startTIme = process.hrtime();
        const res = await pool.acquire();
        const end = process.hrtime(startTIme);
        acum[0] += end[0];
        acum[1] += end[1];
        await pool.release(res);
      }
      const elapsedMs = acum[0] * 1000 + acum[1] / 1e6;
      const msPerCycle = elapsedMs / numAcquires;
      // tslint:disable-next-line:no-console
      console.log('Milliseconds per acquire (no test on borrow)', msPerCycle);
      msPerCycle.must.be.below(1);
      await pool.stop();
    });
    test('Acquires with test on borrow', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200, testOnBorrow: true});
      await pool.start();
      for (let i = 0; i < warmupAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const acum = [0, 0];
      for (let i = 0; i < numAcquires; i++) {
        const startTIme = process.hrtime();
        const res = await pool.acquire();
        const end = process.hrtime(startTIme);
        acum[0] += end[0];
        acum[1] += end[1];
        await pool.release(res);
      }
      const elapsedMs = acum[0] * 1000 + acum[1] / 1e6;
      const msPerCycle = elapsedMs / numAcquires;
      // tslint:disable-next-line:no-console
      console.log('Milliseconds per acquire (with test on borrow)', msPerCycle);
      msPerCycle.must.be.below(1);
      await pool.stop();
    });

    test('Acquire/Release cycles', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200});
      await pool.start();
      for (let i = 0; i < warmupAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const startTIme = process.hrtime();
      for (let i = 0; i < numAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const end = process.hrtime(startTIme);
      const elapsedMs = end[0] * 1000 + end[1] / 1e6;
      const msPerCycle = elapsedMs / numAcquires;
      // tslint:disable-next-line:no-console
      console.log('Milliseconds per acquire/release cycle', msPerCycle);
      msPerCycle.must.be.below(1);
      await pool.stop();
    });
  });


  suite('generic-pool', () => {
    test('Acquires no test on borrow', async () => {
      const factory = new GPMockConnFactory();
      const pool = createPool<MockConn>(factory, {max: 10, min: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200, autostart: false, testOnBorrow: false});
      await pool['start']();
      for (let i = 0; i < warmupAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const acum = [0, 0];
      for (let i = 0; i < numAcquires; i++) {
        const startTIme = process.hrtime();
        const res = await pool.acquire();
        const end = process.hrtime(startTIme);
        acum[0] += end[0];
        acum[1] += end[1];
        await pool.release(res);
      }
      const elapsedMs = acum[0] * 1000 + acum[1] / 1e6;
      const msPerCycle = elapsedMs / numAcquires;
      // tslint:disable-next-line:no-console
      console.log('Milliseconds per acquire (no test on borrow)', msPerCycle);
      msPerCycle.must.be.below(1);
      await pool.drain().then(() => pool.clear());
    });
    test('Acquires with test on borrow', async () => {
      const factory = new GPMockConnFactory();
      const pool = createPool<MockConn>(factory, {max: 10, min: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200, testOnBorrow: true});
      await pool['start']();
      for (let i = 0; i < warmupAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const acum = [0, 0];
      for (let i = 0; i < numAcquires; i++) {
        const startTIme = process.hrtime();
        const res = await pool.acquire();
        const end = process.hrtime(startTIme);
        acum[0] += end[0];
        acum[1] += end[1];
        await pool.release(res);
      }
      const elapsedMs = acum[0] * 1000 + acum[1] / 1e6;
      const msPerCycle = elapsedMs / numAcquires;
      // tslint:disable-next-line:no-console
      console.log('Milliseconds per acquire (with test on borrow)', msPerCycle);
      msPerCycle.must.be.below(1);
      await pool.drain().then(() => pool.clear());
    });

    test('Acquire/Release cycles', async () => {
      const factory = new GPMockConnFactory();
      const pool = createPool<MockConn>(factory, {max: 10, min: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200});
      await pool['start']();
      for (let i = 0; i < warmupAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const startTIme = process.hrtime();
      for (let i = 0; i < numAcquires; i++) {
        const res = await pool.acquire();
        await pool.release(res);
      }
      const end = process.hrtime(startTIme);
      const elapsedMs = end[0] * 1000 + end[1] / 1e6;
      const msPerCycle = elapsedMs / numAcquires;
      // tslint:disable-next-line:no-console
      console.log('Milliseconds per acquire/release cycle', msPerCycle);
      msPerCycle.must.be.below(1);
      await pool.drain().then(() => pool.clear());
    });
  });
});

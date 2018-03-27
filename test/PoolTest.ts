import { suite, test, slow, timeout, skip } from 'mocha-typescript';
import * as must from 'must';
import { Pool, Factory } from '../src/Pool';
import { PoolResourceStatus } from '../src/PoolResource';

class MockConn {
  constructor(public id: number) {}
}

function sleep(ms): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

class MockConnFactory extends Factory<MockConn> {
  id = 0;
  async create(): Promise<MockConn> {
    return new MockConn(this.id++);
  }
  // tslint:disable-next-line:prefer-function-over-method
  async destroy(resource: MockConn): Promise<void> {
    // tslint:disable-next-line:no-console
    console.log(`Destroying resource: ${resource.id}`);
  }
  // tslint:disable-next-line:prefer-function-over-method
  async validate(resource: MockConn): Promise<boolean> {
    return true;
  }
}

suite('Pool', () => {
  suite('Basic', () => {
    test('Can start pool', async () => {
      const pool = new Pool<MockConn>(new MockConnFactory(), {maxSize: 10});
      await pool.start();
    });
    test('On startup resources are requested', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 2});
      await pool.start();
      factory.id. must.equal(2);
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(2);
    });
    test('Request a resource before start will throw an error', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 2});
      try {
        await pool.acquire();
        true.must.be.false();
      } catch (e) {
        e.must.be.an.error('Invalid pool state (NOT_STARTED), can\'t acquire connections');
      }
    });
    test('Requesting a resource when there are resources available returns a resource', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 2});
      await pool.start();
      const resource = await pool.acquire();
      must(resource).not.be.undefined();
    });

    test('Requesting a resource marks it as lent', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 2});
      await pool.start();
      const resource = await pool.acquire();
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(1);
      pool.getNumConnectionsInState(PoolResourceStatus.LENT).must.be.equal(1);
    });
    test('Releasing a resource without unfulfilled acquires makes it available again', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 2});
      await pool.start();
      const resource = await pool.acquire();
      must(resource).not.be.undefined();
      resource.id.must.equal(0);
      await pool.release(resource);
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(2);
    });
  });
  suite('Acquiring', () => {
    test('Requesting a resource with no available ones makes it unfulfilled', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 1, minSize: 1, maxWaitingClients: 10, acquireTimeoutMillis: 500});
      await pool.start();
      const resource = await pool.acquire();
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(0);
      pool.getNumConnectionsInState(PoolResourceStatus.LENT).must.be.equal(1);
      const resource2 = pool.acquire();
      const p = resource2.then(() => { resource2['__finished'] = true; }, () => null);
      await sleep(100);
      must(resource2['__finished']).be.falsy();
    });
    test('An unfulfilled acquire will fail after the acquireTimeout', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 1, minSize: 1, maxWaitingClients: 10, acquireTimeoutMillis: 30});
      await pool.start();
      const resource = await pool.acquire();
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(0);
      pool.getNumConnectionsInState(PoolResourceStatus.LENT).must.be.equal(1);
      const resource2 = pool.acquire();
      await resource2.then(() => { throw new Error('Should have failed'); }, (e) => e.must.be.an.error('Acquire timed out after 30 ms'));
    });
    test('An unfulfilled acquire will be fulfilled when a resource is returned', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 1, minSize: 1, maxWaitingClients: 10, acquireTimeoutMillis: 200});
      await pool.start();
      const resource = await pool.acquire();
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(0);
      pool.getNumConnectionsInState(PoolResourceStatus.LENT).must.be.equal(1);
      const resource2 = pool.acquire();
      resource2.then((a) => { resource2['__data'] = a; });
      await sleep(50);
      must(resource2['__data']).be.falsy();
      pool.release(resource);
      await sleep(0); // Yield
      resource2['__data'].must.not.be.falsy();
    });
    test('Requesting a resource when there are none available and can\'t grow and have reached max waiting clients will throw an error', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 1, minSize: 1, maxWaitingClients: 1, acquireTimeoutMillis: 1000});
      await pool.start();
      const resource1 = await pool.acquire();
      const resource2 = pool.acquire();
      resource2.then((a) => { resource2['__data'] = a; }, () => undefined);
      await sleep(10);
      must(resource2['__data']).be.falsy();
      try {
        await pool.acquire();
        true.must.be.false();
      } catch (e) {
        e.must.be.an.error('Max waiting clients reached');
      }
    });
    test('Acquiring a resource when none are available, but haven\'t reached the max size will create new resources', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 2, minSize: 1, maxWaitingClients: 10, acquireTimeoutMillis: 200});
      await pool.start();
      const resource = await pool.acquire();
      pool.getNumConnectionsInState(PoolResourceStatus.AVAILABLE).must.be.equal(0);
      pool.getNumConnectionsInState(PoolResourceStatus.LENT).must.be.equal(1);
      const resource2 = pool.acquire();
      resource2.then((a) => { resource2['__data'] = a; });
      await sleep(5);
      resource2['__data'].must.not.be.falsy();
      pool.getPoolSize().must.equal(2);
    });
  });
  suite('Performance', () => {
    test('Acquires no test on borrow', async () => {
      const factory = new MockConnFactory();
      const pool = new Pool<MockConn>(factory, {maxSize: 10, minSize: 3, maxWaitingClients: 10, acquireTimeoutMillis: 200});
      await pool.start();
      const numAcquires = 10000;
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
      const numAcquires = 10000;
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
      const startTIme = process.hrtime();
      const numAcquires = 10000;
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
});
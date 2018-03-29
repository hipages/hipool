import { suite, test, slow, timeout, skip } from 'mocha-typescript';
import * as must from 'must';
import { CircularQueue } from '../src/CircularQueue';

suite('CircularQueue', () => {
  test('New pool is empty', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.isEmpty().must.be.true();
    circularQueue.getSize().must.equal(0);
    circularQueue.getSize().must.equal(0);
  });
  test('Can push an element to the queue', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.push('element');
    circularQueue.isEmpty().must.be.false();
    circularQueue.getSize().must.equal(1);
  });
  test('Can unshift an element to the queue', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.unshift('element');
    circularQueue.isEmpty().must.be.false();
    circularQueue.getSize().must.equal(1);
  });
  test('Can pop an element from the queue', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.unshift('element');
    const element = circularQueue.pop();
    element.must.equal('element');
    circularQueue.isEmpty().must.be.true();
    circularQueue.getSize().must.equal(0);
  });
  test('Can shift an element from the queue', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.push('element');
    const element = circularQueue.shift();
    element.must.equal('element');
    circularQueue.isEmpty().must.be.true();
    circularQueue.getSize().must.equal(0);
  });
  test('Can count', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.push('element');
    const count = circularQueue.count((e) => true);
    count.must.equal(1);
  });
  test('Count on a circular queue with size 1 works', () => {
    const circularQueue = new CircularQueue<any>(1);
    circularQueue.push('element');
    const count = circularQueue.count((e) => true);
    count.must.equal(1);
  });
});

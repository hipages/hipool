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
  test('Can\'t push an element to the queue if it\'s full', async () => {
    const circularQueue = new CircularQueue<any>(1);
    circularQueue.push('element');
    try {
      circularQueue.push('element2');
      true.must.be.false();
    } catch (e) {
      e.must.be.an.error('Buffer full');
    }
  });
  test('Can\'t unshift an element to the queue if it\'s full', async () => {
    const circularQueue = new CircularQueue<any>(1);
    circularQueue.push('element');
    try {
      circularQueue.unshift('element2');
      true.must.be.false();
    } catch (e) {
      e.must.be.an.error('Buffer full');
    }
  });
  test('Can unshift an element to the queue', async () => {
    const circularQueue = new CircularQueue<any>(10);
    circularQueue.unshift('element');
    circularQueue.isEmpty().must.be.false();
    circularQueue.getSize().must.equal(1);
  });
  test('Poping an element from an empty queue returns undefined', async () => {
    const circularQueue = new CircularQueue<any>(10);
    const element = circularQueue.pop();
    must(element).be.undefined();
  });
  test('Shifting an element from an empty queue returns undefined', async () => {
    const circularQueue = new CircularQueue<any>(10);
    const element = circularQueue.shift();
    must(element).be.undefined();
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
  test('Finding on an empty queue returns undefined', () => {
    const circularQueue = new CircularQueue<any>(1);
    const resp = circularQueue.find((e) => true);
    must(resp).be.undefined();
  });
});

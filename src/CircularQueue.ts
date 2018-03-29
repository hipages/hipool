export class CircularQueue<T> {
  private buffer: T[] = [];
  private startIdx = 0; // Index of the first element of the queue
  /**
   * Index that follows after the last element of the queue.
   * I use this instead of the index of the last element because if I didn't there wouldn't be a clear way to know the buffer is empty.
   */
  private postEndIdx = 0;
  private capacity;
  private size = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  getSize(): number {
    return this.size;
  }
  isFull(): boolean {
    return this.size === this.capacity;
  }
  isEmpty(): boolean {
    return this.size === 0;
  }
  /**
   * Adds an element to the end of the queue
   * @param element the element to add
   */
  push(element: T) {
    if (this.isFull()) {
      throw new Error('Buffer full');
    }
    this.buffer[this.postEndIdx] = element;
    this.postEndIdx = (this.postEndIdx + 1) % this.capacity;
    this.size++;
  }

  /**
   * Adds an element to the beginning of the queue
   * @param element the element to add
   */
  unshift(element: T) {
    if (this.isFull()) {
      throw new Error('Buffer full');
    }
    this.startIdx = this.startIdx === 0 ? this.capacity - 1 : this.startIdx - 1;
    this.buffer[this.startIdx] = element;
    this.size++;
  }
  /**
   * Takes an element from the end of the queue
   * @returns the element or undefined if the queue is empty
   */
  pop(): T {
    if (this.isEmpty()) {
      return undefined;
    }
    this.postEndIdx = this.postEndIdx === 0 ? this.capacity - 1 : this.postEndIdx - 1;
    this.size--;
    return this.buffer[this.postEndIdx];
  }

  /**
   * Takes an element from the beginning of the queue
   * @returns the element or undefined if the queue is empty
   */
  shift(): T {
    if (this.isEmpty()) {
      return undefined;
    }
    const element = this.buffer[this.startIdx];
    this.startIdx = (this.startIdx + 1) % this.capacity;
    this.size--;
    return element;
  }
  /**
   * Returns the first element of an array that evaluates to true in the given predicate.
   * @param predicate the predicate used to evaluate the elements
   * @returns the element or undefined if none found
   */
  find(predicate: (e: T) => boolean): T {
    if (this.isEmpty()) {
      return undefined;
    }
    if (this.capacity === 1) {
      if (predicate(this.buffer[this.startIdx])) {
        return this.buffer[this.startIdx];
      }
      return undefined;
    }
    const lastIndex = this.capacity - 1;
    for (let i = this.startIdx; i !== this.postEndIdx; i = i === lastIndex ? 0 : i + 1) {
      if (predicate(this.buffer[i])) {
        return this.buffer[i];
      }
    }
    return undefined;
  }
  /**
   * Returns the number of element of an array that evaluates to true in the given predicate.
   * @param predicate the predicate used to evaluate the elements
   * @returns the numebr of elements that matched the predicate
   */
  count(predicate: (e: T) => boolean): number {
    if (this.isEmpty()) {
      return 0;
    }
    if (this.capacity === 1) {
      if (predicate(this.buffer[this.startIdx])) {
        return 1;
      }
      return 0;
    }
    const lastIndex = this.capacity - 1;
    let count = 0;
    for (let i = this.startIdx; i !== this.postEndIdx; i = ((i === lastIndex) ? 0 : i + 1)) {
      if (predicate(this.buffer[i])) {
        count++;
      }
    }
    return count;
  }
  /**
   * Executes a function for each element of the queue
   * @param func the function to execute
   */
  forEach(func: (e: T) => void) {
    if (this.isEmpty()) {
      return;
    }
    if (this.capacity === 1) {
      func(this.buffer[this.startIdx]);
      return;
    }
    const lastIndex = this.capacity - 1;
    for (let i = this.startIdx; i !== this.postEndIdx; i = i === lastIndex ? 0 : i + 1) {
      func(this.buffer[i]);
    }
  }
  /**
   * Removes an element from the queue.
   * Because the elements on the queue need to be continuous we need to fill the gap (unless it is the first or last element of the queue)
   * To avoid expensive reindex operations it'll take an element from the end of the queue to fill it up, thus changing the order of elements
   * @param element The element to remove
   * @returns Whether the element was found and removed
   */
  fastRemove(element: T): boolean {
    if (this.isEmpty()) {
      return false;
    }
    const lastIndex = this.capacity - 1;
    for (let i = this.startIdx; i !== this.postEndIdx; i = i === lastIndex ? 0 : i + 1) {
      if (element === this.buffer[i]) {
        // found it!
        if (i === this.startIdx) {
          // it's the first element of the queue.
          this.shift();
        } else if (i === (this.postEndIdx - 1)) {
          // it's the last element of the queue
          this.pop();
        } else {
          // it's somewhere in between. Take the last element and put it there
          this.buffer[i] = this.pop();
        }
        return true;
      }
    }
  }
}

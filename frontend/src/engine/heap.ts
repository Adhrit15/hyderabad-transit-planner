/**
 * Indexed binary min-heap, a line-by-line port of backend/.../heap/BinaryMinHeap.java.
 * heap[] holds keys in heap order, and pos[key] gives a key's position (or -1), which makes
 * decreaseKey O(log n).
 */
export class BinaryMinHeap {
  private heap: Int32Array;
  private pos: Int32Array;
  private prio: Float64Array;
  private n = 0;

  constructor(capacity: number) {
    this.heap = new Int32Array(capacity);
    this.pos = new Int32Array(capacity).fill(-1);
    this.prio = new Float64Array(capacity);
  }

  get size() { return this.n; }
  isEmpty() { return this.n === 0; }
  contains(key: number) { return this.pos[key] !== -1; }

  insertOrDecrease(key: number, p: number): boolean {
    if (!this.contains(key)) {
      this.heap[this.n] = key; this.pos[key] = this.n; this.prio[key] = p; this.siftUp(this.n++);
      return true;
    }
    if (p < this.prio[key]) { this.prio[key] = p; this.siftUp(this.pos[key]); return true; }
    return false;
  }

  extractMin(): number {
    if (this.n === 0) throw new Error('heap is empty');
    const min = this.heap[0];
    this.swap(0, --this.n);
    this.pos[min] = -1;
    if (this.n > 0) this.siftDown(0);
    return min;
  }

  private siftUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[this.heap[i]] >= this.prio[this.heap[parent]]) break;
      this.swap(i, parent); i = parent;
    }
  }

  private siftDown(i: number) {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let s = i;
      if (l < this.n && this.prio[this.heap[l]] < this.prio[this.heap[s]]) s = l;
      if (r < this.n && this.prio[this.heap[r]] < this.prio[this.heap[s]]) s = r;
      if (s === i) return;
      this.swap(i, s); i = s;
    }
  }

  private swap(i: number, j: number) {
    const a = this.heap[i], b = this.heap[j];
    this.heap[i] = b; this.pos[b] = i;
    this.heap[j] = a; this.pos[a] = j;
  }
}

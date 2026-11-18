package com.hydmetro.heap;

import java.util.Arrays;
import java.util.NoSuchElementException;

/**
 * An INDEXED binary min-heap over integer keys 0..capacity-1 with double priorities.
 *
 * <p>Layout: {@code heap[0..size-1]} stores keys in heap order. Each element is ≤ its children,
 * and the children of position i are 2i+1 and 2i+2. {@code pos[key]} records where a key currently
 * sits (or -1). That index map is what makes {@link #decreaseKey} O(log n). Without it we would
 * need an O(n) scan to find the key. java.util.PriorityQueue has no index map, which is why
 * Dijkstra written with it uses "lazy deletion" (push duplicates and skip stale ones on poll).
 *
 * <pre>
 * operation        time       why
 * insert           O(log n)   append at the end, sift up
 * extractMin       O(log n)   move the last element to the root, sift down
 * decreaseKey      O(log n)   find via pos[], lower priority, sift up
 * contains/peek    O(1)
 * </pre>
 */
public final class BinaryMinHeap {
    private final int[] heap;        // heap position -> key
    private final int[] pos;         // key -> heap position, or -1 when absent
    private final double[] prio;     // key -> priority
    private int size;

    public BinaryMinHeap(int capacity) {
        if (capacity < 0) throw new IllegalArgumentException("capacity < 0");
        heap = new int[capacity];
        pos = new int[capacity];
        prio = new double[capacity];
        Arrays.fill(pos, -1);
    }

    public int size() { return size; }
    public boolean isEmpty() { return size == 0; }
    public boolean contains(int key) { checkKey(key); return pos[key] != -1; }

    public double priorityOf(int key) {
        if (!contains(key)) throw new NoSuchElementException("key " + key + " not in heap");
        return prio[key];
    }

    public void insert(int key, double priority) {
        checkKey(key);
        if (pos[key] != -1) throw new IllegalArgumentException("key " + key + " already in heap");
        heap[size] = key;
        pos[key] = size;
        prio[key] = priority;
        siftUp(size++);
    }

    /** Lowers the priority of a key already in the heap. A higher new value is rejected. */
    public void decreaseKey(int key, double newPriority) {
        if (!contains(key)) throw new NoSuchElementException("key " + key + " not in heap");
        if (newPriority > prio[key]) throw new IllegalArgumentException("new priority is larger");
        prio[key] = newPriority;
        siftUp(pos[key]);
    }

    /** insert if absent, decreaseKey if the new priority is smaller; returns true if anything changed. */
    public boolean insertOrDecrease(int key, double priority) {
        if (!contains(key)) { insert(key, priority); return true; }
        if (priority < prio[key]) { decreaseKey(key, priority); return true; }
        return false;
    }

    public int peekMin() {
        if (size == 0) throw new NoSuchElementException("heap is empty");
        return heap[0];
    }

    public int extractMin() {
        if (size == 0) throw new NoSuchElementException("heap is empty");
        int min = heap[0];
        swap(0, --size);
        pos[min] = -1;
        if (size > 0) siftDown(0);
        return min;
    }

    private void siftUp(int i) {
        while (i > 0) {
            int parent = (i - 1) >>> 1;
            if (prio[heap[i]] >= prio[heap[parent]]) break;
            swap(i, parent);
            i = parent;
        }
    }

    private void siftDown(int i) {
        while (true) {
            int l = 2 * i + 1, r = l + 1, smallest = i;
            if (l < size && prio[heap[l]] < prio[heap[smallest]]) smallest = l;
            if (r < size && prio[heap[r]] < prio[heap[smallest]]) smallest = r;
            if (smallest == i) return;
            swap(i, smallest);
            i = smallest;
        }
    }

    private void swap(int i, int j) {
        int a = heap[i], b = heap[j];
        heap[i] = b; pos[b] = i;
        heap[j] = a; pos[a] = j;
    }

    private void checkKey(int key) {
        if (key < 0 || key >= pos.length) throw new IndexOutOfBoundsException("key " + key + " outside 0.." + (pos.length - 1));
    }
}

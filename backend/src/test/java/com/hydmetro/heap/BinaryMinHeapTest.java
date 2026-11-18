package com.hydmetro.heap;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class BinaryMinHeapTest {

    @Test
    void extractsInAscendingOrder() {
        BinaryMinHeap h = new BinaryMinHeap(5);
        h.insert(0, 5); h.insert(1, 3); h.insert(2, 8); h.insert(3, 1); h.insert(4, 4);
        List<Integer> order = new ArrayList<>();
        while (!h.isEmpty()) order.add(h.extractMin());
        assertEquals(List.of(3, 1, 4, 0, 2), order);
    }

    @Test
    void decreaseKeyMovesElementToFront() {
        BinaryMinHeap h = new BinaryMinHeap(3);
        h.insert(0, 10); h.insert(1, 20); h.insert(2, 30);
        h.decreaseKey(2, 5);
        assertEquals(2, h.peekMin());
        assertEquals(5, h.priorityOf(2));
    }

    @Test
    void containsTracksMembership() {
        BinaryMinHeap h = new BinaryMinHeap(2);
        assertFalse(h.contains(0));
        h.insert(0, 1);
        assertTrue(h.contains(0));
        h.extractMin();
        assertFalse(h.contains(0));
        h.insert(0, 2); // re-insert after extraction is allowed
        assertEquals(1, h.size());
    }

    @Test
    void rejectsInvalidOperations() {
        BinaryMinHeap h = new BinaryMinHeap(2);
        assertThrows(NoSuchElementException.class, h::extractMin);
        assertThrows(NoSuchElementException.class, h::peekMin);
        assertThrows(IndexOutOfBoundsException.class, () -> h.insert(2, 1));
        h.insert(0, 5);
        assertThrows(IllegalArgumentException.class, () -> h.insert(0, 1));
        assertThrows(IllegalArgumentException.class, () -> h.decreaseKey(0, 9));
        assertThrows(NoSuchElementException.class, () -> h.decreaseKey(1, 0));
    }

    @Test
    void insertOrDecreaseOnlyLowers() {
        BinaryMinHeap h = new BinaryMinHeap(1);
        assertTrue(h.insertOrDecrease(0, 5));
        assertFalse(h.insertOrDecrease(0, 7));
        assertTrue(h.insertOrDecrease(0, 2));
        assertEquals(2, h.priorityOf(0));
    }

    /** Randomised differential test: random insert / decrease / extract compared against a reference. */
    @RepeatedTest(50)
    void matchesPriorityQueueOnRandomOperations() {
        Random rnd = new Random();
        long seed = rnd.nextLong();
        rnd = new Random(seed);
        int n = 200;
        BinaryMinHeap h = new BinaryMinHeap(n);
        // Reference: PriorityQueue of {priority, key}. Using a TreeSet gives exact removal.
        Map<Integer, Double> current = new HashMap<>();
        PriorityQueue<double[]> ref = new PriorityQueue<>(Comparator.comparingDouble((double[] a) -> a[0]).thenComparingDouble(a -> a[1]));

        for (int op = 0; op < 2000; op++) {
            int choice = rnd.nextInt(3);
            if (choice == 0) {
                int key = rnd.nextInt(n);
                double p = rnd.nextInt(1000);
                if (!current.containsKey(key)) {
                    h.insert(key, p); current.put(key, p); ref.add(new double[]{p, key});
                }
            } else if (choice == 1 && !current.isEmpty()) {
                int key = new ArrayList<>(current.keySet()).get(rnd.nextInt(current.size()));
                double p = current.get(key) - rnd.nextInt(50);
                h.decreaseKey(key, p);
                ref.removeIf(a -> a[1] == key);
                current.put(key, p); ref.add(new double[]{p, key});
            } else if (!current.isEmpty()) {
                double expectedPriority = ref.peek()[0];
                int got = h.extractMin();
                // keys can tie on priority, so compare priorities, then remove that exact key
                assertEquals(expectedPriority, current.get(got), "seed=" + seed);
                ref.removeIf(a -> a[1] == got);
                current.remove(got);
            }
            assertEquals(current.size(), h.size(), "seed=" + seed);
        }
    }
}

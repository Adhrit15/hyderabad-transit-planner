package com.hydmetro.model;

/**
 * A graph node is a (station, line) PAIR, i.e. "standing on the Red Line platform at Ameerpet".
 * Ameerpet therefore becomes two nodes: (ameerpet, RED) and (ameerpet, BLUE). They are joined by a
 * TRANSFER edge that costs the walk+wait time. Because changing lines is now an explicit edge,
 * algorithms can count transfers and charge for them. With one node per station, a route could
 * "teleport" between lines for free.
 *
 * @param index dense id 0..n-1, used to index arrays in the algorithms (fast, cache friendly)
 */
public record Node(int index, Station station, String lineId) {
    @Override public String toString() { return station.getName() + " [" + lineId + "]"; }
}

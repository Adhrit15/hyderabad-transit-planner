package com.hydmetro.model;

/**
 * A directed edge between two nodes. A RIDE edge moves along one line, and a TRANSFER edge changes
 * line inside one station. Each edge carries both criteria (minutes and km), so different
 * strategies can pick the weight they care about.
 */
public record Edge(int from, int to, double minutes, double km, Type type) {
    public enum Type { RIDE, TRANSFER }

    public boolean isTransfer() { return type == Type.TRANSFER; }
}

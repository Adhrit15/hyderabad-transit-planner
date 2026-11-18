package com.hydmetro.fare;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Slab-based fare. "Up to 2 km → ₹11, up to 4 km → ₹17, …, above 24 km → ₹69".
 * The fare is a NON-DECREASING step function of distance. CheapestStrategy relies on this property.
 */
public final class FareCalculator {
    /** maxKm is inclusive; the last slab has maxKm = +∞. */
    public record Slab(double maxKm, int fare) { }

    private static final double EPS = 1e-9;
    private final List<Slab> slabs;

    public FareCalculator(List<Slab> slabs) {
        if (slabs.isEmpty()) throw new IllegalArgumentException("no fare slabs");
        List<Slab> sorted = new ArrayList<>(slabs);
        sorted.sort(Comparator.comparingDouble(Slab::maxKm));
        for (int i = 1; i < sorted.size(); i++) {
            if (sorted.get(i).fare() < sorted.get(i - 1).fare())
                throw new IllegalArgumentException("fares must not decrease with distance");
        }
        if (!Double.isInfinite(sorted.get(sorted.size() - 1).maxKm()))
            throw new IllegalArgumentException("last slab must be open-ended");
        this.slabs = List.copyOf(sorted);
    }

    /** Fare for a trip of {@code km}. A zero-length trip (same station) costs nothing. */
    public int fareFor(double km) {
        if (km <= EPS) return 0;
        return slabFor(km).fare();
    }

    /** The largest distance that still costs the same as {@code km}, i.e. the upper edge of its slab. */
    public double slabUpperBoundKm(double km) {
        return slabFor(km).maxKm();
    }

    public List<Slab> slabs() { return slabs; }

    private Slab slabFor(double km) {
        for (Slab s : slabs) if (km <= s.maxKm() + EPS) return s;
        return slabs.get(slabs.size() - 1);
    }
}

package com.hydmetro.algo;

/** @param trace when true the strategy records a {@link TraceEvent} list for the visualiser */
public record SearchOptions(boolean trace) {
    public static final SearchOptions DEFAULT = new SearchOptions(false);
    public static final SearchOptions WITH_TRACE = new SearchOptions(true);
}

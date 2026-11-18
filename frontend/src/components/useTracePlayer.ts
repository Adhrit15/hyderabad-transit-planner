import { useEffect, useMemo, useState } from 'react';
import type { TraceEventDto } from '../engine/types';

export interface TraceState {
  settledStations: Set<string>;
  frontierStations: Set<string>;
  current: string | null;
  treeEdges: [string, string][];   // [fromStation, toStation] of every settled node, i.e. the search tree
  expanded: number;
  frontier: number;
}

/**
 * Replays a search trace. `index` = how many events have been applied. The state at an index is
 * recomputed from scratch: O(index), which is fine for a few hundred events and keeps scrubbing
 * backwards trivial.
 */
export function useTracePlayer(events: TraceEventDto[]) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(12); // events per second

  useEffect(() => { setIndex(0); setPlaying(events.length > 0); }, [events]);

  useEffect(() => {
    if (!playing) return;
    if (index >= events.length) { setPlaying(false); return; }
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, events.length)), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, index, speed, events.length]);

  const state = useMemo<TraceState>(() => {
    const settledNodes = new Set<string>(), relaxedNodes = new Set<string>();
    const settledStations = new Set<string>();
    const treeEdges: [string, string][] = [];
    let expanded = 0, frontier = 0;
    for (let i = 0; i < index; i++) {
      const e = events[i];
      const key = `${e.station}|${e.line}`;
      if (e.type === 'settle') {
        settledNodes.add(key); settledStations.add(e.station); expanded++;
        if (e.fromStation && e.fromStation !== e.station) treeEdges.push([e.fromStation, e.station]);
      } else relaxedNodes.add(key);
      frontier = e.frontier;
    }
    const frontierStations = new Set<string>();
    for (const k of relaxedNodes) if (!settledNodes.has(k)) frontierStations.add(k.split('|')[0]);
    for (const s of settledStations) frontierStations.delete(s);
    return { settledStations, frontierStations, current: index > 0 ? events[index - 1].station : null, treeEdges, expanded, frontier };
  }, [events, index]);

  /** Advance to just after the next SETTLE event (one "step" of the algorithm). */
  const step = () => {
    setPlaying(false);
    let i = index;
    while (i < events.length && events[i].type !== 'settle') i++;
    setIndex(Math.min(i + 1, events.length));
  };

  return {
    index, setIndex, playing, setPlaying, speed, setSpeed, step, state,
    done: index >= events.length,
    totalExpanded: events.filter((e) => e.type === 'settle').length,
    reset: () => { setPlaying(false); setIndex(0); },
  };
}

import { describe, expect, it } from 'vitest';
import { localEngine } from './service';

// The same definition-of-done checks as backend MetroDataTest, run against the TypeScript port.
describe('TypeScript engine', () => {
  const modes = ['fastest', 'astar', 'fewest-transfers', 'cheapest', 'pareto'] as const;

  it.each(modes)('Miyapur → LB Nagar is one Red Line ride (%s)', (mode) => {
    const r = localEngine.route('miyapur', 'lb-nagar', mode, false);
    expect(r.found).toBe(true);
    expect(r.transfers).toBe(0);
    expect(r.legs).toHaveLength(1);
    expect(r.fare).toBe(69);
    expect(r.km).toBeCloseTo(29.2, 1);
  });

  it.each(modes)('Raidurg → MGBS needs a transfer (%s)', (mode) => {
    const r = localEngine.route('raidurg', 'mg-bus-station', mode, false);
    expect(r.found).toBe(true);
    expect(r.transfers).toBeGreaterThanOrEqual(1);
  });

  it('matches the Java engine on Raidurg → MGBS (38.1 min, ₹61, change at Ameerpet)', () => {
    const r = localEngine.route('raidurg', 'mg-bus-station', 'fastest', true);
    expect(r.totalMinutes).toBe(38.1);
    expect(r.fare).toBe(61);
    expect(r.nodesExpanded).toBe(37);
    expect(r.instructions.some((i) => i.startsWith('Change at Ameerpet'))).toBe(true);
    expect(r.trace!.length).toBeGreaterThan(0);
  });

  it('A* never expands more than Dijkstra and finds the same time', () => {
    const ids = localEngine.stations().stations.map((s) => s.id);
    for (const a of ids) for (const b of ids) {
      const d = localEngine.route(a, b, 'fastest', false), s = localEngine.route(a, b, 'astar', false);
      expect(s.totalMinutes).toBeCloseTo(d.totalMinutes, 6);
      expect(s.nodesExpanded).toBeLessThanOrEqual(d.nodesExpanded);
    }
  });

  it('unknown station throws', () => {
    expect(() => localEngine.route('miyapur', 'atlantis', 'fastest', false)).toThrow(/Unknown station/);
  });
});

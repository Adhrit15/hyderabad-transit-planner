// Point A → point B. Builds candidate journeys from:
//   • transit with WALK first/last mile (RAPTOR)
//   • transit with AUTO first/last mile to metro/MMTS stations (RAPTOR again, with auto access/egress)
//   • door-to-door walk, auto and cab
// and keeps the useful ones: fastest, cheapest, fewest changes, least walking, plus other non-dominated options.
import { haversineKm } from '../engine/graph';
import { MODE_BIT, stopsNear, walkSec, type Mode, type Network } from './network';
import { raptor, type Access, type RaptorJourney } from './raptor';
import { arrAt, depAt } from './timing';
import { autoFare, cabFare, roadEstimate, slabFare } from './fares';

export interface Point { lat: number; lon: number; name: string }
export type LegKind = 'walk' | 'auto' | 'cab' | 'bus' | 'metro' | 'mmts';
export interface Leg {
  kind: LegKind; from: Point; to: Point; depSec: number; arrSec: number; km: number;
  route?: string; routeLong?: string; headsign?: string; color?: string; stops?: Point[];
  fare?: { min: number; max: number }; estimated?: boolean; stale?: boolean; note?: string;
}
export interface Journey {
  id: string; tags: string[]; departSec: number; arriveSec: number; legs: Leg[];
  cost: { min: number; max: number }; transfers: number; walkSec: number; estimatedTimes: boolean; stale: boolean; hints: string[];
}

const ACCESS_WALK = 0, ACCESS_AUTO = 1;
const MAX_WALK_KM = 1.2, MAX_AUTO_KM = 7, AUTO_WAIT_SEC = 180;
const MODE_COLORS: Record<string, string> = { bus: '#b45309', mmts: '#7c3aed', walk: '#64748b', auto: '#ca8a04', cab: '#0f172a' };

export function istNow(): { sec: number; dayBit: number } {
  const ms = Date.now() + 5.5 * 3600 * 1000;           // India has no DST: IST = UTC + 5:30
  const d = new Date(ms);
  const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  const dayBit = 1 << ((d.getUTCDay() + 6) % 7);       // Monday = bit 0
  return { sec, dayBit };
}

export function planJourneys(net: Network, from: Point, to: Point, departSec: number, dayBit: number): { journeys: Journey[]; stats: { scannedPatterns: number; ms: number } } {
  const t0 = performance.now();
  const stopPt = (s: number): Point => ({ lat: net.lat[s], lon: net.lon[s], name: net.stopName[s] });
  const direct = haversineKm({ lat: from.lat, lng: from.lon }, { lat: to.lat, lng: to.lon });

  // ---- access / egress candidates --------------------------------------------------------
  const walkAccess = (p: Point) => {
    let near = stopsNear(net, p.lat, p.lon, MAX_WALK_KM);
    if (near.length < 3) near = stopsNear(net, p.lat, p.lon, 3).slice(0, 5);
    return near.map((x) => ({ stop: x.stop, sec: walkSec(net, x.km), tag: ACCESS_WALK, km: x.km }));
  };
  const autoAccess = (p: Point) => stopsNear(net, p.lat, p.lon, MAX_AUTO_KM)
    .filter((x) => net.mode[x.stop] & (MODE_BIT.metro | MODE_BIT.mmts) && x.km > 0.8)
    .slice(0, 12)
    .map((x) => ({ stop: x.stop, sec: AUTO_WAIT_SEC + roadEstimate(x.km, departSec, net.traffic).sec, tag: ACCESS_AUTO, km: x.km }));

  const wSrc = walkAccess(from), wDst = walkAccess(to), aSrc = autoAccess(from), aDst = autoAccess(to);
  const found: { j: RaptorJourney; src: typeof wSrc }[] = [];
  let scanned = 0;
  for (const [src, dst] of [[wSrc, wDst], [[...wSrc, ...aSrc], [...wDst, ...aDst]]] as const) {
    const r = raptor(net, { departSec, dayBit, sources: src as Access[], targets: dst as Access[] });
    scanned += r.scannedPatterns;
    for (const j of r.journeys) found.push({ j, src: [...src] });
  }

  const journeys: Journey[] = [];
  for (const { j } of found) journeys.push(toJourney(j));

  // ---- door-to-door options -------------------------------------------------------------
  if (direct <= 3) {
    const sec = walkSec(net, direct);
    journeys.push(simple('walk', sec, direct * net.traffic.walkCircuity, { min: 0, max: 0 }));
  }
  const road = roadEstimate(direct, departSec, net.traffic);
  const af = autoFare(road.km, departSec, net.fares.auto);
  journeys.push(simple('auto', AUTO_WAIT_SEC + road.sec, road.km, { min: af.meter, max: af.max }, `Meter ₹${af.meter}. Drivers often quote up to ₹${af.max}.`));
  const cf = cabFare(road.km, road.sec, departSec, net.fares.cab);
  journeys.push(simple('cab', 300 + road.sec, road.km, cf, 'Estimated range for an economy app cab. The real price is in the app.'));

  const kept = pareto(dedupe(journeys));
  // A cab is never faster or cheaper than an auto in this model, but people choose it for comfort, AC
  // and luggage, so the door-to-door cab estimate is always shown.
  const cab = journeys.find((j) => j.id === 'cab-direct');
  if (cab && !kept.includes(cab)) kept.push(cab);
  tag(kept);
  return { journeys: kept.sort((a, b) => a.arriveSec - b.arriveSec), stats: { scannedPatterns: scanned, ms: Math.round(performance.now() - t0) } };

  // ---------------------------------------------------------------------------------------
  function simple(kind: 'walk' | 'auto' | 'cab', sec: number, km: number, fare: { min: number; max: number }, note?: string): Journey {
    const leg: Leg = { kind, from, to, depSec: departSec, arrSec: departSec + sec, km, fare, note, color: MODE_COLORS[kind], estimated: kind !== 'walk' };
    return finish([leg], `${kind}-direct`);
  }

  function toJourney(j: RaptorJourney): Journey {
    const legs: Leg[] = [];
    const first = j.steps[0];
    if (first.kind !== 'access') throw new Error('journey must start with access');
    const accessStop = first.stop;
    const accessKm = haversineKm({ lat: from.lat, lng: from.lon }, { lat: net.lat[accessStop], lng: net.lon[accessStop] });
    const rides = j.steps.filter((s) => s.kind === 'ride');
    const firstRide = rides[0];
    if (firstRide?.kind !== 'ride') throw new Error('journey without a ride');
    const boardDep = depAt(net, firstRide.pattern, firstRide.trip, firstRide.boardPos);
    legs.push(accessLeg(first.tag, from, stopPt(accessStop), accessKm, boardDep, true));

    for (const st of j.steps.slice(1)) {
      if (st.kind === 'walk') {
        const prevArr = legs[legs.length - 1].arrSec;
        const km = haversineKm({ lat: net.lat[st.from], lng: net.lon[st.from] }, { lat: net.lat[st.to], lng: net.lon[st.to] });
        legs.push({ kind: 'walk', from: stopPt(st.from), to: stopPt(st.to), depSec: prevArr, arrSec: prevArr + st.sec, km: km * net.traffic.walkCircuity, color: MODE_COLORS.walk });
      } else if (st.kind === 'ride') {
        const p = net.patterns[st.pattern], route = net.routes[p.route];
        const stops: Point[] = [];
        for (let i = st.boardPos; i <= st.alightPos; i++) stops.push(stopPt(p.stops[i]));
        legs.push({
          kind: route.m, from: stops[0], to: stops[stops.length - 1],
          depSec: depAt(net, st.pattern, st.trip, st.boardPos), arrSec: arrAt(net, st.pattern, st.trip, st.alightPos),
          km: (p.kmC[st.alightPos] - p.kmC[st.boardPos]) / 100, route: route.n, routeLong: route.l, headsign: p.headsign,
          color: route.c ?? MODE_COLORS[route.m], stops, estimated: !!(p.flags[st.trip] & 2), stale: !!(p.flags[st.trip] & 1),
        });
      }
    }
    const lastStop = j.target.stop;
    const lastArr = legs[legs.length - 1].arrSec;
    const egressKm = haversineKm({ lat: net.lat[lastStop], lng: net.lon[lastStop] }, { lat: to.lat, lng: to.lon });
    legs.push(accessLeg(j.target.tag, stopPt(lastStop), to, egressKm, lastArr, false));
    priceTransit(legs);
    // A footpath followed by the egress walk is one walk from the rider's point of view.
    const merged: Leg[] = [];
    for (const l of legs) {
      const prev = merged[merged.length - 1];
      if (prev && prev.kind === 'walk' && l.kind === 'walk') { prev.to = l.to; prev.arrSec = l.arrSec; prev.km += l.km; }
      else merged.push({ ...l });
    }
    return finish(merged.filter((l) => !(l.kind === 'walk' && l.arrSec - l.depSec < 30)), `t${j.rides}-${legs.map((l) => l.route ?? l.kind).join('-')}`);
  }

  function accessLeg(tag: number, a: Point, b: Point, straightKm: number, anchorSec: number, isAccess: boolean): Leg {
    if (tag === ACCESS_AUTO) {
      const road = roadEstimate(straightKm, departSec, net.traffic);
      const f = autoFare(road.km, departSec, net.fares.auto);
      const sec = AUTO_WAIT_SEC + road.sec;
      return { kind: 'auto', from: a, to: b, depSec: isAccess ? anchorSec - sec : anchorSec, arrSec: isAccess ? anchorSec : anchorSec + sec,
        km: road.km, fare: { min: f.meter, max: f.max }, estimated: true, color: MODE_COLORS.auto };
    }
    const sec = walkSec(net, straightKm);
    return { kind: 'walk', from: a, to: b, depSec: isAccess ? anchorSec - sec : anchorSec, arrSec: isAccess ? anchorSec : anchorSec + sec,
      km: straightKm * net.traffic.walkCircuity, color: MODE_COLORS.walk };
  }

  /** Bus and MMTS: one ticket per ride. Metro: one ticket for consecutive metro rides (interchanges inside the system). */
  function priceTransit(legs: Leg[]) {
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (l.kind === 'bus') l.fare = both(slabFare(net.fares.bus.slabs, l.km));
      if (l.kind === 'mmts') l.fare = both(slabFare(net.fares.mmts.slabs, l.km));
      if (l.kind === 'metro') {
        let km = l.km, j = i + 1;
        while (j < legs.length && legs[j].kind === 'metro') { km += legs[j].km; legs[j].fare = both(0); j++; }
        l.fare = both(slabFare(net.fares.metro.slabs, km));
        i = j - 1;
      }
    }
  }

  function finish(legs: Leg[], id: string): Journey {
    const cost = legs.reduce((c, l) => ({ min: c.min + (l.fare?.min ?? 0), max: c.max + (l.fare?.max ?? 0) }), { min: 0, max: 0 });
    const vehicles = legs.filter((l) => l.kind !== 'walk');
    const hints: string[] = [];
    const firstWalk = legs[0].kind === 'walk' && vehicles.length ? legs[0] : null;
    if (firstWalk && firstWalk.km > 0.8) {
      const pt = nearestAutoPoint(from);
      if (pt) hints.push(`Autos are usually available near ${pt.name} (${Math.round(pt.km * 1000)} m). A shared auto (about ₹${slabFare(net.fares.shareAuto.slabs, firstWalk.km)}) could replace the ${Math.round(firstWalk.km * 1000)} m walk, if one is running.`);
    }
    if (legs.some((l) => l.stale)) hints.push('MMTS times are from the last published timetable (2019–20) and may have changed. Check before you travel.');
    return {
      id, tags: [], departSec: legs[0].depSec, arriveSec: legs[legs.length - 1].arrSec, legs, cost,
      transfers: Math.max(0, vehicles.filter((l) => ['bus', 'metro', 'mmts'].includes(l.kind)).length - 1),
      walkSec: legs.filter((l) => l.kind === 'walk').reduce((a, l) => a + (l.arrSec - l.depSec), 0),
      estimatedTimes: legs.some((l) => l.estimated), stale: legs.some((l) => l.stale), hints,
    };
  }

  function nearestAutoPoint(p: Point) {
    let best: { name: string; km: number } | null = null;
    for (const [lat, lon, name] of net.autoPoints) {
      const km = haversineKm({ lat: p.lat, lng: p.lon }, { lat, lng: lon });
      if (km <= 1 && (!best || km < best.km)) best = { name, km };
    }
    return best;
  }
}

const both = (x: number) => ({ min: x, max: x });

function dedupe(js: Journey[]) {
  const seen = new Map<string, Journey>();
  for (const j of js) {
    const k = `${j.legs.map((l) => `${l.kind}:${l.route ?? ''}:${l.from.name}>${l.to.name}`).join('|')}`;
    const prev = seen.get(k);
    if (!prev || j.arriveSec < prev.arriveSec) seen.set(k, j);
  }
  return [...seen.values()];
}

/** Keep journeys not dominated on (arrival, max cost, transfers, walking). */
export function pareto(js: Journey[]) {
  const dominates = (a: Journey, b: Journey) =>
    a.arriveSec <= b.arriveSec && a.cost.max <= b.cost.max && a.transfers <= b.transfers && a.walkSec <= b.walkSec
    && (a.arriveSec < b.arriveSec || a.cost.max < b.cost.max || a.transfers < b.transfers || a.walkSec < b.walkSec);
  return js.filter((b) => !js.some((a) => a !== b && dominates(a, b)));
}

function tag(js: Journey[]) {
  const pick = (score: (j: Journey) => number, label: string) => {
    const transit = js.filter((j) => j.legs.some((l) => ['bus', 'metro', 'mmts'].includes(l.kind)));
    const pool = label === 'Fewest changes' || label === 'Least walking' ? transit : js;
    if (!pool.length) return;
    const best = pool.reduce((a, b) => (score(b) < score(a) ? b : a));
    best.tags.push(label);
  };
  pick((j) => j.arriveSec * 1e3 + j.cost.max, 'Fastest');
  pick((j) => j.cost.max * 1e6 + j.arriveSec, 'Cheapest');
  pick((j) => j.transfers * 1e6 + j.arriveSec, 'Fewest changes');
  pick((j) => j.walkSec * 1e6 + j.arriveSec, 'Least walking');
}

export const modeLabel: Record<LegKind | Mode, string> = { walk: 'Walk', auto: 'Auto', cab: 'Cab', bus: 'Bus', metro: 'Metro', mmts: 'MMTS' };

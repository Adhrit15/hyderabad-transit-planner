// Serialises the network compactly for the browser. Arrays of small integers are delta-encoded
// (each number minus the previous one) because consecutive values are close, which shortens the
// JSON text and gzips well. The frontend reverses this in planner/network.ts.

export const deltaEncode = (a) => a.map((v, i) => (i === 0 ? v : v - a[i - 1]));
export const deltaDecode = (a) => { const out = new Array(a.length); let acc = 0; for (let i = 0; i < a.length; i++) { acc += a[i]; out[i] = acc; } return out; };

export function encodeNetwork(net, extras) {
  return {
    v: 1,
    ...extras.meta,
    stops: { ...net.stops, lat: deltaEncode(net.stops.lat), lon: deltaEncode(net.stops.lon) },
    routes: net.routes,
    patterns: net.patterns.map((p) => ({ ...p, k: deltaEncode(p.k), t: deltaEncode(p.t) })),
    profiles: net.profiles.map(deltaEncode),
    fares: extras.fares,
    traffic: extras.traffic,
    autoPoints: extras.autoPoints,
    attribution: extras.attribution,
  };
}

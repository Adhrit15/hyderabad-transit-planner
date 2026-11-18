// Generates backend/src/main/resources/data/{stations,edges,fares}.json.
// Run with:  node tools/generate-data.mjs
//
// Station ORDER and NAMES come from published line lists (see DATA_SOURCES.md).
// COORDINATES are hand-estimated from map knowledge, so every station is marked approximate.
// EDGE distance/time are DERIVED from the coordinates (see estimate() below), so they are approximate too.
// FARES come from the HMRL fare chart effective 24 May 2025 and are verified (approximate: false).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'src', 'main', 'resources', 'data');

// [id, name, lat, lng] in line order
const RED = [
  ['miyapur', 'Miyapur', 17.4968, 78.3727],
  ['jntu-college', 'JNTU College', 17.4932, 78.3885],
  ['kphb-colony', 'KPHB Colony', 17.4876, 78.3957],
  ['kukatpally', 'Kukatpally', 17.4849, 78.4115],
  ['balanagar', 'Dr. B.R. Ambedkar Balanagar', 17.4775, 78.4235],
  ['moosapet', 'Moosapet', 17.4717, 78.4290],
  ['bharat-nagar', 'Bharat Nagar', 17.4645, 78.4345],
  ['erragadda', 'Erragadda', 17.4570, 78.4365],
  ['esi-hospital', 'ESI Hospital', 17.4478, 78.4390],
  ['sr-nagar', 'S.R. Nagar', 17.4416, 78.4437],
  ['ameerpet', 'Ameerpet', 17.4375, 78.4482],
  ['punjagutta', 'Punjagutta', 17.4287, 78.4508],
  ['irrum-manzil', 'Irrum Manzil', 17.4210, 78.4547],
  ['khairatabad', 'Khairatabad', 17.4134, 78.4609],
  ['lakdikapul', 'Lakdikapul', 17.4046, 78.4655],
  ['assembly', 'Assembly', 17.3997, 78.4700],
  ['nampally', 'Nampally', 17.3925, 78.4713],
  ['gandhi-bhavan', 'Gandhi Bhavan', 17.3862, 78.4752],
  ['osmania-medical-college', 'Osmania Medical College', 17.3810, 78.4800],
  ['mg-bus-station', 'MG Bus Station', 17.3784, 78.4840],
  ['malakpet', 'Malakpet', 17.3735, 78.4935],
  ['new-market', 'New Market', 17.3705, 78.5005],
  ['musarambagh', 'Musarambagh', 17.3711, 78.5102],
  ['dilsukhnagar', 'Dilsukhnagar', 17.3689, 78.5260],
  ['chaitanyapuri', 'Chaitanyapuri', 17.3682, 78.5363],
  ['victoria-memorial', 'Victoria Memorial', 17.3612, 78.5450],
  ['lb-nagar', 'LB Nagar', 17.3489, 78.5490],
];

const BLUE = [
  ['nagole', 'Nagole', 17.3910, 78.5594],
  ['uppal', 'Uppal', 17.4005, 78.5585],
  ['stadium', 'Stadium', 17.4060, 78.5500],
  ['ngri', 'NGRI', 17.4108, 78.5428],
  ['habsiguda', 'Habsiguda', 17.4176, 78.5375],
  ['tarnaka', 'Tarnaka', 17.4280, 78.5310],
  ['mettuguda', 'Mettuguda', 17.4352, 78.5196],
  ['secunderabad-east', 'Secunderabad East', 17.4362, 78.5080],
  ['parade-ground', 'Parade Ground', 17.4440, 78.4985],
  ['paradise', 'Paradise', 17.4433, 78.4885],
  ['rasoolpura', 'Rasoolpura', 17.4440, 78.4775],
  ['prakash-nagar', 'Prakash Nagar', 17.4441, 78.4655],
  ['begumpet', 'Begumpet', 17.4404, 78.4580],
  ['ameerpet', 'Ameerpet', 17.4375, 78.4482],
  ['madhura-nagar', 'Madhura Nagar', 17.4385, 78.4385],
  ['yusufguda', 'Yusufguda', 17.4350, 78.4265],
  ['jubilee-hills-road-5', 'Road No. 5 Jubilee Hills', 17.4302, 78.4195],
  ['jubilee-hills-check-post', 'Jubilee Hills Check Post', 17.4290, 78.4115],
  ['peddamma-gudi', 'Peddamma Gudi', 17.4312, 78.4020],
  ['madhapur', 'Madhapur', 17.4375, 78.3950],
  ['durgam-cheruvu', 'Durgam Cheruvu', 17.4437, 78.3874],
  ['hitec-city', 'HITEC City', 17.4497, 78.3811],
  ['raidurg', 'Raidurg', 17.4412, 78.3777],
];

const GREEN = [
  ['parade-ground', 'Parade Ground', 17.4440, 78.4985], // "JBS Parade Ground", linked by skywalk
  ['secunderabad-west', 'Secunderabad West', 17.4352, 78.4990],
  ['gandhi-hospital', 'Gandhi Hospital', 17.4245, 78.5025],
  ['musheerabad', 'Musheerabad', 17.4170, 78.5000],
  ['rtc-x-roads', 'RTC X Roads', 17.4065, 78.4975],
  ['chikkadpally', 'Chikkadpally', 17.4005, 78.4950],
  ['narayanguda', 'Narayanguda', 17.3925, 78.4890],
  ['sultan-bazaar', 'Sultan Bazaar', 17.3845, 78.4862],
  ['mg-bus-station', 'MG Bus Station', 17.3784, 78.4840],
];

const LINES = [
  { id: 'RED', name: 'Red Line', color: '#e53935', publishedKm: 29.2, from: 'Miyapur', to: 'LB Nagar', stations: RED },
  { id: 'BLUE', name: 'Blue Line', color: '#1e88e5', publishedKm: 27.0, from: 'Nagole', to: 'Raidurg', stations: BLUE },
  { id: 'GREEN', name: 'Green Line', color: '#43a047', publishedKm: 11.0, from: 'JBS Parade Ground', to: 'MG Bus Station', stations: GREEN },
];

function haversineKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[2] - a[2]), dLng = rad(b[3] - a[3]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[2])) * Math.cos(rad(b[2])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Track length: each segment's straight-line distance is scaled so the whole line matches its PUBLISHED
// length (Red 29.2 km, Blue 27 km, Green ~11 km). The scale factor is always >= 1, so track km >=
// straight-line km. That property is what keeps the A* heuristic admissible.
// Time = km at an average running speed of 40 km/h, plus a 0.3 min dwell. End-to-end that gives
// Red ~52 min and Blue ~47 min, against published figures of ~52 and ~48 min.
const AVG_KMPH = 40, DWELL_MIN = 0.3;
const round = (x, p) => Math.round(x * 10 ** p) / 10 ** p;

const stations = new Map();
const edges = [];
for (const line of LINES) {
  const straight = line.stations.slice(1).reduce((a, s, i) => a + haversineKm(line.stations[i], s), 0);
  const scale = line.publishedKm / straight;
  if (scale < 1) throw new Error(`${line.id}: published length is shorter than the straight-line distance`);
  line.stations.forEach((s, i) => {
    const [id, name, lat, lng] = s;
    if (!stations.has(id)) stations.set(id, { id, name, lat, lng, lines: [], approximate: true });
    stations.get(id).lines.push({ line: line.id, order: i + 1 });
    if (i > 0) {
      const prev = line.stations[i - 1];
      const km = round(haversineKm(prev, s) * scale, 2);
      edges.push({ from: prev[0], to: id, line: line.id, km, minutes: round((km / AVG_KMPH) * 60 + DWELL_MIN, 1), approximate: true });
    }
  });
}

const fares = {
  currency: 'INR',
  effectiveFrom: '2025-05-24',
  approximate: false,
  note: 'HMRL distance-slab fare chart after the 10% discount announced May 2025. Our model charges by distance actually travelled.',
  slabs: [
    { maxKm: 2, fare: 11 }, { maxKm: 4, fare: 17 }, { maxKm: 6, fare: 28 }, { maxKm: 9, fare: 37 },
    { maxKm: 12, fare: 47 }, { maxKm: 15, fare: 51 }, { maxKm: 18, fare: 56 }, { maxKm: 21, fare: 61 },
    { maxKm: 24, fare: 65 }, { maxKm: null, fare: 69 },
  ],
};

const meta = {
  transferMinutes: 5,
  maxTrainSpeedKmph: 80,
  lines: LINES.map(({ stations: s, ...rest }) => ({ ...rest, stationCount: s.length })),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'stations.json'), JSON.stringify({ ...meta, stations: [...stations.values()] }, null, 2) + '\n');
writeFileSync(join(OUT, 'edges.json'), JSON.stringify({ edges }, null, 2) + '\n');
writeFileSync(join(OUT, 'fares.json'), JSON.stringify(fares, null, 2) + '\n');

for (const line of LINES) {
  const e = edges.filter((x) => x.line === line.id);
  console.log(`${line.id}: ${line.stations.length} stations, ${round(e.reduce((a, x) => a + x.km, 0), 1)} km, ${round(e.reduce((a, x) => a + x.minutes, 0), 1)} min`);
}
console.log(`${stations.size} unique stations, ${edges.length} edges`);

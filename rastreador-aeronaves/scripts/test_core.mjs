import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseTrace, segmentFlights, locate, daysBetween } from '../core.js';
import { createEvidenceZip } from '../evidence.js';
import { onRequest as trace } from '../../functions/api/aeronave/trace.js';
const JSZip = createRequire(import.meta.url)('../jszip.min.js');

const base = Date.parse('2025-01-19T00:00:00Z') / 1000;
const one = { timestamp: base, trace: [
  [54994,26.0726,-80.1527,'ground',0,0,0,0,null,'adsb_icao'],
  [55500,26.2,-80.4,4500,200,0,0,0,null,'adsb_icao'],
  [70000,0,-65,39000,440,0,0,0,null,'adsb_icao'],
  [82750,-15.8692,-47.9208,'ground',0,0,0,0,null,'adsb_icao']
] };
const two = { timestamp: base, trace: one.trace.slice(0, 2) };
const flights = segmentFlights([...parseTrace(one,'adsbx','2025-01-19'),...parseTrace(two,'lol','2025-01-19')]);
assert.equal(flights.length, 1);
assert.deepEqual(flights[0].sources.sort(), ['adsbx','lol']);
assert.equal(flights[0].start, base + 54994);
assert.equal(flights[0].end, base + 82750);
const airports = [
  ['KFLL','FLL','Fort Lauderdale','Fort Lauderdale','US',26.0726,-80.1527,'large_airport'],
  ['SBBR','BSB','Brasília','Brasília','BR',-15.8692,-47.9208,'large_airport']
];
assert.equal(locate(flights[0].points[0], airports).observed, true);
assert.equal(locate(flights[0].points.at(-1), airports).nearest.a[0], 'SBBR');
assert.equal(daysBetween('2025-01-19','2025-01-21').length, 3);
assert.equal(daysBetween('2026-06-27','2026-09-24').length, 90);
const midnight = segmentFlights([
  ...parseTrace({ timestamp: Date.parse('2025-01-19T00:00:00Z') / 1000, trace: [
    [86300,26.0726,-80.1527,'ground',0,0,0,0,null,'adsb_icao'],
    [86380,26.3,-80.5,3000,190,0,0,0,null,'adsb_icao']
  ] }, 'lol', '2025-01-19'),
  ...parseTrace({ timestamp: Date.parse('2025-01-20T00:00:00Z') / 1000, trace: [
    [200,25,-81,12000,320,0,0,0,null,'adsb_icao'],
    [10000,20,-70,34000,400,0,0,0,null,'adsb_icao']
  ] }, 'adsbx', '2025-01-20')
]);
assert.equal(midnight.length, 1);
assert.deepEqual(midnight[0].sources.sort(), ['adsbx','lol']);
let called = '';
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
globalThis.fetch = async (url, opts) => {
  called = url;
  assert.equal(opts.headers.Referer, 'https://globe.adsbexchange.com/');
  return new Response(JSON.stringify(one), { headers: { 'content-type': 'application/json' } });
};
const response = await trace({ request: new Request('https://test/api/aeronave/trace?source=adsbx&day=2025-01-19&hex=e48b2f'), waitUntil: () => {} });
assert.equal(response.status, 200);
assert.match(called, /globe\.adsbexchange\.com\/globe_history\/2025\/01\/19\/traces\/2f\/trace_full_e48b2f\.json/);
assert.equal((await response.json()).trace.length, 4);
const invalid = await trace({ request: new Request('https://test/api/aeronave/trace?source=bad&day=2025-01-19&hex=e48b2f'), waitUntil: () => {} });
assert.equal(invalid.status, 400);
const bytes = new TextEncoder().encode(JSON.stringify(one));
const hash = createHash('sha256').update(bytes).digest('hex');
const path = 'brutos/adsbx_2025-01-19_e48b2f.json';
const manifest = { files: [{ path, sha256: hash }] };
const packageBlob = await createEvidenceZip(JSZip, [{ source:'adsbx', day:'2025-01-19', hex:'e48b2f', gzip:false, bytes }], [], 'inicio_utc\n2025-01-19\n', manifest);
const opened = await JSZip.loadAsync(await packageBlob.arrayBuffer());
assert.ok(opened.file('LEIA-ME.txt'));
assert.ok(opened.file('voos.csv'));
const openedManifest = JSON.parse(await opened.file('manifest.json').async('string'));
const extracted = await opened.file(openedManifest.files[0].path).async('nodebuffer');
assert.equal(createHash('sha256').update(extracted).digest('hex'), openedManifest.files[0].sha256);
console.log('PASS: duas fontes, KFLL/SBBR, horários, 90 dias, meia-noite UTC, proxy, Referer e ZIP com SHA-256');

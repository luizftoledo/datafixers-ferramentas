export const VERSION = '1.0.0';
export const PARAMS = { gapMinutes: 40, groundGapMinutes: 12, airportKm: 5, lowFeet: 1500, slowKnots: 120, coverageGapSeconds: 120, approachFeet: 6000, maxHoleHours: 6, holeMinKnots: 150, holeMaxKnots: 600 };

export function haversine(a, b) {
  const rad = Math.PI / 180;
  const dlat = (b[0] - a[0]) * rad, dlon = (b[1] - a[1]) * rad;
  const x = Math.sin(dlat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function parseTrace(data, source, day) {
  const base = Number(data.timestamp);
  if (!Number.isFinite(base) || !Array.isArray(data.trace)) return [];
  return data.trace.filter(p => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]) && Number.isFinite(+p[2])).map(p => ({
    ts: base + +p[0], lat: +p[1], lon: +p[2], alt: p[3], gs: +p[4] || 0, vr: +p[7] || 0,
    flags: +p[6] || 0, details: p[8] || null, reception: p[9] || 'other',
    sources: [source], day
  }));
}

export function mergePoints(points) {
  points.sort((a, b) => a.ts - b.ts || (a.sources[0] === 'adsbx' ? -1 : 1));
  const merged = [];
  for (const point of points) {
    const last = merged.at(-1);
    if (last && Math.abs(last.ts - point.ts) <= 2 && haversine([last.lat, last.lon], [point.lat, point.lon]) < 0.5) {
      last.sources = [...new Set([...last.sources, ...point.sources])];
      if (!last.details && point.details) last.details = point.details;
      if (last.reception === 'other' && point.reception !== 'other') last.reception = point.reception;
      last.flags |= point.flags;
    } else merged.push(point);
  }
  return merged;
}

export function ground(p) { return p.alt === 'ground' || (Number.isFinite(+p.alt) && +p.alt < PARAMS.lowFeet && p.gs < PARAMS.slowKnots); }
export function airborne(p) { return p.alt !== 'ground' && Number.isFinite(+p.alt) && +p.alt >= 500 && p.gs >= 80; }

// Uma lacuna longa só é "o mesmo voo" se a velocidade implícita entre os dois pontos é compatível com
// voo contínuo (buraco de cobertura) e nada indica pouso antes da lacuna ou decolagem depois dela.
export function continues(a, b) {
  const gap = b.ts - a.ts;
  if (gap <= PARAMS.gapMinutes * 60) return true;
  if (gap > PARAMS.maxHoleHours * 3600) return false;
  const low = p => p.alt === 'ground' || Number(p.alt) < PARAMS.approachFeet;
  if (low(a) && a.vr < 0) return false; // descendo baixo: pouso provável
  if (low(b) && b.vr > 0) return false; // subindo baixo: nova decolagem provável
  const knots = haversine([a.lat, a.lon], [b.lat, b.lon]) / 1.852 / (gap / 3600);
  return knots >= PARAMS.holeMinKnots && knots <= PARAMS.holeMaxKnots;
}

export function segmentFlights(points) {
  const sorted = mergePoints([...points]);
  const runs = [];
  let run = [];
  for (const p of sorted) {
    const prev = run.at(-1);
    if (prev) {
      const gap = p.ts - prev.ts;
      const newLeg = Boolean(p.flags & 2) && run.some(airborne) && (ground(prev) || gap > 300);
      const landedPause = gap > PARAMS.groundGapMinutes * 60 && ground(prev) && ground(p);
      if (newLeg || landedPause || !continues(prev, p)) { runs.push(run); run = []; }
    }
    run.push(p);
  }
  if (run.length) runs.push(run);
  // Uma perna pode ter sido dividida em dias UTC ou por uma lacuna longa em altitude.
  const stitched = [];
  for (const part of runs) {
    const last = stitched.at(-1);
    if (last && !ground(last.at(-1)) && !ground(part[0]) && !(part[0].flags & 2) && continues(last.at(-1), part[0])) last.push(...part);
    else stitched.push(part);
  }
  return stitched.filter(run => run.filter(airborne).length >= 2 && run.slice(1).reduce((sum, p, i) => sum + haversine([run[i].lat, run[i].lon], [p.lat, p.lon]), 0) > 20)
    .map((run, index) => {
      const firstAir = run.findIndex(airborne), lastAir = run.findLastIndex(airborne);
      const start = Math.max(0, run.slice(0, firstAir).findLastIndex(ground));
      const endAfter = run.slice(lastAir + 1).findIndex(ground);
      const end = endAfter < 0 ? lastAir : lastAir + 1 + endAfter;
      const path = run.slice(start, end + 1);
      const duration = path.at(-1).ts - path[0].ts;
      let covered = 0, maxGap = 0, distance = 0;
      for (let i = 1; i < path.length; i++) {
        const gap = path[i].ts - path[i - 1].ts;
        covered += Math.min(gap, PARAMS.coverageGapSeconds);
        maxGap = Math.max(maxGap, gap);
        distance += haversine([path[i - 1].lat, path[i - 1].lon], [path[i].lat, path[i].lon]);
      }
      const squawks = [...new Set(path.map(p => p.details?.squawk).filter(Boolean))];
      const callsigns = [...new Set(path.map(p => p.details?.flight || p.details?.callsign).filter(Boolean))];
      return { id: index + 1, points: path, start: path[0].ts, end: path.at(-1).ts, duration, distance, maxAlt: Math.max(...path.map(p => Number(p.alt) || 0)), coverage: duration ? Math.min(100, Math.round(covered / duration * 100)) : 0, maxGap, sources: [...new Set(path.flatMap(p => p.sources))], receptions: [...new Set(path.map(p => p.reception))], squawks, callsigns };
    });
}

export function locate(point, airports) {
  const closest = airports.map(a => ({ a, km: haversine([point.lat, point.lon], [a[5], a[6]]) })).sort((x, y) => x.km - y.km).slice(0, 3);
  const observed = ground(point) && closest[0]?.km <= PARAMS.airportKm;
  return { observed, nearest: closest[0] || null, alternatives: observed ? [] : closest.slice(1), alt: point.alt };
}

export function daysBetween(start, end) {
  const days = [];
  for (let t = Date.parse(start + 'T00:00:00Z'); t <= Date.parse(end + 'T00:00:00Z'); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

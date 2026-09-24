import { VERSION, PARAMS, parseTrace, segmentFlights, locate, daysBetween } from './core.js';
import { createEvidenceZip } from './evidence.js';

const $ = id => document.getElementById(id);
const state = { controller: null, raw: [], flights: [], owner: null, ownerFiles: [], hex: '', reg: '', airports: [], map: null };
const fmt = (ts, zone) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(ts * 1000));
const utc = ts => fmt(ts, 'UTC') + ' UTC';
const brasilia = ts => fmt(ts, 'America/Sao_Paulo') + ' Brasília';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sourceName = s => s === 'lol' ? 'adsb.lol' : 'ADS-B Exchange';
const sourceSlug = s => s === 'lol' ? 'adsb.lol' : 'ADSBx';
const rawTraceUrl = (s, day, hex) => `https://${s === 'lol' ? 'adsb.lol' : 'globe.adsbexchange.com'}/globe_history/${day.replaceAll('-', '/')}/traces/${hex.slice(-2)}/trace_full_${hex}.json`;
const replayUrl = (s, day, hex) => `https://${s === 'lol' ? 'adsb.lol' : 'globe.adsbexchange.com'}/?icao=${hex}&showTrace=${day}`;

function alertError(message) { $('errors').innerHTML += `<div>${esc(message)}</div>`; }
function status(message) { $('status').textContent = message; }
function validDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
async function sha(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join(''); }
const isGzip = bytes => bytes[0] === 0x1f && bytes[1] === 0x8b;
async function decodeBytes(bytes) { return isGzip(bytes) ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes); }
function toBase64(bytes) { let out = ''; for (let i = 0; i < bytes.length; i += 16384) out += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(out); }
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw Error(`${r.status} em ${url}`); return r.json(); }

async function loadCatalogs() {
  const [hexdb, airports] = await Promise.all([fetchJson('./hexdb.json'), fetchJson('./airports.json')]);
  state.airports = airports.airports || [];
  return hexdb;
}

async function readTrace(source, day, signal) {
  const key = `rastreador:v${VERSION}:${source}:${state.hex}:${day}`;
  let cached;
  try { cached = JSON.parse(localStorage.getItem(key)); } catch (_) { /* armazenamento privado ou cheio */ }
  if (cached && cached.status === 404) return null;
  let bytes, collected, httpStatus;
  if (cached?.data) {
    bytes = Uint8Array.from(atob(cached.data), c => c.charCodeAt(0));
    collected = cached.collected;
    httpStatus = 200;
  } else {
    const url = `/api/aeronave/trace?source=${source}&day=${day}&hex=${state.hex}`;
    const response = await fetch(url, { signal });
    httpStatus = response.status;
    if (httpStatus === 404) {
      try { localStorage.setItem(key, JSON.stringify({ status: 404 })); } catch (_) {}
      return null;
    }
    if (!response.ok) throw Error(`${sourceName(source)}: HTTP ${httpStatus}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    collected = new Date().toISOString();
    if (day < new Date().toISOString().slice(0, 10) && bytes.length < 700000) {
      try { localStorage.setItem(key, JSON.stringify({ data: toBase64(bytes), collected })); } catch (_) {}
    }
  }
  let data;
  try { data = JSON.parse(await decodeBytes(bytes)); }
  catch (_) { throw Error(`${sourceName(source)}: resposta não é JSON válido`); }
  const raw = { source, day, url: rawTraceUrl(source, day, state.hex), replay: replayUrl(source, day, state.hex), collected, sha256: await sha(bytes), bytes, gzip: isGzip(bytes), status: httpStatus };
  state.raw.push(raw);
  return parseTrace(data, source, day);
}

async function loadRab(signal) {
  try {
    const [metaResponse, dataResponse] = await Promise.all([
      fetch('/api/aeronave/rab?file=metadata.json', { signal }),
      fetch('/api/aeronave/rab?file=records.jsonl.gz', { signal })
    ]);
    if (!metaResponse.ok || !dataResponse.ok) throw Error(`HTTP ${metaResponse.status}/${dataResponse.status}`);
    const metaBytes = new Uint8Array(await metaResponse.arrayBuffer());
    const gzBytes = new Uint8Array(await dataResponse.arrayBuffer());
    const collected = new Date().toISOString();
    state.ownerFiles = [
      { file: 'metadata.json', bytes: metaBytes, url: 'https://dashboards.datafixers.org/aeronaves/data/metadata.json', collected, sha256: await sha(metaBytes) },
      { file: 'records.jsonl.gz', bytes: gzBytes, url: 'https://dashboards.datafixers.org/aeronaves/data/records.jsonl.gz', collected, sha256: await sha(gzBytes) }
    ];
    const meta = JSON.parse(new TextDecoder().decode(metaBytes));
    const decompressed = await decodeBytes(gzBytes);
    const prefix = state.reg.replace('-', '');
    const line = decompressed.split('\n').find(x => x.includes(`"p":"${prefix}"`));
    state.owner = line ? JSON.parse(line) : null;
    renderOwner(meta);
  } catch (error) {
    if (error.name !== 'AbortError') { $('owner-content').textContent = `RAB indisponível: ${error.message}`; alertError(`RAB/ANAC: ${error.message}`); }
  }
}

function renderOwner(meta) {
  const o = state.owner;
  const date = esc(meta?.source_updated_at || meta?.updated_at || meta?.source_date || meta?.generated_at || 'ver metadata.json');
  const link = 'https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.csv';
  if (!o) { $('owner-content').innerHTML = `<p>Prefixo não localizado no extrato atual do RAB. <a href="${link}">Consultar CSV primário da ANAC</a>.</p>${ownerProvenance(date)}`; return; }
  const proprietarios = (o.pr || '').split(';').filter(Boolean).map(x => { const [name, doc, share] = x.split('|'); return `${esc(name)}${doc ? ` — ${esc(doc)}` : ''}${share ? ` (${esc(share)}%)` : ''}`; }).join('<br>') || 'Não informado';
  $('owner-content').innerHTML = `<div class="facts"><div class="fact">Operador<b>${esc(o.n || 'Não informado')}</b></div><div class="fact">Documento do operador<b>${esc(o.d || 'Não informado')}</b></div><div class="fact">UF do operador<b>${esc(o.ou || 'Não informada')}</b></div><div class="fact">Modelo e fabricante<b>${esc(o.m || '')} ${esc(o.f || '')}</b></div><div class="fact">Tipo ICAO / ano<b>${esc(o.i || '—')} / ${esc(o.y || '—')}</b></div><div class="fact">Data da matrícula<b>${esc(o.r || 'Não informada')}</b></div><div class="fact">Proprietários<b>${proprietarios}</b></div><div class="fact">Gravame / interdição<b>${esc(o.g || 'Não informado')} / ${esc(o.it || 'Não informada')}</b></div></div><p class="note">Situação atual do RAB (fonte de ${date}); não comprova propriedade na data de cada voo. Solicite certidão histórica à ANAC.</p>${ownerProvenance(date)}`;
}

function ownerProvenance(date) {
  const consultation = `https://aeronaves.anac.gov.br/aeronaves/cons_rab_resposta.asp?selectFabricante=&selectHabilitacao=&selectIcao=&selectModelo=&textMarca=${encodeURIComponent(state.reg)}&textNumeroSerie=`;
  return `<div class="provenance"><b>Proveniência do registro</b><div>Fonte primária: <a href="https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.csv">RAB/ANAC — CSV original</a> (atualização: ${date}); <a href="${consultation}">consulta pública da matrícula na ANAC</a>.</div>${state.ownerFiles.map(f => `<div><a href="${f.url}">${esc(f.file)}</a> · coleta ${esc(f.collected)} · SHA-256 <code>${f.sha256}</code></div>`).join('')}</div>`;
}

function airportLabel(x) { return x?.nearest ? `${x.nearest.a[0]}${x.nearest.a[1] ? ` (${x.nearest.a[1]})` : ''} — ${x.nearest.a[2]}` : 'Local não identificado'; }
function endpointHtml(x) {
  const tag = x.observed ? 'OBSERVADO' : 'INFERIDO';
  const note = x.observed ? `${x.nearest.km.toFixed(1)} km da pista; ponto em solo ou baixo e lento` : `Último ponto a ${esc(x.alt)} pés; ${x.nearest ? x.nearest.km.toFixed(1) : '—'} km do aeroporto sugerido. Alternativas: ${x.alternatives.map(y => `${esc(y.a[0])} (${y.km.toFixed(1)} km)`).join(', ') || 'nenhuma próxima'}`;
  return `<span class="badge ${x.observed ? 'observed' : 'inferred'}">${tag}</span> ${esc(airportLabel(x))}<br><span class="small note">${note}</span>`;
}

function flightDays(f) { return daysBetween(new Date(f.start * 1000).toISOString().slice(0, 10), new Date(f.end * 1000).toISOString().slice(0, 10)); }
function relevantRaw(f) { const days = flightDays(f); return state.raw.filter(r => days.includes(r.day)); }
function citation(f) {
  const prefix = state.reg || state.hex.toUpperCase();
  const origin = f.origin.observed ? `partiu de ${airportLabel(f.origin)}` : `foi detectada perto de ${airportLabel(f.origin)} (origem inferida)`;
  const dest = f.destination.observed ? `chegou a ${airportLabel(f.destination)}` : `teve último ponto próximo de ${airportLabel(f.destination)} (destino inferido)`;
  return `Dados de rastreamento ADS-B de ${f.sources.map(sourceName).join(' e ')} indicam que a aeronave ${prefix} ${origin} por volta de ${utc(f.start)} e ${dest} por volta de ${utc(f.end)}. A cobertura estimada da rota é ${f.coverage}%; os dados não identificam ocupantes.`;
}

function renderFlights() {
  const colors = ['#067c91', '#c55333', '#8b5fb7', '#438044', '#bb7d18'];
  $('flights').innerHTML = state.flights.length ? state.flights.map((f, i) => {
    const raw = relevantRaw(f);
    return `<article class="flight"><div class="flight-head"><div><h3>Voo ${i + 1} · ${new Date(f.start * 1000).toISOString().slice(0, 10)}</h3><div class="route" style="color:${colors[i % colors.length]}">${esc(f.origin.nearest?.a[0] || '?')} → ${esc(f.destination.nearest?.a[0] || '?')}</div></div><button class="secondary evidence" data-index="${i}">Baixar evidência</button></div><div class="facts"><div class="fact">Origem<b>${endpointHtml(f.origin)}</b></div><div class="fact">Destino<b>${endpointHtml(f.destination)}</b></div><div class="fact">Primeiro ponto<b>${utc(f.start)}<br>${brasilia(f.start)}</b></div><div class="fact">Último ponto<b>${utc(f.end)}<br>${brasilia(f.end)}</b></div><div class="fact">Duração / distância<b>${(f.duration / 3600).toFixed(1)} h / ${Math.round(f.distance)} km</b></div><div class="fact">Altitude máxima<b>${Math.round(f.maxAlt).toLocaleString('pt-BR')} pés</b></div><div class="fact">Cobertura estimada<b>${f.coverage}% · maior lacuna ${(f.maxGap / 60).toFixed(0)} min</b></div><div class="fact">Recepção<b>${esc(f.receptions.join(', '))}</b></div><div class="fact">Indicativo / squawk<b>${esc(f.callsigns.join(', ') || 'Não informado')} / ${f.squawks.map(s => `<span class="${['7500','7600','7700'].includes(String(s)) ? 'inferred' : ''}">${esc(s)}</span>`).join(', ') || 'Não informado'}</b></div></div><p><b>Como citar:</b> ${esc(citation(f))}</p><div class="provenance"><b>Arquivos brutos e replay</b><div>Fontes detectadas: ${esc(f.sources.map(sourceName).join(' + '))}.</div>${raw.map(r => `<div class="source-row"><a href="${r.url}">${sourceSlug(r.source)} · ${r.day} · JSON bruto</a> | <a href="${r.replay}">replay humano</a><br>Coleta: ${esc(r.collected)} · SHA-256 <code>${r.sha256}</code> · ${r.bytes.length} bytes</div>`).join('')}</div></article>`;
  }).join('') : '<p>Nenhum voo detectado no período nas fontes consultadas. Isso não prova que a aeronave não voou.</p>';
  document.querySelectorAll('.evidence').forEach(b => b.addEventListener('click', () => downloadEvidence([state.flights[+b.dataset.index]], `voo-${+b.dataset.index + 1}`)));
}

function renderSummary() {
  const counts = new Map(), nights = new Map();
  for (const f of state.flights) {
    for (const e of [f.origin, f.destination]) if (e.nearest) counts.set(e.nearest.a[0], (counts.get(e.nearest.a[0]) || 0) + 1);
    if (f.destination.nearest) { const night = new Date(f.end * 1000).toISOString().slice(0, 10); nights.set(night, f.destination.nearest.a[0]); }
  }
  const intl = state.flights.filter(f => f.origin.nearest && f.destination.nearest && f.origin.nearest.a[4] !== f.destination.nearest.a[4]).length;
  $('summary').innerHTML = `<div class="facts"><div class="fact">Voos detectados<b>${state.flights.length}</b></div><div class="fact">Internacionais prováveis<b>${intl}</b></div><div class="fact">Aeroportos mais frequentes<b>${[...counts].sort((a,b) => b[1]-a[1]).slice(0,5).map(x => esc(x[0]) + ` (${x[1]})`).join(', ') || '—'}</b></div><div class="fact">Pernoites prováveis<b>${[...nights].slice(0,8).map(x => `${x[0]}: ${esc(x[1])}`).join('; ') || '—'}</b></div></div><p class="note">Pernoites são aproximações pelo último destino do dia UTC, não uma confirmação de estacionamento.</p>`;
}

function renderMap() {
  if (!window.L) { alertError('Mapa indisponível: biblioteca Leaflet não carregou.'); return; }
  if (state.map) state.map.remove();
  state.map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 18 }).addTo(state.map);
  const bounds = [], colors = ['#067c91', '#c55333', '#8b5fb7', '#438044', '#bb7d18'];
  state.flights.forEach((f, i) => {
    const color = colors[i % colors.length];
    for (let j = 1; j < f.points.length; j++) {
      const a = f.points[j - 1], b = f.points[j];
      L.polyline([[a.lat,a.lon],[b.lat,b.lon]], { color, weight: 3, dashArray: b.ts - a.ts > PARAMS.coverageGapSeconds ? '6 8' : null }).addTo(state.map);
    }
    for (const p of [f.points[0], f.points.at(-1)]) { L.circleMarker([p.lat,p.lon], { radius: 4, color }).addTo(state.map); bounds.push([p.lat,p.lon]); }
  });
  if (bounds.length) state.map.fitBounds(bounds, { padding: [15,15] }); else state.map.setView([-15,-50], 3);
}

function csvCell(x) { return '"' + String(x ?? '').replaceAll('"','""') + '"'; }
function csv(flights) {
  const columns = ['prefixo','hex','inicio_utc','fim_utc','inicio_brasilia','fim_brasilia','origem','origem_status','destino','destino_status','duracao_s','distancia_km','cobertura_pct','maior_lacuna_s','fontes'];
  return '\ufeff' + columns.join(',') + '\n' + flights.map(f => [state.reg,state.hex,utc(f.start),utc(f.end),brasilia(f.start),brasilia(f.end),f.origin.nearest?.a[0],f.origin.observed?'OBSERVADO':'INFERIDO',f.destination.nearest?.a[0],f.destination.observed?'OBSERVADO':'INFERIDO',f.duration,Math.round(f.distance),f.coverage,f.maxGap,f.sources.map(sourceName).join('+')].map(csvCell).join(',')).join('\n') + '\n';
}

async function downloadEvidence(flights, name) {
  if (!window.JSZip) { alertError('Biblioteca ZIP indisponível.'); return; }
  const days = new Set(flights.flatMap(flightDays));
  const raws = state.raw.filter(r => days.has(r.day));
  const manifest = { tool: 'Rastreador de aeronaves', version: VERSION, generated_utc: new Date().toISOString(), query: { registration: state.reg, hex: state.hex, from: $('from').value, to: $('to').value }, algorithm: PARAMS, files: [...raws.map(r => ({ path: `brutos/${r.source}_${r.day}_${state.hex}.json${r.gzip ? '.gz' : ''}`, source: sourceName(r.source), url: r.url, replay: r.replay, collected_utc: r.collected, sha256: r.sha256, bytes: r.bytes.length })), ...state.ownerFiles.map(f => ({ path: `rab/${f.file}`, source: 'RAB/ANAC', url: f.url, collected_utc: f.collected, sha256: f.sha256, bytes: f.bytes.length }))], flights: flights.map(f => ({ start_utc: new Date(f.start * 1000).toISOString(), end_utc: new Date(f.end * 1000).toISOString(), origin_status: f.origin.observed ? 'OBSERVADO' : 'INFERIDO', destination_status: f.destination.observed ? 'OBSERVADO' : 'INFERIDO', citation: citation(f) })) };
  const blob = await createEvidenceZip(window.JSZip, raws.map(r => ({ ...r, hex: state.hex })), state.ownerFiles, csv(flights), manifest);
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `evidencias-${state.hex}-${name}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

async function run(event) {
  event.preventDefault();
  $('errors').replaceChildren(); $('results').hidden = true; $('progress').hidden = false; $('progress').value = 0;
  let query = $('query').value.trim().toUpperCase().replace(/\s+/g, '');
  // Aceita prefixo brasileiro sem hífen (PPNLR → PP-NLR).
  if (/^P[PRSTU][A-Z0-9]{3}$/.test(query)) query = query.slice(0, 2) + '-' + query.slice(2);
  const from = $('from').value, to = $('to').value;
  if (!validDay(from) || !validDay(to) || from > to || daysBetween(from, to).length > 400) { alertError('Escolha um intervalo válido de até 400 dias.'); return; }
  state.controller?.abort(); state.controller = new AbortController();
  state.raw = []; state.flights = []; state.owner = null; state.ownerFiles = [];
  $('cancel').hidden = false; $('search').querySelector('[type=submit]').disabled = true;
  try {
    status('Carregando bases estáticas…');
    const db = await loadCatalogs();
    state.hex = /^[A-F0-9]{6}$/.test(query) ? query.toLowerCase() : db.registrations?.[query]?.toLowerCase();
    state.reg = /^[A-F0-9]{6}$/.test(query) ? Object.entries(db.registrations || {}).find(([,h]) => h.toLowerCase() === state.hex)?.[0] || '' : query;
    if (!state.hex) { alertError(`Prefixo ${query} não encontrado na base de matrículas. Digite o hex ICAO se souber.`); status('Busca não iniciada.'); return; }
    const days = daysBetween(from, to);
    const jobs = days.flatMap(day => ['lol','adsbx'].map(source => ({ day, source })));
    const points = [], errors = new Set(); let cursor = 0, finished = 0;
    $('progress').max = jobs.length;
    const worker = async () => {
      while (cursor < jobs.length && !state.controller.signal.aborted) {
        const { day, source } = jobs[cursor++];
        try { const result = await readTrace(source, day, state.controller.signal); if (result) points.push(...result); }
        catch (e) { if (e.name !== 'AbortError') errors.add(e.message); }
        finished++; $('progress').value = finished; status(`${finished}/${jobs.length} arquivos consultados · ${points.length} pontos`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (state.controller.signal.aborted) { status('Busca cancelada.'); return; }
    errors.forEach(alertError);
    state.flights = segmentFlights(points).map(f => ({ ...f, origin: locate(f.points[0], state.airports), destination: locate(f.points.at(-1), state.airports) }));
    $('title').textContent = `${state.reg || state.hex.toUpperCase()} · ${state.hex} · ${from} a ${to}`;
    $('owner-content').textContent = 'Consultando RAB/ANAC…';
    $('results').hidden = false; renderSummary(); renderFlights(); renderMap();
    status(`${state.flights.length} voo(s) detectado(s); ${state.raw.length} arquivo(s) bruto(s) disponível(is).`);
    if (state.reg) await loadRab(state.controller.signal); else $('owner-content').innerHTML = '<p>Consulte o RAB por matrícula. O hex isolado não determina o titular atual.</p>';
  } catch (error) { if (error.name !== 'AbortError') { alertError(error.message); status('Não foi possível concluir a busca.'); } }
  finally { $('cancel').hidden = true; $('search').querySelector('[type=submit]').disabled = false; $('progress').hidden = true; }
}

const today = new Date().toISOString().slice(0,10);
$('to').value = today;
$('from').value = new Date(Date.now() - 89 * 86400000).toISOString().slice(0,10);
$('search').addEventListener('submit', run);
$('cancel').addEventListener('click', () => state.controller?.abort());
$('download-all').addEventListener('click', () => downloadEvidence(state.flights, 'completo'));

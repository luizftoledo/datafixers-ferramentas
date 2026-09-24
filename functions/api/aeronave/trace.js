import { ENABLE_ADSBX } from './config.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export async function onRequest({ request, waitUntil }) {
  if (request.method !== 'GET') return new Response('Método não permitido', { status: 405 });
  const input = new URL(request.url);
  const source = input.searchParams.get('source');
  const hex = (input.searchParams.get('hex') || '').toLowerCase();
  const day = input.searchParams.get('day') || '';
  const parsedDay = Date.parse(`${day}T00:00:00Z`);
  if (!/^[a-f0-9]{6}$/.test(hex) || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(parsedDay) || new Date(parsedDay).toISOString().slice(0, 10) !== day ||
      !['lol', 'adsbx'].includes(source)) {
    return new Response('Parâmetros inválidos', { status: 400 });
  }
  if (source === 'adsbx' && !ENABLE_ADSBX) return new Response('ADSBx desativado', { status: 503 });
  const [year, month, date] = day.split('-');
  const host = source === 'lol' ? 'adsb.lol' : 'globe.adsbexchange.com';
  const rawUrl = `https://${host}/globe_history/${year}/${month}/${date}/traces/${hex.slice(-2)}/trace_full_${hex}.json`;
  const cache = caches.default;
  const cacheKey = new Request(input.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  let upstream;
  try {
    upstream = await fetch(rawUrl, {
      headers: source === 'adsbx'
        ? { Referer: 'https://globe.adsbexchange.com/', Accept: 'application/json', 'User-Agent': UA }
        : { Accept: 'application/json', 'User-Agent': UA },
      redirect: 'follow'
    });
  } catch (error) {
    return new Response(`Falha ao consultar ${host}: ${error.message}`, { status: 502 });
  }
  const ttl = day === new Date().toISOString().slice(0, 10) ? 600 : 2592000;
  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') || 'application/json',
    'Cache-Control': `public, max-age=${ttl}`,
    'X-Upstream-Status': String(upstream.status),
    'X-Raw-URL': rawUrl,
    'Access-Control-Allow-Origin': '*'
  });
  // O corpo segue como stream: não há parsing nem buffer de traces no Worker.
  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (upstream.ok || upstream.status === 404) waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

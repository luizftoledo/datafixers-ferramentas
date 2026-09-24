const ROOT = 'https://dashboards.datafixers.org/aeronaves/data/';

export async function onRequest({ request, waitUntil }) {
  if (request.method !== 'GET') return new Response('Método não permitido', { status: 405 });
  const file = new URL(request.url).searchParams.get('file');
  if (!['records.jsonl.gz', 'metadata.json'].includes(file)) return new Response('Arquivo inválido', { status: 400 });
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  let upstream;
  try { upstream = await fetch(ROOT + file); }
  catch (error) { return new Response(`Falha no RAB: ${error.message}`, { status: 502 }); }
  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': file.endsWith('.gz') ? 'application/gzip' : 'application/json',
      'Cache-Control': 'public, max-age=600',
      'X-Raw-URL': ROOT + file,
      'X-Upstream-Status': String(upstream.status),
      'Access-Control-Allow-Origin': '*'
    }
  });
  if (upstream.ok) waitUntil(cache.put(request, response.clone()));
  return response;
}

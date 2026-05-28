const EXPIRES_AT = '2026-05-28T21:27:28Z';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Tool-Key',
  'Cache-Control': 'no-store'
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }
  if (Date.now() > Date.parse(EXPIRES_AT)) {
    return new Response('expired', { status: 410, headers: corsHeaders });
  }
  const suppliedKey = request.headers.get('X-Tool-Key') || '';
  if (!env.ACERVO_TOOL_PASSWORD || suppliedKey !== env.ACERVO_TOOL_PASSWORD) {
    return new Response('forbidden', { status: 403, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  const query = (url.searchParams.get('q') || '').trim();
  const page = clampInt(url.searchParams.get('page'), 1, 3000);

  let target;
  let upstreamContentType = 'text/html; charset=utf-8';
  let passthroughBinary = false;
  if (source === 'folha') {
    if (!query || query.length < 3 || query.length > 80) {
      return new Response('invalid query', { status: 400, headers: corsHeaders });
    }
    target = buildFolhaUrl(query, page, url);
  } else if (source === 'estadao') {
    if (!query || query.length < 3 || query.length > 80) {
      return new Response('invalid query', { status: 400, headers: corsHeaders });
    }
    target = buildEstadaoUrl(query, page, url);
  } else if (source === 'estadao_meta') {
    const fileId = (url.searchParams.get('file') || '').trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(fileId)) {
      return new Response('invalid file', { status: 400, headers: corsHeaders });
    }
    target = new URL('https://acervo.estadao.com.br/servicos/montaPagina.php');
    target.searchParams.set('nome_arquivo', fileId);
    upstreamContentType = 'application/json; charset=utf-8';
  } else if (source === 'image_proxy') {
    const raw = url.searchParams.get('url') || '';
    let parsed;
    try { parsed = new URL(raw); } catch (_e) {
      return new Response('invalid image url', { status: 400, headers: corsHeaders });
    }
    const allowedHosts = new Set([
      'acervo.estadao.com.br',
      'acervo.folha.uol.com.br',
      'acervo.folha.com.br'
    ]);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      return new Response('host not allowed', { status: 400, headers: corsHeaders });
    }
    if (!/\.(jpe?g|png|pdf)$/i.test(parsed.pathname)) {
      return new Response('only jpg/png/pdf allowed', { status: 400, headers: corsHeaders });
    }
    target = parsed;
    passthroughBinary = true;
  } else {
    return new Response('invalid source', { status: 400, headers: corsHeaders });
  }

  const fetchOptions = {
    headers: {
      'Accept': passthroughBinary
        ? 'image/jpeg,image/png,application/pdf,*/*;q=0.8'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; datafixers-acervo-temporario/1.0)'
    },
    cf: { cacheTtl: passthroughBinary ? 3600 : 0, cacheEverything: passthroughBinary }
  };

  // Retry para passthrough binario — "Network connection lost" ocorre as vezes na primeira tentativa.
  let upstream;
  let lastErr;
  const maxAttempts = passthroughBinary ? 3 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      upstream = await fetch(target.toString(), fetchOptions);
      if (passthroughBinary) {
        // tenta drenar o body aqui pra capturar "connection lost" no retry
        const buf = await upstream.arrayBuffer();
        const upstreamCT = upstream.headers.get('content-type') || 'application/octet-stream';
        return new Response(buf, {
          status: upstream.status,
          headers: {
            ...corsHeaders,
            'Content-Type': upstreamCT,
            'X-Upstream-Status': String(upstream.status),
            'X-Proxy-Attempts': String(attempt)
          }
        });
      }
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 300 * attempt));
        continue;
      }
      return new Response(`upstream error after ${maxAttempts} attempts: ${err.message}`, {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }

  const upstreamCT = upstream.headers.get('content-type') || '';
  const upstreamCharset = (upstreamCT.match(/charset=([^;]+)/i) || [])[1]?.toLowerCase().trim();
  let body;
  if (upstreamCharset && upstreamCharset !== 'utf-8' && upstreamCharset !== 'utf8') {
    const buf = await upstream.arrayBuffer();
    body = new TextDecoder(upstreamCharset, { fatal: false }).decode(buf);
  } else {
    body = await upstream.text();
  }
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstreamContentType,
      'X-Upstream-Status': String(upstream.status)
    }
  });
}

function buildFolhaUrl(query, page, incomingUrl) {
  const target = new URL('https://acervo.folha.com.br/busca.do');
  target.searchParams.set('keyword_all', query);
  target.searchParams.set('keyword_exact', '');
  target.searchParams.set('keyword_any', '');
  target.searchParams.set('keyword_none', '');
  target.searchParams.set('por', 'Por Período');
  target.searchParams.set('startDate', incomingUrl.searchParams.get('startDate') || '');
  target.searchParams.set('endDate', incomingUrl.searchParams.get('endDate') || '');
  target.searchParams.set('days', '');
  target.searchParams.set('month', '');
  target.searchParams.set('year', '');
  target.searchParams.set('jornais', '1');
  target.searchParams.set('page', String(page));
  target.searchParams.set('sort', 'desc');
  return target;
}

function buildEstadaoUrl(query, page, incomingUrl) {
  const target = new URL('https://acervo.estadao.com.br/procura/busca.php');
  target.searchParams.set('busca', query);
  target.searchParams.set('opt', '');
  target.searchParams.set('page', String(page));
  if (page === 1) target.searchParams.set('resume', 'true');

  for (const key of ['decade', 'year', 'month']) {
    const value = incomingUrl.searchParams.get(key);
    if (value && /^[0-9]{1,4}$/.test(value)) {
      target.searchParams.set(key, value);
    }
  }
  return target;
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value || '', 10);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

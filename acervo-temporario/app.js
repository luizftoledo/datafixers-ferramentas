const form = document.querySelector('#search-form');
const runButton = document.querySelector('#run-button');
const stopButton = document.querySelector('#stop-button');
const statusTitle = document.querySelector('#status-title');
const statusDetail = document.querySelector('#status-detail');
const progress = document.querySelector('#progress');
const countEl = document.querySelector('#count');
const logEl = document.querySelector('#log');

const EXPIRES_AT = new Date('2026-05-28T21:27:28Z');
let stopped = false;

function log(line) {
  const time = new Date().toLocaleTimeString('pt-BR');
  logEl.textContent += `[${time}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(title, detail) {
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toBRDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function parseBRDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00`);
}

function inRange(dateText, startISO, endISO) {
  const date = parseBRDate(dateText);
  if (!date) return true;
  if (startISO && date < new Date(`${startISO}T00:00:00`)) return false;
  if (endISO && date > new Date(`${endISO}T23:59:59`)) return false;
  return true;
}

function normalizeSpace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch (_e) {
    return href || '';
  }
}

async function proxyFetch(params, password) {
  const url = new URL('/api/acervo-proxy', window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url.toString(), {
    headers: { 'X-Tool-Key': password },
    cache: 'no-store'
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text || response.statusText}`);
  }
  return response.text();
}

function parseFolhaTotal(doc) {
  const text = doc.querySelector('.results-tool-bar span')?.textContent || '';
  const match = text.match(/(\d[\d.]*)\s+resultados/i);
  return match ? Number(match[1].replace(/\./g, '')) : 0;
}

function parseFolhaItems(html, sourcePage) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('a.edition[href*="leitor.do"]')].map((a) => {
    const href = absoluteUrl(a.getAttribute('href'), 'https://acervo.folha.com.br/');
    const url = new URL(href);
    const small = normalizeSpace(a.querySelector('small')?.textContent || '');
    const date = (small.match(/\d{2}\/\d{2}\/\d{4}/) || [''])[0];
    const issueRaw = normalizeSpace(small.replace(date, ''));
    const thumbUrl = a.querySelector('img')?.getAttribute('src') || '';
    return {
      source: 'folha',
      source_page: sourcePage,
      date,
      newspaper: a.getAttribute('title') || '',
      issue_raw: issueRaw,
      numero: url.searchParams.get('numero') || '',
      anchor: url.searchParams.get('anchor') || '',
      keyword: url.searchParams.get('keyword') || '',
      href,
      thumb_url: thumbUrl,
      full_jpg_url: thumbUrl.endsWith('_thumb.jpg') ? thumbUrl.replace('_thumb.jpg', '.jpg') : ''
    };
  });
  return { doc, rows };
}

function parseEstadaoTotal(doc) {
  const text = doc.querySelector('h3.lbl-ocorrencia')?.textContent || '';
  const match = text.match(/Exibindo\s+(\d[\d.]*)\s+ocorr/i);
  return match ? Number(match[1].replace(/\./g, '')) : 0;
}

function fileIdFromHref(href) {
  const match = String(href || '').match(/#!\/([^/]+)/);
  return match ? match[1] : '';
}

function parseEstadaoFile(fileId) {
  const parts = fileId.split('-');
  return {
    file_id: fileId,
    issue_code: parts[1] || '',
    edition_code: parts[2] || '',
    section_code: parts[4] || '',
    page_code: parts[5] || ''
  };
}

function parseEstadaoItems(html, sourcePage, startISO, endISO) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('ul.lst-resultado > li')].map((li) => {
    const metaRaw = normalizeSpace(li.querySelector('.hd-result em')?.textContent || '');
    const href = li.querySelector('.hl-result a[href*="/pagina/#!/"]')?.getAttribute('href') || '';
    const highlightUrl = li.querySelector('.hl-result img')?.getAttribute('src') || '';
    const pageImageUrl = li.querySelector('.img img')?.getAttribute('src') || '';
    const fileId = fileIdFromHref(href);
    const date = (metaRaw.match(/\d{2}\/\d{2}\/\d{4}/) || [''])[0];
    const pageLabel = (metaRaw.match(/P[ÁA]GINA\s+[^,]+/i) || [''])[0];
    let coordinates = '';
    try {
      coordinates = new URL(highlightUrl).searchParams.get('coordenadas') || '';
    } catch (_e) {}
    return {
      source: 'estadao',
      source_page: sourcePage,
      date,
      edition: normalizeSpace(li.querySelector('.link_edicao')?.textContent || ''),
      page_label: pageLabel,
      meta_raw: metaRaw,
      ...parseEstadaoFile(fileId),
      href,
      highlight_thumb_url: highlightUrl,
      page_image_url: pageImageUrl,
      coordinates
    };
  }).filter(row => inRange(row.date, startISO, endISO));
  return { doc, rows };
}

function monthChunks(startISO, endISO) {
  if (!startISO || !endISO) return [{ decade: '', year: '', month: '' }];
  const chunks = [];
  const cursor = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  cursor.setDate(1);
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    chunks.push({
      decade: String(Math.floor(year / 10) * 10),
      year: String(year),
      month: String(month)
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return chunks;
}

async function scrapeFolha(options, rows, seen) {
  log('Folha: lendo pagina 1');
  const firstHtml = await proxyFetch({
    source: 'folha',
    q: options.keyword,
    page: 1,
    startDate: toBRDate(options.startDate),
    endDate: toBRDate(options.endDate)
  }, options.password);
  const first = parseFolhaItems(firstHtml, 1);
  const total = parseFolhaTotal(first.doc);
  const totalPages = Math.min(Math.ceil(total / 20) || 1, options.maxPages);
  log(`Folha: ${total} resultados, ${totalPages} paginas planejadas`);
  addRows(first.rows, rows, seen, 'folha');

  for (let page = 2; page <= totalPages; page += 1) {
    if (stopped) break;
    await sleep(options.delay);
    const html = await proxyFetch({
      source: 'folha',
      q: options.keyword,
      page,
      startDate: toBRDate(options.startDate),
      endDate: toBRDate(options.endDate)
    }, options.password);
    addRows(parseFolhaItems(html, page).rows, rows, seen, 'folha');
    updateProgress(page, totalPages, `Folha pagina ${page}/${totalPages}`);
  }
}

async function scrapeEstadao(options, rows, seen) {
  const chunks = monthChunks(options.startDate, options.endDate);
  log(`Estadao: ${chunks.length} bloco(s) de periodo`);
  let chunkIndex = 0;
  for (const chunk of chunks) {
    if (stopped) break;
    chunkIndex += 1;
    const label = chunk.year ? `${chunk.month}/${chunk.year}` : 'periodo completo';
    log(`Estadao: lendo ${label}`);
    const firstHtml = await proxyFetch({
      source: 'estadao',
      q: options.keyword,
      page: 1,
      ...chunk
    }, options.password);
    const first = parseEstadaoItems(firstHtml, 1, options.startDate, options.endDate);
    const total = parseEstadaoTotal(first.doc);
    const totalPages = Math.min(Math.ceil(total / 10) || 1, options.maxPages);
    log(`Estadao ${label}: ${total} ocorrencias, ${totalPages} paginas planejadas`);
    addRows(first.rows, rows, seen, 'estadao');

    for (let page = 2; page <= totalPages; page += 1) {
      if (stopped) break;
      await sleep(options.delay);
      const html = await proxyFetch({
        source: 'estadao',
        q: options.keyword,
        page,
        ...chunk
      }, options.password);
      addRows(parseEstadaoItems(html, page, options.startDate, options.endDate).rows, rows, seen, 'estadao');
      updateProgress(page, totalPages, `Estadao ${label} pagina ${page}/${totalPages} - bloco ${chunkIndex}/${chunks.length}`);
    }
  }
}

function addRows(newRows, rows, seen, source) {
  for (const row of newRows) {
    const key = source === 'folha'
      ? `folha:${row.anchor || row.href}`
      : `estadao:${row.file_id}:${row.coordinates}:${row.highlight_thumb_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ result_index: rows.length + 1, ...row });
  }
  countEl.textContent = `${rows.length} linhas`;
}

function updateProgress(value, max, detail) {
  progress.max = max || 1;
  progress.value = value || 0;
  setStatus('Rodando', detail);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows, keyword) {
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csv = [
    fields.join(','),
    ...rows.map(row => fields.map(field => csvEscape(row[field])).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const safeTerm = keyword.toLowerCase().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'busca';
  link.href = URL.createObjectURL(blob);
  link.download = `acervo-${safeTerm}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (Date.now() > EXPIRES_AT.getTime()) {
    setStatus('Expirado', 'Esta ferramenta temporaria venceu.');
    return;
  }
  stopped = false;
  logEl.textContent = '';
  progress.value = 0;
  const options = {
    password: document.querySelector('#password').value,
    keyword: document.querySelector('#keyword').value.trim(),
    source: document.querySelector('#source').value,
    startDate: document.querySelector('#start-date').value,
    endDate: document.querySelector('#end-date').value,
    delay: Number(document.querySelector('#delay').value || 650),
    maxPages: Number(document.querySelector('#max-pages').value || 3000)
  };
  sessionStorage.setItem('acervo-tool-key', options.password);
  runButton.disabled = true;
  stopButton.disabled = false;
  const rows = [];
  const seen = new Set();

  try {
    setStatus('Rodando', 'A coleta comecou. Mantenha esta aba aberta.');
    if (options.source === 'folha' || options.source === 'both') {
      await scrapeFolha(options, rows, seen);
    }
    if (!stopped && (options.source === 'estadao' || options.source === 'both')) {
      await scrapeEstadao(options, rows, seen);
    }
    if (rows.length) {
      downloadCsv(rows, options.keyword);
      setStatus(stopped ? 'Parado' : 'Concluido', `CSV gerado com ${rows.length} linhas.`);
      log(`CSV gerado com ${rows.length} linhas`);
    } else {
      setStatus('Sem resultados', 'Nenhuma linha foi coletada.');
    }
  } catch (error) {
    console.error(error);
    setStatus('Erro', error.message);
    log(`Erro: ${error.message}`);
  } finally {
    runButton.disabled = false;
    stopButton.disabled = true;
  }
});

stopButton.addEventListener('click', () => {
  stopped = true;
  log('Parada solicitada. A requisicao atual ainda pode terminar.');
});

const savedKey = sessionStorage.getItem('acervo-tool-key');
if (savedKey) document.querySelector('#password').value = savedKey;

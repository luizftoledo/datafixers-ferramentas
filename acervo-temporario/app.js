// Elementos
const form = document.querySelector('#search-form');
const runButton = document.querySelector('#run-button');
const stopButton = document.querySelector('#stop-button');
const statusTitle = document.querySelector('#status-title');
const statusDetail = document.querySelector('#status-detail');
const countEl = document.querySelector('#count');
const logEl = document.querySelector('#log');
const taskListEl = document.querySelector('#task-list');
const overallFill = document.querySelector('#overall-fill');
const overallPercent = document.querySelector('#overall-percent');
const downloadPanel = document.querySelector('#download-panel');
const downloadButton = document.querySelector('#download-button');
const downloadRetry = document.querySelector('#download-retry');
const downloadReset = document.querySelector('#download-reset');
const downloadSourceSel = document.querySelector('#download-source');
const downloadSummary = document.querySelector('#download-summary');
const downloadHint = document.querySelector('#download-hint');
const batchSizeInput = document.querySelector('#batch-size');
const downloadDelayInput = document.querySelector('#download-delay');
const csvRescuePanel = document.querySelector('#csv-rescue');
const rescueFolha = document.querySelector('#rescue-folha');
const rescueEstadao = document.querySelector('#rescue-estadao');
const uploadInput = document.querySelector('#upload-csv');
const uploadButton = document.querySelector('#upload-button');
const uploadStatus = document.querySelector('#upload-status');

const EXPIRES_AT = new Date('2026-06-28T23:59:59Z');
let stopped = false;
let lastRunRows = [];
let lastRunKeyword = '';
const batchCursor = { folha: 0, estadao: 0 };

// === Helpers básicos ===

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

function safeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}

// === Sistema de tasks ===
//
// Cada task: { id, label, weight, total, done, status, detail }
// status: pending | running | done | error | skipped
// A barra geral é uma média ponderada por weight de (done / total).

const tasks = new Map();
const taskOrder = [];

function resetTasks() {
  tasks.clear();
  taskOrder.length = 0;
  taskListEl.innerHTML = '';
  overallFill.style.width = '0%';
  overallPercent.textContent = '0%';
}

function addTask(task) {
  const full = {
    total: 0, done: 0, status: 'pending', detail: '', weight: 10, ...task
  };
  tasks.set(full.id, full);
  taskOrder.push(full.id);
  renderTask(full);
  return full;
}

function renderTask(task) {
  let el = document.querySelector(`[data-task-id="${task.id}"]`);
  if (!el) {
    el = document.createElement('li');
    el.className = 'task-item';
    el.dataset.taskId = task.id;
    el.innerHTML = `
      <span class="task-icon"></span>
      <span class="task-label"></span>
      <span class="task-count"></span>
      <span class="task-detail"></span>
      <span class="task-bar"><span class="task-bar-fill"></span></span>
    `;
    taskListEl.appendChild(el);
  }
  el.dataset.status = task.status;
  const iconEl = el.querySelector('.task-icon');
  iconEl.textContent = ({
    pending: '·',
    running: '↻',
    done: '✓',
    error: '!',
    skipped: '–'
  })[task.status] || '·';
  el.querySelector('.task-label').textContent = task.label;
  el.querySelector('.task-detail').textContent = task.detail;
  const count = task.total ? `${task.done}/${task.total}` : (task.status === 'done' ? 'feito' : '');
  el.querySelector('.task-count').textContent = count;
  const pct = task.total ? Math.min(100, (task.done / task.total) * 100) : (task.status === 'done' ? 100 : 0);
  el.querySelector('.task-bar-fill').style.width = `${pct}%`;
}

function updateTask(id, patch) {
  const task = tasks.get(id);
  if (!task) return;
  Object.assign(task, patch);
  renderTask(task);
  updateOverall();
}

function updateOverall() {
  let weighted = 0;
  let totalWeight = 0;
  for (const id of taskOrder) {
    const t = tasks.get(id);
    if (t.status === 'skipped') continue;
    totalWeight += t.weight;
    const local = t.total ? Math.min(1, t.done / t.total) : (t.status === 'done' ? 1 : 0);
    weighted += local * t.weight;
  }
  const pct = totalWeight ? Math.round((weighted / totalWeight) * 100) : 0;
  overallFill.style.width = `${pct}%`;
  overallPercent.textContent = `${pct}%`;
}

// === HTTP via proxy ===

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

async function proxyFetchBlob(params, password) {
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
  return response.blob();
}

// === Parsers ===

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

// === Scrapers ===

async function scrapeFolha(options, rows, seen) {
  log('Folha: lendo página 1');
  updateTask('folha', { status: 'running', detail: 'Buscando resultados...' });
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
  log(`Folha: ${total} resultados, ${totalPages} páginas planejadas`);
  if (total === 0) {
    updateTask('folha', { status: 'done', total: 1, done: 1, detail: 'Nenhum resultado nesse período' });
    return;
  }
  updateTask('folha', { total: totalPages, done: 1, detail: `${total} resultados — página 1/${totalPages}` });
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
    updateTask('folha', { done: page, detail: `${total} resultados — página ${page}/${totalPages}` });
  }
  if (!stopped) {
    const collected = rows.filter(r => r.source === 'folha').length;
    updateTask('folha', { status: 'done', done: totalPages || 1, total: totalPages || 1, detail: `${collected} ocorrências coletadas` });
  }
}

async function scrapeEstadao(options, rows, seen) {
  const chunks = monthChunks(options.startDate, options.endDate);
  log(`Estadão: ${chunks.length} bloco(s) de período`);
  updateTask('estadao', { status: 'running', total: chunks.length, done: 0, detail: `Etapa 1/2 — varrendo ${chunks.length} mês(es)` });
  let chunkIndex = 0;
  let totalOccurrences = 0;
  let monthsWithData = 0;
  for (const chunk of chunks) {
    if (stopped) break;
    chunkIndex += 1;
    const label = chunk.year ? `${chunk.month}/${chunk.year}` : 'periodo completo';
    log(`Estadão: lendo ${label}`);
    updateTask('estadao', { done: chunkIndex - 1, detail: `Etapa 1/2 — buscando em ${label} (mês ${chunkIndex} de ${chunks.length})` });
    const firstHtml = await proxyFetch({
      source: 'estadao',
      q: options.keyword,
      page: 1,
      ...chunk
    }, options.password);
    const first = parseEstadaoItems(firstHtml, 1, options.startDate, options.endDate);
    const total = parseEstadaoTotal(first.doc);
    if (total > 0) {
      monthsWithData += 1;
      totalOccurrences += total;
    }
    const totalPages = Math.min(Math.ceil(total / 10) || 1, options.maxPages);
    log(`Estadão ${label}: ${total} ocorrências, ${totalPages} páginas planejadas`);
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
      updateTask('estadao', { detail: `Etapa 1/2 — ${label}, página ${page}/${totalPages} (mês ${chunkIndex}/${chunks.length})` });
    }
    updateTask('estadao', { done: chunkIndex });
  }
  if (stopped) return;

  const estadaoRows = rows.filter(r => r.source === 'estadao');
  if (estadaoRows.length === 0) {
    let detail = `Nenhum resultado nesse período (varreu ${chunks.length} mês(es))`;
    // Aviso especifico se o periodo eh muito recente (acervo do Estadao tem ~3 meses de atraso)
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const startDate = options.startDate ? new Date(`${options.startDate}T00:00:00`) : null;
    if (startDate && startDate >= cutoff) {
      detail = `Nenhum resultado. O acervo do Estadão tem alguns meses de atraso na digitalização — tente um período que termine antes de ${cutoff.toLocaleDateString('pt-BR')}.`;
    }
    updateTask('estadao', { status: 'done', detail });
    return;
  }
  if (!options.highRes) {
    updateTask('estadao', { status: 'done', detail: `${estadaoRows.length} ocorrências coletadas (sem imagens em alta resolução)` });
    return;
  }
  await enrichEstadaoHighRes(rows, options, chunks.length, estadaoRows.length);
}

async function enrichEstadaoHighRes(rows, options, chunksCount, estadaoCount) {
  const targets = rows.filter(r => r.source === 'estadao' && r.file_id);
  const uniqueFiles = [...new Set(targets.map(r => r.file_id))];
  if (!uniqueFiles.length) {
    updateTask('estadao', { status: 'done', detail: `${estadaoCount} ocorrências coletadas (sem arquivos com ID — pulei alta resolução)` });
    return;
  }
  log(`Estadão: buscando imagem grande para ${uniqueFiles.length} arquivos únicos`);
  updateTask('estadao', { status: 'running', total: uniqueFiles.length, done: 0, detail: `Etapa 2/2 — descobrindo URLs em alta para ${uniqueFiles.length} páginas` });
  const byFile = new Map();
  let idx = 0;
  for (const fileId of uniqueFiles) {
    if (stopped) break;
    idx += 1;
    try {
      const body = await proxyFetch({ source: 'estadao_meta', file: fileId }, options.password);
      const json = JSON.parse(body.replace(/^﻿/, ''));
      byFile.set(fileId, {
        page_image_url_high_res: json.imagem_reader || '',
        page_image_high_res_width: json.imagem_reader_width || '',
        page_image_high_res_height: json.imagem_reader_height || ''
      });
    } catch (error) {
      log(`Estadão (alta resolução) erro em ${fileId}: ${error.message}`);
      byFile.set(fileId, {
        page_image_url_high_res: '',
        page_image_high_res_width: '',
        page_image_high_res_height: ''
      });
    }
    updateTask('estadao', { done: idx, detail: `Etapa 2/2 — ${idx}/${uniqueFiles.length} URLs em alta resolução descobertas` });
    if (idx < uniqueFiles.length) await sleep(options.delay);
  }
  for (const row of rows) {
    if (row.source !== 'estadao') continue;
    const meta = byFile.get(row.file_id);
    if (meta) Object.assign(row, meta);
  }
  if (!stopped) {
    updateTask('estadao', { status: 'done', detail: `${estadaoCount} ocorrências coletadas em ${uniqueFiles.length} páginas únicas` });
  }
}

function addRows(newRows, rowsArr, seen, source) {
  for (const row of newRows) {
    const key = source === 'folha'
      ? `folha:${row.anchor || row.href}`
      : `estadao:${row.file_id}:${row.coordinates}:${row.highlight_thumb_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rowsArr.push({ result_index: rowsArr.length + 1, ...row });
  }
  countEl.textContent = `${rowsArr.length} linhas`;
}

// === CSVs ===

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rowsArr) {
  const fields = [...new Set(rowsArr.flatMap(row => Object.keys(row)))];
  return [
    fields.join(','),
    ...rowsArr.map(row => fields.map(field => csvEscape(row[field])).join(','))
  ].join('\n');
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

function csvFilenameFor(source, keyword) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTerm = safeName(keyword) || 'busca';
  return `acervo-${source}-${safeTerm}-${dateStr}.csv`;
}

function downloadOneCsv(source, rowsArr, keyword) {
  const rows = rowsArr.filter(r => r.source === source);
  if (!rows.length) return false;
  downloadBlob(new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' }), csvFilenameFor(source, keyword));
  return true;
}

function refreshCsvRescue(counts) {
  const hasFolha = counts && counts.folha > 0;
  const hasEstadao = counts && counts.estadao > 0;
  rescueFolha.hidden = !hasFolha;
  rescueEstadao.hidden = !hasEstadao;
  rescueFolha.textContent = hasFolha ? `Baixar CSV da Folha (${counts.folha} linhas)` : 'Baixar CSV da Folha';
  rescueEstadao.textContent = hasEstadao ? `Baixar CSV do Estadão (${counts.estadao} linhas)` : 'Baixar CSV do Estadão';
  csvRescuePanel.hidden = !(hasFolha || hasEstadao);
}

async function downloadCsvs(rowsArr, keyword) {
  const folhaCount = rowsArr.filter(r => r.source === 'folha').length;
  const estadaoCount = rowsArr.filter(r => r.source === 'estadao').length;
  if (folhaCount) downloadOneCsv('folha', rowsArr, keyword);
  // Espera curta para evitar bloqueio do Chrome a downloads múltiplos automáticos.
  if (folhaCount && estadaoCount) await sleep(900);
  if (estadaoCount) downloadOneCsv('estadao', rowsArr, keyword);
  return { folha: folhaCount, estadao: estadaoCount };
}

// === Download em lotes (ZIP) ===

function imagesAvailable(rowsArr) {
  const folha = rowsArr.filter(r => r.source === 'folha' && r.full_jpg_url);
  const estadao = rowsArr.filter(r => r.source === 'estadao' && r.page_image_url_high_res);
  return { folha, estadao };
}

function refreshDownloadPanel() {
  const { folha, estadao } = imagesAvailable(lastRunRows);
  const opts = [];
  if (folha.length) opts.push({ value: 'folha', label: `Folha — ${folha.length} imagens (~${Math.round(folha.length * 1.4)} MB)` });
  if (estadao.length) opts.push({ value: 'estadao', label: `Estadão — ${estadao.length} imagens (~${Math.round(estadao.length * 1.0)} MB)` });
  if (!opts.length) {
    downloadPanel.hidden = true;
    return;
  }
  downloadPanel.hidden = false;
  downloadSourceSel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  updateBatchHint();
}

function updateBatchHint() {
  const source = downloadSourceSel.value;
  const list = source === 'folha'
    ? imagesAvailable(lastRunRows).folha
    : imagesAvailable(lastRunRows).estadao;
  const cursor = batchCursor[source] || 0;
  const restante = list.length - cursor;
  const batch = Number(batchSizeInput.value) || 200;
  const totalLotes = Math.ceil(list.length / batch);
  const loteAtual = Math.floor(cursor / batch) + 1;
  if (restante <= 0) {
    downloadSummary.textContent = `Tudo baixado — ${list.length} imagens em ${totalLotes} lote(s).`;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Tudo baixado';
  } else {
    downloadSummary.textContent = `${list.length} imagens disponíveis. Próximo lote: ${loteAtual} de ${totalLotes} (${Math.min(batch, restante)} arquivos no próximo).`;
    downloadButton.disabled = false;
    downloadButton.textContent = `Baixar lote ${loteAtual} de ${totalLotes}`;
  }
}

async function downloadNextBatch() {
  const source = downloadSourceSel.value;
  const password = document.querySelector('#password').value;
  const list = source === 'folha'
    ? imagesAvailable(lastRunRows).folha
    : imagesAvailable(lastRunRows).estadao;
  const cursor = batchCursor[source] || 0;
  const batch = Number(batchSizeInput.value) || 200;
  const delayMs = Number(downloadDelayInput.value) || 400;
  const start = cursor;
  const end = Math.min(list.length, start + batch);
  const loteAtual = Math.floor(start / batch) + 1;
  const totalLotes = Math.ceil(list.length / batch);
  const taskId = `download-${source}-${loteAtual}`;
  addTask({ id: taskId, label: `Baixar ZIP — ${source} lote ${loteAtual} de ${totalLotes}`, weight: 25, total: end - start, done: 0, status: 'running', detail: `${end - start} imagens` });
  downloadButton.disabled = true;
  stopButton.disabled = false;
  stopped = false;
  const zip = new JSZip();
  let okCount = 0;
  let failCount = 0;
  for (let i = start; i < end; i += 1) {
    if (stopped) break;
    const row = list[i];
    const url = source === 'folha' ? row.full_jpg_url : row.page_image_url_high_res;
    const filename = source === 'folha'
      ? `folha-${row.date.replace(/\//g, '-')}-${row.numero}-${row.anchor}.jpg`
      : `${row.file_id}.jpg`;
    let success = false;
    let lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const blob = await proxyFetchBlob({ source: 'image_proxy', url }, password);
        const buf = await blob.arrayBuffer();
        zip.file(filename, buf);
        success = true;
        break;
      } catch (error) {
        lastErr = error.message;
        if (attempt < 2) await sleep(500);
      }
    }
    if (success) {
      okCount += 1;
    } else {
      log(`Imagem erro ${filename}: ${lastErr}`);
      failCount += 1;
    }
    updateTask(taskId, { done: i - start + 1, detail: `${okCount} ok, ${failCount} erros` });
    if (i + 1 < end) await sleep(delayMs);
  }
  if (okCount > 0) {
    updateTask(taskId, { detail: `compactando ${okCount} arquivos…` });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const safeTerm = safeName(lastRunKeyword) || 'busca';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `acervo-${source}-${safeTerm}-${dateStr}-lote-${loteAtual}-de-${totalLotes}.zip`;
    downloadBlob(blob, filename);
    log(`ZIP gerado: ${filename} (${okCount} imagens, ${failCount} erros)`);
  } else {
    log(`Lote ${loteAtual} sem imagens com sucesso, ZIP não gerado`);
  }
  batchCursor[source] = end;
  updateTask(taskId, { status: failCount === (end - start) ? 'error' : 'done', detail: `${okCount} ok, ${failCount} erros — ZIP entregue` });
  stopButton.disabled = true;
  updateBatchHint();
}

// === Handlers ===

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (Date.now() > EXPIRES_AT.getTime()) {
    setStatus('Expirado', 'Esta ferramenta temporária venceu.');
    return;
  }
  stopped = false;
  logEl.textContent = '';
  countEl.textContent = '0 linhas';
  resetTasks();
  downloadPanel.hidden = true;
  csvRescuePanel.hidden = true;
  batchCursor.folha = 0;
  batchCursor.estadao = 0;
  const options = {
    password: document.querySelector('#password').value,
    keyword: document.querySelector('#keyword').value.trim(),
    source: document.querySelector('#source').value,
    startDate: document.querySelector('#start-date').value,
    endDate: document.querySelector('#end-date').value,
    delay: Number(document.querySelector('#delay').value || 650),
    maxPages: Number(document.querySelector('#max-pages').value || 3000),
    highRes: document.querySelector('#high-res').checked
  };
  sessionStorage.setItem('acervo-tool-key', options.password);
  runButton.disabled = true;
  stopButton.disabled = false;
  const rowsArr = [];
  const seen = new Set();
  lastRunRows = rowsArr;
  lastRunKeyword = options.keyword;

  if (options.source === 'folha' || options.source === 'both') {
    addTask({ id: 'folha', label: 'Folha de S.Paulo', weight: 10 });
  }
  if (options.source === 'estadao' || options.source === 'both') {
    addTask({ id: 'estadao', label: 'O Estado de S.Paulo', weight: options.highRes ? 40 : 15 });
  }

  try {
    setStatus('Rodando', 'Coletando metadados. Mantenha a aba aberta.');
    if (options.source === 'folha' || options.source === 'both') {
      await scrapeFolha(options, rowsArr, seen);
    }
    if (!stopped && (options.source === 'estadao' || options.source === 'both')) {
      await scrapeEstadao(options, rowsArr, seen);
    }
    if (rowsArr.length) {
      const counts = await downloadCsvs(rowsArr, options.keyword);
      const detail = [
        counts.folha ? `Folha: ${counts.folha}` : null,
        counts.estadao ? `Estadão: ${counts.estadao}` : null
      ].filter(Boolean).join(' · ');
      setStatus(stopped ? 'Parado' : 'Concluído', `CSV(s) baixado(s) — ${detail}. Se algum não chegou, use os botões abaixo.`);
      log(`CSV(s) gerado(s): ${detail}`);
      refreshCsvRescue(counts);
      refreshDownloadPanel();
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
  log('Parada solicitada. A requisição atual ainda pode terminar.');
});

downloadButton.addEventListener('click', () => {
  downloadNextBatch().catch(error => {
    console.error(error);
    log(`Erro no lote: ${error.message}`);
    downloadButton.disabled = false;
  });
});

downloadReset.addEventListener('click', () => {
  batchCursor.folha = 0;
  batchCursor.estadao = 0;
  updateBatchHint();
  log('Contagem de lotes reiniciada.');
});

downloadSourceSel.addEventListener('change', updateBatchHint);
batchSizeInput.addEventListener('change', updateBatchHint);

rescueFolha.addEventListener('click', () => {
  if (downloadOneCsv('folha', lastRunRows, lastRunKeyword)) {
    log('CSV da Folha baixado novamente.');
  }
});
rescueEstadao.addEventListener('click', () => {
  if (downloadOneCsv('estadao', lastRunRows, lastRunKeyword)) {
    log('CSV do Estadão baixado novamente.');
  }
});

const savedKey = sessionStorage.getItem('acervo-tool-key');
if (savedKey) document.querySelector('#password').value = savedKey;

// === Upload de planilha pronta ===

function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      cur.push(field); rows.push(cur); cur = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function rowsFromCsvText(text) {
  const grid = parseCsv(text);
  if (!grid.length) return { header: [], rows: [] };
  const header = grid[0];
  const rows = grid.slice(1).map(values => {
    const obj = {};
    header.forEach((key, idx) => { obj[key] = values[idx] ?? ''; });
    return obj;
  });
  return { header, rows };
}

async function handleUpload() {
  const file = uploadInput.files && uploadInput.files[0];
  if (!file) { uploadStatus.textContent = 'Selecione um arquivo CSV primeiro.'; return; }
  const password = document.querySelector('#password').value;
  if (!password) { uploadStatus.textContent = 'Preencha a senha no topo da página antes de baixar as imagens.'; return; }

  uploadStatus.textContent = 'Lendo planilha…';
  const text = await file.text();
  const { header, rows } = rowsFromCsvText(text);
  if (!rows.length) { uploadStatus.textContent = 'Nenhuma linha encontrada na planilha.'; return; }

  rows.forEach((row, idx) => {
    if (!row.source) {
      if (row.full_jpg_url) row.source = 'folha';
      else if (row.page_image_url_high_res) row.source = 'estadao';
    }
    if (!row.result_index) row.result_index = idx + 1;
  });

  const folha = rows.filter(r => r.source === 'folha' && r.full_jpg_url).length;
  const estadao = rows.filter(r => r.source === 'estadao' && r.page_image_url_high_res).length;
  if (folha + estadao === 0) {
    uploadStatus.textContent = 'Planilha sem colunas reconhecidas. Precisa ter full_jpg_url (Folha) ou page_image_url_high_res (Estadão). Use o CSV gerado por esta ferramenta.';
    return;
  }

  lastRunRows = rows;
  const keywordFromCsv = (rows.find(r => r.keyword) || {}).keyword;
  const keywordFromFile = file.name.replace(/\.[^.]+$/, '');
  lastRunKeyword = keywordFromCsv || keywordFromFile;
  batchCursor.folha = 0;
  batchCursor.estadao = 0;
  countEl.textContent = `${rows.length} linhas`;
  refreshDownloadPanel();
  const partes = [folha ? `Folha: ${folha}` : null, estadao ? `Estadão: ${estadao}` : null].filter(Boolean).join(' · ');
  setStatus('Planilha carregada', `${rows.length} linhas — siga pro painel de download em lotes abaixo.`);
  uploadStatus.textContent = `Carregado: ${partes}. O painel de download apareceu acima.`;
  log(`Planilha "${file.name}" carregada — ${partes}`);
  const panel = document.querySelector('#download-panel');
  if (panel && !panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

uploadButton.addEventListener('click', () => {
  handleUpload().catch(error => {
    console.error(error);
    uploadStatus.textContent = `Erro ao ler planilha: ${error.message}`;
  });
});

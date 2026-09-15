// OCR opcional: as imagens e o texto ficam no navegador até o usuário baixar o PDF.
const ocrPanel = document.querySelector('#ocr-panel');
const ocrResultsEl = document.querySelector('#ocr-results');
const ocrSelectionEl = document.querySelector('#ocr-selection-count');
const ocrStatusEl = document.querySelector('#ocr-status');
const ocrFindingsEl = document.querySelector('#ocr-findings');
const ocrTermEl = document.querySelector('#ocr-term');
const ocrMoreButton = document.querySelector('#ocr-more');
const ocrRunButton = document.querySelector('#ocr-run');
const ocrStopButton = document.querySelector('#ocr-stop');
const ocrBulkStartEl = document.querySelector('#ocr-bulk-start');
const ocrBulkHintEl = document.querySelector('#ocr-bulk-hint');
const ocrBulkButton = document.querySelector('#ocr-bulk-run');
const notebookNextEl = document.querySelector('#notebooklm-next');

const OCR_MAX_PAGES = 10;
const OCR_PAGE_CHUNK = 30;
let ocrPages = [];
let ocrVisibleCount = 0;
let ocrSelected = new Map();
let ocrRunning = false;
let ocrStopRequested = false;

function ocrImageUrl(row) {
  return row.source === 'folha' ? row.full_jpg_url : row.page_image_url_high_res;
}

function ocrSourceLink(row) {
  const base = row.source === 'folha' ? 'https://acervo.folha.com.br/' : 'https://acervo.estadao.com.br/';
  return absoluteUrl(row.href, base);
}

function ocrLabel(row) {
  const paper = row.source === 'folha' ? 'Folha' : 'Estadão';
  const place = row.source === 'folha'
    ? [row.newspaper || 'edição', row.issue_raw, row.anchor && `registro ${row.anchor}`]
    : [row.edition, row.page_label || 'página', row.file_id && `arquivo ${row.file_id}`];
  return `${paper} · ${row.date || 'data não informada'} · ${place.filter(Boolean).join(' · ')}`;
}

function refreshOcrPanel(rows, keyword) {
  const byImage = new Map();
  for (const row of rows) {
    const imageUrl = ocrImageUrl(row);
    if (imageUrl && !byImage.has(imageUrl)) byImage.set(imageUrl, row);
  }
  ocrPages = [...byImage.values()];
  ocrSelected = new Map();
  ocrVisibleCount = 0;
  ocrResultsEl.replaceChildren();
  ocrFindingsEl.replaceChildren();
  ocrStatusEl.textContent = '';
  notebookNextEl.hidden = true;
  ocrTermEl.value = keyword || '';
  ocrBulkStartEl.value = 1;
  ocrBulkStartEl.max = Math.max(1, ocrPages.length);
  ocrPanel.hidden = ocrPages.length === 0;
  if (!ocrPanel.hidden) renderMoreOcrPages();
  updateOcrSelection();
}

function updateOcrSelection() {
  const count = ocrSelected.size;
  ocrSelectionEl.textContent = `${count} de ${OCR_MAX_PAGES} páginas selecionadas · ${ocrPages.length} páginas únicas disponíveis.`;
  ocrRunButton.disabled = ocrRunning || count === 0;
  ocrRunButton.textContent = count ? `Fazer OCR de ${count} página(s) e gerar PDF` : 'Fazer OCR e gerar PDF';
  const rawStart = Number(ocrBulkStartEl.value);
  const validStart = Number.isInteger(rawStart) && rawStart >= 1 && rawStart <= ocrPages.length;
  const end = Math.min(ocrPages.length, rawStart + OCR_MAX_PAGES - 1);
  ocrBulkButton.disabled = ocrRunning || !validStart;
  ocrBulkHintEl.textContent = rawStart === ocrPages.length + 1
    ? `Fim da lista de ${ocrPages.length} páginas. Para recomeçar, informe 1.`
    : validStart
    ? `Próximo PDF: páginas ${rawStart} a ${end} de ${ocrPages.length}. Total aproximado: ${Math.ceil(ocrPages.length / OCR_MAX_PAGES)} PDF(s) se começar na página 1.`
    : `Informe uma página entre 1 e ${ocrPages.length}.`;
}

function renderMoreOcrPages() {
  const end = Math.min(ocrPages.length, ocrVisibleCount + OCR_PAGE_CHUNK);
  for (let i = ocrVisibleCount; i < end; i += 1) {
    const row = ocrPages[i];
    const imageUrl = ocrImageUrl(row);
    const item = document.createElement('div');
    item.className = 'ocr-result';
    const label = document.createElement('label');
    label.className = 'ocr-result-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = ocrSelected.has(imageUrl);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (ocrSelected.size >= OCR_MAX_PAGES) {
          checkbox.checked = false;
          ocrStatusEl.textContent = `Limite de ${OCR_MAX_PAGES} páginas por PDF. Desmarque uma antes de escolher outra.`;
          return;
        }
        ocrSelected.set(imageUrl, row);
      } else {
        ocrSelected.delete(imageUrl);
      }
      notebookNextEl.hidden = true;
      updateOcrSelection();
    });
    const text = document.createElement('span');
    text.textContent = ocrLabel(row);
    label.append(checkbox, text);
    const link = document.createElement('a');
    link.href = ocrSourceLink(row);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver no acervo';
    item.append(label, link);
    ocrResultsEl.appendChild(item);
  }
  ocrVisibleCount = end;
  ocrMoreButton.hidden = end >= ocrPages.length;
}

function loadOcrScript(url, globalName) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => window[globalName] ? resolve() : reject(new Error(`Biblioteca ${globalName} não carregou.`));
    script.onerror = () => reject(new Error(`Não foi possível carregar ${globalName}. Verifique a conexão.`));
    document.head.appendChild(script);
  });
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem baixada.'));
    reader.readAsDataURL(blob);
  });
}

function termOccurrences(text, term) {
  if (!term) return { count: 0, snippet: '' };
  const lowerText = text.toLocaleLowerCase('pt-BR');
  const lowerTerm = term.toLocaleLowerCase('pt-BR');
  let count = 0;
  let first = -1;
  let position = 0;
  while ((position = lowerText.indexOf(lowerTerm, position)) !== -1) {
    if (first === -1) first = position;
    count += 1;
    position += lowerTerm.length;
  }
  const snippet = first === -1 ? '' : normalizeSpace(text.slice(Math.max(0, first - 100), first + term.length + 140));
  return { count, snippet };
}

function addOcrFinding(row, match, error, term) {
  const item = document.createElement('div');
  item.className = 'ocr-finding';
  const title = document.createElement('strong');
  title.textContent = ocrLabel(row);
  const detail = document.createElement('p');
  detail.textContent = error
    ? `Falha no OCR: ${error}`
    : !term
      ? 'OCR concluído. Abra o PDF para ler a transcrição e confira a imagem original.'
    : match.count
      ? `${match.count} ocorrência(s) do termo no texto OCR. Trecho: ${match.snippet}`
      : 'Termo não encontrado no OCR desta página. Confira a imagem: o reconhecimento pode falhar.';
  const link = document.createElement('a');
  link.href = ocrSourceLink(row);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Conferir página original';
  item.append(title, detail, link);
  ocrFindingsEl.appendChild(item);
}

function pdfHeader(pdf, row, kind) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(kind, 14, 16);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const lines = pdf.splitTextToSize(ocrLabel(row), 180).slice(0, 2);
  pdf.text(lines, 14, 23);
  pdf.setDrawColor(205, 210, 205);
  pdf.line(14, 33, 196, 33);
  pdf.setTextColor(26, 93, 73);
  pdf.textWithLink('Conferir a página original no acervo', 14, 288, { url: ocrSourceLink(row) });
  pdf.setTextColor(0, 0, 0);
}

async function pdfScanPage(pdf, row, dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  pdf.addPage();
  pdfHeader(pdf, row, 'Página digitalizada');
  const maxWidth = 182;
  const maxHeight = 242;
  const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
  const width = img.naturalWidth * ratio;
  const height = img.naturalHeight * ratio;
  pdf.addImage(dataUrl, 'JPEG', 14 + (maxWidth - width) / 2, 38, width, height);
}

function pdfOcrPages(pdf, row, text, term, match) {
  pdf.addPage();
  pdfHeader(pdf, row, 'Transcrição OCR - confira com a imagem');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const finding = term
    ? (match.count ? `Termo "${term}": ${match.count} ocorrência(s) no OCR.` : `Termo "${term}": não encontrado no OCR.`)
    : 'Sem termo de verificação.';
  let y = 40;
  const findingLines = pdf.splitTextToSize(finding, 180);
  pdf.text(findingLines, 14, y);
  y += findingLines.length * 4.5 + 2;
  pdf.setFontSize(7);
  const sourceLines = pdf.splitTextToSize(`Fonte original: ${ocrSourceLink(row)}`, 180);
  pdf.text(sourceLines, 14, y);
  y += sourceLines.length * 3.5 + 7;
  pdf.setFontSize(8);
  const paragraphs = text.trim() ? text.replace(/\r/g, '').split('\n') : ['Nenhum texto reconhecido nesta imagem.'];
  for (const paragraph of paragraphs) {
    const lines = pdf.splitTextToSize(paragraph || ' ', 180);
    for (const line of lines) {
      if (y > 277) {
        pdf.addPage();
        pdfHeader(pdf, row, 'Transcrição OCR - continuação');
        y = 42;
        pdf.setFontSize(8);
      }
      pdf.text(line, 14, y);
      y += 4.5;
    }
  }
}

async function runOcrPdf(bulk = false) {
  const bulkStart = Number(ocrBulkStartEl.value);
  if (ocrRunning || (bulk
    ? !Number.isInteger(bulkStart) || bulkStart < 1 || bulkStart > ocrPages.length
    : !ocrSelected.size)) return;
  ocrRunning = true;
  ocrStopRequested = false;
  ocrRunButton.disabled = true;
  ocrStopButton.disabled = false;
  ocrMoreButton.disabled = true;
  ocrBulkButton.disabled = true;
  ocrBulkStartEl.disabled = true;
  ocrResultsEl.querySelectorAll('input').forEach(input => { input.disabled = true; });
  ocrFindingsEl.replaceChildren();
  notebookNextEl.hidden = true;
  const bulkEnd = Math.min(ocrPages.length, bulkStart + OCR_MAX_PAGES - 1);
  const rows = bulk ? ocrPages.slice(bulkStart - 1, bulkEnd) : [...ocrSelected.values()];
  const term = ocrTermEl.value.trim();
  let worker;
  try {
    ocrStatusEl.textContent = 'Carregando OCR português e gerador de PDF...';
    await Promise.all([
      loadOcrScript('https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js', 'Tesseract'),
      loadOcrScript('https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js', 'jspdf')
    ]);
    worker = await Tesseract.createWorker('por', 1, {
      logger: message => {
        if (message.status === 'recognizing text' && ocrRunning) {
          ocrStatusEl.textContent = `Reconhecendo texto: ${Math.round((message.progress || 0) * 100)}%.`;
        }
      }
    });
    const pdf = new jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let completed = 0;
    let failures = 0;
    for (const row of rows) {
      if (ocrStopRequested) break;
      const current = completed + failures + 1;
      ocrStatusEl.textContent = `Baixando página ${current} de ${rows.length}: ${ocrLabel(row)}.`;
      try {
        const blob = await proxyFetchBlob({ source: 'image_proxy', url: ocrImageUrl(row) });
        if (!blob.type.startsWith('image/') || blob.size < 1000) throw new Error('O acervo não retornou uma imagem válida.');
        const dataUrl = await blobAsDataUrl(blob);
        ocrStatusEl.textContent = `Fazendo OCR da página ${current} de ${rows.length}: ${ocrLabel(row)}.`;
        const result = await worker.recognize(dataUrl);
        const text = result.data.text || '';
        const match = termOccurrences(text, term);
        await pdfScanPage(pdf, row, dataUrl);
        pdfOcrPages(pdf, row, text, term, match);
        addOcrFinding(row, match, null, term);
        completed += 1;
      } catch (error) {
        failures += 1;
        addOcrFinding(row, null, error.message, term);
        log(`OCR: falha em ${ocrLabel(row)}: ${error.message}`);
      }
    }
    if (!completed) throw new Error('Nenhuma página foi processada. Confira os erros acima e tente novamente.');
    pdf.deletePage(1);
    const suffix = bulk ? `-paginas-${bulkStart}-a-${bulkStart + rows.length - 1}` : '';
    const filename = `acervo-ocr-${safeName(lastRunKeyword || term) || 'paginas'}-${new Date().toISOString().slice(0, 10)}${suffix}.pdf`;
    downloadBlob(pdf.output('blob'), filename);
    notebookNextEl.hidden = false;
    const completeBatch = bulk && completed === rows.length && !failures && !ocrStopRequested;
    if (completeBatch) ocrBulkStartEl.value = bulkEnd + 1;
    ocrStatusEl.textContent = `PDF gerado: ${completed} página(s) com imagem e transcrição. ${failures ? `${failures} falha(s).` : ''} ${ocrStopRequested ? 'Processamento interrompido após a última página concluída.' : ''} ${bulk && !completeBatch ? 'A posição de retomada não mudou; confira as falhas antes de repetir.' : ''}`;
    log(`PDF OCR gerado: ${filename} (${completed} páginas, ${failures} falhas)`);
  } catch (error) {
    console.error(error);
    ocrStatusEl.textContent = `Erro: ${error.message}`;
    log(`OCR: ${error.message}`);
  } finally {
    if (worker) await worker.terminate();
    ocrRunning = false;
    ocrStopButton.disabled = true;
    ocrMoreButton.disabled = false;
    ocrBulkStartEl.disabled = false;
    ocrResultsEl.querySelectorAll('input').forEach(input => { input.disabled = false; });
    updateOcrSelection();
  }
}

ocrMoreButton.addEventListener('click', renderMoreOcrPages);
ocrRunButton.addEventListener('click', () => runOcrPdf(false));
ocrBulkButton.addEventListener('click', () => runOcrPdf(true));
ocrBulkStartEl.addEventListener('input', updateOcrSelection);
ocrStopButton.addEventListener('click', () => {
  ocrStopRequested = true;
  ocrStopButton.disabled = true;
  ocrStatusEl.textContent = 'Parada solicitada. O OCR da página atual ainda pode terminar.';
});

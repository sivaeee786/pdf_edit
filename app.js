'use strict';

// ── PDF.js worker ─────────────────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  pdfBytes:    null,   // Uint8Array — kept for PDF-lib save
  pdfDoc:      null,   // PDF.js document object
  filename:    null,
  currentPage: 1,
  totalPages:  0,
  zoom:        1.5,
  editMode:    false,
  modified:    false,
  edits:       [],     // { page, pdfX, pdfY, pdfW, fontSize, newText, isNew }
  viewport:    null,   // current PDF.js viewport (needed for canvas overlay)
};

// ── Font helpers ──────────────────────────────────────────────────────────────

// Parse bold/italic/family hints out of a PDF font resource name.
function parseFontStyle(fontName) {
  const n = (fontName || '').toLowerCase();
  const bold   = /bold|demi|semibold|black|heavy/.test(n);
  const italic = /italic|oblique|slanted/.test(n);
  const mono   = /mono|courier|consolas|typewriter/.test(n);
  const serif  = /times|georgia|palatino|garamond|minion|caslon|\bserif\b/.test(n);
  const family = mono ? 'monospace' : serif ? 'serif' : 'sans-serif';
  return { bold, italic, family };
}

// CSS font-family string for the textarea / canvas.
function cssFontFamily(style) {
  if (style.family === 'monospace') return '"Courier New", Courier, monospace';
  if (style.family === 'serif')     return '"Times New Roman", Times, serif';
  return 'Arial, Helvetica, sans-serif';
}

// Pick the closest PDF-lib standard font for the save step.
function pickStandardFont(fontName) {
  const { StandardFonts } = PDFLib;
  const { bold, italic, family } = parseFontStyle(fontName);
  if (family === 'monospace') {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold)           return StandardFonts.CourierBold;
    if (italic)         return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (family === 'serif') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold)           return StandardFonts.TimesRomanBold;
    if (italic)         return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  // sans-serif (default → Helvetica)
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold)           return StandardFonts.HelveticaBold;
  if (italic)         return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const dom = {
  fileInput:   el('fileInput'),
  btnOpen:     el('btnOpen'),
  btnSave:     el('btnSave'),
  btnSaveAs:   el('btnSaveAs'),
  btnPrev:     el('btnPrev'),
  btnNext:     el('btnNext'),
  btnZoomOut:  el('btnZoomOut'),
  btnZoomIn:   el('btnZoomIn'),
  btnFit:      el('btnFit'),
  btnEdit:     el('btnEdit'),
  btnExitEdit: el('btnExitEdit'),
  pageInfo:    el('pageInfo'),
  zoomLabel:   el('zoomLabel'),
  docName:     el('docName'),
  dropZone:    el('dropZone'),
  viewerArea:  el('viewerArea'),
  pageScroll:  el('pageScroll'),
  pageWrapper: el('pageWrapper'),
  canvas:      el('pdfCanvas'),
  textLayer:   el('textLayer'),
  editBar:     el('editBar'),
  statusMsg:   el('statusMsg'),
  modBadge:    el('modBadge'),
  pwOverlay:   el('pwOverlay'),
  pwInput:     el('pwInput'),
  pwOk:        el('pwOk'),
  pwCancel:    el('pwCancel'),
  pwErr:       el('pwErr'),
};

// ── Edit commit helpers ───────────────────────────────────────────────────────

// Returns the most recently committed text for a position (so re-opening an
// already-edited span shows the edited text, not the original PDF text).
function getLatestText(pdfX, pdfY, fallback) {
  const found = state.edits.find(
    e => e.page === state.currentPage &&
         Math.abs(e.pdfX - pdfX) < 1 &&
         Math.abs(e.pdfY - pdfY) < 1,
  );
  return found ? found.newText : fallback;
}

// "Click outside" — commit whatever textarea is open.
// Uses capture-phase mousedown so it fires before the target's own click
// handler, giving a clean commit-then-open sequence when switching spans.
document.addEventListener('mousedown', ev => {
  const ta = dom.textLayer ? dom.textLayer.querySelector('.edit-input') : null;
  if (ta && !ta.contains(ev.target)) commitEdit(ta);
}, true);

// ── Event wiring ──────────────────────────────────────────────────────────────
dom.btnOpen.addEventListener('click', () => dom.fileInput.click());
dom.fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
  e.target.value = '';
});

// Drag & drop
dom.dropZone.addEventListener('dragover',  e => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
dom.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dom.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// Also allow dropping on the viewer area
dom.viewerArea.addEventListener('dragover', e => { e.preventDefault(); });
dom.viewerArea.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

dom.btnSave.addEventListener('click',     () => savePdf(false));
dom.btnSaveAs.addEventListener('click',   () => savePdf(true));
dom.btnPrev.addEventListener('click',     () => goToPage(state.currentPage - 1));
dom.btnNext.addEventListener('click',     () => goToPage(state.currentPage + 1));
dom.btnZoomOut.addEventListener('click',  () => setZoom(state.zoom - 0.25));
dom.btnZoomIn.addEventListener('click',   () => setZoom(state.zoom + 0.25));
dom.btnFit.addEventListener('click',      fitPage);
dom.btnEdit.addEventListener('click',     toggleEditMode);
dom.btnExitEdit.addEventListener('click', exitEditMode);

// Password modal
dom.pwOk.addEventListener('click', submitPassword);
dom.pwCancel.addEventListener('click', cancelPassword);
dom.pwInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  submitPassword();
  if (e.key === 'Escape') cancelPassword();
});

// Global keyboard shortcuts
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'o') { e.preventDefault(); dom.fileInput.click(); }
    if (e.key === 's' && !e.shiftKey) { e.preventDefault(); savePdf(false); }
    if (e.key === 'S')  { e.preventDefault(); savePdf(true); }
    if (e.key === 'e')  { e.preventDefault(); toggleEditMode(); }
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(state.zoom + 0.25); }
    if (e.key === '-')  { e.preventDefault(); setZoom(state.zoom - 0.25); }
    if (e.key === '0')  { e.preventDefault(); fitPage(); }
  }
  if (!typing) {
    if (e.key === 'ArrowLeft')  goToPage(state.currentPage - 1);
    if (e.key === 'ArrowRight') goToPage(state.currentPage + 1);
    if (e.key === 'Escape' && state.editMode) exitEditMode();
  }
});

// ── File loading ──────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    setStatus('Please open a PDF file.');
    return;
  }
  setStatus('Reading file…');
  const buf = await file.arrayBuffer();
  state.pdfBytes = new Uint8Array(buf);
  state.filename = file.name;
  state.edits    = [];
  state.modified = false;
  await openPdf('');
}

async function openPdf(password) {
  setStatus('Loading PDF…');
  try {
    const task = pdfjsLib.getDocument({ data: state.pdfBytes, password });
    state.pdfDoc = await task.promise;
  } catch (err) {
    if (err.name === 'PasswordException') {
      showPasswordModal(err.code === 2);   // code 2 = wrong password
      return;
    }
    setStatus('Error: ' + err.message);
    return;
  }

  state.totalPages  = state.pdfDoc.numPages;
  state.currentPage = 1;

  dom.dropZone.classList.add('hidden');
  dom.viewerArea.classList.remove('hidden');
  setDocEnabled(true);
  updateModBadge();

  dom.docName.textContent = state.filename;
  document.title = 'PDF Viewer — ' + state.filename;

  setStatus('Opened: ' + state.filename + '  —  ' + state.totalPages + ' page(s)');
  await renderPage(1);
}

// ── Password modal ────────────────────────────────────────────────────────────
function showPasswordModal(wrongPw) {
  dom.pwErr.classList.toggle('hidden', !wrongPw);
  dom.pwInput.value = '';
  dom.pwOverlay.classList.remove('hidden');
  setTimeout(() => dom.pwInput.focus(), 60);
}

function submitPassword() {
  const pw = dom.pwInput.value;
  dom.pwOverlay.classList.add('hidden');
  openPdf(pw);
}

function cancelPassword() {
  dom.pwOverlay.classList.add('hidden');
  setStatus('Cancelled.');
}

// ── Rendering ─────────────────────────────────────────────────────────────────
async function renderPage(num) {
  if (!state.pdfDoc) return;
  num = clamp(num, 1, state.totalPages);
  state.currentPage = num;

  const page     = await state.pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: state.zoom });
  const canvas   = dom.canvas;
  const ctx      = canvas.getContext('2d');

  // High-DPI rendering
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(viewport.width  * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width  = viewport.width  + 'px';
  canvas.style.height = viewport.height + 'px';
  ctx.scale(dpr, dpr);

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Store viewport, then repaint any edits that were made on this page
  state.viewport = viewport;
  repaintEdits(ctx, viewport);

  // Build text layer
  const textContent = await page.getTextContent();
  buildTextLayer(textContent, viewport);

  updatePageInfo();
  setStatus(
    state.editMode
      ? 'Page ' + num + '/' + state.totalPages + '  —  EDIT MODE: click text to edit, click empty space to add text'
      : 'Page ' + num + ' of ' + state.totalPages + '  —  Zoom ' + Math.round(state.zoom * 100) + '%'
  );
}

// ── Canvas edit overlay ───────────────────────────────────────────────────────

// Repaint all committed edits for the current page on top of the PDF canvas.
function repaintEdits(ctx, viewport) {
  for (const edit of state.edits) {
    if (edit.page === state.currentPage) paintOneEdit(ctx, viewport, edit);
  }
}

// Draw a single edit onto the canvas (white-out original area, write new text).
function paintOneEdit(ctx, viewport, edit) {
  if (!ctx || !viewport) return;
  const s   = viewport.scale;
  const dpr = window.devicePixelRatio || 1;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const x   = edit.pdfX * s;
  const yBL = viewport.height - edit.pdfY * s;   // baseline from canvas top (CSS px)
  const fs  = edit.fontSize * s;                  // font size in CSS px

  // Set font before measuring so metrics are accurate for this typeface
  const fStyle = parseFontStyle(edit.fontName);
  const weight = fStyle.bold   ? 'bold'   : 'normal';
  const slant  = fStyle.italic ? 'italic' : 'normal';
  const family = cssFontFamily(fStyle);
  ctx.font     = `${slant} ${weight} ${fs}px ${family}`;

  // Fixed-proportion erase rect: cap-height ≈ 0.72em, descender ≈ 0.20em.
  // Avoids inflated metrics from diacritics (e.g. Á) that would push eraseH
  // to ~1.2em — the same as normal line spacing — and bleed into adjacent lines.
  const ascent  = fs * 0.78;
  const descent = fs * 0.22;
  const eraseH  = ascent + descent;   // = fs * 1.0, safely within line spacing

  const eraseW  = edit.pdfW > 0 ? edit.pdfW * s + 2 : 0;

  // Erase only the exact glyph bounding box — no bleeding into adjacent lines
  if (!edit.isNew && eraseW > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, yBL - ascent, eraseW + 2, eraseH);
  }

  // Paint replacement / new text
  const [cr, cg, cb] = (edit.color || '0,0,0').split(',').map(Number);
  ctx.fillStyle    = `rgb(${cr},${cg},${cb})`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(edit.newText, x, yBL);

  ctx.restore();
}

// ── Text layer ────────────────────────────────────────────────────────────────
function buildTextLayer(textContent, viewport) {
  const tl    = dom.textLayer;
  const scale = viewport.scale;

  tl.innerHTML = '';
  tl.style.width  = viewport.width  + 'px';
  tl.style.height = viewport.height + 'px';

  tl.classList.toggle('editable', state.editMode);

  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;

    const [a, b, c, d, e, f] = item.transform;

    // Font size in PDF user-space units
    const fsPdf = item.height || Math.hypot(c, d) || Math.hypot(a, b) || 12;
    const fsScr = fsPdf * scale;

    // Screen position: PDF origin is bottom-left; screen origin is top-left
    const left = e * scale;
    const top  = viewport.height - (f + fsPdf) * scale;
    const w    = Math.max(item.width * scale, 4);

    const span = document.createElement('span');
    span.className = 'text-item';
    span.textContent = item.str;

    // Store PDF metadata for editing and save
    span.dataset.pdfX     = e;
    span.dataset.pdfY     = f;
    span.dataset.pdfW     = item.width;
    span.dataset.fs       = fsPdf;
    span.dataset.fontName = item.fontName || '';
    // item.color is [r,g,b] 0-255 in PDF.js 3.x (may be absent)
    const ic = item.color;
    span.dataset.color = (ic && ic.length >= 3)
      ? ic[0] + ',' + ic[1] + ',' + ic[2]
      : '0,0,0';

    // Apply font style so hover-preview shows correct weight/style
    const fStyle = parseFontStyle(item.fontName);
    span.style.cssText =
      'left:'        + left                    + 'px;' +
      'top:'         + top                     + 'px;' +
      'width:'       + w                       + 'px;' +
      'height:'      + fsScr                   + 'px;' +
      'font-size:'   + fsScr                   + 'px;' +
      'font-family:' + cssFontFamily(fStyle)   + ';'   +
      'font-weight:' + (fStyle.bold   ? 'bold'   : 'normal') + ';' +
      'font-style:'  + (fStyle.italic ? 'italic' : 'normal') + ';';

    if (state.editMode) {
      span.title = 'Click to edit this text';
      span.addEventListener('click', ev => {
        ev.stopPropagation();
        beginEditSpan(span, viewport);
      });
    }

    tl.appendChild(span);
  }

  // Click on empty canvas space → add new text (edit mode only)
  if (state.editMode) {
    tl.addEventListener('click', ev => {
      if (ev.target === tl) beginAddText(ev, viewport);
    });
  }
}

// ── Edit: existing text ───────────────────────────────────────────────────────
function beginEditSpan(span, viewport) {
  closeAnyEdit();

  const pdfX = parseFloat(span.dataset.pdfX);
  const pdfY = parseFloat(span.dataset.pdfY);
  const pdfW = parseFloat(span.dataset.pdfW);
  const fs   = parseFloat(span.dataset.fs);
  const fsScr = fs * viewport.scale;

  span.style.visibility = 'hidden';

  const fontName = span.dataset.fontName || '';
  const color    = span.dataset.color    || '0,0,0';
  const fStyle   = parseFontStyle(fontName);

  // Pre-fill with the latest committed text (handles page re-renders where
  // span.textContent reverts to the original PDF text)
  const latestText = getLatestText(pdfX, pdfY, span.textContent);

  const ta = makeEditInput(
    span.offsetLeft,
    span.offsetTop,
    Math.max(parseFloat(span.style.width), 120),
    Math.max(fsScr, 28),
    fsScr,
    latestText,
    fStyle,
  );
  ta._span     = span;
  ta._pdfX     = pdfX;
  ta._pdfY     = pdfY;
  ta._pdfW     = pdfW;
  ta._fs       = fs;
  ta._isNew    = false;
  ta._fontName = fontName;
  ta._color    = color;

  dom.textLayer.appendChild(ta);
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitEdit(ta); }
    if (ev.key === 'Escape') { span.style.visibility = ''; ta.remove(); }
  });
}

// ── Edit: add new text ────────────────────────────────────────────────────────
function beginAddText(ev, viewport) {
  closeAnyEdit();

  const rect  = dom.textLayer.getBoundingClientRect();
  const scrX  = ev.clientX - rect.left;
  const scrY  = ev.clientY - rect.top;
  const scale = viewport.scale;

  const fs    = 12;                                    // default font size (pt)
  const fsScr = fs * scale;

  // Convert screen click → PDF user-space
  const pdfX = scrX / scale;
  const pdfY = (viewport.height - scrY) / scale;

  const ta = makeEditInput(scrX, scrY - fsScr, 200, fsScr * 1.4, fsScr, '',
                           parseFontStyle(''));
  ta._pdfX     = pdfX;
  ta._pdfY     = pdfY;
  ta._pdfW     = 0;
  ta._fs       = fs;
  ta._isNew    = true;
  ta._fontName = '';
  ta._color    = '0,0,0';

  dom.textLayer.appendChild(ta);
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitEdit(ta); }
    if (ev.key === 'Escape') ta.remove();
  });
}

// ── Edit input widget ─────────────────────────────────────────────────────────
function makeEditInput(left, top, w, h, fontSize, value, fStyle = {}) {
  const ta = document.createElement('textarea');
  ta.className = 'edit-input';
  ta.value = value;
  ta.style.cssText =
    'left:'        + left                                    + 'px;' +
    'top:'         + top                                     + 'px;' +
    'min-width:'   + w                                       + 'px;' +
    'height:'      + Math.max(h, 28)                         + 'px;' +
    'font-size:'   + fontSize                                + 'px;' +
    'font-family:' + cssFontFamily(fStyle)                   + ';'   +
    'font-weight:' + (fStyle.bold   ? 'bold'   : 'normal')   + ';'   +
    'font-style:'  + (fStyle.italic ? 'italic' : 'normal')   + ';';

  requestAnimationFrame(() => { ta.focus(); ta.select(); });
  return ta;
}

// ── Commit an edit ────────────────────────────────────────────────────────────
function commitEdit(ta) {
  if (!ta || !ta.isConnected || ta._committed) return;
  ta._committed = true;          // guard against blur + mousedown firing together
  const newText = ta.value.trim();
  const span    = ta._span;

  if (span) {
    if (newText && newText !== span.textContent) {
      recordEdit(ta._pdfX, ta._pdfY, ta._pdfW, ta._fs, newText, false,
                 ta._fontName, ta._color);
      span.textContent = newText;
      paintOneEdit(dom.canvas.getContext('2d'), state.viewport,
                   state.edits[state.edits.length - 1]);
    }
    span.style.visibility = '';
  } else if (ta._isNew && newText) {
    recordEdit(ta._pdfX, ta._pdfY, ta._pdfW, ta._fs, newText, true,
               ta._fontName, ta._color);
    paintOneEdit(dom.canvas.getContext('2d'), state.viewport,
                 state.edits[state.edits.length - 1]);
  }

  ta.remove();
}

function closeAnyEdit() {
  const existing = dom.textLayer.querySelector('.edit-input');
  if (existing) {
    commitEdit(existing);                  // save any in-progress text
    if (existing.isConnected) existing.remove();
    dom.textLayer.querySelectorAll('.text-item').forEach(s => s.style.visibility = '');
  }
}

// ── Record an edit ────────────────────────────────────────────────────────────
function recordEdit(pdfX, pdfY, pdfW, fontSize, newText, isNew, fontName = '', color = '0,0,0') {
  const i = state.edits.findIndex(
    e => e.page === state.currentPage &&
         Math.abs(e.pdfX - pdfX) < 1 &&
         Math.abs(e.pdfY - pdfY) < 1,
  );
  if (i >= 0) state.edits.splice(i, 1);

  state.edits.push({ page: state.currentPage, pdfX, pdfY, pdfW, fontSize, newText, isNew, fontName, color });
  markModified();
}

// ── Edit mode toggle ──────────────────────────────────────────────────────────
function toggleEditMode() {
  if (!state.pdfDoc) return;
  state.editMode = !state.editMode;
  syncEditModeUI();
  renderPage(state.currentPage);
}

function exitEditMode() {
  state.editMode = false;
  syncEditModeUI();
  renderPage(state.currentPage);
}

function syncEditModeUI() {
  dom.btnEdit.classList.toggle('active', state.editMode);
  dom.editBar.classList.toggle('hidden', !state.editMode);
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function savePdf(saveAs) {
  if (!state.pdfBytes) return;
  if (!state.modified && !saveAs) { setStatus('No changes to save.'); return; }

  let filename = state.filename || 'document.pdf';
  if (saveAs) {
    const entered = prompt('Save as:', filename.replace(/\.pdf$/i, '_edited.pdf'));
    if (entered === null) return;
    filename = entered.endsWith('.pdf') ? entered : entered + '.pdf';
  }

  setStatus('Saving…');

  try {
    const bytes = await applyEdits();
    downloadBytes(bytes, filename);

    // Update in-memory copy so further edits layer on top
    state.pdfBytes = bytes;
    state.edits    = [];
    state.modified = false;
    dom.btnSave.disabled = true;
    updateModBadge();
    setStatus('Saved: ' + filename);
    document.title = 'PDF Viewer — ' + (state.filename = filename);
  } catch (err) {
    setStatus('Save error: ' + err.message);
    console.error(err);
  }
}

async function applyEdits() {
  const { PDFDocument, rgb } = PDFLib;
  const doc   = await PDFDocument.load(state.pdfBytes);
  const pages = doc.getPages();

  // Embed each required standard font once
  const fontCache = {};
  async function getFont(fontName) {
    const sfKey = pickStandardFont(fontName);
    if (!fontCache[sfKey]) fontCache[sfKey] = await doc.embedFont(sfKey);
    return fontCache[sfKey];
  }

  for (const edit of state.edits) {
    const page = pages[edit.page - 1];
    if (!page) continue;

    const font = await getFont(edit.fontName);

    // Erase original text with a white rectangle (skip for brand-new text).
    // Height: ascent (~0.75em) + descent (~0.2em) + 2pt padding — matches the
    // canvas overlay metrics so the saved PDF doesn't bleed into adjacent lines.
    if (!edit.isNew && edit.pdfW > 0) {
      const eraseH = edit.fontSize * 0.95 + 2;
      const eraseY = edit.pdfY - edit.fontSize * 0.2;
      page.drawRectangle({
        x:      edit.pdfX - 1,
        y:      eraseY,
        width:  edit.pdfW + 2,
        height: eraseH,
        color:  rgb(1, 1, 1),
        borderWidth: 0,
      });
    }

    // Draw replacement / new text with matching color
    const [cr, cg, cb] = (edit.color || '0,0,0').split(',').map(Number);
    page.drawText(edit.newText, {
      x:     edit.pdfX,
      y:     edit.pdfY,
      size:  Math.max(edit.fontSize, 4),
      font,
      color: rgb(cr / 255, cg / 255, cb / 255),
    });
  }

  return doc.save();
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goToPage(n) {
  if (!state.pdfDoc) return;
  n = clamp(n, 1, state.totalPages);
  if (n !== state.currentPage) renderPage(n);
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
function setZoom(z) {
  if (!state.pdfDoc) return;
  state.zoom = clamp(Math.round(z * 100) / 100, 0.25, 4.0);
  dom.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  renderPage(state.currentPage);
}

async function fitPage() {
  if (!state.pdfDoc) return;
  const availW = dom.viewerArea.clientWidth  - 56;
  const availH = dom.viewerArea.clientHeight - 56;
  const page   = await state.pdfDoc.getPage(state.currentPage);
  const vp1    = page.getViewport({ scale: 1 });
  const z      = Math.min(availW / vp1.width, availH / vp1.height);
  setZoom(z);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setDocEnabled(on) {
  [dom.btnSaveAs, dom.btnPrev, dom.btnNext,
   dom.btnZoomOut, dom.btnZoomIn, dom.btnFit, dom.btnEdit
  ].forEach(b => b.disabled = !on);
  dom.btnSave.disabled = true;  // enabled only when modified
}

function updatePageInfo() {
  dom.pageInfo.textContent = state.currentPage + ' / ' + state.totalPages;
  dom.btnPrev.disabled = state.currentPage <= 1;
  dom.btnNext.disabled = state.currentPage >= state.totalPages;
}

function markModified() {
  state.modified = true;
  dom.btnSave.disabled   = false;
  dom.btnSaveAs.disabled = false;
  updateModBadge();
}

function updateModBadge() {
  dom.modBadge.classList.toggle('hidden', !state.modified);
  const prefix = state.modified ? '* ' : '';
  document.title = prefix + 'PDF Viewer — ' + (state.filename || '');
}

function setStatus(msg) { dom.statusMsg.textContent = msg; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

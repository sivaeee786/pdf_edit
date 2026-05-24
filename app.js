'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── ID generator ─────────────────────────────────────────────────────────
let _uid = 1;
const uid = () => 'a' + (_uid++);

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  pdfBytes:    null,
  pdfDoc:      null,
  filename:    null,
  currentPage: 1,
  totalPages:  0,
  zoom:        1.2,
  viewport:    null,
  modified:    false,

  // Tools
  tool: 'select',
  props: {
    strokeColor:  '#e05555',
    fillColor:    '#ffff00',
    filled:       false,
    lineWidth:    2,
    drawOpacity:  1.0,
    markColor:    '#ffff00',
    markOpacity:  0.5,
    fontSize:     14,
    fontFamily:   'sans-serif',
    bold:         false,
    italic:       false,
    textColor:    '#000000',
  },

  // Annotations (shapes, highlights, images, …)
  annotations: [],

  // Text-content edits (white-out + redrawn text on existing spans)
  textEdits: [],

  // Undo / redo
  history:      [],
  historyIndex: -1,

  // Live drawing
  isDrawing:   false,
  drawStart:   { x: 0, y: 0 },
  drawPoints:  [],

  // Pending placement (after choosing image / signature)
  pendingImage:     null,  // { dataUrl, nw, nh }
  pendingSignature: null,  // { dataUrl, w, h }

  thumbsVisible: false,
  thumbCache:    {},       // page → dataURL
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const dom = {
  fileInput:    $('fileInput'),
  imgInput:     $('imgInput'),
  btnOpen:      $('btnOpen'),
  btnSave:      $('btnSave'),
  btnSaveAs:    $('btnSaveAs'),
  btnUndo:      $('btnUndo'),
  btnRedo:      $('btnRedo'),
  btnPrev:      $('btnPrev'),
  btnNext:      $('btnNext'),
  btnZoomOut:   $('btnZoomOut'),
  btnZoomIn:    $('btnZoomIn'),
  btnFit:       $('btnFit'),
  btnThumbs:    $('btnThumbs'),
  pageInfo:     $('pageInfo'),
  zoomLabel:    $('zoomLabel'),
  docName:      $('docName'),
  propsBar:     $('propsBar'),
  dropZone:     $('dropZone'),
  viewer:       $('viewer'),
  pageScroll:   $('pageScroll'),
  pageWrapper:  $('pageWrapper'),
  pdfCanvas:    $('pdfCanvas'),
  annotCanvas:  $('annotCanvas'),
  drawCanvas:   $('drawCanvas'),
  textLayer:    $('textLayer'),
  thumbPanel:   $('thumbPanel'),
  thumbScroll:  $('thumbScroll'),
  statusMsg:    $('statusMsg'),
  modBadge:     $('modBadge'),
  pwOverlay:    $('pwOverlay'),
  pwInput:      $('pwInput'),
  pwOk:         $('pwOk'),
  pwCancel:     $('pwCancel'),
  pwErr:        $('pwErr'),
  sigOverlay:   $('sigOverlay'),
  sigCanvas:    $('sigCanvas'),
  tabDraw:      $('tabDraw'),
  tabType:      $('tabType'),
  sigDrawPanel: $('sigDrawPanel'),
  sigTypePanel: $('sigTypePanel'),
  sigTypeText:  $('sigTypeText'),
  sigTypePreview:$('sigTypePreview'),
  sigClear:     $('sigClear'),
  sigOk:        $('sigOk'),
  sigCancel:    $('sigCancel'),
};

// ── Font helpers ──────────────────────────────────────────────────────────
function parseFontStyle(fontName) {
  const n = (fontName || '').toLowerCase();
  const bold   = /bold|demi|semibold|black|heavy/.test(n);
  const italic = /italic|oblique|slanted/.test(n);
  const mono   = /mono|courier|consolas|typewriter/.test(n);
  const serif  = /times|georgia|palatino|garamond|minion|caslon|\bserif\b/.test(n);
  const family = mono ? 'monospace' : serif ? 'serif' : 'sans-serif';
  return { bold, italic, family };
}
function cssFontFamily(style) {
  const fam = typeof style === 'string' ? style : (style.family || 'sans-serif');
  if (fam === 'monospace') return '"Courier New", Courier, monospace';
  if (fam === 'serif')     return '"Times New Roman", Times, serif';
  return 'Arial, Helvetica, sans-serif';
}
function pickStandardFont(fontName, bold, italic, fontFamily) {
  const { StandardFonts } = PDFLib;
  const st  = parseFontStyle(fontName);
  const b   = bold       ?? st.bold;
  const i   = italic     ?? st.italic;
  const fam = fontFamily ?? st.family;
  if (fam === 'monospace') {
    if (b && i) return StandardFonts.CourierBoldOblique;
    if (b)      return StandardFonts.CourierBold;
    if (i)      return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (fam === 'serif') {
    if (b && i) return StandardFonts.TimesRomanBoldItalic;
    if (b)      return StandardFonts.TimesRomanBold;
    if (i)      return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (b && i) return StandardFonts.HelveticaBoldOblique;
  if (b)      return StandardFonts.HelveticaBold;
  if (i)      return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

// ── Colour helpers ────────────────────────────────────────────────────────
function hexToRgb01(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return { r, g, b };
}
function hexToCanvasColor(hex, alpha) {
  const { r, g, b } = hexToRgb01(hex);
  return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${alpha})`;
}

// ── Tool system ───────────────────────────────────────────────────────────
const DRAW_TOOLS     = new Set(['rect','ellipse','line','arrow','freehand','highlight','underline','strikethrough','whiteout']);
const PLACE_TOOLS    = new Set(['image','signature']);
const TEXT_TOOLS     = new Set(['text']);

function setTool(name) {
  state.tool = name;

  // Update button styles
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === name);
  });

  // Text layer pointer events — re-render layer when switching to/from text
  const wasText = dom.textLayer.classList.contains('text-active');
  const isText  = TEXT_TOOLS.has(name);
  dom.textLayer.classList.toggle('text-active', isText);
  if (isText !== wasText && state.pdfDoc) renderPage(state.currentPage);

  // Draw canvas pointer events + cursor
  const drawActive = DRAW_TOOLS.has(name) || PLACE_TOOLS.has(name);
  dom.drawCanvas.classList.toggle('drawing-active', drawActive);
  dom.drawCanvas.dataset.tool = name;

  // Props bar
  dom.propsBar.classList.remove('hidden');
  document.querySelectorAll('.props-group').forEach(g => g.style.display = 'none');

  if (TEXT_TOOLS.has(name)) {
    showPropsGroup('text');
  } else if (['highlight','underline','strikethrough'].includes(name)) {
    showPropsGroup('markup');
  } else if (DRAW_TOOLS.has(name) && !['highlight','underline','strikethrough','whiteout'].includes(name)) {
    showPropsGroup('draw');
  } else if (name === 'whiteout') {
    showPropsGroup('whiteout');
  } else if (PLACE_TOOLS.has(name)) {
    showPropsGroup('place');
  } else {
    dom.propsBar.classList.add('hidden');
  }

  setStatus(toolHint(name));
}

function showPropsGroup(key) {
  const g = dom.propsBar.querySelector(`[data-props="${key}"]`);
  if (g) g.style.display = 'flex';
}

function toolHint(name) {
  const hints = {
    select:        'Select tool — click annotations to select (move coming soon)',
    text:          'Text — click existing text to edit · click blank area to add text',
    highlight:     'Highlight — drag to highlight a region',
    underline:     'Underline — drag along a line of text',
    strikethrough: 'Strikethrough — drag along a line of text',
    freehand:      'Pen — click and drag to draw freehand',
    rect:          'Rectangle — drag to draw a rectangle',
    ellipse:       'Ellipse — drag to draw an ellipse',
    line:          'Line — drag to draw a line',
    arrow:         'Arrow — drag to draw an arrow',
    whiteout:      'Whiteout — drag to cover content with a white box',
    image:         'Image — click on the page to place the image',
    signature:     'Signature — click on the page to place your signature',
  };
  return hints[name] || '';
}

// ── Event wiring ──────────────────────────────────────────────────────────
dom.btnOpen.addEventListener('click', () => dom.fileInput.click());
dom.fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
  e.target.value = '';
});
dom.imgInput.addEventListener('change', e => {
  if (e.target.files[0]) loadImageFile(e.target.files[0]);
  e.target.value = '';
});

// Drag & drop on drop zone
dom.dropZone.addEventListener('dragover',  e => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
dom.dropZone.addEventListener('drop', e => {
  e.preventDefault(); dom.dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0]; if (f) handleFile(f);
});
dom.viewer.addEventListener('dragover', e => e.preventDefault());
dom.viewer.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0]; if (f) handleFile(f);
});

dom.btnSave.addEventListener('click',   () => savePdf(false));
dom.btnSaveAs.addEventListener('click', () => savePdf(true));
dom.btnUndo.addEventListener('click',   undo);
dom.btnRedo.addEventListener('click',   redo);
dom.btnPrev.addEventListener('click',   () => goToPage(state.currentPage - 1));
dom.btnNext.addEventListener('click',   () => goToPage(state.currentPage + 1));
dom.btnZoomOut.addEventListener('click',() => setZoom(state.zoom - 0.25));
dom.btnZoomIn.addEventListener('click', () => setZoom(state.zoom + 0.25));
dom.btnFit.addEventListener('click',    fitPage);
dom.btnThumbs.addEventListener('click', toggleThumbs);

// Tool buttons
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.pdfDoc && btn.dataset.tool !== 'select') return;
    if (btn.dataset.tool === 'image') {
      dom.imgInput.click();
    } else if (btn.dataset.tool === 'signature') {
      openSignatureModal();
    } else {
      setTool(btn.dataset.tool);
    }
  });
});

// Props bar controls
$('propFontFamily').addEventListener('change', e => { state.props.fontFamily = e.target.value; });
$('propFontSize').addEventListener('input', e => { state.props.fontSize = +e.target.value || 14; });
$('propBold').addEventListener('click', () => {
  state.props.bold = !state.props.bold;
  $('propBold').classList.toggle('on', state.props.bold);
});
$('propItalic').addEventListener('click', () => {
  state.props.italic = !state.props.italic;
  $('propItalic').classList.toggle('on', state.props.italic);
});
$('propTextColor').addEventListener('input', e => { state.props.textColor = e.target.value; });

$('propMarkColor').addEventListener('input', e => { state.props.markColor = e.target.value; });
$('propMarkOpacity').addEventListener('input', e => {
  state.props.markOpacity = +e.target.value / 100;
  $('propMarkOpacityVal').textContent = e.target.value;
});

$('propStrokeColor').addEventListener('input', e => { state.props.strokeColor = e.target.value; });
$('propFillColor').addEventListener('input', e => { state.props.fillColor = e.target.value; });
$('propFilled').addEventListener('change', e => { state.props.filled = e.target.checked; });
$('propLineWidth').addEventListener('input', e => {
  state.props.lineWidth = +e.target.value;
  $('propLineWidthVal').textContent = e.target.value;
});
$('propDrawOpacity').addEventListener('input', e => {
  state.props.drawOpacity = +e.target.value / 100;
  $('propDrawOpacityVal').textContent = e.target.value;
});

// Password modal
dom.pwOk.addEventListener('click', submitPassword);
dom.pwCancel.addEventListener('click', cancelPassword);
dom.pwInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  submitPassword();
  if (e.key === 'Escape') cancelPassword();
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'o') { e.preventDefault(); dom.fileInput.click(); }
    if (e.key === 's' && !e.shiftKey) { e.preventDefault(); savePdf(false); }
    if (e.key === 'S') { e.preventDefault(); savePdf(true); }
    if (e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(state.zoom + 0.25); }
    if (e.key === '-') { e.preventDefault(); setZoom(state.zoom - 0.25); }
    if (e.key === '0') { e.preventDefault(); fitPage(); }
  }
  if (!typing) {
    if (e.key === 'ArrowLeft')  goToPage(state.currentPage - 1);
    if (e.key === 'ArrowRight') goToPage(state.currentPage + 1);
    if (e.key === 'Escape') setTool('select');
    if (e.key === 't' || e.key === 'T') setTool('text');
  }
  if (e.key === 'Escape' && !typing) cancelDraw();
});

// ── File loading ──────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    setStatus('Please open a PDF file.'); return;
  }
  setStatus('Reading file…');
  const buf = await file.arrayBuffer();
  state.pdfBytes   = new Uint8Array(buf);
  state.filename   = file.name;
  state.textEdits  = [];
  state.annotations = [];
  state.history    = [];
  state.historyIndex = -1;
  state.modified   = false;
  state.thumbCache = {};
  await openPdf('');
}

async function openPdf(password) {
  setStatus('Loading PDF…');
  try {
    state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes, password }).promise;
  } catch (err) {
    if (err.name === 'PasswordException') { showPasswordModal(err.code === 2); return; }
    setStatus('Error: ' + err.message); return;
  }

  state.totalPages  = state.pdfDoc.numPages;
  state.currentPage = 1;

  dom.dropZone.classList.add('hidden');
  dom.viewer.classList.remove('hidden');
  setDocEnabled(true);
  updateModBadge();
  dom.docName.textContent = state.filename;
  document.title = 'PDF Editor — ' + state.filename;
  setStatus('Opened: ' + state.filename + '  (' + state.totalPages + ' pages)');

  setTool('select');
  pushHistory();   // baseline snapshot so first undo returns to clean state
  await renderPage(1);
  if (state.thumbsVisible) renderThumbs();
}

// ── Password modal ────────────────────────────────────────────────────────
function showPasswordModal(wrong) {
  dom.pwErr.classList.toggle('hidden', !wrong);
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

// ── Page Rendering ────────────────────────────────────────────────────────
async function renderPage(num) {
  if (!state.pdfDoc) return;
  num = clamp(num, 1, state.totalPages);
  state.currentPage = num;

  const page     = await state.pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: state.zoom });
  const dpr      = window.devicePixelRatio || 1;
  const canvas   = dom.pdfCanvas;
  const ctx      = canvas.getContext('2d');

  canvas.width  = Math.floor(viewport.width  * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width  = viewport.width  + 'px';
  canvas.style.height = viewport.height + 'px';
  ctx.scale(dpr, dpr);

  // Size all overlay canvases identically
  [dom.annotCanvas, dom.drawCanvas].forEach(c => {
    c.width  = canvas.width;
    c.height = canvas.height;
    c.style.width  = canvas.style.width;
    c.style.height = canvas.style.height;
  });

  await page.render({ canvasContext: ctx, viewport }).promise;

  state.viewport = viewport;

  // Annotations (includes text edits) drawn on annotCanvas above pdfCanvas
  renderAnnotations();

  // Build text layer
  const textContent = await page.getTextContent();
  buildTextLayer(textContent, viewport);

  updatePageInfo();
  setStatus('Page ' + num + ' / ' + state.totalPages + '  —  ' + Math.round(state.zoom * 100) + '%');
}

// ── Text-edit rendering (called inside renderAnnotations) ─────────────────
function paintTextEditOnCtx(ctx, vp, ed) {
  // Non-new edits (existing span edits) are handled visually by applyEditToSpan.
  // Only draw canvas text for genuinely new text blocks (no span to style).
  if (!ed.isNew) return;

  const s   = vp.scale;
  const x   = ed.pdfX * s;
  const yBL = vp.height - ed.pdfY * s;
  const fs  = ed.fontSize * s;

  const fStyle = parseFontStyle(ed.fontName);
  const bold   = ed.bold   != null ? ed.bold   : fStyle.bold;
  const italic = ed.italic != null ? ed.italic : fStyle.italic;
  const family = ed.fontFamily || fStyle.family;
  ctx.font = `${italic ? 'italic' : 'normal'} ${bold ? 'bold' : 'normal'} ${fs}px ${cssFontFamily(family)}`;

  const [cr, cg, cb] = (ed.color || '0,0,0').split(',').map(Number);
  ctx.globalAlpha  = 1;
  ctx.fillStyle    = `rgb(${cr},${cg},${cb})`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ed.newText, x, yBL);
}

// ── Annotation canvas rendering ───────────────────────────────────────────
// Draws text edits first (white erase + new text), then shape annotations.
// annotCanvas sits above pdfCanvas in the DOM, so white rects reliably
// cover the original PDF text rendered on pdfCanvas.
function renderAnnotations() {
  const canvas = dom.annotCanvas;
  const ctx    = canvas.getContext('2d');
  const vp     = state.viewport;
  if (!vp) return;

  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const ed of state.textEdits) {
    if (ed.page === state.currentPage) paintTextEditOnCtx(ctx, vp, ed);
  }

  for (const ann of state.annotations) {
    if (ann.page === state.currentPage) drawAnnotation(ctx, vp, ann);
  }
  ctx.restore();
}

function drawAnnotation(ctx, vp, ann) {
  const s = vp.scale;
  const h = vp.height;
  ctx.save();
  ctx.globalAlpha = ann.opacity ?? 1.0;

  // Convert PDF bottom-left coords → canvas top-left coords
  const cx  = ann.x  * s;
  const cy  = h - (ann.y + (ann.h || 0)) * s;
  const cw  = (ann.w || 0) * s;
  const ch  = (ann.h || 0) * s;

  switch (ann.type) {
    case 'highlight':
      ctx.fillStyle = ann.color;
      ctx.fillRect(cx, cy, cw, ch);
      break;

    case 'underline':
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = Math.max(1, (ann.lineWidth || 1) * s);
      ctx.beginPath();
      ctx.moveTo(cx,      cy + ch);
      ctx.lineTo(cx + cw, cy + ch);
      ctx.stroke();
      break;

    case 'strikethrough':
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = Math.max(1, (ann.lineWidth || 1) * s);
      ctx.beginPath();
      ctx.moveTo(cx,      cy + ch * 0.5);
      ctx.lineTo(cx + cw, cy + ch * 0.5);
      ctx.stroke();
      break;

    case 'whiteout':
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx, cy, cw, ch);
      break;

    case 'rect':
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = Math.max(1, ann.lineWidth * s);
      if (ann.filled) { ctx.fillStyle = ann.fillColor; ctx.fillRect(cx, cy, cw, ch); }
      ctx.strokeRect(cx, cy, cw, ch);
      break;

    case 'ellipse': {
      const rx = cw / 2, ry = ch / 2;
      ctx.beginPath();
      ctx.ellipse(cx + rx, cy + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      if (ann.filled) { ctx.fillStyle = ann.fillColor; ctx.fill(); }
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = Math.max(1, ann.lineWidth * s);
      ctx.stroke();
      break;
    }

    case 'line': {
      const lx1 = ann.x1 * s, ly1 = h - ann.y1 * s;
      const lx2 = ann.x2 * s, ly2 = h - ann.y2 * s;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = Math.max(1, ann.lineWidth * s);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(lx1, ly1); ctx.lineTo(lx2, ly2);
      ctx.stroke();
      break;
    }

    case 'arrow': {
      const ax1 = ann.x1 * s, ay1 = h - ann.y1 * s;
      const ax2 = ann.x2 * s, ay2 = h - ann.y2 * s;
      drawArrowCanvas(ctx, ax1, ay1, ax2, ay2, ann.color, Math.max(1, ann.lineWidth * s));
      break;
    }

    case 'freehand':
      if (ann.points && ann.points.length > 1) {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth   = Math.max(1, ann.lineWidth * s);
        ctx.lineJoin    = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ann.points[0][0] * s, h - ann.points[0][1] * s);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i][0] * s, h - ann.points[i][1] * s);
        }
        ctx.stroke();
      }
      break;

    case 'image':
    case 'signature': {
      if (ann._imgEl) {
        ctx.drawImage(ann._imgEl, cx, cy, cw, ch);
      } else if (ann.dataUrl) {
        const img = new Image();
        img.onload = () => { ann._imgEl = img; renderAnnotations(); };
        img.src = ann.dataUrl;
      }
      break;
    }

    case 'text-new': {
      ctx.fillStyle    = ann.color || '#000000';
      ctx.font         = `${ann.italic?'italic ':''} ${ann.bold?'bold ':''} ${ann.fontSize * s}px ${cssFontFamily(ann.fontFamily)}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ann.text, cx, h - ann.y * s);
      break;
    }
  }
  ctx.restore();
}

function drawArrowCanvas(ctx, x1, y1, x2, y2, color, lw) {
  const angle  = Math.atan2(y2 - y1, x2 - x1);
  const hLen   = Math.max(8, lw * 4);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth   = lw; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hLen * Math.cos(angle - 0.4), y2 - hLen * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - hLen * Math.cos(angle + 0.4), y2 - hLen * Math.sin(angle + 0.4));
  ctx.closePath(); ctx.fill();
}

// ── Draw canvas – interactive drawing ────────────────────────────────────
(function setupDrawCanvas() {
  const dc = dom.drawCanvas;

  dc.addEventListener('mousedown', e => {
    if (!state.pdfDoc) return;
    const pos = canvasPos(e);
    state.drawStart  = pos;
    state.drawPoints = [pos];
    state.isDrawing  = true;

    if (state.tool === 'image' && state.pendingImage) {
      finishPlace(pos); return;
    }
    if (state.tool === 'signature' && state.pendingSignature) {
      finishPlace(pos); return;
    }
  });

  dc.addEventListener('mousemove', e => {
    if (!state.isDrawing) return;
    const pos = canvasPos(e);
    if (state.tool === 'freehand') state.drawPoints.push(pos);
    drawPreview(pos);
  });

  dc.addEventListener('mouseup', e => {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    finishDraw(canvasPos(e));
  });

  dc.addEventListener('mouseleave', e => {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    finishDraw(canvasPos(e));
  });
})();

function canvasPos(e) {
  const r = dom.drawCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function screenToPdf(sx, sy) {
  const s = state.viewport.scale;
  return { px: sx / s, py: (state.viewport.height - sy) / s };
}

function drawPreview(pos) {
  const dc  = dom.drawCanvas;
  const ctx = dc.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, dc.width, dc.height);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const p  = state.props;
  const s0 = state.drawStart;
  const s  = state.viewport.scale;
  const h  = state.viewport.height;

  ctx.globalAlpha = p.drawOpacity;

  switch (state.tool) {
    case 'highlight': case 'underline': case 'strikethrough': {
      const x = Math.min(s0.x, pos.x), y = Math.min(s0.y, pos.y);
      const w = Math.abs(pos.x - s0.x), ht = Math.abs(pos.y - s0.y) || 16;
      ctx.fillStyle = hexToCanvasColor(p.markColor, p.markOpacity);
      ctx.fillRect(x, y, w, ht);
      break;
    }
    case 'whiteout': {
      const x = Math.min(s0.x, pos.x), y = Math.min(s0.y, pos.y);
      const w = Math.abs(pos.x - s0.x), ht = Math.abs(pos.y - s0.y);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
      ctx.fillRect(x, y, w, ht);
      ctx.strokeRect(x, y, w, ht);
      break;
    }
    case 'rect': {
      const x = Math.min(s0.x, pos.x), y = Math.min(s0.y, pos.y);
      const w = Math.abs(pos.x - s0.x), ht = Math.abs(pos.y - s0.y);
      if (p.filled) { ctx.fillStyle = hexToCanvasColor(p.fillColor, 1); ctx.fillRect(x,y,w,ht); }
      ctx.strokeStyle = p.strokeColor; ctx.lineWidth = p.lineWidth;
      ctx.strokeRect(x, y, w, ht);
      break;
    }
    case 'ellipse': {
      const cx = (s0.x + pos.x) / 2, cy = (s0.y + pos.y) / 2;
      const rx = Math.abs(pos.x - s0.x) / 2, ry = Math.abs(pos.y - s0.y) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (p.filled) { ctx.fillStyle = hexToCanvasColor(p.fillColor, 1); ctx.fill(); }
      ctx.strokeStyle = p.strokeColor; ctx.lineWidth = p.lineWidth; ctx.stroke();
      break;
    }
    case 'line':
      ctx.strokeStyle = p.strokeColor; ctx.lineWidth = p.lineWidth; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
      break;
    case 'arrow':
      drawArrowCanvas(ctx, s0.x, s0.y, pos.x, pos.y, p.strokeColor, p.lineWidth);
      break;
    case 'freehand':
      if (state.drawPoints.length > 1) {
        ctx.strokeStyle = p.strokeColor; ctx.lineWidth = p.lineWidth;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(state.drawPoints[0].x, state.drawPoints[0].y);
        for (let i = 1; i < state.drawPoints.length; i++)
          ctx.lineTo(state.drawPoints[i].x, state.drawPoints[i].y);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

function finishDraw(pos) {
  const dc  = dom.drawCanvas;
  const ctx = dc.getContext('2d');
  ctx.clearRect(0, 0, dc.width, dc.height);

  const p  = state.props;
  const s0 = state.drawStart;
  const vp = state.viewport;

  // Convert screen coordinates to PDF space
  const { px: x1, py: y1 } = screenToPdf(s0.x, s0.y);
  const { px: x2, py: y2 } = screenToPdf(pos.x, pos.y);

  const xMin = Math.min(x1, x2), yMin = Math.min(y1, y2);
  const xMax = Math.max(x1, x2), yMax = Math.max(y1, y2);
  const w    = xMax - xMin, h = yMax - yMin;

  // Discard tiny accidental clicks
  if (w < 2 && h < 2 && state.tool !== 'freehand') return;

  let ann = null;

  switch (state.tool) {
    case 'highlight':
      ann = { type:'highlight', x:xMin, y:yMin, w, h, color:p.markColor, opacity:p.markOpacity }; break;
    case 'underline':
      ann = { type:'underline', x:xMin, y:yMin, w, h, color:p.markColor, opacity:p.markOpacity, lineWidth: 1 }; break;
    case 'strikethrough':
      ann = { type:'strikethrough', x:xMin, y:yMin, w, h, color:p.markColor, opacity:p.markOpacity, lineWidth: 1 }; break;
    case 'whiteout':
      ann = { type:'whiteout', x:xMin, y:yMin, w, h }; break;
    case 'rect':
      ann = { type:'rect', x:xMin, y:yMin, w, h, color:p.strokeColor, fillColor:p.fillColor, filled:p.filled, lineWidth:p.lineWidth, opacity:p.drawOpacity }; break;
    case 'ellipse':
      ann = { type:'ellipse', x:xMin, y:yMin, w, h, color:p.strokeColor, fillColor:p.fillColor, filled:p.filled, lineWidth:p.lineWidth, opacity:p.drawOpacity }; break;
    case 'line':
      ann = { type:'line', x1, y1, x2, y2, color:p.strokeColor, lineWidth:p.lineWidth, opacity:p.drawOpacity }; break;
    case 'arrow':
      ann = { type:'arrow', x1, y1, x2, y2, color:p.strokeColor, lineWidth:p.lineWidth, opacity:p.drawOpacity }; break;
    case 'freehand': {
      const pts = state.drawPoints.map(pt => {
        const { px, py } = screenToPdf(pt.x, pt.y);
        return [px, py];
      });
      if (pts.length < 2) return;
      ann = { type:'freehand', points:pts, color:p.strokeColor, lineWidth:p.lineWidth, opacity:p.drawOpacity }; break;
    }
  }

  if (ann) {
    ann.id   = uid();
    ann.page = state.currentPage;
    pushHistory();
    state.annotations.push(ann);
    markModified();
    renderAnnotations();
  }
}

function cancelDraw() {
  state.isDrawing = false;
  const ctx = dom.drawCanvas.getContext('2d');
  ctx.clearRect(0, 0, dom.drawCanvas.width, dom.drawCanvas.height);
}

// ── Image & Signature placement ───────────────────────────────────────────
async function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      state.pendingImage = { dataUrl, nw: img.naturalWidth, nh: img.naturalHeight };
      setTool('image');
      $('placeHint').textContent = 'Click on the page to place the image (natural size).';
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function finishPlace(pos) {
  const vp = state.viewport;
  const { px, py } = screenToPdf(pos.x, pos.y);

  let ann = null;
  if (state.tool === 'image' && state.pendingImage) {
    const { dataUrl, nw, nh } = state.pendingImage;
    const w = nw / vp.scale;
    const h = nh / vp.scale;
    ann = { id:uid(), page:state.currentPage, type:'image', x:px, y:py - h, w, h, dataUrl, opacity:1, _imgEl:null };
    state.pendingImage = null;
  } else if (state.tool === 'signature' && state.pendingSignature) {
    const { dataUrl, w: sw, h: sh } = state.pendingSignature;
    const w = sw / vp.scale;
    const h = sh / vp.scale;
    ann = { id:uid(), page:state.currentPage, type:'signature', x:px, y:py - h, w, h, dataUrl, opacity:1, _imgEl:null };
    state.pendingSignature = null;
  }

  if (ann) {
    pushHistory();
    state.annotations.push(ann);
    markModified();
    renderAnnotations();
    setTool('select');
  }
}

// ── Text layer & text editing ─────────────────────────────────────────────
function buildTextLayer(textContent, viewport) {
  const tl    = dom.textLayer;
  const scale = viewport.scale;

  tl.innerHTML = '';
  tl.style.width  = viewport.width  + 'px';
  tl.style.height = viewport.height + 'px';
  tl.classList.toggle('text-active', state.tool === 'text');

  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform;
    const fsPdf = item.height || Math.hypot(c, d) || Math.hypot(a, b) || 12;
    const fsScr = fsPdf * scale;
    const left  = e * scale;
    const top   = viewport.height - (f + fsPdf) * scale;
    const w     = Math.max(item.width * scale, 4);

    const span = document.createElement('span');
    span.className   = 'text-item';
    span.textContent = item.str;

    span.dataset.pdfX     = e;
    span.dataset.pdfY     = f;
    span.dataset.pdfW     = item.width;
    span.dataset.fs       = fsPdf;
    span.dataset.fontName = item.fontName || '';
    const ic = item.color;
    span.dataset.color = (ic && ic.length >= 3) ? ic[0]+','+ic[1]+','+ic[2] : '0,0,0';

    const fStyle = parseFontStyle(item.fontName);
    span.style.cssText =
      'left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + fsScr + 'px;' +
      'font-size:' + fsScr + 'px;font-family:' + cssFontFamily(fStyle) + ';' +
      'font-weight:' + (fStyle.bold ? 'bold' : 'normal') + ';' +
      'font-style:' + (fStyle.italic ? 'italic' : 'normal') + ';';

    // Re-apply any existing text edit for this position
    const existingEdit = state.textEdits.find(ed =>
      ed.page === state.currentPage && !ed.isNew &&
      Math.abs(ed.pdfX - e) < 1 && Math.abs(ed.pdfY - f) < 1);
    if (existingEdit) applyEditToSpan(span, existingEdit);

    // Always register click handlers — pointer-events CSS controls when they fire
    span.title = 'Click to edit (select Text tool)';
    span.addEventListener('click', ev => {
      if (state.tool !== 'text') return;
      ev.stopPropagation();
      beginEditSpan(span, viewport);
    });
    tl.appendChild(span);
  }

  // Layer click for add-text — always wired, tool-gated inside
  tl.addEventListener('click', ev => {
    if (state.tool !== 'text') return;
    if (ev.target === tl) beginAddText(ev, viewport);
  });
}

function getLatestText(pdfX, pdfY, fallback) {
  const found = state.textEdits.find(e =>
    e.page === state.currentPage && Math.abs(e.pdfX - pdfX) < 1 && Math.abs(e.pdfY - pdfY) < 1);
  return found ? found.newText : fallback;
}

// Apply a committed text edit visually to the span itself.
// The span is already pixel-perfectly positioned over the original PDF text,
// so setting its background white + updating its text content covers the original
// without needing any canvas coordinate calculation.
function applyEditToSpan(span, edit) {
  if (!span) return;

  // Some PDFs report item.width=0 → span is only 4px wide.
  // In that case the white background won't cover the original text, so we
  // estimate a cover width from the stored original text length × font size.
  if (!edit.pdfW || edit.pdfW < 1) {
    const origLen = (edit.origText || edit.newText || '').length;
    const fsScr   = parseFloat(span.style.fontSize) || 12;
    const estW    = Math.max(origLen * fsScr * 0.62, 10);
    span.style.minWidth = estW + 'px';
  }

  span.style.backgroundColor = 'white';
  if (edit.newText) {
    span.textContent = edit.newText;
    const [cr, cg, cb] = (edit.color || '0,0,0').split(',').map(Number);
    span.style.color = `rgb(${cr},${cg},${cb})`;
    const fStyle = parseFontStyle(edit.fontName);
    span.style.fontWeight = (edit.bold   != null ? edit.bold   : fStyle.bold)   ? 'bold'   : 'normal';
    span.style.fontStyle  = (edit.italic != null ? edit.italic : fStyle.italic) ? 'italic' : 'normal';
    span.style.fontFamily = cssFontFamily(edit.fontFamily || fStyle.family);
  } else {
    span.textContent = '';
    span.style.color = 'transparent';
  }
}

// ── Colour helpers ────────────────────────────────────────────────────────
function rgbToComma(rgb) {
  const m = (rgb || '').match(/rgb\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return m ? `${m[1]},${m[2]},${m[3]}` : '0,0,0';
}
function commaToHex(comma) {
  const [r, g, b] = (comma || '0,0,0').split(',').map(Number);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// ── Click outside → commit (excluding toolbar clicks) ─────────────────────
document.addEventListener('mousedown', ev => {
  const div = dom.textLayer ? dom.textLayer.querySelector('.inline-edit') : null;
  const tb  = $('textToolbar');
  if (div && !div.contains(ev.target) && tb && !tb.contains(ev.target)) {
    commitInlineEdit(div);
  }
}, true);

// ── Inline edit: open on existing span ───────────────────────────────────
function beginEditSpan(span, viewport) {
  closeAnyEdit();

  const pdfX = parseFloat(span.dataset.pdfX);
  const pdfY = parseFloat(span.dataset.pdfY);
  const pdfW = parseFloat(span.dataset.pdfW);
  const fs   = parseFloat(span.dataset.fs);
  const fsScr = fs * viewport.scale;

  span.style.visibility = 'hidden';

  const fontName   = span.dataset.fontName || '';
  const colorComma = span.dataset.color    || '0,0,0';
  const fStyle     = parseFontStyle(fontName);
  const latestText = getLatestText(pdfX, pdfY, span.textContent);

  const [cr, cg, cb] = colorComma.split(',').map(Number);

  const div = document.createElement('div');
  div.className       = 'inline-edit';
  div.contentEditable = 'true';
  div.textContent     = latestText;
  div.style.cssText   =
    'left:'        + span.offsetLeft                        + 'px;' +
    'top:'         + span.offsetTop                         + 'px;' +
    'min-width:'   + Math.max(parseFloat(span.style.width), 40) + 'px;' +
    'font-size:'   + fsScr                                  + 'px;' +
    'font-family:' + cssFontFamily(fStyle)                  + ';' +
    'font-weight:' + (fStyle.bold   ? 'bold'   : 'normal') + ';' +
    'font-style:'  + (fStyle.italic ? 'italic' : 'normal') + ';' +
    'color:rgb('   + cr + ',' + cg + ',' + cb + ');';

  div._span      = span;
  div._pdfX      = pdfX;  div._pdfY = pdfY;  div._pdfW = pdfW;
  div._fs        = fs;    div._isNew = false; div._fontName = fontName;
  div._origColor = colorComma;
  div._origText  = latestText;

  dom.textLayer.appendChild(div);

  requestAnimationFrame(() => {
    div.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    showTextToolbar(div);
  });

  div.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { cancelInlineEdit(div); }
    // Shift+Enter = line break; plain Enter = commit
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitInlineEdit(div); }
  });
  div.addEventListener('input', () => repositionToolbar(div));
}

// ── Inline edit: add new text on blank area ───────────────────────────────
function beginAddText(ev, viewport) {
  closeAnyEdit();

  const rect  = dom.textLayer.getBoundingClientRect();
  const scrX  = ev.clientX - rect.left;
  const scrY  = ev.clientY - rect.top;
  const scale = viewport.scale;
  const fs    = state.props.fontSize;
  const fsScr = fs * scale;
  const pdfX  = scrX / scale;
  const pdfY  = (viewport.height - scrY) / scale;
  const fStyle = { family: state.props.fontFamily, bold: state.props.bold, italic: state.props.italic };
  const colorComma = hexToRgbStr(state.props.textColor);
  const [cr,cg,cb] = colorComma.split(',').map(Number);

  const div = document.createElement('div');
  div.className       = 'inline-edit';
  div.contentEditable = 'true';
  div.textContent     = '';
  div.style.cssText   =
    'left:'        + scrX                                   + 'px;' +
    'top:'         + (scrY - fsScr)                         + 'px;' +
    'min-width:120px;' +
    'font-size:'   + fsScr                                  + 'px;' +
    'font-family:' + cssFontFamily(fStyle)                  + ';' +
    'font-weight:' + (fStyle.bold   ? 'bold'   : 'normal') + ';' +
    'font-style:'  + (fStyle.italic ? 'italic' : 'normal') + ';' +
    'color:rgb('   + cr + ',' + cg + ',' + cb + ');';

  div._span     = null;
  div._pdfX     = pdfX;  div._pdfY = pdfY;  div._pdfW = 0;
  div._fs       = fs;    div._isNew = true;  div._fontName = '';
  div._origColor = colorComma;

  dom.textLayer.appendChild(div);
  requestAnimationFrame(() => { div.focus(); showTextToolbar(div); });

  div.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { cancelInlineEdit(div); }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitInlineEdit(div); }
  });
  div.addEventListener('input', () => repositionToolbar(div));
}

// ── Commit inline edit ────────────────────────────────────────────────────
function commitInlineEdit(div) {
  if (!div || !div.isConnected || div._committed) return;
  div._committed = true;

  const newText  = (div.textContent || '').trim();
  const span     = div._span;

  // Read final style from div
  const fsScr    = parseFloat(div.style.fontSize) || 12;
  const fontSize = fsScr / (state.viewport?.scale || 1);
  const bold     = div.style.fontWeight === 'bold' || parseInt(div.style.fontWeight) >= 600;
  const italic   = div.style.fontStyle  === 'italic';
  const family   = (div.style.fontFamily || '').includes('Times') ? 'serif'
                 : (div.style.fontFamily || '').includes('Courier') ? 'monospace' : 'sans-serif';
  const colorComma = rgbToComma(div.style.color) || div._origColor || '0,0,0';

  if (span) {
    const prevText = getLatestText(div._pdfX, div._pdfY, span.textContent);
    if (newText && newText !== prevText) {
      pushHistory();
      recordTextEdit(div._pdfX, div._pdfY, div._pdfW, div._fs, newText, false,
                     div._fontName, colorComma, bold, italic, family,
                     div._origText || prevText || '');
      applyEditToSpan(span, state.textEdits[state.textEdits.length - 1]);
    }
    span.style.visibility = '';
  } else if (div._isNew && newText) {
    pushHistory();
    recordTextEdit(div._pdfX, div._pdfY, 0, fontSize, newText, true,
                   '', colorComma, bold, italic, family);
    renderAnnotations();
  }

  div.remove();
  hideTextToolbar();
}

function cancelInlineEdit(div) {
  if (!div) return;
  if (div._span) div._span.style.visibility = '';
  div.remove();
  hideTextToolbar();
}

function closeAnyEdit() {
  const existing = dom.textLayer.querySelector('.inline-edit');
  if (existing) {
    commitInlineEdit(existing);
    if (existing.isConnected) existing.remove();
    dom.textLayer.querySelectorAll('.text-item').forEach(s => s.style.visibility = '');
  }
  hideTextToolbar();
}

function recordTextEdit(pdfX, pdfY, pdfW, fontSize, newText, isNew,
                        fontName = '', color = '0,0,0',
                        bold = null, italic = null, fontFamily = null, origText = '') {
  const i = state.textEdits.findIndex(e =>
    e.page === state.currentPage && Math.abs(e.pdfX - pdfX) < 1 && Math.abs(e.pdfY - pdfY) < 1);
  if (i >= 0) state.textEdits.splice(i, 1);
  state.textEdits.push({
    page: state.currentPage, pdfX, pdfY, pdfW, fontSize, newText, isNew,
    fontName, color, bold, italic, fontFamily, origText
  });
  markModified();
}

// ── Floating text toolbar ─────────────────────────────────────────────────
function showTextToolbar(div) {
  const tb = $('textToolbar');
  tb.classList.remove('hidden');
  syncToolbarToDiv(div);
  repositionToolbar(div);
}

function hideTextToolbar() {
  const tb = $('textToolbar');
  if (tb) tb.classList.add('hidden');
}

function repositionToolbar(div) {
  const tb  = $('textToolbar');
  if (!tb || tb.classList.contains('hidden')) return;
  const wr  = dom.pageWrapper.getBoundingClientRect();
  const x   = wr.left + div.offsetLeft;
  const y   = wr.top  + div.offsetTop;
  const dw  = Math.max(div.offsetWidth, 80);
  const tbW = tb.offsetWidth  || 320;
  const tbH = tb.offsetHeight || 44;
  let   left = x + dw / 2 - tbW / 2;
  let   top  = y - tbH - 10;
  // Clamp to viewport
  left = Math.max(8, Math.min(left, window.innerWidth  - tbW - 8));
  if (top < 8) top = y + (parseFloat(div.style.fontSize) || 14) + 10;
  tb.style.left = left + 'px';
  tb.style.top  = top  + 'px';
}

function syncToolbarToDiv(div) {
  const bold   = div.style.fontWeight === 'bold' || parseInt(div.style.fontWeight) >= 600;
  const italic = div.style.fontStyle === 'italic';
  $('ttBold').classList.toggle('on', bold);
  $('ttItalic').classList.toggle('on', italic);
  $('ttSize').value = parseInt(div.style.fontSize) || 12;
  // Font family selector
  const ff = (div.style.fontFamily || '').toLowerCase();
  $('ttFont').value = ff.includes('times') || ff.includes('serif') && !ff.includes('sans') ? 'serif'
                    : ff.includes('courier') || ff.includes('mono') ? 'monospace' : 'sans-serif';
  // Colour swatch
  const hex = rgbToHex(div.style.color);
  $('ttColor').value = hex;
  $('ttColorSwatch').style.background = hex;
}

function applyToolbarToDiv(div) {
  if (!div) return;
  const bold   = $('ttBold').classList.contains('on');
  const italic = $('ttItalic').classList.contains('on');
  const size   = Math.max(4, Math.min(200, parseInt($('ttSize').value) || 12));
  const family = $('ttFont').value;
  const color  = $('ttColor').value;
  div.style.fontWeight  = bold   ? 'bold'   : 'normal';
  div.style.fontStyle   = italic ? 'italic' : 'normal';
  div.style.fontSize    = (size * (state.viewport?.scale || 1)) + 'px';
  div.style.fontFamily  = cssFontFamily({ family });
  div.style.color       = color;
  $('ttColorSwatch').style.background = color;
  div.focus();
}

function rgbToHex(rgb) {
  const m = (rgb || '').match(/rgb\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return '#000000';
  return '#' + [m[1],m[2],m[3]].map(v => parseInt(v).toString(16).padStart(2,'0')).join('');
}

// ── Toolbar button wiring ─────────────────────────────────────────────────
(function wireTextToolbar() {
  function getDiv() { return dom.textLayer && dom.textLayer.querySelector('.inline-edit'); }

  $('ttBold').addEventListener('mousedown', e => {
    e.preventDefault();
    $('ttBold').classList.toggle('on');
    applyToolbarToDiv(getDiv());
  });
  $('ttItalic').addEventListener('mousedown', e => {
    e.preventDefault();
    $('ttItalic').classList.toggle('on');
    applyToolbarToDiv(getDiv());
  });
  $('ttSizeDown').addEventListener('mousedown', e => {
    e.preventDefault();
    $('ttSize').value = Math.max(4, parseInt($('ttSize').value) - 1);
    applyToolbarToDiv(getDiv());
  });
  $('ttSizeUp').addEventListener('mousedown', e => {
    e.preventDefault();
    $('ttSize').value = Math.min(200, parseInt($('ttSize').value) + 1);
    applyToolbarToDiv(getDiv());
  });
  $('ttSize').addEventListener('change', () => applyToolbarToDiv(getDiv()));
  $('ttFont').addEventListener('change', () => applyToolbarToDiv(getDiv()));
  $('ttColor').addEventListener('input', e => {
    const div = getDiv();
    if (div) { div.style.color = e.target.value; }
    $('ttColorSwatch').style.background = e.target.value;
  });
  $('ttColor').addEventListener('click', () => $('ttColor').click());
  // Open colour picker when clicking the label area
  document.querySelector('.tt-color-wrap').addEventListener('mousedown', e => {
    e.preventDefault();
    $('ttColor').click();
  });
  $('ttDelete').addEventListener('mousedown', e => {
    e.preventDefault();
    const div = getDiv();
    if (!div) return;
    if (div._span) {
      pushHistory();
      recordTextEdit(div._pdfX, div._pdfY, div._pdfW, div._fs, '', false,
                     div._fontName, div._origColor || '0,0,0', null, null, null,
                     div._origText || div._span.textContent || '');
      applyEditToSpan(div._span, state.textEdits[state.textEdits.length - 1]);
      div._span.style.visibility = '';
    }
    div.remove();
    hideTextToolbar();
  });
})();

// ── Undo / Redo ───────────────────────────────────────────────────────────
function pushHistory() {
  // Truncate future states
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push({
    annotations: JSON.parse(JSON.stringify(state.annotations.map(a => ({ ...a, _imgEl: undefined })))),
    textEdits:   JSON.parse(JSON.stringify(state.textEdits)),
  });
  state.historyIndex = state.history.length - 1;
  updateUndoRedo();
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  restoreHistory(state.history[state.historyIndex]);
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  restoreHistory(state.history[state.historyIndex]);
}

function restoreHistory(snap) {
  state.annotations = JSON.parse(JSON.stringify(snap.annotations));
  state.textEdits   = JSON.parse(JSON.stringify(snap.textEdits));
  markModified();
  renderPage(state.currentPage);
  updateUndoRedo();
}

function updateUndoRedo() {
  dom.btnUndo.disabled = state.historyIndex <= 0;
  dom.btnRedo.disabled = state.historyIndex >= state.history.length - 1;
}

// ── Signature Modal ───────────────────────────────────────────────────────
function openSignatureModal() {
  if (!state.pdfDoc) return;
  dom.sigOverlay.classList.remove('hidden');
  // Switch to draw tab by default
  activateSigTab('draw');
  // Clear canvas
  clearSigCanvas();
  setupSigCanvas();
}

let _sigDrawing = false;
function setupSigCanvas() {
  const sc  = dom.sigCanvas;
  const ctx = sc.getContext('2d');
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Remove old listeners by cloning
  const sc2 = sc.cloneNode(true);
  sc.parentNode.replaceChild(sc2, sc);
  dom.sigCanvas = sc2; // update ref (keep alias through sigOverlay query)

  sc2.addEventListener('mousedown', e => {
    _sigDrawing = true;
    const p = sigPos(e, sc2);
    const c = sc2.getContext('2d');
    c.beginPath(); c.moveTo(p.x, p.y);
  });
  sc2.addEventListener('mousemove', e => {
    if (!_sigDrawing) return;
    const p = sigPos(e, sc2);
    const c = sc2.getContext('2d');
    c.strokeStyle = '#1a1a2a'; c.lineWidth = 2.5;
    c.lineTo(p.x, p.y); c.stroke();
    c.beginPath(); c.moveTo(p.x, p.y);
  });
  sc2.addEventListener('mouseup',    () => { _sigDrawing = false; });
  sc2.addEventListener('mouseleave', () => { _sigDrawing = false; });

  // Touch support
  sc2.addEventListener('touchstart', e => {
    e.preventDefault(); _sigDrawing = true;
    const p = sigPos(e.touches[0], sc2);
    sc2.getContext('2d').beginPath(); sc2.getContext('2d').moveTo(p.x, p.y);
  }, { passive: false });
  sc2.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!_sigDrawing) return;
    const p = sigPos(e.touches[0], sc2);
    const c = sc2.getContext('2d');
    c.strokeStyle = '#1a1a2a'; c.lineWidth = 2.5;
    c.lineTo(p.x, p.y); c.stroke(); c.beginPath(); c.moveTo(p.x, p.y);
  }, { passive: false });
  sc2.addEventListener('touchend', () => { _sigDrawing = false; });
}

function sigPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / r.width;
  const scaleY = canvas.height / r.height;
  return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
}

function clearSigCanvas() {
  const sc = document.getElementById('sigCanvas');
  const c  = sc.getContext('2d');
  c.clearRect(0, 0, sc.width, sc.height);
}

function activateSigTab(tab) {
  const isDraw = tab === 'draw';
  dom.tabDraw.classList.toggle('active', isDraw);
  dom.tabType.classList.toggle('active', !isDraw);
  dom.sigDrawPanel.classList.toggle('hidden', !isDraw);
  dom.sigTypePanel.classList.toggle('hidden', isDraw);
}

dom.tabDraw.addEventListener('click', () => activateSigTab('draw'));
dom.tabType.addEventListener('click', () => activateSigTab('type'));
dom.sigClear.addEventListener('click', () => {
  clearSigCanvas();
  dom.sigTypeText.value = '';
  dom.sigTypePreview.textContent = '';
});
dom.sigCancel.addEventListener('click', () => {
  dom.sigOverlay.classList.add('hidden');
  state.pendingSignature = null;
});
dom.sigTypeText.addEventListener('input', () => {
  dom.sigTypePreview.textContent = dom.sigTypeText.value;
});
dom.sigOk.addEventListener('click', () => {
  const isDraw = dom.tabDraw.classList.contains('active');
  let dataUrl = null;
  let w, h;

  if (isDraw) {
    const sc = document.getElementById('sigCanvas');
    dataUrl = sc.toDataURL('image/png');
    w = sc.width; h = sc.height;
  } else {
    const text = dom.sigTypeText.value.trim();
    if (!text) return;
    // Render typed signature on transparent canvas
    const tc  = document.createElement('canvas');
    tc.width  = 560; tc.height = 120;
    const tc2 = tc.getContext('2d');
    tc2.fillStyle    = '#1a1a2a';
    tc2.font         = '70px "Brush Script MT", cursive, Georgia, serif';
    tc2.textBaseline = 'middle';
    tc2.fillText(text, 20, 60);
    dataUrl = tc.toDataURL('image/png');
    w = tc.width; h = tc.height;
  }

  if (!dataUrl) return;
  state.pendingSignature = { dataUrl, w, h };
  dom.sigOverlay.classList.add('hidden');
  setTool('signature');
  $('placeHint').textContent = 'Click on the page to place your signature.';
});

// ── Thumbnails ────────────────────────────────────────────────────────────
function toggleThumbs() {
  state.thumbsVisible = !state.thumbsVisible;
  dom.thumbPanel.classList.toggle('hidden', !state.thumbsVisible);
  dom.btnThumbs.classList.toggle('active', state.thumbsVisible);
  if (state.thumbsVisible) renderThumbs();
}

async function renderThumbs() {
  dom.thumbScroll.innerHTML = '';
  if (!state.pdfDoc) return;

  for (let p = 1; p <= state.totalPages; p++) {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (p === state.currentPage ? ' active' : '');
    item.dataset.page = p;

    const tc = document.createElement('canvas');
    const num = document.createElement('span');
    num.className = 'thumb-num'; num.textContent = p;

    item.append(tc, num);
    dom.thumbScroll.appendChild(item);

    item.addEventListener('click', () => goToPage(+item.dataset.page));

    // Render thumb asynchronously
    renderThumbCanvas(tc, p);
  }
}

async function renderThumbCanvas(canvas, pageNum) {
  if (state.thumbCache[pageNum]) {
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.style.width  = '120px';
      canvas.style.height = Math.round(img.height * 120 / img.width) + 'px';
      canvas.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = state.thumbCache[pageNum];
    return;
  }

  try {
    const page  = await state.pdfDoc.getPage(pageNum);
    const vp    = page.getViewport({ scale: 0.2 });
    canvas.width  = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width  = '120px';
    canvas.style.height = Math.round(vp.height * 120 / vp.width) + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    state.thumbCache[pageNum] = canvas.toDataURL();
  } catch (e) { /* ignore */ }
}

function updateThumbActive() {
  document.querySelectorAll('.thumb-item').forEach(item => {
    item.classList.toggle('active', +item.dataset.page === state.currentPage);
  });
}

// ── Save ──────────────────────────────────────────────────────────────────
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
    const { PDFDocument, rgb } = PDFLib;
    const doc   = await PDFDocument.load(state.pdfBytes);
    const pages = doc.getPages();

    // Font cache
    const fontCache = {};
    async function getFont(fn, bold, italic, fontFamily) {
      const k = pickStandardFont(fn, bold, italic, fontFamily);
      if (!fontCache[k]) fontCache[k] = await doc.embedFont(k);
      return fontCache[k];
    }

    // Apply text edits
    for (const ed of state.textEdits) {
      const page = pages[ed.page - 1]; if (!page) continue;
      const font = await getFont(ed.fontName, ed.bold, ed.italic, ed.fontFamily);
      if (!ed.isNew) {
        const origLen = (ed.origText || ed.newText || '').length;
        const eraseW  = ed.pdfW > 0 ? ed.pdfW + 6 : Math.max(ed.fontSize * origLen * 0.65, 10) + 6;
        page.drawRectangle({
          x: ed.pdfX - 2, y: ed.pdfY - ed.fontSize * 0.1,
          width: eraseW, height: ed.fontSize * 1.05,
          color: rgb(1,1,1), borderWidth: 0,
        });
      }
      const [cr,cg,cb] = (ed.color||'0,0,0').split(',').map(Number);
      page.drawText(ed.newText, { x:ed.pdfX, y:ed.pdfY, size:Math.max(ed.fontSize,4), font,
        color: rgb(cr/255, cg/255, cb/255) });
    }

    // Apply annotations
    for (const ann of state.annotations) {
      const page = pages[ann.page - 1]; if (!page) continue;
      const { height: pH } = page.getSize();

      const toC = hex => { const {r,g,b} = hexToRgb01(hex); return rgb(r,g,b); };
      const op  = ann.opacity ?? 1.0;

      switch (ann.type) {
        case 'highlight':
          page.drawRectangle({ x:ann.x, y:ann.y, width:ann.w, height:ann.h,
            color:toC(ann.color), opacity:op, borderWidth:0 }); break;
        case 'underline':
          page.drawLine({ start:{x:ann.x, y:ann.y}, end:{x:ann.x+ann.w, y:ann.y},
            thickness:ann.lineWidth||1, color:toC(ann.color), opacity:op }); break;
        case 'strikethrough':
          page.drawLine({ start:{x:ann.x, y:ann.y+ann.h*0.5}, end:{x:ann.x+ann.w, y:ann.y+ann.h*0.5},
            thickness:ann.lineWidth||1, color:toC(ann.color), opacity:op }); break;
        case 'whiteout':
          page.drawRectangle({ x:ann.x, y:ann.y, width:ann.w, height:ann.h,
            color:rgb(1,1,1), borderWidth:0 }); break;
        case 'rect':
          page.drawRectangle({ x:ann.x, y:ann.y, width:ann.w, height:ann.h,
            borderColor:toC(ann.color), borderWidth:ann.lineWidth||2,
            color:ann.filled ? toC(ann.fillColor) : undefined, opacity:op }); break;
        case 'ellipse':
          page.drawEllipse({ x:ann.x+ann.w/2, y:ann.y+ann.h/2,
            xScale:ann.w/2, yScale:ann.h/2,
            borderColor:toC(ann.color), borderWidth:ann.lineWidth||2,
            color:ann.filled ? toC(ann.fillColor) : undefined, opacity:op }); break;
        case 'line':
          page.drawLine({ start:{x:ann.x1, y:ann.y1}, end:{x:ann.x2, y:ann.y2},
            thickness:ann.lineWidth||2, color:toC(ann.color), opacity:op }); break;
        case 'arrow': {
          page.drawLine({ start:{x:ann.x1, y:ann.y1}, end:{x:ann.x2, y:ann.y2},
            thickness:ann.lineWidth||2, color:toC(ann.color), opacity:op });
          // Arrowhead as two lines (avoids SVG coordinate-system complexity)
          const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
          const hLen  = Math.max(8, (ann.lineWidth||2) * 4);
          page.drawLine({
            start: {x:ann.x2, y:ann.y2},
            end:   {x: ann.x2 - hLen*Math.cos(angle-0.4), y: ann.y2 - hLen*Math.sin(angle-0.4)},
            thickness:ann.lineWidth||2, color:toC(ann.color), opacity:op });
          page.drawLine({
            start: {x:ann.x2, y:ann.y2},
            end:   {x: ann.x2 - hLen*Math.cos(angle+0.4), y: ann.y2 - hLen*Math.sin(angle+0.4)},
            thickness:ann.lineWidth||2, color:toC(ann.color), opacity:op });
          break;
        }
        case 'freehand':
          if (ann.points && ann.points.length > 1) {
            for (let i = 1; i < ann.points.length; i++) {
              page.drawLine({
                start: {x:ann.points[i-1][0], y:ann.points[i-1][1]},
                end:   {x:ann.points[i][0],   y:ann.points[i][1]},
                thickness: ann.lineWidth||2, color:toC(ann.color), opacity:op,
              });
            }
          } break;
        case 'image': case 'signature':
          if (ann.dataUrl) {
            try {
              const isJpeg = ann.dataUrl.startsWith('data:image/jpeg');
              const bytes  = dataUrlToBytes(ann.dataUrl);
              const img    = isJpeg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
              page.drawImage(img, { x:ann.x, y:ann.y, width:ann.w, height:ann.h, opacity:op });
            } catch(e) { /* skip unembeddable */ }
          } break;
      }
    }

    const bytes = await doc.save();
    downloadBytes(bytes, filename);
    state.pdfBytes    = bytes;
    state.textEdits   = [];
    state.annotations = [];
    state.modified    = false;
    state.history     = [];
    state.historyIndex = -1;
    updateUndoRedo();
    updateModBadge();
    setStatus('Saved: ' + filename);
    document.title = 'PDF Editor — ' + (state.filename = filename);
  } catch (err) {
    setStatus('Save error: ' + err.message);
    console.error(err);
  }
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const raw    = atob(base64);
  const bytes  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type:'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ── Navigation ────────────────────────────────────────────────────────────
function goToPage(n) {
  if (!state.pdfDoc) return;
  n = clamp(n, 1, state.totalPages);
  if (n !== state.currentPage) {
    renderPage(n).then(() => { if (state.thumbsVisible) updateThumbActive(); });
  }
}

function setZoom(z) {
  if (!state.pdfDoc) return;
  state.zoom = clamp(Math.round(z * 100) / 100, 0.25, 4.0);
  dom.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  renderPage(state.currentPage);
}

async function fitPage() {
  if (!state.pdfDoc) return;
  const availW = dom.viewer.clientWidth  - 56;
  const availH = dom.viewer.clientHeight - 56;
  const page   = await state.pdfDoc.getPage(state.currentPage);
  const vp1    = page.getViewport({ scale: 1 });
  setZoom(Math.min(availW / vp1.width, availH / vp1.height));
}

// ── UI helpers ────────────────────────────────────────────────────────────
function setDocEnabled(on) {
  [dom.btnSaveAs, dom.btnPrev, dom.btnNext,
   dom.btnZoomOut, dom.btnZoomIn, dom.btnFit
  ].forEach(b => b.disabled = !on);
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
  document.title = (state.modified ? '* ' : '') + 'PDF Editor — ' + (state.filename || '');
}

function setStatus(msg) { dom.statusMsg.textContent = msg; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function hexToRgbStr(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return r + ',' + g + ',' + b;
}

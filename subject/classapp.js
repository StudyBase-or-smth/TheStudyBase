// ── Resolve subject from URL hash ──
let SUBJECT = null; // the matched entry from classesData
let ST = '';        // store key for topics
let SU = '';        // store key for units
let SP = '';        // localStorage key for pinned topics
let DEF_UNITS = []; // default units if none saved

function resolveSubject(){
  const id = window.location.hash.slice(1);
  if(!id || typeof classesData === 'undefined'){
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#c00">No subject specified. <a href="../index.html">Go back to index.</a></p>';
    return false;
  }
  SUBJECT = (classesData.subjects || []).find(s => s.id === id);
  if(!SUBJECT){
    document.body.innerHTML = `<p style="padding:40px;font-family:sans-serif;color:#c00">Unknown subject "${id}". <a href="../index.html">Go back to index.</a></p>`;
    return false;
  }
  ST = SUBJECT.storageKey || (id + '_topics');
  SU = SUBJECT.unitsKey   || (id + '_units');
  SP = SUBJECT.pinnedKey  || (id + '_pinned_topics');
  return true;
}

function applySubjectTheme(){
  const c = SUBJECT.colour;
  // Set on <body>, not <html> — see the comment in subjectapp.js's
  // applySubjectTheme() for why this specific element matters.
  document.body.style.setProperty('--accent', c);
  const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  document.body.style.setProperty('--ac-l', `rgba(${r},${g},${b},.07)`);
  document.body.style.setProperty('--ac-b', `rgba(${r},${g},${b},.22)`);

  document.getElementById('accentBar').style.background = c;
  document.getElementById('hdrEmoji').textContent = SUBJECT.emoji || '📚';
  document.getElementById('hdrSubjectName').textContent = SUBJECT.name;
  document.title = SUBJECT.name + ' — StudyBase';

  const fcBtn = document.getElementById('btnFlashcards');
  if(fcBtn) fcBtn.onclick = () => window.location.href = 'flashcards.html#' + SUBJECT.id;

  document.getElementById('welcomeEmoji').textContent = SUBJECT.emoji || '📚';
  document.getElementById('welcomeTitle').textContent = SUBJECT.name + ' notes';

  document.getElementById('stT').style.color = c;
  document.getElementById('stU').style.color = c;
}

// ── Dark mode ──
(function(){
  const on = localStorage.getItem('studybase_dark') === '1';
  if(on) document.body.classList.add('dark');
  const btn = document.getElementById('darkToggle');
  if(btn) btn.textContent = on ? '☀️' : '🌙';
})();
window.onDarkModeChange = function(){
  if(typeof desmosEditorCalc !== 'undefined' && desmosEditorCalc) desmosEditorCalc.updateSettings(desmosThemeOpts());
  if(typeof desmosViewCalc !== 'undefined' && desmosViewCalc) desmosViewCalc.updateSettings(desmosThemeOpts());
};

// ── Sidebar collapse (desktop) ──
// Shared with subject.html via the same localStorage key, so collapsing it
// on one page keeps it collapsed on the other.
const SIDEBAR_COLLAPSE_KEY = 'studybase_sidebar_collapsed';
function applySidebarCollapsed(){
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('sidebarCollapseBtn');
  if(sidebar) sidebar.classList.toggle('collapsed', collapsed);
  if(btn){
    btn.classList.toggle('collapsed', collapsed);
    btn.textContent = collapsed ? '›' : '‹';
    btn.setAttribute('data-tip', collapsed ? 'Show sidebar' : 'Hide sidebar');
  }
}
function toggleSidebarCollapsed(){
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '0' : '1');
  applySidebarCollapsed();
}
applySidebarCollapsed();

// ── Rich editor helpers ──
function getRichVal(id){ const el=document.getElementById(id); if(!el)return''; return el.contentEditable==='true'?el.innerHTML.trim():el.value.trim(); }
function setRichVal(id,html){ const el=document.getElementById(id); if(!el)return; if(el.contentEditable==='true'){el.innerHTML=html||'';}else{el.value=html||'';} }
function clearRich(id){ setRichVal(id,''); }
function isDangerousUrl(val){
  const s = String(val || '').replace(/[\s\0]/g, '').toLowerCase();
  return s.startsWith('javascript:') || s.startsWith('vbscript:') || s.startsWith('data:text/html');
}
function sanitizeRich(html){
  if(!html)return'';
  const d=document.createElement('div'); d.innerHTML=html;
  d.querySelectorAll('script,style,iframe,object,embed,link,form,meta,base').forEach(e=>e.remove());
  d.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(attr=>{
      const name = attr.name.toLowerCase();
      if(name.startsWith('on') || name === 'srcdoc'){
        el.removeAttribute(attr.name);
        return;
      }
      if(name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action' || name === 'formaction' || name === 'poster'){
        if(isDangerousUrl(attr.value)) el.removeAttribute(attr.name);
      }
    });
  });
  d.querySelectorAll('img').forEach(img=>{
    const src=img.getAttribute('src')||img.src||'';
    if(typeof isAllowedSyncMediaUrl === 'function' ? !isAllowedSyncMediaUrl(src) : (!src.startsWith('data:')&&!src.startsWith('https://drive.google.com/')&&!src.startsWith('https://lh3.googleusercontent.com/')))img.remove();
  });
  return d.innerHTML;
}

// ── Table topic type ──
// A topic's tableData is { columns: [headerText, ...], rows: [[cellHtml, ...], ...] }.
// Columns/rows are both dynamic (add/remove either), and each cell is a small
// rich editor (same contenteditable + image-insert pattern as Definition/
// Notes, just a compact "mini" toolbar so a wide table stays readable).
function newTableCellId(){ return 'tc_' + Date.now() + '_' + Math.floor(Math.random()*99999); }

function tableCellHtml(html){
  const id = newTableCellId();
  return `<td><div class="rich-editor-wrap table-cell-editor">
      <div class="rich-toolbar mini"><button type="button" class="rich-btn" onclick="richAddImage('${id}')" title="Insert image">🖼</button></div>
      <div class="rich-content" id="${id}" contenteditable="true" data-placeholder="…">${html||''}</div>
      <input type="file" id="img_${id}" accept="image/*" style="display:none">
    </div></td>`;
}

function buildTableEditor(data){
  const cols = (data && data.columns && data.columns.length) ? data.columns : ['Column 1','Column 2'];
  const rows = (data && data.rows && data.rows.length) ? data.rows : [cols.map(()=>'')];
  const headRow = document.getElementById('tableEditorHeadRow');
  const body = document.getElementById('tableEditorBody');
  if(!headRow || !body) return;
  headRow.innerHTML = cols.map(h =>
    `<th><input type="text" class="table-col-input" placeholder="Column…" value="${esc(h)}">
      <button type="button" class="btn-th-del" title="Remove column" onclick="removeTableColumn(this)">✕</button></th>`
  ).join('') + '<th class="table-head-spacer"></th>';
  body.innerHTML = rows.map(r =>
    '<tr>' + cols.map((c,i) => tableCellHtml(r[i]||'')).join('') +
    '<td class="table-row-del-cell"><button type="button" class="btn-kp-del" title="Remove row" onclick="removeTableRow(this)">✕</button></td></tr>'
  ).join('');
  document.querySelectorAll('#tableEditorBody .table-cell-editor').forEach(attachRichDnD);
}

function addTableColumn(){
  const headRow = document.getElementById('tableEditorHeadRow');
  if(!headRow) return;
  const spacer = headRow.querySelector('.table-head-spacer');
  const th = document.createElement('th');
  th.innerHTML = `<input type="text" class="table-col-input" placeholder="Column…" value="">
    <button type="button" class="btn-th-del" title="Remove column" onclick="removeTableColumn(this)">✕</button>`;
  headRow.insertBefore(th, spacer);
  document.querySelectorAll('#tableEditorBody tr').forEach(tr => {
    const delCell = tr.querySelector('.table-row-del-cell');
    const wrapper = document.createElement('tr'); wrapper.innerHTML = tableCellHtml('');
    const td = wrapper.firstElementChild;
    tr.insertBefore(td, delCell);
    attachRichDnD(td.querySelector('.table-cell-editor'));
  });
  th.querySelector('.table-col-input').focus();
}

function removeTableColumn(btn){
  const th = btn.closest('th');
  const headRow = th.parentElement;
  const dataCols = Array.from(headRow.children).filter(c => !c.classList.contains('table-head-spacer'));
  if(dataCols.length <= 1){ showToast('Table needs at least one column', 'info'); return; }
  const idx = Array.from(headRow.children).indexOf(th);
  th.remove();
  document.querySelectorAll('#tableEditorBody tr').forEach(tr => {
    const cell = tr.children[idx];
    if(cell) cell.remove();
  });
}

function addTableRow(){
  const headRow = document.getElementById('tableEditorHeadRow');
  const body = document.getElementById('tableEditorBody');
  if(!headRow || !body) return;
  const numCols = headRow.querySelectorAll('.table-col-input').length;
  const tr = document.createElement('tr');
  tr.innerHTML = Array.from({length:numCols}).map(()=>tableCellHtml('')).join('') +
    '<td class="table-row-del-cell"><button type="button" class="btn-kp-del" title="Remove row" onclick="removeTableRow(this)">✕</button></td>';
  body.appendChild(tr);
  tr.querySelectorAll('.table-cell-editor').forEach(attachRichDnD);
}

function removeTableRow(btn){
  const body = document.getElementById('tableEditorBody');
  if(body.querySelectorAll('tr').length <= 1){ showToast('Table needs at least one row', 'info'); return; }
  btn.closest('tr').remove();
}

function readTableData(){
  const headRow = document.getElementById('tableEditorHeadRow');
  const body = document.getElementById('tableEditorBody');
  if(!headRow || !body) return { columns: [], rows: [] };
  const columns = Array.from(headRow.querySelectorAll('.table-col-input')).map(i => i.value.trim());
  const rows = Array.from(body.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('.table-cell-editor .rich-content')).map(el => el.innerHTML.trim())
  );
  return { columns, rows };
}

function hasFieldContent(val){
  if(val == null) return false;
  const s = String(val)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return s.length > 0;
}
function hasTableData(td){
  return !!(td && td.columns && td.columns.length);
}

function tableViewHtml(t){
  const td = t.tableData;
  if(!hasTableData(td)) return '';
  const head = '<tr>' + td.columns.map(c => `<th>${esc(c)}</th>`).join('') + '</tr>';
  const body = (td.rows||[]).map(r =>
    '<tr>' + td.columns.map((c,i) => `<td>${sanitizeRich(r[i]||'')}</td>`).join('') + '</tr>'
  ).join('');
  return `<div class="data-table-wrap"><table class="data-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function pdfDocViewHtml(t){
  if(!t.pdfData) return '';
  const isImg = isPdfImageSrc(t.pdfData, t.pdfName);
  const name = esc(t.pdfName || (isImg ? 'image' : 'document.pdf'));
  const src = isImg ? t.pdfData : driveEmbedUrl(t.pdfData);
  // Images get auto-inverted in dark mode (see the global img filter rule in
  // mainstyle.css) so light-background diagrams don't glow — but that's not
  // always the right call (photos, already-dark images, etc.), so clicking
  // the image toggles it back to its normal colours and back again.
  const viewer = isImg
    ? `<div class="pdf-viewer-stage"><img class="pdf-viewer-img" id="pdfViewerFrame" src="${src}" alt="${name}" title="Click to toggle dark-mode inversion" onclick="toggleImgInvert(this)"></div>`
    : `<iframe class="pdf-viewer" id="pdfViewerFrame" src="${src}" title="${name}"></iframe>`;
  return `<div class="pdf-viewer-wrap">${viewer}
      <a class="pdf-open-link" href="${t.pdfData}" ${/^https?:/i.test(t.pdfData) ? 'target="_blank" rel="noopener"' : `download="${name}"`}>⬇ ${name}</a></div>`;
}

// Toggles an uploaded image between the dark-mode auto-inverted look and its
// normal colours. `.no-invert` is the escape hatch the global dark-mode img
// filter (mainstyle.css) already respects, so this just flips that class —
// inverted is the default whenever dark mode is on, same as before.
function toggleImgInvert(el){
  el.classList.toggle('no-invert');
}

// ── Desmos graphing (math layout only) ──
// The API key lives in ../sync-config.js (DESMOS_API_KEY), loaded before
// this file. If that constant is empty, loadDesmosScript() falls back to
// /api/desmosKey (Netlify env). Two independent live
// Desmos.GraphingCalculator instances can exist at once: desmosEditorCalc
// (the New/Edit topic modal) and desmosViewCalc (the detail panel). Both
// must be .destroy()ed before their container is removed — Desmos holds a
// WebGL context that isn't freed by discarding the DOM node.
const DESMOS_API_VERSION = 'v1.12';
let _desmosLoadPromise = null;
let desmosEditorCalc = null;
let desmosViewCalc = null;

// Desmos doesn't auto-detect page theme, so we hand it explicit colors that
// track StudyBase's dark-mode class and the active subject's accent color
// (these are still "Beta" options per Desmos's docs, but well-supported).
function desmosThemeOpts(){
  const dark = document.body.classList.contains('dark');
  const accent = (getComputedStyle(document.body).getPropertyValue('--accent') || '').trim();
  return dark
    ? { backgroundColor: '#252220', textColor: '#e8e3dc', accentColor: accent || '#7fb0e0' }
    : { backgroundColor: '#faf8f5', textColor: '#1c1917', accentColor: accent || '#2f72dc' };
}

function injectDesmosScript(apiKey){
  return new Promise(resolve => {
    if(!apiKey){ resolve(false); return; }
    if(window.Desmos){ resolve(true); return; }
    const s = document.createElement('script');
    s.src = `https://www.desmos.com/api/${DESMOS_API_VERSION}/calculator.js?apiKey=${encodeURIComponent(apiKey)}`;
    s.onload = () => resolve(!!window.Desmos);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function loadDesmosScript(){
  if(_desmosLoadPromise) return _desmosLoadPromise;
  const fromConfig = (typeof DESMOS_API_KEY === 'string' && DESMOS_API_KEY.trim()) ? DESMOS_API_KEY.trim() : '';
  _desmosLoadPromise = fromConfig
    ? injectDesmosScript(fromConfig)
    : fetch('/api/desmosKey')
        .then(res => res.ok ? res.json() : { apiKey: '' })
        .catch(() => ({ apiKey: '' }))
        .then(data => injectDesmosScript((data && data.apiKey) || ''));
  return _desmosLoadPromise;
}

async function mountDesmosEditor(state){
  const container = document.getElementById('desmosEditorCalc');
  const unavailable = document.getElementById('desmosEditorUnavailable');
  const loading = document.getElementById('desmosEditorLoading');
  if(!container) return;
  if(desmosEditorCalc){ desmosEditorCalc.destroy(); desmosEditorCalc = null; }
  // Skip the spinner once the Desmos script is already loaded (window.Desmos
  // set) — only the first mount per page actually has to wait on the network.
  const alreadyLoaded = !!window.Desmos;
  container.style.display = 'none';
  if(unavailable) unavailable.style.display = 'none';
  if(loading) loading.style.display = alreadyLoaded ? 'none' : '';
  const ok = await loadDesmosScript();
  if(document.getElementById('desmosEditorCalc') !== container) return; // modal closed/reopened while loading
  if(loading) loading.style.display = 'none';
  if(!ok){
    container.style.display = 'none';
    if(unavailable) unavailable.style.display = '';
    return;
  }
  container.style.display = '';
  if(unavailable) unavailable.style.display = 'none';
  desmosEditorCalc = Desmos.GraphingCalculator(container, desmosThemeOpts());
  if(state){ try{ desmosEditorCalc.setState(state); }catch(e){ desmosEditorCalc.setBlank(); } }
}

function readDesmosState(){
  return desmosEditorCalc ? desmosEditorCalc.getState() : null;
}

function destroyDesmosEditor(){
  if(desmosEditorCalc){ desmosEditorCalc.destroy(); desmosEditorCalc = null; }
}

async function mountDesmosView(t){
  const container = document.getElementById('desmosViewCalc');
  const empty = document.getElementById('desmosViewEmpty');
  const unavailable = document.getElementById('desmosViewUnavailable');
  const loading = document.getElementById('desmosViewLoading');
  if(!container) return; // not on a math-layout topic
  if(!t.desmosState){
    container.style.display = 'none';
    if(loading) loading.style.display = 'none';
    if(unavailable) unavailable.style.display = 'none';
    if(empty) empty.style.display = '';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(unavailable) unavailable.style.display = 'none';
  container.style.display = 'none';
  // Skip the spinner once the Desmos script is already loaded (window.Desmos
  // set) — only the first mount per page actually has to wait on the network.
  const alreadyLoaded = !!window.Desmos;
  if(loading) loading.style.display = alreadyLoaded ? 'none' : '';
  const ok = await loadDesmosScript();
  if(document.getElementById('desmosViewCalc') !== container) return; // navigated away while loading
  if(loading) loading.style.display = 'none';
  if(!ok){
    container.style.display = 'none';
    if(unavailable) unavailable.style.display = '';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(unavailable) unavailable.style.display = 'none';
  container.style.display = '';
  desmosViewCalc = Desmos.GraphingCalculator(container, Object.assign(
    { expressions: false, settingsMenu: false, keypad: false }, desmosThemeOpts()));
  desmosViewCalc.setState(t.desmosState);
}

function destroyDesmosView(){
  if(desmosViewCalc){ desmosViewCalc.destroy(); desmosViewCalc = null; }
}

// ── Storage helpers ──
const getTopics  = () => normalizeTopicList(sbMemGet(ST, []));
const getUnits   = () => {
  const n = normalizeUnits(sbMemGet(SU, null));
  return n.length ? n : normalizeUnits(DEF_UNITS);
};
const getPinned  = () => { try{ return JSON.parse(localStorage.getItem(SP)||'[]'); }catch(e){ return []; } };

const saveTopics = t => {
  const next = normalizeTopicList(t);
  const changed = changedTopicIds(getTopics(), next);
  sbMemSet(ST, next);
  const sd = serializeTopicList(sanitizeForSync(next));
  trackTopicPush(ST, changed, syncPush(ST, sd)).finally(refreshUnsyncedUI);
};
const saveUnits = u => {
  const items = normalizeUnits(u);
  sbMemSet(SU, items);
  syncPush(SU, serializeUnits(items));
};
const savePinned = p => {
  localStorage.setItem(SP, JSON.stringify(p));
};

// ── Layouts ──
const LAYOUTS = ['basic','overview','math','text','pdf','table'];
const LAYOUT_LABELS = { basic:'Basic', overview:'Overview', math:'Math', text:'Text', pdf:'PDF/Image', table:'Table' };
let currentLayout = 'basic';

// ── PDF/Image topic type ──
// Files go to the sync store (StudyBaseData on this laptop, Apps Script
// elsewhere) via `_up_` / `_ur_` keys. The topic only stores the returned
// URL plus the original filename — not a base64 blob.
const PDF_MAX_BYTES = 6 * 1024 * 1024;
let pendingPdfData = null;   // null = no change; '' = removed; string = Drive URL or legacy data URL
let pendingPdfName = null;
let pendingPdfUploading = false;

function isImageDataUrl(url){
  return !!url && /^data:image\//i.test(url);
}

function isPdfImageSrc(url, name){
  if(!url) return false;
  if(/^data:application\/pdf/i.test(url)) return false;
  if(isImageDataUrl(url)) return true;
  if(name && /\.pdf$/i.test(name)) return false;
  if(name && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)) return true;
  if(/\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(url)) return true;
  return /lh3\.googleusercontent\.com/i.test(url);
}

function driveEmbedUrl(url){
  if(!url || /^data:/i.test(url)) return url;
  const id = (url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
  return id ? ('https://drive.google.com/file/d/' + id + '/preview') : url;
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function compressImageFile(file){
  return fileToDataUrl(file).then(src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900; let w = img.width, h = img.height;
      if(w > MAX){ h = Math.round(h * MAX / w); w = MAX; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  }));
}

function uploadDataUrlToDrive(dataUrl, filename){
  return new Promise((resolve, reject) => {
    const uid = Date.now() + '' + Math.random().toString(36).slice(2, 6);
    const payload = { image: dataUrl, filename: filename || ('sb_' + uid) };
    const startPoll = () => {
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try{
          const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent('_ur_'+uid));
          if(res && res.data){
            clearInterval(poll);
            if(res.data.ok && res.data.url) resolve(res.data.url);
            else reject(new Error('Upload failed'));
          }
        } catch(e) {}
        if(tries >= 30){ clearInterval(poll); reject(new Error('Upload timed out')); }
      }, 1500);
    };
    Promise.resolve(syncPush('_up_' + uid, payload)).then(startPoll).catch(() => reject(new Error('Upload failed')));
  });
}

async function onPdfFileSelected(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
  if(!isPdf && !isImage){
    showToast('Please choose a PDF or image file', 'info'); return;
  }
  if(file.size > PDF_MAX_BYTES){
    showToast(`File is too large (${(file.size/1024/1024).toFixed(1)}MB) — max ${(PDF_MAX_BYTES/1024/1024).toFixed(0)}MB`, 'error');
    return;
  }
  pendingPdfUploading = true;
  pendingPdfName = file.name;
  renderPdfPreview();
  try{
    const dataUrl = isImage ? await compressImageFile(file) : await fileToDataUrl(file);
    const filename = isImage ? ('sb_' + Date.now() + '.jpg') : file.name;
    pendingPdfData = await uploadDataUrlToDrive(dataUrl, filename);
    pendingPdfName = file.name;
    showToast('Uploaded', 'success');
  } catch(e){
    showToast(e.message || 'Upload failed', 'error');
  }
  pendingPdfUploading = false;
  renderPdfPreview();
}

function removePdfFile(){
  pendingPdfData = '';
  pendingPdfName = '';
  pendingPdfUploading = false;
  renderPdfPreview();
}

function renderPdfPreview(){
  const area = document.getElementById('pdfPreviewArea');
  if(!area) return;
  if(pendingPdfUploading){
    area.innerHTML = `<div class="pdf-picked-row"><span class="pdf-picked-name">⏳ Uploading ${esc(pendingPdfName || 'file')}…</span></div>`;
    return;
  }
  const ex = editId ? (getTopics().find(t => t.id===editId)||{}) : {};
  const data = pendingPdfData !== null ? pendingPdfData : (ex.pdfData || '');
  const name = pendingPdfData !== null ? pendingPdfName : (ex.pdfName || '');
  const hasFile = !!data;
  const icon = isPdfImageSrc(data, name) ? '🖼' : '📄';
  area.innerHTML = hasFile
    ? `<div class="pdf-picked-row"><span class="pdf-picked-name">${icon} ${esc(name || (icon==='🖼' ? 'image' : 'document.pdf'))}</span>
        <button type="button" class="btn-small" onclick="document.getElementById('fPdfFile').click()">Replace</button>
        <button type="button" class="btn-small" onclick="removePdfFile()">Remove</button></div>`
    : `<button type="button" class="btn-small" onclick="document.getElementById('fPdfFile').click()">+ Choose PDF or Image</button>`;
}

function cycleLayout(dir){
  let idx = LAYOUTS.indexOf(currentLayout);
  idx = (idx + dir + LAYOUTS.length) % LAYOUTS.length;
  currentLayout = LAYOUTS[idx];
  applyLayoutUI();
}

function applyLayoutUI(){
  const nameEl = document.getElementById('layoutName');
  if(nameEl) nameEl.textContent = LAYOUT_LABELS[currentLayout] || 'Basic';
  document.querySelectorAll('[data-layout-group]').forEach(el => {
    const groups = el.dataset.layoutGroup.split(' ');
    el.style.display = groups.includes(currentLayout) ? '' : 'none';
  });
  const kpLabel = document.getElementById('kpFieldLabel');
  if(kpLabel) kpLabel.textContent = currentLayout === 'text' ? 'Points of Interest' : 'Key Points';
  const bodyLabel = document.getElementById('bodyTextLabel');
  const bodyEl = document.getElementById('fBodyText');
  if(bodyLabel && bodyEl){
    if(currentLayout === 'text'){ bodyLabel.textContent = 'Main Text'; bodyEl.style.minHeight = '260px'; }
    else { bodyLabel.textContent = 'Overview'; bodyEl.style.minHeight = '120px'; }
  }
}

// ── Teacher notes (per block) ──
// Notes live on the topic itself (`topic.notes`). Legacy tnotes_* buckets
// are still read on pull and absorbed into topics, then dropped.
function getTeacherNotes(){
  const fromTopics = {};
  getTopics().forEach(t => {
    if(t.notes && Object.keys(t.notes).length) fromTopics[t.id] = t.notes;
  });
  const legacyKey = 'tnotes_' + (SUBJECT ? SUBJECT.id : 'default');
  const legacy = sbMemGet(legacyKey, {});
  if(legacy && typeof legacy === 'object'){
    Object.keys(legacy).forEach(id => {
      if(!fromTopics[id]) fromTopics[id] = Array.isArray(legacy[id]) ? { general: legacy[id] } : legacy[id];
    });
  }
  return fromTopics;
}
const saveTeacherNotes = obj => {
  const next = getTopics().map(t => {
    const n = obj[t.id] || obj[String(t.id)];
    return Object.assign({}, t, { notes: n && typeof n === 'object' ? n : {} });
  });
  saveTopics(next);
};

function getTopicBlockNotes(topicId){
  const all = getTeacherNotes();
  let n = all[topicId] || all[String(topicId)];
  if(Array.isArray(n)) return { general: n };
  return n || {};
}
function getBlockNotes(topicId, block){
  return getTopicBlockNotes(topicId)[block] || [];
}
function saveBlockNote(topicId, block, text){
  const all = getTeacherNotes();
  if(Array.isArray(all[topicId])) all[topicId] = { general: all[topicId] };
  if(!all[topicId]) all[topicId] = {};
  if(!all[topicId][block]) all[topicId][block] = [];
  all[topicId][block].push({
    id: newNoteId(),
    text,
    author: window.teacherName || 'Teacher',
    uid: window.currentUid || '',
    date: new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})
  });
  saveTeacherNotes(all);
}
function deleteBlockNote(topicId, block, noteId){
  const all = getTeacherNotes();
  if(Array.isArray(all[topicId])) all[topicId] = { general: all[topicId] };
  if(all[topicId] && all[topicId][block]){
    all[topicId][block] = all[topicId][block].filter(n => n.id !== noteId);
    saveTeacherNotes(all);
  }
  viewTopic(topicId);
}

// ── Section rendering ──
function sectionHtml(topicId, icon, label, block, bodyHtml, headerExtra){
  return `<div class="section" data-block="${block}">
    <div class="section-header">
      <span class="sh-label-wrap"><span class="sh-icon">${icon}</span>${label}</span>
      ${headerExtra || ''}
    </div>
    <div class="section-body">${bodyHtml}</div>
  </div>`;
}

// ── Expand controls (fullscreen / ~80%-enlarge) for select detail sections ──
// Used by Desmos Graph, Main Text (text layout), and PDF/Image Document. The
// "enlarge" mode MOVES the actual content node into a shared overlay
// (rather than cloning it) so stateful content — the live Desmos
// calculator, the PDF iframe — isn't duplicated or reloaded; it's moved
// back to its original spot on close. Fullscreen uses the native
// Fullscreen API directly on the content node, which works regardless of
// where that node currently sits in the DOM.
function expandBtnsHtml(targetId, opts){
  opts = opts || {};
  let html = '<span class="sh-expand-btns">';
  if(opts.enlarge)    html += `<button type="button" class="sh-expand-btn" onclick="expandEnlarge('${targetId}')" title="Enlarge">⤢</button>`;
  if(opts.fullscreen) html += `<button type="button" class="sh-expand-btn" onclick="expandFullscreen('${targetId}')" title="Fullscreen">⛶</button>`;
  html += '</span>';
  return html;
}

function expandFullscreen(id){
  const el = document.getElementById(id);
  if(!el) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if(req) req.call(el);
}

let _enlargeOrigin = null; // { el, parent, next }
function expandEnlarge(id){
  const el = document.getElementById(id);
  const overlay = document.getElementById('enlargeOverlay');
  const slot = document.getElementById('enlargeSlot');
  if(!el || !overlay || !slot) return;
  closeEnlarge(); // in case something was already enlarged
  _enlargeOrigin = { el, parent: el.parentNode, next: el.nextSibling };
  slot.appendChild(el);
  el.classList.add('enlarged-active');
  overlay.classList.add('open');
  document.addEventListener('keydown', _enlargeEscHandler);
}
function _enlargeEscHandler(e){ if(e.key === 'Escape') closeEnlarge(); }
function closeEnlarge(){
  const overlay = document.getElementById('enlargeOverlay');
  if(overlay) overlay.classList.remove('open');
  document.removeEventListener('keydown', _enlargeEscHandler);
  if(_enlargeOrigin){
    const { el, parent, next } = _enlargeOrigin;
    el.classList.remove('enlarged-active');
    if(parent){
      if(next && next.parentNode === parent) parent.insertBefore(el, next);
      else parent.appendChild(el);
    }
    _enlargeOrigin = null;
  }
}

// ── Right-hand comments sidebar ──
function blockCommentHtml(topicId, block, label, icon){
  const notes = getBlockNotes(topicId, block);
  const hasNotes = notes.length > 0;
  if(!hasNotes && !window.isTeacher) return '';

  const notesHtml = notes.map(n => `
    <div class="blk-note">
      <div class="blk-note-meta">
        <span class="blk-note-author">🎓 ${esc(n.author)}</span>
        <span class="blk-note-date">${n.date}</span>
        ${window.isTeacher ? `<button class="blk-note-del" onclick="deleteBlockNote(${jsArg(topicId)},'${block}','${n.id}')" title="Delete">✕</button>` : ''}
      </div>
      <p class="blk-note-text">${esc(n.text)}</p>
    </div>`).join('');

  const iconAction = window.isTeacher
    ? `openCommentPopover(${jsArg(topicId)},'${block}','${esc(label).replace(/'/g,"\\'")}',this)`
    : `toggleBlockCard('${block}')`;

  const commentIcon = `
    <button class="blk-comment-btn${hasNotes?' has-notes':''}" onclick="${iconAction}"
      title="${window.isTeacher ? 'Add comment' : (hasNotes ? notes.length+' comment'+(notes.length>1?'s':'') : '')}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${hasNotes ? `<span class="blk-comment-count">${notes.length}</span>` : ''}
    </button>`;

  const isOpen = openCommentBlocks.has(block);

  const collapseArrow = hasNotes ? `
    <button class="blk-collapse-btn" id="blkArrow_${block}" onclick="toggleBlockCard('${block}')" title="Toggle">${isOpen ? '‹' : '›'}</button>` : '';

  const cardBody = hasNotes ? `
    <div class="blk-card-body" id="blkCard_${block}" style="display:${isOpen ? 'block' : 'none'}">
      <div class="blk-notes-list">${notesHtml}</div>
    </div>` : '';

  return `<div class="cs-item" id="blkCol_${block}">
    <div class="cs-item-head">
      ${commentIcon}
      ${collapseArrow}
    </div>
    ${cardBody}
  </div>`;
}

function toggleBlockCard(block){
  const card = document.getElementById(`blkCard_${block}`);
  const arrow = document.getElementById(`blkArrow_${block}`);
  if(!card) return;
  const isOpen = card.style.display !== 'none';
  if(isOpen) openCommentBlocks.delete(block); else openCommentBlocks.add(block);
  card.style.display = isOpen ? 'none' : 'block';
  if(arrow) arrow.textContent = isOpen ? '›' : '‹';
  if(_lastVisibleBlocks.length) requestAnimationFrame(() => alignCommentsSidebar(_lastVisibleBlocks));
}

// ── Floating comment popover (teacher only) ──
function ensureCommentPopover(){
  let pop = document.getElementById('commentPopover');
  if(pop) return pop;
  pop = document.createElement('div');
  pop.id = 'commentPopover';
  pop.className = 'comment-popover';
  pop.innerHTML = `
    <div class="comment-popover-title" id="popoverTitle"></div>
    <textarea class="blk-textarea" id="popoverTA" rows="4"></textarea>
    <div class="blk-form-btns">
      <button class="blk-cancel-btn" onclick="closeCommentPopover()">Cancel</button>
      <button class="blk-post-btn" onclick="postPopoverComment()">Post</button>
    </div>`;
  document.body.appendChild(pop);
  return pop;
}

function openCommentPopover(topicId, block, label, anchorEl){
  const pop = ensureCommentPopover();
  pop.dataset.topicId = topicId;
  pop.dataset.block = block;
  document.getElementById('popoverTitle').textContent = 'Comment on ' + label;
  const ta = document.getElementById('popoverTA');
  ta.value = '';
  const rect = anchorEl.getBoundingClientRect();
  const popWidth = Math.min(320, window.innerWidth - 32);
  // Prefer opening to the right of the comment icon; only fall back to the
  // left if there isn't enough room on the right of the viewport.
  let left = rect.right + 8;
  if(left + popWidth > window.innerWidth - 12) left = Math.max(12, rect.left - popWidth - 8);
  let top = Math.min(rect.top, window.innerHeight - 200);
  pop.style.width = popWidth + 'px';
  pop.style.left = left + 'px';
  pop.style.top = Math.max(12, top) + 'px';
  pop.classList.add('open');
  setTimeout(() => ta.focus(), 50);
  document.addEventListener('mousedown', _popoverOutsideHandler);
  document.addEventListener('keydown', _popoverEscHandler);
}

function closeCommentPopover(){
  const pop = document.getElementById('commentPopover');
  if(pop) pop.classList.remove('open');
  document.removeEventListener('mousedown', _popoverOutsideHandler);
  document.removeEventListener('keydown', _popoverEscHandler);
}

function _popoverOutsideHandler(e){
  const pop = document.getElementById('commentPopover');
  if(pop && pop.classList.contains('open') && !pop.contains(e.target) && !e.target.closest('.blk-comment-btn')){
    closeCommentPopover();
  }
}
function _popoverEscHandler(e){ if(e.key === 'Escape') closeCommentPopover(); }

function postPopoverComment(){
  const pop = document.getElementById('commentPopover');
  const ta = document.getElementById('popoverTA');
  if(!pop || !ta) return;
  const text = ta.value.trim();
  if(!text){ showToast('Write a comment first','info'); return; }
  const topicId = Number(pop.dataset.topicId);
  const block = pop.dataset.block;
  saveBlockNote(topicId, block, text);
  closeCommentPopover();
  openCommentBlocks.add(block);
  viewTopic(topicId);
  setTimeout(() => {
    if(_lastVisibleBlocks.length) alignCommentsSidebar(_lastVisibleBlocks);
  }, 60);
  showToast('Comment posted','success');
}

// ── Build & align the right-hand sidebar ──
let _lastVisibleBlocks = [];

function buildTeacherPanel(topicId, visibleBlocks){
  const panel = document.getElementById('teacherNotesPanel');
  if(!panel) return;
  _lastVisibleBlocks = visibleBlocks;
  const itemsHtml = visibleBlocks.map(b => blockCommentHtml(topicId, b.block, b.label, b.icon)).join('');
  if(!itemsHtml){
    panel.innerHTML = '';
    panel.style.display = 'none';
    panel.style.height = '';
    return;
  }
  panel.innerHTML = itemsHtml;
  panel.style.display = 'block';
  requestAnimationFrame(() => alignCommentsSidebar(visibleBlocks));
}

function alignCommentsSidebar(visibleBlocks){
  const panel = document.getElementById('teacherNotesPanel');
  const content = document.getElementById('detailContent');
  if(!panel || !content || panel.style.display === 'none') return;
  const contentRect = content.getBoundingClientRect();
  let maxBottom = 0;
  visibleBlocks.forEach(b => {
    const sectionEl = content.querySelector(`.section[data-block="${b.block}"]`);
    const item = panel.querySelector(`#blkCol_${b.block}`);
    if(!sectionEl || !item) return;
    const top = sectionEl.getBoundingClientRect().top - contentRect.top;
    item.style.top = top + 'px';
    maxBottom = Math.max(maxBottom, top + item.offsetHeight, top + sectionEl.offsetHeight);
  });
  panel.style.height = maxBottom + 'px';
}

let _alignResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_alignResizeTimer);
  _alignResizeTimer = setTimeout(() => {
    if(_lastVisibleBlocks.length) alignCommentsSidebar(_lastVisibleBlocks);
  }, 150);
});


// ── Pin / unpin a topic ──
function togglePinTopic(id){
  const sid = String(id);
  const pinned = getPinned().map(String);
  const idx = pinned.indexOf(sid);
  if(idx === -1){ pinned.push(sid); }
  else { pinned.splice(idx, 1); }
  savePinned(pinned);
  renderList();
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function jsArg(v){
  if(v == null) return 'null';
  return "'" + String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'") + "'";
}

function topicTitleHtml(name, id, bucket){
  if(typeof isTopicUnsynced === 'function' && isTopicUnsynced(bucket || ST, id)){
    return `<span class="unsynced-title" title="unable to connect to servers">${esc(name)}</span>`;
  }
  return esc(name);
}

function refreshUnsyncedUI(){
  renderList();
  const t = getTopics().find(x => x.id == activeId);
  const unsynced = !!(t && isTopicUnsynced(ST, t.id));
  const dh = document.querySelector('#detailContent .dh-name');
  const bc = document.getElementById('hdrTopicName');
  [dh, bc].forEach(el => {
    if(!el) return;
    el.classList.toggle('unsynced-title', unsynced);
    if(unsynced) el.title = 'unable to connect to servers';
    else el.removeAttribute('title');
  });
}

function getDescendantIds(id, topics){
  const sid = String(id);
  const direct = topics.filter(t => t.parentId != null && t.parentId !== '' && String(t.parentId) === sid).map(t => t.id);
  return direct.concat(direct.flatMap(cid => getDescendantIds(cid, topics)));
}

// ── State ──
let activeId = null, editId = null, activeUnits = new Set(), tempTags = [], pendingAction = null;
let _lastRenderedTopicKey = null;
let openCommentBlocks = new Set();
let expandedTopics = new Set();

// ── Sidebar list ──

function renderSubtree(c, topics){
  const kids = topics.filter(k => k.parentId === c.id);
  const hasKids = kids.length > 0;
  const isExpanded = hasKids && expandedTopics.has(c.id);
  const childrenHtml = isExpanded
    ? `<div class="subtopic-sidebar-list">` + kids.map(k => renderSubtree(k, topics)).join('') + `</div>`
    : '';
  return `
    <div class="tree-node">
      <div class="subtopic-sidebar-item${(activeId==c.id)?' active':''}" onclick="event.stopPropagation();viewTopic(${jsArg(c.id)})">
        ${hasKids
          ? `<button class="ti-expand-btn sub-expand" onclick="event.stopPropagation();toggleTopicExpand(${jsArg(c.id)})" title="${isExpanded?'Collapse':'Expand'}">${isExpanded?'▾':'▸'}</button>`
          : `<span class="ssi-dot"></span>`}
        <span class="ssi-label">${topicTitleHtml(c.name, c.id, ST)}</span>
      </div>
      ${childrenHtml}
    </div>`;
}

function renderList(){
  const q = document.getElementById('searchInput').value.toLowerCase();
  const topics = getTopics();
  const units = getUnits();
  const pinned = getPinned();
  const matches = t => {
    const mu = topicInActiveUnits(t, activeUnits, units);
    const uName = unitLabel(t.unit, units);
    const mq = !q || t.name.toLowerCase().includes(q) ||
      (t.definition||'').toLowerCase().includes(q) ||
      (t.unit||'').toLowerCase().includes(q) ||
      uName.toLowerCase().includes(q) ||
      (t.relatedTerms||[]).some(r => r.toLowerCase().includes(q));
    return mu && mq;
  };
  const topLevel = topics.filter(t => !t.parentId && matches(t)).sort((a,b) => {
    const ap = pinHas(pinned, a.id), bp = pinHas(pinned, b.id);
    if(ap && !bp) return -1;
    if(!ap && bp) return 1;
    return a.name.localeCompare(b.name);
  });

  document.getElementById('topicList').innerHTML = topLevel.length === 0
    ? `<div class="sidebar-empty">${q ? 'No results for "'+esc(q)+'"' : 'No topics yet.<br>Click <strong>+ New topic</strong> to begin.'}</div>`
    : topLevel.map(t => {
        const isPinned = pinHas(pinned, t.id);
        const children = topics.filter(c => String(c.parentId) === String(t.id));
        const hasSubs = children.length > 0;
        const isExpanded = hasSubs && expandedTopics.has(t.id);
        const subListHtml = isExpanded
          ? `<div class="subtopic-sidebar-list">` + children.map(c => renderSubtree(c, topics)).join('') + `</div>`
          : '';
        const uName = unitLabel(t.unit, units);
        return `
        <div class="topic-item-wrap">
          <div class="topic-item${(t.id==activeId)?' active':''}${isPinned?' pinned':''}" onclick="viewTopic(${jsArg(t.id)})">
            <div class="ti-top">
              <div class="ti-name">
                ${hasSubs ? `<button class="ti-expand-btn" onclick="event.stopPropagation();toggleTopicExpand(${jsArg(t.id)})" title="${isExpanded?'Collapse':'Expand'}">${isExpanded?'▾':'▸'}</button>` : ''}
                ${isPinned?'<span class="ti-pin-icon"></span>':''}${topicTitleHtml(t.name, t.id, ST)}
              </div>
              <button class="ti-pin-btn" onclick="event.stopPropagation();togglePinTopic(${jsArg(t.id)})" title="${isPinned?'Unpin':'Pin'}">${isPinned?'★':'☆'}</button>
            </div>
            ${uName ? `<div class="ti-unit">${esc(uName)}</div>` : ''}
            ${t.definition ? `<div class="ti-prev">${esc(t.definition.substring(0,55))}…</div>` : ''}
          </div>
          ${subListHtml}
        </div>`;
      }).join('');

  document.getElementById('stT').textContent = topics.length;
  document.getElementById('stU').textContent = getUnits().length;
  renderPills();
}

function renderPills(){
  const units = getUnits(), topics = getTopics();

  const body = document.getElementById('unitsListBody');
  if(body){
    const q = (document.getElementById('unitsSearchInput')?.value || '').toLowerCase();
    const shown = units.filter(u => !q || u.name.toLowerCase().includes(q));
    body.innerHTML = shown.length === 0
      ? `<div class="units-empty">No units match "${esc(q)}"</div>`
      : shown.map(u => `
        <label class="units-row" data-unit="${esc(u.id)}">
          <input type="checkbox" ${activeUnits.has(u.id)?'checked':''} onclick="event.stopPropagation();toggleUnit(this.closest('[data-unit]').dataset.unit)">
          <span>${esc(u.name)}</span>
          <span class="units-count">${unitTopicCount(topics, u)}</span>
          <button type="button" class="units-del" title="Remove this unit" onclick="event.stopPropagation();confirmDeleteUnit(this.closest('[data-unit]').dataset.unit)">🗑</button>
        </label>`).join('');
  }

  const toggleBtn = document.getElementById('unitsToggleBtn');
  const badge = document.getElementById('unitsBadge');
  if(badge){
    badge.textContent = activeUnits.size;
    badge.style.display = activeUnits.size ? '' : 'none';
  }
  if(toggleBtn) toggleBtn.classList.toggle('on', activeUnits.size > 0);
}

function toggleUnit(u){
  if(activeUnits.has(u)) activeUnits.delete(u);
  else activeUnits.add(u);
  renderList();
}

function toggleTopicExpand(id){
  id = String(id);
  if(expandedTopics.has(id)) expandedTopics.delete(id);
  else expandedTopics.add(id);
  renderList();
}

// ── Topic detail ──
function findTopicById(topics, id){
  return topics.find(x => x.id == id);
}

function getTopicAncestors(t, allTopics){
  const ancestors = [];
  let cur = t;
  while(cur && cur.parentId != null && cur.parentId !== ''){
    const p = findTopicById(allTopics, cur.parentId);
    if(!p) break;
    ancestors.unshift(p);
    cur = p;
  }
  return ancestors;
}

function updateTopicBreadcrumb(t, allTopics){
  const bcTopic = document.getElementById('hdrTopicName');
  const bcSep = document.getElementById('hdrTopicSep');
  const trail = document.getElementById('hdrTopicTrail');
  if(!bcTopic || !bcSep) return;

  const ancestors = getTopicAncestors(t, allTopics);
  bcTopic.textContent = t.name;
  const unsynced = isTopicUnsynced(ST, t.id);
  bcTopic.classList.toggle('unsynced-title', unsynced);
  if(unsynced) bcTopic.title = 'unable to connect to servers';
  else bcTopic.removeAttribute('title');
  bcTopic.style.display = '';
  bcSep.style.display = '';

  if(trail){
    if(ancestors.length){
      trail.style.display = 'inline-flex';
      trail.innerHTML = ancestors.map(a =>
        `<span class="bc-sep">›</span><a class="bc-link" href="javascript:void(0)" onclick="viewTopic(${jsArg(a.id)})">${esc(a.name)}</a>`
      ).join('');
    } else {
      trail.innerHTML = '';
      trail.style.display = 'none';
    }
  }
}

function clearTopicBreadcrumb(){
  const bcTopic = document.getElementById('hdrTopicName');
  const bcSep = document.getElementById('hdrTopicSep');
  const trail = document.getElementById('hdrTopicTrail');
  if(bcTopic && bcSep){
    bcTopic.textContent = '';
    bcTopic.classList.remove('unsynced-title');
    bcTopic.removeAttribute('title');
    bcTopic.style.display = 'none';
    bcSep.style.display = 'none';
  }
  if(trail){
    trail.innerHTML = '';
    trail.style.display = 'none';
  }
}

function qaRowsHtml(t){
  return (t.flashcardQA||[]).map(qa=>`
    <div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">${esc(qa.q)}</div>
        ${qa.a?`<div style="font-size:12px;color:var(--muted);font-style:italic">${esc(qa.a)}</div>`:'<div style="font-size:11px;color:var(--muted2);font-style:italic">No answer set</div>'}
      </div>
      <span style="font-size:10px;background:var(--ac-l);border:1px solid var(--ac-b);color:var(--accent);border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;flex-shrink:0">Flashcard</span>
    </div>`).join('');
}

function viewTopic(id){
  activeId = id;
  const t = getTopics().find(x => x.id == id);
  if(!t) return;
  const renderKey = String(id);
  const isTopicSwitch = renderKey !== _lastRenderedTopicKey;
  if(isTopicSwitch) openCommentBlocks = new Set();
  // Collapse everything except the path down to the newly selected topic
  const allTopics = getTopics();
  expandedTopics = new Set();
  let cur = t;
  while(cur && cur.parentId != null && cur.parentId !== ''){
    const parent = findTopicById(allTopics, cur.parentId);
    if(!parent) break;
    expandedTopics.add(parent.id);
    cur = parent;
  }
  if(allTopics.some(c => String(c.parentId) === String(t.id))) expandedTopics.add(String(id));
  if(location.protocol !== 'file:') history.replaceState(null,'', '#' + SUBJECT.id);
  renderList();

  document.getElementById('welcomeState').style.display = 'none';
  const outer = document.getElementById('detailOuter');
  const el    = document.getElementById('detailContent');
  if(isTopicSwitch) el.classList.remove('on');

  const layout = t.layout || 'basic';
  const children = allTopics.filter(c => c.parentId === t.id);

  const kpHtml = (t.keyPoints||[]).length
    ? `<ul class="key-points">${t.keyPoints.map(k=>`<li class="kp-item"><div class="kp-dot"></div><span>${esc(k)}</span></li>`).join('')}</ul>`
    : '';

  const relHtml = (t.relatedTerms||[]).length
    ? `<div class="related-tags">${t.relatedTerms.map(r => {
        const m = getTopics().find(x => x.name.toLowerCase()===r.toLowerCase());
        return `<span class="rtag"${m?` onclick="viewTopic(${jsArg(m.id)})"`:''}>${esc(r)}</span>`;
      }).join('')}</div>`
    : '';

  const subtopicsHtml = children.length
    ? `<div class="related-tags">${children.map(c => `<span class="rtag" onclick="viewTopic(${jsArg(c.id)})">${esc(c.name)}</span>`).join('')}</div>`
    : '';

  const created = new Date(t.createdAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const editedStr = t.updatedAt && t.updatedAt !== t.createdAt
    ? '<span class="dh-date">· Edited '+new Date(t.updatedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+'</span>' : '';

  // visibleBlocks tracks each section for sidebar alignment
  const visibleBlocks = [];
  const sec = (block, label, icon, bodyHtml, headerExtra) => {
    if(bodyHtml == null || bodyHtml === '') return '';
    visibleBlocks.push({ block, label, icon });
    return sectionHtml(t.id, icon, label, block, bodyHtml, headerExtra);
  };

  let bodyHtml = '';
  if(layout === 'overview'){
    if(hasFieldContent(t.bodyText)){
      bodyHtml += sec('bodyText', 'Overview', '📖',
        `<div class="plain-text">${sanitizeRich(t.bodyText)}</div>`);
    }
    const ovwItems = [];
    (t.keyPoints||[]).forEach(k => ovwItems.push(`<li class="ovw-list-item ovw-kp-item"><div class="kp-dot"></div><span>${esc(k)}</span></li>`));
    children.forEach(c => ovwItems.push(`<li class="ovw-list-item ovw-subtopic-item"><div class="kp-dot kp-dot-link"></div><a class="subtopic-link" href="javascript:void(0)" onclick="viewTopic(${jsArg(c.id)})">${esc(c.name)}</a><span class="ovw-subtopic-badge">subtopic →</span></li>`));
    if(ovwItems.length) bodyHtml += sec('overviewPoints', 'Points & Subtopics', '📋', `<ul class="ovw-list">${ovwItems.join('')}</ul>`);
  } else if(layout === 'math'){
    if(hasFieldContent(t.formula)){
      bodyHtml += sec('formula', 'Formula / Equation', '∑',
        `<div class="formula-box">${sanitizeRich(t.formula)}</div>`);
    }
    if((t.flashcardQA||[]).length){
      bodyHtml += sec('flashcardQA', 'Flashcard Questions', '🃏', qaRowsHtml(t));
    }
    if(t.desmosState){
      bodyHtml += sec('desmos', 'Desmos Graph', '📐', `<div class="desmos-view-wrap">
        <div class="desmos-view-calc" id="desmosViewCalc" style="display:none"></div>
        <div class="desmos-loading" id="desmosViewLoading" style="display:none;height:420px"><span class="desmos-spinner"></span>Loading graph…</div>
        <p class="desmos-unavailable" id="desmosViewUnavailable" style="display:none">Desmos graphing isn't configured yet — set DESMOS_API_KEY in sync-config.js.</p>
      </div>`, expandBtnsHtml('desmosViewCalc', {enlarge:true, fullscreen:true}));
    }
  } else if(layout === 'text'){
    if(hasFieldContent(t.bodyText)){
      bodyHtml += sec('bodyText', 'Main Text', '📄',
        `<div class="plain-text" id="mainTextView">${sanitizeRich(t.bodyText)}</div>`,
        expandBtnsHtml('mainTextView', {enlarge:true, fullscreen:true}));
    }
    if(kpHtml) bodyHtml += sec('keyPoints', 'Points of Interest', '✦', kpHtml);
  } else if(layout === 'pdf'){
    const pdfHtml = pdfDocViewHtml(t);
    if(pdfHtml){
      bodyHtml += sec('pdfDoc', 'PDF / Image Document', '📄', pdfHtml,
        expandBtnsHtml('pdfViewerFrame', {fullscreen:true}));
    }
  } else if(layout === 'table'){
    const tableHtml = tableViewHtml(t);
    if(tableHtml) bodyHtml += sec('tableData', 'Table', '▦', tableHtml);
  } else { // basic
    if(hasFieldContent(t.definition)){
      bodyHtml += sec('definition', 'Definition', '📝',
        `<p class="def-text">${esc(t.definition)}</p>`);
    }
    if(kpHtml) bodyHtml += sec('keyPoints', 'Key Points', '✦', kpHtml);
    if(hasFieldContent(t.formula))     bodyHtml += sec('formula',     'Formula / Equation', '∑',  `<div class="formula-box">${sanitizeRich(t.formula)}</div>`);
    if(hasFieldContent(t.materials))   bodyHtml += sec('materials',   'Extra Notes',        '📋', `<p class="plain-text">${sanitizeRich(t.materials)}</p>`);
    if(hasFieldContent(t.process))     bodyHtml += sec('process',     'Process / Method',   '⚙',  `<div class="formula-box">${sanitizeRich(t.process)}</div>`);
    if(hasFieldContent(t.safety))      bodyHtml += sec('safety',      'Safety / Warnings',  '⚠',  `<div class="warning-box">${sanitizeRich(t.safety)}</div>`);
    if(hasFieldContent(t.examTip))     bodyHtml += sec('examTip',     'Exam Tip',           '⚡', `<div class="exam-tip">${sanitizeRich(t.examTip)}</div>`);
    if((t.flashcardQA||[]).length)     bodyHtml += sec('flashcardQA', 'Flashcard Questions','🃏', qaRowsHtml(t));
  }

  if(subtopicsHtml) bodyHtml += sec('subtopics', 'Subtopics', '🧩', subtopicsHtml);
  if(relHtml)       bodyHtml += sec('relatedTerms', 'Related Terms', '🔗', relHtml);

  const uName = unitLabel(t.unit, getUnits());
  destroyDesmosView(); // the old container (if any) is about to be replaced below
  closeEnlarge(); // any enlarged content belongs to the topic being replaced
  el.innerHTML = `
      <div class="dh">
        <div>
          <div class="dh-name${isTopicUnsynced(ST, t.id) ? ' unsynced-title' : ''}"${isTopicUnsynced(ST, t.id) ? ' title="unable to connect to servers"' : ''}>${esc(t.name)}</div>
          <div class="dh-meta">
            ${uName ? `<span class="dh-unit">${esc(uName)}</span>` : ''}
            <span class="dh-date">Added ${created}</span>${editedStr}
          </div>
        </div>
        <div class="dh-actions">
          ${(window.isGuest || !window.isTeacher) ? '' : `<button class="btn-act" onclick="openModal(${jsArg(t.id)})">Edit</button>
          <button class="btn-act danger" onclick="confirmDeleteTopic(${jsArg(t.id)})">Delete</button>`}
        </div>
      </div>
      ${bodyHtml}`;

  outer.style.display = 'flex';
  el.style.display = 'block';
  if(isTopicSwitch){
    void el.offsetWidth;
    el.classList.add('on');
  }
  _lastRenderedTopicKey = renderKey;
  buildTeacherPanel(t.id, visibleBlocks);
  mountDesmosView(t);

  // Breadcrumb: Index / Class / [parent…] / Topic
  updateTopicBreadcrumb(t, allTopics);
}
function openModal(id){
  if(window.isGuest){ showToast('Sign in to add or edit topics','info'); return; }
  editId = id ? String(id) : null;
  tempTags = [];
  document.getElementById('kpList').innerHTML = '';
  document.getElementById('subtopicEditorList').innerHTML = '';
  document.getElementById('tagsWrap').querySelectorAll('.tag-chip').forEach(e => e.remove());
  populateSel();
  if(id){
    const t = getTopics().find(x => x.id == id);
    document.getElementById('modalTitle').textContent = 'Edit topic';
    document.getElementById('fName').value = t.name || '';
    const uHit = findUnit(getUnits(), t.unit);
    document.getElementById('fUnit').value = uHit ? uHit.id : (t.unit || '');
    document.getElementById('fDefinition').value = t.definition || '';
    setRichVal('fFormula', t.formula || '');
    setRichVal('fMaterials', t.materials || '');
    setRichVal('fProcess', t.process || '');
    setRichVal('fSafety', t.safety || '');
    setRichVal('fExamTip', t.examTip || '');
    setRichVal('fBodyText', t.bodyText || '');
    (t.keyPoints||[]).forEach(k => addKpRow(k));
    (t.relatedTerms||[]).forEach(addTag);
    getTopics().filter(c => c.parentId === t.id).forEach(c => addSubtopicRow(c));
    document.getElementById('fqaList').innerHTML = '';
    (t.flashcardQA||[]).forEach(qa => addFqaRow(qa.q, qa.a));
    buildTableEditor(t.tableData);
    mountDesmosEditor(t.desmosState || null);
    currentLayout = LAYOUTS.includes(t.layout) ? t.layout : 'basic';
    pendingPdfData = null; pendingPdfName = null; pendingPdfUploading = false;
  } else {
    document.getElementById('modalTitle').textContent = 'New topic';
    ['fName','fDefinition'].forEach(i => document.getElementById(i).value = '');
    ['fFormula','fMaterials','fProcess','fSafety','fExamTip','fBodyText'].forEach(clearRich);
    document.getElementById('fUnit').value = '';
    document.getElementById('fqaList').innerHTML = '';
    buildTableEditor(null);
    mountDesmosEditor(null);
    currentLayout = 'basic';
    pendingPdfData = null; pendingPdfName = null; pendingPdfUploading = false;
  }
  renderPdfPreview();
  applyLayoutUI();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 80);
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); editId = null; destroyDesmosEditor(); }

function populateSel(){
  const units = getUnits(), sel = document.getElementById('fUnit'), cur = sel.value;
  sel.innerHTML = '<option value="">— No unit —</option>' +
    units.map(u => `<option value="${esc(u.id)}"${(u.id===cur || u.name===cur)?' selected':''}>${esc(u.name)}</option>`).join('');
}
function showUnitInput(){ document.getElementById('unitInputRow').style.display='block'; document.getElementById('newUnitInput').value=''; document.getElementById('newUnitInput').focus(); document.getElementById('btnAddUnit').style.display='none'; }
function hideUnitInput(){ document.getElementById('unitInputRow').style.display='none'; document.getElementById('btnAddUnit').style.display=''; }
function confirmAddUnit(){
  const name = document.getElementById('newUnitInput').value.trim();
  if(!name) return;
  const units = getUnits();
  if(!units.some(u => u.name.toLowerCase() === name.toLowerCase())){
    units.push({ id: newUnitId(), name });
    saveUnits(units);
  }
  const u = findUnit(getUnits(), name);
  populateSel(); document.getElementById('fUnit').value = u ? u.id : ''; hideUnitInput(); renderPills();
}

function addKpRow(val){
  val = val || '';
  const uid = 'kpr_' + Date.now() + '_' + Math.floor(Math.random()*9999);
  const row = document.createElement('div'); row.className = 'kp-row'; row.id = uid;
  const inp = document.createElement('input'); inp.type='text'; inp.placeholder='Key point…'; inp.value=val;
  const btn = document.createElement('button'); btn.className='btn-kp-del'; btn.textContent='✕';
  btn.onclick = () => document.getElementById(uid).remove();
  row.appendChild(inp); row.appendChild(btn);
  document.getElementById('kpList').appendChild(row); inp.focus();
}

function addFqaRow(q, a){
  q = q || ''; a = a || '';
  const uid = 'fqa_' + Date.now() + '_' + Math.floor(Math.random()*9999);
  const row = document.createElement('div'); row.className = 'fqa-row'; row.id = uid;
  const top = document.createElement('div'); top.className = 'fqa-row-top';
  const inputs = document.createElement('div'); inputs.className = 'fqa-inputs';
  const qInp = document.createElement('input'); qInp.type='text'; qInp.className='fqa-input'; qInp.placeholder='Question — e.g. What is the formula for stress?'; qInp.value=q;
  const aInp = document.createElement('input'); aInp.type='text'; aInp.className='fqa-input answer'; aInp.placeholder='Answer — e.g. σ = F/A'; aInp.value=a;
  const del = document.createElement('button'); del.className='btn-fqa-del'; del.textContent='✕';
  del.onclick = () => document.getElementById(uid).remove();
  inputs.appendChild(qInp); inputs.appendChild(aInp);
  top.appendChild(inputs); top.appendChild(del);
  row.appendChild(top);
  document.getElementById('fqaList').appendChild(row); qInp.focus();
}

function addSubtopicRow(s){
  s = s || {};
  const uid = 'sub_' + Date.now() + '_' + Math.floor(Math.random()*9999);
  const row = document.createElement('div'); row.className = 'kp-row'; row.id = uid;
  row.dataset.childId = s.id || '';
  const inp = document.createElement('input'); inp.type='text'; inp.placeholder='Subtopic name — e.g. Density'; inp.value = s.name || '';
  inp.className = 'subtopic-name-i';
  const btn = document.createElement('button'); btn.className='btn-kp-del'; btn.title='Remove subtopic'; btn.textContent='✕';
  btn.onclick = () => document.getElementById(uid).remove();
  row.appendChild(inp); row.appendChild(btn);
  document.getElementById('subtopicEditorList').appendChild(row);
  if(!s.name) inp.focus();
}

function addTag(text){
  text = String(text).trim();
  if(!text || tempTags.includes(text)) return;
  tempTags.push(text);
  const wrap = document.getElementById('tagsWrap');
  const chip = document.createElement('span'); chip.className = 'tag-chip';
  const label = document.createTextNode(text+' ');
  const btn = document.createElement('button'); btn.textContent='✕';
  const captured = text;
  btn.onclick = () => removeTag(btn, captured);
  chip.appendChild(label); chip.appendChild(btn);
  wrap.insertBefore(chip, document.getElementById('tagsInput'));
}
function removeTag(btn, text){ tempTags = tempTags.filter(t => t !== text); btn.closest('.tag-chip').remove(); }

document.getElementById('tagsInput').addEventListener('keydown', e => {
  if(e.key==='Enter'||e.key===','){ e.preventDefault(); const v=e.target.value.replace(',','').trim(); if(v){ addTag(v); e.target.value=''; } }
  if(e.key==='Backspace'&&!e.target.value&&tempTags.length){
    const chips = document.getElementById('tagsWrap').querySelectorAll('.tag-chip');
    removeTag(chips[chips.length-1].querySelector('button'), tempTags[tempTags.length-1]);
  }
});

function saveTopic(){
  const name = document.getElementById('fName').value.trim();
  if(!name){ document.getElementById('fName').focus(); return; }
  const keyPoints = Array.from(document.getElementById('kpList').querySelectorAll('.kp-row input'))
    .map(i => i.value.trim()).filter(Boolean);
  const relatedTerms = [...tempTags];
  const ti = document.getElementById('tagsInput').value.trim(); if(ti) relatedTerms.push(ti);
  const flashcardQA = Array.from(document.getElementById('fqaList').querySelectorAll('.fqa-row')).map(row => {
    const inputs = row.querySelectorAll('.fqa-input');
    return { q: (inputs[0]?.value||'').trim(), a: (inputs[1]?.value||'').trim() };
  }).filter(qa => qa.q);
  const subtopicRows = Array.from(document.getElementById('subtopicEditorList').children).map(row => {
    const name = row.querySelector('.subtopic-name-i').value.trim();
    const childId = row.dataset.childId || null;
    return name ? { id: childId, name } : null;
  }).filter(Boolean);
  const ex = editId ? (getTopics().find(t => t.id===editId)||{}) : {};
  const newDesmosState = readDesmosState();
  const topic = {
    id: editId || newTopicId(),
    name,
    unit: document.getElementById('fUnit').value,
    definition: document.getElementById('fDefinition').value.trim(),
    keyPoints,
    formula:   getRichVal('fFormula'),
    materials: getRichVal('fMaterials'),
    process:   getRichVal('fProcess'),
    safety:    getRichVal('fSafety'),
    examTip:   getRichVal('fExamTip'),
    bodyText:  getRichVal('fBodyText'),
    pdfData:   pendingPdfData !== null ? pendingPdfData : (ex.pdfData || ''),
    pdfName:   pendingPdfData !== null ? pendingPdfName : (ex.pdfName || ''),
    tableData: readTableData(),
    // desmosEditorCalc may not have finished loading yet (async key fetch +
    // script load) if the user saves very quickly — in that case fall back
    // to whatever was already saved rather than wiping it out.
    desmosState: newDesmosState !== null ? newDesmosState : (ex.desmosState || null),
    layout:    currentLayout,
    relatedTerms,
    flashcardQA,
    parentId: ex.parentId || null,
    notes: ex.notes || {},
    addedBy: ex.addedBy || window.currentUid || null,
    createdAt: ex.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  let topics = getTopics();
  topics = editId ? topics.map(t => t.id===editId ? topic : t) : [...topics, topic];

  // Sync linked subtopics (child topics) against the rows in the editor
  const keptChildIds = new Set();
  subtopicRows.forEach(row => {
    if(row.id){
      // update existing child topic's name
      topics = topics.map(t => t.id===row.id ? { ...t, name: row.name, updatedAt: new Date().toISOString() } : t);
      keptChildIds.add(row.id);
    } else {
      // create a new linked child topic
      const childId = newTopicId();
      topics.push({
        id: childId,
        name: row.name,
        unit: topic.unit,
        layout: 'basic',
        parentId: topic.id,
        addedBy: window.currentUid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      keptChildIds.add(childId);
    }
  });
  // remove children that were deleted from the editor list (and any of their own descendants)
  const removedChildIds = topics.filter(t => t.parentId === topic.id && !keptChildIds.has(t.id)).map(t => t.id);
  const toRemove = new Set(removedChildIds.flatMap(cid => [cid, ...getDescendantIds(cid, topics)]));
  topics = topics.filter(t => !toRemove.has(t.id));

  saveTopics(topics); closeModal(); renderList(); viewTopic(topic.id);
}

// ── Delete confirm ──
function confirmDeleteTopic(id){
  const t = getTopics().find(x => x.id==id);
  pendingAction = { type:'topic', id };
  document.getElementById('cTitle').textContent = 'Delete this topic?';
  document.getElementById('cMsg').textContent = '"'+t.name+'" will be permanently removed.';
  document.getElementById('confirmOverlay').classList.add('open');
}
function confirmDeleteUnit(id){
  const u = findUnit(getUnits(), id);
  const name = u ? u.name : id;
  const uid = u ? u.id : id;
  const count = getTopics().filter(t => topicMatchesUnit(t, u || { id: uid, name })).length;
  pendingAction = { type:'unit', id: uid, name };
  document.getElementById('cTitle').textContent = 'Remove this unit?';
  document.getElementById('cMsg').textContent = '"'+name+'"'+(count?' — '+count+' topic(s) will become unassigned.':' will be removed.');
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm(){ document.getElementById('confirmOverlay').classList.remove('open'); pendingAction=null; }

// Fully resets the detail panel back to the "nothing selected" welcome
// state. Previously, deleting the open topic only unhid #welcomeState and
// stripped the .on animation class — #detailOuter (display:flex) and its
// stale innerHTML were left in place, so the deleted topic's content kept
// rendering underneath/alongside the welcome message (a "ghost" of the
// removed topic). Clearing everything here fixes that.
function closeTopicView(){
  activeId = null;
  _lastRenderedTopicKey = null;
  destroyDesmosView();
  closeEnlarge();
  document.getElementById('welcomeState').style.display = '';
  const outer = document.getElementById('detailOuter');
  const el = document.getElementById('detailContent');
  outer.style.display = 'none';
  el.classList.remove('on');
  el.innerHTML = '';
  const panel = document.getElementById('teacherNotesPanel');
  if(panel){ panel.innerHTML = ''; panel.style.display = 'none'; }

  // Breadcrumb: drop back to Index / Class
  clearTopicBreadcrumb();
}

function doDelete(){
  if(!pendingAction) return;
  if(pendingAction.type==='topic'){
    const topics = getTopics();
    const toRemove = new Set([pendingAction.id, ...getDescendantIds(pendingAction.id, topics)].map(String));
    saveTopics(topics.filter(t => !toRemove.has(String(t.id))));
    if(activeId==pendingAction.id) closeTopicView();
  } else {
    saveTopics(getTopics().map(t => (t.unit===pendingAction.id || t.unit===pendingAction.name) ? {...t,unit:''} : t));
    saveUnits(getUnits().filter(u => u.id !== pendingAction.id && u.name !== pendingAction.name));
    activeUnits.delete(pendingAction.id);
    activeUnits.delete(pendingAction.name);
    populateSel();
  }
  closeConfirm(); renderList();
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if(e.key==='Escape'){ closeModal(); closeConfirm(); }
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); document.getElementById('searchInput').focus(); }
});
document.getElementById('searchInput').addEventListener('input', renderList);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if(e.target===document.getElementById('modalOverlay')) closeModal();
});

// ── Units filter panel open/close ──
(function(){
  const btn = document.getElementById('unitsToggleBtn');
  const panel = document.getElementById('unitsPanel');
  if(!btn || !panel) return;
  btn.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });
})();

// ── Sync ──
// SYNC_URL is now defined once in ../sync-config.js (loaded via <script> before this file).

function setSyncStatus(s){
  const el = document.getElementById('syncStatus');
  if(!el) return;
  if(s==='syncing'){ el.textContent='↻ Syncing'; el.className='sync-chip'; }
  else if(s==='ok'){ el.textContent='✓ Synced'; el.className='sync-chip ok'; }
  else if(s==='warn'){ el.textContent='⚠ Too large'; el.className='sync-chip warn'; }
  else { el.textContent='○ Offline'; el.className='sync-chip err'; }
}

function jsonpGet(url){
  return new Promise((resolve, reject) => {
    const cb = '_cb'+Date.now()+'_'+Math.floor(Math.random()*99999);
    const script = document.createElement('script');
    const cleanup = () => { delete window[cb]; if(script.parentNode) script.parentNode.removeChild(script); };
    window[cb] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
    script.src = url + (url.includes('?')?'&':'?') + 'callback=' + cb;
    document.head.appendChild(script);
    setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 8000);
  });
}

let _pushGen = 0;
function syncPush(key, data){
  const gen = ++_pushGen;
  setSyncStatus('syncing');
  return sbPushToSync(key, data).then(() => {
    if(gen === _pushGen) setSyncStatus('ok');
  }).catch(err => {
    if(gen === _pushGen) setSyncStatus('err');
    throw err;
  });
}

let _nextSync = Date.now() + 60000;

async function syncPull(){
  setSyncStatus('syncing');
  const PLACEHOLDER = '[image — only visible on device where it was saved]';
  try{
    const flush = await flushUnsyncedTopics();
    if(flush.flushed) refreshUnsyncedUI();

    for(const key of [ST, SU]){
      const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(key));
      if(res && res.data !== null && res.data !== undefined){
        sbIngestKey(key, res.data, key===ST ? PLACEHOLDER : undefined);
      }
    }
    const notesKey = 'tnotes_' + (SUBJECT ? SUBJECT.id : 'default');
    try{
      const tnRes = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(notesKey));
      if(tnRes && tnRes.data != null){
        sbMemSet(notesKey, tnRes.data);
        const { topics, changed } = absorbLegacyNotes(getTopics(), tnRes.data);
        if(changed) saveTopics(topics);
      }
    } catch(e){}
    if(activeId) viewTopic(activeId);
    setSyncStatus(unsyncedTopicBuckets().length ? 'err' : 'ok');
    refreshUnsyncedUI();
  } catch(e){ setSyncStatus('err'); }
  _nextSync = Date.now() + 60000;
}

function sanitizeForSync(topics){
  return topics.map(t => {
    const c = {...t};
    Object.keys(c).forEach(k => {
      if(typeof c[k]==='string' && c[k].includes('data:image')){
        const d = document.createElement('div'); d.innerHTML = c[k];
        d.querySelectorAll('img').forEach(img => {
          if((img.src||'').startsWith('data:')){
            const note = document.createElement('em');
            note.textContent = '[image — only visible on device where it was saved]';
            img.replaceWith(note);
          }
        });
        c[k] = d.innerHTML;
      }
    });
    return c;
  });
}

// ── Image upload ──
function pollUploadResult(uid, ph) {
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    try {
      const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent('_ur_'+uid));
      if(res && res.data){ clearInterval(poll);
        const img = document.createElement('img');
        img.src = res.data.ok && res.data.url ? res.data.url : ph._b64;
        ph.replaceWith(img);
      }
    } catch(e) {}
    if(tries >= 30){ clearInterval(poll); const img = document.createElement('img'); img.src = ph._b64; ph.replaceWith(img); }
  }, 1500);
}

function compressAndInsert(editor, file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900; let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const b64 = cv.toDataURL('image/jpeg', 0.82);
      const ph = document.createElement('span');
      ph.textContent = '⏳ Uploading…';
      ph.style.cssText = 'color:var(--muted);font-size:12px;font-style:italic;display:block';
      ph._b64 = b64;
      editor.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const rng = sel.getRangeAt(0); rng.deleteContents(); rng.insertNode(ph);
        rng.setStartAfter(ph); rng.collapse(true); sel.removeAllRanges(); sel.addRange(rng);
      } else { editor.appendChild(ph); }
      const uid = Date.now() + '' + Math.random().toString(36).slice(2, 6);
      const fallback = () => { const img = document.createElement('img'); img.src = ph._b64; ph.replaceWith(img); };
      Promise.resolve(syncPush('_up_' + uid, { image: b64, filename: 'sb_' + uid + '.jpg' }))
        .then(() => pollUploadResult(uid, ph))
        .catch(fallback);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function richAddImage(id){
  const inp=document.getElementById('img_'+id); if(!inp)return;
  inp.onchange=function(){ if(this.files[0]){ compressAndInsert(document.getElementById(id),this.files[0]); this.value=''; } };
  inp.click();
}

// ── Symbol picker (Formula/Equation field) ──
// The formula field is plain contenteditable text, not LaTeX-aware like the
// Desmos box, so this just inserts the literal Unicode character at the
// cursor. Every symbol button uses onmousedown="event.preventDefault()" so
// the browser never shifts focus/selection away from the formula field —
// the click still fires and inserts at wherever the cursor already was.
const SYMBOL_GROUPS = [
  { label: 'Greek',             syms: ['π','θ','α','β','γ','Δ','Σ','μ','λ','φ'] },
  { label: 'Operators',         syms: ['±','×','÷','≤','≥','≠','≈','·','°','∝'] },
  { label: 'Powers & Roots',    syms: ['√','∛','²','³','ⁿ','½','⅓','¼'] },
  { label: 'Calculus & Sets',   syms: ['∞','∫','∂','∇','∈','∉','⊂','∅','∀','∃'] },
  { label: 'Arrows',            syms: ['→','←','↔','⇒','⇔'] },
];

function symbolPickerPanelHtml(targetId){
  return SYMBOL_GROUPS.map(g => `<div class="sym-group"><span class="sym-group-label">${esc(g.label)}</span><div class="sym-row">${
    g.syms.map(s => `<button type="button" class="sym-btn" onmousedown="event.preventDefault()" onclick="insertSymbol('${targetId}','${s}')">${s}</button>`).join('')
  }</div></div>`).join('');
}

function initSymbolPickers(){
  document.querySelectorAll('.symbol-picker-panel').forEach(panel => {
    if(panel.dataset.target) panel.innerHTML = symbolPickerPanelHtml(panel.dataset.target);
  });
}

function toggleSymbolPicker(btn){
  const panel = btn.parentNode.querySelector('.symbol-picker-panel');
  if(!panel) return;
  const isOpen = panel.classList.contains('open');
  closeSymbolPickers();
  if(!isOpen) panel.classList.add('open');
}

function closeSymbolPickers(){
  document.querySelectorAll('.symbol-picker-panel.open').forEach(p => p.classList.remove('open'));
}

document.addEventListener('mousedown', e => {
  if(!e.target.closest('.symbol-picker-wrap')) closeSymbolPickers();
});

function insertSymbol(id, sym){
  const editor = document.getElementById(id);
  if(!editor) return;
  editor.focus();
  const sel = window.getSelection();
  if(sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)){
    const rng = sel.getRangeAt(0);
    rng.deleteContents();
    const node = document.createTextNode(sym);
    rng.insertNode(node);
    rng.setStartAfter(node); rng.collapse(true);
    sel.removeAllRanges(); sel.addRange(rng);
  } else {
    editor.appendChild(document.createTextNode(sym));
  }
}

function attachRichDnD(wrap){
  const editor=wrap.querySelector('.rich-content');
  wrap.addEventListener('dragover',e=>{e.preventDefault();wrap.classList.add('drag-over');});
  wrap.addEventListener('dragleave',e=>{if(!wrap.contains(e.relatedTarget))wrap.classList.remove('drag-over');});
  wrap.addEventListener('drop',e=>{
    e.preventDefault();wrap.classList.remove('drag-over');
    const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
    if(files.length){files.forEach(f=>compressAndInsert(editor,f));}
  });
}
function setupRichDnD(){
  document.querySelectorAll('.rich-editor-wrap').forEach(attachRichDnD);
}

// ── Sync countdown ──
function startCountdown(){
  const el=document.getElementById('syncCountdown');
  if(!el)return;
  setInterval(()=>{
    const secs=Math.max(0,Math.round((_nextSync-Date.now())/1000));
    el.textContent=secs>0?secs+'s':'';
  },1000);
}

// ── Deep-link from index.html's "Units Overview" list: ?unit=<name> opens
// the Units filter panel with that unit already selected (checked), so the
// topic list is filtered to it immediately.
function applyUnitLinkFromUrl(){
  const unit = new URLSearchParams(window.location.search).get('unit');
  if(!unit) return;
  const panel = document.getElementById('unitsPanel');
  const btn = document.getElementById('unitsToggleBtn');
  const input = document.getElementById('unitsSearchInput');
  if(panel) panel.classList.add('open');
  if(btn) btn.setAttribute('aria-expanded', 'true');
  const u = findUnit(getUnits(), unit);
  if(input) input.value = u ? u.name : unit;
  activeUnits.add(u ? u.id : unit);
  renderList();
  if(input) input.focus();
}

// ── Deep-link from index.html's "Recently Added" list: ?topic=<id> opens
// that topic directly instead of leaving the subject's welcome screen showing.
function applyTopicLinkFromUrl(){
  const topicId = new URLSearchParams(window.location.search).get('topic');
  if(!topicId) return;
  const t = getTopics().find(x => x.id == topicId);
  if(!t) return;
  viewTopic(t.id);
}

// ── Boot ──
if(resolveSubject()){
  applySubjectTheme();
  setupRichDnD();
  initSymbolPickers();
  renderList();
  applyUnitLinkFromUrl();
  applyTopicLinkFromUrl();
  syncPull();
  setInterval(syncPull, 60000);
  setInterval(() => {
    if(!unsyncedTopicBuckets().length) return;
    flushUnsyncedTopics().then(r => {
      if(!r.flushed) return;
      refreshUnsyncedUI();
      if(!r.remaining) setSyncStatus('ok');
    });
  }, 4000);
  startCountdown();
}

/* ══════════════════════════════════════════════
   STUDYBASE — MOBILE SIDEBAR TOGGLE
   ══════════════════════════════════════════════ */

(function () {
  var BREAK = 700;

  function isMobile() { return window.innerWidth <= BREAK; }

  function setup() {
    if (document.getElementById('mobScrim')) return;

    var scrim = document.createElement('div');
    scrim.id = 'mobScrim';
    scrim.className = 'mob-scrim';
    scrim.addEventListener('click', closeSidebar);
    document.body.appendChild(scrim);

    var bar = document.createElement('div');
    bar.id = 'mobBar';
    bar.className = 'mob-bar';
    bar.innerHTML =
      '<button class="mob-toggle" id="mobToggleBtn" onclick="window._mobToggle()">☰ Topics</button>' +
      '<span class="mob-bar-title" id="mobBarTitle">Select a topic</span>';

    var appBody = document.querySelector('.app-body');
    if (appBody) appBody.parentNode.insertBefore(bar, appBody);
  }

  function openSidebar() {
    var s = document.querySelector('.sidebar');
    var sc = document.getElementById('mobScrim');
    var btn = document.getElementById('mobToggleBtn');
    if (s)  s.classList.add('mob-open');
    if (sc) sc.classList.add('mob-open');
    if (btn) btn.textContent = '✕ Close';
  }

  function closeSidebar() {
    var s = document.querySelector('.sidebar');
    var sc = document.getElementById('mobScrim');
    var btn = document.getElementById('mobToggleBtn');
    if (s)  s.classList.remove('mob-open');
    if (sc) sc.classList.remove('mob-open');
    if (btn) btn.textContent = '☰ Topics';
  }

  window._mobToggle = function () {
    var s = document.querySelector('.sidebar');
    if (s && s.classList.contains('mob-open')) { closeSidebar(); }
    else { openSidebar(); }
  };

  var _orig = window.viewTopic;
  if (typeof _orig === 'function') {
    window.viewTopic = function (id) {
      _orig(id);
      if (!isMobile()) return;
      closeSidebar();
      try {
        var topics = sbMemGet(ST, []) || [];
        var t = topics.find(function (x) { return x.id == id; });
        var titleEl = document.getElementById('mobBarTitle');
        if (t && titleEl) titleEl.textContent = t.name;
      } catch (e) {}
    };
  }

  function onResize() {
    var bar = document.getElementById('mobBar');
    if (!bar) return;
    if (!isMobile()) { closeSidebar(); }
  }
  window.addEventListener('resize', onResize);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

// ── Toast ──
(function(){
  const s=document.createElement('style');
  s.textContent='#sb-toast-c{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:9999;pointer-events:none}.sb-toast{display:flex;align-items:center;gap:8px;background:var(--card);border:1.5px solid var(--border2);border-radius:8px;padding:9px 13px;font-size:12px;font-family:\'Inter\',sans-serif;color:var(--text);box-shadow:0 4px 16px rgba(0,0,0,.1);min-width:180px;max-width:280px;animation:tb-in .2s ease;transition:opacity .3s,transform .3s}.sb-toast.out{opacity:0;transform:translateX(16px)}.sb-toast.success{border-color:#86efac}.sb-toast.error{border-color:#fca5a5}.sb-toast.warning{border-color:#fcd34d}@keyframes tb-in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}';
  document.head.appendChild(s);
  const c=document.createElement('div');c.id='sb-toast-c';document.body.appendChild(c);
  window.showToast=function(msg,type='info',duration=2500){
    const icons={success:'✓',error:'✕',info:'ℹ',warning:'⚠'};
    const t=document.createElement('div');t.className='sb-toast '+(type||'info');
    t.innerHTML=`<span>${icons[type]||'ℹ'}</span><span>${msg}</span>`;
    c.appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),350);},duration);
  };
})();

// ── AI Fill Gaps ──
function _gKey(){
  const a="wac6rvA43LkJB_Cs9ry80JfzhYL3d61g6eglwef7b89J6";
  const b="AQ.Ab8RN";
  let k=b+a;
  k=k.substring(0,8)+k.substring(8).split('').reverse().join('');
  return k;
}
const GEMINI_URL=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${_gKey()}`;

// ── AI Fill inside the modal ──
// Reads the current form state (name + any existing field values) and fills
// only the empty / missing fields, writing the results directly into the form.
async function aiFillModal(){
  const name = document.getElementById('fName').value.trim();
  if(!name){ showToast('Enter a topic name first', 'info'); document.getElementById('fName').focus(); return; }

  // Snapshot current form values
  const curDef    = document.getElementById('fDefinition').value.trim();
  const curKps    = Array.from(document.getElementById('kpList').querySelectorAll('.kp-row input')).map(i=>i.value.trim()).filter(Boolean);
  const curFormula  = getRichVal('fFormula');
  const curMaterials= getRichVal('fMaterials');
  const curProcess  = getRichVal('fProcess');
  const curSafety   = getRichVal('fSafety');
  const curExamTip  = getRichVal('fExamTip');

  // Decide what's missing
  const want = [];
  if(!curDef)           want.push('definition');
  if(!curKps.length)    want.push('keyPoints');
  if(!curExamTip)       want.push('examTip');
  // Only suggest formula / process if the subject seems technical
  // (we always request them so the user can ignore blanks)
  if(!curFormula)       want.push('formula');
  if(!curProcess)       want.push('process');

  if(!want.length){ showToast('All fields already filled!', 'info'); return; }

  const btn = document.getElementById('btnAiFillModal');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Filling…'; }

  const subjectCtx = SUBJECT ? `Subject: "${SUBJECT.name}".` : '';
  const prompt = `You are a concise study assistant. ${subjectCtx} The topic is "${name}".
${curDef ? `Existing definition: "${curDef}"` : ''}
${curKps.length ? `Existing key points: ${curKps.join('; ')}` : ''}

Generate ONLY the following fields as a JSON object. Include a key even if the field doesn't apply — use an empty string or empty array in that case.
Fields to generate: ${want.join(', ')}.

Field rules:
- definition: 1-2 sentences, clear and academic. Empty string if not applicable.
- keyPoints: array of 3-4 concise strings. Empty array if not applicable.
- examTip: one practical exam tip sentence. Empty string if not applicable.
- formula: LaTeX or plain-text formula/equation if relevant, else empty string.
- process: step-by-step method or process as plain text (steps separated by \\n), else empty string.

Return ONLY valid JSON, no markdown, no explanation.`;

  try{
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] })
    });
    if(res.status===429) throw new Error('RATE_LIMIT');
    if(!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json|```/g,'').trim();
    const filled = JSON.parse(text);

    // Write into form — only overwrite fields that were empty
    if(!curDef && filled.definition)
      document.getElementById('fDefinition').value = filled.definition;

    if(!curKps.length && (filled.keyPoints||filled.key_points||[]).length){
      const kps = filled.keyPoints || filled.key_points || [];
      // Clear existing rows first, then add
      document.getElementById('kpList').innerHTML = '';
      kps.forEach(k => { if(k) addKpRow(k); });
    }

    if(!curExamTip && (filled.examTip||filled.exam_tip))
      setRichVal('fExamTip', filled.examTip || filled.exam_tip);

    if(!curFormula && filled.formula)
      setRichVal('fFormula', filled.formula);

    if(!curProcess && filled.process)
      setRichVal('fProcess', filled.process);

    // Persist filled values to storage immediately so reopening the modal shows them
    if(editId){
      let topics = getTopics();
      const idx = topics.findIndex(t => t.id === editId);
      if(idx !== -1){
        const t = topics[idx];
        if(!curDef && filled.definition)           t.definition = filled.definition;
        if(!curKps.length && (filled.keyPoints||filled.key_points||[]).length) t.keyPoints = filled.keyPoints || filled.key_points;
        if(!curExamTip && (filled.examTip||filled.exam_tip))  t.examTip = filled.examTip || filled.exam_tip;
        if(!curFormula && filled.formula)          t.formula = filled.formula;
        if(!curProcess && filled.process)          t.process = filled.process;
        t.updatedAt = new Date().toISOString();
        topics[idx] = t;
        saveTopics(topics);
        renderList();
        viewTopic(editId);
      }
    }

    showToast('Gaps filled — review and edit as needed', 'success');
  } catch(e){
    console.error(e);
    showToast(e.message==='RATE_LIMIT' ? 'Rate limit hit — wait a moment and try again' : 'AI fill failed — try again', 'error');
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='✨ Fill gaps'; }
  }
}
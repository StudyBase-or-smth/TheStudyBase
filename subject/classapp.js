// ── Resolve subject from URL hash ──
let SUBJECT = null; // the matched entry from classesData
let ST = '';        // localStorage key for topics
let SU = '';        // localStorage key for units
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
    if(!src.startsWith('data:')&&!src.startsWith('https://drive.google.com/')&&!src.startsWith('https://lh3.googleusercontent.com/'))img.remove();
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
  const str = String(val).trim();
  if(!str) return false;
  const probe = document.createElement('div');
  probe.innerHTML = str;
  if(probe.querySelector('img, video, iframe, svg')) return true;
  const s = str
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
  if(!t.pdfData || !isAllowedMediaUrl(t.pdfData)) return '';
  const isImg = isPdfImageSrc(t.pdfData, t.pdfName);
  const name = esc(t.pdfName || (isImg ? 'image' : 'document.pdf'));
  const src = isImg ? t.pdfData : driveEmbedUrl(t.pdfData);
  if(!src) return '';
  const srcAttr = esc(src).replace(/"/g, '&quot;');
  const hrefAttr = esc(t.pdfData).replace(/"/g, '&quot;');
  const viewer = isImg
    ? `<div class="pdf-viewer-stage"><img class="pdf-viewer-img" id="pdfViewerFrame" src="${srcAttr}" alt="${name}" title="Click to toggle dark-mode inversion" onclick="toggleImgInvert(this)"></div>`
    : `<iframe class="pdf-viewer" id="pdfViewerFrame" src="${srcAttr}" title="${name}"></iframe>`;
  const isHttps = /^https?:/i.test(t.pdfData);
  return `<div class="pdf-viewer-wrap">${viewer}
      <a class="pdf-open-link" href="${hrefAttr}" ${isHttps ? 'target="_blank" rel="noopener"' : `download="${name}"`}>⬇ ${name}</a></div>`;
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
let editDesmosTouched = false;

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
  let desmosReady = false;
  editDesmosTouched = false;
  desmosEditorCalc.observeEvent('change', () => {
    if(!desmosReady) return;
    editDesmosTouched = true;
    if(editSurface === 'inline') updateEditBatchButtons();
  });
  if(state){ try{ desmosEditorCalc.setState(state); }catch(e){ desmosEditorCalc.setBlank(); } }
  setTimeout(() => { desmosReady = true; editDesmosTouched = false; }, 0);
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
const CELL_LIMIT = 45000;
const getTopics  = () => { try{ return JSON.parse(localStorage.getItem(ST)||'[]'); }catch(e){ return []; } };
const getUnits   = () => { try{ return JSON.parse(localStorage.getItem(SU)||JSON.stringify(DEF_UNITS)); }catch(e){ return []; } };
const getPinned  = () => { try{ return JSON.parse(localStorage.getItem(SP)||'[]'); }catch(e){ return []; } };

const saveTopics = t => {
  localStorage.setItem(ST, JSON.stringify(t));
  const sd = sanitizeForSync(t);
  if(JSON.stringify(sd).length > CELL_LIMIT){ setSyncStatus('warn'); }
  else{ syncPush(ST, sd); setSyncStatus('ok'); }
};
const saveUnits = u => {
  localStorage.setItem(SU, JSON.stringify(u));
  if(JSON.stringify(u).length > CELL_LIMIT){ setSyncStatus('warn'); }
  else{ syncPush(SU, u); setSyncStatus('ok'); }
};
const savePinned = p => {
  localStorage.setItem(SP, JSON.stringify(p));
};

// ── Layouts ──
const LAYOUTS = ['basic','overview','math','text','pdf','table'];
const LAYOUT_LABELS = { basic:'Basic', overview:'Overview', math:'Math', text:'Text', pdf:'PDF/Image', table:'Table' };
function subjectDefaultLayout(){
  const subjectId = SUBJECT && SUBJECT.subjectId;
  const meta = subjectId && typeof subjectsData !== 'undefined'
    ? (subjectsData.subjects || []).find(s => s.id === subjectId)
    : null;
  const d = (meta && meta.default) || (SUBJECT && SUBJECT.default);
  return LAYOUTS.includes(d) ? d : 'basic';
}
let currentLayout = 'basic';

// ── PDF/Image topic type ──
// Files go to the same Drive folder as rich-text images (Apps Script
// handles `_up_` / `_ur_` keys). The topic only stores the returned URL
// plus the original filename — not a base64 blob.
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
  return /lh3\.googleusercontent\.com/i.test(url);
}

function isAllowedMediaUrl(url){
  if(!url) return false;
  if(/^data:image\//i.test(url) || /^data:application\/pdf/i.test(url)) return true;
  try{
    const u = new URL(url);
    if(u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'drive.google.com' || host === 'lh3.googleusercontent.com';
  }catch(e){ return false; }
}

function driveEmbedUrl(url){
  if(!url || /^data:/i.test(url)) return url || '';
  if(!isAllowedMediaUrl(url)) return '';
  const id = (url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
  return id ? ('https://drive.google.com/file/d/' + id + '/preview') : '';
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

function asDriveUploadDataUrl(dataUrl, isPdf){
  if(!isPdf) return dataUrl;
  if(/^data:application\/pdf;base64,/i.test(dataUrl)) return dataUrl;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return 'data:application/pdf;base64,' + b64;
}

function driveUploadError(res){
  const err = res && res.data && res.data.error;
  if(err === 'bad_format') return 'Drive rejected this file type — update Apps Script from apps-script/Code.gs and deploy a new version.';
  return err || 'Drive upload failed';
}

function uploadDataUrlToDrive(dataUrl, filename){
  return new Promise((resolve, reject) => {
    const uid = Date.now() + '' + Math.random().toString(36).slice(2, 6);
    syncPush('_up_' + uid, { image: dataUrl, filename: filename || ('sb_' + uid) });
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      try{
        const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent('_ur_'+uid));
        if(res && res.data){
          clearInterval(poll);
          if(res.data.ok && res.data.url) resolve(res.data.url);
          else reject(new Error(driveUploadError(res)));
        }
      } catch(e) {}
      if(tries >= 30){ clearInterval(poll); reject(new Error('Drive upload timed out')); }
    }, 1500);
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
    const dataUrl = isImage ? await compressImageFile(file) : asDriveUploadDataUrl(await fileToDataUrl(file), true);
    const filename = isImage ? ('sb_' + Date.now() + '.jpg') : file.name;
    pendingPdfData = await uploadDataUrlToDrive(dataUrl, filename);
    pendingPdfName = file.name;
    showToast('Uploaded to Drive', 'success');
  } catch(e){
    showToast(e.message || 'Drive upload failed', 'error');
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
    area.innerHTML = `<div class="pdf-picked-row"><span class="pdf-picked-name">⏳ Uploading ${esc(pendingPdfName || 'file')} to Drive…</span></div>`;
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
  closeLayoutMenu();
  applyLayoutUI();
}

function selectLayout(id){
  if(!LAYOUTS.includes(id)) return;
  currentLayout = id;
  closeLayoutMenu();
  applyLayoutUI();
}

function layoutMenuHtml(){
  return LAYOUTS.map(id =>
    `<button type="button" class="layout-menu-item${id === currentLayout ? ' active' : ''}" onclick="selectLayout('${id}')">${esc(LAYOUT_LABELS[id] || id)}</button>`
  ).join('');
}

function toggleLayoutMenu(e){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  const menu = document.getElementById('layoutMenu');
  if(!menu) return;
  const open = !menu.classList.contains('open');
  if(open){
    menu.innerHTML = layoutMenuHtml();
    menu.classList.add('open');
    menu.hidden = false;
  } else {
    closeLayoutMenu();
  }
}

function closeLayoutMenu(){
  const menu = document.getElementById('layoutMenu');
  if(!menu) return;
  menu.classList.remove('open');
  menu.hidden = true;
  menu.innerHTML = '';
}

function layoutSwitcherHtml(){
  return `<div class="layout-switcher">
    <button type="button" class="layout-arrow" onclick="cycleLayout(-1)" title="Previous type">‹</button>
    <button type="button" class="layout-name" id="layoutName" onclick="toggleLayoutMenu(event)" title="Choose type">${esc(LAYOUT_LABELS[currentLayout] || 'Basic')}</button>
    <button type="button" class="layout-arrow" onclick="cycleLayout(1)" title="Next type">›</button>
    <div class="layout-menu" id="layoutMenu" hidden></div>
  </div>`;
}

function placeEditSubtopicsSection(){
  const root = document.getElementById('detailContent');
  if(!root) return;
  const sec = root.querySelector('[data-block="subtopics"]');
  const moreBody = root.querySelector('.edit-more-body');
  const morePanel = root.querySelector('.edit-more-panel');
  if(!sec || !moreBody || !morePanel) return;
  // Overview/Text treat subtopics as a primary field; other types keep them in More.
  if(currentLayout === 'overview' || currentLayout === 'text'){
    morePanel.parentNode.insertBefore(sec, morePanel);
  } else {
    moreBody.insertBefore(sec, moreBody.firstChild);
  }
}

function applyLayoutUI(){
  document.querySelectorAll('.layout-name').forEach(el => {
    el.textContent = LAYOUT_LABELS[currentLayout] || 'Basic';
  });
  document.querySelectorAll('[data-layout-group]').forEach(el => {
    const groups = el.dataset.layoutGroup.split(/\s+/).filter(Boolean);
    el.style.display = groups.includes(currentLayout) ? '' : 'none';
  });
  placeEditSubtopicsSection();
  document.querySelectorAll('.edit-more-panel').forEach(panel => {
    const kids = panel.querySelectorAll('.edit-more-body > [data-layout-group]');
    const anyVisible = [...kids].some(el => el.style.display !== 'none');
    panel.style.display = anyVisible ? '' : 'none';
  });
  const menu = document.getElementById('layoutMenu');
  if(menu && menu.classList.contains('open')) menu.innerHTML = layoutMenuHtml();
  const kpLabel = document.getElementById('kpFieldLabel');
  if(kpLabel) kpLabel.textContent = currentLayout === 'text' ? 'Points of Interest' : 'Key Points';
  const bodyLabel = document.getElementById('bodyTextLabel');
  const bodyEl = document.getElementById('fBodyText');
  if(bodyLabel && bodyEl){
    if(currentLayout === 'text'){ bodyLabel.textContent = 'Main Text'; bodyEl.style.minHeight = '260px'; }
    else { bodyLabel.textContent = 'Overview'; bodyEl.style.minHeight = '120px'; }
  }
}

document.addEventListener('click', e => {
  if(!e.target.closest('.layout-switcher')) closeLayoutMenu();
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeLayoutMenu();
});

// ── Teacher notes (per block) ──
const TN_KEY = () => 'tnotes_' + (SUBJECT ? SUBJECT.id : 'default');
const getTeacherNotes = () => { try{ return JSON.parse(localStorage.getItem(TN_KEY())||'{}'); }catch(e){ return {}; } };
const saveTeacherNotes = obj => {
  localStorage.setItem(TN_KEY(), JSON.stringify(obj));
  syncPush(TN_KEY(), obj);
  setSyncStatus('ok');
};

// Notes are stored as { [topicId]: { [blockKey]: [note, ...] } }.
// Legacy data may have { [topicId]: [note, ...] } — normalise on read.
function getTopicBlockNotes(topicId){
  const all = getTeacherNotes();
  let n = all[topicId];
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
    id: Date.now().toString(36),
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

function inlineEditSection(groups, block, icon, labelHtml, bodyHtml){
  return `<div class="section" data-layout-group="${groups}" data-block="${block}">
    <div class="section-header"><span class="sh-label-wrap"><span class="sh-icon">${icon}</span>${labelHtml}</span></div>
    <div class="section-body">${bodyHtml}</div>
  </div>`;
}

function inlineRichField(id, placeholder, minH, opts){
  opts = opts || {};
  const monoCls = opts.mono ? ' mono' : '';
  let toolbar = '<div class="rich-toolbar mini">';
  if(id === 'fBodyText' && editId){
    toolbar += `<button type="button" class="rich-btn" onclick="expandEnlarge('fBodyText', ${editId}, 'bodyText')" title="Pop out">⤢</button>`;
  }
  if(opts.symbols){
    toolbar += `<div class="symbol-picker-wrap"><button type="button" class="rich-btn" onmousedown="event.preventDefault()" onclick="toggleSymbolPicker(this)">Ω</button>
      <div class="symbol-picker-panel" id="symPicker_fFormula" data-target="fFormula"></div></div>`;
  }
  toolbar += `<button type="button" class="rich-btn" onclick="richAddImage('${id}')">🖼</button>
    <input type="file" id="img_${id}" accept="image/*" style="display:none"></div>`;
  return `<div class="rich-editor-wrap">${toolbar}
    <div class="rich-content${monoCls}" id="${id}" contenteditable="true" data-placeholder="${esc(placeholder)}" style="min-height:${minH}px"></div>
  </div>`;
}

function buildInlineEditHtml(){
  return `
    <div class="dh dh-editing">
      <div class="dh-edit-row dh-edit-row-name">
        <input type="text" class="dh-name-input" id="fName" placeholder="Topic name…" autocomplete="off">
        <div class="dh-edit-side">
          <div class="dh-actions-btns">
            <button type="button" class="btn-act" onclick="closeInlineEdit()">Cancel</button>
            <button type="button" class="btn-save dh-save-btn" onclick="saveTopic()">Save</button>
          </div>
        </div>
      </div>
      <div class="dh-edit-row dh-edit-row-meta">
        <div class="dh-unit-slot">
          <select class="form-sel dh-unit-select" id="fUnit" onchange="onUnitSelectChange()"></select>
          <div id="unitInputRow" class="dh-unit-add" style="display:none">
            <input type="text" class="form-i" id="newUnitInput" placeholder="Unit name…"
              onkeydown="if(event.key==='Enter')confirmAddUnit();if(event.key==='Escape')hideUnitInput()">
            <button type="button" class="btn-save" onclick="confirmAddUnit()">Add</button>
            <button type="button" class="btn-cancel" onclick="hideUnitInput()">✕</button>
          </div>
        </div>
        <div class="dh-edit-side dh-edit-side-layout">
          ${layoutSwitcherHtml()}
        </div>
      </div>
    </div>
    ${inlineEditSection('basic', 'definition', '📝', 'Definition', `<textarea class="form-ta" id="fDefinition" rows="3" placeholder="A clear, concise definition…"></textarea>`)}
    ${inlineEditSection('overview text', 'bodyText', '📄', '<span id="bodyTextLabel">Overview</span>', inlineRichField('fBodyText', 'Write the overview or main text here…', 160))}
    ${inlineEditSection('basic overview text', 'keyPoints', '✦', '<span id="kpFieldLabel">Key Points</span>', `<div class="kp-list" id="kpList"></div><button type="button" class="btn-add-kp" onclick="addKpRow()">+ Add key point</button>`)}
    ${inlineEditSection('basic math', 'formula', '∑', 'Formula / Equation', inlineRichField('fFormula', 'e.g. σ = F/A', 88, { mono: true, symbols: true }))}
    ${inlineEditSection('math', 'desmos', '📐', 'Desmos Graph', `<div class="desmos-editor-wrap">
      <div class="desmos-calculator" id="desmosEditorCalc"></div>
      <div class="desmos-loading" id="desmosEditorLoading" style="height:360px"><span class="desmos-spinner"></span>Loading graphing calculator…</div>
      <p class="desmos-unavailable" id="desmosEditorUnavailable" style="display:none">Desmos graphing isn't configured yet — set DESMOS_API_KEY in sync-config.js.</p>
    </div>`)}
    ${inlineEditSection('pdf', 'pdfDoc', '📄', 'PDF / Image Document', `<input type="file" id="fPdfFile" accept="application/pdf,image/*" style="display:none" onchange="onPdfFileSelected(this)"><div id="pdfPreviewArea"></div>`)}
    ${inlineEditSection('table', 'tableData', '▦', 'Table', `<div class="table-editor-wrap"><table class="table-editor" id="tableEditorGrid"><thead><tr id="tableEditorHeadRow"></tr></thead><tbody id="tableEditorBody"></tbody></table></div>
      <div class="table-editor-actions"><button type="button" class="btn-small" onclick="addTableColumn()">+ Add column</button><button type="button" class="btn-small" onclick="addTableRow()">+ Add row</button></div>`)}
    ${inlineEditSection('basic', 'materials', '📋', 'Extra Notes', inlineRichField('fMaterials', 'Any additional notes…', 52))}
    ${inlineEditSection('basic', 'process', '⚙', 'Process / Method', inlineRichField('fProcess', 'How does it work? Step-by-step if applicable…', 66))}
    ${inlineEditSection('basic', 'safety', '⚠', 'Safety / Warnings', inlineRichField('fSafety', 'Hazards, warnings, failure modes…', 52))}
    ${inlineEditSection('basic', 'examTip', '⚡', 'Exam Tip', inlineRichField('fExamTip', 'Common mistakes, how to pick up marks…', 52))}
    ${inlineEditSection('basic overview text math pdf table', 'subtopics', '🧩', 'Subtopics', `<div class="subtopic-editor-list" id="subtopicEditorList"></div><button type="button" class="btn-add-kp" onclick="addSubtopicRow()">+ Add subtopic</button>`)}
    <details class="edit-more-panel">
      <summary class="edit-more-summary">More</summary>
      <div class="edit-more-body">
        ${inlineEditSection('basic math', 'flashcardQA', '🎴', 'Flashcard Questions', `<div class="fqa-list" id="fqaList"></div><button type="button" class="btn-add-kp" onclick="addFqaRow()">+ Add question</button>`)}
        ${inlineEditSection('basic overview text math pdf table', 'relatedTerms', '🔗', 'Related Terms', `<div class="tags-wrap" id="tagsWrap" onclick="document.getElementById('tagsInput').focus()"><input type="text" class="tags-i" id="tagsInput" placeholder="Type a topic… Tab to autofill" autocomplete="off"></div>`)}
      </div>
    </details>
  `;
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
  if(opts.enlarge){
    const extra = (opts.topicId != null && opts.enlargeField)
      ? `, ${Number(opts.topicId)}, '${opts.enlargeField}'` : '';
    html += `<button type="button" class="sh-expand-btn" onclick="expandEnlarge('${targetId}'${extra})" title="Pop out">⤢</button>`;
  }
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

let _enlargeOrigin = null;
let _enlargeMeta = null;

function updateEnlargeToolbar(){
  const editBtn = document.getElementById('enlargeEditBtn');
  const saveBtn = document.getElementById('enlargeSaveBtn');
  const cancelBtn = document.getElementById('enlargeCancelBtn');
  if(!editBtn) return;
  const showEdit = _enlargeMeta && canEditTopic(_enlargeMeta.topicId) && !_enlargeMeta.editing
    && (_enlargeMeta.field === 'bodyText' || _enlargeMeta.field === 'desmos');
  editBtn.style.display = showEdit ? '' : 'none';
  const editing = !!(_enlargeMeta && _enlargeMeta.editing);
  if(saveBtn) saveBtn.style.display = editing ? '' : 'none';
  if(cancelBtn) cancelBtn.style.display = editing ? '' : 'none';
}

function expandEnlarge(id, topicId, field){
  const el = document.getElementById(id);
  const overlay = document.getElementById('enlargeOverlay');
  const slot = document.getElementById('enlargeSlot');
  if(!el || !overlay || !slot) return;
  closeEnlarge();
  _enlargeOrigin = { el, parent: el.parentNode, next: el.nextSibling };
  _enlargeMeta = (topicId && field) ? { topicId: Number(topicId), field, viewId: id, editing: false, snapshot: null } : null;
  slot.appendChild(el);
  el.classList.add('enlarged-active');
  overlay.classList.add('open');
  updateEnlargeToolbar();
  document.addEventListener('keydown', _enlargeEscHandler);
}

function enlargeToggleEdit(){
  if(!_enlargeMeta || !canEditTopic(_enlargeMeta.topicId)) return;
  if(_enlargeMeta.field === 'bodyText'){
    const el = document.getElementById(_enlargeMeta.viewId);
    if(!el) return;
    _enlargeMeta.snapshot = el.innerHTML;
    _enlargeMeta.editing = true;
    el.contentEditable = 'true';
    el.classList.add('plain-text-editing');
    el.focus();
    updateEnlargeToolbar();
    return;
  }
  if(_enlargeMeta.field === 'desmos'){
    const state = desmosViewCalc ? desmosViewCalc.getState() : null;
    destroyDesmosView();
    _enlargeOrigin = null;
    const slot = document.getElementById('enlargeSlot');
    slot.innerHTML = `<div class="desmos-editor-wrap" style="width:100%;height:100%">
      <div class="desmos-calculator" id="desmosEditorCalc" style="width:100%;height:100%"></div>
      <div class="desmos-loading" id="desmosEditorLoading" style="display:none"></div>
    </div>`;
    _enlargeMeta.editing = true;
    mountDesmosEditor(state);
    updateEnlargeToolbar();
  }
}

function enlargeCancelEdit(){
  if(!_enlargeMeta || !_enlargeMeta.editing) return;
  if(_enlargeMeta.field === 'bodyText'){
    const el = document.getElementById(_enlargeMeta.viewId);
    if(el){
      el.innerHTML = _enlargeMeta.snapshot || '';
      el.contentEditable = 'false';
      el.classList.remove('plain-text-editing');
    }
    _enlargeMeta.editing = false;
    updateEnlargeToolbar();
    return;
  }
  if(_enlargeMeta.field === 'desmos'){
    destroyDesmosEditor();
    _enlargeMeta = null;
    closeEnlarge(true);
    if(activeId) viewTopic(activeId);
  }
}

function enlargeSaveEdit(){
  if(!_enlargeMeta || !_enlargeMeta.editing) return;
  const t = getTopics().find(x => x.id === _enlargeMeta.topicId);
  if(!t) return;
  if(_enlargeMeta.field === 'bodyText'){
    const el = document.getElementById(_enlargeMeta.viewId);
    if(!el) return;
    const bodyText = el.innerHTML.trim();
    saveTopics(getTopics().map(x => x.id === t.id ? { ...x, bodyText, updatedAt: new Date().toISOString() } : x));
    el.contentEditable = 'false';
    el.classList.remove('plain-text-editing');
    _enlargeMeta.editing = false;
    updateEnlargeToolbar();
    renderList();
    return;
  }
  if(_enlargeMeta.field === 'desmos'){
    const desmosState = readDesmosState();
    destroyDesmosEditor();
    saveTopics(getTopics().map(x => x.id === t.id ? { ...x, desmosState, updatedAt: new Date().toISOString() } : x));
    _enlargeMeta = null;
    closeEnlarge(true);
    viewTopic(t.id);
    renderList();
  }
}

function _enlargeEscHandler(e){
  if(e.key === 'Escape'){
    if(_enlargeMeta && _enlargeMeta.editing) enlargeCancelEdit();
    else closeEnlarge();
  }
}

function closeEnlarge(forceRefresh){
  if(_enlargeMeta && _enlargeMeta.editing && !forceRefresh) enlargeCancelEdit();
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
  _enlargeMeta = null;
  updateEnlargeToolbar();
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
        ${window.isTeacher ? `<button class="blk-note-del" onclick="deleteBlockNote(${topicId},'${block}','${n.id}')" title="Delete">✕</button>` : ''}
      </div>
      <p class="blk-note-text">${esc(n.text)}</p>
    </div>`).join('');

  const iconAction = window.isTeacher
    ? `openCommentPopover(${topicId},'${block}','${esc(label).replace(/'/g,"\\'")}',this)`
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
  id = Number(id);
  const pinned = getPinned();
  const idx = pinned.indexOf(id);
  if(idx === -1){ pinned.push(id); }
  else { pinned.splice(idx, 1); }
  savePinned(pinned);
  renderList();
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getDescendantIds(id, topics){
  const direct = topics.filter(t => t.parentId === id).map(t => t.id);
  return direct.concat(direct.flatMap(cid => getDescendantIds(cid, topics)));
}

// ── State ──
let activeId = null, editId = null, editSurface = null, editBatchDrafts = null, activeUnits = new Set(), tempTags = [], pendingAction = null;
let _lastRenderedTopicKey = null;
let openCommentBlocks = new Set();
let expandedTopics = new Set();

// ── Sidebar list ──

function resolveTopicUnit(t, topics){
  let cur = t, guard = 0;
  while(cur && guard++ < 40){
    if(cur.unit) return cur.unit;
    if(cur.parentId == null || cur.parentId === '') break;
    cur = findTopicById(topics, cur.parentId);
  }
  return '';
}

function topicSelfMatchesFilter(t, topics, q){
  const unit = resolveTopicUnit(t, topics);
  const mu = activeUnits.size === 0 || (unit && activeUnits.has(unit));
  const mq = !q || t.name.toLowerCase().includes(q) ||
    (t.definition||'').toLowerCase().includes(q) ||
    (unit||'').toLowerCase().includes(q) ||
    (t.relatedTerms||[]).some(r => r.toLowerCase().includes(q));
  return mu && mq;
}

function topicVisibleInListFilter(t, topics, q){
  if(topicSelfMatchesFilter(t, topics, q)) return true;
  return topics.filter(c => c.parentId === t.id).some(c => topicVisibleInListFilter(c, topics, q));
}

function renderSubtree(c, topics, q){
  const kids = topics.filter(k => k.parentId === c.id && topicVisibleInListFilter(k, topics, q));
  const hasKids = kids.length > 0;
  const forceExpand = activeUnits.size > 0 && topics.filter(k => k.parentId === c.id).some(k => topicVisibleInListFilter(k, topics, q));
  const isExpanded = hasKids && (expandedTopics.has(c.id) || forceExpand);
  const childrenHtml = isExpanded
    ? `<div class="subtopic-sidebar-list">` + kids.map(k => renderSubtree(k, topics, q)).join('') + `</div>`
    : '';
  return `
    <div class="tree-node">
      <div class="subtopic-sidebar-item${(activeId==c.id)?' active':''}" onclick="event.stopPropagation();viewTopic(${c.id})">
        ${hasKids
          ? `<button class="ti-expand-btn sub-expand" onclick="event.stopPropagation();toggleTopicExpand(${c.id})" title="${isExpanded?'Collapse':'Expand'}">${isExpanded?'▾':'▸'}</button>`
          : `<span class="ssi-dot"></span>`}
        <span class="ssi-label">${esc(c.name)}</span>
      </div>
      ${childrenHtml}
    </div>`;
}

function renderList(){
  const q = document.getElementById('searchInput').value.toLowerCase();
  const topics = getTopics();
  const pinned = getPinned();
  const topLevel = topics.filter(t => !t.parentId && topicVisibleInListFilter(t, topics, q)).sort((a,b) => {
    const ap = pinned.includes(a.id), bp = pinned.includes(b.id);
    if(ap && !bp) return -1;
    if(!ap && bp) return 1;
    return a.name.localeCompare(b.name);
  });

  document.getElementById('topicList').innerHTML = topLevel.length === 0
    ? `<div class="sidebar-empty">${q ? 'No results for "'+esc(q)+'"' : 'No topics yet.<br>Click <strong>+ New topic</strong> to begin.'}</div>`
    : topLevel.map(t => {
        const isPinned = pinned.includes(t.id);
        const children = topics.filter(c => c.parentId === t.id && topicVisibleInListFilter(c, topics, q));
        const hasSubs = children.length > 0;
        const forceExpand = activeUnits.size > 0 && topics.filter(c => c.parentId === t.id).some(c => topicVisibleInListFilter(c, topics, q));
        const isExpanded = hasSubs && (expandedTopics.has(t.id) || forceExpand);
        const subListHtml = isExpanded
          ? `<div class="subtopic-sidebar-list">` + children.map(c => renderSubtree(c, topics, q)).join('') + `</div>`
          : '';
        return `
        <div class="topic-item-wrap">
          <div class="topic-item${(t.id==activeId)?' active':''}${isPinned?' pinned':''}" onclick="viewTopic(${t.id})">
            <div class="ti-top">
              <div class="ti-name">
                ${hasSubs ? `<button class="ti-expand-btn" onclick="event.stopPropagation();toggleTopicExpand(${t.id})" title="${isExpanded?'Collapse':'Expand'}">${isExpanded?'▾':'▸'}</button>` : ''}
                ${isPinned?'<span class="ti-pin-icon"></span>':''}${esc(t.name)}
              </div>
              <button class="ti-pin-btn" onclick="event.stopPropagation();togglePinTopic(${t.id})" title="${isPinned?'Unpin':'Pin'}">${isPinned?'★':'☆'}</button>
            </div>
            ${t.unit ? `<div class="ti-unit">${esc(t.unit)}</div>` : ''}
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
  const units = getUnits(), topics = getTopics(), counts = {};
  topics.forEach(t => { if(t.unit) counts[t.unit] = (counts[t.unit]||0)+1; });

  const body = document.getElementById('unitsListBody');
  if(body){
    const q = (document.getElementById('unitsSearchInput')?.value || '').toLowerCase();
    const shown = units.filter(u => !q || u.toLowerCase().includes(q));
    body.innerHTML = shown.length === 0
      ? `<div class="units-empty">No units match "${esc(q)}"</div>`
      : shown.map(u => `
        <label class="units-row" data-unit="${esc(u)}">
          <input type="checkbox" ${activeUnits.has(u)?'checked':''} onclick="event.stopPropagation();toggleUnit(this.closest('[data-unit]').dataset.unit)">
          <span>${esc(u)}</span>
          <span class="units-count">${counts[u]||0}</span>
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
  id = Number(id);
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
  bcTopic.style.display = '';
  bcSep.style.display = '';

  if(trail){
    if(ancestors.length){
      trail.style.display = 'inline-flex';
      trail.innerHTML = ancestors.map(a =>
        `<span class="bc-sep">›</span><a class="bc-link" href="javascript:void(0)" onclick="viewTopic(${a.id})">${esc(a.name)}</a>`
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
  const t = getTopics().find(x => x.id == id);
  if(!t) return;

  if(editSurface === 'inline'){
    if(editId == id){ activeId = id; return; }
    if(!canEditTopic(id)){
      showToast('Only teachers can edit class topics', 'info');
      return;
    }
    stashCurrentEditDraft();
    activeId = id;
    const allTopics = getTopics();
    // Keep previously expanded groups open while editing so parent/subtopic
    // trees stay available when switching between drafts.
    let cur = t;
    while(cur && cur.parentId != null && cur.parentId !== ''){
      const parent = findTopicById(allTopics, cur.parentId);
      if(!parent) break;
      expandedTopics.add(parent.id);
      cur = parent;
    }
    if(allTopics.some(c => c.parentId === t.id)) expandedTopics.add(Number(id));
    if(location.protocol !== 'file:') history.replaceState(null,'', '#' + SUBJECT.id);
    renderList();
    startInlineEdit(id, { fromSwitch: true });
    updateTopicBreadcrumb(t, allTopics);
    return;
  }

  activeId = id;
  const renderKey = String(id);
  const isTopicSwitch = renderKey !== _lastRenderedTopicKey;
  if(isTopicSwitch) openCommentBlocks = new Set();
  const allTopics = getTopics();
  expandedTopics = new Set();
  let cur = t;
  while(cur && cur.parentId != null && cur.parentId !== ''){
    const parent = findTopicById(allTopics, cur.parentId);
    if(!parent) break;
    expandedTopics.add(parent.id);
    cur = parent;
  }
  if(allTopics.some(c => c.parentId === t.id)) expandedTopics.add(Number(id));
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
        return `<span class="rtag"${m?` onclick="viewTopic(${m.id})"`:''}>${esc(r)}</span>`;
      }).join('')}</div>`
    : '';

  const subtopicsHtml = children.length
    ? `<div class="related-tags">${children.map(c => `<span class="rtag" onclick="viewTopic(${c.id})">${esc(c.name)}</span>`).join('')}</div>`
    : '';

  const created = new Date(t.createdAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const editedStr = t.updatedAt && t.updatedAt !== t.createdAt
    ? '<span class="dh-date">· Edited '+new Date(t.updatedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+'</span>' : '';

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
    children.forEach(c => ovwItems.push(`<li class="ovw-list-item ovw-subtopic-item"><div class="kp-dot kp-dot-link"></div><a class="subtopic-link" href="javascript:void(0)" onclick="viewTopic(${c.id})">${esc(c.name)}</a><span class="ovw-subtopic-badge">subtopic →</span></li>`));
    if(ovwItems.length) bodyHtml += sec('overviewPoints', 'Points & Subtopics', '📋', `<ul class="ovw-list">${ovwItems.join('')}</ul>`);
  } else if(layout === 'math'){
    if(hasFieldContent(t.formula)){
      bodyHtml += sec('formula', 'Formula / Equation', '∑',
        `<div class="formula-box">${sanitizeRich(t.formula)}</div>`);
    }
    if((t.flashcardQA||[]).length){
      bodyHtml += sec('flashcardQA', 'Flashcard Questions', '🎴', qaRowsHtml(t));
    }
    if(t.desmosState){
      bodyHtml += sec('desmos', 'Desmos Graph', '📐', `<div class="desmos-view-wrap">
        <div class="desmos-view-calc" id="desmosViewCalc" style="display:none"></div>
        <div class="desmos-loading" id="desmosViewLoading" style="display:none;height:420px"><span class="desmos-spinner"></span>Loading graph…</div>
        <p class="desmos-unavailable" id="desmosViewUnavailable" style="display:none">Desmos graphing isn't configured yet — set DESMOS_API_KEY in sync-config.js.</p>
      </div>`, expandBtnsHtml('desmosViewCalc', {enlarge:true, fullscreen:true, topicId: t.id, enlargeField: 'desmos'}));
    }
  } else if(layout === 'text'){
    if(hasFieldContent(t.bodyText)){
      bodyHtml += sec('bodyText', 'Main Text', '📄',
        `<div class="plain-text" id="mainTextView">${sanitizeRich(t.bodyText)}</div>`,
        expandBtnsHtml('mainTextView', {enlarge:true, fullscreen:true, topicId: t.id, enlargeField: 'bodyText'}));
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
  } else {
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
    if((t.flashcardQA||[]).length)     bodyHtml += sec('flashcardQA', 'Flashcard Questions','🎴', qaRowsHtml(t));
  }

  if(subtopicsHtml) bodyHtml += sec('subtopics', 'Subtopics', '🧩', subtopicsHtml);
  if(relHtml)       bodyHtml += sec('relatedTerms', 'Related Terms', '🔗', relHtml);

  destroyDesmosView();
  closeEnlarge();
  el.innerHTML = `
      <div class="dh">
        <div>
          <div class="dh-name">${esc(t.name)}</div>
          <div class="dh-meta">
            ${t.unit ? `<span class="dh-unit">${esc(t.unit)}</span>` : ''}
            <span class="dh-date">Added ${created}</span>${editedStr}
          </div>
        </div>
        <div class="dh-actions">
          ${(window.isGuest || !window.isTeacher) ? '' : `<button class="btn-act" onclick="startInlineEdit(${t.id})">Edit</button>
          <button class="btn-act danger" onclick="confirmDeleteTopic(${t.id})">Delete</button>`}
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
  wireRichImages(el);
  updateTopicBreadcrumb(t, allTopics);
}
function canEditClassTopics(){
  return !window.isGuest && !!window.isTeacher;
}

function canEditTopic(id){
  if(window.isGuest || !window.isTeacher) return false;
  return true;
}

function assertCanEditTopic(id){
  if(window.isGuest){ showToast('Sign in to add or edit topics','info'); return false; }
  if(!window.isTeacher){ showToast('Only teachers can add or edit class topics','info'); return false; }
  return true;
}

function beginEditSession(id){
  editId = id || null;
  editDesmosTouched = false;
}

function editDraftKey(id){
  return String(id);
}

function draftIsDirty(draft){
  if(!draft || draft.id == null) return false;
  const topics = getTopics();
  const ex = topics.find(t => t.id === draft.id);
  if(!ex) return true;
  const same = (a, b) => {
    try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
    catch(e){ return false; }
  };
  const str = (v) => (v == null ? '' : String(v));
  if(str(draft.name).trim() !== str(ex.name).trim()) return true;
  if(str(draft.unit) !== str(ex.unit || '')) return true;
  if(str(draft.definition) !== str(ex.definition || '')) return true;
  if(!same(draft.keyPoints || [], ex.keyPoints || [])) return true;
  if(str(draft.formula) !== str(ex.formula || '')) return true;
  if(str(draft.materials) !== str(ex.materials || '')) return true;
  if(str(draft.process) !== str(ex.process || '')) return true;
  if(str(draft.safety) !== str(ex.safety || '')) return true;
  if(str(draft.examTip) !== str(ex.examTip || '')) return true;
  if(str(draft.bodyText) !== str(ex.bodyText || '')) return true;
  if(str(draft.pdfData) !== str(ex.pdfData || '') || str(draft.pdfName) !== str(ex.pdfName || '')) return true;
  const draftTable = draft.tableData || { columns: [], rows: [] };
  const exTable = ex.tableData || { columns: [], rows: [] };
  if(!same(draftTable, exTable)) return true;
  if(!same(draft.desmosState || null, ex.desmosState || null)) return true;
  const draftLayout = LAYOUTS.includes(draft.layout) ? draft.layout : subjectDefaultLayout();
  const exLayout = LAYOUTS.includes(ex.layout) ? ex.layout : subjectDefaultLayout();
  if(draftLayout !== exLayout) return true;
  if(!same(draft.relatedTerms || [], ex.relatedTerms || [])) return true;
  if(!same(draft.flashcardQA || [], ex.flashcardQA || [])) return true;
  const origSubs = topics.filter(c => c.parentId === draft.id).map(c => ({ id: Number(c.id), name: c.name }));
  const draftSubs = (draft.subtopicRows || []).map(r => ({ id: r.id == null || r.id === '' ? null : Number(r.id), name: r.name }));
  if(!same(draftSubs, origSubs)) return true;
  return false;
}

function captureEditDraft(){
  if(!editId || editSurface !== 'inline') return null;
  if(!document.getElementById('fName')) return null;
  const ex = getTopics().find(t => t.id === editId) || {};
  const unitVal = document.getElementById('fUnit')?.value;
  return {
    id: editId,
    name: document.getElementById('fName').value,
    unit: unitVal === '__add_unit__' ? '' : (unitVal || ''),
    definition: document.getElementById('fDefinition')?.value.trim() || '',
    keyPoints: Array.from(document.getElementById('kpList').querySelectorAll('.kp-row input'))
      .map(i => i.value.trim()).filter(Boolean),
    formula: getRichVal('fFormula'),
    materials: getRichVal('fMaterials'),
    process: getRichVal('fProcess'),
    safety: getRichVal('fSafety'),
    examTip: getRichVal('fExamTip'),
    bodyText: getRichVal('fBodyText'),
    pdfData: pendingPdfData !== null ? pendingPdfData : (ex.pdfData || ''),
    pdfName: pendingPdfData !== null ? pendingPdfName : (ex.pdfName || ''),
    pendingPdfData: pendingPdfData,
    pendingPdfName: pendingPdfName,
    tableData: (typeof readTableData === 'function' && document.getElementById('tableEditorBody'))
      ? readTableData() : (ex.tableData || null),
    desmosState: (() => {
      if(!editDesmosTouched) return ex.desmosState || null;
      const ds = readDesmosState();
      return ds !== null ? ds : (ex.desmosState || null);
    })(),
    layout: currentLayout,
    relatedTerms: (() => {
      const terms = [...tempTags];
      const ti = document.getElementById('tagsInput')?.value.trim();
      if(ti) terms.push(ti);
      return terms;
    })(),
    flashcardQA: Array.from(document.getElementById('fqaList')?.querySelectorAll('.fqa-row') || []).map(row => {
      const inputs = row.querySelectorAll('.fqa-input');
      return { q: (inputs[0]?.value||'').trim(), a: (inputs[1]?.value||'').trim() };
    }).filter(qa => qa.q),
    subtopicRows: Array.from(document.getElementById('subtopicEditorList')?.children || []).map(row => {
      const name = row.querySelector('.subtopic-name-i')?.value.trim();
      const childId = row.dataset.childId ? Number(row.dataset.childId) : null;
      return name ? { id: childId, name } : null;
    }).filter(Boolean),
    parentId: ex.parentId || null,
    addedBy: ex.addedBy || window.currentUid || null,
    createdAt: ex.createdAt || new Date().toISOString()
  };
}

function stashCurrentEditDraft(){
  if(editSurface !== 'inline' || !editId) return;
  if(!editBatchDrafts) editBatchDrafts = {};
  const draft = captureEditDraft();
  if(!draft) return;
  const key = editDraftKey(editId);
  if(draftIsDirty(draft)) editBatchDrafts[key] = draft;
  else delete editBatchDrafts[key];
  updateEditBatchButtons();
}

function collectDirtyEditDrafts(){
  const map = Object.assign({}, editBatchDrafts || {});
  if(editSurface === 'inline' && editId){
    const draft = captureEditDraft();
    if(draft){
      const key = editDraftKey(editId);
      if(draftIsDirty(draft)) map[key] = draft;
      else delete map[key];
    }
  }
  return Object.values(map).filter(draftIsDirty);
}

function updateEditBatchButtons(){
  const count = collectDirtyEditDrafts().length;
  const saveBtn = document.querySelector('.dh-save-btn');
  const cancelBtn = document.querySelector('.dh-actions-btns .btn-act');
  if(saveBtn) saveBtn.textContent = count > 1 ? `Save (${count})` : 'Save';
  if(cancelBtn) cancelBtn.textContent = 'Cancel';
}

function wireEditDirtyTracking(){
  const el = document.getElementById('detailContent');
  if(!el || el.dataset.dirtyTrack === '1') return;
  el.dataset.dirtyTrack = '1';
  const bump = () => { if(editSurface === 'inline') updateEditBatchButtons(); };
  el.addEventListener('input', bump);
  el.addEventListener('change', bump);
}

function populateTopicForm(id, draft){
  tempTags = [];
  document.getElementById('kpList').innerHTML = '';
  document.getElementById('subtopicEditorList').innerHTML = '';
  document.getElementById('tagsWrap').querySelectorAll('.tag-chip').forEach(e => e.remove());
  populateSel();
  let desmosState = null;
  if(id){
    const t = draft || getTopics().find(x => x.id == id) || {};
    const titleEl = document.getElementById('modalTitle');
    if(titleEl) titleEl.textContent = 'Edit topic';
    document.getElementById('fName').value = t.name || '';
    document.getElementById('fUnit').value = t.unit || '';
    document.getElementById('fDefinition').value = t.definition || '';
    setRichVal('fFormula', t.formula || '');
    setRichVal('fMaterials', t.materials || '');
    setRichVal('fProcess', t.process || '');
    setRichVal('fSafety', t.safety || '');
    setRichVal('fExamTip', t.examTip || '');
    setRichVal('fBodyText', t.bodyText || '');
    (t.keyPoints||[]).forEach(k => addKpRow(k));
    (t.relatedTerms||[]).forEach(addTag);
    if(draft && Array.isArray(draft.subtopicRows)){
      draft.subtopicRows.forEach(c => addSubtopicRow(c));
    } else {
      getTopics().filter(c => c.parentId === t.id).forEach(c => addSubtopicRow(c));
    }
    document.getElementById('fqaList').innerHTML = '';
    (t.flashcardQA||[]).forEach(qa => addFqaRow(qa.q, qa.a));
    buildTableEditor(t.tableData);
    desmosState = t.desmosState || null;
    currentLayout = LAYOUTS.includes(t.layout) ? t.layout : subjectDefaultLayout();
    if(draft && 'pendingPdfData' in draft){
      pendingPdfData = draft.pendingPdfData;
      pendingPdfName = draft.pendingPdfName;
      pendingPdfUploading = false;
    } else {
      pendingPdfData = null; pendingPdfName = null; pendingPdfUploading = false;
    }
  } else {
    const titleEl = document.getElementById('modalTitle');
    if(titleEl) titleEl.textContent = 'New topic';
    ['fName','fDefinition'].forEach(i => document.getElementById(i).value = '');
    ['fFormula','fMaterials','fProcess','fSafety','fExamTip','fBodyText'].forEach(clearRich);
    document.getElementById('fUnit').value = '';
    document.getElementById('fqaList').innerHTML = '';
    buildTableEditor(null);
    currentLayout = subjectDefaultLayout();
    pendingPdfData = null; pendingPdfName = null; pendingPdfUploading = false;
  }
  renderPdfPreview();
  applyLayoutUI();
  return desmosState;
}

function parkEditPanel(){
  const panel = document.getElementById('topicEditPanel');
  const overlay = document.getElementById('modalOverlay');
  if(panel && overlay && panel.parentNode !== overlay) overlay.appendChild(panel);
  if(panel) panel.classList.remove('topic-edit-inline');
}

function stashModalFormIds(){
  const panel = document.getElementById('topicEditPanel');
  if(!panel) return;
  panel.querySelectorAll('[id]').forEach(el => {
    if(el.dataset.stashedId) return;
    el.dataset.stashedId = el.id;
    el.removeAttribute('id');
  });
}

function restoreModalFormIds(){
  const panel = document.getElementById('topicEditPanel');
  if(!panel) return;
  panel.querySelectorAll('[data-stashed-id]').forEach(el => {
    el.id = el.dataset.stashedId;
    delete el.dataset.stashedId;
  });
}

function finishEditSession(){
  closeLayoutMenu();
  destroyDesmosEditor();
  if(editSurface === 'inline'){
    const el = document.getElementById('detailContent');
    if(el) el.innerHTML = '';
    restoreModalFormIds();
  } else {
    parkEditPanel();
  }
  document.getElementById('modalOverlay').classList.remove('open');
  editId = null;
  editSurface = null;
  editBatchDrafts = null;
}

function afterEditFormMounted(desmosState){
  mountDesmosEditor(desmosState);
  document.querySelectorAll('.rich-editor-wrap').forEach(attachRichDnD);
  wireRichImages(document.getElementById('detailContent'));
  wireRichImages(document.getElementById('topicEditPanel'));
  wireEditDirtyTracking();
  updateEditBatchButtons();
}

function openModal(id){
  if(!assertCanEditTopic(id)) return;
  if(editSurface === 'inline') finishEditSession();
  restoreModalFormIds();
  beginEditSession(id);
  const desmosState = populateTopicForm(id);
  parkEditPanel();
  editSurface = 'modal';
  afterEditFormMounted(desmosState);
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 80);
}

function startInlineEdit(id, opts){
  opts = opts || {};
  if(!id || !assertCanEditTopic(id)) return;
  if(editSurface === 'inline' && editId === id && !opts.fromSwitch) return;
  if(editSurface === 'inline' && !opts.fromSwitch){
    finishEditSession();
  }
  if(!editBatchDrafts) editBatchDrafts = {};
  closeEnlarge();
  destroyDesmosView();
  beginEditSession(id);
  const el = document.getElementById('detailContent');
  el.innerHTML = buildInlineEditHtml();
  stashModalFormIds();
  document.getElementById('teacherNotesPanel').style.display = 'none';
  document.getElementById('welcomeState').style.display = 'none';
  document.getElementById('detailOuter').style.display = 'flex';
  el.style.display = 'block';
  el.classList.add('on');
  editSurface = 'inline';
  activeId = id;
  const draft = editBatchDrafts[editDraftKey(id)] || null;
  const desmosState = populateTopicForm(id, draft);
  afterEditFormMounted(desmosState);
  setTimeout(() => document.getElementById('fName').focus(), 80);
}

function closeInlineEdit(){
  const id = activeId;
  finishEditSession();
  if(id) viewTopic(id);
}

function closeModal(){
  if(editSurface === 'inline'){ closeInlineEdit(); return; }
  finishEditSession();
}

function populateSel(){
  const sel = document.getElementById('fUnit');
  if(!sel) return;
  const units = getUnits();
  const cur = sel.value && sel.value !== '__add_unit__' ? sel.value : '';
  sel.innerHTML = '<option value="">— No unit —</option>' +
    units.map(u => `<option value="${esc(u)}"${u===cur?' selected':''}>${esc(u)}</option>`).join('') +
    '<option value="__add_unit__">+ Add unit…</option>';
  if(cur) sel.value = cur;
}

function onUnitSelectChange(){
  const sel = document.getElementById('fUnit');
  if(!sel || sel.value !== '__add_unit__') return;
  sel.value = sel.dataset.prevUnit || '';
  showUnitInput();
}

function showUnitInput(){
  const sel = document.getElementById('fUnit');
  const row = document.getElementById('unitInputRow');
  if(sel){
    sel.dataset.prevUnit = sel.value;
    sel.style.display = 'none';
  }
  if(row) row.style.display = 'flex';
  document.getElementById('newUnitInput').value='';
  document.getElementById('newUnitInput').focus();
}
function hideUnitInput(){
  const row = document.getElementById('unitInputRow');
  if(row) row.style.display = 'none';
  const sel = document.getElementById('fUnit');
  if(sel) sel.style.display = '';
}
function confirmAddUnit(){
  const name = document.getElementById('newUnitInput').value.trim();
  if(!name) return;
  const units = getUnits();
  if(!units.includes(name)){ units.push(name); saveUnits(units); }
  populateSel(); document.getElementById('fUnit').value = name; hideUnitInput(); renderPills();
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
  hideTagsSuggest();
}
function removeTag(btn, text){ tempTags = tempTags.filter(t => t !== text); btn.closest('.tag-chip').remove(); }

let tagsSuggestList = [];
let tagsSuggestIndex = 0;

function relatedTermCandidateNames(){
  const names = new Set();
  const taken = new Set(tempTags.map(t => t.toLowerCase()));
  getTopics().forEach(t => {
    if(!t || !t.name) return;
    if(editId != null && t.id === editId) return;
    if(taken.has(String(t.name).toLowerCase())) return;
    names.add(String(t.name));
  });
  return [...names];
}

function tagsMatchDistance(query, name){
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if(!q) return Infinity;
  if(n === q) return 0;
  if(n.startsWith(q)) return 1 + (n.length - q.length) * 0.01;
  const words = n.split(/[\s/_-]+/);
  if(words.some(w => w.startsWith(q))) return 4 + (n.length - q.length) * 0.01;
  if(n.includes(q)) return 8 + n.indexOf(q) * 0.1;
  if(q.length >= 2){
    const window = n.slice(0, Math.min(n.length, q.length + 2));
    const a = q, b = window;
    const prev = new Array(b.length + 1);
    const cur = new Array(b.length + 1);
    for(let j = 0; j <= b.length; j++) prev[j] = j;
    for(let i = 1; i <= a.length; i++){
      cur[0] = i;
      for(let j = 1; j <= b.length; j++){
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      for(let j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    const dist = prev[b.length];
    const maxDist = Math.max(1, Math.floor(q.length / 3));
    if(dist <= maxDist) return 20 + dist;
  }
  return Infinity;
}

function ensureTagsSuggestEl(){
  let box = document.getElementById('tagsSuggest');
  const wrap = document.getElementById('tagsWrap');
  if(!wrap) return null;
  if(!box){
    box = document.createElement('div');
    box.id = 'tagsSuggest';
    box.className = 'tags-suggest';
    box.setAttribute('role', 'listbox');
    wrap.insertAdjacentElement('afterend', box);
  }
  return box;
}

function hideTagsSuggest(){
  tagsSuggestList = [];
  tagsSuggestIndex = 0;
  const box = document.getElementById('tagsSuggest');
  if(box){
    box.classList.remove('open');
    box.innerHTML = '';
  }
}

function renderTagsSuggest(){
  const box = ensureTagsSuggestEl();
  if(!box) return;
  if(!tagsSuggestList.length){
    hideTagsSuggest();
    return;
  }
  box.innerHTML = tagsSuggestList.map((name, i) =>
    `<button type="button" class="tags-suggest-item${i === tagsSuggestIndex ? ' active' : ''}" role="option" aria-selected="${i === tagsSuggestIndex ? 'true' : 'false'}" data-idx="${i}">
      <span>${esc(name)}</span>${i === 0 ? '<kbd>Tab</kbd>' : ''}
    </button>`
  ).join('');
  box.classList.add('open');
  box.querySelectorAll('.tags-suggest-item').forEach(btn => {
    btn.onmousedown = (e) => {
      e.preventDefault();
      tagsSuggestIndex = Number(btn.dataset.idx) || 0;
      acceptTagsSuggest();
    };
  });
}

function updateTagsSuggest(){
  const input = document.getElementById('tagsInput');
  if(!input){ hideTagsSuggest(); return; }
  const q = input.value.trim();
  if(q.length < 1){ hideTagsSuggest(); return; }
  const ranked = relatedTermCandidateNames()
    .map(name => ({ name, score: tagsMatchDistance(q, name) }))
    .filter(x => x.score !== Infinity)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  tagsSuggestList = ranked.slice(0, 6).map(x => x.name);
  tagsSuggestIndex = 0;
  renderTagsSuggest();
}

function acceptTagsSuggest(){
  const input = document.getElementById('tagsInput');
  if(!input || !tagsSuggestList.length) return false;
  const name = tagsSuggestList[tagsSuggestIndex] || tagsSuggestList[0];
  input.value = name;
  hideTagsSuggest();
  input.focus();
  input.setSelectionRange(name.length, name.length);
  return true;
}

document.addEventListener('input', e => {
  if(e.target && e.target.id === 'tagsInput') updateTagsSuggest();
});

document.addEventListener('keydown', e => {
  if(e.target.id !== 'tagsInput') return;
  if(e.key === 'Tab' && tagsSuggestList.length){
    e.preventDefault();
    acceptTagsSuggest();
    return;
  }
  if(e.key === 'ArrowDown' && tagsSuggestList.length){
    e.preventDefault();
    tagsSuggestIndex = (tagsSuggestIndex + 1) % tagsSuggestList.length;
    renderTagsSuggest();
    return;
  }
  if(e.key === 'ArrowUp' && tagsSuggestList.length){
    e.preventDefault();
    tagsSuggestIndex = (tagsSuggestIndex - 1 + tagsSuggestList.length) % tagsSuggestList.length;
    renderTagsSuggest();
    return;
  }
  if(e.key === 'Escape' && tagsSuggestList.length){
    e.preventDefault();
    hideTagsSuggest();
    return;
  }
  if(e.key==='Enter'||e.key===','){
    e.preventDefault();
    const v = e.target.value.replace(',','').trim();
    if(v){ addTag(v); e.target.value=''; }
    hideTagsSuggest();
  }
  if(e.key==='Backspace'&&!e.target.value&&tempTags.length){
    const chips = document.getElementById('tagsWrap').querySelectorAll('.tag-chip');
    if(chips.length) removeTag(chips[chips.length-1].querySelector('button'), tempTags[tempTags.length-1]);
  }
});

document.addEventListener('focusout', e => {
  if(e.target && e.target.id === 'tagsInput'){
    setTimeout(hideTagsSuggest, 120);
  }
});

function applyDraftToTopicList(topics, draft){
  let unit = draft.unit || '';
  if(draft.parentId){
    const parent = topics.find(t => t.id === draft.parentId) || Object.values(editBatchDrafts || {}).find(d => d.id === draft.parentId);
    if(parent) unit = parent.unit || '';
  }
  const topic = {
    id: draft.id,
    name: draft.name.trim(),
    unit,
    definition: draft.definition || '',
    keyPoints: draft.keyPoints || [],
    formula: draft.formula || '',
    materials: draft.materials || '',
    process: draft.process || '',
    safety: draft.safety || '',
    examTip: draft.examTip || '',
    bodyText: draft.bodyText || '',
    pdfData: draft.pdfData || '',
    pdfName: draft.pdfName || '',
    tableData: draft.tableData || { columns: [], rows: [] },
    desmosState: draft.desmosState || null,
    layout: draft.layout || subjectDefaultLayout(),
    relatedTerms: draft.relatedTerms || [],
    flashcardQA: draft.flashcardQA || [],
    parentId: draft.parentId || null,
    addedBy: draft.addedBy || window.currentUid || null,
    createdAt: draft.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  topics = topics.map(t => t.id === draft.id ? topic : t);
  const keptChildIds = new Set();
  (draft.subtopicRows || []).forEach(row => {
    if(row.id){
      topics = topics.map(t => t.id === row.id
        ? { ...t, name: row.name, unit: topic.unit, updatedAt: new Date().toISOString() }
        : t);
      keptChildIds.add(row.id);
    } else {
      const childId = Date.now() + Math.floor(Math.random() * 1000);
      topics.push({
        id: childId,
        name: row.name,
        unit: topic.unit,
        definition: '', keyPoints: [], formula: '', materials: '', process: '', safety: '', examTip: '',
        relatedTerms: [], flashcardQA: [], tableData: { columns: [], rows: [] }, desmosState: null,
        parentId: topic.id,
        addedBy: window.currentUid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      keptChildIds.add(childId);
    }
  });
  const removedChildIds = topics.filter(t => t.parentId === topic.id && !keptChildIds.has(t.id)).map(t => t.id);
  const toRemove = new Set(removedChildIds.flatMap(cid => [cid, ...getDescendantIds(cid, topics)]));
  topics = topics.filter(t => !toRemove.has(t.id));
  // Keep all descendants' units in sync with this topic's unit
  const descIds = new Set(getDescendantIds(topic.id, topics));
  return topics.map(t => descIds.has(t.id) ? { ...t, unit: topic.unit } : t);
}

function saveTopic(){
  if(!canEditClassTopics()){ showToast('Only teachers can add or edit class topics','info'); return; }

  if(editSurface === 'inline'){
    const name = document.getElementById('fName')?.value.trim();
    if(!name){ document.getElementById('fName').focus(); return; }
    stashCurrentEditDraft();
    const drafts = collectDirtyEditDrafts();
    if(!drafts.length){
      const viewId = editId;
      finishEditSession();
      renderList();
      viewTopic(viewId);
      return;
    }
    for(const d of drafts){
      if(!String(d.name || '').trim()){
        startInlineEdit(d.id, { fromSwitch: true });
        showToast('Every edited topic needs a name', 'info');
        document.getElementById('fName')?.focus();
        return;
      }
    }
    drafts.sort((a, b) => {
      const depth = (d) => {
        let n = 0, pid = d.parentId;
        while(pid != null && pid !== '' && n < 30){
          n++;
          const parent = drafts.find(x => x.id === pid);
          pid = parent ? parent.parentId : null;
          if(!parent) break;
        }
        return n;
      };
      return depth(a) - depth(b);
    });
    let viewId = editId;
    let topics = getTopics();
    drafts.forEach(d => { topics = applyDraftToTopicList(topics, d); });
    saveTopics(topics);
    finishEditSession();
    renderList();
    viewTopic(viewId);
    return;
  }

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
    const childId = row.dataset.childId ? Number(row.dataset.childId) : null;
    return name ? { id: childId, name } : null;
  }).filter(Boolean);
  const ex = editId ? (getTopics().find(t => t.id===editId)||{}) : {};
  const newDesmosState = readDesmosState();
  let unit = (() => { const v = document.getElementById('fUnit').value; return v === '__add_unit__' ? '' : v; })();
  if(ex.parentId){
    const parent = getTopics().find(t => t.id === ex.parentId);
    if(parent) unit = parent.unit || '';
  }
  const topic = {
    id: editId || Date.now(),
    name,
    unit,
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
    desmosState: newDesmosState !== null ? newDesmosState : (ex.desmosState || null),
    layout:    currentLayout,
    relatedTerms,
    flashcardQA,
    parentId: ex.parentId || null,
    addedBy: ex.addedBy || window.currentUid || null,
    createdAt: ex.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  let topics = getTopics();
  topics = editId ? topics.map(t => t.id===editId ? topic : t) : [...topics, topic];

  const keptChildIds = new Set();
  subtopicRows.forEach(row => {
    if(row.id){
      topics = topics.map(t => t.id===row.id ? { ...t, name: row.name, unit: topic.unit, updatedAt: new Date().toISOString() } : t);
      keptChildIds.add(row.id);
    } else {
      const childId = Date.now() + Math.floor(Math.random()*1000);
      topics.push({
        id: childId,
        name: row.name,
        unit: topic.unit,
        definition: '', keyPoints: [], formula: '', materials: '', process: '', safety: '', examTip: '',
        relatedTerms: [], flashcardQA: [], tableData: { columns: [], rows: [] }, desmosState: null,
        parentId: topic.id,
        addedBy: window.currentUid || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      keptChildIds.add(childId);
    }
  });
  const removedChildIds = topics.filter(t => t.parentId === topic.id && !keptChildIds.has(t.id)).map(t => t.id);
  const toRemove = new Set(removedChildIds.flatMap(cid => [cid, ...getDescendantIds(cid, topics)]));
  topics = topics.filter(t => !toRemove.has(t.id));
  const descIds = new Set(getDescendantIds(topic.id, topics));
  topics = topics.map(t => descIds.has(t.id) ? { ...t, unit: topic.unit } : t);

  saveTopics(topics); finishEditSession(); renderList(); viewTopic(topic.id);
}

// ── Delete confirm ──
function confirmDeleteTopic(id){
  if(!canEditClassTopics()){ showToast('Only teachers can delete class topics','info'); return; }
  const t = getTopics().find(x => x.id==id);
  pendingAction = { type:'topic', id };
  document.getElementById('cTitle').textContent = 'Delete this topic?';
  document.getElementById('cMsg').textContent = '"'+t.name+'" will be permanently removed.';
  document.getElementById('confirmOverlay').classList.add('open');
}
function confirmDeleteUnit(name){
  if(!canEditClassTopics()){ showToast('Only teachers can change class units','info'); return; }
  const count = getTopics().filter(t => t.unit===name).length;
  pendingAction = { type:'unit', name };
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
  if(!canEditClassTopics()){ showToast('Only teachers can change class topics','info'); closeConfirm(); return; }
  if(!pendingAction) return;
  if(pendingAction.type==='topic'){
    const topics = getTopics();
    const toRemove = new Set([pendingAction.id, ...getDescendantIds(pendingAction.id, topics)]);
    saveTopics(topics.filter(t => !toRemove.has(t.id)));
    if(activeId==pendingAction.id) closeTopicView();
  } else {
    saveTopics(getTopics().map(t => t.unit===pendingAction.name ? {...t,unit:''} : t));
    saveUnits(getUnits().filter(u => u!==pendingAction.name));
    activeUnits.delete(pendingAction.name);
    populateSel();
  }
  closeConfirm(); renderList();
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if(e.key==='Escape'){
    closeModal(); closeConfirm();
    if(typeof closeSuggestions === 'function') closeSuggestions();
  }
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

function syncPush(key, data){
  try{
    const id = 'sf'+Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = id; iframe.style.cssText='display:none;width:0;height:0;border:0';
    const form = document.createElement('form');
    form.method='POST'; form.action=SYNC_URL; form.target=id; form.style.display='none';
    [['key',key],['data',JSON.stringify(data)]].forEach(([n,v]) => {
      const inp = document.createElement('input'); inp.type='hidden'; inp.name=n; inp.value=v; form.appendChild(inp);
    });
    document.body.appendChild(iframe); document.body.appendChild(form); form.submit();
    setTimeout(() => { if(iframe.parentNode)iframe.parentNode.removeChild(iframe); if(form.parentNode)form.parentNode.removeChild(form); }, 6000);
    setSyncStatus('ok');
  } catch(e){ setSyncStatus('err'); }
}


async function syncPull(){
  setSyncStatus('syncing');
  const PLACEHOLDER = '[image — only visible on device where it was saved]';
  try{
    for(const key of [ST, SU]){
      const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(key));
      if(res && res.data !== null && res.data !== undefined){
        if(key===ST && Array.isArray(res.data)){
          let local = [];
          try { local = JSON.parse(localStorage.getItem(ST)||'[]'); } catch(e) { local = []; }
          if(!Array.isArray(local)) local = [];
          const merged = res.data.map(rem => {
            const loc = local.find(t => t.id == rem.id);
            if(!loc) return rem;
            const m = {...rem};
            if((m.parentId == null || m.parentId === '') && loc.parentId != null && loc.parentId !== ''){
              m.parentId = loc.parentId;
            }
            Object.keys(m).forEach(k => {
              if(typeof m[k]==='string' && m[k].includes(PLACEHOLDER) &&
                 loc[k] && typeof loc[k]==='string' && !loc[k].includes(PLACEHOLDER)){
                m[k] = loc[k];
              }
            });
            return m;
          });
          local.forEach(lt => { if(!merged.find(t => t.id===lt.id)) merged.push(lt); });
          localStorage.setItem(key, JSON.stringify(merged));
        } else {
          localStorage.setItem(key, JSON.stringify(res.data));
        }
      }
    }
    // Pull shared teacher notes
    const tnRes = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(TN_KEY()));
    if(tnRes && tnRes.data !== null && tnRes.data !== undefined){
      localStorage.setItem(TN_KEY(), JSON.stringify(tnRes.data));
      if(activeId) viewTopic(activeId);
    }
    setSyncStatus('ok');
    renderList();
  } catch(e){ setSyncStatus('err'); }
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
function extractDriveFileId(url){
  if(!url) return '';
  return (String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/) || String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || '';
}

function driveImageCandidates(urlOrId, fallbackB64){
  const id = extractDriveFileId(urlOrId) || (/^[a-zA-Z0-9_-]{10,}$/.test(String(urlOrId||'')) ? urlOrId : '');
  const list = [];
  if(id){
    list.push('https://drive.google.com/thumbnail?id=' + id + '&sz=w1000');
    list.push('https://lh3.googleusercontent.com/d/' + id + '=s900');
    list.push('https://lh3.googleusercontent.com/d/' + id);
  }
  if(urlOrId && /^https?:\/\//i.test(urlOrId) && !list.includes(urlOrId)
      && !/thumbnail\?id=/i.test(urlOrId) && !/lh3\.googleusercontent\.com/i.test(urlOrId)){
    list.push(urlOrId);
  }
  if(fallbackB64 && /^data:image\//i.test(fallbackB64)) list.push(fallbackB64);
  return list;
}

function preferredDriveImageUrl(urlOrId){
  const id = extractDriveFileId(urlOrId);
  return id ? ('https://drive.google.com/thumbnail?id=' + id + '&sz=w1000') : (urlOrId || '');
}

function attachImgFallback(img){
  if(!img || img.dataset.fbWired === '1') return;
  img.dataset.fbWired = '1';
  const src = img.getAttribute('src') || '';
  const id = img.dataset.driveId || extractDriveFileId(src);
  if(id) img.dataset.driveId = id;
  const candidates = driveImageCandidates(src || id, img.dataset.fallback || '');
  if(!candidates.length) return;
  let step = Math.max(0, candidates.indexOf(src));
  const tryNext = () => {
    step++;
    if(step < candidates.length){
      img.src = candidates[step];
    } else {
      img.removeEventListener('error', tryNext);
      img.alt = 'Image unavailable';
      img.classList.add('img-broken');
    }
  };
  img.addEventListener('error', tryNext);
  if(id && /^https:\/\/lh3\.googleusercontent\.com\//i.test(src)){
    step = -1;
    tryNext();
    return;
  }
  if(img.complete && img.naturalWidth === 0){
    step = -1;
    tryNext();
  }
}

function wireRichImages(root){
  if(!root) return;
  root.querySelectorAll('img').forEach(attachImgFallback);
}

function makeUploadedImg(url, fallbackB64){
  const img = document.createElement('img');
  img.alt = '';
  const id = extractDriveFileId(url);
  if(id) img.dataset.driveId = id;
  if(fallbackB64) img.dataset.fallback = fallbackB64;
  img.src = preferredDriveImageUrl(url) || url || fallbackB64 || '';
  attachImgFallback(img);
  return img;
}

function pollUploadResult(uid, ph) {
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    try {
      const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent('_ur_'+uid));
      if(res && res.data){ clearInterval(poll);
        const url = res.data.ok && (res.data.url || res.data.id) ? (res.data.url || res.data.id) : '';
        const img = makeUploadedImg(url, ph._b64);
        if(!url && ph._b64) img.src = ph._b64;
        ph.replaceWith(img);
      }
    } catch(e) {}
    if(tries >= 30){ clearInterval(poll); ph.replaceWith(makeUploadedImg('', ph._b64)); }
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
      syncPush('_up_' + uid, { image: b64, filename: 'sb_' + uid + '.jpg' });
      pollUploadResult(uid, ph);
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
  if(input) input.value = unit;
  activeUnits.add(unit);
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
  setTimeout(() => syncPull(), 10000);
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
        var topics = JSON.parse(localStorage.getItem(ST) || '[]');
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
    const ic=document.createElement('span');ic.textContent=icons[type]||'ℹ';
    const tx=document.createElement('span');tx.textContent=String(msg==null?'':msg);
    t.appendChild(ic);t.appendChild(tx);
    c.appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),350);},duration);
  };
})();

// ── AI Fill Gaps (via /api/grade — never a client-side API key) ──
async function callGradeGemini(prompt){
  const currentUser = window.__sbAuth && window.__sbAuth.currentUser;
  if(!currentUser) throw new Error('Sign in to use AI fill');
  const res = await fetch('/api/grade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + await currentUser.getIdToken()
    },
    body: JSON.stringify({ provider: 'gemini', prompt })
  });
  const contentType = res.headers.get('content-type') || '';
  if(!contentType.includes('application/json')) throw new Error('AI fill needs the live site');
  const data = await res.json().catch(() => ({}));
  if(res.status === 429) throw new Error('RATE_LIMIT');
  if(!res.ok) throw new Error(data.error || ('API error ' + res.status));
  return data.text || '';
}

// ── AI Fill inside the modal ──
// Reads the current form state (name + any existing field values) and fills
// only the empty / missing fields, writing the results directly into the form.
async function aiFillModal(){
  if(!canEditClassTopics()){ showToast('Only teachers can add or edit class topics','info'); return; }
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
    let text = await callGradeGemini(prompt);
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
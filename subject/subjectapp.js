// ── Resolve subject from URL hash ──
let SUBJECT = null; // the matched entry from subjectsData
let ST = '';        // localStorage key for topics
let SU = '';        // localStorage key for units
let SP = '';        // localStorage key for pinned topics
let DEF_UNITS = []; // default units if none saved

// Classes whose subjectId points at this subject. Their own topics/units are
// always recorded separately (under each class's own storageKey/unitsKey) —
// the subject page only reads them in to display alongside its own content.
// See topicsForOrigin()/renderClassSections() below.
let LINKED_CLASSES = [];

function resolveSubject(){
  const id = window.location.hash.slice(1);
  if(!id || typeof subjectsData === 'undefined'){
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#c00">No subject specified. <a href="../index.html">Go back to index.</a></p>';
    return false;
  }
  SUBJECT = (subjectsData.subjects || []).find(s => s.id === id);
  if(!SUBJECT){
    document.body.innerHTML = `<p style="padding:40px;font-family:sans-serif;color:#c00">Unknown subject "${id}". <a href="../index.html">Go back to index.</a></p>`;
    return false;
  }
  ST = SUBJECT.storageKey || (id + '_topics');
  SU = SUBJECT.unitsKey   || (id + '_units');
  SP = SUBJECT.pinnedKey  || (id + '_pinned_topics');
  LINKED_CLASSES = (typeof classesData !== 'undefined' && classesData.subjects || [])
    .filter(c => c.subjectId === SUBJECT.id);
  return true;
}

// ── Subject / Classes sidebar tab switcher ──
let sidebarTab = 'subject';
function setSidebarTab(tab){
  sidebarTab = tab;
  document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const show = (el, on) => { if(el) el.style.display = on ? '' : 'none'; };
  show(document.getElementById('unitWrap'), tab === 'subject');
  show(document.getElementById('topicList'), tab === 'subject');
  show(document.getElementById('classSelectWrap'), tab === 'classes');
  show(document.getElementById('classSections'), tab === 'classes');
  if(tab === 'classes') renderClassSections();
}
function initSidebarTabs(){
  const tabs = document.getElementById('sidebarTabs');
  if(!tabs) return;
  tabs.style.display = LINKED_CLASSES.length ? '' : 'none';
  populateClassSelect();
  setSidebarTab('subject');
}

function applySubjectTheme(){
  const c = SUBJECT.colour;
  document.documentElement.style.setProperty('--accent', c);
  const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  document.documentElement.style.setProperty('--ac-l', `rgba(${r},${g},${b},.07)`);
  document.documentElement.style.setProperty('--ac-b', `rgba(${r},${g},${b},.22)`);

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
function toggleDark(){
  const on = document.body.classList.toggle('dark');
  localStorage.setItem('studybase_dark', on ? '1' : '0');
  document.getElementById('darkToggle').textContent = on ? '☀️' : '🌙';
}

// ── Sidebar collapse (desktop) ──
// Shared with class.html via the same localStorage key, so collapsing it on
// one page keeps it collapsed on the other.
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
function sanitizeRich(html){
  if(!html)return'';
  const d=document.createElement('div'); d.innerHTML=html;
  d.querySelectorAll('script,style,iframe,object,embed,link').forEach(e=>e.remove());
  d.querySelectorAll('img').forEach(img=>{
    const src=img.src||img.getAttribute('src')||'';
    if(!src.startsWith('data:')&&!src.startsWith('https://drive.google.com/')&&!src.startsWith('https://lh3.googleusercontent.com/'))img.remove();
  });
  return d.innerHTML;
}

// ── Storage helpers ──
const CELL_LIMIT = 45000;
const getTopics  = () => { try{ return JSON.parse(localStorage.getItem(ST)||'[]'); }catch(e){ return []; } };
const getUnits   = () => { try{ return JSON.parse(localStorage.getItem(SU)||JSON.stringify(DEF_UNITS)); }catch(e){ return []; } };
const getPinned  = () => { try{ return JSON.parse(localStorage.getItem(SP)||'[]'); }catch(e){ return []; } };

// `activeOrigin` is null while viewing/editing the subject's own content, or
// one of LINKED_CLASSES while viewing a class's aggregated (read-only) topic.
let activeOrigin = null;
let _lastRenderedTopicKey = null;
let openCommentBlocks = new Set();

// Read-only accessors into a linked class's own storage — used only by the
// aggregated "From your classes" sidebar sections and the read-only detail
// view. Never written to from here; classes only ever save through their own
// class.html/classapp.js, keeping each class's content genuinely separate.
function topicsForOrigin(origin){
  if(!origin) return getTopics();
  try{ return JSON.parse(localStorage.getItem(origin.storageKey || (origin.id + '_topics')) || '[]'); }catch(e){ return []; }
}
function unitsForOrigin(origin){
  if(!origin) return getUnits();
  try{ return JSON.parse(localStorage.getItem(origin.unitsKey || (origin.id + '_units')) || '[]'); }catch(e){ return []; }
}

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
const LAYOUTS = ['basic','overview','math','text','pdf'];
const LAYOUT_LABELS = { basic:'Basic', overview:'Overview', math:'Math', text:'Text', pdf:'PDF' };
let currentLayout = 'basic';

// ── PDF topic type ──
// PDFs are embedded as base64 data URLs directly on the topic (like the
// rich-text image uploads, but simpler — no server round trip). This bloats
// sync payloads for large files, so we cap it rather than let it silently
// break syncPush/localStorage.
const PDF_MAX_BYTES = 6 * 1024 * 1024; // ~6MB (base64 already ~33% bigger than the raw file)
let pendingPdfData = null;   // null = no change; '' = explicitly removed; string = new data URL
let pendingPdfName = null;

function onPdfFileSelected(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  if(file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){
    showToast('Please choose a PDF file', 'info'); return;
  }
  if(file.size > PDF_MAX_BYTES){
    showToast(`PDF is too large (${(file.size/1024/1024).toFixed(1)}MB) — max ${(PDF_MAX_BYTES/1024/1024).toFixed(0)}MB`, 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    pendingPdfData = e.target.result;
    pendingPdfName = file.name;
    renderPdfPreview();
  };
  reader.readAsDataURL(file);
}

function removePdfFile(){
  pendingPdfData = '';
  pendingPdfName = '';
  renderPdfPreview();
}

function renderPdfPreview(){
  const area = document.getElementById('pdfPreviewArea');
  if(!area) return;
  const ex = editId ? (getTopics().find(t => t.id===editId)||{}) : {};
  const name = pendingPdfData !== null ? pendingPdfName : (ex.pdfName || '');
  const hasFile = pendingPdfData !== null ? !!pendingPdfData : !!ex.pdfData;
  area.innerHTML = hasFile
    ? `<div class="pdf-picked-row"><span class="pdf-picked-name">📄 ${esc(name || 'document.pdf')}</span>
        <button type="button" class="btn-small" onclick="document.getElementById('fPdfFile').click()">Replace</button>
        <button type="button" class="btn-small" onclick="removePdfFile()">Remove</button></div>`
    : `<button type="button" class="btn-small" onclick="document.getElementById('fPdfFile').click()">+ Choose PDF</button>`;
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
// When viewing an aggregated class topic (activeOrigin set), notes are kept
// in that class's own tnotes bucket — not the subject's — so a comment
// posted here is the same comment you'd see on the class page, not a
// separate copy.
const TN_KEY = () => 'tnotes_' + (activeOrigin ? activeOrigin.id : (SUBJECT ? SUBJECT.id : 'default'));
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
function sectionHtml(topicId, icon, label, block, bodyHtml){
  return `<div class="section" data-block="${block}">
    <div class="section-header">
      <span class="sh-label-wrap"><span class="sh-icon">${icon}</span>${label}</span>
    </div>
    <div class="section-body">${bodyHtml}</div>
  </div>`;
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

// Builds a single-quoted JS string literal (or the bare word null) safe to
// splice into an onclick="..." attribute. JSON.stringify() must NOT be used
// here — it wraps the value in double quotes, which prematurely closes the
// surrounding onclick="..." attribute and silently breaks the click handler.
function jsArg(v){
  if(v == null) return 'null';
  return "'" + String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'") + "'";
}

function getDescendantIds(id, topics){
  const direct = topics.filter(t => t.parentId === id).map(t => t.id);
  return direct.concat(direct.flatMap(cid => getDescendantIds(cid, topics)));
}

// ── State ──
let activeId = null, editId = null, activeUnit = 'all', tempTags = [], pendingAction = null;
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
  const matches = t => {
    const mu = activeUnit === 'all' || t.unit === activeUnit;
    const mq = !q || t.name.toLowerCase().includes(q) ||
      (t.definition||'').toLowerCase().includes(q) ||
      (t.unit||'').toLowerCase().includes(q) ||
      (t.relatedTerms||[]).some(r => r.toLowerCase().includes(q));
    return mu && mq;
  };
  const topLevel = topics.filter(t => !t.parentId && matches(t)).sort((a,b) => {
    const ap = pinned.includes(a.id), bp = pinned.includes(b.id);
    if(ap && !bp) return -1;
    if(!ap && bp) return 1;
    return a.name.localeCompare(b.name);
  });

  document.getElementById('topicList').innerHTML = topLevel.length === 0
    ? `<div class="sidebar-empty">${q ? 'No results for "'+esc(q)+'"' : 'No topics yet.<br>Click <strong>+ New topic</strong> to begin.'}</div>`
    : topLevel.map(t => {
        const isPinned = pinned.includes(t.id);
        const children = topics.filter(c => c.parentId === t.id);
        const hasSubs = children.length > 0;
        const isExpanded = hasSubs && expandedTopics.has(t.id);
        const subListHtml = isExpanded
          ? `<div class="subtopic-sidebar-list">` + children.map(c => renderSubtree(c, topics)).join('') + `</div>`
          : '';
        return `
        <div class="topic-item-wrap">
          <div class="topic-item${(t.id==activeId && !activeOrigin)?' active':''}${isPinned?' pinned':''}" onclick="viewTopic(${t.id})">
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
  renderClassSections();
}

// ── Aggregated read-only class content ──
// Each linked class keeps recording its own content separately (own
// storageKey/unitsKey, only ever written by class.html/classapp.js) — this
// just reads it back in and displays it on the Classes tab, using the exact
// same topic-list/topic-item markup and behaviour as the Subject tab (just
// scoped to whichever class is picked in the dropdown, and read-only).
let activeClassId = null;

function populateClassSelect(){
  const sel = document.getElementById('classSelect');
  if(!sel) return;
  if(!activeClassId || !LINKED_CLASSES.find(c => c.id === activeClassId)){
    activeClassId = LINKED_CLASSES.length ? LINKED_CLASSES[0].id : null;
  }
  sel.innerHTML = LINKED_CLASSES.map(c =>
    `<option value="${esc(c.id)}"${c.id===activeClassId?' selected':''}>${esc(c.emoji||'🏫')} ${esc(c.name)}${c.class?' · '+esc(c.class):''}</option>`
  ).join('');
}

function setActiveClass(id){
  activeClassId = id;
  renderClassSections();
}

function renderClassNode(t, topics, cls){
  const children = topics.filter(k => k.parentId === t.id);
  const hasKids = children.length > 0;
  const isExpanded = hasKids && expandedTopics.has(t.id);
  const originArg = jsArg(cls.id);
  const childrenHtml = isExpanded
    ? `<div class="subtopic-sidebar-list">` + children.map(c => renderClassNode(c, topics, cls)).join('') + `</div>`
    : '';
  const isActive = t.id == activeId && activeOrigin && activeOrigin.id === cls.id;
  return `
    <div class="topic-item-wrap">
      <div class="topic-item${isActive ? ' active' : ''}" onclick="viewTopic(${t.id}, ${originArg})">
        <div class="ti-top">
          <div class="ti-name">
            ${hasKids ? `<button class="ti-expand-btn" onclick="event.stopPropagation();toggleTopicExpand(${t.id})" title="${isExpanded?'Collapse':'Expand'}">${isExpanded?'▾':'▸'}</button>` : ''}
            ${esc(t.name)}
          </div>
        </div>
        ${t.unit ? `<div class="ti-unit">${esc(t.unit)}</div>` : ''}
        ${t.definition ? `<div class="ti-prev">${esc(t.definition.substring(0,55))}…</div>` : ''}
      </div>
      ${childrenHtml}
    </div>`;
}

function renderClassSections(){
  const container = document.getElementById('classSections');
  if(!container) return;
  if(!LINKED_CLASSES.length){ container.innerHTML = ''; return; }
  populateClassSelect();
  const cls = LINKED_CLASSES.find(c => c.id === activeClassId);
  if(!cls){ container.innerHTML = ''; return; }

  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const matches = t => !q || t.name.toLowerCase().includes(q) ||
    (t.definition||'').toLowerCase().includes(q) || (t.unit||'').toLowerCase().includes(q);

  const topics = topicsForOrigin(cls);
  const topLevel = topics.filter(t => !t.parentId && matches(t)).sort((a,b) => a.name.localeCompare(b.name));

  container.innerHTML = topLevel.length === 0
    ? `<div class="sidebar-empty">${q ? 'No results for "'+esc(q)+'"' : 'No topics in this class yet.'}</div>`
    : topLevel.map(t => renderClassNode(t, topics, cls)).join('');
}

function renderPills(){
  const units = getUnits(), topics = getTopics(), counts = {};
  topics.forEach(t => { if(t.unit) counts[t.unit] = (counts[t.unit]||0)+1; });
  const sel = document.getElementById('unitSelect');
  if(sel){
    sel.innerHTML = `<option value="all">All (${topics.length})</option>` +
      units.map(u => `<option value="${esc(u)}"${activeUnit===u?' selected':''}>${esc(u)} (${counts[u]||0})</option>`).join('');
    sel.value = activeUnit;
  }
  const delBtn = document.getElementById('unitDelBtn');
  if(delBtn) delBtn.style.display = (activeUnit !== 'all') ? '' : 'none';
}

function setUnit(u){ activeUnit = u; renderList(); }

function toggleTopicExpand(id){
  id = Number(id);
  if(expandedTopics.has(id)) expandedTopics.delete(id);
  else expandedTopics.add(id);
  renderList();
}

// ── Topic detail ──
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

function viewTopic(id, originId){
  originId = originId || null;
  const origin = originId ? LINKED_CLASSES.find(c => c.id === originId) : null;
  activeId = id;
  activeOrigin = origin;
  const allTopics = topicsForOrigin(origin);
  const t = allTopics.find(x => x.id == id);
  if(!t) return;
  const oid = jsArg(origin ? origin.id : null);
  const renderKey = id + '::' + (origin ? origin.id : '');
  const isTopicSwitch = renderKey !== _lastRenderedTopicKey;
  if(isTopicSwitch) openCommentBlocks = new Set();
  // Collapse everything except the path down to the newly selected topic
  expandedTopics = new Set();
  let cur = t;
  while(cur.parentId){
    const parent = allTopics.find(x => x.id === cur.parentId);
    if(!parent) break;
    expandedTopics.add(parent.id);
    cur = parent;
  }
  if(allTopics.some(c => c.parentId === t.id)) expandedTopics.add(Number(id));
  if(!origin && location.protocol !== 'file:') history.replaceState(null,'', '#' + SUBJECT.id);
  renderList();

  document.getElementById('welcomeState').style.display = 'none';
  const outer = document.getElementById('detailOuter');
  const el    = document.getElementById('detailContent');
  if(isTopicSwitch) el.classList.remove('on');

  const layout = t.layout || 'basic';
  const children = allTopics.filter(c => c.parentId === t.id);

  const kpHtml = (t.keyPoints||[]).length
    ? `<ul class="key-points">${t.keyPoints.map(k=>`<li class="kp-item"><div class="kp-dot"></div><span>${esc(k)}</span></li>`).join('')}</ul>`
    : '<p class="empty-note">No key points added yet.</p>';

  const relHtml = (t.relatedTerms||[]).length
    ? `<div class="related-tags">${t.relatedTerms.map(r => {
        const m = allTopics.find(x => x.name.toLowerCase()===r.toLowerCase());
        return `<span class="rtag"${m?` onclick="viewTopic(${m.id}, ${oid})"`:''}>${esc(r)}</span>`;
      }).join('')}</div>`
    : '<p class="empty-note">None listed.</p>';

  const subtopicsHtml = children.length
    ? `<div class="related-tags">${children.map(c => `<span class="rtag" onclick="viewTopic(${c.id}, ${oid})">${esc(c.name)}</span>`).join('')}</div>`
    : '<p class="empty-note">No subtopics yet.</p>';

  const created = new Date(t.createdAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const editedStr = t.updatedAt && t.updatedAt !== t.createdAt
    ? '<span class="dh-date">· Edited '+new Date(t.updatedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+'</span>' : '';

  // visibleBlocks tracks each section for sidebar alignment
  const visibleBlocks = [];
  const sec = (block, label, icon, bodyHtml) => {
    visibleBlocks.push({ block, label, icon });
    return sectionHtml(t.id, icon, label, block, bodyHtml);
  };

  let bodyHtml = '';
  if(layout === 'overview'){
    bodyHtml += sec('bodyText', 'Overview', '📖',
      t.bodyText ? `<div class="plain-text">${sanitizeRich(t.bodyText)}</div>` : '<p class="empty-note">No overview written yet.</p>');
    const ovwItems = [];
    (t.keyPoints||[]).forEach(k => ovwItems.push(`<li class="ovw-list-item ovw-kp-item"><div class="kp-dot"></div><span>${esc(k)}</span></li>`));
    children.forEach(c => ovwItems.push(`<li class="ovw-list-item ovw-subtopic-item"><div class="kp-dot kp-dot-link"></div><a class="subtopic-link" href="javascript:void(0)" onclick="viewTopic(${c.id}, ${oid})">${esc(c.name)}</a><span class="ovw-subtopic-badge">subtopic →</span></li>`));
    if(ovwItems.length) bodyHtml += sec('overviewPoints', 'Points & Subtopics', '📋', `<ul class="ovw-list">${ovwItems.join('')}</ul>`);
  } else if(layout === 'math'){
    bodyHtml += sec('formula', 'Formula / Equation', '∑',
      t.formula ? `<div class="formula-box">${sanitizeRich(t.formula)}</div>` : '<p class="empty-note">No formula added yet.</p>');
    bodyHtml += sec('flashcardQA', 'Flashcard Questions', '🃏',
      (t.flashcardQA||[]).length ? qaRowsHtml(t) : '<p class="empty-note">No flashcard questions yet.</p>');
    bodyHtml += sec('desmos', 'Desmos Graph', '📐', '<p class="empty-note">Desmos support is coming soon.</p>');
  } else if(layout === 'text'){
    bodyHtml += sec('bodyText', 'Main Text', '📄',
      t.bodyText ? `<div class="plain-text">${sanitizeRich(t.bodyText)}</div>` : '<p class="empty-note">No text added yet.</p>');
    bodyHtml += sec('keyPoints', 'Points of Interest', '✦', kpHtml);
  } else if(layout === 'pdf'){
    bodyHtml += sec('pdfDoc', 'PDF Document', '📄',
      t.pdfData
        ? `<div class="pdf-viewer-wrap"><iframe class="pdf-viewer" src="${t.pdfData}" title="${esc(t.pdfName||'PDF document')}"></iframe>
            <a class="pdf-open-link" href="${t.pdfData}" download="${esc(t.pdfName||'document.pdf')}">⬇ ${esc(t.pdfName||'document.pdf')}</a></div>`
        : '<p class="empty-note">No PDF uploaded yet.</p>');
  } else { // basic
    bodyHtml += sec('definition', 'Definition', '📝',
      t.definition ? `<p class="def-text">${esc(t.definition)}</p>` : '<p class="empty-note">No definition added yet.</p>');
    bodyHtml += sec('keyPoints', 'Key Points', '✦', kpHtml);
    if(t.formula)                  bodyHtml += sec('formula',     'Formula / Equation', '∑',  `<div class="formula-box">${sanitizeRich(t.formula)}</div>`);
    if(t.materials)                bodyHtml += sec('materials',   'Extra Notes',        '📋', `<p class="plain-text">${sanitizeRich(t.materials)}</p>`);
    if(t.process)                  bodyHtml += sec('process',     'Process / Method',   '⚙',  `<div class="formula-box">${sanitizeRich(t.process)}</div>`);
    if(t.safety)                   bodyHtml += sec('safety',      'Safety / Warnings',  '⚠',  `<div class="warning-box">${sanitizeRich(t.safety)}</div>`);
    if(t.examTip)                  bodyHtml += sec('examTip',     'Exam Tip',           '⚡', `<div class="exam-tip">${sanitizeRich(t.examTip)}</div>`);
    if((t.flashcardQA||[]).length) bodyHtml += sec('flashcardQA', 'Flashcard Questions','🃏', qaRowsHtml(t));
  }

  // Common to every layout: subtopics, then related terms
  bodyHtml += sec('subtopics',    'Subtopics',     '🧩', subtopicsHtml);
  bodyHtml += sec('relatedTerms', 'Related Terms', '🔗', relHtml);

  const ancestorChain = [];
  { let c2 = t;
    while(c2.parentId){ const p = allTopics.find(x => x.id === c2.parentId); if(!p) break; ancestorChain.unshift(p); c2 = p; } }

  const originBadge = origin
    ? `<span class="dh-unit" style="background:${origin.colour}22;color:${origin.colour};border-color:${origin.colour}55">${esc(origin.emoji||'🏫')} From ${esc(origin.name)}${origin.class?' · '+esc(origin.class):''}</span>`
    : '';

  el.innerHTML = `
      <div class="dh">
        <div>
          <div class="dh-name">${ancestorChain.length ? `${ancestorChain.map(a=>esc(a.name)).join(' <span class="dh-crumb-sep">›</span> ')} <span class="dh-sub-badge">${esc(t.name)}</span>` : esc(t.name)}</div>
          <div class="dh-meta">
            ${originBadge}
            ${t.unit ? `<span class="dh-unit">${esc(t.unit)}</span>` : ''}
            <span class="dh-date">Added ${created}</span>${editedStr}
          </div>
        </div>
        <div class="dh-actions">
          ${(window.isGuest || origin) ? '' : `<button class="btn-act" onclick="openModal(${t.id})">Edit</button>
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
}
function openModal(id){
  if(window.isGuest){ showToast('Sign in to add or edit topics','info'); return; }
  if(id && activeOrigin){ showToast("This topic belongs to a class — edit it from that class's page", 'info'); return; }
  // Teachers and devs can add/edit topics just like students
  editId = id || null;
  tempTags = [];
  document.getElementById('kpList').innerHTML = '';
  document.getElementById('subtopicEditorList').innerHTML = '';
  document.getElementById('tagsWrap').querySelectorAll('.tag-chip').forEach(e => e.remove());
  populateSel();
  if(id){
    const t = getTopics().find(x => x.id == id);
    document.getElementById('modalTitle').textContent = 'Edit topic';
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
    getTopics().filter(c => c.parentId === t.id).forEach(c => addSubtopicRow(c));
    document.getElementById('fqaList').innerHTML = '';
    (t.flashcardQA||[]).forEach(qa => addFqaRow(qa.q, qa.a));
    currentLayout = LAYOUTS.includes(t.layout) ? t.layout : 'basic';
    pendingPdfData = null; pendingPdfName = null;
  } else {
    document.getElementById('modalTitle').textContent = 'New topic';
    ['fName','fDefinition'].forEach(i => document.getElementById(i).value = '');
    ['fFormula','fMaterials','fProcess','fSafety','fExamTip','fBodyText'].forEach(clearRich);
    document.getElementById('fUnit').value = '';
    document.getElementById('fqaList').innerHTML = '';
    currentLayout = 'basic';
    pendingPdfData = null; pendingPdfName = null;
  }
  renderPdfPreview();
  applyLayoutUI();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 80);
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); editId = null; }

function populateSel(){
  const units = getUnits(), sel = document.getElementById('fUnit'), cur = sel.value;
  sel.innerHTML = '<option value="">— No unit —</option>' +
    units.map(u => `<option value="${esc(u)}"${u===cur?' selected':''}>${esc(u)}</option>`).join('');
}
function showUnitInput(){ document.getElementById('unitInputRow').style.display='block'; document.getElementById('newUnitInput').value=''; document.getElementById('newUnitInput').focus(); document.getElementById('btnAddUnit').style.display='none'; }
function hideUnitInput(){ document.getElementById('unitInputRow').style.display='none'; document.getElementById('btnAddUnit').style.display=''; }
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
    const childId = row.dataset.childId ? Number(row.dataset.childId) : null;
    return name ? { id: childId, name } : null;
  }).filter(Boolean);
  const ex = editId ? (getTopics().find(t => t.id===editId)||{}) : {};
  const topic = {
    id: editId || Date.now(),
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

  // Sync linked subtopics (child topics) against the rows in the editor
  const keptChildIds = new Set();
  subtopicRows.forEach(row => {
    if(row.id){
      // update existing child topic's name
      topics = topics.map(t => t.id===row.id ? { ...t, name: row.name, updatedAt: new Date().toISOString() } : t);
      keptChildIds.add(row.id);
    } else {
      // create a new linked child topic
      const childId = Date.now() + Math.floor(Math.random()*1000);
      topics.push({
        id: childId,
        name: row.name,
        unit: topic.unit,
        definition: '', keyPoints: [], formula: '', materials: '', process: '', safety: '', examTip: '',
        relatedTerms: [], flashcardQA: [],
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
  if(activeOrigin){ showToast("This topic belongs to a class — remove it from that class's page", 'info'); return; }
  const t = getTopics().find(x => x.id==id);
  pendingAction = { type:'topic', id };
  document.getElementById('cTitle').textContent = 'Delete this topic?';
  document.getElementById('cMsg').textContent = '"'+t.name+'" will be permanently removed.';
  document.getElementById('confirmOverlay').classList.add('open');
}
function confirmDeleteUnit(name){
  const count = getTopics().filter(t => t.unit===name).length;
  pendingAction = { type:'unit', name };
  document.getElementById('cTitle').textContent = 'Remove this unit?';
  document.getElementById('cMsg').textContent = '"'+name+'"'+(count?' — '+count+' topic(s) will become unassigned.':' will be removed.');
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm(){ document.getElementById('confirmOverlay').classList.remove('open'); pendingAction=null; }
function doDelete(){
  if(!pendingAction) return;
  if(pendingAction.type==='topic'){
    const topics = getTopics();
    const toRemove = new Set([pendingAction.id, ...getDescendantIds(pendingAction.id, topics)]);
    saveTopics(topics.filter(t => !toRemove.has(t.id)));
    if(activeId==pendingAction.id){ activeId=null; document.getElementById('welcomeState').style.display=''; document.getElementById('detailContent').classList.remove('on'); }
  } else {
    saveTopics(getTopics().map(t => t.unit===pendingAction.name ? {...t,unit:''} : t));
    saveUnits(getUnits().filter(u => u!==pendingAction.name));
    if(activeUnit===pendingAction.name) activeUnit='all';
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

let _nextSync = Date.now() + 60000;

async function syncPull(){
  setSyncStatus('syncing');
  const PLACEHOLDER = '[image — only visible on device where it was saved]';
  try{
    for(const key of [ST, SU]){
      const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(key));
      if(res && res.data !== null && res.data !== undefined){
        if(key===ST && Array.isArray(res.data)){
          const local = JSON.parse(localStorage.getItem(ST)||'[]');
          const merged = res.data.map(rem => {
            const loc = local.find(t => t.id===rem.id);
            if(!loc) return rem;
            const m = {...rem};
            Object.keys(m).forEach(k => {
              if(typeof m[k]==='string' && m[k].includes(PLACEHOLDER) &&
                 loc[k] && typeof loc[k]==='string' && !loc[k].includes(PLACEHOLDER)){
                m[k] = loc[k];
              }
            });
            return m;
          });
          localStorage.setItem(key, JSON.stringify(merged));
        } else {
          localStorage.setItem(key, JSON.stringify(res.data));
        }
      }
    }

    // Pull each linked class's own topics/units too, so the subject page
    // shows synced class content even if this browser never visited that
    // class's own page directly. This only ever caches into the class's own
    // storage key — it doesn't write anything back, so the class stays the
    // sole owner of its content.
    for(const cls of LINKED_CLASSES){
      const cKeyT = cls.storageKey || (cls.id + '_topics');
      const cKeyU = cls.unitsKey   || (cls.id + '_units');
      for(const key of [cKeyT, cKeyU]){
        try{
          const res = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(key));
          if(res && res.data !== null && res.data !== undefined){
            localStorage.setItem(key, JSON.stringify(res.data));
          }
        } catch(e){ /* one class failing to sync shouldn't block the rest */ }
      }
    }

    // Pull shared teacher notes (routed to the right bucket by TN_KEY(),
    // which follows activeOrigin — see its definition above)
    const tnRes = await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(TN_KEY()));
    if(tnRes && tnRes.data !== null && tnRes.data !== undefined){
      localStorage.setItem(TN_KEY(), JSON.stringify(tnRes.data));
      if(activeId) viewTopic(activeId, activeOrigin ? activeOrigin.id : null);
    }
    setSyncStatus('ok');
    renderList();
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
    el.textContent=secs>0?'↻ '+secs+'s':'';
  },1000);
}

// ── Boot ──
if(resolveSubject()){
  applySubjectTheme();
  initSidebarTabs();
  setupRichDnD();
  renderList();
  syncPull();
  setInterval(syncPull, 60000);
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
    window.viewTopic = function (id, originId) {
      _orig(id, originId);
      if (!isMobile()) return;
      closeSidebar();
      try {
        var key = ST;
        if (originId && typeof classesData !== 'undefined') {
          var cls = (classesData.subjects || []).find(function (c) { return c.id === originId; });
          if (cls) key = cls.storageKey || (cls.id + '_topics');
        }
        var topics = JSON.parse(localStorage.getItem(key) || '[]');
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
// ── Resolve subject from URL hash ──
let SUBJECT = null; // the matched entry from subjectsData
let ST = '';        // localStorage key for topics
let SU = '';        // localStorage key for units
let SP = '';        // localStorage key for pinned topics
let DEF_UNITS = []; // default units if none saved

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
  return true;
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

// ── State ──
let activeId = null, editId = null, activeUnit = 'all', tempTags = [], pendingAction = null;

// ── Sidebar list ──
function renderList(){
  const q = document.getElementById('searchInput').value.toLowerCase();
  const topics = getTopics();
  const pinned = getPinned();
  const filtered = topics.filter(t => {
    const mu = activeUnit === 'all' || t.unit === activeUnit;
    const mq = !q || t.name.toLowerCase().includes(q) ||
      (t.definition||'').toLowerCase().includes(q) ||
      (t.unit||'').toLowerCase().includes(q) ||
      (t.relatedTerms||[]).some(r => r.toLowerCase().includes(q));
    return mu && mq;
  }).sort((a,b) => {
    const ap = pinned.includes(a.id), bp = pinned.includes(b.id);
    if(ap && !bp) return -1;
    if(!ap && bp) return 1;
    return a.name.localeCompare(b.name);
  });

  document.getElementById('topicList').innerHTML = filtered.length === 0
    ? `<div class="sidebar-empty">${q ? 'No results for "'+esc(q)+'"' : 'No topics yet.<br>Click <strong>+ New topic</strong> to begin.'}</div>`
    : filtered.map(t => {
        const isPinned = pinned.includes(t.id);
        return `
        <div class="topic-item${t.id==activeId?' active':''}${isPinned?' pinned':''}" onclick="viewTopic(${t.id})">
          <div class="ti-top">
            <div class="ti-name">${isPinned?'<span class="ti-pin-icon"></span>':''}${esc(t.name)}</div>
            <button class="ti-pin-btn" onclick="event.stopPropagation();togglePinTopic(${t.id})" title="${isPinned?'Unpin':'Pin'}">${isPinned?'★':'☆'}</button>
          </div>
          ${t.unit ? `<div class="ti-unit">${esc(t.unit)}</div>` : ''}
          ${t.definition ? `<div class="ti-prev">${esc(t.definition.substring(0,55))}…</div>` : ''}
        </div>`;
      }).join('');

  document.getElementById('stT').textContent = topics.length;
  document.getElementById('stU').textContent = getUnits().length;
  renderPills();
}

function renderPills(){
  const units = getUnits(), topics = getTopics(), counts = {};
  topics.forEach(t => { if(t.unit) counts[t.unit] = (counts[t.unit]||0)+1; });
  document.getElementById('unitPills').innerHTML =
    `<button class="unit-pill${activeUnit==='all'?' active':''}" onclick="setUnit('all')">All (${topics.length})</button>` +
    units.map(u => `
      <button class="unit-pill${activeUnit===u?' active':''}" data-unit="${esc(u)}" onclick="setUnit(this.dataset.unit)">
        ${esc(u)} <span style="color:var(--muted2);font-weight:400">(${counts[u]||0})</span>
        <span class="unit-del" onclick="event.stopPropagation();confirmDeleteUnit(this.closest('[data-unit]').dataset.unit)" title="Remove">×</span>
      </button>`).join('');
}

function setUnit(u){ activeUnit = u; renderList(); }

// ── Topic detail ──
function viewTopic(id){
  activeId = id;
  const t = getTopics().find(x => x.id == id);
  if(!t) return;
  if(location.protocol !== 'file:') history.replaceState(null,'', '#' + SUBJECT.id);
  renderList();

  document.getElementById('welcomeState').style.display = 'none';
  const el = document.getElementById('detailContent');
  el.classList.remove('on');

  const kpHtml = (t.keyPoints||[]).length
    ? `<ul class="key-points">${t.keyPoints.map(k=>`<li class="kp-item"><div class="kp-dot"></div><span>${esc(k)}</span></li>`).join('')}</ul>`
    : '<p class="empty-note">No key points added yet.</p>';

  const relHtml = (t.relatedTerms||[]).length
    ? `<div class="related-tags">${t.relatedTerms.map(r => {
        const m = getTopics().find(x => x.name.toLowerCase()===r.toLowerCase());
        return `<span class="rtag"${m?` onclick="viewTopic(${m.id})"`:''}>${esc(r)}</span>`;
      }).join('')}</div>`
    : '<p class="empty-note">None listed.</p>';

  const created = new Date(t.createdAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const editedStr = t.updatedAt && t.updatedAt !== t.createdAt
    ? '<span class="dh-date">· Edited '+new Date(t.updatedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+'</span>' : '';

  let extraHtml = '';
  if(t.formula)    extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">∑</span>Formula / Equation</div><div class="section-body"><div class="formula-box">${sanitizeRich(t.formula)}</div></div></div>`;
  if(t.materials)  extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">📋</span>Extra Notes</div><div class="section-body"><p class="plain-text">${sanitizeRich(t.materials)}</p></div></div>`;
  if(t.process)    extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">⚙</span>Process / Method</div><div class="section-body"><div class="formula-box">${sanitizeRich(t.process)}</div></div></div>`;
  if(t.safety)     extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">⚠</span>Safety / Warnings</div><div class="section-body"><div class="warning-box">${sanitizeRich(t.safety)}</div></div></div>`;
  if(t.examTip)    extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">⚡</span>Exam Tip</div><div class="section-body"><div class="exam-tip">${sanitizeRich(t.examTip)}</div></div></div>`;
  if((t.flashcardQA||[]).length){
    const qaRows = t.flashcardQA.map(qa=>`
      <div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">${esc(qa.q)}</div>
          ${qa.a?`<div style="font-size:12px;color:var(--muted);font-style:italic">${esc(qa.a)}</div>`:'<div style="font-size:11px;color:var(--muted2);font-style:italic">No answer set</div>'}
        </div>
        <span style="font-size:10px;background:var(--ac-l);border:1px solid var(--ac-b);color:var(--accent);border-radius:4px;padding:2px 7px;font-weight:700;white-space:nowrap;flex-shrink:0">Flashcard</span>
      </div>`).join('');
    extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">🃏</span>Flashcard Questions</div><div class="section-body">${qaRows}</div></div>`;
  }

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
        <button class="btn-act" onclick="openModal(${t.id})">Edit</button>
        <button class="btn-act danger" onclick="confirmDeleteTopic(${t.id})">Delete</button>
      </div>
    </div>
    <div class="section">
      <div class="section-header"><span class="sh-icon">📝</span>Definition</div>
      <div class="section-body">${t.definition ? `<p class="def-text">${esc(t.definition)}</p>` : '<p class="empty-note">No definition added yet.</p>'}</div>
    </div>
    <div class="section">
      <div class="section-header"><span class="sh-icon">✦</span>Key Points</div>
      <div class="section-body">${kpHtml}</div>
    </div>
    ${extraHtml}
    <div class="section">
      <div class="section-header"><span class="sh-icon">🔗</span>Related Terms</div>
      <div class="section-body">${relHtml}</div>
    </div>`;

  el.style.display = 'block';
  void el.offsetWidth;
  el.classList.add('on');
}

// ── Modal ──
function openModal(id){
  if(window.isGuest){ showToast('Sign in to add or edit topics','info'); return; }
  editId = id || null;
  tempTags = [];
  document.getElementById('kpList').innerHTML = '';
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
    (t.keyPoints||[]).forEach(k => addKpRow(k));
    (t.relatedTerms||[]).forEach(addTag);
    document.getElementById('fqaList').innerHTML = '';
    (t.flashcardQA||[]).forEach(qa => addFqaRow(qa.q, qa.a));
  } else {
    document.getElementById('modalTitle').textContent = 'New topic';
    ['fName','fDefinition'].forEach(i => document.getElementById(i).value = '');
    ['fFormula','fMaterials','fProcess','fSafety','fExamTip'].forEach(clearRich);
    document.getElementById('fUnit').value = '';
    document.getElementById('fqaList').innerHTML = '';
  }
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
    relatedTerms,
    flashcardQA,
    addedBy: ex.addedBy || window.currentUid || null,
    createdAt: ex.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  let topics = getTopics();
  topics = editId ? topics.map(t => t.id===editId ? topic : t) : [...topics, topic];
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
    saveTopics(getTopics().filter(t => t.id!==pendingAction.id));
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
const PROXY_URL     = '/.netlify/functions/sync';
const APPSCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';

function setSyncStatus(s) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (s === 'syncing') { el.textContent = '↻ Syncing';   el.className = 'sync-chip'; }
  else if (s === 'ok') { el.textContent = '✓ Synced';    el.className = 'sync-chip ok'; }
  else if (s === 'warn'){ el.textContent = '⚠ Too large'; el.className = 'sync-chip warn'; }
  else                  { el.textContent = '○ Offline';   el.className = 'sync-chip err'; }
}

async function _directPush(key, data) {
  const res = await fetch(APPSCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data }),
  });
  if (!res.ok) throw new Error(`AppScript HTTP ${res.status}`);
}

async function _directGet(key) {
  const res = await fetch(`${APPSCRIPT_URL}?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`AppScript HTTP ${res.status}`);
  return res.json();
}

async function _proxyPush(key, data) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data }),
  });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
}

async function _proxyGet(key) {
  const res = await fetch(`${PROXY_URL}?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  return res.json();
}

async function syncPush(key, data) {
  try {
    await _directPush(key, data);
    console.log('[sync] push direct →', key);
    setSyncStatus('ok');
  } catch (directErr) {
    console.warn('[sync] direct push failed, trying proxy:', directErr.message);
    try {
      await _proxyPush(key, data);
      console.log('[sync] push via proxy →', key);
      setSyncStatus('ok');
    } catch (proxyErr) {
      console.warn('[sync] proxy push also failed:', proxyErr.message);
      setSyncStatus('err');
    }
  }
}

async function syncGet(key) {
  try {
    const data = await _directGet(key);
    console.log('[sync] get direct →', key);
    return data;
  } catch (directErr) {
    console.warn('[sync] direct get failed, trying proxy:', directErr.message);
    const data = await _proxyGet(key);
    console.log('[sync] get via proxy →', key);
    return data;
  }
}

let _nextSync = Date.now() + 60000;

async function syncPull() {
  setSyncStatus('syncing');
  const PLACEHOLDER = '[image — only visible on device where it was saved]';
  try {
    for (const key of [ST, SU]) {
      const res = await syncGet(key);
      if (res && res.data !== null && res.data !== undefined) {
        if (key === ST && Array.isArray(res.data)) {
          const local = JSON.parse(localStorage.getItem(ST) || '[]');
          const merged = res.data.map(rem => {
            const loc = local.find(t => t.id === rem.id);
            if (!loc) return rem;
            const m = { ...rem };
            Object.keys(m).forEach(k => {
              if (typeof m[k]==='string' && m[k].includes(PLACEHOLDER) &&
                  loc[k] && typeof loc[k]==='string' && !loc[k].includes(PLACEHOLDER)) {
                m[k] = loc[k];
              }
            });
            return m;
          });
          local.forEach(lt => { if (!merged.find(t => t.id === lt.id)) merged.push(lt); });
          localStorage.setItem(key, JSON.stringify(merged));
        } else {
          localStorage.setItem(key, JSON.stringify(res.data));
        }
      }
    }
    setSyncStatus('ok');
    renderList();
  } catch (e) {
    console.warn('syncPull failed:', e);
    setSyncStatus('err');
  }
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
async function pollUploadResult(uid, ph) {
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    try {
      const res = await syncGet('_ur_' + uid);
      if (res && res.data) {
        clearInterval(poll);
        const img = document.createElement('img');
        img.src = res.data.ok && res.data.url ? res.data.url : ph._b64;
        ph.replaceWith(img);
      }
    } catch (e) {}
    if (tries >= 30) {
      clearInterval(poll);
      const img = document.createElement('img');
      img.src = ph._b64;
      ph.replaceWith(img);
    }
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

function setupRichDnD(){
  document.querySelectorAll('.rich-editor-wrap').forEach(wrap => {
    const editor=wrap.querySelector('.rich-content');
    wrap.addEventListener('dragover',e=>{e.preventDefault();wrap.classList.add('drag-over');});
    wrap.addEventListener('dragleave',e=>{if(!wrap.contains(e.relatedTarget))wrap.classList.remove('drag-over');});
    wrap.addEventListener('drop',e=>{
      e.preventDefault();wrap.classList.remove('drag-over');
      const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
      if(files.length){files.forEach(f=>compressAndInsert(editor,f));}
    });
  });
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
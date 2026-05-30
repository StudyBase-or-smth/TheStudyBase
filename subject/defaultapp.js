// ================================================================
// subjectapp.js — StudyBase subject page logic
// Depends on: subjects.js being loaded first
// ================================================================

// ── Resolve subject from URL hash ──
let SUBJECT = null;
let ST = '';        // localStorage key for topics
let SU = '';        // localStorage key for units
let DEF_UNITS = [];

function resolveSubject() {
  const id = window.location.hash.slice(1);
  if (!id || typeof subjectsData === 'undefined') {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#c00">No subject specified. <a href="../index.html">Go back to hub.</a></p>';
    return false;
  }
  SUBJECT = (subjectsData.subjects || []).find(s => s.id === id);
  if (!SUBJECT) {
    document.body.innerHTML = `<p style="padding:40px;font-family:sans-serif;color:#c00">Unknown subject "${id}". <a href="../index.html">Go back to hub.</a></p>`;
    return false;
  }
  ST = SUBJECT.storageKey || (id + '_topics');
  SU = SUBJECT.unitsKey   || (id + '_units');
  return true;
}

function applySubjectTheme() {
  const c = SUBJECT.colour;
  document.documentElement.style.setProperty('--accent', c);
  const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  document.documentElement.style.setProperty('--ac-l', `rgba(${r},${g},${b},.07)`);
  document.documentElement.style.setProperty('--ac-b', `rgba(${r},${g},${b},.22)`);

  document.getElementById('accentBar').style.background = c;
  document.getElementById('hdrEmoji').textContent = SUBJECT.emoji || '📚';
  document.getElementById('hdrSubjectName').textContent = SUBJECT.name;
  document.title = SUBJECT.name + ' — StudyBase';

  document.getElementById('welcomeEmoji').textContent = SUBJECT.emoji || '📚';
  document.getElementById('welcomeTitle').textContent = SUBJECT.name + ' notes';

  document.getElementById('stT').style.color = c;
  document.getElementById('stU').style.color = c;
}

// ── Dark mode ──
(function () {
  const on = localStorage.getItem('studybase_dark') === '1';
  if (on) document.body.classList.add('dark');
  const btn = document.getElementById('darkToggle');
  if (btn) btn.textContent = on ? '☀️' : '🌙';
})();

window.toggleDark = function () {
  const on = document.body.classList.toggle('dark');
  localStorage.setItem('studybase_dark', on ? '1' : '0');
  document.getElementById('darkToggle').textContent = on ? '☀️' : '🌙';
};

// ── Storage helpers ──
const CELL_LIMIT = 45000;
const getTopics = () => { try { return JSON.parse(localStorage.getItem(ST) || '[]'); } catch (e) { return []; } };
const getUnits  = () => { try { return JSON.parse(localStorage.getItem(SU) || JSON.stringify(DEF_UNITS)); } catch (e) { return []; } };

const saveTopics = t => {
  localStorage.setItem(ST, JSON.stringify(t));
  const sd = sanitizeForSync(t);
  if (JSON.stringify(sd).length > CELL_LIMIT) { setSyncStatus('warn'); }
  else { syncPush(ST, sd); setSyncStatus('ok'); }
};
const saveUnits = u => {
  localStorage.setItem(SU, JSON.stringify(u));
  if (JSON.stringify(u).length > CELL_LIMIT) { setSyncStatus('warn'); }
  else { syncPush(SU, u); setSyncStatus('ok'); }
};

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── State ──
let activeId = null, editId = null, activeUnit = 'all', tempTags = [], pendingAction = null;

// ── Sidebar list ──
function renderList() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const topics = getTopics();
  const filtered = topics.filter(t => {
    const mu = activeUnit === 'all' || t.unit === activeUnit;
    const mq = !q || t.name.toLowerCase().includes(q) ||
      (t.definition||'').toLowerCase().includes(q) ||
      (t.unit||'').toLowerCase().includes(q) ||
      (t.relatedTerms||[]).some(r => r.toLowerCase().includes(q));
    return mu && mq;
  }).sort((a,b) => a.name.localeCompare(b.name));

  document.getElementById('topicList').innerHTML = filtered.length === 0
    ? `<div class="sidebar-empty">${q ? 'No results for "'+esc(q)+'"' : 'No topics yet.<br>Click <strong>+ New topic</strong> to begin.'}</div>`
    : filtered.map(t => `
        <div class="topic-item${t.id == activeId ? ' active' : ''}" onclick="viewTopic(${t.id})">
          <div class="ti-name">${esc(t.name)}</div>
          ${t.unit ? `<div class="ti-unit">${esc(t.unit)}</div>` : ''}
          ${t.definition ? `<div class="ti-prev">${esc(t.definition.substring(0,55))}…</div>` : ''}
        </div>`).join('');

  document.getElementById('stT').textContent = topics.length;
  document.getElementById('stU').textContent = getUnits().length;
  renderPills();
}

function renderPills() {
  const units = getUnits(), topics = getTopics(), counts = {};
  topics.forEach(t => { if (t.unit) counts[t.unit] = (counts[t.unit] || 0) + 1; });
  document.getElementById('unitPills').innerHTML =
    `<button class="unit-pill${activeUnit === 'all' ? ' active' : ''}" onclick="setUnit('all')">All (${topics.length})</button>` +
    units.map(u => `
      <button class="unit-pill${activeUnit === u ? ' active' : ''}" data-unit="${esc(u)}" onclick="setUnit(this.dataset.unit)">
        ${esc(u)} <span style="color:var(--muted2);font-weight:400">(${counts[u]||0})</span>
        <span class="unit-del" onclick="event.stopPropagation();confirmDeleteUnit(this.closest('[data-unit]').dataset.unit)" title="Remove">×</span>
      </button>`).join('');
}

window.setUnit = function (u) { activeUnit = u; renderList(); };

// ── Topic detail ──
window.viewTopic = function (id) {
  activeId = id;
  const t = getTopics().find(x => x.id == id);
  if (!t) return;
  history.replaceState(null, '', '#' + SUBJECT.id);
  renderList();

  document.getElementById('welcomeState').style.display = 'none';
  const el = document.getElementById('detailContent');
  el.classList.remove('on');

  const kpHtml = (t.keyPoints||[]).length
    ? `<ul class="key-points">${t.keyPoints.map(k=>`<li class="kp-item"><div class="kp-dot"></div><span>${esc(k)}</span></li>`).join('')}</ul>`
    : '<p class="empty-note">No key points added yet.</p>';

  const relHtml = (t.relatedTerms||[]).length
    ? `<div class="related-tags">${t.relatedTerms.map(r => {
        const m = getTopics().find(x => x.name.toLowerCase() === r.toLowerCase());
        return `<span class="rtag"${m ? ` onclick="viewTopic(${m.id})"` : ''}>${esc(r)}</span>`;
      }).join('')}</div>`
    : '<p class="empty-note">None listed.</p>';

  const created = new Date(t.createdAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const editedStr = t.updatedAt && t.updatedAt !== t.createdAt
    ? '<span class="dh-date">· Edited '+new Date(t.updatedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+'</span>' : '';

  let extraHtml = '';
  if (t.formula)   extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">∑</span>Formula / Equation</div><div class="section-body"><div class="formula-box">${sanitizeRich(t.formula)}</div></div></div>`;
  if (t.materials) extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">📋</span>Extra Notes</div><div class="section-body"><p class="plain-text">${sanitizeRich(t.materials)}</p></div></div>`;
  if (t.process)   extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">⚙</span>Process / Method</div><div class="section-body"><div class="formula-box">${sanitizeRich(t.process)}</div></div></div>`;
  if (t.safety)    extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">⚠</span>Safety / Warnings</div><div class="section-body"><div class="warning-box">${sanitizeRich(t.safety)}</div></div></div>`;
  if (t.examTip)   extraHtml += `<div class="section"><div class="section-header"><span class="sh-icon">⚡</span>Exam Tip</div><div class="section-body"><div class="exam-tip">${sanitizeRich(t.examTip)}</div></div></div>`;

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
};

// ── Modal ──
window.openModal = function (id) {
  if (window.isGuest) { alert('Sign in to add or edit topics'); return; }
  editId = id || null;
  tempTags = [];
  document.getElementById('kpList').innerHTML = '';
  document.getElementById('tagsWrap').querySelectorAll('.tag-chip').forEach(e => e.remove());
  populateSel();
  if (id) {
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
  } else {
    document.getElementById('modalTitle').textContent = 'New topic';
    ['fName','fDefinition'].forEach(i => document.getElementById(i).value = '');
    ['fFormula','fMaterials','fProcess','fSafety','fExamTip'].forEach(clearRich);
    document.getElementById('fUnit').value = '';
  }
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 80);
};

window.closeModal = function () { document.getElementById('modalOverlay').classList.remove('open'); editId = null; };

function populateSel() {
  const units = getUnits(), sel = document.getElementById('fUnit'), cur = sel.value;
  sel.innerHTML = '<option value="">— No unit —</option>' +
    units.map(u => `<option value="${esc(u)}"${u === cur ? ' selected' : ''}>${esc(u)}</option>`).join('');
}

window.showUnitInput = function () {
  document.getElementById('unitInputRow').style.display = 'block';
  document.getElementById('newUnitInput').value = '';
  document.getElementById('newUnitInput').focus();
  document.getElementById('btnAddUnit').style.display = 'none';
};
window.hideUnitInput = function () {
  document.getElementById('unitInputRow').style.display = 'none';
  document.getElementById('btnAddUnit').style.display = '';
};
window.confirmAddUnit = function () {
  const name = document.getElementById('newUnitInput').value.trim();
  if (!name) return;
  const units = getUnits();
  if (!units.includes(name)) { units.push(name); saveUnits(units); }
  populateSel(); document.getElementById('fUnit').value = name; hideUnitInput(); renderPills();
};

window.addKpRow = function (val) {
  val = val || '';
  const uid = 'kpr_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
  const row = document.createElement('div'); row.className = 'kp-row'; row.id = uid;
  const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Key point…'; inp.value = val;
  const btn = document.createElement('button'); btn.className = 'btn-kp-del'; btn.textContent = '✕';
  btn.onclick = () => document.getElementById(uid).remove();
  row.appendChild(inp); row.appendChild(btn);
  document.getElementById('kpList').appendChild(row); inp.focus();
};

function addTag(text) {
  text = String(text).trim();
  if (!text || tempTags.includes(text)) return;
  tempTags.push(text);
  const wrap = document.getElementById('tagsWrap');
  const chip = document.createElement('span'); chip.className = 'tag-chip';
  const label = document.createTextNode(text + ' ');
  const btn = document.createElement('button'); btn.textContent = '✕';
  const captured = text;
  btn.onclick = () => removeTag(btn, captured);
  chip.appendChild(label); chip.appendChild(btn);
  wrap.insertBefore(chip, document.getElementById('tagsInput'));
}
function removeTag(btn, text) { tempTags = tempTags.filter(t => t !== text); btn.closest('.tag-chip').remove(); }

document.getElementById('tagsInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = e.target.value.replace(',','').trim(); if (v) { addTag(v); e.target.value = ''; } }
  if (e.key === 'Backspace' && !e.target.value && tempTags.length) {
    const chips = document.getElementById('tagsWrap').querySelectorAll('.tag-chip');
    removeTag(chips[chips.length-1].querySelector('button'), tempTags[tempTags.length-1]);
  }
});

window.saveTopic = function () {
  const name = document.getElementById('fName').value.trim();
  if (!name) { document.getElementById('fName').focus(); return; }
  const keyPoints = Array.from(document.getElementById('kpList').querySelectorAll('.kp-row input'))
    .map(i => i.value.trim()).filter(Boolean);
  const relatedTerms = [...tempTags];
  const ti = document.getElementById('tagsInput').value.trim(); if (ti) relatedTerms.push(ti);
  const ex = editId ? (getTopics().find(t => t.id === editId) || {}) : {};
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
    createdAt: ex.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  let topics = getTopics();
  topics = editId ? topics.map(t => t.id === editId ? topic : t) : [...topics, topic];
  saveTopics(topics); closeModal(); renderList(); viewTopic(topic.id);
};

// ── Delete confirm ──
window.confirmDeleteTopic = function (id) {
  const t = getTopics().find(x => x.id == id);
  pendingAction = { type: 'topic', id };
  document.getElementById('cTitle').textContent = 'Delete this topic?';
  document.getElementById('cMsg').textContent = '"' + t.name + '" will be permanently removed.';
  document.getElementById('confirmOverlay').classList.add('open');
};
window.confirmDeleteUnit = function (name) {
  const count = getTopics().filter(t => t.unit === name).length;
  pendingAction = { type: 'unit', name };
  document.getElementById('cTitle').textContent = 'Remove this unit?';
  document.getElementById('cMsg').textContent = '"' + name + '"' + (count ? ' — ' + count + ' topic(s) will become unassigned.' : ' will be removed.');
  document.getElementById('confirmOverlay').classList.add('open');
};
window.closeConfirm = function () { document.getElementById('confirmOverlay').classList.remove('open'); pendingAction = null; };
window.doDelete = function () {
  if (!pendingAction) return;
  if (pendingAction.type === 'topic') {
    saveTopics(getTopics().filter(t => t.id !== pendingAction.id));
    if (activeId == pendingAction.id) {
      activeId = null;
      document.getElementById('welcomeState').style.display = '';
      document.getElementById('detailContent').classList.remove('on');
    }
  } else {
    saveTopics(getTopics().map(t => t.unit === pendingAction.name ? {...t, unit: ''} : t));
    saveUnits(getUnits().filter(u => u !== pendingAction.name));
    if (activeUnit === pendingAction.name) activeUnit = 'all';
    populateSel();
  }
  closeConfirm(); renderList();
};

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput').focus(); }
});
document.getElementById('searchInput').addEventListener('input', renderList);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// ── Sync ──
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';
let _nextSync = Date.now() + 60000;

function setSyncStatus(s) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (s === 'syncing') { el.textContent = '↻ Syncing'; el.className = 'sync-chip'; }
  else if (s === 'ok')  { el.textContent = '✓ Synced'; el.className = 'sync-chip ok'; }
  else if (s === 'warn'){ el.textContent = '⚠ Too large'; el.className = 'sync-chip warn'; }
  else                  { el.textContent = '○ Offline'; el.className = 'sync-chip err'; }
}

function jsonpGet(url) {
  return new Promise((resolve, reject) => {
    const cb = '_cb' + Date.now() + '_' + Math.floor(Math.random() * 99999);
    const script = document.createElement('script');
    const cleanup = () => { delete window[cb]; if (script.parentNode) script.parentNode.removeChild(script); };
    window[cb] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(script);
    setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 8000);
  });
}

function syncPush(key, data) {
  try {
    const id = 'sf' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = id; iframe.style.cssText = 'display:none;width:0;height:0;border:0';
    const form = document.createElement('form');
    form.method = 'POST'; form.action = SYNC_URL; form.target = id; form.style.display = 'none';
    [['key', key], ['data', JSON.stringify(data)]].forEach(([n, v]) => {
      const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = n; inp.value = v; form.appendChild(inp);
    });
    document.body.appendChild(iframe); document.body.appendChild(form); form.submit();
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); if (form.parentNode) form.parentNode.removeChild(form); }, 6000);
    setSyncStatus('ok');
  } catch (e) { setSyncStatus('err'); }
}

window.syncPull = async function () {
  setSyncStatus('syncing');
  const PLACEHOLDER = '[image — only visible on device where it was saved]';
  try {
    for (const key of [ST, SU]) {
      const res = await jsonpGet(SYNC_URL + '?key=' + encodeURIComponent(key));
      if (res && res.data !== null && res.data !== undefined) {
        if (key === ST && Array.isArray(res.data)) {
          const local = JSON.parse(localStorage.getItem(ST) || '[]');
          const merged = res.data.map(rem => {
            const loc = local.find(t => t.id === rem.id);
            if (!loc) return rem;
            const m = {...rem};
            Object.keys(m).forEach(k => {
              if (typeof m[k] === 'string' && m[k].includes(PLACEHOLDER) &&
                  loc[k] && typeof loc[k] === 'string' && !loc[k].includes(PLACEHOLDER)) {
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
  } catch (e) { setSyncStatus('err'); }
  _nextSync = Date.now() + 60000;
};

function sanitizeForSync(topics) {
  return topics.map(t => {
    const c = {...t};
    Object.keys(c).forEach(k => {
      if (typeof c[k] === 'string' && c[k].includes('data:image')) {
        const d = document.createElement('div'); d.innerHTML = c[k];
        d.querySelectorAll('img').forEach(img => {
          if ((img.src||'').startsWith('data:')) {
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

// ── Rich editor helpers ──
function getRichVal(id) { const el = document.getElementById(id); if (!el) return ''; return el.contentEditable === 'true' ? el.innerHTML.trim() : el.value.trim(); }
function setRichVal(id, html) { const el = document.getElementById(id); if (!el) return; if (el.contentEditable === 'true') { el.innerHTML = html || ''; } else { el.value = html || ''; } }
function clearRich(id) { setRichVal(id, ''); }
function sanitizeRich(html) {
  if (!html) return '';
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('script,style,iframe,object,embed,link').forEach(e => e.remove());
  d.querySelectorAll('img').forEach(img => {
    const src = img.src || img.getAttribute('src') || '';
    if (!src.startsWith('data:') && !src.startsWith('https://drive.google.com/') && !src.startsWith('https://lh3.googleusercontent.com/')) img.remove();
  });
  return d.innerHTML;
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
      const b64 = cv.toDataURL('image/jpeg', .82);
      const ph = document.createElement('span');
      ph.textContent = '⏳ Uploading…'; ph.style.cssText = 'color:var(--muted);font-size:12px;font-style:italic;display:block';
      editor.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const rng = sel.getRangeAt(0); rng.deleteContents(); rng.insertNode(ph);
        rng.setStartAfter(ph); rng.collapse(true); sel.removeAllRanges(); sel.addRange(rng);
      } else { editor.appendChild(ph); }
      const uid = Date.now() + '' + Math.random().toString(36).slice(2,6);
      syncPush('_up_' + uid, {image: b64, filename: 'sb_' + uid + '.jpg'});
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          const res = await jsonpGet(SYNC_URL + '?key=' + encodeURIComponent('_ur_' + uid));
          if (res && res.data) {
            clearInterval(poll);
            if (res.data.ok && res.data.url) { const i = document.createElement('img'); i.src = res.data.url; ph.replaceWith(i); }
            else { const i = document.createElement('img'); i.src = b64; ph.replaceWith(i); }
          }
        } catch (e) {}
        if (tries >= 30) { clearInterval(poll); const i = document.createElement('img'); i.src = b64; ph.replaceWith(i); }
      }, 1500);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

window.richAddImage = function (id) {
  const inp = document.getElementById('img_' + id); if (!inp) return;
  inp.onchange = function () { if (this.files[0]) { compressAndInsert(document.getElementById(id), this.files[0]); this.value = ''; } };
  inp.click();
};

function setupRichDnD() {
  document.querySelectorAll('.rich-editor-wrap').forEach(wrap => {
    const editor = wrap.querySelector('.rich-content');
    wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drag-over'); });
    wrap.addEventListener('dragleave', e => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-over'); });
    wrap.addEventListener('drop', e => {
      e.preventDefault(); wrap.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length) { files.forEach(f => compressAndInsert(editor, f)); }
    });
  });
}

// ── Sync countdown ──
function startCountdown() {
  const el = document.getElementById('syncCountdown');
  if (!el) return;
  setInterval(() => {
    const secs = Math.max(0, Math.round((_nextSync - Date.now()) / 1000));
    el.textContent = secs > 0 ? '↻ ' + secs + 's' : '';
  }, 1000);
}

// ── Boot ──
if (resolveSubject()) {
  applySubjectTheme();
  setupRichDnD();
  renderList();
  syncPull();
  setInterval(syncPull, 60000);
  startCountdown();
}
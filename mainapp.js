// ================================================================
// mainapp.js — StudyBase application logic
// Depends on: subjects.js being loaded first
// ================================================================

// ── Toast system ──
(function () {
  const c = document.getElementById('toast-container');
  window.showToast = function (msg, type = 'info', duration = 3000) {
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, duration);
  };
})();

// ── Dark mode ──
(function () {
  const on = localStorage.getItem('studybase_dark') === '1';
  if (on) document.body.classList.add('dark');
  const btn = document.getElementById('darkToggle');
  if (btn) btn.textContent = on ? '☀️' : '🌙';
})();

document.getElementById('darkToggle').onclick = function () {
  const on = document.body.classList.toggle('dark');
  localStorage.setItem('studybase_dark', on ? '1' : '0');
  this.textContent = on ? '☀️' : '🌙';
};

// ── Branch version badge ──
async function loadBranchVersion() {
  const badge = document.getElementById('branch-badge');
  if (!badge) return;
  try {
    const res = await fetch('BranchVersion.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    const branch = data.branch || 'unknown', version = data.version || '0.0.0';
    const colorMap = { dev: '#e11d48', bug: '#c2410c', main: '#15803d', other: '#1e40af' };
    const color = colorMap[data.colour || data.color || 'other'] || '#1e40af';
    badge.innerHTML = `<strong>${branch}</strong> · v${version}`;
    badge.style.cssText = `font-size:11px;background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:3px 10px;white-space:nowrap;color:${color}`;
  } catch (e) {
    badge.innerHTML = '<strong>dev</strong> · Local';
    badge.style.cssText = 'font-size:11px;background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:3px 10px;white-space:nowrap;color:#e0c200';
  }
}
window.addEventListener('load', loadBranchVersion);
loadBranchVersion();

// ── Collapsible sidebar sections ──
const COLLAPSE_KEY = 'studybase_collapsed_sections';

function getCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveCollapsed(obj) { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(obj)); }

function applyCollapse(section, collapsed) {
  const toggle = document.getElementById(section + 'Toggle');
  const body = document.getElementById(section + 'Body');
  if (!toggle || !body) return;
  toggle.classList.toggle('collapsed', collapsed);
  body.classList.toggle('collapsed', collapsed);
}

window.toggleSection = function (section) {
  const state = getCollapsed();
  state[section] = !state[section];
  saveCollapsed(state);
  applyCollapse(section, state[section]);
};

function initCollapsibles() {
  const state = getCollapsed();
  ['recent','tools','units'].forEach(s => applyCollapse(s, !!state[s]));
}

// ── Calendar state ──
const TODAY = new Date();
let calYear = TODAY.getFullYear(), calMonth = TODAY.getMonth();

// ── Init ──
function init() {
  if (typeof subjectsData === 'undefined') {
    document.getElementById('subjectsGrid').innerHTML =
      '<p style="color:red;padding:20px;grid-column:1/-1">subjects.js not found or failed to load.</p>';
    return;
  }

  // Populate subject options in event modal
  const sel = document.getElementById('evSubject');
  (subjectsData.subjects || []).forEach(s => {
    const o = document.createElement('option');
    o.value = s.name; o.textContent = s.name; sel.appendChild(o);
  });

  initCollapsibles();
  renderSubjects();
  renderClasses();
  renderStats();
  renderSidebar();
  renderCalendar();
  calSync();
  startSyncCountdown();

  document.getElementById('todayDate').textContent =
    TODAY.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Data helpers ──
function getTopics(s) {
  const key = s.storageKey || (s.id + '_topics');
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}
function getUnits(s) {
  const key = s.unitsKey || (s.id + '_units');
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}

// ── Subject cards ──
function renderSubjects() {
  const subjects = subjectsData.subjects || [];
  document.getElementById('subjectsGrid').innerHTML = subjects.map(s => {
    const topics = getTopics(s), units = getUnits(s);
    const meta = topics.length
      ? `${topics.length} topic${topics.length !== 1 ? 's' : ''} · ${units.length} unit${units.length !== 1 ? 's' : ''}`
      : 'No topics yet';
    return `<a href="subject/default.html#${s.id}" class="subj-card" style="border-top:4px solid ${s.colour}">
      <div class="subj-emoji">${s.emoji || '📚'}</div>
      <div class="subj-count" style="background:${s.colour}">${topics.length}</div>
      <div class="subj-name">${s.name}</div>
      <div class="subj-meta">${meta}</div>
    </a>`;
  }).join('');
}
// ── class cards ──
function renderClasses() {
  const el = document.getElementById('classesGrid');
  if (!el) return;
  if (typeof classesData === 'undefined' || !classesData.subjects || !classesData.subjects.length) {
    el.innerHTML = '<p class="empty-note" style="grid-column:1/-1;padding:8px 0">No classes defined yet.</p>';
    return;
  }
  const classes = classesData.subjects || [];
  el.innerHTML = classes.map(s => {
    const topics = getTopics(s), units = getUnits(s);
    const meta = topics.length
      ? `${topics.length} topic${topics.length !== 1 ? 's' : ''} · ${units.length} unit${units.length !== 1 ? 's' : ''}`
      : 'No topics yet';
    return `<a href="class/default.html#${s.id}" class="subj-card class-card" style="border-top:4px solid ${s.colour}">
      <div class="subj-emoji">${s.emoji || '🏫'}</div>
      <div class="subj-count" style="background:${s.colour}">${topics.length}</div>
      <div class="subj-name" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>${s.name}</span>
      ${s.class ? `<span style="font-size:11px;font-weight:400;color:var(--muted);white-space:nowrap">${s.teacher}</span>` : ''}
      </div>
      <div class="subj-name" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="subj-meta">${meta}</div>
      ${s.class ? `<span style="font-size:11px;font-weight:400;color:var(--muted);white-space:nowrap">${s.class}</span>` : ''}
      </div>
      </div>
    </a>`;
  }).join('');
}


// ── Stats ──
function renderStats() {
  const subjects = subjectsData.subjects || [];
  let totalTopics = 0, totalUnits = 0, lastDate = null;
  subjects.forEach(s => {
    const topics = getTopics(s), units = getUnits(s);
    totalTopics += topics.length; totalUnits += units.length;
    topics.forEach(t => {
      const d = t.updatedAt || t.createdAt;
      if (d && (!lastDate || d > lastDate)) lastDate = d;
    });
  });
  const lastStr = lastDate
    ? new Date(lastDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—';
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="stat-num" style="color:var(--text)">${totalTopics}</div><div class="stat-label">Total Topics</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#22c55e">${totalUnits}</div><div class="stat-label">Total Units</div></div>
    <div class="stat-card"><div class="stat-num" style="color:#3b82f6">${subjects.length}</div><div class="stat-label">Subjects</div></div>
    <div class="stat-card"><div class="stat-num" style="font-size:20px;color:#f43f5e">${lastStr}</div><div class="stat-label">Last Updated</div></div>`;
}

// ── Sidebar: Recently Added + Units + Marker ──
function renderSidebar() {
  if (typeof subjectsData === 'undefined') return;
  const subjects = subjectsData.subjects || [];
  let allTopics = [];
  subjects.forEach(s => {
    const topics = getTopics(s);
    topics.forEach(t => allTopics.push({ ...t, sName: s.name, sColour: s.colour, sFile: 'subject/default.html#' + s.id }));
  });

  // Recently Added
  const recent = [...allTopics].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 7);
  document.getElementById('recentList').innerHTML = recent.length === 0
    ? '<div class="feed-note">No topics added yet.</div>'
    : recent.map(t => `
      <a class="feed-item" href="${t.sFile}" style="text-decoration:none;display:flex;align-items:flex-start;gap:10px;padding:9px 6px;border-bottom:1px solid var(--border);border-radius:4px;margin:0 -6px;transition:background .12s" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">
        <div class="feed-dot" style="background:${t.sColour};flex-shrink:0;margin-top:5px"></div>
        <div>
          <div class="feed-name">${t.name}</div>
          <div class="feed-sub" style="color:${t.sColour}">${t.sName}${t.unit ? ' · ' + t.unit : ''}</div>
        </div>
      </a>`).join('');

  // Units overview
  let unitsHtml = '';
  subjects.forEach(s => {
    const units = getUnits(s), topics = getTopics(s);
    units.forEach(u => {
      const n = topics.filter(t => t.unit === u).length;
      unitsHtml += `<div class="feed-item">
        <div class="feed-dot" style="background:${s.colour}"></div>
        <div>
          <div class="feed-name" style="font-size:12px">${u}</div>
          <div class="feed-sub" style="color:${s.colour}">${s.name} · ${n} topic${n !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
    });
  });
  document.getElementById('unitsList').innerHTML = unitsHtml || '<div class="empty-note">No units created yet.</div>';

  // Marker tool link
  if (document.getElementById('markerSection')) {
    document.getElementById('markerSection').innerHTML = `
      <a href="analyser.html" class="feed-item" style="text-decoration:none;display:flex;align-items:center;gap:12px;padding:12px 8px;border:2px solid var(--accent,#4a9eff);border-radius:8px;background:var(--card2);margin:8px 0;">
        <div style="font-size:22px;flex-shrink:0;">📍</div>
        <div>
          <div class="feed-name" style="font-weight:600;">Marker Tool</div>
          <div class="feed-sub" style="color:var(--accent,#4a9eff);font-size:13px;">Open analyser.html</div>
        </div>
      </a>`;
  }
}

// ── Calendar ──
const DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EVENTS_KEY = 'studybase_events';
let editingEventId = null;

function getEvents() { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); }
function saveEvents(ev) { localStorage.setItem(EVENTS_KEY, JSON.stringify(ev)); syncPushEvents(ev); }

function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = MONTHS[calMonth] + ' ' + calYear;
  document.getElementById('calDow').innerHTML = DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');

  const events = getEvents();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const firstDay = new Date(calYear, calMonth, 1);
  let startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const prevLast = new Date(calYear, calMonth, 0).getDate();

  let cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: prevLast - i, cur: false });
  for (let d = 1; d <= totalDays; d++) cells.push({ day: d, cur: true });
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ day: next++, cur: false });

  const isToday = d => d.cur && d.day === TODAY.getDate() && calMonth === TODAY.getMonth() && calYear === TODAY.getFullYear();

  document.getElementById('calGrid').innerHTML = cells.map(d => {
    if (!d.cur) return `<div class="cal-day other-month"><div class="cal-day-num">${d.day}</div></div>`;
    const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d.day).padStart(2, '0');
    const dayEvents = events.filter(e => e.date === dateStr);
    let html = `<div class="cal-day${isToday(d) ? ' today' : ''}" onclick="openEventModal(null,'${dateStr}')">`;
    html += `<div class="cal-day-num">${d.day}</div>`;
    dayEvents.slice(0, 2).forEach(ev => {
      html += `<div class="cal-event type-${ev.type}" onclick="event.stopPropagation();openEventModal('${ev.id}',null)" title="${ev.title}">${ev.title}${ev.time ? ' ' + ev.time : ''}</div>`;
    });
    if (dayEvents.length > 2) html += `<div class="cal-more">+${dayEvents.length - 2} more</div>`;
    return html + '</div>';
  }).join('');

  renderUpcoming(events);
}

function renderUpcoming(events) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soon = events
    .filter(e => new Date(e.date + 'T00:00:00') >= today)
    .sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')))
    .slice(0, 5);
  const abbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const typeColors = { exam: '#dc2626', assessment: '#ea580c', assignment: '#2563eb', reminder: '#16a34a' };
  const typeLabels = { exam: 'Exam', assessment: 'Assessment', assignment: 'Assignment', reminder: 'Reminder' };
  document.getElementById('upcomingList').innerHTML = soon.length === 0
    ? '<div class="upcoming-empty">No upcoming events. Click a day or "+ Add" to create one.</div>'
    : '<div class="sec-title" style="margin-bottom:10px">Upcoming</div>' + soon.map(ev => {
      const d = new Date(ev.date + 'T00:00:00');
      const diff = Math.round((d - today) / 864e5);
      const diffLabel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff}d`;
      return `<div class="upcoming-item" onclick="openEventModal('${ev.id}',null)">
        <div class="upcoming-date">${abbr[d.getMonth()]}<span>${d.getDate()}</span></div>
        <div class="upcoming-dot" style="background:${typeColors[ev.type] || '#78716c'}"></div>
        <div class="upcoming-info">
          <div class="upcoming-title">${ev.title}</div>
          <div class="upcoming-meta">${diffLabel}${ev.time ? ' · ' + ev.time : ''}${ev.subject ? ' · ' + ev.subject : ''} · ${typeLabels[ev.type] || ev.type}</div>
        </div>
      </div>`;
    }).join('');
}

window.calNav = function (dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
};
window.calGoToday = function () { calYear = TODAY.getFullYear(); calMonth = TODAY.getMonth(); renderCalendar(); };

// ── Event modal ──
window.openEventModal = function (id, dateStr) {
  if (window.isGuest) { showToast('Sign in to add or edit events', 'info'); return; }
  editingEventId = id;
  const deleteBtn = document.getElementById('evDeleteBtn');
  if (id) {
    const ev = getEvents().find(e => e.id === id); if (!ev) return;
    document.getElementById('evModalTitle').textContent = 'Edit Event';
    document.getElementById('evTitle').value = ev.title;
    document.getElementById('evDate').value = ev.date;
    document.getElementById('evTime').value = ev.time || '';
    document.getElementById('evType').value = ev.type;
    document.getElementById('evSubject').value = ev.subject || '';
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('evModalTitle').textContent = 'Add Event';
    document.getElementById('evTitle').value = '';
    const td = new Date();
    document.getElementById('evDate').value = dateStr || (td.getFullYear() + '-' + String(td.getMonth() + 1).padStart(2, '0') + '-' + String(td.getDate()).padStart(2, '0'));
    document.getElementById('evTime').value = '';
    document.getElementById('evType').value = 'assessment';
    document.getElementById('evSubject').value = '';
    deleteBtn.style.display = 'none';
  }
  document.getElementById('evOverlay').classList.add('open');
  setTimeout(() => document.getElementById('evTitle').focus(), 50);
};

window.closeEventModal = function () { document.getElementById('evOverlay').classList.remove('open'); editingEventId = null; };

window.saveEvent = function () {
  const title = document.getElementById('evTitle').value.trim();
  if (!title) { document.getElementById('evTitle').focus(); return; }
  const ev = {
    id: editingEventId || String(Date.now()),
    title,
    date: document.getElementById('evDate').value,
    time: document.getElementById('evTime').value || '',
    type: document.getElementById('evType').value,
    subject: document.getElementById('evSubject').value,
  };
  const events = getEvents();
  if (editingEventId) { const i = events.findIndex(e => e.id === editingEventId); if (i > -1) events[i] = ev; else events.push(ev); }
  else events.push(ev);
  saveEvents(events);
  closeEventModal();
  renderCalendar();
  showToast('Event saved', 'success');
};

window.deleteEvent = function () {
  if (!editingEventId) return;
  saveEvents(getEvents().filter(e => e.id !== editingEventId));
  closeEventModal();
  renderCalendar();
  showToast('Event deleted', 'warning');
};

document.getElementById('evOverlay').addEventListener('click', function (e) { if (e.target === this) closeEventModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeEventModal(); closeSuggestions(); }
  if (e.key === 'Enter' && document.getElementById('evOverlay').classList.contains('open') && document.activeElement.tagName !== 'SELECT') saveEvent();
});

// ── Sync ──
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';
let _nextSync = Date.now() + 60000;

function jsonpGet(url) {
  return new Promise((res, rej) => {
    const cb = '_jcb' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[cb] = r => { delete window[cb]; s.remove(); res(r); };
    s.onerror = () => { delete window[cb]; s.remove(); rej(new Error('JSONP error')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
    setTimeout(() => { delete window[cb]; s.remove(); rej(new Error('timeout')); }, 8000);
  });
}

function syncPushEvents(events) {
  try {
    const id = 'sf' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = id; iframe.style.cssText = 'display:none;width:0;height:0;border:0';
    const form = document.createElement('form');
    form.method = 'POST'; form.action = SYNC_URL; form.target = id; form.style.display = 'none';
    [['key', EVENTS_KEY], ['data', JSON.stringify(events)]].forEach(([n, v]) => {
      const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = n; inp.value = v; form.appendChild(inp);
    });
    document.body.appendChild(iframe); document.body.appendChild(form);
    form.submit();
    setTimeout(() => { iframe.remove(); form.remove(); }, 6000);
  } catch (e) { console.warn('Sync push failed', e); }
}

async function calSync() {
  try {
    const res = await jsonpGet(SYNC_URL + '?key=' + encodeURIComponent(EVENTS_KEY));
    if (res && res.data && Array.isArray(res.data)) {
      const local = getEvents(), remote = res.data;
      const merged = [...remote];
      local.forEach(le => { if (!merged.find(e => e.id === le.id)) merged.push(le); });
      localStorage.setItem(EVENTS_KEY, JSON.stringify(merged));
      renderCalendar();
    }
  } catch (e) { console.warn('Sync pull failed', e); }
  _nextSync = Date.now() + 60000;
}
setInterval(calSync, 60000);

function startSyncCountdown() {
  const el = document.getElementById('syncCountdown');
  if (!el) return;
  setInterval(() => {
    const secs = Math.max(0, Math.round((_nextSync - Date.now()) / 1000));
    el.textContent = secs > 0 ? '↻ ' + secs + 's' : '';
  }, 1000);
}

window.manualSync = function () { calSync(); renderSidebar(); showToast('Syncing…', 'info', 1500); };

// ── Suggestions ──
const SUG_KEY='studybase_suggestions';
let _sugCache=[];


function openSuggestions(){
  document.getElementById('sugOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  loadSuggestions();
}
function closeSuggestions(){
  document.getElementById('sugOverlay').classList.remove('open');
  document.body.style.overflow='';
}


window.closeSuggestions = function () {
  document.getElementById('sugOverlay').classList.remove('open');
  document.body.style.overflow = '';
};

async function loadSuggestions(){
  const list=document.getElementById('sugList');
  list.innerHTML='<div class="sug-empty">Loading…</div>';
  try{
    const res=await jsonpGet(SYNC_URL+'?key='+encodeURIComponent(SUG_KEY));
    _sugCache=(res&&Array.isArray(res.data))?res.data:[];
    renderSugList();
  }catch(e){list.innerHTML='<div class="sug-empty">Could not load — check your connection.</div>';}
}
let _sugFilter='open';

function setSugFilter(f,btn){
  _sugFilter=f;
  document.querySelectorAll('.sug-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderSugList();
}

function toggleSuggestion(id){
  const s=_sugCache.find(x=>x.id===id);
  if(!s) return;
  s.status=s.status==='closed'?'open':'closed';
  renderSugList();
  pushSuggestions();
}

function pushSuggestions(){
  const iframe=document.createElement('iframe');
  const fid='spush'+Date.now(); iframe.name=fid; iframe.style.cssText='display:none;width:0;height:0;border:0';
  const form=document.createElement('form');
  form.method='POST'; form.action=SYNC_URL; form.target=fid; form.style.display='none';
  [['key',SUG_KEY],['data',JSON.stringify(_sugCache)]].forEach(([n,v])=>{
    const inp=document.createElement('input');inp.type='hidden';inp.name=n;inp.value=v;form.appendChild(inp);
  });
  document.body.appendChild(iframe); document.body.appendChild(form);
  form.submit();
  setTimeout(()=>{iframe.remove();form.remove();},5000);
}

function renderSugList(){
  const list=document.getElementById('sugList');
  const filtered=_sugFilter==='all'?_sugCache:_sugCache.filter(s=>(_sugFilter==='closed'?s.status==='closed':s.status!=='closed'));
  // Update filter counts
  const openCount=_sugCache.filter(s=>s.status!=='closed').length;
  const closedCount=_sugCache.filter(s=>s.status==='closed').length;
  const btns=document.querySelectorAll('.sug-filter');
  if(btns[0]) btns[0].textContent='🟢 Open ('+openCount+')';
  if(btns[1]) btns[1].textContent='🟣 Closed ('+closedCount+')';
  if(btns[2]) btns[2].textContent='All ('+_sugCache.length+')';
  if(!filtered.length){
    list.innerHTML='<div class="sug-empty">'+(_sugCache.length?'No '+_sugFilter+' suggestions.':'No suggestions yet — be the first!')+'</div>';
    return;
  }
  list.innerHTML=[...filtered].reverse().map(s=>{
    const isClosed=s.status==='closed';
    const tagHtml=s.tag?`<span class="sug-tag ${s.tag}">${s.tag}</span> `:'';
    const statusHtml=`<span class="sug-status ${isClosed?'closed':'open'}">${isClosed?'🟣 Closed':'🟢 Open'}</span>`;
    return `<div class="sug-item${isClosed?' closed':''}">
      <button onclick="deleteSuggestion('${s.id}')" title="Delete" style="position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;font-size:14px;line-height:1;color:var(--muted2);padding:2px 4px;border-radius:4px" onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='var(--muted2)'">×</button>
      ${statusHtml} ${tagHtml}<div class="sug-text">${s.text.replace(/</g,'&lt;')}</div>
      <div class="sug-meta">${s.date}${s.time?' · '+s.time:''}</div>
      <button class="sug-toggle-btn" onclick="toggleSuggestion('${s.id}')">${isClosed?'↩ Reopen':'✓ Close'}</button>
    </div>`;
  }).join('');
}
function deleteSuggestion(id){
  _sugCache=_sugCache.filter(s=>s.id!==id);
  renderSugList();
  showToast('Suggestion removed','warning');
  pushSuggestions();
}
function selectSugTag(btn){
  const wasActive=btn.classList.contains('active');
  document.querySelectorAll('.sug-tag-btn').forEach(b=>b.classList.remove('active'));
  if(!wasActive) btn.classList.add('active');
}
function sendSuggestion(){
  const input=document.getElementById('sugInput');
  const text=input.value.trim();
  if(!text){input.focus();return;}
  const now=new Date();
  const date=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const activeTag=document.querySelector('.sug-tag-btn.active');
  const newSug={id:String(Date.now()),text,tag:activeTag?activeTag.dataset.tag:'',date,time};
  newSug.status='open';
  _sugCache.push(newSug); renderSugList();
  input.value='';
  document.querySelectorAll('.sug-tag-btn').forEach(b=>b.classList.remove('active'));
  showToast('Suggestion sent!','success');
  pushSuggestions();
}
document.getElementById('sugOverlay').addEventListener('click',function(e){if(e.target===this)closeSuggestions();});


// ── Boot ──
document.addEventListener('DOMContentLoaded', init);
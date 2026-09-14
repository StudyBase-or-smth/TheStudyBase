// Shared suggestions board (index + subject/class pages). Requires sync-config.js (SYNC_URL, jsonpGet).
const SUG_KEY = 'studybase_suggestions';
let _sugCache = [];
let _sugFilter = 'open';
let _pushSuggestionsTimer = null;

function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function sugToast(msg, type){
  if(typeof window.showToast === 'function') window.showToast(msg, type);
}

document.addEventListener('click', function(e){
  const delBtn = e.target.closest('[data-sug-delete]');
  if(delBtn){ deleteSuggestion(delBtn.getAttribute('data-sug-delete')); return; }
  const toggleBtn = e.target.closest('[data-sug-toggle]');
  if(toggleBtn){ toggleSuggestion(toggleBtn.getAttribute('data-sug-toggle')); return; }
});

function openSuggestions(){
  const ov = document.getElementById('sugOverlay');
  if(!ov) return;
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadSuggestions();
}
function closeSuggestions(){
  const ov = document.getElementById('sugOverlay');
  if(!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
}
window.closeSuggestions = closeSuggestions;
window.openSuggestions = openSuggestions;
window.setSugFilter = setSugFilter;
window.selectSugTag = selectSugTag;
window.sendSuggestion = sendSuggestion;

async function loadSuggestions(){
  const list = document.getElementById('sugList');
  if(!list) return;
  list.innerHTML = '<div class="sug-empty">Loading…</div>';
  try{
    const res = await jsonpGet(SYNC_URL + '?key=' + encodeURIComponent(SUG_KEY));
    _sugCache = (res && Array.isArray(res.data)) ? res.data : [];
    renderSugList();
  }catch(e){
    list.innerHTML = '<div class="sug-empty">Could not load — check your connection.</div>';
  }
}

function setSugFilter(f, btn){
  _sugFilter = f;
  document.querySelectorAll('.sug-filter').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderSugList();
}

function toggleSuggestion(id){
  const s = _sugCache.find(x => x.id === id);
  if(!s) return;
  s.status = s.status === 'closed' ? 'open' : 'closed';
  renderSugList();
  pushSuggestions();
}

function pushSuggestions(){
  if(_pushSuggestionsTimer) clearTimeout(_pushSuggestionsTimer);
  _pushSuggestionsTimer = setTimeout(_doPushSuggestions, 300);
}

function _doPushSuggestions(){
  _pushSuggestionsTimer = null;
  const iframe = document.createElement('iframe');
  const fid = 'spush' + Date.now();
  iframe.name = fid;
  iframe.style.cssText = 'display:none;width:0;height:0;border:0';
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = SYNC_URL;
  form.target = fid;
  form.style.display = 'none';
  [['key', SUG_KEY], ['data', JSON.stringify(_sugCache)]].forEach(([n, v]) => {
    const inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = n;
    inp.value = v;
    form.appendChild(inp);
  });
  document.body.appendChild(iframe);
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => { iframe.remove(); form.remove(); }, 5000);
}

function renderSugList(){
  const list = document.getElementById('sugList');
  if(!list) return;
  const filtered = _sugFilter === 'all' ? _sugCache
    : _sugCache.filter(s => (_sugFilter === 'closed' ? s.status === 'closed' : s.status !== 'closed'));
  const openCount = _sugCache.filter(s => s.status !== 'closed').length;
  const closedCount = _sugCache.filter(s => s.status === 'closed').length;
  const btns = document.querySelectorAll('.sug-filter');
  if(btns[0]) btns[0].textContent = '🟢 Open (' + openCount + ')';
  if(btns[1]) btns[1].textContent = '🟣 Closed (' + closedCount + ')';
  if(btns[2]) btns[2].textContent = 'All (' + _sugCache.length + ')';
  if(!filtered.length){
    list.innerHTML = '<div class="sug-empty">' + (_sugCache.length ? 'No ' + _sugFilter + ' suggestions.' : 'No suggestions yet — be the first!') + '</div>';
    return;
  }
  list.innerHTML = [...filtered].reverse().map(s => {
    const isClosed = s.status === 'closed';
    const safeId = escapeHtml(s.id);
    const safeTag = escapeHtml(s.tag || '');
    const tagHtml = s.tag ? `<span class="sug-tag ${safeTag}">${safeTag}</span> ` : '';
    const statusHtml = `<span class="sug-status ${isClosed ? 'closed' : 'open'}">${isClosed ? '🟣 Closed' : '🟢 Open'}</span>`;
    return `<div class="sug-item${isClosed ? ' closed' : ''}">
      <button data-sug-delete="${safeId}" title="Delete" style="position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;font-size:14px;line-height:1;color:var(--muted2);padding:2px 4px;border-radius:4px" onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='var(--muted2)'">×</button>
      ${statusHtml} ${tagHtml}<div class="sug-text">${escapeHtml(s.text)}</div>
      <div class="sug-meta">${escapeHtml(s.date)}${s.time ? ' · ' + escapeHtml(s.time) : ''}</div>
      <button class="sug-toggle-btn" data-sug-toggle="${safeId}">${isClosed ? '↩ Reopen' : '✓ Close'}</button>
    </div>`;
  }).join('');
}

function deleteSuggestion(id){
  _sugCache = _sugCache.filter(s => s.id !== id);
  renderSugList();
  sugToast('Suggestion removed', 'warning');
  pushSuggestions();
}

function selectSugTag(btn){
  const wasActive = btn.classList.contains('active');
  document.querySelectorAll('.sug-tag-btn').forEach(b => b.classList.remove('active'));
  if(!wasActive) btn.classList.add('active');
}

function sendSuggestion(){
  const input = document.getElementById('sugInput');
  if(!input) return;
  const text = input.value.trim();
  if(!text){ input.focus(); return; }
  const now = new Date();
  const date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const activeTag = document.querySelector('.sug-tag-btn.active');
  const newSug = { id: String(Date.now()), text, tag: activeTag ? activeTag.dataset.tag : '', date, time, status: 'open' };
  _sugCache.push(newSug);
  renderSugList();
  input.value = '';
  document.querySelectorAll('.sug-tag-btn').forEach(b => b.classList.remove('active'));
  sugToast('Suggestion sent!', 'success');
  pushSuggestions();
}

(function initSuggestions(){
  const ov = document.getElementById('sugOverlay');
  if(ov) ov.addEventListener('click', e => { if(e.target === ov) closeSuggestions(); });
})();

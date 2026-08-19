// profile-store.js
//
// Per-user profile (photo + enabled subjects/classes + flashcard stats)
// stored via SYNC_URL under `_profile_<uid>`. The local store maps that
// key to StudyBaseData/users/<uid>/profile.json. Cached in localStorage
// for the hub. Loaded after sync-config.js (needs SYNC_URL).

function profileLocalKey(uid){ return 'studybase_profile_' + (uid || 'guest'); }
function profileSyncKey(uid){ return '_profile_' + uid; }

function allSubjectIds(){
  return (typeof subjectsData !== 'undefined' && subjectsData.subjects)
    ? subjectsData.subjects.map(s => s.id) : [];
}
function allClassIds(){
  return (typeof classesData !== 'undefined' && classesData.subjects)
    ? classesData.subjects.map(s => s.id) : [];
}

// Saved checkbox lists are the source of truth. Subject/class ids added to
// subjects.js after the last save default to ON (via known*Ids).
function mergeEnabled(saved, known, all){
  if(!Array.isArray(saved)) return all.slice();
  const on = new Set(saved);
  const seen = Array.isArray(known) ? new Set(known) : null;
  return all.filter(id => on.has(id) || (seen && !seen.has(id)));
}

function normalizeProfile(raw, uid){
  const allS = allSubjectIds();
  const allC = allClassIds();
  const p = (raw && typeof raw === 'object') ? raw : {};
  const photoUrl = (typeof p.photoUrl === 'string' && (
    /^data:image\//i.test(p.photoUrl) ||
    /^https:\/\/(lh[0-9]\.googleusercontent\.com|drive\.google\.com)\//i.test(p.photoUrl) ||
    (typeof isAllowedSyncMediaUrl === 'function' && isAllowedSyncMediaUrl(p.photoUrl) && !p.photoUrl.startsWith('data:'))
  )) ? p.photoUrl : '';
  const photoThumb = (typeof p.photoThumb === 'string' && /^data:image\//i.test(p.photoThumb) && p.photoThumb.length < 60000)
    ? p.photoThumb : '';
  return {
    uid: uid || p.uid || '',
    photoUrl,
    photoThumb,
    enabledSubjects: mergeEnabled(p.enabledSubjects, p.knownSubjectIds, allS),
    enabledClasses: mergeEnabled(p.enabledClasses, p.knownClassIds, allC),
    knownSubjectIds: allS.slice(),
    knownClassIds: allC.slice(),
    stats: { flashcards: normalizeFcStats(p.stats && p.stats.flashcards) },
    updatedAt: p.updatedAt || ''
  };
}

function emptyFcStats(){
  return { correct: 0, close: 0, incorrect: 0, total: 0 };
}

function normalizeFcStats(raw){
  const s = (raw && typeof raw === 'object') ? raw : {};
  const n = k => Math.max(0, parseInt(s[k], 10) || 0);
  return {
    correct: n('correct'),
    close: n('close'),
    incorrect: n('incorrect'),
    total: n('total')
  };
}

function fcStatsLocalKey(uid){ return 'studybase_fc_stats_' + (uid || 'guest'); }

function readLocalFcStats(uid){
  try {
    return normalizeFcStats(JSON.parse(localStorage.getItem(fcStatsLocalKey(uid)) || 'null'));
  } catch(e) {
    return emptyFcStats();
  }
}

function writeLocalFcStats(uid, stats){
  const s = normalizeFcStats(stats);
  try { localStorage.setItem(fcStatsLocalKey(uid), JSON.stringify(s)); } catch(e) {}
  return s;
}

function pickNewerFcStats(a, b){
  const A = normalizeFcStats(a), B = normalizeFcStats(b);
  return A.total >= B.total ? A : B;
}

function applyFcStatsToProfile(uid, stats){
  if(!uid || uid === 'guest') return writeLocalFcStats(uid, stats);
  const s = writeLocalFcStats(uid, stats);
  const p = readCachedProfile(uid);
  p.stats = Object.assign({}, p.stats, { flashcards: s });
  return writeCachedProfile(uid, p);
}

function defaultProfile(uid){
  return normalizeProfile(null, uid);
}

function readCachedProfile(uid){
  if(!uid || uid === 'guest') return defaultProfile(uid);
  try {
    return normalizeProfile(JSON.parse(localStorage.getItem(profileLocalKey(uid)) || 'null'), uid);
  } catch(e) {
    return defaultProfile(uid);
  }
}

function writeCachedProfile(uid, profile){
  if(!uid || uid === 'guest') return;
  const p = normalizeProfile(profile, uid);
  localStorage.setItem(profileLocalKey(uid), JSON.stringify(p));
  window.sbProfile = p;
  return p;
}

function applyProfileCache(uid){
  window.sbProfile = readCachedProfile(uid);
  return window.sbProfile;
}

function visibleSubjects(){
  const all = (typeof subjectsData !== 'undefined' && subjectsData.subjects) ? subjectsData.subjects : [];
  const p = window.sbProfile;
  if(!p || !Array.isArray(p.enabledSubjects)) return all;
  const on = new Set(p.enabledSubjects);
  return all.filter(s => on.has(s.id));
}

function visibleClasses(){
  const all = (typeof classesData !== 'undefined' && classesData.subjects) ? classesData.subjects : [];
  const p = window.sbProfile;
  if(!p || !Array.isArray(p.enabledClasses)) return all;
  const on = new Set(p.enabledClasses);
  return all.filter(s => on.has(s.id));
}

function sbJsonpGet(url){
  return new Promise((resolve, reject) => {
    const cb = '_pcb' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const cleanup = () => { delete window[cb]; if(s.parentNode) s.remove(); };
    window[cb] = data => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
    setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 8000);
  });
}

function sbSyncPush(key, data){
  return sbPushToSync(key, data);
}

async function pullProfile(uid){
  if(!uid || uid === 'guest' || typeof SYNC_URL === 'undefined') return readCachedProfile(uid);
  try {
    const res = await sbJsonpGet(SYNC_URL + '?key=' + encodeURIComponent(profileSyncKey(uid)));
    if(res && res.data && typeof res.data === 'object'){
      return writeCachedProfile(uid, res.data);
    }
  } catch(e) { /* keep cache */ }
  return readCachedProfile(uid);
}

function pushProfile(uid, profile){
  if(!uid || uid === 'guest' || typeof SYNC_URL === 'undefined') return;
  const p = writeCachedProfile(uid, Object.assign({}, profile, { uid, updatedAt: new Date().toISOString() }));
  sbSyncPush(profileSyncKey(uid), p);
  return p;
}

const PROFILE_PHOTO_MAX_BYTES = 300 * 1024;

function dataUrlByteLength(dataUrl){
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  const pad = (b64.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not read image'));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

function canvasToJpegDataUrl(img, maxEdge, quality){
  let w = img.width, h = img.height;
  if(w > maxEdge){ h = Math.round(h * maxEdge / w); w = maxEdge; }
  if(h > maxEdge){ w = Math.round(w * maxEdge / h); h = maxEdge; }
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', quality);
}

async function compressImageToDataUrl(file, maxBytes){
  const limit = maxBytes || PROFILE_PHOTO_MAX_BYTES;
  const original = await readFileAsDataUrl(file);
  if(file.size <= limit) return original;

  const img = await loadImageFromDataUrl(original);
  let maxEdge = Math.min(Math.max(img.width, img.height), 1600);
  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45];
  let best = null;

  while(maxEdge >= 240){
    for(let i = 0; i < qualities.length; i++){
      const dataUrl = canvasToJpegDataUrl(img, maxEdge, qualities[i]);
      const size = dataUrlByteLength(dataUrl);
      if(!best || size < best.size) best = { dataUrl, size };
      if(size <= limit) return dataUrl;
    }
    maxEdge = Math.round(maxEdge * 0.75);
  }
  return best ? best.dataUrl : original;
}

function makePhotoThumb(dataUrl, edge){
  const size = edge || 96;
  return loadImageFromDataUrl(dataUrl).then(img => {
    const s = Math.min(img.width, img.height) || 1;
    const sx = Math.max(0, (img.width - s) / 2);
    const sy = Math.max(0, (img.height - s) / 2);
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    cv.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, size, size);
    return cv.toDataURL('image/jpeg', 0.72);
  });
}

function isRemotePhotoUrl(url){
  return typeof url === 'string' && /^https:\/\/(lh[0-9]\.googleusercontent\.com|drive\.google\.com)\//i.test(url);
}

function profilePhotoSrc(url){
  if(!url || typeof url !== 'string') return '';
  if(/^data:image\//i.test(url)) return url;
  try {
    const origin = typeof syncMediaOrigin === 'function' ? syncMediaOrigin() : '';
    if(origin && url.startsWith(origin + '/files/')) return url;
  } catch(e) {}
  if(!isRemotePhotoUrl(url)) return '';
  try {
    if(typeof location !== 'undefined' && /^https?:$/i.test(location.protocol)){
      return '/api/avatar?u=' + encodeURIComponent(url);
    }
  } catch(e) {}
  return url;
}

function profilePhotoImgHtml(url){
  const src = profilePhotoSrc(url);
  if(!src) return '';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const remote = isRemotePhotoUrl(url);
  const fallback = remote
    ? ' data-direct="' + esc(url) + '" onerror="if(this.dataset.direct&&this.src!==this.dataset.direct){this.referrerPolicy=\'no-referrer\';this.src=this.dataset.direct;}else{this.onerror=null;this.remove();}"'
    : '';
  return '<img alt="" referrerpolicy="no-referrer" decoding="async" src="' + esc(src) + '"' + fallback + '>';
}

function uploadProfilePhoto(file){
  return compressImageToDataUrl(file, PROFILE_PHOTO_MAX_BYTES).then(dataUrl =>
    makePhotoThumb(dataUrl).then(thumb => new Promise((resolve, reject) => {
      const uid = Date.now() + '' + Math.random().toString(36).slice(2, 6);
      const ext = /^data:image\/png/i.test(dataUrl) ? 'png' : 'jpg';
      Promise.resolve(sbSyncPush('_up_' + uid, { image: dataUrl, filename: 'avatar_' + uid + '.' + ext })).then(() => {
        let tries = 0;
        const poll = setInterval(async () => {
          tries++;
          try {
            const res = await sbJsonpGet(SYNC_URL + '?key=' + encodeURIComponent('_ur_' + uid));
            if(res && res.data){
              clearInterval(poll);
              if(res.data.ok && res.data.url) resolve({ url: res.data.url, thumb: thumb });
              else reject(new Error('Upload failed'));
            }
          } catch(e) {}
          if(tries >= 30){ clearInterval(poll); reject(new Error('Upload timed out')); }
        }, 1500);
      }).catch(() => reject(new Error('Upload failed')));
    }))
  );
}

function currentDarkIcon(){
  if(typeof window.getHdrDarkIcon === 'function') return window.getHdrDarkIcon();
  return document.body.classList.contains('dark') ? '☀️' : '🌙';
}

function syncDarkButtons(){
  const icon = currentDarkIcon();
  document.querySelectorAll('.pt-dark').forEach(b => { b.textContent = icon; });
  const legacy = document.getElementById('darkToggle');
  if(legacy) legacy.textContent = icon;
}

function toggleDark(){
  const on = document.body.classList.toggle('dark');
  localStorage.setItem('studybase_dark', on ? '1' : '0');
  syncDarkButtons();
  if(typeof window.onDarkModeChange === 'function') window.onDarkModeChange(on);
}
window.toggleDark = toggleDark;

function updateHdrProfile(){
  const btn = document.getElementById('hdrProfileBtn');
  if(!btn) return;
  const face = btn.querySelector('.hdr-profile-face') || btn;
  const tip = document.getElementById('hdrProfileTip');
  face.textContent = '👤';

  const acct = window.sbAccount || {};
  const name = acct.name || localStorage.getItem('studybase_display_name') || (window.isGuest ? 'Guest' : 'Profile');
  const email = acct.email || localStorage.getItem('studybase_email') || '';
  const role = acct.role || window.userRole || (window.isGuest ? 'guest' : 'student');
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  if(tip){
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const darkIcon = currentDarkIcon();
    tip.innerHTML = '<div class="pt-top"><div class="pt-name">' + esc(name) + '</div>' +
      '<div class="pt-actions">' +
      '<button type="button" class="pt-dark" onclick="event.stopPropagation();toggleDark()" aria-label="Toggle dark mode">' + darkIcon + '</button>' +
      '<button type="button" class="pt-signout" onclick="event.stopPropagation();sbSignOut()">Sign out</button>' +
      '</div></div>' +
      '<div class="pt-role">' + esc(roleLabel) + '</div>' +
      (email ? '<div class="pt-email">' + esc(email) + '</div>' : '');
  }
}

function bootHdrProfile(user, role){
  const isUser = !!(user && user.uid);
  const displayName = isUser
    ? (user.displayName || (user.email || '').split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    : 'Guest';
  const r = role || (isUser ? (window.userRole || 'student') : 'guest');
  window.sbAccount = { name: displayName, email: isUser ? (user.email || '') : '', role: r };
  if(isUser){
    localStorage.setItem('studybase_display_name', displayName);
    localStorage.setItem('studybase_email', user.email || '');
    applyProfileCache(user.uid);
    updateHdrProfile();
    pullProfile(user.uid).then(() => updateHdrProfile());
  } else {
    applyProfileCache('guest');
    updateHdrProfile();
  }
}

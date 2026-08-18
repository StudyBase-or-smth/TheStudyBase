// profile-store.js
//
// Per-user profile (photo + enabled subjects/classes) stored in Apps Script
// under `_profile_<uid>`, with a localStorage cache for the hub.
// Loaded after sync-config.js (needs SYNC_URL).

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
  const photoUrl = (typeof p.photoUrl === 'string' && /^(https:\/\/(lh3\.googleusercontent\.com|drive\.google\.com)\/|data:image\/)/i.test(p.photoUrl))
    ? p.photoUrl : '';
  return {
    uid: uid || p.uid || '',
    photoUrl,
    enabledSubjects: mergeEnabled(p.enabledSubjects, p.knownSubjectIds, allS),
    enabledClasses: mergeEnabled(p.enabledClasses, p.knownClassIds, allC),
    knownSubjectIds: allS.slice(),
    knownClassIds: allC.slice(),
    updatedAt: p.updatedAt || ''
  };
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
  const id = 'pf' + Date.now();
  const iframe = document.createElement('iframe');
  iframe.name = id; iframe.style.cssText = 'display:none;width:0;height:0;border:0';
  const form = document.createElement('form');
  form.method = 'POST'; form.action = SYNC_URL; form.target = id; form.style.display = 'none';
  [['key', key], ['data', JSON.stringify(data)]].forEach(([n, v]) => {
    const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = n; inp.value = v; form.appendChild(inp);
  });
  document.body.appendChild(iframe); document.body.appendChild(form); form.submit();
  setTimeout(() => { if(iframe.parentNode) iframe.remove(); if(form.parentNode) form.remove(); }, 6000);
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

function uploadProfilePhoto(file){
  return compressImageToDataUrl(file, PROFILE_PHOTO_MAX_BYTES).then(dataUrl => new Promise((resolve, reject) => {
    const uid = Date.now() + '' + Math.random().toString(36).slice(2, 6);
    const ext = /^data:image\/png/i.test(dataUrl) ? 'png' : 'jpg';
    sbSyncPush('_up_' + uid, { image: dataUrl, filename: 'avatar_' + uid + '.' + ext });
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      try {
        const res = await sbJsonpGet(SYNC_URL + '?key=' + encodeURIComponent('_ur_' + uid));
        if(res && res.data){
          clearInterval(poll);
          if(res.data.ok && res.data.url) resolve(res.data.url);
          else reject(new Error('Drive upload failed'));
        }
      } catch(e) {}
      if(tries >= 30){ clearInterval(poll); reject(new Error('Drive upload timed out')); }
    }, 1500);
  }));
}

function syncDarkButtons(){
  const icon = document.body.classList.contains('dark') ? '☀️' : '🌙';
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
  const url = window.sbProfile && window.sbProfile.photoUrl;
  const safe = url && /^(https:\/\/(lh3\.googleusercontent\.com|drive\.google\.com)\/|data:image\/)/i.test(url);
  if(safe){
    face.innerHTML = '<img alt="" src="' + url.replace(/"/g, '') + '">';
  } else if(!face.querySelector('img')){
    face.textContent = '👤';
  }

  const acct = window.sbAccount || {};
  const name = acct.name || localStorage.getItem('studybase_display_name') || (window.isGuest ? 'Guest' : 'Profile');
  const email = acct.email || localStorage.getItem('studybase_email') || '';
  const role = acct.role || window.userRole || (window.isGuest ? 'guest' : 'student');
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  if(tip){
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const darkIcon = document.body.classList.contains('dark') ? '☀️' : '🌙';
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

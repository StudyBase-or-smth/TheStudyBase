// sync-config.js
//
// Shared client config loaded before mainapp.js / subjectapp.js / classapp.js.
//
// SYNC_URL — shared JSON + file store. On this laptop (localhost / file://)
// the site talks to C:\Users\Ethan\Documents\StudyBaseData\server.js.
// Everywhere else it still uses Google Apps Script until the laptop is
// reachable over the internet.
// registerRole.js runs server-side on Netlify and keeps its own copy.
//
// DESMOS_API_KEY — Desmos Graphing Calculator key (desmos.com/my-api).
// Desmos embeds this in a public <script src>, so it is not a spend
// secret. Keep it here so subject/class pages work from file:// without
// hitting /api/desmosKey. If this is empty, those pages fall back to the
// Netlify env var via netlify/functions/desmosKey.js.
const APPS_SCRIPT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';
const LOCAL_SYNC_URL = 'http://127.0.0.1:8787/sync';

function isLocalDevHost(){
  try {
    if(location.protocol === 'file:') return true;
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch(e) {
    return false;
  }
}

const SYNC_URL = isLocalDevHost() ? LOCAL_SYNC_URL : APPS_SCRIPT_SYNC_URL;
const DESMOS_API_KEY = '7339116aaed4438899621e81f10dd250';

function syncMediaOrigin(){
  try { return new URL(SYNC_URL).origin; } catch(e) { return ''; }
}

function isAllowedSyncMediaUrl(src){
  if(!src || typeof src !== 'string') return false;
  if(src.startsWith('data:')) return true;
  if(src.startsWith('https://drive.google.com/')) return true;
  if(/^https:\/\/lh[0-9]\.googleusercontent\.com\//i.test(src)) return true;
  const origin = syncMediaOrigin();
  return !!(origin && src.startsWith(origin + '/files/'));
}

function usesConfirmableSync(){
  try {
    const h = new URL(SYNC_URL).hostname;
    return h === '127.0.0.1' || h === 'localhost';
  } catch(e) {
    return false;
  }
}

// Local sync answers the POST; Apps Script does not (CORS), so that path
// still uses a hidden form and cannot be confirmed.
function sbPushToSync(key, data){
  const body = new URLSearchParams();
  body.set('key', String(key));
  body.set('data', JSON.stringify(data));

  if(usesConfirmableSync()){
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    return fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: ctrl.signal
    }).then(res => {
      clearTimeout(timer);
      if(!res.ok) throw new Error('sync failed');
    }).catch(err => {
      clearTimeout(timer);
      throw err;
    });
  }

  return new Promise((resolve, reject) => {
    try {
      const id = 'sf' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.name = id;
      iframe.style.cssText = 'display:none;width:0;height:0;border:0';
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = SYNC_URL;
      form.target = id;
      form.style.display = 'none';
      [['key', key], ['data', JSON.stringify(data)]].forEach(([n, v]) => {
        const inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = n;
        inp.value = v;
        form.appendChild(inp);
      });
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
      setTimeout(() => {
        if(iframe.parentNode) iframe.remove();
        if(form.parentNode) form.remove();
      }, 6000);
      resolve();
    } catch(e) {
      reject(e);
    }
  });
}

var _sbMem = Object.create(null);
var _sbUnsynced = Object.create(null);

function sbMemGet(key, fallback){
  if(!key || !Object.prototype.hasOwnProperty.call(_sbMem, key)){
    return fallback !== undefined ? fallback : null;
  }
  try { return JSON.parse(JSON.stringify(_sbMem[key])); }
  catch(e){ return _sbMem[key]; }
}
function sbMemSet(key, val){
  try { _sbMem[key] = JSON.parse(JSON.stringify(val)); }
  catch(e){ _sbMem[key] = val; }
  return val;
}

function sbJsonp(url){
  return new Promise((resolve, reject) => {
    const cb = '_sbj' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const cleanup = () => { delete window[cb]; if(s.parentNode) s.remove(); };
    window[cb] = data => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
    setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 8000);
  });
}
function sbLoadKey(key){
  if(typeof SYNC_URL === 'undefined' || !key) return Promise.resolve(sbMemGet(key, null));
  return sbJsonp(SYNC_URL + '?key=' + encodeURIComponent(key)).then(res => {
    if(res && res.data !== null && res.data !== undefined){
      sbMemSet(key, res.data);
      return res.data;
    }
    return sbMemGet(key, null);
  });
}

function getUnsyncedTopicIds(bucket){
  const v = _sbUnsynced[bucket];
  return new Set(Array.isArray(v) ? v.map(String) : []);
}
function setUnsyncedTopicIds(bucket, ids){
  const arr = [...new Set((ids || []).map(String))];
  if(!arr.length) delete _sbUnsynced[bucket];
  else _sbUnsynced[bucket] = arr;
}
function markTopicsUnsynced(bucket, ids){
  const s = getUnsyncedTopicIds(bucket);
  (ids || []).forEach(id => s.add(String(id)));
  setUnsyncedTopicIds(bucket, [...s]);
}
function clearUnsyncedTopics(bucket){
  delete _sbUnsynced[bucket];
}
function isTopicUnsynced(bucket, id){
  return getUnsyncedTopicIds(bucket).has(String(id));
}
function pruneUnsyncedAfterPull(bucket, remoteList){
  const remoteIds = new Set((Array.isArray(remoteList) ? remoteList : []).map(t => String(t.id)));
  setUnsyncedTopicIds(bucket, [...getUnsyncedTopicIds(bucket)].filter(id => !remoteIds.has(id)));
}
function unsyncedTopicBuckets(){
  return Object.keys(_sbUnsynced).filter(k => getUnsyncedTopicIds(k).size > 0);
}
function mergeTopicsKeepUnsynced(remote, localKey, placeholder){
  let local = sbMemGet(localKey, []);
  if(!Array.isArray(local)) local = [];
  if(!Array.isArray(remote)) return remote;
  const unsynced = getUnsyncedTopicIds(localKey);
  const merged = remote.map(rem => {
    const loc = local.find(t => t.id == rem.id);
    if(!loc) return rem;
    if(unsynced.has(String(rem.id))) return loc;
    const m = {...rem};
    if((m.parentId == null || m.parentId === '') && loc.parentId != null && loc.parentId !== ''){
      m.parentId = loc.parentId;
    }
    if(placeholder){
      Object.keys(m).forEach(k => {
        if(typeof m[k]==='string' && m[k].includes(placeholder) &&
           loc[k] && typeof loc[k]==='string' && !loc[k].includes(placeholder)){
          m[k] = loc[k];
        }
      });
    }
    return m;
  });
  local.forEach(lt => { if(!merged.find(t => t.id == lt.id)) merged.push(lt); });
  return merged;
}
function flushUnsyncedTopics(){
  const buckets = unsyncedTopicBuckets();
  if(!buckets.length) return Promise.resolve({ flushed: false, remaining: false });
  return Promise.all(buckets.map(bucket => {
    const data = sbMemGet(bucket, []);
    return sbPushToSync(bucket, data).then(() => {
      clearUnsyncedTopics(bucket);
      return true;
    }).catch(() => false);
  })).then(results => ({
    flushed: results.some(Boolean),
    remaining: unsyncedTopicBuckets().length > 0
  }));
}
function changedTopicIds(prev, next){
  const prevMap = new Map((Array.isArray(prev) ? prev : []).map(t => [String(t.id), JSON.stringify(t)]));
  const ids = [];
  (Array.isArray(next) ? next : []).forEach(t => {
    if(prevMap.get(String(t.id)) !== JSON.stringify(t)) ids.push(t.id);
  });
  return ids;
}
function trackTopicPush(bucket, changedIds, pushPromise){
  return Promise.resolve(pushPromise).then(() => {
    clearUnsyncedTopics(bucket);
  }).catch(err => {
    if(changedIds && changedIds.length) markTopicsUnsynced(bucket, changedIds);
    throw err;
  });
}

function sbLoadAllContentKeys(){
  const keys = [];
  const add = arr => (arr || []).forEach(s => {
    keys.push(s.storageKey || (s.id + '_topics'));
    keys.push(s.unitsKey || (s.id + '_units'));
    keys.push('tnotes_' + s.id);
  });
  if(typeof subjectsData !== 'undefined') add(subjectsData.subjects);
  if(typeof classesData !== 'undefined') add(classesData.subjects);
  keys.push('studybase_events');
  return Promise.all(keys.map(k => sbLoadKey(k).catch(() => null)));
}

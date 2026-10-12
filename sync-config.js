// Shared StudyBaseData client configuration. All storage and API requests
// use the standalone server; no external hosting proxy is required.
const BASECOMPUTER_SYNC_URL = 'http://basecomputer.tail8c20e2.ts.net:8787/sync';
const PROGRAM_SYNC_URL = 'http://127.0.0.1:8787/sync';

function isLocalDevHost(){
  try {
    if(location.protocol === 'file:') return true;
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch(e) {
    return false;
  }
}

function programSyncUrl(){
  try {
    if(location.protocol === 'file:') return PROGRAM_SYNC_URL;
    const h = location.hostname;
    if(h === 'localhost' || h === '127.0.0.1'){
      const port = String(location.port || '');
      if(port === '8787') return location.origin + '/sync';
      return PROGRAM_SYNC_URL;
    }
  } catch(e) {}
  try { if(location.protocol === 'http:' || location.protocol === 'https:') return location.origin + '/sync'; } catch(e) {}
  return BASECOMPUTER_SYNC_URL;
}

function resolvedSyncUrl(){
  return programSyncUrl();
}

function programApiOrigin(){
  try {
    if(location.protocol === 'file:') return new URL(PROGRAM_SYNC_URL).origin;
    const h = location.hostname;
    if(h === 'localhost' || h === '127.0.0.1'){
      const port = String(location.port || '');
      if(port === '8787') return location.origin;
      return new URL(PROGRAM_SYNC_URL).origin;
    }
    return location.origin;
  } catch(e) {
    return '';
  }
}

const LOCAL_SYNC_URL = PROGRAM_SYNC_URL;
const SYNC_URL = resolvedSyncUrl();
const DESMOS_API_KEY = '7339116aaed4438899621e81f10dd250';

function sbApiOrigin(){
  return programApiOrigin();
}
function sbApiUrl(path){
  const p = (path && path.charAt(0) === '/') ? path : '/' + (path || '');
  const origin = sbApiOrigin();
  return origin ? origin + p : p;
}

function syncMediaOrigin(){
  try { return new URL(SYNC_URL).origin; } catch(e) { return ''; }
}

function isAllowedSyncMediaUrl(src){
  if(!src || typeof src !== 'string') return false;
  if(src.startsWith('data:')) return true;
  if(src.startsWith('https://drive.google.com/')) return true;
  if(/^https:\/\/lh[0-9]\.googleusercontent\.com\//i.test(src)) return true;
  const origin = syncMediaOrigin();
  if (!origin) return false;
  if (src.startsWith(origin + '/files/')) return true;
  try {
    const u = new URL(src);
    return u.origin === origin && /\/users\/[A-Za-z0-9._-]+\/photo\/?$/.test(u.pathname);
  } catch (e) {
    return false;
  }
}

function usesConfirmableSync(){ return true; }

let _sbAuthWait = null;
let _sbIdToken = '';

function sbCurrentUser(){
  try { return (window.__sbAuth && window.__sbAuth.currentUser) || null; }
  catch(e){ return null; }
}
function sbIsGuestSession(){
  try {
    return !!(window.isGuest || sessionStorage.getItem('studybase_guest') === '1');
  } catch(e){ return false; }
}
function sbWaitForFirebaseUser(){
  if(!usesConfirmableSync()) return Promise.resolve(null);
  if(sbIsGuestSession()) return Promise.resolve(null);
  const have = sbCurrentUser();
  if(have) return Promise.resolve(have);
  if(_sbAuthWait) return _sbAuthWait;
  _sbAuthWait = new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if(sbIsGuestSession()) return resolve(null);
      const user = sbCurrentUser();
      if(user) return resolve(user);
      if(Date.now() - start > 8000) return resolve(null);
      setTimeout(tick, 50);
    };
    tick();
  }).finally(() => { _sbAuthWait = null; });
  return _sbAuthWait;
}
function sbGetIdToken(){
  return sbWaitForFirebaseUser().then(user => {
    if(!user) return '';
    return user.getIdToken().then(token => {
      _sbIdToken = token || '';
      return _sbIdToken;
    });
  }).catch(() => '');
}
function sbStoreAuthHeaders(token){
  if(!token) return {};
  return { Authorization: 'Bearer ' + token };
}
function sbMediaUrl(src){
  if(!src || typeof src !== 'string' || !usesConfirmableSync()) return src;
  if(!_sbIdToken) return src;
  try {
    const origin = syncMediaOrigin();
    if(!origin) return src;
    const u = new URL(src);
    if(u.origin !== origin) return src;
    if(!u.pathname.startsWith('/files/') && !/^\/users\/[A-Za-z0-9._-]+\/photo\/?$/.test(u.pathname)) return src;
    u.searchParams.set('token', _sbIdToken);
    return u.href;
  } catch(e){ return src; }
}
function sbUnsignMediaUrl(src){
  try {
    const u = new URL(src);
    if(u.origin === syncMediaOrigin()) u.searchParams.delete('token');
    return u.href;
  } catch(e){ return src; }
}
function sbAuthorizedFetch(url, opts){
  if(!usesConfirmableSync()) return fetch(url, opts);
  return sbGetIdToken().then(token => {
    if(!token) throw new Error('Sign in to use the study store');
    const headers = Object.assign({}, (opts && opts.headers) || {}, sbStoreAuthHeaders(token));
    const ctrl = new AbortController();
    const ms = (opts && opts.timeout) || 15000;
    const timer = setTimeout(() => ctrl.abort(), ms);
    const fetchOpts = Object.assign({}, opts, { headers, signal: ctrl.signal });
    delete fetchOpts.timeout;
    return fetch(url, fetchOpts).then(res => {
      clearTimeout(timer);
      return res;
    }).catch(err => {
      clearTimeout(timer);
      throw err;
    });
  });
}
try { localStorage.removeItem('studybase_store_login'); } catch(e){}

// Server writes are authenticated and only succeed after acknowledgement.
const _sbWriteQueue = new Map();
function sbPushToSync(key, data){
  const body = new URLSearchParams();
  body.set('key', String(key));
  body.set('data', JSON.stringify(data));
  const send = () => sbAuthorizedFetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }).then(res => {
    if(!res.ok) throw new Error('sync failed');
  });
  const pending = (_sbWriteQueue.get(key) || Promise.resolve()).catch(() => {}).then(send);
  _sbWriteQueue.set(key, pending);
  const cleanup = () => { if(_sbWriteQueue.get(key) === pending) _sbWriteQueue.delete(key); };
  pending.then(cleanup, cleanup);
  return pending;
}

var _sbMem = Object.create(null);
var _sbUnsynced = Object.create(null);
var SB_DISK_PREFIX = 'sbdisk:';
var SB_UNSYNCED_KEY = 'sbdisk:_unsynced';
var SB_IDB_NAME = 'studybase-cache';
var SB_IDB_STORE = 'kv';
var _sbDiskReady = false;
var _sbDiskWaiters = [];

function sbWhenDiskReady(fn){
  if(typeof fn !== 'function') return;
  if(_sbDiskReady){ try { fn(); } catch(e) {} return; }
  _sbDiskWaiters.push(fn);
}
function _sbDiskNotify(){
  _sbDiskReady = true;
  const waiters = _sbDiskWaiters.splice(0);
  waiters.forEach(fn => { try { fn(); } catch(e) {} });
}
function sbDiskKey(key){ return SB_DISK_PREFIX + String(key); }

function _sbIdbOpen(){
  return new Promise((resolve, reject) => {
    if(typeof indexedDB === 'undefined'){ reject(new Error('no idb')); return; }
    const req = indexedDB.open(SB_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(SB_IDB_STORE)) db.createObjectStore(SB_IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function _sbIdbPut(key, json){
  return _sbIdbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(SB_IDB_STORE, 'readwrite');
    tx.objectStore(SB_IDB_STORE).put(json, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}
function _sbIdbGetAll(){
  return _sbIdbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(SB_IDB_STORE, 'readonly');
    const out = {};
    const req = tx.objectStore(SB_IDB_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if(cursor){
        out[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        db.close();
        resolve(out);
      }
    };
    req.onerror = () => { db.close(); reject(req.error); };
  }));
}
function _sbLsSet(key, json){
  try {
    localStorage.setItem(sbDiskKey(key), json);
    return true;
  } catch(e) {
    return false;
  }
}
function sbPersistKey(key, val){
  if(!key) return;
  let json;
  try { json = JSON.stringify(val); }
  catch(e) { return; }
  if(_sbLsSet(key, json)) return;
  try { localStorage.removeItem(sbDiskKey(key)); } catch(e) {}
  _sbIdbPut(key, json).catch(() => {});
}
function _sbPersistUnsynced(){
  try { localStorage.setItem(SB_UNSYNCED_KEY, JSON.stringify(_sbUnsynced)); }
  catch(e) {}
}
function sbHydrateFromLocalStorage(){
  try {
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k || k.indexOf(SB_DISK_PREFIX) !== 0) continue;
      if(k === SB_UNSYNCED_KEY) continue;
      const memKey = k.slice(SB_DISK_PREFIX.length);
      try { _sbMem[memKey] = JSON.parse(localStorage.getItem(k)); }
      catch(e) {}
    }
    const uns = localStorage.getItem(SB_UNSYNCED_KEY);
    if(uns){
      try {
        const obj = JSON.parse(uns);
        if(obj && typeof obj === 'object' && !Array.isArray(obj)){
          Object.keys(obj).forEach(k => { _sbUnsynced[k] = obj[k]; });
        }
      } catch(e) {}
    }
  } catch(e) {}
}
function sbHydrateFromIdb(){
  return _sbIdbGetAll().then(map => {
    Object.keys(map || {}).forEach(k => {
      if(!k || map[k] == null || Object.prototype.hasOwnProperty.call(_sbMem, k)) return;
      try { _sbMem[k] = typeof map[k] === 'string' ? JSON.parse(map[k]) : map[k]; }
      catch(e){ _sbMem[k] = map[k]; }
    });
  }).catch(() => {}).then(_sbDiskNotify);
}

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
  sbPersistKey(key, _sbMem[key]);
  return val;
}

sbHydrateFromLocalStorage();
if(typeof indexedDB !== 'undefined') sbHydrateFromIdb();
else _sbDiskNotify();

// Retain the existing helper name for callers; transport is authenticated fetch.
function sbJsonp(url){
  return sbAuthorizedFetch(url, { timeout: 8000 }).then(res => {
    if(!res.ok) throw new Error('sync failed');
    return res.json();
  });
}
function jsonpGet(url, timeoutMs){ return sbJsonp(url); }
function sbJsonpGet(url){ return sbJsonp(url); }
function sbIngestKey(key, data, placeholder){
  if(key && String(key).endsWith('_topics')){
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    sbMemSet(key, mergeTopicsKeepUnsynced(list, key, placeholder));
    return sbMemGet(key, []);
  }
  if(key && String(key).endsWith('_units')){
    const items = normalizeUnits(data);
    sbMemSet(key, items);
    return items;
  }
  sbMemSet(key, data);
  return data;
}

function sbLoadKey(key){
  if(typeof SYNC_URL === 'undefined' || !key) return Promise.resolve(sbMemGet(key, null));
  return sbJsonp(SYNC_URL + '?key=' + encodeURIComponent(key)).then(res => {
    if(res && res.data !== null && res.data !== undefined){
      return sbIngestKey(key, res.data);
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
  _sbPersistUnsynced();
}
function markTopicsUnsynced(bucket, ids){
  const s = getUnsyncedTopicIds(bucket);
  (ids || []).forEach(id => s.add(String(id)));
  setUnsyncedTopicIds(bucket, [...s]);
}
function clearUnsyncedTopics(bucket){
  delete _sbUnsynced[bucket];
  _sbPersistUnsynced();
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
  const merged = remote.filter(rem => !unsynced.has(String(rem.id)) || local.some(t => t.id == rem.id)).map(rem => {
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
  return normalizeTopicList(merged);
}
function flushUnsyncedTopics(){
  const buckets = unsyncedTopicBuckets();
  if(!buckets.length) return Promise.resolve({ flushed: false, remaining: false });
  return Promise.all(buckets.map(bucket => {
    const version = _sbPushVersions[bucket] || 0;
    const data = sbMemGet(bucket, []);
    const payload = Array.isArray(data) ? serializeTopicList(data) : data;
    return sbPushToSync(bucket, payload).then(() => {
      if((_sbPushVersions[bucket] || 0) === version) clearUnsyncedTopics(bucket);
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
  const nextIds = new Set((Array.isArray(next) ? next : []).map(t => String(t.id)));
  prevMap.forEach((_, id) => { if(!nextIds.has(id)) ids.push(id); });
  return ids;
}
const _sbPushVersions = Object.create(null);
function trackTopicPush(bucket, changedIds, pushPromise){
  const version = (_sbPushVersions[bucket] || 0) + 1;
  _sbPushVersions[bucket] = version;
  if(changedIds && changedIds.length) markTopicsUnsynced(bucket, changedIds);
  return Promise.resolve(pushPromise).then(() => {
    if(_sbPushVersions[bucket] === version) clearUnsyncedTopics(bucket);
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

// ── Topic / unit schema (v1) ──
// Disk shape is slim: core fields + layout content + notes on the topic.
// UI code always sees the fat object from normalizeTopic().
function newTopicId(){
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function newUnitId(){
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function newNoteId(){
  return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const TOPIC_LAYOUTS = ['basic','overview','math','text','pdf','table'];
const LAYOUT_CONTENT_KEYS = {
  basic:    ['definition','keyPoints','formula','materials','process','safety','examTip'],
  overview: ['bodyText','keyPoints'],
  text:     ['bodyText','keyPoints'],
  math:     ['formula','desmosState'],
  pdf:      ['pdfData','pdfName'],
  table:    ['tableData']
};

function emptyTableData(){ return { columns: [], rows: [] }; }

function normalizeNotes(raw){
  if(!raw) return {};
  if(Array.isArray(raw)) return { general: raw };
  if(typeof raw === 'object') return raw;
  return {};
}

function isEmptyTable(td){
  if(!td || typeof td !== 'object') return true;
  const cols = td.columns || [];
  const rows = td.rows || [];
  const hasCol = cols.some(c => String(c || '').trim());
  const hasRow = rows.some(r => (r || []).some(c => String(c || '').trim()));
  return !hasCol && !hasRow;
}

function compactContentValue(k, v){
  if(v == null || v === '') return undefined;
  if(Array.isArray(v) && !v.length) return undefined;
  if(k === 'tableData' && isEmptyTable(v)) return undefined;
  if(k === 'desmosState' && (typeof v !== 'object' || v === null)) return undefined;
  return v;
}

function topicContentFromRaw(raw, layout){
  const keys = LAYOUT_CONTENT_KEYS[layout] || LAYOUT_CONTENT_KEYS.basic;
  const src = raw.content && typeof raw.content === 'object' ? Object.assign({}, raw, raw.content) : raw;
  const content = {};
  keys.forEach(k => {
    if(src[k] !== undefined) content[k] = src[k];
  });
  return content;
}

function normalizeTopic(raw){
  if(!raw || typeof raw !== 'object') return null;
  const layout = TOPIC_LAYOUTS.includes(raw.layout) ? raw.layout : 'basic';
  const src = raw.content && typeof raw.content === 'object' ? Object.assign({}, raw, raw.content) : raw;
  const id = raw.id != null && raw.id !== '' ? String(raw.id) : newTopicId();
  const parentId = raw.parentId != null && raw.parentId !== '' ? String(raw.parentId) : null;
  const t = {
    id,
    name: String(raw.name || ''),
    layout,
    unit: raw.unit != null && raw.unit !== '' ? String(raw.unit) : '',
    parentId,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : null,
    relatedTerms: Array.isArray(raw.relatedTerms) ? raw.relatedTerms.slice() : [],
    flashcardQA: Array.isArray(raw.flashcardQA) ? raw.flashcardQA.slice() : [],
    addedBy: raw.addedBy || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    notes: normalizeNotes(raw.notes),
    definition: '',
    keyPoints: [],
    formula: '',
    materials: '',
    process: '',
    safety: '',
    examTip: '',
    bodyText: '',
    pdfData: '',
    pdfName: '',
    tableData: emptyTableData(),
    desmosState: null
  };
  Object.assign(t, topicContentFromRaw(src, layout));
  if(!Array.isArray(t.keyPoints)) t.keyPoints = [];
  if(!t.tableData || typeof t.tableData !== 'object') t.tableData = emptyTableData();
  return t;
}

function serializeTopic(t){
  const n = normalizeTopic(t);
  if(!n) return null;
  const layout = n.layout || 'basic';
  const content = {};
  (LAYOUT_CONTENT_KEYS[layout] || LAYOUT_CONTENT_KEYS.basic).forEach(k => {
    const v = compactContentValue(k, n[k]);
    if(v !== undefined) content[k] = v;
  });
  const notes = {};
  Object.keys(n.notes || {}).forEach(bk => {
    const arr = n.notes[bk];
    if(Array.isArray(arr) && arr.length) notes[bk] = arr;
  });
  const out = { v: 1, id: n.id, name: n.name, layout };
  if(n.unit) out.unit = n.unit;
  if(n.parentId) out.parentId = n.parentId;
  if(n.order != null) out.order = n.order;
  if(n.relatedTerms.length) out.relatedTerms = n.relatedTerms;
  if(n.flashcardQA.length) out.flashcardQA = n.flashcardQA;
  if(n.addedBy) out.addedBy = n.addedBy;
  if(n.createdAt) out.createdAt = n.createdAt;
  if(n.updatedAt) out.updatedAt = n.updatedAt;
  if(Object.keys(notes).length) out.notes = notes;
  if(Object.keys(content).length) out.content = content;
  return out;
}

function normalizeTopicList(raw){
  if(raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) raw = raw.items;
  if(!Array.isArray(raw)) return [];
  return raw.map(normalizeTopic).filter(Boolean);
}

function serializeTopicList(list){
  return (Array.isArray(list) ? list : []).map(serializeTopic).filter(Boolean);
}

function unitSlugId(name){
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return 'u_' + (slug || 'unit');
}

function normalizeUnits(raw){
  if(raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) raw = raw.items;
  if(!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(u => {
    if(u && typeof u === 'object'){
      const name = String(u.name || '').trim();
      if(!name) return null;
      let id = u.id != null && u.id !== '' ? String(u.id) : newUnitId();
      if(seen.has(id)) id = newUnitId();
      seen.add(id);
      return { id, name };
    }
    const name = String(u || '').trim();
    if(!name) return null;
    let id = unitSlugId(name);
    if(seen.has(id)) id = newUnitId();
    seen.add(id);
    return { id, name };
  }).filter(Boolean);
}

function serializeUnits(units){
  return { v: 1, items: normalizeUnits(units) };
}

function findUnit(units, ref){
  if(ref == null || ref === '') return null;
  const s = String(ref);
  return (units || []).find(u => u.id === s || u.name === s) || null;
}

function unitLabel(unitRef, units){
  if(!unitRef) return '';
  const hit = findUnit(units, unitRef);
  return hit ? hit.name : String(unitRef);
}

function topicMatchesUnit(t, u){
  if(!t || !t.unit || !u) return false;
  if(typeof u === 'string') return t.unit === u;
  return t.unit === u.id || t.unit === u.name;
}

function topicInActiveUnits(t, active, units){
  if(!active || !active.size) return true;
  if(!t || !t.unit) return false;
  if(active.has(t.unit)) return true;
  const u = findUnit(units, t.unit);
  return !!(u && active.has(u.id));
}

function unitTopicCount(topics, u){
  return (topics || []).filter(t => topicMatchesUnit(t, u)).length;
}

function pinHas(pinned, id){
  const sid = String(id);
  return (pinned || []).some(p => String(p) === sid);
}

function absorbLegacyNotes(topics, notesObj){
  if(!notesObj || typeof notesObj !== 'object') return { topics: topics || [], changed: false };
  let changed = false;
  const next = (topics || []).map(t => {
    const n = notesObj[t.id] || notesObj[String(t.id)];
    if(!n) return t;
    if(t.notes && Object.keys(t.notes).length) return t;
    changed = true;
    const notes = Array.isArray(n) ? { general: n } : n;
    return Object.assign({}, t, { notes: normalizeNotes(notes) });
  });
  return { topics: next, changed };
}

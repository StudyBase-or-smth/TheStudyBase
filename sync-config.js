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
  return normalizeTopicList(merged);
}
function flushUnsyncedTopics(){
  const buckets = unsyncedTopicBuckets();
  if(!buckets.length) return Promise.resolve({ flushed: false, remaining: false });
  return Promise.all(buckets.map(bucket => {
    const data = sbMemGet(bucket, []);
    const payload = Array.isArray(data) ? serializeTopicList(data) : data;
    return sbPushToSync(bucket, payload).then(() => {
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

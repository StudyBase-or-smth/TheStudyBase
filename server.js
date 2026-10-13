// StudyBaseProgram API/sync server for container deployment.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const querystring = require('querystring');
const mediaTickets = require('./media-ticket');
const crypto = require('node:crypto');
const joinAttempts = new Map();
const { handleCors } = require('./cors');
const { validUid, authorizeKey, readable, writable } = require('./access-policy');

const PORT = parseInt(process.env.PORT || '8787', 10);
const PROGRAM_DIR = __dirname;
const DATA_DIR = process.env.STUDYBASE_DATA_DIR || path.join(PROGRAM_DIR, 'StudyBaseData');
const JSON_DIR = path.join(DATA_DIR, 'json');
const FILES_DIR = path.join(DATA_DIR, 'files');
const USERS_DIR = path.join(DATA_DIR, 'users');
const ANALYSER_DIR = path.join(DATA_DIR, 'analyser');
const WEB_BLOCK_DIRS = new Set(['.git', 'node_modules', 'studybasedata']);
const WEB_BLOCK_FILES = new Set(['secrets.json', '.env', 'website.json']);
const PHOTO_NAMES = ['photo.jpg', 'photo.jpeg', 'photo.png', 'photo.webp', 'photo.gif', 'photo.bmp'];
const MAX_BODY = 28 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const KEY_RE = /^[A-Za-z0-9._-]{1,120}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,180}$/;

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
};
const EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
};
const WEB_MIME = Object.assign({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
}, EXT_MIME);

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(JSON_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(USERS_DIR, { recursive: true });
  fs.mkdirSync(ANALYSER_DIR, { recursive: true });
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const PUBLIC_URL = new URL(process.env.STUDYBASE_PUBLIC_URL || ('http://127.0.0.1:' + PORT));
if (!['http:', 'https:'].includes(PUBLIC_URL.protocol) || PUBLIC_URL.username || PUBLIC_URL.password || PUBLIC_URL.search || PUBLIC_URL.hash || PUBLIC_URL.pathname !== '/') {
  throw new Error('STUDYBASE_PUBLIC_URL must be an HTTP(S) origin without credentials, path, query or fragment');
}
function publicOrigin() { return PUBLIC_URL.origin; }

function jsonPath(key) {
  return path.join(JSON_DIR, key + '.json');
}

function topicDir(key) {
  return path.join(JSON_DIR, key);
}

function isTopicsKey(key) {
  return key.endsWith('_topics') && !key.startsWith('_');
}

function isUnitsKey(key) {
  return key.endsWith('_units') && !key.startsWith('_');
}

function isProfileKey(key) {
  return key.startsWith('_profile_') && key.length > '_profile_'.length;
}

function isAnalyserDraftKey(key) {
  return key.startsWith('_analyser_draft_') && key.length > '_analyser_draft_'.length;
}

function isAnalyserHistoryKey(key) {
  return key.startsWith('_analyser_') && !isAnalyserDraftKey(key) && key.length > '_analyser_'.length;
}

function analyserUidFromKey(key) {
  if (isAnalyserDraftKey(key)) return key.slice('_analyser_draft_'.length);
  if (isAnalyserHistoryKey(key)) return key.slice('_analyser_'.length);
  return '';
}

function analyserUserDir(uid) {
  const id = safeUid(uid);
  return id ? path.join(ANALYSER_DIR, id) : null;
}

function readAnalyserFile(uid, file) {
  const dir = analyserUserDir(uid);
  if (!dir) return null;
  const dest = path.join(dir, file);
  if (fs.existsSync(dest) && fs.statSync(dest).isFile()) return readJsonFile(dest);
  const key = file === 'draft.json' ? '_analyser_draft_' + uid : '_analyser_' + uid;
  const legacy = jsonPath(key);
  if (legacy && fs.existsSync(legacy) && fs.statSync(legacy).isFile()) {
    const data = readJsonFile(legacy);
    if (data != null) {
      writeJsonFile(dest, data);
      try { fs.unlinkSync(legacy); } catch (e) {}
    }
    return data;
  }
  return null;
}

function writeAnalyserFile(uid, file, value) {
  const dir = analyserUserDir(uid);
  if (!dir) return;
  writeJsonFile(path.join(dir, file), value);
  const key = file === 'draft.json' ? '_analyser_draft_' + uid : '_analyser_' + uid;
  const legacy = jsonPath(key);
  if (fs.existsSync(legacy) && fs.statSync(legacy).isFile()) {
    try { fs.unlinkSync(legacy); } catch (e) {}
  }
}

function profileUidFromKey(key) {
  return key.slice('_profile_'.length);
}

function safeUid(uid) { return validUid(uid) ? uid : null; }

function userDir(uid) {
  const id = safeUid(uid);
  return id ? path.join(USERS_DIR, id) : null;
}

function userProfilePath(uid) {
  const dir = userDir(uid);
  return dir ? path.join(dir, 'profile.json') : null;
}

function findUserPhoto(uid) {
  const dir = userDir(uid);
  if (!dir || !fs.existsSync(dir)) return null;
  for (let i = 0; i < PHOTO_NAMES.length; i++) {
    const p = path.join(dir, PHOTO_NAMES[i]);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function readProfile(uid) {
  const dest = userProfilePath(uid);
  if (dest && fs.existsSync(dest)) return readJsonFile(dest);
  const legacy = jsonPath('_profile_' + uid);
  if (legacy && fs.existsSync(legacy) && fs.statSync(legacy).isFile()) {
    const data = readJsonFile(legacy);
    if (data && dest) {
      writeJsonFile(dest, data);
      try { fs.unlinkSync(legacy); } catch (e) {}
    }
    return data;
  }
  return null;
}

function writeProfile(uid, value) {
  const dest = userProfilePath(uid);
  if (!dest) return;
  writeJsonFile(dest, value);
  const legacy = jsonPath('_profile_' + uid);
  if (fs.existsSync(legacy) && fs.statSync(legacy).isFile()) {
    try { fs.unlinkSync(legacy); } catch (e) {}
  }
}

function saveAvatar(uid, payload, req) {
  const dir = userDir(uid);
  if (!dir) return { ok: false };
  const dataUrl = payload && typeof payload.image === 'string' ? payload.image : '';
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return { ok: false };
  const mime = (m[1] || 'application/octet-stream').trim().toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext || ext === '.pdf') return { ok: false };
  let buf;
  try {
    buf = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
  } catch (e) {
    return { ok: false };
  }
  if (!buf.length || buf.length > MAX_FILE) return { ok: false };
  fs.mkdirSync(dir, { recursive: true });
  PHOTO_NAMES.forEach(name => {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch (e) {}
  });
  fs.writeFileSync(path.join(dir, 'photo' + ext), buf);
  return { ok: true, url: publicOrigin(req) + '/users/' + safeUid(uid) + '/photo' };
}

function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJsonFile(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf8');
}

function safeIdFile(id) {
  const s = String(id).replace(/[^A-Za-z0-9._-]/g, '_');
  return FILE_RE.test(s) ? s + '.json' : null;
}

function unitSlugId(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return 'u_' + (slug || 'unit');
}

function asUnitItems(value) {
  let raw = value;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) raw = raw.items;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(u => {
    if (u && typeof u === 'object') {
      const name = String(u.name || '').trim();
      if (!name) return null;
      let id = u.id != null && u.id !== '' ? String(u.id) : unitSlugId(name);
      if (seen.has(id)) id = id + '_' + Math.random().toString(36).slice(2, 6);
      seen.add(id);
      return { id, name };
    }
    const name = String(u || '').trim();
    if (!name) return null;
    let id = unitSlugId(name);
    if (seen.has(id)) id = id + '_' + Math.random().toString(36).slice(2, 6);
    seen.add(id);
    return { id, name };
  }).filter(Boolean);
}

function asTopicList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

function readTopics(key) {
  const dir = topicDir(key);
  const legacy = jsonPath(key);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    const meta = readJsonFile(path.join(dir, '_meta.json'));
    let ids = meta && Array.isArray(meta.ids) ? meta.ids : null;
    if (!ids) {
      ids = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json') && f !== '_meta.json')
        .map(f => path.basename(f, '.json'));
    }
    const topics = [];
    ids.forEach(id => {
      const fn = safeIdFile(id);
      if (!fn) return;
      const t = readJsonFile(path.join(dir, fn));
      if (t) topics.push(t);
    });
    return topics;
  }
  if (fs.existsSync(legacy)) {
    const data = readJsonFile(legacy);
    const list = asTopicList(data);
    try {
      writeTopics(key, list);
      return readTopics(key);
    } catch (e) {
      return list;
    }
  }
  return null;
}

function writeTopics(key, value) {
  const list = asTopicList(value);
  const dir = topicDir(key);
  fs.mkdirSync(dir, { recursive: true });
  const ids = [];
  const keepFiles = new Set(['_meta.json']);
  list.forEach(t => {
    if (!t || t.id == null || t.id === '') return;
    const fn = safeIdFile(t.id);
    if (!fn) return;
    ids.push(String(t.id));
    keepFiles.add(fn);
    const p = path.join(dir, fn);
    const next = JSON.stringify(t, null, 2);
    let prev = '';
    try { prev = fs.readFileSync(p, 'utf8'); } catch (e) {}
    if (prev !== next) fs.writeFileSync(p, next, 'utf8');
  });
  writeJsonFile(path.join(dir, '_meta.json'), { v: 1, ids });
  fs.readdirSync(dir).forEach(f => {
    if (!keepFiles.has(f)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
    }
  });
  const legacy = jsonPath(key);
  if (fs.existsSync(legacy) && fs.statSync(legacy).isFile()) {
    try { fs.unlinkSync(legacy); } catch (e) {}
  }
}

function readKey(key) {
  if (isProfileKey(key)) return readProfile(profileUidFromKey(key));
  if (isAnalyserHistoryKey(key)) return readAnalyserFile(analyserUidFromKey(key), 'history.json');
  if (isAnalyserDraftKey(key)) return readAnalyserFile(analyserUidFromKey(key), 'draft.json');
  if (isTopicsKey(key)) return readTopics(key);
  const p = jsonPath(key);
  if (!fs.existsSync(p)) return null;
  const data = readJsonFile(p);
  if (isUnitsKey(key) && Array.isArray(data)) {
    return { v: 1, items: asUnitItems(data) };
  }
  return data;
}

function writeKey(key, value) {
  if (isProfileKey(key)) {
    writeProfile(profileUidFromKey(key), value);
    return;
  }
  if (isAnalyserHistoryKey(key)) {
    writeAnalyserFile(analyserUidFromKey(key), 'history.json', value);
    return;
  }
  if (isAnalyserDraftKey(key)) {
    writeAnalyserFile(analyserUidFromKey(key), 'draft.json', value);
    return;
  }
  if (isTopicsKey(key)) {
    writeTopics(key, value);
    return;
  }
  if (isUnitsKey(key)) {
    writeJsonFile(jsonPath(key), { v: 1, items: asUnitItems(value) });
    return;
  }
  writeJsonFile(jsonPath(key), value);
}

function sanitizeUploadName(raw, mime) {
  const base = path.basename(String(raw || 'file')).replace(/[^A-Za-z0-9._-]/g, '_');
  let ext = path.extname(base).toLowerCase();
  if (!EXT_MIME[ext]) ext = MIME_EXT[mime] || '';
  const stem = path.basename(base, path.extname(base)).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'file';
  return Date.now() + '_' + stem + ext;
}

function saveUpload(payload, req) {
  const dataUrl = payload && typeof payload.image === 'string' ? payload.image : '';
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return { ok: false };
  const mime = (m[1] || 'application/octet-stream').trim().toLowerCase();
  if (!MIME_EXT[mime]) return { ok: false };
  let buf;
  try {
    buf = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
  } catch (e) {
    return { ok: false };
  }
  if (!buf.length || buf.length > MAX_FILE) return { ok: false };
  const name = sanitizeUploadName(payload.filename, mime);
  if (!FILE_RE.test(name)) return { ok: false };
  fs.writeFileSync(path.join(FILES_DIR, name), buf);
  return { ok: true, url: publicOrigin(req) + '/files/' + name };
}

function handleGetSync(url, res, user) {
  const key = url.searchParams.get('key') || '';
  if (url.searchParams.has('callback')) return send(res, 400, 'text/plain', 'JSONP is disabled');
  if (!KEY_RE.test(key)) {
    return send(res, 400, 'text/plain', 'bad key');
  }
  authorizeKey(key, user, false, uploadOwner);
  const payload = JSON.stringify({ data: readable(key, readKey(key), user) });
  send(res, 200, 'application/json; charset=utf-8', payload);
}

function handlePostSync(key, dataStr, req, res, user) {
  authorizeKey(key, user, true, uploadOwner);
  if (!KEY_RE.test(key)) return send(res, 400, 'text/plain', 'bad key');
  if (key.startsWith('_up_avatar_')) {
    const uid = key.slice('_up_avatar_'.length);
    if (!safeUid(uid)) return send(res, 400, 'text/plain', 'bad user id');
    let payload;
    try { payload = JSON.parse(dataStr); } catch (e) {
      writeKey('_ur_avatar_' + uid, { ok: false });
      return send(res, 400, 'text/plain', 'bad json');
    }
    writeKey('_ur_avatar_' + uid, saveAvatar(uid, payload, req));
    return send(res, 200, 'text/plain; charset=utf-8', 'ok');
  }
  if (key.startsWith('_up_')) {
    const uid = key.slice(4);
    if (!KEY_RE.test(uid)) return send(res, 400, 'text/plain', 'bad upload id');
    let payload;
    try { payload = JSON.parse(dataStr); } catch (e) {
      writeKey('_ur_' + uid, { ok: false });
      return send(res, 400, 'text/plain', 'bad json');
    }
    const result = saveUpload(payload, req);
    writeJsonFile(path.join(DATA_DIR, 'upload-owners', uid + '.json'), { uid: user.uid });
    writeKey('_ur_' + uid, result);
    return send(res, 200, 'text/plain; charset=utf-8', 'ok');
  }
  let value;
  try { value = JSON.parse(dataStr); } catch (e) {
    return send(res, 400, 'text/plain', 'bad json');
  }
  value = writable(key, value, readKey(key), user, readKey);
  writeKey(key, value);
  send(res, 200, 'text/plain; charset=utf-8', 'ok');
}

function handleUserPhoto(uid, res) {
  const id = safeUid(uid);
  if (!id) return send(res, 400, 'text/plain', 'bad user');
  const p = findUserPhoto(id);
  if (!p) return send(res, 404, 'text/plain', 'not found');
  const ext = path.extname(p).toLowerCase();
  const type = EXT_MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Disposition': 'inline; filename="' + path.basename(p) + '"',
    'Cache-Control': 'private, no-store',
  });
  fs.createReadStream(p).pipe(res);
}

function uploadOwner(id) {
  if (!/^[A-Za-z0-9_-]{1,116}$/.test(id)) return null;
  const record = readJsonFile(path.join(DATA_DIR, 'upload-owners', id + '.json'));
  return record && record.uid;
}

function handleFile(name, res) {
  if (!EXT_MIME[path.extname(name).toLowerCase()]) return send(res, 404, 'text/plain', 'not found');
  if (!FILE_RE.test(name)) return send(res, 400, 'text/plain', 'bad file');
  const p = path.join(FILES_DIR, name);
  if (path.dirname(p) !== FILES_DIR || !fs.existsSync(p)) {
    return send(res, 404, 'text/plain', 'not found');
  }
  const ext = path.extname(name).toLowerCase();
  const type = EXT_MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Disposition': 'inline; filename="' + name + '"',
    'Cache-Control': 'private, no-store',
  });
  fs.createReadStream(p).pipe(res);
}

const websiteDir = String(process.env.STUDYBASE_WEBSITE_DIR || '').trim();
function websiteReady() { return !!websiteDir; }

function resolveWebsiteFile(pathname) {
  if (!websiteReady()) return null;
  const root = path.resolve(websiteDir);
  let rel = '/';
  try { rel = decodeURIComponent(pathname || '/'); } catch (e) { return null; }
  if (rel === '/') rel = 'index.html';
  else rel = rel.replace(/^\/+/, '');
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some(p => p.startsWith('.') || WEB_BLOCK_DIRS.has(p.toLowerCase()))) return null;
  if (WEB_BLOCK_FILES.has(parts[parts.length - 1].toLowerCase())) return null;
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(target);
    const realData = fs.realpathSync(DATA_DIR);
    if (!realTarget.startsWith(realRoot + path.sep)) return null;
    if (realTarget === realData || realTarget.startsWith(realData + path.sep)) return null;
    if (WEB_BLOCK_FILES.has(path.basename(realTarget).toLowerCase()) || path.basename(realTarget).startsWith('.')) return null;
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      const idx = path.join(target, 'index.html');
      if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return resolveWebsiteFile('/' + parts.join('/') + '/index.html');
      return null;
    }
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return realTarget;
  } catch (e) {
    return null;
  }
  return null;
}

function handleWebsiteFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = WEB_MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isSyncPath(pathname) {
  return pathname === '/sync';
}

const standaloneApi = require('./api');
const handleStandaloneApi = standaloneApi.handleApi;

ensureDirs();

const server = http.createServer(async (req, res) => {
  try {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || '127.0.0.1'));
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (handleCors(req, res)) return;
  if (pathname === '/_status' || pathname.startsWith('/_website')) return send(res, 404, 'text/plain', 'not found');
  if (req.method === 'GET' && pathname === '/health') return send(res, 200, 'application/json', '{"ok":true}');

  if (pathname === '/api/joinLobby' && req.method === 'POST') {
    const identity = await standaloneApi.requireStoreUser(req, DATA_DIR);
    const now = Date.now();
    for (const [uid, hit] of joinAttempts) if (hit.until <= now) joinAttempts.delete(uid);
    const hit = joinAttempts.get(identity.uid) || { count: 0, until: now + 60000 };
    hit.count++; joinAttempts.set(identity.uid, hit);
    if (hit.count > 10) return send(res, 429, 'application/json', '{"error":"Too many join attempts; try again in a minute"}');
    let body; try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, 'application/json', '{"error":"Invalid request"}'); }
    if (!body || !/^[A-Z0-9]{6}$/.test(body.code) || typeof body.password !== 'string' || body.password.length > 256) return send(res, 400, 'application/json', '{"error":"Invalid lobby or password"}');
    const key = '_kc_lobby_' + body.code;
    const lobby = readKey(key);
    if (!lobby || lobby.status === 'closed') return send(res, 404, 'application/json', '{"error":"Lobby not found"}');
    if (lobby.hostUid !== identity.uid && !(lobby.players || []).some(p => p.uid === identity.uid)) {
      if (lobby.status !== 'waiting') return send(res, 403, 'application/json', '{"error":"Lobby has already started"}');
      const hash = crypto.createHash('sha256').update(body.password).digest('hex');
      if (lobby.passwordHash && hash !== lobby.passwordHash) return send(res, 403, 'application/json', '{"error":"Wrong password"}');
      lobby.players = [...(lobby.players || []), { uid: identity.uid, name: identity.name || '', score: 0, answers: {} }];
      writeKey(key, lobby);
    }
    return send(res, 200, 'application/json', '{"ok":true}');
  }
  if (pathname === '/api/mediaTicket' && req.method === 'GET') {
    const identity = await standaloneApi.requireStoreUser(req, DATA_DIR);
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify(mediaTickets.issue(identity)));
  }
  const storeRoute = isSyncPath(pathname) || (pathname === '/' && (req.method === 'POST' || url.searchParams.has('key')));
  const mediaRoute = pathname.startsWith('/files/') || /^\/users\/[^/]+\/photo\/?$/.test(pathname);
  const ticketAllowed = mediaRoute && req.method === 'GET' && mediaTickets.verify(url.searchParams.get('media_ticket'));
  const user = storeRoute || (mediaRoute && !ticketAllowed) ? await standaloneApi.requireStoreUser(req, DATA_DIR) : null;
  if (mediaRoute) res.setHeader('Referrer-Policy', 'no-referrer');
  if (mediaRoute) res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'GET' && pathname.startsWith('/files/')) {
    return handleFile(pathname.slice('/files/'.length), res);
  }

  const userPhoto = pathname.match(/^\/users\/([^/]+)\/photo\/?$/);
  if (req.method === 'GET' && userPhoto) {
    return handleUserPhoto(userPhoto[1], res);
  }

  if (pathname.startsWith('/api')) {
    return await handleStandaloneApi(req, res, url, { dataDir: DATA_DIR, readBody });
  }

  if (req.method === 'GET' && pathname === '/' && url.searchParams.has('key')) {
    return handleGetSync(url, res, user);
  }

  if (req.method === 'GET' && isSyncPath(pathname)) {
    return handleGetSync(url, res, user);
  }

  if (req.method === 'POST' && (isSyncPath(pathname) || pathname === '/')) {
    let raw;
    try { raw = await readBody(req); } catch (e) {
      return send(res, 413, 'text/plain', 'too large');
    }
    const fields = querystring.parse(raw);
    const key = String(fields.key || '');
    const data = typeof fields.data === 'string' ? fields.data : '';
    return handlePostSync(key, data, req, res, user);
  }

  if (req.method === 'GET') {
    if (websiteReady()) {
      const filePath = resolveWebsiteFile(url.pathname || '/');
      if (filePath) return handleWebsiteFile(filePath, res);
      return send(res, 404, 'text/plain', 'not found');
    }
  }

  send(res, 404, 'text/plain', 'not found');
  } catch (err) {
    const status = (err && err.statusCode) || 500;
    const message = (err && err.message) || 'Unexpected server error';
    console.error('Request failed:', message);
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: message }));
    }
  }
});

process.on('unhandledRejection', (reason) => {
  const message = reason && reason.message ? reason.message : String(reason);
  console.error('Unhandled promise rejection:', message);
});

let shuttingDown = false;
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('StudyBaseProgram shutting down: ' + reason);
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(0);
  }, 10000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); process.exit(0); });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
if (standaloneApi && typeof standaloneApi.setProgramActionHandler === 'function') {
  standaloneApi.setProgramActionHandler(result => {
    if (result && (result.action === 'stop' || result.action === 'restart')) {
      // Preserve the API response, then let Coolify manage the container lifecycle.
      setTimeout(() => shutdown(result.action), 200);
    }
  });
}
server.listen(PORT, '0.0.0.0', () => {
  console.log('StudyBaseProgram listening on 0.0.0.0:' + server.address().port);
  console.log('  public URL: ' + publicOrigin());
  console.log('  data directory: ' + DATA_DIR);
  console.log('  static website: ' + (websiteDir ? 'enabled via STUDYBASE_WEBSITE_DIR' : 'disabled (API/sync only)'));
  console.log('  health check: /health');
});

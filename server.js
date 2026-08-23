// StudyBase local sync — Apps Script replacement that stores data on this machine.
//
// Talks the same protocol the site already uses:
//   GET  /sync?key=NAME[&callback=cb]  →  cb({ data: ... })  or  { data: ... }
//   POST /sync   key=NAME&data=<json>  →  writes json/NAME.json
//   POST key=_up_<id>  data={ image: dataUrl, filename }  →  files/... + _ur_<id>
//   POST key=_up_avatar_<uid>  →  users/<uid>/photo.jpg + _ur_avatar_<uid>
//   GET  /files/<name>  →  uploaded image or PDF
//   GET  /users/<uid>/photo  →  that user's profile picture
//   GET/POST _profile_<uid>  →  users/<uid>/profile.json
//
// Lives in this folder with the data it manages.
// Override with env: STUDYBASE_DATA_DIR, PORT, STUDYBASE_PUBLIC_URL

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const querystring = require('querystring');

const PORT = parseInt(process.env.PORT || '8787', 10);
const DATA_DIR = process.env.STUDYBASE_DATA_DIR || __dirname;
const JSON_DIR = path.join(DATA_DIR, 'json');
const FILES_DIR = path.join(DATA_DIR, 'files');
const USERS_DIR = path.join(DATA_DIR, 'users');
const PHOTO_NAMES = ['photo.jpg', 'photo.jpeg', 'photo.png', 'photo.webp', 'photo.gif', 'photo.bmp'];
const MAX_BODY = 12 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const KEY_RE = /^[A-Za-z0-9._-]{1,120}$/;
const CB_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
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

function ensureDirs() {
  fs.mkdirSync(JSON_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function send(res, status, type, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function publicOrigin(req) {
  if (process.env.STUDYBASE_PUBLIC_URL) {
    return process.env.STUDYBASE_PUBLIC_URL.replace(/\/$/, '');
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || ('127.0.0.1:' + PORT)).split(',')[0].trim();
  return proto + '://' + host;
}

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

function profileUidFromKey(key) {
  return key.slice('_profile_'.length);
}

function safeUid(uid) {
  const s = String(uid || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return KEY_RE.test(s) ? s : null;
}

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

function countJsonRecords() {
  let n = 0;
  function walk(d) {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    ents.forEach(ent => {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.json')) n++;
    });
  }
  walk(JSON_DIR);
  return n;
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

function handleGetSync(url, res) {
  const key = url.searchParams.get('key') || '';
  const cb = url.searchParams.get('callback') || '';
  if (!KEY_RE.test(key)) {
    return send(res, 400, 'text/plain', 'bad key');
  }
  const payload = JSON.stringify({ data: readKey(key) });
  if (cb) {
    if (!CB_RE.test(cb)) return send(res, 400, 'text/plain', 'bad callback');
    return send(res, 200, 'text/javascript; charset=utf-8', '/**/ ' + cb + '(' + payload + ');');
  }
  send(res, 200, 'application/json; charset=utf-8', payload);
}

function handlePostSync(key, dataStr, req, res) {
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
    writeKey('_ur_' + uid, saveUpload(payload, req));
    return send(res, 200, 'text/plain; charset=utf-8', 'ok');
  }
  let value;
  try { value = JSON.parse(dataStr); } catch (e) {
    return send(res, 400, 'text/plain', 'bad json');
  }
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
  cors(res);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Disposition': 'inline; filename="' + path.basename(p) + '"',
    'Cache-Control': 'public, max-age=3600',
  });
  fs.createReadStream(p).pipe(res);
}

function handleFile(name, res) {
  if (!FILE_RE.test(name)) return send(res, 400, 'text/plain', 'bad file');
  const p = path.join(FILES_DIR, name);
  if (path.dirname(p) !== FILES_DIR || !fs.existsSync(p)) {
    return send(res, 404, 'text/plain', 'not found');
  }
  const ext = path.extname(name).toLowerCase();
  const type = EXT_MIME[ext] || 'application/octet-stream';
  cors(res);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Disposition': 'inline; filename="' + name + '"',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(p).pipe(res);
}

function statusHtml() {
  let jsonCount = 0;
  let fileCount = 0;
  jsonCount = countJsonRecords();
  try { fileCount = fs.readdirSync(FILES_DIR).length; } catch (e) {}
  let userCount = 0;
  try { userCount = fs.readdirSync(USERS_DIR).filter(n => fs.statSync(path.join(USERS_DIR, n)).isDirectory()).length; } catch (e) {}
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>StudyBase local sync</title>
<style>
  body{font:15px/1.45 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1.2rem;color:#1f2937}
  code{background:#f3f4f6;padding:.1em .35em;border-radius:4px}
  .ok{color:#15803d;font-weight:600}
</style></head><body>
<h1>StudyBase local sync</h1>
<p class="ok">Running on this computer.</p>
<p>Data folder: <code>${DATA_DIR}</code></p>
<p>JSON records: <strong>${jsonCount}</strong> &nbsp; Files: <strong>${fileCount}</strong> &nbsp; Users: <strong>${userCount}</strong></p>
<p>This program should stay running while the site is using the store.</p>
</body></html>`;
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
  return pathname === '/' || pathname === '/sync';
}

let handleStandaloneApi = null;
try {
  handleStandaloneApi = require('./api').handleApi;
} catch (e) {
  handleStandaloneApi = null;
}

ensureDirs();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || '127.0.0.1'));
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, dataDir: DATA_DIR, api: !!handleStandaloneApi }));
  }

  if (req.method === 'GET' && pathname.startsWith('/files/')) {
    return handleFile(pathname.slice('/files/'.length), res);
  }

  const userPhoto = pathname.match(/^\/users\/([^/]+)\/photo\/?$/);
  if (req.method === 'GET' && userPhoto) {
    return handleUserPhoto(userPhoto[1], res);
  }

  if (pathname.startsWith('/api')) {
    if (!handleStandaloneApi) {
      cors(res);
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Standalone API module is missing (api.js)' }));
    }
    return handleStandaloneApi(req, res, url, { dataDir: DATA_DIR, readBody });
  }

  if (req.method === 'GET' && isSyncPath(pathname)) {
    if (url.searchParams.has('key')) return handleGetSync(url, res);
    return send(res, 200, 'text/html; charset=utf-8', statusHtml());
  }

  if (req.method === 'POST' && isSyncPath(pathname)) {
    let raw;
    try { raw = await readBody(req); } catch (e) {
      return send(res, 413, 'text/plain', 'too large');
    }
    const fields = querystring.parse(raw);
    const key = String(fields.key || '');
    const data = typeof fields.data === 'string' ? fields.data : '';
    return handlePostSync(key, data, req, res);
  }

  send(res, 404, 'text/plain', 'not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('StudyBase local sync');
  console.log('  http://127.0.0.1:' + PORT);
  console.log('  data: ' + DATA_DIR);
});

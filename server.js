// StudyBase local sync — Apps Script replacement that stores data on this machine.
//
// Talks the same protocol the site already uses:
//   GET  /sync?key=NAME  →  { data: ... }  (requires STORE_PASSWORD)
//   JSONP callbacks are disabled so the store password cannot leak in a script URL.
//   POST /sync   key=NAME&data=<json>  →  writes json/NAME.json
//   POST key=_up_<id>  data={ image: dataUrl, filename }  →  files/... + _ur_<id>
//   POST key=_up_avatar_<uid>  →  users/<uid>/photo.jpg + _ur_avatar_<uid>
//   GET  /files/<name>  →  uploaded image or PDF
//   GET  /users/<uid>/photo  →  that user's profile picture
//   GET/POST _profile_<uid>  →  users/<uid>/profile.json
//
// Lives in this folder with the data it manages.
// Override with env: STUDYBASE_DATA_DIR, PORT, STUDYBASE_PUBLIC_URL,
//   STUDYBASE_WEBSITE_DIR, STUDYBASE_PICK_WEBSITE, STUDYBASE_OPEN_BROWSER
// Website folder is stored in website.json and served at http://127.0.0.1:PORT/

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');
const querystring = require('querystring');

const PORT = parseInt(process.env.PORT || '8787', 10);
const DATA_DIR = process.env.STUDYBASE_DATA_DIR || __dirname;
const JSON_DIR = path.join(DATA_DIR, 'json');
const FILES_DIR = path.join(DATA_DIR, 'files');
const USERS_DIR = path.join(DATA_DIR, 'users');
const WEBSITE_CONFIG = path.join(DATA_DIR, 'website.json');
const WEB_BLOCK_DIRS = new Set(['.git', 'node_modules']);
const WEB_BLOCK_FILES = new Set(['secrets.json', '.env', 'website.json']);
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
  fs.mkdirSync(JSON_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-StudyBase-Store');
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
  if (!KEY_RE.test(key)) {
    return send(res, 400, 'text/plain', 'bad key');
  }
  send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ data: readKey(key) }));
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

let websiteDir = '';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function validateWebsiteDir(dir) {
  if (!dir || !String(dir).trim()) return 'Choose a folder that contains the StudyBase website.';
  const d = path.resolve(String(dir).trim());
  try {
    if (!fs.existsSync(d)) return 'That folder does not exist on this computer.';
    if (!fs.statSync(d).isDirectory()) return 'That path is not a folder.';
  } catch (e) {
    return 'That folder cannot be read.';
  }
  return '';
}

function loadWebsiteDir() {
  const fromEnv = String(process.env.STUDYBASE_WEBSITE_DIR || '').trim();
  if (fromEnv && !validateWebsiteDir(fromEnv)) return path.resolve(fromEnv);
  try {
    const raw = JSON.parse(fs.readFileSync(WEBSITE_CONFIG, 'utf8'));
    const d = String(raw.websiteDir || '').trim();
    return d ? path.resolve(d) : '';
  } catch (e) {
    return '';
  }
}

function saveWebsiteDir(dir) {
  const resolved = path.resolve(String(dir).trim());
  const err = validateWebsiteDir(resolved);
  if (err) return err;
  writeJsonFile(WEBSITE_CONFIG, { websiteDir: resolved });
  websiteDir = resolved;
  return '';
}

function websiteReady() {
  return !validateWebsiteDir(websiteDir);
}

function pickWebsiteDirNative() {
  if (process.platform === 'win32') {
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$d.Description = 'Select the folder that contains the StudyBase website'",
      '$d.ShowNewFolderButton = $false',
      'try { $d.RootFolder = [Environment+SpecialFolder]::MyComputer } catch {}',
      'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }',
    ].join('; ');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], {
      encoding: 'utf8',
      windowsHide: false,
      timeout: 300000,
    });
    return String(r.stdout || '').trim();
  }
  const linux = [
    ['zenity', ['--file-selection', '--directory', '--title=Select the StudyBase website folder']],
    ['yad', ['--file-selection', '--directory', '--title=Select the StudyBase website folder']],
    ['kdialog', ['--getexistingdirectory', process.env.HOME || '.', 'Select the StudyBase website folder']],
  ];
  for (let i = 0; i < linux.length; i++) {
    const r = spawnSync(linux[i][0], linux[i][1], { encoding: 'utf8', timeout: 300000 });
    const out = String(r.stdout || '').trim();
    if (r.status === 0 && out) return out;
  }
  const py = [
    'import sys',
    'try:',
    '    import tkinter as tk',
    '    from tkinter import filedialog',
    '    root = tk.Tk()',
    '    root.withdraw()',
    '    root.attributes("-topmost", True)',
    '    p = filedialog.askdirectory(title="Select the StudyBase website folder")',
    '    sys.stdout.write(p or "")',
    'except Exception:',
    '    sys.exit(1)',
  ].join('\n');
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8', timeout: 300000, env: process.env });
  return String(r.stdout || '').trim();
}

function openBrowser(target) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {}
}

function resolveWebsiteFile(pathname) {
  if (!websiteReady()) return null;
  const root = path.resolve(websiteDir);
  let rel = '/';
  try { rel = decodeURIComponent(pathname || '/'); } catch (e) { return null; }
  if (rel === '/') rel = 'index.html';
  else rel = rel.replace(/^\/+/, '');
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some(p => p === '.' || p === '..' || WEB_BLOCK_DIRS.has(p.toLowerCase()))) return null;
  if (WEB_BLOCK_FILES.has(parts[parts.length - 1].toLowerCase())) return null;
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      const idx = path.join(target, 'index.html');
      if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return idx;
      return null;
    }
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  } catch (e) {
    return null;
  }
  return null;
}

function handleWebsiteFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = WEB_MIME[ext] || 'application/octet-stream';
  cors(res);
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

function websiteConfigPayload() {
  const err = websiteDir ? validateWebsiteDir(websiteDir) : '';
  return {
    websiteDir: websiteDir || '',
    ready: !err && !!websiteDir,
    error: err || '',
    hasIndex: !err && !!websiteDir && fs.existsSync(path.join(websiteDir, 'index.html')),
  };
}

function statusHtml() {
  let jsonCount = 0;
  let fileCount = 0;
  jsonCount = countJsonRecords();
  try { fileCount = fs.readdirSync(FILES_DIR).length; } catch (e) {}
  let userCount = 0;
  try { userCount = fs.readdirSync(USERS_DIR).filter(n => fs.statSync(path.join(USERS_DIR, n)).isDirectory()).length; } catch (e) {}
  const web = websiteConfigPayload();
  const webNote = web.ready
    ? (web.hasIndex
      ? 'This folder is served at the same address as the sync program.'
      : 'Folder saved. There is no index.html in it yet — open a page path such as /subject/subject.html.')
    : 'Choose the folder that has the StudyBase website (the one with index.html). The next time this program starts, it will serve that site.';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>StudyBase local sync</title>
<style>
  body{font:15px/1.45 system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1.2rem;color:#1f2937}
  code{background:#f3f4f6;padding:.1em .35em;border-radius:4px}
  .ok{color:#15803d;font-weight:600}
  .warn{color:#b45309}
  label{display:block;font-weight:600;margin:1.2rem 0 .4rem}
  .row{display:flex;gap:.5rem;flex-wrap:wrap}
  input[type=text]{flex:1;min-width:16rem;padding:.45rem .55rem;border:1px solid #d1d5db;border-radius:6px;font:inherit}
  button{padding:.45rem .75rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;font:inherit;cursor:pointer}
  button.primary{background:#1f2937;color:#fff;border-color:#1f2937}
  #msg{margin-top:.7rem;min-height:1.3em}
</style></head><body>
<h1>StudyBase local sync</h1>
<p class="ok">Running on this computer.</p>
<p>Data folder: <code>${esc(DATA_DIR)}</code></p>
<p>JSON records: <strong>${jsonCount}</strong> &nbsp; Files: <strong>${fileCount}</strong> &nbsp; Users: <strong>${userCount}</strong></p>
<label for="websiteDir">Website folder</label>
<form id="webform">
  <div class="row">
    <input id="websiteDir" name="websiteDir" type="text" value="${esc(web.websiteDir)}" placeholder="Folder that contains index.html" spellcheck="false">
    <button type="button" id="browse">Browse…</button>
    <button type="submit" class="primary">Save</button>
  </div>
</form>
<p class="${web.ready ? 'ok' : 'warn'}">${esc(webNote)}</p>
<p id="msg">${web.error ? esc(web.error) : ''}</p>
<p>${web.ready ? '<a href="/">Open the website</a> · ' : ''}This program should stay running while the site is using the store.</p>
<p>Browse opens a folder window on <em>this</em> computer. From another machine, type the path instead.</p>
<script>
const form = document.getElementById('webform');
const input = document.getElementById('websiteDir');
const msg = document.getElementById('msg');
document.getElementById('browse').onclick = async function () {
  msg.textContent = 'Open the folder window on this computer…';
  try {
    const r = await fetch('/_website-pick', { method: 'POST' });
    const j = await r.json();
    if (j.websiteDir) { location.reload(); return; }
    msg.textContent = j.error || 'Cancelled. You can type the path instead.';
  } catch (e) {
    msg.textContent = 'Could not open a folder window. Type the path instead.';
  }
};
form.onsubmit = async function (e) {
  e.preventDefault();
  msg.textContent = 'Saving…';
  try {
    const r = await fetch('/_website-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteDir: input.value })
    });
    const j = await r.json();
    if (j.ok) { location.href = j.hasIndex ? '/' : '/_status'; return; }
    msg.textContent = j.error || 'Could not save that folder.';
  } catch (err) {
    msg.textContent = 'Could not save that folder.';
  }
};
</script>
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
  return pathname === '/sync';
}

let standaloneApi = null;
let handleStandaloneApi = null;
try {
  standaloneApi = require('./api');
  handleStandaloneApi = standaloneApi.handleApi;
} catch (e) {
  standaloneApi = null;
  handleStandaloneApi = null;
}

function requireStore(req, url, res) {
  if (!standaloneApi || typeof standaloneApi.requireStorePassword !== 'function') {
    send(res, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'Store login is not available (api.js)' }));
    return false;
  }
  return standaloneApi.requireStorePassword(req, res, url, standaloneApi.loadSecrets(DATA_DIR));
}

ensureDirs();
websiteDir = loadWebsiteDir();
if (!websiteReady() && process.env.STUDYBASE_PICK_WEBSITE === '1') {
  console.log('Select the folder that contains the StudyBase website…');
  const picked = pickWebsiteDirNative();
  if (picked) {
    const err = saveWebsiteDir(picked);
    if (err) console.log('Folder not used: ' + err);
  } else {
    console.log('No website folder selected. Open /_status to choose one.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || '127.0.0.1'));
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, api: !!handleStandaloneApi }));
  }

  if (req.method === 'GET' && pathname === '/_status') {
    return send(res, 200, 'text/html; charset=utf-8', statusHtml());
  }

  if (req.method === 'GET' && pathname === '/_website-config') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(websiteConfigPayload()));
  }

  if (req.method === 'POST' && pathname === '/_website-config') {
    let raw;
    try { raw = await readBody(req); } catch (e) {
      return send(res, 413, 'text/plain', 'too large');
    }
    let dir = '';
    try {
      const parsed = JSON.parse(raw);
      dir = parsed && parsed.websiteDir != null ? String(parsed.websiteDir) : '';
    } catch (e) {
      dir = String(querystring.parse(raw).websiteDir || '');
    }
    const err = saveWebsiteDir(dir);
    if (err) return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: err }));
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(Object.assign({ ok: true }, websiteConfigPayload())));
  }

  if (req.method === 'POST' && pathname === '/_website-pick') {
    const picked = pickWebsiteDirNative();
    if (!picked) {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ cancelled: true }));
    }
    const err = saveWebsiteDir(picked);
    if (err) return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: err }));
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(Object.assign({ ok: true }, websiteConfigPayload())));
  }

  if (req.method === 'GET' && pathname.startsWith('/files/')) {
    if (!requireStore(req, url, res)) return;
    return handleFile(pathname.slice('/files/'.length), res);
  }

  const userPhoto = pathname.match(/^\/users\/([^/]+)\/photo\/?$/);
  if (req.method === 'GET' && userPhoto) {
    if (!requireStore(req, url, res)) return;
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

  if (req.method === 'GET' && pathname === '/' && url.searchParams.has('key')) {
    if (!requireStore(req, url, res)) return;
    return handleGetSync(url, res);
  }

  if (req.method === 'GET' && isSyncPath(pathname)) {
    if (url.searchParams.has('key')) {
      if (!requireStore(req, url, res)) return;
      return handleGetSync(url, res);
    }
    return send(res, 200, 'text/html; charset=utf-8', statusHtml());
  }

  if (req.method === 'POST' && (isSyncPath(pathname) || pathname === '/')) {
    if (!requireStore(req, url, res)) return;
    let raw;
    try { raw = await readBody(req); } catch (e) {
      return send(res, 413, 'text/plain', 'too large');
    }
    const fields = querystring.parse(raw);
    const key = String(fields.key || '');
    const data = typeof fields.data === 'string' ? fields.data : '';
    return handlePostSync(key, data, req, res);
  }

  if (req.method === 'GET') {
    if (websiteReady()) {
      const filePath = resolveWebsiteFile(url.pathname || '/');
      if (filePath) return handleWebsiteFile(filePath, res);
      if (pathname === '/') return send(res, 200, 'text/html; charset=utf-8', statusHtml());
      return send(res, 404, 'text/plain', 'not found');
    }
    if (pathname === '/') return send(res, 200, 'text/html; charset=utf-8', statusHtml());
  }

  send(res, 404, 'text/plain', 'not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const origin = 'http://127.0.0.1:' + PORT;
  console.log('StudyBase local sync');
  console.log('  ' + origin);
  console.log('  data: ' + DATA_DIR);
  if (websiteReady()) {
    console.log('  website: ' + websiteDir);
    console.log('  status: ' + origin + '/_status');
  } else {
    console.log('  website: (none — open ' + origin + '/_status to choose a folder)');
  }
  if (process.env.STUDYBASE_OPEN_BROWSER === '1') {
    openBrowser(origin + (websiteReady() ? '/' : '/_status'));
  }
});

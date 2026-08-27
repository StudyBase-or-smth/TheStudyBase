// /api/* for the StudyBaseData server.
// Loaded by StudyBaseData/server.js. Secrets come from secrets.json
// in the data folder, or from environment variables of the same names.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { runProgramCommand } = require('../program-commands');

const ALLOWED_ROLES_SIGNUP = ['student', 'teacher'];
const ALLOWED_ROLES_ASSIGN = ['student', 'teacher', 'dev'];
const AVATAR_HOST = /^(lh\d\.googleusercontent\.com|drive\.google\.com)$/i;
const AVATAR_MAX = 500 * 1024;
const GRADE_MAX_PROMPT = 8000;
const GRADE_MAX_DOCS = 2;
const GRADE_MAX_DOC_BYTES = 8 * 1024 * 1024;
const GRADE_WINDOW_MS = 10 * 60 * 1000;
const GRADE_MAX_PER_WINDOW = 20;
const gradeHits = new Map();
const RESOLVE_WINDOW_MS = 10 * 60 * 1000;
const RESOLVE_MAX_PER_WINDOW = 30;
const resolveHits = new Map();
const SIGNIN_USER_CACHE_MS = 30 * 1000;
let signInUserCache = { at: 0, users: [] };

let adminMod = null;
let adminInitError = null;
let secretsCache = null;
let secretsPath = null;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-StudyBase-Store');
}

function sendJson(res, status, obj) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function loadSecrets(dataDir) {
  if (secretsCache && secretsPath === dataDir) return secretsCache;
  const out = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
    FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    DESMOS_API_KEY: process.env.DESMOS_API_KEY || '',
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    STORE_PASSWORD: process.env.STORE_PASSWORD || '',
  };
  const file = path.join(dataDir, 'secrets.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.keys(out).forEach(k => {
      if (raw[k] != null && String(raw[k]).trim()) {
        out[k] = k === 'FIREBASE_PRIVATE_KEY' ? String(raw[k]).replace(/\\n/g, '\n') : String(raw[k]);
      }
    });
  } catch (e) { /* optional file */ }
  secretsCache = out;
  secretsPath = dataDir;
  return out;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readStoreToken(req, url) {
  const headerStore = req && (req.headers['x-studybase-store'] || req.headers['X-StudyBase-Store']);
  if (headerStore) return String(headerStore).trim();
  const token = bearer(req);
  if (token && /^store:/i.test(token)) return token.replace(/^store:/i, '').trim();
  if (url && url.searchParams) {
    const q = url.searchParams.get('store');
    if (q) return String(q).trim();
  }
  return '';
}

function firebaseTokenFromRequest(req, url) {
  const token = bearer(req);
  if (token && !/^store:/i.test(token)) return token;
  if (url && url.searchParams) {
    const q = url.searchParams.get('token');
    if (q) return String(q).trim();
  }
  return '';
}

async function requireStoreAccess(req, res, url, secrets) {
  const expected = (secrets && secrets.STORE_PASSWORD) || process.env.STORE_PASSWORD || '';
  const storeTok = readStoreToken(req, url);
  if (expected && expected.length >= 16 && storeTok && safeEqual(storeTok, expected)) {
    return true;
  }

  const token = firebaseTokenFromRequest(req, url);
  if (!token) {
    sendJson(res, 401, { error: 'Sign in to use the study store' });
    return false;
  }
  try {
    const decoded = await getAdmin(secrets).auth().verifyIdToken(token, true);
    if (!decoded || !decoded.uid) {
      sendJson(res, 401, { error: 'Sign in to use the study store' });
      return false;
    }
    if (decoded.status !== 'active') {
      sendJson(res, 403, { error: 'Account must be approved before using the study store' });
      return false;
    }
    return true;
  } catch (err) {
    sendJson(res, err.statusCode || 401, { error: err.message || 'Sign in to use the study store' });
    return false;
  }
}

function requireStorePassword(req, res, url, secrets) {
  return requireStoreAccess(req, res, url, secrets);
}

function gradeAllowed(uid) {
  const now = Date.now();
  const id = String(uid || 'anon');
  const hits = (gradeHits.get(id) || []).filter(t => now - t < GRADE_WINDOW_MS);
  if (hits.length >= GRADE_MAX_PER_WINDOW) {
    gradeHits.set(id, hits);
    return false;
  }
  hits.push(now);
  gradeHits.set(id, hits);
  return true;
}

function clientIp(req) {
  return (req && req.socket && req.socket.remoteAddress) || 'anon';
}

function resolveAllowed(ip) {
  const now = Date.now();
  const id = String(ip || 'anon');
  const hits = (resolveHits.get(id) || []).filter(t => now - t < RESOLVE_WINDOW_MS);
  if (hits.length >= RESOLVE_MAX_PER_WINDOW) {
    resolveHits.set(id, hits);
    return false;
  }
  hits.push(now);
  resolveHits.set(id, hits);
  return true;
}

function normSignInName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findSignInEmail(users, rawName) {
  const needle = normSignInName(rawName);
  if (!needle) return { status: 400, error: 'Enter your name or email.' };
  if (needle.length > 100) return { status: 400, error: 'That name is too long.' };
  const named = (users || []).filter(u => u.email && u.displayName);
  const exact = named.filter(u => normSignInName(u.displayName) === needle);
  if (exact.length === 1) return { email: exact[0].email };
  if (exact.length > 1) return { status: 409, error: 'Several people have that name — sign in with email.' };
  if (needle.length < 3) return { status: 404, error: 'No account found with that name. Try your email.' };
  const loose = named.filter(u => {
    const n = normSignInName(u.displayName);
    return n.startsWith(needle) || n.split(' ')[0] === needle;
  });
  if (loose.length === 1) return { email: loose[0].email };
  if (loose.length > 1) return { status: 409, error: 'Several people have that name — sign in with email.' };
  return { status: 404, error: 'No account found with that name. Try your email.' };
}

function getAdmin(secrets) {
  if (adminInitError) throw adminInitError;
  if (!adminMod) {
    try {
      adminMod = require('firebase-admin');
    } catch (e) {
      adminInitError = { statusCode: 503, message: 'firebase-admin is not installed. Run npm install in the StudyBaseData folder.' };
      throw adminInitError;
    }
  }
  if (!adminMod.apps.length) {
    const projectId = secrets.FIREBASE_PROJECT_ID;
    const clientEmail = secrets.FIREBASE_CLIENT_EMAIL;
    const privateKey = secrets.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      throw { statusCode: 503, message: 'Firebase Admin secrets are missing. Copy secrets.example.json to secrets.json and fill it in.' };
    }
    adminMod.initializeApp({
      credential: adminMod.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return adminMod;
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  return String(h).replace(/^Bearer\s+/i, '').trim();
}

async function requireCaller(req, secrets) {
  const token = bearer(req);
  if (!token) throw { statusCode: 401, message: 'Missing Authorization header' };
  const admin = getAdmin(secrets);
  return admin.auth().verifyIdToken(token, true);
}

async function requireDev(req, secrets) {
  const decoded = await requireCaller(req, secrets);
  if (decoded.role !== 'dev' || decoded.status !== 'active') {
    throw { statusCode: 403, message: 'Dev access required' };
  }
  return decoded;
}

async function parseJsonBody(req, readBody) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw { statusCode: 400, message: 'Invalid JSON body' };
  }
}

function routeName(pathname) {
  return pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
}

const PROGRAM_LOG_MAX = 500;
const programLogs = [];
let programLogSeq = 0;
let programConsoleHooked = false;

function formatProgramLogArgs(args) {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }).join(' ');
}

function pushProgramLog(level, text) {
  programLogSeq += 1;
  programLogs.push({
    id: programLogSeq,
    ts: Date.now(),
    level: String(level || 'log'),
    text: String(text == null ? '' : text).slice(0, 4000),
  });
  if (programLogs.length > PROGRAM_LOG_MAX) {
    programLogs.splice(0, programLogs.length - PROGRAM_LOG_MAX);
  }
}

function hookProgramConsole() {
  if (programConsoleHooked) return;
  programConsoleHooked = true;
  ['log', 'info', 'warn', 'error'].forEach(level => {
    const orig = console[level].bind(console);
    console[level] = function () {
      orig.apply(console, arguments);
      pushProgramLog(level, formatProgramLogArgs(Array.prototype.slice.call(arguments)));
    };
  });
}

async function handleProgramLogsGet(req, res, secrets, url) {
  await requireDev(req, secrets);
  const after = parseInt(url.searchParams.get('after') || '0', 10) || 0;
  const logs = programLogs.filter(e => e.id > after);
  return sendJson(res, 200, { logs, lastId: programLogSeq });
}

async function handleProgramLogPost(req, res, secrets, readBody) {
  await requireDev(req, secrets);
  const body = await parseJsonBody(req, readBody);
  const text = String(body.text == null ? '' : body.text).trim().slice(0, 2000);
  if (!text) return sendJson(res, 400, { error: 'Missing text' });
  const level = body.level === 'error' || body.level === 'warn' ? body.level : 'log';
  console[level]('[devpanel] ' + text);
  return sendJson(res, 200, { ok: true, id: programLogSeq });
}

let programActionHandler = null;
function setProgramActionHandler(fn) {
  programActionHandler = typeof fn === 'function' ? fn : null;
}

async function handleProgramCommand(req, res, secrets, readBody) {
  await requireDev(req, secrets);
  const body = await parseJsonBody(req, readBody);
  const line = String(body.command || body.line || body.text || '').trim();
  if (!line) return sendJson(res, 400, { error: 'Missing command' });
  const result = runProgramCommand(line);
  console.log('[devpanel] > ' + line);
  console.log('[devpanel] ' + result.message);
  if (programActionHandler) programActionHandler(result);
  return sendJson(res, 200, result);
}

async function handleDesmosKey(res, secrets) {
  sendJson(res, 200, { apiKey: secrets.DESMOS_API_KEY || '' });
}

function allowedAvatarUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  if (!AVATAR_HOST.test(u.hostname)) return null;
  return u.href;
}

async function handleAvatar(url, res) {
  const target = allowedAvatarUrl(url.searchParams.get('u') || '');
  if (!target) return sendJson(res, 400, { error: 'Bad avatar url' });
  let upstream;
  try {
    upstream = await fetch(target, {
      redirect: 'follow',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return sendJson(res, 502, { error: 'Avatar fetch failed' });
  }
  if (!upstream.ok) return sendJson(res, upstream.status, { error: 'Upstream ' + upstream.status });
  let finalHost = '';
  try { finalHost = new URL(upstream.url).hostname; } catch (e) { finalHost = ''; }
  if (!AVATAR_HOST.test(finalHost)) return sendJson(res, 400, { error: 'Bad redirect' });
  const ct = (upstream.headers.get('content-type') || '').split(';')[0].trim();
  if (!ct.startsWith('image/')) return sendJson(res, 415, { error: 'Not an image' });
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length > AVATAR_MAX) return sendJson(res, 413, { error: 'Too large' });
  cors(res);
  res.writeHead(200, {
    'Content-Type': ct,
    'Cache-Control': 'public, max-age=604800',
  });
  res.end(buf);
}

function parseGradeDocuments(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw { statusCode: 400, message: 'documents must be an array' };
  }
  if (raw.length > GRADE_MAX_DOCS) {
    throw { statusCode: 400, message: 'Too many documents (max ' + GRADE_MAX_DOCS + ')' };
  }
  const out = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object') {
      throw { statusCode: 400, message: 'Invalid document' };
    }
    const mime = String(d.mime || d.media_type || 'application/pdf').toLowerCase();
    if (mime !== 'application/pdf') {
      throw { statusCode: 400, message: 'Only PDF documents are accepted' };
    }
    if (typeof d.data !== 'string' || !d.data.length) {
      throw { statusCode: 400, message: 'Document data missing' };
    }
    const compact = d.data.replace(/\s/g, '');
    if (compact.length > Math.ceil(GRADE_MAX_DOC_BYTES * 4 / 3) + 64) {
      throw { statusCode: 400, message: 'Document is too large' };
    }
    let buf;
    try {
      buf = Buffer.from(compact, 'base64');
    } catch (e) {
      throw { statusCode: 400, message: 'Document is not valid base64' };
    }
    if (buf.length < 5 || buf.length > GRADE_MAX_DOC_BYTES) {
      throw { statusCode: 400, message: 'Document is too large' };
    }
    if (buf.slice(0, 4).toString('latin1') !== '%PDF') {
      throw { statusCode: 400, message: 'Document is not a PDF' };
    }
    out.push({
      name: String(d.name || 'document.pdf').slice(0, 80),
      mime: 'application/pdf',
      data: compact,
    });
  }
  return out;
}

function geminiGradeParts(prompt, documents) {
  const parts = documents.map(d => ({
    inline_data: { mime_type: 'application/pdf', data: d.data },
  }));
  parts.push({ text: prompt });
  return parts;
}

function claudeGradeContent(prompt, documents) {
  if (!documents.length) return prompt;
  const content = documents.map(d => ({
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: d.data },
  }));
  content.push({ type: 'text', text: prompt });
  return content;
}

async function handleGrade(req, res, secrets, readBody) {
  const body = await parseJsonBody(req, readBody);
  const { provider, prompt, userKey } = body;
  if (!prompt || typeof prompt !== 'string') {
    return sendJson(res, 400, { error: 'Missing prompt' });
  }
  const decoded = await requireCaller(req, secrets);
  if (decoded.status !== 'active') {
    return sendJson(res, 403, { error: 'Account must be approved before using AI marking.' });
  }
  if (prompt.length > GRADE_MAX_PROMPT) {
    return sendJson(res, 400, { error: 'Prompt is too long' });
  }
  if (userKey && String(userKey).length > 200) {
    return sendJson(res, 400, { error: 'Invalid user key' });
  }
  if (!gradeAllowed(decoded.uid)) {
    return sendJson(res, 429, { error: 'Too many AI requests — wait a few minutes.' });
  }
  let documents;
  try {
    documents = parseGradeDocuments(body.documents);
  } catch (e) {
    return sendJson(res, e.statusCode || 400, { error: e.message || 'Invalid documents' });
  }

  if (provider === 'claude') {
    const apiKey = (userKey && String(userKey).trim()) || secrets.CLAUDE_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: 'No Claude API key configured on server and none provided by user.' });
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (documents.length) headers['anthropic-beta'] = 'pdfs-2024-09-25';
    const up = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: claudeGradeContent(prompt, documents) }],
      }),
    });
    const data = await up.json();
    if (!up.ok) {
      const msg = (data && data.error && data.error.message) || 'Claude API request failed';
      return sendJson(res, up.status, { error: msg });
    }
    const text = (data.content || [])
      .map(block => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n');
    return sendJson(res, 200, { text });
  }

  if (provider === 'gemini') {
    const apiKey = (userKey && String(userKey).trim()) || secrets.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: 'No Gemini API key configured on server and none provided by user.' });
    const up = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: geminiGradeParts(prompt, documents) }] }),
      }
    );
    const data = await up.json();
    if (!up.ok) {
      const msg = (data && data.error && data.error.message) || 'Gemini API request failed';
      return sendJson(res, up.status, { error: msg });
    }
    const text = (((data.candidates || [])[0] || {}).content || {}).parts
      ? data.candidates[0].content.parts[0].text || ''
      : '';
    return sendJson(res, 200, { text });
  }

  return sendJson(res, 400, { error: 'Unknown provider: ' + provider });
}

async function handleRegisterRole(req, res, secrets, readBody) {
  const body = await parseJsonBody(req, readBody);
  const { uid, requestedRole } = body;
  if (!uid || !requestedRole) return sendJson(res, 400, { error: 'Missing uid or requestedRole' });
  if (!ALLOWED_ROLES_SIGNUP.includes(requestedRole)) return sendJson(res, 400, { error: 'Invalid requestedRole' });
  const decoded = await requireCaller(req, secrets);
  if (decoded.uid !== uid) return sendJson(res, 403, { error: 'Token uid does not match requested uid' });
  const admin = getAdmin(secrets);
  const existingUser = await admin.auth().getUser(uid);
  const existingStatus = (existingUser.customClaims && existingUser.customClaims.status) || '';
  if (existingStatus === 'active') {
    return sendJson(res, 403, { error: 'Account is already active; cannot re-register' });
  }
  const email = existingUser.email || decoded.email || '';
  const claims = { role: requestedRole, status: 'pending', requestedAt: new Date().toISOString() };
  await admin.auth().setCustomUserClaims(uid, claims);
  return sendJson(res, 200, { status: claims.status, role: claims.role, requestedRole, email });
}

async function listAuthUsers(admin) {
  const users = [];
  let nextPageToken;
  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    page.users.forEach(u => {
      const claims = u.customClaims || {};
      users.push({
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || '',
        role: claims.role || 'none',
        status: claims.status || 'none',
        requestedAt: claims.requestedAt || null,
        createdAt: u.metadata.creationTime,
        lastSignIn: u.metadata.lastSignInTime,
      });
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  return users;
}

async function listSignInUsers(admin) {
  const now = Date.now();
  if (now - signInUserCache.at < SIGNIN_USER_CACHE_MS && signInUserCache.users.length) {
    return signInUserCache.users;
  }
  const users = await listAuthUsers(admin);
  signInUserCache = { at: now, users };
  return users;
}

async function handleResolveSignIn(req, res, secrets, readBody) {
  if (!resolveAllowed(clientIp(req))) {
    return sendJson(res, 429, { error: 'Too many attempts. Try again later.' });
  }
  const body = await parseJsonBody(req, readBody);
  const raw = body.name != null ? body.name : body.displayName;
  const users = await listSignInUsers(getAdmin(secrets));
  const found = findSignInEmail(users, raw);
  if (found.error) return sendJson(res, found.status || 404, { error: found.error });
  return sendJson(res, 200, { email: found.email });
}

async function handleGetAllUsers(req, res, secrets) {
  await requireDev(req, secrets);
  const users = await listAuthUsers(getAdmin(secrets));
  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  sendJson(res, 200, { users });
}

async function handleGetPendingUsers(req, res, secrets) {
  await requireDev(req, secrets);
  const users = await listAuthUsers(getAdmin(secrets));
  const pending = users
    .filter(u => u.status === 'pending')
    .map(u => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      requestedRole: u.role || 'student',
      requestedAt: u.requestedAt || u.createdAt,
    }));
  pending.sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));
  sendJson(res, 200, { pending });
}

async function handleApproveUser(req, res, secrets, readBody) {
  const body = await parseJsonBody(req, readBody);
  const { uid, role } = body;
  if (!uid || !role) return sendJson(res, 400, { error: 'Missing uid or role' });
  if (!ALLOWED_ROLES_ASSIGN.includes(role)) return sendJson(res, 400, { error: 'Invalid role' });
  await requireDev(req, secrets);
  const claims = { role, status: 'active' };
  await getAdmin(secrets).auth().setCustomUserClaims(uid, claims);
  sendJson(res, 200, { status: claims.status, role: claims.role, uid });
}

async function handleRejectUser(req, res, secrets, readBody) {
  const body = await parseJsonBody(req, readBody);
  const { uid, mode } = body;
  if (!uid || !['deny', 'delete'].includes(mode)) {
    return sendJson(res, 400, { error: 'Missing uid or invalid mode' });
  }
  await requireDev(req, secrets);
  const admin = getAdmin(secrets);
  if (mode === 'delete') {
    await admin.auth().deleteUser(uid);
    return sendJson(res, 200, { deleted: true, uid });
  }
  const existing = await admin.auth().getUser(uid);
  const claims = existing.customClaims || {};
  await admin.auth().setCustomUserClaims(uid, Object.assign({}, claims, { status: 'rejected' }));
  sendJson(res, 200, { status: 'rejected', uid });
}

async function handleUpdateUserName(req, res, secrets, readBody) {
  const body = await parseJsonBody(req, readBody);
  const { uid, displayName } = body;
  if (!uid || typeof displayName !== 'string') {
    return sendJson(res, 400, { error: 'Missing uid or displayName' });
  }
  const trimmed = displayName.trim();
  if (!trimmed) return sendJson(res, 400, { error: 'displayName cannot be empty' });
  if (trimmed.length > 100) return sendJson(res, 400, { error: 'displayName too long' });
  await requireDev(req, secrets);
  await getAdmin(secrets).auth().updateUser(uid, { displayName: trimmed });
  sendJson(res, 200, { uid, displayName: trimmed });
}

async function handleApi(req, res, url, opts) {
  const dataDir = opts.dataDir;
  const readBody = opts.readBody;
  const secrets = loadSecrets(dataDir);
  const name = routeName(url.pathname);
  const method = req.method;

  try {
    if (name === 'desmosKey' && method === 'GET') return handleDesmosKey(res, secrets);
    if (name === 'avatar' && method === 'GET') return await handleAvatar(url, res);
    if (name === 'grade' && method === 'POST') return await handleGrade(req, res, secrets, readBody);
    if (name === 'registerRole' && method === 'POST') return await handleRegisterRole(req, res, secrets, readBody);
    if (name === 'resolveSignIn' && method === 'POST') return await handleResolveSignIn(req, res, secrets, readBody);
    if ((name === 'getAllUsers') && (method === 'GET' || method === 'POST')) return await handleGetAllUsers(req, res, secrets);
    if ((name === 'getPendingUsers') && (method === 'GET' || method === 'POST')) return await handleGetPendingUsers(req, res, secrets);
    if (name === 'approveUser' && method === 'POST') return await handleApproveUser(req, res, secrets, readBody);
    if (name === 'rejectUser' && method === 'POST') return await handleRejectUser(req, res, secrets, readBody);
    if ((name === 'updateUserName' || name === 'Updateusername') && method === 'POST') {
      return await handleUpdateUserName(req, res, secrets, readBody);
    }
    if ((name === 'programLogs' || name === 'programLog') && method === 'GET') {
      return await handleProgramLogsGet(req, res, secrets, url);
    }
    if ((name === 'programLogs' || name === 'programLog') && method === 'POST') {
      return await handleProgramLogPost(req, res, secrets, readBody);
    }
    if (name === 'programCommand' && method === 'POST') {
      return await handleProgramCommand(req, res, secrets, readBody);
    }
    return sendJson(res, 404, { error: 'Unknown API route' });
  } catch (err) {
    const statusCode = (err && err.statusCode) || 500;
    const message = (err && err.message) || 'Unexpected server error';
    if (!res.headersSent) return sendJson(res, statusCode, { error: message });
  }
}

module.exports = { handleApi, loadSecrets, requireStoreAccess, requireStorePassword, readStoreToken, hookProgramConsole, setProgramActionHandler, pushProgramLog };

hookProgramConsole();

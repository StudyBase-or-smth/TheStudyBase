// Standalone replacements for Netlify /api/* functions.
// Loaded by StudyBaseData/server.js. Secrets come from secrets.json
// in the data folder, or from environment variables of the same names.

'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_ROLES_SIGNUP = ['student', 'teacher'];
const ALLOWED_ROLES_ASSIGN = ['student', 'teacher', 'dev'];
const AVATAR_HOST = /^(lh\d\.googleusercontent\.com|drive\.google\.com)$/i;
const AVATAR_MAX = 500 * 1024;

let adminMod = null;
let adminInitError = null;
let secretsCache = null;
let secretsPath = null;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  if (provider === 'claude') {
    const apiKey = (userKey && String(userKey).trim()) || secrets.CLAUDE_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: 'No Claude API key configured on server and none provided by user.' });
    const up = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
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
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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
    if (name === 'avatar' && method === 'GET') return handleAvatar(url, res);
    if (name === 'grade' && method === 'POST') return handleGrade(req, res, secrets, readBody);
    if (name === 'registerRole' && method === 'POST') return handleRegisterRole(req, res, secrets, readBody);
    if ((name === 'getAllUsers') && (method === 'GET' || method === 'POST')) return handleGetAllUsers(req, res, secrets);
    if ((name === 'getPendingUsers') && (method === 'GET' || method === 'POST')) return handleGetPendingUsers(req, res, secrets);
    if (name === 'approveUser' && method === 'POST') return handleApproveUser(req, res, secrets, readBody);
    if (name === 'rejectUser' && method === 'POST') return handleRejectUser(req, res, secrets, readBody);
    if ((name === 'updateUserName' || name === 'Updateusername') && method === 'POST') {
      return handleUpdateUserName(req, res, secrets, readBody);
    }
    return sendJson(res, 404, { error: 'Unknown API route' });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return sendJson(res, statusCode, { error: err.message || 'Unexpected server error' });
  }
}

module.exports = { handleApi, loadSecrets };

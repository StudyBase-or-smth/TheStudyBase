// netlify/functions/approveUser.js
//
// Approves (or re-assigns the role of) a user. Sets:
//   role:   'student' | 'teacher' | 'dev'
//   status: 'active'
//
// Caller must be an authenticated dev — Authorization: Bearer <idToken>
// for an account with role:'dev', status:'active'.
//
// Body: { uid: string, role: 'student' | 'teacher' | 'dev' }

const admin = require('firebase-admin');

const ALLOWED_ROLES = ['student', 'teacher', 'dev'];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function requireDev(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw { statusCode: 401, message: 'Missing Authorization header' };
  const decoded = await admin.auth().verifyIdToken(token);
  if (decoded.role !== 'dev' || decoded.status !== 'active') {
    throw { statusCode: 403, message: 'Dev access required' };
  }
  return decoded;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { uid, role } = body;

  if (!uid || !role) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing uid or role' }) };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid role' }) };
  }

  try {
    await requireDev(event);

    const claims = { role, status: 'active' };
    await admin.auth().setCustomUserClaims(uid, claims);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: claims.status, role: claims.role, uid }),
    };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};
// netlify/functions/updateUserName.js
//
// Dev-only. Updates a user's Firebase Auth displayName.
//
// Body: { uid: string, displayName: string }

const admin = require('firebase-admin');

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

  const { uid, displayName } = body;
  if (!uid || typeof displayName !== 'string') {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing uid or displayName' }) };
  }
  const trimmed = displayName.trim();
  if (!trimmed) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'displayName cannot be empty' }) };
  }
  if (trimmed.length > 100) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'displayName too long' }) };
  }

  try {
    await requireDev(event);
    await admin.auth().updateUser(uid, { displayName: trimmed });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ uid, displayName: trimmed }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};
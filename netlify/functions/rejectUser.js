// netlify/functions/rejectUser.js
//
// Two modes, both dev-only:
//   mode:'deny'   — keep the Firebase account, set status:'rejected'
//                   (user sees a rejection message instead of being auto-approved)
//   mode:'delete' — permanently delete the Firebase Auth account
//
// Body: { uid: string, mode: 'deny' | 'delete' }

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
  const decoded = await admin.auth().verifyIdToken(token, true); // checkRevoked
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

  const { uid, mode } = body;
  if (!uid || !['deny', 'delete'].includes(mode)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing uid or invalid mode' }) };
  }

  try {
    await requireDev(event);

    if (mode === 'delete') {
      await admin.auth().deleteUser(uid);
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ deleted: true, uid }) };
    }

    // mode === 'deny'
    const existing = await admin.auth().getUser(uid);
    const claims = existing.customClaims || {};
    await admin.auth().setCustomUserClaims(uid, { ...claims, status: 'rejected' });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ status: 'rejected', uid }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};
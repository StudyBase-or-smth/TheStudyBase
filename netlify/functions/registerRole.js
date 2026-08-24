// netlify/functions/registerRole.js
//
// Called right after a new user signs up. Sets Firebase custom claims using
// a {role, status} schema:
//   role:   'student' | 'teacher' | 'dev'   (the actual or requested role)
//   status: 'active' | 'pending' | 'rejected'
//
// Every sign-up — regardless of role or email domain — goes to
// status:'pending' for a dev to review and approve in the dev panel.
// (Previously an @pcs.nsw.edu.au email requesting 'student' was
// auto-activated; that auto-approval path was removed so all new
// accounts require manual approval.)
//
// SECURITY: the caller must present a valid Firebase ID token (Authorization:
// Bearer <idToken>) for the SAME uid they are requesting a role for. Without
// this, anyone who knew (or guessed) another account's uid could overwrite
// that account's claims by posting a forged uid/email pair.
//
// Requires a Firebase service account — set as three Netlify environment
// variables (Site settings -> Environment variables):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

const admin = require('firebase-admin');

const ALLOWED_ROLES = ['student', 'teacher']; // dev accounts are created manually, never via sign-up

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

async function requireCaller(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw { statusCode: 401, message: 'Missing Authorization header' };
  const decoded = await admin.auth().verifyIdToken(token, true); // checkRevoked
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

  const { uid, requestedRole } = body;

  if (!uid || !requestedRole) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing uid or requestedRole' }) };
  }
  if (!ALLOWED_ROLES.includes(requestedRole)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid requestedRole' }) };
  }

  try {
    const decoded = await requireCaller(event);
    if (decoded.uid !== uid) {
      return { statusCode: 403, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Token uid does not match requested uid' }) };
    }

    // Use the verified email off the Firebase user record / token — never a
    // client-supplied field.
    const existingUser = await admin.auth().getUser(uid);
    const existingStatus = (existingUser.customClaims && existingUser.customClaims.status) || '';
    if (existingStatus === 'active' || existingStatus === 'rejected') {
      return {
        statusCode: 403,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: existingStatus === 'rejected' ? 'Account was rejected; cannot re-register' : 'Account is already active; cannot re-register' }),
      };
    }

    const email = existingUser.email || decoded.email || '';

    // Every sign-up requires manual dev approval — always pending, no
    // auto-activation.
    const claims = { role: requestedRole, status: 'pending', requestedAt: new Date().toISOString() };

    await admin.auth().setCustomUserClaims(uid, claims);

    // Notify via the existing Apps Script web app — fire-and-forget,
    // a failed notification shouldn't block the sign-up itself.
    try {
      const SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';
      await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          key: '_pending_approval_request_',
          data: JSON.stringify({ uid, email, requestedRole, requestedAt: claims.requestedAt }),
        }),
      });
    } catch (notifyErr) {
      console.error('Notification failed (non-blocking):', notifyErr.message);
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: claims.status, role: claims.role, requestedRole }),
    };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};
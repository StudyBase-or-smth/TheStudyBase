// netlify/functions/registerRole.js
//
// Called right after a new user signs up. Sets Firebase custom claims using
// a {role, status} schema:
//   role:   'student' | 'teacher' | 'dev'   (the actual or requested role)
//   status: 'active' | 'pending' | 'rejected'
//
// Only an @pcs.nsw.edu.au email requesting 'student' is auto-activated.
// Everything else goes to status:'pending' for a dev to review in the
// dev panel.
//
// Requires a Firebase service account — set as three Netlify environment
// variables (Site settings -> Environment variables):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

const admin = require('firebase-admin');

const SCHOOL_DOMAIN = '@pcs.nsw.edu.au';
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

  const { uid, email, requestedRole } = body;

  if (!uid || !email || !requestedRole) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing uid, email, or requestedRole' }) };
  }
  if (!ALLOWED_ROLES.includes(requestedRole)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid requestedRole' }) };
  }

  try {
    const isSchoolEmail = email.toLowerCase().endsWith(SCHOOL_DOMAIN);
    const autoApprove = isSchoolEmail && requestedRole === 'student';

    const claims = autoApprove
      ? { role: 'student', status: 'active' }
      : { role: requestedRole, status: 'pending', requestedAt: new Date().toISOString() };

    await admin.auth().setCustomUserClaims(uid, claims);

    if (!autoApprove) {
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
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: claims.status, role: claims.role, requestedRole }),
    };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};
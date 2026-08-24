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

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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

function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendApprovalEmail({ uid, email, requestedRole, requestedAt }) {
  const fromUser = process.env.NOTIFY_EMAIL_USER;
  const pass = process.env.NOTIFY_EMAIL_PASS;
  const to = process.env.ADMIN_EMAIL;
  if (!fromUser || !pass || !to) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: fromUser, pass },
  });

  await transporter.sendMail({
    from: `"StudyBase" <${fromUser}>`,
    to,
    subject: `[StudyBase] Approval request — ${requestedRole} — ${email}`,
    text: [
      'A new account is awaiting approval.',
      '',
      `Email:          ${email}`,
      `Requested role: ${requestedRole}`,
      `UID:            ${uid}`,
      `Requested at:   ${requestedAt}`,
      '',
      'Approve or reject this account in the Dev Panel.',
    ].join('\n'),
    html: `
      <h2 style="font-family:sans-serif">StudyBase — Approval Request</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><strong>${htmlEscape(email)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Requested role</td><td><strong>${htmlEscape(requestedRole)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">UID</td><td><code>${htmlEscape(uid)}</code></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Requested at</td><td>${htmlEscape(requestedAt)}</td></tr>
      </table>
      <p style="font-family:sans-serif;margin-top:16px;color:#555">
        Approve or reject this account in the Dev Panel.
      </p>
    `,
  });
}

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

    sendApprovalEmail({ uid, email, requestedRole, requestedAt: claims.requestedAt })
      .catch(err => console.error('Approval email failed (non-blocking):', err.message));

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
// netlify/functions/registerRole.js
//
// Called right after a new user signs up. Decides whether the account
// gets auto-activated or goes into "pending" status and sets the
// corresponding Firebase custom claim.
//
// Required Netlify environment variables:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL   <- service account email, NOT your personal email
//   FIREBASE_PRIVATE_KEY    <- service account private key (with \n chars)
//   NOTIFY_EMAIL_USER       <- Gmail address to send notifications FROM
//   NOTIFY_EMAIL_PASS       <- Gmail App Password (not your normal password)
//                              Generate at: myaccount.google.com/apppasswords
//   ADMIN_EMAIL             <- where approval requests are sent TO
//                              e.g. thestudybase@outlook.com

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const SCHOOL_DOMAIN  = '@pcs.nsw.edu.au';
// Dev is intentionally excluded — devs add themselves manually
const ALLOWED_ROLES  = ['student', 'teacher'];

// Initialise Admin SDK once per cold start
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

// Build a nodemailer transporter using Gmail + App Password
function makeTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NOTIFY_EMAIL_USER,
      pass: process.env.NOTIFY_EMAIL_PASS,
    },
  });
}

async function sendApprovalEmail({ uid, email, requestedRole, requestedAt }) {
  const transporter = makeTransporter();
  await transporter.sendMail({
    from:    `"StudyBase" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      process.env.ADMIN_EMAIL,
    subject: `[StudyBase] Approval request — ${requestedRole} — ${email}`,
    text: [
      `A new account is awaiting approval.`,
      ``,
      `Email:          ${email}`,
      `Requested role: ${requestedRole}`,
      `UID:            ${uid}`,
      `Requested at:   ${requestedAt}`,
      ``,
      `To approve, run the approveUser function or use the admin panel.`,
    ].join('\n'),
    html: `
      <h2 style="font-family:sans-serif">StudyBase — Approval Request</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><strong>${email}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Requested role</td><td><strong>${requestedRole}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">UID</td><td><code>${uid}</code></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Requested at</td><td>${requestedAt}</td></tr>
      </table>
      <p style="font-family:sans-serif;margin-top:16px;color:#555">
        To approve this user, use your admin panel or run <code>approveUser</code>
        with the UID above.
      </p>
    `,
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { uid, email, requestedRole } = body;

  // ── Validation ──────────────────────────────────────────────────────────────

  if (!uid || !email || !requestedRole) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing uid, email, or requestedRole' }) };
  }

  // Reject dev role entirely — devs are added manually
  if (!ALLOWED_ROLES.includes(requestedRole)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Role "${requestedRole}" cannot be self-assigned` }) };
  }

  const isSchoolEmail = email.toLowerCase().endsWith(SCHOOL_DOMAIN);

  // Non-school emails can only request teacher (which goes pending).
  // A non-school email requesting student is rejected outright —
  // students must have a school address.
  if (!isSchoolEmail && requestedRole === 'student') {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: `Student accounts require a ${SCHOOL_DOMAIN} email address.`,
        code:  'non_school_email',
      }),
    };
  }

  // ── Role assignment ──────────────────────────────────────────────────────────

  try {
    const autoApprove = isSchoolEmail && requestedRole === 'student';

    if (autoApprove) {
      // School student — activate immediately, no email needed
      await admin.auth().setCustomUserClaims(uid, { role: 'student', status: 'active' });
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'active', role: 'student' }),
      };
    }

    // Everyone else (teacher with any email, or non-school teacher):
    // mark as pending and notify the admin
    await admin.auth().setCustomUserClaims(uid, {
      role:          'pending',
      status:        'pending',
      requestedRole,
    });

    const requestedAt = new Date().toISOString();

    // Send the real approval email — fire-and-forget so a mail failure
    // doesn't break the sign-up response
    sendApprovalEmail({ uid, email, requestedRole, requestedAt })
      .catch(err => console.error('Approval email failed (non-blocking):', err.message));

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'pending', requestedRole }),
    };

  } catch (err) {
    console.error('registerRole error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected server error' }),
    };
  }
};
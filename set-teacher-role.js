/**
 * set-teacher-role.js
 * Run once to grant or revoke the teacher role for a Firebase user.
 *
 * Setup:
 *   1. npm install firebase-admin
 *   2. Download your Firebase service account key:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *      Save it as serviceAccountKey.json in the same folder as this script.
 *   3. Edit the UID and ACTION below, then run:
 *      node set-teacher-role.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ─── CONFIG ────────────────────────────────────────────────
const UID    = 'PASTE_FIREBASE_UID_HERE';   // find in Firebase Console → Authentication → Users
const ACTION = 'grant';                      // 'grant' or 'revoke'
// ───────────────────────────────────────────────────────────

async function run() {
  const newClaims = ACTION === 'grant' ? { role: 'teacher' } : { role: null };
  await admin.auth().setCustomUserClaims(UID, newClaims);
  const user = await admin.auth().getUser(UID);
  console.log(`✅ ${ACTION === 'grant' ? 'Granted' : 'Revoked'} teacher role for: ${user.email}`);
  console.log('Custom claims:', (await admin.auth().getUser(UID)).customClaims);
  process.exit(0);
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });

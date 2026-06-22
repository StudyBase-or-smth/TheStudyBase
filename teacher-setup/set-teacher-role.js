const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// ─── CONFIG ────────────────────────────────────────────────
const UID    = '5NJijDlo4vfDia3Q9yVki2oRL6v1';  // ← paste your UID here
const ACTION = 'grant';                     // 'grant' or 'revoke'
// ───────────────────────────────────────────────────────────

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function run() {
  const newClaims = ACTION === 'grant' ? { role: 'teacher' } : {};
  await admin.auth().setCustomUserClaims(UID, newClaims);
  const user = await admin.auth().getUser(UID);
  console.log('✅ Done! Teacher role granted to: ' + user.email);
  process.exit(0);
}

run().catch(err => { console.error('❌ Error: ' + err.message); process.exit(1); });

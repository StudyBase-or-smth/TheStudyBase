// netlify/functions/firebaseConfig.js
//
// Returns the Firebase *web* project id used by the browser SDK.
// Admin SDK secrets stay server-side (FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY). This endpoint exists so FIREBASE_PROJECT_ID is
// not committed in HTML/JS — Netlify secrets scanning flags that value
// in the repo/build output.
//
// Required Netlify env:
//   FIREBASE_PROJECT_ID   (already used by the Admin SDK functions)
// Optional overrides for the public web SDK fields (otherwise the
// client uses the committed public defaults in firebase-config.js):
//   FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_MESSAGING_SENDER_ID
//   FIREBASE_AUTH_DOMAIN, FIREBASE_STORAGE_BUCKET

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) {
    return {
      statusCode: 503,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Firebase web config is not set' }),
    };
  }

  const body = {
    projectId,
    authDomain: (process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`).trim(),
    storageBucket: (process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`).trim(),
  };

  const apiKey = (process.env.FIREBASE_API_KEY || '').trim();
  const appId = (process.env.FIREBASE_APP_ID || '').trim();
  const messagingSenderId = (process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim();
  if (apiKey) body.apiKey = apiKey;
  if (appId) body.appId = appId;
  if (messagingSenderId) body.messagingSenderId = messagingSenderId;

  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
};

// netlify/functions/firebaseConfig.js
//
// Returns the public Firebase *web* config used by the browser SDK.
// Admin SDK secrets stay server-side (FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY). This endpoint exists so FIREBASE_PROJECT_ID and
// the rest of the web config are not committed in HTML/JS — Netlify
// secrets scanning flags those values in the repo/build output.
//
// Set these in Netlify (Site settings -> Environment variables):
//   FIREBASE_PROJECT_ID            (already used by the Admin SDK functions)
//   FIREBASE_API_KEY               (Project settings -> Web API key)
//   FIREBASE_APP_ID                (Project settings -> App ID)
//   FIREBASE_MESSAGING_SENDER_ID   (Project settings -> Sender ID)
// Optional overrides:
//   FIREBASE_AUTH_DOMAIN           (defaults to <projectId>.firebaseapp.com)
//   FIREBASE_STORAGE_BUCKET        (defaults to <projectId>.firebasestorage.app)

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const apiKey = (process.env.FIREBASE_API_KEY || '').trim();
  const appId = (process.env.FIREBASE_APP_ID || '').trim();
  const messagingSenderId = (process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim();

  if (!projectId || !apiKey || !appId || !messagingSenderId) {
    return {
      statusCode: 503,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Firebase web config is not set' }),
    };
  }

  const authDomain = (process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`).trim();
  const storageBucket = (process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`).trim();

  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
    }),
  };
};

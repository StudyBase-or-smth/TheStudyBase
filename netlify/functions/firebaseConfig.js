// netlify/functions/firebaseConfig.js
//
// Returns the Firebase *web* project id used by the browser SDK.
// Admin SDK secrets stay server-side (FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY). This endpoint exists so FIREBASE_PROJECT_ID is
// not committed in HTML/JS — Netlify secrets scanning flags that value
// in the repo/build output.
//
// Required Netlify / .env:
//   FIREBASE_PROJECT_ID   (already used by the Admin SDK functions)

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

  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      projectId,
      authDomain: `${projectId}.firebaseapp.com`,
      storageBucket: `${projectId}.firebasestorage.app`,
    }),
  };
};

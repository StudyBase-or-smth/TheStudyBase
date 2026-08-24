// netlify/functions/firebaseConfig.js
//
// Returns the Firebase web project id for the browser SDK. The value
// comes from process.env so it is not committed in HTML/JS.

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

// netlify/functions/desmosKey.js
//
// Fallback for the Desmos Graphing Calculator API key when
// sync-config.js's DESMOS_API_KEY is empty. Preferred home for the key is
// sync-config.js (same file as SYNC_URL). This function still reads
//
//   DESMOS_API_KEY   -> your Desmos API key (get one at desmos.com/my-api)
//
// from Netlify env / local .env so existing deploys keep working.
//
// Unlike CLAUDE_API_KEY / GEMINI_API_KEY (see grade.js), a Desmos API key is
// NOT a spend-authorizing secret -- Desmos's own embed pattern puts it
// directly in a public <script src="...?apiKey=...">, visible to anyone who
// views the page source. So this endpoint is intentionally NOT gated behind
// sign-in (that would just break graphs for guests/logged-out readers with
// no real security benefit) -- it exists purely so the raw key value never
// has to live in a file that gets committed to git.
//
// Until DESMOS_API_KEY is set, this returns an empty apiKey and the client
// shows a "graphing isn't configured yet" notice instead of erroring.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey: process.env.DESMOS_API_KEY || '' }),
  };
};

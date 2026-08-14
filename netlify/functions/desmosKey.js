// netlify/functions/desmosKey.js
//
// Hands the Desmos Graphing Calculator API key to the client at runtime, so
// the real key only has to exist in ONE place: this site's Netlify
// environment variables (Site settings -> Environment variables), set as
//
//   DESMOS_API_KEY   -> your Desmos API key (get one at desmos.com/my-api)
//
// -- and in a local .env for `netlify dev`. It is never committed to the repo.
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

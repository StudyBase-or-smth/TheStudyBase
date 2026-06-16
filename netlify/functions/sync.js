/**
 * netlify/functions/sync.js
 * Proxy between the browser and Google Apps Script.
 *
 * GET  /.netlify/functions/sync?key=xxx   → pull data
 * POST /.netlify/functions/sync           → push data  { key, data }
 */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function ok(body) { return { statusCode: 200, headers: CORS, body: JSON.stringify(body) }; }
function err(msg) { return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: msg }) }; }

function parseResponse(text) {
  text = text.trim();
  try { return JSON.parse(text); } catch (_) {}
  const m = text.match(/^\w[\w.]*\s*\((.+)\)\s*;?\s*$/s);
  if (m) { try { return JSON.parse(m[1]); } catch (_) {} }
  return { data: null };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // ── GET — pull ──────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const key = (event.queryStringParameters || {}).key;
    if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing key' }) };

    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?key=${encodeURIComponent(key)}`, {
        redirect: 'follow',
        headers: { 'User-Agent': 'StudyBase-Proxy/1.0' },
      });
      const text = await res.text();
      console.log('GAS GET raw:', text.slice(0, 300));
      return ok(parseResponse(text));
    } catch (e) {
      console.error('GET proxy error:', e);
      return err(e.message);
    }
  }

  // ── POST — push ─────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (_) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { key, data } = body;
    if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing key' }) }; 

    // Apps Script's doPost tries JSON.parse(e.postData.contents) first,
    // so send JSON — but ensure `data` is always a JSON string, never a
    // raw object, so Apps Script receives it as a string it can store directly.
    const payload = {
      key,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    };

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'StudyBase-Proxy/1.0',
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      console.log('GAS POST raw:', text.slice(0, 300));
      let json = { ok: true };
      try { json = parseResponse(text); } catch (_) {}
      return ok(json);
    } catch (e) {
      console.error('POST proxy error:', e);
      return err(e.message);
    }
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
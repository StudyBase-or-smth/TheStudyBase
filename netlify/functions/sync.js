/**
 * netlify/functions/sync.js — DEBUG VERSION
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
  console.log('=== SYNC FUNCTION CALLED ===');
  console.log('Method:', event.httpMethod);
  console.log('Query:', JSON.stringify(event.queryStringParameters));
  console.log('Body preview:', (event.body || '').slice(0, 200));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // ── GET — pull ──────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const key = (event.queryStringParameters || {}).key;
    console.log('GET key:', key);
    if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing key' }) };

    try {
      const url = `${APPS_SCRIPT_URL}?key=${encodeURIComponent(key)}`;
      console.log('Fetching GAS URL:', url);
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'StudyBase-Proxy/1.0' },
      });
      console.log('GAS GET status:', res.status, res.url);
      const text = await res.text();
      console.log('GAS GET raw response:', text.slice(0, 500));
      const parsed = parseResponse(text);
      console.log('GAS GET parsed:', JSON.stringify(parsed).slice(0, 200));
      return ok(parsed);
    } catch (e) {
      console.error('GET proxy error:', e.message, e.stack);
      return err(e.message);
    }
  }

  // ── POST — push ─────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (_) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { key, data } = body;
    console.log('POST key:', key);
    console.log('POST data type:', typeof data);
    console.log('POST data preview:', JSON.stringify(data).slice(0, 200));

    if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing key' }) };

    const payload = {
      key,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    };
    console.log('Sending to GAS, data is string:', typeof payload.data === 'string');
    console.log('Payload preview:', JSON.stringify(payload).slice(0, 300));

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
      console.log('GAS POST status:', res.status, res.url);
      const text = await res.text();
      console.log('GAS POST raw response:', text.slice(0, 500));
      let json = { ok: true };
      try { json = parseResponse(text); } catch (_) {}
      return ok(json);
    } catch (e) {
      console.error('POST proxy error:', e.message, e.stack);
      return err(e.message);
    }
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
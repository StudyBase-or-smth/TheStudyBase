/**
 * Netlify Function: sync.js
 * Proxies all requests between the browser and Google Apps Script.
 *
 * GET  /.netlify/functions/sync?key=xxx        → fetch data from Apps Script
 * POST /.netlify/functions/sync  {key, data}   → push data to Apps Script
 */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      // ── Pull: forward query string to Apps Script ──
      const key = (event.queryStringParameters || {}).key;
      if (!key) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing key' }) };
      }

      const url = `${APPS_SCRIPT_URL}?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();

      // Apps Script returns JSONP when a callback param is present; without one it
      // returns plain JSON — but let's handle both just in case.
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // Strip any JSONP wrapper e.g. _cb123({...})
        const match = text.match(/^\s*\w+\((\{[\s\S]*\})\)\s*;?\s*$/);
        json = match ? JSON.parse(match[1]) : { data: null };
      }

      return { statusCode: 200, headers, body: JSON.stringify(json) };

    } else if (event.httpMethod === 'POST') {
      // ── Push: forward JSON body to Apps Script via POST ──
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }

      const { key, data } = body;
      if (!key) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing key' }) };
      }

      // Apps Script Web Apps require form-encoded POST bodies
      const form = new URLSearchParams();
      form.append('key', key);
      form.append('data', typeof data === 'string' ? data : JSON.stringify(data));

      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });

      // Apps Script POST responses are often empty or HTML — just confirm receipt
      const text = await res.text();
      let json = { ok: true };
      try { json = JSON.parse(text); } catch { /* ignore non-JSON */ }

      return { statusCode: 200, headers, body: JSON.stringify(json) };

    } else {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

  } catch (err) {
    console.error('Sync proxy error:', err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Proxy error', detail: err.message }),
    };
  }
};
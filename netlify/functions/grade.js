// netlify/functions/grade.js
//
// This function is the ONLY place real API keys should live (as Netlify
// environment variables, set in Site settings -> Environment variables):
//
//   GEMINI_API_KEY   -> your default Gemini key
//   CLAUDE_API_KEY   -> your default Claude (Anthropic) key
//
// The browser never sees these. If the user pastes their own key into the
// optional textbox on the page, that key is sent per-request in the request
// body and used instead -- it is NOT stored anywhere server-side either.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { provider, prompt, userKey } = body;

  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing prompt' }) };
  }

  try {
    if (provider === 'claude') {
      const apiKey = (userKey && userKey.trim()) || process.env.CLAUDE_API_KEY;
      if (!apiKey) {
        return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'No Claude API key configured on server and none provided by user.' }) };
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || 'Claude API request failed';
        return { statusCode: res.status, headers: JSON_HEADERS, body: JSON.stringify({ error: msg }) };
      }

      const text = (data.content || [])
        .map((block) => (block.type === 'text' ? block.text : ''))
        .filter(Boolean)
        .join('\n');

      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ text }),
      };
    }

    if (provider === 'gemini') {
      const apiKey = (userKey && userKey.trim()) || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'No Gemini API key configured on server and none provided by user.' }) };
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || 'Gemini API request failed';
        return { statusCode: res.status, headers: JSON_HEADERS, body: JSON.stringify({ error: msg }) };
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ text }),
      };
    }

    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Unknown provider: ' + provider }) };
  } catch (err) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};
'use strict';

const allowedOrigins = new Set((process.env.STUDYBASE_ALLOWED_ORIGINS == null
  ? 'https://thestudybase-server.tail8c20e2.ts.net:8443'
  : process.env.STUDYBASE_ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean));
const methods = ['GET', 'POST', 'OPTIONS'];
const headers = ['Content-Type', 'Authorization', 'X-StudyBase-Store'];

// Returns true when the request has been answered here.
function handleCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  if (origin && !allowedOrigins.has(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return true;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method !== 'OPTIONS') return false;
  const method = req.headers['access-control-request-method'];
  const requestedHeaders = String(req.headers['access-control-request-headers'] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if ((method && !methods.includes(method)) || requestedHeaders.some(h => !headers.some(allowed => allowed.toLowerCase() === h))) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Preflight method or headers not allowed' }));
    return true;
  }
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
  res.writeHead(204);
  res.end();
  return true;
}

module.exports = { handleCors };

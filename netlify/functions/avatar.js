// Proxies Google Drive / googleusercontent avatar images through this
// origin so the browser does not hit lh3.googleusercontent.com directly.
// Those URLs 429 when hotlinked (Referer + rate limits). Restricts the
// target host to Google image hosts to avoid SSRF.

const ALLOWED_HOST = /^(lh\d\.googleusercontent\.com|drive\.google\.com)$/i;
const MAX_BYTES = 500 * 1024;

function allowedUrl(raw){
  let u;
  try { u = new URL(raw); } catch(e){ return null; }
  if(u.protocol !== 'https:') return null;
  if(!ALLOWED_HOST.test(u.hostname)) return null;
  return u.href;
}

exports.handler = async function (event) {
  if(event.httpMethod !== 'GET'){
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const raw = (event.queryStringParameters && event.queryStringParameters.u) || '';
  const url = allowedUrl(raw);
  if(!url){
    return { statusCode: 400, body: 'Bad avatar url' };
  }

  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(8000),
    });
  } catch(e){
    return { statusCode: 502, body: 'Avatar fetch failed' };
  }

  if(!res.ok){
    return { statusCode: res.status, body: 'Upstream ' + res.status };
  }

  let finalHost = '';
  try { finalHost = new URL(res.url).hostname; } catch(e){ finalHost = ''; }
  if(!ALLOWED_HOST.test(finalHost)){
    return { statusCode: 400, body: 'Bad redirect' };
  }

  const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
  if(!ct.startsWith('image/')){
    return { statusCode: 415, body: 'Not an image' };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if(buf.length > MAX_BYTES){
    return { statusCode: 413, body: 'Too large' };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=604800',
    },
    body: buf.toString('base64'),
    isBase64Encoded: true,
  };
};

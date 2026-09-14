// sync-config.js
//
// Shared client config loaded before mainapp.js / topicapp.js.
//
// SYNC_URL — Google Apps Script sync endpoint. registerRole.js runs
// server-side and keeps its own copy.
//
// DESMOS_API_KEY — Desmos Graphing Calculator key (desmos.com/my-api).
// Desmos embeds this in a public <script src>, so it is not a spend
// secret. Keep it here so subject/class pages work from file:// without
// hitting /api/desmosKey. If this is empty, those pages fall back to the
// Netlify env var via netlify/functions/desmosKey.js.
//
// Drive uploads (rich-text images + PDF topic files) go through SYNC_URL
// `_up_` / `_ur_` keys. The live Apps Script must match apps-script/Code.gs
// (paste + Deploy → New version) or PDFs are rejected as bad_format.
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';
const DESMOS_API_KEY = '7339116aaed4438899621e81f10dd250';

// JSONP GET against Apps Script. After the timeout the callback is left as a
// no-op so a late response cannot throw "Uncaught ReferenceError: _cb… is not defined".
function jsonpGet(url, timeoutMs){
  return new Promise((resolve, reject) => {
    const cb = '_cb' + Date.now() + '_' + Math.floor(Math.random() * 99999);
    const script = document.createElement('script');
    let settled = false;
    const settle = fn => {
      if(settled) return;
      settled = true;
      if(script.parentNode) script.parentNode.removeChild(script);
      window[cb] = function(){ delete window[cb]; };
      fn();
    };
    window[cb] = data => settle(() => { delete window[cb]; resolve(data); });
    script.onerror = () => settle(() => reject(new Error('JSONP error')));
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(script);
    setTimeout(() => settle(() => reject(new Error('Timeout'))), timeoutMs || 8000);
  });
}
function sbJsonpGet(url){ return jsonpGet(url); }

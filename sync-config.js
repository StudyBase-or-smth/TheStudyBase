// sync-config.js
//
// Shared client config loaded before mainapp.js / subjectapp.js / classapp.js.
//
// SYNC_URL — Google Apps Script sync endpoint. registerRole.js runs
// server-side and keeps its own copy.
//
// DESMOS_API_KEY — Desmos Graphing Calculator key (desmos.com/my-api).
// Desmos embeds this in a public <script src>, so it is not a spend
// secret. Keep it here so subject/class pages work from file:// without
// hitting /api/desmosKey. If this is empty, those pages fall back to the
// Netlify env var via netlify/functions/desmosKey.js.
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';
const DESMOS_API_KEY = '7339116aaed4438899621e81f10dd250';

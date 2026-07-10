// sync-config.js
//
// Single source of truth for the shared Google Apps Script sync endpoint
// used by mainapp.js, subject/subjectapp.js and subject/classapp.js. This
// used to be copy-pasted into all three files (and a fourth copy lived in
// netlify/functions/registerRole.js, which runs server-side and so keeps
// its own copy). Include this script tag before any of them.
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbw58Nd3KktmYnRXnW7JqKUA5vdfAwpr7Wa8GZNROv773MRWn9-3opMb9xy1XYhi_INP/exec';

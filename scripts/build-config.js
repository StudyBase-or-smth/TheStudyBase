const fs = require('node:fs');
const path = require('node:path');

const fallback = 'http://127.0.0.1:8787/sync';

// JSON encoding handles control characters; escape apostrophes for single quotes.
function literal(value) {
  return "'" + JSON.stringify(value).slice(1, -1)
    .replace(/'/g, "\\'")
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029') + "'";
}

const source = ['BASECOMPUTER_SYNC_URL', 'PROGRAM_SYNC_URL']
  .map(name => `const ${name} = ${literal(process.env[name] || fallback)};`)
  .join('\n') + '\n';

fs.writeFileSync(path.resolve(__dirname, '..', 'sync-config.generated.js'), source, 'utf8');

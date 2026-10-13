const fs = require('node:fs');
const path = require('node:path');

require('./build-config.js');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Never follow an existing output symlink when clearing the build directory.
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
  throw new Error('dist must be a real directory, not a symlink');
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);

// Explicit public entries keep backend code, credentials and development files out.
const entries = [
  'index.html', 'login.html', 'profile.html', 'analyser.html',
  'Devpanel.html', 'devbackend.html',
  'BranchVersion.js', 'BranchVersion.json', 'calendar-qol.js',
  'firebase-config.js', 'fonts.css', 'icon.png', 'mainapp.js', 'mainstyle.css',
  'notifications.js', 'profile-store.js', 'qol.css', 'qol.js',
  'subjects.js', 'suggestions.js', 'sync-config.js', 'sync-config.generated.js',
  'fonts', 'HSC', 'KnowledgeCompetition', 'subject', 'vendor'
];
const publicExtensions = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.woff', '.ttf', '.ico', '.webp', '.gif', '.txt']);

for (const entry of entries) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), {
    recursive: true,
    filter(source) {
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) throw new Error(`Public assets cannot be symlinks: ${source}`);
      if (path.basename(source).startsWith('.')) return false;
      return stat.isDirectory() || publicExtensions.has(path.extname(source).toLowerCase());
    }
  });
}
console.log('Built static website in dist/');

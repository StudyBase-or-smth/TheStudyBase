const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('static build includes browser assets, excludes private files and replaces stale output', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'studybase-build-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const entry of fs.readdirSync(root)) {
    if (['scripts', 'fonts', 'HSC', 'KnowledgeCompetition', 'subject', 'vendor'].includes(entry) || /\.(html|js|css|json|png)$/.test(entry)) {
      fs.cpSync(path.join(root, entry), path.join(fixture, entry), { recursive: true });
    }
  }
  fs.writeFileSync(path.join(fixture, '.env'), 'SECRET=private');
  fs.writeFileSync(path.join(fixture, 'secrets.json'), '{}');
  fs.mkdirSync(path.join(fixture, 'dist'));
  fs.writeFileSync(path.join(fixture, 'dist', 'stale.html'), 'old build');
  const env = { ...process.env };
  delete env.BASECOMPUTER_SYNC_URL;
  delete env.PROGRAM_SYNC_URL;
  const backend = "https://backend.example/sync?'\\\"\n\r\t\u2028\u2029</script>";
  execFileSync(process.execPath, ['scripts/build-static.js'], { cwd: fixture, env: { ...env, BASECOMPUTER_SYNC_URL: backend } });
  const output = path.join(fixture, 'dist');
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(output, 'sync-config.generated.js'), 'utf8'), ctx);
  assert.equal(vm.runInContext('BASECOMPUTER_SYNC_URL', ctx), backend);
  assert.equal(vm.runInContext('PROGRAM_SYNC_URL', ctx), 'http://127.0.0.1:8787/sync');
  for (const excluded of ['.env', '.git', 'secrets.json', 'server.js', 'program-commands.js', 'package.json', 'package-lock.json', 'scripts', 'standalone', 'tests', 'node_modules', 'README.md', 'stale.html', 'sync-config.generated.example.js']) {
    assert.equal(fs.existsSync(path.join(output, excluded)), false, excluded);
  }
  for (const asset of ['index.html', 'subject/class.html', 'HSC/storage/manifest.json', 'KnowledgeCompetition/storage/manifest.json', 'vendor/pdfjs/pdf.worker.min.js']) {
    assert.ok(fs.existsSync(path.join(output, asset)), asset);
  }
  function verifyAssets(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { verifyAssets(file); continue; }
      if (!/\.(html|css)$/.test(file)) continue;
      const source = fs.readFileSync(file, 'utf8');
      const refs = entry.name.endsWith('.css') ? source.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g) : source.matchAll(/(?:src|href)=["']([^"']+)["']/g);
      for (const [, ref] of refs) {
        if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref) || ref.includes('${')) continue;
        const local = ref.split(/[?#]/)[0];
        if (!local) continue;
        const target = local.startsWith('/') ? path.join(output, local) : path.resolve(path.dirname(file), local);
        assert.ok(fs.existsSync(target), `${path.relative(output, file)} references missing ${ref}`);
      }
    }
  }
  verifyAssets(output);
});

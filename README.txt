StudyBaseProgram — Coolify API/sync backend

The website is deployed separately. This program serves /sync, /api/*,
uploaded files and user photos. GET /health returns only {"ok":true}.
The local status page and HTTP website-folder management routes are removed.

Coolify application settings
  Build strategy: Nixpacks
  Install command: npm ci
  Start command: node server.js
  Internal port: 8787 (server binds to 0.0.0.0)
  Health check: GET /health on port 8787, expected HTTP 200
  Persistent volume destination: /data
  Keep your existing 8787:8787 mapping if required by your external proxy.

Runtime environment variables
  STUDYBASE_DATA_DIR=/data
  PORT=8787
  STUDYBASE_PUBLIC_URL=https://thestudybase-server.tail8c20e2.ts.net:10000
  STUDYBASE_ALLOWED_ORIGINS=https://thestudybase-server.tail8c20e2.ts.net:8443
  FIREBASE_PROJECT_ID=<Firebase project ID>
  FIREBASE_CLIENT_EMAIL=<Firebase Admin service-account email>
  FIREBASE_PRIVATE_KEY=<Firebase Admin private key>
  DESMOS_API_KEY=<Desmos key>
  CLAUDE_API_KEY=<Anthropic key>
  GEMINI_API_KEY=<Google key>

Set these on the backend as available at runtime. Secrets need not be available
during build. FIREBASE_PRIVATE_KEY accepts real newlines or literal \n escapes.
Environment values take priority; /data/secrets.json is an optional per-key
fallback for unset or empty environment values. Credentials are never served.
STUDYBASE_PUBLIC_URL is an HTTP(S) origin, with no path or credentials. It is
used for every newly generated upload/photo URL; existing saved URLs are not
rewritten. Without it, local development defaults to http://127.0.0.1:PORT.

Set STUDYBASE_ALLOWED_ORIGINS to the exact frontend origin (scheme, hostname,
and port; no trailing slash). Separate multiple origins with commas. The
default is https://thestudybase-server.tail8c20e2.ts.net:8443. An empty value
disables browser cross-origin access. Allowed OPTIONS requests return 204 and
allow GET, POST, Content-Type, Authorization and X-StudyBase-Store. Disallowed
origins, methods and headers return 403. Requests without Origin still work
for server clients and health checks; CORS is not an authentication mechanism.

Leave STUDYBASE_WEBSITE_DIR unset for API/sync-only deployment. Optional static
serving is enabled only by this variable. website.json is never read or written
by the program. Hidden files, secrets.json and runtime data are not served.
There are no folder dialogs, browser launchers, stdin commands or restart-code
loops. SIGTERM/SIGINT close the HTTP server, allowing up to 10 seconds for active
requests before closing remaining connections. Configure Coolify/Docker stop
timeout to at least 15 seconds. Use Coolify to restart the application. Existing
dev-panel stop/restart response formats remain; either action now closes the
process with exit code 0, so container restart policy controls what happens next.

Data under /data
  json/       Shared sync records and topic files
  files/      Uploaded images and PDFs
  users/      User profiles and photos
  analyser/   Per-user histories and drafts
Back up the persistent volume. Dependencies, StudyBaseData and secrets.json
are ignored by Git. No desktop/systemd integration is required.

Frontend configuration
  BASECOMPUTER_SYNC_URL=https://thestudybase-server.tail8c20e2.ts.net:10000/sync
Rebuild/redeploy the static website after changing its build-time URL. Keep the
frontend origin in this backend's STUDYBASE_ALLOWED_ORIGINS allowlist. No frontend
Nginx proxy is required. Redeploy the backend after changing its runtime values.

Checks: npm test (Node.js 20 or newer). Startup logs include only listening
address, public origin, data-directory path, static-serving mode and health path.

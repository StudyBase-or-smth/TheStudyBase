
StudyBase is a personal school reference tool that helps students organise their study materials in one place. It lets you manage subjects, topics, and units, track upcoming exams, assessments, and assignments on a built-in calendar, and keep an overview of your study progress — all saved locally and synced from a shared database.


Backend-Dev uses the standalone StudyBaseData server (the Server-Dev architecture) for storage and /api routes.

Run npm install, npm run build, then npm start. The server listens on port 8787. Set STUDYBASE_WEBSITE_DIR to this checkout and STUDYBASE_DATA_DIR to your data folder. Copy standalone/secrets.example.json to secrets.json in that data folder and fill in the Firebase Admin credentials and any AI keys. Server credentials stay outside the browser.

Build-time browser configuration and Coolify

Run npm run build before serving this checkout. scripts/build-config.js reads BASECOMPUTER_SYNC_URL and PROGRAM_SYNC_URL from the process environment and writes sync-config.generated.js at the repository root. Each missing or empty value defaults independently to http://127.0.0.1:8787/sync. scripts/build-static.js then assembles the public pages and assets into a clean dist/ directory. Backend code, credentials, dependencies, tests and build scripts are excluded. Both dist/ and the generated file are ignored by Git; sync-config.generated.example.js documents the defaults. These URLs are public browser configuration, not secrets. Rebuild and redeploy after changing them.

For Coolify, select the Nixpacks build strategy and Static site type (older versions label this “Is it a static site?”). Set Base Directory to /, Install Command to npm ci, Build Command to npm run build, Publish Directory to /dist, and the exposed port to 80. No Node start command is needed for static serving. Add BASECOMPUTER_SYNC_URL and PROGRAM_SYNC_URL with your backend's full HTTPS /sync URLs, and enable Available during build for both. Runtime availability is unnecessary. See https://coolify.io/docs/applications/builds/nixpacks/deploy and https://coolify.io/docs/applications/configuration/environment-variables.

Remote pages use BASECOMPUTER_SYNC_URL for sync and derive the /api origin from that URL; authenticated media uses the same backend origin. PROGRAM_SYNC_URL is used for file:// and separate localhost development. Localhost on port 8787 still uses its own origin. No frontend Nginx backend proxy is required. The backend must be reachable over HTTPS from users' browsers, not only by a Coolify internal service name. server.js and standalone/api.js already support cross-origin requests, including Authorization and X-StudyBase-Store headers. If an upstream proxy restricts CORS, allow the frontend origin, GET/POST/OPTIONS, and those headers plus Content-Type. Add the frontend domain to Firebase Authentication's authorized domains when using domain-dependent sign-in flows.

When serving the frontend remotely, set BASECOMPUTER_SYNC_URL to the desired StudyBaseData backend even if it shares the frontend domain. For file:// or a separate localhost development server the default is http://127.0.0.1:8787. Run npm test for routing, static build and integration checks. When adding new root-level public files or asset directories, update the explicit entries in scripts/build-static.js.

The editor supports keeping drafts across multiple topics and saving them together, with a shared subject/class implementation. HSC includes engineering formula practice and a formula dictionary. Suggestions on the hub and topic pages are stored on StudyBaseData. KnowledgeCompetition, notification commands, display-name sign-in, and server-backed Analyser history remain available.

Quality-of-life controls

Search opens global topic and note search (Ctrl/Cmd+K); type / to find actions. Reading settings offers comfortable or wide content and comfortable or compact spacing. The hub shows recently opened topics. Subject navigation remembers the last topic, filters, expanded groups and scroll position.

The topic editor saves recoverable drafts on this device, labels batch saves explicitly, and supports Ctrl/Cmd+S. Cancel asks before discarding changed drafts. Escape still does not exit topic editing. Drafts, preferences, recent topics, navigation and Trash are scoped to the signed-in user on this browser; they are not server backups.

Use Select for multi-topic moves or deletion; subtopics move with their parent. Duplicate copies a topic and its descendants. Deleted topics have Undo and can be restored from Trash for 30 days on this device. Restore stops if it would overwrite newer topic content. Revise opens topic-focused flashcards or subject-filtered HSC practice where that subject is available.

Shared UI behavior lives in qol.js and qol.css; editor-specific behavior lives in subject/topic-qol.js. Tests use jsdom and an isolated fixture, without changing real study records.

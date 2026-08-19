# StudyBase

StudyBase is a personal school-reference web app: a static front end (plain HTML/CSS/JS, no build step) plus a small Express server (`server.js`) that serves the site and adapts the Netlify Functions in `netlify/functions/` to `/api/*` routes.

## Cursor Cloud specific instructions

### Services

There is a single service: the Express dev server.

- Start it with `npm start` (which runs `node server.js`). It serves the static site and the `/api/*` routes on `http://localhost:8888` (override with `PORT`).
- There is **no build step** (static front end) and **no lint or test tooling** configured — `start` is the only script in `package.json`. Do not invent a build/lint/test command.
- The front end is edited directly (HTML/JS/CSS). The Express server does not hot-reload; restart `node server.js` after editing `server.js` or the function files. Static asset changes are picked up on browser refresh (no restart needed).

### Environment / secrets caveats

- The server starts **without any secrets** and logs `WARNING: Firebase env vars not set …`. This is expected in a fresh environment. Static pages, guest browsing, and `/api/desmosKey` all work without secrets.
- The `/api/*` routes backed by Firebase Admin (`registerRole`, `getPendingUsers`, `getAllUsers`, `approveUser`, `rejectUser`, `avatar`, `updateUserName`) require a Firebase service account. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` (see `.env.example`). `grade` additionally needs `GEMINI_API_KEY` / `CLAUDE_API_KEY` (or a per-request key).
- Auth is **client-side Firebase** against the live `studybase-8cfa1` project (public web config is hard-coded in `login.html`/`index.html`). Sign-in/sign-up hit Firebase directly from the browser, independent of the server.
- New sign-ups start with status `pending` and land on `waiting.html`; a user only reaches the hub (`index.html`) once a dev sets the `active` status claim server-side (needs Firebase Admin creds). So the full authenticated create/edit flows (adding subjects, topics, calendar events) require both Firebase Admin secrets **and** a pre-approved active test account.
- **Guest mode** (`Continue as Guest` on `login.html`) is view-only for topics and events; the persisted client-side actions available without an account are theme (dark-mode) preference and flashcard study stats, both stored in `localStorage`.

### Data sync caveat

- App content (subjects' topics/units, events) is loaded from an external shared store via `SYNC_URL` in `sync-config.js`, which points at a private Tailscale host (`basecomputer.tail8c20e2.ts.net:8787`). That host is **not reachable** from the cloud VM, so subject/topic content will be empty here — this is expected and does not indicate a broken setup. The static subject list in `subjects.js` still renders.

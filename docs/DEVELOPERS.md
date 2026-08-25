# StudyBase developer notes

Engineering reference for the current `main` snapshot (`BranchVersion.js`: **Devpanel 6.0.5**, 18-8-26). Describes how the static site, Netlify functions, Firebase claims, and Apps Script sync actually behave — not a product design doc.

Do not paste secrets, Firebase client config, Apps Script URLs, or API keys into this file. Those live in source or Netlify env vars.

---

## Stack

| Layer | What it is |
| --- | --- |
| Front end | Plain HTML / CSS / JS. No bundler, no framework. `netlify.toml` publishes the repo root. |
| Auth | Firebase JS SDK v10.12.0 on each page. Custom claims `{ role, status }` are set only by Netlify functions using the Admin SDK. |
| `/api/*` | Netlify Functions in `netlify/functions/`, rewritten by `netlify.toml`. |
| Content sync | Browser JSONP GET + hidden-form POST to the Apps Script URL in `sync-config.js`. The old `/.netlify/functions/sync` proxy is **disabled** (410). |
| Version badge | `BranchVersion.js` (works on `file://`) with `BranchVersion.json` as a fetch fallback. |

---

## Local setup

The site is static. Opening files from disk is enough for most UI. `/api/*` (sign-up claims, approval, AI marking, Desmos fallback) needs Netlify.

```bash
# from the repo root
npx netlify dev          # serves on http://localhost:8888 (see netlify.toml)
```

Functions also need these Netlify / local env vars (Site settings → Environment variables, or a gitignored `.env` that Netlify CLI can load):

| Variable | Used by | Required for |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | all claim/user functions + `grade.js` | sign-up, approval, AI marking |
| `FIREBASE_CLIENT_EMAIL` | same | same |
| `FIREBASE_PRIVATE_KEY` | same | same (`\n` in the PEM is unescaped in code) |
| `GEMINI_API_KEY` | `grade.js` | Analyser / HSC AI marking when the user did not paste a key |
| `CLAUDE_API_KEY` | `grade.js` | same, Claude provider |
| `DESMOS_API_KEY` | `desmosKey.js` | graphs **only if** `sync-config.js` leaves `DESMOS_API_KEY` empty |

`netlify/functions/package.json` depends on `firebase-admin` and `nodemailer`. Install that folder once if you run functions outside `netlify dev`:

```bash
cd netlify/functions && npm install
```

There is no lint, test, or build script on this branch. `grade.js` at the **repo root** is a stub and is not deployed — the live handler is `netlify/functions/grade.js`.

### `file://` vs `netlify dev`

| Works from `file://` | Needs a real origin + functions |
| --- | --- |
| Hub / subject / class UI, dark mode, localStorage | Sign-up (`/api/registerRole`) |
| Branch badge (`BranchVersion.js`) | Dev Panel user APIs |
| Desmos, if `DESMOS_API_KEY` is set in `sync-config.js` | `/api/grade` (server keys) |
| Guest mode | Desmos fallback `/api/desmosKey` |

Guests can browse without Firebase. Signed-in flows talk to the live Firebase project from the client config embedded in each page.

---

## Architecture

```
login.html ──sign-up──► POST /api/registerRole ──► claims { role, status:'pending' }
     │                                                       │
     │ sign-in / guest                                       ▼
     ▼                                              waiting.html (pending / rejected)
index.html (hub) ◄── status === 'active' only ── check again / guest (signs out first)
     │
     ├─ subject/subject.html#<id>     subjects.js catalogue
     ├─ subject/class.html#<id>       classesData (teacher/dev)
     ├─ subject/flashcards.html#<id>
     ├─ analyser.html                 POST /api/grade
     ├─ HSC/HSC.html                  HSC/storage/*.json
     ├─ profile.html
     └─ Devpanel.html (role==='dev')  approve / reject / rename
```

Content keys (topics, units, calendar, suggestions, teacher notes) are written to `localStorage` and pushed to Apps Script. Images inlined as `data:image` are stripped on push (see [Sync](#sync-and-local-edits)).

---

## Access model and approval runbook

Firebase custom claims:

| Claim | Values | Who sets it |
| --- | --- | --- |
| `role` | `student` \| `teacher` \| `dev` | Sign-up may request student/teacher only. Dev is assigned from the Dev Panel. |
| `status` | `pending` \| `active` \| `rejected` | Sign-up always sets `pending`. Only an active **dev** can activate or reject. |

There is **no email-domain auto-approval**. A school-domain student still waits in the queue.

### What each page does with claims

Pages always call `user.getIdTokenResult(true)` so a freshly written claim is visible. Empty / missing `status` is treated as **not active**.

| Page | `status !== 'active'` | Extra |
| --- | --- | --- |
| `login.html` | Redirect to `waiting.html` | Sign-up sets `suppressAutoRedirect` before `createUser` so a claim-less new user never lands on the hub. |
| `index.html` | Redirect to `waiting.html` | Classes grid + `window.isTeacher` only for `teacher` or `dev`. Dev Panel button only for active `dev`. |
| `waiting.html` | Stay; show pending or rejected | **Continue as Guest** signs out first, then sets `sessionStorage.studybase_guest`. |
| Subject, class, flashcards, HSC, analyser, profile | Guest-mode UI (read-only / locked) | `rejected` on subject/class/HSC/flashcards also bounces to waiting. |
| `Devpanel.html` | Redirect to hub | Requires `role==='dev'` **and** `status==='active'`. |

### Approve a new account

1. Sign in as an active **dev**.
2. Open the hub → Dev Panel (`Devpanel.html`).
3. Queue tab lists `GET /api/getPendingUsers`.
4. Approve as student / teacher / dev → `POST /api/approveUser` with `{ uid, role }`. That sets `status: 'active'` and replaces claims (it does not keep `requestedAt`).
5. Tell the user to tap **Check again** on `waiting.html` (force-refresh). A leftover cached token is why “I was approved but I’m still waiting” happens.

Deny keeps the Auth user (`mode: 'deny'` → `status: 'rejected'`). Delete removes the Firebase account (`mode: 'delete'`).

Bootstrap a first / extra **dev** from the Dev Panel tools tab (same `approveUser` path). Sign-up cannot request `dev`.

### Guest vs pending

`sessionStorage.studybase_guest === '1'` is a **session** flag. A still-signed-in pending user **cannot** use guest mode: hub/auth callbacks prefer the Firebase user and send them back to waiting. Guest continue **must** `signOut` first (`waiting.html` already does this).

---

## `/api` interfaces

All JSON APIs send `Content-Type: application/json`. Auth is `Authorization: Bearer <Firebase ID token>`. Tokens are verified with `checkRevoked: true`.

Friendly paths below are the `netlify.toml` redirects. Function file names must match the rewrite target (case-sensitive on Netlify).

| Path | Method | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| `/api/registerRole` | POST | Caller uid **must** match `body.uid` | `{ uid, requestedRole }` where role is `student` or `teacher` | Sets `{ role, status:'pending', requestedAt }`. Refuses if the account is already `active`. Email is taken from the Auth record, not the body. |
| `/api/getPendingUsers` | GET or POST | Active **dev** | — | `{ pending: [{ uid, email, displayName, requestedRole, requestedAt }] }` oldest first |
| `/api/getAllUsers` | GET or POST | Active **dev** | — | `{ users: [...] }` newest `createdAt` first. Missing claims show as `role/status: 'none'`. |
| `/api/approveUser` | POST | Active **dev** | `{ uid, role }` with role `student` \| `teacher` \| `dev` | `{ status:'active', role, uid }` |
| `/api/rejectUser` | POST | Active **dev** | `{ uid, mode: 'deny' \| 'delete' }` | deny → `{ status:'rejected', uid }`; delete → `{ deleted:true, uid }` |
| `/api/updateUserName` | POST | Active **dev** | `{ uid, displayName }` 1–100 chars after trim | `{ uid, displayName }` |
| `/api/grade` | POST | Any signed-in user with `status==='active'` | `{ provider: 'claude' \| 'gemini', prompt, userKey? }` | `{ text }`. Uses `userKey` if non-empty, else server env. Claude model `claude-sonnet-5`; Gemini `gemini-2.5-flash`. |
| `/api/desmosKey` | GET | **None** | — | `{ apiKey }` from env, or `""`. Intentionally public: Desmos embeds the key in a script URL. |
| `/.netlify/functions/sync` | any | — | — | **410 Gone**. Do not re-enable as an open proxy. |

### Constraints that bite

- **`/api/updateUserName` rewrite** targets `/.netlify/functions/Updateusername` because the file is `Updateusername.js`. Renaming the file without changing `netlify.toml` 404s the Dev Panel rename action.
- **`/api/grade` 403** `"Account must be approved before using AI marking."` if claims.status is not `active`. Analyser and HSC also short-circuit guests client-side.
- If `/api/grade` is missing (static host, `file://`), Analyser falls back to a **browser-direct** Gemini/Claude call that **requires** a pasted user key. HSC AI-check has no equivalent fallback.
- `registerRole` fire-and-forgets a pending-approval notice to the Apps Script store under key `_pending_approval_request_`. A failed notify does not fail sign-up.

---

## Sync and local edits

`sync-config.js` is loaded before `mainapp.js` / `subjectapp.js` / `classapp.js`. Pull is JSONP (`?key=&callback=`), 8s timeout. Push is a hidden POST form into a throwaway iframe (Apps Script CORS). Hub, subject, and class pages pull about every 60 seconds.

| Key pattern | Who writes | Notes |
| --- | --- | --- |
| `<id>_topics` / `<id>_units` | Subject or class page for that catalogue id | Catalogue in `subjects.js` |
| `tnotes_<id>` | Teachers/devs on that subject or class | `TN_KEY()` follows the page (and, on the subject page, the linked class being viewed) |
| `studybase_events` | Hub calendar | Pull **unions** local-only events by `id` |
| `studybase_suggestions` | Hub suggestions modal | Fields are HTML-escaped before render |

Push payload for topics is passed through `sanitizeForSync`: any `data:image` in a string field is replaced with the placeholder `[image — only visible on device where it was saved]`. Payloads over **45 000** characters (`CELL_LIMIT`) skip the push and show a warn status — Apps Script cells are size-capped.

### Unsynced topics survive a pull

`mergeRemoteTopics` (hub) and `mergeRemoteTopicList` (subject/class):

1. Start from the remote array.
2. If a remote string still has the image placeholder and local has the real image, keep local.
3. **Append local topics whose `id` is not on the remote list.**

That third step is why a topic created on this device, then not yet accepted by Apps Script, is not wiped by the next 60s pull. Units are **not** merged that way: a successful units pull overwrites local.

Failed pulls leave the existing `localStorage` cache in place.

---

## Class → subject aggregation

`classesData` entries have a `subjectId` pointing at a `subjectsData` id. Storage stays on the class keys (`2026-12A-mth_topics`, …). The matching subject page:

- Builds `LINKED_CLASSES` from `subjectId === SUBJECT.id`.
- Shows a **Subject / Classes** sidebar tab when that list is non-empty.
- Pulls those class keys on sync so the hub/subject counts work even if this browser never opened `class.html`.
- Renders class topics **read-only** for students and teachers. Edit/delete from the subject page is allowed only when `window.userRole === 'dev'`.
- Everyone else is told to edit from `subject/class.html#<classId>`.

Hub **Classes** grid is hidden unless `window.isTeacher` (active teacher or dev).

---

## Desmos (math layout)

Used on subject and class pages for `layout: 'math'` topics. API version **v1.12**.

Load order:

1. `DESMOS_API_KEY` from `sync-config.js` if non-empty → inject `calculator.js?apiKey=…` (works on `file://`).
2. Else `GET /api/desmosKey`.
3. Else show the in-page “graphing isn’t configured” notice.

Two calculator instances can exist: editor modal and detail view. Both must be `.destroy()`ed before their DOM node is removed (WebGL leak). Theme colors are pushed explicitly on dark-mode toggle; Desmos does not inherit CSS.

Saved graph state is `topic.desmosState` (Desmos `getState()` JSON).

---

## Topic HTML sanitization

Rich fields are stored as HTML. Before view, `sanitizeRich()` (`subjectapp.js` / `classapp.js`):

- Strips `script`, `style`, `iframe`, `object`, `embed`, `link`, `form`, `meta`, `base`.
- Drops `on*` attributes and `srcdoc`.
- Drops `javascript:`, `vbscript:`, and `data:text/html` from URL-bearing attributes.
- Keeps `<img>` only when `src` is `data:`, `https://drive.google.com/`, or `https://lh3.googleusercontent.com/`.

Table cells go through the same sanitizer on view. Hub suggestion ids/tags are escaped and clicked via `data-*` attributes, not inline `onclick`.

Do not reintroduce unescaped `innerHTML` of sync data.

---

## HSC practice papers

`HSC/HSC.html` loads `HSC/storage/manifest.json`, then a quiz JSON next to it. The sidebar can switch papers; the first load picks a random manifest entry.

Manifest shape: `[{ "file": "MathS-S1.json", "name": "Section 1" }, …]`. A bare filename string is also accepted.

Question flags (see comments in `HSC.html`):

| Flag | UI | Marking |
| --- | --- | --- |
| `isMultipleChoice` + not `isCheckbox` | radios | 1 mark, exact option |
| `isMultipleChoice` + `isCheckbox` | checkboxes | 1 mark, exact set |
| `math: true` | one textbox per `answers[]` | 1 mark each, numeric-aware |
| `isAICheck` | textarea | `q.marks`, Gemini via `/api/grade` (active account only) |

Optional `image` is a filename in `HSC/storage/`. Adding a paper: drop JSON (+ images) in that folder and append a manifest row.

---

## Catalogue (`subjects.js`)

Subjects and classes are data, not CMS records. To add one:

1. Append an object with unique `id`, `name`, `emoji`, `colour`, `storageKey`, `unitsKey`.
2. Classes also need `subjectId`, `teacher`, and `class`.
3. New keys start empty until someone edits on that page (or sync already has data under that key).

Pinned-topic key defaults to `<id>_pinned_topics` and is **local only**.

---

## Common pitfalls

- **Hub access after sign-up.** Every account is pending. Opening `index.html` while signed in without `status:'active'` redirects to waiting. Use guest (after sign-out) or wait for approval.
- **Cached ID tokens.** Any new claim check must pass `getIdTokenResult(true)` / `getIdToken(true)`. Omitting `true` is how a pending user used to look active.
- **Guest flag vs signed-in user.** Setting `studybase_guest` without signing out does nothing useful on the hub.
- **Functions without Admin env.** `registerRole` 500s; the client then still sends the user to waiting, but **claims were never written**, so Dev Panel will not list them. Check function logs and Firebase Auth users.
- **`Updateusername` casing.** See the `/api/updateUserName` rewrite note above.
- **Root `grade.js`.** Editing it has no effect on Netlify.
- **Open sync proxy.** `netlify/functions/sync.js` must stay 410. Clients talk to Apps Script directly.
- **45k cell limit.** Large PDFs / many images in a topic will warn and stay local-only (plus image placeholder on any successful smaller push).
- **Desmos on a static host.** Keep the key in `sync-config.js` or graphs need `/api/desmosKey`.
- **No Content-Security-Policy.** `netlify.toml` documents why: the UI still uses inline handlers and `<script>` blocks. XSS defense is sanitization + escaped renders, not CSP.

---

## Repository map

| Path | Role |
| --- | --- |
| `index.html`, `mainapp.js` | Hub, calendar, subject/class cards, hub-wide sync |
| `login.html`, `waiting.html` | Auth gates |
| `profile.html` | Account + local study stats |
| `analyser.html` | AI assignment marker → `/api/grade` |
| `Devpanel.html` | Approval queue and user admin |
| `subject/subject.html` + `subjectapp.js` | Subject workspace, class aggregation, Desmos, sanitization |
| `subject/class.html` + `classapp.js` | Per-class workspace (same editor, own keys) |
| `subject/flashcards.html` | Deck from topics + `flashcardQA` |
| `HSC/` | Quiz UI and banks |
| `subjects.js` | Subject and class catalogue |
| `sync-config.js` | `SYNC_URL`, `DESMOS_API_KEY` |
| `mainstyle.css` | Shared chrome and tokens |
| `BranchVersion.js` / `.json` | Header badge |
| `netlify.toml`, `netlify/functions/` | HTTPS API |
| `docs/DEVELOPERS.md` | This file |

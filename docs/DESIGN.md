# StudyBase Design Document

This document describes the **core design and structure** of the StudyBase website as it exists on the `Backend-Dev` branch.

It is meant for anyone who needs to understand how the site is organised — pages, roles, content, visual language, and how data moves — without reading every HTML file. Implementation details that belong in code comments are omitted. Secrets, API keys, and private host URLs are never recorded here.

| Field | Value |
| --- | --- |
| Branch | Backend (`Backend-Dev`) |
| Version | 7.2.0 |
| Badge date | 23-8-26 |
| Source of truth | Live files on this branch (`BranchVersion.js` for the badge) |
| Last reviewed | 24 August 2026 |

---

## 1. What StudyBase is

StudyBase is a **school reference hub**. Students and teachers keep subjects, topics, and units in one place, track exams and assignments on a shared calendar, and use a small set of study tools (flashcards, AI marking, HSC practice).

The product is a **static multi-page site** (HTML, CSS, and vanilla JavaScript — no bundler). Identity comes from Firebase Auth. Shared content lives in a key/value store called **StudyBaseData**. The public Netlify deploy still serves the same pages and a subset of `/api` functions.

Tagline on the hub: **School Reference**. Tagline on login: **Your Study Hub**.

---

## 2. Design principles

1. **One hub, then drill in.** The home page is the map: subjects, calendar, recent work, tools. Subject and class pages are where content lives.
2. **Shared chrome, local accent.** Signed-in product pages share a left accent bar, wordmark or breadcrumb, and a right cluster of actions (sync where relevant, notification bell, profile). The accent is amber on the hub and the subject’s own colour on subject, class, and flashcard pages.
3. **Approved accounts for writes.** Guests can browse. New sign-ups wait for a developer to approve them. Only `status === active` accounts can edit topics, calendar events, analyser work, or receive notifications.
4. **Fail closed.** Missing or empty approval status is treated as pending. Token refresh failures send the user to the waiting page (hub) or guest-mode (inner pages) rather than granting edit access.
5. **Content is structured, not free-form only.** A topic has a layout (basic, overview, math, text, PDF, table), optional units, subtopics, related terms, and flashcard pairs. Empty fields are hidden when viewing.
6. **Teacher content is linked, not copied.** A class has its own topic store. The matching subject page can *display* that class’s topics on a Classes tab; edits happen on the class page (devs can override).
7. **Warm paper, not generic SaaS.** Light theme is cream and stone. Titles use a serif. Dark theme is a matching warm charcoal, not pure black.

---

## 3. Visual language

### Type

Self-hosted variable fonts via `fonts.css` (so ad-blockers cannot strip Google Fonts):

| Role | Face | Used for |
| --- | --- | --- |
| Sans | Inter | UI, body, buttons, forms |
| Serif | Lora | Wordmark, stat titles, profile name |
| Mono | JetBrains Mono | Formulas and code-like text |

Base size is 14px. The hub content column is **1060px** max, padded 24px. Flashcards still load the same families from Google Fonts rather than `fonts.css`.

### Colour tokens (`mainstyle.css`)

Light (`:root`):

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f5f2ed` | Page wash |
| `--card` | `#ffffff` | Header, cards, dropdowns |
| `--card2` | `#faf8f5` | Inputs, pills, secondary surfaces |
| `--border` / `--border2` | `#e2ddd7` / `#d4cec7` | Hairlines |
| `--text` | `#1c1917` | Primary type |
| `--muted` / `--muted2` | `#78716c` / `#a8a29e` | Secondary type |
| `--accent` | `#f59e0b` | Hub amber (overridden per subject) |
| `--shadow` | soft dual shadow | Cards |

Dark (`body.dark`) inverts to warm charcoal (`#141210` / `#1e1c19`) with light type. Preference is stored locally as `studybase_dark`.

Subject pages set `--accent` from the subject’s catalogue colour. Dev Panel uses purple `#7c3aed`. The Analyser uses its own always-dark amber palette (`#1a1814` / `#222018`) and is not bound to hub tokens.

### Recurring UI patterns

- **Accent bar** — 6px colour strip on the left of the header. On the hub, a developer’s bar grows to 36px on hover and opens the Dev Panel. On inner pages the same strip is a back control (`.is-back`).
- **Ghost buttons** — bordered, 5px radius, `data-tip` hover labels. Used for sync, suggestions, notifications, and profile on the hub; inner pages reuse the same control for the subset they need.
- **Cards** — white/dark surface, 8px radius, 1px border, light shadow. Stat cards, subject cards, calendar, sidebar sections.
- **Collapsible side sections** — chevron titles; open/closed state remembered locally.
- **Guest ring** — 3px inset grey border around the viewport plus a “Viewing as guest” nudge card.
- **Toasts** — short confirmations in `#toast-container`.

---

## 4. Site map

```
login.html                Sign in / sign up / continue as guest
        │
        ├── (pending / rejected) → waiting.html
        └── (active or guest)    → index.html   Hub
                                        │
                                        ├── subject/subject.html#<id>     Subject
                                        │         └── subject/flashcards.html#<id>
                                        ├── subject/class.html#<id>       Class (teacher / dev)
                                        ├── profile.html
                                        ├── analyser.html                 AI marker
                                        ├── HSC/HSC.html                  Quiz tool
                                        └── Devpanel.html                 Dev only
```

Deep links on a subject page:

- `subject/subject.html#mth` — open Maths
- `?topic=<id>#mth` — open a specific topic (used by Recently Added)
- `?unit=<id>#mth` — pre-filter the unit sidebar (used by Units Overview)

---

## 5. Access model

### Roles and status

Firebase custom claims:

| Claim | Values | Meaning |
| --- | --- | --- |
| `role` | `student`, `teacher`, `dev` | Capability set after approval |
| `status` | `pending`, `active`, `rejected` | Account lifecycle |

Sign-up offers **student** or **teacher** only. Dev accounts are created by an existing developer (Dev Panel bootstrap).

| Actor | What they can do |
| --- | --- |
| **Guest** | Browse hub, subjects, flashcards, HSC. No edits, no calendar writes, no notifications, no analyser marking. |
| **Pending / rejected** | Login and hub send them to `waiting.html`. Inner pages (subject, class, flashcards, HSC, profile) typically stay open in guest-mode so they can still look around. Rejected users are bounced from the hub and from subject/class/HSC to waiting. |
| **Active student** | Edit personal subject topics, calendar, profile, suggestions, analyser, HSC AI marking. |
| **Active teacher** | Student capabilities plus the hub Classes grid, class pages, and teacher comments on topic blocks. |
| **Active dev** | Teacher capabilities plus Dev Panel, notification console, and edit rights on linked class content from a subject page. |

### Entry flows

1. **Sign in** accepts a display name or email. Names resolve through `/api/resolveSignIn`. Active users go to the hub; others go to waiting.
2. **Sign up** creates a Firebase user, registers the requested role as **pending**, then opens waiting.
3. **Continue as Guest** sets `sessionStorage.studybase_guest = 1` and opens the hub in read-only mode.
4. Every product page **force-refreshes** the ID token so a newly approved (or rejected) claim is visible immediately.

---

## 6. Shared chrome

Most product pages share this header, implemented in HTML plus `mainstyle.css`, `profile-store.js`, and `notifications.js`.

```
┌─────────────────────────────────────────────────────────────┐
│ ▌  Wordmark / breadcrumb     branch badge     date  ⟳  📝  🔔  👤 │
└─────────────────────────────────────────────────────────────┘
```

| Control | Behaviour |
| --- | --- |
| Accent bar | Hub: decorative (dev → Dev Panel). Inner pages: back to hub. |
| Branch badge | `Backend · v7.2.0` from `BranchVersion.js` (JSON can lag). |
| Sync | Manual pull; countdown to the next automatic sync (~60s on hub and subject/class pages). Hub only, plus subject/class. |
| Suggestions | Modal for bugs, requests, and ideas. Shared list, filterable Open / Closed / All. Hub only. |
| Bell | Site notifications and polls. Always visible for signed-in active users (empty state when nothing is unread). Badge shows unread count (`9+` max). Present on hub, subject, class, flashcards, profile, analyser, HSC, and Dev Panel. |
| Profile | Click → profile page. Hover → name, role, email, dark-mode toggle, sign out. |

The Analyser uses its own dark header (provider toggle, optional personal API key) but still mounts the bell and profile.

---

## 7. Pages

### Hub — `index.html`

The dashboard. Two columns: a wide left rail and a 300px sidebar.

**Left**

- **Stats row** — four cards: total topics, total units, enabled subjects, last updated.
- **Subjects grid** — two-column cards (emoji, name, topic/unit counts, colour rule). Filtered by the user’s `enabledSubjects`. Opens `subject/subject.html#<id>`.
- **Classes grid** — hidden unless the user is a teacher or dev. Filtered by `enabledClasses`. Opens `subject/class.html#<id>`.
- **Calendar** — month grid, upcoming list, add/edit modal. Event types: exam, assessment, assignment, reminder. Optional subject and hover tooltip.

**Right**

- **Recently Added** — last seven topics, coloured by subject.
- **Tools** — Analyser, HSC Quiz.
- **Units Overview** — units across subjects, linking into a pre-filtered subject page.

Guests see the same layout with add/edit controls hidden.

### Subject — `subject/subject.html`

Full-height workspace: ~272px sidebar + detail pane. The sidebar can collapse.

- Sidebar: search, unit filter, **Subject / Classes** tabs (tabs appear when linked classes exist), topic list (pin, expand subtopics).
- Detail: welcome state, or a topic rendered by layout (definition, key points, formula, Desmos, PDF, table, and so on). Empty fields are not shown.
- Teachers and devs get a **teacher notes** column beside each content block.
- Header actions: sync, flashcards, new topic (hidden for guests).
- New/Edit modal: layout cycler, rich fields, “Fill gaps” AI assist, tags, subtopics, flashcard Q&A.

Linked classes appear on the Classes tab. Those topics are read-only for students and teachers; developers can edit them in place.

### Class — `subject/class.html`

Same shell as the subject page, without the Subject/Classes tabs. Content is stored under the class’s own keys. Intended for teachers running a specific cohort (for example `2026-12A-mth`).

### Flashcards — `subject/flashcards.html`

Flip-card study for one subject. Deck = each topic’s term/notes card plus any custom `flashcardQA` pairs. Unit filter pills, shuffle, restart. Typed answers on Q&A cards are scored correct / close / incorrect and stored on the user’s profile.

### Profile — `profile.html`

- Hero: avatar, name, email, member since, role badge (including a pending state).
- Edit: photo, which subjects (and, for teachers/devs, classes) appear on the hub.
- Study stats: topics added, subjects, most-active subject, flashcard totals and accuracy.
- Flashcard breakdown with a reset control.
- Sign out (confirm dialog).

### Analyser — `analyser.html`

Separate always-dark tool for **AI assignment marking**.

1. Paste or upload an assignment (text, Word, PDF).
2. Paste or upload criteria (same formats; PDF has a page picker).
3. Choose Gemini or Claude (optional personal API key).
4. Receive a score, structured criteria table, improvements, and a next-draft list.

Tasks keep a history of up to six marks, with compare/export. Drafts auto-save. History and drafts sync for signed-in active users. Guests and pending accounts see a locked banner.

### HSC Quiz — `HSC/HSC.html`

Practice quizzes loaded from `HSC/storage/` via a manifest. Same subject-page shell (sidebar + detail). Sidebar picks a paper and lists questions with mark deltas.

Current papers: Maths Section 1 and 2, Engineering Section 1 and 2, MathSTD Practice, Electro1 Practice.

Question types: single-choice, multi-select, math fills (graded locally), and open responses that can be sent to `/api/grade` when the user is active. Summary screen shows marks and a path to the next section.

### Login / waiting

Login is an `auth-page` card: Sign In / Sign Up tabs, dark toggle, guest link. The sign-in field is labelled **Name or email**. Waiting has three states — checking, pending, rejected — with “Check again” and “Continue as Guest” (guest requires a real Firebase sign-out first, otherwise the hub would bounce a still-pending session straight back).

### Dev Panel — `Devpanel.html`

Purple, compact, developer-only. Non-devs never see the panel.

- Account table: search, status segments (All / Pending / Active / Rejected), approve / deny / deactivate / delete / rename / change role.
- Site stats drawer (topic/unit counts from cached subject data).
- Console for notification commands. Tab completion walks the command, then the next argument.
  - `notify whomever id "text"`
  - `notify-ask whomever id "text" "1" "2"`
  - `notify-remove id` or `notify-remove id whomever`
- Bootstrap-role tool for assigning a role to a UID (the only supported way to create a dev).

---

## 8. Content model

Catalogue lives in `subjects.js`. Adding a subject or class is a catalogue change plus new storage keys.

### Subjects (current)

| ID | Name | Colour |
| --- | --- | --- |
| `eng2` | Engineering | `#1a588e` |
| `eco` | Economics | `#0c8247` |
| `eng` | English | `#9f1239` |
| `mth` | Maths | `rgb(79, 142, 205)` |
| `tmb` | Timber | `#92400e` |
| `mlt` | Multimedia | `#ce1ff1` |
| `phy` | Physics | `#0dbb07` |
| `test` | test | `#0dbb07` |

Each subject has `storageKey` (`<id>_topics`) and `unitsKey` (`<id>_units`).

### Classes (current)

| ID | Subject | Teacher | Class |
| --- | --- | --- | --- |
| `2026-12A-mth` | Maths | H.Aldous | A |
| `2026-12A-eng2` | Engineering | D.Brennan | A |

A class also has its own topic and unit keys. `subjectId` is the only link back to the parent subject page.

### Units

`{ id, name }` list per subject or class. Used as sidebar filters and on the hub Units Overview.

### Topics

A topic is the atomic study note.

**Always present:** `id`, `name`, `layout`, `unit`, `parentId` (subtopics), `relatedTerms`, `flashcardQA`, `addedBy`, `createdAt`, `updatedAt`, `notes`.

**Layouts and their fields**

| Layout | Main content |
| --- | --- |
| `basic` | Definition, key points, formula, materials, process, safety, exam tip |
| `overview` | Rich overview text, points, subtopics |
| `math` | Formula + saved Desmos graph |
| `text` | Main rich text + key points |
| `pdf` | Uploaded PDF or image |
| `table` | Columns and rows |

Teacher notes hang off named blocks (`definition`, `formula`, …) as `{ id, text, author, uid, date }`.

### Calendar, suggestions, notifications

- Events: title, date, optional time, type, optional subject, tooltip.
- Suggestions: text, tag (`bug` / `request` / `idea`), open or closed.
- Notifications: see [§11](#11-notifications).

---

## 9. Data and sync

The client talks to a single switchboard, `sync-config.js`. On Backend-Dev, **Apps Script is off** and both content sync and `/api/*` go to StudyBaseData. Netlify still hosts a parallel `/api` set for HTTPS deploys; `/api/sync` on Netlify is disabled.

### What is shared vs local

| Synced (StudyBaseData) | Stays in the browser |
| --- | --- |
| Topics and units | Dark mode, collapsed sections, sidebar width |
| Calendar events | Pinned topics |
| Suggestions | Guest session flag |
| Notifications | User-supplied Analyser API keys |
| Per-user profile (visibility, avatar, flashcard stats) | Display-name / email cache |
| Analyser history and drafts | — |
| Uploaded media (topic files, avatars) | — |

### Sync behaviour

- Pull is `GET /sync?key=…`. Push is `POST /sync` with a key and JSON body.
- Active Firebase ID tokens are required to read or write the store.
- The hub and subject/class pages pull about every 60 seconds. Notifications pull about every 45 seconds and on tab focus.
- If a topic push fails, the client keeps the local edit (`unsynced`) and retries after the next pull so a refresh does not wipe work.
- Profiles, analyser data, and avatars are keyed by UID (`_profile_<uid>`, `_analyser_<uid>`, …).

StudyBaseData stores JSON under a data directory (`json/`, `users/`, `analyser/`, `files/`) and can also serve the static website from a configured folder.

---

## 10. API surface (purpose only)

Friendly `/api` paths, implemented either by Netlify functions or by `standalone/api.js` on StudyBaseData:

| Path | Who | Purpose |
| --- | --- | --- |
| `/api/registerRole` | New user (self) | Set pending role after sign-up |
| `/api/resolveSignIn` | Login page | Display name → email (standalone only) |
| `/api/getPendingUsers` | Dev | Approval queue |
| `/api/getAllUsers` | Dev | Full directory |
| `/api/approveUser` | Dev | Activate with a role |
| `/api/rejectUser` | Dev | Reject, deactivate, or delete |
| `/api/updateUserName` | Dev | Rename a display name |
| `/api/grade` | Active user | Proxy AI marking |
| `/api/desmosKey` | Client | Desmos calculator key |
| `/api/avatar` | Client | Proxy remote profile photos |

---

## 11. Notifications

Site-wide bell on the hub, subject, class, flashcards, profile, analyser, HSC, and Dev Panel. Store key: `studybase_notifications`.

| Kind | Behaviour |
| --- | --- |
| `text` | Broadcast. Marked read when the recipient opens the bell. |
| `ask` | Poll, 2–8 options. “Read” means answered. Finished asks collapse to a dropdown showing the chosen option. Devs receive an automatic results summary. |

Targets from the Dev Panel: everyone, a role, or a single user (UID, email, or display name). Each notification has a required id. `notify-remove` can drop the whole item or remove it for one person. Fully consumed notifications are pruned from the store.

Guests and pending users do not receive the live feed.

---

## 12. Repository map

| Path | Role |
| --- | --- |
| `index.html`, `mainapp.js` | Hub |
| `login.html`, `waiting.html` | Auth gates |
| `profile.html`, `profile-store.js` | Profile + header identity |
| `analyser.html` | AI marker |
| `Devpanel.html` | Developer console |
| `subject/*` | Subject, class, flashcards |
| `HSC/` | Quiz UI and question banks |
| `subjects.js` | Subject and class catalogue |
| `sync-config.js` | Sync, schema helpers, API origin |
| `notifications.js` | Bell and notify commands |
| `mainstyle.css`, `fonts.css` | Design system |
| `BranchVersion.js` / `.json` | Version badge |
| `server.js`, `standalone/` | StudyBaseData + local `/api` |
| `netlify/` | HTTPS function deploy |
| `vendor/` | PDF.js, Mammoth |
| `docs/DESIGN.md` | This document |

---

## 13. How this document is maintained

A daily automation reviews `Backend-Dev` and updates this file when the **user-visible design or structure** changes — new pages, role rules, layouts, catalogue entries, chrome, or sync behaviour.

When editing this file:

- Describe what a person using or extending the site needs to know.
- Keep the snapshot table in sync with `BranchVersion.js`.
- Do not paste secrets, tokens, private URLs, or Firebase client config.
- Prefer updating an existing section over appending a changelog.
- Stay on the public product surface. Do not document unofficial pages that are not part of the site map above.

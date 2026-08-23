StudyBaseData — local store (Apps Script replacement)

This folder lives on the machine running the sync program, not in the git repo.

  start.bat   Windows: double-click to run (asks for the website folder once)
  start.sh    Linux: ./start.sh (same, when run in a terminal)
  server.js   The program the website talks to; also serves that website folder
  website.json  Saved website folder (created when you pick one)
  /_status    Server page: choose or change the website folder
  json/       Shared JSON records
              *_topics/  one file per topic + _meta.json
              *_units.json  { v: 1, items: [{ id, name }] }
  files/      Uploaded topic images and PDFs
  users/      One folder per signed-in user (uid)
              profile.json  subjects, classes, photo URL, stats
              photo.jpg     profile picture (any image ext)
  analyser/   Analyser history and drafts, one folder per uid
              history.json  sync key _analyser_<uid>
              draft.json    sync key _analyser_draft_<uid>
  api.js      Standalone /api/* (dev panel, grade, registerRole, desmos, avatar)
  secrets.json  Firebase Admin + LLM keys (not in git; see secrets.example.json)

/api routes (same paths as Netlify):
  GET  /api/desmosKey
  GET  /api/avatar?u=
  POST /api/grade
  POST /api/registerRole
  GET  /api/getAllUsers
  GET  /api/getPendingUsers
  POST /api/approveUser
  POST /api/rejectUser
  POST /api/updateUserName

Pick the folder that contains the StudyBase website (index.html). After that,
http://127.0.0.1:8787 serves the site and the sync API together. Change it
later at http://127.0.0.1:8787/_status or set STUDYBASE_WEBSITE_DIR.

On BaseComputer the systemd user service studybase-sync keeps it running.
This laptop (localhost / file://) talks to it over Tailscale at
http://basecomputer.tail8c20e2.ts.net:8787

Apps Script is temporarily disabled. The site (localhost / file://) talks
to this program. The live HTTPS Netlify site cannot call this HTTP URL
until there is a public HTTPS tunnel. To restore Apps Script, set
USE_APPS_SCRIPT = true in TheStudyBase/sync-config.js.

StudyBaseData — local store (Apps Script replacement)

This folder lives on the machine running the sync program, not in the git repo.

  start.bat   Windows: double-click to run
  start.sh    Linux: ./start.sh
  server.js   The program the website talks to
  json/       Shared JSON records
              *_topics/  one file per topic + _meta.json
              *_units.json  { v: 1, items: [{ id, name }] }
  files/      Uploaded topic images and PDFs
  users/      One folder per signed-in user (uid)
              profile.json  subjects, classes, photo URL, stats
              photo.jpg     profile picture (any image ext)
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

On BaseComputer the systemd user service studybase-sync keeps it running.
This laptop (localhost / file://) talks to it over Tailscale at
http://basecomputer.tail8c20e2.ts.net:8787

Apps Script is temporarily disabled. The site (localhost / file://) talks
to this program. The live HTTPS Netlify site cannot call this HTTP URL
until there is a public HTTPS tunnel. To restore Apps Script, set
USE_APPS_SCRIPT = true in TheStudyBase/sync-config.js.

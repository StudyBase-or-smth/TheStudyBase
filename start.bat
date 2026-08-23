@echo off
title StudyBase local sync
cd /d "%~dp0"
set STUDYBASE_PICK_WEBSITE=1
set STUDYBASE_OPEN_BROWSER=1
echo Starting StudyBase local sync on http://127.0.0.1:8787
echo Data folder: %~dp0
echo Keep this window open while you use the site locally.
echo If no website folder is saved yet, a folder window will open.
echo.
node server.js
if errorlevel 1 (
  echo.
  echo Server stopped with an error. Is Node.js installed?
  pause
)

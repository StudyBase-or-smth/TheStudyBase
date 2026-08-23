@echo off
title StudyBase local sync
cd /d "%~dp0"
echo Starting StudyBase local sync on http://127.0.0.1:8787
echo Data folder: %~dp0
echo Keep this window open while you use the site locally.
echo.
node server.js
if errorlevel 1 (
  echo.
  echo Server stopped with an error. Is Node.js installed?
  pause
)

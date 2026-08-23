#!/bin/bash
# Start StudyBase sync if needed, then open the status page.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user start studybase-sync.service
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if /usr/bin/curl -sf http://127.0.0.1:8787/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
/usr/bin/xdg-open http://127.0.0.1:8787 >/dev/null 2>&1 &
exit 0

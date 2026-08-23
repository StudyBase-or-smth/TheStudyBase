#!/bin/bash
# StudyBase local sync — run from this folder (Linux).
cd "$(dirname "$0")"
export PORT="${PORT:-8787}"
if [ -z "${STUDYBASE_PUBLIC_URL:-}" ]; then
  export STUDYBASE_PUBLIC_URL="http://basecomputer.tail8c20e2.ts.net:8787"
fi
NODE=""
if [ -x "$HOME/.local/node/bin/node" ]; then
  NODE="$HOME/.local/node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
fi
if [ -z "$NODE" ]; then
  echo "Node.js not found. Install Node or place it at ~/.local/node"
  exit 1
fi
if [ -t 0 ]; then
  export STUDYBASE_PICK_WEBSITE=1
  export STUDYBASE_OPEN_BROWSER=1
fi
echo "Starting StudyBase local sync on http://127.0.0.1:${PORT}"
echo "Data folder: $(pwd)"
if [ -z "${STUDYBASE_WEBSITE_DIR:-}" ] && [ ! -f website.json ]; then
  echo "If no website folder is saved yet, a folder window will open."
fi
exec "$NODE" server.js

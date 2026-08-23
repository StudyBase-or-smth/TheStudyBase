#!/bin/bash
# Stop the StudyBase sync program.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user stop studybase-sync.service
exit 0

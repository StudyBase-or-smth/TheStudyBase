#!/usr/bin/env python3
import glob, os, subprocess, sys

files = sys.argv[1:]

def read_env(pid):
    raw = open(f"/proc/{pid}/environ", "rb").read().split(b"\0")
    env = {}
    for item in raw:
        if b"=" in item:
            k, v = item.split(b"=", 1)
            env[k.decode()] = v.decode(errors="replace")
    return env

session_pid = None
for path in glob.glob("/proc/[0-9]*/comm"):
    try:
        comm = open(path).read().strip()
    except Exception:
        continue
    if comm == "xfce4-session":
        session_pid = int(path.split("/")[2])
        break

env = os.environ.copy()
if session_pid is not None:
    env.update(read_env(session_pid))
env.setdefault("DISPLAY", ":0")
env.setdefault("XDG_RUNTIME_DIR", "/run/user/1000")

for path in files:
    os.chmod(path, 0o755)
    r = subprocess.run(
        ["gio", "set", path, "metadata::trusted", "true"],
        env=env,
        capture_output=True,
        text=True,
    )
    print(path, "trusted" if r.returncode == 0 else "trusted_fail:" + (r.stderr or r.stdout or str(r.returncode)).strip())
    try:
        digest = subprocess.check_output(["sha256sum", path], text=True).split()[0]
        subprocess.run(
            ["gio", "set", "-t", "string", path, "metadata::xfce-exe-checksum", digest],
            env=env,
            capture_output=True,
            text=True,
        )
    except Exception:
        pass

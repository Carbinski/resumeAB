#!/usr/bin/env bash
# Production pair for one machine: the API on 127.0.0.1, then Next.js in front.
# Terminate HTTPS in front of the Next.js port. Local development stays on the
# README commands (`python -m resume_ab.api` and `npm run dev`).

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ -f .env ]]; then
  # Shell values win, matching the API dotenv loader.
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ -z "${!key+x}" ]]; then
      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      value="${value#\"}"
      value="${value%\"}"
      value="${value#\'}"
      value="${value%\'}"
      export "$key=$value"
    fi
  done < .env
fi

export LADDER_HOST="127.0.0.1"
export LADDER_PORT="${LADDER_PORT:-8000}"
export PORT="${PORT:-3000}"
export LADDER_DATA="${LADDER_DATA:-data}"
if [[ ! "$LADDER_PORT" =~ ^[0-9]+$ || ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo "LADDER_PORT and PORT must be numbers." >&2
  exit 1
fi
export LADDER_API_ORIGIN="${LADDER_API_ORIGIN:-http://127.0.0.1:${LADDER_PORT}}"
if [[ -z "${LADDER_SECURE_COOKIES:-}" ]]; then
  export LADDER_SECURE_COOKIES=1
fi
if [[ -z "${LADDER_MAX_PLACEMENTS:-}" ]]; then
  export LADDER_MAX_PLACEMENTS=2
fi
export PYTHONUNBUFFERED=1

if [[ -z "${TYPESAFE_API_KEY:-}" ]]; then
  echo "TYPESAFE_API_KEY is not set. The site will load, and matchups will fail." >&2
fi

python_bin="python3"
if [[ -x "$root/.venv/bin/python" ]]; then
  python_bin="$root/.venv/bin/python"
fi

if [[ ! -d "$root/web/node_modules" ]]; then
  echo "Install the site first: cd web && npm install" >&2
  exit 1
fi
if [[ ! -d "$root/web/.next" ]]; then
  echo "Build the site first: cd web && npm run build" >&2
  exit 1
fi

api_pid=""
web_pid=""

stop_pid() {
  local pid_name="$1"
  local pid="${!pid_name:-}"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  printf -v "$pid_name" '%s' ""
}

cleanup() {
  trap - EXIT HUP INT TERM
  stop_pid web_pid
  stop_pid api_pid
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

"$python_bin" -m resume_ab.api &
api_pid=$!

ready=0
for _ in $(seq 1 50); do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "The API process exited before it was ready." >&2
    exit 1
  fi
  if "$python_bin" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${LADDER_PORT}/health', timeout=1)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ "$ready" != 1 ]]; then
  echo "The API did not answer /health on 127.0.0.1:${LADDER_PORT}." >&2
  exit 1
fi

# The judge key stays on the API process. Next.js only proxies to it.
(
  cd "$root/web"
  unset TYPESAFE_API_KEY
  exec "$root/web/node_modules/.bin/next" start --hostname 127.0.0.1 --port "$PORT"
) &
web_pid=$!

status=0
while true; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "The API process exited." >&2
    status=1
    break
  fi
  if ! kill -0 "$web_pid" 2>/dev/null; then
    wait "$web_pid" || status=$?
    web_pid=""
    break
  fi
  sleep 1
done

exit "$status"

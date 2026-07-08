#!/usr/bin/env bash
set -euo pipefail

MODEL_SERVER_URL="${MODEL_SERVER_URL:-http://127.0.0.1:11434}"
MODEL_NAME="${MODEL_NAME:-lfm2.5-thinking:1.2b}"
LOG_DIR="${LOG_DIR:-/tmp/reflex-ai-tunnel}"
OLLAMA_LOG="$LOG_DIR/ollama.log"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
OLLAMA_PID_FILE="$LOG_DIR/ollama.pid"
TUNNEL_PID_FILE="$LOG_DIR/cloudflared.pid"

mkdir -p "$LOG_DIR"

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

if ! have_cmd curl; then
  echo "curl is required." >&2
  exit 1
fi

if ! have_cmd cloudflared; then
  cat >&2 <<'EOF'
cloudflared is not installed.
Install it first, then re-run this script.
On Raspberry Pi OS, one common path is:

  sudo apt install cloudflared

or install from Cloudflare's release package for your architecture.
EOF
  exit 1
fi

if ! curl -fsS "$MODEL_SERVER_URL/api/tags" >/dev/null 2>&1; then
  if ! have_cmd ollama; then
    echo "ollama is not installed, and the local model server is not reachable at $MODEL_SERVER_URL." >&2
    exit 1
  fi

  echo "Starting Ollama..."
  nohup ollama serve >"$OLLAMA_LOG" 2>&1 &
  echo $! >"$OLLAMA_PID_FILE"

  ready=0
  for _ in $(seq 1 30); do
    if curl -fsS "$MODEL_SERVER_URL/api/tags" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done

  if [ "$ready" -ne 1 ]; then
    echo "Ollama did not become ready at $MODEL_SERVER_URL. Check $OLLAMA_LOG." >&2
    exit 1
  fi
fi

echo "Starting public HTTPS tunnel to $MODEL_SERVER_URL ..."
nohup cloudflared tunnel --url "$MODEL_SERVER_URL" --http-host-header "localhost:11434" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
echo $! >"$TUNNEL_PID_FILE"

public_url=""
for _ in $(seq 1 60); do
  if [ -f "$TUNNEL_LOG" ]; then
    public_url="$(grep -oE 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true)"
    if [ -n "$public_url" ]; then
      break
    fi
  fi
  sleep 1
done

if [ -z "$public_url" ]; then
  echo "Cloudflare tunnel did not print a public URL. Check $TUNNEL_LOG." >&2
  exit 1
fi

if ! curl -fsS "$public_url/api/tags" >/dev/null 2>&1; then
  echo "The tunnel URL was created, but /api/tags is not reachable through it." >&2
  echo "Check $TUNNEL_LOG and make sure the tunnel is forwarding to Ollama on 11434." >&2
  exit 1
fi

cat <<EOF
Public URL:
$public_url

Use this in Vercel:
LOCAL_AI_PROVIDER=ollama
LOCAL_AI_BASE_URL=$public_url
LOCAL_AI_MODEL="$MODEL_NAME"

Leave this terminal open to keep the tunnel alive.
Logs:
  Ollama: $OLLAMA_LOG
  Tunnel:  $TUNNEL_LOG
EOF

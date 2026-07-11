#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Export .env so Jira config (which reads os.environ directly) picks up the values.
if [[ -f "$ROOT/.env" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip comments and blank lines
        [[ -z "$line" || "$line" == \#* ]] && continue
        export "$line"
    done < "$ROOT/.env"
fi

API_PORT="${API_PORT:-3824}"
CLIENT_PORT="${CLIENT_PORT:-8192}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[dev]${NC} $*"; }

_pid()   { lsof -ti:"$1" 2>/dev/null || true; }
_running(){ [[ -n "$(_pid "$1")" ]]; }

cmd_down() {
    log "Stopping…"
    for p in "$API_PORT" "$CLIENT_PORT"; do
        pid=$(_pid "$p")
        [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null && log "Killed PID $pid :$p"
    done
    find "$ROOT/packages" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    log "Down."
}

cmd_up() {
    log "Starting…"
    if _running "$API_PORT"; then
        log "API already on :$API_PORT"
    else
        cd "$ROOT"
        uv run uvicorn planny_api.main:app --host 0.0.0.0 --port "$API_PORT" --reload \
            > /tmp/planny-api.log 2>&1 &
        sleep 2
    fi
    if _running "$CLIENT_PORT"; then
        log "Client already on :$CLIENT_PORT"
    else
        cd "$ROOT/client" && npm start > /tmp/planny-client.log 2>&1 &
        sleep 3
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  API:    ${CYAN}http://localhost:$API_PORT${NC}"
    echo "  Client: ${CYAN}http://localhost:$CLIENT_PORT${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_restart() { cmd_down; sleep 1; cmd_up; }

cmd_sync() {
    _running "$API_PORT" || { echo "API not running" >&2; exit 1; }
    TOKEN=$(curl -sf -X POST "http://localhost:$API_PORT/authentication/guest" | python3 -c "import sys,json;print(json.load(sys.stdin)['authToken'])")
    curl -s -X POST "http://localhost:$API_PORT/projects/sync" \
        -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
    echo "Sync done — refresh browser (Cmd+Shift+R)"
}

cmd_logs() { tail -f "/tmp/planny-${1:-api}.log"; }

case "${1:-}" in
    up)      cmd_up ;;
    down)    cmd_down ;;
    restart) cmd_restart ;;
    sync)    cmd_sync ;;
    logs)    cmd_logs "${2:-api}" ;;
    *)       echo "Usage: $0 {up|down|restart|sync|logs}" ;;
esac

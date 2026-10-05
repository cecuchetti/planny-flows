#!/usr/bin/env bash

DEPENDENCIES=(uv)
SCRIPT_NAME=$(basename "$0")
VERSION="2.0.0"

# The deploy scripts render this template with sed, replacing the __PLACEHOLDER__
# tokens with your real paths. If you run the file straight from the repo, set
# DEPLOY_DIR / PROJECT_SOURCE in the environment instead.
DEPLOY_DIR="${DEPLOY_DIR:-__DEPLOY_DIR__}"
PROJECT_SOURCE="${PROJECT_SOURCE:-__PROJECT_SOURCE__}"
LOG_DIR="$DEPLOY_DIR/logs"
PID_DIR="$DEPLOY_DIR/pids"
ENV_FILE="$DEPLOY_DIR/.env.production"
HTTPS_CONFIG="$DEPLOY_DIR/.https-config"

# HTTPS mode detection
HTTPS_ENABLED=false

function usage() {
    cat <<EOM

Planny-Flows Production Startup Script

usage: ${SCRIPT_NAME} [options]

options:
    -h|--help             Show this help message
    --version             Show version information

dependencies: ${DEPENDENCIES[*]}

EOM
    exit 1
}

function exit_on_missing_tools() {
    for cmd in "$@"; do
        if command -v "$cmd" &>/dev/null; then
            continue
        fi
        printf "Error: Required tool '%s' is not installed or not in PATH\n" "$cmd"
        exit 1
    done
}

function log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >&2
}

function check_https_config() {
    if [[ -f "$HTTPS_CONFIG" ]]; then
        # Source the HTTPS config
        # shellcheck source=/dev/null
        source "$HTTPS_CONFIG" 2>/dev/null || true
        
        if [[ "${HTTPS_ENABLED:-false}" == "true" ]]; then
            HTTPS_ENABLED=true
        fi
    fi
}

function cleanup() {
    log "Shutting down..."
    [ -f "$PID_DIR/api.pid" ] && kill "$(cat "$PID_DIR/api.pid")" 2>/dev/null || true
    [ -f "$PID_DIR/client.pid" ] && kill "$(cat "$PID_DIR/client.pid")" 2>/dev/null || true
    rm -f "$PID_DIR"/*.pid 2>/dev/null || true
}

function read_pid_file() {
    local pid_file="$1"

    if [[ ! -f "$pid_file" ]]; then
        return 1
    fi

    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
        return 1
    fi

    printf '%s\n' "$pid"
}

function get_process_command() {
    local pid="$1"
    ps -p "$pid" -o command= 2>/dev/null || true
}

function is_managed_process() {
    local pid="$1"
    local expected_pattern="$2"

    if ! kill -0 "$pid" 2>/dev/null; then
        return 1
    fi

    local process_command
    process_command="$(get_process_command "$pid")"
    [[ -n "$process_command" && "$process_command" == *"$expected_pattern"* ]]
}

function stop_managed_process_from_pid_file() {
    local pid_file="$1"
    local expected_pattern="$2"
    local label="$3"

    local pid
    if ! pid="$(read_pid_file "$pid_file")"; then
        rm -f "$pid_file" 2>/dev/null || true
        return 0
    fi

    if is_managed_process "$pid" "$expected_pattern"; then
        log "Stopping managed ${label} process (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
    elif kill -0 "$pid" 2>/dev/null; then
        log "Skipping PID $pid from $(basename "$pid_file") because it does not match ${label} process signature."
    fi

    rm -f "$pid_file" 2>/dev/null || true
}

function process_cwd_is() {
    local pid="$1"
    local expected_dir="$2"
    local cwd=""

    command -v lsof &>/dev/null || return 1

    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    [[ "$cwd" == "$expected_dir" ]]
}

function is_api_process() {
    local pid="$1"
    local process_command
    process_command="$(get_process_command "$pid")"

    # 'uv run uvicorn ...' re-execs a child python process; the child is the one
    # that actually binds the port, so accept either form.
    [[ -n "$process_command" && "$process_command" == *uvicorn* && "$process_command" == *planny_api* ]]
}

function is_client_process() {
    local pid="$1"
    local process_command
    process_command="$(get_process_command "$pid")"

    [[ -n "$process_command" && "$process_command" == *"node server.js"* ]] || return 1

    # Guard against killing an unrelated 'node server.js': require that the
    # process actually runs from the deployed client directory when we can tell.
    if command -v lsof &>/dev/null; then
        process_cwd_is "$pid" "$DEPLOY_DIR/client"
    else
        return 0
    fi
}

function stop_orphan_on_port() {
    local port="$1"
    local matcher="$2"
    local label="$3"
    local pid=""

    if ! command -v lsof &>/dev/null; then
        return 0
    fi

    for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
        if "$matcher" "$pid"; then
            log "Stopping orphaned ${label} process on port ${port} (PID: $pid)"
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        else
            log "Port ${port} is held by PID $pid, which is not ${label}; leaving it alone."
        fi
    done
}

function stop_stale_processes() {
    log "Stopping managed stale processes before start..."

    stop_managed_process_from_pid_file "$PID_DIR/api.pid" "uvicorn" "API"
    stop_managed_process_from_pid_file "$PID_DIR/client.pid" "node server.js" "client"

    # A previous run can die after its pid file was already removed, leaving a
    # process that still holds the port. Without this sweep the next start fails
    # to bind and the service enters a restart loop, so reclaim the ports.
    stop_orphan_on_port "${PORT:-3824}" is_api_process "API"
    stop_orphan_on_port "${CLIENT_PORT:-8193}" is_client_process "client"

    sleep 1
}

function load_environment() {
    if [ -f "$ENV_FILE" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            case "$line" in
            \#* | "") continue ;;
            *) export "$line" ;;
            esac
        done < "$ENV_FILE"
    fi
}

function start_api() {
    log "Starting API (Python/FastAPI)..."

    cd "$PROJECT_SOURCE" || {
        log "ERROR: Failed to change to project source directory: $PROJECT_SOURCE"
        exit 1
    }

    uv run uvicorn planny_api.main:app --host 0.0.0.0 --port "${PORT:-3824}" >> "$LOG_DIR/api.log" 2>> "$LOG_DIR/api-error.log" &
    local api_pid=$!
    echo "$api_pid" > "$PID_DIR/api.pid"

    sleep 2

    if ! kill -0 "$api_pid" 2>/dev/null; then
        log "ERROR: API failed to start"
        exit 1
    fi

    log "API started (PID: $api_pid)"
    echo "$api_pid"
}

function start_client() {
    log "Starting Client..."

    cd "$DEPLOY_DIR/client" || {
        log "ERROR: Failed to change to client directory"
        exit 1
    }

    PORT="${CLIENT_PORT:-8193}" node server.js >> "$LOG_DIR/client.log" 2>> "$LOG_DIR/client-error.log" &
    local client_pid=$!
    echo "$client_pid" > "$PID_DIR/client.pid"

    sleep 1

    if ! kill -0 "$client_pid" 2>/dev/null; then
        log "ERROR: Client failed to start"
        return 1
    fi

    log "Client started (PID: $client_pid)"
    echo "$client_pid"
}

function monitor_processes() {
    local api_pid="$1"
    local client_pid="$2"

    while true; do
        if ! kill -0 "$api_pid" 2>/dev/null; then
            log "API died"
            exit 1
        fi
        if ! kill -0 "$client_pid" 2>/dev/null; then
            log "Client died"
            exit 1
        fi
        sleep 5
    done
}

function main() {
    while [ "$1" != "" ]; do
        case $1 in
        --version)
            echo "${SCRIPT_NAME} version ${VERSION}"
            exit 0
            ;;
        -h | --help)
            usage
            ;;
        *)
            echo "Error: Unknown option '$1'" >&2
            usage
            ;;
        esac
        shift
    done

    exit_on_missing_tools "${DEPENDENCIES[@]}"

    mkdir -p "$LOG_DIR" "$PID_DIR" || {
        log "ERROR: Failed to create directories"
        exit 1
    }

    # Check HTTPS configuration
    check_https_config

    trap cleanup EXIT
    trap 'cleanup; exit 0' SIGTERM SIGINT

    load_environment
    stop_stale_processes

    log "Starting Planny-Flows..."

    local api_pid
    api_pid=$(start_api)

    local client_pid
    client_pid=$(start_client) || {
        kill "$api_pid" 2>/dev/null || true
        exit 1
    }

    # Determine display URL
    local display_url
    if [[ "$HTTPS_ENABLED" == true ]]; then
        if [[ -n "${TAILSCALE_IP:-}" ]]; then
            display_url="https://${TAILSCALE_IP}"
        else
            display_url="https://$(hostname -s).local"
        fi
    else
        display_url="http://$(hostname -s).local:${CLIENT_PORT:-8193}"
    fi

    log "Planny-Flows running at $display_url"
    if [[ "$HTTPS_ENABLED" == true ]]; then
        log "API available at: $display_url/api"
    else
        log "API available at: http://$(hostname -s).local:${PORT:-3824}"
    fi
    log "Project source: $PROJECT_SOURCE"

    monitor_processes "$api_pid" "$client_pid"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

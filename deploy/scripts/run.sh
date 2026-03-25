#!/usr/bin/env bash

#================================================================================
# Planny-Flows Run Script (Used by launchd)
#================================================================================
# This script is started by launchd and runs the API and Client servers

# Environment variables
export DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
export API_PORT="${API_PORT:-3824}"
export CLIENT_PORT="${CLIENT_PORT:-8193}"
export LOG_DIR="${LOG_DIR:-$DEPLOY_DIR/logs}"
export NODE_ENV="${NODE_ENV:-production}"

# Create directories
mkdir -p "$DEPLOY_DIR/pids"
mkdir -p "$LOG_DIR"

# Log file paths
API_LOG="$LOG_DIR/api.log"
CLIENT_LOG="$LOG_DIR/client.log"

# PID files
API_PID="$DEPLOY_DIR/pids/api.pid"
CLIENT_PID="$DEPLOY_DIR/pids/client.pid"

# Function to log
log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_DIR/run.log"
}

# Function to log with color (for console)
log_color() {
    local level="$1"
    local message="$2"
    local color=""
    case "$level" in
        INFO) color='\033[0;32m' ;;
        WARN) color='\033[1;33m' ;;
        ERROR) color='\033[0;31m' ;;
        *) color='\033[0m' ;;
    esac
    echo -e "${color}[$timestamp] [$level] $message${NC}"
}

# Cleanup function
cleanup() {
    log INFO "Shutting down..."
    [[ -f "$API_PID" ]] && kill $(cat "$API_PID") 2>/dev/null || true
    [[ -f "$CLIENT_PID" ]] && kill $(cat "$CLIENT_PID") 2>/dev/null || true
    exit 0
}

# Trap signals
trap cleanup EXIT INT TERM

# Check if ports are already in use
check_port() {
    local port="$1"
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0
    else
        return 1
    fi
}

# Start API
start_api() {
    log INFO "Starting API server on port $API_PORT..."

    if [[ -d "$DEPLOY_DIR/api/build" ]]; then
        cd "$DEPLOY_DIR/api" || exit 1

        # Start API with nohup
        nohup node -r ./tsconfig-paths.js build/index.js > "$API_LOG" 2>&1 &
        local api_pid=$!
        echo $api_pid > "$API_PID"

        log INFO "API started with PID: $api_pid"
        log INFO "API log: $API_LOG"
    else
        log ERROR "API build directory not found at $DEPLOY_DIR/api/build"
        return 1
    fi
}

# Start Client
start_client() {
    log INFO "Starting Client server on port $CLIENT_PORT..."

    if [[ -d "$DEPLOY_DIR/client/build" ]]; then
        cd "$DEPLOY_DIR/client" || exit 1

        # Start Client with nohup
        nohup node server.js > "$CLIENT_LOG" 2>&1 &
        local client_pid=$!
        echo $client_pid > "$CLIENT_PID"

        log INFO "Client started with PID: $client_pid"
        log INFO "Client log: $CLIENT_LOG"
    else
        log ERROR "Client build directory not found at $DEPLOY_DIR/client/build"
        return 1
    fi
}

# Wait for services to be ready
wait_for_services() {
    log INFO "Waiting for services to be ready..."

    local max_attempts=30
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        local api_ready=false
        local client_ready=false

        # Check API health
        if curl -s http://localhost:$API_PORT/health >/dev/null 2>&1; then
            api_ready=true
        fi

        # Check Client
        if curl -s http://localhost:$CLIENT_PORT >/dev/null 2>&1; then
            client_ready=true
        fi

        if [[ "$api_ready" == true ]] && [[ "$client_ready" == true ]]; then
            log SUCCESS "All services are ready!"
            return 0
        fi

        log WARN "Waiting for services... ($attempt/$max_attempts)"
        sleep 1
        ((attempt++))
    done

    log WARN "Services not fully ready after $max_attempts attempts"
    return 1
}

# Main function
main() {
    log INFO "Starting Planny-Flows services..."

    # Check if ports are already in use
    if check_port "$API_PORT"; then
        log WARN "Port $API_PORT is already in use, trying to kill existing process..."
        kill $(lsof -Pi :$API_PORT -sTCP:LISTEN -t) 2>/dev/null || true
        sleep 2
    fi

    if check_port "$CLIENT_PORT"; then
        log WARN "Port $CLIENT_PORT is already in use, trying to kill existing process..."
        kill $(lsof -Pi :$CLIENT_PORT -sTCP:LISTEN -t) 2>/dev/null || true
        sleep 2
    fi

    # Start services
    start_api || exit 1
    sleep 2
    start_client || exit 1
    sleep 2

    # Wait for services
    if ! wait_for_services; then
        log ERROR "Services failed to start properly"
        return 1
    fi

    log SUCCESS "All services are running and healthy!"
    log INFO "API: http://localhost:$API_PORT"
    log INFO "Client: http://localhost:$CLIENT_PORT"

    # Keep the script running
    wait
}

# Run main function
main "$@"

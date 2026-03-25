#!/usr/bin/env bash

DEPENDENCIES=(curl launchctl)
SCRIPT_NAME=$(basename "$0")
VERSION="1.0.0"

PLIST_PATH="/Library/LaunchDaemons/com.plannyflows.plist"
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
LOG_DIR="${LOG_DIR:-$DEPLOY_DIR/logs}"

function usage() {
    cat <<EOM

Restart the planny-flows launchd service.

usage: ${SCRIPT_NAME} [options]

options:
    -h|--help             Show this help message
    --version             Show version information

dependencies: ${DEPENDENCIES[*]}

examples:
    ${SCRIPT_NAME}

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

function stop_service() {
    echo "1. Stopping service..."
    sudo launchctl bootout system/com.plannyflows 2>/dev/null || true
    sleep 2
}

function start_service() {
    echo "2. Starting service..."
    if [[ ! -f "$PLIST_PATH" ]]; then
        echo "Error: Launchd plist not found at $PLIST_PATH" >&2
        exit 1
    fi
    sudo launchctl bootstrap system "$PLIST_PATH" || {
        echo "Error: Failed to start service" >&2
        exit 1
    }
}

function wait_for_service() {
    echo "3. Waiting for service to start..."
    sleep 5
}

function check_status() {
    echo "4. Checking status..."

    local api_health
    api_health=$(curl -s http://localhost:3824/health 2>/dev/null || echo "FAILED")

    local client_status
    client_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8193 2>/dev/null || echo "000")

    echo "API Health: $api_health"
    echo "Client HTTP: $client_status"

    if [[ "$client_status" == "200" ]]; then
        local hostname
        hostname=$(hostname | sed 's/\.local$//')
        echo ""
        echo "✓ Service is running!"
        echo "Access at: http://${hostname}.local:8193"
        return 0
    else
        echo ""
        echo "✗ Service failed to start. Check logs:"
        echo "  tail -20 $LOG_DIR/launchd-error.log"
        return 1
    fi
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

    echo "=== Restarting Planny-Flows Service ==="
    echo ""

    stop_service
    start_service
    wait_for_service
    check_status
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

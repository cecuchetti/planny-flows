#!/usr/bin/env bash

DEPENDENCIES=()
SCRIPT_NAME=$(basename "$0")
VERSION="1.0.0"

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
PID_DIR="$DEPLOY_DIR/pids"

function usage() {
    cat <<EOM

Stop planny-flows services.

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

function stop_via_pid_files() {
    local stopped=false

    if [[ -f "$PID_DIR/api.pid" ]]; then
        local pid
        pid=$(cat "$PID_DIR/api.pid")
        if kill "$pid" 2>/dev/null; then
            echo "API stopped (PID: $pid)"
            stopped=true
        else
            echo "API not running"
        fi
        rm -f "$PID_DIR/api.pid"
    fi

    if [[ -f "$PID_DIR/client.pid" ]]; then
        local pid
        pid=$(cat "$PID_DIR/client.pid")
        if kill "$pid" 2>/dev/null; then
            echo "Client stopped (PID: $pid)"
            stopped=true
        else
            echo "Client not running"
        fi
        rm -f "$PID_DIR/client.pid"
    fi

    $stopped
}

function stop_via_launchd() {
    if [[ -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
        sudo launchctl bootout system/com.plannyflows 2>/dev/null || true
        echo "Stopped via launchd"
        return 0
    fi
    return 1
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

    echo "Stopping Planny-Flows..."

    stop_via_pid_files

    stop_via_launchd

    echo "Done"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

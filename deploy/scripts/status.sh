#!/usr/bin/env bash

DEPENDENCIES=(curl)
SCRIPT_NAME=$(basename "$0")
VERSION="1.1.0"

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
PID_DIR="$DEPLOY_DIR/pids"
HTTPS_CONFIG="$DEPLOY_DIR/.https-config"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

if [[ -n "${NO_COLOR:-}" ]] || [[ "${TERM:-}" == "dumb" ]]; then
    RED="" GREEN="" YELLOW="" BLUE="" CYAN="" NC=""
fi

function usage() {
    cat <<EOM

Check planny-flows service status.

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

function check_launchd_service() {
    if [[ -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
        echo "Launchd Service: Installed"
        sudo launchctl print system/com.plannyflows 2>/dev/null | grep -E "(state|pid)" || echo "  Status: Not running"
    else
        echo "Launchd Service: Not installed"
    fi
}

function check_processes() {
    echo "Processes:"

    if [[ -f "$PID_DIR/api.pid" ]]; then
        local pid
        pid=$(cat "$PID_DIR/api.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "  API:    Running (PID: $pid)"
        else
            echo "  API:    Stale PID file"
        fi
    else
        echo "  API:    Not running"
    fi

    if [[ -f "$PID_DIR/client.pid" ]]; then
        local pid
        pid=$(cat "$PID_DIR/client.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Client: Running (PID: $pid)"
        else
            echo "  Client: Stale PID file"
        fi
    else
        echo "  Client: Not running"
    fi
}

function check_health() {
    echo "Health Checks:"

    local api_health
    api_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3824/health 2>/dev/null || echo "000")
    if [[ "$api_health" == "200" ]]; then
        echo -e "  API:    ${GREEN}Healthy ✓${NC}"
    else
        echo -e "  API:    ${RED}Not responding (HTTP $api_health)${NC}"
    fi

    local client_health
    client_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8193 2>/dev/null || echo "000")
    if [[ "$client_health" == "200" ]]; then
        echo -e "  Client: ${GREEN}Healthy ✓${NC}"
    else
        echo -e "  Client: ${RED}Not responding (HTTP $client_health)${NC}"
    fi
}

function check_https() {
    echo -e "${BLUE}HTTPS Status:${NC}"

    local https_enabled=false
    local tailscale_ip=""
    local https_mode=""

    if [[ -f "$HTTPS_CONFIG" ]]; then
        # shellcheck source=/dev/null
        source "$HTTPS_CONFIG" 2>/dev/null || true
        https_enabled="${HTTPS_ENABLED:-false}"
        tailscale_ip="${TAILSCALE_IP:-}"
        https_mode="${HTTPS_MODE:-local}"
    fi

    # Check Caddy process
    local caddy_running=false
    if pgrep -f "caddy run" &>/dev/null; then
        caddy_running=true
    fi

    if [[ "$https_enabled" == "true" ]]; then
        echo -e "  HTTPS:   ${GREEN}Configured${NC} (mode: $https_mode)"
        
        if [[ "$caddy_running" == true ]]; then
            echo -e "  Caddy:   ${GREEN}Running${NC}"
        else
            echo -e "  Caddy:   ${YELLOW}Not running${NC}"
        fi

        if [[ -n "$tailscale_ip" ]]; then
            echo -e "  Tailscale IP: ${CYAN}$tailscale_ip${NC}"
        fi
    else
        echo -e "  HTTPS:   ${YELLOW}Not configured${NC}"
        
        if [[ "$caddy_running" == true ]]; then
            echo -e "  Caddy:   ${GREEN}Running${NC} (orphaned?)"
        else
            echo -e "  Caddy:   Not running"
        fi
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

    echo -e "${BLUE}Planny-Flows Status${NC}"
    echo "═══════════════════"
    echo ""

    check_launchd_service
    echo ""
    check_processes
    echo ""
    check_health
    echo ""
    check_https
    echo ""

    # Show access URLs
    local hostname
    hostname=$(hostname | sed 's/\.local$//')

    local https_enabled=false
    local tailscale_ip=""

    if [[ -f "$HTTPS_CONFIG" ]]; then
        # shellcheck source=/dev/null
        source "$HTTPS_CONFIG" 2>/dev/null || true
        https_enabled="${HTTPS_ENABLED:-false}"
        tailscale_ip="${TAILSCALE_IP:-}"
    fi

    echo -e "${BLUE}Access URLs:${NC}"
    echo -e "  HTTP:   http://${hostname}.local:8193"

    if [[ "$https_enabled" == "true" ]]; then
        echo -e "  HTTPS:  https://${hostname}.local"
        if [[ -n "$tailscale_ip" ]]; then
            echo -e "  ${CYAN}Tailscale: https://${tailscale_ip}${NC}"
        fi
    fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

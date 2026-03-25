#!/usr/bin/env bash
#
# setup-https-ngrok.sh - HTTPS using ngrok (public URLs with trusted certs)
#
# This script sets up ngrok to provide public HTTPS URLs with trusted
# certificates. Great for testing on mobile devices without Tailscale.
#
# Usage:
#   ./setup-https-ngrok.sh              # Set up ngrok tunnels
#   ./setup-https-ngrok.sh --rebuild    # Rebuild client with new URLs
#   ./setup-https-ngrok.sh --uninstall  # Stop ngrok tunnels
#

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Disable colors if needed
if [[ -n "${NO_COLOR:-}" ]] || [[ "${TERM:-}" == "dumb" ]]; then
    RED="" GREEN="" YELLOW="" BLUE="" CYAN="" NC=""
fi

# Directories
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"

# Ports
CLIENT_PORT=8193
API_PORT=3824

# ngrok URLs (will be populated after starting)
NGROK_CLIENT_URL=""
NGROK_API_URL=""

function usage() {
    cat <<EOM

Set up HTTPS for planny-flows using ngrok (public URLs with trusted certs).

usage: ${SCRIPT_NAME} [options]

options:
    --rebuild          Rebuild client with ngrok URLs
    --uninstall        Stop ngrok tunnels
    -h|--help          Show this help message
    --version          Show version information

requirements:
    - ngrok must be installed (brew install ngrok)
    - ngrok account (free tier works)

examples:
    ${SCRIPT_NAME}              # Start ngrok tunnels
    ${SCRIPT_NAME} --rebuild    # Rebuild client with new URLs
    ${SCRIPT_NAME} --uninstall  # Stop ngrok

EOM
    exit 1
}

function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

function check_ngrok() {
    log_info "Checking ngrok..."

    if ! command -v ngrok &>/dev/null; then
        log_error "ngrok is not installed"
        echo ""
        echo "Install ngrok:"
        echo "  brew install ngrok"
        echo ""
        echo "Then authenticate:"
        echo "  ngrok config add-authtoken <your-token>"
        echo ""
        echo "Get a free token at: https://dashboard.ngrok.com/get-started/your-authtoken"
        exit 1
    fi

    # Check if ngrok is authenticated
    if ! ngrok config check &>/dev/null 2>&1; then
        log_error "ngrok is not authenticated"
        echo ""
        echo "Authenticate with:"
        echo "  ngrok config add-authtoken <your-token>"
        echo ""
        echo "Get a free token at: https://dashboard.ngrok.com/get-started/your-authtoken"
        exit 1
    fi

    log_success "ngrok is installed and configured"
}

function check_deployment() {
    log_info "Checking deployment..."

    if [[ ! -d "$DEPLOY_DIR" ]]; then
        log_error "Deployment not found at $DEPLOY_DIR"
        log_error "Run ./deploy/setup.sh first"
        exit 1
    fi

    log_success "Deployment found"
}

function start_ngrok() {
    log_info "Starting ngrok tunnels..."

    # Kill any existing ngrok processes
    pkill -f ngrok 2>/dev/null || true
    sleep 1

    # Start ngrok for client port
    ngrok http ${CLIENT_PORT} --log=stdout > "$DEPLOY_DIR/logs/ngrok-client.log" 2>&1 &
    local client_pid=$!
    sleep 3

    # Start ngrok for API port
    ngrok http ${API_PORT} --log=stdout > "$DEPLOY_DIR/logs/ngrok-api.log" 2>&1 &
    local api_pid=$!
    sleep 3

    # Get the public URLs from ngrok API
    log_info "Fetching ngrok URLs..."

    # Client URL (port 4040 is ngrok's web interface)
    NGROK_CLIENT_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    # API URL - need to find the second tunnel
    NGROK_API_URL=$(curl -s http://localhost:4041/api/tunnels 2>/dev/null | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    # If we couldn't get the second tunnel, start ngrok differently
    if [[ -z "$NGROK_API_URL" ]]; then
        # Kill existing and restart with config file
        pkill -f ngrok 2>/dev/null || true
        sleep 1

        # Create ngrok config
        cat > "$DEPLOY_DIR/ngrok.yml" <<EOF
version: "2"
authtoken: $(ngrok config get-authtoken 2>/dev/null || echo "")

tunnels:
  client:
    proto: http
    addr: ${CLIENT_PORT}
  api:
    proto: http
    addr: ${API_PORT}
EOF

        # Start all tunnels
        ngrok start --all --config="$DEPLOY_DIR/ngrok.yml" --log=stdout > "$DEPLOY_DIR/logs/ngrok.log" 2>&1 &
        sleep 4

        # Get URLs
        local tunnels_json
        tunnels_json=$(curl -s http://localhost:4040/api/tunnels)

        NGROK_CLIENT_URL=$(echo "$tunnels_json" | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
        NGROK_API_URL=$(echo "$tunnels_json" | grep -o '"public_url":"https://[^"]*"' | tail -1 | cut -d'"' -f4 || echo "")
    fi

    if [[ -z "$NGROK_CLIENT_URL" ]]; then
        log_error "Failed to get ngrok URLs"
        echo "Check logs: $DEPLOY_DIR/logs/ngrok.log"
        exit 1
    fi

    # If only one URL, derive the second
    if [[ -z "$NGROK_API_URL" ]] || [[ "$NGROK_CLIENT_URL" == "$NGROK_API_URL" ]]; then
        log_warning "Could not get separate API URL. Using client URL for API too."
        NGROK_API_URL="$NGROK_CLIENT_URL"
    fi

    log_success "ngrok tunnels started"
    echo -e "  ${CYAN}Client:${NC} $NGROK_CLIENT_URL"
    echo -e "  ${CYAN}API:${NC}    $NGROK_API_URL"
}

function update_env_file() {
    log_info "Updating environment file..."

    local env_file="$DEPLOY_DIR/.env.production"

    if [[ -f "$env_file" ]]; then
        # Update CLIENT_URL
        if grep -q "^CLIENT_URL=" "$env_file"; then
            sed -i '' "s|^CLIENT_URL=.*|CLIENT_URL=${NGROK_CLIENT_URL}|" "$env_file"
        else
            echo "CLIENT_URL=${NGROK_CLIENT_URL}" >> "$env_file"
        fi
        log_success "Updated CLIENT_URL"
    fi

    # Save ngrok config
    cat > "$DEPLOY_DIR/.https-config" <<EOF
# HTTPS Configuration (ngrok)
HTTPS_ENABLED=true
HTTPS_MODE=ngrok
API_URL=${NGROK_API_URL}
CLIENT_URL=${NGROK_CLIENT_URL}
CONFIGURED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOTE=ngrok URLs change on restart unless you have a paid plan
EOF
    chmod 600 "$DEPLOY_DIR/.https-config"
}

function rebuild_client() {
    log_info "Rebuilding client with ngrok API URL..."

    cd "$PROJECT_DIR/client" || {
        log_error "Failed to change to client directory"
        exit 1
    }

    # Build with new API URL
    API_URL="$NGROK_API_URL" npm run build || {
        log_error "Client build failed"
        exit 1
    }

    # Copy to deployment
    log_info "Copying build to deployment..."
    rm -rf "$DEPLOY_DIR/client/build"/*
    mkdir -p "$DEPLOY_DIR/client/build"
    cp -r "$PROJECT_DIR/client/build"/* "$DEPLOY_DIR/client/build/"

    log_success "Client rebuilt with API URL: $NGROK_API_URL"
}

function restart_app() {
    log_info "Restarting application..."

    # Check if running via launchd
    if sudo launchctl list | grep -q "com.plannyflows"; then
        log_info "Restarting via launchd..."
        sudo launchctl kickstart -k system/com.plannyflows
        sleep 2
    else
        log_warning "Not running via launchd. Restart manually if needed."
    fi
}

function uninstall_ngrok() {
    log_info "Stopping ngrok tunnels..."

    pkill -f ngrok 2>/dev/null || true
    rm -f "$DEPLOY_DIR/.https-config"
    rm -f "$DEPLOY_DIR/ngrok.yml"

    log_success "ngrok stopped"
}

function display_success() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}     HTTPS Setup Complete (ngrok)!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}Access your application from anywhere:${NC}"
    echo ""
    echo -e "  ${YELLOW}${NGROK_CLIENT_URL}${NC}"
    echo ""
    echo -e "${BLUE}API endpoint:${NC}"
    echo -e "  ${NGROK_API_URL}"
    echo ""
    echo -e "${GREEN}✓ Trusted HTTPS certificates provided by ngrok${NC}"
    echo -e "${GREEN}✓ Accessible from anywhere (no Tailscale needed)${NC}"
    echo ""
    echo -e "${YELLOW}Note:${NC} ngrok URLs change on restart with free tier."
    echo -e "${YELLOW}       For stable URLs, consider ngrok paid plan.${NC}"
    echo ""
    echo -e "${BLUE}To rebuild client:${NC}"
    echo -e "  ${YELLOW}./deploy/scripts/setup-https-ngrok.sh --rebuild${NC}"
    echo ""
    echo -e "${BLUE}To stop ngrok:${NC}"
    echo -e "  ${YELLOW}./deploy/scripts/setup-https-ngrok.sh --uninstall${NC}"
    echo ""
    echo -e "${BLUE}View ngrok dashboard:${NC}"
    echo -e "  http://localhost:4040"
    echo ""
}

function main() {
    local do_uninstall=false
    local do_rebuild=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
        --rebuild)
            do_rebuild=true
            ;;
        --uninstall)
            do_uninstall=true
            ;;
        --version)
            echo "${SCRIPT_NAME} version ${VERSION}"
            exit 0
            ;;
        -h | --help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
        esac
        shift
    done

    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}     Planny-Flows HTTPS Setup (ngrok)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    # Handle uninstall
    if [[ "$do_uninstall" == true ]]; then
        uninstall_ngrok
        exit 0
    fi

    # Check prerequisites
    check_ngrok
    check_deployment

    # Start ngrok
    start_ngrok

    # Update environment
    update_env_file

    # Rebuild if requested
    if [[ "$do_rebuild" == true ]]; then
        rebuild_client
        restart_app
    else
        echo ""
        echo -e "${YELLOW}Important:${NC} Your client needs to be rebuilt with the ngrok API URL."
        echo -e "Run:"
        echo -e "  ${YELLOW}./deploy/scripts/setup-https-ngrok.sh --rebuild${NC}"
    fi

    # Show success
    display_success
}

# Run main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

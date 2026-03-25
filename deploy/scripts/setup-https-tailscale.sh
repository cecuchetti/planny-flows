#!/usr/bin/env bash
#
# setup-https-tailscale.sh - Quick HTTPS setup using Tailscale Serve
#
# This script sets up HTTPS for planny-flows using Tailscale's built-in
# HTTPS capabilities. No additional software needed.
#
# Usage:
#   ./setup-https-tailscale.sh              # Interactive setup
#   ./setup-https-tailscale.sh --rebuild    # Rebuild client with HTTPS URLs
#   ./setup-https-tailscale.sh --uninstall  # Remove Tailscale serve config
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

# Tailscale info
TAILSCALE_HOSTNAME=""
TAILSCALE_DNS=""

function usage() {
    cat <<EOM

Set up HTTPS for planny-flows using Tailscale Serve.

usage: ${SCRIPT_NAME} [options]

options:
    --rebuild          Rebuild client with HTTPS API URL
    --uninstall        Remove Tailscale serve configuration
    -h|--help          Show this help message
    --version          Show version information

requirements:
    - Tailscale must be installed and running
    - Deployment must exist at $DEPLOY_DIR

examples:
    ${SCRIPT_NAME}              # Set up Tailscale HTTPS
    ${SCRIPT_NAME} --rebuild    # Rebuild client for HTTPS
    ${SCRIPT_NAME} --uninstall  # Remove HTTPS config

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

function check_tailscale() {
    log_info "Checking Tailscale..."

    if ! command -v tailscale &>/dev/null; then
        log_error "Tailscale is not installed"
        echo "  Install from: https://tailscale.com/download"
        exit 1
    fi

    # Get Tailscale status
    local status
    status=$(tailscale status --json 2>/dev/null || echo "{}")

    # Check if Tailscale is running
    if ! tailscale status &>/dev/null; then
        log_error "Tailscale is not running"
        echo "  Start with: tailscale up"
        exit 1
    fi

    # Get hostname and DNS name
    TAILSCALE_HOSTNAME=$(echo "$status" | grep -o '"HostName":"[^"]*"' | head -1 | cut -d'"' -f4 || hostname | sed 's/\.local$//')
    TAILSCALE_DNS=$(echo "$status" | grep -o '"DNSName":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    if [[ -z "$TAILSCALE_DNS" ]]; then
        # Fallback: construct from hostname
        TAILSCALE_DNS="${TAILSCALE_HOSTNAME}.ts.net"
    fi

    log_success "Tailscale is running"
    echo -e "  ${CYAN}Hostname:${NC} $TAILSCALE_HOSTNAME"
    echo -e "  ${CYAN}DNS:${NC} $TAILSCALE_DNS"

    return 0
}

function check_deployment() {
    log_info "Checking deployment..."

    if [[ ! -d "$DEPLOY_DIR" ]]; then
        log_error "Deployment not found at $DEPLOY_DIR"
        log_error "Run ./deploy/setup.sh first"
        exit 1
    fi

    if [[ ! -f "$DEPLOY_DIR/start.sh" ]]; then
        log_error "start.sh not found"
        exit 1
    fi

    log_success "Deployment found"
}

function configure_tailscale_serve() {
    log_info "Configuring Tailscale Serve..."

    # Reset existing config
    tailscale serve reset 2>/dev/null || true

    # Configure client server on HTTPS (443)
    tailscale serve --bg --https:443 http://localhost:${CLIENT_PORT}

    # Configure API server on HTTPS port 3824
    tailscale serve --bg --https:${API_PORT} http://localhost:${API_PORT}

    log_success "Tailscale Serve configured"
    echo -e "  ${CYAN}Client:${NC} https://${TAILSCALE_DNS}/"
    echo -e "  ${CYAN}API:${NC}    https://${TAILSCALE_DNS}:${API_PORT}/"
}

function rebuild_client() {
    log_info "Rebuilding client with HTTPS API URL..."

    local api_url="https://${TAILSCALE_DNS}:${API_PORT}"

    cd "$PROJECT_DIR/client" || {
        log_error "Failed to change to client directory"
        exit 1
    }

    # Build with new API URL
    API_URL="$api_url" npm run build || {
        log_error "Client build failed"
        exit 1
    }

    # Copy to deployment
    log_info "Copying build to deployment..."
    rm -rf "$DEPLOY_DIR/client/build"/*
    mkdir -p "$DEPLOY_DIR/client/build"
    cp -r "$PROJECT_DIR/client/build"/* "$DEPLOY_DIR/client/build/"

    log_success "Client rebuilt with API URL: $api_url"
}

function update_env_file() {
    log_info "Updating environment file..."

    local env_file="$DEPLOY_DIR/.env.production"
    local client_url="https://${TAILSCALE_DNS}"

    if [[ -f "$env_file" ]]; then
        # Update CLIENT_URL
        if grep -q "^CLIENT_URL=" "$env_file"; then
            sed -i '' "s|^CLIENT_URL=.*|CLIENT_URL=${client_url}|" "$env_file"
        else
            echo "CLIENT_URL=${client_url}" >> "$env_file"
        fi
        log_success "Updated CLIENT_URL to $client_url"
    fi
}

function create_https_marker() {
    cat > "$DEPLOY_DIR/.https-config" <<EOF
# HTTPS Configuration (Tailscale Serve)
HTTPS_ENABLED=true
HTTPS_MODE=tailscale-serve
HTTPS_HOSTNAME=${TAILSCALE_HOSTNAME}
TAILSCALE_DNS=${TAILSCALE_DNS}
API_URL=https://${TAILSCALE_DNS}:${API_PORT}
CLIENT_URL=https://${TAILSCALE_DNS}
CONFIGURED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    chmod 600 "$DEPLOY_DIR/.https-config"
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

function uninstall_https() {
    log_info "Removing Tailscale Serve configuration..."

    tailscale serve reset 2>/dev/null || true

    # Remove marker file
    rm -f "$DEPLOY_DIR/.https-config"

    # Restore HTTP URL in env
    local env_file="$DEPLOY_DIR/.env.production"
    local hostname
    hostname=$(hostname | sed 's/\.local$//')

    if [[ -f "$env_file" ]]; then
        sed -i '' "s|^CLIENT_URL=.*|CLIENT_URL=http://${hostname}.local:8193|" "$env_file"
    fi

    log_success "HTTPS configuration removed"
    echo ""
    echo -e "${GREEN}Your application is now HTTP only:${NC}"
    echo -e "  http://${hostname}.local:8193"
    echo ""
    echo -e "${YELLOW}Note:${NC} You may need to rebuild the client for HTTP access:"
    echo -e "  ./deploy/scripts/setup-https-tailscale.sh --rebuild-http"
}

function display_success() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}     HTTPS Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}Access your application from your phone (Tailscale connected):${NC}"
    echo ""
    echo -e "  ${YELLOW}https://${TAILSCALE_DNS}/${NC}"
    echo ""
    echo -e "${BLUE}API endpoint:${NC}"
    echo -e "  https://${TAILSCALE_DNS}:${API_PORT}/"
    echo ""
    echo -e "${BLUE}Configuration saved to:${NC}"
    echo -e "  $DEPLOY_DIR/.https-config"
    echo ""
    echo -e "${BLUE}To rebuild client (if API calls fail):${NC}"
    echo -e "  ${YELLOW}./deploy/scripts/setup-https-tailscale.sh --rebuild${NC}"
    echo ""
    echo -e "${BLUE}To uninstall:${NC}"
    echo -e "  ${YELLOW}./deploy/scripts/setup-https-tailscale.sh --uninstall${NC}"
    echo ""
}

function main() {
    local do_rebuild=false
    local do_uninstall=false

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
    echo -e "${BLUE}     Planny-Flows HTTPS Setup (Tailscale)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    # Handle uninstall
    if [[ "$do_uninstall" == true ]]; then
        check_tailscale
        uninstall_https
        exit 0
    fi

    # Check prerequisites
    check_tailscale
    check_deployment

    # Configure Tailscale Serve
    configure_tailscale_serve

    # Update environment
    update_env_file

    # Rebuild if requested or if client might need it
    if [[ "$do_rebuild" == true ]]; then
        rebuild_client
        restart_app
    else
        echo ""
        echo -e "${YELLOW}Important:${NC} Your client may need to be rebuilt with the HTTPS API URL."
        echo -e "If you see connection errors, run:"
        echo -e "  ${YELLOW}./deploy/scripts/setup-https-tailscale.sh --rebuild${NC}"
    fi

    # Create marker
    create_https_marker

    # Show success
    display_success
}

# Run main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

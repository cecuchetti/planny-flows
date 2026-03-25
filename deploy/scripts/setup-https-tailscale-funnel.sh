#!/usr/bin/env bash
#
# setup-https-tailscale-funnel.sh - HTTPS using Tailscale Funnel (public URLs)
#
# This script configures Tailscale Funnel to provide public HTTPS access with
# automatic trusted certificates. Works from anywhere - no Tailscale needed on
# the client device!
#
# Usage:
#   ./setup-https-tailscale-funnel.sh              # Set up HTTPS
#   ./setup-https-tailscale-funnel.sh --rebuild    # Rebuild client
#   ./setup-https-tailscale-funnel.sh --uninstall  # Remove configuration
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
FUNNEL_URL=""

function usage() {
    cat <<EOM

Set up HTTPS for planny-flows using Tailscale Funnel (public URLs with trusted certs).

usage: ${SCRIPT_NAME} [options]

options:
    --rebuild          Rebuild client with Funnel URL
    --uninstall        Remove Funnel configuration
    -h|--help          Show this help message
    --version          Show version information

requirements:
    - Tailscale must be installed and running
    - Funnel must be enabled on your tailnet

examples:
    ${SCRIPT_NAME}              # Set up HTTPS via Tailscale Funnel
    ${SCRIPT_NAME} --rebuild    # Rebuild client
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

    # Check if Tailscale is running
    if ! tailscale status &>/dev/null; then
        log_error "Tailscale is not running"
        echo "  Start with: tailscale up"
        exit 1
    fi

    # Get hostname and DNS name
    local status
    status=$(tailscale status --json 2>/dev/null || echo "{}")

    TAILSCALE_HOSTNAME=$(echo "$status" | grep -o '"HostName":"[^"]*"' | head -1 | cut -d'"' -f4 || hostname | sed 's/\.local$//')
    TAILSCALE_DNS=$(echo "$status" | grep -o '"DNSName":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    if [[ -z "$TAILSCALE_DNS" ]]; then
        TAILSCALE_DNS="${TAILSCALE_HOSTNAME}.ts.net"
    fi

    # Remove trailing dot
    TAILSCALE_DNS="${TAILSCALE_DNS%.}"

    log_success "Tailscale is running"
    echo -e "  ${CYAN}Hostname:${NC} $TAILSCALE_HOSTNAME"
    echo -e "  ${CYAN}DNS:${NC} $TAILSCALE_DNS"

    return 0
}

function check_funnel_enabled() {
    log_info "Checking Funnel availability..."
    
    # Try a quick funnel status check
    if tailscale funnel status &>/dev/null 2>&1; then
        log_success "Funnel is available"
        return 0
    fi
    
    log_warning "Funnel may need to be enabled"
    echo ""
    echo -e "${YELLOW}To enable Funnel, visit:${NC}"
    echo "  https://login.tailscale.com/f/serve?node=$(tailscale status --json | grep -o '"ID":"[^"]*"' | head -1 | cut -d'"' -f4)"
    echo ""
    echo "Or run: tailscale funnel 443"
    echo ""
    read -r -p "Press Enter after enabling Funnel, or Ctrl+C to cancel..."
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

function stop_caddy() {
    log_info "Stopping existing Caddy process..."
    
    if pgrep -f "caddy run" &>/dev/null; then
        sudo pkill -f "caddy run" 2>/dev/null || true
        sleep 2
        log_success "Caddy stopped"
    fi
}

function configure_funnel() {
    log_info "Configuring Tailscale Funnel..."

    # Reset existing config
    tailscale funnel reset 2>/dev/null || true

    # Start Funnel for client port in background
    tailscale funnel --bg ${CLIENT_PORT} 2>&1 || {
        log_error "Failed to start Funnel"
        echo "Make sure Funnel is enabled on your tailnet"
        exit 1
    }

    # The funnel URL is based on the Tailscale DNS name
    FUNNEL_URL="https://${TAILSCALE_DNS}"

    log_success "Funnel configured"
    echo -e "  ${CYAN}Public URL:${NC} $FUNNEL_URL"
}

function update_env_file() {
    log_info "Updating environment file..."

    local env_file="$DEPLOY_DIR/.env.production"

    if [[ -f "$env_file" ]]; then
        if grep -q "^CLIENT_URL=" "$env_file"; then
            sed -i '' "s|^CLIENT_URL=.*|CLIENT_URL=${FUNNEL_URL}|" "$env_file"
        else
            echo "CLIENT_URL=${FUNNEL_URL}" >> "$env_file"
        fi
        log_success "Updated CLIENT_URL to $FUNNEL_URL"
    fi
    
    # Create config marker
    cat > "$DEPLOY_DIR/.https-config" <<EOF
# HTTPS Configuration (Tailscale Funnel)
HTTPS_ENABLED=true
HTTPS_MODE=tailscale-funnel
HTTPS_HOSTNAME=${TAILSCALE_HOSTNAME}
TAILSCALE_DNS=${TAILSCALE_DNS}
CLIENT_URL=${FUNNEL_URL}
API_URL=${FUNNEL_URL}
CONFIGURED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOTE=Public URL accessible from anywhere with trusted HTTPS
EOF
    chmod 600 "$DEPLOY_DIR/.https-config"
}

function rebuild_client() {
    log_info "Rebuilding client with Funnel URL..."

    cd "$PROJECT_DIR/client" || {
        log_error "Failed to change to client directory"
        exit 1
    }

    API_URL="$FUNNEL_URL" npm run build || {
        log_error "Client build failed"
        exit 1
    }

    log_info "Copying build to deployment..."
    rm -rf "$DEPLOY_DIR/client/build"/*
    mkdir -p "$DEPLOY_DIR/client/build"
    cp -r "$PROJECT_DIR/client/build"/* "$DEPLOY_DIR/client/build/"

    log_success "Client rebuilt with URL: $FUNNEL_URL"
}

function restart_app() {
    log_info "Restarting application..."

    if sudo launchctl list | grep -q "com.plannyflows"; then
        log_info "Restarting via launchd..."
        sudo launchctl kickstart -k system/com.plannyflows
        sleep 2
    else
        log_warning "Not running via launchd. Restart manually if needed."
    fi
}

function uninstall_funnel() {
    log_info "Removing Funnel configuration..."

    tailscale funnel reset 2>/dev/null || true

    rm -f "$DEPLOY_DIR/.https-config"

    local env_file="$DEPLOY_DIR/.env.production"
    local hostname
    hostname=$(hostname | sed 's/\.local$//')

    if [[ -f "$env_file" ]]; then
        sed -i '' "s|^CLIENT_URL=.*|CLIENT_URL=http://${hostname}.local:8193|" "$env_file"
    fi

    log_success "Funnel configuration removed"
}

function display_success() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}     HTTPS Setup Complete (Tailscale Funnel)!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}Access your application from ANY device (no Tailscale needed):${NC}"
    echo ""
    echo -e "  ${YELLOW}${FUNNEL_URL}${NC}"
    echo ""
    echo -e "${GREEN}✓ Trusted HTTPS certificates${NC}"
    echo -e "${GREEN}✓ Accessible from anywhere on the internet${NC}"
    echo -e "${GREEN}✓ No app installation needed on phone${NC}"
    echo ""
    echo -e "${BLUE}Configuration saved to:${NC}"
    echo -e "  $DEPLOY_DIR/.https-config"
    echo ""
    echo -e "${BLUE}To rebuild client:${NC}"
    echo -e "  ${YELLOW}./deploy/scripts/setup-https-tailscale-funnel.sh --rebuild${NC}"
    echo ""
    echo -e "${BLUE}To uninstall:${NC}"
    echo -e "  ${YELLOW}./deploy/scripts/setup-https-tailscale-funnel.sh --uninstall${NC}"
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
    echo -e "${BLUE}     Planny-Flows HTTPS Setup (Tailscale Funnel)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    if [[ "$do_uninstall" == true ]]; then
        check_tailscale
        uninstall_funnel
        exit 0
    fi

    check_tailscale
    check_funnel_enabled
    check_deployment
    stop_caddy
    configure_funnel
    update_env_file

    if [[ "$do_rebuild" == true ]]; then
        rebuild_client
        restart_app
    else
        echo ""
        echo -e "${YELLOW}Important:${NC} Your client may need to be rebuilt."
        echo -e "If you see connection errors, run:"
        echo -e "  ${YELLOW}./deploy/scripts/setup-https-tailscale-funnel.sh --rebuild${NC}"
    fi

    display_success
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

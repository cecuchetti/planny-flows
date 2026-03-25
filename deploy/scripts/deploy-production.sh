#!/usr/bin/env bash

#================================================================================
# Planny-Flows Production Deployment Script
#================================================================================
# Deploys built artifacts to production and restarts the launchd service.
# Assumes production environment is already set up via setup.sh.
#
# Usage: ./deploy-production.sh [options]
#
# Options:
#   -h|--help                  Show this help message
#   -v|--verbose               Enable verbose output
#   --skip-deps                Skip npm dependency installation
#   --skip-build               Skip building (assumes builds already exist)
#   --build-only               Only build, don't deploy
#   --deploy-only              Only deploy, don't build
#   --tailscale-funnel         Ensure Tailscale Funnel configuration is preserved
#   --version                  Show script version
#
# Examples:
#   ./deploy-production.sh                    # Build and deploy
#   ./deploy-production.sh --deploy-only      # Only deploy existing builds
#   ./deploy-production.sh --skip-deps        # Skip npm install
#   ./deploy-production.sh --tailscale-funnel # Ensure HTTPS config preserved
#
# Dependencies:
#   - Node.js >= 18
#   - npm
#   - sudo access for launchctl
#   - Existing production setup at ~/.planny-flows
#
#================================================================================

set -euo pipefail

# Script metadata
SCRIPT_NAME=$(basename "$0")
VERSION="1.0.0"

# Default configuration
VERBOSE=false
SKIP_DEPS=false
SKIP_BUILD=false
BUILD_ONLY=false
DEPLOY_ONLY=false
TAILSCALE_FUNNEL=false

# Environment variables (can be overridden)
export PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
export DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
export TEMPLATES_DIR="$PROJECT_ROOT/deploy/templates"
export CUSTOM_DIR="$PROJECT_ROOT/deploy/custom"
export API_PORT="${API_PORT:-3824}"
export CLIENT_PORT="${CLIENT_PORT:-8193}"
export LOG_DIR="${LOG_DIR:-$DEPLOY_DIR/logs}"

# Dependencies
DEPENDENCIES=(node npm curl sudo)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Logging levels
LOG_LEVEL="${LOG_LEVEL:-info}"

#================================================================================
# Helper Functions
#================================================================================

# Enable verbose output
function enable_verbose() {
    VERBOSE=true
    LOG_LEVEL="debug"
}

# Log messages with timestamp
function log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case "$level" in
        DEBUG)
            [[ "$LOG_LEVEL" == "debug" ]] && echo -e "${timestamp} [DEBUG] ${message}" >&2
            ;;
        INFO)
            echo -e "${timestamp} [INFO] ${message}"
            ;;
        WARN)
            echo -e "${timestamp} [WARN] ${message}" >&2
            ;;
        ERROR)
            echo -e "${timestamp} [ERROR] ${message}" >&2
            ;;
        SUCCESS)
            echo -e "${timestamp} [SUCCESS] ${message}"
            ;;
        *)
            echo -e "${timestamp} [${level}] ${message}"
            ;;
    esac
}

# Print colored output
function color_output() {
    local color="$1"
    shift
    local message="$*"
    echo -e "${color}${message}${NC}"
}

# Exit on error with detailed message
function exit_on_error() {
    local exit_code=$1
    shift
    local message="$*"

    log ERROR "$message"
    exit "$exit_code"
}

# Check if command exists
function command_exists() {
    command -v "$1" &>/dev/null
}

# Check dependencies
function check_dependencies() {
    log INFO "Checking required dependencies..."

    local missing_deps=()
    for cmd in "${DEPENDENCIES[@]}"; do
        if ! command_exists "$cmd"; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        exit_on_error 1 "Missing required dependencies: ${missing_deps[*]}"
    fi

    log SUCCESS "All dependencies are installed"
    return 0
}

# Check if Node.js is available and version is >= 18
function check_node_version() {
    log INFO "Checking Node.js version..."

    if ! command_exists node; then
        exit_on_error 1 "Node.js is not installed"
    fi

    local node_version
    node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    log DEBUG "Node.js version: $node_version"

    if [[ "$node_version" -lt 18 ]]; then
        exit_on_error 1 "Node.js version must be >= 18 (current: ${node_version})"
    fi

    log SUCCESS "Node.js version check passed"
    return 0
}

# Check if production environment is set up
function check_environment() {
    log INFO "Checking production environment..."

    if [[ ! -d "$DEPLOY_DIR" ]]; then
        exit_on_error 1 "Deployment directory not found at $DEPLOY_DIR"
        echo "Run ./deploy/setup.sh first to set up production environment."
    fi

    if [[ ! -f "$DEPLOY_DIR/.env.production" ]]; then
        log WARN ".env.production not found in deployment directory"
        log WARN "Some environment variables may be missing"
    fi

    if [[ ! -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
        log WARN "Launchd service plist not found at /Library/LaunchDaemons/com.plannyflows.plist"
        log WARN "The service may not be installed. Run ./deploy/setup.sh to install."
    fi

    log SUCCESS "Production environment check passed"
}

# Check Tailscale Funnel configuration
function check_tailscale_funnel() {
    log INFO "Checking Tailscale Funnel configuration..."

    local https_config="$DEPLOY_DIR/.https-config"
    if [[ -f "$https_config" ]]; then
        # shellcheck source=/dev/null
        source "$https_config" 2>/dev/null || true
        local https_enabled="${HTTPS_ENABLED:-false}"
        local https_mode="${HTTPS_MODE:-}"
        
        if [[ "$https_enabled" == "true" ]]; then
            log SUCCESS "HTTPS is enabled (mode: $https_mode)"
            
            if [[ "$https_mode" == "tailscale-funnel" ]]; then
                log INFO "Tailscale Funnel detected - preserving HTTPS configuration"
                # Ensure CLIENT_URL in .env.production matches Funnel URL
                local env_file="$DEPLOY_DIR/.env.production"
                if [[ -f "$env_file" ]] && grep -q "^CLIENT_URL=" "$env_file"; then
                    local current_url
                    current_url=$(grep "^CLIENT_URL=" "$env_file" | cut -d'=' -f2-)
                    log DEBUG "Current CLIENT_URL: $current_url"
                    # We don't modify it, just log
                fi
            fi
        fi
    else
        log INFO "No HTTPS configuration found (HTTP only)"
    fi
}

# Build the application
function build_application() {
    if [[ "$SKIP_BUILD" == true ]]; then
        log INFO "Skipping build (--skip-build)"
        return 0
    fi

    log INFO "Building application..."

    # Determine API_URL for client build
    local api_url="http://localhost:8193"  # Default to client proxy
    local env_file="$DEPLOY_DIR/.env.production"
    
    if [[ -f "$env_file" ]] && grep -q "^API_URL=" "$env_file"; then
        api_url=$(grep "^API_URL=" "$env_file" | cut -d'=' -f2- | sed 's/^"//;s/"$//')
        log INFO "Using API_URL from $env_file: $api_url"
    else
        log INFO "Using default API_URL: $api_url"
    fi
    
    export API_URL="$api_url"

    # Build API
    log INFO "Building API..."
    cd "$PROJECT_ROOT/api" || exit_on_error 1 "Failed to change to API directory"
    
    if [[ ! -d "build" ]]; then
        npm run build || exit_on_error 1 "API build failed"
    else
        log INFO "API build directory already exists, skipping build"
    fi

    # Build Client
    log INFO "Building Client..."
    cd "$PROJECT_ROOT/client" || exit_on_error 1 "Failed to change to Client directory"
    
    if [[ ! -d "build" ]]; then
        API_URL="$api_url" npm run build || exit_on_error 1 "Client build failed"
    else
        log INFO "Client build directory already exists, skipping build"
    fi

    cd "$PROJECT_ROOT" || exit_on_error 1 "Failed to return to project root"
    
    log SUCCESS "Application built successfully"
}

# Stop the production service
function stop_service() {
    log INFO "Stopping production service..."

    # Stop via launchd
    if [[ -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
        sudo launchctl bootout system/com.plannyflows 2>/dev/null || {
            log WARN "Failed to stop via launchd (maybe not running)"
        }
        log INFO "Service stopped via launchd"
    else
        log WARN "Launchd plist not found, trying to stop processes directly"
    fi

    # Stop any running processes directly
    local pids=()
    if [[ -f "$DEPLOY_DIR/pids/api.pid" ]]; then
        local pid
        pid=$(cat "$DEPLOY_DIR/pids/api.pid" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log DEBUG "Killing API process (PID: $pid)"
            kill "$pid" 2>/dev/null || true
            pids+=("$pid")
        fi
    fi

    if [[ -f "$DEPLOY_DIR/pids/client.pid" ]]; then
        local pid
        pid=$(cat "$DEPLOY_DIR/pids/client.pid" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log DEBUG "Killing Client process (PID: $pid)"
            kill "$pid" 2>/dev/null || true
            pids+=("$pid")
        fi
    fi

    # Clean up stale pid files
    rm -f "$DEPLOY_DIR/pids"/*.pid 2>/dev/null || true

    sleep 2

    if [[ ${#pids[@]} -gt 0 ]]; then
        log SUCCESS "Stopped ${#pids[@]} running processes"
    fi
}

# Copy built artifacts to deployment directory
function copy_artifacts() {
    log INFO "Copying built artifacts to deployment directory..."

    local api_source="$PROJECT_ROOT/api"
    local client_source="$PROJECT_ROOT/client"
    local api_dest="$DEPLOY_DIR/api"
    local client_dest="$DEPLOY_DIR/client"

    # Ensure destination directories exist
    mkdir -p "$api_dest" "$client_dest" || exit_on_error 1 "Failed to create deployment directories"

    # Copy API files
    log INFO "Copying API files..."
    if [[ ! -d "$api_source/build" ]]; then
        exit_on_error 1 "API build directory not found at $api_source/build"
    fi

    # Clean API destination except node_modules if it exists
    if [[ -d "$api_dest/build" ]]; then
        rm -rf "$api_dest/build" || exit_on_error 1 "Failed to clean API build directory"
    fi
    
    mkdir -p "$api_dest/build" || exit_on_error 1 "Failed to create API build directory"
    cp -r "$api_source/build"/* "$api_dest/build/" || exit_on_error 1 "Failed to copy API build files"
    
    # Copy required configuration files
    for file in tsconfig-paths.js tsconfig.json package.json package-lock.json; do
        if [[ -f "$api_source/$file" ]]; then
            cp "$api_source/$file" "$api_dest/" 2>/dev/null || true
        fi
    done
    
    log SUCCESS "API files copied"

    # Copy Client files
    log INFO "Copying Client files..."
    if [[ ! -d "$client_source/build" ]]; then
        exit_on_error 1 "Client build directory not found at $client_source/build"
    fi

    # Clean Client destination except node_modules if it exists
    if [[ -d "$client_dest/build" ]]; then
        rm -rf "$client_dest/build" || exit_on_error 1 "Failed to clean Client build directory"
    fi
    
    mkdir -p "$client_dest/build" || exit_on_error 1 "Failed to create Client build directory"
    cp -r "$client_source/build"/* "$client_dest/build/" || exit_on_error 1 "Failed to copy Client build files"
    
    # Copy required configuration files
    for file in server.js package.json package-lock.json; do
        if [[ -f "$client_source/$file" ]]; then
            cp "$client_source/$file" "$client_dest/" 2>/dev/null || true
        fi
    done
    
    log SUCCESS "Client files copied"
}

# Install production dependencies
function install_dependencies() {
    if [[ "$SKIP_DEPS" == true ]]; then
        log INFO "Skipping dependency installation (--skip-deps)"
        return 0
    fi

    log INFO "Installing production dependencies..."

    # Install API dependencies
    log INFO "Installing API dependencies..."
    cd "$DEPLOY_DIR/api" || exit_on_error 1 "Failed to change to API directory"
    
    # Only install if node_modules is missing or package.json changed
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        npm ci --omit=dev 2>/dev/null || npm install --omit=dev || exit_on_error 1 "Failed to install API dependencies"
        log SUCCESS "API dependencies installed"
    else
        log INFO "API dependencies already up to date"
    fi

    # Install Client dependencies
    log INFO "Installing Client dependencies..."
    cd "$DEPLOY_DIR/client" || exit_on_error 1 "Failed to change to Client directory"
    
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        npm ci --omit=dev 2>/dev/null || npm install --omit=dev || exit_on_error 1 "Failed to install Client dependencies"
        log SUCCESS "Client dependencies installed"
    else
        log INFO "Client dependencies already up to date"
    fi
}

# Update startup scripts from templates
function update_startup_scripts() {
    log INFO "Updating startup scripts from templates..."

    local hostname
    hostname=$(hostname | sed 's/\.local$//')

    # Generate start.sh from template
    if [[ -f "$TEMPLATES_DIR/start.sh" ]]; then
        sed -e "s|__PROJECT_DIR__|$DEPLOY_DIR|g" \
            -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
            -e "s|__HOSTNAME__|$hostname|g" \
            "$TEMPLATES_DIR/start.sh" > "$DEPLOY_DIR/start.sh" || exit_on_error 1 "Failed to generate start.sh"
        
        chmod +x "$DEPLOY_DIR/start.sh"
        log SUCCESS "Updated start.sh"
    else
        log WARN "start.sh template not found at $TEMPLATES_DIR/start.sh"
    fi

    # Check for custom launchd plist template first
    local launchd_template=""
    if [[ -f "$CUSTOM_DIR/launchd.plist" ]]; then
        launchd_template="$CUSTOM_DIR/launchd.plist"
        log INFO "Using custom launchd.plist template from $CUSTOM_DIR"
    elif [[ -f "$TEMPLATES_DIR/launchd.plist" ]]; then
        launchd_template="$TEMPLATES_DIR/launchd.plist"
        log INFO "Using standard launchd.plist template from $TEMPLATES_DIR"
    fi

    # Generate launchd plist from template if found
    if [[ -n "$launchd_template" ]]; then
        sed -e "s|__PROJECT_DIR__|$DEPLOY_DIR|g" \
            -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
            -e "s|__HOSTNAME__|$hostname|g" \
            "$launchd_template" > "$DEPLOY_DIR/com.plannyflows.plist" || exit_on_error 1 "Failed to generate launchd plist"
        
        log SUCCESS "Updated launchd plist"
        
        # Install to system location if different
        if [[ ! -f "/Library/LaunchDaemons/com.plannyflows.plist" ]] || \
           ! cmp -s "$DEPLOY_DIR/com.plannyflows.plist" "/Library/LaunchDaemons/com.plannyflows.plist"; then
            log INFO "Installing launchd plist to system..."
            sudo cp "$DEPLOY_DIR/com.plannyflows.plist" "/Library/LaunchDaemons/" || exit_on_error 1 "Failed to copy plist to system"
            sudo chown root:wheel "/Library/LaunchDaemons/com.plannyflows.plist"
            sudo chmod 644 "/Library/LaunchDaemons/com.plannyflows.plist"
            log SUCCESS "Launchd plist installed to system"
        fi
    else
        log INFO "No launchd.plist template found - skipping plist generation"
        log INFO "If you have a custom launchd setup, ensure /Library/LaunchDaemons/com.plannyflows.plist exists"
    fi
}

# Start the production service
function start_service() {
    log INFO "Starting production service..."

    if [[ ! -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
        log ERROR "Launchd plist not found at /Library/LaunchDaemons/com.plannyflows.plist"
        log ERROR "If you're deploying on macOS, you need to install the launchd service first."
        log ERROR "Run: sudo cp ~/.planny-flows/com.plannyflows.plist /Library/LaunchDaemons/"
        log ERROR "Or run './deploy/setup.sh' to generate the service file."
        exit 1
    fi

    sudo launchctl bootstrap system "/Library/LaunchDaemons/com.plannyflows.plist" || {
        log ERROR "Failed to start service via launchd"
        log ERROR "Check system logs: sudo launchctl print system/com.plannyflows"
        exit 1
    }

    log SUCCESS "Service started via launchd"
}

# Verify deployment
function verify_deployment() {
    log INFO "Verifying deployment..."

    local max_attempts=30
    local attempt=1
    local success=false

    while [[ $attempt -le $max_attempts ]]; do
        log DEBUG "Verification attempt $attempt/$max_attempts..."

        # Check API health
        local api_status
        api_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$API_PORT/health" 2>/dev/null || echo "000")

        # Check Client
        local client_status
        client_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$CLIENT_PORT" 2>/dev/null || echo "000")

        if [[ "$api_status" == "200" ]] && [[ "$client_status" == "200" ]]; then
            log SUCCESS "Deployment verified successfully!"
            log INFO "API: http://localhost:$API_PORT (HTTP $api_status)"
            log INFO "Client: http://localhost:$CLIENT_PORT (HTTP $client_status)"
            return 0
        fi

        log WARN "Deployment not yet ready (API: $api_status, Client: $client_status)"
        sleep 2
        ((attempt++))
    done

    log ERROR "Deployment verification failed after $max_attempts attempts"
    log WARN "Check logs at: $LOG_DIR"
    return 1
}

# Show deployment summary
function show_summary() {
    local hostname
    hostname=$(hostname | sed 's/\.local$//')

    color_output CYAN "\n╔══════════════════════════════════════════════════════════╗"
    color_output CYAN "║          Planny-Flows Production Deployment              ║"
    color_output CYAN "╚══════════════════════════════════════════════════════════╝"
    color_output CYAN ""
    color_output CYAN "  Deploy Directory:   $DEPLOY_DIR"
    color_output CYAN "  API Port:           $API_PORT"
    color_output CYAN "  Client Port:        $CLIENT_PORT"
    color_output CYAN "  Hostname:           $hostname.local"
    color_output CYAN ""

    # Check HTTPS configuration
    local https_enabled=false
    local tailscale_ip=""
    local https_mode=""

    if [[ -f "$DEPLOY_DIR/.https-config" ]]; then
        # shellcheck source=/dev/null
        source "$DEPLOY_DIR/.https-config" 2>/dev/null || true
        https_enabled="${HTTPS_ENABLED:-false}"
        tailscale_ip="${TAILSCALE_IP:-}"
        https_mode="${HTTPS_MODE:-}"
    fi

    color_output CYAN "  Access URLs:"
    color_output CYAN "    HTTP:    http://${hostname}.local:$CLIENT_PORT"
    color_output CYAN ""

    if [[ "$https_enabled" == "true" ]]; then
        color_output CYAN "    HTTPS:   https://${hostname}.local"
        if [[ -n "$tailscale_ip" ]]; then
            color_output CYAN "    Tailscale: https://$tailscale_ip"
        fi
        if [[ -n "$https_mode" ]]; then
            color_output CYAN "    Mode:     $https_mode"
        fi
        color_output CYAN ""
    fi

    color_output GREEN "  ✓ Production deployment completed successfully!"
    color_output CYAN ""
    color_output CYAN "  Use the following commands to manage the service:"
    color_output CYAN "    status.sh    - Check service status"
    color_output CYAN "    restart.sh   - Restart the service"
    color_output CYAN "    stop.sh      - Stop the service"
    color_output CYAN "    logs.sh      - View service logs"
    color_output CYAN ""
}

#================================================================================
# Main Function
#================================================================================

function main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h | --help)
                usage
                ;;
            -v | --verbose)
                enable_verbose
                ;;
            --skip-deps)
                SKIP_DEPS=true
                ;;
            --skip-build)
                SKIP_BUILD=true
                ;;
            --build-only)
                BUILD_ONLY=true
                ;;
            --deploy-only)
                DEPLOY_ONLY=true
                SKIP_BUILD=true
                ;;
            --tailscale-funnel)
                TAILSCALE_FUNNEL=true
                ;;
            --version)
                echo "$SCRIPT_NAME version $VERSION"
                exit 0
                ;;
            *)
                echo "Error: Unknown option '$1'" >&2
                usage
                ;;
        esac
        shift
    done

    color_output CYAN "\n╔══════════════════════════════════════════════════════════╗"
    color_output CYAN "║     Planny-Flows Production Deployment Script v${VERSION}    ║"
    color_output CYAN "╚══════════════════════════════════════════════════════════╝"
    color_output CYAN ""
    log INFO "Starting production deployment..."
    log INFO "Project Root: $PROJECT_ROOT"
    log INFO "Deploy Directory: $DEPLOY_DIR"
    color_output CYAN ""

    # Check dependencies
    check_dependencies || exit 1

    # Check Node.js version
    check_node_version || exit 1

    # Check environment
    check_environment || exit 1

    # Check Tailscale Funnel configuration
    check_tailscale_funnel

    # Build if needed
    if [[ "$DEPLOY_ONLY" != true ]]; then
        build_application || exit 1
    fi

    # Exit if build-only
    if [[ "$BUILD_ONLY" == true ]]; then
        color_output GREEN "\n✓ Build completed successfully (no deployment)"
        exit 0
    fi

    # Stop service
    stop_service

    # Copy artifacts
    copy_artifacts || exit 1

    # Install dependencies
    install_dependencies || exit 1

    # Update startup scripts from templates
    update_startup_scripts || exit 1

    # Start service
    start_service || exit 1

    # Verify deployment
    if ! verify_deployment; then
        color_output RED "\n✗ Deployment verification failed"
        exit 1
    fi

    # Show summary
    show_summary

    exit 0
}

# Usage function
function usage() {
    cat <<EOM

${CYAN}Planny-Flows Production Deployment Script v${VERSION}${NC}

Deploys built artifacts to production and restarts the launchd service.
Assumes production environment is already set up via setup.sh.

${BLUE}Usage:${NC}
    ${SCRIPT_NAME} [options]

${BLUE}Options:${NC}
    -h, --help          Show this help message
    -v, --verbose       Enable verbose output
    --skip-deps         Skip npm dependency installation
    --skip-build        Skip building (assumes builds already exist)
    --build-only        Only build, don't deploy
    --deploy-only       Only deploy, don't build
    --tailscale-funnel  Ensure Tailscale Funnel configuration is preserved
    --version           Show script version

${BLUE}Environment Variables:${NC}
    PROJECT_ROOT        Path to project root (default: auto-detected from script location)
    DEPLOY_DIR          Deployment directory (default: ~/.planny-flows)
    API_PORT            API port (default: 3824)
    CLIENT_PORT         Client port (default: 8193)
    LOG_DIR             Log directory (default: \$DEPLOY_DIR/logs)

${BLUE}Examples:${NC}
    ${SCRIPT_NAME}                    # Build and deploy
    ${SCRIPT_NAME} --deploy-only      # Only deploy existing builds
    ${SCRIPT_NAME} --skip-deps        # Skip npm install
    ${SCRIPT_NAME} --tailscale-funnel # Ensure HTTPS config preserved

${BLUE}Requirements:${NC}
    • Node.js >= 18
    • npm
    • sudo access for launchctl
    • Existing production setup at ~/.planny-flows

${BLUE}Related Scripts:${NC}
    setup.sh                         - Initial production setup

    status.sh                        - Check service status
    restart.sh                       - Restart the service
    stop.sh                          - Stop the service
    logs.sh                          - View service logs

EOM

    exit 0
}

# Make script executable
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit $?
fi

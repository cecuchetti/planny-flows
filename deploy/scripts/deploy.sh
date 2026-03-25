#!/usr/bin/env bash

#================================================================================
# Planny-Flows Deployment Automation Script
#================================================================================
# Automates the deployment of Planny-Flows application to production
# Supports both dev and production builds
#
# Usage: ./deploy.sh [options]
#
# Options:
#   -h|--help                  Show this help message
#   -p|--production            Deploy as production (default: development build)
#   -c|--check-only            Check if dev version works without deploying
#   -s|--skip-verify           Skip deployment verification steps
#   -v|--verbose               Enable verbose output
#   --version                  Show script version
#
# Examples:
#   ./deploy.sh                           # Check dev version and deploy if working
#   ./deploy.sh --production              # Deploy production build
#   ./deploy.sh --check-only              # Only check dev version
#   ./deploy.sh --production --verbose    # Deploy production with verbose logging
#
#================================================================================

# Script metadata
SCRIPT_NAME=$(basename "$0")
VERSION="2.0.0"

# Default configuration
DEPLOYMENT_MODE="development"
CHECK_ONLY=false
SKIP_VERIFY=false
VERBOSE=false
DRY_RUN=false

# Environment variables (can be overridden)
export PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
export SOURCE_DIR="${SOURCE_DIR:-$PROJECT_ROOT}"
export BUILD_TYPE="${BUILD_TYPE:-development}"
export API_PORT="${API_PORT:-3824}"
export CLIENT_PORT="${CLIENT_PORT:-8193}"
export LOG_DIR="${LOG_DIR:-$DEPLOY_DIR/logs}"

# Dependencies
DEPENDENCIES=(curl node npm git tar rsync)

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

# Create necessary directories
function create_directories() {
    log INFO "Creating deployment directories..."

    local dirs=(
        "$DEPLOY_DIR"
        "$DEPLOY_DIR/api"
        "$DEPLOY_DIR/client"
        "$DEPLOY_DIR/builds"
        "$DEPLOY_DIR/logs"
        "$DEPLOY_DIR/tmp"
        "$DEPLOY_DIR/pids"
    )

    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir" || exit_on_error 1 "Failed to create directory: $dir"
        fi
    done

    log SUCCESS "All directories created"
}

# Check if dev version is working
function check_dev_version() {
    log INFO "Checking if dev version is working..."

    local check_url="http://localhost:$CLIENT_PORT/project/my-jira-issues"

    if ! command_exists curl; then
        log WARN "curl not found, skipping health check"
        return 0
    fi

    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" "$check_url" 2>/dev/null || echo "000")

    log DEBUG "Dev version response code: $response_code"

    if [[ "$response_code" == "200" ]]; then
        log SUCCESS "Dev version is working (HTTP $response_code)"
        return 0
    else
        log WARN "Dev version not responding (HTTP $response_code)"
        log WARN "Please ensure the dev server is running before deploying"
        return 1
    fi
}

# Build the application
function build_application() {
    local build_type="$1"

    log INFO "Building $build_type application..."

    cd "$PROJECT_ROOT" || exit_on_error 1 "Failed to change to project directory"

    # Install dependencies if needed
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log INFO "Installing root dependencies..."
        npm install --silent || exit_on_error 1 "Failed to install root dependencies"
    fi

    # Build API
    log INFO "Building API..."
    cd "$PROJECT_ROOT/api" || exit_on_error 1 "Failed to change to API directory"

    if [[ ! -d "build" ]]; then
        npm run build || exit_on_error 1 "API build failed"
    else
        log DEBUG "API build directory already exists, skipping build"
    fi

    # Build Client
    log INFO "Building Client..."
    cd "$PROJECT_ROOT/client" || exit_on_error 1 "Failed to change to Client directory"

    if [[ ! -d "build" ]]; then
        npm run build || exit_on_error 1 "Client build failed"
    else
        log DEBUG "Client build directory already exists, skipping build"
    fi

    cd "$PROJECT_ROOT" || exit_on_error 1 "Failed to return to project root"

    log SUCCESS "$build_type application built successfully"
}

# Copy files to deployment directory
function copy_files() {
    log INFO "Copying files to deployment directory..."

    local api_source="$PROJECT_ROOT/api"
    local client_source="$PROJECT_ROOT/client"
    local api_dest="$DEPLOY_DIR/api"
    local client_dest="$DEPLOY_DIR/client"

    # Copy API files
    log INFO "Copying API files..."
    rsync -av --delete "$api_source/" "$api_dest/" || exit_on_error 1 "Failed to copy API files"
    log DEBUG "API files copied successfully"

    # Copy Client files
    log INFO "Copying Client files..."
    rsync -av --delete "$client_source/" "$client_dest/" || exit_on_error 1 "Failed to copy Client files"
    log DEBUG "Client files copied successfully"

    log SUCCESS "All files copied to deployment directory"
}

# Install production dependencies
function install_dependencies() {
    log INFO "Installing production dependencies..."

    local api_dir="$DEPLOY_DIR/api"
    local client_dir="$DEPLOY_DIR/client"

    # Install API dependencies
    log INFO "Installing API dependencies..."
    cd "$api_dir" || exit_on_error 1 "Failed to change to API directory"

    # Only install if node_modules is missing or outdated
    if [[ ! -d "node_modules" ]]; then
        npm install --production || exit_on_error 1 "Failed to install API dependencies"
    else
        log DEBUG "API dependencies already installed, skipping"
    fi

    # Install Client dependencies
    log INFO "Installing Client dependencies..."
    cd "$client_dir" || exit_on_error 1 "Failed to change to Client directory"

    if [[ ! -d "node_modules" ]]; then
        npm install --production || exit_on_error 1 "Failed to install Client dependencies"
    else
        log DEBUG "Client dependencies already installed, skipping"
    fi

    cd "$PROJECT_ROOT" || exit_on_error 1 "Failed to return to project root"

    log SUCCESS "Production dependencies installed"
}

# Prepare launchd plist
function prepare_launchd() {
    log INFO "Preparing launchd service configuration..."

    local plist_path="/Library/LaunchDaemons/com.plannyflows.plist"

    # Backup existing plist
    if [[ -f "$plist_path" ]]; then
        cp "$plist_path" "$plist_path.backup.$(date +%Y%m%d%H%M%S)" || exit_on_error 1 "Failed to backup plist"
        log DEBUG "Existing plist backed up"
    fi

    # Create new plist
    cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.plannyflows</string>

    <key>ProgramArguments</key>
    <array>
        <string>$PROJECT_ROOT/deploy/scripts/run.sh</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/launchd-out.log</string>

    <key>StandardErrorPath</key>
    <string>$LOG_DIR/launchd-error.log</string>

    <key>WorkingDirectory</key>
    <string>$DEPLOY_DIR</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>DEPLOY_DIR</key>
        <string>$DEPLOY_DIR</string>
        <key>API_PORT</key>
        <string>$API_PORT</string>
        <key>CLIENT_PORT</key>
        <string>$CLIENT_PORT</string>
        <key>LOG_LEVEL</key>
        <string>$LOG_LEVEL</string>
    </dict>
</dict>
</plist>
PLIST

    log SUCCESS "Launchd plist created at $plist_path"
}

# Stop any running service
function stop_service() {
    log INFO "Stopping any running Planny-Flows service..."

    # Stop via launchd
    sudo launchctl bootout system/com.plannyflows 2>/dev/null || true

    # Stop any running processes
    if [[ -f "$DEPLOY_DIR/pids/api.pid" ]]; then
        local pid
        pid=$(cat "$DEPLOY_DIR/pids/api.pid" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log DEBUG "Killing API process (PID: $pid)"
            kill "$pid" 2>/dev/null || true
        fi
    fi

    if [[ -f "$DEPLOY_DIR/pids/client.pid" ]]; then
        local pid
        pid=$(cat "$DEPLOY_DIR/pids/client.pid" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log DEBUG "Killing Client process (PID: $pid)"
            kill "$pid" 2>/dev/null || true
        fi
    fi

    sleep 2

    # Clean up stale pid files
    rm -f "$DEPLOY_DIR/pids"/*.pid 2>/dev/null || true

    log SUCCESS "Service stopped"
}

# Start the service
function start_service() {
    log INFO "Starting Planny-Flows service..."

    # Load launchd service
    sudo launchctl bootstrap system "$PROJECT_ROOT/deploy/scripts/run.sh" 2>/dev/null || exit_on_error 1 "Failed to load launchd service"

    log SUCCESS "Service started"
}

# Verify deployment
function verify_deployment() {
    if [[ "$SKIP_VERIFY" == true ]]; then
        log INFO "Skipping deployment verification"
        return 0
    fi

    log INFO "Verifying deployment..."

    local max_attempts=30
    local attempt=1
    local success=false

    while [[ $attempt -le $max_attempts ]]; do
        log DEBUG "Verification attempt $attempt/$max_attempts..."

        # Check API health
        local api_status
        api_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$API_PORT/health 2>/dev/null || echo "000")

        # Check Client
        local client_status
        client_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$CLIENT_PORT 2>/dev/null || echo "000")

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
    log WARN "Check logs at: $LOG_DIR/launchd-error.log"
    return 1
}

# Show deployment summary
function show_summary() {
    local hostname
    hostname=$(hostname | sed 's/\.local$//')

    color_output CYAN "\n╔══════════════════════════════════════════════════════════╗"
    color_output CYAN "║          Planny-Flows Deployment Summary                 ║"
    color_output CYAN "╚══════════════════════════════════════════════════════════╝"
    color_output CYAN ""
    color_output CYAN "  Build Type:        $BUILD_TYPE"
    color_output CYAN "  Deploy Directory:   $DEPLOY_DIR"
    color_output CYAN "  API Port:           $API_PORT"
    color_output CYAN "  Client Port:        $CLIENT_PORT"
    color_output CYAN "  Hostname:           $hostname.local"
    color_output CYAN ""

    local https_enabled=false
    local tailscale_ip=""

    if [[ -f "$DEPLOY_DIR/.https-config" ]]; then
        # shellcheck source=/dev/null
        source "$DEPLOY_DIR/.https-config" 2>/dev/null || true
        https_enabled="${HTTPS_ENABLED:-false}"
        tailscale_ip="${TAILSCALE_IP:-}"
    fi

    color_output CYAN "  Access URLs:"
    color_output CYAN "    HTTP:    http://${hostname}.local:$CLIENT_PORT"
    color_output CYAN ""

    if [[ "$https_enabled" == "true" ]]; then
        color_output CYAN "    HTTPS:   https://${hostname}.local"
        if [[ -n "$tailscale_ip" ]]; then
            color_output CYAN "    Tailscale: https://$tailscale_ip"
        fi
        color_output CYAN ""
    fi

    color_output GREEN "  ✓ Deployment completed successfully!"
    color_output CYAN ""
    color_output CYAN "  Use the following commands to manage the service:"
    color_output CYAN "    status.sh    - Check service status"
    color_output CYAN "    restart.sh   - Restart the service"
    color_output CYAN "    stop.sh      - Stop the service"
    color_output CYAN ""
}

#================================================================================
# Main Function
#================================================================================

function main() {
    # Parse command line arguments
    while [[ "$1" != "" ]]; do
        case $1 in
            -h | --help)
                usage
                ;;
            -p | --production)
                BUILD_TYPE="production"
                ;;
            -c | --check-only)
                CHECK_ONLY=true
                ;;
            -s | --skip-verify)
                SKIP_VERIFY=true
                ;;
            -v | --verbose)
                VERBOSE=true
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

    # Setup verbose mode
    if [[ "$VERBOSE" == true ]]; then
        LOG_LEVEL="debug"
    fi

    color_output CYAN "\n╔══════════════════════════════════════════════════════════╗"
    color_output CYAN "║          Planny-Flows Deployment Script v${VERSION}         ║"
    color_output CYAN "╚══════════════════════════════════════════════════════════╝"
    color_output CYAN ""
    log INFO "Starting deployment..."
    log INFO "Mode: $BUILD_TYPE"
    log INFO "Project Root: $PROJECT_ROOT"
    log INFO "Deploy Directory: $DEPLOY_DIR"
    color_output CYAN ""

    # Check dependencies
    check_dependencies || exit 1

    # Check Node.js version
    check_node_version || exit 1

    # Create directories
    create_directories || exit 1

    # Check dev version if not in production mode or check-only
    if [[ "$BUILD_TYPE" == "development" ]] && [[ "$CHECK_ONLY" == false ]]; then
        if ! check_dev_version; then
            color_output YELLOW "\n⚠ Dev version check failed. Please ensure the dev server is running."
            color_output YELLOW "You can manually start the dev server with: npm run start:production"
            exit 1
        fi
    fi

    # If check-only mode, just return success
    if [[ "$CHECK_ONLY" == true ]]; then
        color_output GREEN "\n✓ Dev version check passed"
        color_output CYAN "  No deployment performed in check-only mode"
        exit 0
    fi

    # Stop any running service
    stop_service

    # Build application
    build_application "$BUILD_TYPE"

    # Copy files
    copy_files

    # Install dependencies
    install_dependencies

    # Prepare launchd
    prepare_launchd

    # Start service
    start_service

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

${CYAN}Planny-Flows Deployment Automation Script v${VERSION}${NC}

Automates the deployment of Planny-Flows application to production
Supports both development and production builds.

${BLUE}Usage:${NC}
    ${SCRIPT_NAME} [options]

${BLUE}Options:${NC}
    -h, --help          Show this help message
    -p, --production    Deploy as production build (default: development)
    -c, --check-only    Only check if dev version works without deploying
    -s, --skip-verify   Skip deployment verification steps
    -v, --verbose       Enable verbose output
    --version           Show script version

${BLUE}Environment Variables:${NC}
    PROJECT_ROOT        Path to project root (default: auto-detected from script location)
    DEPLOY_DIR          Deployment directory (default: ~/.planny-flows)
    API_PORT            API port (default: 3824)
    CLIENT_PORT         Client port (default: 8193)
    LOG_DIR             Log directory (default: $DEPLOY_DIR/logs)

${BLUE}Examples:${NC}
    ${SCRIPT_NAME}                      # Check dev version and deploy if working
    ${SCRIPT_NAME} --production         # Deploy production build
    ${SCRIPT_NAME} --check-only         # Only check dev version
    ${SCRIPT_NAME} --production --verbose # Deploy production with verbose logging

${BLUE}Requirements:${NC}
    • Node.js >= 18
    • npm
    • curl
    • git
    • tar
    • rsync

${BLUE}Dependencies:${NC}
    ${DEPENDENCIES[*]}

${BLUE}Related Scripts:${NC}
    status.sh      - Check service status
    restart.sh     - Restart the service
    stop.sh        - Stop the service
    logs.sh        - View service logs

EOM

    exit 0
}

# Make script executable
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit $?
fi

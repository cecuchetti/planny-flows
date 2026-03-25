#!/usr/bin/env bash

DEPENDENCIES=(node npm openssl)
SCRIPT_NAME=$(basename "$0")
VERSION="1.0.0"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ -n "${NO_COLOR:-}" ]] || [[ "${TERM:-}" == "dumb" ]]; then
    RED=""
    GREEN=""
    YELLOW=""
    BLUE=""
    NC=""
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
TEMPLATES_DIR="$PROJECT_DIR/deploy/templates"
CUSTOM_DIR="$PROJECT_DIR/deploy/custom"
HOSTNAME=$(hostname | sed 's/\.local$//')

# OS detection
OS="$(uname -s)"
case "$OS" in
    Linux*)     OS_TYPE="linux";;
    Darwin*)    OS_TYPE="macos";;
    *)          OS_TYPE="unknown"
esac

function usage() {
    cat <<EOM

Prepare planny-flows for production (macOS/Linux).

usage: ${SCRIPT_NAME} [options]

options:
    --skip-build          Skip the build step (use existing builds)
    -h|--help             Show this help message
    --version             Show version information

dependencies: ${DEPENDENCIES[*]}

examples:
    ${SCRIPT_NAME}
    ${SCRIPT_NAME} --skip-build

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

function check_prerequisites() {
    echo -e "${YELLOW}[1/8] Checking prerequisites...${NC}"

    NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
    if [[ -z "$NODE_VERSION" || "$NODE_VERSION" -lt 25 ]]; then
        echo -e "${RED}✗ Node.js 25+ is required. Current: $(node -v 2>/dev/null || echo 'not installed')${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

    if ! command -v npm &> /dev/null; then
        echo -e "${RED}✗ npm is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ npm $(npm -v)${NC}"

    if [[ ! -d "$PROJECT_DIR/api" || ! -d "$PROJECT_DIR/client" ]]; then
        echo -e "${RED}✗ Project structure not found at $PROJECT_DIR${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Project directory: $PROJECT_DIR${NC}"
}

function create_directory_structure() {
    echo -e "${YELLOW}[2/8] Creating directory structure...${NC}"

    mkdir -p "$DEPLOY_DIR"/{api,client,data,logs,pids} || {
        echo -e "${RED}✗ Failed to create directory structure${NC}" >&2
        exit 1
    }
    chmod 700 "$DEPLOY_DIR"
    echo -e "${GREEN}✓ Created $DEPLOY_DIR${NC}"
    echo -e "  - api/     (API server files)"
    echo -e "  - client/  (Client server files)"
    echo -e "  - data/    (SQLite database)"
    echo -e "  - logs/    (Application logs)"
    echo -e "  - pids/    (Process IDs)"
}

function generate_configuration() {
    echo -e "${YELLOW}[3/8] Generating production configuration...${NC}"

    JWT_SECRET=$(openssl rand -base64 32) || {
        echo -e "${RED}✗ Failed to generate JWT secret${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ Generated secure JWT_SECRET${NC}"

    sed -e "s|__HOSTNAME__|$HOSTNAME|g" \
        -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
        -e "s|__JWT_SECRET__|$JWT_SECRET|g" \
        "$TEMPLATES_DIR/env.production" > "$DEPLOY_DIR/.env.production" || {
        echo -e "${RED}✗ Failed to generate .env.production${NC}" >&2
        exit 1
    }
    chmod 600 "$DEPLOY_DIR/.env.production"
    echo -e "${GREEN}✓ Created $DEPLOY_DIR/.env.production${NC}"
}

function install_dependencies() {
    echo -e "${YELLOW}[4/8] Installing dependencies...${NC}"

    cd "$PROJECT_DIR" || {
        echo -e "${RED}✗ Failed to change to project directory${NC}" >&2
        exit 1
    }

    if [[ -f "package.json" ]]; then
        npm ci 2>/dev/null || npm install 2>/dev/null || true
    fi

    cd "$PROJECT_DIR/api" || {
        echo -e "${RED}✗ Failed to change to API directory${NC}" >&2
        exit 1
    }
    npm ci || npm install || {
        echo -e "${RED}✗ Failed to install API dependencies${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ API dependencies installed${NC}"

    cd "$PROJECT_DIR/client" || {
        echo -e "${RED}✗ Failed to change to client directory${NC}" >&2
        exit 1
    }
    npm ci || npm install || {
        echo -e "${RED}✗ Failed to install client dependencies${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ Client dependencies installed${NC}"
}

function build_application() {
    if [[ "$SKIP_BUILD" == true ]]; then
        echo -e "${YELLOW}[5/8] Skipping build (--skip-build)${NC}"
        return
    fi

    echo -e "${YELLOW}[5/8] Building application...${NC}"

    cd "$PROJECT_DIR/api" || {
        echo -e "${RED}✗ Failed to change to API directory${NC}" >&2
        exit 1
    }
    npm run build || {
        echo -e "${RED}✗ API build failed${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ API built${NC}"

    cd "$PROJECT_DIR/client" || {
        echo -e "${RED}✗ Failed to change to client directory${NC}" >&2
        exit 1
    }
    API_URL="http://${HOSTNAME}.local:3824" npm run build || {
        echo -e "${RED}✗ Client build failed${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ Client built${NC}"
}

function copy_production_files() {
    echo -e "${YELLOW}[6/8] Copying production files...${NC}"

    echo -e "  Copying API..."
    rm -rf "$DEPLOY_DIR/api"/* || true
    mkdir -p "$DEPLOY_DIR/api/build" || {
        echo -e "${RED}✗ Failed to create API build directory${NC}" >&2
        exit 1
    }
    cp -r "$PROJECT_DIR/api/build"/* "$DEPLOY_DIR/api/build/" || {
        echo -e "${RED}✗ Failed to copy API build files${NC}" >&2
        exit 1
    }
    cp "$PROJECT_DIR/api/tsconfig-paths.js" "$DEPLOY_DIR/api/" 2>/dev/null || true
    cp "$PROJECT_DIR/api/tsconfig.json" "$DEPLOY_DIR/api/" 2>/dev/null || true
    cp "$PROJECT_DIR/api/package.json" "$DEPLOY_DIR/api/" || {
        echo -e "${RED}✗ Failed to copy API package.json${NC}" >&2
        exit 1
    }
    cp "$PROJECT_DIR/api/package-lock.json" "$DEPLOY_DIR/api/" 2>/dev/null || true

    cd "$DEPLOY_DIR/api" || {
        echo -e "${RED}✗ Failed to change to deployed API directory${NC}" >&2
        exit 1
    }
    npm ci --omit=dev 2>/dev/null || npm install --omit=dev || {
        echo -e "${RED}✗ Failed to install API production dependencies${NC}" >&2
        exit 1
    }

    npm rebuild better-sqlite3 2>/dev/null || true
    echo -e "${GREEN}✓ API files copied to $DEPLOY_DIR/api/${NC}"

    echo -e "  Copying Client..."
    rm -rf "$DEPLOY_DIR/client"/* || true
    mkdir -p "$DEPLOY_DIR/client/build" || {
        echo -e "${RED}✗ Failed to create client build directory${NC}" >&2
        exit 1
    }
    cp -r "$PROJECT_DIR/client/build"/* "$DEPLOY_DIR/client/build/" || {
        echo -e "${RED}✗ Failed to copy client build files${NC}" >&2
        exit 1
    }
    cp "$PROJECT_DIR/client/server.js" "$DEPLOY_DIR/client/" || {
        echo -e "${RED}✗ Failed to copy client server.js${NC}" >&2
        exit 1
    }
    cp "$PROJECT_DIR/client/package.json" "$DEPLOY_DIR/client/" || {
        echo -e "${RED}✗ Failed to copy client package.json${NC}" >&2
        exit 1
    }
    cp "$PROJECT_DIR/client/package-lock.json" "$DEPLOY_DIR/client/" 2>/dev/null || true

    cd "$DEPLOY_DIR/client" || {
        echo -e "${RED}✗ Failed to change to deployed client directory${NC}" >&2
        exit 1
    }
    npm ci --omit=dev 2>/dev/null || npm install --omit=dev || {
        echo -e "${RED}✗ Failed to install client production dependencies${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ Client files copied to $DEPLOY_DIR/client/${NC}"
}

function generate_startup_scripts() {
    echo -e "${YELLOW}[7/8] Generating startup scripts...${NC}"

    sed -e "s|__PROJECT_DIR__|$DEPLOY_DIR|g" \
        -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
        -e "s|__HOSTNAME__|$HOSTNAME|g" \
        "$TEMPLATES_DIR/start.sh" > "$DEPLOY_DIR/start.sh" || {
        echo -e "${RED}✗ Failed to generate start.sh${NC}" >&2
        exit 1
    }
    chmod +x "$DEPLOY_DIR/start.sh"
    echo -e "${GREEN}✓ Created startup script${NC}"

    # Generate service file based on OS
    if [[ "$OS_TYPE" == "macos" ]]; then
        local LAUNCHD_TEMPLATE=""
        if [[ -f "$CUSTOM_DIR/launchd.plist" ]]; then
            LAUNCHD_TEMPLATE="$CUSTOM_DIR/launchd.plist"
            echo -e "${YELLOW}⚠ Using custom launchd template from $CUSTOM_DIR/launchd.plist${NC}"
        elif [[ -f "$TEMPLATES_DIR/launchd.plist" ]]; then
            LAUNCHD_TEMPLATE="$TEMPLATES_DIR/launchd.plist"
        fi
        
        if [[ -n "$LAUNCHD_TEMPLATE" ]]; then
            sed -e "s|__PROJECT_DIR__|$DEPLOY_DIR|g" \
                -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
                -e "s|__HOSTNAME__|$HOSTNAME|g" \
                "$LAUNCHD_TEMPLATE" > "$DEPLOY_DIR/com.plannyflows.plist" || {
                echo -e "${RED}✗ Failed to generate launchd plist${NC}" >&2
                exit 1
            }
            echo -e "${GREEN}✓ Created launchd plist${NC}"
            LAUNCHD_TEMPLATE_EXISTS=true
        else
            echo -e "${YELLOW}⚠ macOS launchd template not found - skipping service file generation${NC}"
            echo -e "${YELLOW}  You can create a custom launchd plist for local macOS setup in $CUSTOM_DIR/${NC}"
            LAUNCHD_TEMPLATE_EXISTS=false
        fi
    elif [[ "$OS_TYPE" == "linux" ]]; then
        # Get current user and group for systemd service
        local SERVICE_USER="${SUDO_USER:-$USER}"
        local SERVICE_GROUP=$(id -gn "$SERVICE_USER" 2>/dev/null || echo "$SERVICE_USER")
        
        sed -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
            -e "s|__USER__|$SERVICE_USER|g" \
            -e "s|__GROUP__|$SERVICE_GROUP|g" \
            "$TEMPLATES_DIR/planny-flows.service" > "$DEPLOY_DIR/planny-flows.service" || {
            echo -e "${RED}✗ Failed to generate systemd service file${NC}" >&2
            exit 1
        }
        echo -e "${GREEN}✓ Created systemd service file${NC}"
    else
        echo -e "${YELLOW}⚠ Unknown OS: $OS_TYPE - Skipping service file generation${NC}"
        echo -e "${YELLOW}  You'll need to manually create a service file for your system${NC}"
    fi
}

function display_instructions() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}     Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${BLUE}Production files deployed to:${NC}"
    echo -e "  $DEPLOY_DIR/"
    echo -e "  ├── api/          (API server)"
    echo -e "  ├── client/       (Client server)"
    echo -e "  ├── data/         (SQLite database)"
    echo -e "  ├── logs/         (Application logs)"
    echo -e "  ├── pids/         (Process IDs)"
    echo -e "  ├── .env.production"
    echo -e "  └── start.sh"
    
    # Show generated service file
    if [[ "$OS_TYPE" == "macos" ]]; then
        if [[ -f "$DEPLOY_DIR/com.plannyflows.plist" ]]; then
            echo -e "  └── com.plannyflows.plist  (launchd service)"
        fi
    elif [[ "$OS_TYPE" == "linux" ]]; then
        echo -e "  └── planny-flows.service   (systemd service)"
    fi
    echo ""

    echo -e "${BLUE}Next steps:${NC}"
    echo ""

    # Service installation instructions based on OS
    echo -e "  ${YELLOW}1. Install the system service (requires password):${NC}"
    if [[ "$OS_TYPE" == "macos" ]]; then
        if [[ -f "$DEPLOY_DIR/com.plannyflows.plist" ]]; then
            echo -e "     sudo cp $DEPLOY_DIR/com.plannyflows.plist /Library/LaunchDaemons/"
            echo -e "     sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist"
        else
            echo -e "     ⚠ macOS launchd service file not generated"
            echo -e "     Create a custom launchd plist for local macOS setup if needed"
        fi
    elif [[ "$OS_TYPE" == "linux" ]]; then
        echo -e "     sudo cp $DEPLOY_DIR/planny-flows.service /etc/systemd/system/"
        echo -e "     sudo systemctl daemon-reload"
        echo -e "     sudo systemctl enable planny-flows.service"
        echo -e "     sudo systemctl start planny-flows.service"
    else
        echo -e "     ⚠ Unknown OS: Create service file manually for your system"
    fi
    echo ""

    echo -e "  ${YELLOW}2. Access your application:${NC}"
    if [[ "$OS_TYPE" == "macos" ]]; then
        echo -e "     http://${HOSTNAME}.local:8193"
    else
        echo -e "     http://localhost:8193"
        echo -e "     or http://$(hostname -I | awk '{print $1}' 2>/dev/null || echo 'server-ip'):8193"
    fi
    echo ""

    # HTTPS setup (optional)
    if [[ "$OS_TYPE" == "macos" ]]; then
        echo -e "  ${YELLOW}3. For HTTPS (optional):${NC}"
        echo -e "     ./deploy/scripts/setup-https.sh"
        echo ""
    fi

    echo -e "  ${YELLOW}4. Useful commands:${NC}"
    if [[ "$OS_TYPE" == "macos" ]]; then
        echo -e "     Status:  ./deploy/scripts/status.sh"
        echo -e "     Logs:    ./deploy/scripts/logs.sh"
        echo -e "     Stop:    sudo launchctl bootout system/com.plannyflows"
        echo -e "     Start:   sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist"
    elif [[ "$OS_TYPE" == "linux" ]]; then
        echo -e "     Status:  sudo systemctl status planny-flows"
        echo -e "     Logs:    sudo journalctl -u planny-flows -f"
        echo -e "     Stop:    sudo systemctl stop planny-flows"
        echo -e "     Start:   sudo systemctl start planny-flows"
        echo -e "     Restart: sudo systemctl restart planny-flows"
    fi
    echo ""

    echo -e "  ${YELLOW}5. From other devices on your network:${NC}"
    if [[ "$OS_TYPE" == "macos" ]]; then
        echo -e "     Open: http://${HOSTNAME}.local:8193"
    else
        local server_ip=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "SERVER_IP")
        echo -e "     Open: http://${server_ip}:8193"
        echo -e "     (Replace ${server_ip} with your server's actual IP address)"
    fi
    echo ""
}

function main() {
    local SKIP_BUILD=false

    while [ "$1" != "" ]; do
        case $1 in
        --skip-build)
            SKIP_BUILD=true
            ;;
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

    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}     Planny-Flows Production Setup (${OS_TYPE})${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    check_prerequisites
    create_directory_structure
    generate_configuration
    install_dependencies
    build_application
    copy_production_files
    generate_startup_scripts

    display_instructions
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

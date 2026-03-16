#!/bin/bash
# setup.sh - Prepare planny-flows for production on macOS
# Usage: ./setup.sh [--skip-build]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$HOME/.planny-flows"
TEMPLATES_DIR="$PROJECT_DIR/deploy/templates"
HOSTNAME=$(hostname | sed 's/\.local$//')
SKIP_BUILD=false

# Parse arguments
if [[ "$1" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     Planny-Flows Production Setup for macOS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────
# SECTION 1: Prerequisites Check
# ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"

NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [[ -z "$NODE_VERSION" || "$NODE_VERSION" -lt 18 ]]; then
  echo -e "${RED}✗ Node.js 18+ is required. Current: $(node -v 2>/dev/null || echo 'not installed')${NC}"
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

# ─────────────────────────────────────────────────────────────────────
# SECTION 2: Create Directory Structure
# ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/7] Creating directory structure...${NC}"

mkdir -p "$DEPLOY_DIR"/{data,logs,pids}
chmod 700 "$DEPLOY_DIR"
echo -e "${GREEN}✓ Created $DEPLOY_DIR${NC}"
echo -e "  - data/  (SQLite database)"
echo -e "  - logs/  (Application logs)"
echo -e "  - pids/  (Process IDs)"

# ─────────────────────────────────────────────────────────────────────
# SECTION 3: Generate Configuration
# ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/7] Generating production configuration...${NC}"

JWT_SECRET=$(openssl rand -base64 32)
echo -e "${GREEN}✓ Generated secure JWT_SECRET${NC}"

# Generate .env.production from template
sed -e "s|__HOSTNAME__|$HOSTNAME|g" \
    -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
    -e "s|__JWT_SECRET__|$JWT_SECRET|g" \
    "$TEMPLATES_DIR/env.production" > "$DEPLOY_DIR/.env.production"
chmod 600 "$DEPLOY_DIR/.env.production"
echo -e "${GREEN}✓ Created $DEPLOY_DIR/.env.production${NC}"

# ─────────────────────────────────────────────────────────────────────
# SECTION 4: Install Dependencies
# ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/7] Installing dependencies...${NC}"

cd "$PROJECT_DIR"

if [[ -f "package.json" ]]; then
  npm ci 2>/dev/null || npm install 2>/dev/null || true
fi

cd "$PROJECT_DIR/api"
npm ci || npm install
echo -e "${GREEN}✓ API dependencies installed${NC}"

cd "$PROJECT_DIR/client"
npm ci || npm install
echo -e "${GREEN}✓ Client dependencies installed${NC}"

# ─────────────────────────────────────────────────────────────────────
# SECTION 5: Build Application
# ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == true ]]; then
  echo -e "${YELLOW}[5/7] Skipping build (--skip-build)${NC}"
else
  echo -e "${YELLOW}[5/7] Building application...${NC}"
  
  cd "$PROJECT_DIR/api"
  npm run build
  echo -e "${GREEN}✓ API built${NC}"
  
  cd "$PROJECT_DIR/client"
  API_URL="http://${HOSTNAME}.local:3000" npm run build
  echo -e "${GREEN}✓ Client built${NC}"
fi

# ─────────────────────────────────────────────────────────────────────
# SECTION 6: Generate Startup Scripts
# ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/7] Generating startup scripts...${NC}"

# Generate start.sh from template
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
    -e "s|__HOSTNAME__|$HOSTNAME|g" \
    "$TEMPLATES_DIR/start.sh" > "$DEPLOY_DIR/start.sh"
chmod +x "$DEPLOY_DIR/start.sh"
echo -e "${GREEN}✓ Created startup script${NC}"

# Generate launchd plist from template (no JWT_SECRET - loaded from .env)
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
    -e "s|__HOSTNAME__|$HOSTNAME|g" \
    "$TEMPLATES_DIR/launchd.plist" > "$DEPLOY_DIR/com.plannyflows.plist"
echo -e "${GREEN}✓ Created launchd plist${NC}"

# ─────────────────────────────────────────────────────────────────────
# SECTION 7: Display Instructions
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}     Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  ${YELLOW}1. Install the system service (requires password):${NC}"
echo -e "     sudo cp $DEPLOY_DIR/com.plannyflows.plist /Library/LaunchDaemons/"
echo -e "     sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist"
echo ""
echo -e "  ${YELLOW}2. Access your application:${NC}"
echo -e "     http://${HOSTNAME}.local:8081"
echo ""
echo -e "  ${YELLOW}3. Useful commands:${NC}"
echo -e "     Status:  ./deploy/scripts/status.sh"
echo -e "     Logs:    ./deploy/scripts/logs.sh"
echo -e "     Stop:    sudo launchctl bootout system/com.plannyflows"
echo -e "     Start:   sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist"
echo ""
echo -e "  ${YELLOW}4. From other devices on your network:${NC}"
echo -e "     Open: http://${HOSTNAME}.local:8081"
echo ""
echo -e "${BLUE}Configuration files:${NC}"
echo -e "  - Environment: $DEPLOY_DIR/.env.production"
echo -e "  - Database:    $DEPLOY_DIR/data/jira.sqlite"
echo -e "  - Logs:        $DEPLOY_DIR/logs/"
echo ""

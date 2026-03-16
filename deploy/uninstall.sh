#!/bin/bash
# uninstall.sh - Remove planny-flows production setup

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PLIST_PATH="/Library/LaunchDaemons/com.plannyflows.plist"
DEPLOY_DIR="$HOME/.planny-flows"

echo -e "${YELLOW}Uninstalling Planny-Flows production setup...${NC}"
echo ""

# Stop and remove service
if [[ -f "$PLIST_PATH" ]]; then
  echo -e "${YELLOW}Stopping launchd service...${NC}"
  sudo launchctl bootout system/com.plannyflows 2>/dev/null || true
  sudo rm -f "$PLIST_PATH"
  echo -e "${GREEN}✓ Service removed${NC}"
fi

# Kill any running processes
if [[ -f "$DEPLOY_DIR/pids/api.pid" ]]; then
  kill $(cat "$DEPLOY_DIR/pids/api.pid") 2>/dev/null || true
fi
if [[ -f "$DEPLOY_DIR/pids/client.pid" ]]; then
  kill $(cat "$DEPLOY_DIR/pids/client.pid") 2>/dev/null || true
fi

# Ask about data removal
echo ""
echo -e "${YELLOW}Do you want to remove the data directory?${NC}"
echo -e "  This will delete your database and logs."
echo -e "  Path: $DEPLOY_DIR"
echo ""
read -p "Remove data? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "$DEPLOY_DIR"
  echo -e "${GREEN}✓ Data directory removed${NC}"
else
  echo -e "${BLUE}Data directory preserved at $DEPLOY_DIR${NC}"
fi

echo ""
echo -e "${GREEN}Uninstall complete!${NC}"

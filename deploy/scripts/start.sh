#!/usr/bin/env bash
# start.sh - Manually start planny-flows

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"

if [[ -f "$DEPLOY_DIR/start.sh" ]]; then
  "$DEPLOY_DIR/start.sh"
else
  echo "Error: Setup not complete. Run ./deploy/setup.sh first."
  exit 1
fi

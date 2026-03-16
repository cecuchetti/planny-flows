#!/bin/bash
# stop.sh - Stop planny-flows services

DEPLOY_DIR="$HOME/.planny-flows"
PID_DIR="$DEPLOY_DIR/pids"

echo "Stopping Planny-Flows..."

# Stop via launchd if installed
if [[ -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
  sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist 2>/dev/null || true
  echo "Stopped via launchd"
else
  # Manual stop via PID files
  if [[ -f "$PID_DIR/api.pid" ]]; then
    PID=$(cat "$PID_DIR/api.pid")
    kill $PID 2>/dev/null && echo "API stopped (PID: $PID)" || echo "API not running"
    rm -f "$PID_DIR/api.pid"
  fi
  
  if [[ -f "$PID_DIR/client.pid" ]]; then
    PID=$(cat "$PID_DIR/client.pid")
    kill $PID 2>/dev/null && echo "Client stopped (PID: $PID)" || echo "Client not running"
    rm -f "$PID_DIR/client.pid"
  fi
fi

echo "Done"

#!/bin/bash
# status.sh - Check planny-flows service status

DEPLOY_DIR="/Users/ecuchetti/.planny-flows"
PID_DIR="$DEPLOY_DIR/pids"

echo "Planny-Flows Status"
echo "═══════════════════"
echo ""

# Check launchd service
if [[ -f "/Library/LaunchDaemons/com.plannyflows.plist" ]]; then
  echo "Launchd Service: Installed"
  sudo launchctl print system/com.plannyflows 2>/dev/null | grep -E "(state|pid)" || echo "  Status: Not running"
else
  echo "Launchd Service: Not installed"
fi

echo ""

# Check processes via PID files
echo "Processes:"
if [[ -f "$PID_DIR/api.pid" ]]; then
  PID=$(cat "$PID_DIR/api.pid")
  if kill -0 $PID 2>/dev/null; then
    echo "  API:    Running (PID: $PID)"
  else
    echo "  API:    Stale PID file"
  fi
else
  echo "  API:    Not running"
fi

if [[ -f "$PID_DIR/client.pid" ]]; then
  PID=$(cat "$PID_DIR/client.pid")
  if kill -0 $PID 2>/dev/null; then
    echo "  Client: Running (PID: $PID)"
  else
    echo "  Client: Stale PID file"
  fi
else
  echo "  Client: Not running"
fi

echo ""

# Check health endpoints
echo "Health Checks:"
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
if [[ "$API_HEALTH" == "200" ]]; then
  echo "  API:    Healthy ✓"
else
  echo "  API:    Not responding (HTTP $API_HEALTH)"
fi

CLIENT_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081 2>/dev/null || echo "000")
if [[ "$CLIENT_HEALTH" == "200" ]]; then
  echo "  Client: Healthy ✓"
else
  echo "  Client: Not responding (HTTP $CLIENT_HEALTH)"
fi

echo ""

# Show access URL
HOSTNAME=$(hostname | sed 's/\.local$//')
echo "Access URL: http://${HOSTNAME}.local:8081"

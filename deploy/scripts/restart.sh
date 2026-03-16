#!/bin/bash
# restart.sh - Restart the planny-flows launchd service

set -e

HOSTNAME=$(hostname | sed 's/\.local$//')

echo "=== Restarting Planny-Flows Service ==="
echo ""

echo "1. Stopping service..."
sudo launchctl bootout system/com.plannyflows 2>/dev/null || true
sleep 2

echo "2. Starting service..."
sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist

echo "3. Waiting for service to start..."
sleep 5

echo "4. Checking status..."
API_HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null || echo "FAILED")
CLIENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081 2>/dev/null || echo "000")

echo "API Health: $API_HEALTH"
echo "Client HTTP: $CLIENT_STATUS"

if [[ "$CLIENT_STATUS" == "200" ]]; then
    echo ""
    echo "✓ Service is running!"
    echo "Access at: http://${HOSTNAME}.local:8081"
else
    echo ""
    echo "✗ Service failed to start. Check logs:"
    echo "  tail -20 /Users/ecuchetti/.planny-flows/logs/launchd-error.log"
fi

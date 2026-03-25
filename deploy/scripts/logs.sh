#!/usr/bin/env bash
# logs.sh - View planny-flows logs

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
LOG_DIR="$DEPLOY_DIR/logs"

if [[ ! -d "$LOG_DIR" ]]; then
  echo "No logs directory found. Run setup first."
  exit 1
fi

echo "Available logs:"
echo ""
ls -la "$LOG_DIR"
echo ""
echo "Commands:"
echo "  tail -f $LOG_DIR/api.log         # API logs"
echo "  tail -f $LOG_DIR/client.log      # Client logs"
echo "  tail -f $LOG_DIR/*.log           # All logs"
echo ""
echo "Opening all logs (Ctrl+C to exit)..."
tail -f "$LOG_DIR"/*.log

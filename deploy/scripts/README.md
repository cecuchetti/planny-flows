# Planny-Flows Deployment Automation

This directory contains deployment automation scripts for Planny-Flows application.

## Scripts

### `deploy.sh` - Main Deployment Script

Automates the entire deployment process of Planny-Flows application to production.

#### Features

- **Automatic Dev Version Check**: Verifies if the dev version is working before deploying
- **Build Automation**: Automatically builds API and Client if needed
- **Idempotent Deployment**: Safe to run multiple times without issues
- **Production/Development Builds**: Support for both deployment modes
- **Comprehensive Error Handling**: Detailed error messages and logging
- **Launchd Integration**: Automatically sets up launchd service
- **Verification Steps**: Validates successful deployment
- **Verbose Logging**: Detailed output for debugging

#### Usage

```bash
# Check dev version and deploy if working (development build)
./deploy.sh

# Deploy as production build
./deploy.sh --production

# Only check dev version without deploying
./deploy.sh --check-only

# Deploy production build with verbose output
./deploy.sh --production --verbose

# Skip deployment verification steps
./deploy.sh --skip-verify
```

#### Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-p, --production` | Deploy as production build (default: development) |
| `-c, --check-only` | Only check if dev version works without deploying |
| `-s, --skip-verify` | Skip deployment verification steps |
| `-v, --verbose` | Enable verbose output |
| `--version` | Show script version |

#### Environment Variables

You can customize the deployment by setting environment variables:

```bash
export PROJECT_ROOT="/path/to/planny-flows"
export DEPLOY_DIR="/path/to/deployment/directory"
export API_PORT="3824"
export CLIENT_PORT="8193"
export LOG_DIR="/path/to/logs"

./deploy.sh --production
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT` | auto-detected (script location) | Path to project root |
| `DEPLOY_DIR` | `~/.planny-flows` | Deployment directory |
| `API_PORT` | `3824` | API port |
| `CLIENT_PORT` | `8193` | Client port |
| `LOG_DIR` | `$DEPLOY_DIR/logs` | Log directory |

#### Example Deployment Flow

```bash
# 1. Navigate to project directory
cd /path/to/planny-flows

# 2. Make deploy script executable (if not already)
chmod +x deploy/scripts/deploy.sh

# 3. Check if dev version is working
./deploy/scripts/deploy.sh --check-only

# 4. Deploy to production
./deploy/scripts/deploy.sh --production

# 5. Verify deployment status
./deploy/scripts/status.sh
```

### `run.sh` - Launchd Run Script

This script is started by launchd and runs the API and Client servers. It handles:

- Starting both API and Client services
- Managing process IDs
- Logging to separate files
- Graceful shutdown handling
- Port conflict detection

## Deployment Process

The deployment script follows these steps:

1. **Dependency Check**: Verifies all required tools are installed
2. **Node.js Version Check**: Ensures Node.js >= 18 is available
3. **Directory Creation**: Creates necessary deployment directories
4. **Dev Version Check**: (if development mode) Verifies dev server is working
5. **Service Stop**: Stops any running Planny-Flows service
6. **Build Application**: Builds API and Client if needed
7. **File Copy**: Copies files to deployment directory
8. **Dependency Install**: Installs production dependencies
9. **Launchd Setup**: Creates and loads launchd plist
10. **Service Start**: Starts the service via launchd
11. **Verification**: Verifies deployment is successful
12. **Summary**: Displays deployment summary and access URLs

## Error Handling

The script includes comprehensive error handling:

- **Missing Dependencies**: Fails with clear message if required tools are missing
- **Build Failures**: Stops deployment if build fails
- **File Copy Errors**: Provides detailed error messages
- **Dependency Install Failures**: Halts deployment if dependencies can't be installed
- **Service Start Failures**: Attempts to diagnose and report issues
- **Verification Failures**: Detailed error messages with log file locations

## Logging

All operations are logged to `$LOG_DIR/run.log`:

```bash
# View deployment logs
tail -f $LOG_DIR/run.log

# View API logs
tail -f $LOG_DIR/api.log

# View Client logs
tail -f $LOG_DIR/client.log

# View launchd logs
tail -f $LOG_DIR/launchd-error.log
```

## Management Scripts

### `status.sh` - Check Service Status

```bash
# Check if service is running
./deploy/scripts/status.sh
```

Displays:
- Launchd service status
- Process status (API and Client)
- Health check results
- HTTPS configuration status
- Access URLs

### `restart.sh` - Restart Service

```bash
# Restart the Planny-Flows service
./deploy/scripts/restart.sh
```

Stops and restarts the service with verification.

### `stop.sh` - Stop Service

```bash
# Stop the Planny-Flows service
./deploy/scripts/stop.sh
```

Stops the launchd service and background processes.

### `logs.sh` - View Logs

```bash
# View all logs
./deploy/scripts/logs.sh

# View specific log file
./deploy/scripts/logs.sh api
./deploy/scripts/logs.sh client
./deploy/scripts/logs.sh launchd
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
./deploy/scripts/status.sh

# View launchd logs
tail -20 $LOG_DIR/launchd-error.log

# Check if ports are in use
lsof -i :3824
lsof -i :8193
```

### Build Fails

```bash
# Clean build directories
rm -rf $DEPLOY_DIR/api/build
rm -rf $DEPLOY_DIR/client/build

# Rebuild
./deploy/scripts/deploy.sh --production --verbose
```

### Port Already in Use

```bash
# Kill process using port
kill $(lsof -ti :3824)
kill $(lsof -ti :8193)

# Then restart
./deploy/scripts/restart.sh
```

### Permissions Issues

```bash
# Make scripts executable
chmod +x deploy/scripts/*.sh

# Fix plist permissions
sudo chmod 644 /Library/LaunchDaemons/com.plannyflows.plist
sudo chown root:wheel /Library/LaunchDaemons/com.plannyflows.plist
```

## Idempotency

The deployment script is designed to be idempotent:

- **Multiple Runs**: Safe to run multiple times without issues
- **Build Detection**: Skips build if already built
- **File Sync**: Uses rsync with --delete flag to ensure consistency
- **Dependency Check**: Only installs dependencies if not present

## Launchd Service

The launchd plist is created at `/Library/LaunchDaemons/com.plannyflows.plist`.

**Features:**
- Runs as system daemon
- Auto-starts on boot
- Auto-restarts if crashed
- Separate log files for stdout/stderr
- Environment variables for configuration

**Management:**

```bash
# Load service
sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist

# Unload service
sudo launchctl bootout system/com.plannyflows

# Print service status
sudo launchctl print system/com.plannyflows

# Restart service
./deploy/scripts/restart.sh
```

## Requirements

- **Node.js**: >= 18
- **npm**: Latest version
- **curl**: For health checks
- **git**: For version control
- **tar**: For file operations
- **rsync**: For file synchronization

All requirements are automatically checked by the deployment script.

## Security Considerations

- Production dependencies are installed (not devDependencies)
- Source code is deployed, not bundled
- Separation between dev and production environments
- Environment variables for sensitive configuration
- Separate log files prevent information leakage

## Version Compatibility

The deployment script is compatible with:
- macOS (all recent versions)
- Node.js >= 18
- Planny-Flows v1.0.0+

## Support

For issues or questions:
1. Check the logs: `$LOG_DIR/run.log`
2. Run status check: `./deploy/scripts/status.sh`
3. Use verbose mode: `./deploy/scripts/deploy.sh --verbose`
4. Review troubleshooting section above

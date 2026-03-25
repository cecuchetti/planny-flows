# Planny-Flows Deployment Quick Reference

## ⚡ Quick Start

```bash
# Deploy to production
./deploy/scripts/deploy.sh --production

# Check if dev version works before deploying
./deploy/scripts/deploy.sh --check-only

# View service status
./deploy/scripts/status.sh

# Restart service
./deploy/scripts/restart.sh
```

## 🚀 Production Deployment

For simple production deployments (after initial setup), use the dedicated production deployment script:

```bash
# Deploy to production (builds and deploys)
./deploy/scripts/deploy-production.sh

# Only deploy existing builds (skip building)
./deploy/scripts/deploy-production.sh --deploy-only

# Preserve Tailscale Funnel HTTPS configuration
./deploy/scripts/deploy-production.sh --tailscale-funnel
```

This script stops the service, copies built artifacts, updates startup scripts from templates, and restarts the service.


## 📋 Deployment Checklist

### Pre-Deployment
- [ ] Dev version is working (`http://localhost:8193/project/my-jira-issues`)
- [ ] All code changes are committed
- [ ] Build artifacts are up to date
- [ ] Node.js >= 18 is installed

### During Deployment
- [ ] Dependencies are installed
- [ ] Build completes successfully
- [ ] Files are copied to deployment directory
- [ ] Production dependencies are installed
- [ ] Launchd plist is configured
- [ ] Service starts successfully

### Post-Deployment
- [ ] Health checks pass (API: 200, Client: 200)
- [ ] Access URLs are accessible
- [ ] Logs are being written
- [ ] No errors in launchd logs

## 🔍 Common Commands

### Check Status
```bash
./deploy/scripts/status.sh
```

### View Logs
```bash
# All logs
./deploy/scripts/logs.sh

# API logs only
./deploy/scripts/logs.sh api

# Client logs only
./deploy/scripts/logs.sh client

# Launchd logs
./deploy/scripts/logs.sh launchd

# Real-time monitoring
tail -f $LOG_DIR/run.log
tail -f $LOG_DIR/api.log
tail -f $LOG_DIR/client.log
```

### Service Management
```bash
# Restart service
./deploy/scripts/restart.sh

# Stop service
./deploy/scripts/stop.sh

# Reload launchd configuration
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist
```

## 🐛 Troubleshooting

### Service Won't Start
```bash
# Check status
./deploy/scripts/status.sh

# View launchd logs
tail -50 $LOG_DIR/launchd-error.log

# Check port conflicts
lsof -i :3824
lsof -i :8193

# Kill port conflicts and restart
kill $(lsof -ti :3824) 2>/dev/null || true
kill $(lsof -ti :8193) 2>/dev/null || true
./deploy/scripts/restart.sh
```

### Build Fails
```bash
# Clean build directories
rm -rf $DEPLOY_DIR/api/build
rm -rf $DEPLOY_DIR/client/build

# Rebuild with verbose output
./deploy/scripts/deploy.sh --production --verbose
```

### Verification Fails
```bash
# Skip verification (for testing)
./deploy/scripts/deploy.sh --skip-verify

# Check service manually
curl http://localhost:3824/health
curl http://localhost:8193
```

## 📊 Environment Variables

Customize deployment by setting environment variables:

```bash
export DEPLOY_DIR="/custom/path"
export API_PORT="3824"
export CLIENT_PORT="8193"

./deploy/scripts/deploy.sh --production
```

## 📝 Access URLs

After successful deployment:

```
HTTP:  http://hostname.local:8193
API:   http://hostname.local:3824
Health: http://hostname.local:3824/health
```

## 🔄 Deployment Flow

```
1. Check Dependencies
   ├─ Node.js version
   ├─ Required tools (curl, npm, git, etc.)
   └─ Installation checks

2. Verify Dev Version
   ├─ Check dev server health
   └─ Confirm functionality

3. Stop Service
   ├─ Stop launchd service
   ├─ Kill existing processes
   └─ Clean up stale PIDs

4. Build Application
   ├─ Install root dependencies
   ├─ Build API (TypeScript → JavaScript)
   └─ Build Client (Webpack)

5. Deploy Files
   ├─ Copy API files
   ├─ Copy Client files
   └─ Sync directories

6. Install Dependencies
   ├─ Install API dependencies (production only)
   └─ Install Client dependencies (production only)

7. Configure Launchd
   ├─ Create plist file
   ├─ Configure environment
   └─ Set permissions

8. Start Service
   ├─ Load launchd service
   └─ Start background processes

9. Verify Deployment
   ├─ Check API health endpoint
   ├─ Check Client HTTP response
   └─ Confirm both return 200

10. Display Summary
    ├─ Show build type
    ├─ Display access URLs
    └─ List management commands
```

## 📞 Getting Help

1. Run status check: `./deploy/scripts/status.sh`
2. View logs: `./deploy/scripts/logs.sh`
3. Use verbose mode: `./deploy/scripts/deploy.sh --verbose`
4. Check troubleshooting section

## 📚 Related Files

- `deploy.sh` - Main deployment automation script
- `run.sh` - Launchd run script (started by launchd)
- `status.sh` - Check service status
- `restart.sh` - Restart service
- `stop.sh` - Stop service
- `logs.sh` - View logs

## ✅ Success Indicators

After successful deployment, you should see:

```
✓ Service is running!
Access at: http://hostname.local:8193
```

And verified by:

```
API Health: 200
Client HTTP: 200
```

## 🚨 Critical Failures

If you see these errors, deployment failed:

```
✗ Deployment verification failed
✗ API build failed
✗ Client build failed
✗ Failed to install dependencies
✗ Service failed to start
```

Check logs at: `$LOG_DIR/run.log`

---

**Last Updated**: March 24, 2026
**Version**: 2.0.0

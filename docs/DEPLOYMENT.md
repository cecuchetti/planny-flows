# Planny-Flows Production Deployment Guide

> **Platform:** macOS (Local Network Server)  
> **Runtime:** Node.js 18+  
> **Database:** SQLite  
> **Process Manager:** launchd (System Service)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [Step-by-Step Deployment](#step-by-step-deployment)
6. [Configuration](#configuration)
7. [Service Management](#service-management)
8. [Accessing the Application](#accessing-the-application)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance](#maintenance)
11. [Uninstallation](#uninstallation)
12. [File Reference](#file-reference)

---

## Overview

Planny-Flows is a full-stack application consisting of:

| Component | Technology | Port | Purpose |
|-----------|------------|------|---------|
| **API** | Express + TypeScript | 3824 | Backend REST API |
| **Client** | React + Vite | 8193 | Frontend web application |
| **Database** | SQLite | — | Persistent data storage |

This deployment guide covers setting up Planny-Flows as a production service on macOS that:

- ✅ Starts automatically on system boot
- ✅ Restarts automatically if it crashes
- ✅ Is accessible from other devices on the local network
- ✅ Uses minimal system resources (no Docker required)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         macOS System                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    launchd (System Service)                  │   │
│   │                    com.plannyflows.plist                     │   │
│   │                                                              │   │
│   │   Runs at boot │ Auto-restart on crash │ Root privileges    │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    start.sh (Wrapper)                        │   │
│   │                                                              │   │
│   │   • Loads environment from .env.production                   │   │
│   │   • Starts API and Client processes                          │   │
│   │   • Monitors health and exits if either dies                 │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                      │                    │                          │
│                      ▼                    ▼                          │
│   ┌───────────────────────┐  ┌───────────────────────┐              │
│   │   API Server          │  │   Client Server       │              │
│   │   (Express/Node.js)   │  │   (Static file server)│              │
│   │   Port: 3824          │  │   Port: 8193          │              │
│   │   Bind: 0.0.0.0       │  │   Bind: 0.0.0.0       │              │
│   └───────────────────────┘  └───────────────────────┘              │
│              │                           │                           │
│              ▼                           ▼                           │
│   ┌───────────────────────┐  ┌───────────────────────┐              │
│   │   SQLite Database     │  │   React Build         │              │
│   │   ~/.planny-flows/    │  │   (Static Files)      │              │
│   │   data/jira.sqlite    │  │                       │              │
│   └───────────────────────┘  └───────────────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Local Network Access                            │
│                                                                      │
│   http://your-macbook.local:8193  ◄─── Other devices on LAN        │
│   http://localhost:8193           ◄─── Local access                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **launchd over PM2/Docker** | Native macOS solution, no additional dependencies, runs at boot before user login |
| **LaunchDaemon over LaunchAgent** | Runs as system service, starts before any user logs in |
| **SQLite over PostgreSQL** | Simpler setup, no separate database server, sufficient for personal use |
| **0.0.0.0 binding** | Allows access from other devices on the local network |
| **Embedded env vars in plist** | LaunchDaemons run as root with no $HOME defined; embedded vars ensure consistency |

---

## Prerequisites

### System Requirements

| Requirement | Details |
|-------------|---------|
| **Operating System** | macOS 12 (Monterey) or later |
| **Node.js** | Version 18.0.0 or higher |
| **npm** | Version 8.0.0 or higher |
| **Disk Space** | ~500MB for dependencies + database |
| **Memory** | ~200MB idle, ~500MB under load |

### Check Prerequisites

```bash
# Check Node.js version (must be 18+)
node -v

# Check npm version
npm -v

# Check project structure
ls -la api/ client/
```

### Network Prerequisites

For access from other devices on your local network:

1. **Find your Mac's hostname:**
   ```bash
   hostname
   # Example: MacBook-Pro.local
   ```

2. **Ensure firewall allows incoming connections:**
   - System Settings → Network → Firewall
   - Allow incoming connections for Node.js

3. **All devices must be on the same network** (same WiFi or LAN)

---

## Quick Start

For those who want to get up and running quickly:

```bash
# 1. Run the automated setup script
cd /path/to/planny-flows
./deploy/setup.sh

# 2. Install the system service (requires password)
sudo cp ~/.planny-flows/com.plannyflows.plist /Library/LaunchDaemons/
sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist

# 3. Verify the service is running
curl -s http://localhost:3824/health
curl -s http://localhost:8193

# 4. Access the application
# Local:    http://localhost:8193
# Network:  http://your-macbook.local:8193
```

---

## Step-by-Step Deployment

### Step 1: Prepare the Environment

```bash
# Navigate to project directory
cd /path/to/planny-flows

# Ensure you're on the correct branch
git status
```

### Step 2: Run Setup Script

The setup script handles:
- ✓ Prerequisites verification
- ✓ Directory structure creation
- ✓ JWT secret generation
- ✓ Environment configuration
- ✓ Dependency installation
- ✓ Production builds
- ✓ Startup script creation
- ✓ launchd plist generation

```bash
# Run the setup script
./deploy/setup.sh
```

**Expected output:**
```
═══════════════════════════════════════════════════════════
     Planny-Flows Production Setup for macOS
═══════════════════════════════════════════════════════════

[1/8] Checking prerequisites...
✓ Node.js v20.x.x
✓ npm 10.x.x
✓ Project directory: /path/to/planny-flows

[2/8] Creating directory structure...
✓ Created /Users/you/.planny-flows
  - data/  (SQLite database)
  - logs/  (Application logs)
  - pids/  (Process IDs)

[3/8] Generating production configuration...
✓ Generated secure JWT_SECRET
✓ Created /Users/you/.planny-flows/.env.production

[4/8] Installing dependencies...
✓ API dependencies installed
✓ Client dependencies installed

[5/8] Building application...
✓ API built
✓ Client built

[6/8] Creating startup script...
✓ Created startup script

[7/8] Installing launchd service...
✓ Created launchd plist

[8/8] Display Instructions

═══════════════════════════════════════════════════════════
     Setup Complete!
═══════════════════════════════════════════════════════════
```

### Step 3: Install the System Service

```bash
# Copy the plist to the system LaunchDaemons directory
sudo cp ~/.planny-flows/com.plannyflows.plist /Library/LaunchDaemons/

# Load and start the service
sudo launchctl bootstrap system /Library/LaunchDaemons/com.plannyflows.plist
```

**Alternative commands (older macOS versions):**
```bash
sudo launchctl load /Library/LaunchDaemons/com.plannyflows.plist
```

### Step 4: Verify Deployment

```bash
# Check the service status
sudo launchctl print system/com.plannyflows

# Test API health endpoint
curl -s http://localhost:3824/health

# Test client server
curl -s -o /dev/null -w "%{http_code}" http://localhost:8193
# Expected: 200

# Check process status
./deploy/scripts/status.sh
```

---

## Configuration

### Environment Variables

Configuration is stored in `~/.planny-flows/.env.production`:

```bash
# --- Server ---
PORT=3824
CLIENT_URL=http://your-macbook.local:8193

# --- Database (SQLite) ---
DB_TYPE=sqlite
DB_PATH=/Users/your-username/.planny-flows/data/jira.sqlite

# --- Security ---
JWT_SECRET=<auto-generated-secure-string>
NODE_ENV=production
```

### Updating Configuration

1. **Edit the environment file:**
   ```bash
   nano ~/.planny-flows/.env.production
   ```

2. **Restart the service:**
   ```bash
   sudo launchctl kickstart -k system/com.plannyflows
   ```

### Network Configuration

The application binds to `0.0.0.0` to accept connections from any network interface. CORS is configured to allow requests from:

- `localhost` and `127.0.0.1`
- Local network IPs (`192.168.x.x`, `10.x.x.x`)
- `.local` hostnames (Bonjour/mDNS)

---

## Service Management

### Using launchctl (Recommended)

```bash
# Check service status
sudo launchctl print system/com.plannyflows

# Stop the service
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist

# Start the service
sudo launchctl load /Library/LaunchDaemons/com.plannyflows.plist

# Restart the service
sudo launchctl kickstart -k system/com.plannyflows

# Disable auto-start on boot
sudo launchctl disable system/com.plannyflows

# Enable auto-start on boot
sudo launchctl enable system/com.plannyflows
```

### Using Helper Scripts

```bash
# Check status
./deploy/scripts/status.sh

# View logs
./deploy/scripts/logs.sh

# Restart service
./deploy/scripts/restart-service.sh

# Stop services manually
./deploy/scripts/stop.sh

# Start services manually (without launchd)
./deploy/scripts/start.sh
```

### Manual Process Management

```bash
# Start manually (for debugging)
~/.planny-flows/start.sh

# Find running processes
ps aux | grep -E "node.*planny"

# Kill specific process
kill $(cat ~/.planny-flows/pids/api.pid)
kill $(cat ~/.planny-flows/pids/client.pid)
```

---

## Accessing the Application

### Local Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8193 |
| API | http://localhost:3824 |
| Health Check | http://localhost:3824/health |

### Network Access (from other devices)

| Service | URL |
|---------|-----|
| Frontend | http://your-macbook.local:8193 |
| API | http://your-macbook.local:3824 |

> **Note:** Replace `your-macbook` with your actual hostname. Find it with `hostname | sed 's/\.local$//'`

### Network Access Requirements

1. **Same Network:** Both devices must be on the same WiFi/LAN
2. **Mac Awake:** The Mac must not be in sleep mode
3. **Firewall:** Allow incoming connections for Node.js

### Preventing Sleep (Optional)

To keep your Mac awake for continuous access:

```bash
# Prevent sleep while on battery
sudo pmset -b powernap 0

# Set display sleep to never (when plugged in)
sudo pmset -c displaysleep 0

# Or use caffeinate for temporary prevention
caffeinate -d  # Prevent display sleep
```

---

## Troubleshooting

### Common Issues and Solutions

#### Service Won't Start

**Symptom:** `launchctl print` shows service is not running

**Diagnosis:**
```bash
# Check launchd logs
tail -100 ~/.planny-flows/logs/launchd-error.log

# Check if plist is valid
plutil -lint /Library/LaunchDaemons/com.plannyflows.plist

# Check permissions
ls -la ~/.planny-flows/start.sh
```

**Solutions:**
```bash
# Ensure script is executable
chmod +x ~/.planny-flows/start.sh

# Reload the service
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist
sudo launchctl load /Library/LaunchDaemons/com.plannyflows.plist
```

---

#### API Fails to Start

**Symptom:** API health check returns error

**Diagnosis:**
```bash
# Check API logs
tail -100 ~/.planny-flows/logs/api-error.log
tail -100 ~/.planny-flows/logs/api.log

# Check if port is in use
lsof -i :3824
```

**Common Causes:**

| Issue | Solution |
|-------|----------|
| Port 3824 in use | `kill $(lsof -t -i :3824)` |
| Database path error | Check `DB_PATH` in `.env.production` |
| Missing dependencies | `cd api && npm ci` |
| Build missing | `cd api && npm run build` |

---

#### Client Fails to Start

**Symptom:** Client server returns error

**Diagnosis:**
```bash
# Check client logs
tail -100 ~/.planny-flows/logs/client-error.log

# Check if port is in use
lsof -i :8193
```

**Solutions:**
```bash
# Kill process on port 8193
kill $(lsof -t -i :8193)

# Rebuild client
cd client && npm run build
```

---

#### Cannot Access from Network

**Symptom:** Works locally but not from other devices

**Diagnosis:**
```bash
# Check if server binds to all interfaces
lsof -i :3824 -i :8193 | grep LISTEN
# Should show *.3824 and *.8193, not localhost:3824

# Check firewall status
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Test from Mac itself using hostname
curl http://$(hostname):8193
```

**Solutions:**

1. **Firewall:** Allow Node.js incoming connections
   - System Settings → Network → Firewall → Options
   - Add Node.js to allowed apps

2. **Network isolation:** Ensure both devices on same network

3. **Hostname resolution:** Try using IP address instead of `.local`
   ```bash
   # Get your IP
   ipconfig getifaddr en0
   
   # Access via IP
   # http://192.168.1.xxx:8193
   ```

---

#### Service Crashes Repeatedly

**Symptom:** Service keeps restarting

**Diagnosis:**
```bash
# Check recent crash logs
tail -200 ~/.planny-flows/logs/launchd-error.log

# Check if ThrottleInterval is preventing rapid restarts
# (should wait 30 seconds between restart attempts)
```

**Common Causes:**

| Issue | Solution |
|-------|----------|
| Missing environment file | Verify `~/.planny-flows/.env.production` exists |
| Invalid JWT_SECRET | Regenerate: `openssl rand -base64 32` |
| Database locked | Stop service, check SQLite file |
| Memory issues | Check available RAM |

---

#### $HOME Not Defined Error

**Symptom:** Scripts fail because $HOME is empty

**Cause:** LaunchDaemons run as root without user environment

**Solution:** The plist uses absolute paths. Ensure `start.sh` uses no `$HOME` references:
```bash
# Check start.sh for $HOME
grep -n '$HOME' ~/.planny-flows/start.sh
# Should return nothing
```

---

#### TypeScript Build Errors

**Symptom:** Build fails with TypeScript errors

**Diagnosis:**
```bash
cd api
npm run build 2>&1 | head -50
```

**Solutions:**
```bash
# Ensure devDependencies are installed
cd api && npm install

# Clean build
rm -rf api/build api/node_modules
cd api && npm install && npm run build
```

---

### Debug Mode

For detailed debugging, run services manually:

```bash
# Stop the service first
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist

# Run startup script manually (see all output)
~/.planny-flows/start.sh

# Or run components individually
cd api
source ~/.planny-flows/.env.production
export $(cut -d= -f1 ~/.planny-flows/.env.production)
node -r ./tsconfig-paths.js build/index.js
```

---

## Maintenance

### Viewing Logs

```bash
# All logs
tail -f ~/.planny-flows/logs/*.log

# Specific logs
tail -100 ~/.planny-flows/logs/api.log
tail -100 ~/.planny-flows/logs/api-error.log
tail -100 ~/.planny-flows/logs/client.log
tail -100 ~/.planny-flows/logs/client-error.log
tail -100 ~/.planny-flows/logs/launchd.log

# Using the helper script
./deploy/scripts/logs.sh
```

### Database Backup

```bash
# Create backup
cp ~/.planny-flows/data/jira.sqlite ~/.planny-flows/data/jira.sqlite.backup

# Or with timestamp
cp ~/.planny-flows/data/jira.sqlite ~/.planny-flows/data/jira-$(date +%Y%m%d-%H%M%S).sqlite
```

### Database Migration

When updating the application:

```bash
# 1. Backup database
cp ~/.planny-flows/data/jira.sqlite ~/.planny-flows/data/jira.sqlite.pre-migration

# 2. Stop service
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist

# 3. Pull latest code
git pull

# 4. Rebuild
./deploy/setup.sh --skip-build
# OR manually:
cd api && npm ci && npm run build
cd client && npm ci && npm run build

# 5. Start service
sudo launchctl load /Library/LaunchDaemons/com.plannyflows.plist

# 6. Verify
curl -s http://localhost:3824/health
```

### Updating the Application

```bash
# Full update procedure
cd /path/to/planny-flows

# 1. Pull latest changes
git pull origin main

# 2. Stop service
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist

# 3. Rebuild
./deploy/setup.sh

# 4. Update plist (if changed)
sudo cp ~/.planny-flows/com.plannyflows.plist /Library/LaunchDaemons/

# 5. Start service
sudo launchctl load /Library/LaunchDaemons/com.plannyflows.plist

# 6. Verify
./deploy/scripts/status.sh
```

### Health Monitoring

Create a simple health check cron:

```bash
# Add to crontab
crontab -e

# Add this line (checks every 5 minutes)
*/5 * * * * curl -sf http://localhost:3824/health > /dev/null || echo "Planny-Flows health check failed at $(date)" >> ~/.planny-flows/logs/health-monitor.log
```

---

## Uninstallation

### Quick Uninstall

```bash
# Run the uninstall script
./deploy/uninstall.sh
```

The script will:
1. Stop and remove the launchd service
2. Kill any running processes
3. Ask if you want to remove data (database, logs, config)

### Manual Uninstall

```bash
# 1. Stop and unload service
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist

# 2. Remove plist
sudo rm /Library/LaunchDaemons/com.plannyflows.plist

# 3. Kill processes
kill $(cat ~/.planny-flows/pids/api.pid) 2>/dev/null
kill $(cat ~/.planny-flows/pids/client.pid) 2>/dev/null

# 4. Remove data directory (optional)
rm -rf ~/.planny-flows
```

### Preserve Data on Uninstall

If you want to uninstall but keep your data:

```bash
# Just remove the service, keep ~/.planny-flows
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist
sudo rm /Library/LaunchDaemons/com.plannyflows.plist
```

---

## File Reference

### Project Files

| Path | Purpose |
|------|---------|
| `deploy/setup.sh` | Main setup script |
| `deploy/uninstall.sh` | Removal script |
| `deploy/templates/env.production` | Environment template |
| `~/.planny-flows/com.plannyflows.plist` | launchd configuration |
| `deploy/scripts/start.sh` | Manual start script |
| `deploy/scripts/stop.sh` | Manual stop script |
| `deploy/scripts/status.sh` | Status check script |
| `deploy/scripts/logs.sh` | Log viewer script |
| `deploy/scripts/restart-service.sh` | Service restart script |

### Runtime Files (after deployment)

| Path | Purpose |
|------|---------|
| `~/.planny-flows/` | Main deployment directory |
| `~/.planny-flows/.env.production` | Production environment variables |
| `~/.planny-flows/start.sh` | Generated startup script |
| `~/.planny-flows/data/jira.sqlite` | SQLite database |
| `~/.planny-flows/logs/api.log` | API stdout |
| `~/.planny-flows/logs/api-error.log` | API stderr |
| `~/.planny-flows/logs/client.log` | Client stdout |
| `~/.planny-flows/logs/client-error.log` | Client stderr |
| `~/.planny-flows/logs/launchd.log` | launchd stdout |
| `~/.planny-flows/logs/launchd-error.log` | launchd stderr |
| `~/.planny-flows/pids/api.pid` | API process ID |
| `~/.planny-flows/pids/client.pid` | Client process ID |

### System Files

| Path | Purpose |
|------|---------|
| `/Library/LaunchDaemons/com.plannyflows.plist` | Installed launchd service |

---

## Quick Reference Card

```bash
# ═══════════════════════════════════════════════════════════════
# PLANNY-FLOWS COMMANDS CHEAT SHEET
# ═══════════════════════════════════════════════════════════════

# --- Service Control ---
sudo launchctl load /Library/LaunchDaemons/com.plannyflows.plist    # Start
sudo launchctl unload /Library/LaunchDaemons/com.plannyflows.plist  # Stop
sudo launchctl kickstart -k system/com.plannyflows                  # Restart
sudo launchctl print system/com.plannyflows                         # Status

# --- Helper Scripts ---
./deploy/scripts/status.sh     # Check status
./deploy/scripts/logs.sh       # View logs
./deploy/scripts/restart-service.sh  # Restart

# --- Logs ---
tail -f ~/.planny-flows/logs/*.log   # All logs
tail -100 ~/.planny-flows/logs/api-error.log  # API errors

# --- Health Checks ---
curl -s http://localhost:3824/health  # API health
curl -s http://localhost:8193         # Client

# --- Ports ---
lsof -i :3824  # Check API port
lsof -i :8193  # Check Client port

# --- Access URLs ---
# Local:   http://localhost:8193
# Network: http://your-macbook.local:8193

# --- Rebuild ---
./deploy/setup.sh --skip-build  # Quick rebuild

# --- Uninstall ---
./deploy/uninstall.sh
# ═══════════════════════════════════════════════════════════════
```

---

## Support

If you encounter issues not covered in this guide:

1. Check the logs: `tail -100 ~/.planny-flows/logs/api-error.log`
2. Run status check: `./deploy/scripts/status.sh`
3. Try manual start: `~/.planny-flows/start.sh`
4. Review the troubleshooting section above

---

*Last updated: March 2026*

#!/usr/bin/env bash

#================================================================================
# Deployment Script Validation Test
#================================================================================
# Tests the deploy.sh script without deploying to production

SCRIPT_NAME="deploy-test.sh"
VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Project root
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.planny-flows}"
DEPLOY_SCRIPT="$PROJECT_ROOT/deploy/scripts/deploy.sh"

# Test functions
function test_passed() {
    local message="$1"
    ((TOTAL_TESTS++))
    ((PASSED_TESTS++))
    echo -e "${GREEN}✓${NC} $message"
}

function test_failed() {
    local message="$1"
    ((TOTAL_TESTS++))
    ((FAILED_TESTS++))
    echo -e "${RED}✗${NC} $message"
}

function test_info() {
    local message="$1"
    echo -e "${CYAN}ℹ${NC} $message"
}

function test_header() {
    local message="$1"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$message${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

function test_section() {
    local message="$1"
    echo ""
    echo -e "${YELLOW}▶ $message${NC}"
}

# Check if deploy script exists
test_section "1. Script File Checks"

if [[ -f "$DEPLOY_SCRIPT" ]]; then
    test_passed "Deployment script exists at $DEPLOY_SCRIPT"
else
    test_failed "Deployment script not found at $DEPLOY_SCRIPT"
fi

# Check if script is executable
if [[ -x "$DEPLOY_SCRIPT" ]]; then
    test_passed "Deployment script is executable"
else
    test_failed "Deployment script is not executable. Run: chmod +x $DEPLOY_SCRIPT"
fi

# Check if run script exists
RUN_SCRIPT="$PROJECT_ROOT/deploy/scripts/run.sh"
if [[ -f "$RUN_SCRIPT" ]]; then
    test_passed "Run script exists at $RUN_SCRIPT"
else
    test_failed "Run script not found at $RUN_SCRIPT"
fi

# Check if run script is executable
if [[ -x "$RUN_SCRIPT" ]]; then
    test_passed "Run script is executable"
else
    test_failed "Run script is not executable"
fi

# Syntax check
test_section "2. Syntax Validation"

if bash -n "$DEPLOY_SCRIPT" 2>/dev/null; then
    test_passed "deploy.sh has valid bash syntax"
else
    test_failed "deploy.sh has syntax errors"
fi

if bash -n "$RUN_SCRIPT" 2>/dev/null; then
    test_passed "run.sh has valid bash syntax"
else
    test_failed "run.sh has syntax errors"
fi

# Check for required commands
test_section "3. Dependencies Check"

REQUIRED_COMMANDS=("node" "npm" "curl" "git" "tar" "rsync")

for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if command -v "$cmd" &>/dev/null; then
        test_passed "Command '$cmd' is installed"
    else
        test_failed "Command '$cmd' is not installed"
    fi
done

# Check Node.js version
test_section "4. Node.js Version Check"

if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$NODE_VERSION" -ge 18 ]]; then
        test_passed "Node.js version >= 18 (found: $NODE_VERSION)"
    else
        test_failed "Node.js version < 18 (found: $NODE_VERSION, required: >= 18)"
    fi
else
    test_failed "Node.js is not installed"
fi

# Check project structure
test_section "5. Project Structure Check"

if [[ -d "$PROJECT_ROOT/api" ]]; then
    test_passed "API directory exists"
else
    test_failed "API directory not found"
fi

if [[ -d "$PROJECT_ROOT/client" ]]; then
    test_passed "Client directory exists"
else
    test_failed "Client directory not found"
fi

if [[ -f "$PROJECT_ROOT/api/package.json" ]]; then
    test_passed "API package.json exists"
else
    test_failed "API package.json not found"
fi

if [[ -f "$PROJECT_ROOT/client/package.json" ]]; then
    test_passed "Client package.json exists"
else
    test_failed "Client package.json not found"
fi

# Check README and documentation
test_section "6. Documentation Check"

if [[ -f "$PROJECT_ROOT/deploy/scripts/README.md" ]]; then
    test_passed "README.md exists"
else
    test_failed "README.md not found"
fi

if [[ -f "$PROJECT_ROOT/deploy/scripts/QUICKREF.md" ]]; then
    test_passed "QUICKREF.md exists"
else
    test_failed "QUICKREF.md not found"
fi

# Check environment variables
test_section "7. Environment Variable Checks"

if [[ -n "$PROJECT_ROOT" ]]; then
    test_passed "PROJECT_ROOT is set: $PROJECT_ROOT"
else
    test_failed "PROJECT_ROOT is not set"
fi

# Check deployment directories
test_section "8. Deployment Directory Checks"

if [[ -d "$DEPLOY_DIR" ]]; then
    test_passed "DEPLOY_DIR exists: $DEPLOY_DIR"
else
    test_failed "DEPLOY_DIR does not exist: $DEPLOY_DIR"
fi

# Check config files
test_section "9. Configuration Files Check"

if [[ -f "$PROJECT_ROOT/deploy/scripts/status.sh" ]]; then
    test_passed "status.sh exists"
else
    test_failed "status.sh not found"
fi

if [[ -f "$PROJECT_ROOT/deploy/scripts/restart.sh" ]]; then
    test_passed "restart.sh exists"
else
    test_failed "restart.sh not found"
fi

if [[ -f "$PROJECT_ROOT/deploy/scripts/stop.sh" ]]; then
    test_passed "stop.sh exists"
else
    test_failed "stop.sh not found"
fi

if [[ -f "$PROJECT_ROOT/deploy/scripts/logs.sh" ]]; then
    test_passed "logs.sh exists"
else
    test_failed "logs.sh not found"
fi

# Check script features
test_section "10. Script Feature Checks"

# Check for help option
if grep -q "\-h|--help" "$DEPLOY_SCRIPT"; then
    test_passed "Help option is defined"
else
    test_failed "Help option not found"
fi

# Check for version option
if grep -q "\-\-version" "$DEPLOY_SCRIPT"; then
    test_passed "Version option is defined"
else
    test_failed "Version option not found"
fi

# Check for production mode
if grep -q "\-\-production" "$DEPLOY_SCRIPT"; then
    test_passed "Production mode option is defined"
else
    test_failed "Production mode option not found"
fi

# Check for check-only mode
if grep -q "\-\-check-only" "$DEPLOY_SCRIPT"; then
    test_passed "Check-only option is defined"
else
    test_failed "Check-only option not found"
fi

# Check for skip-verify option
if grep -q "\-\-skip-verify" "$DEPLOY_SCRIPT"; then
    test_passed "Skip-verify option is defined"
else
    test_failed "Skip-verify option not found"
fi

# Check for verbose option
if grep -q "\-\-verbose" "$DEPLOY_SCRIPT"; then
    test_passed "Verbose option is defined"
else
    test_failed "Verbose option not found"
fi

# Check for error handling
if grep -q "exit_on_error" "$DEPLOY_SCRIPT"; then
    test_passed "Error handling function is defined"
else
    test_failed "Error handling function not found"
fi

# Check for logging functions
if grep -q "function log" "$DEPLOY_SCRIPT"; then
    test_passed "Logging function is defined"
else
    test_failed "Logging function not found"
fi

# Summary
test_section "Test Summary"

echo ""
echo -e "${CYAN}Total Tests: $TOTAL_TESTS${NC}"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo -e "${CYAN}The deployment script is ready to use.${NC}"
    echo ""
    echo "To deploy:"
    echo "  ${YELLOW}./deploy/scripts/deploy.sh --production${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo -e "${YELLOW}Please fix the issues before deploying.${NC}"
    echo ""
    exit 1
fi

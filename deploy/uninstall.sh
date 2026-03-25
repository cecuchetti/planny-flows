#!/usr/bin/env bash

DEPENDENCIES=()
SCRIPT_NAME=$(basename "$0")
VERSION="1.0.0"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ -n "${NO_COLOR:-}" ]] || [[ "${TERM:-}" == "dumb" ]]; then
    RED=""
    GREEN=""
    YELLOW=""
    BLUE=""
    NC=""
fi

PLIST_PATH="/Library/LaunchDaemons/com.plannyflows.plist"
DEPLOY_DIR="$HOME/.planny-flows"

function usage() {
    cat <<EOM

Remove planny-flows production setup.

usage: ${SCRIPT_NAME} [options]

options:
    -y|--yes              Skip confirmation prompt (remove data)
    -h|--help             Show this help message
    --version             Show version information

dependencies: ${DEPENDENCIES[*]}

examples:
    ${SCRIPT_NAME}
    ${SCRIPT_NAME} --yes

EOM
    exit 1
}

function exit_on_missing_tools() {
    for cmd in "$@"; do
        if command -v "$cmd" &>/dev/null; then
            continue
        fi
        printf "Error: Required tool '%s' is not installed or not in PATH\n" "$cmd"
        exit 1
    done
}

function stop_and_remove_service() {
    if [[ -f "$PLIST_PATH" ]]; then
        echo -e "${YELLOW}Stopping launchd service...${NC}"
        sudo launchctl bootout system/com.plannyflows 2>/dev/null || true
        sudo rm -f "$PLIST_PATH" || {
            echo -e "${RED}✗ Failed to remove plist file${NC}" >&2
            exit 1
        }
        echo -e "${GREEN}✓ Service removed${NC}"
    fi
}

function kill_running_processes() {
    if [[ -f "$DEPLOY_DIR/pids/api.pid" ]]; then
        kill "$(cat "$DEPLOY_DIR/pids/api.pid")" 2>/dev/null || true
    fi
    if [[ -f "$DEPLOY_DIR/pids/client.pid" ]]; then
        kill "$(cat "$DEPLOY_DIR/pids/client.pid")" 2>/dev/null || true
    fi
}

function prompt_data_removal() {
    local skip_confirm="$1"

    if [[ "$skip_confirm" == true ]]; then
        return 0
    fi

    echo ""
    echo -e "${YELLOW}Do you want to remove the data directory?${NC}"
    echo -e "  This will delete your database and logs."
    echo -e "  Path: $DEPLOY_DIR"
    echo ""
    read -p "Remove data? (y/N): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    fi
    return 1
}

function remove_data_directory() {
    rm -rf "$DEPLOY_DIR" || {
        echo -e "${RED}✗ Failed to remove data directory${NC}" >&2
        exit 1
    }
    echo -e "${GREEN}✓ Data directory removed${NC}"
}

function main() {
    local skip_confirm=false

    while [ "$1" != "" ]; do
        case $1 in
        -y | --yes)
            skip_confirm=true
            ;;
        --version)
            echo "${SCRIPT_NAME} version ${VERSION}"
            exit 0
            ;;
        -h | --help)
            usage
            ;;
        *)
            echo "Error: Unknown option '$1'" >&2
            usage
            ;;
        esac
        shift
    done

    exit_on_missing_tools "${DEPENDENCIES[@]}"

    echo -e "${YELLOW}Uninstalling Planny-Flows production setup...${NC}"
    echo ""

    stop_and_remove_service
    kill_running_processes

    if prompt_data_removal "$skip_confirm"; then
        remove_data_directory
    else
        echo -e "${BLUE}Data directory preserved at $DEPLOY_DIR${NC}"
    fi

    echo ""
    echo -e "${GREEN}Uninstall complete!${NC}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi

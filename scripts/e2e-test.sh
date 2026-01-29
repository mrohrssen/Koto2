#!/bin/bash
# E2E test wrapper - enforces correct flags
# Usage: ./scripts/e2e-test.sh [optional test file pattern]
#
# Playwright manages the server lifecycle via webServer config.
# This script just ensures correct flags and clean state.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Kill any existing server to ensure clean state
pkill -f "node server.js" 2>/dev/null
sleep 1

# Run tests - Playwright starts/stops the server automatically
cd tests/e2e
if [ -n "$1" ]; then
    npx playwright test "$1" --workers=1 -x
else
    npx playwright test --workers=1 -x
fi
TEST_EXIT=$?

# Cleanup any orphaned processes
pkill -f "node server.js" 2>/dev/null

exit $TEST_EXIT

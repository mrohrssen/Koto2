#!/bin/bash
# E2E test wrapper - enforces correct flags
# Usage: ./scripts/e2e-test.sh [optional test file pattern]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Kill any existing server
pkill -f "node server.js" 2>/dev/null

# Start server with NODE_ENV=test to bypass auth for e2e tests
NODE_ENV=test npm start &
SERVER_PID=$!
sleep 3

# Run tests with enforced flags
cd tests/e2e
if [ -n "$1" ]; then
    npx playwright test "$1" --workers=1 -x
else
    npx playwright test --workers=1 -x
fi
TEST_EXIT=$?

# Cleanup
kill $SERVER_PID 2>/dev/null
pkill -f "node server.js" 2>/dev/null

exit $TEST_EXIT

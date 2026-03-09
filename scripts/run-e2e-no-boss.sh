#!/bin/bash
cd /Users/michia/Documents/jrpg
pkill -f "node server.js" 2>/dev/null
sleep 1
npm start &
sleep 3
cd tests/e2e && npx playwright test --workers=1 -x --grep-invert "boss"
EXIT_CODE=$?
pkill -f "node server.js" 2>/dev/null
exit $EXIT_CODE

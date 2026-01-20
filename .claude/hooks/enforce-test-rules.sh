#!/bin/bash
# Hook to enforce E2E testing rules

# Debug: log all input to a file
echo "=== Hook called at $(date) ===" >> /tmp/hook-debug.log
echo "Args: $@" >> /tmp/hook-debug.log
echo "Stdin:" >> /tmp/hook-debug.log
cat | tee -a /tmp/hook-debug.log | {
    INPUT=$(cat)
    echo "Input received: $INPUT" >> /tmp/hook-debug.log

    # Try to extract command from JSON
    COMMAND=$(echo "$INPUT" | jq -r '.command // empty' 2>/dev/null)
    if [ -z "$COMMAND" ]; then
        COMMAND="$INPUT"
    fi
    echo "Extracted command: $COMMAND" >> /tmp/hook-debug.log

    # Check if this is a playwright test command
    if echo "$COMMAND" | grep -q "playwright test"; then
        echo "Detected playwright test command" >> /tmp/hook-debug.log

        # Check for more than 1 worker
        if echo "$COMMAND" | grep -qE "\-\-workers=[2-9]|\-\-workers=[0-9]{2,}"; then
            echo "BLOCKED: Never use more than 1 worker for E2E tests." | tee -a /tmp/hook-debug.log
            echo "Change --workers=N to --workers=1"
            exit 1
        fi

        # Check that --workers=1 is present (or rely on config default)
        # Note: config has workers:1, so we only block explicit overrides

        # Check for -x flag
        if ! echo "$COMMAND" | grep -qE "\-x|\-\-max-failures"; then
            echo "BLOCKED: E2E tests must fail fast with -x flag" | tee -a /tmp/hook-debug.log
            echo "Add -x to your playwright command"
            exit 1
        fi
    fi

    exit 0
}

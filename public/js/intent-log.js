export function createIntentLog({ output, getErrorCount, onFailure } = {}) {
  const write = output || console.log;
  const errCount = getErrorCount || (() => 0);
  const failCallback = onFailure || (() => {});

  let errorCountAtAct = 0;
  let acting = false;

  return {
    act(message) {
      acting = true;
      errorCountAtAct = errCount();
      write(`[ACT] ${message}`);
    },

    expect(message) {
      write(`[EXP] ${message}`);
    },

    check({ ok, tag, detail } = {}) {
      const newErrors = errCount() - errorCountAtAct;

      if (newErrors > 0) {
        write(`[ERR] ${newErrors} console error(s) during action`);
        write(`[CHK] ✗ ERROR_THROWN`);
        failCallback({ tag: 'ERROR_THROWN', detail: `${newErrors} console error(s)` });
      } else if (!ok) {
        const msg = tag && detail ? `${tag}: ${detail}` : (tag || 'FAIL');
        write(`[CHK] ✗ ${msg}`);
        failCallback({ tag, detail });
      } else {
        write(`[CHK] ✓`);
      }

      acting = false;
    },

    isActing() {
      return acting;
    },
  };
}

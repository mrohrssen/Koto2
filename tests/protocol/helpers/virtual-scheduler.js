export function createVirtualScheduler() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();
  const inFlight = new Set();
  const failures = [];

  function schedule(callback, delay = 0) {
    const id = nextId;
    nextId += 1;
    tasks.set(id, {
      id,
      dueAt: now + Math.max(0, Number(delay) || 0),
      callback,
    });
    return id;
  }

  function cancel(id) {
    tasks.delete(id);
  }

  function nextTask() {
    return [...tasks.values()].sort((left, right) => (
      left.dueAt - right.dueAt || left.id - right.id
    ))[0] || null;
  }

  function invoke(task) {
    tasks.delete(task.id);
    let result;
    try {
      result = task.callback();
    } catch (error) {
      failures.push(error);
      return;
    }
    if (!result || typeof result.then !== 'function') return;

    let tracked;
    tracked = Promise.resolve(result)
      .catch(error => { failures.push(error); })
      .finally(() => { inFlight.delete(tracked); });
    inFlight.add(tracked);
  }

  async function yieldTurn() {
    await Promise.resolve();
    await Promise.resolve();
  }

  function throwFailure() {
    if (failures.length > 0) throw failures.shift();
  }

  async function advanceBy(ms) {
    const target = now + Math.max(0, Number(ms) || 0);
    let task = nextTask();
    while (task && task.dueAt <= target) {
      now = task.dueAt;
      invoke(task);
      await yieldTurn();
      throwFailure();
      task = nextTask();
    }
    now = target;
    await yieldTurn();
    throwFailure();
  }

  async function runAll({ maxSteps = 1000 } = {}) {
    for (let step = 0; step < maxSteps; step += 1) {
      throwFailure();
      const task = nextTask();
      if (task) {
        await advanceBy(task.dueAt - now);
        continue;
      }
      if (inFlight.size > 0) {
        await Promise.race([...inFlight]);
        await yieldTurn();
        continue;
      }
      throwFailure();
      return;
    }
    throw new Error(`virtual scheduler exceeded ${maxSteps} steps`);
  }

  function wait(ms) {
    return new Promise(resolve => { schedule(resolve, ms); });
  }

  return {
    schedule,
    cancel,
    advanceBy,
    runAll,
    wait,
    now: () => now,
    pendingCount: () => tasks.size,
  };
}

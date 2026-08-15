export class FenceSuperseded extends Error {
  constructor(label, leaseLabel) {
    super(`${label} superseded by ${leaseLabel}`);
    this.name = 'FenceSuperseded';
  }
}

export class FenceContractViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'FenceContractViolation';
  }
}

function isLeaseCurrent(lease) {
  try {
    return lease?.isCurrent?.() === true;
  } catch {
    return false;
  }
}

export function createAsyncOwnershipFence(leases = []) {
  let poisonedError = null;

  function poison(message) {
    poisonedError = new FenceContractViolation(message);
    throw poisonedError;
  }

  function assertCurrent(label) {
    if (poisonedError) {
      throw poisonedError;
    }
    const staleLease = leases.find(lease => !isLeaseCurrent(lease));
    if (staleLease) {
      throw new FenceSuperseded(label, staleLease.label || 'lease');
    }
  }

  return {
    isCurrent() {
      return poisonedError == null && leases.every(isLeaseCurrent);
    },

    async step(label, operation) {
      assertCurrent(label);
      try {
        const value = await operation();
        assertCurrent(label);
        return value;
      } catch (error) {
        assertCurrent(label);
        throw error;
      }
    },

    commit(label, descriptor = {}) {
      assertCurrent(label);
      if (!descriptor || typeof descriptor !== 'object') {
        poison(`${label} has an invalid descriptor`);
      }
      const { apply, transitions } = descriptor;
      if (typeof apply !== 'function' || !Array.isArray(transitions)) {
        poison(`${label} has an invalid descriptor`);
      }

      const declaredLeases = new Set();
      for (const transition of transitions) {
        if (!leases.includes(transition?.lease) || declaredLeases.has(transition.lease)) {
          poison(`${label} declares an invalid lease`);
        }
        if (typeof transition.verify !== 'function' || typeof transition.advance !== 'function') {
          poison(`${label} has an invalid transition`);
        }
        declaredLeases.add(transition.lease);
      }

      const value = apply();
      if (value && typeof value.then === 'function') {
        poison(`${label} apply must be synchronous`);
      }

      for (const lease of leases) {
        if (!declaredLeases.has(lease) && !isLeaseCurrent(lease)) {
          poison(`${label} mutated undeclared ${lease.label || 'lease'}`);
        }
      }

      for (const transition of transitions) {
        let verified = false;
        try {
          verified = transition.verify() === true;
        } catch {
          poison(`${label} failed ${transition.lease.label || 'lease'} postcondition`);
        }
        if (!verified) {
          poison(`${label} failed ${transition.lease.label || 'lease'} postcondition`);
        }
      }

      for (const transition of transitions) {
        try {
          transition.advance();
        } catch {
          poison(`${label} failed ${transition.lease.label || 'lease'} advance`);
        }
      }

      if (!leases.every(isLeaseCurrent)) {
        poison(`${label} did not advance to the verified lease state`);
      }

      return value;
    },
  };
}

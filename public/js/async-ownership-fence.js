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
  function assertCurrent(label) {
    const staleLease = leases.find(lease => !isLeaseCurrent(lease));
    if (staleLease) {
      throw new FenceSuperseded(label, staleLease.label || 'lease');
    }
  }

  return {
    isCurrent() {
      return leases.every(isLeaseCurrent);
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
      const { apply, transitions } = descriptor;
      if (typeof apply !== 'function' || !Array.isArray(transitions)) {
        throw new FenceContractViolation(`${label} has an invalid descriptor`);
      }

      const declaredLeases = new Set();
      for (const transition of transitions) {
        if (!leases.includes(transition?.lease) || declaredLeases.has(transition.lease)) {
          throw new FenceContractViolation(`${label} declares an invalid lease`);
        }
        if (typeof transition.verify !== 'function' || typeof transition.advance !== 'function') {
          throw new FenceContractViolation(`${label} has an invalid transition`);
        }
        declaredLeases.add(transition.lease);
      }

      const value = apply();
      if (value && typeof value.then === 'function') {
        throw new FenceContractViolation(`${label} apply must be synchronous`);
      }

      for (const lease of leases) {
        if (!declaredLeases.has(lease) && !isLeaseCurrent(lease)) {
          throw new FenceContractViolation(`${label} mutated undeclared ${lease.label || 'lease'}`);
        }
      }

      for (const transition of transitions) {
        if (transition.verify() !== true) {
          throw new FenceContractViolation(
            `${label} failed ${transition.lease.label || 'lease'} postcondition`,
          );
        }
      }

      for (const transition of transitions) {
        transition.advance();
      }

      if (!leases.every(isLeaseCurrent)) {
        throw new FenceContractViolation(
          `${label} did not advance to the verified lease state`,
        );
      }

      return value;
    },
  };
}

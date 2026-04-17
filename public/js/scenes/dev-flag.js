// DEV flag — replaced at build time by Vite's `define` so production builds
// dead-code-eliminate any `if (DEV)` blocks. In dev mode, returns true.
// In Node test environment (where import.meta.env is undefined), defaults
// to true so dev-only assertions still fire during testing.

export const DEV = import.meta?.env?.DEV ?? true;

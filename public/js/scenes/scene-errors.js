// Shared error types for the scene module. Extracted so that both Scene
// and ResourceRegistry can throw the same error class without a circular
// dependency between those two modules.

export class SceneDisposedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SceneDisposedError';
  }
}

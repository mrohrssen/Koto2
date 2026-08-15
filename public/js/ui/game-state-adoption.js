export function isGameStateErrorResponse(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && Object.hasOwn(data, 'error'),
  );
}

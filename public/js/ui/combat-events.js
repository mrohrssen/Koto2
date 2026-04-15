const _bus = new EventTarget();

export const combatEvents = {
  emit(type, detail) {
    _bus.dispatchEvent(new CustomEvent(type, { detail }));
  },
  on(type, handler) {
    _bus.addEventListener(type, (e) => handler(e.detail));
  },
  off(type, handler) {
    _bus.removeEventListener(type, handler);
  }
};

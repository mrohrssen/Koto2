import { PLATFORM } from '../platform.js';

let StatusBar, Style, Haptics, ImpactStyle, Keyboard, App;

/** Initialize native plugins. Call once at app startup. */
export async function initNative() {
  if (!PLATFORM.isNative) return;

  try {
    ({ StatusBar, Style } = await import('@capacitor/status-bar'));
    ({ Haptics, ImpactStyle } = await import('@capacitor/haptics'));
    ({ Keyboard } = await import('@capacitor/keyboard'));
    ({ App } = await import('@capacitor/app'));

    // Status bar: hide entirely; overlay as safety net if OS re-shows it.
    try { await StatusBar.hide(); } catch {}
    try { await StatusBar.setOverlaysWebView({ overlay: true }); } catch {}
    try { await StatusBar.setStyle({ style: Style.Light }); } catch {}

    // Keyboard: expose height as CSS variable
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    });

    console.log('[Native] Capacitor plugins initialized');
  } catch (e) {
    console.warn('[Native] Plugin init failed:', e.message);
  }
}

/** Register app lifecycle handlers (call after audio module is ready). */
export function onAppLifecycle({ onPause, onResume }) {
  if (!PLATFORM.isNative || !App) return;
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onResume?.();
    else onPause?.();
  });
}

// ============ HAPTICS ============

/** Light haptic tap (card swipe threshold, button press). */
export async function hapticLight() {
  if (!Haptics) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
}

/** Medium haptic tap (card swipe commit, combat hit). */
export async function hapticMedium() {
  if (!Haptics) return;
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
}

/** Heavy haptic tap (big combat hit, critical damage). */
export async function hapticHeavy() {
  if (!Haptics) return;
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
}

/**
 * Damage-tiered haptic for combat effects.
 * @param {number} tier - 0-4 damage tier
 */
export async function hapticDamageTier(tier) {
  if (!Haptics) return;
  const style = tier >= 3 ? ImpactStyle.Heavy
    : tier >= 2 ? ImpactStyle.Medium
    : ImpactStyle.Light;
  try { await Haptics.impact({ style }); } catch {}
}

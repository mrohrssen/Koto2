/**
 * Connection status banner.
 * Shows "Connection lost, retrying..." after 2+ consecutive API failures.
 * Auto-dismisses on next successful API call.
 */

let bannerEl = null;
let hideTimer = null;

function ensureBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement('div');
  bannerEl.className = 'connection-banner';
  bannerEl.textContent = 'Connection lost, retrying...';
  const sceneArea = document.getElementById('scene-area');
  if (sceneArea) {
    sceneArea.insertBefore(bannerEl, sceneArea.firstChild);
  } else {
    document.body.prepend(bannerEl);
  }
  return bannerEl;
}

export function showOffline() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const el = ensureBanner();
  el.textContent = 'Connection lost, retrying...';
  el.classList.add('visible');
  el.classList.remove('reconnected');
}

export function showOnline() {
  if (!bannerEl || !bannerEl.classList.contains('visible')) return;
  bannerEl.textContent = 'Reconnected';
  bannerEl.classList.add('reconnected');
  hideTimer = setTimeout(() => {
    bannerEl.classList.remove('visible', 'reconnected');
    hideTimer = null;
  }, 1500);
}

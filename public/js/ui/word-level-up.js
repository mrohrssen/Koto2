/**
 * Pick the anchor for battle-level reward popups.
 * @param {Document} [doc]
 * @returns {HTMLElement|null}
 */
export function getBattleRewardAnchor(doc = globalThis.document) {
  if (!doc) return null;
  return doc.querySelector?.('.battle-stage')
    || doc.getElementById?.('scene-area')
    || doc.getElementById?.('enemy-formation')
    || doc.body
    || null;
}

/**
 * Show a "[word] leveled up!" animation anchored to an element.
 * @param {HTMLElement} anchorEl - Element to position the animation over
 * @param {string} wordText - Japanese word to display
 * @param {{ message?: string }} [options]
 */
export function showWordLevelUp(anchorEl, wordText, options = {}) {
  const message = options.message || (wordText ? `${wordText} leveled up!` : '');
  if (!anchorEl || !message) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Gold text popup
  const el = document.createElement('div');
  el.className = 'word-level-up-text';
  el.textContent = message;
  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());

  // Gold spark burst
  const COUNT = 10;
  const COLOR = '#FFD700';
  for (let i = 0; i < COUNT; i++) {
    const spark = document.createElement('div');
    spark.className = 'word-level-up-spark';
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    spark.style.backgroundColor = COLOR;
    spark.style.boxShadow = `0 0 4px ${COLOR}`;
    document.body.appendChild(spark);

    const angle = (Math.PI * 2 * i) / COUNT + (Math.random() - 0.5) * 0.4;
    const dist = 30 + Math.random() * 50;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    spark.style.setProperty('--dx', `${dx}px`);
    spark.style.setProperty('--dy', `${dy}px`);
    spark.style.animationDelay = `${Math.random() * 50}ms`;
    spark.addEventListener('animationend', () => spark.remove());
  }
}

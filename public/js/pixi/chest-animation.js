/**
 * @fileoverview PixiJS gacha animation for chest opening.
 * Creates a temporary fullscreen overlay with particle effects.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';

const RARITY_COLORS = {
  common:    0xb0bec5,
  uncommon:  0x66bb6a,
  rare:      0x42a5f5,
  epic:      0xab47bc,
  legendary: 0xffd54f
};

const RARITY_DURATIONS = {
  common:    2000,
  uncommon:  2500,
  rare:      3000,
  epic:      3500,
  legendary: 4500
};

const ELEMENT_ICONS = {
  fire: '🔥', water: '💧', wood: '🌿', earth: '🪨', metal: '⚙️'
};

const STAT_LABELS = {
  attack: 'ATK', mp: 'MP', hp: 'HP', defense: 'DEF', xp: 'XP'
};

/**
 * Play the chest opening animation.
 * @param {string} element - Element of the chest
 * @param {{ rarity: string, stat: string, value: number }} crest - The crest that was generated
 * @returns {Promise<void>} Resolves when animation completes and user taps to dismiss
 */
export async function playChestAnimation(element, crest) {
  const overlay = document.createElement('div');
  overlay.id = 'chest-anim-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 9999; background: rgba(0,0,0,0.85);
  `;
  document.body.appendChild(overlay);

  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    resizeTo: overlay,
    antialias: true
  });
  overlay.appendChild(app.canvas);

  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;
  const rarityColor = RARITY_COLORS[crest.rarity] || RARITY_COLORS.common;
  const duration = RARITY_DURATIONS[crest.rarity] || 2000;

  const container = new Container();
  app.stage.addChild(container);

  // Phase 1: Chest appears and shakes
  const chest = new Graphics();
  chest.roundRect(-40, -40, 80, 80, 12);
  chest.fill(rarityColor);
  chest.position.set(cx, cy);
  container.addChild(chest);

  let elapsed = 0;
  const shakeTime = Math.min(duration * 0.3, 1000);

  await new Promise(resolve => {
    const ticker = app.ticker.add((t) => {
      elapsed += t.deltaMS;
      const intensity = Math.min(elapsed / shakeTime, 1) * 8;
      chest.position.set(cx + (Math.random() - 0.5) * intensity, cy + (Math.random() - 0.5) * intensity);
      if (elapsed >= shakeTime) {
        app.ticker.remove(ticker);
        chest.position.set(cx, cy);
        resolve();
      }
    });
  });

  // Phase 2: Burst — particles explode outward
  chest.visible = false;
  const particles = [];
  const particleCount = crest.rarity === 'legendary' ? 60 : crest.rarity === 'epic' ? 40 : 20;

  for (let i = 0; i < particleCount; i++) {
    const p = new Graphics();
    const size = 3 + Math.random() * 5;
    p.circle(0, 0, size);
    p.fill(rarityColor);
    p.position.set(cx, cy);
    p.alpha = 1;
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
    const speed = 2 + Math.random() * 4;
    container.addChild(p);
    particles.push({ gfx: p, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 });
  }

  const flash = new Graphics();
  flash.rect(0, 0, app.screen.width, app.screen.height);
  flash.fill(rarityColor);
  flash.alpha = 0.6;
  container.addChild(flash);

  const burstTime = duration * 0.4;
  elapsed = 0;

  await new Promise(resolve => {
    const ticker = app.ticker.add((t) => {
      elapsed += t.deltaMS;
      const progress = elapsed / burstTime;

      flash.alpha = Math.max(0, 0.6 - progress * 1.5);

      for (const p of particles) {
        p.gfx.position.x += p.vx;
        p.gfx.position.y += p.vy;
        p.life -= t.deltaMS / burstTime;
        p.gfx.alpha = Math.max(0, p.life);
      }

      if (elapsed >= burstTime) {
        app.ticker.remove(ticker);
        resolve();
      }
    });
  });

  // Phase 3: Crest card reveal
  for (const p of particles) container.removeChild(p.gfx);
  container.removeChild(flash);

  const card = new Graphics();
  card.roundRect(-70, -50, 140, 100, 16);
  card.fill(0x1a1a2e);
  card.stroke({ color: rarityColor, width: 3 });
  card.position.set(cx, cy);
  card.scale.set(0);
  container.addChild(card);

  const valuePercent = Math.round(crest.value * 100);
  const label = new Text({
    text: `${ELEMENT_ICONS[element]}\n${STAT_LABELS[crest.stat]} +${valuePercent}%`,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 22,
      fill: rarityColor,
      align: 'center',
      lineHeight: 32
    }
  });
  label.anchor.set(0.5);
  label.position.set(cx, cy);
  label.alpha = 0;
  container.addChild(label);

  const rarityLabel = new Text({
    text: crest.rarity.toUpperCase(),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 14,
      fill: rarityColor,
      align: 'center',
      fontWeight: 'bold'
    }
  });
  rarityLabel.anchor.set(0.5);
  rarityLabel.position.set(cx, cy + 55);
  rarityLabel.alpha = 0;
  container.addChild(rarityLabel);

  elapsed = 0;
  const revealTime = 400;
  await new Promise(resolve => {
    const ticker = app.ticker.add((t) => {
      elapsed += t.deltaMS;
      const progress = Math.min(elapsed / revealTime, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      card.scale.set(ease);
      label.alpha = ease;
      rarityLabel.alpha = ease;
      if (progress >= 1) {
        app.ticker.remove(ticker);
        resolve();
      }
    });
  });

  // Phase 4: Wait for tap to dismiss
  await new Promise(resolve => {
    overlay.addEventListener('click', resolve, { once: true });
    overlay.addEventListener('touchend', resolve, { once: true });
  });

  app.destroy(true);
  overlay.remove();
}

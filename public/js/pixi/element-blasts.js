/**
 * @file element-blasts.js — Element-themed projectile blasts
 *
 * Fires a projectile from attacker to target with element-specific visuals.
 * Neutral Energy Bolt is the baseline; element stubs fall back to it until
 * their full implementations are ported.
 *
 * Public API:
 *   fireElementBlast(from, to, element, onImpact) → Promise<void>
 */

import { Container, Graphics } from 'pixi.js';
import { getStage } from './battle-stage.js';

// ============ HELPERS ============

/** Create a small filled circle Graphics object. */
function mc(color, radius, alpha = 1) {
  const g = new Graphics();
  g.circle(0, 0, radius).fill({ color, alpha });
  return g;
}

// Neutral color palette (grays → white)
const NEUTRAL_COLORS = [0xBDBDBD, 0x9E9E9E, 0x757575, 0xE0E0E0, 0xFFFFFF];

// ============ NEUTRAL ENERGY BOLT ============

/**
 * Simple white energy ball traveling in a straight line with a clean burst on impact.
 * @param {{ x: number, y: number }} from - Start position (attacker)
 * @param {{ x: number, y: number }} to   - End position (target)
 * @param {Function} [onImpact]           - Called synchronously when projectile arrives
 * @returns {Promise<void>} Resolves when the full animation (including post-impact fade) completes
 */
function fireNeutralBlast(from, to, onImpact) {
  return new Promise((resolve) => {
    const { app, layers } = getStage();
    if (!app || !layers.effects) {
      if (onImpact) onImpact();
      resolve();
      return;
    }

    const c = new Container();
    layers.effects.addChild(c);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let elapsed = 0;
    const travelTime = 0.25; // seconds
    const trails = [];

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);

      // Ease-out cubic for deceleration into target
      const eased = 1 - Math.pow(1 - t, 3);

      const cx = from.x + dx * eased;
      const cy = from.y + dy * eased;

      // 3-layer white core glow
      const core = new Graphics();
      core.circle(0, 0, 10).fill({ color: 0x9E9E9E, alpha: 0.3 });
      core.circle(0, 0, 6).fill({ color: 0xE0E0E0, alpha: 0.6 });
      core.circle(0, 0, 3).fill({ color: 0xFFFFFF, alpha: 0.9 });
      core.x = cx;
      core.y = cy;
      core._life = 0.1;
      c.addChild(core);
      trails.push(core);

      // Small trail particles (sparse)
      if (Math.random() < 0.4) {
        const tg = mc(
          NEUTRAL_COLORS[~~(Math.random() * 3)],
          1.5 + Math.random() * 2,
          0.4
        );
        tg.x = cx + (Math.random() - 0.5) * 6;
        tg.y = cy + (Math.random() - 0.5) * 6;
        tg._vx = (Math.random() - 0.5) * 20;
        tg._vy = (Math.random() - 0.5) * 20;
        tg._life = 0.15;
        tg._maxLife = 0.15;
        c.addChild(tg);
        trails.push(tg);
      }

      // Update trail particles
      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i];
        tr._life -= d;
        if (tr._vx !== undefined) {
          tr.x += tr._vx * d;
          tr.y += tr._vy * d;
        }
        tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.1));
        if (tr._life <= 0) {
          c.removeChild(tr);
          tr.destroy();
          trails.splice(i, 1);
        }
      }

      // === IMPACT ===
      if (t >= 1) {
        app.ticker.remove(tick);
        if (onImpact) onImpact();

        // 8-particle burst on impact (understated for neutral)
        const burstParticles = [];
        for (let i = 0; i < 8; i++) {
          const g = mc(
            NEUTRAL_COLORS[~~(Math.random() * 5)],
            1.5 + Math.random() * 4
          );
          g.x = to.x;
          g.y = to.y;
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 160;
          g._vx = Math.cos(angle) * speed;
          g._vy = Math.sin(angle) * speed;
          g._life = 0.25 + Math.random() * 0.35;
          g._maxLife = g._life;
          g._gravity = 100;
          c.addChild(g);
          burstParticles.push(g);
        }

        // Post-impact cleanup ticker
        const cleanupTick = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          let alive = false;

          // Fade remaining trail particles
          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            tr._life -= d2;
            tr.alpha *= 0.85;
            if (tr._life <= 0) {
              c.removeChild(tr);
              tr.destroy();
              trails.splice(i, 1);
            } else {
              alive = true;
            }
          }

          // Burst particles: gravity + fade
          for (const p of burstParticles) {
            p._life -= d2;
            if (p._life > 0) {
              alive = true;
              p.x += p._vx * d2;
              p.y += p._vy * d2;
              p._vy += p._gravity * d2;
              p.alpha = p._life / p._maxLife;
              p.scale.set(p._life / p._maxLife);
            } else {
              p.visible = false;
            }
          }

          if (!alive) {
            app.ticker.remove(cleanupTick);
            layers.effects.removeChild(c);
            c.destroy({ children: true });
            resolve();
          }
        };
        app.ticker.add(cleanupTick);
      }
    };

    app.ticker.add(tick);
  });
}

// ============ ELEMENT STUBS (fall back to neutral) ============

/** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to @param {Function} [onImpact] */
function fireFireBlast(from, to, onImpact) {
  return fireNeutralBlast(from, to, onImpact);
}

/** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to @param {Function} [onImpact] */
function fireWaterBlast(from, to, onImpact) {
  return fireNeutralBlast(from, to, onImpact);
}

/** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to @param {Function} [onImpact] */
function fireWoodBlast(from, to, onImpact) {
  return fireNeutralBlast(from, to, onImpact);
}

/** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to @param {Function} [onImpact] */
function fireEarthBlast(from, to, onImpact) {
  return fireNeutralBlast(from, to, onImpact);
}

/** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to @param {Function} [onImpact] */
function fireMetalBlast(from, to, onImpact) {
  return fireNeutralBlast(from, to, onImpact);
}

// ============ DISPATCH MAP ============

const ELEMENT_BLASTS = {
  neutral: fireNeutralBlast,
  fire:    fireFireBlast,
  water:   fireWaterBlast,
  wood:    fireWoodBlast,
  earth:   fireEarthBlast,
  metal:   fireMetalBlast,
};

// ============ PUBLIC API ============

/**
 * Fire an element-themed projectile blast from attacker to target.
 * @param {{ x: number, y: number }} from    - Attacker position
 * @param {{ x: number, y: number }} to      - Target position
 * @param {string} element                    - Element key ('fire', 'water', 'wood', 'earth', 'metal', 'neutral')
 * @param {Function} [onImpact]              - Called synchronously when projectile reaches target
 * @returns {Promise<void>} Resolves when the full animation completes
 */
export function fireElementBlast(from, to, element, onImpact) {
  const blastFn = ELEMENT_BLASTS[element] || ELEMENT_BLASTS.neutral;
  return blastFn(from, to, onImpact);
}

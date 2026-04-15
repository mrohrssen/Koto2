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

// ============ FIRE: CLASSIC METEOR ARC ============

/**
 * Glowing multi-layered fireball on a parabolic arc with smoke/ember trail.
 * Big radial burst on impact with gravity-pulled embers.
 */
function fireFireBlast(from, to, onImpact) {
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
    const arcHeight = -80;
    let elapsed = 0;
    const travelTime = 0.6;
    const trails = [];

    const smokeColors = [0xEF5350, 0xFF7043, 0x555555];
    const burstColors = [0xEF5350, 0xFF7043, 0xFFA726, 0xFFD54F, 0xFFFFFF];

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);

      // Linear horizontal, parabolic vertical
      const cx = from.x + dx * t;
      const cy = from.y + (to.y - from.y) * t + arcHeight * 4 * t * (1 - t);

      // Multi-layered glowing core
      const core = new Graphics();
      core.circle(0, 0, 16).fill({ color: 0xEF5350, alpha: 0.3 });
      core.circle(0, 0, 10).fill({ color: 0xFFD54F, alpha: 0.6 });
      core.circle(0, 0, 6).fill({ color: 0xFFFFFF, alpha: 0.9 });
      core.x = cx;
      core.y = cy;
      core._life = 0.15;
      c.addChild(core);
      trails.push(core);

      // Smoke/ember trail
      for (let i = 0; i < 3; i++) {
        const tg = mc(
          smokeColors[~~(Math.random() * 3)],
          2 + Math.random() * 5,
          0.8
        );
        tg.x = cx + (Math.random() - 0.5) * 12;
        tg.y = cy + (Math.random() - 0.5) * 12;
        tg._vx = (Math.random() - 0.5) * 30;
        tg._vy = -20 - Math.random() * 40; // floats upward
        tg._life = 0.3 + Math.random() * 0.3;
        tg._maxLife = tg._life;
        c.addChild(tg);
        trails.push(tg);
      }

      // Update all trail particles
      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i];
        tr._life -= d;
        if (tr._vx !== undefined) {
          tr.x += tr._vx * d;
          tr.y += tr._vy * d;
        }
        tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.15));
        if (tr._maxLife) tr.scale.set(0.5 + (tr._life / tr._maxLife) * 0.5);
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

        // Radial burst explosion
        const explodeParticles = [];
        for (let i = 0; i < 50; i++) {
          const g = mc(
            burstColors[~~(Math.random() * 5)],
            2 + Math.random() * 6
          );
          g.x = to.x;
          g.y = to.y;
          const angle = Math.random() * Math.PI * 2;
          const speed = 80 + Math.random() * 200;
          g._vx = Math.cos(angle) * speed;
          g._vy = Math.sin(angle) * speed - 60;
          g._life = 0.3 + Math.random() * 0.5;
          g._maxLife = g._life;
          c.addChild(g);
          explodeParticles.push(g);
        }

        const cleanupTick = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          let alive = false;

          // Fade remaining trails
          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            tr._life -= d2;
            if (tr._vx) { tr.x += tr._vx * d2; tr.y += tr._vy * d2; }
            tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.15));
            if (tr._life <= 0) {
              c.removeChild(tr); tr.destroy(); trails.splice(i, 1);
            } else {
              alive = true;
            }
          }

          // Burst particles: gravity + fade
          for (const p of explodeParticles) {
            p._life -= d2;
            if (p._life > 0) {
              alive = true;
              p.x += p._vx * d2;
              p.y += p._vy * d2;
              p._vy += 180 * d2; // gravity
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

// ============ WATER: RIPTIDE VORTEX ============

/**
 * Swirling ring of water particles orbits around center as it travels to target.
 * Mist trail drifts downward. Impact erupts into a vortex burst with tangential velocity.
 */
function fireWaterBlast(from, to, onImpact) {
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
    const travelTime = 0.6;
    const trails = [];

    const wc = [0x42A5F5, 0x1E88E5, 0x90CAF9, 0xBBDEFB, 0xFFFFFF];

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);

      // Ease-in-out quadratic
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const cx = from.x + dx * eased;
      const cy = from.y + dy * eased;

      // Center glow
      const glow = mc(0x90CAF9, 5, 0.5);
      glow.x = cx;
      glow.y = cy;
      glow._life = 0.08;
      c.addChild(glow);
      trails.push(glow);

      // Swirling ring of 10 water particles
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + elapsed * 12;
        const radius = 10 + Math.sin(elapsed * 6) * 3;
        const wp = mc(wc[~~(Math.random() * 5)], 2 + Math.random() * 2, 0.7);
        wp.x = cx + Math.cos(angle) * radius;
        wp.y = cy + Math.sin(angle) * radius;
        wp._life = 0.06;
        wp._maxLife = 0.06;
        c.addChild(wp);
        trails.push(wp);
      }

      // Mist trail (40% chance per frame)
      if (Math.random() < 0.4) {
        const mist = mc(
          wc[~~(Math.random() * 3)],
          1.5 + Math.random() * 3,
          0.3
        );
        mist.x = cx + (Math.random() - 0.5) * 10;
        mist.y = cy + (Math.random() - 0.5) * 6;
        mist._vx = (Math.random() - 0.5) * 15;
        mist._vy = 10 + Math.random() * 20; // drifts downward
        mist._life = 0.2 + Math.random() * 0.2;
        mist._maxLife = mist._life;
        c.addChild(mist);
        trails.push(mist);
      }

      // Update trail particles
      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i];
        tr._life -= d;
        if (tr._vx !== undefined) {
          tr.x += tr._vx * d;
          tr.y += tr._vy * d;
        }
        tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.08));
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

        // 50-particle vortex burst with tangential velocity
        const explodeParticles = [];
        for (let i = 0; i < 50; i++) {
          const g = mc(
            wc[~~(Math.random() * 5)],
            2 + Math.random() * 5
          );
          g.x = to.x;
          g.y = to.y;
          const angle = Math.random() * Math.PI * 2;
          const speed = 80 + Math.random() * 180;
          // Tangential component (cos+sin offset) for vortex feel
          g._vx = Math.cos(angle) * speed + Math.sin(angle) * 40;
          g._vy = Math.sin(angle) * speed - Math.cos(angle) * 40 - 40;
          g._life = 0.3 + Math.random() * 0.5;
          g._maxLife = g._life;
          c.addChild(g);
          explodeParticles.push(g);
        }

        const cleanupTick = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          let alive = false;

          // Fade remaining trails
          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            tr._life -= d2;
            if (tr._vx) { tr.x += tr._vx * d2; tr.y += tr._vy * d2; }
            tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.08));
            if (tr._life <= 0) {
              c.removeChild(tr); tr.destroy(); trails.splice(i, 1);
            } else {
              alive = true;
            }
          }

          // Burst particles: gravity + fade
          for (const p of explodeParticles) {
            p._life -= d2;
            if (p._life > 0) {
              alive = true;
              p.x += p._vx * d2;
              p.y += p._vy * d2;
              p._vy += 220 * d2; // gravity
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

// ============ WOOD: RAZOR LEAF ============

/**
 * Single spinning leaf blade arcs from attacker to target.
 * Ghostly afterimage trail. On impact splits into 4 leaf fragments with green flash and sparkles.
 */
function fireWoodBlast(from, to, onImpact) {
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
    const arcH = -40;
    let elapsed = 0;
    const travelTime = 0.45;
    const trails = [];
    const woodColors = [0x66BB6A, 0x81C784, 0xA5D6A7, 0x4CAF50, 0xFFFFDE];

    /** Create a pointed ellipse leaf with center vein line. */
    function makeLeaf(scale, color, alpha) {
      const g = new Graphics();
      g.moveTo(-12 * scale, 0)
       .quadraticCurveTo(0, -6 * scale, 12 * scale, 0)
       .quadraticCurveTo(0, 6 * scale, -12 * scale, 0)
       .fill({ color, alpha });
      g.moveTo(-10 * scale, 0).lineTo(10 * scale, 0)
       .stroke({ color: 0xFFFFDE, width: 1, alpha: 0.5 });
      return g;
    }

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);
      const cx = from.x + dx * t;
      const cy = from.y + (to.y - from.y) * t + arcH * 4 * t * (1 - t);

      // Main spinning leaf
      const leaf = makeLeaf(1, 0x66BB6A, 0.9);
      leaf.x = cx; leaf.y = cy;
      leaf.rotation = elapsed * 14;
      leaf._life = 0.08;
      c.addChild(leaf);
      trails.push(leaf);

      // Afterimage (just 1, ghostly, 50% chance)
      if (Math.random() < 0.5) {
        const ghost = makeLeaf(0.7, 0x81C784, 0.25);
        ghost.x = cx + (Math.random() - 0.5) * 4;
        ghost.y = cy + (Math.random() - 0.5) * 4;
        ghost.rotation = elapsed * 14 - 0.3;
        ghost._life = 0.1; ghost._maxLife = 0.1;
        c.addChild(ghost);
        trails.push(ghost);
      }

      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i];
        tr._life -= d;
        tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.08));
        if (tr._life <= 0) { c.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
      }

      // === IMPACT ===
      if (t >= 1) {
        app.ticker.remove(tick);
        if (onImpact) onImpact();

        // Leaf splits into 4 fragments
        const explodeParticles = [];
        for (let i = 0; i < 4; i++) {
          const frag = makeLeaf(0.5, woodColors[i], 0.8);
          frag.x = to.x; frag.y = to.y;
          const a = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
          const s = 80 + Math.random() * 80;
          frag._vx = Math.cos(a) * s; frag._vy = Math.sin(a) * s - 30;
          frag._life = 0.35; frag._maxLife = 0.35;
          frag._spin = (Math.random() - 0.5) * 20; frag._gravity = 150;
          c.addChild(frag);
          explodeParticles.push(frag);
        }
        // Small green flash
        const flash = mc(0xA5D6A7, 15, 0.4);
        flash.x = to.x; flash.y = to.y; flash._life = 0.08;
        c.addChild(flash);
        trails.push(flash);
        // 6 tiny sparkle particles
        for (let i = 0; i < 6; i++) {
          const sp = mc(0xFFFFDE, 1 + Math.random(), 0.7);
          sp.x = to.x; sp.y = to.y;
          const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 60;
          sp._vx = Math.cos(a) * s; sp._vy = Math.sin(a) * s;
          sp._life = 0.2; sp._maxLife = 0.2;
          c.addChild(sp);
          explodeParticles.push(sp);
        }

        const cleanupTick = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          let alive = false;

          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i]; tr._life -= d2; tr.alpha *= 0.8;
            if (tr._life <= 0) { c.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
            else alive = true;
          }
          for (const p of explodeParticles) {
            p._life -= d2;
            if (p._life > 0) {
              alive = true;
              p.x += p._vx * d2; p.y += p._vy * d2;
              if (p._gravity) p._vy += p._gravity * d2;
              if (p._spin) p.rotation += p._spin * d2;
              p.alpha = p._life / p._maxLife;
              p.scale.set(0.5 + (p._life / p._maxLife) * 0.5);
            } else p.visible = false;
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

// ============ EARTH: EARTHEN SPIKE RUSH ============

/**
 * Sequential spikes erupt from the ground toward the target.
 * 6 spikes over 0.5s, each with dust puffs. Impact launches 35 particles upward.
 */
function fireEarthBlast(from, to, onImpact) {
  return new Promise((resolve) => {
    const { app, layers } = getStage();
    if (!app || !layers.effects) {
      if (onImpact) onImpact();
      resolve();
      return;
    }

    const c = new Container();
    layers.effects.addChild(c);

    const ec = [0x795548, 0x8D6E63, 0xBCAAA4, 0xD7CCC8, 0xFFFFFF];
    const dx = to.x - from.x;
    let elapsed = 0;
    const travelTime = 0.5;
    const baseY = from.y + 20; // ground level
    const totalSpikes = 6;
    const trails = [];
    let spikesSpawned = 0;

    // Track active spike animations
    const activeSpikes = [];

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);

      // Spawn spikes sequentially along the path
      const targetSpikes = Math.min(totalSpikes, Math.floor(t * totalSpikes) + 1);
      while (spikesSpawned < targetSpikes) {
        const spikeT = spikesSpawned / (totalSpikes - 1);
        const spikeX = from.x + dx * spikeT;
        const spikeH = 15 + Math.random() * 15;
        const spike = {
          x: spikeX,
          height: spikeH,
          age: 0,
          riseTime: 0.08,
          graphics: null,
          alive: true
        };

        // 5 dust puffs per spike
        for (let j = 0; j < 5; j++) {
          const dust = mc(
            ec[~~(Math.random() * 4)],
            1.5 + Math.random() * 3,
            0.6
          );
          dust.x = spikeX + (Math.random() - 0.5) * 10;
          dust.y = baseY;
          dust._vx = (Math.random() - 0.5) * 40;
          dust._vy = -15 - Math.random() * 30;
          dust._life = 0.2 + Math.random() * 0.2;
          dust._maxLife = dust._life;
          c.addChild(dust);
          trails.push(dust);
        }

        activeSpikes.push(spike);
        spikesSpawned++;
      }

      // Update active spikes (rise animation)
      for (const spike of activeSpikes) {
        if (!spike.alive) continue;
        spike.age += d;
        const riseT = Math.min(spike.age / spike.riseTime, 1);
        const currentH = spike.height * riseT;

        // Remove previous frame's spike graphic
        if (spike.graphics) {
          c.removeChild(spike.graphics);
          spike.graphics.destroy();
        }

        if (riseT < 1 || elapsed < travelTime + 0.3) {
          // Draw triangle spike
          const g = new Graphics();
          const color = ec[~~(Math.random() * 3)];
          g.moveTo(spike.x - 4, baseY)
           .lineTo(spike.x, baseY - currentH)
           .lineTo(spike.x + 4, baseY)
           .fill({ color, alpha: 0.9 });
          c.addChild(g);
          spike.graphics = g;
        } else {
          spike.graphics = null;
          spike.alive = false;
        }
      }

      // Update trail particles
      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i];
        tr._life -= d;
        if (tr._vx !== undefined) {
          tr.x += tr._vx * d;
          tr.y += tr._vy * d;
        }
        tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.2));
        if (tr._life <= 0) {
          c.removeChild(tr);
          tr.destroy();
          trails.splice(i, 1);
        }
      }

      // === IMPACT ===
      if (t >= 1 && spikesSpawned >= totalSpikes) {
        app.ticker.remove(tick);
        if (onImpact) onImpact();

        // 35-particle upward burst
        const explodeParticles = [];
        for (let i = 0; i < 35; i++) {
          const g = mc(
            ec[~~(Math.random() * 5)],
            2 + Math.random() * 5
          );
          g.x = to.x + (Math.random() - 0.5) * 12;
          g.y = baseY;
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // mostly upward
          const speed = 80 + Math.random() * 180;
          g._vx = Math.cos(angle) * speed;
          g._vy = Math.sin(angle) * speed;
          g._life = 0.3 + Math.random() * 0.4;
          g._maxLife = g._life;
          c.addChild(g);
          explodeParticles.push(g);
        }

        const cleanupTick = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          let alive = false;

          // Fade remaining trails
          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            tr._life -= d2;
            if (tr._vx) { tr.x += tr._vx * d2; tr.y += tr._vy * d2; }
            tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.2));
            if (tr._life <= 0) {
              c.removeChild(tr); tr.destroy(); trails.splice(i, 1);
            } else {
              alive = true;
            }
          }

          // Fade spike graphics
          for (const spike of activeSpikes) {
            if (spike.graphics) {
              spike.graphics.alpha -= d2 * 4;
              if (spike.graphics.alpha <= 0) {
                c.removeChild(spike.graphics);
                spike.graphics.destroy();
                spike.graphics = null;
                spike.alive = false;
              } else {
                alive = true;
              }
            }
          }

          // Burst particles: gravity + fade
          for (const p of explodeParticles) {
            p._life -= d2;
            if (p._life > 0) {
              alive = true;
              p.x += p._vx * d2;
              p.y += p._vy * d2;
              p._vy += 300 * d2; // heavy gravity
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

// ============ METAL: WHIP DRAW ============

/**
 * Whipping katana-draw arc — slow start, fast snap, clean horizontal slash on impact.
 * Minimal sparks, sharp and snappy.
 */
function fireMetalBlast(from, to, onImpact) {
  return new Promise((resolve) => {
    const { app, layers } = getStage();
    if (!app || !layers.effects) {
      if (onImpact) onImpact();
      resolve();
      return;
    }

    const c = new Container();
    layers.effects.addChild(c);

    const dx = to.x - from.x, dy = to.y - from.y;
    let elapsed = 0;
    const travelTime = 0.3;
    const trails = [];
    const arcHeight = -18;

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);
      // Custom ease: slow ease-in for first 40%, fast ease-out for rest
      const eased = t < 0.4
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const arcY = arcHeight * Math.sin(eased * Math.PI);
      const tipX = from.x + dx * eased;
      const tipY = from.y + dy * eased + arcY;

      // Longer trailing tail (whip has a long tail)
      const trailEased = Math.max(0, eased - 0.35);
      const trailArcY = arcHeight * Math.sin(trailEased * Math.PI);
      const tailX = from.x + dx * trailEased;
      const tailY = from.y + dy * trailEased + trailArcY;

      // Thin whip-like blade with width that increases toward tip
      const blade = new Graphics();
      const midEased = (eased + trailEased) / 2;
      const midArcY = arcHeight * Math.sin(midEased * Math.PI);
      const midX = from.x + dx * midEased;
      const midY = from.y + dy * midEased + midArcY - 2;
      blade.moveTo(tailX, tailY);
      blade.quadraticCurveTo(midX, midY, tipX, tipY);
      blade.stroke({ color: 0xFFFFFF, width: 1.5 + eased * 1.5, alpha: 0.9 });
      blade._life = 0.05;
      c.addChild(blade);
      trails.push(blade);

      // Subtle ghost trail
      const ghost = new Graphics();
      ghost.moveTo(tailX, tailY);
      ghost.quadraticCurveTo(midX, midY, tipX, tipY);
      ghost.stroke({ color: 0x90A4AE, width: 4, alpha: 0.08 });
      ghost._life = 0.08; ghost._maxLife = 0.08;
      c.addChild(ghost);
      trails.push(ghost);

      // Bright tip glint
      const glint = mc(0xFFFFFF, 1.5 + eased, 0.9);
      glint.x = tipX; glint.y = tipY;
      glint._life = 0.03;
      c.addChild(glint);
      trails.push(glint);

      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i];
        tr._life -= d;
        if (tr._vx !== undefined) { tr.x += tr._vx * d; tr.y += tr._vy * d; }
        tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.05));
        if (tr._life <= 0) { c.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
      }

      // === IMPACT ===
      if (t >= 1) {
        app.ticker.remove(tick);
        if (onImpact) onImpact();

        // Snappy L-to-R horizontal cut
        const slashLen = 26;
        const slashMark = new Graphics();
        slashMark.moveTo(to.x - slashLen, to.y);
        slashMark.lineTo(to.x + slashLen, to.y);
        slashMark.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.9 });
        slashMark._life = 0.25; slashMark._maxLife = 0.25;
        c.addChild(slashMark);
        trails.push(slashMark);
        // Glow behind slash
        const slashGlow = new Graphics();
        slashGlow.moveTo(to.x - slashLen, to.y);
        slashGlow.lineTo(to.x + slashLen, to.y);
        slashGlow.stroke({ color: 0xCFD8DC, width: 6, alpha: 0.1 });
        slashGlow._life = 0.18; slashGlow._maxLife = 0.18;
        c.addChild(slashGlow);
        trails.push(slashGlow);
        // 3 sparks — minimal, snappy, rightward bias
        for (let i = 0; i < 3; i++) {
          const sp = mc(0xFFFFFF, 1, 0.8);
          sp.x = to.x + slashLen * (0.5 + Math.random() * 0.5);
          sp.y = to.y;
          sp._vx = 30 + Math.random() * 40;
          sp._vy = (Math.random() - 0.5) * 30;
          sp._life = 0.12; sp._maxLife = 0.12;
          c.addChild(sp);
          trails.push(sp);
        }

        const cleanupTick = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            tr._life -= d2;
            if (tr._vx !== undefined) { tr.x += tr._vx * d2; tr.y += tr._vy * d2; }
            tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.05));
            if (tr._life <= 0) { c.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
          }
          if (trails.length === 0) {
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

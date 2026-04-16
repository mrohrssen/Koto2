# Element Particle Blasts — Design Spec

**Date:** 2026-04-03
**Status:** All 6 elements decided — ready for implementation

## Overview

Replace the current "lunge → burst particles at target" attack animation with element-themed **projectile blasts** that travel from attacker to target, then seamlessly transition into the existing impact explosion. Each of the 5 elements gets a distinct visual identity. Neutral moves get a generic blast.

## Architecture

- Attacker lunges (existing `pixiLunge`) → blast fires from attacker position mid-lunge
- Blast travels arc/path to target using element-specific particle behavior
- On arrival, blast particles seamlessly become the impact burst (existing `burstParticles` + `impactEffect`)
- Integrates with existing damage tier system (tier affects particle count, shake, etc.)

## Element Styles

### Fire: Classic Meteor Arc ✅

**Feel:** Glowing multi-layered core arcs upward then crashes down. Trail of smoke + embers. Big radial burst on impact.

**Key parameters:**
- Arc height: -80px (upward parabola)
- Travel time: 0.6s
- Core: 3-layer glow (red outer → yellow mid → white center)
- Trail: smoke particles (red/orange/gray), rise upward
- Impact: 50 particles, radial burst, gravity pulls embers down

**Prototype code (PixiJS 8):**

```javascript
// Fire: Classic Meteor Arc
// Launches a glowing fireball on a parabolic arc from `from` to `to`.
// Calls `onImpact()` when it arrives, then explodes into embers.
//
// Usage: fireClassicMeteor(app, fromPos, toPos, () => { /* impact callback */ })

function fireClassicMeteor(app, from, to, onImpact) {
  const container = new PIXI.Container();
  app.stage.addChild(container);

  const dx = to.x - from.x;
  const arcHeight = -80; // pixels upward at peak
  let elapsed = 0;
  const travelTime = 0.6; // seconds
  const trails = [];

  const smokeColors = [0xEF5350, 0xFF7043, 0x555555];
  const burstColors = [0xEF5350, 0xFF7043, 0xFFA726, 0xFFD54F, 0xFFFFFF];

  function makeCircle(color, radius, alpha = 1) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, radius).fill({ color, alpha });
    return g;
  }

  const tick = (dt) => {
    const d = dt.deltaMS / 1000;
    elapsed += d;
    const t = Math.min(elapsed / travelTime, 1);

    // Linear horizontal, parabolic vertical
    const cx = from.x + dx * t;
    const cy = from.y + (to.y - from.y) * t + arcHeight * 4 * t * (1 - t);

    // --- Multi-layered glowing core ---
    const core = new PIXI.Graphics();
    core.circle(0, 0, 16).fill({ color: 0xEF5350, alpha: 0.3 }); // outer red glow
    core.circle(0, 0, 10).fill({ color: 0xFFD54F, alpha: 0.6 }); // mid yellow
    core.circle(0, 0, 6).fill({ color: 0xFFFFFF, alpha: 0.9 });   // bright white center
    core.x = cx;
    core.y = cy;
    core._life = 0.15;
    container.addChild(core);
    trails.push(core);

    // --- Smoke/ember trail ---
    for (let i = 0; i < 3; i++) {
      const tg = makeCircle(
        smokeColors[Math.floor(Math.random() * 3)],
        2 + Math.random() * 5,
        0.8
      );
      tg.x = cx + (Math.random() - 0.5) * 12;
      tg.y = cy + (Math.random() - 0.5) * 12;
      tg._vx = (Math.random() - 0.5) * 30;
      tg._vy = -20 - Math.random() * 40; // floats upward
      tg._life = 0.3 + Math.random() * 0.3;
      tg._maxLife = tg._life;
      container.addChild(tg);
      trails.push(tg);
    }

    // --- Update all trail particles ---
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
        container.removeChild(tr);
        tr.destroy();
        trails.splice(i, 1);
      }
    }

    // --- Impact ---
    if (t >= 1) {
      app.ticker.remove(tick);
      onImpact();

      // Radial burst explosion
      const explodeParticles = [];
      for (let i = 0; i < 50; i++) {
        const g = makeCircle(
          burstColors[Math.floor(Math.random() * 5)],
          2 + Math.random() * 6
        );
        g.x = to.x;
        g.y = to.y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 200;
        g._vx = Math.cos(angle) * speed;
        g._vy = Math.sin(angle) * speed - 60; // slight upward bias
        g._life = 0.3 + Math.random() * 0.5;
        g._maxLife = g._life;
        container.addChild(g);
        explodeParticles.push(g);
      }

      const explodeTick = (dt2) => {
        const d2 = dt2.deltaMS / 1000;
        let alive = false;

        // Fade remaining trails
        for (let i = trails.length - 1; i >= 0; i--) {
          const tr = trails[i];
          tr._life -= d2;
          if (tr._vx) { tr.x += tr._vx * d2; tr.y += tr._vy * d2; }
          tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.15));
          if (tr._life <= 0) {
            container.removeChild(tr); tr.destroy(); trails.splice(i, 1);
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
          app.ticker.remove(explodeTick);
          app.stage.removeChild(container);
          container.destroy({ children: true });
        }
      };
      app.ticker.add(explodeTick);
    }
  };

  app.ticker.add(tick);
}
```

**Tunable parameters:**
| Parameter | Value | Notes |
|-----------|-------|-------|
| `arcHeight` | -80 | Negative = upward. Higher magnitude = taller arc |
| `travelTime` | 0.6s | End-to-end flight duration |
| Core layers | 16/10/6px | Outer glow / mid / bright center radii |
| Trail count | 3/frame | Smoke particles spawned per frame |
| Trail rise speed | -20 to -60 | Upward velocity (fire rises) |
| Burst count | 50 | Impact explosion particles |
| Burst gravity | 180 | Downward pull on burst embers |
| Burst speed | 80-280 | Radial velocity range |

### Water: Riptide Vortex (#5) ✅

**Feel:** Swirling water ring travels to target, erupts on impact. Spiral motion gives it a distinctive rotating identity.

### Wood: Razor Leaf (#1) ✅

**Feel:** Single spinning leaf-shaped blade flies a flat arc, splits into 4 fragments on impact with small green flash and sparkles.

**Key parameters:**
| Parameter | Value | Notes |
|-----------|-------|-------|
| `arcHeight` | -40 | Moderate upward parabola |
| `travelTime` | 0.45s | Medium pace, leaf visible throughout |
| Leaf shape | Pointed ellipse with center vein | Custom `makeLeaf()` helper |
| Spin speed | 14 rad/s | Fast spin during flight |
| Afterimage | 50% chance per frame, 0.7x scale | Single ghostly trailing leaf |
| Impact fragments | 4 leaf pieces | Radial burst with gravity + spin |
| Sparkle particles | 6 | Tiny yellow-white sparkles |

**Prototype code (PixiJS 8):**

```javascript
// Wood: Razor Leaf
// Single spinning leaf blade arcs from `from` to `to`.
// Calls `onImpact()` on arrival, then splits into fragments.
//
// Usage: fireRazorLeaf(app, fromPos, toPos, () => { /* impact callback */ })

function fireRazorLeaf(app, from, to, onImpact) {
  const container = new PIXI.Container();
  app.stage.addChild(container);

  const dx = to.x - from.x;
  const arcH = -40;
  let elapsed = 0;
  const travelTime = 0.45;
  const trails = [];
  const wc = [0x66BB6A, 0x81C784, 0xA5D6A7, 0x4CAF50, 0xFFFFDE];

  function makeCircle(color, radius, alpha = 1) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, radius).fill({ color, alpha });
    return g;
  }

  function makeLeaf(scale, color, alpha) {
    const g = new PIXI.Graphics();
    g.moveTo(-12 * scale, 0)
     .quadraticCurveTo(0, -6 * scale, 12 * scale, 0)
     .quadraticCurveTo(0, 6 * scale, -12 * scale, 0)
     .fill({ color, alpha });
    g.moveTo(-10 * scale, 0).lineTo(10 * scale, 0).stroke({ color: 0xFFFFDE, width: 1, alpha: 0.5 });
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
    container.addChild(leaf);
    trails.push(leaf);

    // Afterimage (just 1, ghostly)
    if (Math.random() < 0.5) {
      const ghost = makeLeaf(0.7, 0x81C784, 0.25);
      ghost.x = cx + (Math.random() - 0.5) * 4;
      ghost.y = cy + (Math.random() - 0.5) * 4;
      ghost.rotation = elapsed * 14 - 0.3;
      ghost._life = 0.1; ghost._maxLife = 0.1;
      container.addChild(ghost);
      trails.push(ghost);
    }

    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      tr._life -= d;
      tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.08));
      if (tr._life <= 0) { container.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
    }

    if (t >= 1) {
      app.ticker.remove(tick);
      onImpact();

      // Leaf splits into 4 fragments
      const explodeParticles = [];
      for (let i = 0; i < 4; i++) {
        const frag = makeLeaf(0.5, wc[i], 0.8);
        frag.x = to.x; frag.y = to.y;
        const a = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
        const s = 80 + Math.random() * 80;
        frag._vx = Math.cos(a) * s; frag._vy = Math.sin(a) * s - 30;
        frag._life = 0.35; frag._maxLife = 0.35;
        frag._spin = (Math.random() - 0.5) * 20; frag._gravity = 150;
        container.addChild(frag);
        explodeParticles.push(frag);
      }
      // Small green flash
      const flash = makeCircle(0xA5D6A7, 15, 0.4);
      flash.x = to.x; flash.y = to.y; flash._life = 0.08;
      container.addChild(flash);
      trails.push(flash);
      // 6 tiny sparkle particles
      for (let i = 0; i < 6; i++) {
        const sp = makeCircle(0xFFFFDE, 1 + Math.random(), 0.7);
        sp.x = to.x; sp.y = to.y;
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 60;
        sp._vx = Math.cos(a) * s; sp._vy = Math.sin(a) * s;
        sp._life = 0.2; sp._maxLife = 0.2;
        container.addChild(sp);
        explodeParticles.push(sp);
      }

      const explodeTick = (dt2) => {
        const d2 = dt2.deltaMS / 1000;
        let alive = false;

        for (let i = trails.length - 1; i >= 0; i--) {
          const tr = trails[i]; tr._life -= d2; tr.alpha *= 0.8;
          if (tr._life <= 0) { container.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
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
          app.ticker.remove(explodeTick);
          app.stage.removeChild(container);
          container.destroy({ children: true });
        }
      };
      app.ticker.add(explodeTick);
    }
  };

  app.ticker.add(tick);
}
```

### Earth: Earthen Spike Rush (#2) ✅

**Feel:** Spikes erupt from ground in sequence toward target, final spike launches debris upward. Sequential ground animation is unique among elements.

### Metal: Whip Draw (#3) ✅

**Feel:** Whipping katana-draw arc — starts slow, accelerates fast, snaps a clean horizontal left-to-right slash at the target. Minimal sparks, sharp and snappy.

**Key parameters:**
| Parameter | Value | Notes |
|-----------|-------|-------|
| `arcHeight` | -18 | Low, tight arc (whip-like) |
| `travelTime` | 0.3s | Ease-in then fast snap |
| Easing | Custom 2-phase | Slow ease-in (40%), fast ease-out (60%) |
| Blade width | 1.5 → 3px | Width increases with eased progress (acceleration feel) |
| Trail length | 0.35 eased units | Long tail behind blade |
| Ghost trail | width 4, alpha 0.08 | Subtle silver afterimage |
| Tip glint | 1.5 → 2.5px radius | Grows with speed |
| Slash mark | 52px horizontal line | Perfectly horizontal L-to-R |
| Sparks | 3 | Rightward bias, from slash end |

**Prototype code (PixiJS 8):**

```javascript
// Metal: Whip Draw
// Whipping katana-draw arc from `from` to `to`, snappy horizontal slash on impact.
// Calls `onImpact()` when it arrives.
//
// Usage: fireWhipDraw(app, fromPos, toPos, () => { /* impact callback */ })

function fireWhipDraw(app, from, to, onImpact) {
  const container = new PIXI.Container();
  app.stage.addChild(container);

  const dx = to.x - from.x, dy = to.y - from.y;
  let elapsed = 0;
  const travelTime = 0.3;
  const trails = [];

  function makeCircle(color, radius, alpha = 1) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, radius).fill({ color, alpha });
    return g;
  }

  const tick = (dt) => {
    const d = dt.deltaMS / 1000;
    elapsed += d;
    const t = Math.min(elapsed / travelTime, 1);
    // Ease-in-out: slow start, fast middle, sharp arrival (whip feel)
    const eased = t < 0.4
      ? 2 * t * t  // slow ease-in for first 40%
      : 1 - Math.pow(-2 * t + 2, 3) / 2; // fast ease-out for rest

    // Lower, tighter arc — more like a whipping horizontal motion
    const arcHeight = -18;
    const arcY = arcHeight * Math.sin(eased * Math.PI);

    const tipX = from.x + dx * eased;
    const tipY = from.y + dy * eased + arcY;

    // Longer trailing tail (whip has a long tail)
    const trailEased = Math.max(0, eased - 0.35);
    const trailArcY = arcHeight * Math.sin(trailEased * Math.PI);
    const tailX = from.x + dx * trailEased;
    const tailY = from.y + dy * trailEased + trailArcY;

    // Thin whip-like blade with width that increases toward tip
    const blade = new PIXI.Graphics();
    const midEased = (eased + trailEased) / 2;
    const midArcY = arcHeight * Math.sin(midEased * Math.PI);
    const midX = from.x + dx * midEased;
    const midY = from.y + dy * midEased + midArcY - 2;
    blade.moveTo(tailX, tailY);
    blade.quadraticCurveTo(midX, midY, tipX, tipY);
    blade.stroke({ color: 0xFFFFFF, width: 1.5 + eased * 1.5, alpha: 0.9 });
    blade._life = 0.05;
    container.addChild(blade);
    trails.push(blade);

    // Subtle ghost
    const ghost = new PIXI.Graphics();
    ghost.moveTo(tailX, tailY);
    ghost.quadraticCurveTo(midX, midY, tipX, tipY);
    ghost.stroke({ color: 0x90A4AE, width: 4, alpha: 0.08 });
    ghost._life = 0.08; ghost._maxLife = 0.08;
    container.addChild(ghost);
    trails.push(ghost);

    // Bright tip
    const glint = makeCircle(0xFFFFFF, 1.5 + eased, 0.9);
    glint.x = tipX; glint.y = tipY;
    glint._life = 0.03;
    container.addChild(glint);
    trails.push(glint);

    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      tr._life -= d;
      if (tr._vx !== undefined) { tr.x += tr._vx * d; tr.y += tr._vy * d; }
      tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.05));
      if (tr._life <= 0) { container.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
    }

    if (t >= 1) {
      app.ticker.remove(tick);
      onImpact();

      // Snappy L-to-R horizontal cut
      const slashLen = 26;
      const slashMark = new PIXI.Graphics();
      slashMark.moveTo(to.x - slashLen, to.y);
      slashMark.lineTo(to.x + slashLen, to.y);
      slashMark.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.9 });
      slashMark._life = 0.25; slashMark._maxLife = 0.25;
      container.addChild(slashMark);
      trails.push(slashMark);
      // Glow
      const glow = new PIXI.Graphics();
      glow.moveTo(to.x - slashLen, to.y);
      glow.lineTo(to.x + slashLen, to.y);
      glow.stroke({ color: 0xCFD8DC, width: 6, alpha: 0.1 });
      glow._life = 0.18; glow._maxLife = 0.18;
      container.addChild(glow);
      trails.push(glow);
      // 3 sparks — minimal, snappy, rightward bias
      for (let i = 0; i < 3; i++) {
        const sp = makeCircle(0xFFFFFF, 1, 0.8);
        sp.x = to.x + slashLen * (0.5 + Math.random() * 0.5);
        sp.y = to.y;
        sp._vx = 30 + Math.random() * 40;
        sp._vy = (Math.random() - 0.5) * 30;
        sp._life = 0.12; sp._maxLife = 0.12;
        container.addChild(sp);
        trails.push(sp);
      }

      const explodeTick = (dt2) => {
        const d2 = dt2.deltaMS / 1000;
        for (let i = trails.length - 1; i >= 0; i--) {
          const tr = trails[i];
          tr._life -= d2;
          if (tr._vx !== undefined) { tr.x += tr._vx * d2; tr.y += tr._vy * d2; }
          tr.alpha = Math.max(0, tr._life / (tr._maxLife || 0.05));
          if (tr._life <= 0) { container.removeChild(tr); tr.destroy(); trails.splice(i, 1); }
        }
        if (trails.length === 0) {
          app.ticker.remove(explodeTick);
          app.stage.removeChild(container);
          container.destroy({ children: true });
        }
      };
      app.ticker.add(explodeTick);
    }
  };

  app.ticker.add(tick);
}
```

### Neutral: Energy Bolt (#1) ✅

**Feel:** Simple white energy ball, straight line, clean burst. Intentionally understated as the "no element" baseline.

## Integration Plan

The blast function signature will be consistent across all elements:

```javascript
function fireElementBlast(app, from, to, element, onImpact) {
  // Dispatches to element-specific implementation
  const blastFn = ELEMENT_BLASTS[element] || ELEMENT_BLASTS.neutral;
  blastFn(app, from, to, onImpact);
}
```

This gets called from `combat-loop.js` between the lunge start and the existing `impactEffect()`. The `onImpact` callback triggers the existing screen shake, hit stop, damage number, and recoil.

## Prototype Links

All prototypes are served at **http://76.13.220.142:8081/** — click each panel to fire.

| Element | URL | Variations | Status |
|---------|-----|------------|--------|
| **Fire** | [fire-blasts.html](http://76.13.220.142:8081/fire-blasts.html) | 10 meteor arc variations | **DECIDED: Classic Meteor (#1)** |
| **Water** | [water-blasts.html](http://76.13.220.142:8081/water-blasts.html) | 1: Tidal Wave, 2: Water Bolt Arc, 3: Hydro Cannon, 4: Bubble Barrage, 5: Riptide Vortex | **DECIDED: Riptide Vortex (#5)** |
| **Wood** | [wood-blasts.html](http://76.13.220.142:8081/wood-blasts.html) | 1: Razor Leaf, 2: Root Surge, 3: Bamboo Lance, 4: Seed Bloom, 5: Thorn Whip | **DECIDED: Razor Leaf (#1)** |
| **Earth** | [earth-blasts.html](http://76.13.220.142:8081/earth-blasts.html) | 1: Boulder Lob, 2: Earthen Spike Rush, 3: Rock Barrage, 4: Seismic Wave, 5: Meteor-Style Rock | **DECIDED: Earthen Spike Rush (#2)** |
| **Metal** | [metal-blasts.html](http://76.13.220.142:8081/metal-blasts.html) | Round 4: 1: Clean Draw, 2: Steep Draw, 3: Whip Draw, 4: Rising Slash, 5: Delayed Reveal | **DECIDED: Whip Draw (#3)** |
| **Neutral** | [neutral-blasts.html](http://76.13.220.142:8081/neutral-blasts.html) | 1: Energy Bolt, 2: Force Push, 3: Quick Strike, 4: Arc Lob, 5: Pulse Shot | **DECIDED: Energy Bolt (#1)** |

### Resuming this work

To continue in a new session:
1. Review prototypes at the URLs above (server may need restarting: `cd /root/Koto2/tmp && python3 -m http.server 8081 --bind 0.0.0.0 &`)
2. Pick one variation per element
3. Document the chosen code in this spec (like Fire above)
4. Proceed to implementation plan

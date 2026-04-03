# Element Particle Blasts — Design Spec

**Date:** 2026-04-03
**Status:** In Progress — prototyping element styles

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

### Water: TBD
### Wood: TBD
### Earth: TBD
### Metal: TBD
### Neutral: TBD

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
| **Water** | [water-blasts.html](http://76.13.220.142:8081/water-blasts.html) | 1: Tidal Wave, 2: Water Bolt Arc, 3: Hydro Cannon, 4: Bubble Barrage, 5: Riptide Vortex | Awaiting pick |
| **Wood** | [wood-blasts.html](http://76.13.220.142:8081/wood-blasts.html) | 1: Leaf Storm, 2: Vine Whip, 3: Seed Bomb Arc, 4: Thorn Volley, 5: Spore Cloud | Awaiting pick |
| **Earth** | [earth-blasts.html](http://76.13.220.142:8081/earth-blasts.html) | 1: Boulder Lob, 2: Earthen Spike Rush, 3: Rock Barrage, 4: Seismic Wave, 5: Meteor-Style Rock | Awaiting pick |
| **Metal** | [metal-blasts.html](http://76.13.220.142:8081/metal-blasts.html) | 1: Railgun Streak, 2: Shrapnel Burst, 3: Steel Orb Arc, 4: Magnetic Pulse, 5: Blade Fan | Awaiting pick |
| **Neutral** | [neutral-blasts.html](http://76.13.220.142:8081/neutral-blasts.html) | 1: Energy Bolt, 2: Force Push, 3: Quick Strike, 4: Arc Lob, 5: Pulse Shot | Awaiting pick |

### Resuming this work

To continue in a new session:
1. Review prototypes at the URLs above (server may need restarting: `cd /root/Koto2/tmp && python3 -m http.server 8081 --bind 0.0.0.0 &`)
2. Pick one variation per element
3. Document the chosen code in this spec (like Fire above)
4. Proceed to implementation plan

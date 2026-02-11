# Animated Robot Sprites — Starter Bots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CSS sprite sheet animations (idle, attack, hit) for the 3 starter robots (fire-common, water-common, wood-common) with graceful fallback to static sprites for all other robots.

**Architecture:** A `RobotAnimator` class manages per-robot sprite sheet animation using CSS `steps()` timing on horizontal WebP strips. A JSON manifest maps robot IDs to frame counts and timing. Robots without manifest entries fall back to existing static `<img>` sprites. Animations appear only in combat (scene.js enemy display, robot-row.js player slots). Collection/equip screens retain static portraits.

**Tech Stack:** CSS `steps()` animation with custom properties, vanilla JS ES6 module, WebP horizontal sprite sheets (192×192 frames), Python/Pillow for placeholder generation

**Key integration points** (all places robot sprites render):
- `public/js/ui/scene.js` — enemy display in combat (single + multi)
- `public/js/ui/robot-row.js` — player party slots in combat
- `public/js/ui/combat-loop.js` — attack/hit animation triggers
- `public/game.js:538,605,1056,1075` — collection grid, toasts, equip screen (NOT changing — keep static portraits)

---

## Task 1: Create animation manifest

**Files:**
- Create: `public/assets/sprites/robots/manifest.json`

**Step 1: Create the manifest file**

Create `public/assets/sprites/robots/manifest.json` with entries for the 3 starter robots only. All other robots will fall back to static sprites automatically.

```json
{
  "fire-common": {
    "frameSize": 192,
    "animations": {
      "idle":   { "frames": 24, "duration": 1000, "loop": true },
      "attack": { "frames": 14, "duration": 583,  "loop": false },
      "hit":    { "frames": 8,  "duration": 333,  "loop": false }
    }
  },
  "water-common": {
    "frameSize": 192,
    "animations": {
      "idle":   { "frames": 24, "duration": 1000, "loop": true },
      "attack": { "frames": 14, "duration": 583,  "loop": false },
      "hit":    { "frames": 8,  "duration": 333,  "loop": false }
    }
  },
  "wood-common": {
    "frameSize": 192,
    "animations": {
      "idle":   { "frames": 24, "duration": 1000, "loop": true },
      "attack": { "frames": 14, "duration": 583,  "loop": false },
      "hit":    { "frames": 8,  "duration": 333,  "loop": false }
    }
  }
}
```

**Step 2: Commit**

```bash
git add public/assets/sprites/robots/manifest.json
git commit -m "feat: add robot animation manifest for 3 starters"
```

---

## Task 2: Generate placeholder sprite sheets

Before generating real Wan 2.2 animations, create placeholder strips from existing static sprites to test the entire animation pipeline. Uses brightness variation per frame so animation is visually obvious.

**Files:**
- Create: `scripts/create-placeholder-sprites.py`
- Creates: `public/assets/sprites/robots/{fire,water,wood}-common/{idle,attack,hit}.webp`

**Step 1: Write the placeholder script**

Create `scripts/create-placeholder-sprites.py`:

```python
#!/usr/bin/env python3
"""Create placeholder sprite sheets from existing static sprites.
Repeats each robot's static .webp into horizontal strips with
per-frame brightness variation to visually verify animation works.
"""
from PIL import Image, ImageEnhance
import os

ROBOTS = ['fire-common', 'water-common', 'wood-common']
FRAME_SIZE = 192
STATES = {'idle': 24, 'attack': 14, 'hit': 8}
SPRITE_DIR = os.path.join(os.path.dirname(__file__),
                          '..', 'public', 'assets', 'sprites', 'robots')

for robot_id in ROBOTS:
    static_path = os.path.join(SPRITE_DIR, f'{robot_id}.webp')
    if not os.path.exists(static_path):
        print(f'  SKIP {robot_id} — static sprite not found')
        continue

    out_dir = os.path.join(SPRITE_DIR, robot_id)
    os.makedirs(out_dir, exist_ok=True)

    static = Image.open(static_path).convert('RGBA')
    frame = static.resize((FRAME_SIZE, FRAME_SIZE), Image.LANCZOS)

    for state, count in STATES.items():
        strip = Image.new('RGBA', (FRAME_SIZE * count, FRAME_SIZE), (0, 0, 0, 0))
        for i in range(count):
            f = frame.copy()
            # Oscillating brightness: 0.7 → 1.3 → 0.7 cycle
            t = i / max(count - 1, 1)
            brightness = 0.7 + 0.6 * abs(2 * t - 1) if state == 'idle' else 0.5 + t
            f = ImageEnhance.Brightness(f).enhance(brightness)
            strip.paste(f, (i * FRAME_SIZE, 0))

        out_path = os.path.join(out_dir, f'{state}.webp')
        strip.save(out_path, 'WEBP', quality=90)
        print(f'  {robot_id}/{state}.webp — {count} frames ({FRAME_SIZE * count}x{FRAME_SIZE})')

print('Done.')
```

**Step 2: Run the script**

```bash
pip3 install Pillow
python3 scripts/create-placeholder-sprites.py
```

Expected output:
```
  fire-common/idle.webp — 24 frames (4608x192)
  fire-common/attack.webp — 14 frames (2688x192)
  fire-common/hit.webp — 8 frames (1536x192)
  water-common/idle.webp — 24 frames (4608x192)
  water-common/attack.webp — 14 frames (2688x192)
  water-common/hit.webp — 8 frames (1536x192)
  wood-common/idle.webp — 24 frames (4608x192)
  wood-common/attack.webp — 14 frames (2688x192)
  wood-common/hit.webp — 8 frames (1536x192)
Done.
```

**Step 3: Verify files exist**

```bash
ls public/assets/sprites/robots/fire-common/
ls public/assets/sprites/robots/water-common/
ls public/assets/sprites/robots/wood-common/
```

Each directory should contain: `idle.webp  attack.webp  hit.webp`

**Step 4: Commit**

```bash
git add scripts/create-placeholder-sprites.py
git add public/assets/sprites/robots/fire-common/
git add public/assets/sprites/robots/water-common/
git add public/assets/sprites/robots/wood-common/
git commit -m "feat: add placeholder sprite sheets for animation testing"
```

---

## Task 3: Add sprite animation CSS

**Files:**
- Modify: `public/game.css` — add after the `.robot-enemy .enemy-sprite` block (around line 292)

**Step 1: Add the CSS keyframe and sprite classes**

Add these rules to `public/game.css` after the `.robot-enemy .enemy-sprite` section (around line 292):

```css
/* === Animated Robot Sprite Sheets === */
@keyframes spriteStep {
  to { background-position: var(--sprite-end) 0; }
}

.robot-animated-sprite {
  background-repeat: no-repeat;
  background-size: auto 100%;
  image-rendering: auto;
}

/* Enemy combat display — match static enemy sprite sizing */
.enemy-sprite-container .robot-animated-sprite {
  width: 90px;
  height: 90px;
}

/* Player robot slot icons */
.robot-icon .robot-animated-sprite {
  width: 56px;
  height: 56px;
}

/* Multi-enemy row icons */
.enemy-robot-icon .robot-animated-sprite {
  width: 50px;
  height: 50px;
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat: add CSS for sprite sheet animations"
```

---

## Task 4: Create RobotAnimator module

**Files:**
- Create: `public/js/ui/robot-animator.js`

**Step 1: Write the module**

Create `public/js/ui/robot-animator.js`:

```js
/**
 * @file robot-animator.js - Sprite Sheet Animation Controller
 *
 * PURPOSE:
 * Manages animated sprite sheets for robots in combat. Uses CSS steps()
 * animation on horizontal WebP strips. Falls back to static sprites
 * for robots without manifest entries.
 *
 * KEY EXPORTS:
 * - loadManifest(): Fetch manifest.json (call once at startup)
 * - hasAnimation(robotId): Check if robot has animated sprites
 * - createAnimator(robotId): Create animator instance (or null)
 * - preloadSprites(robotIds): Preload sprite sheets for upcoming combat
 * - registerAnimator(category, key, animator): Store for combat triggers
 * - triggerAnimation(category, key, state): Fire animation on registered animator
 * - clearAnimators(category?): Destroy registered animators
 *
 * DEPENDENCIES:
 * - /assets/sprites/robots/manifest.json (served statically)
 * - /assets/sprites/robots/{robotId}/{state}.webp sprite sheets
 */

let manifest = null;

const registry = {
  enemy: {},
  player: {}
};

/** Load the animation manifest. Call once at app startup. */
export async function loadManifest() {
  try {
    const res = await fetch('/assets/sprites/robots/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch (e) {
    console.warn('Robot animation manifest not found:', e.message);
  }
}

/** Check if a robot has animated sprites. */
export function hasAnimation(robotId) {
  return manifest != null && robotId in manifest;
}

/** Preload sprite sheets for a list of robot IDs. */
export function preloadSprites(robotIds) {
  if (!manifest) return Promise.resolve();
  const loads = [];
  for (const id of robotIds) {
    const entry = manifest[id];
    if (!entry) continue;
    for (const state of Object.keys(entry.animations)) {
      loads.push(new Promise(resolve => {
        const img = new Image();
        img.onload = img.onerror = resolve;
        img.src = `/assets/sprites/robots/${id}/${state}.webp`;
      }));
    }
  }
  return Promise.all(loads);
}

/** Create an animator for a robot. Returns null if no manifest entry. */
export function createAnimator(robotId) {
  if (!manifest?.[robotId]) return null;
  return new RobotAnimator(robotId, manifest[robotId]);
}

/** Register an animator for later triggering from combat-loop. */
export function registerAnimator(category, key, animator) {
  registry[category][key] = animator;
}

/** Trigger an animation on a registered animator. */
export function triggerAnimation(category, key, state) {
  registry[category]?.[key]?.play(state);
}

/** Destroy registered animators and clear registry. If category given, only clear that category. */
export function clearAnimators(category) {
  const cats = category ? [category] : Object.keys(registry);
  for (const c of cats) {
    if (!registry[c]) continue;
    for (const a of Object.values(registry[c])) a.destroy();
    registry[c] = {};
  }
}

class RobotAnimator {
  constructor(robotId, config) {
    this.robotId = robotId;
    this.config = config;
    this.state = null;
    this.el = document.createElement('div');
    this.el.className = 'robot-animated-sprite';

    this.el.addEventListener('animationend', () => {
      if (this.state !== 'idle') this.play('idle');
    });
  }

  /** Play an animation state: 'idle', 'attack', or 'hit'. */
  play(state) {
    const anim = this.config.animations[state];
    if (!anim) return;

    this.state = state;
    const totalWidth = anim.frames * this.config.frameSize;

    this.el.style.backgroundImage =
      `url(/assets/sprites/robots/${this.robotId}/${state}.webp)`;
    this.el.style.setProperty('--sprite-end', `-${totalWidth}px`);

    // Reset animation (force reflow between removal and reapplication)
    this.el.style.animation = 'none';
    void this.el.offsetHeight;
    this.el.style.animation =
      `spriteStep ${anim.duration}ms steps(${anim.frames}) ${anim.loop ? 'infinite' : '1'}`;
  }

  /** Remove from DOM and cleanup. */
  destroy() {
    this.el.remove();
    this.state = null;
  }
}
```

**Step 2: Syntax check**

```bash
node --check public/js/ui/robot-animator.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/robot-animator.js
git commit -m "feat: add RobotAnimator class for sprite sheet animations"
```

---

## Task 5: Load manifest at startup and preload on combat entry

**Files:**
- Modify: `public/game.js`

**Step 1: Add import**

At `public/game.js` line 95, after the `import * as scene` line, add:

```js
import * as robotAnimator from './js/ui/robot-animator.js';
```

**Step 2: Load manifest in initGame()**

In `initGame()` (line 1295), add `await robotAnimator.loadManifest();` early — right after `takeover.init();` (line 1296):

```js
async function initGame() {
  takeover.init();
  await robotAnimator.loadManifest();
  leaderboard.init();
  // ... rest unchanged
```

**Step 3: Preload sprites on encounter start**

In `startEncounter()` (line 616), after updating game state (line 629), add preloading before `startCombatLoop()`:

```js
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    // Preload animated sprite sheets for robots in this fight
    const robotIds = [
      ...(gameState.run?.robotParty?.active || []).map(r => r?.id).filter(Boolean),
      ...(gameState.combat?.enemies || []).map(e => e?.id).filter(Boolean)
    ];
    robotAnimator.preloadSprites(robotIds);
    // ... rest unchanged (dialogue, delay, startCombatLoop)
```

**Step 4: Syntax check**

```bash
node --check public/game.js && echo "OK"
```

**Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat: load robot animation manifest at startup, preload on combat"
```

---

## Task 6: Integrate animated sprites into scene.js (enemy display)

This is the largest task. We modify `showEnemy()` and `showEnemies()` to use animated sprites for robots that have manifest entries, while keeping static `<img>` sprites for all others.

**Files:**
- Modify: `public/js/ui/scene.js`

**Step 1: Add import**

At `public/js/ui/scene.js` line 30, after the dom import, add:

```js
import { hasAnimation, createAnimator, registerAnimator, clearAnimators } from './robot-animator.js';
```

**Step 2: Modify showEnemy() for animated sprites**

In `showEnemy()` (line 55), replace the sprite loading section (lines 78-94) with a branch that checks for animation:

Replace this block (lines 78-94):
```js
  // Construct sprite path from enemy ID
  const spritePath = enemy.sprite || (isRobot
    ? `/assets/sprites/robots/${enemy.id}.webp`
    : `/assets/sprites/enemies/${enemy.id}.webp`);
  dom.enemySprite.src = spritePath;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
    if (isRobot) {
      showRobotPlaceholder(enemy);
    } else {
      showPlaceholder(enemy);
    }
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
```

With:
```js
  // Animated sprite path for robots with manifest entries
  if (isRobot && hasAnimation(enemy.id)) {
    dom.enemySprite.style.display = 'none';
    clearAnimators('enemy');
    removePlaceholder();
    const animator = createAnimator(enemy.id);
    dom.enemySpriteContainer.appendChild(animator.el);
    animator.play('idle');
    registerAnimator('enemy', 0, animator);
  } else {
    // Static sprite fallback
    const spritePath = enemy.sprite || (isRobot
      ? `/assets/sprites/robots/${enemy.id}.webp`
      : `/assets/sprites/enemies/${enemy.id}.webp`);
    dom.enemySprite.src = spritePath;
    dom.enemySprite.onerror = () => {
      dom.enemySprite.classList.remove('visible');
      if (isRobot) {
        showRobotPlaceholder(enemy);
      } else {
        showPlaceholder(enemy);
      }
    };
    dom.enemySprite.onload = () => {
      removePlaceholder();
      dom.enemySprite.classList.add('visible');
    };
  }
```

**Step 3: Modify showEnemies() for animated multi-enemy display**

In `showEnemies()` (line 98), after the row is appended to the container (line 146: `dom.enemySpriteContainer.appendChild(row);`), add animation replacement:

```js
  dom.enemySpriteContainer.appendChild(row);

  // Replace static imgs with animators for robots that have animations
  clearAnimators('enemy');
  for (let i = 0; i < enemies.length; i++) {
    if (hasAnimation(enemies[i].id)) {
      const slot = row.querySelector(`.enemy-robot-slot[data-enemy-index="${i}"]`);
      const img = slot?.querySelector('.enemy-robot-sprite');
      if (img) {
        const animator = createAnimator(enemies[i].id);
        img.replaceWith(animator.el);
        animator.play('idle');
        registerAnimator('enemy', i, animator);
      }
    }
  }
```

**Step 4: Clean up animators in hideEnemy() and hideEnemies()**

In `hideEnemy()` (line 313), add `clearAnimators('enemy');` and restore img display:

```js
export function hideEnemy() {
  clearAnimators('enemy');
  dom.enemySprite.style.display = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = '';
  dom.enemySpriteContainer.style.borderColor = '';
  dom.enemySpriteContainer.classList.remove('robot-enemy');
  removePlaceholder();
}
```

In `hideEnemies()` (line 186), `clearAnimators('enemy')` is already called by `hideEnemy()` — no changes needed.

**Step 5: Syntax check**

```bash
node --check public/js/ui/scene.js && echo "OK"
```

**Step 6: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat: integrate animated sprites into enemy combat display"
```

---

## Task 7: Integrate animated sprites into robot-row.js (player slots)

**Files:**
- Modify: `public/js/ui/robot-row.js`

**Step 1: Add import**

At `public/js/ui/robot-row.js` line 19, after the dom import, add:

```js
import { hasAnimation, createAnimator, registerAnimator, clearAnimators } from './robot-animator.js';
```

**Step 2: Modify render() to use animated sprites**

In `render()` (line 65), after the `row.appendChild(slot)` for each robot (line 101), add animation replacement. Insert this block before `row.appendChild(slot)` (just before line 101):

```js
      // Replace static img with animator for robots that have animations
      if (hasAnimation(robot.id)) {
        const img = slot.querySelector('.robot-sprite-icon');
        if (img) {
          const animator = createAnimator(robot.id);
          img.replaceWith(animator.el);
          animator.play('idle');
          registerAnimator('player', i, animator);
        }
      }
```

Also add `clearAnimators('player');` at the start of `render()`, right after `row.innerHTML = '';` (line 67):

```js
export function render(robots) {
  const row = dom.chipRow;
  row.innerHTML = '';
  clearAnimators('player');
  currentActiveRobots = robots || [];
  // ... rest unchanged
```

**Step 3: Syntax check**

```bash
node --check public/js/ui/robot-row.js && echo "OK"
```

**Step 4: Commit**

```bash
git add public/js/ui/robot-row.js
git commit -m "feat: integrate animated sprites into player robot slots"
```

---

## Task 8: Wire combat animation triggers

When a player attacks, play 'attack' on their animator. When a robot takes damage, play 'hit' on their animator. When an enemy attacks, play 'attack' on their animator.

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add import**

At `public/js/ui/combat-loop.js` line 47, after the `import { playAttackSound ... }` line, add:

```js
import { triggerAnimation } from './robot-animator.js';
```

**Step 2: Trigger player attack animation**

At line 940, just before the `fireRobotAttackEffect` call (line 941-944), add:

```js
        // Trigger attack animation on the player's robot
        if (attackerSlotIdx >= 0) {
          triggerAnimation('player', attackerSlotIdx, 'attack');
        }
```

**Step 3: Trigger enemy hit animation after player attack lands**

At line 944, just after `await fireRobotAttackEffect(...)`, add:

```js
          // Trigger hit animation on the enemy
          const enemyIdx = result.enemies.findIndex(e => e.id === atk.targetId);
          if (enemyIdx >= 0) {
            triggerAnimation('enemy', result.enemies.length > 1 ? enemyIdx : 0, 'hit');
          }
```

**Step 4: Trigger enemy attack animation and player hit**

Find the enemy attack section (around line 987-999, the `result.enemyAttacks` loop). The enemy attack handler fires `enemyRobotAttackEffect()` from a specific enemy to a player robot. Add trigger calls.

Before the `enemyRobotAttackEffect` call, add:

```js
          // Trigger attack animation on the attacking enemy
          const attackerEnemyIdx = result.enemies.findIndex(e => e.id === atk.attackerId);
          if (attackerEnemyIdx >= 0) {
            triggerAnimation('enemy', result.enemies.length > 1 ? attackerEnemyIdx : 0, 'attack');
          }
```

After the enemy attack effect resolves, add:

```js
          // Trigger hit animation on the targeted player robot
          const targetSlotIdx = (result.robotParty?.active || []).findIndex(r => r && r.id === atk.targetId);
          if (targetSlotIdx >= 0) {
            triggerAnimation('player', targetSlotIdx, 'hit');
          }
```

**Step 5: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

**Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wire combat animation triggers for attack and hit"
```

---

## Task 9: Visual verification with placeholder sprites

Start the game, enter combat with starter robots, and verify animations work using Playwright MCP screenshots at each checkpoint.

**Step 1: Start the dev server**

```bash
pkill -f "node server.js" 2>/dev/null
npm start &
sleep 3
curl -s http://localhost:3000 | head -5  # Verify server is running
```

**Step 2: Open game in browser and navigate to combat**

Use Playwright MCP to:
1. Navigate to `http://localhost:3000`
2. Log in (or create account)
3. Start a new run — the 3 starters (fire-common, water-common, wood-common) should be the default team
4. Enter an encounter room to start combat

**Step 3: Verify player slot animations**

Take a `browser_snapshot` of the combat screen. Check:
- The 3 player robot slots at the bottom should show animated sprites (brightness pulsing)
- The enemy display should show animated sprite if it's a starter robot
- No console errors related to sprite loading

Take a `browser_take_screenshot` for visual verification of sizing and positioning.

**Step 4: Verify attack/hit animation triggers**

Play through a combat turn:
1. Swipe a vocab card to trigger player attack
2. Watch for attack animation on player slot + hit animation on enemy
3. Watch for enemy attack animation + hit animation on player slot
4. Screenshot after each to verify visual state

**Step 5: Verify cleanup**

After combat ends (victory or defeat), verify:
- No orphaned animated sprite divs left in DOM
- `browser_snapshot` shows clean post-combat state

**Step 6: Stop dev server**

```bash
pkill -f "node server.js"
```

---

## Task 10: Run E2E tests

Verify the animation changes don't break existing game functionality.

**Step 1: Run the full E2E test suite**

```bash
./scripts/e2e-test.sh
```

**Step 2: Evaluate results**

- 66/66 = ideal
- 60+/66 = acceptable (known flakiness)
- <60/66 = broken, investigate and fix

If any tests fail due to the animation changes (e.g., selector changes in scene.js or robot-row.js), fix them before proceeding.

**Step 3: Final commit**

If all tests pass:

```bash
git add -A
git commit -m "test: verify animated sprites don't break E2E tests"
```

---

## Expansion Path (after starters are verified)

Once the 3 starter bots look good in-game with real Wan 2.2 sprites:

1. **Generate next batch** — pick 5 robots (e.g., all uncommons), generate Wan 2.2 videos, extract frames, create sprite sheets
2. **Add to manifest** — add entries to `manifest.json` for each new robot
3. **Place files** — put `{idle,attack,hit}.webp` in `public/assets/sprites/robots/{robotId}/`
4. **Verify one-by-one** — use Playwright MCP to view each new robot in combat, screenshot, assess quality
5. **Repeat** — continue in batches of ~5 until all 25 are done

**Wan 2.2 generation script** — adapt `scripts/generate_robots.py` for Wan 2.2 Image-to-Video:
- Input: existing static sprite as identity reference + text prompt per state
- Output: 30-81 frame video per state
- Post-process: extract best N frames with ffmpeg, assemble horizontal strip with Pillow

**Frame extraction template** (write when ready for real sprites):

```python
# 1. Extract frames: ffmpeg -i clip.mp4 -vf "fps=24" frames/%04d.png
# 2. Select best N frames (manual or automated quality scoring)
# 3. Assemble horizontal strip:
#    strip = Image.new('RGBA', (N * 192, 192))
#    for i, path in enumerate(selected_frames):
#        frame = Image.open(path).resize((192, 192))
#        strip.paste(frame, (i * 192, 0))
#    strip.save('idle.webp', 'WEBP', quality=90)
```

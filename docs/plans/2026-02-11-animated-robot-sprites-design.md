# Animated Robot Sprites Design

## Goal

Replace static robot combat sprites with HD animated sprite sheets. Each of the 25 robots gets unique animations for idle, attack, and hit states. The result should look like a premium gacha game with animated chibi combat units.

## Art Direction

- **Combat sprites**: HD chibi animation generated via Wan 2.2, unique per robot
- **Portraits**: Existing SDXL static sprites, used in collection screens and UI cards
- **Frame size**: 192x192 pixels per frame (crisp on mobile retina)
- **Format**: WebP sprite sheets (horizontal frame strips)

## Animation States (MVP)

| State | Frames | Duration | Loop | Trigger |
|-------|--------|----------|------|---------|
| Idle | 6-8 | ~1000ms | Yes | Default standing state |
| Attack | 8-10 | ~600ms | No | Player selects Attack |
| Hit | 4-6 | ~300ms | No | Robot receives damage |

Each robot's animations reflect its element and personality. A fire robot's idle has flickering flames; its attack shoots a fireball. A water robot ripples at rest and blasts a jet when attacking.

## Generation Pipeline

### Prerequisites

- ComfyUI instance with Wan 2.2 model (5B for 8GB VRAM, 14B for higher quality)
- Existing static robot sprites as identity references
- ffmpeg and Pillow for post-processing

### Step 1: Generate video clips

For each robot, run 3 Wan 2.2 Image-to-Video generations in ComfyUI:

- **Input**: Static robot sprite (identity reference) + text prompt describing the motion
- **Output**: Short video clip (16-30 frames)

Example prompts for `fire-rare`:
- Idle: *"chibi fire robot standing, subtle flickering flames, gentle breathing motion, idle animation loop"*
- Attack: *"chibi fire robot lunging forward shooting a fireball, attack animation"*
- Hit: *"chibi fire robot flinching backward from impact, hit reaction"*

75 total generations (25 robots x 3 states). At ~30-60 seconds each on the 14B model, the full batch takes 1-2 hours.

### Step 2: Extract and curate frames

A Python script handles post-processing:

1. Extract frames from each video clip with ffmpeg
2. Select the best N frames (manual curation for quality)
3. Arrange frames into a horizontal strip
4. Export as WebP sprite sheet

### Step 3: Produce seamless idle loops

For idle animations, use the [Wan 2.2 looping animation workflow](https://www.nextdiffusion.ai/tutorials/wan-2-2-looping-animations-in-comfyui) to ensure the last frame connects smoothly back to the first.

## Asset Structure

```
public/assets/sprites/robots/{robotId}/
  idle.webp           # 8-frame horizontal strip (1536x192)
  attack.webp         # 10-frame horizontal strip (1920x192)
  hit.webp            # 6-frame horizontal strip (1152x192)

data/robots-manifest.json   # Frame counts and timing for all robots
```

### Manifest format

```json
{
  "fire-rare": {
    "frameSize": 192,
    "animations": {
      "idle":   { "frames": 8,  "duration": 1000, "loop": true },
      "attack": { "frames": 10, "duration": 600,  "loop": false },
      "hit":    { "frames": 6,  "duration": 300,  "loop": false }
    }
  }
}
```

## Frontend Rendering

### CSS

```css
.robot-sprite {
  width: 192px;
  height: 192px;
  background-repeat: no-repeat;
  background-size: auto 100%;
}

@keyframes spriteAnim {
  from { background-position: 0 0; }
  to { background-position: -100% 0; }
}
```

### RobotAnimator class

A lightweight JS class (~30 lines) manages sprite state:

```js
class RobotAnimator {
  constructor(container, robotId, manifest) {
    this.el = document.createElement('div');
    this.el.className = 'robot-sprite';
    this.manifest = manifest;
    this.robotId = robotId;
    this.state = null;
    container.appendChild(this.el);

    this.el.addEventListener('animationend', () => {
      if (this.state !== 'idle') this.play('idle');
    });
  }

  play(state) {
    const anim = this.manifest.animations[state];
    this.state = state;
    this.el.style.backgroundImage =
      `url(/assets/sprites/robots/${this.robotId}/${state}.webp)`;
    this.el.style.animation = 'none';
    requestAnimationFrame(() => {
      this.el.style.animation =
        `spriteAnim ${anim.duration}ms steps(${anim.frames}) ${anim.loop ? 'infinite' : 'forwards'}`;
    });
  }
}
```

### Combat integration

```js
// Player attacks enemy
playerAnimator.play('attack');
setTimeout(() => enemyAnimator.play('hit'), 300);
// Both auto-return to idle via animationend listener
```

### Preloading

When a combat encounter starts, preload sprite sheets for all robots in the fight (player active + 1-3 enemies). At ~50-150KB per sheet, a typical encounter loads 600KB-1.8MB during the intro screen.

## Future Extensions

These are out of scope for MVP but designed to slot in easily:

- **More animation states**: Defend, faint, befriend, victory pose — add sheets and manifest entries
- **Special attack effects**: Overlay particle sprites (element-colored) on top of the attack animation
- **Party preloading**: Preload all 6 party robots on room entry for instant swap animations
- **Scaling**: CSS `transform: scale()` on `.robot-sprite` for different screen sizes or multi-enemy layout

## Summary

| Aspect | Decision |
|--------|----------|
| Generation model | Wan 2.2 (Image-to-Video, text-prompted) |
| Art style | HD chibi, unique per robot |
| Frame size | 192x192 |
| Format | WebP horizontal sprite sheets |
| MVP states | Idle (loop), Attack (one-shot), Hit (one-shot) |
| Rendering | CSS `steps()` animation + thin JS controller |
| Total assets | 75 sprite sheets (25 robots x 3 states) |
| Est. total size | ~2-4MB for all robots |

# Audio System Design: BGM & Sound Effects

## Overview

Add background music and sound effects to NEO TOKYO: System Liberation. Start with a single BGM track (user-provided) and 13 open-source SFX files. The system supports future multi-track BGM expansion.

## Architecture

### New Module: `public/js/audio.js`

Single audio manager handling BGM and SFX:

```
initAudio()          → preload all SFX, set up Web Audio context + BGM element
playBGM(track?)      → start/resume background music (looped)
stopBGM()            → fade out and stop
playSFX(name)        → fire-and-forget sound effect
setVolume(type, val) → set BGM or SFX volume (0-1)
mute() / unmute()    → master mute toggle
```

- **SFX**: Web Audio API (low latency, overlap support)
- **BGM**: HTMLAudioElement (simple streaming/looping, crossfade-ready for future multi-track)

### File Structure

```
public/assets/audio/
  bgm/
    main.mp3              ← user-provided track
  sfx/
    attack.mp3            ← player deals damage
    player-hit.mp3        ← player takes damage
    enemy-defeat.mp3      ← enemy HP reaches 0
    heal.mp3              ← healing effect
    swipe-right.mp3       ← correct flash card answer
    swipe-left.mp3        ← wrong flash card answer
    chip-equip.mp3        ← equipping a chip
    chip-skill.mp3        ← activating chip skill
    button-tap.mp3        ← general UI interaction
    takeover-open.mp3     ← fullscreen view slides in
    takeover-close.mp3    ← fullscreen view slides out
    victory.mp3           ← combat won
    defeat.mp3            ← game over
```

### Loading Strategy

Eager load all on game init. Total budget ~1.5MB (SFX each <100KB).

## Settings UI

Separate "Audio" section in the settings takeover (below existing TTS controls):

```
── Audio ──────────────────
  BGM Volume    [━━━━━━━○━━] 70%
  SFX Volume    [━━━━━━━━○━] 80%
  [Mute All]
```

Volumes persist to localStorage via `store.js`.

## SFX Integration Points

| Sound | Trigger | Module |
|-------|---------|--------|
| `attack` | Correct answer resolves damage | `combat-loop.js` |
| `player-hit` | Enemy turn deals damage | `combat-loop.js` |
| `enemy-defeat` | Enemy HP hits 0 | `combat-loop.js` |
| `heal` | Healing effect applied | `combat-loop.js` |
| `swipe-right` | Flash card swiped right | `actions.js` |
| `swipe-left` | Flash card swiped left | `actions.js` |
| `chip-equip` | Chip equipped in loadout | `economy.js` |
| `chip-skill` | "Use Skill" button pressed | `chip-row.js` |
| `button-tap` | Action area button pressed | `actions.js` |
| `takeover-open` | Takeover view activated | `takeover.js` |
| `takeover-close` | Takeover view closed | `takeover.js` |
| `victory` | Combat won phase entered | `combat-loop.js` |
| `defeat` | Game over phase entered | `game.js` |

## BGM Behavior

- Starts on first user interaction (browser autoplay policy)
- Loops indefinitely
- Pauses on tab hidden / mute
- Future: different tracks per game phase (hub, combat, etc.)

## SFX Sourcing

**Style**: Polished JRPG (Xenoblade/Pokemon-like). Bright, clean, satisfying. Not retro, not dark.

**Sources** (all CC0 or CC-BY):
- Kenney.nl: UI sounds, impacts (UI Audio pack, Impact Sounds pack)
- Freesound.org: Heals, chip effects, ambient
- OpenGameArt.org: Victory fanfare, RPG-themed effects

**Format**: MP3, mono, 44.1kHz, normalized volume.

**Licensing**: Attribution tracked in `public/assets/audio/LICENSES.md`.

## Target Worktree

Implementation targets the `feature/mobile-first-ui` branch in `/Users/michia/Documents/jrpg-wt-mobile-ui`.

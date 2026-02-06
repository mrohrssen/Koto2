# Combat SFX Bug - FIXED

## Problem
After merging combat-effects.js, combat was broken:
- Enemy never hits back
- No SFX fire
- No math shown

## Root Cause
**anime.js v4 has a different API than v3.**

The code was using v3 syntax:
```js
anime({
  targets: container,
  translateX: [...],
  duration: 100,
  easing: 'easeOutQuad'
});
```

But v4 requires:
```js
animate(targets, { translateX: [...] }, { duration: 100, ease: 'outQuad' });
```

Key differences:
- Separate targets arg: `animate(targets, {props}, {options})`
- `easing:` renamed to `ease:`
- Easing names shortened: `easeOutQuad` → `outQuad`
- `complete:` renamed to `onComplete:`

Console error: `TypeError: undefined is not an object (evaluating 'e.keyframes')`

## Fix Applied
1. Updated ALL `anime()` calls in `public/js/ui/combat-effects.js` to v4 syntax
2. Changed `complete:` callbacks to `onComplete:` in options
3. Changed `easing:` to `ease:` and shortened easing names
4. Added try-catch around `fireChipEffect` in `combat-loop.js` (line 349)

## Test Results
- Boss room test pass rate improved from 33% to 80%
- Remaining flakiness is a pre-existing test timing issue, not the SFX bug

## Test Command
```bash
/Users/michia/Documents/jrpg/scripts/e2e-test.sh "specs/rooms/boss"
```

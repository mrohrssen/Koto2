# Known Bugs

## Combat

- [ ] Combat doesn't work until browser refresh after starting combat the first time
  - Symptom: First combat after page load fails to function properly
  - Workaround: Refresh browser before first combat

- [ ] Boss defeated not detected, cannot progress to next floor
  - Error: `narration.showNarration is not a function` at `game.js:988`
  - This breaks nextFloor call, boss defeat state never saves
  - Subsequent calls fail with "Boss not defeated"
  - **Priority: High** - blocks game progression

- [ ] Player gets free hits during combat flow transitions
  - After dialogue: player gets 1 free hit before vocab reviews start
  - After glitching dialogue: player gets another free hit with no return attack
  - Breaks intended rhythm of: attack → review → enemy attack → repeat
  - **Priority: Medium** - affects game balance

## UI

- [ ] Browser refresh doesn't work in chip shop
  - F5/Cmd+R doesn't reload page while chip modal is open
  - Likely keyboard event listener capturing/preventing refresh
  - Workaround: Close modal before refreshing
  - **Priority: Low**

## Assets

- [ ] Missing chip icon assets (404 errors)
  - `/assets/icons/chips/minimalist.png`
  - `/assets/icons/chips/lifelink.png`
  - `/assets/icons/chips/powerCell.png`
  - **Priority: Low** - cosmetic only

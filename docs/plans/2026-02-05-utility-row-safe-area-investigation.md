# Utility Row Safe Area Investigation

**Date:** 2026-02-05
**Branch:** `fix/utility-row-safe-area`
**Status:** In Progress

## Problem

The utility row (bottom navigation bar) appears at different positions on different iOS devices running identical code as PWA:

- **iPhone 14 Pro**: Utility row flush with screen bottom ✓
- **iPhone 15 Pro**: Utility row has a gap below it, appears higher than expected ✗

Both devices:
- Running iOS 18.7
- Same PWA setup (added to home screen, standalone mode)
- Same codebase deployed

## Current CSS

```css
.utility-row {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 8px 24px 12px;
  background: rgba(255,255,255,0.95);
  z-index: 150;
}
```

Related meta tag in `game.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

## Investigation Steps

### 1. Initial Screenshots (from production)
Pulled bug reports from prod server showing the difference:
- iPhone 14 Pro: 393x793 viewport, bar at bottom
- iPhone 15 Pro: 402x812 viewport, bar floating with gap below

### 2. Debug Border Test
Added `border: 2px solid red` to `.utility-row` to visualize element boundaries.

**Result:**
- iPhone 14 Pro: Red border flush with screen edge
- iPhone 15 Pro: Red border has visible gap below it

**Conclusion:** The issue is NOT internal padding - the element itself is positioned higher on iPhone 15 Pro.

### 3. Pseudo-element Extension Test
Added `::after` pseudo-element to extend background into safe area:

```css
.utility-row::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: env(safe-area-inset-bottom, 0px);
  background: inherit;
  border: 2px solid blue;
}
```

**Result:** Blue border appeared as just a thin line (no height), meaning `env(safe-area-inset-bottom)` returns 0 or near-0.

**Conclusion:** iOS is not reporting a safe area inset even though there's clearly a visual gap. This suggests `viewport-fit=cover` isn't working as expected on iPhone 15 Pro PWA, or the webview isn't extending into the safe area.

## Attempts That Failed

### Attempt 1: Adding safe-area padding (reverted)
```css
padding: 8px 24px calc(12px + env(safe-area-inset-bottom));
```
**Result:** Made iPhone 14 Pro worse (bar went higher). Reverted in commit `d348646`.

### Attempt 2: Pseudo-element with env() height
```css
height: env(safe-area-inset-bottom, 0px);
```
**Result:** Height was 0, didn't fill the gap.

## Next Steps to Try

1. **Fixed height extension** - Use `height: 34px` (typical home indicator height) to test if the pseudo-element can fill the gap at all

2. **JavaScript detection** - Add JS to log actual safe area values and element positions:
   ```js
   const row = document.querySelector('.utility-row');
   const rect = row.getBoundingClientRect();
   console.log('Bottom position:', rect.bottom);
   console.log('Window height:', window.innerHeight);
   console.log('Gap:', window.innerHeight - rect.bottom);
   ```

3. **Alternative positioning** - Try `bottom: -34px` with extra padding to push element below viewport

4. **Check PWA display mode** - Verify if `display: standalone` in manifest affects safe area behavior differently than browser mode

## Bug Report Commands

```bash
# List recent bug reports (dev server)
curl -s "https://jrpg-dev.up.railway.app/api/bug-reports" | jq '.reports[:5]'

# Download screenshot
curl -L "https://jrpg-dev.up.railway.app/api/bug-reports/<report-id>/screenshot" -o screenshot.png
```

## Key Observations

1. `position: fixed; bottom: 0` behaves differently between iPhone 14 Pro and iPhone 15 Pro
2. `env(safe-area-inset-bottom)` returns 0 despite visible gap on iPhone 15 Pro
3. `viewport-fit=cover` may not be working as expected in PWA standalone mode on iPhone 15 Pro
4. The gap appears to be the utility row's white background extending down, not empty space

## Files Modified

- `public/game.css` - utility row styles
- `CLAUDE.md` - added bug report fetching instructions

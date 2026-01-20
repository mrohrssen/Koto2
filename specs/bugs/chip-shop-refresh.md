# Bug: Browser Refresh Doesn't Work in Chip Shop

## Summary
When the chip shop/modal is open, browser refresh (F5 / Cmd+R) doesn't reload the page properly.

## Steps to Reproduce
1. Open the chip shop/chip modal
2. Press F5 or Cmd+R to refresh the browser
3. Page doesn't refresh as expected

## Expected Behavior
Browser should refresh the page normally.

## Actual Behavior
Refresh doesn't work while chip modal is open.

## Possible Cause
- Event listener on the modal may be capturing/preventing keyboard events
- `e.preventDefault()` on keydown events may be too broad

## Files to Investigate
- `public/js/ui/character.js` - chip modal handling
- `public/game.js` - keyboard event listeners

## Priority
Low - workaround is to close the modal before refreshing

## Status
Open

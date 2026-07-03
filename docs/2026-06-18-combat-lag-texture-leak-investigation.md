# Combat Lag Investigation — PIXI Text Texture Leak

**Date:** 2026-06-18
**Reported as:** "As I play more the game gets laggier and lagggier… Frames dropped" (production bug report, iPhone / iOS 18.7 Capacitor app). Long-standing across builds; occurs in **both Kanji Kombat and explore combat**.

## TL;DR

Every floating-text VFX is a `new Text(...)` that gets torn down with `text.destroy()` **without** `{ texture: true }`. In PIXI v8 that leaves each text's auto-generated GPU texture allocated forever. They accumulate in **GPU/native memory** (not JS heap) for the whole session, are never reclaimed (not by `destroy()`, not by PIXI's idle `textureGC`), and progressively pressure iOS WebKit's compositor → frame drops that worsen the longer you play.

A runtime A/B test confirms the fix: destroying the text **with** `{ texture: true, textureSource: true }` eliminates the growth entirely (+0 textures vs. monotonic growth unpatched).

## Why it stayed invisible

- It's **GPU/native memory, not JS heap**. WebKit/iOS doesn't expose `performance.memory`, so every bug report shows `memoryUsage: null`. The leak never appeared in telemetry.
- DOM node count, PIXI display-object counts, ticker counts, and event listeners all stay **flat** — so it looks "clean" by every JS-visible metric. Only `app.renderer.texture.managedTextures` reveals it.

## Why both KK and explore

The common thread is floating text:
- **Kanji Kombat:** a banner on every answer (`showKanjiKombatAnswerBanner` → `showBanner`): "Correct!" / "Wrong!" / "Super Effective!" / streak banners.
- **Explore combat:** damage numbers + buff/debuff/skill-proc popups on every hit.

Both route through the leaking `Text.destroy()` paths, so both degrade over a long session.

## Evidence chain

1. **Telemetry.** `performance` block across reports shows state-dependent sustained jank: a 17.6-min Kanji Kombat session = **12,676 / 29,467 slow frames (43%)**, vs a 29.8-min session at 0.4%. `memoryUsage: null` on all (iOS WebKit blind spot).
2. **Static audit.** Every VFX primitive is properly bounded/self-cleaning (self-terminating tweens, fixed 200-particle pool, scene-registry-tracked status updaters, single glow filter cleared on `beforeExit`, thorough scene teardown). Disconfirms the "animations not cleared" theory at the JS level.
3. **Live WebKit instrumentation** (Playwright, `window.__pixiApp()`): DOM/display-objects/tickers/listeners all **plateau**. But `managedTextures` climbs monotonically with text VFX (9 → 28 → 38 → 61 …) and **never drops** — pinned through 70s idle and a forced `textureGC.run()` (`maxIdle` = 3600 frames).
4. **A/B confirmation.** Monkeypatching `Text.destroy` to pass `{ texture: true, textureSource: true }` → **+0** texture growth over a 30-text burst; unpatched grows and is never reclaimed.

## Fix (scoped, surgical)

Pass `{ texture: true, textureSource: true }` when destroying **uniquely-generated Text** objects. Cleanest form: a shared `destroyText(t)` helper so the convention is centralized.

| File | Line(s) | What |
|------|---------|------|
| `public/js/pixi/text.js` | 66, 103 | `showDamageNumber`, `showEventPopup` |
| `public/js/pixi/banners.js` | 75 | KK / combat banners |
| `public/js/pixi/status-vfx.js` | 209 (Z), 63 / 427 (container w/ star Text children) | sleep "Z" particles, stun stars |
| `public/js/pixi/formation.js` | 272, 669, 866 | status pills — currently `{ children: true }`, add `texture: true` |

### ⚠ Critical scope caution

Do **not** apply `texture: true` to:
- `formation.js:995` `sprite.destroy({ children: true })` — creature sprites share **cached** textures loaded from assets; freeing those breaks other creatures and future spawns.
- `formation.js:166` shadow destroy — verify it isn't a shared shadow texture before touching.

The fix is **only** for generated-Text teardown, never for shared/cached-texture sprites.

`chest-animation.js` Text is lower priority — that chest uses its own short-lived `Application` destroyed via `app.destroy(true)`, which reclaims its textures.

## Verification method

Re-run the WebKit measurement after the change:
```js
// in the dev browser console / Playwright
const app = window.__pixiApp().app;
const n = () => app.renderer.texture.managedTextures.length;
// fire many banners/damage numbers, wait for destroy, then check n() — should not grow
```
Expect `managedTextures` to stay flat across a long Kanji Kombat run instead of climbing monotonically.

## Notes / open questions

- Magnitude per text is modest (PIXI batches text into shared atlas pages, so it's atlas-page growth, not 1 texture/string), but it is **unbounded over a session** and never reclaimed — enough to matter on a memory-constrained iPhone.
- iOS **thermal throttling** may compound the worst sessions (e.g., the 43% one); the texture leak is the concrete, fixable contributor that matches the full profile.
- The KK speed-review onboarding path renders enemies as DOM (no PIXI sprites / element blasts), but **does** fire banners — so it leaks via the banner path too.

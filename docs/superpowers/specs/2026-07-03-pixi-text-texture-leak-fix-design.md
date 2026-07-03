# PIXI Text Texture Leak Fix + On-Device Proof — Design

**Date:** 2026-07-03
**Status:** Approved (brainstorm 2026-07-03)
**Prior art:** [docs/2026-06-18-combat-lag-texture-leak-investigation.md](../../2026-06-18-combat-lag-texture-leak-investigation.md) — root-cause investigation this design ships.

## Problem

The game gets progressively laggier over a play session: frames drop, clicks respond slowly, animations stutter. It worsens the longer you play, on both Kanji Kombat and explore combat, on iOS (Capacitor). Multiple past fixes (glow-ticker cleanup, idempotent kanji answers, battleground freeze) didn't resolve it.

The 2026-06-18 investigation found the cause and confirmed it with a runtime A/B test — **but the fix never shipped**. The investigation doc was never committed, no flagged file was touched since, and prod still has every leaking call.

**Root cause:** every floating-text VFX (`new Text(...)`) is torn down with `text.destroy()` *without* `{ texture: true }`. In PIXI v8 this leaves the text's auto-generated GPU texture allocated forever. Growth is in GPU/native memory — invisible to JS-heap metrics (`memoryUsage: null` on iOS WebKit), never reclaimed by PIXI's idle `textureGC`, and it progressively pressures the iOS compositor.

**Evidence:**
- Live instrumentation (2026-06-18): `managedTextures` climbs monotonically with text VFX (9 → 28 → 38 → 61 …), never drops; DOM nodes, display objects, tickers, listeners all stay flat. Patching `Text.destroy` to pass `{ texture: true, textureSource: true }` → +0 growth.
- Telemetry: a 17.6-min KK session showed 43% slow frames; the 2026-07-03 prod ticket ("Starting to be super laggy and glitchy") shows a 14-min session averaging ~48fps.
- Caveat: the A/B proof was desktop WebKit. The leak and its fix are confirmed; full elimination of the *felt* lag on iPhone is the open question this design's verification gate answers.

## Design

### 1. Fix — shared `destroyText` helper

Add to `public/js/pixi/text.js`:

```js
export function destroyText(t) {
  t.destroy({ texture: true, textureSource: true });
}
```

Apply at the flagged generated-Text teardown sites (line numbers as of dev @ 2026-07-03, re-verified today):

| File | Site | Change |
|------|------|--------|
| `public/js/pixi/text.js` :66, :103 | damage numbers, event popups | `text.destroy()` → `destroyText(text)` |
| `public/js/pixi/banners.js` :75 | KK/combat banners | `text.destroy()` → `destroyText(text)` |
| `public/js/pixi/status-vfx.js` :209 | sleep "Z" Text particles | `z.destroy()` → `destroyText(z)` |
| `public/js/pixi/status-vfx.js` :63, :427 | stun-star containers with Text children | `container.destroy({ children: true })` → add `texture: true, textureSource: true` |
| `public/js/pixi/formation.js` :272, :669, :866 | status pills | `pill.destroy({ children: true })` → add `texture: true, textureSource: true` |

Container sites get the texture options only after verifying at implementation time that their children are Text/Graphics only (no Sprites with shared cached textures).

**Explicitly untouched:**
- `formation.js:995` creature sprite destroy and `formation.js:166` shadow destroy — sprites share cached asset textures; freeing them breaks other creatures and future spawns.
- `chest-animation.js` — uses its own short-lived `Application` destroyed via `app.destroy(true)`, which already reclaims its textures.

No global `Text.prototype.destroy` patch (upgrade hazard, invisible magic). The helper is the convention; this spec is the record.

### 2. Telemetry — on-device proof in every bug report

All three ride inside the existing diagnostics `snapshot()` (`public/js/diagnostics.js`), so every bug report carries them automatically. Existing `slowFrames`/`totalFrames` fields are kept for continuity with old reports.

**(a) Windowed frame stats.** The existing rAF tick gains per-minute frame-time buckets: `≤17ms / 17–25 / 25–33 / 33–50 / >50ms`, stored in a ring buffer of the last ~45 minutes. Frame gaps > 2000ms are discarded as app-suspend artifacts (rAF pauses in background), not counted as slow frames. Shape:

```js
frameBuckets: [{ m: 12, f: 3421, b17: 3200, b25: 180, b33: 30, b50: 8, over: 3 }, …]
```

This turns a single end-of-session report into a degradation curve: first-5-min vs last-5-min comparison.

**(b) GPU texture timeline.** Every 30s, sample `window.__pixiApp?.()?.app?.renderer?.texture?.managedTextures?.length` (optional-chained; skip sample if PIXI isn't booted) into a ring buffer (~90 samples ≈ 45 min). Shape:

```js
textureTimeline: [{ t: 30, n: 42 }, { t: 60, n: 43 }, …]  // t = seconds since load
```

Flat curve = leak fixed. Climbing curve = a missed site, pinpointed without a new investigation.

**(c) Analytics warn-once.** Firebase Analytics/Crashlytics plugins are unimplemented on iOS; `runSafely` (`public/js/analytics.js:79`) currently `console.warn`s every failure — the 2026-07-03 ticket shows all 50 console-buffer slots filled by this spam within 3.4s, blinding reports to real errors. Gate: warn once per `label`, silently swallow repeats. (The first warning still documents the broken plugin on every report.)

### 3. Tests (Tier 1)

- `destroyText` passes `{ texture: true, textureSource: true }` (mock Text).
- Frame-bucket windowing: bucket boundaries, minute rollover, ring eviction, >2s suspend-gap discard.
- Texture sampler: samples when `__pixiApp` present, skips cleanly when absent, ring eviction.
- Warn-once gate: first failure warns, repeat failures don't, distinct labels warn independently.

A static grep-guard test against future bare `Text.destroy()` calls was considered and dropped as fragile; the helper convention plus this spec are the guard.

### 4. Rollout & verification gate

1. Worktree `fix/pixi-text-texture-leak` off `dev`; implement; `npm test`.
2. **Desktop WebKit proof (pre-merge):** Playwright long combat run on local dev — fire many banners/damage numbers (combat play plus a console burst harness as in the June A/B), assert `managedTextures` count returns to a flat baseline across bursts and frame buckets stay stable.
3. Merge to `dev`, push; `git push origin dev:master` (standard flow — note this also ships the areas 5–12 content currently on dev).
4. **On-device gate:** user plays a real 20–30 min iPhone session (prod app loads the web bundle live from jrpg-production, so no TestFlight step), submits an end-of-session bug report.
5. **Success criteria**, compared against the 2026-07-03 baseline ticket (~48fps avg at 14 min):
   - `textureTimeline` flat (plateaus; no monotonic growth),
   - last-5-min frame buckets ≈ first-5-min (no progressive degradation),
   - subjectively feels fixed.

### 5. Contingency

If the device session still degrades, the telemetry discriminates: textures climbing → a missed destroy site (fix directly); textures flat but frames degrading → a different accumulator (thermal, DOM, other GPU growth) → new brainstorm, now data-driven instead of blind.

## Out of scope

- Server round-trip click latency (TTS CPU saturation on Railway; tiered optimistic actions) — separate, already-designed track.
- Fixing/removing the Firebase iOS plugins themselves — only the warn spam is gated here.
- Any change to creature/shadow sprite destruction or shared texture caching.

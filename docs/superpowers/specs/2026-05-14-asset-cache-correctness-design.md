# Asset Cache Correctness Design

**Date:** 2026-05-14  
**Status:** Draft design, revised after audit  
**Scope:** Make image/audio asset loading use stable canonical URLs, share in-flight loads across UI surfaces, and prepare for safe background preloading on Capacitor iOS.

## Goal

Koto should not feel sluggish because the same logical art is requested repeatedly under different URL identities or because important assets are only discovered at the instant a screen needs them.

The first goal is cache correctness: one logical asset should resolve to one canonical URL, with one version token, one in-flight load, and one consistent cache story across Pixi and DOM UI. Once that foundation is in place, background preloading can warm the right assets without hiding duplicate-load bugs under more network traffic.

The production target for this design is the Capacitor iOS app. Swiping the app closed and reopening it restarts the JavaScript runtime, so all in-memory image/Pixi caches are lost. The app also skips service-worker registration in native mode, so the existing service-worker cache does not protect that path. The plan must therefore rely first on stable remote URLs, iOS WebView HTTP caching, shared app-level load identity during a session, and measurement of what the WebView actually reuses after restart.

## Non-Goals

- Do not aggressively preload the entire asset library in the first pass.
- Do not introduce a service-worker-only solution; service workers are currently skipped in Capacitor.
- Do not add a native persistent blob cache until measurements show iOS WebView HTTP caching is insufficient.
- Do not redesign the Pixi scene system or combat flow.
- Do not change creature art selection semantics beyond removing accidental duplicate requests.
- Do not change Japanese text, dictionary data, or gameplay mechanics.

## Current Findings

Server static asset headers already cache `.webp` and `.mp3` files for one year with `immutable`, while most other files are served no-cache. That is good for image/audio reuse, but it makes URL versioning the source of truth: any different query string becomes a different cache key, and any regenerated asset needs an explicit version bump.

The native entry path is different from web. `public/game.js` registers `public/sw.js` only when `!PLATFORM.isNative` and the host is not `localhost`/`127.0.0.1`. `PLATFORM.isNative` is true in Capacitor (it checks `window.Capacitor !== undefined`). The service worker does cache `.webp` and `.mp3`, but it is not active for the iOS app or for local dev. This design touches only the runtime-loader path; it does not change the service worker, which continues to handle web caching unmodified.

### Capacitor iOS Asset Origin

`capacitor.config.ts` sets `server.url = 'https://jrpg-production.up.railway.app'`. iOS WebView loads the document directly from that origin, so every `/assets/...` path resolves to a **same-origin** request from the WebView's point of view. Three consequences:

- Standard HTTP cache rules apply. The `Cache-Control: public, max-age=31536000, immutable` header on `.webp`/`.mp3` is the primary persistence mechanism on iOS.
- `Timing-Allow-Origin` is **not** required for `transferSize`/`encodedBodySize`/`decodedBodySize` to be populated, because Resource Timing exposes those fields freely for same-origin entries.
- The plausible iOS-specific failure mode is `NSURLCache` capacity or WebView cache eviction pressure removing immutable bytes between app launches, not cross-origin partitioning. Diagnostics should be designed to confirm or refute that hypothesis before assuming a durable native cache is needed.

Several asset URL sources exist today:

- `SPRITE_VERSION` in `public/js/ui/sprite-utils.js` drives many creature, NPC, and item image URLs.
- `BACKGROUND_VERSION` in `public/js/pixi/parallax.js` drives Pixi parallax backgrounds.
- `AUDIO_VERSION` in `public/js/audio.js` drives SFX and BGM. It is currently `'20260212'`, much older than the others — a sign that the manual bump rule is already failing for audio.
- `src/routes/game/run.js` has a separate server-side `SPRITE_VERSION` constant kept in sync with the client by hand. The same route returns fully-resolved sprite URLs for creatures, items, and actions in API responses (`run.js:660,674,697`).
- `public/js/ui/attack-card.js` (line 94) and `public/js/ui/move-select.js` (line 82) both hard-code action icon version `20260322`. Server-built action URLs from `run.js:697` use `SPRITE_VERSION` instead, so the same action icon file currently has two different cache keys depending on origin.
- Animated creature sheets carry versions in `public/assets/sprites/creatures-animated/manifest.json` (currently `20260512`).

Inline URL construction sites that need migration (non-exhaustive but representative):

- Creature static art: `formation.js`, plus references via `creatureSpriteHtml`/`creatureStaticPath`.
- Creature idle art: `formation.js:460`, `sprite-utils.js:118` (background URL), `probeIdleSprites`.
- Item sprites: `sprite-utils.js:108`, `campfire.js:81`.
- NPC sprites: at least 12 inline `${SPRITE_VERSION}` interpolations across `attack-card.js`, `room-transition.js` (×3), `exploration.js` (×4), `exploration-dom.js` (×2), `befriend.js` (×2). All target `/assets/sprites/npcs/${id}.webp`.
- Action icons: `attack-card.js:94`, `move-select.js:82`, plus the server-built version in `run.js:697`.
- DOM background: `combat-dom.js:setBackground()` appends `SPRITE_VERSION` to arbitrary background paths and caches by unversioned path in `_lastBgPath`.

Several duplicate or just-in-time patterns also exist:

- Creature selection, target select, item target picker, and attack cards use static creature art at `/assets/sprites/creatures/{id}.webp`.
- Formation rendering first tries `/assets/sprites/creatures/{id}-idle.webp`, falls back to static art, and then may load animated sheets from the manifest, replacing the texture in place.
- `probeIdleSprites()` creates separate `Image` probes for idle files to discover whether they exist. Its results populate sync `_hasIdle`/`_noIdle` sets that `creatureBgUrl()` reads.
- `loadImageTexture()` has a useful in-memory promise cache, but only Pixi callers use it directly.
- DOM `<img>` callers rely on the browser cache and do not share the same in-flight promise registry.
- DOM background fallback uses `SPRITE_VERSION`, while Pixi parallax uses `BACKGROUND_VERSION`.
- `loadImageTexture()` sets `img.crossOrigin = 'anonymous'` on every `Image()`. DOM `<img>` tags emitted by `creatureSpriteHtml`, `setBackground`, etc. have no `crossorigin` attribute. With Capacitor's same-origin model, this is unlikely to actually partition the cache, but the inconsistency should be made deliberate rather than accidental.

## Design Principles

### Canonical URL Identity

Every cacheable asset should have exactly one client-owned canonical URL function. Callers should not concatenate asset paths or version parameters inline.

Canonical URLs must include the complete versioned URL used as the browser/WebView cache key. If two screens intentionally use the same file, they must receive byte-for-byte identical URLs. The cache key includes more than the URL string in some browsers — request mode (CORS vs no-CORS) and credentials mode can also partition the cache. The asset layer must therefore make the request-mode choice once and apply it everywhere a given URL is used.

### Logical Asset References

Callers should ask for logical assets, not path strings. Examples:

- `creaturePortrait(creatureId)`
- `creatureBattleIdle(creatureId)`
- `creatureAnimationSheet(creatureId, 'idle')`
- `npcPortrait(npcId)`
- `itemSprite(itemId)`
- `actionIcon(moveNameEn)`
- `areaBackground(areaId, 'sky')`
- `bgmTrack(trackName)`

This keeps file layout, fallback choice, and versioning behind one boundary.

### Manifest Before Probe

The app should prefer manifest knowledge over speculative 404 probes. If an idle sprite or animation sheet exists, that should come from a manifest generated from the asset tree or maintained as part of the asset pipeline.

Probes can remain as a fallback during migration, but they should not be the main discovery mechanism for known first-party assets.

### One In-Flight Load Per URL

The asset layer should deduplicate active loads by canonical URL across Pixi and DOM use cases. If target select, attack card, and formation all need the same static file, the second and third consumers should attach to the existing promise rather than starting independent loads.

### Measure Before Native Persistence

After an iOS app restart, in-memory caches are expected to be gone. The key question is whether the WebView HTTP cache reuses immutable `.webp`/`.mp3` responses or performs network transfers again. Add diagnostics before building a heavier native persistence layer.

## Proposed Architecture

### 1. Shared Asset URL Module

Create a client module, for example `public/js/assets/asset-urls.js`, that owns all cacheable asset URL construction.

It should export version constants and URL helpers for creatures, NPCs, items, action icons, backgrounds, and audio. Existing constants can move into this module and be re-exported temporarily from old modules if needed to keep the migration small.

Initial helpers:

- `spriteUrl(pathParts)`
- `creatureStaticUrl(id)`
- `creatureIdleUrl(id)`
- `npcSpriteUrl(id)`
- `itemSpriteUrl(id)`
- `actionIconUrl(nameEn)`
- `backgroundLayerUrl(areaId, layerName)`
- `sfxUrl(name)`
- `bgmUrl(track)`

Version ownership:

- Creature/NPC/item/action sprites use `SPRITE_VERSION` unless the asset pipeline needs finer-grained versions later.
- Backgrounds use `BACKGROUND_VERSION`.
- Audio uses `AUDIO_VERSION`.
- Animated sheet URLs continue to honor the generated manifest versions, but access should go through the same asset registry.

Server-generated sprite URLs should be removed where practical. API responses should return logical IDs, and the client should resolve URLs. This is an API contract change, not a pure refactor — `src/routes/game/run.js:660,674,697` currently returns `sprite: '/assets/sprites/.../...webp?v=...'` strings that flow into `creature.spriteImg`, item shop offers, and skill-master action displays. Migration plan:

1. The route adds new logical fields (`creatureId`, `itemId`, `actionSlug`) alongside the existing `sprite` URL field for one release.
2. The client switches to using the logical fields and resolving URLs through the canonical helpers.
3. The `sprite` URL field is removed from the response in a later release once the older client builds are off the field.

If a route must keep returning a sprite URL for compatibility during the migration window, it should import the version constant from a runtime-neutral shared source rather than defining its own. Do not make server code import a browser-oriented module under `public/js/`.

### 2. Asset Manifest

Add a lightweight generated manifest for first-party assets, for example `public/assets/asset-manifest.json`.

The manifest should describe existence and canonical variants, not preload everything by default:

```json
{
  "version": "20260514",
  "creatures": {
    "inu": {
      "static": true,
      "idle": true,
      "animated": {
        "idle": "/assets/sprites/creatures-animated/inu-idle-sheet.webp?v=20260512",
        "walk": "/assets/sprites/creatures-animated/inu-walk-sheet.webp?v=20260512"
      }
    }
  },
  "backgrounds": {
    "starter_meadow": ["sky", "battleground"]
  },
  "actions": ["slash", "heal"]
}
```

The exact shape can be tuned during implementation, but it must answer:

- Does a creature have static art?
- Does a creature have idle art?
- Does a creature have animated sheet art?
- Which action icons exist?
- Which background layers exist?

Manifest fetch policy should be explicit. Because JSON is served no-cache today, fetching it once per app runtime is acceptable. The manifest itself can include the version tokens for immutable assets.

### 3. Shared Asset Loader

Add an asset loader module, for example `public/js/assets/asset-loader.js`, that owns in-flight and completed load promises by canonical URL.

Core API:

- `preloadImage(url, options) -> Promise<HTMLImageElement>` — primes the WebView/browser HTTP cache and decodes once. Stores the resolved image promise by canonical URL for runtime reuse, but does not create or retain a Pixi texture. For DOM warmup.
- `preloadAsset(assetRef, options)` — resolves an asset ref to a URL via the URL helpers and calls `preloadImage`.
- `loadTexture(url) -> Promise<Texture>` — Pixi callers; `loadImageTexture()` is updated to delegate here so the in-flight cache is shared with `preloadImage`.
- `warmAssets(assetRefs, options)` — convenience for batches.
- `getAssetLoadStats()` for diagnostics.

`loadImageTexture()` should continue using `HTMLImageElement.decode()` because the existing comment in `image-loader.js` documents iOS/WKWebView issues with Pixi's default WebP loading path. The new loader should preserve that path and wrap it, not replace it with Pixi `Assets.load()`.

**Cache-key consistency.** Pick one request mode and apply it everywhere a given URL is used. Because `capacitor.config.ts` puts the iOS WebView at the same origin as the asset host, CORS is not actually required for these requests. The simplest correct policy is:

- Drop `img.crossOrigin = 'anonymous'` from the loader unless a specific use case (e.g. canvas readback) requires CORS.
- Do not add a `crossorigin` attribute to DOM `<img>` tags emitted by helpers.
- If any future caller does need CORS-tainted image data, add a separate `loadCorsImage()` helper rather than flipping the default and silently changing every URL's cache key.

Document this decision in the loader and add a unit test that asserts `crossOrigin` stays unset on the loader's `Image()` instances.

**DOM and Pixi sharing the same in-flight promise.** DOM callers cannot directly reuse a Pixi texture, but they can reuse the URL's in-flight `Image().decode()` promise. If a DOM `<img>` is inserted after `preloadImage(url)` resolves, the browser/WebView should have the bytes available. The image registry stores one promise per canonical URL; both the Pixi `loadTexture` path and the DOM `preloadImage` path attach to it. The Pixi path then wraps the resolved image in a texture and stores that texture in a separate `textureCache`.

**Failure and lifecycle.** Failed image loads are evicted from the image registry and any corresponding texture cache entry is removed so a later retry is possible. Successful image promises and Pixi textures remain for the runtime. This design does not introduce eviction by LRU, age, or memory pressure; that is left for a follow-up if memory measurements warrant it. Cancellation is also out of scope: in-flight loads run to completion even if the requesting scene has already torn down. Existing `loadRequestId` race guards in `formation.js` and `parallax.js` continue to discard stale results at the consumer.

### 4. Formation Loading Order

Formation rendering should consult the manifest before choosing what to load. The naive "manifest-first, always" order can regress cold-open latency: today the static texture appears as soon as `id-idle.webp` (or `id.webp`) decodes, while the animated sheet replaces it later. Flipping the order without a primed manifest would block the first sprite paint on a manifest fetch plus a sheet decode.

Resolution:

- The manifest fetch is started early at app boot in `public/game.js`, but it must not block first UI render. The fetch is a no-cache JSON GET that returns once per app runtime and should usually resolve before formation work begins. Formation calls `loadCreatureAnimationManifest()` (which already memoizes) and treats it as a synchronous-feeling lookup once resolved.
- If the manifest is already resolved when formation builds a sprite, behavior is the new order: animated sheet → idle → static → text fallback.
- If the manifest is still loading (very cold open), formation may build with static/idle first and let the animated state attach when the manifest resolves. This preserves today's latency floor and is a strict improvement once the manifest is warm. The implementation should be a single branch: "manifest known? pick animated. manifest pending? show static now and upgrade later."

The static/idle fallback chain remains the contract for creatures with no animated entry, but it is driven by manifest knowledge rather than a 404-prone load attempt.

### 4a. Sync URL Helpers and Manifest Sequencing

`creatureBgUrl(id)` is currently synchronous and depends on `_hasIdle`/`_noIdle` populated by `probeIdleSprites()`. Replacing the probe with manifest knowledge requires a sequencing decision because the manifest fetch is async.

Plan:

- The asset manifest fetch is started early at app boot before normal gameplay UI calls sync URL helpers. This is the same non-blocking prime done for the animation manifest in §4.
- `creatureBgUrl(id)` becomes a thin lookup against the in-memory manifest cache. If the manifest has not loaded, it returns the static URL (the safer fallback) and logs a one-line warning so test runs and dev sessions catch missed primes.
- `probeIdleSprites()` is kept as a no-op stub during the migration so existing call sites in `public/game.js` still link, then deleted in a follow-up once Phase 2 ships.
- New code should never depend on probe-derived sets. Adding a new sync URL helper requires a corresponding manifest field.

### 5. DOM Image Callers

Replace inline URL construction in DOM UI with asset URL helpers. Concrete migration targets (cross-reference the inventory in Current Findings):

- `creatureSpriteHtml()`, `configureCreatureImg()`, `creatureBgUrl()`, `creatureSpritePath()`, `creatureStaticPath()` in `sprite-utils.js` move behind the new module and call the canonical helpers internally.
- `attack-card.js` (action icons + NPC sprites + creature art) and `move-select.js` (action icons) drop the hard-coded `?v=20260322` and use `actionIconUrl()`.
- `target-select.js` and `item-target-picker.js` already call `creatureStaticPath`; they migrate when that helper relocates.
- `room-transition.js`, `exploration.js`, `exploration-dom.js`, and `befriend.js` replace inline `\`/assets/sprites/npcs/${id}.webp?v=${SPRITE_VERSION}\`` with `npcSpriteUrl(id)`.
- `campfire.js` replaces inline item-sprite construction with `itemSpriteUrl(id)`.
- `combat-dom.js` `setBackground()` is changed per §6.

Where a UI is about to render a modal or choice list, it may call `warmAssets()` for the exact assets it is about to insert. That warmup should be non-blocking unless the UI already has a natural loading boundary.

### 6. Background and Audio URL Discipline

`setBackground()` should stop appending `SPRITE_VERSION` to arbitrary background image paths. The new contract is a single mode: callers pass a logical background reference (areaId + layer name, or a named hub-background ref), and `setBackground()` resolves it through `backgroundLayerUrl()`. The "or accept a fully resolved canonical URL" escape hatch is removed; allowing both shapes is the current source of drift and would re-emerge.

Existing direct callers (`game.js` static `/assets/backgrounds/hub.webp`, `quiz_master_background.webp`, `dealer_background.webp`, `word_discovery_background.webp`, area-derived backgrounds, plus `pvp-lobby.js`) are migrated to logical refs. The internal `_lastBgPath` skip-cache is keyed off the resolved canonical URL after migration so that future version bumps invalidate it.

`audio.js` should use centralized `sfxUrl()` and `bgmUrl()` helpers. SFX already preload after audio initialization; BGM can stay just-in-time until the background-preload phase. `AUDIO_VERSION` is currently `'20260212'` (months behind the others); centralizing it inside the asset URL module is the prerequisite for ever bumping it reliably.

### 7. Asset Diagnostics

Add a debug-only diagnostics path to answer whether iOS restart causes true network redownloads.

Minimum fields per load:

- Canonical URL.
- Logical asset ref if available.
- Load start/end time and duration.
- Consumer type: `pixi`, `dom-warmup`, `audio`, `manifest`.
- Whether the URL was already in the runtime loader cache.
- Resource Timing fields: `transferSize`, `encodedBodySize`, `decodedBodySize`, and `duration`.

Because Capacitor's `server.url` makes `/assets/...` requests same-origin with the WebView document, Resource Timing populates the size fields without `Timing-Allow-Origin`. The diagnostic relies on this directly. The leading hypothesis for any iOS regression is `NSURLCache` size pressure (default ~20 MB on iOS) evicting immutable bytes — the diagnostic should be designed to confirm or refute that. If a future deployment moves assets to a different origin, the diagnostic should detect the cross-origin case and either request `Timing-Allow-Origin` server-side or fall back to a duration-only signal with a clear "size unavailable" marker.

Add a temporary dev console helper such as `window.__assetStats()` so device testing can compare:

1. Cold install/open.
2. Swipe app closed.
3. Reopen.
4. Visit creature select, target select, and combat attack card.

If the same immutable URLs show non-zero `transferSize` after restart, then design a follow-up for durable native caching.

Production builds should not ship the stats collector by default, but Capacitor device testing may need diagnostics in an otherwise production-shaped build. Gate the entire diagnostics module behind an explicit build-time flag such as `__ASSET_DIAGNOSTICS__`, defaulting to false. Dead code elimination should remove it from normal production bundles. The `window.__assetStats()` helper exists only when that flag is enabled.

## Background Preloading Phase

After canonical URL and loader work is complete, add a prioritized preload scheduler.

### Scheduler Contract

The scheduler should:

- Accept logical asset refs, not raw URLs.
- Deduplicate against already loaded and in-flight URLs.
- Limit concurrency, starting with 2 image loads at a time.
- Pause or reduce work when the app is backgrounded.
- Yield to visible gameplay by scheduling low-priority work through `requestIdleCallback` where available, with a timeout fallback.
- Avoid blocking UI transitions on speculative assets.

### Priority Bands

Immediate warmup:

- Current party creature battle sprites and portraits.
- Current area `sky` and `battleground`.
- Current screen's directly visible NPC/item/creature images.

Near-future warmup:

- Current encounter enemies when known.
- Attack card participants and action icons once the move result payload is available.
- Target select candidates when the player opens move select.

Low-priority warmup:

- Reserve creatures.
- Next likely area backgrounds.
- BGM tracks for likely next phases.
- Common NPC portraits.

Preloading should be data- and battery-conscious by default. It should improve perceived responsiveness without turning every session into a full asset-library download.

## Rollout Plan

### Phase 1: Correct URL Identity

- Add shared asset URL helpers in `public/js/assets/asset-urls.js`.
- Migrate action icons, backgrounds, audio, and common sprite helpers.
- Remove or bridge duplicated version constants. The server-side `SPRITE_VERSION` in `src/routes/game/run.js` is imported from a runtime-neutral shared source rather than re-declared.
- Add unit tests for canonical URL output and version token usage.
- Begin the server-side URL → ID migration described in §1: `run.js` returns logical IDs alongside the existing `sprite` URL fields, and the client switches to consuming the IDs. Removing the `sprite` fields is left for a later release once older client builds have rolled off.

Success criteria:

- No inline cache-bust versions remain in any of these files: `attack-card.js`, `move-select.js`, `combat-dom.js` (background), `room-transition.js`, `exploration.js`, `exploration-dom.js`, `befriend.js`, `campfire.js`, `sprite-utils.js`, `formation.js` (lines 460/464), `audio.js`, `parallax.js`.
- The string `?v=20260322` does not appear in client source.
- `grep -RnE '/assets/(sprites|backgrounds)/[^?]+\?v='` against `public/js/` and `src/routes/` returns only matches inside `asset-urls.js`.
- DOM background code no longer uses `SPRITE_VERSION` for background assets.
- Server-side action icon URLs and client-side action icon URLs resolve to byte-identical strings for the same action slug.

### Phase 2: Manifest-Based Discovery

- Add or extend an asset manifest for creature static/idle/animated availability. Decide whether to extend `creatures-animated/manifest.json` or introduce a new top-level `asset-manifest.json` that includes the animation manifest by reference. Either is acceptable; document the choice.
- Preload the manifest at app boot (`public/game.js`) before any UI runs.
- Replace `probeIdleSprites()` as the primary idle discovery path. Stub the function as a no-op during the migration so existing call sites keep linking, then delete it.
- Implement the §4 ordering: animated when manifest is known, progressive enhancement when it is not.
- Existing formation tests in `tests/unit/pixi/formation-scene.test.js` and `formation-npc-scene.test.js` mock `loadImageTexture` for the static-then-animated dance and need to be rewritten to cover the new branches (manifest-loaded vs manifest-pending).
- Add tests for animated-first, idle fallback, static fallback, missing-asset, and manifest-pending-cold-open behavior.

Success criteria:

- Manifest-backed animated creatures with a primed manifest do not load static or idle art at all.
- Cold-open first-sprite-paint is no slower than today (measured: in tests, the manifest-pending branch must produce a visible texture in the same number of awaits as the current static path).
- Idle existence no longer requires one 404-prone probe per creature during normal startup.
- `probeIdleSprites` is removed or stubbed; nothing in `public/js` reads `_hasIdle`/`_noIdle` directly.

### Phase 3: Shared Loader and Diagnostics

- Add shared asset loader around `HTMLImageElement.decode()`.
- Update Pixi `loadImageTexture()` to delegate to the shared loader.
- Apply the §3 `crossorigin` policy: drop `img.crossOrigin = 'anonymous'` from the loader, keep DOM `<img>` tags without a `crossorigin` attribute, and add a unit test that asserts the policy.
- Add DOM warmup helpers and asset stats.
- Gate diagnostics behind the explicit `__ASSET_DIAGNOSTICS__` build-time flag so normal prod bundles do not ship the collector, while diagnostic device builds can opt in.
- Add tests for in-flight dedupe, failed-load eviction, canonical URL stats, and the crossorigin policy.

Success criteria:

- Concurrent warmups for the same canonical URL share one promise.
- Pixi callers preserve current iOS WebP decode behavior.
- Device diagnostics can distinguish runtime cache hits from new loads using same-origin Resource Timing.
- Normal production bundle build verifies the diagnostics module is dead-code-eliminated (search the bundle for `__assetStats` and confirm absent). A separate diagnostic build can opt in with `__ASSET_DIAGNOSTICS__`.

### Phase 4: Targeted Background Warmup

- Add preload scheduler with priority bands and concurrency caps.
- Wire immediate warmup into game-state load, scene transitions, and known encounter setup.
- Wire near-future warmup into move select, target select, and attack result rendering.
- Add tests for scheduler ordering, dedupe, and pause behavior.

Success criteria:

- Opening target select and attack cards usually uses already warmed participant images.
- Preloading does not block combat actions, room transitions, or first render.

### Phase 5: Native Persistence Decision

Use iOS diagnostics to decide whether further work is needed.

If iOS WebView HTTP caching reuses immutable assets after swipe-up/reopen, no durable blob cache is needed. Continue improving preload coverage.

If iOS redownloads stable immutable URLs after restart, choose one follow-up:

- Package core assets in the Capacitor bundle and resolve them locally.
- Add a native or IndexedDB-backed durable image cache for remote assets.
- Adjust server headers or Capacitor remote URL configuration if diagnostics show a header/configuration issue.

This should be a separate design because native persistence affects storage limits, invalidation, and app-update behavior.

## Testing

Unit tests:

- Asset URL helpers produce stable, versioned canonical URLs.
- Action icon slugging preserves current behavior while using shared versioning.
- Background helpers use `BACKGROUND_VERSION`.
- Shared loader dedupes in-flight image loads by URL.
- Loader does not set `crossOrigin` on its `Image()` instances (cache-key consistency policy).
- Failed image loads are evicted and can retry.
- Manifest fallback logic chooses animated, then idle, then static, when the manifest is loaded.
- Manifest-pending branch in formation produces a visible texture without waiting on the manifest fetch.
- `creatureBgUrl()` returns the static URL when the manifest has not loaded and logs a warning.
- Preload scheduler respects priority and concurrency.

Integration or browser tests:

- Creature selection, target select, item target picker, and attack card render with canonical URLs.
- Formation animated creatures do not request static/idle art before known animated sheets.
- Parallax backgrounds still load and scroll.
- Audio SFX preload still works after URL helper migration.

Manual Capacitor verification:

- Cold open on iOS device.
- Load a creature display, enter combat, open target select, and view attack card.
- Swipe app closed, reopen, repeat the same path.
- Compare `window.__assetStats()` before and after restart.
- Confirm no visual regressions in creature sprites, backgrounds, attack cards, and audio startup.

## Risks

Manifest drift is the biggest correctness risk. If the manifest says an asset exists but the file is missing, the loader still needs graceful fallback and diagnostics. The asset-generation process should eventually own manifest generation.

Over-preloading is the biggest performance risk. The scheduler must be conservative until measurements show the right priority bands.

Changing formation loading order can expose assumptions where code expects a placeholder sprite before animation sheets finish. Tests should cover animated and non-animated creatures, manifest-loaded and manifest-pending paths, before rollout. The progressive-enhancement branch in §4 exists specifically to keep cold-open first-paint latency from regressing; it must be exercised by tests, not just left as defensive code.

Capacitor iOS may still evict or bypass HTTP cache despite stable immutable URLs. The leading hypothesis is WebView cache capacity or eviction pressure rather than cross-origin partitioning, since `capacitor.config.ts` makes asset requests same-origin with the document. This design intentionally measures that before adding a heavier storage layer.

Memory growth in the runtime loader cache is unbounded by design: every successfully preloaded URL keeps its decoded image promise for the life of the WebView, and Pixi texture callers also keep a texture cache entry. For typical play sessions this is close to the memory footprint Pixi already holds for loaded textures. If long-session tests show memory pressure on iOS, an LRU or scene-scoped eviction policy is a follow-up — but it is explicitly out of scope here.

Manifest size could grow large enough that the boot-time fetch becomes a noticeable cold-open delay on slow connections. Today's `creatures-animated/manifest.json` is small, but a unified manifest covering creatures, NPCs, items, actions, and backgrounds may need to be split per-area or per-domain in a follow-up if it crosses ~100 KB.

The web path (browsers with the service worker) is intentionally unchanged. The SW continues to cache `.webp`/`.mp3` independently. The runtime loader's in-flight dedupe is additive and does not interact with SW behavior.

## Implementation Notes

Keep the first implementation small. A good first PR is URL helper centralization plus obvious caller migrations and tests. A second PR can add manifest-based discovery and formation load-order changes. A third PR can add the shared loader diagnostics. Background preloading should wait until those foundations are stable.

Do not commit generated caches or screenshots while testing. Any visual/rendering changes must be verified on device or with Playwright screenshots before reporting completion.

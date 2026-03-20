## Playtest Bugs

Format per entry:
- `When/Context`: where you noticed it
- `DOM Path`: selector path you provided
- `What I’m seeing`: current behavior
- `Expected`: what should happen instead

### Bug 1: `Yes, I understand!` shown in wrong button group
- `When/Context`: On the narration/choices UI; the “Yes, I understand!” button appears in the narration choice area but looks like an action-level control.
- `DOM Path`: `div.game-app > div#scene-area > div#narration-box > div#narration-choices > button.narration-choice-btn`
- `What I’m seeing`: The element is `button.narration-choice-btn` with label `Yes, I understand!`. It should be an action button, not an in-dialogue-box button.
- `Expected`: The “Yes, I understand!” control should be rendered in the action-area (same place as other action buttons) rather than inside the narration box.

### Bug 2: `ニューゲーム` (“New Game”) visibility wrong / placeholder for the yes button
- `When/Context`: Same narration step where the “Yes, I understand!” should appear.
- `DOM Path`: `div.game-app > div#action-area > button#new-game-btn`
- `What I’m seeing`: The `ニューゲーム` button is visible in `#action-area` at the same time the “Yes, I understand!” is incorrectly shown under narration choices.
- `Expected`: This `#new-game-btn` should not be visible at all at this stage; it should be replaced by the “Yes, I understand!” action button.

### Bug 3: Fire/other choice buttons rendered in narration box
- `When/Context`: In the narration/choices UI; the three Japanese element buttons are visible in `#narration-box` where action buttons should appear below.
- `DOM Path`: `div.game-app > div#scene-area > div#narration-box > div#narration-choices > button.narration-choice-btn[0]`
- `What I’m seeing`: The button is `button.narration-choice-btn` labeled `ひ (Fire)`. Similar issue occurs for the other two buttons.
- `Expected`: These buttons (e.g. `ひ (Fire)`) should be rendered as action buttons in the game box below (the action area), not inside the narration/choice box.

### Bug 4: Auth/game endpoints failing (404/401/empty response)
- `When/Context`: Browser console during initial startup / prologue / starter selection flow.
- `DOM Path`: N/A (network/API failures)
- `What I’m seeing`:
  - `:3000/api/auth/me` returns `404 (Not Found)`
  - `:3000/api/game/known-words` returns `401 (Unauthorized)`
  - `:3000/api/game/select-starter` fails with `net::ERR_EMPTY_RESPONSE`
  - Follow-on errors: `Uncaught (in promise) TypeError: Failed to fetch` at `playPrologue` (`game.js:576`)
  - Follow-on errors: `:3000/api/game/create-player` fails with `net::ERR_CONNECTION_REFUSED`
- `Expected`: Required endpoints should exist and be reachable; prologue + starter selection should complete without fetch failures (or the UI should gracefully handle auth/session missing rather than crashing).

### Bug 5: `/api/game/create-player` repeatedly fails (connection refused / failed to fetch)
- `When/Context`: During player creation / prologue flow, immediately after startup when the client tries to create the player.
- `DOM Path`: N/A (network/API failure)
- `What I’m seeing`:
  - `api.js` logs: `POST http://localhost:3000/api/game/create-player net::ERR_CONNECTION_REFUSED`
  - `logger.js:57` logs: `Request failed: { endpoint: '/create-player', error: 'Failed to fetch' }`
  - Same request errors appear multiple times in the console (retries or re-triggered flow).
- `Expected`: `POST /api/game/create-player` should succeed while the local dev server is running; the UI should not hard-fail/retry uncontrollably on connection errors.

### Bug 6: Prologue `Yes, I understand!` not full-width in action area
- `When/Context`: Prologue choice step; action-area shows the “Yes, I understand!” CTA.
- `DOM Path`: `div.game-app > div#action-area > div.prologue-choice > button.action-btn action-btn-primary prologue-choice-btn`
- `What I’m seeing`: Button is ~127px wide instead of matching other bottom action buttons (e.g. hub / ニューゲーム full width up to `max-width`).
- `Expected`: Same layout as existing `#action-area` button groups (reuse existing patterns—e.g. hub’s full-width column wrapper)—no dedicated CSS for prologue-only classes; only `action-btn` styling.

### Bug 7: Prologue action-area still narrow / old `prologue-choice` markup (follow-up)
- `When/Context`: Prologue steps “Yes, I understand!” and starter trio (`ひ (Fire)` etc.).
- `DOM Path`: `#action-area` sometimes shows plain text `Yes, I understand!`; choices under `div.prologue-choice > button...prologue-choice-btn`; starter button ~217px wide.
- `What I’m seeing`: Buttons not full width like standard `action-btn`; DOM still references `prologue-choice` / `prologue-choice-btn` (may indicate stale cached `game.js` or SW — current source should use hub-style wrapper + only `action-btn`).
- `Expected`: Full-width column inside `#action-area` (stretch up to existing `max-width: 340px` on `.action-btn`), identical stacking pattern to hub; no prologue-specific classes.

### Bug 8: Team select / collection card shows `？` text sprite instead of element kanji (e.g. fire → 火)
- `When/Context`: Collection overlay when viewing a creature card (`collection-select`); e.g. Fire creature.
- `DOM Path`: `div.collection-select … div.cc-sprite > div.text-sprite`
- `What I’m seeing`: `text-sprite` displays `？` instead of the creature’s kanji (e.g. 火 for fire), inconsistent with MVP text sprites elsewhere.
- `Expected`: Same as other creature text sprites — `baseWord` or Japanese `name` (e.g. 火); if only `element` is present, fall back to standard element kanji.

### Bug 9: Combat action cards missing sprite for starter element
- `When/Context`: In combat action card UI (attack card area).
- `DOM Path`: `div.game-app > div#action-area > div.plit-attack-card > div.ac-left > img.ac-.prite`
- `Position`: `top=552px, left=238px, width=64px, height=64px`
- `HTML Element`: `<img ... class="sac-sprite" src="/assets/sprites/creatures/hi-idle.webp?v=20260317" alt="" ...>`
- `What I’m seeing`: Sprite is missing / not rendering (only the `<img>` shell is present).
- `Expected`: Show the proper creature element sprite (and per our current convention, fire should display the kanji-based sprite/representation when image assets aren’t available).

### Bug 10: Combat action card icon uses wrong “fire” asset
- `When/Context`: In combat action card UI (right side action row) for fire-related action.
- `DOM Path`: `div.game-app > div#action-area > div.plit-attack-card > div.ac-right > div.ac-row .ac-vi.ible[0] > img.ac-action-icon`
- `Position`: `top=525px, left=328px, width=32px, height=32px`
- `HTML Element`: `<img class="sac-action-icon" src="/assets/sprites/actions/fire.webp" alt="" onerror="this.style.display='none'" ...>`
- `What I’m seeing`: The icon shown is `/assets/sprites/actions/fire.webp`, which is the wrong “fire”.
- `Expected`: It should use the same fire representation used for the creature’s fire (the starter element fire sprite/kanji representation), consistent with other element sprite conventions.

### Bug 11: Equipment effects not displayed for shop equipment (e.g. `hon`)
- `When/Context`: Shop/equipment UI showing an equipment item card.
- `DOM Path`: `div.game-app > div#action-area > div > div.hop-item > div.hop-item-card[1]`
- `HTML Element`: `<div class="shop-item-card" data-item-id="hon" data-index="1" style="position:relative;" data-cursor-element-id="cursor-el-295">本 ⬆️ 本 (ほん) book</div>`
- `What I’m seeing`: The equipment item card text/label renders, but the equipment’s effects (stat modifiers/bonus description) are not displayed.
- `Expected`: Selecting/viewing the equipment should show its effects (e.g., the bonus it provides) in the UI.

### Bug 12: Friendly NPC shop secondary line wrong gloss for `katana` (`item.meaning`)
- `When/Context`: Friendly NPC equipment offer; first card (`shop-item-card[0]`).
- `DOM Path`: `div.game-app > div#action-area > div > div.hop-item > div.shop-item-card[0] > div.shop-item-info > div.shop-item-word[1]`
- `HTML Element`: `<div class="shop-item-word" style="font-size:12px;opacity:0.8" ...>katana / sword</div>`
- `What I’m seeing`: English line showed `katana / sword` (lowercase, slash combo). Source was `data/items.json` → `katana.meaning` (not JPDB); UI prints `item.meaning` in `public/js/ui/exploration.js` (`renderFriendlyNpc`).
- `Expected`: Gloss should match authored item data — **“Katana”** (capitalized, single primary sense as requested).
- `Resolution (data)`: Updated `data/items.json` `katana.meaning` to `"Katana"`.

### Bug 13: Creature popup HP/ATK unchanged after equipping gear (`itemBuffs` vs display / HP not applied)
- `When/Context`: After equipping two equipment pieces, open creature popup stats line.
- `DOM Path`: `div#creature-popup > div.creature-popup-stats`
- `HTML Element`: e.g. `HP: 70/70 | ATK: 14 | MP: 70/70` unchanged vs expectation.
- `What I’m seeing`: ATK line used base `creature.attack` while combat used `attackMult`; `hpMult` buffs updated `itemBuffs` but did not scale party `maxHp`/`hp`, so equipment HP had no effect.
- `Expected`: Popup (and party) reflect effective ATK and HP after equipment.
- `Resolution (code)`: Scale party HP when `hpMult` increases in `applyItem`; popup ATK uses `run.itemBuffs.attackMult` (`creature-row.js` + `game.js` init).

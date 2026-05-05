# NPC Dialogue Action Area Redesign

## Goal

Move NPC-origin Japanese dialogue out of the blocking scene narration overlay and into the action area. Dialogue should become a visual-novel style action-area card: speaker portrait on the left, speaker name and controls on the right, scaffolded Japanese text, inactive `Translate` / `Learn` buttons, and a `Continue` button.

After the player taps `Continue`, the action area should switch to the next interaction screen, such as response choices, item choices, skill choices, or combat continuation. Choice screens should have clear headings.

## Scope

In scope:

- Friendly NPC greeting lines.
- NPC post-combat dialogue, including freed lines, round lines, and defeat lines.
- Enemy / NPC battle greeting lines.
- Creature dialogue used in befriend flows, including wait, name prompt, wrong answer, success, refusal, and similar creature-origin lines.
- Any other Japanese dialogue where an NPC, enemy, or creature is the speaker.
- Player-spoken Japanese dialogue lines currently shown as `You`, such as friendly NPC item requests.
- Choice screens that follow NPC dialogue. Every choice screen should have a heading.

Out of scope:

- Creature barks during combat.
- Item descriptions.
- Move descriptions.
- System narration that is not spoken by an NPC, enemy, or creature.
- Static non-dialogue prompts unless they are currently acting as NPC speech.
- Making `Translate` or `Learn` functional. They should render but do nothing for this first pass.

## Current Context

The current UI uses `public/js/ui/narration-box.js` for scene-overlay dialogue. Many flows call `narrationBox.show()` or `ctx.narration.showNarration()` and wait for dismissal before rendering choices in `#action-area`.

Relevant current paths include:

- `public/js/ui/narration-box.js` for the current overlay, pagination, dismissal behavior, and word-click hookup.
- `public/js/ui/bootstrap-client.js` for `renderJpSentence()` and `renderEnFirst()`.
- `public/js/ui/ui-components.js` for `renderButtons()`, `renderButtonsAsync()`, and `renderChoices()`.
- `public/js/ui/npc-dialogue-ui.js` for post-combat NPC dialogue and choices.
- `public/js/ui/befriend.js` for creature dialogue and befriend prompt flows.
- `public/js/ui/room-transition.js` for NPC battle intro greeting lines.
- `public/js/ui/exploration.js` for friendly NPC greetings and item choice prompts.
- `public/game.css` for the real layout constraints: `.scene-area` is `50dvh`, `.action-area` fills the remaining space.

The existing narration overlay can remain for non-NPC narration during this design. The new component should be introduced as an NPC dialogue surface rather than replacing every `showNarration()` caller at once.

## Approved Visual Direction

The approved mockup target is `npc-dialogue-iphone17-v23.html`, tested in an iPhone 17 Pro CSS viewport of `402 x 874`.

Use the real game geometry:

- Game max width: `430px`.
- Target viewport: `402 x 874` CSS px.
- Scene area: `50dvh`, about `437px` on iPhone 17 Pro.
- Action area: remaining `50dvh`, about `437px`.
- Reserve bottom safe area: `34px` on iPhone-style devices.

The action-area dialogue state should fit fully inside the usable action area:

- Dialogue card: about `214px` tall on a `402px` wide viewport.
- Translate / Learn row: about `64px` tall.
- Continue button: about `74px` tall.
- Vertical gaps: about `8px`.
- Action-area bottom padding: about `44px`, including safe-area room and home indicator clearance.

The visual style should be reference-like:

- Full-width parchment card with dark brown outer border and subtle inner border.
- Warm cream-to-parchment gradient.
- Left portrait crop integrated into the card.
- Right content area with speaker reading, speaker name, small utility buttons, and dialogue text.
- Small audio and log buttons, visually secondary. The latest mockup uses about `34 x 33px`.
- Blue `Translate`, green `Learn`, and orange `Continue` buttons with beveled borders.
- Button English labels should not use parentheses: `Translate`, `Learn`, `Continue`.
- Dialogue word glosses should not use parentheses: `anxiety`, not `(anxiety)`.

The provided headshot was used only to validate layout. The implementation should use the real NPC / creature portrait or sprite source available in the game. If a speaker has no portrait asset, use a graceful placeholder crop that does not break the card layout.

## Dialogue Rendering Rule

Dialogue text must preserve the game's existing learning style:

- Japanese is displayed in hiragana for the current early-game areas.
- Romaji appears above the Japanese.
- English appears below unknown / teaching words.
- Known words may omit English.
- Word lookup should remain possible on rendered Japanese words where token data exists.

Critical alignment requirement:

English glosses must never bump the Japanese baseline. In the mockup, the working solution was a shared-row scaffold for each visual dialogue line:

1. Romaji row.
2. Japanese row.
3. English gloss row.

All tokens on the same visual line share these rows. Empty English cells are still reserved for words without glosses. This keeps `ふあん`, `だけど`, and `わくわくするね！` aligned even though only `ふあん` has `anxiety` below it.

Do not implement this as independent per-word vertical stacks where the presence of English changes the word's vertical alignment. The implementation should either:

- Add a dialogue-card-specific renderer that groups tokens into line rows, or
- Extend the existing renderer with an option for shared-row layout.

Prefer a focused dialogue-card renderer first if it avoids risking regressions in combat cards, item names, choice cards, and existing narration.

Romaji / furigana sizing target:

- The final mockup uses a larger romaji size than the early mockups, roughly `9.1px` in the `402px` viewport.
- The implementation should use `clamp()` or container-relative sizing so this remains readable without overflowing on slightly narrower devices.

## Interaction Flow

The new flow should be:

1. NPC-origin dialogue line appears in the action area as the dialogue card.
2. `Translate` and `Learn` buttons render but are inert.
3. Audio button may call the same TTS/audio behavior if already available for that line.
4. Log button can be inert in the first pass unless there is an existing transcript/log feature to open.
5. Player taps `Continue`.
6. The action area clears the dialogue card and renders the next state.
7. If the next state is a choice list, it renders with a heading.
8. If the dialogue has multiple pages, `Continue` advances pages first. Only the final `Continue` resolves the dialogue promise and lets the caller render the next state.

Choice heading rule:

- All `renderChoices()` usage should include a heading.
- Response, name-quiz, Fight/Talk, release, swap, item, skill, and target screens should consolidate on the `renderChoices()` card UI rather than `renderButtonsAsync()` button stacks.
- Promise-based flows should use a small `renderChoicesAsync()` wrapper around `renderChoices()` so callers can continue to `await` selected indexes without keeping a separate button UI.
- Dialogue response choices should use headings such as `Choose a response`.
- Friendly NPC item choices should use headings such as `Choose an item`.
- Skill choices should use headings such as `Choose a skill`.
- Target pickers should keep or standardize headings such as `Choose target`.

Persistent NPC narration that currently acts as a prompt should be converted into either:

- A dialogue card followed by a headed choice screen, if it is spoken by an NPC / creature.
- A dialogue card followed by a headed choice screen, if it is spoken by the player as `You`.
- A plain action-area heading, if it is UI context rather than spoken dialogue.

## Architecture

Add a small NPC dialogue card UI module, for example `public/js/ui/npc-dialogue-card.js`.

Suggested API:

```js
showNpcDialogueCard({
  speaker,
  speakerReading,
  speakerPortrait,
  tokens,
  html,
  overrides,
  useKanji,
  audio,
  onContinue,
})
```

Canonical rendering input:

- Tokenized dialogue should pass `tokens`, `overrides`, and `useKanji` into the dialogue card.
- The `html` field is a legacy fallback only. It may be used for `renderEnFirst()` or escaped plain strings while old call sites are being migrated, but it is not the path that needs to satisfy the shared-row baseline alignment requirement.
- Plain text fallback should be escaped and should not attach word lookup handlers.

The module should:

- Render into `#action-area`.
- Return a promise that resolves when `Continue` is tapped after the last page, matching current `await narrationBox.show(...)` call sites.
- Attach word lookup handlers for tokenized words.
- Trigger existing TTS/audio where the caller already has audio data.
- Keep `Translate` and `Learn` buttons inert.
- Avoid reaching into game state directly except through existing helpers such as `getKnownWords()`.

For non-tokenized legacy strings, use a safe fallback renderer:

- If the caller has `renderEnFirst()` output, the card can render that HTML in a simpler text region.
- If the caller only has plain text, escape it and render without word lookup.
- Prefer migrating important NPC dialogue call sites to tokenized data where available.

## Migration Targets

Migrate in focused batches:

1. NPC post-combat dialogue in `public/js/ui/npc-dialogue-ui.js`.
   - Greeting / freed line: dialogue card, then continue.
   - Each round line: dialogue card, then headed response choices rendered with `renderChoices()`.
   - Defeat line: dialogue card, then continue.

2. Friendly NPC item rooms in `public/js/ui/exploration.js`.
   - Greeting: dialogue card, then continue.
   - Item prompt: do not keep as persistent narration. Convert to `Choose an item` heading above cards unless the prompt is spoken dialogue.
   - Player item request lines such as `You: Xください` should use the dialogue card with `speaker: 'You'`, then continue before applying the selected item.

3. NPC battle intro in `public/js/ui/room-transition.js`.
   - Fight-start line: dialogue card, then continue.
   - Strength prompt: either dialogue card if spoken by the NPC, or a headed UI prompt if it is just context.

4. Creature befriend flows in `public/js/ui/befriend.js`.
   - Creature wait/name/success/wrong/refusal lines become dialogue cards.
   - Fight/Talk, name quiz, release prompt, and swap choices render after `Continue` with headings using `renderChoices()`.

The migration should not touch creature combat barks, item descriptions, or move descriptions.

## Responsive Behavior

Primary target: iPhone 17 Pro, `402 x 874` CSS px, DPR 3.

The component must also tolerate:

- Existing app max width of `430px`.
- Slightly shorter Safari visible heights.
- Bottom safe area around `34px`.
- Narrower iPhone-class widths.

Use container queries or `clamp()` to scale:

- Card height.
- Portrait width / crop.
- Romaji size.
- Japanese size.
- Button heights and label sizes.

The action area must not scroll for the normal one-card dialogue state on iPhone 17 Pro. If a dialogue line is too long:

- Prefer line pagination inside the dialogue card, advanced by `Continue`.
- Do not shrink text below readability thresholds.
- Do not allow the button stack to clip under the home indicator.

## Testing

Unit tests:

- Add tests for the dialogue-card renderer to verify shared-row layout is used when English glosses are present.
- Verify a glossed word does not render in a way that can change neighboring Japanese baselines.
- Verify `Translate` and `Learn` render but do not call any handler.
- Verify `Continue` resolves the returned promise.
- Verify tokenized words preserve word lookup data attributes.
- Verify all migrated `renderChoices()` call sites pass a heading.

Focused UI tests:

- NPC post-combat round: dialogue card appears first, then `Continue`, then response choices with heading.
- Friendly NPC item room: greeting card appears first, then item choices with `Choose an item`.
- Creature befriend name prompt: creature dialogue card appears first, then name choices with heading.
- NPC battle intro: greeting/defeat lines use action-area dialogue card.

Visual verification:

- Run the dev server with Vite.
- Open the game at `http://localhost:5173`.
- Use iPhone-class viewport, ideally iPhone 17 Pro `402 x 874`.
- Inject or account for `public/dev-safe-area.css` bottom inset.
- Capture screenshots of:
  - NPC dialogue card.
  - Post-continue response choices.
  - Friendly NPC item choices.
  - Creature befriend dialogue card.
- Confirm the dialogue state fits in the action area without scrolling or clipping.
- Confirm English glosses do not bump Japanese baselines.

Syntax checks:

```bash
node --check public/js/ui/npc-dialogue-card.js
node --check public/js/ui/npc-dialogue-ui.js
node --check public/js/ui/exploration.js
node --check public/js/ui/befriend.js
node --check public/js/ui/room-transition.js
```

Run focused tests before broader suites, then the relevant unit/integration tests once the migration is complete.

## Open Implementation Notes

- The final portrait source strategy needs to match existing assets. The design does not require new portrait art before implementation, but the component must support portraits when available.
- If TTS/audio is unavailable for a line, the audio button should render disabled or inert rather than disappearing and shifting layout.
- The log button is visually part of the approved mockup but can stay inert for this first pass.
- The existing scene overlay narration should remain available for non-NPC narration until a separate design replaces it.
## Appendix: Exact V23 Mockup Source

This is the exact HTML/CSS used for the approved V23 browser mockup. Treat this as a visual reference, not production-ready implementation code; production should extract reusable CSS classes, use real speaker assets, and wire behavior through modules.

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NPC Dialogue iPhone 17 Pro V23</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100vw;height:100vh;overflow:hidden;background:#111318;display:grid;place-items:start center;font-family:ui-rounded,"SF Pro Rounded",Inter,system-ui,sans-serif}
    .game-app{width:min(100vw,430px);height:100dvh;max-height:874px;background:linear-gradient(160deg,#f0efe8,#e8edf3,#e0e4f0,#e8e0f0);overflow:hidden;display:flex;flex-direction:column}
    .scene-area{height:50dvh;min-height:220px;flex:0 0 auto;position:relative;overflow:hidden;border-bottom:2px solid #3498db;background:radial-gradient(circle at 73% 24%,rgba(255,255,255,.45),transparent 7%),radial-gradient(circle at 52% 45%,rgba(163,230,53,.28),transparent 24%),linear-gradient(180deg,#bfdba5 0%,#6f9e62 45%,#233a36 100%)}
    .scene-area:before{content:"";position:absolute;left:14px;top:4px;width:148px;height:260px;border-radius:48% 48% 30% 30%;background:linear-gradient(135deg,#16243b,#1e3a5f);transform:rotate(-7deg);opacity:.92}
    .hp{position:absolute;right:68px;top:22px;width:84px;height:16px;border-radius:999px;background:linear-gradient(180deg,#91e05a,#50a529);border:3px solid rgba(16,37,18,.86)}
    .hud{position:absolute;top:10px;left:22px;right:22px;display:flex;justify-content:space-between;z-index:2}.chip{background:rgba(0,0,0,.68);color:white;border-radius:12px;padding:8px 12px;font-size:13px;font-weight:800;line-height:1}
    .action-area{height:50dvh;min-height:0;position:relative;flex:1;padding:7px 8px 44px;background:radial-gradient(circle at 8% 12%,rgba(14,165,233,.14),transparent 24%),linear-gradient(180deg,#111827,#0f172a)}
    .action-area:after{content:"";position:absolute;left:50%;bottom:9px;transform:translateX(-50%);width:134px;height:5px;border-radius:999px;background:rgba(255,255,255,.28)}
    .card{position:relative;width:100%;height:214px;border-radius:14px;border:3px solid #4d3c28;background:radial-gradient(circle at 42% 20%,rgba(255,255,255,.58),transparent 18%),linear-gradient(180deg,#fff9eb,#f4dfbd);box-shadow:0 8px 17px rgba(0,0,0,.36),inset 0 0 0 2px rgba(255,255,255,.82),inset 0 -26px 48px rgba(134,78,35,.13)}
    .card:before{content:"";position:absolute;inset:7px;border-radius:9px;border:1px solid rgba(100,78,48,.28);box-shadow:inset 0 0 0 1px rgba(255,255,255,.62);pointer-events:none}
    .portrait{position:absolute;left:10px;bottom:8px;width:112px;height:171px;overflow:hidden;border-radius:10px}.portrait img{position:absolute;left:-17px;top:0;width:143px;height:auto;filter:drop-shadow(0 4px 3px rgba(64,36,24,.16))}
    .copy{position:absolute;left:133px;right:14px;top:28px;bottom:12px}.head{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding-bottom:8px;border-bottom:2px solid rgba(101,80,52,.23);margin-bottom:10px}
    .speaker{color:#1f1712;font-size:22px;font-weight:780;letter-spacing:.02em;line-height:1}.speaker .ruby{display:block;margin-left:3px;margin-bottom:2px;color:#2d241d;font-size:11px;letter-spacing:.55em;font-weight:640}
    .tools{display:flex;gap:5px;margin-top:0}.tool{width:34px;height:33px;border-radius:9px;display:grid;place-items:center;background:linear-gradient(180deg,#fff8e9,#ead4aa);border:2px solid #756049;box-shadow:0 2px 0 #4e3b28,inset 0 0 0 1px rgba(255,255,255,.58);color:#1f1a16;font-size:18px;font-weight:900}
    .dialogue-lines{color:#17130f;font-family:"Hiragino Maru Gothic ProN","Yu Gothic",ui-rounded,system-ui,sans-serif;font-size:14.5px;font-weight:520;letter-spacing:.01em}.line-grid{display:grid;grid-template-rows:8.5px 17px 9px;row-gap:4px;align-items:start;text-align:center;margin-bottom:10px}.line-grid.first{grid-template-columns:1.05fr .72fr 1.35fr}.line-grid.second{grid-template-columns:.62fr .72fr 1.22fr;margin-bottom:0}.romaji{grid-row:1;color:#53493e;font-family:Inter,system-ui,sans-serif;font-size:9.1px;font-weight:600;letter-spacing:.02em;line-height:1;white-space:nowrap}.kana,.plain-kana{grid-row:2;line-height:1.05;white-space:nowrap}.english{grid-row:3;color:#1d64a6;font-family:Inter,system-ui,sans-serif;font-size:8.5px;font-weight:700;line-height:1.02;white-space:nowrap;transform:translateY(-3px)}.c1{grid-column:1}.c2{grid-column:2}.c3{grid-column:3}
    .button-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 16px 0}.action{position:relative;display:block;height:64px;border-radius:12px;border:3px solid #f4d9a5;color:white;text-shadow:0 2px 0 rgba(0,0,0,.36);box-shadow:0 4px 0 rgba(44,29,20,.82),inset 0 0 0 1px rgba(255,255,255,.28);overflow:hidden;font-weight:800}
    .action:before{content:"";position:absolute;inset:5px;border-radius:8px;border:1px solid rgba(255,255,255,.32);background:radial-gradient(circle at 16% 22%,rgba(255,255,255,.2),transparent 16%),linear-gradient(135deg,transparent 0 48%,rgba(255,255,255,.08) 49%,transparent 50%)}.blue{background:linear-gradient(180deg,#2f80db,#1d56be)}.green{background:linear-gradient(180deg,#559d3a,#2d772d)}
    .book-icon,.learn-icon{position:absolute;left:10px;top:20px;width:28px;height:23px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.24))}.book-icon:before,.book-icon:after{content:"";position:absolute;top:0;width:13px;height:20px;background:#f8edd5;border:2px solid rgba(79,48,27,.5);border-radius:3px 1px 1px 3px}.book-icon:before{left:1px;transform:skewY(-7deg)}.book-icon:after{right:1px;transform:skewY(7deg)}
    .learn-icon:before{content:"";position:absolute;left:2px;top:9px;width:26px;height:7px;background:#f7ebc7;transform:skewX(-18deg);box-shadow:0 5px 0 rgba(247,235,199,.78),0 10px 0 rgba(247,235,199,.58)}.learn-icon:after{content:"";position:absolute;left:13px;top:1px;width:4px;height:21px;background:#f7ebc7;transform:rotate(90deg)}
    .roman{position:absolute;left:40px;right:6px;top:9px;font-size:7.5px;line-height:1;letter-spacing:.02em;text-align:center;white-space:nowrap}.jp{position:absolute;left:40px;right:6px;top:22px;font-size:17px;line-height:1;text-align:center;white-space:nowrap}.en{position:absolute;left:40px;right:6px;top:40px;font-size:8.5px;line-height:1;text-align:center;white-space:nowrap}
    .continue{width:calc(100% - 124px);height:74px;margin:8px auto 0;background:linear-gradient(180deg,#e99c40,#bf6724)}.continue .roman{left:0;right:0;top:9px;text-align:center;font-size:9px}.continue .jp{left:0;right:0;top:25px;text-align:center;font-size:26px}.continue .en{left:0;right:0;top:48px;text-align:center;font-size:9.5px}.arrow{position:absolute;right:14px;top:24px;color:#f9e2b2;font-size:27px;text-shadow:0 2px 0 rgba(0,0,0,.44)}
  </style>
</head>
<body>
  <main class="game-app">
    <section class="scene-area"><div class="hud"><span class="chip">Starting Meadow</span><span class="chip">12</span></div><div class="hp"></div></section>
    <section class="action-area">
      <div class="card">
        <div class="portrait"><img src="/files/mira-headshot-clean.png" alt="Mira portrait"></div>
        <div class="copy">
          <div class="head"><div class="speaker"><span class="ruby">みら</span>ミラ</div><div class="tools"><div class="tool">♪</div><div class="tool">▣</div></div></div>
          <div class="dialogue-lines">
            <div class="line-grid first">
              <span class="romaji c1">kono saki ni</span><span class="romaji c2">nani ga</span><span class="romaji c3">matteru no kana</span>
              <span class="kana c1">このさきに</span><span class="kana c2">なにが</span><span class="kana c3">まってるかな。</span>
              <span class="english c1"></span><span class="english c2"></span><span class="english c3"></span>
            </div>
            <div class="line-grid second">
              <span class="romaji c1">fuan</span><span class="romaji c2"></span><span class="romaji c3">wakuwaku</span>
              <span class="kana c1">ふあん</span><span class="plain-kana c2">だけど、</span><span class="kana c3">わくわくするね！</span>
              <span class="english c1">anxiety</span><span class="english c2"></span><span class="english c3"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="button-row">
        <button class="action blue"><span class="book-icon"></span><span class="roman">honyaku suru</span><span class="jp">翻訳する</span><span class="en">Translate</span></button>
        <button class="action green"><span class="learn-icon"></span><span class="roman">manabu</span><span class="jp">学ぶ</span><span class="en">Learn</span></button>
      </div>
      <button class="action continue"><span class="roman">tsugi e susumu</span><span class="jp">次へ進む</span><span class="en">Continue</span><span class="arrow">▶</span></button>
    </section>
  </main>
</body>
</html>
```

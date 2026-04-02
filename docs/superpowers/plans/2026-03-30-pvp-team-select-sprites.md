# PvP Team Select — Mini Sprite Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text PvP team select buttons with mini creature sprite cards in a single row per team, a ? button that opens the existing creature popup, and party skill tags below the roster.

**Architecture:** The change is entirely in `public/js/ui/pvp-lobby.js` (JS) and `public/game.css` (CSS). The creature popup reuses the existing `creature-row.js` popup system via `dom.creaturePopup`. Sprite images come from `sprite-utils.js` `creatureSpriteHtml()`. Party skills are read from the team snapshot's `partySkills` array and rendered as tags below each team's creature row.

**Tech Stack:** Vanilla JS ES6 modules, CSS, existing sprite-utils and creature-row popup infrastructure.

**Design mockup:** http://76.13.220.142:8777/team-select-variants.html (the left panel "Final Direction")

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/js/ui/pvp-lobby.js` | Modify | Replace `renderPvpTeamSelect` team slot HTML with sprite card layout, wire ? buttons to creature popup, show party skills |
| `public/game.css` | Modify | Add `.pvp-team-card`, `.pvp-creature-row`, `.pvp-creature-mini`, `.pvp-party-skills` CSS classes |
| `public/js/ui/creature-row.js` | Read only | Reuse the `showPopup()` pattern and `buildBuffsSummary()` for the ? popup. May need to export `showPopup` or extract popup-building into a shared function |

---

### Task 1: Add PvP team card CSS

**Files:**
- Modify: `public/game.css` (append at end, before final closing brace if any)

- [ ] **Step 1: Add the PvP team select CSS block**

Append this CSS to the end of `public/game.css`:

```css
/* ============================================================
   PVP TEAM SELECT — Mini sprite team cards
   ============================================================ */

.pvp-team-card {
  background: var(--surface);
  border: 2px solid var(--border-color);
  border-radius: 14px;
  padding: 8px 6px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.pvp-team-card:active {
  transform: scale(0.97);
}
.pvp-team-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 14px rgba(100,181,246,0.35);
}
.pvp-team-card.pvp-team-empty {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
  border-style: dashed;
}

.pvp-team-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
  margin-bottom: 6px;
}
.pvp-team-label {
  font-size: 0.65em;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.pvp-team-count {
  font-size: 0.55em;
  color: var(--text-secondary);
  opacity: 0.6;
}

/* Creature row — fits up to 6 in one line */
.pvp-creature-row {
  display: flex;
  gap: 3px;
  justify-content: center;
}

/* Individual creature mini-card */
.pvp-creature-mini {
  flex: 1 1 0;
  min-width: 0;
  max-width: 56px;
  border-radius: 8px;
  padding: 3px 2px;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
  position: relative;
}
.pvp-creature-mini:hover {
  border-color: rgba(255,255,255,0.15);
  transform: translateY(-1px);
}

/* ? info button — top-right of the mini-card, NOT over the sprite */
.pvp-creature-info-btn {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: var(--text-secondary);
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  border: none;
  line-height: 1;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}
.pvp-creature-info-btn:hover {
  color: var(--accent-primary);
  background: rgba(0,0,0,0.8);
}

/* Sprite frame — small to fit 6 in a row */
.pvp-sprite-frame {
  width: 32px;
  height: 32px;
  margin: 0 auto 2px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pvp-sprite-frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
.pvp-sprite-frame .text-sprite {
  font-size: 1.2rem;
  min-width: unset;
  min-height: unset;
  width: 100%;
  height: 100%;
  border-radius: 0;
  background: none;
}

.pvp-creature-name {
  font-size: 0.55em;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pvp-creature-level {
  font-size: 0.5em;
  color: var(--text-secondary);
}

/* Empty team message */
.pvp-team-empty-msg {
  font-size: 0.8em;
  color: var(--text-secondary);
  text-align: center;
  padding: 16px 0;
}

/* Party skills row */
.pvp-party-skills {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 2px 0;
  justify-content: center;
}
.pvp-skill-tag {
  font-size: 0.5em;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(255,213,79,0.1);
  color: rgba(255,213,79,0.7);
  border: 1px solid rgba(255,213,79,0.15);
  font-weight: 600;
}
```

- [ ] **Step 2: Verify CSS syntax**

Run: `node -e "require('fs').readFileSync('public/game.css','utf8')" && echo "OK"`
Expected: `OK` (no read errors)

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "style: add PvP team select mini sprite card CSS"
```

---

### Task 2: Update pvp-lobby.js imports

**Files:**
- Modify: `public/js/ui/pvp-lobby.js` (lines 20-24)

- [ ] **Step 1: Add sprite-utils and creature-row imports**

Replace the import block at the top of `pvp-lobby.js`:

```js
import * as pvpSocket from '../pvp-socket.js';
import { getPvpTeams } from '../api.js';
import { playSFX } from '../audio.js';
import { startPvpBattle } from './pvp-battle.js';
import { escapeHtml } from './html-utils.js';
```

With:

```js
import * as pvpSocket from '../pvp-socket.js';
import { getPvpTeams } from '../api.js';
import { playSFX } from '../audio.js';
import { startPvpBattle } from './pvp-battle.js';
import { escapeHtml } from './html-utils.js';
import { creatureSpriteHtml } from './sprite-utils.js';
import { dom } from '../dom.js';
import { ELEMENT_COLORS, ELEMENT_ICONS } from './creature-row.js';
import { renderJpFirst } from './bootstrap-client.js';
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/pvp-lobby.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/pvp-lobby.js
git commit -m "feat(pvp): add sprite-utils and creature-row imports to pvp-lobby"
```

---

### Task 3: Add creature popup helper for PvP

**Files:**
- Modify: `public/js/ui/pvp-lobby.js` (add new function before `renderPvpTeamSelect`)

The existing `creature-row.js` popup uses `dom.creaturePopup` — a fixed-position `.creature-popup` element already in the DOM. We reuse that same element. We just need a function that populates it with creature data and positions it near the tapped ? button.

- [ ] **Step 1: Add showPvpCreaturePopup function**

Add this function in `pvp-lobby.js` after the `init()` function (around line 40):

```js
/**
 * Show the existing creature popup for a PvP team creature.
 * Reuses dom.creaturePopup from creature-row.js pattern.
 * @param {object} creature - Creature data from the team snapshot
 * @param {HTMLElement} anchorEl - The ? button element to position near
 */
function showPvpCreaturePopup(creature, anchorEl) {
  if (!creature) return;

  const archetypeLabel = creature.archetype || 'Fighter';
  const popupSubtitle = creature.modifier
    ? renderJpFirst(creature.modifier.word, creature.modifier.reading, creature.modifier.meaning)
      + 'の'
      + renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning)
    : renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning);

  const movesHtml = (creature.moves || []).map(m => `
    <div class="creature-popup-move-row">
      <span style="color:${ELEMENT_COLORS[m.element] || '#888'}">●</span>
      ${m.name} (${m.nameEn}) — ${m.category || 'attack'} ${m.power || 0}pw ${m.mpCost ?? 0}mp
    </div>
  `).join('');

  const equipHtml = (creature.equippedItems || []).length > 0
    ? `<div class="creature-popup-equipment">
        <div class="creature-popup-equipment-label">Equipment:</div>
        ${creature.equippedItems.map(item =>
          `<div class="creature-popup-equipment-row">${item.word || ''} (${item.nameEn || ''}) <span class="equip-effect">${item.description || ''}</span></div>`
        ).join('')}
      </div>`
    : '';

  dom.creaturePopup.innerHTML = `
    <div class="creature-popup-name">${escapeHtml(creature.name)} (${escapeHtml(creature.nameEn)})</div>
    <div class="creature-popup-subtitle">${popupSubtitle}</div>
    <div class="creature-popup-element">${ELEMENT_ICONS[creature.element] || ''} ${creature.element}</div>
    <div class="creature-popup-archetype">${archetypeLabel}</div>
    <div class="creature-popup-stats">
      HP: ${creature.hp}/${creature.maxHp} | ATK: ${creature.attack ?? creature.atk ?? '?'} | DEF: ${creature.defense ?? creature.def ?? 5} | MP: ${creature.mp}/${creature.maxMp}
    </div>
    ${equipHtml}
    ${movesHtml ? `<div class="creature-popup-moves"><div class="creature-popup-moves-label">Moves:</div>${movesHtml}</div>` : ''}
  `;

  // Position below the anchor element
  const rect = anchorEl.getBoundingClientRect();
  dom.creaturePopup.style.position = 'fixed';
  dom.creaturePopup.style.left = Math.max(8, Math.min(rect.left - 60, window.innerWidth - 260)) + 'px';
  dom.creaturePopup.style.top = (rect.bottom + 8) + 'px';
  dom.creaturePopup.style.bottom = 'auto';
  dom.creaturePopup.classList.add('visible');

  // Close on outside click
  const closeHandler = (e) => {
    if (!e.target.closest('.creature-popup') && !e.target.closest('.pvp-creature-info-btn')) {
      dom.creaturePopup.classList.remove('visible');
      document.removeEventListener('click', closeHandler);
    }
  };
  // Delay to avoid immediate close from same click
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/pvp-lobby.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/pvp-lobby.js
git commit -m "feat(pvp): add creature popup helper for team select"
```

---

### Task 4: Replace renderPvpTeamSelect with sprite card layout

**Files:**
- Modify: `public/js/ui/pvp-lobby.js` (replace the body of `renderPvpTeamSelect`, lines 194-277)

This is the main change. Replace the plain-text team slot rendering with mini sprite cards + party skills.

- [ ] **Step 1: Add the party skill catalog fallback**

Add this constant near the top of `pvp-lobby.js` (after the imports, before `init()`):

```js
/** Party skill names for display (matches server PARTY_SKILLS_CATALOG) */
const PARTY_SKILL_NAMES = {
  superEffectiveMend: 'Super-Effective Mend',
  hasteSpark: 'Haste Spark',
  guardPulse: 'Guard Pulse',
  battleRhythm: 'Battle Rhythm',
  finisherFeast: 'Finisher Feast'
};
```

- [ ] **Step 2: Replace team slot rendering**

In `renderPvpTeamSelect`, replace everything from `// Fetch saved PvP teams` through the `actions.setContent(...)` call (lines 194-234) with:

```js
  // Fetch saved PvP teams
  const result = await getPvpTeams();
  const teams = result?.pvpTeams || [null, null, null];
  let selectedSlot = null;

  const slotsHtml = teams.map((team, i) => {
    if (!team) {
      return `
        <div class="pvp-team-card pvp-team-empty pvp-team-slot" data-slot="${i}">
          <div class="pvp-team-header">
            <span class="pvp-team-label">Team ${i + 1}</span>
          </div>
          <div class="pvp-team-empty-msg">Empty</div>
        </div>
      `;
    }
    const creatures = team.creatureParty?.active || [];
    const creaturesHtml = creatures.map((c, ci) => {
      if (!c) return '';
      const sprite = creatureSpriteHtml(c.id, c.baseWord || c.name, c.element, 'pvp-mini-sprite');
      const name = escapeHtml(c.nameEn || c.name || '?');
      return `
        <div class="pvp-creature-mini" style="background:rgba(${c.element === 'fire' ? '239,83,80' : c.element === 'water' ? '66,165,245' : c.element === 'wood' ? '102,187,106' : c.element === 'earth' ? '141,110,99' : '158,158,158'},0.1)" data-team="${i}" data-creature="${ci}">
          <button class="pvp-creature-info-btn" data-team="${i}" data-creature="${ci}">?</button>
          <div class="pvp-sprite-frame">${sprite}</div>
          <div class="pvp-creature-name">${name}</div>
          <div class="pvp-creature-level" style="color:${ELEMENT_COLORS[c.element] || '#888'}">Lv${c.level || '?'}</div>
        </div>
      `;
    }).join('');

    // Party skills
    const skills = team.partySkills || [];
    const skillsHtml = skills.length > 0
      ? `<div class="pvp-party-skills">${skills.map(s => {
          const id = typeof s === 'string' ? s : (s?.id || s?.skillId || '');
          const name = PARTY_SKILL_NAMES[id] || id;
          return `<span class="pvp-skill-tag">${escapeHtml(name)}</span>`;
        }).join('')}</div>`
      : '';

    return `
      <div class="pvp-team-card pvp-team-slot" data-slot="${i}">
        <div class="pvp-team-header">
          <span class="pvp-team-label">Team ${i + 1}</span>
          <span class="pvp-team-count">${creatures.length} creatures</span>
        </div>
        <div class="pvp-creature-row">${creaturesHtml}</div>
        ${skillsHtml}
      </div>
    `;
  }).join('');

  actions.setContent(`
    <div class="pvp-team-select" style="display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%;max-width:380px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;margin-bottom:2px;">
        Select your team
      </div>
      ${slotsHtml}
      <div id="pvp-team-status" style="text-align:center;color:var(--text-secondary);font-size:0.85em;min-height:1.2em;">
      </div>
      <button class="action-btn action-btn-primary" id="pvp-ready-btn" disabled>
        Ready
      </button>
      <button class="action-btn action-btn-tertiary" id="pvp-team-cancel-btn">
        Leave Match
      </button>
    </div>
  `);
```

- [ ] **Step 3: Replace team slot click handlers**

Replace the existing click handler block (lines 237-258, the `querySelectorAll('.pvp-team-slot:not([disabled])')` block) with:

```js
  // Wire up team slot selection
  document.querySelectorAll('.pvp-team-slot:not(.pvp-team-empty)').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't select team if they clicked the ? button
      if (e.target.closest('.pvp-creature-info-btn')) return;
      playSFX('button-tap');
      // Deselect all
      document.querySelectorAll('.pvp-team-slot').forEach(b => b.classList.remove('selected'));
      // Select this one
      card.classList.add('selected');
      selectedSlot = parseInt(card.dataset.slot);

      // Send team to server
      const team = teams[selectedSlot];
      pvpSocket.selectTeam(selectedSlot, team);

      // Enable ready button
      const readyBtn = document.getElementById('pvp-ready-btn');
      if (readyBtn) readyBtn.disabled = false;
    });
  });

  // Wire up ? info buttons to show creature popup
  document.querySelectorAll('.pvp-creature-info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSFX('button-tap');
      const teamIdx = parseInt(btn.dataset.team);
      const creatureIdx = parseInt(btn.dataset.creature);
      const team = teams[teamIdx];
      const creature = team?.creatureParty?.active?.[creatureIdx];
      if (creature) {
        showPvpCreaturePopup(creature, btn);
      }
    });
  });
```

- [ ] **Step 4: Verify syntax**

Run: `node --check public/js/ui/pvp-lobby.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass (this is a frontend-only change, existing tests should be unaffected)

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/pvp-lobby.js
git commit -m "feat(pvp): replace team select text buttons with mini sprite cards

Shows creature sprites in a row (fits 6), ? button for detail popup,
party skills as gold tags below the roster. Empty teams show dashed
border. Selected team gets accent glow."
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or verify it's already running with Vite on port 5180 proxying to server on 3000)

- [ ] **Step 2: Seed test PvP teams if needed**

If the test user doesn't have PvP teams, seed them via the API. See `POST /api/game/pvp/seed-pvp-teams` with Bearer auth. The seeder accepts an array of 3 team snapshots (each with `creatureParty.active[]` and `partySkills[]`).

- [ ] **Step 3: Navigate to PvP team select**

Log in, enter PvP lobby, create a match, and verify the team select screen shows:
1. Mini creature sprite cards in a single row (6 fit without wrapping)
2. Each card has a ? button in the top-right corner (not overlapping the sprite)
3. Tapping ? opens the existing creature popup with stats, moves, equipment
4. Party skill tags appear as gold badges below the creature row
5. Empty team slots show "Empty" with a dashed border and reduced opacity
6. Selecting a team highlights it with an accent border glow
7. The Ready button enables after selecting a team

- [ ] **Step 4: Check mobile layout**

The 393px-wide iPhone layout should comfortably fit 6 mini-cards (each ~56px max). Verify no horizontal overflow.

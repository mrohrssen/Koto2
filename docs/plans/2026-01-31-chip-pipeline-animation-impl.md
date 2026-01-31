# Chip Pipeline Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the instant damage display with an animated build-up showing PWR and BW values climbing as each chip fires.

**Architecture:** Server-side `executeChipPipeline()` builds a step-by-step `sequence` array tracking each contribution. Client-side `showChipActivationSequence()` animates through the sequence, updating stat boxes and appending log lines. CSS provides stat box styling and pulse animations.

**Tech Stack:** Node.js (server), vanilla JS (client), CSS animations

---

### Task 1: Add Sequence Tracking to Pipeline

**Files:**
- Modify: `src/game/items/chips.js:592-770`
- Test: `tests/unit/pipeline-chips.test.js`

**Step 1: Write failing test for sequence array**

Add to `tests/unit/pipeline-chips.test.js` at end of file:

```javascript
describe('Pipeline Sequence Tracking', () => {
  it('should return sequence array with activate and base events', () => {
    const result = runPipeline([getChip('battery')]);

    assert.ok(Array.isArray(result.sequence), 'sequence should be an array');
    assert.ok(result.sequence.length >= 2, 'sequence should have at least 2 events');

    // First event: activate
    const activate = result.sequence.find(e => e.type === 'activate' && e.chipId === 'battery');
    assert.ok(activate, 'should have activate event for battery');
    assert.strictEqual(activate.chipName, 'Battery Bot');

    // Second event: base stats
    const base = result.sequence.find(e => e.type === 'base' && e.chipId === 'battery');
    assert.ok(base, 'should have base event for battery');
    assert.strictEqual(base.power, 8);
  });

  it('should include effect events for chips with passives', () => {
    const result = runPipeline([getChip('battery'), getChip('amplifier')]);

    // Amplifier has ×2 power effect
    const effect = result.sequence.find(e => e.type === 'effect' && e.chipId === 'amplifier');
    assert.ok(effect, 'should have effect event for amplifier');
    assert.strictEqual(effect.powerMult, 2);
  });

  it('should include heal events', () => {
    const result = runPipeline([getChip('onigiri')]);

    const heal = result.sequence.find(e => e.type === 'heal');
    assert.ok(heal, 'should have heal event');
    assert.strictEqual(heal.hp, 5);
  });

  it('should include noTrigger events for failed conditionals', () => {
    // Key chip only triggers vs bosses, running against non-boss
    const result = runPipeline([getChip('key')], { target: { isBoss: false, hp: 100, maxHp: 100 } });

    const noTrigger = result.sequence.find(e => e.type === 'noTrigger' && e.chipId === 'key');
    assert.ok(noTrigger, 'should have noTrigger event for key vs non-boss');
  });

  it('should include sacrifice events', () => {
    const result = runPipeline([getChip('charcoal')]);

    const sacrifice = result.sequence.find(e => e.type === 'sacrifice');
    assert.ok(sacrifice, 'should have sacrifice event');
    assert.strictEqual(sacrifice.chipId, 'charcoal');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/pipeline-chips.test.js`

Expected: FAIL with "sequence should be an array"

**Step 3: Add sequence array initialization**

In `src/game/items/chips.js`, modify `executeChipPipeline()` at line ~593 to add sequence to state:

```javascript
export function executeChipPipeline(weaponChips, context) {
  const state = {
    isCrit: context.isCrit,
    critChance: context.critChance || 0,
    critMultiplier: context.critMultiplier || 1.4,
    target: context.target,
    firedChips: [],
    sequence: [],  // NEW: Step-by-step animation sequence
    recursionCount: 0,
    sacrificedChips: [],
    combatStacks: context.combatStacks || {},
    weaponMaxSlots: context.weaponMaxSlots || 5,
    weaponUsedSlots: context.weaponUsedSlots || 0,
    totalHealPlayer: 0,
    runKills: context.runKills || 0,
    runChipsDestroyed: context.runChipsDestroyed || 0,
    player: context.player || null,
    powerPool: 0,
    bandwidthPool: 0
  };
```

**Step 4: Add sequence events in first pass (base stats)**

Replace the first pass loop (lines ~613-634) with:

```javascript
  // First pass: sum all chip stats into pools (with level scaling)
  console.log('[Pipeline] Starting pipeline with', weaponChips.length, 'chips');
  for (const chip of weaponChips) {
    if (chip.category === 'pipeline' && chip.stats) {
      let statPower = chip.stats.power || 0;
      let statBandwidth = chip.stats.bandwidth || 0;

      // Apply level scaling to stats
      if (state.player) {
        const level = getChipLevel(state.player, chip.id);
        const scalingPerLevel = 0.20;
        const scaleFactor = 1 + (level - 1) * scalingPerLevel;
        statPower = Math.round(statPower * scaleFactor);
        statBandwidth = Math.round(statBandwidth * scaleFactor);
      }

      console.log(`[Pipeline] ${chip.nameEn || chip.id}: +${statPower} PWR, +${statBandwidth} BW`);

      // Record activate event
      state.sequence.push({
        type: 'activate',
        chipId: chip.id,
        chipName: chip.nameEn || chip.name
      });

      // Record base stat contribution (only if non-zero)
      if (statPower > 0 || statBandwidth > 0) {
        state.sequence.push({
          type: 'base',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          power: statPower || undefined,
          bandwidth: statBandwidth || undefined
        });
      }

      state.powerPool += statPower;
      state.bandwidthPool += statBandwidth;
    }
  }
  console.log('[Pipeline] After stats: PWR', state.powerPool, 'BW', state.bandwidthPool);
```

**Step 5: Add sequence events in second pass (effects)**

After `state.firedChips.push(result);` (around line ~677), add sequence events based on result:

```javascript
    state.firedChips.push(result);

    // Record sequence events for animation
    if (result.triggered) {
      // Effect event (if chip modified pools)
      if (result.powerAdd || result.bandwidthAdd ||
          (result.powerMult && result.powerMult !== 1) ||
          (result.bandwidthMult && result.bandwidthMult !== 1)) {
        state.sequence.push({
          type: 'effect',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          powerAdd: result.powerAdd || undefined,
          powerMult: (result.powerMult && result.powerMult !== 1) ? result.powerMult : undefined,
          bandwidthAdd: result.bandwidthAdd || undefined,
          bandwidthMult: (result.bandwidthMult && result.bandwidthMult !== 1) ? result.bandwidthMult : undefined
        });
      }

      // Heal event
      if (result.healPlayer) {
        state.sequence.push({
          type: 'heal',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name,
          hp: result.healPlayer
        });
      }

      // Sacrifice event
      if (result.sacrifice) {
        state.sequence.push({
          type: 'sacrifice',
          chipId: chip.id,
          chipName: chip.nameEn || chip.name
        });
      }
    } else if (result.conditionFailed || result.notBoss || result.noPreviousChip) {
      // Conditional didn't trigger
      state.sequence.push({
        type: 'noTrigger',
        chipId: chip.id,
        chipName: chip.nameEn || chip.name
      });
    }
```

**Step 6: Include sequence in return value**

At the return statement (around line ~757), add sequence:

```javascript
  return {
    finalDamage,
    firedChips: state.firedChips,
    sequence: state.sequence,  // NEW
    critChance: state.critChance,
    recursionCount: state.recursionCount,
    sacrificedChips: state.sacrificedChips,
    combatStacks: state.combatStacks,
    healPlayer: state.totalHealPlayer,
    randomDestroyTriggered: state.randomDestroyTriggered || false,
    powerPool: state.powerPool,
    bandwidthPool: state.bandwidthPool
  };
```

**Step 7: Run tests to verify they pass**

Run: `node --test tests/unit/pipeline-chips.test.js`

Expected: All tests PASS

**Step 8: Commit**

```bash
git add src/game/items/chips.js tests/unit/pipeline-chips.test.js
git commit -m "feat: add sequence tracking to chip pipeline for animation"
```

---

### Task 2: Add CSS for Stat Boxes

**Files:**
- Modify: `public/game.css:1255-1282`

**Step 1: Add stat box styles**

After `.math-heal` block (around line 1282), add:

```css
/* ===== PIPELINE STAT BOXES ===== */
.pipeline-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 2px solid var(--accent-blue);
  border-radius: var(--radius-md);
  min-width: 70px;
  box-shadow: var(--shadow-soft);
}

.stat-box.damage {
  border-color: var(--accent-orange);
  background: linear-gradient(135deg, #fff9e0, #fff5cc);
}

.stat-box-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-box-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-box.damage .stat-box-value {
  color: var(--accent-orange);
}

.stat-box-operator {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-secondary);
}

/* Pulse animation when value changes */
.stat-box-value.pulse {
  animation: stat-pulse 0.3s ease-out;
}

@keyframes stat-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); color: var(--accent-orange); }
  100% { transform: scale(1); }
}

/* Pipeline log styles */
.pipeline-log {
  text-align: left;
  padding: 0 16px;
  max-height: 120px;
  overflow-y: auto;
}

.pipeline-log-line {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  opacity: 0;
  animation: fade-in 0.2s ease forwards;
}

.pipeline-log-line.heal {
  color: #2ecc71;
  font-weight: 600;
}

.pipeline-log-line.sacrifice {
  color: var(--accent-red);
  font-weight: 600;
}

.pipeline-log-line.no-trigger {
  color: var(--text-secondary);
  font-style: italic;
}
```

**Step 2: Verify CSS syntax**

Run: `node -e "require('fs').readFileSync('public/game.css', 'utf8')" && echo "CSS OK"`

Expected: "CSS OK" (no parse errors)

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat: add CSS styles for pipeline stat boxes and animation"
```

---

### Task 3: Rewrite showChipActivationSequence

**Files:**
- Modify: `public/js/ui/combat-loop.js:170-275`

**Step 1: Replace showChipActivationSequence function**

Replace the entire function (lines 170-275) with:

```javascript
// ============ COMBAT MATH DISPLAY ============

/**
 * Show chip activations with animated stat boxes.
 * PWR and BW build up in real-time as each chip fires.
 * @param {Object} pa - playerAttack result object
 */
async function showChipActivationSequence(pa) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  const pipelineResult = pa.pipelineResult;
  const sequence = pipelineResult?.sequence || [];

  // Track current values for animation
  let currentPwr = 0;
  let currentBw = 1; // Effective multiplier (internal 0 + 1)

  // Show critical hit first
  if (pa.critical) {
    actionArea.innerHTML = `<div class="combat-math"><span class="math-crit">CRITICAL HIT!</span></div>`;
    await delay(360);
  }

  // Build initial HTML with stat boxes
  const buildDisplay = (showDamage = false) => {
    const bwDisplay = currentBw === 1 ? '×1' : `×${currentBw.toFixed(1).replace(/\.0$/, '')}`;
    const damageBox = showDamage
      ? `<span class="stat-box-operator">=</span>
         <div class="stat-box damage">
           <span class="stat-box-label">DMG</span>
           <span class="stat-box-value">${pa.damage}</span>
         </div>`
      : '';

    return `
      <div class="combat-math">
        ${pa.critical ? '<span class="math-crit">CRITICAL HIT!</span><br>' : ''}
        <div class="pipeline-stats">
          <div class="stat-box" id="pwr-box">
            <span class="stat-box-label">PWR</span>
            <span class="stat-box-value" id="pwr-value">${currentPwr}</span>
          </div>
          <span class="stat-box-operator">×</span>
          <div class="stat-box" id="bw-box">
            <span class="stat-box-label">BW</span>
            <span class="stat-box-value" id="bw-value">${bwDisplay}</span>
          </div>
          ${damageBox}
        </div>
        <div class="pipeline-log" id="pipeline-log"></div>
      </div>
    `;
  };

  // Render initial state
  actionArea.innerHTML = buildDisplay(false);
  await delay(300);

  // Process sequence events
  for (const event of sequence) {
    const chipSlot = findChipSlotIndex(event.chipId);

    switch (event.type) {
      case 'activate':
        // Chip slot glows, SFX plays
        if (chipSlot !== null) {
          animateChipActivation(chipSlot);
          playSFX('chip-equip');
        }
        await delay(200);
        break;

      case 'base':
        // Base stats added
        if (event.power) {
          currentPwr += event.power;
          updateStatValue('pwr-value', currentPwr);
          addLogLine(`• ${event.chipName}: +${event.power} PWR`);
          await delay(200);
        }
        if (event.bandwidth) {
          currentBw += event.bandwidth;
          updateStatValue('bw-value', formatBw(currentBw));
          addLogLine(`• ${event.chipName}: +${event.bandwidth} BW`);
          await delay(200);
        }
        break;

      case 'effect':
        // Passive effect modifies pools
        if (event.powerAdd) {
          currentPwr += event.powerAdd;
          updateStatValue('pwr-value', currentPwr);
          addLogLine(`• ${event.chipName}: +${event.powerAdd} PWR`);
          await delay(200);
        }
        if (event.bandwidthAdd) {
          currentBw += event.bandwidthAdd;
          updateStatValue('bw-value', formatBw(currentBw));
          addLogLine(`• ${event.chipName}: +${event.bandwidthAdd} BW`);
          await delay(200);
        }
        if (event.powerMult) {
          currentPwr = Math.floor(currentPwr * event.powerMult);
          updateStatValue('pwr-value', currentPwr);
          addLogLine(`• ${event.chipName}: ×${event.powerMult} PWR`);
          await delay(200);
        }
        if (event.bandwidthMult) {
          currentBw *= event.bandwidthMult;
          updateStatValue('bw-value', formatBw(currentBw));
          addLogLine(`• ${event.chipName}: ×${event.bandwidthMult} BW`);
          await delay(200);
        }
        break;

      case 'heal':
        addLogLine(`• ${event.chipName}: +${event.hp} HP`, 'heal');
        await delay(200);
        break;

      case 'sacrifice':
        addLogLine(`• ${event.chipName}: SACRIFICED`, 'sacrifice');
        await delay(200);
        break;

      case 'noTrigger':
        addLogLine(`• ${event.chipName}: (no trigger)`, 'no-trigger');
        await delay(200);
        break;
    }
  }

  // Final reveal: show damage box
  await delay(300);
  actionArea.innerHTML = buildDisplay(true);

  // Show cascade if triggered
  if (pa.cascadeTriggered && pa.cascadeDamage) {
    await delay(600);
    addLogLine(`Cascade: +${pa.cascadeDamage}`);
  }

  // Show DoT damage
  if (pa.dotDamage && pa.dotDamage > 0) {
    await delay(480);
    showDotDamage(pa.dotDamage, false);
  }
}

/**
 * Update a stat box value with pulse animation
 */
function updateStatValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = value;
  el.classList.remove('pulse');
  void el.offsetWidth; // Force reflow
  el.classList.add('pulse');
}

/**
 * Format bandwidth as effective multiplier
 */
function formatBw(bw) {
  if (bw === 1) return '×1';
  const formatted = bw.toFixed(1).replace(/\.0$/, '');
  return `×${formatted}`;
}

/**
 * Add a line to the pipeline log
 */
function addLogLine(text, className = '') {
  const log = document.getElementById('pipeline-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = `pipeline-log-line ${className}`;
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
```

**Step 2: Verify JS syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "JS OK"`

Expected: "JS OK"

**Step 3: Manual test in browser**

Start server: `npm start`
- Start a combat encounter
- Answer a flashcard correctly
- Verify: PWR and BW boxes appear at 0 and ×1
- Verify: Numbers update as chips fire
- Verify: Damage box appears at end
- Verify: Log lines appear below boxes

**Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: animate chip pipeline with progressive stat display"
```

---

### Task 4: Handle Edge Cases

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Handle no chips equipped**

At the start of `showChipActivationSequence`, after checking for empty actionArea, add:

```javascript
  // Edge case: no chips or no sequence
  if (!pipelineResult || !sequence.length) {
    actionArea.innerHTML = `
      <div class="combat-math">
        <div class="pipeline-stats">
          <div class="stat-box">
            <span class="stat-box-label">PWR</span>
            <span class="stat-box-value">0</span>
          </div>
          <span class="stat-box-operator">×</span>
          <div class="stat-box">
            <span class="stat-box-label">BW</span>
            <span class="stat-box-value">×1</span>
          </div>
          <span class="stat-box-operator">=</span>
          <div class="stat-box damage">
            <span class="stat-box-label">DMG</span>
            <span class="stat-box-value">${pa.damage || 0}</span>
          </div>
        </div>
      </div>
    `;
    return;
  }
```

**Step 2: Handle legacy responses without sequence**

The existing check for `pipelineResult` covers this - if no sequence, shows instant result.

**Step 3: Verify edge case handling**

Run: `node --check public/js/ui/combat-loop.js && echo "JS OK"`

**Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "fix: handle edge cases in pipeline animation (no chips)"
```

---

### Task 5: Run E2E Tests

**Files:**
- None (verification only)

**Step 1: Run full e2e test suite**

Run: `./scripts/e2e-test.sh`

Expected: 60+/66 tests pass (known flakiness acceptable)

**Step 2: If tests fail, investigate**

Check for:
- Timing issues (animation delays may need adjustment)
- Element selectors changed (update tests if needed)
- Combat math display tests may need updates

**Step 3: Commit any test fixes**

```bash
git add tests/
git commit -m "test: update e2e tests for new pipeline animation"
```

---

### Task 6: Final Integration Test

**Files:**
- None (manual verification)

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test complete combat flow**

1. Start new game or load existing
2. Enter combat
3. Answer flashcard correctly
4. Watch chip animation:
   - PWR box starts at 0
   - BW box starts at ×1
   - Each chip activates (slot glows, SFX)
   - Base stats update boxes with pulse
   - Passive effects update boxes with pulse
   - Log lines appear for each action
   - Damage box fades in at end
5. Verify heal displays green
6. Verify sacrifice displays red
7. Verify conditional miss displays dimmed

**Step 3: Test with different chip loadouts**

- Battery only (pure stat stick)
- Amplifier (×2 multiplier)
- Charcoal (sacrifice)
- Onigiri (heal)
- Key (conditional vs boss/non-boss)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete chip pipeline animation implementation"
```

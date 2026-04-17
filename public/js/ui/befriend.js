/**
 * Befriend system UI — extracted from combat-loop.js (Strangler Fig).
 * Handles befriend eligibility, Talk flow, name quiz, and conversation-based capture.
 */

import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';
import { logger } from '../logger.js';
import { renderJpSentence, renderEnFirst, getKnownWords } from './bootstrap-client.js';
import { t, tPlain } from './i18n.js';
import { burstParticles } from '../pixi/effects.js';
import {
  getCreatureSpriteForScene,
  showActiveGlowForScene,
} from '../pixi/formation.js';
import { popupBuff } from '../pixi/text.js';
import { hideEnemy, showFormation } from './combat-dom.js';
import { showNpcInDisplay } from './exploration-dom.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { toRomaji } from './romaji.js';
import { renderButtonsAsync } from './ui-components.js';
import { playDialogueAudio } from '../tts.js';
import { showMoves, setActiveLabel } from './move-select.js';
import { clear as clearTargetSelect } from './target-select.js';
import { getTutorialNarration, getBefriendWrongNarration } from './tutorial-copy.js';
import { restoreBefriendQuizEnemyUi } from './befriend-quiz-state.js';
import { getSceneManager } from '../scenes/scene-manager.js';

const API_BASE = PLATFORM.apiBase;

// Coordinator deps (set via init)
let ctx = null;

/**
 * Initialize with coordinator callbacks.
 * @param {Object} deps - coordinator-provided state accessors and callbacks
 */
export function init(deps) {
  ctx = deps;
}

// ---- Pure helpers (explicit state inputs) ----

export function isBefriendSlotBlocked(state, slot) {
  return !!(state.combat?.befriendAttemptedSlots?.[slot]);
}

/** Per-creature: はなす available if this slot has not already spent their action on befriend this round. */
export function isBefriendAvailableForSlot(state, slot) {
  if (!state.combat?.isCreatureCombat || state.combat?.npcId) return false;
  if (isBefriendSlotBlocked(state, slot)) return false;
  const enemies = state.combat.enemies || [];
  const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
  if (alive.length !== 1) return false;
  return (alive[0].hp / alive[0].maxHp) <= 0.5;
}

export function getMoveSelectBefriendOpts(slot) {
  // Old befriend button disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // const befriendAvailable = isBefriendAvailableForSlot(slot);
  return {
    befriendAvailable: false,
    onBefriend: undefined
  };
}

// ---- State mutations ----

export function mergeBefriendSlotsFromTalkResponse(result) {
  if (!result?.befriendAttemptedSlots || !ctx.getGameState().combat) return;
  const gs = ctx.getGameState();
  ctx.updateGameState({
    ...gs,
    combat: {
      ...gs.combat,
      befriendAttemptedSlots: { ...result.befriendAttemptedSlots }
    }
  });
}

// ---- Internal helpers ----

/** After はなす uses a creature's turn (any outcome), continue move picks for the rest of the party. */
export function resumeMoveSelectionAfterBefriendSpend(actingSlot) {
  if (actingSlot == null || typeof actingSlot !== 'number') {
    ctx.startMoveSelection();
    return;
  }
  ctx.setCurrentCreatureIndex(actingSlot + 1);
  ctx.promptNextCreature();
}

/**
 * Ally HP map for befriend counter-attack playback — keyed by ally.id (see showOneEnemyAttackAnimated).
 * When `attacks` is set, adds each strike's damage back onto snapshot HP so the map reflects pre-strike
 * values (API allies are usually post-attack); matches buildAllyHpMap semantics.
 */
function buildLiveAllyHpMap(allies, attacks) {
  return ctx.buildAllyHpMap({ allies: allies || [], enemyAttacks: attacks || [] });
}

/**
 * Play befriend-related enemy strikes through the shared attack animation path.
 * @param {Array} attacks - enemyAttacks or counterAttack from API
 * @param {Array|undefined} alliesSnapshot - post-attack allies from response; falls back to live combat then party
 */
async function showBefriendEnemyAttacksAnimated(attacks, alliesSnapshot) {
  if (!attacks?.length) return;
  const gs = ctx.getGameState();
  let allies = alliesSnapshot?.length
    ? alliesSnapshot
    : (gs.combat?.allies?.length ? gs.combat.allies : []);
  if (!allies?.length) {
    allies = gs.run?.creatureParty?.active || [];
  }
  const resultLike = { allies, creatureParty: { active: allies } };
  const allyHpMap = buildLiveAllyHpMap(allies, attacks);

  for (const atk of attacks) {
    await ctx.showOneEnemyAttackAnimated(resultLike, atk, allyHpMap, false);
  }
}

function showBefriendReleasePrompt() {
  return new Promise((resolve) => {
    const state = ctx.getGameState();
    const party = state.run?.creatureParty;
    if (!party) { resolve(null); return; }

    const allCreatures = [
      ...party.active.map((r, i) => ({ ...r, slot: 'active', index: i })),
      ...party.reserves.map((r, i) => ({ ...r, slot: 'reserve', index: i }))
    ].filter(r => r && r.id);

    const ELEM_ICONS = { wood: '🌿', fire: '🔥', earth: '⛰️', metal: '⚙️', water: '💧' };

    const overlay = document.createElement('div');
    overlay.className = 'befriend-release-overlay';
    overlay.innerHTML = `
      <div class="befriend-release-panel">
        <div class="befriend-release-title">${t('partyFullTitle')}</div>
        <div class="befriend-release-list">
          ${allCreatures.map(r => `
            <button class="befriend-release-btn" data-creature-id="${r.id}">
              ${ELEM_ICONS[r.element] || ''} ${r.nameEn} (Lv${r.level}) - ${r.slot === 'active' ? t('equipped') : t('reserve')}
            </button>
          `).join('')}
        </div>
        <button class="befriend-release-skip-btn">${t('letItGoBtn')}</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.befriend-release-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(btn.dataset.creatureId);
      });
    });

    overlay.querySelector('.befriend-release-skip-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}

/**
 * Show target selection UI when multiple enemies are befriendable.
 */
function showBefriendTargetSelect(enemies) {
  return new Promise((resolve) => {
    const eligible = enemies
      .map((e, i) => ({ ...e, index: i }))
      .filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);

    if (eligible.length <= 1) {
      resolve(eligible.length === 1 ? eligible[0].index : -1);
      return;
    }

    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(-1); return; }

    renderButtonsAsync(
      eligible.map(e => ({
        label: `${e.nameEn || e.name} (HP: ${Math.round(e.hp / e.maxHp * 100)}%)`,
      })),
      { container: actionArea }
    ).then(idx => resolve(eligible[idx].index));
  });
}

/**
 * Show one round of befriend conversation.
 * Returns the selected option index.
 */
function showConversationRound(round, creatureName) {
  // Show creature's line in narration box
  ctx.narration.showNarration(round.speaker, {
    speaker: creatureName,
    persistent: true
  });

  return renderButtonsAsync(
    round.options.map(o => ({
      label: renderEnFirst(typeof o === 'string' ? o : o.text),
    }))
  );
}

/**
 * Show green/red feedback on answer options.
 */
function showAnswerFeedback(selectedIndex, correctIndex, correct) {
  document.querySelectorAll('#action-area .ui-btn').forEach((o, idx) => {
    o.style.pointerEvents = 'none';
    if (idx === correctIndex) {
      o.style.borderColor = 'var(--success-color, #4ade80)';
      o.style.boxShadow = '0 0 10px var(--success-color, #4ade80)';
    } else if (idx === selectedIndex && !correct) {
      o.style.borderColor = 'var(--danger-color, #ef4444)';
      o.style.boxShadow = '0 0 10px var(--danger-color, #ef4444)';
    } else {
      o.style.opacity = '0.5';
    }
  });
}

// ---- Entry points ----

/** Handle the player tapping the はなす (Talk) button during move selection. */
export async function handleBefriendTalk() {
  if (!ctx.isCombatActive()) return;
  const actingSlot = ctx.getCurrentCreatureIndex();

  return ctx.withAnimationActive(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/game/befriend-talk`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatureIndex: actingSlot })
      });
      if (!resp.ok) {
        let msg = tPlain('befriendTalkBlocked');
        try {
          const err = await resp.json();
          if (err?.error) msg = `${msg} (${String(err.error)})`;
        } catch { /* ignore */ }
        console.error('[CombatLoop] Befriend talk HTTP error:', resp.status);
        if (ctx.narration?.showNarration) ctx.narration.showNarration(msg, { persistent: false });
        const gs = ctx.getGameState();
        const allies = gs.combat?.allies || gs.run?.creatureParty?.active || [];
        const creature = allies[actingSlot];
        if (creature) {
          clearTargetSelect();
          setActiveLabel(creature);
          showActiveGlowForScene(getSceneManager()?.currentScene, actingSlot);
          showMoves(creature, actingSlot, getMoveSelectBefriendOpts(actingSlot));
        } else {
          ctx.startMoveSelection();
        }
        return;
      }
      const result = await resp.json();
      mergeBefriendSlotsFromTalkResponse(result);

      if (!result.accepted) {
        // Creature refused — show rejection + enemy attack
        const state = ctx.getGameState();
        const enemies = state.combat?.enemies || [];
        const alive = enemies.filter(e => e.hp > 0);
        const creatureName = alive[0]?.nameEn || alive[0]?.name || 'Creature';

        ctx.narration.showNarration(`${creatureName} refused to talk!`, { persistent: false });
        if (ctx.delay) await ctx.delay(600);

        await showBefriendEnemyAttacksAnimated(
          result.enemyAttacks,
          result.allies || ctx.getGameState()?.combat?.allies || []
        );

        // Update state with new HP values
        if (result.allies || result.enemies) {
          ctx.updateGameState({
            ...state,
            combat: {
              ...state.combat,
              allies: result.allies || state.combat.allies,
              enemies: result.enemies || state.combat.enemies
            }
          });
          ctx.updateUI();
          if (ctx.updateCreatureRowData) {
            const updated = ctx.getGameState();
            ctx.updateCreatureRowData(updated.run?.creatureParty, updated.combat);
          }
        }

        if (result.combatEnded) {
          ctx.setCombatActive(false);
          if (ctx.showGameOverModal) ctx.showGameOverModal();
          return;
        }

        resumeMoveSelectionAfterBefriendSpend(actingSlot);
        return;
      }

      // Accepted — launch the existing befriend conversation flow
      await executeBefriendAction(actingSlot);

    } catch (err) {
      console.error('[CombatLoop] Befriend talk error:', err);
      resumeMoveSelectionAfterBefriendSpend(actingSlot);
    }
  });
}

/**
 * Show the befriend name quiz UI.
 * The creature says "まって!!" (wait!!), player chooses Fight or Talk.
 * If Talk, creature asks "なまえは？" and shows 3 English name buttons.
 * @param {Object} quizData - { creatureId, creatureName, creatureNameEn, options: [{id, name}] }
 * @param {Object} result - The combat cycle result (for state sync)
 * @returns {Promise<void>}
 */
export async function renderBefriendQuiz(quizData, result) {
  const reading = quizData.creatureBaseReading || quizData.creatureName || '';
  const creatureSpeaker = { name: reading, reading: toRomaji(reading), meaning: '' };

  // Ensure the befriend target sprite is fully visible (KO animation is now
  // skipped for befriend targets, but reset alpha/tint as a safety fallback).
  const enemySprite = getCreatureSpriteForScene(getSceneManager()?.currentScene, 'enemy', quizData.targetIndex ?? 0);
  if (enemySprite) {
    enemySprite.alpha = 1;
    enemySprite.tint = 0xFFFFFF;
  }

  // Ensure the befriend target's DOM slot (HP bar + name) is fully visible.
  // The killing blow sets HP to 0 and schedules .defeated; syncFinalState restores
  // HP to 1, but the info box may still have .formation-info--hidden from a
  // formation rebuild or the slot may still be fading out.
  const targetSlot = document.querySelector(
    `#enemy-formation .formation-slot[data-index="${quizData.targetIndex ?? 0}"]`
  );
  if (targetSlot) {
    targetSlot.classList.remove('defeated');
    targetSlot.style.animation = '';
    targetSlot.style.opacity = '';
    targetSlot.style.pointerEvents = '';
    // Reveal the info box (name + HP bar) if it was hidden
    const info = targetSlot.querySelector('.formation-info');
    if (info) info.classList.remove('formation-info--hidden');
    // Set HP bar to show 1 HP (red) for the revived befriend target
    const enemy = result?.enemies?.[quizData.targetIndex ?? 0];
    if (enemy) {
      const hpPct = Math.max(1, (enemy.hp / enemy.maxHp) * 100);
      const fill = targetSlot.querySelector('.formation-hp-fill');
      if (fill) {
        fill.style.width = hpPct + '%';
        fill.style.backgroundColor = 'var(--hp-red)';
      }
      targetSlot.dataset.hp = String(enemy.hp);
    }
  }

  // Show "まって!!" narration (creature calls out first)
  if (quizData.waitPrompt) {
    const waitHtml = renderJpSentence(quizData.waitPrompt.tokens, getKnownWords(), new Map());
    await ctx.narration.showNarration(waitHtml, { speaker: creatureSpeaker, html: true });
  } else {
    await ctx.narration.showNarration('まって！！', { speaker: creatureSpeaker });
  }

  // Show Fight / Talk choice (buttons render immediately)
  const choicePromise = renderButtonsAsync([
    { label: 'たたかう (Fight)' },
    { label: 'はなす (Talk)' },
  ]);

  // Tutorial step 1: lock to Talk with glow, then Cid encourages befriending
  const tutorialStep = ctx.getGameState()?.meta?.tutorialStep;
  if (tutorialStep === 1) {
    const btns = document.querySelectorAll('#action-area .ui-btn');
    if (btns[0]) btns[0].classList.add('tutorial-dimmed');   // Fight — faded, unclickable
    if (btns[1]) btns[1].classList.add('tutorial-highlight'); // Talk — gold glow
    const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;
    showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
    // Befriend runs during combat with BattleScene active; route the NPC
    // slide through the scene so registry disposal handles cleanup on exit.
    const slideScene = getSceneManager()?.currentScene;
    if (slideScene && !slideScene.disposed && slideScene.layers?.npcs) {
      await slideScene.showNpcSprite(cidSprite, { slideIn: true });
    }

    for (const line of getTutorialNarration(1)) {
      await ctx.narration.showNarration(line, { speaker: 'Cid' });
    }

    const slideOutScene = getSceneManager()?.currentScene;
    if (slideOutScene && !slideOutScene.disposed && slideOutScene.npcSprite) {
      await slideOutScene.hideNpcSprite({ slideOut: true });
    }
    restoreBefriendQuizEnemyUi({
      quizData,
      result,
      gameState: ctx.getGameState(),
      hideEnemy,
      showFormation,
    });
  }

  const choiceIdx = await choicePromise;
  // 0 = Fight, 1 = Talk

  if (choiceIdx === 0) {
    // Kill the creature — call fight endpoint
    const fightResult = await fetch(`${API_BASE}/api/game/befriend-quiz-answer`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fight' })
    }).then(r => r.json());

    if (fightResult.state) {
      ctx.updateGameState(fightResult.state);
    }

    // Sync final state
    ctx.syncFinalState(fightResult);

    if (fightResult.combatEnded) {
      ctx.stopCombatLoop(fightResult);
    }
    return;
  }

  // Talk path — show "なまえは？" in narration, then name options as plain buttons
  // Wrapped in a loop to handle tutorial retry on wrong answers
  let quizDone = false;
  while (!quizDone) {
    if (quizData.namePrompt) {
      const nameHtml = renderJpSentence(quizData.namePrompt.tokens, getKnownWords(), new Map());
      await ctx.narration.showNarration(nameHtml, { speaker: creatureSpeaker, html: true });
    } else {
      await ctx.narration.showNarration('なまえは？', { speaker: creatureSpeaker });
    }

    const selectedIdx = await renderButtonsAsync(
      quizData.options.map(opt => ({ label: opt.name }))
    );

    const selectedId = quizData.options[selectedIdx]?.id ?? null;

    if (!selectedId) return;

    // Submit answer
    const answerResult = await fetch(`${API_BASE}/api/game/befriend-quiz-answer`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'talk', answerId: selectedId })
    }).then(r => r.json());

    if (answerResult.tutorialRetry) {
      const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;
      showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
      const retrySceneIn = getSceneManager()?.currentScene;
      if (retrySceneIn && !retrySceneIn.disposed && retrySceneIn.layers?.npcs) {
        await retrySceneIn.showNpcSprite(cidSprite, { slideIn: true });
      }
      await ctx.narration.showNarration(getBefriendWrongNarration(), { speaker: 'Cid' });
      const retrySceneOut = getSceneManager()?.currentScene;
      if (retrySceneOut && !retrySceneOut.disposed && retrySceneOut.npcSprite) {
        await retrySceneOut.hideNpcSprite({ slideOut: true });
      }
      restoreBefriendQuizEnemyUi({
        quizData,
        result: answerResult,
        gameState: ctx.getGameState(),
        hideEnemy,
        showFormation,
      });
      continue;
    }
    quizDone = true;

  if (answerResult.correct) {
    // Befriended!
    playSFX('creature-skill');
    if (quizData.successPrompt) {
      const successHtml = renderJpSentence(quizData.successPrompt.tokens, getKnownWords(), new Map());
      await ctx.narration.showNarration(successHtml, { speaker: creatureSpeaker, html: true });
    } else {
      await ctx.narration.showNarration('じゃあ、友達になろう！', { speaker: creatureSpeaker });
    }

    const capturedId = answerResult.capturedId;
    const capturedIdx = answerResult.capturedIndex;
    if (capturedId != null || capturedIdx != null) {
      const slot = (typeof capturedIdx === 'number'
        ? document.querySelector(`#enemy-formation .formation-slot[data-index="${capturedIdx}"]`)
        : null) || (capturedId
        ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${capturedId}"]`)
        : null);
      if (slot) slot.classList.add('befriended');
    }

    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', answerResult.capturedName || quizData.creatureNameEn || quizData.creatureName || '')}</div>`;
    }
    await ctx.delay(1200);

    if (answerResult.state) {
      ctx.updateGameState(answerResult.state);
    }
    ctx.syncFinalState(answerResult);

    // Show "New Ally!" popup on the last player formation slot
    const allySlots = document.querySelectorAll('#player-formation .formation-slot');
    const newAllyIdx = allySlots.length - 1;
    if (newAllyIdx >= 0) {
      setTimeout(() => {
        const pos = ctx.spritePos('player', newAllyIdx);
        popupBuff('New Ally!', pos);
        burstParticles(pos, { count: 8, color: 0x4CAF50 });
      }, 500);
    }

    if (answerResult.combatEnded) {
      ctx.stopCombatLoop({ ...answerResult, victory: true });
    }
    return;
  }

  // Wrong answer — creature fights back
  if (quizData.wrongPrompt) {
    const wrongHtml = renderJpSentence(quizData.wrongPrompt.tokens, getKnownWords(), new Map());
    await ctx.narration.showNarration(wrongHtml, { speaker: creatureSpeaker, html: true });
  } else {
    await ctx.narration.showNarration('ちがう！', { speaker: creatureSpeaker });
  }

  await showBefriendEnemyAttacksAnimated(
    answerResult.counterAttack,
    answerResult.allies || ctx.getGameState()?.combat?.allies || []
  );

  // Update state after counter-attack
  if (answerResult.allies || answerResult.enemies) {
    const gs = ctx.getGameState();
    if (gs.combat) {
      ctx.updateGameState({
        ...gs,
        combat: {
          ...gs.combat,
          ...(answerResult.allies && { allies: answerResult.allies }),
          ...(answerResult.enemies && { enemies: answerResult.enemies })
        },
        ...(answerResult.creatureParty && {
          run: { ...gs.run, creatureParty: answerResult.creatureParty }
        })
      });
      // Sync HP bars in-place — don't call updateUI() which re-renders
      // formations and resurrects KO-animated dead enemy sprites as ghosts
      if (answerResult.enemies?.length > 1) {
        answerResult.enemies.forEach((e, i) => ctx.characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
      } else if (answerResult.enemies?.[0]) {
        ctx.characterUI.updateEnemyHPBar({ current: answerResult.enemies[0].hp, max: answerResult.enemies[0].maxHp });
      }
      ctx.updateCreatureHpBars(answerResult.creatureParty?.active || ctx.getGameState().run?.creatureParty?.active, null);
      if (ctx.updateCreatureRowData) {
        const updated = ctx.getGameState();
        ctx.updateCreatureRowData(updated.run?.creatureParty, updated.combat);
      }
    }
  }

  if (answerResult.combatEnded) {
    ctx.setCombatActive(false);
    if (answerResult.victory === false) {
      if (ctx.showGameOverModal) ctx.showGameOverModal();
    }
    return;
  }

  // Combat resumes — start next move selection
  await ctx.delay(600);
  ctx.startMoveSelection();
  } // end while (!quizDone)
}

/**
 * Execute befriend action: 3-round conversation to capture low-HP enemy creature.
 * @param {number|null} actingCreatureSlot - Party index that spent their turn on はなす; null = flash-card path.
 */
export async function executeBefriendAction(actingCreatureSlot = null) {
  if (!ctx.isCombatActive()) return;

  return ctx.withAnimationActive(async () => {
    try {
      const state = ctx.getGameState();
      const enemies = state.combat?.enemies || [];

      // Target selection (auto if only one eligible)
      const eligible = enemies.filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
      let enemyIndex;
      if (eligible.length > 1) {
        enemyIndex = await showBefriendTargetSelect(enemies);
        if (enemyIndex < 0) {
          resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
          return;
        }
      }

      // Fetch conversation from server
      const convoResult = await ctx.apiGetBefriendConversation(enemyIndex);
      if (!convoResult || convoResult.error) {
        const errMsg = convoResult?.error || 'request failed';
        console.error('Befriend conversation error:', errMsg);
        if (ctx.narration?.showNarration) {
          const detail = String(errMsg);
          const fromApi = convoResult?.error && detail.length > 0;
          ctx.narration.showNarration(
            fromApi ? detail : (/generation|failed|load/i.test(detail) ? tPlain('befriendDialogueUnavailable') : tPlain('befriendFailedGeneric')),
            { persistent: false }
          );
        }
        resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
        return;
      }

    const { rounds, targetEnemy, targetEnemyIndex, userId: convoUserId } = convoResult;
    const creatureName = targetEnemy?.nameEn || targetEnemy?.name || 'Creature';
    const reading = targetEnemy?.name || creatureName;
    const creatureSpeaker = { name: reading, reading: toRomaji(reading), meaning: '' };

    // 3-round conversation loop
    for (let i = 0; i < rounds.length; i++) {
      // Play creature speaker line audio if available (fire-and-forget)
      if (rounds[i].speakerTts && convoUserId) {
        playDialogueAudio(convoUserId, rounds[i].speakerTts);
      }
      const selectedIndex = await showConversationRound(rounds[i], creatureName);
      // Play selected option audio if available (fire-and-forget)
      if (rounds[i].optionsTts?.[selectedIndex] && convoUserId) {
        playDialogueAudio(convoUserId, rounds[i].optionsTts[selectedIndex]);
      }
      const answerResult = await ctx.apiSubmitBefriendAnswer(i, selectedIndex);

      if (!answerResult) {
        logger.error("[CombatLoop] Befriend answer API returned null, resuming combat");
        resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
        return;
      }

      showAnswerFeedback(selectedIndex, answerResult.correctIndex, answerResult.correct);
      await ctx.delay(800);
      if (ctx.narration.forceHideNarration) ctx.narration.forceHideNarration();

      if (!answerResult.correct) {
        // --- FAILURE ---
        // Click-to-continue (no auto-dismiss) so players can read it.
        await ctx.narration.showNarration('？？？', { speaker: creatureSpeaker });

        // Shake target enemy
        const slots = document.querySelectorAll('#enemy-formation .formation-slot');
        const targetSlot = slots[targetEnemyIndex];
        if (targetSlot) {
          targetSlot.classList.add('shake-animation');
          setTimeout(() => targetSlot.classList.remove('shake-animation'), 500);
        }

        await showBefriendEnemyAttacksAnimated(
          answerResult.enemyAttacks,
          answerResult.allies || ctx.getGameState()?.combat?.allies || []
        );

        // Update game state with post-attack HP
        if (answerResult.allies || answerResult.enemies) {
          const gs = ctx.getGameState();
          if (gs.combat) {
            ctx.updateGameState({
              ...gs,
              combat: {
                ...gs.combat,
                ...(answerResult.allies && { allies: answerResult.allies }),
                ...(answerResult.enemies && { enemies: answerResult.enemies })
              }
            });
            ctx.updateUI();
          }
        }

        if (answerResult.combatEnded) {
          ctx.stopCombatLoop({ combatEnded: true, victory: false });
          return;
        }

        resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
        return;
      }

      // --- CORRECT ---
      if (answerResult.conversationComplete) {
        const br = answerResult.befriend;
        const captured = br?.captured;

        if (br?.reason === 'Party full') {
          ctx.narration.showNarration(tPlain('befriendPartyFullLine', creatureName), { persistent: false });
          await ctx.delay(600);
          const releaseChoice = await showBefriendReleasePrompt();
          if (releaseChoice && ctx.apiBefriendReplace) {
            const replaceResult = await ctx.apiBefriendReplace(releaseChoice);
            if (replaceResult?.success) {
              const actionArea = document.getElementById('action-area');
              if (actionArea) {
                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', replaceResult.captured.nameEn)}</div>`;
              }
              playSFX('creature-skill');

              const capturedId = replaceResult.captured?.id;
              const capturedIdx = replaceResult.capturedIndex;
              if (capturedId != null || capturedIdx != null) {
                const slot = (typeof capturedIdx === 'number'
                  ? document.querySelector(`#enemy-formation .formation-slot[data-index="${capturedIdx}"]`)
                  : null) || (capturedId
                  ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${capturedId}"]`)
                  : null);
                if (slot) slot.classList.add('befriended');
              }
              await ctx.delay(1200);

              if (replaceResult.combatEnded) {
                ctx.stopCombatLoop({ combatEnded: true, victory: replaceResult.victory });
                return;
              }

              const gs = ctx.getGameState();
              if (replaceResult.state) {
                ctx.updateGameState(replaceResult.state);
              } else if (gs.combat && replaceResult.enemies) {
                ctx.updateGameState({
                  ...gs,
                  combat: { ...gs.combat, enemies: replaceResult.enemies },
                  run: { ...gs.run, creatureParty: replaceResult.creatureParty }
                });
              }
            } else if (ctx.narration?.showNarration) {
              ctx.narration.showNarration(tPlain('befriendSwapFailed'), { persistent: false });
              await ctx.delay(1200);
            }
          } else {
            const actionArea = document.getElementById('action-area');
            if (actionArea) {
              actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #9E9E9E;">${t('letItGo')}</div>`;
            }
            await ctx.delay(800);
          }

          if (answerResult.combatEnded) {
            ctx.stopCombatLoop({ combatEnded: true, victory: answerResult.victory || false });
            return;
          }
          ctx.startMoveSelection();
          return;
        }

        if (br && !br.success) {
          if (br.reason === 'boss_first_defeat' && ctx.narration?.showNarration) {
            ctx.narration.showNarration(tPlain('befriendBossFirst'), { persistent: false });
          } else if (ctx.narration?.showNarration) {
            ctx.narration.showNarration(tPlain('befriendFailedGeneric'), { persistent: false });
          }
          await ctx.delay(1400);
          resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
          return;
        }

        playSFX('creature-skill');
        // Click-to-continue (no auto-dismiss) so players can read it.
        await ctx.narration.showNarration('\u3058\u3083\u3042\u3001\u53cb\u9054\u306b\u306a\u308d\u3046\uff01', { speaker: creatureSpeaker });

        if (captured?.id || typeof targetEnemyIndex === 'number') {
          const slot = (typeof targetEnemyIndex === 'number'
            ? document.querySelector(`#enemy-formation .formation-slot[data-index="${targetEnemyIndex}"]`)
            : null) || (captured?.id
            ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${captured.id}"]`)
            : null);
          if (slot) slot.classList.add('befriended');
        }

        const actionArea = document.getElementById('action-area');
        if (actionArea && captured) {
          actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', captured.nameEn)}</div>`;
        }
        await ctx.delay(1200);

        if (answerResult.state) {
          ctx.updateGameState(answerResult.state);
        } else {
          const gs = ctx.getGameState();
          if (gs.combat && answerResult.enemies) {
            ctx.updateGameState({
              ...gs,
              combat: { ...gs.combat, enemies: answerResult.enemies },
              ...(answerResult.creatureParty && {
                run: { ...gs.run, creatureParty: answerResult.creatureParty }
              })
            });
          }
        }

        // Show "New Ally!" popup on the last player formation slot
        const newAllySlots = document.querySelectorAll('#player-formation .formation-slot');
        const newAllySlotIdx = newAllySlots.length - 1;
        if (newAllySlotIdx >= 0) {
          setTimeout(() => {
            const pos = ctx.spritePos('player', newAllySlotIdx);
            popupBuff('New Ally!', pos);
            burstParticles(pos, { count: 8, color: 0x4CAF50 });
          }, 500);
        }

        if (answerResult.combatEnded) {
          ctx.stopCombatLoop({ combatEnded: true, victory: answerResult.victory || false });
          return;
        }

        ctx.startMoveSelection();
        return;
      }

      // Correct but not complete — brief pause then show next round
      await ctx.delay(300);
    }

    } catch (error) {
      console.error('Befriend conversation error:', error);
      if (ctx.narration?.showNarration) {
        ctx.narration.showNarration(tPlain('befriendFailedGeneric'), { persistent: false });
      }
      resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
    }
  });
}

/**
 * Befriend system UI — extracted from combat-loop.js (Strangler Fig).
 * Handles befriend eligibility, Talk flow, name quiz, and conversation-based capture.
 */

import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';
import { logger } from '../logger.js';
import { getKnownWords, renderEnFirst, renderJpSentence } from './bootstrap-client.js';
import { t, tPlain } from './i18n.js';
import { burstParticles } from '../pixi/effects.js';
import {
  getCreatureSpriteForScene,
  showActiveGlowForScene,
} from '../pixi/formation.js';
import { popupBuff } from '../pixi/text.js';
import { hideEnemy, showFormation } from './combat-dom.js';
import { showNpcInDisplay } from './exploration-dom.js';
import { creatureStaticPath } from './sprite-utils.js';
import { renderChoicesAsync } from './ui-components.js';
import { showNpcDialogueCard } from './npc-dialogue-card.js';
import { npcSpriteUrl } from '../assets/asset-urls.js';
import { resolveJapaneseDisplay } from './japanese-display-resolver.js';
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

function buildCreatureSpeaker(creature = {}, fallbackName = '') {
  const reading = creature.reading || creature.creatureReading || creature.name || fallbackName || '';
  const id = creature.id || creature.creatureId || '';
  return { name: reading, reading, meaning: '', id };
}

function simpleChoiceCards(labels) {
  return labels.map(label => ({ title: label }));
}

function dialogueOptionsForCreatureSpeaker(speaker) {
  const speakerName = typeof speaker === 'string' ? speaker : (speaker?.name || '');
  const speakerReading = typeof speaker === 'object' ? speaker?.reading : '';
  const creatureId = typeof speaker === 'object' ? speaker?.id : '';
  const speakerReadingLabel = speakerReading
    ? resolveJapaneseDisplay({ surface: speakerReading, reading: speakerReading }, { japaneseDisplayMode: 'hiragana' }).guideText
    : '';
  const speakerEntity = typeof speaker === 'object' && creatureId
    ? {
        id: creatureId,
        type: 'creature',
        surface: speaker?.name || '',
        displayName: speaker?.nameEn || speakerName,
      }
    : null;
  return {
    speaker: speakerName,
    speakerReading: speakerReadingLabel || undefined,
    ...(speakerEntity ? { speakerEntity } : {}),
    ...(creatureId ? {
      speakerPortrait: creatureStaticPath(creatureId),
      portraitKind: 'creature',
    } : {}),
  };
}

async function showCreatureDialogue({ speaker, prompt, fallbackText }) {
  const dialogueSpeaker = dialogueOptionsForCreatureSpeaker(speaker);
  const audio = prompt?.audio || null;
  if (prompt?.tokens?.length) {
    await showNpcDialogueCard({
      ...dialogueSpeaker,
      tokens: prompt.tokens,
      overrides: prompt.overrides || {},
      useKanji: false,
      ...(audio ? { audio } : {}),
    });
    return;
  }
  await showNpcDialogueCard({ ...dialogueSpeaker, text: fallbackText, ...(audio ? { audio } : {}) });
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

    renderChoicesAsync({
      heading: 'Choose a creature',
      cards: eligible.map(e => ({
        title: `${e.nameEn || e.name} (HP: ${Math.round(e.hp / e.maxHp * 100)}%)`,
      })),
      container: actionArea,
    }).then(idx => resolve(eligible[idx].index));
  });
}

/**
 * Show one round of befriend conversation.
 * Returns the selected option index.
 */
async function showConversationRound(round, creatureSpeaker) {
  const speakerLine = normalizeDialogueLine(round.speaker, round.userId, round.speakerTts);
  await showNpcDialogueCard({
    ...dialogueOptionsForCreatureSpeaker(creatureSpeaker),
    ...(speakerLine.tokens.length
      ? { tokens: speakerLine.tokens, audio: speakerLine.audio }
      : { text: speakerLine.raw, audio: speakerLine.audio }),
  });

  return renderChoicesAsync({
    heading: 'Choose a response',
    clearAfterSelect: false,
    cards: round.options.map(o => ({
      title: renderChoiceTitle(o),
    })),
  });
}

function normalizeDialogueLine(line, userId, ttsKey = null) {
  if (line && typeof line === 'object' && Array.isArray(line.tokens)) {
    return {
      raw: line.raw || '',
      tokens: line.tokens,
      words: line.words || [],
      audio: line.audio || (ttsKey && userId ? { userId, key: ttsKey } : null)
    };
  }
  return {
    raw: String(line || ''),
    tokens: [],
    words: [],
    audio: ttsKey && userId ? { userId, key: ttsKey } : null
  };
}

function renderChoiceTitle(option) {
  const line = normalizeDialogueLine(option);
  if (line.tokens.length > 0) {
    return renderJpSentence(line.tokens, getKnownWords(), null, {}, false, { recordExposure: false });
  }
  return renderEnFirst(line.raw);
}

/**
 * Show green/red feedback on answer options.
 */
function showAnswerFeedback(selectedIndex, correctIndex, correct) {
  document.querySelectorAll('#action-area .ui-choice').forEach((o, idx) => {
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

function isNameQuizFallbackResult(result) {
  return result?.mode === 'name_quiz' || result?.fallbackReason === 'ai_dialogue_unavailable';
}

function isAiDialogueUnavailableResult(result) {
  if (isNameQuizFallbackResult(result)) return true;
  return /AI conversations are unavailable/i.test(String(result?.error || ''));
}

function buildFallbackNameQuizData(baseQuizData, convoResult) {
  const fallbackQuiz = convoResult?.befriendQuiz || {};
  return {
    ...(baseQuizData || {}),
    ...fallbackQuiz,
    targetIndex: fallbackQuiz.targetIndex ?? baseQuizData?.targetIndex ?? convoResult?.targetEnemyIndex ?? 0,
    creatureId: fallbackQuiz.creatureId || baseQuizData?.creatureId || convoResult?.targetEnemy?.id,
    creatureName: fallbackQuiz.creatureName || baseQuizData?.creatureName || convoResult?.targetEnemy?.name,
    creatureNameEn: fallbackQuiz.creatureNameEn || baseQuizData?.creatureNameEn || convoResult?.targetEnemy?.nameEn,
    creatureReading: fallbackQuiz.creatureReading || baseQuizData?.creatureReading || convoResult?.targetEnemy?.reading,
    options: fallbackQuiz.options?.length ? fallbackQuiz.options : (baseQuizData?.options || []),
  };
}

async function submitBefriendNameQuizAnswer(answerId) {
  const resp = await fetch(`${API_BASE}/api/game/befriend-quiz-answer`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'talk', answerId })
  });
  const body = await resp.json().catch(() => null);
  if (resp.ok === false) {
    return { error: body?.error || 'request failed' };
  }
  return body;
}

async function runBefriendNameQuizFallback({
  quizData,
  creatureSpeaker,
  actingCreatureSlot,
}) {
  const options = quizData?.options || [];
  if (!options.length) {
    if (ctx.narration?.showNarration) {
      ctx.narration.showNarration(tPlain('befriendFailedGeneric'), { persistent: false });
    }
    resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
    return;
  }

  await showCreatureDialogue({
    speaker: creatureSpeaker,
    prompt: quizData.namePrompt,
    fallbackText: 'Name?',
  });

  const selectedIndex = await renderChoicesAsync({
    heading: 'Choose the creature name',
    clearAfterSelect: false,
    cards: options.map(option => ({ title: option.name || option.nameEn || option.id })),
  });
  const selectedOption = options[selectedIndex];
  if (!selectedOption) {
    resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
    return;
  }

  const answerResult = await submitBefriendNameQuizAnswer(selectedOption.id);
  if (!answerResult || answerResult.error) {
    if (ctx.narration?.showNarration) {
      ctx.narration.showNarration(answerResult?.error || tPlain('befriendFailedGeneric'), { persistent: false });
    }
    resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
    return;
  }

  const correctIndex = options.findIndex(option => option.id === quizData.creatureId || option.id === answerResult.capturedId);
  showAnswerFeedback(selectedIndex, correctIndex, answerResult.correct);
  await ctx.delay(800);
  if (ctx.narration.forceHideNarration) ctx.narration.forceHideNarration();

  if (!answerResult.correct) {
    await showCreatureDialogue({
      speaker: creatureSpeaker,
      prompt: quizData.wrongPrompt,
      fallbackText: '???',
    });

    await showBefriendEnemyAttacksAnimated(
      answerResult.enemyAttacks || answerResult.counterAttack,
      answerResult.allies || ctx.getGameState()?.combat?.allies || []
    );

    if (answerResult.state) {
      ctx.updateGameState(answerResult.state);
    } else if (answerResult.allies || answerResult.enemies) {
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
      }
    }
    ctx.updateUI();

    if (answerResult.combatEnded) {
      ctx.stopCombatLoop({ combatEnded: true, victory: false });
      return;
    }

    resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
    return;
  }

  playSFX('creature-skill');
  await showCreatureDialogue({
    speaker: creatureSpeaker,
    prompt: quizData.successPrompt,
    fallbackText: 'Friends!',
  });

  const capturedIndex = answerResult.capturedIndex ?? quizData.targetIndex;
  const capturedId = answerResult.capturedId ?? quizData.creatureId;
  const slot = (typeof capturedIndex === 'number'
    ? document.querySelector(`#enemy-formation .formation-slot[data-index="${capturedIndex}"]`)
    : null) || (capturedId
    ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${capturedId}"]`)
    : null);
  if (slot) slot.classList.add('befriended');

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

  if (answerResult.combatEnded) {
    ctx.stopCombatLoop({ combatEnded: true, victory: answerResult.victory || false });
    return;
  }

  ctx.startMoveSelection();
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
        const creatureName = buildCreatureSpeaker(alive[0], 'Creature').name || 'Creature';

        await showNpcDialogueCard({
          ...dialogueOptionsForCreatureSpeaker(buildCreatureSpeaker(alive[0], 'Creature')),
          text: `${creatureName} refused to talk!`,
        });
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
  const creatureSpeaker = buildCreatureSpeaker({
    id: quizData.creatureId,
    name: quizData.creatureName,
    reading: quizData.creatureReading,
  });

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

  // Show "まって!!" dialogue (creature calls out first)
  await showCreatureDialogue({
    speaker: creatureSpeaker,
    prompt: quizData.waitPrompt,
    fallbackText: 'まって！！',
  });

  // Show Fight / Talk choice (cards render immediately)
  const choicePromise = renderChoicesAsync({
    heading: 'Choose an action',
    cards: simpleChoiceCards(['たたかう (Fight)', 'はなす (Talk)']),
  });

  // Tutorial step 1: lock to Talk with glow, then Cid encourages befriending
  const tutorialStep = ctx.getGameState()?.meta?.tutorialStep;
  if (tutorialStep === 1) {
    const btns = document.querySelectorAll('#action-area .ui-choice');
    if (btns[0]) btns[0].classList.add('tutorial-dimmed');   // Fight — faded, unclickable
    if (btns[1]) btns[1].classList.add('tutorial-highlight'); // Talk — gold glow
    const cidSprite = npcSpriteUrl('cid');

    // Explicit scene API (replaces the former showNpcInDisplay({ skipPixi })
    // side-effect chain which assumed hideFormation('enemy') would also
    // hide the Pixi enemy sprite — it doesn't since the PR2 refactor).
    // Pause fades the enemy formation container; Cid slides in without
    // overlapping the tetsu sprite.
    const pauseScene = getSceneManager()?.currentScene;
    if (pauseScene && !pauseScene.disposed && !pauseScene._exiting && pauseScene.layers?.npcs) {
      await pauseScene.pauseForNpcInterjection({ fadeEnemies: true });
      await pauseScene.showNpcSprite(cidSprite, { slideIn: true });
    } else {
      console.error('[befriend] tutorial step 1: no scene with npcs layer — Cid will not render');
    }

    // Keep the DOM side of the NPC info pill in sync (name label, etc.).
    // skipPixi: true because we just drove the Pixi side explicitly above.
    showNpcInDisplay('Cid', cidSprite, { skipPixi: true });

    for (const line of getTutorialNarration(1)) {
      await ctx.narration.showNarration(line, { speaker: 'Cid' });
    }

    const slideOutScene = getSceneManager()?.currentScene;
    if (slideOutScene && !slideOutScene.disposed && !slideOutScene._exiting) {
      if (slideOutScene.npcSprite) {
        await slideOutScene.hideNpcSprite({ slideOut: true });
      }
      await slideOutScene.resumeFromNpcInterjection();
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

  await executeBefriendAction(null, {
    nameQuizFallback: {
      quizData,
      creatureSpeaker,
    }
  });
  return;
}

/**
 * Execute befriend action: 3-round conversation to capture low-HP enemy creature.
 * @param {number|null} actingCreatureSlot - Party index that spent their turn on はなす; null = flash-card path.
 */
export async function executeBefriendAction(actingCreatureSlot = null, options = {}) {
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
      if (isNameQuizFallbackResult(convoResult)) {
        const fallback = options.nameQuizFallback || {};
        const quizData = buildFallbackNameQuizData(fallback.quizData, convoResult);
        await runBefriendNameQuizFallback({
          quizData,
          creatureSpeaker: fallback.creatureSpeaker || buildCreatureSpeaker(quizData, 'Creature'),
          actingCreatureSlot,
        });
        return;
      }

      if (!convoResult || convoResult.error) {
        if (options.nameQuizFallback && isAiDialogueUnavailableResult(convoResult)) {
          await runBefriendNameQuizFallback({
            quizData: options.nameQuizFallback.quizData,
            creatureSpeaker: options.nameQuizFallback.creatureSpeaker,
            actingCreatureSlot,
          });
          return;
        }

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
    const creatureSpeaker = buildCreatureSpeaker(targetEnemy, 'Creature');
    const creatureName = creatureSpeaker.name || 'Creature';

    // 3-round conversation loop
    for (let i = 0; i < rounds.length; i++) {
      // Play creature speaker line audio if available (fire-and-forget)
      const speakerAudio = rounds[i].speaker?.audio;
      if (speakerAudio?.key && speakerAudio?.userId) {
        playDialogueAudio(speakerAudio.userId, speakerAudio.key);
      } else if (rounds[i].speakerTts && convoUserId) {
        playDialogueAudio(convoUserId, rounds[i].speakerTts);
      }
      const selectedIndex = await showConversationRound(
        { ...rounds[i], userId: convoUserId },
        creatureSpeaker
      );
      // Play selected option audio if available (fire-and-forget)
      const optionAudio = rounds[i].options?.[selectedIndex]?.audio;
      if (optionAudio?.key && optionAudio?.userId) {
        playDialogueAudio(optionAudio.userId, optionAudio.key);
      } else if (rounds[i].optionsTts?.[selectedIndex] && convoUserId) {
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
        await showNpcDialogueCard({ ...dialogueOptionsForCreatureSpeaker(creatureSpeaker), text: '？？？' });

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
        await showNpcDialogueCard({
          ...dialogueOptionsForCreatureSpeaker(creatureSpeaker),
          text: '\u3058\u3083\u3042\u3001\u53cb\u9054\u306b\u306a\u308d\u3046\uff01',
        });

        if (captured?.id || typeof targetEnemyIndex === 'number') {
          const slot = (typeof targetEnemyIndex === 'number'
            ? document.querySelector(`#enemy-formation .formation-slot[data-index="${targetEnemyIndex}"]`)
            : null) || (captured?.id
            ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${captured.id}"]`)
            : null);
          if (slot) slot.classList.add('befriended');
        }

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

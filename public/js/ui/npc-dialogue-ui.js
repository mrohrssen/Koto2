/**
 * NPC dialogue UI — extracted from combat-loop.js (Strangler Fig).
 * Handles post-combat NPC greetings, conversation rounds, and bond feedback.
 */

import { renderEnFirst } from './bootstrap-client.js';
import { playDialogueAudio } from '../tts.js';
import { renderChoicesAsync } from './ui-components.js';
import { showNpcDialogueCard } from './npc-dialogue-card.js';

// Coordinator deps (set via init)
let ctx = null;

let npcDialogueActive = false;

/**
 * Initialize with coordinator callbacks.
 * @param {Object} deps
 */
export function init(deps) {
  ctx = deps;
}

export async function showNpcGreeting(npcData) {
  if (!npcData?.greeting) return;
  const npcSpeaker = dialogueSpeakerForNpc(npcData);
  if (ctx.showNpcSprite) ctx.showNpcSprite(npcSpeaker.speaker, npcData.id, npcData);
  await showNpcDialogueCard(taggedDialogueOptions({
    ...npcSpeaker,
    html: renderEnFirst(npcData.greeting),
    audio: npcData.greetingTts && npcData.userId ? { userId: npcData.userId, key: npcData.greetingTts } : null,
  }));
  if (ctx.hideNpcSprite) ctx.hideNpcSprite();
  if (ctx.updateUI) ctx.updateUI();
}

export function isNpcDialogueActive() { return npcDialogueActive; }

function dialogueSpeakerForNpc(npc = {}) {
  return {
    speaker: npc.nameEn || npc.name || '',
    ...(npc.id ? { speakerId: npc.id } : {}),
  };
}

function taggedDialogueOptions({ speaker, speakerId, html, audio }) {
  return {
    speaker,
    ...(speakerId ? { speakerId } : {}),
    html,
    ...(audio ? { audio } : {}),
  };
}

function tokenDialogueOptions({ speaker, speakerId, line, useKanji, audio }) {
  return {
    speaker,
    ...(speakerId ? { speakerId } : {}),
    tokens: line?.tokens || [],
    overrides: line?.overrides || {},
    useKanji: !!useKanji,
    ...(audio ? { audio } : {}),
  };
}

/**
 * Run the full NPC post-combat dialogue flow.
 * Called from combat victory and also from updateScene() on page reload recovery.
 */
export async function runNpcDialogue() {
  if (npcDialogueActive) return;
  if (!ctx.apiStartNpcDialogue) return;
  npcDialogueActive = true;

  try {
    const dialogueData = await ctx.apiStartNpcDialogue();
    if (!dialogueData) return;

    if (dialogueData.mode === 'defeat_line') {
      const { npc, line } = dialogueData;
      const npcSpeaker = dialogueSpeakerForNpc(npc);

      if (ctx.showNpcSprite) ctx.showNpcSprite(npcSpeaker.speaker, npc.id, npc);

      await showNpcDialogueCard(tokenDialogueOptions({
        ...npcSpeaker,
        line,
        useKanji: dialogueData.useKanji,
        audio: line?.audio,
      }));
    } else {
      const { npc, freed, rounds, userId, freedTts } = dialogueData;
      const npcSpeaker = dialogueSpeakerForNpc(npc);

      if (ctx.showNpcSprite) ctx.showNpcSprite(npcSpeaker.speaker, npc.id, npc);

      await showNpcDialogueCard(taggedDialogueOptions({
        ...npcSpeaker,
        html: renderEnFirst(freed),
        audio: freedTts && userId ? { userId, key: freedTts } : null,
      }));

      let totalDelta = 0;

      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];

        await showNpcDialogueCard(taggedDialogueOptions({
          ...npcSpeaker,
          html: renderEnFirst(round.npcLine),
          audio: round.npcLineTts && userId ? { userId, key: round.npcLineTts } : null,
        }));

        const selectedIndex = await renderChoicesAsync({
          heading: 'Choose a response',
          cards: round.options.map(o => ({
            title: renderEnFirst(typeof o === 'string' ? o : o.text),
          })),
        });

        if (round.options[selectedIndex]?.tts && userId) {
          playDialogueAudio(userId, round.options[selectedIndex].tts);
        }

        const result = await ctx.apiRespondNpcDialogue(i, selectedIndex);
        if (!result) break;

        if (result.dialogueComplete) {
          totalDelta = result.totalDelta;
          if (result.state) {
            ctx.updateGameState(result.state);
          }
          break;
        }
      }

      if (ctx.hideNpcSprite) ctx.hideNpcSprite();

      showBondSummary(npcSpeaker.speaker, totalDelta);
      await ctx.delay(2200);
      document.querySelector('.bond-summary')?.remove();
    }
  } finally {
    npcDialogueActive = false;
  }
}

function showBondSummary(npcName, totalDelta) {
  const el = document.createElement('div');
  el.className = 'bond-summary';

  const sign = totalDelta > 0 ? '+' : '';
  const cls = totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral';

  el.innerHTML = `${npcName}\u3068\u306E\u7D46 <span class="bond-value ${cls}">${sign}${totalDelta}</span>`;
  document.body.appendChild(el);
}

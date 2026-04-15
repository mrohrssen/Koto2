/**
 * NPC dialogue UI — extracted from combat-loop.js (Strangler Fig).
 * Handles post-combat NPC greetings, conversation rounds, and bond feedback.
 */

import { renderJpSentence, renderEnFirst, getKnownWords } from './bootstrap-client.js';
import { playDialogueAudio } from '../tts.js';
import { renderButtonsAsync } from './ui-components.js';

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
  const npcName = npcData.nameEn || npcData.name;
  if (ctx.showNpcSprite) ctx.showNpcSprite(npcName, npcData.id, npcData);
  if (npcData.greetingTts && npcData.userId) {
    playDialogueAudio(npcData.userId, npcData.greetingTts);
  }
  await ctx.narration.showNarration(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  if (ctx.hideNpcSprite) ctx.hideNpcSprite();
  if (ctx.updateUI) ctx.updateUI();
}

export function isNpcDialogueActive() { return npcDialogueActive; }

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
      const npcName = npc.nameEn || npc.name;

      if (ctx.showNpcSprite) ctx.showNpcSprite(npcName, npc.id, npc);

      const html = renderJpSentence(line.tokens, getKnownWords(), new Map(), line.overrides || {}, dialogueData.useKanji || false);
      await ctx.narration.showNarration(html, { speaker: npcName, html: true });
    } else {
      const { npc, freed, rounds, userId, freedTts } = dialogueData;
      const npcName = npc.nameEn || npc.name;

      if (ctx.showNpcSprite) ctx.showNpcSprite(npcName, npc.id, npc);

      if (freedTts && userId) {
        playDialogueAudio(userId, freedTts);
      }
      await ctx.narration.showNarration(renderEnFirst(freed), { speaker: npcName, html: true });

      let totalDelta = 0;

      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];

        if (round.npcLineTts && userId) {
          playDialogueAudio(userId, round.npcLineTts);
        }
        await ctx.narration.showNarration(renderEnFirst(round.npcLine), { speaker: npcName, persistent: true, html: true });

        const selectedIndex = await renderButtonsAsync(
          round.options.map(o => ({
            label: renderEnFirst(typeof o === 'string' ? o : o.text),
          }))
        );

        if (round.options[selectedIndex]?.tts && userId) {
          playDialogueAudio(userId, round.options[selectedIndex].tts);
        }

        if (ctx.narration.forceHideNarration) ctx.narration.forceHideNarration();

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

      showBondSummary(npcName, totalDelta);
      await ctx.delay(2200);
      document.querySelector('.bond-summary')?.remove();
    }
  } finally {
    npcDialogueActive = false;
  }
}

function showBondFeedback(tone, delta) {
  const existing = document.querySelector('.bond-feedback');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `bond-feedback ${tone}`;

  const heart = tone === 'positive' ? '\u2764\uFE0F' : tone === 'negative' ? '\uD83D\uDC94' : '\uD83E\uDD0D';
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '';

  el.innerHTML = `${heart}${deltaText ? `<span class="bond-delta">${deltaText}</span>` : ''}`;

  const sceneArea = document.getElementById('scene-area') || document.querySelector('.scene-area');
  if (sceneArea) {
    sceneArea.appendChild(el);
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

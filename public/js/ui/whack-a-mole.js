import { animate as anime } from 'animejs';
import { toRomaji } from './romaji.js';
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import * as narrationBox from './narration-box.js';
import { showXpPopup as pixiXpPopup, showLevelUpPopup as pixiLevelUpPopup } from '../pixi/text.js';
import { animateLevelUpForScene } from '../pixi/formation.js';
import { spritePos } from './combat-vfx.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { playRoomTransition } from './room-transition.js';

export class WhackAMoleGame {
  /**
   * @param {Array} pool - Array of { id, word, reading, sprite } objects (min 9)
   * @param {Object} deps - Injected dependencies from the exploration module
   * @param {Object} deps.actions - Actions module with setContent()
   * @param {Function} deps.apiCompleteWhackAMole - API call to save score
   * @param {Function} deps.apiProceed - API call to advance to the next room
   * @param {Function} deps.updateGameState - Callback to update game state
   * @param {Function} deps.updateUI - Callback to re-render the main UI
   * @param {Function} deps.playSFX - Sound effect player (optional, errors swallowed)
   */
  constructor(pool, deps) {
    this.pool = pool;
    this.actions = deps.actions;
    this.apiCompleteWhackAMole = deps.apiCompleteWhackAMole;
    this.apiProceed = deps.apiProceed;
    this.updateGameState = deps.updateGameState;
    this.updateUI = deps.updateUI;
    this.playSFX = deps.playSFX;

    // Game state
    this.score = 0;
    this.timeLeft = 12.0;
    this.targetIndex = 0;
    this.tiles = Array(9).fill(null).map(() => ({ faceUp: false, poolIndex: -1 }));
    this.gameOver = false;
    this.flipTimeout = null;
    this.timerInterval = null;
    this.wordTimeLeft = 5.0;
    this.WORD_TIME_LIMIT = 5.0;
  }

  /** Entry point -- call after constructing to kick off the game. */
  start() {
    // Pick initial target
    this.targetIndex = Math.floor(Math.random() * this.pool.length);

    // Render the board
    this._renderGameUI();

    // Set up initial board: 4-5 face-up tiles
    const initialUp = 4 + Math.floor(Math.random() * 2);
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);

    // First, place the correct answer
    this._setTileFaceUp(indices[0], this.targetIndex);

    // Then fill remaining initial tiles with distractors
    for (let i = 1; i < initialUp; i++) {
      this._setTileFaceUp(indices[i], this._randomDistractorIndex());
    }

    // Start flip scheduling (random interval 1-2s)
    this._scheduleFlip();

    // Start timer countdown (update every 100ms for smooth display)
    this.timerInterval = setInterval(() => {
      if (this.gameOver) return;
      this.timeLeft -= 0.1;
      this.wordTimeLeft -= 0.1;
      this._updateTimerDisplay();
      this._updateWordTimerBar();

      if (this.wordTimeLeft <= 0) {
        this._advanceToNextWord();
      }

      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._endGame();
      }
    }, 100);
  }

  // ---- Private methods ----

  _formatTime(t) {
    const secs = Math.max(0, Math.ceil(t));
    return secs.toString().padStart(2, '0');
  }

  _renderGameUI() {
    const target = this.pool[this.targetIndex];
    this.actions.setContent(`
      <div class="wam-container">
        <div class="wam-hud">
          <div class="wam-score">\u2605 ${this.score}</div>
          <div class="wam-timer" id="wam-timer">${this._formatTime(this.timeLeft)}</div>
        </div>
        <div class="wam-word-card">
          <div class="wam-word-kanji">${target.reading}</div>
          <div class="wam-word-reading">${toRomaji(target.reading)}</div>
          <div class="wam-word-timer-bar"><div class="wam-word-timer-fill" id="wam-word-timer-fill"></div></div>
        </div>
        <div class="wam-grid" id="wam-grid">
          ${this.tiles.map((_, i) => `
            <div class="wam-tile" data-index="${i}">
              <div class="wam-tile-inner">
                <div class="wam-tile-front"></div>
                <div class="wam-tile-back">
                  <img class="wam-tile-img" src="" alt="" />
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // Bind click handlers
    document.querySelectorAll('.wam-tile').forEach(tile => {
      tile.addEventListener('click', () => this._handleTileTap(parseInt(tile.dataset.index)));
    });
  }

  _updateTimerDisplay() {
    const el = document.getElementById('wam-timer');
    if (!el) return;
    const secs = Math.max(0, Math.ceil(this.timeLeft));
    el.textContent = secs.toString().padStart(2, '0');
    el.classList.toggle('wam-timer-warn', this.timeLeft <= 6 && this.timeLeft > 3);
    el.classList.toggle('wam-timer-danger', this.timeLeft <= 3);
  }

  _updateWordCard() {
    const target = this.pool[this.targetIndex];
    const kanji = document.querySelector('.wam-word-kanji');
    const reading = document.querySelector('.wam-word-reading');
    if (kanji) kanji.textContent = target.reading;
    if (reading) reading.textContent = toRomaji(target.reading);
  }

  _updateScoreDisplay() {
    const el = document.querySelector('.wam-score');
    if (el) el.textContent = `\u2605 ${this.score}`;
  }

  _updateWordTimerBar() {
    const fill = document.getElementById('wam-word-timer-fill');
    if (!fill) return;
    const pct = Math.max(0, (this.wordTimeLeft / this.WORD_TIME_LIMIT) * 100);
    fill.style.width = pct + '%';
    fill.classList.toggle('wam-word-timer-warn', this.wordTimeLeft <= 2);
  }

  _setTileFaceUp(index, poolIdx) {
    this.tiles[index] = { faceUp: true, poolIndex: poolIdx };
    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);
    if (!tileEl) return;
    tileEl.classList.add('wam-flipped');
    const backEl = tileEl.querySelector('.wam-tile-back');
    if (!backEl) return;

    // Remove any previous text-sprite fallback
    const oldText = backEl.querySelector('.text-sprite');
    if (oldText) oldText.remove();

    const img = backEl.querySelector('.wam-tile-img');
    const item = this.pool[poolIdx];
    if (img) {
      img.style.display = '';
      img.src = item.sprite;
      img.onerror = () => {
        // Fallback to kanji text sprite when image missing
        img.style.display = 'none';
        const div = document.createElement('div');
        div.className = 'text-sprite' + (item.element ? ` ${item.element}` : '');
        div.textContent = item.word || '\uFF1F';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.fontSize = '2rem';
        backEl.appendChild(div);
      };
    }
    anime(tileEl, {
      scale: [0.8, 1],
      opacity: [0.5, 1],
    }, {
      duration: 250,
      ease: 'out(3)',
    });
  }

  _setTileFaceDown(index) {
    this.tiles[index] = { faceUp: false, poolIndex: -1 };
    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);
    if (!tileEl) return;
    tileEl.classList.remove('wam-flipped');
  }

  _isCorrectTile(index) {
    const tile = this.tiles[index];
    if (!tile.faceUp || tile.poolIndex < 0) return false;
    return this.pool[tile.poolIndex].id === this.pool[this.targetIndex].id;
  }

  _randomDistractorIndex() {
    const targetId = this.pool[this.targetIndex].id;
    let idx;
    do {
      idx = Math.floor(Math.random() * this.pool.length);
    } while (this.pool[idx].id === targetId);
    return idx;
  }

  _ensureCorrectTileVisible() {
    // Check if any face-up tile already shows the target
    for (let i = 0; i < 9; i++) {
      if (this._isCorrectTile(i)) return; // already visible
    }
    // No correct tile visible -- flip one up
    const candidates = [];
    for (let i = 0; i < 9; i++) candidates.push(i);
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const downTile = shuffled.find(i => !this.tiles[i].faceUp);
    const pick = downTile !== undefined ? downTile : shuffled[0];
    this._setTileFaceUp(pick, this.targetIndex);
  }

  _flipEvent() {
    if (this.gameOver) return;

    const faceUpCount = this.tiles.filter(t => t.faceUp).length;
    const faceDownCount = 9 - faceUpCount;

    // Bias: try to keep 4-5 face up
    let shouldFlipUp;
    if (faceUpCount <= 3) shouldFlipUp = true;
    else if (faceUpCount >= 7) shouldFlipUp = false;
    else shouldFlipUp = Math.random() < 0.5;

    if (shouldFlipUp && faceDownCount > 0) {
      const downIndices = this.tiles.map((t, i) => (!t.faceUp ? i : -1)).filter(i => i >= 0);
      const pick = downIndices[Math.floor(Math.random() * downIndices.length)];
      this._setTileFaceUp(pick, this._randomDistractorIndex());
    } else if (!shouldFlipUp && faceUpCount > 1) {
      const upIndices = this.tiles.map((t, i) => (t.faceUp && !this._isCorrectTile(i) ? i : -1)).filter(i => i >= 0);
      if (upIndices.length > 0) {
        const pick = upIndices[Math.floor(Math.random() * upIndices.length)];
        this._setTileFaceDown(pick);
      }
    }

    this._ensureCorrectTileVisible();
  }

  _handleTileTap(index) {
    if (this.gameOver) return;
    const tile = this.tiles[index];
    if (!tile.faceUp) return;

    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);

    if (this._isCorrectTile(index)) {
      // HIT
      this.score++;
      this._updateScoreDisplay();

      // Non-blocking celebration
      if (tileEl) {
        tileEl.classList.add('wam-hit');
        const plus = document.createElement('div');
        plus.className = 'wam-plus-one';
        plus.textContent = '+1';
        tileEl.appendChild(plus);
        anime(tileEl, {
          scale: [1, 1.2, 1],
          rotate: [0, 8, 0],
        }, {
          duration: 400,
          ease: 'out(3)',
          onComplete: () => {
            tileEl.classList.remove('wam-hit');
            plus.remove();
          }
        });
      }

      this._advanceToNextWord();
      try { this.playSFX('correct'); } catch (e) { /* sfx optional */ }
    } else {
      // MISS
      this.timeLeft = Math.max(0, this.timeLeft - 3);
      this._updateTimerDisplay();

      if (tileEl) {
        tileEl.classList.add('wam-miss');
        anime(tileEl, {
          translateX: [-6, 6, -4, 4, 0],
        }, {
          duration: 300,
          ease: 'inOut(2)',
          onComplete: () => tileEl.classList.remove('wam-miss')
        });
      }
      try { this.playSFX('wrong'); } catch (e) { /* sfx optional */ }

      if (this.timeLeft <= 0) this._endGame();
    }
  }

  _advanceToNextWord() {
    // Pick the next target from tiles already face-up on the board.
    // This prevents the tell where the newly-flipped tile is always the answer.
    const faceUpEntries = this.tiles
      .map((t, i) => ({ tile: t, index: i }))
      .filter(e => e.tile.faceUp && e.tile.poolIndex >= 0 && e.tile.poolIndex !== this.targetIndex);

    if (faceUpEntries.length > 0) {
      const pick = faceUpEntries[Math.floor(Math.random() * faceUpEntries.length)];
      this.targetIndex = pick.tile.poolIndex;
    } else {
      // Fallback: pick random (shouldn't happen — board always has 4-5 tiles)
      const oldTarget = this.targetIndex;
      do {
        this.targetIndex = Math.floor(Math.random() * this.pool.length);
      } while (this.targetIndex === oldTarget && this.pool.length > 1);
      this._ensureCorrectTileVisible();
    }

    this.wordTimeLeft = this.WORD_TIME_LIMIT;
    this._updateWordCard();
    this._updateWordTimerBar();
  }

  async _endGame() {
    this.gameOver = true;
    clearTimeout(this.flipTimeout);
    clearInterval(this.timerInterval);

    let xpGrants = [];
    let levelUps = [];
    let finishDialogue = null;
    try {
      const result = await this.apiCompleteWhackAMole(this.score);
      if (result?.state) this.updateGameState(result.state);
      xpGrants = result?.xpGrants || [];
      levelUps = result?.levelUps || [];
      finishDialogue = result?.finishDialogue || null;
    } catch (err) {
      // Network failure - still tear down the overlay and attempt to proceed below.
    }

    // Tear down fullscreen .wam-container so the ExplorationScene is visible.
    this.actions.setContent('');

    // Narration 1: GM i+1 line (skip when no tokens - backend fallback path).
    if (finishDialogue?.tokens?.length) {
      const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
      const html = renderJpSentence(finishDialogue.tokens, getKnownWords(), wordDict, {}, false);
      await narrationBox.show(html, { html: true, speaker: 'Game Master' });
    }

    // Narration 2: system XP line + sprite popups over the player formation.
    const perCreatureXp = xpGrants[0]?.xp ?? 0;

    if (perCreatureXp > 0) {
      const activeParty = window.gameState?.run?.creatureParty?.active || [];
      for (const grant of xpGrants) {
        const index = activeParty.findIndex(c => c && c.id === grant.creatureId);
        if (index < 0) continue;
        const pos = spritePos('player', index);
        if (pos) pixiXpPopup(grant.xp, pos);
      }
      for (const lu of levelUps) {
        const index = activeParty.findIndex(c => c && c.id === lu.creatureId);
        if (index < 0) continue;
        const pos = spritePos('player', index);
        if (pos) setTimeout(() => pixiLevelUpPopup(lu.newLevel, pos), 400);
        setTimeout(() => animateLevelUpForScene(getSceneManager().currentScene, 'player', index), 400);
      }
    }

    const xpLine = perCreatureXp > 0
      ? `Your team gained ${perCreatureXp} XP!`
      : `Your team gained 0 XP. Better luck next time!`;
    await narrationBox.show(xpLine, { html: true });

    // Advance to the next room via the standard exploration path.
    try {
      const advanced = await this.apiProceed();
      if (advanced?.state) {
        this.updateGameState(advanced.state);
        await playRoomTransition(advanced.state);
      }
    } catch (err) {
      // Fall through to updateUI - the next-room state may already be applied server-side.
    }
    this.updateUI();
  }

  _scheduleFlip() {
    if (this.gameOver) return;
    const delay = 1000 + Math.random() * 1000;
    this.flipTimeout = setTimeout(() => {
      this._flipEvent();
      this._scheduleFlip();
    }, delay);
  }
}

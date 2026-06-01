import { randomUUID } from 'crypto';
import { createCombatState, createNewRun } from '../state.js';
import { AREAS } from '../rooms.js';
import { createPveOpeningCursor } from '../combat/action-cursor.js';
import {
  generateEnemyCreature,
  generateEnemyCreatures,
  getEnemyLevel,
  instantiateCreatureForCombat
} from '../creatures.js';
import { getCrestMultipliers, applyCrestBonuses } from './crest-service.js';
import {
  DAILY_NEW_LIMIT,
  getActiveScriptType,
  getDueScriptCards,
  getNewScriptCards,
  getScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  markScriptDailyComplete,
  recordScriptIntro,
} from '../script-srs.js';

export function getLocalDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA');
}

export function rollIntroInterval(random = Math.random) {
  return 3 + Math.floor(random() * 3);
}

export function createInitialKanjiKombatState({ localDate = getLocalDateKey(), random = Math.random } = {}) {
  return {
    wave: 1,
    streak: 0,
    highestStreak: 0,
    reviewsSinceIntro: 0,
    nextIntroAfter: rollIntroInterval(random),
    localDate,
    currentQuiz: null,
    pendingIntro: null,
    report: {
      wavesCleared: 0,
      minibossesDefeated: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      cardsReviewed: 0,
      newCardsIntroduced: 0,
      scriptDeck: null,
      completedDaily: false,
    },
  };
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQuizForCard(card, answerPool, random = Math.random) {
  const distractors = shuffle(
    answerPool.filter(candidate => candidate.id !== card.id && candidate.answer !== card.answer),
    random
  ).slice(0, 3);

  if (distractors.length < 3) {
    throw new Error(`Not enough distinct answers for script quiz: ${card.type}`);
  }

  const choices = shuffle([
    { id: randomUUID(), answer: card.answer, correct: true },
    ...distractors.map(candidate => ({ id: randomUUID(), answer: candidate.answer, correct: false })),
  ], random);

  return {
    cardId: card.id,
    type: card.type,
    prompt: card.prompt,
    reading: card.reading,
    keyword: card.keyword,
    choices,
  };
}

function excludeCards(cards, excludedIds = []) {
  const excluded = new Set(excludedIds);
  return cards.filter(card => !excluded.has(card.id));
}

export function chooseNextScriptWork(userId, state, opts = {}) {
  const now = opts.now || new Date();
  const random = opts.random || Math.random;
  const excludedIds = opts.excludeCardIds || [];
  const activeType = getActiveScriptType(userId);
  state.report.scriptDeck = activeType;

  const daily = getScriptDailyState(userId, state.localDate);
  const dueCards = excludeCards(getDueScriptCards(userId, activeType, now), excludedIds);
  const newCards = excludeCards(getNewScriptCards(userId, activeType), excludedIds);
  const canIntroduce = daily.introducedCount < DAILY_NEW_LIMIT && newCards.length > 0;

  if (dueCards.length > 0 && state.reviewsSinceIntro >= state.nextIntroAfter && canIntroduce) {
    const card = newCards[0];
    state.currentQuiz = null;
    state.pendingIntro = { cardId: card.id };
    return { kind: 'intro', card };
  }

  if (dueCards.length > 0) {
    const card = dueCards[0];
    const quiz = buildQuizForCard(card, getScriptCards(userId, activeType), random);
    state.currentQuiz = quiz;
    state.pendingIntro = null;
    return { kind: 'quiz', card, quiz };
  }

  if (canIntroduce) {
    const card = newCards[0];
    state.currentQuiz = null;
    state.pendingIntro = { cardId: card.id };
    return { kind: 'intro', card };
  }

  markScriptDailyComplete(userId, state.localDate);
  state.currentQuiz = null;
  state.pendingIntro = null;
  state.report.completedDaily = true;
  return { kind: 'complete' };
}

export function resolveIntroChoice(userId, state, cardId, choice, opts = {}) {
  const grade = choice === 'known' ? 'good' : 'again';
  const graded = gradeScriptCard(userId, cardId, grade);
  recordScriptIntro(userId, state.localDate);
  state.pendingIntro = null;
  state.report.newCardsIntroduced += 1;
  const next = chooseNextScriptWork(userId, state, {
    ...opts,
    excludeCardIds: [...(opts.excludeCardIds || []), cardId],
  });
  return { graded, next };
}

function cloneCreature(creature) {
  return JSON.parse(JSON.stringify(creature));
}

function cloneCombatants(combatants = []) {
  return JSON.parse(JSON.stringify(combatants || []));
}

function healAll(allies, percent) {
  for (const ally of allies || []) {
    if (!ally || ally.hp <= 0) continue;
    ally.hp = Math.min(ally.maxHp, ally.hp + Math.ceil(ally.maxHp * percent));
  }
}

export class KanjiKombatService {
  constructor(gm) {
    this.gm = gm;
  }

  startRunWithCreature(creature) {
    this.gm.run = createNewRun(this.gm.player);
    const crestMults = getCrestMultipliers(this.gm.meta);
    this.gm.run.crestMults = crestMults;
    this.gm.run.itemBuffs.xpMultiplier = crestMults.xpMult;
    this.gm.run.mode = 'kanjiKombat';
    this.gm.run.areaSelectionRequired = false;
    this.gm.run.initialSkillPick.chosenId = 'kanjiKombat';
    this.gm.run.creatureParty.active = [cloneCreature(creature)];
    this.gm.run.creatureParty.reserves = [];
    this.gm.run.creatureParty.maxTotal = 3;
    for (const ally of this.gm.run.creatureParty.active) {
      applyCrestBonuses(ally, crestMults);
    }
    this.gm.run.kanjiKombat = createInitialKanjiKombatState();
    const work = chooseNextScriptWork(this.gm.userId, this.gm.run.kanjiKombat);
    if (work.kind === 'complete') {
      throw new Error('Kanji Kombat is complete for the day');
    }
    this.gm.run.kanjiKombat.currentQuiz = work.quiz || null;
    this.gm.run.kanjiKombat.pendingIntro = work.kind === 'intro'
      ? { cardId: work.card.id, card: work.card }
      : null;
    this.spawnNextWave();
    this.gm.emitState();
    return this.gm.run.kanjiKombat;
  }

  startRunWithCreatureId(creatureId) {
    const collection = this.gm.meta?.creatureCollection || [];
    if (!collection.includes(creatureId)) {
      throw new Error('Selected creature is not unlocked');
    }
    const starter = instantiateCreatureForCombat(creatureId, 1);
    return this.startRunWithCreature(starter);
  }

  submitIntroChoice(cardId, choice) {
    const state = this.gm.run?.kanjiKombat;
    if (!state) throw new Error('No active Kanji Kombat run');
    return resolveIntroChoice(this.gm.userId, state, cardId, choice);
  }

  submitAnswer(answerId) {
    const kk = this.gm.run?.kanjiKombat;
    const quiz = kk?.currentQuiz;
    if (!quiz) throw new Error('No active Kanji Kombat quiz');
    const choice = quiz.choices.find(option => option.id === answerId);
    if (!choice) throw new Error('Invalid Kanji Kombat answer');

    gradeScriptCard(this.gm.userId, quiz.cardId, choice.correct ? 'good' : 'again');
    if (choice.correct) this.recordCorrectAnswer();
    else this.recordWrongAnswer();

    kk.currentQuiz = null;
    return this.gm.combatCycleService.resolveKanjiKombatCursorAction({
      correct: choice.correct,
      targetIndex: 0,
    });
  }

  getAvailability() {
    const collection = this.gm.meta?.creatureCollection || [];
    if (collection.length === 0) {
      return { available: false, reason: 'no_creatures' };
    }

    const state = createInitialKanjiKombatState();
    const work = chooseNextScriptWork(this.gm.userId, state);
    if (work.kind === 'complete') {
      return {
        available: false,
        reason: 'complete_for_day',
        message: 'Come back later!',
        scriptDeck: state.report.scriptDeck
      };
    }
    return {
      available: true,
      next: work.kind,
      scriptDeck: state.report.scriptDeck
    };
  }

  getUnlockedAreas() {
    const highest = this.gm.meta?.levels?.highestUnlocked || 1;
    return AREAS.filter((_, index) => index < highest);
  }

  buildEnemyPool() {
    const pool = this.getUnlockedAreas().flatMap(area => area.creatures || []);
    return [...new Set(pool)];
  }

  buildBossPool() {
    return this.getUnlockedAreas().map(area => area.bossCreatureId).filter(Boolean);
  }

  spawnNextWave() {
    const kk = this.gm.run.kanjiKombat;
    const wave = kk.wave || 1;
    const isMiniboss = wave % 10 === 0;
    const highestLevel = Math.max(1, ...this.gm.run.creatureParty.active.map(c => c.level || 1));
    const areas = this.getUnlockedAreas();
    const stage = Math.max(1, ...areas.map(area => area.stage || 1));
    let enemies;

    if (isMiniboss && this.buildBossPool().length > 0) {
      const bossIds = this.buildBossPool();
      const bossId = bossIds[Math.floor(Math.random() * bossIds.length)];
      const bossLevel = Math.round(getEnemyLevel({ totalEncounters: wave, enemyCount: 1 }) * 1.25);
      const boss = generateEnemyCreature(Math.max(highestLevel, bossLevel), [bossId], stage);
      boss.hp = boss.maxHp = Math.max(boss.maxHp * 2, boss.hp * 2);
      enemies = [boss];
      kk.currentWaveIsMiniboss = true;
    } else {
      enemies = generateEnemyCreatures(highestLevel, {
        maxEnemies: 3,
        creaturePool: this.buildEnemyPool(),
        stage,
        encounterIndex: wave - 1,
        totalEncounters: wave,
      });
      kk.currentWaveIsMiniboss = false;
    }

    this.gm.combat = createCombatState(enemies[0]);
    this.gm.combat.mode = 'kanjiKombat';
    this.gm.combat.isCreatureCombat = true;
    this.gm.combat.isBoss = kk.currentWaveIsMiniboss;
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this.gm.combat.enemies = enemies;
    this.gm.combat.actionCursor = createPveOpeningCursor({ allies: this.gm.combat.allies, enemies });
    this.gm.combat.actionCount = 0;
    this.gm.combat.cycleCount = 0;
    return enemies;
  }

  recordCorrectAnswer() {
    const kk = this.gm.run.kanjiKombat;
    kk.streak = (kk.streak || 0) + 1;
    kk.highestStreak = Math.max(kk.highestStreak || 0, kk.streak);
    kk.report.correctAnswers += 1;
    kk.report.cardsReviewed += 1;
    kk.reviewsSinceIntro += 1;

    if (kk.streak === 5) healAll(this.gm.run.creatureParty.active, 0.10);
    if (kk.streak === 15) healAll(this.gm.run.creatureParty.active, 0.35);
    if (kk.streak === 20) {
      this.addRandomUnlockedAllyOrFullHeal();
      kk.streak = 0;
      kk.reviewsSinceIntro = 0;
      kk.nextIntroAfter = rollIntroInterval();
    }
  }

  recordWrongAnswer() {
    const kk = this.gm.run.kanjiKombat;
    kk.streak = 0;
    kk.report.wrongAnswers += 1;
    kk.report.cardsReviewed += 1;
  }

  addRandomUnlockedAllyOrFullHeal() {
    const active = this.gm.run.creatureParty.active;
    if (active.length >= 3) {
      healAll(active, 1);
      return null;
    }
    const activeIds = new Set(active.map(c => c.id));
    const candidates = (this.gm.meta?.creatureCollection || []).filter(id => !activeIds.has(id));
    if (candidates.length === 0) {
      healAll(active, 1);
      return null;
    }
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    const ally = generateEnemyCreature(Math.max(1, active[0]?.level || 1), [id]);
    active.push(ally);
    this.gm.combat.allies = active;
    return ally;
  }

  recordWaveClear({ miniboss = false } = {}) {
    const kk = this.gm.run.kanjiKombat;
    kk.report.wavesCleared += 1;
    if (miniboss) kk.report.minibossesDefeated += 1;
    kk.wave = (kk.wave || 1) + 1;
  }

  buildReport() {
    const kk = this.gm.run.kanjiKombat;
    const report = kk.report;
    const total = report.correctAnswers + report.wrongAnswers;
    return {
      ...report,
      highestStreak: kk.highestStreak || 0,
      accuracy: total > 0 ? Math.round((report.correctAnswers / total) * 100) : 0,
      temporaryLevels: this.gm.run.creatureParty.active.map(c => ({
        id: c.id,
        nameEn: c.nameEn,
        level: c.level || 1
      })),
    };
  }

  completeWaveAndMaybeStartNext({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = []
  } = {}) {
    const clearedEnemies = cloneCombatants(this.gm.combat?.enemies || []);
    const wasMiniboss = this.gm.run.kanjiKombat.currentWaveIsMiniboss === true;
    this.recordWaveClear({ miniboss: wasMiniboss });
    const work = chooseNextScriptWork(this.gm.userId, this.gm.run.kanjiKombat);
    if (work.kind === 'complete') {
      this.gm.combat.active = false;
      this.gm.run.active = false;
      this.gm.run.stats.endTime = Date.now();
      this.gm.run.kanjiKombat.report.completedDaily = true;
      this.gm.run.kanjiKombat.finalReport = this.buildReport();
      this.gm.emitState();
      return {
        actionType: 'kanjiKombat',
        actionSegments,
        playerAttacks: flatPlayerAttacks,
        enemyAttacks: flatEnemyAttacks,
        xpEvents,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: true,
        kanjiKombatReport: this.gm.run.kanjiKombat.finalReport,
        creatureParty: this.gm.run.creatureParty,
        enemies: clearedEnemies,
      };
    }

    this.spawnNextWave();
    const nextWaveEnemies = cloneCombatants(this.gm.combat.enemies);
    this.gm.run.kanjiKombat.currentQuiz = work.quiz || null;
    this.gm.run.kanjiKombat.pendingIntro = work.kind === 'intro'
      ? { cardId: work.card.id, card: work.card }
      : null;
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      koSwaps,
      koRemovals,
      combatEnded: false,
      nextWave: true,
      kanjiKombat: this.gm.run.kanjiKombat,
      allies: this.gm.combat.allies,
      enemies: clearedEnemies,
      nextWaveEnemies,
      creatureParty: this.gm.run.creatureParty,
    };
  }

  finalizeDefeat({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = []
  } = {}) {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    this.gm.run.stats.endTime = Date.now();
    this.gm.run.kanjiKombat.finalReport = this.buildReport();
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      koSwaps,
      koRemovals,
      combatEnded: true,
      victory: false,
      kanjiKombatReport: this.gm.run.kanjiKombat.finalReport,
      creatureParty: this.gm.run.creatureParty,
    };
  }
}

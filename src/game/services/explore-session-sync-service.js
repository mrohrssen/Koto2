import {
  getActionLedgerEntry,
  rememberActionLedgerResult,
} from './action-ledger-service.js';
import {
  isExploreSessionActionId,
  makeExploreCorrection,
  makeExploreOk,
} from './explore-session-contract.js';
import { ensureRoomActionSeq } from '../room-reveal-buffer.js';
import { hashTranscript } from '../../shared/action-protocol.js';

function cloneValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function snapshotGameManager(gameManager) {
  return {
    player: cloneValue(gameManager?.player),
    run: cloneValue(gameManager?.run),
    combat: cloneValue(gameManager?.combat),
    meta: cloneValue(gameManager?.meta),
  };
}

function restoreGameManager(gameManager, snapshot) {
  if (!gameManager || !snapshot) return;
  gameManager.player = snapshot.player;
  gameManager.run = snapshot.run;
  gameManager.combat = snapshot.combat;
  gameManager.meta = snapshot.meta;
}

function fingerprintExploreEntry(entry = {}) {
  return hashTranscript({
    actionId: entry.actionId ?? null,
    kind: entry.kind ?? null,
    seq: entry.seq ?? null,
    roomIndex: entry.roomIndex ?? null,
    roomId: entry.roomId ?? null,
    actionSeq: entry.actionSeq ?? null,
    payload: entry.payload ?? null,
    itemId: entry.itemId ?? null,
    targetCreatureIndex: entry.targetCreatureIndex ?? null,
  });
}

function publicReplayResponse(response = {}) {
  const { entryFingerprint: _entryFingerprint, ...publicResponse } = response;
  return publicResponse;
}

export class ExploreSessionSyncService {
  constructor(gameManager, { runwayOpts = {} } = {}) {
    this.gm = gameManager;
    this.runwayOpts = runwayOpts && typeof runwayOpts === 'object' ? runwayOpts : {};
  }

  get run() {
    return this.gm?.run || null;
  }

  get ledgerOwner() {
    return this.gm?.meta || null;
  }

  async responseContext({ mutate = true } = {}) {
    const snapshot = mutate ? null : snapshotGameManager(this.gm);

    try {
      let exploreRunway = null;
      const buildExploreRunway = this.gm?.explorationService?.buildExploreRunway;

      if (typeof buildExploreRunway === 'function') {
        exploreRunway = await buildExploreRunway.call(this.gm.explorationService, this.runwayOpts);
        if (this.gm?.run && exploreRunway) {
          this.gm.run.exploreRunway = exploreRunway;
        }
      }

      const state = typeof this.gm?.getState === 'function' ? this.gm.getState() : null;
      if (!exploreRunway) {
        exploreRunway = state?.run?.exploreRunway || this.gm?.run?.exploreRunway || null;
      }

      const context = { state, exploreRunway };
      return mutate ? context : cloneValue(context);
    } finally {
      if (snapshot) {
        restoreGameManager(this.gm, snapshot);
      }
    }
  }

  validateEntryPosition(entry) {
    const run = this.run;
    if (!run?.active || !Array.isArray(run.rooms)) {
      throw new Error('no_active_explore_run');
    }

    const currentRoomIndex = Number.isInteger(run.currentRoom) ? run.currentRoom : 0;
    const currentRoom = run.rooms[currentRoomIndex] || null;
    if (!currentRoom) {
      throw new Error('no_current_room');
    }

    if (entry?.roomIndex !== currentRoomIndex) {
      throw new Error('room_index_mismatch');
    }

    if (entry?.roomId !== currentRoom.id) {
      throw new Error('room_id_mismatch');
    }

    if (entry?.actionSeq !== ensureRoomActionSeq(run)) {
      throw new Error('action_seq_mismatch');
    }
  }

  applyExploreEntry(entry) {
    this.validateEntryPosition(entry);

    switch (entry?.kind) {
      case 'proceed':
        return this.gm.explorationService.applyExploreProceed();
      case 'encounter.start':
      case 'npcBattle.start':
      case 'boss.start':
        return this.gm.explorationService.applyCombatStart(entry);
      case 'combat.cycle':
        return this.gm.explorationService.applyCombatCycle(entry.payload || {});
      case 'friendlyNpc.choose': {
        const payload = entry.payload || {};
        return this.gm.explorationService.applyFriendlyNpcChoose({
          itemId: payload.itemId ?? entry.itemId,
          targetCreatureIndex: payload.targetCreatureIndex ?? entry.targetCreatureIndex,
        });
      }
      case 'shrine.choose':
        return this.gm.explorationService.applyShrineChoose(entry.payload || {});
      case 'skillMaster.choose':
        return this.gm.explorationService.applySkillMasterChoose(entry.payload || {});
      case 'npcBattleSkill.choose':
        return this.gm.explorationService.applyNpcBattleSkillChoose(entry.payload || {});
      case 'dealer.sell':
        return this.gm.explorationService.applyDealerSell(entry.payload || {});
      case 'dealer.buy':
        return this.gm.explorationService.applyDealerBuy(entry.payload || {});
      case 'dealer.leave':
        return this.gm.explorationService.applyDealerLeave(entry.payload || {});
      case 'whackAMole.complete':
        return this.gm.explorationService.applyWhackAMoleComplete(entry.payload || {});
      case 'whackAMole.skip':
        return this.gm.explorationService.applyWhackAMoleSkip(entry.payload || {});
      case 'campfire.skip':
        return this.gm.explorationService.applyCampfireSkip(entry.payload || {});
      case 'campfire.cook':
        return this.gm.explorationService.applyCampfireCook(entry.payload || {});
      case 'campfire.feed':
        return this.gm.explorationService.applyCampfireFeed(entry.payload || {});
      case 'speedReview.commit':
        return this.gm.explorationService.applySpeedReviewCommit(entry.payload || {});
      case 'speedReview.complete':
        return this.gm.explorationService.applySpeedReviewComplete(entry.payload || {});
      case 'wordDiscovery.review':
        return this.gm.explorationService.applyWordDiscoveryReview(entry.payload || {});
      case 'wordDiscovery.complete':
        return this.gm.explorationService.applyWordDiscoveryComplete(entry.payload || {});
      default:
        throw new Error(`unsupported_explore_entry:${entry?.kind}`);
    }
  }

  async correction({
    reason,
    rejectedSeq = null,
    confirmedThroughSeq = null,
    results = [],
    mutateContext = true,
  } = {}) {
    const { state, exploreRunway } = await this.responseContext({ mutate: mutateContext });
    return makeExploreCorrection({
      reason,
      rejectedSeq,
      confirmedThroughSeq,
      results,
      state,
      exploreRunway,
    });
  }

  async ok({ confirmedThroughSeq = null, results = [] } = {}) {
    const { state, exploreRunway } = await this.responseContext();
    return makeExploreOk({
      confirmedThroughSeq,
      results,
      state,
      exploreRunway,
    });
  }

  async applySessionSync({ sessionEpoch, entries = [] } = {}) {
    const run = this.run;
    const replayEntries = Array.isArray(entries) ? entries : [];

    if (!sessionEpoch || sessionEpoch !== run?.exploreSessionEpoch) {
      return this.correction({
        reason: 'session_epoch_mismatch',
        rejectedSeq: replayEntries[0]?.seq ?? null,
        mutateContext: false,
      });
    }

    const results = [];
    let confirmedThroughSeq = null;

    for (const entry of replayEntries) {
      const validActionId = isExploreSessionActionId(entry?.actionId);
      if (!validActionId) {
        return this.correction({
          reason: 'invalid_explore_action_id',
          rejectedSeq: entry?.seq ?? null,
          confirmedThroughSeq,
          results,
        });
      }

      const entryFingerprint = fingerprintExploreEntry(entry);
      const existing = validActionId
        && this.ledgerOwner
        ? getActionLedgerEntry(this.ledgerOwner, entry.actionId)
        : null;

      if (existing?.response) {
        if (
          existing.actionType !== entry.kind
          || existing.response.entryFingerprint !== entryFingerprint
        ) {
          return this.correction({
            reason: 'action_id_conflict',
            rejectedSeq: entry?.seq ?? null,
            confirmedThroughSeq,
            results,
          });
        }

        results.push({
          ...publicReplayResponse(existing.response),
          seq: entry.seq,
          actionId: entry.actionId,
          replayed: true,
        });
        confirmedThroughSeq = entry.seq;
        continue;
      }

      let committed;
      try {
        committed = this.applyExploreEntry(entry);
      } catch (error) {
        // transcript_mismatch from a combat.cycle replay: the grade was still
        // committed (server owns the authoritative combat result), so confirm the
        // seq and remember a corrected ledger entry — a re-POST of this actionId
        // replays from the ledger instead of re-committing — then stop the batch so
        // the client snaps to authoritative state. Mirrors the KK sync loop.
        if (error?.committed) {
          confirmedThroughSeq = entry?.seq ?? confirmedThroughSeq;
          if (validActionId) {
            rememberActionLedgerResult(this.ledgerOwner, {
              actionId: entry.actionId,
              actionType: entry.kind,
              response: { seq: entry.seq, corrected: true, entryFingerprint },
            });
          }
        }
        return this.correction({
          reason: error?.message || 'explore_entry_failed',
          rejectedSeq: entry?.seq ?? null,
          confirmedThroughSeq,
          results,
        });
      }

      const result = { seq: entry.seq, actionId: entry.actionId, ...committed };
      results.push(result);
      confirmedThroughSeq = entry.seq;

      if (validActionId) {
        rememberActionLedgerResult(this.ledgerOwner, {
          actionId: entry.actionId,
          actionType: entry.kind,
          response: { ...result, entryFingerprint },
        });
      }
    }

    return this.ok({ confirmedThroughSeq, results });
  }
}

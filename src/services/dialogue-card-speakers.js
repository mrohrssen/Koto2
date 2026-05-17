export const PLAYER_BOY_SPEAKER_ID = 11;    // 玄野武宏 ノーマル
export const PLAYER_GIRL_SPEAKER_ID = 2;    // 四国めたん ノーマル
export const CREATURE_SPEAKER_ID = 113;     // あんこもん ノーマル
export const CID_SPEAKER_ID = 20;           // VOICEVOX もち子さん ノーマル

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createDialogueCardSpeakerIdResolver({
  getSettings = () => ({}),
  getNpcSpeakerId = () => null
} = {}) {
  return function getDialogueCardSpeakerId({ speakerKey } = {}) {
    const settings = getSettings?.() || {};
    const gameMasterSpeakerId = finiteNumberOrNull(settings.gameTtsSpeakerId) ?? 13;

    if (speakerKey === 'you') {
      return settings.voiceGender === 'girl'
        ? PLAYER_GIRL_SPEAKER_ID
        : PLAYER_BOY_SPEAKER_ID;
    }
    if (speakerKey === 'cid') return CID_SPEAKER_ID;
    if (speakerKey === 'game-master') return gameMasterSpeakerId;
    if (speakerKey === 'creature') return CREATURE_SPEAKER_ID;

    return finiteNumberOrNull(getNpcSpeakerId?.(speakerKey)) ?? gameMasterSpeakerId;
  };
}

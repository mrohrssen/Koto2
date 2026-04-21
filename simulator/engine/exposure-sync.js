import { extractExposureEntries } from '../../public/js/shared/exposure-extractor.js';
import { entityToToken } from '../../src/game/token-format.js';

export function collectTokenExposures(words, tokens, overrides = {}) {
  if (!Array.isArray(words)) return words;
  words.push(...extractExposureEntries(tokens, new Map(), overrides));
  return words;
}

export function collectEntityExposure(words, entity) {
  if (!Array.isArray(words) || !entity) return words;
  words.push(...extractExposureEntries([entityToToken(entity)], new Map(), {}));
  return words;
}

export function collectAttackExposures(words, attacks) {
  if (!Array.isArray(words) || !Array.isArray(attacks)) return words;

  for (const attack of attacks) {
    if (attack?.attackerBaseWord) {
      collectEntityExposure(words, {
        baseWord: attack.attackerBaseWord,
        baseReading: attack.attackerBaseReading,
        baseMeaning: attack.attackerBaseMeaning
      });
    }

    const skillName = attack?.attackerSkillName || attack?.moveName;
    if (skillName && skillName !== attack?.attackerBaseWord) {
      collectEntityExposure(words, {
        name: skillName,
        reading: attack.attackerSkillReading,
        nameEn: attack.attackerSkillEn || attack.moveNameEn
      });
    }
  }

  return words;
}

export async function syncExposureBatch(simCall, words, context = 'sim exposure sync') {
  if (!Array.isArray(words) || words.length === 0) {
    return { ok: true, skipped: true };
  }

  return simCall('POST', '/api/game/known-words/expose', { words }, context);
}

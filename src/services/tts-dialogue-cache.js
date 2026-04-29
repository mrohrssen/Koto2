import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Per-user WAV cache for NPC and creature dialogue lines.
 *
 * Each user gets a subdirectory under baseDir. Files are named by
 * MD5(speakerId:text) so the same line always maps to the same file.
 */
export class TtsDialogueCache {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  /**
   * Synthesize one line of dialogue and store the WAV.
   * Returns the filename (not the full path).
   * If the file already exists on disk, skips synthesis.
   */
  async synthesizeLine(userId, text, speakerId, synthesizeFn) {
    const userDir = join(this.baseDir, userId);
    mkdirSync(userDir, { recursive: true });

    const filename = hashKey(speakerId, text);
    const filePath = join(userDir, filename);

    if (existsSync(filePath)) return filename;

    const wav = await synthesizeFn(text, speakerId);
    writeFileSync(filePath, wav);
    return filename;
  }

  /**
   * Look up a cached WAV file. Returns Buffer or null.
   */
  lookup(userId, filename) {
    const filePath = join(this.baseDir, userId, filename);
    try {
      return readFileSync(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Delete listed WAV files for a user. Ignores missing files.
   */
  deleteFiles(userId, filenames) {
    for (const filename of filenames) {
      const filePath = join(this.baseDir, userId, filename);
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore missing files
      }
    }
  }

  /**
   * Delete every cached dialogue audio file for a user.
   */
  clearUser(userId) {
    rmSync(join(this.baseDir, userId), { recursive: true, force: true });
  }

  /**
   * Synthesize all lines in a dialogue object.
   * Returns a deep copy of the dialogue with TTS filename fields added.
   *
   * @param {string} userId
   * @param {object} dialogue - NPC or creature dialogue object
   * @param {'npc'|'creature'} entityType
   * @param {object} opts
   * @param {number} opts.entitySpeakerId - speaker ID for the NPC/creature
   * @param {number} opts.playerSpeakerId - speaker ID for player options
   * @param {function} opts.synthesizeFn - async (text, speakerId) => Buffer
   */
  async synthesizeDialogue(userId, dialogue, entityType, { entitySpeakerId, playerSpeakerId, synthesizeFn }) {
    const result = JSON.parse(JSON.stringify(dialogue));

    if (entityType === 'npc') {
      // Top-level NPC lines
      if (result.greeting) {
        result.greetingTts = await this.synthesizeLine(userId, result.greeting, entitySpeakerId, synthesizeFn);
      }
      if (result.defeatLine) {
        result.defeatLineTts = await this.synthesizeLine(userId, result.defeatLine, entitySpeakerId, synthesizeFn);
      }
      if (result.freedLine) {
        result.freedLineTts = await this.synthesizeLine(userId, result.freedLine, entitySpeakerId, synthesizeFn);
      }

      // Rounds
      if (result.rounds) {
        for (const round of result.rounds) {
          if (round.npcLine) {
            round.npcLineTts = await this.synthesizeLine(userId, round.npcLine, entitySpeakerId, synthesizeFn);
          }
          if (round.options) {
            for (const option of round.options) {
              if (option.text) {
                option.tts = await this.synthesizeLine(userId, option.text, playerSpeakerId, synthesizeFn);
              }
            }
          }
        }
      }
    } else if (entityType === 'creature') {
      if (result.rounds) {
        for (const round of result.rounds) {
          if (round.speaker) {
            round.speakerTts = await this.synthesizeLine(userId, round.speaker, entitySpeakerId, synthesizeFn);
          }
          if (round.options) {
            round.optionsTts = [];
            for (const optionText of round.options) {
              const filename = await this.synthesizeLine(userId, optionText, playerSpeakerId, synthesizeFn);
              round.optionsTts.push(filename);
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract all TTS filenames from an enriched dialogue object.
   * Returns an array of filename strings.
   */
  collectTtsFiles(dialogue, entityType) {
    const files = [];

    if (entityType === 'npc') {
      if (dialogue.greetingTts) files.push(dialogue.greetingTts);
      if (dialogue.defeatLineTts) files.push(dialogue.defeatLineTts);
      if (dialogue.freedLineTts) files.push(dialogue.freedLineTts);

      if (dialogue.rounds) {
        for (const round of dialogue.rounds) {
          if (round.npcLineTts) files.push(round.npcLineTts);
          if (round.options) {
            for (const option of round.options) {
              if (option.tts) files.push(option.tts);
            }
          }
        }
      }
    } else if (entityType === 'creature') {
      if (dialogue.rounds) {
        for (const round of dialogue.rounds) {
          if (round.speakerTts) files.push(round.speakerTts);
          if (round.optionsTts) {
            for (const filename of round.optionsTts) {
              files.push(filename);
            }
          }
        }
      }
    }

    return files;
  }
}

function hashKey(speakerId, text) {
  return createHash('md5').update(`${speakerId}:${text}`).digest('hex').slice(0, 12) + '.wav';
}

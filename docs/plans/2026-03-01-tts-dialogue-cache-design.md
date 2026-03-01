# TTS Dialogue Cache & NPC Voices Design

## Overview

Pre-generate VOICEVOX audio (WAV) for all NPC and creature dialogue lines when dialogue text is generated. Each NPC gets a unique voice. Creatures share a single voice. Player dialogue options use a boy/girl voice based on a new user setting. Audio files are deleted and regenerated per-character when dialogue becomes stale.

## Voice Assignments

### NPCs (speakerId field in npcs.json)

| NPC | Character | VOICEVOX Voice | Speaker ID |
|-----|-----------|----------------|------------|
| Nagi | Quiet forest guardian | 青山龍星 (Aoyama Ryuusei) | 13 |
| Makoto | Earnest student | 雀松朱司 (Wakamatsu Akashi) | TBD |
| Sora | Boisterous beach guardian | 白上虎太郎 わーい (Shirakami Kotarou "wow") | TBD (style variant) |
| Toshio | Gentle park caretaker | 麒ヶ島宗麟 (Kigashima Sourin) | TBD |
| Fumi | Erudite librarian | 冥鳴ひまり (Meimei Himari) | TBD |

TBD IDs will be resolved by querying VOICEVOX `/speakers` endpoint when the service is running.

### Creatures

All creatures share a single voice: **剣崎雌雄 (Kenzaki Mesuo)** — ID TBD. Calm, neutral tone.

### Player

Determined by new `voiceGender` user setting:

| Setting | VOICEVOX Voice | Speaker ID |
|---------|----------------|------------|
| boy (default) | 玄野武宏 ノーマル (Kurono Takehiro) | 11 |
| girl | 四国めたん (Shikoku Metan) | TBD |

Speaker 11 is already used for vocab word audio — boy player voice matches.

## TTS Dialogue Cache Architecture

### Approach: Inline, Coupled Lifecycle

WAV filenames are stored inline in the existing dialogue cache JSON. Audio generation is atomic with text generation — when text is created, audio is synthesized immediately. When text is regenerated, old audio is deleted first.

### What Gets Voiced

**NPC dialogue (~15 lines per encounter):**
- `greeting` — NPC speaker
- `defeatLine` — NPC speaker
- `freed` line — NPC speaker
- 3 rounds x `npcLine` — NPC speaker
- 3 rounds x 3 `options` — Player speaker (boy/girl)

**Creature dialogue (~12 lines per encounter):**
- 3 rounds x `speaker` line — Creature speaker (Kenzaki Mesuo)
- 3 rounds x 3 `options` — Player speaker (boy/girl)

### Storage

```
data/tts-dialogue/{userId}/
  {md5hash}.wav    # one file per line of dialogue
```

### Cache Entry Format

WAV filenames are added alongside existing text fields in the dialogue cache JSON:

```json
{
  "nagi": {
    "greeting": "…ここから先は、俺の森だ。帰れ。",
    "greetingTts": "a1b2c3d4e5f6.wav",
    "defeatLine": "…鳥が鳴いてる。…",
    "defeatLineTts": "7f8e9d0c1b2a.wav",
    "postCombat": {
      "freed": "…森は、無事か？",
      "freedTts": "e5f6a1b2c3d4.wav",
      "rounds": [{
        "npcLine": "…システムに操られていたのか。",
        "npcLineTts": "c3d4e5f6a1b2.wav",
        "options": [
          { "text": "森は大丈夫だよ。", "tone": "positive", "tts": "d4e5f6a1b2c3.wav" },
          { "text": "そうみたいだね。", "tone": "neutral", "tts": "e5f6a1b2c3d4.wav" },
          { "text": "自分のことを心配しろよ。", "tone": "negative", "tts": "f6a1b2c3d4e5.wav" }
        ]
      }]
    }
  }
}
```

### Lifecycle

1. **Generate** — Dialogue text is created by AI, then all lines are immediately synthesized via VOICEVOX. WAV files are saved to `data/tts-dialogue/{userId}/`. Filenames are stored inline in the dialogue cache JSON.

2. **Serve** — New endpoint `GET /api/tts/dialogue/{userId}/{filename}.wav` serves WAV files to the frontend.

3. **Delete** — When a specific character's dialogue is regenerated (vocab growth, memory change), that character's old WAV files are deleted before new ones are generated. Other characters' audio is untouched.

4. **Graceful degradation** — If VOICEVOX is unavailable during generation, dialogue text is still cached normally without TTS fields. Audio can be generated later when VOICEVOX becomes available.

### Per-Character Granularity

The existing `TextCache` system already regenerates per-character (when Nagi's dialogue is stale, only Nagi is regenerated). TTS follows the same granularity — only the stale character's WAVs are deleted and resynthesized.

### Frontend Integration

- When dialogue is loaded, prefetch all WAV URLs from the `tts` fields
- Play the appropriate WAV as each line is displayed
- NPC lines use the NPC's voice; player option lines use the player's voice

## New User Setting

`voiceGender`: `"boy"` | `"girl"`
- Stored in user settings alongside existing TTS preferences (speed, volume, enabled)
- Controls which speaker ID is used for player dialogue options
- Default: `"boy"`

## Data Changes

### npcs.json

Add `speakerId` field to each NPC definition:

```json
{
  "nagi": {
    "id": "nagi",
    "speakerId": 13,
    ...
  }
}
```

### .gitignore

Add pattern for per-user dialogue audio:
```
data/tts-dialogue/
```

## Out of Scope

- DM narration changes (needs bigger rework)
- Full VOICEVOX speaker ID resolution (done when VOICEVOX is running)
- Changes to the existing static vocab TTS cache (speaker 11, already working)

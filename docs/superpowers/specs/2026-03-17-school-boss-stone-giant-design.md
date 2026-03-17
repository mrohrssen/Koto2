# School Area Boss: 石の巨人 (Stone Giant)

## Summary

Add the first boss encounter to the Magic School (魔法の学校) area. The boss is a stone giant — an animated statue guardian in the school courtyard that comes to life as the area's final challenge.

## Creature Definition

| Field | Value |
|-------|-------|
| **Base Word** | 巨人 (きょじん) — giant |
| **Base Rank** | 4,900 |
| **Modifier** | 石 (いし) — stone |
| **Modifier Rank** | 1,500 |
| **Element** | Earth |
| **Archetype** | Tank/Healer |
| **Rarity** | Rare (per GDD: Stage 1 boss = Rare) |
| **Stage** | 1 |

### Stats (Base)

Per GDD, boss stats should be higher than regular creatures. Existing Stage 1 creatures have baseHp 50–100, baseAttack 7–10.

| Stat | Value | Rationale |
|------|-------|-----------|
| baseHp | 160 | Tanky stone body — highest in area |
| baseAttack | 9 | Moderate — hits hard but not glass cannon |
| baseMp | 60 | Low MP — physical fighter, few magic moves |

### Learnset

Needs 4–5 moves. These must be forged via `/move-forge` from Japanese verbs. Thematic direction: earth/stone/defense moves that fit a lumbering golem.

Suggested verb candidates (to be forged):
- 守る (まもる, rank 300) — to protect/guard → shield/defense move
- 砕く (くだく, rank 4,300) — to smash/crush → heavy damage move
- 揺れる (ゆれる, rank 3,000) — to shake/tremble → AoE/earthquake move
- 固まる (かたまる, rank 3,700) — to harden → defense buff
- 崩す (くずす, rank 3,400) — to crumble/destroy → damage move

### Visual Description

A massive stone golem standing in the school courtyard. Mossy, weathered stone with glowing rune-like cracks. Humanoid but rough-hewn — like a statue that was never finished. Eyes glow faintly. Vines and moss cling to its shoulders. School architecture visible in the background cracks. Reference: chunky Minecraft-style stone golem aesthetic.

## Boss Encounter System (New Infrastructure)

### GDD Rules
- Boss appears as **fixed final room** in the area
- Boss level = `playerHighestLevel × 1.25`, always **solo** encounter
- **Cannot be befriended on first encounter** — must defeat first, then befriend on rematch
- Boss victory narration already exists in `dm.js`

### Room System Changes (`src/game/rooms.js`)

1. Add `boss` to `ROOM_TYPES`
2. Boss room is always the **last room** in an area's room sequence
3. Boss room only appears if the area has a `bossCreatureId` field in `areas.json`

### Area Data Changes (`data/areas.json`)

Add `bossCreatureId` field to the school area:
```json
{
  "id": "mahouno-gakkou",
  "bossCreatureId": "ishino-kyojin",
  ...
}
```

### Encounter Logic Changes

In `src/game/loop.js` / exploration service:
1. Detect boss room type
2. Load boss creature from `creatures.json` by `bossCreatureId`
3. Generate boss at level = `highestPartyLevel × 1.25` (solo, no additional enemies)
4. Set `isBoss: true` flag on combat state
5. On victory: check if first defeat — if so, mark in player state (`bossesDefeated` array)
6. On rematch victory: allow befriend attempt

### Frontend Changes

Minimal — combat UI already handles all creatures uniformly. Only needs:
- Boss entry narration (new DM template)
- Boss room visual indicator in room list (optional)

### Befriend-on-Rematch

Add to player state:
```json
{
  "bossesDefeated": ["ishino-kyojin"]
}
```

On boss encounter:
- If `bossesDefeated` includes this boss → allow befriend after victory
- If not → no befriend option, just victory + narration

## Sprite

Generate via ComfyUI using stone golem reference. Needs:
- Static sprite (`ishino-kyojin.webp`) in `public/assets/sprites/creatures/`
- Idle animation (`ishino-kyojin-idle.webp`) if time permits

## What's Already Built

- Combat system (works for any creature)
- `isBoss` flag support in combat-end-narration API
- Boss victory narration in `dm.js`
- Sprite loading infrastructure

## What Needs Building

1. Boss creature entry in `creatures.json`
2. Boss moves (4–5 new moves via move-forge)
3. Boss sprite
4. `boss` room type in room generation
5. Boss encounter logic (level scaling, solo spawn)
6. Befriend-on-rematch state tracking
7. `bossCreatureId` field on area data
8. Boss entry narration

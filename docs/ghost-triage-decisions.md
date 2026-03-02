# Ghost Systems Triage Decisions

> **Status: COMPLETE** -- All REMOVE/RENAME decisions executed on 2026-03-02.

Tracking decisions from human review of `docs/ghost-systems-audit.md`.

## Decisions

| # | Ghost | Severity | Decision | Notes |
|---|-------|----------|----------|-------|
| 1 | Old Enemy System (Possessed Citizens) | CRITICAL | **REMOVE** | No standalone enemies. NPCs and creatures may be possessed in the future but that would be a different implementation. |
| 2 | Old Player-vs-Enemy Combat | CRITICAL | **REMOVE** | |
| 3 | Flashcard Swipe Combat UI | HIGH | **KEEP** | Not used for combat per GDD, but keep the code — likely reusable for mini-game systems. |
| 4 | Player HP / Player-as-Combatant | HIGH | **REMOVE** | |
| 5 | Boss System | HIGH | **REMOVE** | Future boss encounters would be NPCs or creatures designated as bosses — different from this old system. |
| 6 | Ward/Floor Dungeon System | HIGH | **REMOVE** | rooms.js is fine (already area-based), just rename `generateFloorRooms`. |
| 7 | iRO Stat System | MEDIUM | **REMOVE** | |
| 8 | Essence Currency + Meta Upgrades | MEDIUM | **REMOVE** | |
| 9 | Chippy NPC + Door Hints | MEDIUM | **KEEP** | Will repurpose Chippy — lots of reusable code here. |
| 10 | Chip System Naming | MEDIUM | **RENAME** | Rename all "chip" references to "creature". Also remove charge mechanic i18n strings. |
| 11 | Blacksmith / Equipment | MEDIUM | **REMOVE** | Will build fresh when equipment is ready per GDD. |
| 12 | Old DM Narration Prompts | MEDIUM | **REMOVE** | |
| 13 | Liberation Tracker | LOW | **REMOVE** | |
| 14 | Cyberpunk / Dark Theme Remnants | LOW | **REMOVE** | |
| 15 | Bunpro Grammar Integration | LOW | **KEEP** | Intentional — should be documented in GDD. |
| 16a | Chat conversation partner mode | LOW | **REMOVE** | |
| 16b | Leaderboard system | LOW | **KEEP** | |
| 16c | Extra item types (keepsake, xpCharm, xpBalance) | LOW | **KEEP** | |
| 16d | Dealer room economy divergence | LOW | **KEEP** | |
| 16e | Ghost run/lifetime stats | LOW | **REMOVE** | Stats reference removed systems (enemies, bosses, traps, crits, dodges). |
| 16f | Word discovery XP/credit rewards | LOW | **KEEP** | XP rewards are fine. |

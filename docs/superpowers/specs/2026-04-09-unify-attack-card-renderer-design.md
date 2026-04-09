# Unify Attack Card Renderer

**Date:** 2026-04-09
**Status:** Approved

## Problem

Attack cards use `vocabStackHtml()` — a parallel renderer in combat-loop.js with its own known-word detection, CSS classes, and DOM structure. This diverges from every other Japanese word display in the game, which uses `renderJpSentence()` + `entityToToken()`.

The divergence causes a concrete bug: `vocabStackHtml` checks `knownWords.has(reading)` as a fallback, so words can be falsely detected as "known" when their reading matches another known word. Unknown words lose their English gloss in attack cards.

## Scope

Kill `vocabStackHtml` and route attack cards through `renderJpSentence` + `entityToToken`. Do NOT touch `renderEnFirst` (tagged-text system) — that's a separate concern.

## Changes

### 1. Delete `vocabStackHtml` from combat-loop.js

Remove the function entirely (lines ~192-206).

### 2. Replace 4 call sites with `renderJpSentence`

**In `buildSplitAttackCard`** (2 calls):
- `vocabStackHtml(atk.attackerBaseReading, atk.attackerBaseMeaning, atk.attackerBaseWord)` → `renderJpSentence([entityToToken({ name: atk.attackerBaseWord, reading: atk.attackerBaseReading, nameEn: atk.attackerBaseMeaning })], getKnownWords(), new Map())`
- Same pattern for `atk.attackerSkillReading`/`attackerSkillEn`/`attackerSkillName || atk.moveName`

**In `insertNpcAttackCard`** (2 calls): identical substitution.

### 3. Delete dead CSS

Remove `.sac-vocab-stack`, `.sac-romaji`, `.sac-kana`, `.sac-english` rules from game.css — no longer referenced after step 1.

### 4. Verify CSS suppression hacks

Lines 4765-4773 suppress `.bs-word-en` inside `.sac-vocab`. Verify whether `.sac-vocab` class is still used anywhere after step 1. If dead, delete. If still referenced by `renderEnFirst` output in attack cards, leave for now (out of scope).

### 5. Adjust `.sac-row .jp-word` sizing if needed

The old `sac-kana` was 22px bold. If the standard `jp-word` ruby renders too small inside attack cards, add scoped CSS like `.sac-row .jp-word ruby { font-size: 22px; }`.

## Result

- One known-check: `knownWords.has(baseForm)` — no reading fallback
- One DOM structure: `jp-word`/`jp-known`/`jp-unknown`/`jp-stack-en`
- Unknown words correctly show English in attack cards
- Attack cards visually consistent with items, move names, dialogue

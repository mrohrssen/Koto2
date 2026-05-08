# Move Verb Mechanics CSV Design

## Goal

Create a new CSV derived from `/Users/michiarohrssen/Documents/move-verb-expansion-suggestions-master-MR CSV.csv` that includes only human-approved move rows and appends proposed gameplay mechanics for each move. The source CSV must not be modified.

## Approved Rows

A row is approved when `Human Judgement` contains `Add`, including annotated values such as `Add - Steal`, `Add - call it Extract`, or `Add - call it Slash`.

When the judgement note gives a preferred English name, the output uses that as `Approved Move Name`. Otherwise it uses the source `Move` value.

## Output Shape

The output preserves all original source columns and appends:

- `Approved Move Name`
- `Element`
- `Category`
- `Target`
- `Power`
- `MP Cost`
- `Status Effect`
- `Status Chance`
- `Status Duration`
- `Stat Changes`
- `Tier`
- `Description`

## Move Design Rules

Proposals use the full design space in `docs/move-system-reference.md`, including planned mechanics. The CSV should cover every move category at least once: `damage`, `drain`, `heal`, `buff`, and `debuff`.

It should also include broad coverage of targets (`single_enemy`, `all_enemies`, `self`, `single_ally`, `all_allies`), status effects (`poison`, `sleep`, `stun`, `confuse`, `taunt`, `cleanse`), and stat-stage changes for `atk`, `def`, and `dex`.

Power should follow move fantasy. Plain, common moves should be modest. Dramatic or ultimate-sounding moves can exceed current authored moves by roughly 70% at the high end. Moves with status effects, healing, buffs, debuffs, multi-target effects, or combined riders should trade off raw power for utility.

## Output Location

Write the new CSV as a separate file, preferably under the project `output/` directory, with a descriptive name such as `move-verb-expansion-approved-mechanics.csv`.

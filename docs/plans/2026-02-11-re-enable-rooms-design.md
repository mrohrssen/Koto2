# Re-enable All Room Types for Robot Combat

## Problem

During robot combat development, we set `encountersOnly = true` in `startRun()`, disabling all special rooms (shrine, quiz, wordDiscovery, dealer). Every room became an encounter. Now that robot combat is stable, we need to bring those rooms back with purposes that fit the robot system — chips are gone from robot runs.

## Room Types and Purposes

### Encounter (60%)
Unchanged. Robot-vs-robot combat.

### Shrine — Robot Training Dojo (10%)
Pick one robot from your party to level up for free.

**Flow:**
1. Fox sprite + shrine background (reuse existing assets)
2. Show full party roster (active + reserves) with current levels
3. Player taps a robot → level-up applied, show stat increases
4. Proceed to next room

**Backend:** `useShrine(robotId)` finds the robot in `run.robotParty`, applies level-up using existing XP logic.

### Quiz — One Question, Pick Your Reward (10%)
Answer one vocab question. Correct answer earns a reward choice; wrong answer earns consolation credits.

**Reward choices (correct answer):**
- **Heal** — restore one robot to max HP (player picks which)
- **Level-up** — level up one robot (player picks which)
- **Credits** — floor-scaled credit payout

**Wrong answer:** small credit consolation, move on.

**Backend:** `useQuizReward(rewardType, robotId?)` handles all three. `heal` sets one robot's HP to maxHp. `levelup` applies level-up. `credits` adds floor-scaled amount.

### WordDiscovery — Vocab Learning for XP + Credits (10%)
Learn a new word, earn a small XP + credit reward.

**Reward scaling:** 2/10 (20%) of a single enemy robot's XP and credit reward at the current floor. Enough to feel worthwhile, not enough to replace fighting.

**Backend:** `completeWordDiscovery()` calculates reward from enemy scaling formulas, splits XP across active robots, adds credits.

### Dealer — Robot Mercenary Market (10%)
Sell up to 2 robots, buy 1. Same structure as the current chip dealer.

**Buy side:** 3 random robots the player hasn't captured. Priced by rarity. Bought robots join the party (active or reserves) but are marked `temporary: true` — they do NOT enter the permanent collection after the run.

**Sell side:** Party roster with sell prices (based on rarity + level). Cannot sell your last robot.

**Backend:**
- `getDealerState()` generates 3 uncaptured robots with prices
- `dealerBuy(robotId)` deducts credits, adds robot to party as temporary
- `dealerSell(robotId)` removes from party, adds credits (befriended robots stay in collection but leave the run)

### Boss (always last)
Unchanged.

## Implementation Changes

### Backend (`src/game/`)

**`loop.js`:**
- Remove `this.run.encountersOnly = true` from `startRun()`
- Update `useShrine()`: accept `robotId` instead of `chipId`, apply robot level-up
- Update `useQuizReward()`: new reward types `heal`, `levelup`, `credits` with optional `robotId`
- Update `completeWordDiscovery()`: award 20% of single-enemy XP + credits
- Update dealer methods: robot buy/sell instead of chip buy/sell

**`rooms.js`:**
- Update probabilities: encounter 60%, shrine 10%, quiz 10%, wordDiscovery 10%, dealer 10%

**`services/robot-combat-service.js`:**
- Expose helper: "what is a single enemy robot worth at this floor?" (XP + credits) so wordDiscovery and quiz can derive scaled rewards

**Dealer inventory:**
- New function to pick 3 robots not in player's collection, with rarity-based pricing

### Frontend (`public/`)

**`js/ui/exploration.js`:**
- `renderShrine()`: show robot roster instead of chip list, robot picker for level-up
- `renderQuiz()`: reward selection shows heal/levelup/credits cards; heal and levelup trigger robot picker
- WordDiscovery reward text: show XP + credits instead of chip bonuses

**`js/ui/economy.js`:**
- `renderDealerRoom()`: robot cards instead of chip cards, buy 1 / sell 2

**`game.js`:**
- No changes. The phase switch already handles all room types — they were never reached.

### No Changes Needed
- Room generation structure (branch pairs, boss placement)
- Door hints / Chippy
- Combat system
- Collection / meta-progression
- Scene backgrounds and sprites (all reused)

## Constraints
- Max party: 6 (3 active + 3 reserves)
- Shrine: one level-up per visit
- Quiz: one question per visit
- Dealer: sell up to 2, buy 1
- Temporary dealer robots don't enter collection
- Can't sell your last robot

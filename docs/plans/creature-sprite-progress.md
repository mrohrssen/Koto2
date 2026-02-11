# Creature Sprite Generation Progress

## STATUS: COMPLETE - 46/46 PASSING

All 46 creature sprites have been regenerated to acceptable quality across 4 rounds.

## Connection Details
- ComfyUI: `http://192.168.1.222:8188`
- SSH: `ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222`
- Checkpoint: `waiIllustriousSDXL_v160.safetensors`
- Settings: 1024x1024, 30 steps, CFG 8.5 (bumped from 7.5 in R3), dpmpp_2m sampler, karras scheduler
- Background removal: RMBG-2.0

## Scripts
- `scripts/generate_creatures.py` — main generation (all 46 from creatures.json descriptions)
- `scripts/retry_creatures.py` — retry with custom per-creature prompts in CUSTOM_PROMPTS dict

## Key Learnings
1. **"gacha game" in STYLE triggers text artifacts** — words like "Gaha Game", "Gaon Game", "O'VLIOD" appear. Replaced with "anime art style" in Round 3. This was the #1 fix.
2. **SDXL loves duplicates** — describing "floating elements" or "orbiting shards" often generates a second smaller copy. Fix: fill 90% of frame, avoid floating element descriptions.
3. **"outline only" problem** — some creatures render as line art with no fill. Fix: add "fully painted with cel shading, thick dark outlines, opaque filled colors, NOT an outline drawing".
4. **Platforms/pedestals are sticky** — even with negatives, some creatures keep generating on discs. Fix: "flying through empty white space" + explicit anti-ground.
5. **Object vs creature** — describing clock/compass/phone generates objects. Fix: describe as a bell/animal shape with face and limbs instead.
6. **"golem" triggers humanoid** — SDXL interprets "golem" as muscular humanoid. Fix: say "turnip creature" or "slime" instead.
7. **"Kirby proportions"** is the magic phrase for round chibi bodies — much more effective than "chibi" or "round".
8. **CFG 8.5** gives better prompt adherence than 7.5 for stubborn cases.
9. **Iterative approach works** — 4 rounds progressively fixed all 46 sprites. Each round informed the next.
10. **"chestnut"/"potato" forces brown coloring** — SDXL associates "root", "bark", "tree stump" with purple crystal. Describing the creature as a "chestnut" or "potato" reliably produces warm brown. Put color words at the FRONT of the prompt for maximum weight.

## Round Summary

| Round | Generated | Passed | Total Passing | Key Fix |
|-------|-----------|--------|---------------|---------|
| R1 | 46 | 17 | 17/46 | Initial generation from creatures.json |
| R2 | 33 | 10 | 27/46 | Custom prompts for each failure |
| R3 | 19 | 16 | 43/46 | Removed "gacha game", bumped CFG 8.5 |
| R4 | 3 | 3 | **46/46** | "Kirby proportions", turnip/slime/bell shapes |

## All 46 Final Results

### All Passes by Round
**R1 passes (17):** kaleidon, croppy, sweetle, statik, puppette, tablette, swivyl, sachel, shimra, petalia, barkley, loafie, formling, timbark, groval, grinnix, giggli

**R2 new passes (10):** gilden, tidalin, shelvyn, gloopy, spindel, melodia, deskid, glitchi, gulpy, peekyx

**R3 new passes (16):** solarie, chirplet, nimbulon, buzzle, scribbit, reelyx, drizzlet, ripplash, sproutling, whiskit, trottar, frostelle, sizzlit, moodlet, sketchi, breezle

**R4 new passes (3):** rooten, orblix, dialyn

### Borderline Re-rolls (Round 5) — All Upgraded
All 5 borderline sprites were re-rolled with improved prompts:
- **sproutling**: Re-rolled with extreme close-up — much bigger, more expressive face
- **nimbulon**: Re-rolled as storm dragon — grumpy storm creature with lightning horns
- **scribbit**: Re-rolled as ink blob — ink bunny with swirl body, much better
- **dialyn**: Re-rolled as hamster — clock face embedded in cute hamster body
- **rooten**: Re-rolled as chestnut creature — brown body (was purple\!), golden crown, green leaves. Key learning: "chestnut" and "potato" force brown coloring; "root"/"bark"/"tree stump" kept triggering purple

| Round | Generated | Passed | Total Passing | Key Fix |
|-------|-----------|--------|---------------|---------|
| R5 (borderline) | 5 | 5 | **46/46** | "chestnut creature" for brown color, animal shapes for all |

## How to Re-run Specific Creatures
```bash
# Check ComfyUI is running
curl -s http://192.168.1.222:8188/system_stats | head -c 100

# If not running, SSH in and start it:
ssh -i ~/.ssh/id_ed25519_remote_pc michia@192.168.1.222
# Then run: C:\Users\michi\ComfyUI\venv\Scripts\python.exe C:\Users\michi\ComfyUI\main.py --listen 0.0.0.0 --port 8188

# Re-run specific creatures (uses custom prompts from CUSTOM_PROMPTS dict)
python3 scripts/retry_creatures.py rooten orblix dialyn

# Re-run ALL creatures that have custom prompts
python3 scripts/retry_creatures.py

# QA: read the .webp files in public/assets/sprites/robots/
```

## Creatures That May Need Future Polish
If you want to improve borderline sprites, update their entry in `CUSTOM_PROMPTS` in `scripts/retry_creatures.py` and re-run. The seeds are random so each run produces different results — sometimes you get lucky on the first try.

# Game Graphics Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all 128 game graphics (20 chip robots, 48 enemies, 7 bosses, 53 backgrounds) with cohesive Pokemon/anime-style images generated via ComfyUI on the remote PC.

**Architecture:** Four Python generation scripts (one per asset type) are SCP'd to the remote Windows PC and executed via SSH. Each script queues images through ComfyUI's API, waits for completion, then results are SCP'd back and placed in the correct directories with existing filenames preserved.

**Tech Stack:** Python 3 (ComfyUI API client), SSH/SCP (remote execution), RMBG-2.0 (background removal for sprites), waiIllustriousSDXL_v160 model.

---

## Infrastructure Reference

- **Remote PC**: `192.168.1.222` (Windows, user `michi`)
- **SSH key**: `~/.ssh/id_ed25519_remote_pc`
- **ComfyUI output dir**: `C:\Users\michi\ComfyUI\output\`
- **Model**: `waiIllustriousSDXL_v160.safetensors`
- **GPU**: NVIDIA RTX 3090 (24GB VRAM)
- **SSH command pattern**: `ssh -i ~/.ssh/id_ed25519_remote_pc michi@192.168.1.222 "command"`
- **SCP to remote**: `scp -i ~/.ssh/id_ed25519_remote_pc file michi@192.168.1.222:C:/Users/michi/ComfyUI/`
- **SCP from remote**: `scp -i ~/.ssh/id_ed25519_remote_pc michi@192.168.1.222:C:/Users/michi/ComfyUI/output/subfolder/* ./local/`

## Generation Parameters (All Assets)

| Parameter | Value |
|-----------|-------|
| Steps | 30 |
| CFG | 7.5 |
| Sampler | dpmpp_2m |
| Scheduler | karras |
| Denoise | 1.0 |

---

## Task 1: Generate Chip Robot Sprites (20 images)

**Files:**
- Create: `scripts/generate_chips.py`
- Output to: `public/assets/icons/chips/{chipId}.png`

**Step 1: Write the generation script**

Create `scripts/generate_chips.py` with these specifications:

- Resolution: 1024x1024
- Background removal: RMBG-2.0 node (Alpha output)
- Output subfolder: `chip_robots/`
- Filename prefix per chip: `chip_robots/{chipId}`

Style prompt:
```
solo, chibi character, gacha game art style, mobile game character icon, white background, bright vivid colors, high quality, clean
```

Negative prompt:
```
dark, gritty, realistic, horror, text, watermark, blurry, low quality, multiple characters, complex background, pokeball, human, humanoid
```

**Enhanced descriptions for each chip** (the object IS the body with a cute face and tiny limbs):

| chipId | Description |
|--------|-------------|
| battery | a cute chibi battery robot, the body is a bright yellow AA battery cylinder, adorable round eyes on the battery label, tiny stubby arms and legs, sparking electric energy antennae on top, cheerful expression, oversized head-to-body ratio |
| speaker | a cute chibi speaker robot, the body is a round speaker box, the speaker cone is its face with big eyes in the center, tiny stubby limbs, musical notes floating around, vibrating with sound energy |
| glasses | a cute chibi glasses robot, the body is a pair of round spectacles, the lenses are its big shiny eyes, thin frame arms extended as limbs, scholarly aura, slight sparkle on lenses |
| lightbulb | a cute chibi lightbulb robot, the body is a classic incandescent bulb shape, warm glowing filament inside as its heart, screw base as feet, tiny arms, radiating soft golden light, happy bright expression |
| scissors | a cute chibi scissors robot, the body is an open pair of scissors, the finger holes are its eyes, blade arms spread wide, tiny legs from the pivot point, shiny metallic blades, playful snipping pose |
| clock | a cute chibi clock robot, the body is a round analog clock face, the clock hands form its expression, small numbered face, tiny gear-shaped feet, pendulum tail, ticking happily |
| charcoal | a cute chibi charcoal robot, the body is a chunky piece of black binchotan charcoal, rough textured surface, glowing ember-orange cracks, smoldering warmth, tiny dark limbs, smoky aura |
| book | a cute chibi book robot, the body is a thick open hardcover book, pages fluttering as wings, bookmark tongue sticking out, tiny stubby legs below the spine, wise expression, floating letters around |
| eraser | a cute chibi eraser robot, the body is a white rectangular eraser, clean smooth surface, paper sleeve wrapper as a cape, tiny limbs, eraser shavings floating around it, pristine and tidy |
| onigiri | a cute chibi onigiri robot, the body is a triangular rice ball, crispy nori seaweed belt around its middle, grain-textured white rice body, tiny stubby limbs, umeboshi blush cheeks, adorable |
| wallet | a cute chibi wallet robot, the body is a folded leather bifold wallet, slightly open showing card slots as teeth in a grin, coin pocket as an eye, tiny leather limbs, gold coin floating above |
| straw | a cute chibi straw robot, the body is a long bendy drinking straw, accordion bend section in the middle as its waist, striped colorful pattern, tiny limbs at the bottom, sipping expression |
| key | a cute chibi key robot, the body is a golden ornate key shape, the bow (top ring) is its head with eyes inside, the blade extends down with tooth details as feet, shiny metallic, mysterious aura |
| egg | a cute chibi egg robot, the body is a perfect oval egg, smooth cream-white shell with tiny speckles, hairline crack on top like a hat, tiny stubby limbs, warm incubating glow from within |
| fireworks | a cute chibi fireworks robot, the body is a firework rocket tube, red and gold wrapping, sparking lit fuse on top as hair, tiny limbs, colorful sparkle trails, excited explosive expression |
| mirror | a cute chibi mirror robot, the body is a round handheld mirror, reflective glass surface as its face, ornate frame border, handle as a single leg, tiny arms from frame sides, sparkly reflections |
| feather | a cute chibi feather robot, the body is a fluffy white feather shape, soft downy texture, delicate barbs as flowing hair, tiny limbs at the quill base, floating gently, ethereal light glow |
| drum | a cute chibi drum robot, the body is a traditional taiko drum on its side, drum skin face with bold expression, thick barrel body, two drumstick arms raised ready to strike, rhythmic aura waves |
| magnifyingGlass | a cute chibi magnifying glass robot, the body is a large circular lens, everything seen through it appears bigger, thick frame as its face, handle as a single leg, detective hat on top, curious expression |
| toolbox | a cute chibi toolbox robot, the body is a red metal toolbox, hinged lid slightly open showing tools inside, handle on top like a mohawk, tiny sturdy legs, industrious expression, wrench and screwdriver peeking out |

The script workflow structure (following existing pattern from `generate_chip_icons.py`):
1. CheckpointLoaderSimple → model
2. CLIPTextEncode (positive) → style + enhanced description
3. CLIPTextEncode (negative) → negative prompt
4. EmptyLatentImage (1024x1024)
5. KSampler (30 steps, cfg 7.5, dpmpp_2m, karras)
6. VAEDecode
7. RMBG (Alpha background)
8. SaveImage (filename_prefix: `chip_robots/{chipId}`)

**Step 2: SCP script to remote PC and execute**

```bash
scp -i ~/.ssh/id_ed25519_remote_pc scripts/generate_chips.py michi@192.168.1.222:C:/Users/michi/ComfyUI/generate_chips.py
ssh -i ~/.ssh/id_ed25519_remote_pc michi@192.168.1.222 "cd C:\Users\michi\ComfyUI && python generate_chips.py"
```

**Step 3: SCP results back and rename to match existing filenames**

```bash
mkdir -p /tmp/chip_robots
scp -i ~/.ssh/id_ed25519_remote_pc "michi@192.168.1.222:C:/Users/michi/ComfyUI/output/chip_robots/*" /tmp/chip_robots/
```

ComfyUI outputs files as `{prefix}_{5digitNumber}_.png`. For each chip, copy the file to the correct name:
```bash
# For each chipId, find its output and copy:
cp /tmp/chip_robots/battery_00001_.png public/assets/icons/chips/battery.png
cp /tmp/chip_robots/speaker_00001_.png public/assets/icons/chips/speaker.png
# ... etc for all 20 chips
```

**Step 4: Verify all 20 chip images exist and are valid PNGs**

```bash
for chip in battery speaker glasses lightbulb scissors clock charcoal book eraser onigiri wallet straw key egg fireworks mirror feather drum magnifyingGlass toolbox; do
  file public/assets/icons/chips/$chip.png
done
```

**Step 5: Commit**

```bash
git add scripts/generate_chips.py public/assets/icons/chips/{battery,speaker,glasses,lightbulb,scissors,clock,charcoal,book,eraser,onigiri,wallet,straw,key,egg,fireworks,mirror,feather,drum,magnifyingGlass,toolbox}.png
git commit -m "art: replace 20 chip icons with gacha chibi robot style"
```

---

## Task 2: Generate Enemy Sprites (48 images)

**Files:**
- Create: `scripts/generate_enemies.py`
- Output to: `public/assets/sprites/enemies/{camelCaseName}.png`

**Step 1: Write the generation script**

Create `scripts/generate_enemies.py` with these specifications:

- Resolution: 1024x1024
- Background removal: RMBG-2.0 node (Alpha output)
- Output subfolder: `enemy_sprites/`
- Filename prefix per enemy: `enemy_sprites/{camelCaseName}`

Style prompt:
```
solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game rival character style, dramatic confident stance, elaborate detailed clothing, slight aura glow, imposing presence, vibrant colors, game character art, high quality, sharp details, bold linework, high contrast
```

Negative prompt:
```
dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, plain clothing, pokeball, pokeballs, poke ball
```

**Enhanced descriptions for each enemy** (Tokyo citizens, Pokemon NPC trainer style):

| enemyId | Enhanced Description |
|---------|---------------------|
| angryCitizen | furious middle-aged japanese man, veins popping on forehead, clenched fists, rumpled dress shirt with loosened tie, intimidating wide stance, red-faced with anger, steam practically visible |
| boredCivilServant | utterly bored japanese government worker, half-lidded eyes, slouching posture, beige cardigan over white shirt, holding rubber stamp lazily, stack of forms in other hand, soul-crushingly mundane aura |
| busyHousewife | energetic japanese housewife in constant motion, apron over casual clothes, shopping bags in both hands, bicycle helmet still on, determined multitasking expression, organized chaos |
| calmPharmacist | serene japanese pharmacist, pristine white coat, wire-rimmed glasses, holding medicine bottle with practiced precision, gentle knowing smile, calming green aura, medicinal herbs motif |
| chattyOfficeLady | animated japanese office lady mid-conversation, stylish business casual, expressive hand gestures, phone in one hand, coffee in other, sparkly social butterfly energy, trendy accessories |
| coldDoctor | stern japanese doctor with icy demeanor, immaculate white coat, stethoscope, clipboard held like a shield, piercing analytical eyes behind thin glasses, clinical cold blue aura |
| coldReceptionist | aloof japanese receptionist, perfect posture behind invisible desk, tailored blazer, polite but distant smile that doesn't reach eyes, manicured nails, icy professional demeanor |
| complainerCustomer | perpetually dissatisfied japanese customer, pointing finger accusingly, furrowed brow, casual weekend clothes, receipt crumpled in hand, aura of righteous consumer indignation |
| confusedApplicant | bewildered young japanese job applicant, oversized ill-fitting suit, clutching resume folder nervously, sweat drops, lost expression, tie slightly crooked, first-interview anxiety visible |
| confusedOldMan | befuddled elderly japanese man, flat cap, thick glasses, scratching head with one hand, holding map upside down, cardigan with too many pockets, endearing confused expression |
| cryingChild | teary-eyed japanese child (about 8), school uniform, backpack too big, holding broken toy, sniffling with big watery eyes, scuffed shoes, dramatic anime cry face |
| deliveryPerson | swift japanese delivery worker, branded uniform cap and jacket, carrying stack of packages, athletic stance ready to sprint, determination in eyes, delivery tablet strapped to arm |
| drunkGroup | single tipsy japanese salaryman representing a group, loosened tie around forehead, rosy cheeks, swaying stance, holding beer can, karaoke microphone in pocket, jolly inebriated glow |
| eagerNewEmployee | overly enthusiastic new japanese employee, brand new crisp suit still with tags showing, notebook and pen ready, sparkling eager eyes, perfect bow posture, rookie energy radiating |
| energeticManager | high-energy japanese middle manager, rolled-up sleeves, motivational pose with fist pump, whistle around neck, clipboard with charts, infectious enthusiasm aura, slightly sweaty |
| friendlyWaiter | welcoming japanese waiter, crisp white shirt and black vest, towel over arm, carrying invisible tray with perfect balance, warm genuine smile, slight bow, hospitality aura |
| gymTeacher | athletic japanese PE teacher, track suit with whistle, muscular build, authoritative stance with arms crossed, sweatband, stopwatch around neck, motivational intensity |
| indecisiveShopper | paralyzed-by-choice japanese shopper, holding two items comparing them, shopping basket overflowing, furrowed brow of concentration, surrounded by floating question marks |
| irritatedCustomer | visibly annoyed japanese customer, tapping foot impatiently, checking watch pointedly, shopping bag gripped tightly, thin-lipped expression of barely contained frustration |
| itSupport | exhausted japanese IT worker, multiple devices strapped to belt, laptop under arm, glasses reflecting screen code, energy drink in pocket, cable spaghetti aura, tired but capable |
| kindGrandmother | warm elderly japanese grandmother, traditional clothing with modern touches, offering wrapped homemade food, gentle wrinkled smile, small stature but powerful nurturing presence |
| kindlyWindowStaff | patient japanese municipal window clerk, neat uniform, stack of forms organized perfectly, helpful pointing gesture, reading glasses on chain, bureaucratic but genuinely kind |
| kindNurse | compassionate japanese nurse, pastel scrubs with cute pins, medical clipboard, band-aids in pocket, reassuring gentle expression, healing green aura, stethoscope like jewelry |
| lostTourist | bewildered foreign tourist in Tokyo, guidebook and phone map both out, camera around neck, inappropriate outfit for weather, wide amazed eyes, luggage wheel broken |
| loudDelinquent | rebellious japanese yankii delinquent, modified school uniform with long skirt/coat, bleached pompadour hair, intimidating slouch, loud aggressive stance, bat or umbrella as prop |
| neighborhoodKid | mischievous japanese neighborhood kid (about 12), casual clothes with grass stains, bandaid on cheek, slingshot in back pocket, cheeky grin, adventurous pose, bicycle nearby |
| nightShiftWorker | bleary-eyed japanese convenience store night worker, konbini uniform, dark circles under eyes, coffee cup as lifeline, slightly zombified but professional stance, fluorescent-lit pallor |
| partTimerStudent | multitasking japanese college student, half in work uniform half in casual clothes, textbook under arm, part-time job apron, youthful exhaustion, determination despite fatigue |
| platformPusher | professional japanese train platform attendant, white gloves, railway uniform and cap, pushing pose with outstretched arms, whistle ready, disciplined military-like precision |
| preciseStationStaff | meticulous japanese station staff, perfectly pressed uniform, pointing precisely at schedule board, white gloves spotless, pocket watch, embodiment of japanese punctuality |
| pushySalesperson | aggressive japanese salesperson, business suit slightly too shiny, leaning forward invading space, product sample thrust forward, dazzling forced smile, sales quota desperation aura |
| quietLibrarian | reserved japanese librarian, cardigan and long skirt, finger to lips in shush gesture, stack of books balanced expertly, reading glasses, peaceful bookish aura, pressed flower bookmark |
| regularCustomer | comfortable japanese regular customer, casual familiar clothes, loyalty card visible, relaxed knowing exactly what to order pose, sense of belonging, favorite seat aura |
| runningStudent | late japanese student sprinting, school uniform disheveled, toast in mouth, bag flapping, one shoe untied, motion blur lines, classic anime late-for-school energy |
| rushingOfficeWorker | stressed japanese office worker in full sprint, briefcase flying open with papers, coffee sloshing, phone pressed to ear, suit jacket billowing, big-city rush hour chaos |
| schoolNurse | gentle japanese school nurse, white coat over warm clothes, first-aid kit, thermometer ready, maternal concern expression, infirmary curtain aesthetic, band-aid dispenser |
| silentChef | intense japanese chef, traditional white chef coat and tall toque, arms crossed with knife in hand, stoic expression, flour-dusted, absolute kitchen authority, flame aura |
| sleepingManager | narcoleptic japanese manager, suit slightly wrinkled, head nodding off, papers as pillow, coffee gone cold, one eye barely open, desk worker exhaustion personified |
| stockingWorker | diligent japanese store stocker, work apron and gloves, carrying box of products, scanning gun on hip, efficient mechanical movements, early-morning dedication |
| strictSectionChief | intimidating japanese section chief (kacho), perfect suit and posture, reading glasses for judging documents, red correction pen ready, disapproving evaluation stare, authority aura |
| studentCouncilPresident | commanding japanese student council president, pristine school uniform with armband, pointer stick, imperious stance, honor student aura, rulebook in hand, natural born leader |
| tiredSalaryman | utterly drained japanese salaryman, rumpled suit with loosened tie, dark circles like bruises, briefcase dragging on ground, 1000-yard stare, last-train-home energy, slightly swaying |
| trainOtaku | passionate japanese train enthusiast, camera with telephoto lens, train schedule book, railway cap from collection, excited pointing at invisible train, surrounded by train model aura |
| veteranCashier | seasoned japanese cashier, store uniform worn with expertise, hands moving in blur over register, no-nonsense efficient expression, decades of experience in stance, speed scanning aura |
| worriedPatient | anxious japanese hospital patient, pajamas or casual clothes, clutching appointment slip, thermometer in mouth, worried brow, health insurance card ready, nervous fidgeting |

**Step 2: SCP script to remote PC and execute**

```bash
scp -i ~/.ssh/id_ed25519_remote_pc scripts/generate_enemies.py michi@192.168.1.222:C:/Users/michi/ComfyUI/generate_enemies.py
ssh -i ~/.ssh/id_ed25519_remote_pc michi@192.168.1.222 "cd C:\Users\michi\ComfyUI && python generate_enemies.py"
```

Note: 48 images at ~30s each = ~25 minutes total generation time.

**Step 3: SCP results back and rename**

```bash
mkdir -p /tmp/enemy_sprites
scp -i ~/.ssh/id_ed25519_remote_pc "michi@192.168.1.222:C:/Users/michi/ComfyUI/output/enemy_sprites/*" /tmp/enemy_sprites/
```

Copy each to the correct filename:
```bash
cp /tmp/enemy_sprites/angryCitizen_00001_.png public/assets/sprites/enemies/angryCitizen.png
# ... repeat for all 48 enemies
```

**Step 4: Verify all 48 enemy images exist**

```bash
ls -la public/assets/sprites/enemies/{angryCitizen,boredCivilServant,busyHousewife,...}.png | wc -l
# Should output 48
```

**Step 5: Commit**

```bash
git add scripts/generate_enemies.py
git add public/assets/sprites/enemies/{angryCitizen,boredCivilServant,busyHousewife,calmPharmacist,chattyOfficeLady,coldDoctor,coldReceptionist,complainerCustomer,confusedApplicant,confusedOldMan,cryingChild,deliveryPerson,drunkGroup,eagerNewEmployee,energeticManager,friendlyWaiter,gymTeacher,indecisiveShopper,irritatedCustomer,itSupport,kindGrandmother,kindlyWindowStaff,kindNurse,lostTourist,loudDelinquent,neighborhoodKid,nightShiftWorker,partTimerStudent,platformPusher,preciseStationStaff,pushySalesperson,quietLibrarian,regularCustomer,runningStudent,rushingOfficeWorker,schoolNurse,silentChef,sleepingManager,stockingWorker,strictSectionChief,studentCouncilPresident,tiredSalaryman,trainOtaku,veteranCashier,worriedPatient}.png
git commit -m "art: replace 48 enemy sprites with Pokemon NPC trainer style"
```

---

## Task 3: Generate Boss Sprites (7 images)

**Files:**
- Create: `scripts/generate_bosses.py`
- Output to: `public/assets/sprites/enemies/boss_{name}.png`

**Step 1: Write the generation script**

Create `scripts/generate_bosses.py` with these specifications:

- Resolution: 1024x1024
- Background removal: RMBG-2.0 node (Alpha output)
- Output subfolder: `boss_sprites/`
- Same style/negative as enemies but descriptions are more dramatic

Style prompt (same as enemies):
```
solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game rival character style, dramatic confident stance, elaborate detailed clothing, slight aura glow, imposing presence, vibrant colors, game character art, high quality, sharp details, bold linework, high contrast
```

Negative prompt (same as enemies):
```
dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, plain clothing, pokeball, pokeballs, poke ball
```

**Enhanced boss descriptions** (more dramatic/imposing than regular enemies):

| Boss ID (output filename) | Description |
|---------------------------|-------------|
| boss_goblin_king | legendary japanese anime director, sweeping dramatic black trenchcoat billowing in wind, holding megaphone like a weapon, storyboard papers swirling around like magic, beret at jaunty angle, intense creative fire in eyes, commanding presence demanding perfection, golden director's chair aura |
| boss_wolf_alpha | infamous tokyo host club king, dazzling white three-piece suit with golden embroidery, champagne glass raised in toast, red roses cascading around him, impossibly styled silver hair, confident smirk, VIP rope barrier aura, blinding charisma |
| boss_lich | mega-famous social media influencer, cutting-edge streetwear layered outfit worth millions, floating smartphones orbiting like satellites, ring light halo, peace sign pose but eyes are calculating, viral energy crackling, hashtag symbols floating |
| boss_ogre | eccentric electronics emperor, lab coat covered in circuit board patterns, holographic displays projecting from fingertips, wild Einstein-like hair crackling with static, goggles pushed up on forehead, surrounded by floating gadgets and components |
| boss_demon_lord | ruthless foreign corporation CEO, impeccably tailored charcoal suit that costs more than a house, towering imposing figure, arms crossed with platinum watch gleaming, skyscraper shadows behind, crushing corporate dominance aura, cold calculating eyes |
| boss_dragon_elder | supreme minister of bureaucratic control, formal government attire with excessive medals and sashes, ancient authority emanating from every pore, official seal stamp raised like a scepter, mountain of regulations behind, absolute order aura |
| boss_shadow_monarch | transcendent AI emperor, figure half-digital half-physical, holographic fragments forming a regal silhouette, data streams as flowing robes, crown of floating code, one eye human one eye pure light, ultimate digital godhood, reality-bending power |

**Step 2: SCP script to remote PC and execute**

```bash
scp -i ~/.ssh/id_ed25519_remote_pc scripts/generate_bosses.py michi@192.168.1.222:C:/Users/michi/ComfyUI/generate_bosses.py
ssh -i ~/.ssh/id_ed25519_remote_pc michi@192.168.1.222 "cd C:\Users\michi\ComfyUI && python generate_bosses.py"
```

**Step 3: SCP results back and rename**

```bash
mkdir -p /tmp/boss_sprites
scp -i ~/.ssh/id_ed25519_remote_pc "michi@192.168.1.222:C:/Users/michi/ComfyUI/output/boss_sprites/*" /tmp/boss_sprites/
```

Map outputs to existing filenames:
```bash
cp /tmp/boss_sprites/boss_goblin_king_00001_.png public/assets/sprites/enemies/boss_goblin_king.png
cp /tmp/boss_sprites/boss_wolf_alpha_00001_.png public/assets/sprites/enemies/boss_wolf_alpha.png
cp /tmp/boss_sprites/boss_lich_00001_.png public/assets/sprites/enemies/boss_lich.png
cp /tmp/boss_sprites/boss_ogre_00001_.png public/assets/sprites/enemies/boss_ogre.png
cp /tmp/boss_sprites/boss_demon_lord_00001_.png public/assets/sprites/enemies/boss_demon_lord.png
cp /tmp/boss_sprites/boss_dragon_elder_00001_.png public/assets/sprites/enemies/boss_dragon_elder.png
cp /tmp/boss_sprites/boss_shadow_monarch_00001_.png public/assets/sprites/enemies/boss_shadow_monarch.png
```

**Step 4: Verify all 7 boss images**

```bash
for boss in boss_goblin_king boss_wolf_alpha boss_lich boss_ogre boss_demon_lord boss_dragon_elder boss_shadow_monarch; do
  file public/assets/sprites/enemies/$boss.png
done
```

**Step 5: Commit**

```bash
git add scripts/generate_bosses.py public/assets/sprites/enemies/boss_*.png
git commit -m "art: replace 7 boss sprites with Pokemon rival/gym leader style"
```

---

## Task 4: Generate Floor Backgrounds (42 images = 7 floors x 6 each)

**Files:**
- Create: `scripts/generate_floor_backgrounds.py`
- Output to: `public/assets/backgrounds/floor{N}.png`, `floor{N}_{V}.png`

**Step 1: Write the generation script**

Create `scripts/generate_floor_backgrounds.py` with these specifications:

- Resolution: 1536x1024
- No background removal (these ARE backgrounds)
- Output subfolder: `floor_backgrounds/`
- Each floor has 1 main + 5 variants = 6 images per floor

Style prompt:
```
anime illustration, bright colorful cityscape, clean lines, warm sunlight, blue sky with white clouds, slightly futuristic, holographic signs, sleek modern architecture, lush green trees, vibrant saturated colors, no people, game background art, detailed, high quality, anime game environment
```

Negative prompt:
```
dark, gritty, cyberpunk, neon, rain, night, people, characters, person, text, watermark, blurry, low quality, desaturated, gloomy, horror, scary, pokeball, pokeballs, poke ball
```

**Enhanced descriptions for each floor (main + 5 variants):**

| File | Description |
|------|-------------|
| floor1 | breathtaking panorama of Nerima ward, quiet residential Tokyo neighborhood, traditional low-rise houses with modern touches, cherry blossom trees lining a pristine sidewalk, futuristic mailboxes with holographic displays, morning golden light, peaceful suburban anime paradise |
| floor1_1 | serene Nerima residential park, lush green playground with sleek benches, holographic information board, apartment buildings in background, children's play equipment with subtle tech upgrades, afternoon sunlight filtering through maple trees |
| floor1_2 | charming Nerima shopping street, small family-run shops with traditional noren curtains and holographic price signs, potted plants on sidewalk, bicycle parking area, warm inviting storefronts, golden hour light |
| floor1_3 | peaceful Nerima canal path, walking trail alongside crystal-clear water, weeping willows with bioluminescent tips, small bridges with modern railings, residential towers in distance, spring afternoon |
| floor1_4 | cozy Nerima side street, vending machines with holographic drink displays, narrow road between houses, potted flowers on window sills, utility poles with subtle tech upgrades, late afternoon shadows |
| floor1_5 | quiet Nerima temple grounds, traditional shrine gate with holographic charms, stone lanterns mixed with floating light orbs, ancient trees in manicured garden, spiritual tranquility meets subtle technology |
| floor2 | vibrant panorama of Nakano ward, famous Broadway shopping complex with futuristic glass facade, colorful anime billboards and holographic advertisements, bustling shopping arcade entrance, bright midday energy |
| floor2_1 | Nakano Broadway interior atrium, multi-level shopping floors visible, manga and figure shops with glowing displays, escalators with holographic railings, otaku paradise with futuristic retail technology |
| floor2_2 | trendy Nakano backstreet, vintage clothing stores with AR mirror displays, indie cafes with floating menu boards, artistic graffiti murals, hipster Tokyo neighborhood feel, warm afternoon colors |
| floor2_3 | Nakano Sun Mall shopping arcade, covered pedestrian street, hanging holographic banners, traditional shops upgraded with digital signage, fruit stands and bakeries, lively market atmosphere |
| floor2_4 | Nakano residential tower district, modern apartment complexes with rooftop gardens, community bulletin boards with holographic postings, bike-share stations, clean organized neighborhood, blue sky |
| floor2_5 | Nakano station plaza, open area with futuristic bus stops, digital map kiosks, small park with holographic fountain, surrounding shops, gateway between old and new Tokyo |
| floor3 | stunning Shinjuku skyline, towering glass skyscrapers reflecting sunlight, holographic corporate logos floating between buildings, elevated walkways connecting towers, blue sky with dramatic clouds, overwhelming urban grandeur |
| floor3_1 | Shinjuku west exit plaza, massive open area with futuristic sculptures, government building in background, holographic wayfinding displays, elevated highways with sleek vehicles, metropolitan scale |
| floor3_2 | Shinjuku golden street reimagined, narrow alley of tiny bars upgraded with holographic signs, lanterns mixing warm orange with cool blue tech, intimate urban atmosphere but bright and inviting |
| floor3_3 | Shinjuku central park area, green oasis surrounded by skyscrapers, holographic art installations floating above pond, modern bridges, nature meeting technology in harmony, peaceful contrast to urban density |
| floor3_4 | Shinjuku transit hub, massive modern station exterior, flowing crowds replaced by empty clean platforms, departure boards with holographic schedules, impressive architectural glass and steel canopy |
| floor3_5 | Shinjuku department store district, luxury shopping towers with AR window displays, wide boulevards with holographic street art, fashion billboards, upscale urban sophistication, late afternoon golden light |
| floor4 | iconic Shibuya crossing reimagined, massive intersection surrounded by screens and holographic billboards, futuristic Hachiko statue with AR elements, glass architecture reflecting sky, vibrant saturated Tokyo landmark |
| floor4_1 | Shibuya center street, pedestrian shopping road with floating holographic advertisements, trendy fashion stores with AR displays, modern street lamps, youth culture meets futuristic design |
| floor4_2 | Shibuya stream area, sleek modern development along urban river, glass walkways over water, holographic art on building facades, green terraces on rooftops, contemporary Tokyo architecture |
| floor4_3 | Shibuya sky observation area, rooftop view looking over the ward, holographic information overlays on landmarks, helicopter pad with AR markers, breathtaking elevated cityscape panorama |
| floor4_4 | Shibuya Miyashita park, elevated urban park with futuristic playground, holographic billboards visible from park, skate area with AR obstacles, modern green space surrounded by glass towers |
| floor4_5 | Shibuya Mark City entrance, covered walkway with digital ceiling displays, modern escalators, luxury brand stores with holographic mannequins, dramatic architectural canopy design |
| floor5 | dazzling Akihabara electric town, buildings covered floor-to-ceiling in colorful anime billboards and LED screens, holographic mascot characters floating above storefronts, electronics paradise, overwhelming vibrant sensory feast |
| floor5_1 | Akihabara main street, famous electronics district with futuristic shop facades, holographic product demonstrations in mid-air, arcade entrances with AR effects, pure concentrated pop culture energy |
| floor5_2 | Akihabara side alley, smaller specialty electronics shops, component stores with holographic schematics on display, cables and circuit boards aesthetic, hidden tech treasures, warm lighting |
| floor5_3 | Akihabara radio center area, dense collection of tiny electronic component shops, holographic price tags floating, vintage meets futuristic, labyrinthine shopping complex, blue and warm mixed lighting |
| floor5_4 | Akihabara UDX building area, modern architecture contrasting with classic electric town, large open plaza with holographic event displays, convention center aesthetic, impressive modern structure |
| floor5_5 | Akihabara station area, transit hub surrounded by electronics mega-stores, massive holographic advertisements, digital billboards stacked stories high, anime character projections, electric energy everywhere |
| floor6 | majestic Chiyoda ward, imposing government buildings with neoclassical architecture upgraded with holographic national emblems, wide pristine boulevards, meticulously manicured trees, institutional power and beauty |
| floor6_1 | Imperial Palace outer gardens from Chiyoda, ancient stone walls meeting futuristic Tokyo skyline, moat with crystal-clear water, perfectly maintained pine trees, bridge with subtle tech railings, timeless beauty |
| floor6_2 | Chiyoda Marunouchi business district, red-brick historic buildings with holographic facades, tree-lined boulevard, luxury car-free streets, European-Tokyo fusion architecture, golden afternoon light |
| floor6_3 | National Diet Building area, impressive government architecture with subtle holographic security, wide ceremonial approach, cherry trees in bloom, institutional grandeur meeting subtle futurism |
| floor6_4 | Chiyoda Yasukuni shrine approach, long tree-lined avenue with floating lanterns, traditional torii gate with AR spiritual energy, stone paths, autumn leaves mixed with holographic particles |
| floor6_5 | Chiyoda Kitanomaru park, traditional Japanese garden with futuristic subtle touches, pond with holographic koi fish, maple trees, tea house with modern glass, serene contemplative atmosphere |
| floor7 | breathtaking Imperial Palace main gate, ancient traditional architecture with otherworldly holographic barrier, most advanced technology guarding most traditional space, dramatic sky, ultimate fusion of old and new Japan |
| floor7_1 | Imperial Palace east gardens, meticulously maintained traditional garden with hidden advanced technology, stone walls with holographic historical overlays, season flowers in perfect bloom, inner sanctum tranquility |
| floor7_2 | Imperial Palace bridge (Nijubashi), famous double-bridge with futuristic upgrades, holographic imperial crest above, reflection in still moat water, guard house with subtle tech, iconic view |
| floor7_3 | Imperial Palace inner courtyard, most restricted area visible for first time, traditional architecture at its finest with ultimate technology hidden within, zen garden with AR elements, peak beauty |
| floor7_4 | Imperial Palace tower (tenshu-dai), stone foundation of ancient tower, holographic reconstruction of original castle tower visible above, historical and futuristic layers overlapping, dramatic clouds |
| floor7_5 | Imperial Palace throne room approach, long ceremonial hallway, sliding doors with holographic imperial motifs, most ornate traditional architecture with invisible technology, ultimate power and tradition |

**Step 2: SCP script to remote PC and execute**

```bash
scp -i ~/.ssh/id_ed25519_remote_pc scripts/generate_floor_backgrounds.py michi@192.168.1.222:C:/Users/michi/ComfyUI/generate_floor_backgrounds.py
ssh -i ~/.ssh/id_ed25519_remote_pc michi@192.168.1.222 "cd C:\Users\michi\ComfyUI && python generate_floor_backgrounds.py"
```

Note: 42 images at 1536x1024 = longer per image, ~35-45 minutes total.

**Step 3: SCP results back and rename**

```bash
mkdir -p /tmp/floor_backgrounds
scp -i ~/.ssh/id_ed25519_remote_pc "michi@192.168.1.222:C:/Users/michi/ComfyUI/output/floor_backgrounds/*" /tmp/floor_backgrounds/
```

Map outputs to filenames:
```bash
cp /tmp/floor_backgrounds/floor1_00001_.png public/assets/backgrounds/floor1.png
cp /tmp/floor_backgrounds/floor1_1_00001_.png public/assets/backgrounds/floor1_1.png
# ... etc for all 42
```

**Step 4: Verify all 42 floor backgrounds**

```bash
ls public/assets/backgrounds/floor*.png | wc -l
# Should be 42 (7 main + 35 variants)
```

**Step 5: Commit**

```bash
git add scripts/generate_floor_backgrounds.py public/assets/backgrounds/floor*.png
git commit -m "art: replace 42 floor backgrounds with bright anime cityscape style"
```

---

## Task 5: Generate Location & Special Backgrounds (11 images)

**Files:**
- Create: `scripts/generate_special_backgrounds.py`
- Output to: `public/assets/backgrounds/hub.png`, `dungeon.png`, and `locations/*.png`

**Step 1: Write the generation script**

Same style/negative as floor backgrounds. Resolution: 1536x1024. No background removal.
Output subfolder: `special_backgrounds/`

**Enhanced descriptions:**

| File | Description |
|------|-------------|
| hub | breathtaking futuristic Tokyo command center hub, sleek holographic control room with panoramic city view through massive windows, floating data displays, comfortable gaming chair setup, player's personal base of operations, warm ambient lighting with cool tech accents, anime game main menu environment |
| dungeon | mysterious underground Tokyo maintenance tunnel reimagined as anime dungeon, clean industrial pipes with glowing energy lines, emergency lighting creating dramatic shadows, locked doors with holographic seals, sense of hidden depths beneath the city, adventurous atmosphere |
| locations/residential | bright cheerful anime residential street, traditional houses with colorful roofs, flower gardens, friendly neighborhood atmosphere, warm sunlight, picket fences with holographic house numbers, peaceful suburban paradise |
| locations/convenience | cheerful anime convenience store interior, well-lit clean shelves stocked with colorful products, friendly atmosphere, warm fluorescent lighting, modern register with holographic display, welcoming store environment |
| locations/school | bright anime school hallway, clean polished floors, shoe lockers, bulletin boards with student artwork, large windows with sunlight streaming in, cherry blossoms visible outside, warm educational atmosphere |
| locations/shopping | vibrant anime shopping mall interior, colorful storefronts, escalators, bright displays, holographic sale signs, cheerful retail environment, open atrium with skylights, warm inviting commercial space |
| locations/restaurant | cozy anime japanese restaurant interior, warm wooden counter, appetizing food displays, paper lanterns, traditional decor with modern touches, inviting atmosphere, steam rising from kitchen |
| locations/station | bright anime train station platform, clean modern design, departure boards, vending machines, clear blue sky visible above, organized platform markers, pleasant transit environment |
| locations/office | modern anime office space, clean desks with plants, large windows showing city view, whiteboard with colorful notes, bright natural lighting, organized professional environment, motivational posters |
| locations/government | stately anime government building interior, marble floors, official notices, service windows, organized waiting area, dignified but approachable atmosphere, national flags, official seals |
| locations/hospital | clean bright anime hospital corridor, white walls with cheerful artwork, nurse station, medicine cabinet, reassuring atmosphere, warm sunlight from windows, healing environment |

**Step 2-5: Same pattern as Task 4** (SCP, execute, retrieve, rename, verify, commit)

```bash
git add scripts/generate_special_backgrounds.py public/assets/backgrounds/hub.png public/assets/backgrounds/dungeon.png public/assets/backgrounds/locations/*.png
git commit -m "art: replace hub, dungeon, and 9 location backgrounds with anime style"
```

---

## Task 6: Delete Unused Old Fantasy Sprites

**Files:**
- Delete: Old fantasy enemy sprites that are no longer referenced

**Step 1: Remove unused fantasy sprites**

These files exist in `public/assets/sprites/enemies/` but are not referenced by any enemy in `data/enemy-mappings.json`:

```bash
rm public/assets/sprites/enemies/demon.png
rm public/assets/sprites/enemies/dragon.png
rm public/assets/sprites/enemies/goblin.png
rm public/assets/sprites/enemies/golem.png
rm public/assets/sprites/enemies/knight.png
rm public/assets/sprites/enemies/mage.png
rm public/assets/sprites/enemies/orc.png
rm public/assets/sprites/enemies/skeleton.png
rm public/assets/sprites/enemies/shadow.png
rm public/assets/sprites/enemies/slime.png
rm public/assets/sprites/enemies/wolf.png
rm public/assets/sprites/enemies/enemy.png
```

**Step 2: Delete old chip icons that aren't in the new 20-chip set**

The game now uses only 20 chips (defined in `data/chips.json`). Remove all other chip icons from `public/assets/icons/chips/` that don't match one of: battery, speaker, glasses, lightbulb, scissors, clock, charcoal, book, eraser, onigiri, wallet, straw, key, egg, fireworks, mirror, feather, drum, magnifyingGlass, toolbox.

```bash
# Keep only the 20 active chip icons, remove everything else
cd public/assets/icons/chips/
for f in *.png; do
  name="${f%.png}"
  case "$name" in
    battery|speaker|glasses|lightbulb|scissors|clock|charcoal|book|eraser|onigiri|wallet|straw|key|egg|fireworks|mirror|feather|drum|magnifyingGlass|toolbox) ;;
    *) rm "$f" ;;
  esac
done
```

**Step 3: Commit cleanup**

```bash
git add -u public/assets/sprites/enemies/ public/assets/icons/chips/
git commit -m "chore: remove unused fantasy sprites and old chip icons"
```

---

## Task 7: Add Missing Chips to Data

**Files:**
- Modify: `data/chips.json`

**Step 1: Add magnifyingGlass and toolbox chips**

The design spec mentions 20 chips but `data/chips.json` currently has 18. Add the 2 missing ones:

Add to `data/chips.json`:
```json
"magnifyingGlass": {
  "id": "magnifyingGlass",
  "name": "虫眼鏡ボット",
  "nameEn": "Magnifying Glass Bot",
  "description": "弱点を見つける探偵。クリティカル率+15%。真実はいつも一つ！",
  "descriptionEn": "Detective that finds weak points. +15% critical rate. The truth is always one!",
  "category": "passive",
  "rarity": "rare",
  "effects": {
    "passive": {
      "type": "statBoost",
      "stat": "CRI",
      "value": 15,
      "displayText": "+15% CRI"
    }
  },
  "skill": {
    "id": "investigate",
    "name": "調査",
    "nameEn": "Investigate",
    "description": "次の攻撃は必ずクリティカル",
    "descriptionEn": "Next attack is guaranteed critical hit",
    "type": "buff",
    "buffType": "GUARANTEED_CRIT",
    "effect": { "guaranteedCrit": true },
    "chargesRequired": 6
  }
},
"toolbox": {
  "id": "toolbox",
  "name": "工具箱ボット",
  "nameEn": "Toolbox Bot",
  "description": "なんでも直す修理屋。毎ターンHP3回復。頼れる相棒！",
  "descriptionEn": "Handyman that fixes everything. Heals 3 HP per turn. A reliable partner!",
  "category": "passive",
  "rarity": "uncommon",
  "effects": {
    "passive": {
      "type": "regen",
      "value": 3,
      "displayText": "+3 HP/turn"
    }
  },
  "skill": {
    "id": "overhaul",
    "name": "オーバーホール",
    "nameEn": "Overhaul",
    "description": "HPを25回復する",
    "descriptionEn": "Restore 25 HP",
    "type": "heal",
    "effect": { "healAmount": 25 },
    "chargesRequired": 7
  }
}
```

**Step 2: Commit**

```bash
git add data/chips.json
git commit -m "feat: add magnifyingGlass and toolbox chip definitions"
```

---

## Task 8: Run E2E Tests to Verify Nothing Broke

**Step 1: Run syntax check on modified files**

```bash
node --check public/js/game.js && echo "OK"
```

**Step 2: Run unit tests**

```bash
npm run test:unit
```

**Step 3: Run full e2e test suite**

```bash
./scripts/e2e-test.sh
```

Expected: 80+/87 passing (known flakiness threshold).

**Step 4: Final commit if any fixes needed**

If tests reveal issues with the new chip definitions or missing asset references, fix and commit.

---

## Task 9: Clean Up Generation Scripts

**Step 1: Remove old generation scripts from project root**

```bash
rm generate_chip_icons.py generate_location_backgrounds.py
```

**Step 2: Commit**

```bash
git add -u generate_chip_icons.py generate_location_backgrounds.py
git commit -m "chore: remove old generation scripts (replaced by scripts/ versions)"
```

---

## Execution Order Summary

| Task | Images | Depends On |
|------|--------|------------|
| 1. Chips | 20 | None |
| 2. Enemies | 48 | None |
| 3. Bosses | 7 | None |
| 4. Floor BGs | 42 | None |
| 5. Special BGs | 11 | None |
| 6. Cleanup | 0 | Tasks 1-5 |
| 7. New Chip Data | 0 | None |
| 8. E2E Tests | 0 | Tasks 1-7 |
| 9. Script Cleanup | 0 | Tasks 1-5 |

Tasks 1-5 can run in parallel (each is an independent generation batch). Tasks 6-9 are sequential post-generation cleanup.

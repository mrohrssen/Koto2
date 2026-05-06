# Creature and Move Expansion Learnset Ledger

**Date:** 2026-05-06  
**Purpose:** Human-authored design record for the approved creature/move expansion.

## Rules

- No algorithmic moveset assignment.
- No score-based candidate selection.
- No auto-filled leftover moves.
- Scripts may only import rows and validate the authored result.
- Every move listed here must have a creature-specific fantasy, balance, or vocabulary reason.

## Creature Learnsets

### hikari / Light / 光

Role read: Common metal Mage with low bulk and high MP. Light should feel like a crisp early caster: accurate, bright, and supportive before it becomes party utility.

Progression intent: It starts with the simplest targeting verb, then learns flash/pierce vocabulary through rays of light. Its late kit supports the team with shine and finishes as a broad illumination move.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | ateru | Hit | A basic high-frequency action that reads as a small light beam landing on target. |
| 5 | hirameku | Flash | Light's first true identity move: a gleam that can stun without being too powerful. |
| 10 | kizamu | Mince | Thin blades of light carve the target and introduce a defense-down rider. |
| 16 | hikaru | Shine | Party dex plus cleanse is support-caster identity, held until after basic attacks. |
| 24 | terasu | Illuminate | The capstone turns single light into battlefield light, with confuse as a visual dazzle rider. |
| 34 | tatsu | Sever | A late precise beam that cuts through defenses, giving this common caster one sharp high-level payoff. |

Coverage notes: `kizamu` and `tatsu` are placed here as ray/blade-light verbs, not as generic sword leftovers.

### tsuki / Moon / 月

Role read: Common metal Mage with calm MP and slower dex than Star. Moon should feel quiet, reflective, and status-leaning rather than explosive.

Progression intent: It starts with a tiny metal poke like a crescent point. It later gains wavering moonlight, a lullaby-like song, and a gravity/sinking finisher.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsuku | Poke | The crescent moon is a small point, so a basic poke is readable and safe at level 1. |
| 7 | yuragu | Sway | Wavering moonlight causing confuse fits a calm trick-mage identity. |
| 16 | utau | Sing | Moonlit song is a classic sleep/control image, delayed because it hits all enemies. |
| 28 | shizumu | Sink | Late gravity/tide imagery gives Moon a stronger control finish. |

Coverage notes: Moon carries lower-force control verbs that fit its soft pacing.

### kage / Shadow / 影

Role read: Uncommon water Trickster with high dex and low bulk. Shadow should win through tempo, concealment, and control.

Progression intent: It begins as a graze/steal attacker, then learns to sink, flank, curse, and finally imprison. The kit is mostly neutral/water control with no honest reason for heavy damage.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kasumeru | Steal | A shadow grazing past the target and stealing tempo is the cleanest opener. |
| 6 | shizumu | Sink | Shadows pull enemies downward and reduce dex. |
| 12 | mawarikomu | Flank | High dex tricksters should learn movement-based self-tempo. |
| 20 | norou | Curse | Supernatural shadow pressure lowers attack and confuses. |
| 30 | tojikomeru | Imprison | The late identity is trapping the target inside darkness. |

Coverage notes: This is a pure trickster-control kit; each move supports evasive pressure.

### hoshi / Star / 星

Role read: Common metal Mage, fragile and slightly faster than Moon. Star should be sharper and more projectile-like than Light or Moon.

Progression intent: It begins with a tiny point attack, learns to shoot and aim, then pierces through with a late starbeam before finishing with area illumination.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsuku | Poke | A star point is a natural basic metal poke. |
| 6 | utsu_shoot | Shoot | Star as a small projectile is immediate and readable. |
| 12 | nerau | Take Aim | Precision aiming rewards its faster caster profile. |
| 20 | tsukinukeru | Pierce Through | A starbeam piercing through is a stronger mid-late projectile. |
| 30 | terasu | Illuminate | Late starlight becomes area dazzle. |

Coverage notes: `tsukinukeru` is here for projectile fantasy, distinct from animal horns or blades.

### uma / Horse / 馬

Role read: Common earth Fighter with above-average attack and dex. Horse should be all movement, impact, and hooves.

Progression intent: It starts with a kick, then learns body impact, running tempo, dashing, and finally trampling. This is a simple high-exposure physical kit.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | keru | Kick | The most readable horse opener and a useful common combat verb. |
| 6 | butsukeru | Impact | A horse can shoulder-check or crash into the target. |
| 12 | hashiru | Run | Mobility comes before the big payoff and teaches a high-frequency verb. |
| 20 | kakeru | Dash | Stronger running tempo makes the fighter feel faster. |
| 30 | fumitsukeru | Trample | The late horse identity is hooves and weight. |

Coverage notes: This kit is intentionally mundane and learner-friendly.

### yuki / Snow / 雪

Role read: Common water Mage with control flavor and moderate dex. Snow should feel cold, soft, and gradually more dangerous.

Progression intent: It begins with melt because that is a simple water/ice interaction, then freezes, trembles, and finally rains down as weather. Its status arrives after the starter move.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tokeru | Melt | A safe level-1 water damage move that directly teaches the snow/ice relationship. |
| 7 | kooritsuku | Freeze | Sleep-control is core to snow but too strong for level 1. |
| 16 | furueru | Tremble | Shivering from cold becomes all-enemy dex/stun pressure. |
| 28 | furisosogu | Rain Down | Late snowfall becomes a projectile shower. |

Coverage notes: Snow carries the cold-weather branch without becoming an Ice duplicate.

### oni / Oni / 鬼

Role read: Rare fire Fighter with high HP/attack and deliberately low dex. Oni should feel blunt, loud, and terrifying.

Progression intent: It begins with punch language, escalates into hard punch, char, slam, rampage, and final team fight. Its fire is rough heat rather than elegant spellcasting.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | naguru | Punch | Direct brawler verb for an oni opener. |
| 5 | bunnaguru | Heavy Punch | Rare fighter earns the stronger colloquial hit early-mid. |
| 10 | kogeru | Char | Oni heat is crude scorching rather than refined flame. |
| 16 | tatakitsukeru | Slam | Big-body violence with stun chance. |
| 24 | abareru | Rampage | Violent all-enemy chaos matches oni fantasy. |
| 34 | tatakau | Fight | A rare leader/brute can rally the whole side into warlike attack. |

Coverage notes: Oni covers both physical violence and one coarse fire-result verb.

### kumo / Cloud / 雲

Role read: Common water Mage with soft evasive stats. Cloud should drift, float, wrap, and eventually pour.

Progression intent: It starts with a harmless bounce, then learns float, gust, enveloping fog, and drench. It is control/weather support rather than raw damage.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | haneru | Bounce | A soft cloud bobbing into the target is safe and cute. |
| 6 | ukabu | Float | Levitation is the defining cloud movement. |
| 12 | fuku | Gust | Wind/breath motion fits cloud drift and introduces area damage. |
| 20 | tsutsumikomu | Envelop | Fog/cloud cover wraps all enemies and lowers dex. |
| 30 | abiru | Drench | Late cloud support becomes cleansing rain. |

Coverage notes: `tsutsumikomu` belongs here because clouds literally wrap the field.

### ryuu / Dragon / 竜

Role read: Legendary fire Fighter with boss-tier all-rounder stats. Dragon should feel like the top of the current roster.

Progression intent: It opens with a direct burn, then adds knockback breath, eruption, blaze, ruin, and a finishing blow. The kit should be heavy, dramatic, and late-game.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | moyasu | Ignite | A dragon's first move is setting something on fire. |
| 5 | futtobasu | Blow Away | Wing/breath force pushes the field around. |
| 10 | fuku_erupt | Erupt | Breath becomes eruption-level fire. |
| 16 | moesakaru | Blaze | Sustained all-enemy fire is legendary pressure. |
| 24 | horobosu | Ruin | Dragon earns a severe dramatic neutral destroy verb. |
| 34 | todomewosasu | Finishing Blow | Boss-tier finisher with stun chance. |

Coverage notes: Dragon intentionally carries some of the strongest verbs.

### kaminari / Thunder / 雷

Role read: Uncommon metal Mage with high dex. Thunder should preview tempo, aim, and reverberating battlefield pressure.

Progression intent: It starts with Flash, moves into shooting and aiming, then illumination, unleashing, and a roaring reverberation. Metal covers lightning/light in this element model.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | hirameku | Flash | Lightning flash is a legal single-target opener with light stun. |
| 5 | utsu_shoot | Shoot | Lightning as a shot gives a clean projectile step. |
| 10 | nerau | Take Aim | Tempo caster learns precision before area pressure. |
| 16 | terasu | Illuminate | Thunderstorm brightness dazzles all enemies. |
| 24 | kuridasu | Unleash | Releasing a stored bolt fits a lightning mage. |
| 34 | todoroku | Reverberate | Thunder's late identity is a field-wide roar. |

Coverage notes: `kuridasu` is placed as unleashing a bolt, not as generic filler.

### hebi / Snake / 蛇

Role read: Uncommon earth Trickster with high dex and low bulk. Snake should be poison, constriction, and curse-like pressure.

Progression intent: It opens with Spit, grows into stronger poison output, then constricts, coils, drains through bite, and curses. Wood off-element is justified by venom, fangs, and binding anatomy.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | haku | Spit | Basic venom spit is allowed at level 1 and iconic. |
| 5 | hakidasu | Spew | Stronger poison breath once the kit has started. |
| 10 | shimeru | Tighten | Constriction is core snake control. |
| 16 | matsuwaru | Coil Around | Full coil plus dex debuff/stun becomes midgame lockdown. |
| 24 | kuikomu | Bite Into | Fang drain/poison gives sustain without making it a healer. |
| 34 | norou | Curse | Late serpent menace becomes supernatural pressure. |

Coverage notes: Snake is one of the few earth creatures with strong wood move justification.

### yuurei / Ghost / 幽霊

Role read: Rare water Trickster with high MP/dex and low defense. Ghost should be evasive, weird, and oppressive.

Progression intent: It begins with a twisting confuse hit, then curse, imprison, wipe away, escape, and sink. It controls the enemy while refusing to stay pinned down.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | hineru | Twist | A ghost warps space/body for a basic confuse-capable opener. |
| 5 | norou | Curse | Classic ghost move, delayed past level 1 because it is pure debuff. |
| 10 | tojikomeru | Imprison | Haunting confinement fits ghost control. |
| 16 | keshisaru | Wipe Away | Vanishing/banishing damage is a late ghost attack. |
| 24 | nogareru | Escape | Ghost support identity includes slipping free and cleansing. |
| 34 | shizumu | Sink | Final pressure pulls the enemy into dark water/shadow. |

Coverage notes: Ghost shares some Shadow space but leans more supernatural.

### ookami / Wolf / 狼

Role read: Uncommon earth Fighter with high attack and dex. Wolf should be pursuit, pack intimidation, and tearing.

Progression intent: It starts with Bite, then pounces, chases, growls, shouts, and finally rips apart. Neutral sound buffs/debuffs express pack tactics.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kamu | Bite | Essential wolf opener. |
| 5 | osoikakaru | Pounce | Predator ambush adds dex pressure. |
| 10 | oikakeru | Chase | Pursuit raises attack/dex and teaches movement vocabulary. |
| 16 | unaru | Growl | Pack intimidation lowers all enemy attack. |
| 24 | sakebu | Shout | Pack howl becomes team attack support. |
| 34 | hikisaku | Rip Apart | Apex late fang/claw damage. |

Coverage notes: Wolf gets both growl and shout because pack voice matters.

### ushi / Cow / 牛

Role read: Uncommon earth Tank/Healer with very high HP/defense and low dex. Cow should be sturdy, protective, and gentle.

Progression intent: It starts with a hoof stomp, learns to pin, brace, challenge, protect, and finally heal. The kit moves from body mass to herd guardian.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | fumu | Stomp | Simple hoof attack, legal and readable. |
| 5 | osaetsukeru | Pin Down | Heavy body pins the target. |
| 10 | funbaru | Stand Firm | Tank identity through planted feet. |
| 16 | idomu | Challenge | Taunt plus stats makes Cow a frontline protector. |
| 24 | kabau | Protect | Herd guardian support. |
| 34 | iyasu | Heal | Gentle late support, not available early. |

Coverage notes: Cow earns healing through temperament, not magic.

### kuma / Bear / 熊

Role read: Rare earth Tank/Healer bruiser with unusually high attack. Bear should be slow but terrifying in close range.

Progression intent: It opens with Gnaw, then Crush, Squash, Stand Firm, Guard Stance, and Crush Flat. It is the tank that can also end fights.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kajiru | Gnaw | Bear bite opener that is softer than full Bite. |
| 5 | kudaku | Crush | Claw/jaw pressure breaks defense. |
| 10 | oshitsubusu | Squash | Weight-based single-target damage. |
| 16 | funbaru | Stand Firm | Slow defensive posture. |
| 24 | migamaeru | Guard Stance | A second defensive stance fits a durable rare tank. |
| 34 | tatakitsubusu | Crush Flat | Late bear payoff: overwhelming blunt force. |

Coverage notes: Bear intentionally has more damage than other Tank/Healers.

### saru / Monkey / 猿

Role read: Uncommon wood Trickster with agile stats. Monkey should throw, scratch, yell, corner, and evade.

Progression intent: It starts with Throw, gains Hurl and Scratch, then Yell, Corner, and Dodge. The kit is mischievous physical disruption.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | nageru | Throw | Monkeys throwing things is immediate and learner-friendly. |
| 5 | houru | Hurl | A stronger throwing verb after the basic throw. |
| 10 | kaku_scratch | Scratch | Claws/hands add wood damage. |
| 16 | donaru | Yell | Loud mischief becomes confuse/attack debuff. |
| 24 | oitsumeru | Corner | Trickster pressure and positional play. |
| 34 | kawasu | Dodge | High-dex capstone. |

Coverage notes: Monkey carries `donaru` because angry yelling is more comic/trickster than heroic.

### buta / Pig / 豚

Role read: Uncommon earth Tank/Healer with compact bulk. Pig should be squat, stubborn, and bodily.

Progression intent: It starts with Stomp, rolls over, inhales, clenches, braces, and finally smashes. This is a bruiser-tank without magical support.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | fumu | Stomp | Hoof/body opener. |
| 5 | korogasu | Roll Over | Pig body comedy becomes knockover damage. |
| 10 | suikomu | Inhale | Snout/vacuum fantasy with drain and dex debuff. |
| 16 | nigirishimeru | Clench | Compact bracing raises attack and defense. |
| 24 | funbaru | Stand Firm | Stubborn planted tank identity. |
| 34 | tsubusu | Smash | Late body slam payoff. |

Coverage notes: Pig is the natural home for `suikomu` among land tanks.

### tora / Tiger / 虎

Role read: Rare fire Fighter with high attack and dex. Tiger should be fast predator burst.

Progression intent: It starts with Scratch, then Rip, Rip Apart, Pounce, Rend, and Cut Apart. The fire element is expressed through predator intensity rather than literal fire moves.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kaku_scratch | Scratch | Claw opener. |
| 5 | saku | Rip | Shorter tearing verb as early upgrade. |
| 10 | hikisaku | Rip Apart | Bigger claw damage. |
| 16 | osoikakaru | Pounce | Ambush speed and dex pressure. |
| 24 | kirisaku | Rend | Metal-like sharpness through claws. |
| 34 | tachikiru | Cut Apart | Rare apex predator finisher. |

Coverage notes: Off-element metal cuts are justified by claws, not weapons.

### shika / Deer / 鹿

Role read: Uncommon wood Fighter with graceful high dex. Deer should fight with antlers and movement.

Progression intent: It starts with Thrust, then Stab, Jump Down, Run, Charge, and Pierce. The kit is elegant linear force.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsukidasu | Thrust | Basic antler thrust. |
| 5 | tsukisasu | Stab | Sharper antler follow-up. |
| 10 | tobioriru | Jump Down | Leaping deer attack. |
| 16 | hashiru | Run | Graceful movement before bigger charge. |
| 24 | tsukkomu | Charge | Antler charge with dex pressure. |
| 34 | tsuranuku | Pierce | Late antler/lance payoff. |

Coverage notes: Deer carries several pierce verbs because antlers make them distinct.

### yousei / Fairy / 妖精

Role read: Rare wood Mage with fragile bulk and very high MP/dex. Fairy should be fast, charming, and supportive.

Progression intent: It opens with Scratch as tiny mischief, then Sing, Scatter, Shine, Heal, and Summon. The late kit becomes team support and magical invitation.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kaku_scratch | Scratch | Tiny fairy mischief without early support. |
| 5 | utau | Sing | Sleep song is classic fairy magic. |
| 10 | chirasu | Scatter | Pollen/sparkle scatter lowers enemy dex. |
| 16 | hikaru | Shine | Cleansing light fits fairy support. |
| 24 | iyasu | Heal | Rare support mage earns party heal late. |
| 34 | yobidasu | Summon | Fairy circle calling allies is the capstone. |

Coverage notes: Fairy carries support density but still has early damage.

### kitsune / Fox / 狐

Role read: Rare fire Trickster with high dex. Fox should be clever, dazzling, and slippery.

Progression intent: It starts with Scorch, steals tempo, roasts, glares, shakes off status, and wipes away. This is fire plus illusion/trickery.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kogasu | Scorch | A small foxfire burn is the clean opener. |
| 5 | kasumeru | Steal | Trickster theft/graze. |
| 10 | yaku | Roast | Stronger transitive burn, still concrete. |
| 16 | niramu | Glare | Fox intimidation/illusion debuff. |
| 24 | furikiru | Shake Off | Slippery self-cleanse and dex. |
| 34 | keshisaru | Wipe Away | Late vanishing foxfire strike. |

Coverage notes: Fox is the best fit for `niramu` among fire tricksters.

### hitsuji / Sheep / 羊

Role read: Uncommon wood Tank/Healer with gentle support bulk. Sheep should protect, bind with wool, and heal softly.

Progression intent: It begins with Gnaw, then wool binding, cover, guard stance, wash, and heal. The kit is safe, gentle, and defensive.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kajiru | Gnaw | Soft herbivore bite as basic damage. |
| 5 | musubu | Bind | Wool tying/binding is the key sheep-specific control. |
| 10 | oou | Cover | Woolly cover protects allies. |
| 16 | migamaeru | Guard Stance | Defensive tank posture. |
| 24 | arau | Wash | Gentle cleanse/heal support. |
| 34 | iyasu | Heal | Late all-party healer role. |

Coverage notes: `musubu` is here because wool makes binding literal.

### kame / Turtle / 亀

Role read: Uncommon water Tank/Healer with signature defense and very low dex. Turtle should endure, dive, and lock enemies down.

Progression intent: It starts with Grab, then Block, Hold Down, Dive, Stand Firm, and Wash. The kit is slow control plus survival.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsukamu | Grab | Turtle bite/grab is a basic physical opener. |
| 5 | fusegu | Block | Shell defense as early identity. |
| 10 | osaeru | Hold Down | Heavy shell/body pins the target. |
| 16 | moguru | Dive | Water movement plus defense/dex. |
| 24 | funbaru | Stand Firm | Tank stance through grounded weight. |
| 34 | arau | Wash | Late utility cleanser for a water tank. |

Coverage notes: Turtle gets multiple defensive verbs because defense is the fantasy.

### nezumi / Mouse / 鼠

Role read: Uncommon earth Trickster with the highest dex and lowest bulk. Mouse should be nimble theft and escape.

Progression intent: It starts with Gnaw, then Pilfer, Seize, Flee, Dodge, and Steal. It is the smallest rogue kit.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kajiru | Gnaw | Tiny teeth opener. |
| 5 | nusumu | Pilfer | Rat thief identity. |
| 10 | tsukamaeru | Seize | Quick paw catch/control. |
| 16 | nigedasu | Flee | Small animal escape and cleanse. |
| 24 | kawasu | Dodge | Highest dex deserves dodge. |
| 34 | kasumeru | Steal | Late refined rogue hit with dex debuff. |

Coverage notes: Both steal verbs fit because this creature is the pure rogue.

### kaeru / Frog / 蛙

Role read: Uncommon water Trickster with jumping dex. Frog should bounce, lick, dive, and submerge.

Progression intent: It starts with Bounce, gains Rebound, Lick, Jump Down, Dive, and Submerge. It alternates goofy body language with water control.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | haneru | Bounce | The obvious frog opener. |
| 5 | hazumu | Rebound | Bouncy self-buff extends the jump identity. |
| 10 | nameru | Lick | Goofy monster move with drain/confuse. |
| 16 | tobioriru | Jump Down | Stronger leap attack. |
| 24 | moguru | Dive | Amphibian water movement. |
| 34 | shizumeru | Submerge | Late water control. |

Coverage notes: Frog is the cleanest home for bounce/rebound vocabulary.

### kamo / Duck / 鴨

Role read: Uncommon water Fighter with balanced stats. Duck should be mobile, physical, and lightly supportive.

Progression intent: It starts with Kick, waddles into Stomp, dives, shakes away status, and rains down late. It stays more fighter than healer.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | keru | Kick | Duck kick is simple and funny-readable. |
| 6 | fumu | Stomp | Webbed foot follow-up. |
| 12 | moguru | Dive | Water movement. |
| 20 | furiharau | Shake Away | Duck shakes water/status off an ally. |
| 30 | furisosogu | Rain Down | Late water projectile shower. |

Coverage notes: Duck gets cleanse only after basic fighter tools.

### kujira / Whale / 鯨

Role read: Epic water Tank/Healer with enormous HP and very low dex. Whale should reshape the battlefield through size and water.

Progression intent: It starts with Submerge, then Surge, Rain Down, Inhale, Drench, and Heal. Epic rarity justifies huge area and support moves.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | shizumeru | Submerge | Single-target water control as safe opener. |
| 5 | oshiyoseru | Surge | Whale mass/wave pressure. |
| 10 | furisosogu | Rain Down | Huge water body creates field pressure. |
| 16 | suikomu | Inhale | Whale suction/drain fantasy. |
| 24 | abiru | Drench | Epic cleansing shower. |
| 34 | iyasu | Heal | Late oceanic restoration. |

Coverage notes: Whale carries large water/support moves because its scale supports them.

### koori / Ice / 氷

Role read: Common water Mage, sharper than Snow. Ice should be clean cold damage/control.

Progression intent: It starts with Melt, then Freeze, Float, and Tremble. The kit is intentionally compact for a common elemental.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tokeru | Melt | Basic water/ice damage and defense-down. |
| 7 | kooritsuku | Freeze | Signature sleep control after level 1. |
| 16 | ukabu | Float | Ice floe/levitation tempo. |
| 28 | furueru | Tremble | Shivering cold becomes area control. |

Coverage notes: Ice is narrower than Snow but more precise.

### tsuchi / Dirt / 土

Role read: Common earth Tank/Healer with high defense and low dex. Dirt should be the baseline body of soil and packed ground.

Progression intent: It begins with Hit, then splits, breaks, destroys, shakes, and blocks. The kit teaches basic destructive earth verbs.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | ateru | Hit | Simple starter impact. |
| 5 | waru | Split | Packed dirt cracks. |
| 10 | kowasu | Break | Stronger destructive verb. |
| 16 | kuzusu | Destroy | Collapsing earth/guard break. |
| 24 | yureru | Shake | Tremor area damage. |
| 34 | fusegu | Block | Defensive earth body. |

Coverage notes: Dirt intentionally teaches the core break/crack verb family.

### akuma / Demon / Devil / 悪魔

Role read: Rare fire Mage with battlemage stats. Demon should be fire, intimidation, sealing, and ruin.

Progression intent: It starts with Scorch, threatens, seals, roasts, erupts, and ruins. This gives it menace without making it a pure physical brute.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kogasu | Scorch | Small hellfire opener. |
| 5 | odosu | Threaten | Demon fear as attack debuff/confuse. |
| 10 | fuujiru | Seal | Dark magic blocks the target. |
| 16 | yaku | Roast | Stronger fire verb. |
| 24 | fuku_erupt | Erupt | Demonic fire becomes area pressure. |
| 34 | horobosu | Ruin | Late demon magic earns the severe destroy verb. |

Coverage notes: Demon handles `fuujiru` because sealing is a magical threat.

### tenshi / Angel / 天使

Role read: Rare metal Mage support caster with high MP. Angel should protect, cleanse, heal, and carry a blade of light.

Progression intent: It starts with Poke, then Shine, Protect, Shake Away, Slash, and Heal. It is support-first but not helpless.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsuku | Poke | Small halo/spear poke as safe opener. |
| 5 | hikaru | Shine | Angelic light cleanse/dex support. |
| 10 | kabau | Protect | Guardian identity. |
| 16 | furiharau | Shake Away | Angel removes harmful statuses from allies. |
| 24 | kiru_slash | Slash | Light-blade offense so the kit is not all support. |
| 34 | iyasu | Heal | Late full healer payoff. |

Coverage notes: `kiru_slash` belongs as a light blade, not a mundane sword.

### suna / Sand / 砂

Role read: Uncommon earth Trickster with high dex. Sand should blind, pull, scatter, and obstruct.

Progression intent: It starts with Impact as thrown grit, then Pull, Jolt, Scatter, Obstruct, and Flank. The kit is tempo denial through shifting terrain.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | butsukeru | Impact | Sand blast impact is a legal basic damage opener. |
| 5 | hiku | Pull | Quicksand pull lowers dex. |
| 10 | yusaburu | Jolt | Shifting ground jolts and stuns. |
| 16 | chirasu | Scatter | Sand scatter reduces all enemy dex. |
| 24 | habamu | Obstruct | Sand banks block movement/attack. |
| 34 | mawarikomu | Flank | Trickster repositioning through drifting sand. |

Coverage notes: Sand gets several control verbs because terrain manipulation is its identity.

### tako / Octopus / タコ

Role read: Uncommon water Trickster with high MP and many limbs. Octopus should grab, tighten, capture, inhale, whirl, and pull.

Progression intent: It starts with Grab, then constricts, captures, sucks in, whirls, and pulls. The kit is all limbs and suction.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsukamu | Grab | Tentacle grab opener. |
| 5 | shimeru | Tighten | Constriction with tentacles. |
| 10 | toraeru | Capture | Multi-limb controller catches targets. |
| 16 | suikomu | Inhale | Suction/drain fantasy. |
| 24 | uzumaku | Whirl | Tentacles/water swirl all enemies. |
| 34 | hiku | Pull | Late forced positioning. |

Coverage notes: Octopus is the best home for capture/control verbs.

### tsuru / Crane / 鶴

Role read: Rare metal Mage with elegant precision. Crane should be poised, aerial, and blade-like.

Progression intent: It starts with Poke, then Parry, Swing, Overhead Swing, Take Flight, and Cut Down. Its metal moves are beak/wing precision.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsuku | Poke | Beak poke opener. |
| 5 | ukenagasu | Parry | Elegant deflection. |
| 10 | furuu | Swing | Wing/neck swing. |
| 16 | furiorosu | Overhead Swing | Downward wing strike. |
| 24 | tobitatsu | Take Flight | Aerial team dex support. |
| 34 | kirisuteru | Cut Down | Rare elegant bird finisher. |

Coverage notes: Crane carries refined blade verbs through beak/wing imagery.

### tokage / Lizard / トカゲ

Role read: Uncommon earth Fighter, nimble reptile. Lizard should bounce, grab, shove, dash, thrust, and skewer.

Progression intent: It starts with Bounce, then Grab, Shove, Dash, Thrust, and Skewer. This keeps it physical and agile.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | haneru | Bounce | Quick reptile hop/lunge opener. |
| 5 | tsukamu | Grab | Claws and jaws grab. |
| 10 | tsukitobasu | Shove | Body shove with dex debuff. |
| 16 | kakeru | Dash | Nimble movement buff. |
| 24 | tsukidasu | Thrust | Tail/body thrust. |
| 34 | tsukitateru | Skewer | Late sharp-claw/tooth finisher. |

Coverage notes: Lizard uses pierce verbs through claws and teeth.

### ika / Squid / イカ

Role read: Uncommon water Trickster with high MP. Squid should spit ink, scatter, escape, and whirl.

Progression intent: It starts with Spit, upgrades to Spit Out, scatters ink, escapes, and ends with a whirl. The kit is evasive ink control.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | haku | Spit | Ink spit is the obvious opener. |
| 6 | hakisuteru | Spit Out | Stronger poison/sludge spit. |
| 12 | chirasu | Scatter | Ink cloud dispersal lowers dex. |
| 20 | nogareru | Escape | Squid escapes through ink. |
| 30 | uzumaku | Whirl | Tentacle/water vortex finisher. |

Coverage notes: Squid shares water trickster space with Octopus but leans ink/escape.

### inoshishi / Boar / 猪

Role read: Rare earth Fighter with high power and mid-low dex. Boar should charge, knock down, trample, squash, and rampage.

Progression intent: It starts with Charge, then Throw Down, Topple, Trample, Squash, and Rampage. This is pure forward force.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsukkomu | Charge | Signature boar opener. |
| 5 | nagedasu | Throw Down | Impact throws the target off balance. |
| 10 | oshitaosu | Topple | Charging body pushes down. |
| 16 | fumitsukeru | Trample | Hooves and mass. |
| 24 | oshitsubusu | Squash | Heavy body pressure. |
| 34 | abareru | Rampage | Rare boar late identity. |

Coverage notes: Boar is the cleanest charge/rampage creature.

### kani / Crab / カニ

Role read: Uncommon water Tank/Healer with shell defense and low dex. Crab should grab, pinch, wash, block, and break.

Progression intent: It starts with Grab because Pinch is a debuff, then gets Pinch, Wash, Block, and Break. It is a shell tank with pincers.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsukamu | Grab | Pincer grab as legal damage opener. |
| 6 | hasamu | Pinch | Pincer stun/control once past level 1. |
| 12 | arau | Wash | Water support/cleanse. |
| 20 | fusegu | Block | Shell defense. |
| 30 | kowasu | Break | Pincers break armor. |

Coverage notes: Crab keeps support light and physical.

### kemono / Beast / 獣

Role read: Rare earth Fighter and generic brute template. Beast should be the clean all-purpose violence kit.

Progression intent: It starts with Smack, then Knock Down, Tear, Assault, Drive Off, and Ruin. It escalates from animal hit to battlefield dominance.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | utsu | Smack | Plain strike for a generic beast. |
| 5 | taosu | Knock Down | Core combat verb for a brute. |
| 10 | yaburu | Tear | Animal tearing damage. |
| 16 | semeru | Assault | Broad attack pressure. |
| 24 | oiharau | Drive Off | Beast scatters enemies. |
| 34 | horobosu | Ruin | Rare brute late destroy payoff. |

Coverage notes: Beast is allowed broad verbs because it is the generic animal/brute slot.

### erufu / Elf / エルフ

Role read: Rare wood Mage with agile archer-caster fantasy. Elf should be precise, ranged, and supportive.

Progression intent: It starts with Thrust, then Shoot, Take Aim, Scatter, Cover, and Heal. The kit reads as archer plus forest magic.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsukidasu | Thrust | Simple spear/arrow thrust opener. |
| 5 | utsu_shoot | Shoot | Archer identity. |
| 10 | nerau | Take Aim | Precision dex/attack buff. |
| 16 | chirasu | Scatter | Leaves/arrows scatter enemies. |
| 24 | oou | Cover | Forest cover support. |
| 34 | iyasu | Heal | Late woodland support magic. |

Coverage notes: Elf balances ranged damage with support.

### goburin / Goblin / ゴブリン

Role read: Rare earth Trickster with scrappy attack. Goblin should steal, throw, corner, interrupt, and split targets apart.

Progression intent: It starts with Steal, then Pilfer, Fling, Corner, Interrupt, and Pull Apart. This is dirty fighting, not elegance.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | kasumeru | Steal | A goblin opener should be sneaky damage. |
| 5 | nusumu | Pilfer | Second theft verb reinforces identity. |
| 10 | hourinageru | Fling | Goblin throws junk. |
| 16 | oitsumeru | Corner | Pack pressure corners the target. |
| 24 | saegiru | Interrupt | Dirty counter/obstruction. |
| 34 | hikihanasu | Pull Apart | Late disruption splits formation/guard. |

Coverage notes: Goblin carries many neutral control verbs because it fights unfairly.

### hone / Bone / 骨

Role read: Uncommon earth Tank/Healer, defensive and slow. Bone should crack, snap, shake, and block.

Progression intent: It starts with Hit, then Snap, Split, Tremble, Shatter Apart, and Block. This makes skeletal fragility into combat texture.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | ateru | Hit | Basic bone strike. |
| 5 | oru | Snap | Bones snap. |
| 10 | waru | Split | Bone fracture vocabulary. |
| 16 | furueru | Tremble | Rattling bones become area control. |
| 24 | kudakechiru | Shatter Apart | Skeleton/body shatter as late area break. |
| 34 | fusegu | Block | Defensive bone frame. |

Coverage notes: Bone is the natural home for fracture/shatter verbs.

### suishou / Crystal / 水晶

Role read: Uncommon metal Tank/Healer with high MP and reflective defense. Crystal should be sharp, reflective, and controlling.

Progression intent: It starts with Poke, then Extract, Take Aim, Parry, Restrain, and Shine. It uses facets as blades and mirrors as support.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | tsuku | Poke | Crystal point basic attack. |
| 5 | hikinuku | Extract | Pulling out crystal shards lowers defense. |
| 10 | nerau | Take Aim | Refraction precision. |
| 16 | ukenagasu | Parry | Reflective deflection. |
| 24 | seisuru | Restrain | Crystal cage/geometry restrains attack and dex. |
| 34 | hikaru | Shine | Late reflective cleanse/dex support. |

Coverage notes: Crystal absorbs several metal precision/control verbs.

### suraimu / Slime / スライム

Role read: Common water Tank/Healer beginner monster. Slime should be forgiving, bouncy, sticky, and simple.

Progression intent: It starts with Bounce, then Absorb, Float, Tie Up, and Cover. It teaches sustain/control gently without high power.

| Level | Move ID | Move | Reason |
|---:|---|---|---|
| 1 | haneru | Bounce | Universal beginner slime hop. |
| 6 | suitoru | Absorb | Slime body absorbs for light sustain. |
| 12 | ukabu | Float | Gel body floats. |
| 20 | shibaru | Tie Up | Sticky slime binds the target. |
| 30 | oou | Cover | Slime blankets allies defensively. |

Coverage notes: Slime is the approachable home for sticky bind/cover support.

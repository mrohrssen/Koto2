import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

type Cat = "damage" | "drain" | "heal" | "buff" | "shield" | "debuff";
type Target =
  | "single_enemy"
  | "all_enemies"
  | "self"
  | "single_ally"
  | "all_allies";

type Move = {
  id: string;
  nameEn: string;
  jp: string;
  reading: string;
  meaning: string;
  category: Cat;
  target: Target;
  power: number;
  mp: number;
  element: string;
  statusEffect?: string;
  statusChance?: number;
  statusDuration?: number;
  statChanges?: Record<string, number>;
};

const MOVES: Move[] = [
  { id: "tataku", nameEn: "Strike", jp: "叩く", reading: "たたく", meaning: "to strike / to hit / to knock", category: "damage", target: "single_enemy", power: 10, mp: 5, element: "neutral" },
  { id: "honoo", nameEn: "Flame", jp: "炎", reading: "ほのお", meaning: "flame / blaze", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "fire" },
  { id: "moeru", nameEn: "Burn", jp: "燃える", reading: "もえる", meaning: "to burn / to be on fire", category: "damage", target: "single_enemy", power: 25, mp: 20, element: "fire" },
  { id: "tobu", nameEn: "Leap", jp: "飛ぶ", reading: "とぶ", meaning: "to fly / to jump", category: "damage", target: "single_enemy", power: 15, mp: 10, element: "neutral" },
  { id: "nagasu", nameEn: "Wash Away", jp: "流す", reading: "ながす", meaning: "to drain / to pour / to wash away", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "water" },
  { id: "kakomu", nameEn: "Encircle", jp: "囲む", reading: "かこむ", meaning: "to surround / to encircle", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "wood" },
  { id: "nigiru", nameEn: "Grasp", jp: "握る", reading: "にぎる", meaning: "to clasp / to grasp / to grip", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "earth", statusEffect: "stun", statusChance: 40, statusDuration: 1 },
  { id: "kiru", nameEn: "Cut", jp: "切る", reading: "きる", meaning: "to cut / to sever", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "metal" },
  { id: "kaku", nameEn: "Write", jp: "書く", reading: "かく", meaning: "to write / to draw", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "earth" },
  { id: "sasu", nameEn: "Sting", jp: "刺す", reading: "さす", meaning: "to pierce / to stab / to sting", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "wood" },
  { id: "horu", nameEn: "Dig", jp: "掘る", reading: "ほる", meaning: "to dig / to excavate", category: "damage", target: "single_enemy", power: 15, mp: 12, element: "earth" },
  { id: "mamoru", nameEn: "Guard", jp: "守る", reading: "まもる", meaning: "to protect / to guard / to defend", category: "buff", target: "self", power: 0, mp: 8, element: "neutral", statChanges: { def: 1 } },
  { id: "naku", nameEn: "Cry", jp: "泣く", reading: "なく", meaning: "to cry / to weep", category: "buff", target: "self", power: 0, mp: 10, element: "neutral", statChanges: { atk: 1 } },
  { id: "yomu", nameEn: "Read", jp: "読む", reading: "よむ", meaning: "to read / to predict", category: "buff", target: "self", power: 0, mp: 10, element: "wood", statChanges: { def: 1 } },
  { id: "kakureru", nameEn: "Hide", jp: "隠れる", reading: "かくれる", meaning: "to hide / to conceal oneself", category: "buff", target: "self", power: 0, mp: 8, element: "earth", statChanges: { def: 1 } },
  { id: "odoru", nameEn: "Dance", jp: "踊る", reading: "おどる", meaning: "to dance", category: "buff", target: "self", power: 0, mp: 10, element: "wood", statChanges: { atk: 1 } },
  { id: "oshieru", nameEn: "Teach", jp: "教える", reading: "おしえる", meaning: "to teach / to instruct", category: "buff", target: "all_allies", power: 0, mp: 14, element: "wood", statChanges: { atk: 1 } },
  { id: "yobu", nameEn: "Call", jp: "呼ぶ", reading: "よぶ", meaning: "to call out / to summon / to invite", category: "buff", target: "all_allies", power: 0, mp: 14, element: "neutral", statusEffect: "haste", statusChance: 100, statusDuration: 1 },
  { id: "nomu", nameEn: "Drink", jp: "飲む", reading: "のむ", meaning: "to drink / to swallow", category: "heal", target: "self", power: 25, mp: 8, element: "water" },
  { id: "nemuru", nameEn: "Sleep", jp: "眠る", reading: "ねむる", meaning: "to sleep", category: "heal", target: "self", power: 8, mp: 15, element: "neutral" },
  { id: "suwaru", nameEn: "Sit", jp: "座る", reading: "すわる", meaning: "to sit / to hold steady", category: "heal", target: "self", power: 8, mp: 15, element: "earth" },
  { id: "okoru", nameEn: "Rage", jp: "怒る", reading: "おこる", meaning: "to get angry / to get mad", category: "debuff", target: "single_enemy", power: 0, mp: 15, element: "fire", statusEffect: "confuse", statusChance: 75, statusDuration: 2 },
  { id: "kesu", nameEn: "Erase", jp: "消す", reading: "けす", meaning: "to erase / to delete / to extinguish", category: "debuff", target: "single_enemy", power: 0, mp: 15, element: "earth", statusEffect: "confuse", statusChance: 75, statusDuration: 2 },
];

const TARGET_LABEL: Record<Target, string> = {
  single_enemy: "Single enemy",
  all_enemies: "All enemies",
  self: "Self",
  single_ally: "Single ally",
  all_allies: "All allies",
};

function describeRiders(m: Move): string {
  const parts: string[] = [];
  if (m.statChanges) {
    for (const [k, v] of Object.entries(m.statChanges)) {
      const sign = v > 0 ? "+" : "";
      parts.push(`${k} ${sign}${v}`);
    }
  }
  if (m.statusEffect) {
    parts.push(`${m.statusEffect} (${m.statusChance}%, ${m.statusDuration}T)`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

function moveRow(m: Move) {
  return [
    <Row gap={6} align="center">
      <Text weight="semibold">{m.nameEn}</Text>
      <Text tone="tertiary" size="small">
        {m.jp}
      </Text>
    </Row>,
    <Text tone="secondary" size="small">{m.meaning}</Text>,
    <Text size="small">{TARGET_LABEL[m.target]}</Text>,
    <Text size="small">{m.power || "—"}</Text>,
    <Text size="small">{m.mp}</Text>,
    <Text size="small">{m.element}</Text>,
    <Text size="small">{describeRiders(m)}</Text>,
  ];
}

const movesByCat: Record<Cat, Move[]> = {
  damage: [],
  drain: [],
  heal: [],
  buff: [],
  shield: [],
  debuff: [],
};
for (const m of MOVES) movesByCat[m.category].push(m);

export default function MoveSystemInventory() {
  return (
    <Stack gap={24}>
      <Stack gap={6}>
        <H1>Move System — Design Space</H1>
        <Text tone="secondary">
          A move has a <Text as="span" weight="semibold">category</Text> (its
          shape), a <Text as="span" weight="semibold">target</Text>, and up to
          two riders: a timed <Text as="span" weight="semibold">status effect</Text>{" "}
          and a permanent-until-battle-end{" "}
          <Text as="span" weight="semibold">stat-stage change</Text>. The
          combat engine lives in <Code>src/game/services/creature-combat-service.js</Code>{" "}
          and <Code>src/game/combat/effects.js</Code>; authored move data lives in{" "}
          <Code>data/moves.json</Code>.
        </Text>
        <Text tone="tertiary" size="small">
          This canvas is the refined design space, not a 1:1 mirror of code.
          Deprecated branches (<Code>shield</Code> category,{" "}
          <Code>shield</Code> / <Code>team_shield</Code> / <Code>haste</Code>{" "}
          status effects) are excluded — see the callouts at the bottom.
        </Text>
      </Stack>

      <Grid columns={5} gap={12}>
        <Stat value="5" label="Categories (design)" />
        <Stat value="6" label="Status effects" />
        <Stat value="2 + 1" label="Stat stages (+ planned)" />
        <Stat value="5" label="Target options" />
        <Stat value={String(MOVES.length)} label="Live moves" />
      </Grid>

      <Divider />

      <Stack gap={10}>
        <H2>Categories — the move's shape</H2>
        <Text tone="secondary" size="small">
          The <Code>switch (move.category)</Code> in <Code>executeMove()</Code>{" "}
          dispatches one of these branches. <Code>rest</Code> is a synthetic
          pseudo-move injected at render time and never stored on a creature.
        </Text>
        <Table
          headers={[
            "Category",
            "What it does",
            "Live moves",
            "Riders allowed",
          ]}
          columnAlign={["left", "left", "right", "left"]}
          rows={[
            [
              <Pill tone="info" active>damage</Pill>,
              "HP damage to target. Element + STAB multipliers, variance, shield reduction. Damage > 0 breaks sleep on the target.",
              String(movesByCat.damage.length),
              "statusEffect, statChanges",
            ],
            [
              <Pill tone="info" active>drain</Pill>,
              "Same as damage, plus the attacker is healed for 50% of damage dealt.",
              String(movesByCat.drain.length),
              "statusEffect, statChanges",
            ],
            [
              <Pill tone="success" active>heal</Pill>,
              <Text size="small">
                Restore HP to ally(ies):{" "}
                <Code>floor((atk / 10) × power × variance)</Code>. Skips KO'd
                targets.
              </Text>,
              String(movesByCat.heal.length),
              "statusEffect, statChanges",
            ],
            [
              <Pill tone="success" active>buff</Pill>,
              "Apply positive statChanges and/or beneficial statusEffect (taunt) to ally/self.",
              String(movesByCat.buff.length),
              "statusEffect, statChanges",
            ],
            [
              <Pill tone="warning" active>debuff</Pill>,
              "Apply negative statChanges and/or harmful statusEffect (poison, sleep, stun, confuse) to enemy.",
              String(movesByCat.debuff.length),
              "statusEffect, statChanges",
            ],
            [
              <Pill tone="neutral">rest (synthetic)</Pill>,
              <Text size="small">
                Render-time pseudo-move. Restores{" "}
                <Code>ceil(maxMp × 0.20)</Code>. Detected via{" "}
                <Code>move.isRest</Code>; rendered as a +20% MP pill.
              </Text>,
              "—",
              "—",
            ],
          ]}
        />
      </Stack>

      <Stack gap={10}>
        <H2>Status effect riders</H2>
        <Text tone="secondary" size="small">
          Attached via <Code>statusEffect</Code> + <Code>statusChance</Code> +{" "}
          <Code>statusDuration</Code>. Resolved by <Code>tryApplyStatus</Code>{" "}
          and the <Code>applyX</Code> helpers in <Code>combat/effects.js</Code>.
        </Text>
        <Table
          headers={["Effect", "Behavior", "Duration model", "Authored"]}
          columnAlign={["left", "left", "left", "center"]}
          rows={[
            [
              "poison",
              <Text size="small">
                DoT each round; <Text as="span" weight="semibold">can KO</Text>.
                Damage ={" "}
                <Code>max(1, floor((atk/10) × power × 0.2))</Code>.
              </Text>,
              "decrements per turn",
              <Text tone="tertiary">none</Text>,
            ],
            ["sleep", "Skip turn until taking damage (which breaks sleep).", "decrements per turn", <Text tone="tertiary">none</Text>],
            ["stun", "Skip the next turn.", "1 turn (fixed)", <Text>Grasp 握る</Text>],
            ["confuse", "Chance to hit self/ally.", "decrements per turn", <Text>Erase, Rage</Text>],
            ["taunt", "Forces enemies to target the taunter.", "decrements per turn", <Text tone="tertiary">none</Text>],
            [
              "cleanse",
              <Text size="small">
                Instantly removes the four negative status effects from the
                target: <Code>poison</Code>, <Code>sleep</Code>,{" "}
                <Code>stun</Code>, <Code>confuse</Code>.{" "}
                <Text as="span" weight="semibold">Does not</Text> remove{" "}
                <Code>taunt</Code> (treated as a role indicator, not a
                debuff), and{" "}
                <Text as="span" weight="semibold">does not</Text> reset
                negative stat stages.
              </Text>,
              "instant (no tick)",
              <Text tone="tertiary">none</Text>,
            ],
          ]}
        />
      </Stack>

      <Stack gap={10}>
        <H2>Stat-stage riders</H2>
        <Text tone="secondary" size="small">
          PokéRogue-style integer stages clamped to{" "}
          <Code>[-6, +6]</Code>. Stages reset at battle start. Multiplier:{" "}
          <Code>max(2, 2+stage) / max(2, 2-stage)</Code> — so +1 = 1.5×, +6 = 4×, −6 = 0.25×.
        </Text>
        <Grid columns={3} gap={12}>
          <Card>
            <CardHeader trailing={<Pill tone="success" active size="sm">engine</Pill>}>atk</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" weight="semibold">Attack stages</Text>
                <Text size="small">
                  Multiplies physical damage output.
                </Text>
                <Text size="small" tone="secondary">
                  Authored buffs: <Text as="span" weight="semibold">Cry, Dance, Teach</Text> (all +1).
                  No authored debuff.
                </Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader trailing={<Pill tone="success" active size="sm">engine</Pill>}>def</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" weight="semibold">Defense stages</Text>
                <Text size="small">
                  Multiplies incoming-damage resistance. Replaces the old{" "}
                  <Code>shield</Code> / <Code>team_shield</Code> design.
                </Text>
                <Text size="small" tone="secondary">
                  Authored buffs: <Text as="span" weight="semibold">Guard, Read, Hide</Text> (all +1).
                  No authored debuff.
                </Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader trailing={<Pill tone="warning" active size="sm">planned</Pill>}>dex</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small" weight="semibold">Dexterity stages</Text>
                <Text size="small">
                  Drives three things at once:
                </Text>
                <Stack gap={2} style={{ paddingLeft: 8 }}>
                  <Text size="small">• Turn order (higher dex acts first)</Text>
                  <Text size="small">• Critical-hit chance</Text>
                  <Text size="small">• Dodge chance</Text>
                </Stack>
                <Text size="small" tone="secondary">
                  Not yet in engine. Designed for both buff and debuff use,
                  same <Code>[-6, +6]</Code> stage model as atk/def.
                  Supersedes the orphaned <Code>spd</Code> UI label in{" "}
                  <Code>move-effect-label.js</Code>.
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>
        <Callout tone="info" title="Why dex unlocks new design">
          <Stack gap={4}>
            <Text size="small">
              Today every stat move is "more damage" or "less damage" — there
              is no way to reshape the turn flow or trade reliability for
              upside. <Text as="span" weight="semibold">dex</Text> opens three
              new design axes from a single stat:
            </Text>
            <Text size="small">
              <Text as="span" weight="semibold">Tempo plays</Text> — buff dex
              to act before a big enemy turn; debuff enemy dex to steal initiative.
            </Text>
            <Text size="small">
              <Text as="span" weight="semibold">Crit-fishing builds</Text> —
              stack dex on a hard hitter so its damage moves spike instead of grow.
            </Text>
            <Text size="small">
              <Text as="span" weight="semibold">Evasive tanks</Text> — high
              dex as an alternative to def: dodge entirely instead of
              soaking. Risk/reward variant of "raise def +1".
            </Text>
          </Stack>
        </Callout>
        <Text tone="secondary" size="small">
          There's also a separate <Code>applyTempAttackFlat</Code> /{" "}
          <Code>getFlatAttackBonus</Code> channel — additive flat attack
          bonus that stacks. Not used by any current move; appears to be infra
          for items or future moves.
        </Text>
      </Stack>

      <Stack gap={10}>
        <H2>Targets</H2>
        <Row gap={8} wrap>
          <Pill tone="info">single_enemy</Pill>
          <Pill tone="info">all_enemies</Pill>
          <Pill tone="success">self</Pill>
          <Pill tone="success">single_ally</Pill>
          <Pill tone="success">all_allies</Pill>
        </Row>
        <Text tone="secondary" size="small">
          <Code>enemy</Code> appears as an alias of <Code>single_enemy</Code> in
          some code paths.
        </Text>
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2>Live move inventory</H2>
        <Text tone="secondary" size="small">
          Every authored move in <Code>data/moves.json</Code>, grouped by
          category. Riders show <Code>statusEffect (chance%, duration T)</Code>{" "}
          and stat-stage changes.
        </Text>

        <H3>damage · {movesByCat.damage.length}</H3>
        <Table
          headers={["Move", "Meaning", "Target", "Pow", "MP", "Element", "Riders"]}
          columnAlign={["left", "left", "left", "right", "right", "left", "left"]}
          rows={movesByCat.damage.map(moveRow)}
        />

        <H3>buff · {movesByCat.buff.length}</H3>
        <Table
          headers={["Move", "Meaning", "Target", "Pow", "MP", "Element", "Riders"]}
          columnAlign={["left", "left", "left", "right", "right", "left", "left"]}
          rows={movesByCat.buff.map(moveRow)}
        />

        <H3>heal · {movesByCat.heal.length}</H3>
        <Table
          headers={["Move", "Meaning", "Target", "Pow", "MP", "Element", "Riders"]}
          columnAlign={["left", "left", "left", "right", "right", "left", "left"]}
          rows={movesByCat.heal.map(moveRow)}
        />

        <H3>debuff · {movesByCat.debuff.length}</H3>
        <Table
          headers={["Move", "Meaning", "Target", "Pow", "MP", "Element", "Riders"]}
          columnAlign={["left", "left", "left", "right", "right", "left", "left"]}
          rows={movesByCat.debuff.map(moveRow)}
        />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2>Gaps & open design space</H2>
        <Grid columns={2} gap={12}>
          <Callout tone="warning" title="Deprecated — to remove from engine">
            <Stack gap={4}>
              <Text size="small">
                These exist as engine branches today but are no longer in the
                design space. <Code>shield</Code> overlaps too much with a{" "}
                <Code>def</Code> buff, and <Code>haste</Code> overlaps with
                what <Code>dex</Code> will do for turn order.
              </Text>
              <Text size="small">
                <Text as="span" weight="semibold">Category:</Text>{" "}
                <Code>shield</Code> (collapse into <Code>def</Code> buff)
              </Text>
              <Text size="small">
                <Text as="span" weight="semibold">Status effects:</Text>{" "}
                <Code>shield</Code>, <Code>team_shield</Code>,{" "}
                <Code>haste</Code>
              </Text>
              <Text size="small" tone="secondary">
                One live move rides a deprecated effect today:{" "}
                <Text as="span" weight="semibold">Call 呼ぶ</Text> uses{" "}
                <Code>haste</Code> and will need a redesign.
              </Text>
            </Stack>
          </Callout>
          <Callout tone="info" title="Open design space">
            <Stack gap={4}>
              <Text size="small">
                <Text as="span" weight="semibold">Status effects with no
                authored moves:</Text> <Code>poison</Code>, <Code>sleep</Code>,{" "}
                <Code>taunt</Code>, <Code>cleanse</Code> (cleanse is also
                not yet in the engine).
              </Text>
              <Text size="small">
                <Text as="span" weight="semibold">Stat stages:</Text> every
                authored move is positive (<Code>atk +1</Code> /{" "}
                <Code>def +1</Code>). No negative stages, no multi-tier (±2,
                ±3), and no <Code>dex</Code> moves at all (planned).
              </Text>
              <Text size="small">
                <Text as="span" weight="semibold">Categories:</Text>{" "}
                <Code>drain</Code> has zero authored moves despite full
                engine support.
              </Text>
            </Stack>
          </Callout>
        </Grid>
      </Stack>
    </Stack>
  );
}

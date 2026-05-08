// Creature prompt source-of-truth for the Scenario gpt-image-2 workflow.
//
// Mirrors the descriptions in scripts/generate-creature-sprites.mjs (Gemini
// pipeline). Kept as its own copy so the Scenario workflow stays runnable
// without touching the Gemini script. If a creature description changes, update
// it here AND in the Gemini script — the two intentionally share text.

export const PROMPT_SUFFIX = 'set against a solid white background, all rendered in crisp, clean pixels with gentle lighting and smooth gradients. Single 256x256 sprite image showing the creature facing right. This is a creature - not a humanoid. Make it cute and pixel art style.';

export const CREATURES = {
  hi:      'A small fire spirit with glowing ember eyes and wispy flames dancing around its body,',
  mizu:    'A small water spirit with bright droplet eyes and gentle streams swirling around its round body,',
  ki:      'A small tree spirit with knot-hole eyes and tiny leaves sprouting from its woody body,',
  ishi:    'A small stone creature with pebble eyes and a sturdy round body made of smooth stacked rocks,',
  tetsu:   'A small iron creature with glinting metallic eyes and a compact body of polished steel plates,',
  kaze:    'A small wind spirit with swirling cloud eyes and a wispy body made of flowing air currents,',
  mushi:   'A small round beetle creature with big curious eyes and tiny colorful wings on its back,',
  hana:    'A small flower creature with petal eyes and a body wrapped in soft blooming petals,',
  tori:    'A small metallic bird with sharp gleaming eyes and sleek silver-tipped feathers,',
  sakana:  'A small round fish with big gentle eyes and flowing bright fins,',
  neko:    'A small playful cat with bright mischievous eyes and a flickering flame-tipped tail,',
  inu:     'A small sturdy dog with loyal determined eyes and dusty brown fur with earthy markings,',
  hinoneko: 'A small fiery cat with blazing ember eyes and flames flickering along its fur and tail,',
  tsukue:  'A small wooden school desk creature with drawer eyes and pencils sticking up like antennae, short stubby wooden legs,',
  isu:     'A small wooden school chair creature with seat-cushion face and four sturdy legs, slightly tilted playfully,',
  fukurou: 'A small round owl creature with enormous wise eyes and soft feathered body, tiny spectacles perched on beak,',
  chou:    'A small butterfly creature with colorful patterned wings and curious antenna eyes, delicate and graceful,',
  hachi:   'A small round bee creature with fuzzy yellow and black stripes, tiny translucent wings, and determined eyes,',
  ari:     'A small ant creature with a shiny dark body, large determined eyes, and strong mandibles, carrying a tiny leaf,',

  'ishino-kyojin':    'A small hulking stone giant with deep-set rocky eyes and a chunky body of mossy boulders stacked into limbs,',
  hikari:             'A small light spirit with shining starlit eyes and a glowing wisp body radiating soft golden beams,',
  tsuki:              'A small moon spirit with crescent-shaped eyes and a pale luminous body trailing soft silver light,',
  kage:               'A small shadow creature with glowing slit eyes and a wispy dark body fading into smoky tendrils,',
  hoshi:              'A small star spirit with twinkling sparkling eyes and a five-pointed glowing body shedding tiny stardust,',
  uma:                'A small spirited horse with bright kind eyes and a flowing mane, sturdy hooves,',
  yuki:               'A small snow spirit with glittering icy eyes and a fluffy snowflake-patterned body trailing tiny flurries,',
  oni:                'A small horned ogre with fierce glaring eyes and a stocky red-skinned body, tiny club clutched in its hands,',
  kumo:               'A small cloud spirit with sleepy half-closed eyes and a puffy white body drifting on a wispy breeze,',
  ryuu:               'A small serpentine dragon with fierce gleaming eyes and a scaly red body, tiny clawed limbs and curved horns,',
  kaminari:           'A small thunder spirit with crackling electric eyes and a jagged lightning-bolt body sparking with bright energy,',
  hebi:               'A small coiled snake with sharp slit eyes and a smooth scaled body in patterned green and gold,',
  yuurei:             'A small floating ghost with hollow glowing eyes and a wispy translucent body trailing into a tail,',
  ookami:             'A small grey wolf with piercing amber eyes and a thick furred body, alert pointed ears and a bushy tail,',
  ushi:               'A small spotted cow with gentle dark eyes and a chunky body with white-and-black patches, tiny horns on its head,',
  kuma:               'A small brown bear with sleepy round eyes and a chunky furred body, tiny rounded ears and stubby paws,',
  saru:               'A small playful monkey with bright curious eyes and a brown furry body, tiny pink face and a long curling tail,',
  buta:               'A small round pig with cheerful black eyes and a plump pink body, tiny upturned snout and curly tail,',
  tora:               'A small striped tiger with fierce orange eyes and an orange-and-black furred body, sturdy paws and a swishing tail,',
  shika:              'A small spotted deer with gentle dark eyes and a slim brown body, tiny budding antlers and white-spotted flanks,',
  yousei:             'A small winged fairy creature with sparkling bright eyes and a leafy green body, tiny gauzy translucent wings,',
  kitsune:            'A small clever fox with sly gleaming eyes and a fluffy orange body, tiny black-tipped ears and a thick bushy tail,',
  hitsuji:            'A small fluffy sheep with sleepy gentle eyes and a cloud-soft white wool body, tiny black face and stubby legs,',
  kame:               'A small sturdy turtle with calm wise eyes and a domed mossy green shell, tiny stubby legs and a smiling beak,',
  nezumi:             'A small grey mouse with bright beady eyes and a tiny round body, large round ears and a thin pink tail,',
  kaeru:              'A small green frog with big bulging eyes and a smooth round body, tiny webbed feet and a wide cheerful mouth,',
  kamo:               'A small plump duck with bright cheerful eyes and a soft feathered body, tiny orange bill and webbed feet,',
  kujira:             'A small chubby whale with kind gentle eyes and a smooth blue body, tiny fins and a heart-shaped tail spout,',
  koori:              'A small ice spirit with glistening crystal eyes and a faceted icy-blue body, tiny frosted spikes along its back,',
  tsuchi:             'A small earth spirit with gentle dark eyes and a lumpy clay-brown body, tiny tufts of grass sprouting on top,',
  akuma:              'A small dark demon with glowing red eyes and a stocky purple-skinned body, tiny curved horns and a forked tail,',
  tenshi:             'A small winged angel creature with kind glowing eyes and a soft white-robed body, tiny feathery wings and a halo,',
  suna:               'A small sand spirit with bright twinkling eyes and a swirling tan-colored body of flowing grains,',
  tako:               'A small round octopus with curious wide eyes and a bulbous purple body, tiny coiled tentacles trailing beneath,',
  tsuru:              'A small graceful crane with bright keen eyes and a slender white feathered body, tiny black-tipped wings and a long beak,',
  tokage:             'A small green lizard with bright alert eyes and a smooth scaled body, tiny clawed feet and a long curling tail,',
  ika:                'A small squid with bright wide eyes and a streamlined teal body, tiny fins and trailing tentacles like ribbons,',
  inoshishi:          'A small wild boar with fierce determined eyes and a bristly brown body, tiny tusks and a thick neck,',
  kani:               'A small red crab with bright stalked eyes and a round armored body, tiny pincers raised and stubby walking legs,',
  kemono:             'A small wild beast with fierce glowing eyes and a shaggy dark-furred body, tiny pointed fangs and sturdy paws,',
  erufu:              'A small elf creature with bright shining eyes and a lithe leafy-green body, tiny pointed ears and a tiny bow on its back,',
  goburin:            'A small grinning goblin with sly yellow eyes and a wiry green body, tiny pointed ears and a tiny dagger,',
  hone:               'A small bone creature with hollow glowing eye sockets and a chunky body of stacked white bones, tiny rib cage and skull,',
  suishou:            'A small crystal creature with prismatic gem eyes and a faceted clear-quartz body, tiny pointed crystals jutting from its back,',
  suraimu:            'A small blue slime with cheerful dot eyes and a wobbly translucent body, tiny droplet shape and a gentle smile,',

  'kageno-inu':       'A small shadowy dog with glowing slit eyes and a wispy dark body, tiny pointed ears and a misty trailing tail,',
  'hikarino-uma':     'A small luminous horse with bright shining eyes and a glowing white body, tiny golden mane streaming with sparkling light,',
  'kumono-sakana':    'A small fluffy cloud fish with gentle round eyes and a puffy white body shaped like a fish, tiny wispy fins drifting,',
  'tsukino-ookami':   'A small silver wolf with glowing crescent-moon eyes and a moonlit pale-furred body, tiny pointed ears tipped with starlight,',
  'koorino-kuma':     'A small icy bear with glittering frosted eyes and a chunky frost-blue furred body, tiny frozen claws and a crystalline snout,',
  'sunano-hebi':      'A small sandy snake with sharp slit eyes and a coiled tan-scaled body, tiny grains of sand trailing behind,',
  'kaminarino-tori':  'A small thunder bird with crackling electric eyes and a jagged-feathered yellow body, tiny lightning-bolt tail and sparking wings,',
  'yukino-kitsune':   'A small snowy fox with glittering icy eyes and a fluffy white-furred body, tiny pointed ears and a frost-tipped bushy tail,',
  'hanano-yousei':    'A small flower fairy with sparkling pink eyes and a petal-clad body, tiny rose-leaf wings and a blossom crown,',
  'honeno-oni':       'A small bone-armored ogre with hollow glowing eyes and a stocky body wrapped in jagged bones, tiny curved horns and a club,',
};

export function buildCreaturePrompt(id) {
  const description = CREATURES[id];
  if (!description) throw new Error(`Unknown creature: ${id}`);
  return `${description} ${PROMPT_SUFFIX}`;
}

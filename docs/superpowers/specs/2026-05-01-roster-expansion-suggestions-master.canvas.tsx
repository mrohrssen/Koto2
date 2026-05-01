import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  type TableRowTone,
} from 'cursor/canvas';

type Source = 'Original 50' | 'Batch 2' | 'Additional';
type Filter = 'All' | 'Original 50' | 'Batch 2' | 'Additional' | 'Overlaps' | 'Flagged';

type Suggestion = {
  source: Source;
  slot: string;
  status: string;
  creature: string;
  group: string;
  japanese: string;
  reading: string;
  definition: string;
  rank: number;
  tier: string;
  rarity: string;
  reason: string;
  flag?: string;
};

const originalRoster = `
| Keep | Water | 水 | みず | water | 400 | Very common | Common | Starter-grade element |
| Add | Light | 光 | ひかり | light | 600 | Very common | Common | High-frequency elemental mascot |
| Keep | Flower | 花 | はな | flower; blossom | 800 | Very common | Common | Cute nature base |
| Add | Sea | 海 | うみ | sea; ocean | 800 | Very common | Common | Core nature element |
| Keep | Wind | 風 | かぜ | wind; breeze | 800 | Very common | Common | Contextual JPDB reading |
| Keep | Tree | 木 | き | tree; wood | 900 | Very common | Common | Starter-grade nature base |
| Keep | Fire | 火 | ひ | fire; flame | 1000 | Very common | Common | Starter-grade element |
| Add | Moon | 月 | つき | moon; month | 1100 | Common | Common | Iconic but approachable |
| Add | Shadow | 影 | かげ | shadow; silhouette | 1400 | Common | Uncommon | Spooky concept override |
| Keep | Stone | 石 | いし | stone | 1500 | Common | Common | Durable simple base |
| Add | Star | 星 | ほし | star; heavenly body | 1500 | Common | Common | Cute celestial base |
| Keep | Dog | 犬 | いぬ | dog | 1500 | Common | Common | Familiar animal |
| Keep | Cat | 猫 | ねこ | cat | 1600 | Common | Common | Familiar animal |
| Add | Horse | 馬 | うま | horse | 1600 | Common | Common | Familiar strong animal |
| Keep | Bird | 鳥 | とり | bird | 1800 | Common | Common | Familiar flying animal |
| Add | Snow | 雪 | ゆき | snow; snowfall | 1800 | Common | Common | Weather creature |
| Keep | Fish | 魚 | さかな | fish | 1900 | Common | Common | Familiar water animal |
| Add | Oni | 鬼 | おに | ogre; demon; oni | 2000 | Common | Rare | Strong folklore override |
| Add | Cloud | 雲 | くも | cloud | 2200 | Common | Common | Soft weather creature |
| Add | Grass | 草 | くさ | grass; weed; herb | 2200 | Common | Common | Small nature base |
| Keep | Iron | 鉄 | てつ | iron | 2200 | Common | Common | Material elemental base |
| Keep | Bug | 虫 | むし | insect; bug | 2300 | Common | Common | Simple creature class |
| Add | Dragon | 竜 | りゅう | dragon | 3300 | Mid | Legendary | Primary semantic override |
| Add | Thunder | 雷 | かみなり | lightning; thunder | 3600 | Mid | Uncommon | Strong element, not endgame-only |
| Add | Snake | 蛇 | へび | snake; serpent | 3600 | Mid | Uncommon | Predator but common archetype |
| Add | Ghost | 幽霊 | ゆうれい | ghost; apparition | 3600 | Mid | Rare | Supernatural override |
| Add | Wolf | 狼 | おおかみ | wolf | 3700 | Mid | Uncommon | Stronger than dog, not legendary |
| Add | Cow | 牛 | うし | cattle; cow; bull; ox | 4400 | Mid | Uncommon | Ordinary animal despite lower rank |
| Add | Bear | 熊 | くま | bear | 4700 | Mid | Rare | Large-power animal override |
| Add | Monkey | 猿 | さる | monkey; ape | 5200 | Mid | Uncommon | Concrete creature replacing Mountain |
| Add | Pig | 豚 | ぶた | pig | 5500 | Mid | Uncommon | Concrete creature replacing Sky |
| Add | Tiger | 虎 | とら | tiger | 5600 | Mid | Rare | Apex predator override |
| Add | Deer | 鹿 | しか | deer | 6600 | Mid | Uncommon | Concrete creature replacing Forest |
| Add | Fairy | 妖精 | ようせい | fairy; sprite; elf | 8300 | Low | Rare | Magical creature |
| Keep | Butterfly | 蝶 | ちょう | butterfly | 8600 | Low | Uncommon | Cute low-frequency creature |
| Add | Fox | 狐 | きつね | fox | 8600 | Low | Rare | Cultural trickster appeal |
| Add | Sheep | 羊 | ひつじ | sheep | 8700 | Low | Uncommon | Ordinary cute animal |
| Add | Rabbit | 兎 | うさぎ | rabbit; hare | 8800 | Low | Uncommon | Cute animal, not power rare |
| Add | Lion | 獅子 | しし | lion | 9000 | Low | Rare | Apex predator override |
| Add | Spider | 蜘蛛 | くも | spider | 9100 | Low | Uncommon | Distinct silhouette, moderate power |
| Add | Turtle | 亀 | かめ | tortoise; turtle | 9300 | Low | Uncommon | Defensive creature |
| Add | Hawk | 鷹 | たか | hawk; falcon | 9400 | Low | Rare | Predator bird override |
| Add | Mouse/Rat | 鼠 | ねずみ | mouse; rat | 10300 | Low | Uncommon | Low frequency but small animal |
| Add | Frog | 蛙 | かえる | frog | 11800 | Low | Uncommon | Cute amphibian |
| Keep | Ant | 蟻 | あり | ant | 12100 | Low | Uncommon | Low frequency, small creature |
| Keep | Bee | 蜂 | はち | bee; wasp; hornet | 12600 | Low | Uncommon | Low frequency, small threat |
| Add | Crow | 烏 | からす | crow; raven | 16800 | Very low | Rare | Dark bird with strong theme |
| Add | Duck | 鴨 | かも | duck | 17300 | Very low | Uncommon | Concrete water-adjacent creature replacing Rain |
| Add | Whale | 鯨 | くじら | whale | 20000 | Very low | Epic | Huge creature plus low frequency |
| Keep | Owl | 梟 | ふくろう | owl | 26400 | Ultra low | Rare | Low frequency, wise/mystic but not legendary |
`;

const batch2Roster = `
| 51 | Add | Sun | 太陽 | たいよう | sun | 1,900 | Common | Common | Celestial peer of Moon |
| 52 | Add | Ice | 氷 | こおり | ice | 2,100 | Common | Common | Starter-grade element |
| 53 | Add | Earth | 土 | つち | earth; soil; dirt; clay; mud | 2,100 | Common | Common | Starter-grade element (soil sense, vid 1445270) |
| 54 | Add | Devil | 悪魔 | あくま | devil; demon; fiend | 3,100 | Mid | Rare | Supernatural override on Mid frequency |
| 55 | Add | Angel | 天使 | てんし | angel | 3,300 | Mid | Rare | Supernatural override on Mid frequency |
| 56 | Add | Sand | 砂 | すな | sand; grit | 3,400 | Mid | Uncommon | Default Mid -> Uncommon, basic granular element |
| 57 | Add | Cherry blossom | 桜 | さくら | cherry tree; cherry blossom | 3,500 | Mid | Uncommon | Iconic plant, no semantic power override |
| 58 | Add | Giant | 巨人 | きょじん | giant; great man | 4,900 | Mid | Rare | Large humanoid mythic override |
| 59 | Add | Bamboo | 竹 | たけ | bamboo (any grass of subfamily Bambusoideae) | 6,500 | Mid | Uncommon | Sturdy plant, default Mid -> Uncommon |
| 60 | Add | Witch | 魔女 | まじょ | witch | 8,200 | Low | Rare | Magical humanoid override |
| 61 | Add | Octopus | タコ | たこ | octopus | 9,800 | Low | Uncommon | Ordinary marine animal |
| 62 | Add | Leaf | 葉っぱ | はっぱ | leaf; blade (of grass); (pine) needle | 10,300 | Low | Uncommon | Cute plant base; bare 葉 was the wrong (counter) sense |
| 63 | Add | Mushroom | キノコ | きのこ | mushroom | 10,400 | Low | Uncommon | Cute classic creature concept |
| 64 | Add | Crane | 鶴 | つる | crane (any bird of family Gruidae, esp. Grus japonensis) | 11,000 | Low | Rare | Symbolic longevity bird, mild folklore override |
| 65 | Add | Eagle | 鷲 | わし | eagle (Accipitridae family) | 11,600 | Low | Rare | Apex predator override |
| 66 | Add | Lizard | トカゲ | とかげ | lizard | 11,700 | Low | Uncommon | Small reptile, ordinary |
| 67 | Add | Squid | イカ | いか | cuttlefish; squid | 11,900 | Low | Uncommon | Ordinary marine animal |
| 68 | Add | Boar | 猪 | いのしし | wild boar; wild pig | 12,500 | Low | Rare | Powerful charging mammal override |
| 69 | Add | Crab | カニ | かに | crab | 12,700 | Low | Uncommon | Ordinary marine animal |
| 70 | Add | Pigeon-Dove | 鳩 | はと | pigeon; dove | 12,800 | Low | Uncommon | Ordinary common bird, replaces rejected Chicken slot |
| 71 | Add | Squirrel | リス | りす | squirrel (any mammal of family Sciuridae) | 13,600 | Low | Uncommon | Cute small mammal |
| 72 | Add | Elephant | 象 | ぞう | elephant (Elephantidae spp.) | 14,000 | Low | Rare | Very large mammal override |
| 73 | Add | Shrimp | エビ | えび | prawn; shrimp; lobster; crayfish | 14,300 | Low | Uncommon | Ordinary marine animal |
| 74 | Add | Skeleton | 骸骨 | がいこつ | skeleton | 14,400 | Low | Rare | Undead mythic creature override |
| 75 | Add | Mermaid | 人魚 | にんぎょ | mermaid; merman | 14,500 | Low | Rare | Mythic aquatic humanoid override |
| 76 | Add | Tanuki | 狸 | たぬき | tanuki (Nyctereutes procyonoides); raccoon dog; sly trickster | 14,600 | Low | Rare | Folklore shape-shifter override |
| 77 | Add | Firefly | 蛍 | ほたる | firefly (Luciola cruciata); lightning bug; glowworm | 15,000 | Low | Uncommon | Cute glowing insect |
| 78 | Add | Tengu | 天狗 | てんぐ | tengu; long-nosed goblin | 17,200 | Very low | Rare | Folklore yokai override (down from default Rare/Epic) |
| 79 | Add | Moss | 苔 | こけ | moss; short plants resembling moss | 17,400 | Very low | Uncommon | Small simple plant, override down from Rare |
| 80 | Add | Sparrow | 雀 | すずめ | tree sparrow (Passer montanus) | 17,600 | Very low | Uncommon | Tiny ordinary bird, cute-animal override down |
| 81 | Add | Bat | コウモリ | こうもり | bat (Chiroptera spp.) | 17,900 | Very low | Uncommon | Small flying mammal, override down from Rare |
| 82 | Add | Dolphin | イルカ | いるか | dolphin (or other small toothed whales) | 19,500 | Very low | Rare | Large intelligent marine mammal; not a compound creature |
| 83 | Add | Shark | サメ | さめ | shark | 19,700 | Very low | Rare | Apex predator override |
| 84 | Add | Carp | 鯉 | こい | common carp (Cyprinus carpio); koi carp | 20,300 | Very low | Uncommon | Ordinary fish, override down from Rare |
| 85 | Add | Crocodile | ワニ | わに | crocodile; alligator | 20,700 | Very low | Rare | Apex predator override |
| 86 | Add | Jellyfish | クラゲ | くらげ | jellyfish; medusa | 21,200 | Very low | Uncommon | Drifting marine creature, no power; not a compound |
| 87 | Add | Cicada | 蝉 | せみ | cicada; locust | 21,700 | Very low | Uncommon | Ordinary summer insect, override down from Rare |
| 88 | Add | Dragonfly | トンボ | とんぼ | dragonfly; damselfly | 27,000 | Ultra low | Uncommon | Small ordinary insect, override down from Rare/Epic |
| 89 | Add | Phoenix | 鳳凰 | ほうおう | Chinese firebird; Chinese phoenix | 27,700 | Ultra low | Epic | Mythic apex bird, peer of Whale; below Dragon (Legendary) |
| 90 | Add | Eel | ウナギ | うなぎ | eel (esp. Japanese eel, Anguilla japonica) | 28,100 | Ultra low | Uncommon | Ordinary long fish, override down from Rare/Epic |
| 91 | Add | Beetle | カブトムシ | かぶとむし | rhinoceros beetle (esp. Japanese rhinoceros beetle, Trypoxylus dichotomus) | 28,300 | Ultra low | Rare | Iconic Japanese kid-favorite insect |
| 92 | Add | Kappa | 河童 | かっぱ | kappa; mythical water-dwelling creature | 29,400 | Ultra low | Rare | Folklore yokai override (down from default Rare/Epic) |
| 93 | Add | Kirin / Giraffe | キリン | きりん | giraffe (Giraffa camelopardalis); qilin (Chinese unicorn) | 32,100 | Ultra low | Rare | Large mammal + mythic override; one merged JPDB entry |
| 94 | Add | Mantis | カマキリ | かまきり | praying mantis (esp. narrow-winged mantis, Tenodera angustipennis) | 32,700 | Ultra low | Rare | Predator insect override |
| 95 | Add | Weasel | イタチ | いたち | weasel (esp. Japanese weasel, Mustela itatsi); mustelid | 36,300 | Ultra low | Uncommon | Small mammal, override down from Rare/Epic |
| 96 | Add | Camel | ラクダ | らくだ | camel | 36,700 | Ultra low | Rare | Large desert mammal override |
| 97 | Add | Snail | カタツムリ | かたつむり | snail | 37,000 | Ultra low | Uncommon | Small slow critter, override down from Rare/Epic |
| 98 | Add | Starfish | ヒトデ | ひとで | starfish; sea star; any echinoderm of class Asteroidea | 40,600 | Ultra low | Uncommon | Tiny marine invertebrate, override down from Rare/Epic |
| 99 | Add | Gecko | ヤモリ | やもり | gecko; house lizard | 46,500 | Ultra low | Uncommon | Small reptile, override down from Rare/Epic |
| 100 | Add | Catfish | ナマズ | なまず | catfish (esp. Amur catfish, Silurus asotus); earthquake | 48,200 | Ultra low | Rare | Folkloric earthquake fish (namazu), mild override up |
`;

const additionalRoster = `
| Add | Beast | 獣 | けもの | beast; brute; animal | 3100 | Mid | Rare | Generic animal word, but strong enough to sit above ordinary animals |
| Add | Demon | 悪魔 | あくま | devil; demon; fiend | 3100 | Mid | Rare | Supernatural threat override |
| Add | Angel | 天使 | てんし | angel | 3300 | Mid | Rare | Mythic humanoid creature override |
| Add | Monster | 化け物 | ばけもの | goblin; apparition; monster; ghost; phantom; specter | 3600 | Mid | Rare | Broad fantasy creature with clear RPG use |
| Add | Spirit | 精霊 | せいれい | spirit; soul; ghost | 8200 | Low | Rare | Magical creature override |
| Add | Zombie | ゾンビ | ゾンビ | zombie | 8700 | Low | Rare | Undead creature override |
| Add | Chicken | 鶏 | にわとり | chicken; domestic chicken | 9100 | Low | Uncommon | Ordinary concrete animal, kept below rarity implied by rank |
| Add | Crane | 鶴 | つる | crane | 11000 | Low | Uncommon | Elegant bird silhouette, not a predator |
| Add | Eagle | 鷲 | わし | eagle | 11600 | Low | Rare | Predator bird override |
| Add | Boar | 猪 | いのしし | wild boar; wild pig | 12500 | Low | Uncommon | Strong animal, but still a familiar forest creature |
| Add | Pigeon/Dove | 鳩 | はと | pigeon; dove | 12800 | Low | Uncommon | Familiar city bird despite lower rank |
| Add | Elephant | 象 | ぞう | elephant | 14000 | Low | Epic | Huge animal override |
| Add | Tanuki | 狸 | たぬき | tanuki; raccoon dog | 14600 | Low | Rare | Concrete animal with folklore appeal |
| Add | Gorilla | ゴリラ | ゴリラ | gorilla | 15700 | Very low | Rare | Large-power animal override |
| Add | Crab | 蟹 | かに | crab | 17100 | Very low | Uncommon | Distinct silhouette, ordinary scale |
| Add | Dinosaur | 恐竜 | きょうりゅう | dinosaur | 17100 | Very low | Epic | Ancient large-creature override |
| Add | Tengu | 天狗 | てんぐ | tengu; long-nosed goblin | 17200 | Very low | Rare | Japanese folklore creature |
| Add | Sparrow | 雀 | すずめ | tree sparrow | 17600 | Very low | Uncommon | Small familiar bird, not rare just because rank is low |
| Add | Panda | パンダ | パンダ | panda | 18400 | Very low | Rare | Iconic cute animal override |
| Add | Bat | 蝙蝠 | こうもり | bat | 18500 | Very low | Rare | Spooky nocturnal silhouette |
| Add | Penguin | ペンギン | ペンギン | penguin | 19500 | Very low | Uncommon | Cute visual animal, kept approachable |
| Add | Lizard | 蜥蜴 | とかげ | lizard; skink lizard | 22100 | Very low | Uncommon | Concrete reptile, moderate strength |
| Add | Swallow | 燕 | つばめ | swallow; martin | 23300 | Very low | Uncommon | Graceful small bird |
| Add | Shark | 鮫 | さめ | shark | 24300 | Very low | Rare | Apex predator override |
| Add | Griffin | グリフォン | グリフォン | griffon; gryphon | 25800 | Ultra low | Epic | Mythic creature override |
| Add | Octopus | 蛸 | たこ | octopus | 33000 | Ultra low | Rare | Distinct body plan and strong visual clarity |
| Add | Hyena | ハイエナ | ハイエナ | hyena | 33100 | Ultra low | Rare | Predator/scavenger appeal |
| Add | Peacock/Peafowl | 孔雀 | くじゃく | peafowl, including peacock and peahen | 34200 | Ultra low | Rare | Strong visual appeal override |
| Add | Pegasus | ペガサス | ペガサス | Pegasus; winged horse in Greek mythology | 34700 | Ultra low | Epic | Mythic creature override |
| Add | Scorpion | 蠍 | さそり | scorpion | 35900 | Ultra low | Rare | Distinct threat silhouette |
| Add | Koala | コアラ | コアラ | koala | 37100 | Ultra low | Uncommon | Cute animal, not made rare solely by low frequency |
| Add | Kirin/Giraffe | 麒麟 | きりん | giraffe; qilin | 38800 | Ultra low | Rare | Works as either clear animal silhouette or mythic qilin |
| Add | Parrot | インコ | インコ | true parrot | 39600 | Ultra low | Uncommon | Bright, readable bird mascot |
| Add | Dragonfly | 蜻蛉 | とんぼ | dragonfly; damselfly | 40000 | Ultra low | Uncommon | Visually distinct small creature |
| Add | Nue | 鵺 | ぬえ | Japanese chimera; mythical creature | 40600 | Ultra low | Legendary | High fantasy weight and Japanese folklore specificity |
| Add | Crocodile/Alligator | 鰐 | わに | crocodile; alligator | 41400 | Ultra low | Rare | Large predator override |
| Add | Mantis | 蟷螂 | かまきり | praying mantis | 44500 | Ultra low | Rare | Predator insect with clear silhouette |
| Add | Sphinx | スフィンクス | スフィンクス | sphinx | 46100 | Ultra low | Epic | Mythic guardian creature |
| Add | Camel | 駱駝 | らくだ | camel | 47600 | Ultra low | Uncommon | Large but ordinary animal; visual clarity over rank |
| Add | Jellyfish | 海月 | くらげ | jellyfish; medusa | 48000 | Ultra low | Uncommon | Lexical animal word with strong cute/soft silhouette |
| Add | Squirrel | 栗鼠 | りす | squirrel | 48900 | Ultra low | Uncommon | Cute small animal, not rare just because rank is low |
| Add | Tsuchinoko | ツチノコ | ツチノコ | mythical snake-like creature with thick midsection | 49100 | Ultra low | Rare | Cryptid appeal, less globally iconic than dragon-tier myths |
| Add | Rhinoceros | 犀 | さい | rhinoceros | 50200 | Ultra low | Epic | Huge armored animal override |
| Add | Cheetah | チーター | チーター | cheetah | 50800 | Ultra low | Rare | Speed predator override |
| Add | Kangaroo | カンガルー | カンガルー | kangaroo | 52100 | Ultra low | Uncommon | Distinct silhouette, ordinary animal strength |
| Add | Jaguar | ジャガー | ジャガー | jaguar | 53400 | Ultra low | Rare | Apex cat override |
| Add | Flamingo | フラミンゴ | フラミンゴ | flamingo | 74000 | Ultra low | Rare | Strong color and silhouette override |
| Add | Otter | 獺 | かわうそ | otter; Japanese river otter | 87300 | Ultra low | Uncommon | Cute animal, kept approachable despite ultra-low rank |
| Add | Dolphin | 海豚 | いるか | dolphin; small toothed whale | 92100 | Ultra low | Rare | Lexical animal word; iconic intelligent sea creature |
| Add | Seal | 海豹 | あざらし | true seal; earless seal | 104600 | Ultra low | Uncommon | Cute animal, not rare solely because JPDB rank is low |
`;

const filters: Filter[] = ['All', 'Original 50', 'Batch 2', 'Additional', 'Overlaps', 'Flagged'];

const flagByGroup: Record<string, string> = {
  Chicken: 'Rejected by Batch 2 notes as duplicate of Bird JPDB vid',
  Penguin: 'Mentioned by Batch 2 as an easy add candidate, not selected',
  Swallow: 'Mentioned by Batch 2 as an easy add candidate, not selected',
};

function conceptGroup(creature: string) {
  const normalized = creature.replace(/\s*\/\s*/g, '/').replace('-', '/');
  if (normalized === 'Devil' || normalized === 'Demon') return 'Devil/Demon';
  if (normalized === 'Pigeon/Dove') return 'Pigeon/Dove';
  if (normalized === 'Kirin/Giraffe') return 'Kirin/Giraffe';
  if (normalized === 'Crocodile/Alligator') return 'Crocodile';
  return normalized;
}

function parseRows(source: Source, raw: string): Suggestion[] {
  return raw
    .trim()
    .split('\n')
    .map((line, index) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      const hasSlot = source === 'Batch 2';
      const slot = hasSlot ? cells[0] : source === 'Original 50' ? String(index + 1) : `A${index + 1}`;
      const offset = hasSlot ? 1 : 0;
      const group = conceptGroup(cells[offset + 1]);

      return {
        source,
        slot,
        status: cells[offset],
        creature: cells[offset + 1],
        group,
        japanese: cells[offset + 2],
        reading: cells[offset + 3],
        definition: cells[offset + 4],
        rank: Number(cells[offset + 5].replace(/,/g, '')),
        tier: cells[offset + 6],
        rarity: cells[offset + 7],
        reason: cells[offset + 8],
        flag: flagByGroup[group],
      };
    });
}

const suggestions = [
  ...parseRows('Original 50', originalRoster),
  ...parseRows('Batch 2', batch2Roster),
  ...parseRows('Additional', additionalRoster),
];

const groups = suggestions.reduce<Record<string, Suggestion[]>>((acc, row) => {
  acc[row.group] = [...(acc[row.group] ?? []), row];
  return acc;
}, {});

function groupStatus(row: Suggestion) {
  if (row.flag) return row.flag;

  const groupRows = groups[row.group] ?? [];
  if (groupRows.length === 1) return `${row.source} only`;

  const sources = new Set(groupRows.map((item) => item.source));
  const forms = new Set(groupRows.map((item) => `${item.japanese}/${item.rank}`));
  const rarities = new Set(groupRows.map((item) => item.rarity));
  const sourceLabel = Array.from(sources).join(' + ');

  if (forms.size > 1 && rarities.size > 1) return `${sourceLabel}: form/rank and rarity differ`;
  if (forms.size > 1) return `${sourceLabel}: Japanese form/rank differs`;
  if (rarities.size > 1) return `${sourceLabel}: rarity differs`;
  return sourceLabel;
}

function matchesFilter(row: Suggestion, filter: Filter) {
  if (filter === 'All') return true;
  if (filter === 'Overlaps') return (groups[row.group]?.length ?? 0) > 1;
  if (filter === 'Flagged') return Boolean(row.flag);
  return row.source === filter;
}

function rowTone(row: Suggestion): TableRowTone | undefined {
  if (row.flag) return 'warning';
  if (row.source === 'Original 50') return 'success';
  if ((groups[row.group]?.length ?? 0) > 1) return 'info';
  return undefined;
}

function countRows(source: Source) {
  return suggestions.filter((row) => row.source === source).length;
}

function formatRank(rank: number) {
  return rank.toLocaleString('en-US');
}

export default function RosterExpansionSuggestionsMaster() {
  const [filter, setFilter] = useCanvasState<Filter>('roster-filter-v2', 'All');
  const filtered = suggestions.filter((row) => matchesFilter(row, filter));
  const overlapCount = Object.values(groups).filter((rows) => rows.length > 1).length;

  return (
    <Stack gap={20}>
      <H1>Roster Expansion Suggestions Master</H1>
      <Text>
        Combined view of all three roster docs: the original 50-creature base roster, Batch 2, and the Additional follow-on proposal. The table preserves every source row while grouping duplicate creature concepts.
      </Text>

      <Grid columns={5} gap={16}>
        <Stat value={suggestions.length} label="Source rows" />
        <Stat value={Object.keys(groups).length} label="Unique concepts" />
        <Stat value={`${countRows('Original 50')} / ${countRows('Batch 2')} / ${countRows('Additional')}`} label="Original / Batch 2 / Additional" />
        <Stat value={overlapCount} label="Overlap concepts" tone="info" />
        <Stat value={String(filtered.length)} label="Rows currently shown" />
      </Grid>

      <Callout tone="info" title="How to read this">
        Green rows are the original base 50. Blue-tinted rows are concepts suggested by more than one doc. Yellow rows are explicit flags from the source notes, such as Chicken being rejected by Batch 2.
      </Callout>

      <Row gap={8} wrap>
        {filters.map((option) => (
          <Pill key={option} active={filter === option} onClick={() => setFilter(option)}>
            {option}
          </Pill>
        ))}
      </Row>

      <Divider />

      <H2>All Roster Suggestions</H2>
      <Table
        headers={['Source', '#', 'Status', 'Creature', 'Japanese', 'Reading', 'Definition', 'JPDB Rank', 'Tier', 'Rarity', 'Cross-doc status', 'Reason']}
        rows={filtered.map((row) => [
          row.source,
          row.slot,
          row.status,
          row.creature,
          row.japanese,
          row.reading,
          row.definition,
          formatRank(row.rank),
          row.tier,
          row.rarity,
          groupStatus(row),
          row.reason,
        ])}
        rowTone={filtered.map(rowTone)}
        columnAlign={['left', 'right', 'left', 'left', 'left', 'left', 'left', 'right', 'left', 'left', 'left', 'left']}
        striped
        stickyHeader
      />

      <Divider />

      <H2>Fast Takeaways</H2>
      <Text>
        The complete source set is 150 rows: 50 original roster entries, 50 Batch 2 entries, and 50 Additional entries. After grouping duplicate concepts like Bat, Dolphin, Mantis, and Kirin/Giraffe, the canvas shows the broader 100+ candidate pool rather than only the newer 50-row subset.
      </Text>
      <Text tone="secondary" size="small">
        Batch 2 is generally more conservative on rarity and often picks JPDB primary katakana forms. The Additional doc contributes the larger mythic and predator tail, including Griffin, Pegasus, Sphinx, Nue, Rhinoceros, Dinosaur, and several big cats.
      </Text>
    </Stack>
  );
}

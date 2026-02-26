/**
 * Apply AI-generated categories to the Translation CSV.
 * One-shot script — run once, then delete.
 */
import { readFileSync, writeFileSync } from 'fs';

const CSV_PATH = 'JAPANESE NAMES/Translation Only Words.csv';

// Category map from Opus 4.6 subagent results (row_number -> category)
const categories = {
2:"NPC",3:"NPC",4:"NPC",5:"NPC",6:"NPC",7:"NPC",8:"NPC",9:"NPC",10:"NPC",11:"NPC",12:"NPC",13:"NPC",
14:"Place",15:"Creature",16:"Creature",17:"Creature",18:"Creature",19:"Creature",20:"Creature",21:"Creature",
22:"Item",23:"Item",24:"Item",25:"Creature",26:"Creature",27:"Item",28:"Creature",29:"Creature",30:"Creature",
31:"Creature",32:"Creature",33:"Item",34:"Item",35:"Creature",36:"Creature",37:"Creature",38:"Creature",
39:"Creature",40:"Creature",41:"Creature",42:"Item",43:"Concept",44:"Creature",45:"Place",46:"Place",
47:"Creature",48:"Creature",49:"Concept",50:"Concept",51:"Concept",52:"Concept",53:"Concept",54:"Concept",
55:"Concept",56:"Concept",57:"Concept",58:"NPC",59:"NPC",60:"NPC",61:"NPC",62:"NPC",63:"Place",64:"Place",
65:"Place",66:"Creature",67:"Creature",68:"Item",69:"Concept",70:"Creature",71:"Concept",72:"Item",
73:"Creature",74:"Creature",75:"Creature",76:"Creature",77:"Creature",78:"Item",79:"Creature",80:"Item",
81:"Item",82:"Creature",83:"Creature",84:"Creature",85:"Creature",86:"Creature",87:"Creature",88:"Creature",
89:"Creature",90:"Creature",91:"Creature",92:"Concept",93:"NPC",94:"NPC",95:"NPC",96:"NPC",97:"NPC",
98:"Creature",99:"Creature",100:"Creature",101:"Creature",102:"Creature",103:"Creature",104:"Creature",
105:"Creature",106:"Item",107:"Item",108:"Creature",109:"Place",110:"Place",111:"Item",112:"Place",
113:"Creature",114:"Creature",115:"Creature",116:"Place",117:"Creature",118:"Creature",119:"Creature",
120:"Item",121:"Creature",122:"Creature",123:"Creature",124:"Creature",125:"Creature",126:"Item",
127:"Creature",128:"Creature",129:"Item",130:"Creature",131:"Item",132:"Creature",133:"Concept",134:"Item",
135:"Place",136:"Item",137:"Creature",138:"Creature",139:"Concept",140:"Creature",141:"Concept",
142:"Concept",143:"Concept",144:"Concept",145:"NPC",146:"NPC",147:"Creature",148:"Creature",149:"Creature",
150:"Creature",151:"Creature",152:"Creature",153:"Creature",154:"Creature",155:"Item",156:"NPC",157:"NPC",
158:"NPC",159:"NPC",160:"NPC",161:"NPC",162:"NPC",163:"NPC",164:"NPC",165:"Place",166:"Creature",
167:"Creature",168:"Creature",169:"Creature",170:"Creature",171:"Creature",172:"Creature",173:"Creature",
174:"Creature",175:"Creature",176:"Place",177:"Place",178:"Creature",179:"Creature",180:"Creature",
181:"Creature",182:"Creature",183:"Creature",184:"Creature",185:"Creature",186:"Creature",187:"Creature",
188:"Creature",189:"Creature",190:"Creature",191:"Creature",192:"Creature",193:"Creature",194:"Creature",
195:"Creature",196:"Creature",197:"Creature",198:"Creature",199:"Creature",200:"Creature",201:"Creature",
202:"Creature",203:"Creature",204:"Creature",205:"Creature",206:"Creature",207:"Item",208:"Creature",
209:"Creature",210:"Creature",211:"Creature",212:"Creature",213:"Creature",214:"Creature",215:"Creature",
216:"Creature",217:"Creature",218:"Creature",219:"Creature",220:"Creature",221:"Item",222:"Creature",
223:"Item",224:"Creature",225:"Creature",226:"Creature",227:"Item",228:"Creature",229:"Item",
230:"Creature",231:"Creature",232:"Creature",233:"NPC",234:"NPC",235:"Place",236:"Creature",237:"Creature",
238:"Creature",239:"Creature",240:"Creature",241:"Creature",242:"Creature",243:"Creature",244:"Creature",
245:"Creature",246:"Creature",247:"Creature",248:"Creature",249:"Creature",250:"Creature",251:"Creature",
252:"Creature",253:"Creature",254:"Creature",255:"Creature",256:"Creature",257:"Creature",258:"Creature",
259:"Place",260:"Item",261:"Item",262:"Item",263:"Item",264:"Item",265:"Item",266:"Item",267:"Item",
268:"Item",269:"Item",270:"Item",271:"Item",272:"Item",273:"Item",274:"Item",275:"Item",276:"Item",
277:"Item",278:"Item",279:"Item",280:"Item",281:"Item",282:"Item",283:"Item",284:"Item",285:"Item",
286:"Item",287:"Item",288:"Item",289:"Item",290:"Item",291:"Item",292:"Item",293:"Item",294:"Item",
295:"Item",296:"Item",297:"Item",298:"NPC",299:"NPC",300:"NPC",301:"NPC",302:"NPC",303:"NPC",304:"Place",
305:"Place",306:"Creature",307:"Item",308:"Creature",309:"Creature",310:"Creature",311:"Creature",
312:"Creature",313:"Creature",314:"Creature",315:"Creature",316:"Item",317:"Item",318:"Creature",
319:"Creature",320:"Item",321:"Item",322:"Item",323:"Item",324:"Item",325:"Item",326:"Item",327:"Item",
328:"Item",329:"Item",330:"Item",331:"Item",332:"Item",333:"Item",334:"Item",335:"Item",336:"Item",
337:"Item",338:"Item",339:"Item",340:"NPC",341:"NPC",342:"NPC",343:"NPC",344:"Place",345:"Place",
346:"Place",347:"Place",348:"Place",349:"Item",350:"Creature",351:"Item",352:"Item",353:"Item",354:"Item",
355:"Item",356:"Item",357:"Creature",358:"Place",359:"Place",360:"Item",361:"Concept",362:"Item",
363:"Creature",364:"Creature",365:"Creature",366:"Creature",367:"Item",368:"Item",369:"Creature",
370:"Creature",371:"Creature",372:"Creature",373:"Item",374:"Item",375:"Creature",376:"Item",377:"NPC",
378:"NPC",379:"Item",380:"Item",381:"Creature",382:"Place",383:"NPC",384:"NPC",385:"NPC",386:"NPC",
387:"NPC",388:"NPC",389:"Place",390:"Place",391:"Place",392:"Item",393:"Item",394:"Item",395:"Item",
396:"Creature",397:"Creature",398:"Creature",399:"Creature",400:"Creature",401:"Creature",402:"Item",
403:"Concept",404:"Concept",405:"Concept",406:"Concept",407:"Concept",408:"Concept",409:"Concept",
410:"Concept",411:"Concept",412:"Concept",413:"Concept",414:"Concept",415:"Concept",416:"Concept",
417:"Concept",418:"Concept",419:"Concept",420:"Concept",421:"Concept",422:"NPC",423:"NPC",424:"Creature",
425:"Creature",426:"Creature",427:"Creature",428:"Item",429:"Creature",430:"Creature",431:"Creature",
432:"Creature",433:"Creature",434:"Creature",435:"Creature",436:"Item",437:"Item",438:"Creature",
439:"NPC",440:"NPC",441:"Creature",442:"Creature",443:"Creature",444:"Creature",445:"Creature",
446:"Creature",447:"Creature",448:"Creature",449:"Creature",450:"Creature",451:"Place",452:"Creature",
453:"Place",454:"Place",455:"Place",456:"Creature",457:"Item",458:"Creature",459:"Place",460:"Creature",
461:"Item",462:"Item",463:"Item",464:"Creature",465:"Creature",466:"Place",467:"Creature",468:"Item",
469:"Creature",470:"NPC",471:"Creature",472:"Creature",473:"Creature",474:"Creature",475:"Creature",
476:"Item",477:"Creature",478:"Concept",479:"Creature",480:"Creature",481:"Creature",482:"Creature",
483:"Concept",484:"Creature",485:"Creature",486:"NPC",487:"NPC",488:"Creature",489:"Item",490:"Creature",
491:"Creature",492:"Creature",493:"Creature",494:"Creature",495:"Creature",496:"Creature",497:"Place",
498:"Creature",499:"Creature",500:"Creature",501:"Creature",502:"Creature",503:"Creature",504:"Creature",
505:"Creature",506:"Creature",507:"Creature",508:"Creature",509:"NPC",510:"NPC",511:"NPC",512:"NPC",
513:"Creature",514:"Creature",515:"Creature",516:"Creature",517:"Creature",518:"Creature",519:"Place",
520:"Concept",521:"Place",522:"Place",523:"Creature",524:"Creature",525:"Place",526:"Place",527:"Place",
528:"Place",529:"Place",530:"Place",531:"Place",532:"Creature",533:"Creature",534:"NPC",535:"NPC",
536:"Creature",537:"Place",538:"Concept",539:"Item",540:"Place",541:"Creature",542:"Creature",543:"NPC",
544:"NPC",545:"NPC",546:"NPC",547:"Place",548:"Place",549:"Place",550:"Place",551:"Place",552:"Creature",
553:"Creature",554:"Creature",555:"Creature",556:"Creature",557:"Creature",558:"Creature",559:"Creature",
560:"Creature",561:"Item",562:"Item",563:"Place",564:"Creature",565:"Creature",566:"Creature",567:"Creature",
568:"Creature",569:"Creature",570:"Creature",571:"NPC",572:"NPC",573:"NPC",574:"Creature",575:"Place",
576:"Item",577:"Place",578:"Item",579:"Place",580:"Creature",581:"Place",582:"Place",583:"Creature",
584:"NPC",585:"NPC",586:"NPC",587:"NPC",588:"NPC",589:"NPC",590:"Place",591:"Place",592:"Place",
593:"Place",594:"Place",595:"Place",596:"Place",597:"Creature",598:"Concept",599:"Creature",600:"Creature",
601:"Creature",602:"Creature",603:"Creature",604:"Item",605:"Item",606:"Item",607:"Item",608:"Item",
609:"Creature",610:"Creature",611:"NPC",612:"NPC",613:"NPC",614:"Item",615:"Creature",616:"Item",
617:"Creature",618:"Creature",619:"Creature",620:"Creature",621:"Creature",622:"Creature",623:"Creature",
624:"Creature",625:"Creature",626:"Creature",627:"Creature",628:"Creature",629:"Creature",630:"Creature",
631:"Creature",632:"Creature",633:"Creature",634:"Creature",635:"Creature",636:"Creature",637:"Creature",
638:"Creature",639:"Creature",640:"NPC",641:"NPC",642:"NPC",643:"NPC",644:"NPC",645:"Place",646:"Place",
647:"Place",648:"Place",649:"Place",650:"Creature",651:"Creature",652:"Creature",653:"Creature",
654:"Creature",655:"Creature",656:"Creature",657:"Creature",658:"Creature",659:"Creature",660:"Creature",
661:"Creature",662:"Creature",663:"Creature",664:"Creature",665:"Creature",666:"Creature",667:"Creature",
668:"Place",669:"Concept",670:"Concept",671:"Concept",672:"Concept",673:"Concept",674:"Concept",
675:"Concept",676:"Creature",677:"Creature",678:"Creature",679:"Creature",680:"Creature",681:"Creature",
682:"Creature",683:"Concept",684:"Concept",685:"Concept",686:"Concept",687:"Concept",688:"Concept",
689:"Concept",690:"Concept",691:"Concept",692:"Concept",693:"Concept",694:"Concept",695:"Concept",
696:"Concept",697:"Concept",698:"Concept",699:"Concept",700:"Creature",701:"Creature",702:"Creature",
703:"Creature",704:"Creature",705:"Creature",706:"Creature",707:"Item"
};

// Read original CSV
const raw = readFileSync(CSV_PATH, 'utf8');
const lines = raw.split('\n');

// Add Category to header
const header = lines[0] + ',Category';
const output = [header];

// Add category to each data row
let counts = { NPC: 0, Item: 0, Creature: 0, Place: 0, Concept: 0, missing: 0 };
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const rowNum = i + 1; // 1-indexed, header is row 1, first data is row 2
  const cat = categories[rowNum] || '';
  if (cat) counts[cat]++;
  else counts.missing++;
  output.push(line + ',' + cat);
}

writeFileSync(CSV_PATH, output.join('\n') + '\n', 'utf8');

console.log('Done! Category counts:', counts);
console.log('Total rows:', Object.values(counts).reduce((a, b) => a + b, 0));

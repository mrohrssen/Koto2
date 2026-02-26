# Progressive language replacement: a design pattern with deep roots

**The idea of gradually swapping a learner's native language for target language within the same text or game is both ancient in pedagogy and remarkably underexplored in game design.** "Learn Japanese RPG: Hiragana Forbidden Speech" is the most fully realized implementation of this mechanic in a commercial video game, but the underlying pattern appears across children's books, interlinear texts, bilingual teaching methods, and a handful of indie games — all converging on the same insight: learners acquire vocabulary when unfamiliar words are embedded within otherwise comprehensible content. Research on *A Clockwork Orange* readers showed **76% recognition of embedded foreign-derived slang**, and vocabulary science sets clear parameters for how replacement should be paced. Despite this strong theoretical foundation, no published study has formally examined progressive L1→L2 replacement as a unified game mechanic — making this a genuine design frontier.

---

## How "Forbidden Speech Hiragana" actually works

**"Learn Japanese RPG: Hiragana Forbidden Speech"** is a commercial Steam RPG ($19.99) developed by **Lun Calsari** of Study Bunny Games, LLC. It launched in Early Access on October 20, 2022 and fully released December 14, 2023. Built in RPG Maker, it carries a **98% positive rating** from 240 Steam reviews and delivers 18+ hours of content.

The game's signature innovation is its **Adaptive Dialogue System**. All dialogue begins entirely in English. As players learn Japanese words through gameplay, the system tracks their knowledge. When a player has demonstrated mastery of *every* word in a given sentence, that sentence permanently switches from English to Japanese hiragana in all future dialogue. If even one word remains unlearned, the sentence stays in English. Players can press a button to reveal romaji transliteration and press again for the English translation, creating a layered comprehension scaffold.

Combat functions as **real-time typing drills** — hiragana characters or words appear on screen, and players type the corresponding romaji or English meaning to attack enemies. Each word has its own experience level; higher-level words appear less frequently, implementing a form of spaced repetition. The developer coined two terms for the pedagogical approach: **"Mild Immersion"** (never exposing beginners to content beyond their level) and **"Small Step Immersion"** (immediately using newly learned characters in words and dialogue). The narrative frames Japanese as a literally "forbidden" magical language, giving the replacement mechanic a diegetic justification within the RPG storyline. Over 4,000 lines of professional Japanese voice acting accompany the text. By the end, a game that started almost entirely in English has transformed into one read largely in hiragana.

---

## Games that replace, decipher, or progressively reveal language

The progressive replacement mechanic exists on a spectrum across games, from direct L1→L2 word swapping to reverse-direction decipherment where incomprehensible L2 gradually becomes readable.

**Direct progressive replacement (L1 text becomes L2).** Beyond Forbidden Speech Hiragana, the purest digital implementation is **One Third Stories**, a subscription service for children ages 4–9 that sends monthly storybooks beginning entirely in English. Words are swapped one at a time into French, Spanish, German, or Italian using what the company calls the **"Clockwork Methodology™"** — starting with single nouns, building to phrases, then sentences, until whole pages are in the target language. Each book includes activity sheets, flashcards, and native-speaker audio narration.

**Koe (声)**, a JRPG that launched Part 1 in April 2024 after a decade-long Kickstarter journey, takes a related approach. Players collect Japanese words from NPCs and treasure chests, then combine those words into sentences that serve as combat attacks. The game starts mostly in English and progressively introduces more Japanese as the player's word inventory grows.

**Reverse-direction decipherment (L2 becomes comprehensible).** **Lingotopia** (2018) drops the player on an island where all NPC dialogue appears in the target language. Clicking objects in the environment teaches you their names, and those words are automatically translated whenever they appear in future conversations — gradually transforming incomprehensible dialogue into readable text across Arabic, Chinese, French, German, Japanese, Russian, and Spanish.

**Chants of Sennaar** (2023, Rundisc/Focus Entertainment) applies the same principle to five fictional logographic languages. Players observe context clues, record guesses in a notebook, and when translations are confirmed, **glyphs permanently become readable English**. Named a *New York Times* Top 10 Game of 2023 with a Metacritic score around 85, it is the most critically acclaimed game using this mechanic. **Heaven's Vault** (2019, Inkle Studios) pioneered a similar approach with a fictional ancient language, allowing even incorrect translation guesses to affect the narrative.

**Out There** (2014, Mi-Clos Studio) deserves special mention: its alien dialogue system randomly generates ~30 alien words each playthrough, and as players decode them through interaction, **alien text is automatically replaced with English translations** — a perfect structural mirror of the progressive replacement pattern, even though it teaches a fictional language.

**Vocabulary-building exploration games** form a broader category. **Influent** (2014) lets players explore a 3D apartment and click objects to learn their names in 23 languages. **Earthlingo** (free, 28 languages) has players explore Earth as an alien, collecting words spatially. **Shashingo** (2024, 91% positive on Steam) uses a photography mechanic — players photograph objects on Japanese streets, and each photo becomes a flashcard. None of these implement direct text replacement, but all create environments where the density of known L2 content increases organically over time.

---

## Tabletop games that restrict or replace language

Several tabletop games use language creation, decipherment, or restriction as core mechanics. **Dialect: A Game About Language and How It Dies** (Thorny Games) has 3–5 players collaboratively build a language for an isolated community across three "ages." Players progressively *use* their invented language in conversation during play, creating an emergent replacement effect where English is increasingly supplemented by invented terms. The same studio produced **Sign** (a LARP where players develop a sign language from scratch) and **Xenolanguage** (an *Arrival*-inspired game where players decode alien symbols using a custom channeling board).

For real-language learning, **KLOO** is an award-winning card game where players build sentences in French, Spanish, or Italian using color-coded word cards, progressing through four difficulty decks. **VERBA** (The Pericles Group) operates like a fill-in-the-blank party game entirely in the target language, covering Latin, Spanish, French, and more. **Kotoba Rollers**, a research-backed framework by James York, wraps commercially available board games in language-learning scaffolding that progressively reduces L1 support — players must communicate in the target language, with L1 aids fading over time.

---

## Graded readers and bilingual texts along the replacement spectrum

The progressive replacement concept maps onto a rich ecosystem of reading resources, though surprisingly few implement literal word-by-word replacement within running text.

**Interlinear texts** come closest. **HypLern** (formerly Bermuda Word, operating since 2006) prints full target-language text with word-for-word English translations in smaller font directly below each phrase, across **23+ languages**. Readers are instructed to re-read until high-frequency words are memorized, at which point the L1 line becomes unnecessary — a reader-directed form of progressive replacement. **InterlinearBooks.com** (associated with the University of Cambridge) applies the same format to classic literature, offering a separate monolingual version with each purchase so readers can test their independence. Both platforms report users achieving rapid vocabulary growth, though no formal controlled studies have been published.

**The Assimil method** (founded 1929, covering **100+ languages**) implements a structured two-phase progression. For the first 49 lessons, learners passively absorb bilingual dialogues with L2 on the left page and L1 translation on the right. Starting at lesson 50, the "Active Phase" begins — learners translate from L1 back into L2, effectively reversing the support direction. Dialogues grow progressively more complex throughout. Polyglot Alexander Arguelles has called Assimil "the cornerstone of my progress" in several dozen languages.

**LingQ** (founded 2007 by polyglot Steve Kaufmann) implements progressive replacement digitally. Readers engage with L2 text where unknown words are highlighted and clickable for instant translation. As words are marked "known" through spaced repetition, the visual highlighting disappears — the reading experience literally becomes less bilingual over time as blue highlights give way to clean, unassisted text across **49 languages**. Stephen Krashen has praised the approach as aligned with his comprehensible input theory.

The **Immersion Française** series (by Emily Hartman) is the closest print analogue to true progressive replacement across a book series. It moves from heavily bilingual short stories with 800+ English footnotes (A1) through five volumes to micro-novels written entirely in French (C1), systematically reducing L1 support across the series arc. **Olly Richards' "Short Stories in [Language]"** series (Teach Yourself/Hodder Education) takes a different approach — stories are written entirely in L2 from the start but controlled to the top 1,000 most frequent words, with glossaries, summaries, and comprehension questions in English providing a support framework that learners gradually rely on less.

---

## The academic case for progressive replacement is strong but indirect

No published study has directly examined progressive L1→L2 word replacement as a unified pedagogical mechanic. Yet the approach sits at the convergence of several well-established theoretical frameworks, each contributing a piece of the justification.

**Krashen's Input Hypothesis (i+1)** provides the foundational logic: learners acquire language when input is slightly beyond their current level. Progressive replacement operationalizes this by maintaining ~95–98% comprehensible content at all times while incrementally introducing L2 elements. **Vygotsky's Zone of Proximal Development** reframes this as scaffolding — L1 text is the temporary support structure that is "faded" as L2 competence develops, with the game adapting to each learner's personal ZPD. **Translanguaging pedagogy** (García, Li Wei, Cenoz & Gorter) validates the mixing of L1 and L2 within the same text as a natural cognitive strategy, not a deficiency — viewing the learner's full linguistic repertoire as a single integrated system with "soft and permeable boundaries."

The **"Clockwork Orange" paradigm** provides the most direct empirical validation. Anthony Burgess's novel embeds ~250 Russian-derived slang words ("Nadsat") within English prose. In a landmark 1978 study, Saragi, Nation, and Meister found that readers who simply read the novel achieved **76% recognition** of these embedded words on a subsequent test. A 2021 study found that **dispersion** — even distribution of unknown words throughout the text — was a more robust predictor of acquisition than raw frequency, a critical finding for game designers. Paul Nation's vocabulary research sets precise parameters: learners need **95–98% lexical coverage** for adequate comprehension, words require **10–12 repetitions** to be learned, and the first 1,000 most frequent words cover ~80% of any text — suggesting which L2 words to introduce first.

**Wolfgang Butzkamm's "sandwich technique"** is the closest established oral methodology. It presents information as L2→L1→L2 — the target phrase, a brief native-language "aside," then the target phrase again — with L1 insertions progressively reduced over time. Butzkamm describes a paradox: "by using the mother tongue skillfully we will eventually manage to conduct whole lessons in the foreign language only." C.J. Dodson's related **bilingual method** explicitly structures lessons to move from bilingual exercises to foreign-language-only activities, with approximately one-third of teaching time allocated to genuine communicative activities.

Meta-analyses of **digital game-based language learning (DGBLL)** show **medium to large positive effects** on L2 vocabulary (Cohen's d = 0.50–0.95). Notably, entertainment games were found more effective than educational games for L2 development — suggesting that narrative engagement matters as much as pedagogical design. A 2025 *Frontiers in Psychology* article observed that a player might initially understand little of a game in the target language, "but the game's visuals and feedback loop gradually make more language comprehensible" — describing exactly how progressive replacement works in practice.

---

## Design parameters emerging from the research

The convergence of these frameworks produces actionable design guidelines for anyone building a progressive replacement system:

- **Word density ceiling**: No more than **2–5% of words** should be unfamiliar L2 items at any point (Nation's coverage threshold)
- **Repetition floor**: Each L2 word needs **10–12 encounters** before it can be considered learned (Saragi et al.; Nation)
- **Distribution matters more than frequency**: Unknown words should be **evenly dispersed** throughout gameplay, not clustered (2021 *Emerald Insight* study)
- **Frequency-ordered introduction**: Start with the **highest-frequency L2 words** — the first 1,000 cover ~80% of natural text
- **Multimodal reinforcement**: Combining reading with listening produces **stronger acquisition** than either mode alone (Brown et al., 2008; Webb & Chang, 2015)

---

## Conclusion

The progressive replacement pattern — starting in L1 and dynamically swapping in L2 — is theoretically well-grounded but remarkably underbuilt as a deliberate design system. "Learn Japanese RPG: Hiragana Forbidden Speech" stands as the most complete implementation in a commercial game, with its Adaptive Dialogue System tracking per-sentence mastery to drive the transition. One Third Stories does the same in children's books. Chants of Sennaar and Lingotopia implement the reverse direction (L2 becoming comprehensible) to critical acclaim. The Clockwork Orange studies prove the underlying mechanism works — readers acquire embedded foreign vocabulary at high rates without explicit instruction, especially when unknown words are evenly distributed.

The design space remains wide open. No existing product combines all the research-backed parameters (adaptive pacing at 95–98% coverage, 10+ spaced repetitions per word, frequency-ordered introduction, multimodal support, and even word dispersion) into a single system across multiple languages. The academic literature provides a strong blueprint; the gap is in engineering and creative execution. For a game designer, the most important insight may be the simplest: **the replacement mechanic is not merely a gimmick but a direct operationalization of how vocabulary acquisition actually works** — comprehensible context plus incremental challenge plus repetition, dressed in narrative motivation.
// NPC prompt source-of-truth for the Scenario gpt-image-2 workflow.
//
// These IDs match the NPC sprite paths currently referenced by runtime UI:
// /assets/sprites/npcs/{id}.webp plus shrine_fox.webp at the sprite root.

export const PROMPT_SUFFIX = 'set against a solid white background, all rendered in crisp, clean pixels with gentle lighting and smooth gradients. Single 256x256 full-body sprite image showing the NPC facing left. This is a friendly JRPG NPC full-body character sprite. Readable at small size, and pixel art style. No text, no labels, no UI frame, no ground, no floor, no shadow beneath the character, and no surface of any kind underneath.';

export const NPCS = {
  kodomo: 'A cheerful little child NPC with curly brown hair, bright curious eyes, a white graphic T-shirt under a teal short-sleeve overshirt, blue shorts, blue sneakers, and one hand lifted in a friendly wave,',
  otona: 'A calm adult man NPC with short dark hair, composed eyes, a plain white short-sleeve shirt tucked into dark trousers, sturdy black shoes, and a relaxed arms-crossed stance,',
  otokonoko: 'An energetic young boy NPC with spiky red hair, bright excited eyes, a teal hoodie, dark athletic shorts, white running shoes, and a dynamic mid-run pose with small playful motion sparks,',
  onnanoko: 'A gentle young girl NPC with long soft pink hair, shy eyes, a pale white dress with subtle pastel flower details, white socks, dark Mary Jane shoes, and a quiet hands-near-chest pose,',
  sensei: 'A warm teacher NPC with kind eyes, medium brown hair, a forest-green long skirt, a tidy cream blouse, a soft cardigan, one arm holding a clipboard or lesson notebook, and a patient instructive stance,',
  kyouju: 'A scholarly professor NPC with thoughtful eyes, neatly styled hair, round glasses, a long rose-pink cardigan over academic clothes, an open book in one hand, research notes tucked under one arm, and a precise lecturing gesture,',
  seito: 'An eager student NPC with bright attentive eyes, neat dark hair, a clean school uniform, a small satchel, one hand raised as if answering a question, and an excited but clumsy learning pose,',
  senpai: 'A confident older student NPC with cool sharp eyes, tidy light-brown hair, a dark school uniform with gold trim, a shoulder bag, a relaxed mentor-like stance, and a self-assured expression,',
  cid: 'Cid, a cheerful sci-fi fantasy guide NPC with short brown hair, bright helpful eyes, a blue explorer coat with darker blue panels, orange scarf accents, brown boots, utility straps, and a small glowing translator device at her side,',
  'game-master': 'A whimsical Game Master NPC with wild spiky red hair, sparkling mischievous eyes, a dramatic purple-and-red performer outfit with gold trim, a colorful cape-like jacket, and a theatrical one-hand-out host pose,',
  shrine_fox: 'A mystical shrine fox NPC shown as a cute seated orange-and-white fox, with large bright eyes, white chest fur, dark-tipped ears, a fluffy tail, a golden halo-like shrine ring behind it, and a small sacred bell or charm accent,',
};

export function buildNpcPrompt(id) {
  const description = NPCS[id];
  if (!description) throw new Error(`Unknown NPC: ${id}`);
  return `${description} ${PROMPT_SUFFIX}`;
}

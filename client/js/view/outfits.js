// What a character looks like: the palette, and the outfit for each job. Nothing here draws, so tests can check it.
import { mulberry } from '../sim/noise.js';

// ---------------- palettes ----------------
export const HAIR = { pink: 0xff8fc8, silver: 0xe2e6f0, blonde: 0xffdc7a, black: 0x2a2838, brown: 0x7a4a2a, red: 0xd8483a, blue: 0x4a7ae0,
  lavender: 0xb89aff, mint: 0x7fe0c0, orange: 0xff9a4a, white: 0xf6f4f0, chestnut: 0xa0522d, navy: 0x2a3a6a };
const EYES = [0x3a7aff, 0x2ab08a, 0xd83a5a, 0x9a5aff, 0xe0a020, 0xff6ab0, 0x40c0e0];
const SKIN = [0xffe6d6, 0xffdcc4, 0xf3c9a6, 0xdca27c];
const pick = (r, a) => a[Math.floor(r() * a.length)];

// ---------------- the look of a character ----------------
// job/kind decide the outfit; a personal seed decides hair, eyes and style.
export function lookFor(kind, job, seed, def) {
  const r = mulberry((seed * 2654435761) >>> 0 || 7);
  const race = def.race || 'human';
  // Keep the settlement population visibly mixed instead of letting the default
  // lean heavily toward women. Job-specific characters still keep their role.
  let female = r() < 0.5;
  if (['king', 'elf_king', 'blacksmith'].includes(job)) female = false;
  if (['queen', 'elf_queen', 'receptionist', 'nurse', 'herbalist'].includes(job) || kind === 'mermaid' || kind === 'goddess') female = true;
  if (kind === 'god') female = false;
  const hairPool = race === 'elf' ? ['silver', 'blonde', 'mint', 'white', 'lavender'] : race === 'beastkin' ? ['brown', 'orange', 'white', 'black', 'chestnut']
    : ['pink', 'blonde', 'black', 'brown', 'red', 'blue', 'lavender', 'navy', 'chestnut', 'silver'];
  const L = {
    female, race, job: job || kind,
    skin: race === 'beastkin' ? pick(r, SKIN.slice(1)) : pick(r, SKIN.slice(0, 3)),
    hair: HAIR[pick(r, hairPool)], eyes: pick(r, EYES),
    style: female ? pick(r, ['long', 'twintails', 'ponytail', 'bob', 'long', 'side']) : pick(r, ['short', 'spiky', 'swept', 'messy', 'crop']),
    ahoge: r() < 0.35, glasses: false, top: 0x6a8acc, bottom: 0x3a3a5a, socks: 0xf4f4f4, shoes: 0x4a3020,
    skirt: female ? 'skirt' : null, cape: null, apron: null, armor: null, coat: null, hat: null, crown: null, bow: female && r() < 0.35 ? pick(r, [0xd83a4a, 0x3a6ae0, 0xffb0d0]) : null,
    back: null, belt: null, gown: false, tail: race === 'beastkin', catEars: race === 'beastkin', elfEars: race === 'elf', mermaid: kind === 'mermaid',
  };
  const outfit = OUTFITS[L.job] || OUTFITS[kind] || OUTFITS.villager;
  outfit(L, r);
  if (def.body != null && OUTFITS[L.job] === undefined && OUTFITS[kind] === undefined) L.top = def.body;
  return L;
}
export const OUTFITS = {
  villager: (L, r) => { L.top = pick(r, [0x7aa0d0, 0xd08a7a, 0x8ac08a, 0xe0c070, 0xb08ad0]); L.bottom = L.female ? pick(r, [0x4a5a8a, 0x8a4a5a]) : 0x5a4a3a; },
  king: L => { L.top = 0xf4ecd8; L.bottom = 0x3a2a5a; L.cape = 0xc0182a; L.crown = 'crown'; L.belt = 0xffd34d; L.style = 'short'; },
  queen: L => { L.top = 0xb8306a; L.gown = true; L.bottom = 0xd84a8a; L.cape = 0x6a1a3a; L.crown = 'tiara'; L.style = 'long'; L.belt = 0xffd34d; },
  elf_king: L => { L.top = 0xe8f0e0; L.bottom = 0x2a5a3a; L.cape = 0x3a8a5a; L.crown = 'crown'; L.belt = 0xffd34d; L.style = 'long'; },
  elf_queen: L => { L.top = 0xeef6ff; L.gown = true; L.bottom = 0xcfe8ff; L.cape = 0x7fd0c0; L.crown = 'tiara'; L.style = 'long'; L.belt = 0xffd34d; },
  god: L => { L.female = false; L.top = 0xffffff; L.gown = true; L.bottom = 0xfff4e0; L.belt = 0xffd34d; L.crown = 'tiara'; L.style = 'messy'; L.hair = HAIR.blonde; L.eyes = 0xe0a020; L.cape = 0xffe9a8; L.bow = null; },
  goddess: L => { L.top = 0xffffff; L.gown = true; L.bottom = 0xfff4e0; L.belt = 0xffd34d; L.crown = 'tiara'; L.style = 'long'; L.hair = HAIR.pink; L.eyes = 0x40c0e0; L.ahoge = true; L.bow = 0xffd34d; },
  receptionist: L => { L.top = 0x2a3a6a; L.bottom = 0x2a3a6a; L.skirt = 'skirt'; L.bow = 0xe03a4a; L.socks = 0x1a1a2a; L.apron = null; L.collar = 0xffffff; },
  guild_master: (L, r) => { L.top = 0x3a2a2a; L.bottom = 0x2a2a2a; L.coat = 0x5a2a1a; L.cape = 0x8a1a1a; L.back = 'sword'; L.style = L.female ? 'ponytail' : 'spiky'; L.skirt = null; },
  adventurer: (L, r) => { L.top = pick(r, [0x3a6aa0, 0xa03a3a, 0x3a8a5a, 0x8a5aa0]); L.bottom = 0x4a3a2a; L.armor = 0x8a6a4a; L.belt = 0x3a2a1a; L.back = pick(r, ['sword', 'sword', 'bow']); L.skirt = L.female ? 'short' : null; L.shoes = 0x5a3a20; L.cape = r() < 0.5 ? pick(r, [0x8a1a2a, 0x2a4a8a]) : null; },
  knight: L => { L.top = 0x3557c9; L.bottom = 0x6a7080; L.armor = 0xc8ced6; L.cape = 0x3557c9; L.skirt = null; L.shoes = 0x8a8f98; L.helmet = true; },
  elf_guard: L => { L.top = 0x3a7a5a; L.bottom = 0x2a4a3a; L.armor = 0xd8e0d0; L.cape = 0x3a9a6a; L.back = 'bow'; L.skirt = null; L.shoes = 0x5a4a2a; },
  doctor: L => { L.top = 0x7ab0e0; L.bottom = 0x3a4a6a; L.coat = 0xffffff; L.glasses = true; L.skirt = null; },
  nurse: L => { L.top = 0xffc8dc; L.bottom = 0xffc8dc; L.skirt = 'dress'; L.apron = 0xffffff; L.hat = 'nurse'; L.bow = null; },
  herbalist: L => { L.top = 0x6ab06a; L.bottom = 0x4a8a4a; L.skirt = 'dress'; L.apron = 0xf0e8d0; L.hat = 'leaves'; },
  innkeeper: L => { L.top = 0xf0e0c0; L.bottom = 0x6a3a2a; L.apron = 0xffffff; L.skirt = L.female ? 'dress' : null; L.hat = 'bandana'; },
  blacksmith: L => { L.top = 0x5a5a5a; L.bottom = 0x3a3a3a; L.apron = 0x5a3a20; L.style = 'messy'; L.skirt = null; },
  fisherman: L => { L.top = 0x477f91; L.bottom = 0x354b50; L.hat = 'bandana'; L.hatColor = 0x526d78; L.back = 'fishing_rod'; L.skirt = null; },
  peddler: L => { L.top = 0x806447; L.bottom = 0x53493c; L.coat = 0x6f5d48; L.hat = 'bandana'; L.hatColor = 0x8e624a; L.skirt = null; },
  priest: L => { L.top = 0xffffff; L.bottom = 0xf4f0e0; L.gown = true; L.belt = 0xd8b040; L.hat = L.female ? 'veil' : null; L.cape = 0x3a4a8a; },
  merchant: (L, r) => { L.top = pick(r, [0x8a3a9a, 0x3a8a6a, 0xc08a2a]); L.bottom = 0x5a4a3a; L.apron = 0xe8dcc0; L.hat = 'bandana'; L.belt = 0x3a2a1a; },
  baker: L => { L.top = 0xffffff; L.bottom = 0xd8b890; L.apron = 0xffffff; L.hat = 'chef'; },
  bard: (L, r) => { L.top = pick(r, [0xe0503a, 0x3a8ae0, 0xe0b03a]); L.bottom = 0x3a2a5a; L.hat = 'feather'; L.back = 'lute'; L.cape = 0x5a2a6a; },
  farmer: L => { L.top = 0xe8dcb0; L.bottom = 0x3a5a9a; L.hat = 'straw'; L.skirt = null; },
  guard: L => OUTFITS.knight(L),
  elder: L => { L.top = 0x4a8a5a; L.bottom = 0x3a6a4a; L.gown = true; L.hair = HAIR.white; L.style = 'long'; L.cape = 0xe8e0c8; L.hat = 'leaves'; },
  ranger: L => { L.top = 0x3a6a3a; L.bottom = 0x4a3a2a; L.hat = 'hood'; L.back = 'bow'; L.cape = 0x2a5a2a; L.skirt = L.female ? 'short' : null; },
  chief: L => { L.top = 0xa0522d; L.bottom = 0x6a3a1a; L.cape = 0xd8c8a0; L.hat = 'feathers'; L.belt = 0xffd34d; L.skirt = null; },
  shaman: L => { L.top = 0x5a2a6a; L.bottom = 0x3a1a4a; L.gown = true; L.hat = 'feathers'; L.belt = 0xf0f0e0; },
  hunter: L => { L.top = 0x8a6a3a; L.bottom = 0x5a3a20; L.back = 'bow'; L.armor = 0xb89a6a; L.skirt = L.female ? 'short' : null; },
  warrior: L => { L.top = 0x8a2a1a; L.bottom = 0x4a2a1a; L.armor = 0xb89a6a; L.back = 'sword'; L.skirt = null; },
  mermaid: L => { L.top = 0xff8fb8; L.bottom = 0x2fb5b5; L.skirt = null; L.style = 'long'; L.hair = pick(Math.random, [HAIR.pink, HAIR.mint, HAIR.blue]); },
  bounty_hunter: L => { L.top = 0x2a2a2a; L.bottom = 0x2a2a2a; L.coat = 0x4a3a2a; L.hat = 'hood'; L.back = 'sword'; L.skirt = null; L.female = false; L.style = 'short'; },
  demon_lord: L => { L.top = 0x2a0a3a; L.bottom = 0x1a0a2a; L.cape = 0x6a0a1a; L.armor = 0x3a2a4a; L.crown = 'horns'; L.hair = HAIR.silver; L.eyes = 0xff2020; L.style = 'long'; L.skin = 0xd8c8e0; L.female = false; L.skirt = null; L.bow = null; },
};

// What a character looks like: the palette, body types and the outfit for each job. Nothing here draws, so tests can check it.
import { mulberry } from '../sim/noise.js';

// ---------------- palettes ----------------
// The colours the interface is drawn from (tools/make_ui_art.py), so that a person and the book beside them belong together.
export const COVER = 0x7a3f33, LEATHER = 0xa8603f, PEACH = 0xf7caa0, CLAY = 0xcf7f4e, LINEN = 0xd8cdb8, CREAM = 0xfff1df;
export const GOLD = 0xfac13c, AMBER = 0xd67a10, RED = 0xc02c42, ROSE = 0xe4586a, WINE = 0x7d1730;
export const BLUE = 0x2f78b8, SKY = 0x52bdf5, NAVY = 0x2e3a66, GREEN = 0x2e9150, LEAF = 0x62c47a, MOSS = 0x1b6237;
export const SLATE = 0x45445a, DUSK = 0x545361, MAUVE = 0x86849a, STEEL = 0xb3aabb, PALE = 0xd9cfe0, PLUM = 0x5a2a5e, LILAC = 0xc79cff, TEAL = 0x2fb5b5;
export const COAL = 0x34303c, UMBER = 0x4a3028, OLIVE = 0x5a6340;

export const HAIR = { pink: 0xe88fae, silver: 0xc9c2d2, blonde: 0xe0bc5e, black: 0x34303c, brown: 0x5a3426, red: 0xa8482e, blue: 0x3a64a0,
  lavender: 0xa890d8, mint: 0x78c8aa, orange: 0xc86e36, white: 0xe8e0d8, chestnut: 0x8a4e2e, navy: 0x2e3a66, ash: 0x6e6670, teal: 0x4aa8a0 };
const EYES = [0x2f78b8, 0x2e9150, 0x6e4a2e, 0x7d55c7, 0xb8741a, 0x3a3a48, 0x3aa8d8];
const SKIN = [0xf3d3b5, 0xe8bf9a, 0xd9a67e, 0xb98158, 0x8e5c3c];
const TUNICS = [CLAY, 0x6f8a70, 0x62789a, 0xb8964e, 0x8e7a9c, LEATHER];
const SOFT = [0xf3c6d8, 0xbfe3f0, 0xd9c9f0, 0xc8e6c0, 0xfbe3b8]; // what elf girls wear
const RIBBONS = [RED, ROSE, SKY, GOLD, LILAC];
const pick = (r, a) => a[Math.floor(r() * a.length)];

// ---------------- the look of a character ----------------
// Men and older folk come in every build, and the job decides who is broad across the shoulders. Every girl is cute.
const STRONG = ['king', 'blacksmith', 'knight', 'guard', 'guild_master', 'warrior', 'chief', 'bounty_hunter', 'hunter'];
const SLIGHT = ['priest', 'elder', 'doctor', 'shaman', 'bard', 'ranger', 'herbalist', 'god'];
const STOUT = ['merchant', 'innkeeper', 'peddler', 'baker'];
function buildFor(L, job, r) {
  if (L.female) return L.mermaid ? 'mermaid' : 'girl';
  if (job === 'demon_lord') return 'giant';
  if (STRONG.includes(job)) return 'strong';
  if (L.race === 'elf' || SLIGHT.includes(job)) return 'slim';
  if (STOUT.includes(job) && r() < 0.6) return 'stout';
  return pick(r, ['normal', 'normal', 'normal', 'strong', 'slim', 'stout']);
}
// Whatever the job, a girl keeps her face in view and wears something that swings.
function girlish(L, r) {
  L.beard = null; L.helmet = false; L.hooded = false; L.old = false; L.glasses = L.job === 'doctor' && L.glasses;
  L.bow ??= pick(r, RIBBONS);
  if (!L.gown && !L.mermaid && !L.skirt) L.skirt = true;
  if (L.race === 'elf') {
    if (!L.armor && !L.crown) { L.top = pick(r, SOFT); L.bottom = L.top; }
    if (!L.hat && !L.crown) L.hat = 'leaves';
  }
}

// job/kind decide the outfit; a personal seed decides hair, eyes and style.
export function lookFor(kind, job, seed, def) {
  const r = mulberry((seed * 2654435761) >>> 0 || 7);
  const race = def.race || 'human';
  // Keep the settlement population visibly mixed instead of letting the default
  // lean heavily toward women. Job-specific characters still keep their role.
  let female = r() < 0.5;
  if (['king', 'elf_king', 'blacksmith'].includes(job)) female = false;
  if (['queen', 'elf_queen', 'receptionist', 'nurse', 'herbalist'].includes(job) || race === 'mermaid' || kind === 'goddess') female = true;
  if (kind === 'god') female = false;
  const hairPool = race === 'elf' ? ['silver', 'blonde', 'mint', 'white', 'lavender', 'teal'] : race === 'beastkin' ? ['brown', 'orange', 'white', 'black', 'chestnut', 'ash']
    : ['pink', 'blonde', 'black', 'black', 'brown', 'brown', 'red', 'blue', 'chestnut', 'chestnut', 'silver', 'ash'];
  const name = job || kind;
  const L = {
    female, race, job: name,
    skin: race === 'elf' ? pick(r, SKIN.slice(0, 2)) : race === 'beastkin' ? pick(r, SKIN.slice(1)) : pick(r, SKIN),
    hair: HAIR[pick(r, hairPool)], eyes: pick(r, EYES),
    style: female ? pick(r, ['long', 'twintails', 'ponytail', 'bob', 'side', 'long']) : pick(r, ['short', 'spiky', 'swept', 'crop', 'short']),
    top: 0x62789a, bottom: UMBER, shoes: UMBER, belt: null, trim: null, skirt: false, gown: false, bareArms: false,
    armor: null, plate: false, pads: null, gauntlets: null, coat: null, tabard: null, apron: null, cape: null, torn: false, scarf: null, mask: null, mantle: false,
    hat: null, hatColor: null, hooded: false, helmet: false, crown: null, bow: null, beard: null, old: false, glasses: false, back: null, held: null, off: null, busy: false,
    tail: race === 'beastkin', catEars: race === 'beastkin', elfEars: race === 'elf', mermaid: race === 'mermaid', build: 'normal',
  };
  const bearded = r() < 0.4; // drawn whatever the outfit, so that one job's beard does not shift the next person's hair
  const outfit = OUTFITS[L.job] || OUTFITS[kind] || OUTFITS.villager;
  outfit(L, r, bearded);
  if (def.body != null && OUTFITS[L.job] === undefined && OUTFITS[kind] === undefined) L.top = parseInt(def.body.slice(1), 16);
  if (L.female) girlish(L, r);
  L.build = buildFor(L, name, r);
  return L;
}
// A floor-length robe, an ermine mantle and a cape to the ground: nobody else in the world dresses like this.
function royal(L, robe, cape) { L.top = robe; L.bottom = robe; L.gown = true; L.cape = cape; L.mantle = true; L.trim = GOLD; L.belt = GOLD; L.crown = 'crown'; L.shoes = robe; }

export const OUTFITS = {
  villager: (L, r, bearded) => { L.top = pick(r, TUNICS); L.bottom = pick(r, [UMBER, 0x4a5a70, OLIVE]); L.belt = LEATHER; L.beard = bearded ? L.hair : null; },
  king: L => { royal(L, RED, WINE); L.style = 'short'; L.beard = L.hair; L.held = 'regalia'; },
  queen: L => { royal(L, WINE, RED); L.style = 'long'; },
  elf_king: L => { royal(L, GREEN, MOSS); L.style = 'long'; L.held = 'regalia'; },
  elf_queen: L => { royal(L, 0x7ab8d0, LEAF); L.style = 'long'; L.crown = 'tiara'; },
  god: L => { L.female = false; L.top = CREAM; L.gown = true; L.bottom = CREAM; L.belt = GOLD; L.trim = GOLD; L.crown = 'tiara'; L.style = 'swept'; L.hair = HAIR.blonde; L.eyes = AMBER; L.cape = 0xffe58a; },
  goddess: L => { L.top = CREAM; L.gown = true; L.bottom = CREAM; L.belt = GOLD; L.trim = GOLD; L.crown = 'tiara'; L.style = 'long'; L.hair = HAIR.pink; L.eyes = 0x3aa8d8; L.bow = GOLD; },
  receptionist: L => { L.top = NAVY; L.bottom = NAVY; L.belt = GOLD; L.off = 'book'; },
  guild_master: (L, r, bearded) => { L.top = 0x4a2a2a; L.bottom = COAL; L.coat = COAL; L.trim = GOLD; L.cape = WINE; L.torn = true; L.scarf = WINE; L.pads = SLATE; L.gauntlets = SLATE; L.back = 'sword'; L.beard = bearded ? L.hair : null; L.shoes = COAL; },
  adventurer: (L, r) => { L.top = pick(r, [LINEN, 0x62789a]); L.bottom = pick(r, [COAL, UMBER]); L.armor = pick(r, [COVER, UMBER]); L.pads = SLATE; L.gauntlets = SLATE; L.tabard = LINEN; L.belt = COVER; L.back = pick(r, ['sword', 'sword', 'bow']); L.scarf = pick(r, [WINE, NAVY, MOSS]); L.cape = r() < 0.6 ? L.scarf : null; L.torn = true; L.shoes = COAL; },
  knight: L => { L.top = NAVY; L.bottom = DUSK; L.armor = PALE; L.plate = true; L.pads = STEEL; L.gauntlets = STEEL; L.tabard = BLUE; L.trim = GOLD; L.cape = NAVY; L.torn = true; L.shoes = STEEL; L.helmet = true; L.held = 'sword'; L.off = 'shield'; },
  elf_guard: L => { L.top = GREEN; L.bottom = MOSS; L.armor = PALE; L.plate = true; L.pads = STEEL; L.gauntlets = STEEL; L.scarf = GREEN; L.back = 'bow'; L.held = 'spear'; L.shoes = COVER; },
  doctor: L => { L.top = 0x8fb6cc; L.bottom = NAVY; L.coat = LINEN; L.glasses = true; L.shoes = COAL; },
  nurse: L => { L.top = 0xe0a8bc; L.bottom = 0xe0a8bc; L.apron = CREAM; L.hat = 'nurse'; },
  herbalist: L => { L.top = 0x6f9a7a; L.bottom = 0x6f9a7a; L.apron = LINEN; L.hat = 'leaves'; L.off = 'basket'; },
  innkeeper: L => { L.top = LINEN; L.bottom = COVER; L.apron = CREAM; L.hat = 'bandana'; L.hatColor = CLAY; L.held = 'mug'; },
  blacksmith: (L, r, bearded) => { L.top = DUSK; L.bottom = COAL; L.apron = COVER; L.style = 'crop'; L.bareArms = true; L.gauntlets = COVER; L.held = 'hammer'; L.busy = true; L.beard = bearded ? L.hair : null; L.shoes = COAL; },
  fisherman: L => { L.top = 0x3f7f91; L.bottom = 0x354b50; L.hat = 'bandana'; L.hatColor = 0x526d78; L.held = 'rod'; },
  peddler: L => { L.top = LEATHER; L.bottom = COVER; L.belt = COVER; L.hat = 'bandana'; L.hatColor = CLAY; L.back = 'pack'; },
  priest: (L, r, bearded) => { L.top = CREAM; L.bottom = CREAM; L.gown = true; L.belt = GOLD; L.trim = GOLD; L.hat = L.female ? 'veil' : null; L.hatColor = NAVY; L.off = 'book'; L.old = !L.female && bearded; L.beard = L.old ? HAIR.white : null; if (L.old) L.hair = HAIR.white; },
  merchant: (L, r) => { L.top = pick(r, [PLUM, GREEN, AMBER]); L.bottom = COVER; L.coat = pick(r, [UMBER, NAVY]); L.trim = GOLD; L.hat = 'bandana'; L.hatColor = RED; },
  baker: L => { L.top = CREAM; L.bottom = 0xc8a880; L.apron = CREAM; L.hat = 'chef'; L.held = 'pin'; },
  bard: (L, r) => { L.top = pick(r, [RED, BLUE, AMBER]); L.bottom = PLUM; L.hat = 'feather'; L.back = 'lute'; L.belt = COVER; },
  farmer: L => { L.top = 0xc8bc94; L.bottom = 0x3f5f7a; L.hat = 'straw'; L.held = 'hoe'; L.busy = true; },
  guard: L => { OUTFITS.knight(L); L.held = 'spear'; L.off = null; L.cape = null; },
  elder: (L, r, bearded) => { L.top = GREEN; L.bottom = GREEN; L.gown = true; L.hair = HAIR.white; L.style = 'long'; L.hat = 'leaves'; L.held = 'staff'; L.old = true; L.beard = bearded ? HAIR.white : null; },
  ranger: L => { L.top = MOSS; L.bottom = COVER; L.hat = 'hood'; L.hatColor = GREEN; L.hooded = true; L.back = 'bow'; L.cape = GREEN; L.torn = true; L.gauntlets = COVER; L.belt = LEATHER; },
  chief: L => { L.top = LEATHER; L.bottom = COVER; L.hat = 'feathers'; L.belt = GOLD; L.held = 'spear'; L.bareArms = true; L.pads = COVER; },
  shaman: L => { L.top = PLUM; L.bottom = PLUM; L.gown = true; L.hat = 'feathers'; L.belt = CREAM; L.held = 'staff'; L.old = true; },
  hunter: L => { L.top = CLAY; L.bottom = COVER; L.back = 'bow'; L.armor = LEATHER; L.belt = COVER; L.bareArms = true; L.gauntlets = COVER; },
  warrior: L => { L.top = WINE; L.bottom = COVER; L.armor = LEATHER; L.pads = COVER; L.gauntlets = COVER; L.back = 'sword'; L.belt = COVER; L.bareArms = true; },
  mermaid: (L, r) => { L.top = pick(r, [ROSE, 0xf3c6d8, 0xffc48a]); L.bottom = pick(r, [TEAL, 0x4a9ad8, 0xb07cff]); L.bareArms = true; L.style = 'long'; L.hair = pick(r, [HAIR.pink, HAIR.mint, HAIR.blue, HAIR.lavender]); L.bow = 0xffb0c8; },
  mermaid_queen: L => { L.top = 0x7fe0e0; L.bottom = 0x1f8f9f; L.bareArms = true; L.style = 'long'; L.hair = HAIR.lavender; L.crown = 'tiara'; L.held = 'trident'; L.bow = GOLD; },
  bounty_hunter: L => { L.top = COAL; L.bottom = COAL; L.coat = 0x3a2a30; L.hat = 'hood'; L.hatColor = WINE; L.hooded = true; L.cape = WINE; L.torn = true; L.gauntlets = COVER; L.pads = SLATE; L.held = 'sword'; L.belt = LEATHER; L.female = false; L.style = 'short'; L.shoes = COAL; },
  bandit: (L, r) => { L.top = COAL; L.bottom = UMBER; L.armor = UMBER; L.gauntlets = COVER; L.belt = COVER; L.hat = 'hood'; L.hatColor = pick(r, [COAL, UMBER]); L.hooded = true; L.mask = pick(r, [COVER, OLIVE, NAVY]); L.held = 'sword'; L.female = false; L.style = 'short'; L.shoes = COAL; },
  demon_lord: L => { L.top = COAL; L.bottom = 0x2a2030; L.cape = WINE; L.torn = true; L.scarf = WINE; L.armor = SLATE; L.plate = true; L.pads = DUSK; L.gauntlets = DUSK; L.trim = RED; L.crown = 'horns'; L.hair = HAIR.silver; L.eyes = RED; L.style = 'long'; L.skin = PALE; L.female = false; L.bow = null; L.shoes = DUSK; L.held = 'doom'; },
};

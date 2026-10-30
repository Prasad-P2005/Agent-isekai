// What a character looks like: the palette, body types and the outfit for each job. Nothing here draws, so tests can check it.
import { mulberry } from '../sim/noise.js';

// ---------------- palettes ----------------
// The colours the interface is drawn from (tools/make_ui_art.py), so that a person and the book beside them belong together.
export const COVER = 0x7a3f33, LEATHER = 0xa8603f, PEACH = 0xf7caa0, CLAY = 0xcf7f4e, LINEN = 0xe8d8b8, CREAM = 0xfff1df;
export const GOLD = 0xfac13c, AMBER = 0xd67a10, RED = 0xc02c42, ROSE = 0xe4586a, WINE = 0x7d1730;
export const BLUE = 0x2f78b8, SKY = 0x52bdf5, NAVY = 0x2e3a66, GREEN = 0x2e9150, LEAF = 0x62c47a, MOSS = 0x1b6237;
export const SLATE = 0x45445a, DUSK = 0x545361, MAUVE = 0x86849a, STEEL = 0xb3aabb, PALE = 0xd9cfe0, PLUM = 0x5a2a5e, LILAC = 0xc79cff, TEAL = 0x2fb5b5;
export const COAL = 0x2c2733, UMBER = 0x4a3028, OLIVE = 0x5a6340, RUST = 0x8a4a2e;

export const HAIR = { pink: 0xd9809c, silver: 0xc9c2d2, blonde: 0xd9b45a, black: 0x2c2733, brown: 0x5a3426, red: 0xa83a30, blue: 0x34587f,
  lavender: 0x9a84c0, mint: 0x6fb89c, orange: 0xc06a34, white: 0xe8e0d8, chestnut: 0x8a4e2e, navy: 0x2e3a66, ash: 0x6e6670, teal: 0x4aa8a0 };
const EYES = [0x2f78b8, 0x2e9150, 0x6e4a2e, 0x7d55c7, 0xb8741a, 0x3a3a48, 0x3aa8d8];
const SKIN = [0xf3d3b5, 0xe8bf9a, 0xd9a67e, 0xb98158, 0x8e5c3c];
const TUNICS = [CLAY, 0x6f8a70, 0x62789a, 0xb8964e, 0x8e7a9c, 0xa8603f];
const pick = (r, a) => a[Math.floor(r() * a.length)];

// ---------------- the look of a character ----------------
// Most people are grown adults of every shape. A few are small and sweet, and the job decides who is broad across the shoulders.
const STRONG = ['blacksmith', 'knight', 'guard', 'guild_master', 'warrior', 'chief', 'bounty_hunter', 'hunter'];
const SLIGHT = ['priest', 'elder', 'doctor', 'shaman', 'bard', 'ranger', 'herbalist', 'elf_king', 'elf_queen', 'queen', 'goddess', 'god', 'receptionist'];
const STOUT = ['merchant', 'innkeeper', 'peddler', 'baker'];
const CUTE_JOBS = ['nurse', 'herbalist', 'baker', 'receptionist', 'villager', 'farmer', 'bard'], CUTE_CHANCE = 0.3;
function buildFor(L, job, r) {
  if (job === 'demon_lord') return 'giant';
  if (STRONG.includes(job)) return 'strong';
  if (L.race === 'elf' || SLIGHT.includes(job)) return 'slim';
  if (STOUT.includes(job) && r() < 0.6) return 'stout';
  return pick(r, ['normal', 'normal', 'normal', 'strong', 'slim', 'stout']);
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
    style: female ? pick(r, ['long', 'ponytail', 'bob', 'long', 'side', 'braid']) : pick(r, ['short', 'spiky', 'swept', 'messy', 'crop', 'short']),
    glasses: false, top: 0x62789a, bottom: UMBER, socks: LINEN, shoes: UMBER,
    skirt: null, cape: null, torn: false, mantle: null, apron: null, armor: null, plate: false, tabard: null, coat: null, hat: null, hatColor: null, hooded: false, crown: null,
    bow: null, collar: null, scarf: null, trim: null, plume: null, beard: null, helmet: false, gloves: null, bareArms: false, old: false,
    back: null, quiver: false, belt: null, pouch: false, bandolier: null, gown: false, tail: race === 'beastkin', catEars: race === 'beastkin', elfEars: race === 'elf', mermaid: race === 'mermaid',
    held: null, off: null, busy: false, cute: false, build: 'normal',
  };
  const bearded = r() < 0.45, cuteRoll = r(); // drawn whatever the outfit, so that one job's beard does not shift the next person's hair
  L.build = buildFor(L, name, r);
  if (CUTE_JOBS.includes(name) && cuteRoll < CUTE_CHANCE && race !== 'beastkin') {
    L.cute = true; L.build = 'small'; L.style = female ? pick(r, ['twintails', 'bob', 'ponytail', 'long']) : pick(r, ['messy', 'short', 'swept']);
  }
  const outfit = OUTFITS[L.job] || OUTFITS[kind] || OUTFITS.villager;
  outfit(L, r, bearded);
  if (def.body != null && OUTFITS[L.job] === undefined && OUTFITS[kind] === undefined) L.top = parseInt(def.body.slice(1), 16);
  return L;
}
export const OUTFITS = {
  villager: (L, r, bearded) => { L.top = pick(r, TUNICS); L.bottom = pick(r, [UMBER, 0x4a5a70, OLIVE]); L.belt = LEATHER; L.skirt = L.female && r() < 0.5 ? 'long' : null; L.beard = !L.female && bearded && !L.cute ? L.hair : null; },
  king: L => { L.top = CREAM; L.bottom = PLUM; L.coat = RED; L.trim = GOLD; L.cape = RED; L.mantle = CREAM; L.crown = 'crown'; L.belt = GOLD; L.style = 'short'; L.beard = L.hair; L.held = 'sceptre'; L.shoes = COAL; },
  queen: L => { L.top = WINE; L.gown = true; L.bottom = WINE; L.cape = WINE; L.mantle = CREAM; L.crown = 'tiara'; L.style = 'long'; L.belt = GOLD; L.trim = GOLD; },
  elf_king: L => { L.top = CREAM; L.bottom = MOSS; L.coat = GREEN; L.trim = GOLD; L.cape = MOSS; L.crown = 'crown'; L.belt = GOLD; L.style = 'long'; L.held = 'sceptre'; },
  elf_queen: L => { L.top = 0xbfe3f0; L.gown = true; L.bottom = 0x7ab8d0; L.cape = LEAF; L.crown = 'tiara'; L.style = 'long'; L.belt = GOLD; L.trim = GOLD; },
  god: L => { L.female = false; L.top = CREAM; L.gown = true; L.bottom = LINEN; L.belt = GOLD; L.trim = GOLD; L.crown = 'tiara'; L.style = 'messy'; L.hair = HAIR.blonde; L.eyes = AMBER; L.cape = 0xffe58a; L.bow = null; },
  goddess: L => { L.top = CREAM; L.gown = true; L.bottom = LINEN; L.belt = GOLD; L.trim = GOLD; L.crown = 'tiara'; L.style = 'long'; L.hair = HAIR.pink; L.eyes = 0x3aa8d8; L.bow = GOLD; },
  receptionist: L => { L.top = NAVY; L.bottom = NAVY; L.skirt = 'long'; L.collar = CREAM; L.bow = RED; L.socks = SLATE; L.off = 'ledger'; L.belt = GOLD; },
  guild_master: (L, r, bearded) => { L.top = 0x4a2a2a; L.bottom = COAL; L.coat = COAL; L.trim = GOLD; L.cape = WINE; L.torn = true; L.back = 'sword'; L.belt = LEATHER; L.style = L.female ? 'ponytail' : 'spiky'; L.beard = !L.female && bearded ? L.hair : null; L.shoes = COAL; L.gloves = COVER; },
  adventurer: (L, r) => { L.top = pick(r, [LINEN, 0x8e8a7a, 0x62789a]); L.bottom = pick(r, [COAL, UMBER]); L.armor = pick(r, [COVER, COAL, 0x5a3426]); L.belt = COVER; L.pouch = true; L.back = pick(r, ['sword', 'sword', 'bow']); L.quiver = L.back === 'bow'; L.scarf = pick(r, [WINE, NAVY, MOSS]); L.cape = r() < 0.6 ? L.scarf : null; L.torn = true; L.gloves = COAL; L.shoes = COAL; },
  knight: L => { L.top = NAVY; L.bottom = SLATE; L.armor = PALE; L.plate = true; L.tabard = BLUE; L.trim = GOLD; L.cape = NAVY; L.shoes = STEEL; L.helmet = true; L.plume = RED; L.gloves = STEEL; L.held = 'sword'; L.off = 'shield'; },
  elf_guard: L => { L.top = GREEN; L.bottom = MOSS; L.armor = PALE; L.plate = true; L.cape = GREEN; L.back = 'bow'; L.quiver = true; L.gloves = LEATHER; L.held = 'spear'; L.shoes = COVER; },
  doctor: L => { L.top = 0x8fb6cc; L.bottom = NAVY; L.coat = LINEN; L.glasses = true; L.off = 'satchel'; L.shoes = COAL; },
  nurse: L => { L.top = 0xe0a8bc; L.bottom = 0xe0a8bc; L.skirt = 'dress'; L.apron = CREAM; L.hat = 'nurse'; },
  herbalist: L => { L.top = 0x6f9a7a; L.bottom = GREEN; L.skirt = 'dress'; L.apron = LINEN; L.hat = 'leaves'; L.off = 'basket'; },
  innkeeper: L => { L.top = LINEN; L.bottom = COVER; L.apron = CREAM; L.skirt = L.female ? 'long' : null; L.hat = 'bandana'; L.hatColor = CLAY; L.held = 'mug'; L.belt = COVER; },
  blacksmith: (L, r, bearded) => { L.top = DUSK; L.bottom = COAL; L.apron = COVER; L.style = 'crop'; L.bareArms = true; L.gloves = COVER; L.held = 'hammer'; L.busy = true; L.beard = bearded ? L.hair : null; L.belt = COVER; L.shoes = COAL; },
  fisherman: L => { L.top = 0x3f7f91; L.bottom = 0x354b50; L.hat = 'bandana'; L.hatColor = 0x526d78; L.held = 'rod'; L.belt = COVER; },
  peddler: L => { L.top = LEATHER; L.bottom = COVER; L.belt = COVER; L.hat = 'bandana'; L.hatColor = CLAY; L.back = 'pack'; L.pouch = true; },
  priest: (L, r, bearded) => { L.top = CREAM; L.bottom = LINEN; L.gown = true; L.belt = GOLD; L.trim = GOLD; L.hat = L.female ? 'veil' : null; L.hatColor = NAVY; L.cape = NAVY; L.off = 'book'; L.old = !L.female && bearded; L.beard = L.old ? HAIR.white : null; if (L.old) L.hair = HAIR.white; },
  merchant: (L, r) => { L.top = pick(r, [PLUM, GREEN, AMBER]); L.bottom = COVER; L.coat = pick(r, [UMBER, NAVY]); L.trim = GOLD; L.belt = COVER; L.pouch = true; L.hat = 'bandana'; L.hatColor = RED; },
  baker: L => { L.top = CREAM; L.bottom = 0xc8a880; L.apron = CREAM; L.hat = 'chef'; L.held = 'pin'; },
  bard: (L, r) => { L.top = pick(r, [RED, BLUE, AMBER]); L.bottom = PLUM; L.hat = 'feather'; L.back = 'lute'; L.cape = PLUM; L.belt = COVER; },
  farmer: L => { L.top = 0xc8bc94; L.bottom = 0x3f5f7a; L.hat = 'straw'; L.belt = COVER; L.held = 'hoe'; L.busy = true; },
  guard: L => { OUTFITS.knight(L); L.held = 'spear'; L.off = null; L.cape = null; L.helmet = true; },
  elder: (L, r, bearded) => { L.top = GREEN; L.bottom = MOSS; L.gown = true; L.hair = HAIR.white; L.style = 'long'; L.cape = LINEN; L.hat = 'leaves'; L.held = 'staff'; L.old = true; L.beard = !L.female && bearded ? HAIR.white : null; },
  ranger: L => { L.top = MOSS; L.bottom = COVER; L.hat = 'hood'; L.hatColor = GREEN; L.hooded = true; L.back = 'bow'; L.quiver = true; L.cape = GREEN; L.torn = true; L.belt = LEATHER; L.gloves = COVER; },
  chief: L => { L.top = LEATHER; L.bottom = COVER; L.cape = PEACH; L.hat = 'feathers'; L.belt = GOLD; L.held = 'spear'; L.bareArms = true; },
  shaman: L => { L.top = PLUM; L.bottom = 0x3a1f4a; L.gown = true; L.hat = 'feathers'; L.belt = CREAM; L.held = 'staff'; L.old = true; },
  hunter: L => { L.top = CLAY; L.bottom = COVER; L.back = 'bow'; L.quiver = true; L.armor = LEATHER; L.belt = COVER; L.bareArms = true; },
  warrior: L => { L.top = WINE; L.bottom = COVER; L.armor = LEATHER; L.back = 'sword'; L.belt = COVER; L.bareArms = true; },
  mermaid: (L, r) => { L.top = ROSE; L.bottom = TEAL; L.style = 'long'; L.hair = pick(r, [HAIR.pink, HAIR.mint, HAIR.blue]); },
  mermaid_queen: L => { L.top = 0x1f8f9f; L.bottom = TEAL; L.style = 'long'; L.hair = HAIR.lavender; L.crown = 'tiara'; L.held = 'trident'; },
  bounty_hunter: L => { L.top = COAL; L.bottom = COAL; L.coat = 0x3a2a30; L.hat = 'hood'; L.hatColor = WINE; L.hooded = true; L.cape = WINE; L.torn = true; L.held = 'sword'; L.belt = LEATHER; L.bandolier = LEATHER; L.female = false; L.style = 'short'; L.gloves = COVER; L.shoes = COAL; },
  demon_lord: L => { L.top = COAL; L.bottom = 0x1f1426; L.cape = WINE; L.torn = true; L.armor = SLATE; L.plate = true; L.trim = RED; L.crown = 'horns'; L.hair = HAIR.silver; L.eyes = RED; L.style = 'long'; L.skin = PALE; L.female = false; L.bow = null; L.gloves = SLATE; L.shoes = DUSK; L.held = 'doom'; },
};

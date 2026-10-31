// Every item as pixel art: a drawing from view/itemsprites.js, coloured by a palette and outlined once at load. It needs neither three.js
// nor the page, so the bag's icons, the model in the hand and the tools that draw the item sheets all read the same pixels.
import { BL } from '../sim/blocks.js';
import { SPRITES } from './itemsprites.js';
import { TILE, tilePixels } from './blocktex.js';

export const ITEM_SIZE = 16;
const N = ITEM_SIZE, INK = 0x3f2029, GLINT = 0xfff4e6;

// A palette is five tones of the material from light to dark, three of the handle and three of the accent.
const LEATHER_GRIP = [0xa8603f, 0x7a3f33, 0x54281f], OAK_GRIP = [0xa8835a, 0x7e5f3e, 0x5a4029], DARK_GRIP = [0x4a4458, 0x332f42, 0x1f1c2c];
const BRASS = [0xffe58a, 0xfac13c, 0xc9740f], CRIMSON = [0xff8a7a, 0xd8344a, 0x8f1d38], JADE = [0x9ff0d0, 0x3fae8a, 0x1d6b5c], FROST = [0xffffff, 0x9fd4ff, 0x4a8ed8], VIOLET = [0xe0ccff, 0xa87ef0, 0x6d42b8];
const pal = (ramp, handle = OAK_GRIP, accent = BRASS) => ({ ramp, handle, accent });
export const PALETTES = {
  // the tiers
  wood: pal([0xdcae74, 0xbb8e5a, 0x9a7446, 0x725233, 0x523a24], [0xb08a60, 0x86653f, 0x5f4429], [0xc9a36a, 0x9a7446, 0x6f4f2c]),
  stone: pal([0xcfcfc7, 0xa6a79f, 0x87887f, 0x696a64, 0x4e4f4a], OAK_GRIP, [0x8f6d48, 0x6e5238, 0x4f3a26]),
  copper: pal([0xffd0a4, 0xf09a62, 0xcc7040, 0x9c4c2c, 0x6f3220], LEATHER_GRIP, [0x7fe0c0, 0x3fae8a, 0x277060]),
  iron: pal([0xdfe2e6, 0xb4b8c2, 0x8a909e, 0x646a7a, 0x464c5c], LEATHER_GRIP, [0xc4c8d0, 0x8a909e, 0x5a6070]),
  gold: pal([0xfff6b8, 0xffdc60, 0xf7ae2a, 0xcc7a12, 0x8f4e0c], [0xe4586a, 0xc02c42, 0x7d1730], CRIMSON),
  silver: pal([0xffffff, 0xe9eff8, 0xc6d2e6, 0x93a2be, 0x667392], [0x5a7ad8, 0x3a58b0, 0x243a7c], FROST),
  mithril: pal([0xecfcff, 0xa6f2ff, 0x62ccf7, 0x3092dc, 0x1c5cac], [0xf0f4ff, 0xb3bddc, 0x7a85ac], BRASS),
  adamant: pal([0xf0dcff, 0xc48ef8, 0x8e52e4, 0x5e2eb2, 0x3a1a7c], DARK_GRIP, [0xb0fff0, 0x3fe8c8, 0x1fa898]),
  dragon: pal([0xffd4a4, 0xff7e3c, 0xda2e2c, 0x901832, 0x4f1028], DARK_GRIP, BRASS),
  // armour sets that are not tiers
  leather: pal([0xd8a070, 0xb87c4e, 0x96603a, 0x70442a, 0x4f2e1e], [0xe8c090, 0x8f6d48, 0x3a2a1c], BRASS),
  trollhide: pal([0xa8b8a8, 0x84988c, 0x667c72, 0x4c5e56, 0x34423e], [0xf0ead8, 0xc8bc9c, 0x3a3a34], [0xf0ead8, 0xc8bc9c, 0x9a8e70]),
  chain: pal([0xe0e4ec, 0xb4bac6, 0x8a90a0, 0x62687a, 0x444a5a], LEATHER_GRIP, [0xb4bac6, 0x7a8092, 0x555b6c]),
  knight: pal([0xfafbfd, 0xd6dae2, 0xa8aebb, 0x7a8092, 0x3a4058], [0xfac13c, 0xc9740f, 0x8f4e0c], [0x62a4f0, 0x2a5cc0, 0x183a88]),
  demon: pal([0x8a7a98, 0x564a68, 0x3a3048, 0x281f34, 0x120c1a], DARK_GRIP, [0xffb080, 0xff4a20, 0xa81820]),
  elven: pal([0xe4fff0, 0x9fe8b8, 0x5fc48a, 0x35946a, 0x1f6450], [0xf0e8d0, 0xc8b888, 0x8a7a50], BRASS),
  arcane: pal([0xc8a0f0, 0x8a58d0, 0x6236a8, 0x432080, 0x2a1058], DARK_GRIP, BRASS),
  // materials
  coal: pal([0x6e6e78, 0x4a4a54, 0x323238, 0x222226, 0x141416]),
  charcoal: pal([0x7c6a5c, 0x54463c, 0x3a2f28, 0x28201b, 0x171210]),
  flint: pal([0xb0a8a0, 0x7f7874, 0x5c5654, 0x403c3c, 0x2a2828]),
  clay: pal([0xe0a080, 0xc88060, 0xb06a4c, 0x90503a, 0x6c3a2a]),
  brick: pal([0xe88a68, 0xc8604a, 0xa84838, 0x84342c, 0x5e2420]),
  rawiron: pal([0xe8d8c4, 0xc8b49c, 0xa08c78, 0x786858, 0x54483e], OAK_GRIP, [0xf0a060, 0xc86a38, 0x8a4626]),
  mana: pal([0xffffff, 0xc8f0ff, 0x8adcff, 0x4ab8f0, 0x2a88c8]),
  ruby: pal([0xffc0c8, 0xff5a6e, 0xd8203c, 0x98142c, 0x5e0c1e]),
  sapphire: pal([0xc0e4ff, 0x5aa4ff, 0x2460d8, 0x163e9c, 0x0e2666]),
  emerald: pal([0xc8ffd8, 0x5fe89a, 0x20b868, 0x14804c, 0x0c5034]),
  amethyst: pal([0xf4e4ff, 0xd0a4ff, 0xa66ef0, 0x7444c8, 0x4c2a90]),
  // what monsters leave
  golem: pal([0xc8c4d0, 0x9c98a8, 0x77748a, 0x565468, 0x3c3a4c], OAK_GRIP, [0xa8ffd0, 0x4fe89a, 0x1fa868]),
  deer: pal([0xd8b080, 0xb88c5c, 0x98703e, 0x74522c, 0x523820]),
  wolf: pal([0xb8b6c4, 0x908ea2, 0x706e84, 0x525066, 0x383648]),
  ivory: pal([0xfff8e4, 0xeee4c8, 0xd4c8a4, 0xb0a07c, 0x7e7054]),
  orc: pal([0xf4ecc4, 0xd8cc98, 0xb4a870, 0x8a7e50, 0x5e5436]),
  crab: pal([0xffa890, 0xe87858, 0xc8553d, 0x983c2c, 0x6c2820]),
  slime: pal([0xc8ffd0, 0x8ae89a, 0x62c47a, 0x3e9858, 0x246c3e]),
  goblin: pal([0xa8d868, 0x80b048, 0x5a8a2a, 0x3e6a1e, 0x284a12]),
  purse: pal([0xc89868, 0xa07040, 0x7c5230, 0x5a3a22, 0x3e2818], [0xffe58a, 0xc9740f, 0x8f4e0c], BRASS),
  bone: pal([0xfffaec, 0xeee8d4, 0xd4ccb4, 0xaca48c, 0x7e7660]),
  silk: pal([0xffffff, 0xf0eef4, 0xd4d0dc, 0xa8a4b4, 0x77748a]),
  ash: pal([0xe0dcec, 0xa8a4bc, 0x76728c, 0x4e4a64, 0x302c44]),
  imp: pal([0xff9aa8, 0xe4586a, 0xc02c42, 0x8a1e34, 0x5a1424]),
  // food and drink
  apple: pal([0xff9a9a, 0xee4a4a, 0xc42c32, 0x8f1c28, 0x5e1420], OAK_GRIP, [0xa8e878, 0x5fb848, 0x2f7a30]),
  goldapple: pal([0xfffbd0, 0xffe070, 0xf7b42a, 0xcc7a12, 0x8f4e0c], OAK_GRIP, [0xa8e878, 0x5fb848, 0x2f7a30]),
  bread: pal([0xf8d8a0, 0xe0b070, 0xc08a4c, 0x946234, 0x684224]),
  pie: pal([0xf4d090, 0xdcae68, 0xc08a48, 0x946234, 0x684224], [0xd8a070, 0xa87040, 0x7a4e2c], CRIMSON),
  // meat: the flesh, the fat and bone, and what runs through it, which is marbling when raw and the marks of the grill when cooked
  rawmeat: pal([0xff9a94, 0xe8626a, 0xc83a4a, 0x98283a, 0x6a1c2c], [0xfff0e0, 0xf0c8b8, 0xc88a80], [0xffc8c0, 0xffb0a8, 0xe88a84]),
  cooked: pal([0xd89050, 0xb0642a, 0x8a4620, 0x663218, 0x462210], [0xf0d8b0, 0xd8a868, 0x9a6a38], [0x4a2614, 0x3a1c10, 0x2a140c]),
  stew: pal([0xdcae74, 0xbb8e5a, 0x9a7446, 0x725233, 0x523a24], [0xc08a4c, 0x946234, 0x684224], [0xf0c880, 0xc87a3a, 0x8f4a20]),
  fae: pal([0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff], [0xe0f4ff, 0xa8c8e0, 0x78849c], [0xffd8ff, 0xf08cf0, 0xb050c0]),
  // potions: the liquid, then the cork
  health: pal([0xffb0a0, 0xf0506a, 0xd02848, 0x981a38, 0x641028], [0xc8a070, 0x96703f, 0x6f4f2c]),
  manap: pal([0xb0e4ff, 0x4ab0f0, 0x1f80d8, 0x0f58a8, 0x0a3a78], [0xc8a070, 0x96703f, 0x6f4f2c]),
  swift: pal([0xe0ffa0, 0xa8e84a, 0x78c030, 0x4e8c20, 0x305c14], [0xc8a070, 0x96703f, 0x6f4f2c]),
  strength: pal([0xffc890, 0xff8a30, 0xe05a18, 0xa83c10, 0x6e240a], [0xc8a070, 0x96703f, 0x6f4f2c]),
  stoneskin: pal([0xe4e0d4, 0xb4b0a4, 0x8e8a7e, 0x66625a, 0x44423c], [0xc8a070, 0x96703f, 0x6f4f2c]),
  night: pal([0xe0d0ff, 0x9a7cf0, 0x6a4cd0, 0x4230a0, 0x281c6c], [0xc8a070, 0x96703f, 0x6f4f2c]),
  fireproof: pal([0xfff0a0, 0xffc040, 0xff8a1a, 0xc85010, 0x8a300c], [0xc8a070, 0x96703f, 0x6f4f2c]),
  water: pal([0xc0fff0, 0x5fe8d8, 0x28b8b8, 0x188088, 0x0e5460], [0xc8a070, 0x96703f, 0x6f4f2c]),
  // arrows: the head, the shaft and the fletching
  arrow: pal([0xb0a8a0, 0x7f7874, 0x5c5654, 0x403c3c, 0x2a2828], OAK_GRIP, [0xfff4e6, 0xd8d0c4, 0xa89c8c]),
  arrow_iron: pal([0xfafbfd, 0xd6dae2, 0xa8aebb, 0x7a8092, 0x555b6c], OAK_GRIP, [0xfff4e6, 0xd8d0c4, 0xa89c8c]),
  arrow_mithril: pal([0xecfcff, 0xa6f2ff, 0x62ccf7, 0x3092dc, 0x1c5cac], [0xf0f4ff, 0xb3bddc, 0x7a85ac], [0x9fd4ff, 0x4a8ed8, 0x2a5cc0]),
  ember: pal([0xfff0a0, 0xffc040, 0xff7a1a, 0xc84010, 0x8a240c], OAK_GRIP, CRIMSON),
};
// Drawings with colours of their own, whatever palette they are given.
const FIXED = {
  bottle: pal([0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff], [0xe0f4ff, 0xa8c8e0, 0x78849c]),
  wheat: pal([0xf8e080, 0xe0b84a, 0xb8942e, 0x8f7420, 0x6a5418]),
  seeds: pal([0xc8e878, 0x8fb848, 0x5f8a30, 0x446420, 0x2e4416]),
  anvil: pal([0x9a9aa8, 0x6e6e7c, 0x54545f, 0x3e3e48, 0x2a2a32]),
  crafting_table: pal([0xdcae74, 0xbb8e5a, 0x9a7446, 0x725233, 0x523a24], [0xe8e4dc, 0xa8aebb, 0x6a6f80], [0xc8cede, 0x8b92a8, 0x5b6178]),
  furnace: pal([0xb4b5ac, 0x999a91, 0x75766f, 0x5a5b55, 0x3e3f3b], [0xfff0a0, 0xffa030, 0xd84a18]),
  forge: pal([0xc87a64, 0xa85a48, 0x7a3f33, 0x54281f, 0x341812], [0xfff0a0, 0xffa030, 0xd84a18]),
  chest: pal([0xd8a868, 0xc08a50, 0xa87a48, 0x7a5430, 0x4f3620], OAK_GRIP, [0xffe58a, 0xc8cede, 0x8b92a8]),
  alchemy_table: pal([0x8f6d48, 0x785c42, 0x5c4632, 0x3f2e20, 0x2a1f16], [0xe0f4ff, 0xa8c8e0, 0x78849c], [0xe0ccff, 0xa87ef0, 0x6d42b8]),
  lantern: pal([0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff], [0x8b92a8, 0x5b6178, 0x3e4254], [0xfff0a0, 0xffc83c, 0xf08a1a]),
  torch: pal([0xb08a60, 0x8f6d48, 0x6d4f33, 0x4f3620, 0x3a2818], OAK_GRIP, [0xfff0a0, 0xffa030, 0xd84a18]),
  fence: pal([0xdcae74, 0xbb8e5a, 0x9a7446, 0x725233, 0x523a24]),
};
const GROUPS = { a: 'ramp', b: 'ramp', c: 'ramp', d: 'ramp', e: 'ramp', h: 'handle', i: 'handle', j: 'handle', x: 'accent', y: 'accent', z: 'accent' };
const RANK = { a: 0, b: 1, c: 2, d: 3, e: 4, h: 0, i: 1, j: 2, x: 0, y: 1, z: 2 };

function parse(name) {
  const rows = SPRITES[name].replace(/^\n/, '').split('\n');
  if (rows.length > N || rows.some(r => r.length > N)) throw new Error(`The drawing of ${name} runs past ${N} by ${N}`);
  return rows;
}
const hexOf = c => [c >> 16 & 255, c >> 8 & 255, c & 255];
// The outline sits on the empty pixels that touch the drawing, which is why a drawing leaves its edges clear.
function paint(name, palette) {
  const rows = parse(name), px = new Uint8Array(N * N * 4), filled = (x, y) => !['.', 's', undefined].includes(rows[y]?.[x]);
  const put = (x, y, colour) => { px.set([...hexOf(colour), 255], (x + y * N) * 4); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = rows[y]?.[x] ?? '.';
    if (ch === '.') { if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) put(x, y, INK); continue; }
    put(x, y, ch === 'w' || ch === 's' ? GLINT : ch === 'k' ? INK : palette[GROUPS[ch]][RANK[ch]]);
  }
  return px;
}
const cache = new Map();
// The pixels of a drawing in a palette, RGBA from the top row down, cached for good: there are few enough of them.
export function spritePixels(art, palName) {
  const key = `${art}/${palName}`;
  if (!cache.has(key)) {
    if (!SPRITES[art]) throw new Error(`No drawing called ${art}`);
    const palette = FIXED[art] ?? PALETTES[palName];
    if (!palette) throw new Error(`No palette called ${palName}, for ${art}`);
    cache.set(key, paint(art, palette));
  }
  return cache.get(key);
}

// ---------- blocks as cubes: an isometric drawing from the same tiles the terrain uses ----------
export const CUBE = 18;
const RIM = 8;
const grain = (x, y, id) => { const n = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + id * 37.719) * 43758.5453; return n - Math.floor(n); };
const lit = (colour, f) => colour.map(v => Math.max(0, Math.min(255, Math.round(v * 255 * f))));
// A pixel of a tile as an icon shows it, tinted as the terrain tints it.
function texel(b, name, u, v, shade) {
  const px = tilePixels(name), x = Math.min(TILE - 1, Math.floor(u * TILE)), y = Math.min(TILE - 1, Math.floor(v * TILE)), i = (x + y * TILE) * 4;
  const tinted = b.tint && px[i + 3] > 200, k = c => (tinted ? b.top[c] * 1.3 : 1) * shade;
  return [px[i] * k(0), px[i + 1] * k(1), px[i + 2] * k(2)].map(Math.round);
}
// RGBA from the top row down, CUBE on a side.
export function cubePixels(id) {
  const b = BL[id], data = new Uint8ClampedArray(CUBE * CUBE * 4), alpha = b.transparent ? 170 : 255;
  const put = (x, y, [r, g, bl], a = alpha) => { data.set([r, g, bl, a], (x + y * CUBE) * 4); };
  const opaque = (x, y) => x >= 0 && y >= 0 && x < CUBE && y < CUBE && data[(x + y * CUBE) * 4 + 3] > 0;
  const [topTile, sideTile = topTile] = [].concat(b.tex ?? []);
  if (b.shape === 'cross' || b.shape === 'torch') { // a thing that grows is shown as it is, not as a cube of itself
    const px = tilePixels(topTile);
    for (let y = 0; y < CUBE; y++) for (let x = 0; x < CUBE; x++) {
      const u = x / CUBE, v = y / CUBE;
      if (px[(Math.floor(u * TILE) + Math.floor(v * TILE) * TILE) * 4 + 3] > 100) put(x, y, texel(b, topTile, u, v, 1), 255);
    }
  } else for (let x = 0; x < CUBE; x++) {
    const d = x < CUBE / 2 ? x : CUBE - 1 - x, half = (d + 1) >> 1, top = RIM / 2 - half, bottom = RIM / 2 + half;
    for (let y = top; y <= bottom; y++) {
      const across = (x - CUBE / 2 + 0.5) / CUBE, down = (y - RIM / 2 + 0.5) / (RIM + 1);
      put(x, y, topTile ? texel(b, topTile, 0.5 + across + down, 0.5 - across + down, y === top ? 1.1 : 1) : lit(b.top, (y === top ? 1.14 : 1) * (grain(x, y, id) < 0.28 ? 0.9 : 1)));
    }
    for (let y = bottom + 1; y <= bottom + RIM; y++) {
      const shade = x < CUBE / 2 ? 0.84 : 0.62;
      put(x, y, sideTile ? texel(b, sideTile, (x < CUBE / 2 ? x : x - CUBE / 2) / (CUBE / 2), (y - bottom - 1) / RIM, shade) : lit(b.side, shade * (grain(x, y, id) < 0.28 ? 0.9 : 1)));
    }
  }
  const edge = [];
  for (let y = 0; y < CUBE; y++) for (let x = 0; x < CUBE; x++) {
    if (opaque(x, y) && !(opaque(x + 1, y) && opaque(x - 1, y) && opaque(x, y + 1) && opaque(x, y - 1))) edge.push([x, y]);
  }
  for (const [x, y] of edge) put(x, y, lit(b.side, 0.3), 255);
  return data;
}

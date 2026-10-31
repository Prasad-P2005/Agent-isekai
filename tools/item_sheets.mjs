// Draws the sheets of every item, to look over without starting the game: node tools/item_sheets.mjs
// They come from the same code the game draws with, and land in docs/items/. Nothing but Node itself is needed.
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TILE, tilePixels } from '../client/js/view/blocktex.js';
import { CUBE, ITEM_SIZE, cubePixels, spritePixels } from '../client/js/view/itemart.js';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('docs/items/', ROOT);
const items = JSON.parse(readFileSync(new URL('content/items.json', ROOT), 'utf8'));
const recipes = JSON.parse(readFileSync(new URL('content/recipes.json', ROOT), 'utf8'));

const PAGE = [0x54, 0x53, 0x61], SLATE = [0xb3, 0xaa, 0xbb], WELL = [0x77, 0x75, 0x8b], WELL_LO = [0x45, 0x44, 0x5a], WELL_HI = [0xf5, 0xe6, 0xf8], INK = [0x2e, 0x2d, 0x3f], WHITE = [0xff, 0xf4, 0xe6], GOLD = [0xfa, 0xc1, 0x3c];
const SCALE = 5, SLOT = 20 * SCALE, GAP = 6, MARGIN = 24, HEAD_W = 170;

// ---------- a canvas with nothing behind it ----------
class Sheet {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h * 3); this.rect(0, 0, w, h, PAGE); }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.px.set(c, (i + j * this.w) * 3); }
  blend(x, y, c, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = (x + y * this.w) * 3;
    for (let n = 0; n < 3; n++) this.px[k + n] = this.px[k + n] + (c[n] - this.px[k + n]) * a;
  }
  sprite(px, size, x, y, scale) {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const k = (i + j * size) * 4, a = px[k + 3] / 255;
      if (a) for (let u = 0; u < scale; u++) for (let v = 0; v < scale; v++) this.blend(x + i * scale + u, y + j * scale + v, [px[k], px[k + 1], px[k + 2]], a);
    }
  }
  slot(x, y) {
    this.rect(x, y, SLOT, SLOT, WELL);
    this.rect(x, y, SLOT, SCALE, WELL_LO);
    this.rect(x, y, SCALE, SLOT, WELL_LO);
    this.rect(x, y + SLOT - SCALE, SLOT, SCALE, WELL_HI);
    this.rect(x + SLOT - SCALE, y, SCALE, SLOT, WELL_HI);
  }
  // A 5 by 7 font, enough for names.
  text(s, x, y, c = WHITE, scale = 2) {
    for (const ch of s.toUpperCase()) {
      for (let col = 0; col < 5; col++) for (let row = 0; row < 7; row++) if ((FONT[ch] ?? FONT[' '])[col] >> row & 1) this.rect(x + col * scale, y + row * scale, scale, scale, c);
      x += 6 * scale;
    }
    return x;
  }
  save(name) {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) Buffer.from(this.px.subarray(y * this.w * 3, (y + 1) * this.w * 3)).copy(raw, y * (this.w * 3 + 1) + 1);
    const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(t)); return Buffer.concat([len, t, crc]); };
    const head = Buffer.alloc(13);
    head.writeUInt32BE(this.w, 0); head.writeUInt32BE(this.h, 4); head[8] = 8; head[9] = 2;
    writeFileSync(new URL(name, OUT), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    console.log(name, `${this.w} x ${this.h}`);
  }
}
const TABLE = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const FONT = {
  ' ': [0, 0, 0, 0, 0], A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01], G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f], I: [0x00, 0x41, 0x7f, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40], M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63], Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43], 0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0x00, 0x42, 0x7f, 0x40, 0x00], 2: [0x42, 0x61, 0x51, 0x49, 0x46],
  3: [0x21, 0x41, 0x45, 0x4b, 0x31], 4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39], 6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03], 8: [0x36, 0x49, 0x49, 0x49, 0x36],
  9: [0x06, 0x49, 0x49, 0x29, 0x1e], "'": [0, 0, 0x07, 0, 0], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '.': [0, 0x60, 0x60, 0, 0], ',': [0, 0x80, 0x60, 0, 0], '+': [0x08, 0x08, 0x3e, 0x08, 0x08], ':': [0, 0x36, 0x36, 0, 0],
};
function drawItem(s, id, x, y) {
  const it = items[id];
  if (!it) throw new Error(`No item called ${id}`);
  s.slot(x, y);
  if (it.art) s.sprite(spritePixels(it.art, it.pal), ITEM_SIZE, x + 2 * SCALE, y + 2 * SCALE, SCALE);
  else if (it.block != null) s.sprite(cubePixels(it.block), CUBE, x + SCALE, y + SCALE, SCALE);
}

// ---------- a table: named rows against named columns ----------
function table(file, title, columns, rows) {
  const w = MARGIN * 2 + HEAD_W + columns.length * (SLOT + GAP), h = MARGIN * 2 + 40 + 24 + rows.length * (SLOT + GAP), s = new Sheet(w, h);
  s.text(title, MARGIN, MARGIN, GOLD, 3);
  columns.forEach((c, i) => s.text(c.slice(0, 8), MARGIN + HEAD_W + i * (SLOT + GAP) + 2, MARGIN + 40, SLATE, 2));
  rows.forEach(([name, ids], r) => {
    const y = MARGIN + 64 + r * (SLOT + GAP);
    s.text(name, MARGIN, y + SLOT / 2 - 7);
    ids.forEach((id, i) => { if (id) drawItem(s, id, MARGIN + HEAD_W + i * (SLOT + GAP), y); });
  });
  s.save(file);
}
// ---------- a list: every item with its name under it ----------
const CELL = 148, CELL_H = SLOT + 44;
function list(file, title, sections, across = 10) {
  let lines = 0;
  for (const [, ids] of sections) lines += Math.ceil(ids.length / across);
  const w = MARGIN * 2 + across * CELL, h = MARGIN * 2 + 40 + sections.length * 34 + lines * CELL_H, s = new Sheet(w, h);
  s.text(title, MARGIN, MARGIN, GOLD, 3);
  let y = MARGIN + 44;
  for (const [name, ids] of sections) {
    s.text(name, MARGIN, y, SLATE, 2);
    y += 30;
    ids.forEach((id, i) => {
      const cx = MARGIN + (i % across) * CELL, cy = y + Math.floor(i / across) * CELL_H;
      drawItem(s, id, cx + (CELL - SLOT) / 2, cy);
      const words = items[id].name.toUpperCase().split(' '), rows = [''];
      for (const word of words) { if ((rows.at(-1) + ' ' + word).trim().length > 22) rows.push(word); else rows[rows.length - 1] = (rows.at(-1) + ' ' + word).trim(); }
      rows.slice(0, 2).forEach((row, l) => s.text(row, cx + (CELL - row.length * 6) / 2, cy + SLOT + 6 + l * 10, WHITE, 1));
    });
    y += Math.ceil(ids.length / across) * CELL_H + 4;
  }
  s.save(file);
}

mkdirSync(OUT, { recursive: true });
const TIERS = ['wood', 'stone', 'copper', 'gold', 'iron', 'silver', 'mithril', 'adamant', 'dragon'];
const LABELS = ['Wood', 'Stone', 'Copper', 'Gold', 'Iron', 'Silver', 'Mithril', 'Adamant', 'Dragon'];
const grid = kinds => kinds.map(([name, kind]) => [name, TIERS.map(t => `${t}_${kind}`)]);
table('1-tools.png', 'Tools', LABELS, grid([['Pickaxe', 'pickaxe'], ['Axe', 'axe'], ['Shovel', 'shovel'], ['Hoe', 'hoe'], ['Hammer', 'hammer']]));
table('2-weapons.png', 'Weapons', LABELS, grid([['Sword', 'sword'], ['Greatsword', 'greatsword'], ['Dagger', 'dagger'], ['Spear', 'spear'], ['Mace', 'mace']]));
const SETS = [['Leather', 'leather'], ['Trollhide', 'trollhide'], ['Chainmail', 'chainmail'], ['Copper', 'copper'], ['Iron', 'iron'], ['Gold', 'gold'], ['Silver', 'silver'], ['Knight', 'knight'], ['Mithril', 'mithril'], ['Adamant', 'adamant'], ['Dragonscale', 'dragonscale'], ['Demonplate', 'demonplate'], ['Elven', 'elven'], ['Arcane', 'arcane']];
table('3-armour.png', 'Armour', ['Head', 'Body', 'Legs', 'Feet'], SETS.map(([name, set]) => [name, ['helm', 'chest', 'legs', 'boots'].map(p => `${set}_${p}`)]));
const of = (group, test = () => true) => Object.entries(items).filter(([, it]) => it.group === group && test(it)).map(([id]) => id);
list('4-ranged-and-magic.png', 'Bows, arrows, shields, staffs', [
  ['Bows', ['hunting_bow', 'longbow', 'elven_bow', 'dragon_bow']], ['Arrows', ['arrow', 'iron_arrow', 'mithril_arrow', 'fire_arrow']],
  ['Shields', ['wooden_shield', 'iron_shield', 'knight_shield', 'mithril_shield', 'dragon_shield']], ['Staffs', ['apprentice_staff', 'crystal_staff', 'arcanist_staff', 'archmage_staff']], ['Other', ['shears']],
], 5);
list('5-materials.png', 'Materials', [
  ['Raw and refined', ['raw_copper', 'raw_iron', 'raw_silver', 'raw_gold', 'raw_mithril', 'raw_adamant', 'copper_ingot', 'iron_ingot', 'silver_ingot', 'gold_ingot', 'mithril_ingot', 'adamant_ingot', 'dragonsteel_ingot']],
  ['Gems and fuel', ['ruby', 'sapphire', 'emerald', 'amethyst', 'mana_dust', 'coal', 'charcoal', 'flint']],
  ['Crafted', ['stick', 'clay_ball', 'brick', 'leather', 'chain_link', 'knight_steel', 'demon_plate', 'elven_weave', 'arcane_cloth', 'glass_bottle', 'bowl', 'wheat', 'wheat_seeds']],
  ['Left by monsters', ['golem_core', 'hunter_badge', 'deer_hide', 'boar_tusk', 'crab_claw', 'slime_gel', 'goblin_ear', 'wolf_pelt', 'stolen_purse', 'old_bone', 'spider_silk', 'orc_tusk', 'troll_hide', 'wraith_ash', 'imp_wing', 'demon_horn', 'dragon_scale']],
]);
list('6-food-and-potions.png', 'Food and potions', [['Food', of('food')], ['Potions', of('potions')]]);
const blocks = of('blocks'), blockId = id => items[id].block;
const fresh = blocks.filter(id => blockId(id) >= 100), old = blocks.filter(id => blockId(id) < 100);
const STATIONS = ['crafting_table', 'furnace', 'forge', 'anvil', 'alchemy_table', 'chest'];
list('7-new-blocks.png', 'New blocks', [
  ['Stations', STATIONS], ['Ores', [...['coal_ore', 'iron_ore', 'mana_ore'], ...fresh.filter(id => id.endsWith('_ore'))]],
  ['Mana and amethyst', ['mana_crystal', 'mana_shard', 'mana_cluster', 'mana_ore', 'amethyst_block', 'crystal_cluster']],
  ['The deep', fresh.filter(id => blockId(id) >= 108 && blockId(id) <= 124 && id !== 'amethyst_block' && id !== 'crystal_cluster')], ['Building', fresh.filter(id => blockId(id) >= 125 && blockId(id) <= 141)],
]);
list('8-existing-blocks.png', 'Blocks already in the game', [['As items', old]], 12);
// The faces the stations show in the world, flat and large, because a small cube cannot show them.
function faces(file, title, tiles) {
  const SIZE = TILE * 8, across = 4, cellW = SIZE + 24, cellH = SIZE + 34, s = new Sheet(MARGIN * 2 + across * cellW, MARGIN * 2 + 44 + Math.ceil(tiles.length / across) * cellH);
  s.text(title, MARGIN, MARGIN, GOLD, 3);
  tiles.forEach(([label, tile], i) => {
    const x = MARGIN + (i % across) * cellW, y = MARGIN + 44 + Math.floor(i / across) * cellH;
    s.sprite(tilePixels(tile), TILE, x, y, 8);
    s.text(label, x, y + SIZE + 8, WHITE, 1);
  });
  s.save(file);
}
faces('9-station-faces.png', 'Station faces in the world', [
  ['Crafting Table, top', 'table_top'], ['Crafting Table, side', 'table_side'], ['Furnace, top', 'furnace_top'], ['Furnace, front', 'furnace_front'], ['Furnace, lit', 'furnace_lit'], ['Forge, top', 'forge_top'], ['Forge, front', 'forge_front'], ['Forge, lit', 'forge_lit'],
  ['Alchemy Table, top', 'alchemy_top'], ['Alchemy Table, side', 'alchemy_side'], ['Chest, top', 'chest_top'], ['Chest, side', 'chest_side'],
]);
console.log(`${Object.keys(items).length} items, ${recipes.length} recipes`);

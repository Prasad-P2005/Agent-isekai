// The world's landmarks: what the story needs (spires, palaces, the Demon Lord's castle) and the smaller sights each realm is known for.
import { ID } from './blocks.js';
import { blob, bush, cactus, deadTree, giantMushroom, palm } from './flora.js';
import { B, SEA, heightAt } from './land.js';

const {
  Air, Water, Pearlstone, ManaCrystal, Stone, Cobblestone, MossyCobblestone, StoneBricks, MossyStoneBricks, OakLog, OakLeaves, Planks, Lantern, Torch, Glass, Kelp, PinkCoral,
  Obsidian, Blackstone, Basalt, Magma, BoneBlock, RedClay, Terracotta, Sand, Snow, Ice, Glowshroom, FaeBloom, Elderwood, ElvenLeaves, Sandstone, Fence, IronOre, CoalOre,
  ThatchStairsN, ThatchStairsS, Thatch, HayBale, Barrel, Gravel,
} = ID;

// spawn hints for creatures that live in structures (mermaids in palaces, the Demon Lord in his castle)
export const hintQueue = [];
const hintSeen = new Set();
export function hint(kind, x, y, z) { const k = kind + x + ',' + y + ',' + z; if (hintSeen.has(k)) return; hintSeen.add(k); hintQueue.push({ kind, x, y, z }); }

export function foundation(set, x, y, z, id) { const g = heightAt(x, z); for (let yy = y; yy > g; yy--) set(x, yy, z, id); }
const pick = (list, r) => list[Math.floor(r() * list.length)];
const ground = (x, z) => heightAt(x, z) + 1;

// ===================== what the story stands on =====================
export function crystals(x, y, z, set, r) {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    let px = x + Math.floor(r() * 5) - 2;
    const pz = z + Math.floor(r() * 5) - 2, len = 3 + Math.floor(r() * 5), lx = r() < 0.3 ? (r() < 0.5 ? 1 : -1) : 0, py = ground(px, pz);
    for (let k = 0; k < len; k++) { set(px, py + k, pz, ManaCrystal); if (k === 2) px += lx; }
  }
}
export function reef(x, y, z, set, r) {
  if (r() < 0.4) { const len = Math.min(SEA - 2 - y, 3 + Math.floor(r() * 12)); for (let k = 0; k < len; k++) set(x, y + k, z, Kelp); return; }
  const id = PinkCoral + Math.floor(r() * 3);
  let px = x, py = y, pz = z;
  for (let k = 0; k < 6 + r() * 8 && py < SEA - 1; k++) {
    set(px, py, pz, id);
    const m = Math.floor(r() * 4);
    if (m === 0) px += r() < 0.5 ? 1 : -1; else if (m === 1) pz += r() < 0.5 ? 1 : -1; else py++;
  }
}
export function palace(x, y, z, set, r) {
  const R = 6;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    foundation(set, x + dx, y - 1, z + dz, Pearlstone);
    set(x + dx, y - 1, z + dz, Pearlstone);
    for (let dy = 0; dy <= R; dy++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > R + 0.5) continue;
      set(x + dx, y + dy, z + dz, d > R - 0.6 ? (dy === 2 && (dx === 0 || dz === 0) ? Glass : Pearlstone) : Water);
    }
  }
  for (let dy = 0; dy < 4; dy++) set(x, y + dy, z, dy === 3 ? ManaCrystal : Pearlstone);
  set(x, y + 4, z, Lantern);
  hint('mermaid', x + 2, y + 1, z); hint('mermaid', x - 2, y + 1, z + 1); hint('mermaid_queen', x, y + 1, z + 2);
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { for (let dy = -1; dy < 8; dy++) set(x + dx, y + dy, z + dz, Pearlstone); set(x + dx, y + 8, z + dz, ManaCrystal); }
  for (let i = 0; i < 12; i++) set(x + Math.floor(r() * 15) - 7, y, z + Math.floor(r() * 15) - 7, PinkCoral + Math.floor(r() * 3), true);
  for (let i = 0; i < 6; i++) reef(x + Math.floor(r() * 21) - 10, y, z + Math.floor(r() * 21) - 10, set, r);
}
export function spire(x, y, z, set, r) {
  for (let dy = -1; dy < 26; dy++) {
    const rad = dy < 3 ? 3 : Math.max(0, 2.6 - dy / 10);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz <= rad * rad + 0.5) set(x + dx, y + dy, z + dz, dy < 3 ? Pearlstone : ManaCrystal);
  }
  set(x, y + 26, z, Lantern);
  for (let i = 0; i < 7; i++) { // shards break the ground all around it, within a hero's reach
    const a = i / 7 * Math.PI * 2, sx = x + Math.round(Math.cos(a) * 9), sz = z + Math.round(Math.sin(a) * 9), len = 2 + Math.floor(r() * 4), g = ground(sx, sz);
    for (let k = 0; k < len; k++) set(sx, g + k, sz, ManaCrystal);
  }
  hint('law_stone', x + 5, ground(x + 5, z), z);
}
export function ruins(x, y, z, set, r) {
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    const edge = Math.abs(dx) === 6 || Math.abs(dz) === 6, g = heightAt(x + dx, z + dz);
    if (!edge && r() < 0.6) set(x + dx, g, z + dz, r() < 0.4 ? MossyStoneBricks : StoneBricks); // what is left of the floor
    if (!edge && !(dx === 0 && r() < 0.3)) continue;
    const hgt = Math.floor(r() * 7);
    for (let dy = 1; dy <= hgt; dy++) set(x + dx, g + dy, z + dz, r() < 0.15 ? OakLeaves : r() < 0.5 ? MossyCobblestone : StoneBricks);
  }
  for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) for (let dy = 0; dy < 8; dy++) if (r() < 0.9) set(x + dx, heightAt(x + dx, z + dz) + 1 + dy, z + dz, MossyStoneBricks);
  set(x, ground(x, z), z, ManaCrystal);
}
export function demonCastle(x, y, z, set) {
  const R = 15, MOAT = 12.5, WALL = 10.5, HALL = 18, SPIRES = [[9, 9], [-9, 9], [9, -9], [-9, -9]];
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > R + 0.5) continue;
    foundation(set, x + dx, y - 2, z + dz, Blackstone);
    if (d > MOAT) { set(x + dx, y - 1, z + dz, Magma); continue; } // magma moat
    set(x + dx, y - 1, z + dz, Obsidian);
    if (d > WALL) { // the outer wall, toothed along the top
      for (let dy = 0; dy < 12; dy++) set(x + dx, y + dy, z + dz, Basalt);
      if ((dx + dz) & 1) set(x + dx, y + 12, z + dz, Obsidian);
      continue;
    }
    for (let dy = 0; dy < HALL; dy++) set(x + dx, y + dy, z + dz, d > WALL - 2 ? Obsidian : dy === HALL - 1 ? Blackstone : Air);
    if (d > WALL - 2 && (dx + dz) % 2 === 0) { set(x + dx, y + HALL, z + dz, Obsidian); set(x + dx, y + HALL + 1, z + dz, Magma); }
  }
  for (const [ox, oz] of SPIRES) for (let dy = -1; dy < 32; dy++) {
    const rad = dy < 18 ? 2.6 : Math.max(0, 2.6 - (dy - 18) / 6);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz <= rad * rad + 0.5) set(x + ox + dx, y + dy, z + oz + dz, dy === 31 ? Magma : Obsidian);
  }
  for (let dy = 0; dy < 5; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = 8; dz <= 13; dz++) set(x + dx, y + dy, z + dz, Air); // the gate
  for (let dx = -2; dx <= 2; dx++) for (let dz = 12; dz <= 16; dz++) set(x + dx, y - 1, z + dz, Blackstone); // and the only way over the moat
  for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4]]) set(x + dx, y - 1, z + dz, Magma);
  for (const [dx, dz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) for (let dy = 0; dy < HALL - 1; dy++) set(x + dx, y + dy, z + dz, dy === 5 ? Magma : Basalt);
  hint('demon_lord', x, y, z);
  hint('demon_knight', x + 3, y, z + 3); hint('demon_knight', x - 3, y, z + 3);
}
export function magmaSpike(x, y, z, set, r) { const n = 2 + Math.floor(r() * 5); for (let i = 0; i < n; i++) set(x, y + i, z, i === n - 1 ? Magma : Obsidian); }
// What the Wyrm sleeps on: older kills, older treasure, and the ribs of the last thing that came for it.
export function hoard(x, y, z, set, r) {
  const HEAP = 9.5, TREASURE = [BoneBlock, BoneBlock, Barrel, Sandstone, ManaCrystal];
  for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
    const tall = Math.floor((HEAP - Math.hypot(dx, dz)) / 3 + r() * 1.4);
    for (let k = 0; k < tall; k++) set(x + dx, y + k, z + dz, pick(TREASURE, r));
  }
  for (let i = -6; i <= 6; i += 3) for (const side of [-1, 1]) for (let k = 0; k <= 7; k++) set(x + i, y + 2 + k, z + side * Math.round(9 * Math.cos(k / 7 * Math.PI / 2)), BoneBlock);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, px = x + Math.round(Math.cos(a) * 13), pz = z + Math.round(Math.sin(a) * 13), tall = 2 + Math.floor(r() * 3); for (let k = 0; k < tall; k++) set(px, y + k, pz, ManaCrystal); }
  hint('dragon', x, y + 3, z);
}

// ===================== the sights of each realm =====================
function watchtower(x, z, set, r) {
  const g = ground(x, z), top = g + 9 + Math.floor(r() * 4);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = dx * dx + dz * dz;
    if (d > 10) continue;
    foundation(set, x + dx, g - 1, z + dz, Cobblestone);
    for (let y = g; y <= top; y++) if (d > 5 && (r() > 0.04 * (y - g) || y < g + 4)) set(x + dx, y, z + dz, r() < 0.3 ? MossyStoneBricks : StoneBricks);
  }
  set(x, g, z + 3, Air); set(x, g + 1, z + 3, Air);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz < 6 && r() < 0.8) set(x + dx, g + 5, z + dz, Planks);
}
function stoneCircle(x, z, set, r) {
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, px = x + Math.round(Math.cos(a) * 7), pz = z + Math.round(Math.sin(a) * 7), g = ground(px, pz), tall = 2 + Math.floor(r() * 3);
    for (let dy = 0; dy < tall; dy++) set(px, g + dy, pz, r() < 0.3 ? MossyCobblestone : Stone);
  }
  set(x, ground(x, z), z, Lantern);
}
function waysideShrine(x, z, set) {
  const g = ground(x, z);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { set(x + dx, g - 1, z + dz, Cobblestone); set(x + dx, g + 3, z + dz, dx === 0 ? Thatch : dz < 0 ? ThatchStairsS : ThatchStairsN); }
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let dy = 0; dy < 3; dy++) set(x + dx, g + dy, z + dz, OakLog);
  set(x, g, z, StoneBricks); set(x, g + 1, z, ManaCrystal); set(x, g + 2, z, Lantern);
}
function campsite(x, z, set) {
  const g = ground(x, z);
  set(x, g - 1, z, Magma);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(x + dx, g - 1, z + dz, Cobblestone);
  set(x + 3, g, z + 1, HayBale); set(x - 3, g, z - 1, Barrel); set(x + 2, g, z - 3, Fence); set(x + 2, g + 1, z - 3, Torch);
}
function moonwell(x, z, set, r) {
  const g = ground(x, z) - 1;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > 4.5) continue;
    set(x + dx, g, z + dz, d > 3.2 ? Pearlstone : ManaCrystal);
    if (d <= 3.2) set(x + dx, g + 1, z + dz, Water);
    else if ((dx + dz) & 1) set(x + dx, g + 1, z + dz, Pearlstone);
  }
  for (let i = 0; i < 8; i++) set(x + Math.floor(r() * 15) - 7, ground(x, z), z + Math.floor(r() * 15) - 7, r() < 0.5 ? Glowshroom : FaeBloom, true);
}
function mushroomRing(x, z, set, r) {
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, px = x + Math.round(Math.cos(a) * 7), pz = z + Math.round(Math.sin(a) * 7); giantMushroom(px, ground(px, pz), pz, set, r); }
  for (let i = 0; i < 10; i++) { const px = x + Math.floor(r() * 13) - 6, pz = z + Math.floor(r() * 13) - 6; set(px, ground(px, pz), pz, Glowshroom, true); }
}
function elfArch(x, z, set, r) {
  const g = ground(x, z), span = 4;
  for (let dy = 0; dy <= 8; dy++) for (const side of [-1, 1]) set(x + side * Math.round(span * Math.cos(dy / 8 * Math.PI / 2)), g + dy, z, Elderwood);
  for (let dx = -2; dx <= 2; dx++) set(x + dx, g + 9, z, ElvenLeaves, true);
  blob(set, x, g + 10, z, 2, 1, 2, ElvenLeaves, r);
}
function termites(x, z, set, r) {
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + Math.floor(r() * 15) - 7, pz = z + Math.floor(r() * 15) - 7, g = ground(px, pz), tall = 3 + Math.floor(r() * 5);
    for (let dy = 0; dy < tall; dy++) { const rad = dy < tall - 2 ? 1 : 0; for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (!(dx && dz)) set(px + dx, g + dy, pz + dz, dy % 2 ? RedClay : Terracotta); }
  }
}
// Something enormous lay down here long ago. Its ribs still stand.
function skeleton(x, z, set) {
  for (let i = -6; i <= 6; i++) {
    set(x + i, ground(x + i, z) + 3, z, BoneBlock);
    if (i % 2 || Math.abs(i) > 4) continue;
    for (const side of [-1, 1]) for (let k = 0; k <= 3; k++) { const pz = z + side * (3 - Math.abs(k - 1)); set(x + i, ground(x + i, pz) + k, pz, BoneBlock); }
  }
}
function kopje(x, z, set, r) { for (let i = 0; i < 5; i++) { const px = x + Math.floor(r() * 9) - 4, pz = z + Math.floor(r() * 9) - 4; blob(set, px, ground(px, pz) + 1, pz, 3, 2 + Math.floor(r() * 2), 3, r() < 0.5 ? Sandstone : Terracotta, r); } }
function frozenTarn(x, z, set, r) {
  const g = ground(x, z) - 1;
  for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
    const d = Math.hypot(dx, dz) + r() * 1.5;
    if (d > 8) continue;
    for (let y = g + 1; y <= g + 6; y++) set(x + dx, y, z + dz, Air); // the hollow it lies in
    set(x + dx, g, z + dz, d > 6 ? Snow : Ice);
    set(x + dx, g - 1, z + dz, Stone);
  }
}
function crystalHeart(x, z, set, r) { for (let i = 0; i < 3; i++) crystals(x + Math.floor(r() * 9) - 4, ground(x, z), z + Math.floor(r() * 9) - 4, set, r); blob(set, x, ground(x, z), z, 3, 1, 3, Pearlstone, r); }
function mineEntrance(x, z, set, r) {
  const g = ground(x, z);
  for (let d = 0; d < 12; d++) for (let a = -1; a <= 1; a++) for (let dy = 0; dy < 3; dy++) set(x + a, g + dy - d, z + d, Air);
  for (let d = 0; d < 12; d += 3) for (const side of [-2, 2]) for (let dy = 0; dy < 3; dy++) { set(x + side, g + dy - d, z + d, OakLog); if (dy === 2) set(x + side / 2, g + dy - d, z + d, Planks); }
  for (let d = 0; d < 12; d += 4) set(x + 1, g + 2 - d, z + d, Lantern);
  set(x + 2, g, z - 2, Barrel); set(x - 2, g, z - 1, r() < 0.5 ? IronOre : CoalOre);
}
function boneSpire(x, z, set, r) {
  const g = ground(x, z), tall = 8 + Math.floor(r() * 8);
  for (let dy = 0; dy < tall; dy++) { const w = Math.round(Math.sin(dy * 0.8) * 1.4); set(x + w, g + dy, z, BoneBlock); set(x, g + dy, z + w, BoneBlock); }
  set(x, g + tall, z, Magma);
}
function obsidianArch(x, z, set) {
  const g = ground(x, z);
  for (let dy = 0; dy <= 9; dy++) for (const side of [-1, 1]) set(x + side * Math.round(5 * Math.cos(dy / 9 * Math.PI / 2)), g + dy, z, Obsidian);
  set(x, g + 10, z, Magma);
}
function fireAltar(x, z, set) {
  const g = ground(x, z);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { set(x + dx, g - 1, z + dz, Blackstone); if (Math.abs(dx) === 3 && Math.abs(dz) === 3) for (let dy = 0; dy < 4; dy++) set(x + dx, g + dy, z + dz, dy === 3 ? Magma : Basalt); }
  set(x, g, z, Obsidian); set(x, g + 1, z, Magma);
}
function seaStack(x, z, set, r) {
  const top = SEA + 4 + Math.floor(r() * 12);
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    const d = Math.hypot(dx, dz) + r() * 1.2;
    if (d > 5.5) continue;
    const peak = Math.round(top - d * d * 0.34);
    if (peak <= SEA - 1) continue;
    for (let y = heightAt(x + dx, z + dz) + 1; y <= peak; y++) set(x + dx, y, z + dz, y >= peak - 1 && peak < SEA + 3 ? Sand : Stone);
  }
  if (r() < 0.6) palm(x, top + 1, z, set, r);
}
function wreck(x, z, set, r) {
  const g = ground(x, z) + 1, tilt = r() < 0.5 ? 1 : -1;
  for (let i = -7; i <= 7; i++) for (let w = -2; w <= 2; w++) {
    const low = Math.abs(w) * 1 + Math.floor(Math.abs(i) / 3), h = g + low + Math.floor(i * tilt / 5);
    set(x + i, h, z + w, Planks);
    if (Math.abs(w) === 2 || Math.abs(i) === 7) { set(x + i, h + 1, z + w, r() < 0.7 ? Planks : Air); if (r() < 0.5) set(x + i, h + 2, z + w, Planks); }
  }
  for (let dy = 0; dy < 7; dy++) set(x, g + dy, z, OakLog);
  set(x + 3, g + 1, z, Barrel);
}
function atoll(x, z, set, r) {
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, px = x + Math.round(Math.cos(a) * 8), pz = z + Math.round(Math.sin(a) * 8);
    for (let y = heightAt(px, pz) + 1; y < SEA - 1; y++) if (r() < 0.8) set(px, y, pz, PinkCoral + Math.floor(r() * 3));
    reef(px, heightAt(px, pz) + 1, pz, set, r);
  }
}
function driedOasis(x, z, set, r) { for (let i = 0; i < 6; i++) { const px = x + Math.floor(r() * 11) - 5, pz = z + Math.floor(r() * 11) - 5; cactus(px, ground(px, pz), pz, set, r); } set(x, ground(x, z), z, Gravel); }
function thornbrake(x, z, set, r) { for (let i = 0; i < 7; i++) { const px = x + Math.floor(r() * 13) - 6, pz = z + Math.floor(r() * 13) - 6; deadTree(px, ground(px, pz), pz, set, r, OakLog); bush(px + 1, ground(px + 1, pz), pz, OakLeaves, set, r); } }

const SIGHTS = {
  [B.KINGDOM]: [watchtower, stoneCircle, waysideShrine, campsite],
  [B.ELF]: [moonwell, mushroomRing, elfArch, mushroomRing],
  [B.BEAST]: [termites, skeleton, kopje, driedOasis, thornbrake],
  [B.PEAKS]: [frozenTarn, crystalHeart, mineEntrance],
  [B.DEMON]: [boneSpire, obsidianArch, fireAltar],
  [B.OCEAN]: [seaStack, wreck, atoll],
  [B.MIRE]: [mushroomRing, thornbrake, stoneCircle, skeleton],
};
export function raiseSight(b, x, z, set, r) { const list = SIGHTS[b]; if (list) pick(list, r)(x, z, set, r); }

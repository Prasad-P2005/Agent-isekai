// Settlements as they stand: the server plans where each building goes (world/layouts.py) and this draws them.
// The BUILD table must name every Building.kind in the plans; tests/client/terrain.test.mjs builds them all.
import { WORLD } from '../core/content.js';
import { ID } from './blocks.js';
import { giantTree } from './flora.js';
import { CS, TOWNS, heightAt } from './land.js';
import { hash3, mulberry, hash2 } from './noise.js';
import { foundation } from './structures.js';

const {
  Air, Water, Cobblestone, StoneBricks, MossyStoneBricks, OakLog, Planks, Plaster, TimberFrame, Glass, Lantern, Torch, Pearlstone, ManaCrystal, Elderwood, ElvenLeaves, Glowshroom,
  RoofTiles, RoofTileStairsN, RoofTileStairsE, RoofTileStairsS, RoofTileStairsW, Thatch, ThatchStairsN, ThatchStairsE, ThatchStairsS, ThatchStairsW,
  SlateTiles, SlateStairsN, SlateStairsE, SlateStairsS, SlateStairsW, Fence, Farmland, Wheat, HayBale, Barrel, Bookshelf, RedWool, WhiteWool, RedCarpet, RoyalBanner,
  Magma, Blackstone, Obsidian, TribalTotem, RedClay, StoneSlab, PlankSlab,
} = ID;

const roofOf = (n, e, s, w, ridge) => ({ n, e, s, w, ridge });
const TILES = roofOf(RoofTileStairsN, RoofTileStairsE, RoofTileStairsS, RoofTileStairsW, RoofTiles);
const THATCH = roofOf(ThatchStairsN, ThatchStairsE, ThatchStairsS, ThatchStairsW, Thatch);
const SLATE = roofOf(SlateStairsN, SlateStairsE, SlateStairsS, SlateStairsW, SlateTiles);
const LEAVES = roofOf(ElvenLeaves, ElvenLeaves, ElvenLeaves, ElvenLeaves, ElvenLeaves);
const HOMES = [
  { wall: TimberFrame, corner: OakLog, roof: THATCH },
  { wall: Plaster, corner: OakLog, roof: TILES },
  { wall: Planks, corner: OakLog, roof: TILES },
  { wall: TimberFrame, corner: OakLog, roof: SLATE },
  { wall: Cobblestone, corner: OakLog, roof: THATCH },
];
const DOORV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
let STYLE = null; // 'elf' while building the elven capital: elderwood walls, living-leaf roofs

// A pitched roof along the building's longer side, overhanging its walls, with the gable ends filled in.
function roofOver(x, y, z, hw, hd, h, o, set) {
  const alongX = hw >= hd, run = alongX ? hw : hd, span = alongX ? hd : hw, { roof } = o;
  for (let k = 0; k <= span + 1; k++) {
    const off = span + 1 - k, Y = y + h + k - 1;
    for (let t = -run - 1; t <= run + 1; t++) {
      if (!off) { set(alongX ? x + t : x, Y, alongX ? z : z + t, roof.ridge); continue; }
      if (alongX) { set(x + t, Y, z - off, roof.s); set(x + t, Y, z + off, roof.n); }
      else { set(x - off, Y, z + t, roof.e); set(x + off, Y, z + t, roof.w); }
    }
    if (off > 1 && k) for (let q = 1 - off; q < off; q++) for (const end of [-run, run]) { // the gable
      set(alongX ? x + end : x + q, Y, alongX ? z + q : z + end, q === 0 && k === 2 ? Glass : o.gable ?? o.wall);
    }
  }
}
function building(x, y, z, set, o) {
  if (STYLE === 'elf') o = { ...o, wall: Elderwood, corner: Elderwood, roof: LEAVES, floor: o.floor === Pearlstone ? Pearlstone : Planks, gable: Elderwood };
  const { hw, hd, h } = o;
  for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
    foundation(set, x + dx, y - 1, z + dz, Cobblestone);
    set(x + dx, y - 1, z + dz, o.floor);
    const ex = Math.abs(dx) === hw, ez = Math.abs(dz) === hd;
    for (let dy = 0; dy < h; dy++) {
      let id = Air;
      if (ex && ez) id = o.corner;
      else if (ex || ez) id = o.windows && (dy === 1 || dy === 2) && !(((ex ? dz : dx) + 64) % 2) ? Glass : dy === 0 && o.plinth ? o.plinth : o.wall;
      set(x + dx, y + dy, z + dz, id);
    }
  }
  const [fx, fz] = DOORV[o.door || 's'], doorX = x + fx * hw, doorZ = z + fz * hd;
  set(doorX, y, doorZ, Air); set(doorX, y + 1, doorZ, Air); set(doorX, y + 2, doorZ, Lantern);
  set(doorX + fx, y - 1, doorZ + fz, Cobblestone); // a step out onto the street
  roofOver(x, y, z, hw, hd, h, o, set);
  set(x, y + h - 1, z, Lantern);
  if (o.chimney) { const cx = x + hw - 1, cz = z - hd + 1; for (let yy = y; yy < y + h + Math.min(hw, hd) + 2; yy++) set(cx, yy, cz, yy === y ? Magma : Cobblestone); }
  return { fx, fz, px: fz ? 1 : 0, pz: fx ? 1 : 0, doorX, doorZ, depth: fz ? hd : hw, top: y + h + Math.min(hw, hd) + 1 };
}
const furnish = (x, y, z, set, list) => { for (const [dx, dz, id, lift = 0] of list) set(x + dx, y + lift, z + dz, id); };

function house(b, y, set, r) {
  const look = HOMES[Math.floor(r() * HOMES.length)], hw = r() < 0.6 ? 3 : 2, hd = r() < 0.6 ? 3 : 2;
  building(b.x, y, b.z, set, { ...look, hw, hd, h: 4, floor: Planks, windows: 1, door: b.door, chimney: r() < 0.6 });
  furnish(b.x, y, b.z, set, [[1 - hw, 1 - hd, RedWool], [1 - hw, 2 - hd, WhiteWool], [hw - 1, 1 - hd, Barrel], [1 - hw, hd - 1, Bookshelf]]);
}
function stall(b, y, set, r) {
  const stripe = r() < 0.5 ? RedWool : RoyalBanner;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
    foundation(set, b.x + dx, y - 1, b.z + dz, Cobblestone);
    for (let dy = 0; dy < 3; dy++) set(b.x + dx, y + dy, b.z + dz, Air);
    set(b.x + dx, y + 3, b.z + dz, (dx + 2) & 1 ? WhiteWool : stripe);
  }
  for (let dx = -2; dx <= 2; dx++) set(b.x + dx, y, b.z - 1, PlankSlab);
  for (const dx of [-2, 2]) for (const dz of [-1, 1]) for (let dy = 0; dy < 3; dy++) set(b.x + dx, y + dy, b.z + dz, OakLog);
  set(b.x, y + 2, b.z - 1, Lantern);
  set(b.x + 1, y, b.z + 1, Barrel);
}
function streetStall(b, y, set, r) {
  const awning = r() < 0.5 ? RedWool : RoyalBanner;
  for (let dx = -1; dx <= 1; dx++) {
    set(b.x + dx, y - 1, b.z, Planks);
    set(b.x + dx, y, b.z, PlankSlab);
    if (Math.abs(dx) === 1) { set(b.x + dx, y + 1, b.z, Fence); set(b.x + dx, y + 2, b.z, Fence); }
    set(b.x + dx, y + 3, b.z, awning);
  }
  set(b.x, y + 1, b.z, Lantern);
}
function well(b, y, set) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const rim = dx || dz;
    set(b.x + dx, y - 1, b.z + dz, rim ? StoneBricks : Water);
    set(b.x + dx, y - 2, b.z + dz, rim ? StoneBricks : Water);
    if (rim) set(b.x + dx, y, b.z + dz, Cobblestone);
    set(b.x + dx, y + 3, b.z + dz, dx === 0 ? Thatch : dx < 0 ? ThatchStairsE : ThatchStairsW);
  }
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (let dy = 1; dy < 3; dy++) set(b.x + dx, y + dy, b.z + dz, Fence);
  set(b.x, y + 2, b.z, Lantern);
}
function fountain(b, y, set) {
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > 3.6) continue;
    set(b.x + dx, y - 1, b.z + dz, StoneBricks);
    set(b.x + dx, y, b.z + dz, d > 2.6 ? StoneBricks : Water);
  }
  for (let dy = 0; dy < 3; dy++) set(b.x, y + dy, b.z, Pearlstone);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { set(b.x + dx, y + 2, b.z + dz, StoneSlab); set(b.x + dx, y + 1, b.z + dz, Water); }
  set(b.x, y + 3, b.z, Lantern);
}
function farm(b, y, set, r) {
  const crop = r() < 0.75 ? Wheat : HayBale, hw = 7, hd = 5;
  for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
    const edge = Math.abs(dx) === hw || Math.abs(dz) === hd, g = heightAt(b.x + dx, b.z + dz);
    if (edge) { set(b.x + dx, g + 1, b.z + dz, Fence); continue; }
    const channel = Math.abs(dz) === 2 && (dx + 64) % 4 === 0;
    set(b.x + dx, g, b.z + dz, channel ? Water : Farmland);
    if (!channel && crop === Wheat) set(b.x + dx, g + 1, b.z + dz, Wheat);
  }
  if (crop !== Wheat) for (let i = 0; i < 6; i++) set(b.x + Math.floor(r() * 9) - 4, heightAt(b.x, b.z) + 1, b.z + Math.floor(r() * 7) - 3, HayBale);
  const [fx, fz] = DOORV[b.door || 's'], gateX = b.x + fx * hw, gateZ = b.z + fz * hd; // the gate faces town
  set(gateX, heightAt(gateX, gateZ) + 1, gateZ, Air);
  set(gateX + (fz ? 1 : 0), heightAt(gateX, gateZ) + 2, gateZ + (fx ? 1 : 0), Torch);
}
function windmill(b, y, set) {
  const [fx, fz] = DOORV[b.door || 's'], top = y + 10, px = fz ? 1 : 0, pz = fx ? 1 : 0;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = dx * dx + dz * dz;
    if (d > 10) continue;
    foundation(set, b.x + dx, y - 1, b.z + dz, Cobblestone);
    set(b.x + dx, y - 1, b.z + dz, Planks);
    for (let yy = y; yy <= top; yy++) set(b.x + dx, yy, b.z + dz, d > 4.5 ? (yy < y + 4 ? Cobblestone : Plaster) : Air);
    for (let k = 0; k <= 3; k++) if (d <= (3 - k) * (3 - k) + 1) set(b.x + dx, top + 1 + k, b.z + dz, Thatch);
  }
  set(b.x + fx * 3, y, b.z + fz * 3, Air); set(b.x + fx * 3, y + 1, b.z + fz * 3, Air);
  // four sails on a hub, canvas on a lattice
  const hubX = b.x + fx * 4, hubZ = b.z + fz * 4, hubY = top - 1;
  set(hubX, hubY, hubZ, OakLog);
  for (let k = 1; k <= 7; k++) for (const s of [-1, 1]) {
    set(hubX + px * k * s, hubY, hubZ + pz * k * s, OakLog); set(hubX, hubY + k * s, hubZ, OakLog);
    if (k > 1) { set(hubX + px * k * s, hubY + s, hubZ + pz * k * s, WhiteWool); set(hubX - px * s, hubY + k * s, hubZ - pz * s, WhiteWool); }
  }
}
function barn(b, y, set) {
  const g = building(b.x, y, b.z, set, { hw: 4, hd: 3, h: 5, wall: Planks, corner: OakLog, roof: THATCH, floor: Planks, door: b.door });
  for (let i = 0; i < 5; i++) set(b.x - g.fx * 2 + g.px * (i - 2), y, b.z - g.fz * 2 + g.pz * (i - 2), HayBale);
  set(b.x, y + 1, b.z - g.fz * 2, HayBale);
}
function hut(b, y, set, wide = 3) {
  const reach = wide * wide + 1;
  for (let dx = -wide; dx <= wide; dx++) for (let dz = -wide; dz <= wide; dz++) {
    const d = dx * dx + dz * dz;
    if (d > reach) continue;
    foundation(set, b.x + dx, y - 1, b.z + dz, RedClay);
    set(b.x + dx, y - 1, b.z + dz, RedClay);
    for (let dy = 0; dy < 3; dy++) set(b.x + dx, y + dy, b.z + dz, d > reach - 5 ? (dy === 1 ? Planks : OakLog) : Air);
  }
  const [fx, fz] = DOORV[b.door || 's'];
  set(b.x + fx * wide, y, b.z + fz * wide, Air); set(b.x + fx * wide, y + 1, b.z + fz * wide, Air);
  set(b.x - fx * wide, y + 1, b.z - fz * wide, Air);
  for (let k = 0; k <= wide + 1; k++) {
    const rr = wide + 1 - k;
    for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) if (dx * dx + dz * dz <= rr * rr + 1) set(b.x + dx, y + 3 + k, b.z + dz, Thatch);
  }
  set(b.x, y + 2, b.z, Lantern);
  const postX = b.x + (fz ? 2 : fx * (wide + 2)), postZ = b.z + (fx ? 2 : fz * (wide + 2)); // a totem by the door
  for (let i = 0; i < 3; i++) set(postX, y + i, postZ, i % 2 ? TribalTotem : OakLog);
  set(postX, y + 3, postZ, Torch);
}
// The heart of a kingdom: a curtain wall with a tower on each corner, a courtyard, and a great hall with the throne at its far end.
function keep(b, y, set) {
  const R = 13, x = b.x, z = b.z, TOP = 9, HALL_W = 6, HALL_D = 8, HALL_H = 8;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    foundation(set, x + dx, y - 1, z + dz, StoneBricks);
    set(x + dx, y - 1, z + dz, StoneBricks);
    if (Math.max(Math.abs(dx), Math.abs(dz)) < R) continue;
    for (let dy = 0; dy < TOP; dy++) set(x + dx, y + dy, z + dz, hash3(x + dx, y + dy, z + dz) < 0.12 ? MossyStoneBricks : StoneBricks);
    if ((dx + dz) & 1) set(x + dx, y + TOP, z + dz, StoneBricks);
  }
  for (const ox of [-R, R]) for (const oz of [-R, R]) tower(x + ox, y, z + oz, 3, 14, set);
  // the gatehouse faces south, up the avenue from the south gate
  for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy < 5; dy++) set(x + dx, y + dy, z + R, Air);
  for (const dx of [-3, 3]) for (let dy = 0; dy < 12; dy++) set(x + dx, y + dy, z + R, StoneBricks);
  for (const dx of [-3, 3]) { set(x + dx, y + 12, z + R, RoyalBanner); set(x + dx, y + 5, z + R + 1, RoyalBanner); set(x + dx, y + 4, z + R + 1, RoyalBanner); set(x + dx, y + 3, z + R + 1, Lantern); }
  const hall = building(x, y, z - 1, set, { hw: HALL_W, hd: HALL_D, h: HALL_H, wall: StoneBricks, corner: StoneBricks, roof: SLATE, floor: Planks, windows: 1, door: 's', gable: StoneBricks });
  for (let dz = -HALL_D + 2; dz <= HALL_D; dz++) set(x, y, z - 1 + dz, RedCarpet);
  for (const dz of [-5, -1, 3]) for (const dx of [-3, 3]) { for (let dy = 0; dy < HALL_H - 2; dy++) set(x + dx, y + dy, z - 1 + dz, dy === 3 ? Lantern : StoneBricks); }
  for (let dx = -2; dx <= 2; dx++) for (let dz = -HALL_D + 1; dz <= -HALL_D + 2; dz++) set(x + dx, y, z - 1 + dz, StoneBricks); // the dais
  set(x, y + 1, z - 1 - HALL_D + 1, RoyalBanner); set(x, y + 2, z - 1 - HALL_D + 1, RoyalBanner);
  set(x, hall.top + 1, z - 1, RoyalBanner);
  for (const dx of [-8, 8]) { set(x + dx, y, z + 9, Barrel); set(x + dx, y, z - 9, HayBale); }
}
function tower(x, y, z, rad, tall, set, open = 2) {
  const outer = rad * rad + 1;
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    const d = dx * dx + dz * dz;
    if (d > outer) continue;
    foundation(set, x + dx, y - 1, z + dz, StoneBricks);
    for (let yy = y; yy <= y + tall; yy++) set(x + dx, yy, z + dz, d > outer - open * rad ? StoneBricks : (yy - y) % 5 === 4 ? Planks : Air);
    if (d > outer - open * rad && (dx + dz) & 1) set(x + dx, y + tall + 1, z + dz, StoneBricks);
    for (let k = 0; k < rad; k++) if (d <= (rad - k) * (rad - k)) set(x + dx, y + tall + 2 + k, z + dz, SlateTiles);
  }
  set(x + rad, y + tall - 3, z, Glass);
  set(x, y + tall + 2 + rad, z, Lantern);
}
function church(b, y, set) {
  const g = building(b.x, y, b.z, set, { hw: 3, hd: 6, h: 7, wall: Plaster, corner: StoneBricks, plinth: StoneBricks, roof: SLATE, floor: Pearlstone, windows: 1, door: b.door, gable: StoneBricks });
  const belfryX = b.x + g.fx * 2, belfryZ = b.z + g.fz * 4;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let yy = g.top; yy < g.top + 6; yy++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) set(belfryX + dx, yy, belfryZ + dz, yy > g.top + 3 && (dx === 0 || dz === 0) ? Air : StoneBricks);
  for (let k = 0; k < 3; k++) for (let dx = k - 2; dx <= 2 - k; dx++) for (let dz = k - 2; dz <= 2 - k; dz++) set(belfryX + dx, g.top + 6 + k, belfryZ + dz, SlateTiles);
  set(belfryX, g.top + 9, belfryZ, ManaCrystal);
  for (let dx = -2; dx <= 2; dx += 2) for (const row of [-2, 0, 2]) set(b.x + (dx ? dx : 0), y, b.z + row, dx ? PlankSlab : RedCarpet);
  set(b.x - g.fx * 2, y, b.z - g.fz * 5, Pearlstone); set(b.x - g.fx * 2, y + 1, b.z - g.fz * 5, ManaCrystal);
}
const BUILD = {
  house,
  stall,
  street_stall: streetStall,
  treehouse: (b, y, set, r) => giantTree(b.x, y, b.z, set, r),
  hut: (b, y, set) => hut(b, y, set),
  keep,
  well,
  fountain,
  farm,
  windmill,
  barn,
  church,
  guild: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 5, hd: 4, h: 5, wall: TimberFrame, corner: OakLog, plinth: Cobblestone, roof: TILES, floor: Planks, windows: 1, door: b.door, chimney: true });
    const cx = b.x - g.fx * (g.depth - 2), cz = b.z - g.fz * (g.depth - 2);
    for (let k = -3; k <= 3; k++) set(cx + g.px * k, y, cz + g.pz * k, Planks); // reception counter
    set(cx + g.px * 3, y + 1, cz + g.pz * 3, Lantern);
    for (let k = -4; k <= 4; k++) set(cx - g.fx + g.px * k, y, cz - g.fz + g.pz * k, Bookshelf);
    for (const k of [-2, 2]) for (let dy = 2; dy <= 3; dy++) set(g.doorX + g.fx + g.px * k, y + dy, g.doorZ + g.fz + g.pz * k, RoyalBanner);
  },
  hospital: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 5, hd: 4, h: 5, wall: Plaster, corner: Pearlstone, roof: TILES, floor: Pearlstone, windows: 1, door: b.door });
    for (const [k, dy] of [[0, 3], [0, 4], [-1, 3], [1, 3]]) set(g.doorX + g.px * k, y + dy, g.doorZ + g.pz * k, RedWool); // red cross
    for (let k = -3; k <= 3; k += 2) { set(b.x - g.fx * (g.depth - 1) + g.px * k, y, b.z - g.fz * (g.depth - 1) + g.pz * k, WhiteWool); set(b.x - g.fx * (g.depth - 2) + g.px * k, y, b.z - g.fz * (g.depth - 2) + g.pz * k, RedWool); } // beds
  },
  inn: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 4, hd: 4, h: 7, wall: Plaster, corner: OakLog, plinth: Cobblestone, roof: THATCH, floor: Planks, windows: 1, door: b.door, chimney: true });
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) > 1 || Math.abs(dz) > 1) set(b.x + dx, y + 3, b.z + dz, Planks); // an upper floor, open over the hearth
    for (const k of [-2, 2]) { set(b.x + g.px * k, y, b.z + g.pz * k, Barrel); set(b.x + g.px * k + g.fx, y, b.z + g.pz * k + g.fz, PlankSlab); }
  },
  smithy: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 4, hd: 3, h: 4, wall: Cobblestone, corner: StoneBricks, roof: SLATE, floor: Cobblestone, windows: 0, door: b.door, chimney: true });
    const fx = b.x - g.fx * (g.depth - 1), fz = b.z - g.fz * (g.depth - 1);
    set(fx, y, fz, Magma); set(fx, y + 1, fz, Blackstone); set(b.x + g.px * 2, y, b.z + g.pz * 2, Obsidian); // forge and anvil
  },
  elfhall: (b, y, set) => {
    building(b.x, y, b.z, set, { hw: 4, hd: 4, h: 5, wall: Elderwood, corner: Elderwood, roof: LEAVES, floor: Planks, windows: 1, door: b.door, gable: Elderwood });
    set(b.x + 2, y, b.z + 2, Glowshroom); set(b.x - 2, y, b.z - 2, Glowshroom);
  },
  lodge: (b, y, set) => building(b.x, y, b.z, set, { hw: 3, hd: 3, h: 4, wall: Planks, corner: TribalTotem, roof: THATCH, floor: RedClay, windows: 0, door: b.door }),
  shrine: (b, y, set, r) => {
    giantTree(b.x, y, b.z, set, r);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = b.x + Math.round(Math.cos(a) * 8), z = b.z + Math.round(Math.sin(a) * 8); set(x, y, z, ManaCrystal); set(x, y + 1, z, ManaCrystal); }
  },
  palace: (b, y, set, r) => { // the World Tree palace of the elven ruler
    giantTree(b.x, y, b.z, set, r);
    giantTree(b.x + 1, y + 1, b.z + 1, set, r);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, x = b.x + Math.round(Math.cos(a) * 9), z = b.z + Math.round(Math.sin(a) * 9);
      for (let dy = 0; dy < 4; dy++) set(x, y + dy, z, dy === 3 ? ManaCrystal : Pearlstone);
    }
    for (let dx = 2; dx <= 4; dx++) for (let dz = 2; dz <= 4; dz++) set(b.x + dx, y - 1, b.z + dz, Pearlstone); // throne dais
    set(b.x + 3, y, b.z + 4, ManaCrystal); set(b.x + 3, y + 1, b.z + 4, ManaCrystal);
  },
  chief: (b, y, set) => {
    hut(b, y, set, 4);
    for (const [dx, dz] of [[7, 7], [-7, 7], [7, -7], [-7, -7]]) { for (let i = 0; i < 5; i++) set(b.x + dx, y + i, b.z + dz, i % 2 ? TribalTotem : OakLog); set(b.x + dx, y + 5, b.z + dz, Lantern); }
  },
};

// ---- the walls round a town ----
const TOWER_STEP = Math.PI / 6, TOWER_START = Math.PI / 12, GATE_HALF = 2;
function cityWall(x, z, dx, dz, d, S, set) {
  const R = TOWNS[S.type].wall, g = heightAt(x, z), gate = Math.abs(dx) <= GATE_HALF || Math.abs(dz) <= GATE_HALF;
  const a = Math.atan2(dz, dx), turn = TOWER_START + Math.round((a - TOWER_START) / TOWER_STEP) * TOWER_STEP;
  const tx = S.cx + Math.cos(turn) * R, tz = S.cz + Math.sin(turn) * R, fromTower = Math.hypot(x - tx, z - tz);
  if (fromTower < 4.2) { // a round tower, every thirty degrees
    const shell = fromTower > 2.9, top = g + 12;
    for (let y = g + 1; y <= top; y++) set(x, y, z, shell ? StoneBricks : (y - g) % 5 === 4 ? Planks : Air);
    if (shell && (x + z) & 1) set(x, top + 1, z, StoneBricks);
    for (let k = 0; k < 4; k++) if (fromTower < 4.2 - k) set(x, top + 2 + k, z, SlateTiles);
    return;
  }
  if (Math.abs(d - R) > 1.3) return;
  for (let y = g + 1; y <= g + 8; y++) if (!gate || y >= g + 6) set(x, y, z, hash3(x, y, z) < 0.1 ? MossyStoneBricks : StoneBricks);
  if (d > R + 0.4 && (x + z) & 1) set(x, g + 9, z, StoneBricks);
  if (gate && (Math.abs(dx) === GATE_HALF || Math.abs(dz) === GATE_HALF)) set(x, g + 5, z, Lantern);
}
function hedgeWall(x, z, dx, dz, d, S, set) { // the elves grow theirs
  const R = TOWNS[S.type].wall, g = heightAt(x, z);
  if (Math.abs(d - R) > 1.1 || Math.abs(dx) <= GATE_HALF || Math.abs(dz) <= GATE_HALF) return;
  const post = (x + z) % 7 === 0;
  for (let y = g + 1; y <= g + 5; y++) set(x, y, z, post || y < g + 3 ? Elderwood : ElvenLeaves, !post);
  if (post) set(x, g + 6, z, Lantern);
}
function palisade(x, z, dx, dz, d, S, set) {
  const R = TOWNS[S.type].wall, g = heightAt(x, z);
  if (Math.abs(d - R) > 0.75 || Math.abs(dx) <= 1 || Math.abs(dz) <= 1) return;
  const tall = 3 + Math.floor(hash3(x, 5, z) * 2);
  for (let y = g + 1; y <= g + tall; y++) set(x, y, z, OakLog);
  if ((Math.abs(dx) === 2 || Math.abs(dz) === 2)) set(x, g + tall + 1, z, Torch);
}
const WALLS = { city: cityWall, elfcity: hedgeWall, beast: palisade };
const WALL_BAND = 6; // a wall and its towers stand this close to its line

export function townChunk(cx, cz, S, set) {
  const build = WALLS[S.type], bx = cx * CS, bz = cz * CS, R = TOWNS[S.type].wall;
  if (build) for (let x = bx; x < bx + CS; x++) for (let z = bz; z < bz + CS; z++) {
    const dx = x - S.cx, dz = z - S.cz, d = Math.hypot(dx, dz);
    if (Math.abs(d - R) <= WALL_BAND) build(x, z, dx, dz, d, S, set);
  }
  STYLE = S.type === 'elfcity' ? 'elf' : null;
  for (const b of S.layout) {
    if (Math.floor(b.x / CS) !== cx || Math.floor(b.z / CS) !== cz) continue;
    BUILD[b.kind](b, heightAt(b.x, b.z) + 1, set, mulberry(hash2(b.x, b.z)));
  }
  STYLE = null;
}
// Whether a tree could stand here without coming through someone's roof.
export function clearOfBuildings(S, x, z) {
  for (const b of S.layout) {
    const [hw, hd] = WORLD.buildings[b.kind];
    if (Math.abs(x - b.x) <= hw + 3 && Math.abs(z - b.z) <= hd + 3) return false;
  }
  return true;
}

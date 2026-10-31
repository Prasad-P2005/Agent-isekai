// Settlements as they stand: the server plans where each building goes (world/layouts.py) and this draws them.
// The BUILD table must name every Building.kind in the plans; tests/client/terrain.test.mjs builds them all.
import { WORLD } from '../core/content.js';
import { ID } from './blocks.js';
import { giantTree } from './flora.js';
import { CS, TOWNS, heightAt } from './land.js';
import { hash3, mulberry, hash2 } from './noise.js';
import { foundation } from './structures.js';

const {
  Air, Water, Cobblestone, MossyCobblestone, StoneBricks, MossyStoneBricks, OakLog, Planks, Plaster, TimberFrame, Glass, Lantern, Torch, Pearlstone, ManaCrystal, Elderwood, ElvenLeaves, Glowshroom, GlowVine,
  RoofTiles, RoofTileStairsN, RoofTileStairsE, RoofTileStairsS, RoofTileStairsW, Thatch, ThatchStairsN, ThatchStairsE, ThatchStairsS, ThatchStairsW,
  SlateTiles, SlateStairsN, SlateStairsE, SlateStairsS, SlateStairsW, Fence, Farmland, Wheat, HayBale, Barrel, Bookshelf, RedWool, WhiteWool, RedCarpet, RoyalBanner,
  Magma, Blackstone, Basalt, Obsidian, CoalOre, IronOre, TribalTotem, BoneBlock, RedClay, Terracotta, StoneSlab, PlankSlab,
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
// ---- the landmarks ----
// A player steers by these, so each needs a shape they can name from the far end of town and a room worth walking into.
const WORN = { [StoneBricks]: MossyStoneBricks, [Cobblestone]: MossyCobblestone };
const aged = set => (x, y, z, id) => set(x, y, z, hash3(x, y, z) < 0.12 ? WORN[id] ?? id : id);
// What a landmark is built of. The elven capital grows the same plan in elderwood under living leaves, as building() does.
const ELVEN = { stone: Elderwood, base: Elderwood, wall: Elderwood, post: Elderwood, beam: Elderwood, roof: LEAVES, hat: LEAVES, trim: Pearlstone, fire: ManaCrystal };
const look = o => (STYLE === 'elf' ? { ...o, ...ELVEN, floor: o.floor === Pearlstone ? Pearlstone : Planks } : o);
const DIAGONALS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const compass = (x, z) => (x > 0 ? 'e' : x < 0 ? 'w' : z > 0 ? 's' : 'n');

// A plan in its own terms: u runs from the middle out through the door, v across it. A lot never turns with its door,
// so a plan reads du and dv, how far it may reach along each, instead of assuming them.
function frame(b, y, hw, hd, set) {
  const [fx, fz] = DOORV[b.door || 's'], px = fz ? 1 : 0, pz = fx ? 1 : 0;
  const X = (u, v) => b.x + fx * u + px * v, Z = (u, v) => b.z + fz * u + pz * v;
  const put = (u, dy, v, id) => set(X(u, v), y + dy, Z(u, v), id);
  const fill = (u0, u1, y0, y1, v0, v1, id) => { for (let u = u0; u <= u1; u++) for (let dy = y0; dy <= y1; dy++) for (let v = v0; v <= v1; v++) put(u, dy, v, id); };
  const stair = (roof, u, v) => roof[compass(fx * u + px * v, fz * u + pz * v)]; // the stairs that rise towards (u, v)
  return { put, fill, stair, X, Z, fx, fz, px, pz, du: fz ? hd : hw, dv: fz ? hw : hd };
}
function plot(x, y, z, hw, hd, floor, set) {
  for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) { foundation(set, x + dx, y - 1, z + dz, Cobblestone); set(x + dx, y - 1, z + dz, floor); }
}
// One storey of walls. Wider than the one below, it is a jetty, standing out over the street on its joists.
function storey(x, y, z, hw, hd, h, o, set) {
  const pane = o.pane ?? ((run, dy) => dy > 0 && dy < h - 1 && !((run + 64) % 2));
  for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
    const ex = Math.abs(dx) === hw, ez = Math.abs(dz) === hd;
    if (o.floor) set(x + dx, y - 1, z + dz, (ex || ez) && o.joist ? o.joist : o.floor);
    for (let dy = 0; dy < h; dy++) set(x + dx, y + dy, z + dz, ex && ez ? o.post : !ex && !ez ? Air : pane(ex ? dz : dx, dy, ex) ? Glass : !dy && o.plinth ? o.plinth : o.wall);
  }
}
// A roof that slopes in from all four sides, so a lot reads the same from any street. It stops at `stop` to carry a tower.
function hipped(x, y, z, hw, hd, pitch, roof, set, stop = 0) {
  for (let k = 0; Math.min(hw, hd) - k >= stop; k++) {
    const a = hw - k, b = hd - k, flat = Math.min(a, b) === 0;
    for (let dx = -a; dx <= a; dx++) for (let dz = -b; dz <= b; dz++) {
      const ex = Math.abs(dx) === a, ez = Math.abs(dz) === b;
      if (!ex && !ez) continue;
      for (let i = 0; i < pitch; i++) set(x + dx, y + k * pitch + i, z + dz, i < pitch - 1 || flat || (ex && ez) ? roof.ridge : ex ? (dx < 0 ? roof.e : roof.w) : dz < 0 ? roof.s : roof.n);
    }
  }
}
// A pitched roof climbing `pitch` blocks for each one in, gable ends walled. Steep is what lifts a hall out of the barns.
function steepRoof(x, y, z, hw, hd, pitch, o, set, alongX = hw >= hd) {
  const run = alongX ? hw : hd, span = alongX ? hd : hw, { roof } = o;
  for (let k = 0; k <= span + 1; k++) {
    const off = span + 1 - k, base = y + k * pitch;
    for (let t = -run - 1; t <= run + 1; t++) for (const s of off ? [-1, 1] : [1]) for (let i = 0; i < (off ? pitch : 1); i++) {
      const id = !off || i < pitch - 1 ? roof.ridge : alongX ? (s < 0 ? roof.s : roof.n) : s < 0 ? roof.e : roof.w;
      set(alongX ? x + t : x + s * off, base + i, alongX ? z + s * off : z + t, id);
    }
    if (o.gable && off > 1) for (let q = 1 - off; q < off; q++) for (const end of [-run, run]) for (let i = 0; i < pitch; i++) set(alongX ? x + end : x + q, base + i, alongX ? z + q : z + end, o.gable);
  }
}
// A steep hat. Every fairy tale skyline is this one shape, so it has to come to a real point; stairs along each shelf keep the slope running.
function cone(x, y, z, rad, rise, roof, set) {
  const size = k => rad * (1 - k / rise) ** 1.2 + 0.3;
  for (let k = 0; k < rise; k++) {
    const rr = size(k), next = size(k + 1), reach = Math.ceil(rr);
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
      const d = dx * dx + dz * dz, ax = Math.abs(dx), az = Math.abs(dz);
      if (d > rr * rr) continue;
      set(x + dx, y + k, z + dz, d <= next * next || ax === az ? roof.ridge : ax > az ? (dx < 0 ? roof.e : roof.w) : dz < 0 ? roof.s : roof.n);
    }
  }
}
// A round wall on the floor it stands on; slit windows at the quarters unless it says otherwise.
function drum(x, y, z, rad, tall, o, set) {
  const outer = rad * rad + 1, inner = (rad - 1) * (rad - 1) + 1;
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    const d = dx * dx + dz * dz;
    if (d <= outer) for (let dy = 0; dy < tall; dy++) set(x + dx, y + dy, z + dz, d <= inner ? Air : (o.pane ? o.pane(dx, dz, dy) : (!dx || !dz) && dy % 4 === 2) ? Glass : o.wall);
  }
}
// A slim turret carried out past a corner on a stone pier, so it stands proud of two walls at once without hiding either.
function cornerTurret(x, y, z, sx, sz, foot, tall, o, set, hat) {
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    foundation(set, x + dx, y - 1, z + dz, Cobblestone);
    for (let dy = 0; dy < foot; dy++) set(x + dx, y + dy, z + dz, dy ? o.stone : o.base ?? o.stone);
  }
  const cx = x + sx, cz = z + sz;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < tall; dy++) {
    set(cx + dx, y + foot + dy, cz + dz, !dx && !dz ? Air : !(dx && dz) && dy % 3 === 1 ? Glass : o.wall);
  }
  cone(cx, y + foot + tall, cz, 1.5, hat, o.hat ?? o.roof, set);
  set(cx, y + foot + tall - 1, cz, Lantern);
}
// A pier off the wall, so a wall can stand tall and full of glass, ending in a lit pinnacle.
function buttress(f, u, v, top, o) {
  f.fill(u, u, 0, top, v, v, o.stone);
  f.put(u, top + 1, v, o.trim); f.put(u, top + 2, v, Lantern);
}
// Paints a picture in blocks: one string to a row, top row first, centred. A space leaves what is there.
const mural = (rows, top, key, put) => rows.forEach((row, i) => [...row].forEach((c, j) => { if (c !== ' ') put(j - (row.length >> 1), top - i, key[c]); }));
const ARCH = ['  T  ', ' TAT ', 'TAAAT', 'TAAAT', 'TAAAT', 'TAAAT']; // a pointed door, three wide
const SKULL = ['B   B', 'BB BB', ' BBB ', ' RBR ', '  B  '];
// A shop sign hung from a beam out over the street, side-on to the wall so that anyone walking along it can read it.
function sign(f, u, top, v, rows, key) {
  const long = rows[0].length;
  f.fill(u, u + long - 1, top + 1, top + 1, v, v, OakLog);
  mural(rows, top, key, (k, dy, id) => f.put(u + (long >> 1) + k, dy, v, id));
}
// A flight of solid steps: the player walks up one-block ledges on their own, so this is all a stair needs.
// `floor` is the slab it leaves and `rise` how far up the next one lies; the flight cuts its own way through that slab.
function flight(f, u, v, su, sv, floor, rise, id = Planks) {
  for (let k = 1; k < rise; k++) {
    const U = u + su * (k - 1), V = v + sv * (k - 1);
    f.fill(U, U, floor + 1, floor + k, V, V, id);
    f.fill(U, U, floor + k + 1, floor + k + 3, V, V, Air);
  }
}
function flag(x, y, z, tall, px, pz, set, long = 3, deep = 2) {
  for (let dy = 0; dy < tall; dy++) set(x, y + dy, z, Fence);
  for (let k = 1; k <= long; k++) for (let i = 0; i < deep; i++) set(x + px * k, y + tall - 1 - i, z + pz * k, RoyalBanner);
}
const hangLamp = (f, u, v, from, to) => { f.fill(u, u, to + 1, from, v, v, Fence); f.put(u, to, v, Lantern); };

// A hall for people who fight for a living: stone to the height of a thrown axe, timber jettied out above it, turrets on every corner and a lantern tower you can steer by.
function guild(b, y, raw) {
  const set = aged(raw), hw = 5, hd = 4, HALL = 6, LOFT = 4, EAVE = HALL + LOFT, LANTERN = 20, f = frame(b, y, hw, hd, set), { du, dv, put, fill } = f;
  const m = look({ stone: StoneBricks, base: Cobblestone, wall: TimberFrame, post: OakLog, roof: SLATE, floor: Planks, trim: Pearlstone });
  plot(b.x, y, b.z, hw, hd, m.floor, set);
  storey(b.x, y, b.z, hw, hd, HALL, { wall: m.stone, post: m.stone, plinth: m.base, pane: (run, dy) => dy > 1 && dy < 5 && !((run + 64) % 3) }, set);
  storey(b.x, y + HALL, b.z, hw + 1, hd + 1, LOFT, { wall: m.wall, post: m.post, floor: m.floor, joist: m.post }, set);
  hipped(b.x, y + EAVE, b.z, hw + 2, hd + 2, 2, m.roof, set, 2);
  // the great door, and the gable over it that carries the guild's arms
  mural(ARCH, 5, { T: m.trim, A: Air }, (v, dy, id) => put(du, dy, v, id)); fill(du + 1, du + 1, -1, -1, -1, 1, Cobblestone);
  for (const v of [-3, 3]) { fill(du + 1, du + 1, 1, 5, v, v, RoyalBanner); put(du, 4, v > 0 ? 2 : -2, Lantern); }
  fill(du + 1, du + 2, EAVE, EAVE + 3, -3, 3, Air); // the eaves would run straight across its face
  steepRoof(f.X(du - 1, 0), y + EAVE, f.Z(du - 1, 0), f.fz ? 3 : 2, f.fz ? 2 : 3, 2, { roof: m.roof, gable: m.wall }, set, !f.fz);
  mural(['BBBBBBB', 'BSBBBSB', 'BBSBSBB', 'BBBSBBB', 'BBSBSBB', 'BHBBBHB', ' BBBBB ', '  BBB  '], 15, { B: RoyalBanner, S: Pearlstone, H: OakLog }, (v, dy, id) => put(du + 1, dy, v, id));
  // four turrets on the corners, their hats far above the eaves
  for (const [sx, sz] of DIAGONALS) cornerTurret(b.x + sx * hw, y, b.z + sz * hd, sx, sz, HALL, 8, m, set, 9);
  // the lantern: a glass tower over the well of the hall, and a spire with the guild's banner on top
  storey(b.x, y + EAVE, b.z, 2, 2, LANTERN - EAVE, { wall: m.wall, post: m.post, pane: (run, dy) => dy > 8 }, set);
  fill(-3, 3, LANTERN, LANTERN, -3, 3, m.post); fill(-1, 1, LANTERN, LANTERN, -1, 1, Air);
  storey(b.x, y + LANTERN + 1, b.z, 2, 2, 5, { wall: Glass, post: m.post }, set);
  cone(b.x, y + LANTERN + 6, b.z, 3, 11, m.roof, set);
  flag(b.x, y + LANTERN + 17, b.z, 6, f.px, f.pz, set, 4, 3);
  // the hall: a gallery round a well of light, counter across the back with the trophies behind it
  fill(3 - du, du - 3, HALL - 1, HALL - 1, 3 - dv, dv - 3, Air);
  for (let u = 2 - du; u <= du - 2; u++) for (let v = 2 - dv; v <= dv - 2; v++) if (Math.abs(u) === du - 2 || Math.abs(v) === dv - 2) put(u, HALL, v, Fence);
  fill(2 - du, 2 - du, 0, 0, 1 - dv, dv - 1, Planks);
  for (const u of [2 - du, du - 2]) for (const v of [2 - dv, dv - 2]) { fill(u, u, 0, HALL - 2, v, v, m.post); put(u, HALL - 2, v, Lantern); }
  for (const v of [2 - dv, dv - 2]) put(2 - du, 1, v, Lantern);
  fill(1 - du, 1 - du, 0, 3, 1 - dv, 2 - dv, Bookshelf); fill(1 - du, 1 - du, 0, 3, dv - 2, dv - 1, Bookshelf);
  mural([' B   B ', ' BB BB ', 'R BBB R', 'R  B  R'], 4, { B: BoneBlock, R: RedWool }, (v, dy, id) => put(1 - du, dy, v, id));
  fill(1, du - 1, 0, 0, 0, 0, RedCarpet); fill(-1, 1, 0, 0, -1, 1, RedCarpet);
  for (let u = 0; u < du - 1; u += 2) { put(u, 0, 1 - dv, Barrel); put(u, 2, 1 - dv, u ? BoneBlock : RedWool); put(u + 1, 0, 1 - dv, Bookshelf); put(u + 1, 1, 1 - dv, Bookshelf); }
  flight(f, du - 1, dv - 1, -1, 0, -1, HALL);
  fill(2 - du, -1, HALL, HALL + 2, -dv, -dv, Bookshelf);
  hangLamp(f, 0, 0, LANTERN - 1, HALL + 2);
}

// Pale and quiet, and the one roof in town that is a dome: you can find it from anywhere, which is the point of a hospital.
function hospital(b, y, set) {
  const hw = 5, hd = 4, WARD = 7, HIGH = 4, R = 5, DOME = WARD + HIGH, f = frame(b, y, hw, hd, set), { du, dv, put, fill } = f;
  const m = look({ wall: Plaster, stone: Pearlstone, post: Pearlstone, roof: TILES, floor: Pearlstone, trim: Pearlstone });
  plot(b.x, y, b.z, hw, hd, m.floor, set);
  storey(b.x, y, b.z, hw, hd, WARD, { wall: m.wall, post: m.trim, plinth: m.trim, pane: (run, dy) => dy > 0 && dy < WARD - 1 && (run + 64) % 3 !== 0 }, set);
  fill(-du, du, WARD, WARD, -dv, dv, m.wall);
  hipped(b.x, y + WARD, b.z, hw + 1, hd + 1, 1, m.roof, set, 4);
  drum(b.x, y + WARD, b.z, R, HIGH, { wall: m.wall, pane: (dx, dz, dy) => dy > 0 && (dx + dz + 64) % 2 === 1 }, set);
  for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) for (let dy = 0; dy <= R + 1; dy++) {
    const d = Math.hypot(dx, dy, dz);
    if (d > R + 0.75 || d < R - 0.45) continue;
    const rib = !dx || !dz || Math.abs(dx) === Math.abs(dz);
    set(b.x + dx, y + DOME + dy, b.z + dz, !dy ? m.trim : rib ? m.trim : dy < 3 ? Glass : m.wall);
  }
  // a lantern to crown it, a crystal in the lantern, and over everything the cross
  const crown = DOME + R + 1;
  storey(b.x, y + crown, b.z, 1, 1, 3, { wall: Glass, post: m.trim }, set);
  set(b.x, y + crown + 1, b.z, ManaCrystal);
  fill(-1, 1, crown + 3, crown + 3, -1, 1, m.trim);
  mural([' R ', ' R ', 'RRR', ' R ', ' R '], crown + 8, { R: RedWool }, (v, dy, id) => put(0, dy, v, id));
  mural([' R ', 'RRR', ' R '], WARD + 3, { R: RedWool }, (v, dy, id) => put(R, dy, v, id));
  // the door, under a porch on two columns
  mural(ARCH, 5, { T: m.trim, A: Air }, (v, dy, id) => put(du, dy, v, id));
  fill(du + 1, du + 1, -1, -1, -1, 1, Pearlstone);
  for (const v of [-2, 2]) fill(du + 1, du + 1, 0, 3, v, v, m.trim);
  fill(du + 1, du + 1, 4, 4, -3, 3, m.trim); fill(du + 1, du + 1, 5, 5, -1, 1, m.trim); put(du + 1, 3, 0, Lantern);
  // the ward: beds down both walls, an aisle of light, a healer's bench under a crystal at the far end
  for (let u = 2 - du; u < du - 1; u += 2) for (const s of [-1, 1]) { put(u, 0, s * (dv - 1), WhiteWool); put(u, 0, s * (dv - 2), RedWool); put(u + 1, 4, s * dv, Lantern); }
  fill(1 - du, 1 - du, 0, 2, 1 - dv, -2, Bookshelf); fill(1 - du, 1 - du, 0, 2, 2, dv - 1, Bookshelf);
  put(1 - du, 0, 0, m.trim); put(1 - du, 1, 0, ManaCrystal); put(1 - du, 0, -1, Barrel); put(1 - du, 0, 1, Barrel);
  // the ceiling opens into the dome, and a long chain brings its light down to the beds
  for (let dx = 1 - hw; dx < hw; dx++) for (let dz = 1 - hd; dz < hd; dz++) if (dx * dx + dz * dz < R * R) set(b.x + dx, y + WARD, b.z + dz, Air);
  hangLamp(f, 0, 0, DOME + R - 1, WARD + 1);
  for (const [u, v] of [[0, 3], [0, -3], [3, 0], [-3, 0]]) hangLamp(f, u, v, DOME + 2, WARD + 2);
}

// Built on to for three hundred years and never once straightened: every floor stands further out and a little off true.
function inn(b, y, raw, r) {
  const set = aged(raw), f = frame(b, y, 4, 4, set), { put, fill, X, Z, fz } = f, lean = r() < 0.5 ? -1 : 1, FIRST = 6, SECOND = 10, THIRD = 14, EAVE = 17;
  const m = look({ stone: Cobblestone, wall: Plaster, beam: TimberFrame, post: OakLog, roof: THATCH, hat: SLATE, floor: Planks, fire: Magma });
  const walls = { wall: m.beam, post: m.post, floor: m.floor, joist: m.post };
  plot(b.x, y, b.z, 4, 4, m.floor, set);
  storey(b.x, y, b.z, 4, 4, 5, { wall: m.wall, post: m.post, plinth: m.stone, pane: (run, dy) => dy > 0 && dy < 4 && !!((run + 64) % 3) }, set);
  storey(b.x, y + FIRST, b.z, 5, 5, 3, walls, set);
  fill(-5, 5, SECOND - 1, SECOND - 1, -5, 5, m.post);
  storey(X(1, lean), y + SECOND, Z(1, lean), 5, 5, 3, walls, set);
  fill(-5, 5, THIRD - 1, THIRD - 1, -5 + lean, 5 + lean, m.post);
  hipped(X(1, lean), y + THIRD - 1, Z(1, lean), 5, 5, 1, m.roof, set, 4);
  storey(X(0, -lean), y + THIRD, Z(0, -lean), 4, 4, 3, walls, set);
  // the big gable to the street, a wing breaking out of its side, and a window in the peak where the attic sleeps the stable boys
  steepRoof(X(0, -lean), y + EAVE, Z(0, -lean), 4, 4, 2, { roof: m.roof, gable: m.beam }, set, !fz);
  storey(X(0, 3 * lean), y + THIRD, Z(0, 3 * lean), 2, 2, 3, walls, set);
  steepRoof(X(0, 3 * lean), y + EAVE, Z(0, 3 * lean), 2, 2, 2, { roof: m.roof, gable: m.beam }, set, !!fz);
  fill(4, 4, EAVE + 3, EAVE + 4, -lean - 1, -lean + 1, m.post); fill(4, 4, EAVE + 3, EAVE + 3, -lean - 1, -lean + 1, Glass); put(3, EAVE + 2, -lean, Lantern);
  // the balcony: a floor out over the door, under the jetty above it
  fill(5, 5, FIRST, FIRST + 2, -5, 5, Air); fill(4, 4, FIRST, FIRST + 2, -5, 5, m.beam);
  fill(5, 5, FIRST, FIRST, -4, 4, Fence); for (const v of [-5, 5]) fill(5, 5, FIRST, FIRST + 2, v, v, m.post);
  for (const v of [-3, -2, 2, 3]) put(4, FIRST + 1, v, Glass);
  // the door, and a sign out on the side the house leans away from
  fill(4, 4, 0, 2, 0, 0, Air); put(4, 3, 1, Lantern); put(4, 3, -1, Lantern); fill(5, 5, -1, -1, 0, 0, Cobblestone);
  fill(5, 5, 3, 3, -4, 4, f.stair(m.roof, -1, 0)); put(4, 2, 0, Air);
  sign(f, 4, 8, -6 * lean, ['RGR', 'GGG', 'RGR'], { R: RedWool, G: Thatch });
  // a stair turret on a back corner, and a chimney that wanders on its way up
  cornerTurret(X(-4, -4 * lean), y, Z(-4, -4 * lean), -f.fx - f.px * lean, -fz - f.pz * lean, FIRST, 13, { stone: m.wall, base: m.stone, wall: m.beam, roof: m.roof, hat: m.hat }, set, 9);
  let cv = lean;
  for (let dy = 0; dy < EAVE + 11; dy++) { if (dy > 8 && dy % 7 === 2) cv += dy % 2 ? lean : -lean; fill(-4, -4, dy, dy, cv - 1, cv + 1, m.stone); }
  fill(-5, -3, EAVE + 11, EAVE + 11, cv - 1, cv + 1, m.stone); put(-4, EAVE + 12, cv, m.stone);
  // the taproom: a great hearth at the back, the bar down one side with barrels behind it, tables down the other
  fill(-4, -4, 0, 4, -3, 3, m.stone); fill(-3, -3, 0, 3, -2, 2, m.stone); fill(-3, -3, 0, 1, -1, 1, Air); fill(-3, -3, 0, 0, -1, 1, m.fire); put(-3, 4, -2, Lantern); put(-3, 4, 2, Lantern);
  fill(-2, 2, 0, 0, -2, -2, Planks); fill(-3, 3, 0, 1, -3, -3, Barrel); put(-2, 1, -2, Lantern); put(2, 1, -2, Lantern);
  for (const u of [2, -2]) { put(u, 0, 2, Fence); put(u, 1, 2, PlankSlab); }
  hangLamp(f, 0, 2, 4, 3); hangLamp(f, 0, -2, 4, 3); hangLamp(f, 3, 0, 4, 3);
  // upstairs: two rooms to the front of each floor, a landing behind them
  const rooms = (floor, wall) => {
    fill(wall, wall, floor, floor + 2, -4, 4, Planks); fill(wall, 4, floor, floor + 2, 0, 0, Planks);
    for (const s of [-1, 1]) {
      fill(wall, wall, floor, floor + 1, s * 2, s * 2, Air); put(wall + 1, floor + 2, s * 3, Lantern);
      put(3, floor, s * 3, WhiteWool); put(2, floor, s * 3, RedWool); put(3, floor, s, Barrel);
    }
  };
  rooms(FIRST, 1); rooms(SECOND, 1);
  fill(1, 4, FIRST, FIRST + 1, 0, 0, Air); fill(1, 3, FIRST + 2, FIRST + 2, 0, 0, Air); put(4, FIRST + 2, 0, Lantern); // the front rooms open on to the balcony
  flight(f, 3, 3, -1, 0, -1, FIRST);
  flight(f, -3, -3, 1, 0, FIRST - 1, 4);
  put(-1, FIRST + 2, 3, Lantern); put(-2, SECOND + 2, 3, Lantern);
}

// One huge stack with fire in its throat, leaning over a bay left open to the street so that the whole road hears the hammer.
function smithy(b, y, raw) {
  const set = aged(raw), hw = 4, hd = 3, f = frame(b, y, hw, hd, set), { du, dv, put, fill } = f;
  const m = look({ stone: StoneBricks, base: Basalt, roof: SLATE, floor: Cobblestone, post: OakLog, fire: Magma }), top = u => 5 + du + 1 - u, BEAM = 4, STACK = 24, v0 = dv - 4;
  plot(b.x, y, b.z, hw, hd, m.floor, set);
  // heavy walls round the forge at the back; to the front, a working bay open on three sides under one great lean-to roof
  for (let u = -du; u <= du; u++) for (const v of [-dv, dv]) {
    const pier = u === du || u === -1, shut = u < -1;
    for (let dy = 0; dy < top(u); dy++) put(u, dy, v, shut || pier || dy > BEAM ? (dy ? m.stone : m.base) : dy === BEAM ? m.post : Air);
  }
  for (let v = -dv; v <= dv; v++) {
    for (let dy = 0; dy < top(-du); dy++) put(-du, dy, v, dy ? m.stone : m.base);
    for (let dy = Math.abs(v) < dv ? 0 : BEAM; dy < top(du); dy++) put(du, dy, v, dy < BEAM ? Air : dy === BEAM ? m.post : m.stone);
  }
  for (let u = 1 - du; u < du; u++) fill(u, u, 0, top(u) - 1, 1 - dv, dv - 1, Air);
  for (let u = du + 1; u >= -du - 1; u--) fill(u, u, top(u), top(u), -dv - 1, dv + 1, u === -du - 1 ? m.roof.ridge : f.stair(m.roof, -1, 0));
  // the stack: wider than a house door, glowing at the throat and through the cracks in its face
  for (let dy = 0; dy < STACK; dy++) {
    const inset = dy > 18 ? 1 : 0;
    fill(-du - 1, 1 - du, dy, dy, v0 + inset, dv - inset, dy < 2 ? Blackstone : m.stone);
  }
  for (let dy = top(1 - du) + 1; dy < STACK; dy++) if (hash3(b.x, dy, b.z) < 0.7) put(1 - du, dy, v0 + 2, m.fire);
  fill(-du - 2, 2 - du, STACK, STACK, v0, dv, m.stone); fill(-du - 1, 1 - du, STACK, STACK, v0 + 1, dv - 1, m.fire);
  for (const [u, v] of [[-du - 2, v0], [-du - 2, dv], [2 - du, v0], [2 - du, dv]]) fill(u, u, STACK + 1, STACK + 2, v, v, m.stone);
  // the hearth in the foot of the stack, under a hood
  fill(1 - du, 1 - du, 0, 1, v0 + 1, dv - 1, Air); fill(1 - du, 1 - du, 0, 0, v0 + 1, dv - 1, m.fire); fill(-du, -du, 1, 1, v0 + 1, dv - 1, m.fire);
  // anvil on its stump, quench trough on the open side, racks on the other
  put(0, 0, 2, Blackstone); fill(-1, 1, 1, 1, 2, 2, Obsidian);
  const end = du - 1;
  fill(-1, end, 0, 0, -dv - 1, 1 - dv, Cobblestone); fill(0, end - 1, 0, 0, -dv, -dv, Water);
  fill(-1, end, -1, -1, -dv - 1, -dv - 1, Cobblestone);
  fill(0, du - 1, 0, 2, dv, dv, Fence); put(du - 1, BEAM - 1, dv - 1, Lantern); put(0, BEAM - 1, 1 - dv, Lantern);
  put(1 - du, 0, 2 - dv, IronOre); fill(1 - du, 1 - du, 0, 1, 1 - dv, 1 - dv, CoalOre); put(1 - du, 2, 1 - dv, Lantern);
  hangLamp(f, 0, 0, top(0) - 1, top(0) - 2);
  // the sign: an anvil, big enough to read from down the street
  fill(du - 1, du - 1, top(du - 1), 10, dv, dv, m.post);
  sign(f, du, 9, dv, ['AAA', 'PAP', 'AAA'], { A: Obsidian, P: Planks });
  fill(du + 1, du + 1, -1, -1, -1, 1, Cobblestone);
}

// All height: the lot is seven wide, so everything here goes up. The tower stands over the door if the street reaches the end of the nave;
// a door on the side leaves it at the south end, because the nave always runs north and south along the lot.
function church(b, y, raw) {
  const set = aged(raw), door = b.door || 's', hw = 3, hd = 6, NAVE = 14, BASE = NAVE + 4, TOWER = 30, side = door === 'e' ? 1 : door === 'w' ? -1 : 0, end = door === 'n' ? -1 : 1;
  const f = frame({ x: b.x, z: b.z, door: end > 0 ? 's' : 'n' }, y, hw, hd, set), { put, fill } = f, tz = b.z + end * 4; // here u runs from the altar to the tower
  const m = look({ stone: StoneBricks, wall: StoneBricks, base: Pearlstone, beam: OakLog, roof: SLATE, floor: Pearlstone, trim: Pearlstone });
  const ROSE = ['  TGT  ', ' GMTMG ', 'TMGTGMT', 'GTTMTTG', 'TMGTGMT', ' GMTMG ', '  TGT  '], rose = { T: m.trim, G: Glass, M: ManaCrystal };
  plot(b.x, y, b.z, hw, hd, m.floor, set);
  storey(b.x, y, b.z, hw, hd, NAVE, { wall: m.wall, post: m.wall, plinth: m.base, pane: (run, dy, ex) => ex && end * run < 2 && (end * run + 35) % 3 !== 0 && dy > 1 && dy < NAVE - 2 }, set);
  steepRoof(b.x, y + NAVE, b.z - end * 2, hw, 4, 2, { roof: m.roof, gable: m.wall }, set);
  cone(b.x, y + NAVE + 8, b.z - end * 2, 1, 7, m.roof, set); // a fleche on the ridge
  for (const v of [-4, 4]) for (const u of [-5, -2, 1]) if (!(u === 1 && v * side > 0)) buttress(f, u, v, NAVE - 3, m);
  mural(ROSE, 12, rose, (v, dy, id) => put(-6, dy, v, id));
  // the tower: broad to the nave's eaves, then a shaft with an open belfry, then the spire
  fill(2, 2, 0, BASE - 1, -hw, hw, m.wall); fill(2, 2, 0, 3, -1, 1, Air); put(2, 4, 0, Air);
  storey(b.x, y + NAVE, tz, hw, 2, 4, { wall: m.wall, post: m.wall, pane: () => false }, set);
  storey(b.x, y + BASE, tz, 2, 2, TOWER - BASE, { wall: m.wall, post: m.trim, pane: () => false }, set);
  fill(3, 5, NAVE - 1, NAVE - 1, -2, 2, m.beam); put(4, NAVE - 1, 0, Air);
  for (const sv of [-3, 3]) for (const u of [2, 6]) { fill(u, u, BASE, BASE + 1, sv, sv, m.trim); put(u, BASE + 2, sv, Lantern); }
  mural(ROSE, 12, rose, (v, dy, id) => put(6, dy, v, id));
  const OPEN = TOWER - 7;
  for (const u of [2, 6]) fill(u, u, OPEN, OPEN + 4, -1, 1, Air);
  fill(3, 5, OPEN, OPEN + 4, -2, -2, Air); fill(3, 5, OPEN, OPEN + 4, 2, 2, Air);
  fill(3, 5, OPEN + 4, OPEN + 4, 0, 0, m.beam); fill(4, 4, OPEN + 1, OPEN + 1, -1, 1, Terracotta); fill(3, 5, OPEN + 1, OPEN + 1, 0, 0, Terracotta); fill(4, 4, OPEN + 2, OPEN + 3, 0, 0, Terracotta); // the bell
  for (const sv of [-2, 2]) for (const u of [2, 6]) { put(u, TOWER, sv, m.trim); put(u, TOWER + 1, sv, Lantern); }
  cone(b.x, y + TOWER, tz, 2.6, 18, m.roof, set);
  set(b.x, y + TOWER + 18, tz, m.trim); set(b.x, y + TOWER + 19, tz, ManaCrystal);
  // the door
  const arch = { T: m.trim, A: Air };
  if (side) { mural(ARCH, 5, arch, (u, dy, id) => put(u, dy, side * hw, id)); fill(-1, 1, -1, -1, side * (hw + 1), side * (hw + 1), Cobblestone); }
  else { mural(ARCH, 5, arch, (v, dy, id) => put(6, dy, v, id)); fill(7, 7, -1, -1, -1, 1, Cobblestone); }
  // the nave: an aisle to the altar between the pews, lamps on long chains, a crystal on the altar under the rose
  fill(-4, 5, 0, 0, 0, 0, RedCarpet);
  for (const u of [-4, -3, -2]) for (const v of [-2, -1, 1, 2]) put(u, 0, v, PlankSlab);
  fill(-5, -5, 0, 0, -2, 2, m.trim); put(-5, 1, 0, ManaCrystal); put(-5, 1, -2, Torch); put(-5, 1, 2, Torch);
  for (const u of [-3, 0]) hangLamp(f, u, 0, NAVE + 5, 7);
  for (const u of [-5, -2, 1]) for (const v of [-hw, hw]) if (!(u === 1 && v * side > 0)) put(u, 6, v, Lantern);
  hangLamp(f, 4, 0, NAVE - 2, 5);
}

// The heart of a kingdom: a curtain wall with a tower on each corner, a gatehouse between two drums, a courtyard,
// and a great hall with the throne at its far end, under a donjon you can see from the next realm.
function keep(b, y, raw) {
  const set = aged(raw), R = 13, x = b.x, z = b.z, TOP = 9, HALL_W = 6, HALL_D = 8, HALL_H = 9, GATE = 17, DONJON = 36, MID = z - 5, THRONE = z - 7;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    foundation(set, x + dx, y - 1, z + dz, StoneBricks);
    set(x + dx, y - 1, z + dz, StoneBricks);
    if (Math.max(Math.abs(dx), Math.abs(dz)) < R) continue;
    for (let dy = 0; dy < TOP; dy++) set(x + dx, y + dy, z + dz, dy > 3 && dy < 7 && !((dx + dz + 64) % 4) ? Air : StoneBricks); // arrow slits
    if ((dx + dz) & 1) set(x + dx, y + TOP, z + dz, StoneBricks);
  }
  for (const ox of [-R, R]) for (const oz of [-R, R]) { tower(x + ox, y, z + oz, 3, 18, set); flag(x + ox, y + 29, z + oz, 4, 0, oz < 0 ? 1 : -1, set); }
  // the gatehouse faces south, up the avenue from the south gate: a block of stone over a portcullis, a drum tower either side
  for (const s of [-1, 1]) { tower(x + s * 6, y, z + R, 3, GATE + 3, set); flag(x + s * 6, y + GATE + 14, z + R, 4, s, 0, set); }
  for (let dx = -3; dx <= 3; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < GATE; dy++) {
    const way = Math.abs(dx) < 3 && dy < 6, teeth = !dz && (dy === 5 || (dy === 4 && !(dx & 1)));
    set(x + dx, y + dy, z + R + dz, !way || (dy === 5 && dz) ? StoneBricks : teeth ? Fence : Air);
  }
  for (let dx = -3; dx <= 3; dx++) { if (dx & 1) set(x + dx, y + GATE, z + R + 1, StoneBricks); set(x + dx, y + GATE - 1, z + R + 2, StoneSlab); }
  for (const dx of [-2, 2]) { for (let dy = 7; dy < GATE - 1; dy++) set(x + dx, y + dy, z + R + 2, RoyalBanner); set(x + dx, y + 3, z + R + 2, Lantern); }
  mural(['BBB', 'BMB', 'BBB', ' B '], 13, { B: RoyalBanner, M: ManaCrystal }, (k, dy, id) => set(x + k, y + dy, z + R + 2, id));
  // the great hall: a door three wide, a carpet from the throne to the gate
  building(x, y, z - 1, set, { hw: HALL_W, hd: HALL_D, h: HALL_H, wall: StoneBricks, corner: StoneBricks, roof: SLATE, floor: Planks, windows: 1, door: 's', gable: StoneBricks });
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 4; dy++) set(x + dx, y + dy, z - 1 + HALL_D, dx && dy === 3 ? StoneBricks : Air);
  for (let at = THRONE + 1; at <= z + R + 1; at++) set(x, y, at, RedCarpet);
  for (const dz of [-5, -1, 3]) for (const dx of [-3, 3]) { for (let dy = 0; dy < HALL_H - 2; dy++) set(x + dx, y + dy, z - 1 + dz, dy === 3 ? Lantern : StoneBricks); }
  for (const dz of [-3, 1, 5]) for (const dx of [-HALL_W, HALL_W]) for (let dy = 3; dy < HALL_H - 1; dy++) set(x + dx, y + dy, z - 1 + dz, Glass);
  for (let dx = -2; dx <= 2; dx++) for (let at = THRONE - 1; at <= THRONE; at++) set(x + dx, y, at, StoneBricks); // the dais
  set(x, y + 1, THRONE, RedWool);
  for (let dy = 1; dy < 5; dy++) set(x, y + dy, THRONE - 1, Pearlstone);
  set(x, y + 5, THRONE - 1, ManaCrystal);
  for (const dx of [-2, 2]) for (let dy = 1; dy < HALL_H - 1; dy++) set(x + dx, y + dy, THRONE - 1, dy === 4 ? Lantern : RoyalBanner);
  // over the throne the hall just keeps going up: the donjon is a shaft of daylight inside a tower that shows from the next realm
  storey(x, y + HALL_H, MID, 5, 5, DONJON - HALL_H, { wall: StoneBricks, post: StoneBricks, pane: (run, dy) => !((run + 64) % 4) && dy % 6 > 1 && dy % 6 < 5 }, set);
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) if (Math.abs(dx) === 5 || Math.abs(dz) === 5) { set(x + dx, y + DONJON, MID + dz, StoneBricks); if ((dx + dz) & 1) set(x + dx, y + DONJON + 1, MID + dz, StoneBricks); }
  hipped(x, y + DONJON, MID, 4, 4, 2, SLATE, set);
  for (const [sx, sz] of DIAGONALS) { drum(x + sx * 5, y + DONJON - 6, MID + sz * 5, 2, 9, { wall: StoneBricks }, set); cone(x + sx * 5, y + DONJON + 3, MID + sz * 5, 2, 9, SLATE, set); set(x + sx * 5, y + DONJON + 2, MID + sz * 5, Lantern); }
  flag(x, y + DONJON + 9, MID, 8, 1, 0, set, 6, 4);
  for (const dy of [14, 22, 30]) for (const dx of [-3, 0, 3]) { set(x + dx, y + dy, MID - 4, Lantern); set(x + dx, y + dy, MID + 4, Lantern); }
  for (const dx of [-3, 3]) for (let dy = HALL_H + 8; dy < DONJON - 2; dy++) set(x + dx, y + dy, MID + 6, RoyalBanner);
  for (const dx of [-8, 8]) { set(x + dx, y, z + 9, Barrel); set(x + dx, y, z - 9, HayBale); }
  for (const dx of [-3, 3]) for (const at of [z + 8, z + 11]) { set(x + dx, y, at, Fence); set(x + dx, y + 1, at, Fence); set(x + dx, y + 2, at, Lantern); } // lamps up the courtyard
}
function tower(x, y, z, rad, tall, set, open = 2) {
  const outer = rad * rad + 1;
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    const d = dx * dx + dz * dz, shell = d > outer - open * rad;
    if (d > outer) continue;
    foundation(set, x + dx, y - 1, z + dz, StoneBricks);
    for (let dy = 0; dy <= tall; dy++) set(x + dx, y + dy, z + dz, !shell ? (dy % 5 === 4 ? Planks : Air) : (!dx || !dz) && dy % 5 === 2 ? Air : StoneBricks); // slits at the quarters, a floor every five
    if (shell && (dx + dz) & 1) set(x + dx, y + tall + 1, z + dz, StoneBricks);
  }
  cone(x, y + tall + 2, z, rad, rad * 3, SLATE, set);
  set(x + rad, y + tall - 3, z, Glass);
  set(x, y + tall, z, Lantern);
}

// A hall the elves did not build so much as ask for: a pale living tree, hollow at the root, its leaves in tiers like a great pagoda hung with crystal.
function elfhall(b, y, set) {
  const R = 4, WALL = 7, TOP = 29, f = frame(b, y, 4, 4, set), { du, put, fill } = f;
  plot(b.x, y, b.z, 4, 4, Planks, set);
  drum(b.x, y, b.z, R, WALL, { wall: Elderwood, pane: (dx, dz, dy) => dy > 0 && dy < WALL - 1 && (dx + dz + 64) % 3 === 0 }, set);
  // roots flare from the wall on the diagonals, and the trunk they feed climbs through the roof, narrowing to a horn of crystal
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 7; k++) {
    const o = 4 - (k >> 2);
    set(b.x + sx * o, y + k, b.z + sz * 3, Elderwood); set(b.x + sx * 3, y + k, b.z + sz * o, Elderwood); if (k < 2) set(b.x + sx * o, y + k, b.z + sz * o, Elderwood);
  }
  for (let dy = WALL; dy < TOP; dy++) {
    const wide = dy < 13 ? 3 : dy < 20 ? 2 : dy < 25 ? 1 : 0;
    for (let dx = -wide; dx <= wide; dx++) for (let dz = -wide; dz <= wide; dz++) if (dx * dx + dz * dz <= wide * wide + 1) set(b.x + dx, y + dy, b.z + dz, Elderwood);
  }
  set(b.x, y + TOP, b.z, ManaCrystal); set(b.x, y + TOP + 1, b.z, ManaCrystal); set(b.x, y + TOP + 2, b.z, ManaCrystal);
  // the tiers fall away to their rims, and at the rim the leaves lift again, hung with vines and a crystal at each quarter
  const tier = (top, rad) => {
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > rad + 0.5) continue;
      const fall = Math.round(d / rad * 3), lift = d > rad - 0.6 ? 1 : 0, at = y + top - fall + lift;
      set(b.x + dx, at, b.z + dz, ElvenLeaves); set(b.x + dx, at - 1, b.z + dz, ElvenLeaves);
      if (d > 2 && hash3(b.x + dx, top, b.z + dz) < 0.22) { set(b.x + dx, at - 2, b.z + dz, GlowVine); set(b.x + dx, at - 3, b.z + dz, GlowVine); }
    }
    for (const [dx, dz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad]]) { set(b.x + dx, y + top - 3, b.z + dz, ManaCrystal); set(b.x + dx, y + top - 4, b.z + dz, Lantern); }
  };
  tier(11, 6); tier(16, 5); tier(21, 4); tier(25, 2);
  // the door, tall and narrow, framed in pearl
  fill(du, du, 0, 3, 0, 0, Air); fill(du + 1, du + 1, -1, -1, -1, 1, Pearlstone);
  for (const v of [-1, 1]) { fill(du, du, 0, 3, v, v, Pearlstone); put(du, 4, v, ManaCrystal); } put(du, 4, 0, Pearlstone);
  // a ceiling of beams, pillars with crystal hearts, a lit floor round the walls, a dais at the far end
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (dx * dx + dz * dz <= 17) set(b.x + dx, y + WALL, b.z + dz, (dx + dz) & 1 ? Elderwood : Planks);
  for (const u of [-2, 2]) for (const v of [-2, 2]) { fill(u, u, 0, WALL - 1, v, v, Elderwood); put(u, 3, v, ManaCrystal); }
  for (const [u, v] of [[3, 1], [3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]]) put(u, 0, v, Glowshroom);
  fill(-3, -3, -1, -1, -2, 2, Pearlstone); put(-3, 0, 0, Pearlstone); put(-3, 1, 0, ManaCrystal); put(-3, 0, -1, Bookshelf); put(-3, 1, -1, Bookshelf); put(-3, 0, 1, Bookshelf); put(-3, 1, 1, Bookshelf);
  for (const s of [-1, 1]) { put(0, 5, s * 3, GlowVine); put(0, 6, s * 3, Lantern); put(-1, 6, s * 2, Lantern); }
}

// An A-frame raised round the bones of something the hunters would rather you asked them about: tusks at the door, ribs up the thatch, the thunderbird behind.
function lodge(b, y, set) {
  const f = frame(b, y, 3, 3, set), { put, fill, du, dv } = f, WALL = 2, RIDGE = WALL - 1 + 8;
  plot(b.x, y, b.z, 3, 3, RedClay, set);
  storey(b.x, y, b.z, 3, 3, WALL, { wall: OakLog, post: TribalTotem, pane: () => false }, set);
  steepRoof(b.x, y + WALL - 1, b.z, 3, 3, 2, { roof: THATCH, gable: Planks }, set, !!f.fx);
  for (const u of [-2, 0, 2]) for (let off = 0; off <= 4; off++) for (const s of off ? [-1, 1] : [1]) for (let i = 0; i < 2; i++) put(u, RIDGE - off * 2 + i, s * off, BoneBlock); // the ribs
  for (const u of [-du - 1, du + 1]) for (const s of [-1, 1]) mural(['B ', 'B ', 'BB', ' B'], RIDGE + 3, { B: BoneBlock }, (k, dy, id) => put(u, dy, s * (k + 2), id)); // horns at the peak
  // a skull on the gable over a door framed in tusks
  fill(du, du, 0, 2, -1, 1, Air); put(du, 3, 0, Air); fill(du + 1, du + 1, -1, -1, -1, 1, RedClay);
  mural(['  B B  ', ' B   B ', 'B     B', 'B     B', 'B     B', 'B     B'], 5, { B: BoneBlock }, (v, dy, id) => put(du + 1, dy, v, id));
  mural(SKULL, 8, { B: BoneBlock, R: RedWool }, (v, dy, id) => put(du, dy, v, id));
  // the thunderbird on its mast, wings spread above the ridge
  const MAST = -du - 1;
  fill(MAST, MAST, 0, 13, 0, 0, TribalTotem);
  mural(['    H    ', 'O   T   O', 'OO  T  OO', 'ROOOTOOOR', 'R  RTR  R', '    T    '], 16, { H: BoneBlock, O: OakLog, T: TribalTotem, R: RedWool }, (v, dy, id) => put(MAST, dy, v, id));
  put(MAST, 17, 0, Torch);
  for (const u of [-du, du]) for (const v of [-dv, dv]) { fill(u, u, WALL, 4, v, v, TribalTotem); put(u, 5, v, Torch); }
  // inside: hides on the floor, a fire at the back, benches and drums round the walls, trophies over them
  fill(1, du - 1, 0, 0, 0, 0, RedCarpet); fill(-1, 1, 0, 0, -1, 1, RedCarpet);
  put(-2, 0, 0, Magma); put(-2, 0, -1, Cobblestone); put(-2, 0, 1, Cobblestone);
  for (const s of [-1, 1]) { fill(-1, 1, 0, 0, s * 2, s * 2, HayBale); put(-2, 0, s * 2, Barrel); put(2, 0, s * 2, Barrel); put(2, 1, s * 2, Lantern); }
  mural(['B B', ' B '], 4, { B: BoneBlock }, (v, dy, id) => put(-du, dy, v, id));
  hangLamp(f, 0, 0, 8, 4);
}

// The great tent at the heart of a beast town: steep as a tipi, banded in hide, its poles crossing over the smoke hole and a totem on every corner.
function chief(b, y, set) {
  const R = 4, f = frame(b, y, 4, 4, set), { du, put, fill } = f, WALL = 4, RISE = 17;
  plot(b.x, y, b.z, 4, 4, RedClay, set);
  drum(b.x, y, b.z, R, WALL, { wall: OakLog, pane: () => false }, set);
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { const d = dx * dx + dz * dz; if (d > 10 && d <= 17) set(b.x + dx, y + 2, b.z + dz, Planks); }
  for (let k = 0; k < RISE; k++) {
    const rr = (R + 1) * (1 - k / RISE) + 0.4, reach = Math.ceil(rr);
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= rr && d >= rr - 1.6) set(b.x + dx, y + WALL + k, b.z + dz, k % 6 === 3 ? RedWool : k % 6 === 4 ? BoneBlock : Thatch);
    }
  }
  for (const [px, pz] of DIAGONALS) for (let k = 0; k < 9; k++) set(b.x + px * (k >> 1), y + WALL + RISE - 4 + k, b.z + pz * ((k + 1) >> 1), OakLog);
  // a door framed in tusks, the skull of the last thing that argued over it, and the corner totems taller than the eaves
  fill(du, du, 0, 2, -1, 1, Air); fill(du + 1, du + 1, -1, -1, -1, 1, RedClay);
  mural([' BB BB ', 'B     B', 'B     B', 'B     B', 'B     B', 'B     B'], 5, { B: BoneBlock }, (v, dy, id) => put(du + 1, dy, v, id));
  mural(SKULL, 10, { B: BoneBlock, R: RedWool }, (v, dy, id) => put(du + 1 - 2, dy, v, id));
  for (const [sx, sz] of DIAGONALS) {
    const px = b.x + sx * R, pz = b.z + sz * R;
    for (let i = 0; i < 11; i++) set(px, y + i, pz, i % 3 === 2 ? BoneBlock : TribalTotem);
    set(px + sx, y + 8, pz, OakLog); set(px, y + 8, pz + sz, OakLog); set(px + sx, y + 9, pz, RedWool); set(px, y + 9, pz + sz, RedWool); set(px, y + 11, pz, Lantern);
  }
  // inside: hides underfoot, fires in bowls, the chief's seat at the far end
  fill(1, du - 1, 0, 0, 0, 0, RedCarpet); fill(-1, 1, 0, 0, -1, 1, RedCarpet);
  for (const s of [-1, 1]) { put(0, 0, s * 3, Cobblestone); put(0, 1, s * 3, Magma); put(2, 0, s * 3, Barrel); put(-2, 0, s * 3, Barrel); put(-2, 1, s * 3, Lantern); }
  put(-3, 0, 0, BoneBlock); put(-3, 1, 0, RedWool); fill(-3, -3, 0, 2, -1, -1, BoneBlock); fill(-3, -3, 0, 2, 1, 1, BoneBlock); fill(-4, -4, 2, 3, -1, 1, BoneBlock); put(-3, 3, 0, Lantern);
  hangLamp(f, 0, 0, 12, 5);
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
  guild,
  hospital,
  inn,
  smithy,
  elfhall,
  lodge,
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
  chief,
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

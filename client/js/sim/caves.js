// The deep: colossal halls, tunnels, squeezes, ravines, lakes and the burning sea below them. The techniques are Minecraft's, the scale is ours.
// Three kinds of cave are added together as one field that is positive where the rock is gone, read on a coarse lattice and blended,
// because most of a chunk is nowhere near a cave. What is near the edge of that field is the shell, and the cave's biome paints it.
// `world` says what this needs of the land: { sea, height, biomeAt(x, z), steepAt(x, z), surfaceAt(x, z) }. A chunk's columns are land.js's `cols`.
//
// All of it is built to what the hero can do: step up one block, fall five unhurt, and fall any distance into water. A floor is a smooth height with no
// noise on it, so its steps are one block. Tunnels stay near level, as Minecraft's 2D spaghetti does. And the Old Ways run through everything, so that
// a player who wants the deep can always walk there, and walk home.
import { BL, ID } from './blocks.js';
import { NZ, hash2, hash3, mulberry, ss } from './noise.js';

const {
  Air, Water, Stone, Deepstone, Magma, Bedrock, Ice, Snow, Moss, GlowMoss, Mycelium, Basalt, Blackstone, Marble, PolishedMarble, GildedMarble, MarblePillar, Limestone, AmethystBlock, ManaCrystal, ManaShard, ManaCluster,
  CrystalCluster, BlueIce, MushroomStem, MushroomCap, Glowshroom, RedMushroom, HangingRoots, GlowVine, Stalactite, Stalagmite, Fern, TallGrass, FaeBloom, Lantern, MossyCobblestone, Gravel,
  Planks, OakLog, Fence, RopeLadder, Chest, Cobblestone,
  CoalOre, IronOre, ManaOre, CopperOre, SilverOre, GoldOre, MithrilOre, AdamantOre, RubyOre, SapphireOre, EmeraldOre,
} = ID;

const CS = 16, LAYER = CS * CS, CELL = 4, N = CS / CELL + 1;
const at = (i, j, k) => i + j * N + k * N * N;
const idx = (x, y, z) => x + z * CS + y * LAYER;

// ---------- the three sizes, and how they are kept apart ----------
const DEEPSTONE_AT = 50, DEEP_WOBBLE = 5;
const LAVA_LEVEL = 12;       // all open space below this is the burning sea
const ROOF = 7, TOWN_ROOF = 26, HALL_ROOF = 14; // rock always left under the ground, a town and a hall's own vault
const SHELL = 1.6;           // how far into the rock a cave's biome reaches, in units of the field
const BIOME_TOP = 84;        // above this a cave is plain rock and ore: a biome is a thing you go down to find
// Colossal: a slow regional mask says where a hall may be, and inside it the floor and vault are a lens that closes at the mask's edge.
const HALL_SIZE = 250, HALL_DETAIL = 97, HALL_FROM = 0.28, HALL_FULL = 0.56, HALL_MID = 46, HALL_DRIFT = 10, HALL_UP = 58, HALL_DOWN = 16;
const PILLAR_SIZE = 36, PILLAR_FROM = 0.5, PILLAR_THIN = 0.6, PILLAR_FLARE = 0.3;
// Normal: Minecraft's 2D spaghetti. A tunnel is where a 2D noise crosses zero, at a height that drifts slowly with the land, so it winds and rises but cannot get steep.
// Three layers lie one over another. The lower two sink to meet a hall's floor as they near it, so that a tunnel walks out into a hall, not out of its wall, and the top one fades out.
// Floors are flat from side to side and roofs arch over them: clear ground, with the rough stuff overhead.
const TUNNELS = [{ at: 100, vary: 8, salt: 0, fades: true }, { at: 78, vary: 9, salt: 37 }, { at: 58, vary: 7, salt: 81 }];
const TUNNEL_MEET = 78, TUNNEL_SIZE = 74, TUNNEL_BEND = 29, TUNNEL_THIN = 0.07, TUNNEL_WIDE = 0.22, TUNNEL_LOW = 4, TUNNEL_HIGH = 10, TUNNEL_EDGE = 20;
// Tight: a true 3D thread, where two noises both cross zero, gated into patches, and mostly high up where a player first goes looking. These are the side trips.
const THREAD_SIZE = 26, THREAD_WIDTH = 0.1, THREAD_DEPTH = 70;

const hallMask = (x, z) => NZ.HALL(x / HALL_SIZE, z / HALL_SIZE) + 0.3 * NZ.HALL(x / HALL_DETAIL + 40, z / HALL_DETAIL - 13);
export function hallAt(x, z) {
  const m = ss(HALL_FROM, HALL_FULL, hallMask(x, z));
  if (m <= 0) return null;
  const mid = HALL_MID + HALL_DRIFT * NZ.LEVEL(x / 210, z / 210), bump = 4 * NZ.LEVEL(x / 31 + 9, z / 31);
  return { m, floor: mid - HALL_DOWN * Math.sqrt(m) + bump, ceil: mid + HALL_UP * m ** 0.7 * (0.82 + 0.18 * NZ.LEVEL(x / 67, z / 67 + 5)) };
}
// How high a layer of tunnels runs here. Three things bend it, and none of them quickly enough to make a slope the hero cannot walk: every so often the layers drift
// to one height, which is where a player can change from one to another; the top layer climbs to the ground in places, as Minecraft's cave entrances do; and the lower two sink to a hall's floor.
function tunnelLevel(layer, x, z, ground) {
  const meet = ss(0.1, 0.6, NZ.LEVEL(x / 220 + 200, z / 220 - 200)), own = layer.at + layer.vary * NZ.LEVEL(x / 140 + layer.salt, z / 140 - layer.salt), base = own + (TUNNEL_MEET + 6 * NZ.LEVEL(x / 90 + 60, z / 90) - own) * meet;
  const pull = ss(-0.4, HALL_FROM + 0.1, hallMask(x, z));
  if (layer.fades) { const open = ss(0.1, 0.75, NZ.LEVEL(x / 170 - 300, z / 170 + 300)) * (1 - pull); return { pull, open, level: base + (ground + 2 - base) * open }; }
  return { pull, open: 0, level: base + (HALL_MID + HALL_DRIFT * NZ.LEVEL(x / 210, z / 210) - HALL_DOWN * 0.8 - base) * pull };
}
function tunnelsAt(x, z, ground) {
  const out = [];
  for (const layer of TUNNELS) {
    const { level, pull, open } = tunnelLevel(layer, x, z, ground), s = layer.salt, bend = NZ.RIBBON(x / TUNNEL_SIZE + s, z / TUNNEL_SIZE - s) + 0.3 * NZ.RIBBON(x / TUNNEL_BEND - s, z / TUNNEL_BEND + s);
    const fat = ss(-0.4, 0.5, NZ.RIBBON(x / 150 + s * 2, z / 150)), wide = (TUNNEL_THIN + (TUNNEL_WIDE - TUNNEL_THIN) * fat) * (layer.fades ? 1 - pull : 1);
    if (Math.abs(bend) > wide + 0.12) continue;
    const across = Math.min(1, Math.abs(bend) / Math.max(wide, 0.01));
    out.push({ open, edge: (wide - Math.abs(bend)) * TUNNEL_EDGE, floor: level, roof: level + (TUNNEL_LOW + (TUNNEL_HIGH - TUNNEL_LOW) * fat) * Math.sqrt(1 - across * across) + 1 });
  }
  return out;
}
function pillarAt(x, y, z, hall) {
  if (hall.m < PILLAR_FROM) return 0;
  const mid = (hall.floor + hall.ceil) / 2, reach = (hall.ceil - hall.floor) / 2, wander = 0.16 * NZ.LEVEL(y / 44, x / 90); // they drift a little as they rise
  const flare = Math.abs(y - mid) / reach, stand = NZ.PILLAR(x / PILLAR_SIZE + wander, z / PILLAR_SIZE - wander);
  return (stand - (PILLAR_THIN - PILLAR_FLARE * flare ** 3)) * 7 * ss(PILLAR_FROM, 0.7, hall.m);
}
function fieldAt(x, y, z, h, hall, ceil, roof, tunnels) {
  if (y < 4 || y > roof + CELL) return -2;
  let v = -2;
  if (hall) {
    const inside = Math.min((y - hall.floor) / 6, (ceil - y) / 11);
    if (inside > -2) {
      const rough = (NZ.ROCK(x / 40, y / 30, z / 40) + 0.5 * NZ.GRIT(x / 15, y / 13, z / 15)) * ss(1, 15, y - hall.floor); // rough walls and vault, and a floor left clear to walk on
      v = Math.min(inside, 3) + rough * 0.75;
      if (v > 0) v -= Math.max(0, pillarAt(x, y, z, hall)) * 3;
    }
  }
  for (const t of tunnels) v = Math.max(v, Math.min(t.edge, (y - t.floor + 0.5) / 1.2, (t.roof + 2 * NZ.GRIT(x / 13, y / 9, z / 13) - y) / 1.2));
  const depth = h - y;
  if (depth < THREAD_DEPTH && NZ.GIRTH(x / 90 + 50, y / 60, z / 90) > 0.05) {
    const c = NZ.THREAD_A(x / THREAD_SIZE, y / THREAD_SIZE, z / THREAD_SIZE), e = NZ.THREAD_B(x / THREAD_SIZE, y / THREAD_SIZE, z / THREAD_SIZE);
    v = Math.max(v, (THREAD_WIDTH - Math.hypot(c, e)) * 16);
  }
  return Math.min(v, (roof - y) / 2); // the ground overhead has the last word
}
function fillField(cx, cz, cols, world, F) {
  const layers = Math.floor(world.height / CELL) + 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const wx = cx * CS + i * CELL, wz = cz * CS + j * CELL, col = Math.min(i * CELL, CS - 1) + Math.min(j * CELL, CS - 1) * CS, h = cols.h[col], hall = hallAt(wx, wz), tunnels = tunnelsAt(wx, wz, h);
    const entrance = tunnels.some(t => t.open > 0.25), roof = cols.town?.[col] ? h - TOWN_ROOF : h <= world.sea + 2 ? h - ROOF * 2 : entrance || world.steepAt(wx, wz) ? h + 3 : h - ROOF, ceil = hall ? Math.min(hall.ceil, h - HALL_ROOF) : 0;
    for (let k = 0; k < layers; k++) F[at(i, j, k)] = fieldAt(wx, k * CELL, wz, h, hall, ceil, roof, tunnels);
  }
  return layers;
}
const lerp = (a, b, t) => a + (b - a) * t;

// Carves what the field opens, and notes the rock just behind it. The field needs nothing from the chunks around it, so the shell has no seams.
function carve(d, F, layers, shell) {
  for (let k = 0; k < layers - 1; k++) for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const c = [F[at(i, j, k)], F[at(i + 1, j, k)], F[at(i, j + 1, k)], F[at(i + 1, j + 1, k)], F[at(i, j, k + 1)], F[at(i + 1, j, k + 1)], F[at(i, j + 1, k + 1)], F[at(i + 1, j + 1, k + 1)]];
    if (Math.max(...c) < -SHELL) continue;
    for (let dy = 0; dy < CELL; dy++) for (let dz = 0; dz < CELL; dz++) for (let dx = 0; dx < CELL; dx++) {
      const tx = dx / CELL, ty = dy / CELL, tz = dz / CELL, v = lerp(lerp(lerp(c[0], c[1], tx), lerp(c[2], c[3], tx), tz), lerp(lerp(c[4], c[5], tx), lerp(c[6], c[7], tx), tz), ty);
      const p = idx(i * CELL + dx, k * CELL + dy, j * CELL + dz);
      if (v > 0) { if (d[p] !== Bedrock) { d[p] = k * CELL + dy < LAVA_LEVEL ? Magma : Air; shell[p] = 2; } } else if (v > -SHELL) shell[p] = 1;
    }
  }
}

// ---------- ravines: a seeded worm walked from each patch of ground, the one thing that can open the land in the middle of a field ----------
const RAVINE_GRID = 96, RAVINE_CHANCE = 0.3, RAVINE_LONG = 240, RAVINE_POOL = 3, ravines = new Map();
function ravineOf(gx, gz, world) {
  const key = gx * 65536 + gz;
  if (ravines.has(key)) return ravines.get(key);
  const r = mulberry(hash2(gx * 17 + 5, gz * 31 + 9)), path = [];
  let level = 0;
  if (r() < RAVINE_CHANCE) {
    let x = (gx + r()) * RAVINE_GRID, z = (gz + r()) * RAVINE_GRID, turn = 0, yaw = r() * Math.PI * 2;
    const long = RAVINE_LONG * (0.5 + r() * 0.5), wide = 5 + r() * 7, deep = 26 + r() * 40;
    for (let s = 0; s < long; s += 2) {
      const t = s / long, swell = Math.sin(Math.PI * t);
      path.push({ x, z, wide: wide * swell ** 0.6 + 1 + 1.4 * Math.sin(s / 9), deep: deep * swell * swell }); // the floor rises to the ground at each end, gently enough to walk out
      turn = turn * 0.9 + (r() - 0.5) * 0.09; yaw += turn;
      x += Math.cos(yaw) * 2; z += Math.sin(yaw) * 2;
    }
    const mid = path[path.length >> 1];
    level = Math.round(world.surfaceAt(mid.x, mid.z) - deep + RAVINE_POOL); // a pool to land in
  }
  const ravine = { path, level, x0: Math.min(...path.map(p => p.x)) - 16, x1: Math.max(...path.map(p => p.x)) + 16, z0: Math.min(...path.map(p => p.z)) - 16, z1: Math.max(...path.map(p => p.z)) + 16 };
  ravines.set(key, ravine);
  return ravine;
}
function cutRavines(cx, cz, d, cols, world) {
  const bx = cx * CS, bz = cz * CS, floor = new Int16Array(LAYER).fill(9999), pool = new Int16Array(LAYER), reach = Math.ceil(RAVINE_LONG / RAVINE_GRID);
  let any = false;
  for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) { const ravine = ravineOf(Math.floor(bx / RAVINE_GRID) + a, Math.floor(bz / RAVINE_GRID) + b, world); for (const p of ravine.path) {
    if (p.x < bx - p.wide || p.x > bx + CS + p.wide || p.z < bz - p.wide || p.z > bz + CS + p.wide) continue;
    for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
      const off = Math.hypot(bx + x - p.x, bz + z - p.z) / p.wide;
      if (off < 1) { const col = x + z * CS, low = cols.h[col] - p.deep * (1 - off * off) - 3; if (low < floor[col]) { floor[col] = low; pool[col] = ravine.level; any = true; } }
    }
  } }
  if (!any) return;
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const col = x + z * CS, h = cols.h[col];
    if (floor[col] === 9999 || h <= world.sea + 3 || cols.town?.[col]) continue; // never through a seabed or a street
    for (let y = Math.max(LAVA_LEVEL, Math.floor(floor[col])); y <= h + 1; y++) d[idx(x, y, z)] = y <= pool[col] ? Water : Air;
  }
}

// Whether the ground here is gone: trees ask, because the land's height does not know about caves.
export function openGroundAt(x, z, ground, world) {
  if (tunnelsAt(x, z, ground).some(t => t.open > 0.25 && t.edge > -1)) return true;
  const reach = Math.ceil(RAVINE_LONG / RAVINE_GRID), gx = Math.floor(x / RAVINE_GRID), gz = Math.floor(z / RAVINE_GRID);
  for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
    const r = ravineOf(gx + a, gz + b, world);
    if (!r.path.length || x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    for (const p of r.path) if (Math.hypot(x - p.x, z - p.z) < p.wide + 1) return true;
  }
  return false;
}

// ---------- skylights: where the roof of a hall has fallen in, and daylight reaches the floor ----------
const SKY_GRID = 88;
function openSkylights(cx, cz, d, cols, world) {
  const bx = cx * CS, bz = cz * CS;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const gx = Math.floor(bx / SKY_GRID) + a, gz = Math.floor(bz / SKY_GRID) + b, roll = hash3(gx, 3, gz), sx = (gx + hash3(gx, 5, gz)) * SKY_GRID, sz = (gz + hash3(gx, 7, gz)) * SKY_GRID, hall = hallAt(sx, sz);
    if (roll > 0.6 || !hall || hall.m < 0.5 || world.biomeAt(sx, sz) !== 'verdant') continue;
    const wide = 4 + roll * 7;
    for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
      const off = Math.hypot(bx + x - sx, bz + z - sz) + 2.5 * NZ.LEVEL((bx + x) / 6, (bz + z) / 6), col = x + z * CS;
      if (off < wide && !cols.town?.[col]) for (let y = Math.floor(hall.ceil) - 12; y <= cols.h[col] + 1; y++) d[idx(x, y, z)] = Air;
    }
  }
}

// ---------- lakes: a basin scooped out of a hall's floor. Minecraft's aquifers give each cell a level and wall the cells off, which leaves flat slabs
// of rock standing in the middle of a hall, so here each lake has its own level, a shore where the floor rises past it, and a low rim where it does not ----------
const LAKE_GRID = 120, LAKE_CHANCE = 0.6, LAKE_FROM = 18, LAKE_WIDE = 34, LAKE_DEEP = 8, RIM = 9, LAKE_RAGGED = 7;
function lakeOf(gx, gz) {
  const roll = hash3(gx, 17, gz), x = (gx + 0.15 + 0.7 * hash3(gx, 11, gz)) * LAKE_GRID, z = (gz + 0.15 + 0.7 * hash3(gx, 13, gz)) * LAKE_GRID, hall = roll < LAKE_CHANCE ? hallAt(x, z) : null;
  return hall && hall.m > 0.6 ? { x, z, level: Math.round(hall.floor) + 2, reach: LAKE_FROM + LAKE_WIDE * hash3(gx, 19, gz) } : null;
}
function fillLakes(cx, cz, d, shell, world) {
  const bx = cx * CS, bz = cz * CS, gx = Math.floor(bx / LAKE_GRID), gz = Math.floor(bz / LAKE_GRID);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const lake = lakeOf(gx + a, gz + b);
    if (!lake) continue;
    const { x: lx, z: lz, level, reach } = lake;
    if (Math.hypot(bx + 8 - lx, bz + 8 - lz) > reach + 32) continue;
    for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
      const wx = bx + x, wz = bz + z, off = Math.hypot(wx - lx, wz - lz) + LAKE_RAGGED * NZ.LEVEL(wx / 17, wz / 17);
      if (off > reach + RIM) continue;
      if (off > reach) { // the bank falls away from the water a block at a time, so that it can be walked up, and is painted like the rock around it
        for (let y = level - LAKE_DEEP; y <= level + 1 - Math.floor(off - reach); y++) { const p = idx(x, y, z); if (d[p] === Air) { d[p] = y < DEEPSTONE_AT ? Deepstone : Stone; shell[p] = 1; } }
        continue;
      }
      if (d[idx(x, level + 1, z)] !== Air) continue; // the floor rises out of the water here: an island, or the shore
      const biome = world.biomeAt(wx, wz), liquid = biome === 'ember' ? Magma : Water, bed = level - Math.round(LAKE_DEEP * (1 - (off / reach) ** 2));
      for (let y = bed; y <= level; y++) d[idx(x, y, z)] = biome === 'frozen' && y === level ? Ice : liquid;
    }
  }
}

// ---------- cave biomes: what the shell is painted with, and what grows on it ----------
const near = (x, y, z, size) => NZ.PATCH(x / size, y / size, z / size);
const SHELLS = {
  crystal: (face, x, y, z) => { const p = near(x, y, z, 30); return p > 0.34 ? AmethystBlock : 0; }, // the rock stays dark, so that the crystal is what catches the eye
  fungal: (face, x, y, z) => (face === 'floor' ? Mycelium : near(x, y, z, 26) > 0.35 ? Mycelium : 0),
  verdant: (face, x, y, z) => (face === 'wall' ? (near(x, y, z, 20) > 0.3 ? MossyCobblestone : 0) : near(x, y, z, 20) > 0.25 ? GlowMoss : Moss),
  marble: (face, x, y, z) => (near(x, y, z, 34) > 0.52 ? GildedMarble : face === 'floor' ? PolishedMarble : Marble),
  drip: (face, x, y, z) => (face === 'floor' && near(x, y, z, 24) > 0.4 ? Gravel : Limestone),
  frozen: (face, x, y, z) => (face === 'floor' ? Snow : near(x, y, z, 28) > 0.35 ? Ice : BlueIce),
  ember: (face, x, y, z) => { const p = near(x, y, z, 22); return face === 'floor' ? (p > 0.38 ? Magma : p < -0.2 ? Blackstone : Basalt) : Basalt; },
};
// Formations are seeded by the world and not by a chunk, and stand on the hall's own floor and vault, which the field can say without looking at the
// neighbours. That lets them be far bigger than a chunk, and every chunk they touch draws its own part of them.
const FORM_GRID = 22, FORM_REACH = 12, FORM_CHANCE = 0.62;
function blade(put, x, y, z, up, tall, wide, leanX, leanZ, body, tip) {
  for (let k = 0; k < tall; k++) {
    const rad = wide * (1 - k / tall) ** 0.8, reach = Math.ceil(rad), py = y + up * k, px = x + Math.round(leanX * k / tall), pz = z + Math.round(leanZ * k / tall);
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) if (Math.abs(dx) + Math.abs(dz) <= rad + 0.2) put(px + dx, py, pz + dz, body);
  }
  if (tip) put(x + Math.round(leanX), y + up * tall, z + Math.round(leanZ), tip);
}
function giantMushroom(put, x, y, z, tall, wide) {
  for (let k = 0; k < tall; k++) { const girth = k < 3 ? 1.5 : 1, reach = Math.ceil(girth); for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) if (Math.abs(dx) + Math.abs(dz) <= girth) put(x + dx, y + k, z + dz, MushroomStem); }
  for (let k = 0; k < 5; k++) {
    const rad = wide * Math.sqrt(1 - (k / 5) ** 2), reach = Math.ceil(rad), hollow = k === 0 ? rad - 3 : 0;
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) { const r2 = dx * dx + dz * dz; if (r2 <= rad * rad && r2 >= hollow * hollow) put(x + dx, y + tall + k - 1, z + dz, MushroomCap); }
  }
}
function basaltStack(put, x, y, z, tall, roll) {
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dz) > 3) continue;
    const top = Math.round(tall * (0.55 + 0.45 * hash3(x + dx, 41, z + dz + roll)));
    for (let k = 0; k < top; k++) put(x + dx, y + k, z + dz, Basalt);
  }
}
const FORMS = {
  crystal(put, s) {
    const body = s.roll < 0.7 ? ManaCrystal : AmethystBlock;
    if (s.up) blade(put, s.x, s.floor, s.z, 1, Math.round(s.span * (0.3 + 0.42 * s.roll2)), 3 + 3.4 * s.roll3, s.leanX, s.leanZ, body, body === ManaCrystal ? ManaShard : 0);
    else blade(put, s.x, s.ceil, s.z, -1, Math.round(s.span * (0.18 + 0.26 * s.roll2)), 2.4 + 3 * s.roll3, s.leanX, s.leanZ, body, 0);
  },
  fungal(put, s) { if (s.up) giantMushroom(put, s.x, s.floor, s.z, Math.round(10 + 24 * s.roll2), 6 + 6 * s.roll3); },
  drip(put, s) { blade(put, s.x, s.up ? s.floor : s.ceil, s.z, s.up ? 1 : -1, Math.round(s.span * (s.up ? 0.2 + 0.3 * s.roll2 : 0.2 + 0.36 * s.roll2)), 2.4 + 3.4 * s.roll3, 0, 0, Limestone, 0); },
  frozen(put, s) { blade(put, s.x, s.up ? s.floor : s.ceil, s.z, s.up ? 1 : -1, Math.round(s.span * (0.22 + 0.34 * s.roll2)), 2.6 + 3.2 * s.roll3, s.leanX, s.leanZ, s.roll < 0.3 ? Ice : BlueIce, 0); },
  ember(put, s) { if (s.up) basaltStack(put, s.x, s.floor, s.z, Math.round(10 + 34 * s.roll2), Math.floor(s.roll * 99)); },
};
function raiseForms(cx, cz, d, world) {
  const bx = cx * CS, bz = cz * CS;
  const put = (x, y, z, id) => { const lx = x - bx, lz = z - bz; if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 1 || y >= world.height) return; const p = idx(lx, y, lz); if (d[p] === Air || d[p] === Water) d[p] = id; };
  for (let gx = Math.floor((bx - FORM_REACH) / FORM_GRID); gx <= Math.floor((bx + CS + FORM_REACH) / FORM_GRID); gx++) for (let gz = Math.floor((bz - FORM_REACH) / FORM_GRID); gz <= Math.floor((bz + CS + FORM_REACH) / FORM_GRID); gz++) {
    if (hash3(gx, 23, gz) > FORM_CHANCE) continue;
    const x = Math.floor((gx + hash3(gx, 29, gz)) * FORM_GRID), z = Math.floor((gz + hash3(gx, 31, gz)) * FORM_GRID), hall = hallAt(x, z);
    if (!hall || hall.m < 0.3) continue;
    const form = FORMS[world.biomeAt(x, z)];
    if (form) form(put, { x, z, floor: Math.floor(hall.floor) - 5, ceil: Math.ceil(hall.ceil) + 5, span: hall.ceil - hall.floor, up: hash3(gx, 37, gz) < 0.62, roll: hash3(gx, 41, gz), roll2: hash3(gx, 43, gz), roll3: hash3(gx, 47, gz), leanX: Math.round(hash3(gx, 53, gz) * 10) - 5, leanZ: Math.round(hash3(gx, 59, gz) * 10) - 5 });
  }
}
function hang(d, x, y, z, block, length) { for (let k = 0; k < length; k++) { const p = idx(x, y - k, z); if (d[p] !== Air) return; d[p] = block; } }
const inside = (x, z, m) => x >= m && z >= m && x < CS - m && z < CS - m;
const GROW = {
  crystal(d, floor, x, y, z, roll, wx, wz) {
    if (floor) { if (roll < 0.075) d[idx(x, y + 1, z)] = hash3(wx, 2, wz) < 0.6 ? ManaCluster : CrystalCluster; }
    else if (roll < 0.03) d[idx(x, y - 1, z)] = ManaCluster;
  },
  fungal(d, floor, x, y, z, roll, wx, wz) {
    if (floor) { if (roll < 0.13) d[idx(x, y + 1, z)] = roll < 0.1 ? Glowshroom : RedMushroom; }
    else if (roll < 0.14) hang(d, x, y - 1, z, HangingRoots, 1 + Math.floor(hash3(wx, y, wz) * 5));
  },
  verdant(d, floor, x, y, z, roll, wx, wz) {
    if (floor) { if (roll < 0.34) d[idx(x, y + 1, z)] = roll < 0.05 ? FaeBloom : roll < 0.08 ? Glowshroom : roll < 0.16 ? Fern : TallGrass; }
    else if (roll < 0.22) hang(d, x, y - 1, z, roll < 0.11 ? GlowVine : HangingRoots, 2 + Math.floor(hash3(wx, y, wz) * 16));
  },
  drip(d, floor, x, y, z, roll) { if (roll < 0.1) d[idx(x, y + (floor ? 1 : -1), z)] = floor ? Stalagmite : Stalactite; },
  frozen() {},
  ember(d, floor, x, y, z, roll) {
    if (!floor && roll < 0.0005) for (let k = 1; k < 100; k++) { const p = idx(x, y - k, z); if (d[p] !== Air) break; d[p] = Magma; } // a slow fall of fire
  },
  marble() {},
};
// The hall of a lost age: the floor cut level, squared columns on a grid, and a lamp left burning on every fourth.
const COLONNADE = 14, TERRACE_REACH = 7;
function terrace(d, x, y, z, wx, wz) {
  const hall = hallAt(wx, wz);
  if (!hall || hall.m < 0.35) return y;
  const level = Math.round(hall.floor - 4 * NZ.LEVEL(wx / 31 + 9, wz / 31)); // the floor without its bumps: wide flat stages, a single step apart
  if (Math.abs(level - y) > TERRACE_REACH) return y;
  for (let k = y; k > level; k--) d[idx(x, k, z)] = Air;
  for (let k = y; k < level; k++) { const p = idx(x, k, z); if (d[p] === Air || d[p] === Water) d[p] = Marble; }
  d[idx(x, level, z)] = PolishedMarble;
  return level;
}
function colonnade(d, x, y, z, wx, wz) {
  if (((wx % COLONNADE) + COLONNADE) % COLONNADE || ((wz % COLONNADE) + COLONNADE) % COLONNADE || !inside(x, z, 1)) return;
  let top = y + 1;
  while (top < y + 110 && d[idx(x, top, z)] === Air) top++;
  if (top - y < 6) return;
  for (let k = y + 1; k < top; k++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const edge = Math.max(Math.abs(dx), Math.abs(dz)), rim = k < y + 3 || k > top - 3, p = idx(x + dx, k, z + dz);
    if (d[p] === Air && (rim || !edge)) d[p] = rim ? GildedMarble : MarblePillar;
  }
  if ((((wx / COLONNADE + wz / COLONNADE) % 2) + 2) % 2 === 0) for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const p = idx(x + dx, y + 9, z + dz); if (d[p] === Air) d[p] = Lantern; }
}
// Where a floor drops further than the hero can step, rock has fallen against the ledge: a ramp of it every few blocks, so that no drop is a trap.
// Each stands wholly inside its chunk. A ledge is rarely so short that none of its ramps do.
const RAMP_CHANCE = 0.3, TALLEST_LEDGE = 5;
function easeLedges(d, floors, bx, bz) {
  for (let i = 0; i < floors.length; i += 3) {
    const x = floors[i], y = floors[i + 1], z = floors[i + 2];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (hash3(bx + x, y + a * 3 + b * 7, bz + z) > RAMP_CHANCE || !inside(x + a, z + b, 0) || d[idx(x, y + 1, z)] !== Air) continue;
      let drop = 0;
      while (drop <= TALLEST_LEDGE && d[idx(x + a, y - drop, z + b)] === Air) drop++;
      if (drop < 2 || drop > TALLEST_LEDGE) continue;
      for (let k = 1; k < drop; k++) {
        const px = x + a * k, pz = z + b * k;
        if (!inside(px, pz, 0)) break;
        for (let h = y - drop + 1; h <= y - k; h++) { const p = idx(px, h, pz); if (d[p] === Air) d[p] = d[idx(x, y, z)]; }
      }
    }
  }
}
function paint(cx, cz, d, shell, cols, world) {
  const bx = cx * CS, bz = cz * CS, roofs = [], floors = [];
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = bx + x, wz = bz + z, biome = world.biomeAt(wx, wz), top = cols.h[x + z * CS] - 2, paintIt = SHELLS[biome];
    for (let y = 4; y < top; y++) {
      const p = idx(x, y, z);
      if (shell[p] !== 1 || (d[p] !== Stone && d[p] !== Deepstone)) continue;
      const above = d[p + LAYER], below = d[p - LAYER], face = above === Air ? 'floor' : below === Air ? 'roof' : 'wall';
      if (y < BIOME_TOP) d[p] = paintIt(face, wx, y, wz) || d[p];
      if (face === 'floor') floors.push(x, y, z); else if (face === 'roof') roofs.push(x, y, z);
    }
  }
  easeLedges(d, floors, bx, bz);
  for (const [list, isFloor] of [[floors, true], [roofs, false]]) for (let i = 0; i < list.length; i += 3) {
    const x = list[i], y = list[i + 1], z = list[i + 2], wx = bx + x, wz = bz + z, roll = hash3(wx, y, wz), biome = world.biomeAt(wx, wz);
    if (y < 6 || y >= BIOME_TOP) continue;
    GROW[biome](d, isFloor, x, y, z, roll, wx, wz);
    if (biome === 'marble' && isFloor) colonnade(d, x, terrace(d, x, y, z, wx, wz), z, wx, wz);
  }
}

// ---------- the Old Ways: what Minecraft's mineshafts are, grown into a network. Whoever built them is long gone, but the lamps still burn ----------
// A corridor is three wide and three tall with timber every four blocks. Where it meets open space it goes on as a trestle bridge, railed, on log legs, with a rope
// ladder down every so often. Nodes on a loose grid hold crossings, so any two corridors that share one join, and a road never climbs faster than the hero can.
// Inside a hall a node stands just above the floor, so the road comes down out of the wall and crosses the hall as a boardwalk. Some nodes run a ramp up to the surface,
// and two lamps either side of its mouth say what it is from a long way off.
const ROAD_GRID = 72, ROAD_CHANCE = 0.8, ROAD_STEEP = 0.85, BOARDWALK = 4, POST_EVERY = 4, LAMP_EVERY = 12, LEG_EVERY = 8, LADDER_EVERY = 16, LONGEST_LEG = 44;
const SHAFT_GAP = 10, ROAD_LANDING = 5; // a road runs level for this far either side of a crossing, or it would come up under the crossing's floor
const MOUTH_CHANCE = 0.45, MOUTH_SLOPE = 0.6, MOUTH_FAR = 170, nodes = new Map();
function roadNode(gx, gz, world) {
  const key = gx * 65536 + gz;
  if (nodes.has(key)) return nodes.get(key);
  const x = Math.floor((gx + 0.35 + 0.3 * hash3(gx, 61, gz)) * ROAD_GRID), z = Math.floor((gz + 0.35 + 0.3 * hash3(gx, 67, gz)) * ROAD_GRID), hall = hallAt(x, z), ground = world.surfaceAt(x, z);
  const layer = TUNNELS[1 + Math.floor(hash3(gx, 71, gz) * 2)]; // on the same levels as the tunnels, so that a road and a tunnel that cross can be walked from one to the other
  const node = { x, z, y: Math.min(hall && hall.m > 0.2 ? Math.round(hall.floor) + BOARDWALK : Math.round(tunnelLevel(layer, x, z, ground).level) + 1, ground - 12), gx, gz };
  if (hash3(gx, 73, gz) < MOUTH_CHANCE) { // a ramp to the open air, found by walking outward until the slope meets the ground
    const yaw = hash3(gx, 75, gz) * Math.PI * 2;
    let run = 40, top = ground;
    for (let i = 0; i < 4; i++) { top = world.surfaceAt(x + Math.cos(yaw) * run, z + Math.sin(yaw) * run); run = (top - node.y) / MOUTH_SLOPE; }
    if (run > 0 && run < MOUTH_FAR && top > world.sea + 2 && !world.keepOut?.(x + Math.cos(yaw) * run, z + Math.sin(yaw) * run)) node.mouth = { x: Math.round(x + Math.cos(yaw) * run), y: top + 1, z: Math.round(z + Math.sin(yaw) * run) };
  }
  nodes.set(key, node);
  return node;
}
function roadEdges(gx, gz, world) { // those that start at this node
  const a = roadNode(gx, gz, world), out = [];
  for (const [nx, nz, salt] of [[gx + 1, gz, 77], [gx, gz + 1, 79]]) {
    if (hash3(gx, salt, gz) > ROAD_CHANCE) continue;
    const b = roadNode(nx, nz, world);
    if (Math.abs(b.y - a.y) <= ROAD_STEEP * (Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z)) - 2 * ROAD_LANDING)) out.push([a, b]);
  }
  if (a.mouth) out.push([a, a.mouth]);
  return out;
}
function layCorridor(a, b, bx, bz, d, world) {
  const dx = b.x - a.x, dz = b.z - a.z, steps = Math.max(Math.abs(dx), Math.abs(dz)), alongX = Math.abs(dx) >= Math.abs(dz), height = world.height;
  const local = (x, y, z) => { const lx = x - bx, lz = z - bz; return lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < height ? idx(lx, y, lz) : -1; };
  const put = (x, y, z, id) => { const p = local(x, y, z); if (p >= 0 && d[p] !== Bedrock) d[p] = id; };
  const peek = (x, y, z) => { const p = local(x, y, z); return p >= 0 ? d[p] : -1; };
  const open = id => id === Air || id === Water || BL[id]?.passable;
  let lastShaft = -99;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, x = Math.round(a.x + dx * t), y = Math.round(a.y + (b.y - a.y) * Math.max(0, Math.min(1, (s - ROAD_LANDING) / (steps - 2 * ROAD_LANDING)))), z = Math.round(a.z + dz * t);
    if (x < bx - 6 || x > bx + CS + 5 || z < bz - 6 || z > bz + CS + 5) continue;
    const across = w => (alongX ? [x, z + w] : [x + w, z]), [mx, mz] = across(0), roofed = !open(peek(mx, y + 4, mz)) && peek(mx, y + 4, mz) !== -1, bridge = !roofed && open(peek(mx, y - 1, mz));
    for (let w = -1; w <= 1; w++) {
      const [cx, cz] = across(w);
      for (let k = 0; k < 3; k++) { const here = peek(cx, y + k, cz); if (here !== -1 && here !== Water) put(cx, y + k, cz, Air); }
      if (open(peek(cx, y - 1, cz))) put(cx, y - 1, cz, Planks);
    }
    // Where a road crosses over or under a tunnel, its builders cut a shaft down to it and hung a rope. That is what makes one road worth every tunnel near it.
    if (s - lastShaft > SHAFT_GAP && s > ROAD_LANDING && s < steps - ROAD_LANDING) {
      const ground = world.surfaceAt(mx, mz), meets = tunnelsAt(mx, mz, ground).find(c => c.edge > 0.6 && Math.abs(c.floor - y) > 2 && Math.abs(c.floor - y) < LONGEST_LEG);
      if (meets) {
        lastShaft = s;
        const [cx, cz] = across(1), from = Math.round(Math.min(meets.floor + 1, y - 1)), to = Math.round(Math.max(meets.floor, y));
        for (let k = from; k <= to; k++) if (peek(cx, k, cz) !== -1 && peek(cx, k, cz) !== Bedrock) put(cx, k, cz, RopeLadder);
      }
    }
    if (bridge) { // rails, legs and a way down
      const ladder = s % LADDER_EVERY === LADDER_EVERY >> 1;
      for (const w of [-2, 2]) {
        const [cx, cz] = across(w);
        if (ladder && w === 2) { let k = y; while (k > 4 && open(peek(cx, k, cz)) && y - k < LONGEST_LEG) { put(cx, k, cz, RopeLadder); k--; } continue; }
        if (open(peek(cx, y - 1, cz))) put(cx, y - 1, cz, Planks);
        put(cx, y, cz, Fence);
        if (s % LAMP_EVERY === 0) { put(cx, y + 1, cz, Fence); put(cx, y + 2, cz, Lantern); }
        if (s % LEG_EVERY === 0) { let k = y - 2; const low = y - LONGEST_LEG; while (k > low && open(peek(cx, k, cz))) k--; if (k > low) for (let j = k + 1; j < y - 1; j++) put(cx, j, cz, OakLog); }
      }
    } else if (s % POST_EVERY === 0) { // timber, let into the walls so that the way stays three wide
      for (const w of [-2, 2]) { const [cx, cz] = across(w); for (let k = 0; k < 3; k++) if (peek(cx, y + k, cz) !== Air) put(cx, y + k, cz, OakLog); }
      for (let w = -2; w <= 2; w++) { const [cx, cz] = across(w); if (peek(cx, y + 3, cz) !== Air) put(cx, y + 3, cz, Planks); }
      if (s % LAMP_EVERY === 0) put(mx, y + 2, mz, Lantern);
    }
  }
}
function layCrossing(n, bx, bz, d, world) {
  const put = (x, y, z, id) => { const lx = x - bx, lz = z - bz; if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < world.height) d[idx(lx, y, lz)] = id; };
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const corner = Math.abs(a) === 3 && Math.abs(b) === 3;
    for (let k = 0; k < 4; k++) put(n.x + a, n.y + k, n.z + b, corner ? OakLog : Air);
    put(n.x + a, n.y - 1, n.z + b, Planks);
  }
  put(n.x, n.y + 3, n.z, Lantern);
  if (hash3(n.gx, 83, n.gz) < 0.4) put(n.x + 2, n.y, n.z + 2, Chest);
}
function layMouth(m, bx, bz, d, world) {
  const put = (x, y, z, id) => { const lx = x - bx, lz = z - bz; if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < world.height) d[idx(lx, y, lz)] = id; };
  for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { const g = world.surfaceAt(m.x + a, m.z + b); for (let k = 1; k <= 4; k++) put(m.x + a, g + k, m.z + b, k === 4 ? Cobblestone : OakLog); put(m.x + a, g + 5, m.z + b, Lantern); }
}
function layOldWays(cx, cz, d, world) {
  const bx = cx * CS, bz = cz * CS, gx = Math.floor(bx / ROAD_GRID), gz = Math.floor(bz / ROAD_GRID);
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (const [p, q] of roadEdges(gx + a, gz + b, world)) {
    if (Math.max(p.x, q.x) < bx - 6 || Math.min(p.x, q.x) > bx + CS + 6 || Math.max(p.z, q.z) < bz - 6 || Math.min(p.z, q.z) > bz + CS + 6) continue;
    layCorridor(p, q, bx, bz, d, world);
  }
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const n = roadNode(gx + a, gz + b, world); layCrossing(n, bx, bz, d, world); if (n.mouth) layMouth(n.mouth, bx, bz, d, world); }
}

// ---------- ores: each by height, as a triangle around its best depth, with the rarest deepest ----------
const ORES = [
  { id: CoalOre, tries: 13, low: 40, best: 110, high: 200, size: 9 }, { id: CopperOre, tries: 8, low: 50, best: 90, high: 130, size: 10 }, { id: IronOre, tries: 8, low: 20, best: 70, high: 125, size: 8 },
  { id: SilverOre, tries: 4, low: 15, best: 50, high: 80, size: 6 }, { id: GoldOre, tries: 3, low: 10, best: 35, high: 70, size: 6 }, { id: ManaOre, tries: 3, low: 15, best: 60, high: 100, size: 4 },
  { id: MithrilOre, tries: 2, low: 5, best: 22, high: 45, size: 5 }, { id: AdamantOre, tries: 1, low: 3, best: 10, high: 25, size: 3 },
  { id: RubyOre, tries: 1, low: 5, best: 30, high: 55, size: 1 }, { id: SapphireOre, tries: 1, low: 5, best: 30, high: 55, size: 1 }, { id: EmeraldOre, tries: 1, low: 5, best: 30, high: 55, size: 1 },
];
function layOres(cx, cz, d) {
  const r = mulberry(hash2(cx * 11 + 7, cz * 23 + 3));
  for (const { id, tries, low, best, high, size } of ORES) for (let n = 0; n < tries; n++) {
    const pick = (r() + r()) / 2; // two dice make the triangle
    let x = Math.floor(r() * CS), z = Math.floor(r() * CS), y = Math.round(pick < 0.5 ? low + (best - low) * pick * 2 : best + (high - best) * (pick - 0.5) * 2);
    for (let i = 0; i < size; i++) {
      if (x >= 0 && z >= 0 && x < CS && z < CS) { const p = idx(x, y, z); if (d[p] === Stone || d[p] === Deepstone) d[p] = id; }
      const m = Math.floor(r() * 3), s = r() < 0.5 ? 1 : -1;
      if (m === 0) x += s; else if (m === 1) y += s; else z += s;
    }
  }
}

// ---------- the whole of it ----------
function layDeepstone(cx, cz, d) {
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const line = DEEPSTONE_AT + DEEP_WOBBLE * NZ.LEVEL((cx * CS + x) / 23, (cz * CS + z) / 23);
    for (let y = 1; y < line; y++) { const p = idx(x, y, z); if (d[p] === Stone) d[p] = Deepstone; }
  }
}
export function carveDeep(cx, cz, d, cols, world) {
  const F = new Float32Array(N * N * (Math.floor(world.height / CELL) + 1)), shell = new Uint8Array(d.length);
  layDeepstone(cx, cz, d);
  carve(d, F, fillField(cx, cz, cols, world, F), shell);
  cutRavines(cx, cz, d, cols, world);
  openSkylights(cx, cz, d, cols, world);
  fillLakes(cx, cz, d, shell, world);
  layOres(cx, cz, d);
  paint(cx, cz, d, shell, cols, world);
  raiseForms(cx, cz, d, world);
  layOldWays(cx, cz, d, world);
}
// What is cached belongs to one seed.
export function forgetCaves() { ravines.clear(); nodes.clear(); }
export const CAVE_BIOMES = ['crystal', 'fungal', 'verdant', 'marble', 'drip', 'frozen', 'ember'];
export const glowOf = id => BL[id]?.emit ?? 0;

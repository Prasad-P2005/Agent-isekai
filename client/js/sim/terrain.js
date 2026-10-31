// Terrain generation. The world layout (lands, settlements, buildings) comes from the server and the shape of the land from
// sim/land.js; this turns them into blocks deterministically, chunk by chunk.
import { ID } from './blocks.js';
import { carveDeep, forgetCaves, openGroundAt } from './caves.js';
import { acacia, baobab, birch, boulder, bush, cactus, deadTree, elfTree, fallenLog, giantMushroom, giantTree, greatOak, oak, palm, spruce } from './flora.js';
import { B, CROWN_TOP, CS, GORGE_FROM, H, LAND, LAVA_LEVEL, ROCK_LINE, SEA, SNOW_LINE, biomeAt, columnsOf, gorgeX, heightAt, inTown, lairAt, landOf, nearLair, onCrown, rollBiome, setLandData, settlement, slopeAt } from './land.js';
import { NZ, hash2, hash3, mulberry, noise3, ss } from './noise.js';
import { deckFor, lampsIn, layRoads, roadAt, roadsIn } from './roads.js';
import { crystals, demonCastle, hoard, magmaSpike, palace, raiseSight, reef, ruins, spire, hint } from './structures.js';
import { clearOfBuildings, townChunk } from './towns.js';

export { B, CS, H, LAND, REALM, SEA, TOWNS, biomeAt, chunkKey, climateAt, columnsOf, heightAt, inCity, inTown, lairAt, landName, landOf, nearLair, onCrown, settlement, settlements } from './land.js';
export { hintQueue } from './structures.js';

const {
  Air, Bedrock, Stone, Dirt, Sand, Sandstone, Gravel, Grass, FaeGrass, SavannaGrass, Moss, Snow, SnowLayer, Water, Magma, Blackstone, Basalt, AshenGround, RedClay, Terracotta, DarkTerracotta, Obsidian, BoneBlock,
  Planks, OakLog, Fence, Lantern, OakLeaves, BirchLeaves, TallGrass, Fern, Poppy, Dandelion, Cornflower, FaeBloom, DryGrass, DeadBush, SeaGrass, LilyPad, Glowshroom, RedMushroom,
} = ID;
const CHUNKS_WIDE = LAND / CS, HEART = CHUNKS_WIDE / 2 - 1;
const STEEP = 3;         // a step this high shows bare rock, and nothing takes root on it
const TRIES = 18;        // spots a chunk tries for its trees and rocks
const STRATA = [Terracotta, RedClay, Sandstone, DarkTerracotta, RedClay, Terracotta, Sandstone]; // the bands in a mesa's side
// The hall under the Wyrmcrown: a dome big enough for what sleeps there, a shaft up to the summit that it flies through, and a tunnel you walk.
const HALL_FLOOR = SEA + 34, HALL_MID = SEA + 44, HALL_R = 30, HALL_TALL = 16, SHAFT_R = 10, TUNNEL_R = 5, TUNNEL_TALL = 8, TEETH_AT = 60;

export function setWorldData(w) { setLandData(w); layRoads(); forgetCaves(); }
// Which cave biome lies under a spot: a slow noise chooses among what suits the land above.
const UNDER = { [B.PEAKS]: ['crystal', 'frozen'], [B.ELF]: ['crystal', 'verdant'], [B.KINGDOM]: ['verdant', 'marble', 'drip'], [B.BEAST]: ['drip', 'ember'], [B.DEMON]: ['ember'], [B.MIRE]: ['fungal', 'verdant'], [B.OCEAN]: ['drip', 'crystal'], [B.BEACH]: ['drip', 'verdant'] };
export function caveBiomeAt(x, z) {
  const list = UNDER[landOf(x, z).b] ?? ['drip'];
  return list[Math.min(list.length - 1, Math.floor((NZ.BIOME(x / 190, z / 190) * 0.5 + 0.5) * list.length))];
}
const DEEP = { sea: SEA, height: H, biomeAt: caveBiomeAt, steepAt: (x, z) => slopeAt(x, z) >= STEEP, surfaceAt: (x, z) => heightAt(Math.round(x), Math.round(z)), keepOut: (x, z) => inTown(x, z) || nearLair(x, z, GORGE_FROM + 24) };
const mod = (a, b) => ((a % b) + b) % b;
export const idx = (x, y, z) => x + z * CS + y * CS * CS;

// ---------- the ground ----------
function ground(b, h, y, det, steep) {
  const depth = h - y;
  if (b === B.OCEAN) return depth < 3 ? (h < SEA - 12 && det > 0 ? Gravel : Sand) : Stone;
  if (b === B.BEACH) return depth < 4 ? Sand : depth < 7 ? Sandstone : Stone;
  if (b === B.PEAKS) {
    if (depth > 0) return steep && depth < 3 ? Gravel : Stone;
    return h > SNOW_LINE + det * 5 ? Snow : steep ? Stone : det > 0.15 ? Grass : Stone;
  }
  if (b === B.DEMON) {
    if (depth === 0) return det > 0.58 ? Magma : det < -0.5 ? Basalt : AshenGround;
    return depth < 3 ? Blackstone : Stone;
  }
  if (b === B.BEAST) {
    if (h > SEA + 11 && depth < 24) return STRATA[mod(y + Math.round(det * 1.2), STRATA.length)]; // mesas show their bands right to the top
    if (depth === 0) return steep ? Terracotta : det > 0.5 ? RedClay : SavannaGrass;
    return depth < 4 ? RedClay : Stone;
  }
  if (b === B.ELF) return depth === 0 ? (steep ? Stone : det > 0.62 ? Moss : FaeGrass) : depth < 4 ? Dirt : Stone;
  if (b === B.MIRE) return depth === 0 ? (det > 0.2 ? Moss : det < -0.45 ? Gravel : Dirt) : depth < 3 ? Dirt : Stone;
  return depth === 0 ? (steep ? Stone : Grass) : depth < 4 ? Dirt : Stone;
}
// Black rock with fire showing through the cracks, and glass at the tips of the horns.
function crownRock(h, y, det, x, z) {
  const depth = h - y;
  if (depth > 3) return Stone;
  if (depth) return Blackstone;
  return Math.abs(NZ.M(x / 13, z / 13)) < 0.02 ? Magma : h > CROWN_TOP - 22 ? Obsidian : det > 0.1 ? Basalt : Blackstone;
}
// Runs by the column, not as a structure, because a hall this wide reaches further than a feature may.
function carveLair(cx, cz, d, cols) {
  const L = lairAt(), bx = cx * CS, bz = cz * CS;
  if (!L || Math.hypot(bx + 8 - L.x, bz + 8 - L.z) > GORGE_FROM + 24) return;
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = bx + x, wz = bz + z, dx = wx - L.x, dz = wz - L.z, r = Math.hypot(dx, dz), h = cols.h[x + z * CS], bump = 3 * NZ.D(wx / 11, wz / 11);
    const way = dz > 0 && r < GORGE_FROM + 8 && Math.abs(wx - gorgeX(wz)) < TUNNEL_R + bump * 0.4, hall = HALL_R + bump;
    for (let y = HALL_FLOOR; y <= h; y++) {
      const dome = (r / hall) ** 2 + ((y - HALL_MID) / HALL_TALL) ** 2 < 1, shaft = y > HALL_MID && r < SHAFT_R + bump * 0.6, tunnel = way && y < HALL_FLOOR + TUNNEL_TALL + bump;
      if (!dome && !shaft && !tunnel) continue;
      const tooth = tunnel && !dome && Math.abs(r - TEETH_AT) < 2 && !(wx & 3) && y >= HALL_FLOOR + TUNNEL_TALL - 4; // the mouth has teeth
      d[idx(x, y, z)] = tooth ? BoneBlock : Air;
    }
    if (r >= hall) continue;
    d[idx(x, HALL_FLOOR - 1, z)] = r > 13 && NZ.D(wx / 7, wz / 7) > 0.42 ? Magma : r < 12 ? Obsidian : Basalt; // pools of fire light the place
    const spur = hash3(wx, 9, wz);
    if (r < 14 || spur < 0.965) continue;
    const roof = Math.floor(HALL_MID + HALL_TALL * Math.sqrt(Math.max(0, 1 - (r / hall) ** 2))), long = 3 + Math.floor((spur - 0.965) * 260);
    for (let k = 0; k < long; k++) { d[idx(x, roof - k, z)] = Basalt; if (spur > 0.985 && k < long >> 1) d[idx(x, HALL_FLOOR + k, z)] = Obsidian; } // what grows down, and what grows up to meet it
  }
}

// ---------- roads ----------
function layRoad(cx, cz, set) {
  const row = roadsIn(cx, cz);
  if (!row) return;
  const bx = cx * CS, bz = cz * CS;
  for (let i = 0; i < row.length; i++) {
    if (!row[i]) continue;
    const x = bx + (i & 15), z = bz + (i >> 4), g = heightAt(x, z), deck = deckFor(g);
    if (!deck) { set(x, g, z, g <= SEA + 1 && row[i] === ID.DirtPath ? Sand : row[i]); continue; }
    set(x, deck, z, Planks);
    if ((x + z) % 5 === 0) for (let y = deck - 1; y > g; y--) set(x, y, z, OakLog); // a bridge stands on legs
  }
}

// ---------- what grows ----------
function growTree(b, x, h, z, set, r) {
  const y = h + 1, roll = r();
  if (b === B.ELF) { if (roll < 0.1) fallenLog(x, y, z, ID.Elderwood, set, r); else if (roll < 0.2) bush(x, y, z, OakLeaves, set, r); else elfTree(x, y, z, set, r); }
  else if (b === B.KINGDOM) { if (roll < 0.06) greatOak(x, y, z, set, r); else if (roll < 0.3) birch(x, y, z, set, r); else if (roll < 0.85) oak(x, y, z, set, r); else if (roll < 0.95) bush(x, y, z, roll < 0.9 ? OakLeaves : BirchLeaves, set, r); else fallenLog(x, y, z, OakLog, set, r); }
  else if (b === B.BEAST) { if (roll < 0.08) baobab(x, y, z, set, r); else if (roll < 0.6) acacia(x, y, z, set, r); else if (roll < 0.85) cactus(x, y, z, set, r); else boulder(x, y, z, set, r); }
  else if (b === B.PEAKS) { if (h > ROCK_LINE) { if (roll < 0.5) crystals(x, y, z, set, r); else boulder(x, y, z, set, r); } else if (roll < 0.75) spruce(x, y, z, set, r); else boulder(x, y, z, set, r); }
  else if (b === B.DEMON) { if (roll < 0.5) magmaSpike(x, y, z, set, r); else deadTree(x, y, z, set, r); }
  else if (b === B.MIRE) { if (h < SEA) return; if (roll < 0.14) giantMushroom(x, y, z, set, r); else if (roll < 0.6) deadTree(x, y, z, set, r, OakLog); else if (roll < 0.85) bush(x, y, z, OakLeaves, set, r); else fallenLog(x, y, z, OakLog, set, r); }
  else if (b === B.BEACH) { if (h >= SEA && roll < 0.8) palm(x, y, z, set, r); }
  else if (b === B.OCEAN && h < SEA - 3) reef(x, y, z, set, r);
}
// How likely a spot is to carry a tree, by biome: forests stand in clumps with meadows and glades between them.
const PLENTY = { [B.ELF]: 0.95, [B.KINGDOM]: 0.5, [B.BEAST]: 0.16, [B.PEAKS]: 0.55, [B.DEMON]: 0.3, [B.BEACH]: 0.14, [B.OCEAN]: 0.5, [B.MIRE]: 0.5 };
function growth(cx, cz, L, skipX, skipZ, set, r) {
  const bx = cx * CS, bz = cz * CS, town = L.settlement != null ? settlement(L.settlement) : null, density = 0.2 + 1.6 * L.density;
  for (let i = 0; i < TRIES; i++) {
    const x = bx + Math.floor(r() * CS), z = bz + Math.floor(r() * CS), rr = r(), pass = r();
    if (skipX != null && Math.abs(x - skipX) < 9 && Math.abs(z - skipZ) < 9) continue;
    const h = heightAt(x, z);
    let b = biomeAt(x, z, h);
    if (b === B.ELF || b === B.KINGDOM || b === B.BEAST) b = rollBiome(x, z, rr); // the two sides of a border mingle
    const clump = b === B.OCEAN || b === B.BEACH ? 1 : ss(-0.3, 0.35, NZ.F(x / 64, z / 64));
    if (pass > (PLENTY[b] ?? 0) * density * clump || (h <= SEA && b !== B.OCEAN) || (h >= SEA && (b === B.OCEAN || slopeAt(x, z) >= STEEP)) || roadAt(x, z) || nearLair(x, z, HALL_R + 2) || openGroundAt(x, z, h, DEEP)) continue; // nothing grows on air: a ravine or a cave mouth may have taken the ground
    if (inTown(x, z)) { if (!town || pass > 0.25 || !clearOfBuildings(town, x, z)) continue; } // a yard may keep one tree
    growTree(b, x, h, z, set, r);
  }
}
// One tuft, flower or mushroom per column at most, each decided by the column alone.
function plantColumn(d, x, z, wx, wz, h, b) {
  const roll = hash3(wx, 11, wz), top = d[idx(x, h, z)], up = idx(x, h + 1, z);
  if (h < SEA) {
    const still = landOf(wx, wz).b; // rivers and lakes, not the open sea
    if (h >= SEA - 3 && roll > (still === B.MIRE ? 0.8 : 0.94) && (still === B.KINGDOM || still === B.ELF || still === B.MIRE) && d[idx(x, SEA + 1, z)] === Air) d[idx(x, SEA + 1, z)] = LilyPad;
    else if (roll < 0.16 && d[up] === Water && (top === Sand || top === Gravel)) d[up] = SeaGrass;
    return;
  }
  if (d[up] !== Air || h + 1 >= H) return;
  const patch = NZ.F(wx / 16 + 9, wz / 16 - 4);
  if (top === Stone || top === Gravel) { if (h > SNOW_LINE - 4 + patch * 3) d[up] = SnowLayer; return; }
  if (top === FaeGrass || top === Moss) {
    if (patch > 0.3 && roll < 0.2) d[up] = FaeBloom;
    else if (patch < -0.4 && roll < 0.1) d[up] = Glowshroom;
    else if (roll < 0.3) d[up] = roll < 0.08 ? Fern : TallGrass;
  } else if (top === SavannaGrass) {
    if (roll < 0.26) d[up] = roll < 0.02 ? DeadBush : DryGrass;
  } else if (top === Grass) {
    if (b === B.PEAKS) { if (roll < 0.1) d[up] = Fern; else if (h > SNOW_LINE - 6 && roll < 0.5) d[up] = SnowLayer; }
    else if (patch > 0.28) { if (roll < 0.34) d[up] = [Poppy, Dandelion, Cornflower][Math.floor(hash3(wx >> 3, 3, wz >> 3) * 3)]; else if (roll < 0.6) d[up] = TallGrass; } // a whole meadow of one flower
    else if (roll < 0.22) d[up] = roll < 0.015 ? RedMushroom : TallGrass;
  } else if (top === AshenGround) { if (roll < 0.03) d[up] = DeadBush; }
  else if (top === Sand && h > SEA + 1 && roll < 0.02) d[up] = DeadBush;
}

// ---------- what stands on it: settlements, landmarks, then vegetation ----------
function features(cx, cz, set) {
  const r = mulberry(hash2(cx, cz)), bx = cx * CS, bz = cz * CS, L = landOf(bx + 8, bz + 8);
  const ix = mod(cx, CHUNKS_WIDE), iz = mod(cz, CHUNKS_WIDE), heart = ix === HEART && iz === HEART;
  const sx = bx + 4 + Math.floor(r() * 8), sz = bz + 4 + Math.floor(r() * 8), sh = heightAt(sx, sz), roll = r();
  let skipX = null, skipZ = null;
  const clear = () => { skipX = sx; skipZ = sz; };
  if (L.settlement != null) townChunk(cx, cz, settlement(L.settlement), set);
  else {
    const hx = bx + CS, hz = bz + CS;
    switch (L.structure) {
      // There is one dragon, and this is where it sleeps. It is lands away from the Spires, so the story never has to get past it.
      case 'dragon_peak': if (heart) { hoard(hx, HALL_FLOOR, hz, set, r); clear(); } break;
      case 'treehouse_grove': if (sh > SEA + 1 && roll < 0.45) { giantTree(sx, sh + 1, sz, set, r); clear(); } break;
      case 'mermaid_palace': if (heart && sh < SEA - 9) { palace(sx, sh + 1, sz, set, r); clear(); } break;
      case 'crystal_spire': if (heart) { spire(hx, heightAt(hx, hz) + 1, hz, set, r); clear(); } break;
      case 'demon_castle': if (heart) { demonCastle(hx, heightAt(hx, hz) + 1, hz, set); clear(); } break;
      case 'ruins':
        if (heart) hint('cairn', sx + 1, heightAt(sx + 1, sz) + 1, sz); // the story needs it, so it can't depend on the roll
        if (roll < 0.14) { ruins(sx, sh, sz, set, r); clear(); }
        break;
    }
    // Each open land has four sites a sight of its realm may stand on, well clear of whatever its middle holds.
    if (ix % 4 === 1 && iz % 4 === 1 && roll > 0.55 && !onCrown(sx, sz)) { raiseSight(biomeAt(sx, sz, sh), sx, sz, set, r); clear(); }
  }
  growth(cx, cz, L, skipX, skipZ, set, r);
}

export function genChunk(cx, cz, edits) {
  const d = new Uint8Array(CS * CS * H), bx = cx * CS, bz = cz * CS, cols = columnsOf(cx, cz);
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = bx + x, wz = bz + z, h = cols.h[x + z * CS], b = biomeAt(wx, wz, h), det = NZ.D(wx / 9, wz / 9), steep = slopeAt(wx, wz) >= STEEP, crowned = onCrown(wx + det * 7, wz - det * 7);
    d[idx(x, 0, z)] = Bedrock;
    for (let y = 1; y <= h; y++) d[idx(x, y, z)] = crowned ? crownRock(h, y, det, wx, wz) : ground(b, h, y, det, steep);
    for (let y = h + 1; y <= SEA; y++) d[idx(x, y, z)] = Water;
    if (b === B.DEMON) for (let y = h + 1; y <= LAVA_LEVEL; y++) d[idx(x, y, z)] = Magma; // the Wastes' rivers run with fire
  }
  carveDeep(cx, cz, d, cols, DEEP);
  carveLair(cx, cz, d, cols);
  const set = (wx, y, wz, id, soft) => {
    const x = wx - bx, z = wz - bz;
    if (x < 0 || z < 0 || x >= CS || z >= CS || y < 1 || y >= H) return;
    const i = idx(x, y, z);
    if (soft && d[i] !== Air && d[i] !== Water) return;
    if (id === Air && y <= SEA && d[i] === Water) return;
    d[i] = id;
  };
  layRoad(cx, cz, set);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) features(cx + dx, cz + dz, set);
  for (const { x, z } of lampsIn(cx, cz)) {
    const g = heightAt(x, z), lx = x - bx, lz = z - bz;
    if (g <= SEA || roadAt(x, z) || d[idx(lx, g + 1, lz)] !== Air || d[idx(lx, g + 3, lz)] !== Air) continue;
    d[idx(lx, g + 1, lz)] = Fence; d[idx(lx, g + 2, lz)] = Fence; d[idx(lx, g + 3, lz)] = Lantern;
  }
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = bx + x, wz = bz + z, h = cols.h[x + z * CS];
    if (!roadAt(wx, wz)) plantColumn(d, x, z, wx, wz, h, biomeAt(wx, wz, h));
  }
  if (edits) for (const [i, id] of edits) d[i] = id;
  return d;
}
// The highest layer with anything in it, so that light and meshing can skip the empty sky.
export function topOf(d) {
  for (let i = d.length - 1; i >= 0; i--) if (d[i]) return Math.floor(i / (CS * CS));
  return 0;
}

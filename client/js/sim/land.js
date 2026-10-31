// The shape of the world: where each realm lies, how one fades into the next and how high the ground stands.
// The server sends the lands as a grid; the edges wander here, so that no border runs straight and nothing changes at a line.
import { BIOMES, REALMS, WORLD } from '../core/content.js';
import { NZ, fbm, ss } from './noise.js';

export const CS = WORLD.chunk, H = WORLD.height, SEA = WORLD.sea, LAND = WORLD.land, TOWNS = WORLD.towns;
export const B = Object.fromEntries(BIOMES.map((b, i) => [b.key, i]));
export const REALM = BIOMES.map(b => [b.name, b.kind]);
const REALM_B = Object.fromEntries(Object.entries(REALMS).map(([name, r]) => [name, B[r.biome]]));
const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const LOOK = BIOMES.map(b => ({ level: SEA + b.level, hills: b.hills, grass: rgb(b.grass), leaves: rgb(b.leaves) }));
const OCEAN_LAND = { b: B.OCEAN, structure: 'none', density: 0.2, settlement: null, name: 'The Endless Sea' };

const WANDER = 38;     // how far a border strays from the grid, in blocks
const BAND = 0.24;     // the share of a land, from its edge, that is still a blend of its neighbours
const FRAY = 7;        // how far single columns stray either side of a border, so that ground cover mingles
const TOWN_BANK = 20;  // blocks over which a town's level ground eases back into the land
export const TOWN_LEVEL = SEA + 5;
export const SNOW_LINE = SEA + 46, ROCK_LINE = SEA + 38, LAVA_LEVEL = SEA + 4;
// The Wyrmcrown, the one mountain that is not the land's doing. Its shoulder, the bowl at its summit, and the valley cut up to the cave's mouth.
export const CROWN_REACH = 104, CROWN_SHOULDER = 126, CROWN_BOWL = 108, CROWN_TOP = H - 4, GORGE_FLOOR = SEA + 33, GORGE_FROM = 64;

export const chunkKey = (cx, cz) => (cx + 16384) * 32768 + (cz + 16384);

let W = null, lair = null;
// Every chunk also runs its neighbours' features, so the same columns are asked for again and again: each chunk's are worked out once.
const columns = new Map(); // chunk key -> { h, zone, town, grass, leaves }
export function setLandData(w) {
  W = w; lair = null; columns.clear();
  w.lands.forEach((row, lz) => row.forEach((L, lx) => {
    delete L._c;
    if (L.structure === 'dragon_peak') lair = { x: (lx + 0.5) * LAND, z: (lz + 0.5) * LAND };
  }));
}
export const lairAt = () => lair;
// The line the gorge and the tunnel follow south from the cave, wandering so that neither is a ruled line.
export const gorgeX = z => lair.x + 6 * Math.sin((z - lair.z) / 15);
export const settlement = id => W.settlements[id];
export const settlements = () => W.settlements;
// Inside the walls of a city. Guards walk these streets, and nothing is born in them.
export function inCity(x, z) {
  const id = landOf(x, z).settlement;
  if (id == null) return false;
  const S = settlement(id), wall = TOWNS[S.type].wall;
  return (S.type === 'city' || S.type === 'elfcity') && Math.hypot(x - S.cx, z - S.cz) <= wall;
}
function land(lx, lz) {
  const L = W.lands[lz]?.[lx];
  if (!L) return OCEAN_LAND;
  return L._c || (L._c = { b: REALM_B[L.realm], structure: L.structure, density: L.density, settlement: L.settlement, name: L.name });
}
export const landOf = (x, z) => land(Math.floor(x / LAND), Math.floor(z / LAND));
export const landName = L => (L.settlement != null ? settlement(L.settlement).name : L.name) || REALM[L.b][0];

// How much of each biome a spot holds, read through wandering coordinates. One scratch array: copy it to keep it.
const blend = new Float32Array(BIOMES.length);
let wanderX = 0, wanderZ = 0;
function blendAt(x, z) {
  wanderX = x + WANDER * fbm(NZ.W, x / 160, z / 160, 3);
  wanderZ = z + WANDER * fbm(NZ.W, x / 160 + 57, z / 160 - 31, 3);
  const fx = wanderX / LAND - 0.5, fz = wanderZ / LAND - 0.5, lx = Math.floor(fx), lz = Math.floor(fz);
  const tx = ss(BAND, 1 - BAND, fx - lx), tz = ss(BAND, 1 - BAND, fz - lz);
  blend.fill(0);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) blend[land(lx + i, lz + j).b] += (i ? tx : 1 - tx) * (j ? tz : 1 - tz);
  return blend;
}
export const climateAt = blendAt;
// The biome of one column's ground cover: the nearest land, a few blocks out of true.
function zoneAt(x, z) {
  const fray = FRAY * NZ.D(x / 6.5, z / 6.5);
  return land(Math.floor((wanderX + fray) / LAND), Math.floor((wanderZ - fray) / LAND)).b;
}
// A roll on the mix: where two realms meet, their trees stand side by side.
export function rollBiome(x, z, roll) {
  blendAt(x, z);
  for (let b = 0; b < blend.length; b++) { roll -= blend[b]; if (roll <= 0 && blend[b] > 0) return b; }
  return zoneAt(x, z);
}

// 0 in the open, 1 on a town's level ground.
function townFlat(x, z) {
  let flat = 0;
  for (const S of W.settlements) {
    const far = TOWNS[S.type].reach + TOWN_BANK + 6, dx = x - S.cx, dz = z - S.cz;
    if (Math.abs(dx) > far || Math.abs(dz) > far) continue;
    flat = Math.max(flat, 1 - ss(TOWNS[S.type].reach, TOWNS[S.type].reach + TOWN_BANK, Math.hypot(dx, dz) + 5 * NZ.D(x / 17, z / 17)));
  }
  return flat;
}
const mix = (a, b, t) => a + (b - a) * t;
// Black flanks thrown up out of the Peaks, buttressed like roots, with a ring of horns round a bowl at the top.
function crown(x, z, h) {
  const dx = x - lair.x, dz = z - lair.z, gone = Math.hypot(dx, dz);
  if (gone > CROWN_REACH) return h;
  const a = Math.atan2(dz, dx), r = gone + 8 * fbm(NZ.M, x / 40, z / 40, 2), t = ss(CROWN_REACH, 24, r);
  const buttress = 1 - Math.abs(Math.sin(a * 3.5 + fbm(NZ.M, x / 70 - 9, z / 70, 2) * 2)), crag = 1 - Math.abs(NZ.M(x / 17, z / 17));
  let m = mix(h, CROWN_SHOULDER, t ** 1.3) + t * (1 - t) * 4 * (22 * buttress * buttress + 9 * crag * crag);
  m += Math.max(0, Math.cos(a * 9 + fbm(NZ.W, x / 30, z / 30, 2) * 1.6)) ** 6 * ss(34, 24, r) * ss(12, 20, r) * 28; // the horns
  m = mix(m, CROWN_BOWL, ss(20, 11, r));
  if (dz > 0) m = mix(m, GORGE_FLOOR, ss(13, 6, Math.abs(x - gorgeX(z))) * ss(GORGE_FROM - 6, GORGE_FROM + 8, gone)); // walls either side of the way in
  return Math.min(CROWN_TOP, m);
}
export const onCrown = (x, z) => !!lair && Math.hypot(x - lair.x, z - lair.z) < CROWN_REACH - 24;
export const nearLair = (x, z, reach) => !!lair && Math.hypot(x - lair.x, z - lair.z) < reach;
function columnHeight(x, z, flat) {
  let level = 0, hills = 0;
  for (let b = 0; b < blend.length; b++) { level += blend[b] * LOOK[b].level; hills += blend[b] * LOOK[b].hills; }
  const peaks = blend[B.PEAKS], beast = blend[B.BEAST], demon = blend[B.DEMON], dry = 1 - blend[B.OCEAN];
  let h = level + fbm(NZ.H, x / 110, z / 110, 4) * hills + NZ.H(x / 23 + 40, z / 23) * dry * 1.3;
  if (peaks > 0) { // ridged, so that the mountains have spines instead of being lumps
    const ridge = 1 - Math.abs(fbm(NZ.M, x / 150, z / 150, 3)), crag = 1 - Math.abs(NZ.M(x / 46, z / 46));
    h += peaks * peaks * (ridge * ridge * ridge * ridge * 70 + crag * crag * ridge * 11);
  }
  if (beast > 0.4) { // the Wilds' mesas: flat tops and stepped sides, rising straight from the plain
    const mesa = ss(0.22, 0.34, NZ.M(x / 130 + 19, z / 130 + 7)) * ss(0.4, 0.8, beast);
    h = mix(h, Math.floor((h + 17) / 4) * 4, mesa);
  }
  if (demon > 0) h += demon * Math.abs(NZ.M(x / 38, z / 38)) ** 1.5 * 17;
  // Rivers follow the lines where a slow noise crosses zero, and lakes sit in its deep hollows. In the Wastes the same channels run with fire.
  const open = dry * (1 - peaks) * (1 - flat), off = Math.abs(fbm(NZ.R, x / 250, z / 250, 2) + 0.05 * NZ.D(x / 30, z / 30)); // how far off the river's line
  const valley = 1 - ss(0.012, 0.085, off), bed = 1 - ss(0.008, 0.03, off), lake = ss(0.5, 0.64, NZ.R(x / 120 + 31, z / 120 - 12)) * (1 - beast);
  h = mix(h, mix(SEA + 2, LAVA_LEVEL + 1, demon), valley * open);
  h = mix(h, mix(SEA - 3, SEA + 2, demon), Math.max(bed, lake) * open); // just above the beach line, or a fire river would run on sand
  h = mix(h, TOWN_LEVEL, flat);
  h = Math.max(4, Math.min(H - 24, h));
  return Math.floor(lair ? crown(x, z, h) : h);
}
function surveyColumns(cx, cz) {
  const n = CS * CS, c = { h: new Int16Array(n), zone: new Uint8Array(n), town: new Uint8Array(n), grass: new Uint8Array(n * 3), leaves: new Uint8Array(n * 3) };
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const wx = cx * CS + x, wz = cz * CS + z, i = x + z * CS, flat = townFlat(wx, wz);
    blendAt(wx, wz);
    c.h[i] = columnHeight(wx, wz, flat);
    c.zone[i] = zoneAt(wx, wz);
    c.town[i] = flat > 0 ? 1 : 0;
    // Colour changes by the blend, not the zone: this is what makes one realm's grass shade into the next.
    const patch = 1 + 0.07 * NZ.D(wx / 34, wz / 34);
    for (let k = 0; k < 3; k++) {
      let grass = 0, leaves = 0;
      for (let b = 0; b < blend.length; b++) { grass += blend[b] * LOOK[b].grass[k]; leaves += blend[b] * LOOK[b].leaves[k]; }
      c.grass[i * 3 + k] = Math.min(255, grass * patch); c.leaves[i * 3 + k] = Math.min(255, leaves * patch);
    }
  }
  return c;
}
export function columnsOf(cx, cz) {
  const k = chunkKey(cx, cz);
  let c = columns.get(k);
  if (!c) columns.set(k, c = surveyColumns(cx, cz));
  return c;
}
// A worker that made a chunk has already surveyed it, so the main thread keeps that rather than doing the sums again.
export function keepColumns(cx, cz, c) { columns.set(chunkKey(cx, cz), c); }
const column = (x, z) => (x & 15) + (z & 15) * CS;
export const heightAt = (x, z) => columnsOf(x >> 4, z >> 4).h[column(x, z)]; // whole block coordinates
export const inTown = (x, z) => columnsOf(x >> 4, z >> 4).town[column(x, z)] === 1; // on a town's ground, or its banks
export function biomeAt(x, z, h) {
  const b = columnsOf(x >> 4, z >> 4).zone[column(x, z)];
  if (b === B.MIRE) return B.MIRE; // a fen is its own shore
  if (h < SEA) return B.OCEAN;
  if (h <= SEA + 1) return B.BEACH;
  if (b === B.DEMON) return B.DEMON;
  if (b === B.OCEAN) return B.BEACH;
  if (h > ROCK_LINE) return B.PEAKS;
  return b;
}
// The steepest step from this column to one beside it.
export function slopeAt(x, z) {
  const h = heightAt(x, z);
  return Math.max(Math.abs(heightAt(x + 1, z) - h), Math.abs(heightAt(x - 1, z) - h), Math.abs(heightAt(x, z + 1) - h), Math.abs(heightAt(x, z - 1) - h));
}

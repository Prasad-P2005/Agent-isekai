// Roads: town streets from the server's plans, highways between towns and piers out to sea, all stamped into a per-chunk table
// once when the world is set, so that terrain and trees can ask about any column for nothing.
import { ID } from './blocks.js';
import { CS, SEA, TOWNS, chunkKey, heightAt, settlements } from './land.js';
import { hash2, mulberry } from './noise.js';

const STREET = { human: ID.Cobblestone, city: ID.StoneBricks, elfcity: ID.Pearlstone, elf: ID.Moss, beast: ID.RedClay };
const HIGHWAY_WIDTH = 1, LAMP_EVERY = 11, PIER_MAX = 70, PIER_DEPTH = 3, PIER_WIDTH = 1, DECK = SEA + 2;
const STEPS = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

let cells = new Map(); // chunk key -> column -> block id, for chunks with road in them
let lamps = new Map(); // chunk key -> where a lamp post stands

export const roadAt = (x, z) => cells.get(chunkKey(x >> 4, z >> 4))?.[(x & 15) + (z & 15) * CS] ?? 0;
export const roadsIn = (cx, cz) => cells.get(chunkKey(cx, cz));
export const lampsIn = (cx, cz) => lamps.get(chunkKey(cx, cz)) ?? [];
export const deckFor = g => (g <= SEA ? DECK : 0); // ground this low is crossed on planks

function stamp(x, z, width, id) {
  for (let a = -width; a <= width; a++) for (let b = -width; b <= width; b++) {
    const px = x + a, pz = z + b, k = chunkKey(px >> 4, pz >> 4);
    let row = cells.get(k);
    if (!row) cells.set(k, row = new Uint8Array(CS * CS));
    const i = (px & 15) + (pz & 15) * CS;
    if (!row[i] || id !== ID.DirtPath) row[i] = id; // streets win where a highway runs into them
  }
}
function lay([ax, az, bx, bz], width, id, lit) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az), 1), sideX = Math.sign(bz - az), sideZ = -Math.sign(bx - ax);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(ax + (bx - ax) * i / steps), z = Math.round(az + (bz - az) * i / steps);
    stamp(x, z, width, id);
    if (lit && i % LAMP_EVERY === LAMP_EVERY >> 1) {
      const side = i % (LAMP_EVERY * 2) < LAMP_EVERY ? 1 : -1, px = x + sideX * side * (width + 1), pz = z + sideZ * side * (width + 1), k = chunkKey(px >> 4, pz >> 4);
      if (!lamps.has(k)) lamps.set(k, []);
      lamps.get(k).push({ x: px, z: pz });
    }
  }
}

// Where a town's streets end: the gates a highway can leave by.
function gatesOf(S) {
  const far = TOWNS[S.type].reach - 8, ends = [];
  for (const [ax, az, bx, bz] of S.streets) for (const [x, z] of [[ax, az], [bx, bz]]) if (Math.hypot(x - S.cx, z - S.cz) >= far) ends.push({ x, z });
  return ends.length ? ends : [{ x: S.cx, z: S.cz + TOWNS[S.type].reach }];
}
const nearest = (list, to) => list.reduce((best, p) => (Math.hypot(p.x - to.x, p.z - to.z) < Math.hypot(best.x - to.x, best.z - to.z) ? p : best));
// A road never runs straight: each stretch bows a little to one side, and each half of that again.
function wander(a, b, depth, out) {
  if (!depth) { out.push(b); return; }
  const r = mulberry(hash2(Math.round(a.x + b.x), Math.round(a.z + b.z))), bow = r() - 0.5;
  const mid = { x: (a.x + b.x) / 2 + (b.z - a.z) * bow * 0.3, z: (a.z + b.z) / 2 - (b.x - a.x) * bow * 0.3 };
  wander(a, mid, depth - 1, out);
  wander(mid, b, depth - 1, out);
}
function connect(A, B) {
  const from = nearest(gatesOf(A), { x: B.cx, z: B.cz }), to = nearest(gatesOf(B), from), points = [from];
  wander(from, to, 4, points);
  for (let i = 1; i < points.length; i++) lay([points[i - 1].x, points[i - 1].z, points[i].x, points[i].z], HIGHWAY_WIDTH, ID.DirtPath, false);
}
// Every town reachable from every other by the shortest roads there are, as a tree. Cities also get a road to their nearest fellow.
function highways(towns) {
  const reached = [towns[0]], waiting = towns.slice(1), span = (a, b) => Math.hypot(a.cx - b.cx, a.cz - b.cz);
  while (waiting.length) {
    let best = null, join = null;
    for (const a of reached) for (const b of waiting) if (!best || span(a, b) < span(best, join)) { best = a; join = b; }
    connect(best, join);
    reached.push(join);
    waiting.splice(waiting.indexOf(join), 1);
  }
  const cities = towns.filter(S => S.type === 'city' || S.type === 'elfcity');
  for (const S of cities) connect(S, cities.filter(o => o !== S).reduce((a, b) => (span(S, a) < span(S, b) ? a : b)));
}
// A coastal town's pier starts where its ground ends and runs out until there is water to fish in.
function pier(S) {
  const [dx, dz] = STEPS[S.shore_direction], from = TOWNS[S.type].reach + 1;
  let length = from;
  while (length < PIER_MAX && heightAt(S.cx + dx * length, S.cz + dz * length) > SEA - PIER_DEPTH) length++;
  if (length < PIER_MAX) lay([S.cx + dx * from, S.cz + dz * from, S.cx + dx * length, S.cz + dz * length], PIER_WIDTH, ID.Planks, false);
}

export function layRoads() {
  cells = new Map(); lamps = new Map();
  const towns = settlements();
  for (const S of towns) for (const [ax, az, bx, bz, width] of S.streets) lay([ax, az, bx, bz], width, STREET[S.type], width < 3 && S.type !== 'beast');
  if (towns.length) highways(towns);
  for (const S of towns) if (S.coastal && S.shore_direction) pier(S);
}

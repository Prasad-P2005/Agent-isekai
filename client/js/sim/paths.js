// How walkers find their way. There are two tools, because there are two questions.
// Nearly everything that hunts is hunting the same hero, so one flood outward from them answers every creature at once: a flow field.
// It costs the same for one wolf as for twenty, and each simply walks downhill along it, or uphill to run away.
// An errand of your own, like a baker going home, gets A*. Paths are found in turns, and a long walk is found a stretch at a time.
import { MAGMA, WATER, solid } from './blocks.js';
import { getBlock } from './chunks.js';
import { player } from './player.js';

const REACH = 40, LAYERS = 48, SIDE = REACH * 2 + 1, CELLS = SIDE * SIDE * LAYERS;
const FLOOD_BUDGET = 300, REDO_EVERY = 1.2, MOVED = 2, KEEP_FOR = 3, MAX_DROP = 3, SOURCE_DROP = 6;
const ROUTE_NODES = 900, ROUTES_PER_STEP = 1, ARRIVED = 0.55, SKIP_AHEAD = 12;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], ALL_DIRS = [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Solid underfoot, not lava, room for a head, and water no deeper than the knees.
export function canStand(x, y, z) {
  const floor = getBlock(x, y - 1, z);
  return solid(floor) && floor !== MAGMA && !solid(getBlock(x, y, z)) && !solid(getBlock(x, y + 1, z)) && getBlock(x, y + 1, z) !== WATER;
}
const open = (x, y, z) => !solid(getBlock(x, y, z));
// The floor under a spot, looking down a little way.
export function floorBelow(x, y, z, reach) {
  for (let yy = y; yy > y - reach; yy--) if (canStand(x, yy, z)) return yy;
  return null;
}

// ---------- the flow field ----------
const newField = () => ({ dist: new Uint16Array(CELLS), ox: 0, oy: 0, oz: 0, ready: false });
let front = newField(), back = newField(), wantedFor = 0, redo = 0, head = 0, tail = 0, flooding = false, srcX = 0, srcZ = 0;
const queue = new Int32Array(1 << 17);

function mark(f, x, y, z, d) {
  const ix = x - f.ox, iz = z - f.oz, iy = y - f.oy;
  if (ix < 0 || iz < 0 || iy < 0 || ix >= SIDE || iz >= SIDE || iy >= LAYERS) return;
  const c = ix + iz * SIDE + iy * SIDE * SIDE;
  if (f.dist[c] || tail >= queue.length) return;
  f.dist[c] = d;
  queue[tail++] = c;
}
function readField(f, x, y, z) {
  const ix = x - f.ox, iz = z - f.oz, iy = y - f.oy;
  return ix < 0 || iz < 0 || iy < 0 || ix >= SIDE || iz >= SIDE || iy >= LAYERS ? 0 : f.dist[ix + iz * SIDE + iy * SIDE * SIDE];
}
// Everyone who could step onto this cell: the flood runs backwards from where they want to end up.
function spread(f, x, y, z, d) {
  for (const [a, b] of DIRS) {
    const nx = x + a, nz = z + b;
    if (canStand(nx, y, nz)) mark(f, nx, y, nz, d);
    else if (canStand(nx, y - 1, nz) && open(nx, y + 1, nz)) mark(f, nx, y - 1, nz, d); // they hop up
    for (let drop = 1; drop <= MAX_DROP; drop++) { // they hop down
      if (!open(x, y + drop + 1, z)) break;
      if (canStand(nx, y + drop, nz)) { mark(f, nx, y + drop, nz, d); break; }
    }
  }
}
function startFlood() {
  const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z), y = floorBelow(x, Math.floor(player.pos.y) + 1, z, SOURCE_DROP);
  if (y == null) { front.ready = false; return; } // flying or swimming: there is no ground to walk to, so walkers head straight there
  back.dist.fill(0);
  back.ox = x - REACH; back.oz = z - REACH; back.oy = y - (LAYERS >> 1); back.ready = true;
  head = tail = 0;
  mark(back, x, y, z, 1);
  flooding = true; srcX = x; srcZ = z; redo = REDO_EVERY;
}
function floodSome() {
  for (let n = 0; n < FLOOD_BUDGET && head < tail; n++) {
    const c = queue[head++], d = back.dist[c], iy = Math.floor(c / (SIDE * SIDE)), rest = c - iy * SIDE * SIDE, iz = Math.floor(rest / SIDE), ix = rest - iz * SIDE;
    if (d < 65534) spread(back, ix + back.ox, iy + back.oy, iz + back.oz, d + 1);
  }
  if (head < tail) return;
  flooding = false;
  [front, back] = [back, front];
}
// `sign` -1 walks down the field, towards the hero; 1 walks up it, away.
const scratch = { x: 0, z: 0 };
function flow(px, py, pz, sign) {
  if (!front.ready) return null;
  const x = Math.floor(px), z = Math.floor(pz), y0 = Math.floor(py);
  let y = y0, here = 0;
  for (const up of [0, -1, 1, -2, 2]) { here = readField(front, x, y0 + up, z); if (here) { y = y0 + up; break; } }
  if (!here) return null;
  const at = (ax, az) => { for (let up = 1; up >= -MAX_DROP; up--) { const v = readField(front, ax, y + up, az); if (v) return v; } return 0; };
  let best = here, bx = 0, bz = 0;
  for (const [a, b] of ALL_DIRS) {
    if (a && b && !(at(x + a, z) && at(x, z + b))) continue; // no cutting a corner through a wall
    const v = at(x + a, z + b);
    if (v && (sign < 0 ? v < best : v > best)) { best = v; bx = a; bz = b; }
  }
  if (!bx && !bz) return null;
  const dx = x + bx + 0.5 - px, dz = z + bz + 0.5 - pz, l = Math.hypot(dx, dz) || 1;
  scratch.x = dx / l; scratch.z = dz / l;
  return scratch;
}
export function towardHero(p) { wantedFor = KEEP_FOR; return flow(p.x, p.y, p.z, -1); }
export function awayFromHero(p) { wantedFor = KEEP_FOR; return flow(p.x, p.y, p.z, 1); }

// ---------- A* ----------
const edges = (x, y, z, visit) => {
  for (const [a, b] of ALL_DIRS) {
    const nx = x + a, nz = z + b;
    if (a && b && !(open(nx, y, z) && open(nx, y + 1, z) && open(x, y, nz) && open(x, y + 1, nz))) continue;
    if (canStand(nx, y, nz)) { visit(nx, y, nz); continue; }
    if (canStand(nx, y + 1, nz) && open(x, y + 2, z)) { visit(nx, y + 1, nz); continue; }
    if (open(nx, y, nz) && open(nx, y + 1, nz)) { const f = floorBelow(nx, y - 1, nz, MAX_DROP); if (f != null) visit(nx, f, nz); }
  }
};
const nodeKey = (x, y, z) => (x + 4096) * 16384 * 256 + (z + 4096) * 256 + y;
function heapPush(h, n) { let i = h.push(n) - 1; while (i) { const p = (i - 1) >> 1; if (h[p].f <= h[i].f) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) {
  const top = h[0], end = h.pop();
  if (h.length) {
    h[0] = end;
    for (let i = 0; ;) {
      let m = i; const l = 2 * i + 1, r = l + 1;
      if (l < h.length && h[l].f < h[m].f) m = l;
      if (r < h.length && h[r].f < h[m].f) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  return top;
}
// Straight lines where they are clear: a path made of cells would zigzag across every open square.
function clearLine(a, b) {
  if (a.y !== b.y) return false;
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
  for (let i = 1; i < steps; i++) if (!canStand(Math.floor(a.x + (b.x - a.x) * i / steps + 0.5), a.y, Math.floor(a.z + (b.z - a.z) * i / steps + 0.5))) return false;
  return true;
}
function pull(cells) {
  const out = [];
  for (let i = 0; i < cells.length;) {
    out.push(cells[i]);
    let j = Math.min(cells.length - 1, i + SKIP_AHEAD);
    while (j > i + 1 && !clearLine(cells[i], cells[j])) j--;
    i = j > i ? j : i + 1;
  }
  return out;
}
// From a standing spot towards another. If the goal is too far to find in one go, the path ends at the nearest point reached and is continued from there.
export function findPath(from, to) {
  const sx = Math.floor(from.x), sz = Math.floor(from.z), tx = Math.floor(to.x), tz = Math.floor(to.z);
  const sy = floorBelow(sx, Math.floor(from.y) + 1, sz, 4);
  if (sy == null) return null;
  const guess = (x, z) => { const a = Math.abs(x - tx), b = Math.abs(z - tz); return Math.max(a, b) + 0.41 * Math.min(a, b); };
  const start = { x: sx, y: sy, z: sz, g: 0, f: guess(sx, sz), up: null }, open_ = [start], seen = new Map([[nodeKey(sx, sy, sz), 0]]);
  let best = start, bestH = start.f;
  for (let n = 0; n < ROUTE_NODES && open_.length; n++) {
    const c = heapPop(open_), h = guess(c.x, c.z);
    if (h < bestH) { best = c; bestH = h; }
    if (h < 1.5) { best = c; break; }
    edges(c.x, c.y, c.z, (x, y, z) => {
      const g = c.g + (x !== c.x && z !== c.z ? 1.41 : 1) + (y !== c.y ? 0.6 : 0), k = nodeKey(x, y, z);
      if (seen.get(k) <= g) return;
      seen.set(k, g);
      heapPush(open_, { x, y, z, g, f: g + guess(x, z), up: c });
    });
  }
  const cells = [];
  for (let c = best; c; c = c.up) cells.unshift({ x: c.x, y: c.y, z: c.z });
  return { pts: pull(cells), i: 1, to: { x: to.x, z: to.z } };
}
const wanting = [];
// Asks for a way there. The answer lands on e.route a step or so later.
export function ask(e, to) {
  if (e.askedRoute) return;
  e.askedRoute = true;
  e.routeTo = to;
  wanting.push(e);
}
// The next direction along a found path, or null once it has run out.
export function followRoute(e) {
  const r = e.route;
  if (!r) return null;
  while (r.i < r.pts.length && Math.hypot(r.pts[r.i].x + 0.5 - e.pos.x, r.pts[r.i].z + 0.5 - e.pos.z) < ARRIVED) r.i++;
  if (r.i >= r.pts.length) { e.route = null; return null; }
  const q = r.pts[r.i], dx = q.x + 0.5 - e.pos.x, dz = q.z + 0.5 - e.pos.z, l = Math.hypot(dx, dz) || 1;
  scratch.x = dx / l; scratch.z = dz / l;
  return scratch;
}

export function updatePaths(dt) {
  redo -= dt; wantedFor -= dt;
  if (flooding) floodSome();
  else if (wantedFor > 0 && (redo <= 0 || Math.hypot(player.pos.x - srcX, player.pos.z - srcZ) >= MOVED)) startFlood();
  for (let n = 0; n < ROUTES_PER_STEP && wanting.length; n++) {
    const e = wanting.shift();
    e.askedRoute = false;
    if (e.hp > 0) e.route = findPath(e.pos, e.routeTo);
  }
}

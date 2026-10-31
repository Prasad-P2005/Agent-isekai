// Turning chunks of blocks into meshes. Each chunk gathers a little of its neighbours, works out how sky and lamp light reach
// every open block, then writes faces into four layers: solid blocks, cut-out foliage, glass and water.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { AIR, BL, DIM, EMIT, ID, OPAQUE, WATER } from '../sim/blocks.js';
import { LIGHT_REACH, RD, chunks, lampsOf, neighboursLoaded } from '../sim/chunks.js';
import { hash3 } from '../sim/noise.js';
import { CS, H, columnsOf, chunkKey as key } from '../sim/terrain.js';
import { tileIndex } from './blocktex.js';
import { cutoutMat, glassMat, solidMat, waterMat } from './materials.js';
import { scene } from './scene.js';

const shown = new Map(); // chunk key -> its meshes

// ---------- what each block is drawn as ----------
const SHAPES = { // boxes in sixteenths of a block: [x0, y0, z0, x1, y1, z1]
  slab: [[0, 0, 0, 16, 8, 16]],
  carpet: [[0, 0, 0, 16, 1, 16]],
  layer: [[0, 0, 0, 16, 3, 16]],
  torch: [[7, 0, 7, 9, 11, 9]],
  lantern: [[5, 2, 5, 11, 11, 11], [6, 11, 6, 10, 12, 10], [7, 12, 7, 9, 16, 9]],
  stairs_n: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 16, 16, 8]],
  stairs_s: [[0, 0, 0, 16, 8, 16], [0, 8, 8, 16, 16, 16]],
  stairs_e: [[0, 0, 0, 16, 8, 16], [8, 8, 0, 16, 16, 16]],
  stairs_w: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 8, 16, 16]],
};
const FENCE_POST = [6, 0, 6, 10, 16, 10];
const FENCE_RAILS = [[[7, 12, 0, 9, 15, 6], [7, 6, 0, 9, 9, 6]], [[10, 12, 7, 16, 15, 9], [10, 6, 7, 16, 9, 9]], [[7, 12, 10, 9, 15, 16], [7, 6, 10, 9, 9, 16]], [[0, 12, 7, 6, 15, 9], [0, 6, 7, 6, 9, 9]]]; // n, e, s, w
const SWAY = { leaves: 0.34, plant: 0.67, kelp: 1 };
const SOLID_LAYER = 0, CUTOUT_LAYER = 1, GLASS_LAYER = 2, WATER_LAYER = 3;
const LOOK = BL.map((b, id) => {
  if (!b) return null;
  const tex = [].concat(b.tex ?? []), tiles = [tex[0], tex[1] ?? tex[0], tex[2] ?? tex[1] ?? tex[0]].map(tileIndex);
  return {
    id, tiles, tint: b.tint === 'grass' ? 1 : b.tint === 'leaves' ? 2 : 0, sway: Math.round((SWAY[b.sway] ?? 0) * 255), glow: Math.round((b.glow ?? 0) * 255), spin: !!b.spin,
    layer: id === WATER ? WATER_LAYER : b.transparent ? GLASS_LAYER : b.cutout ? CUTOUT_LAYER : SOLID_LAYER,
    cross: b.shape === 'cross', fence: b.shape === 'fence', boxes: SHAPES[b.shape] ?? null, cube: !b.shape,
  };
});

// ---------- the faces of a cube ----------
const STEP_X = 1, FACES = [
  { d: [1, 0, 0], s: 0.66, c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: c => [1 - c[2], 1 - c[1]] },
  { d: [-1, 0, 0], s: 0.66, c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: c => [c[2], 1 - c[1]] },
  { d: [0, 1, 0], s: 1.0, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: c => [c[0], c[2]] },
  { d: [0, -1, 0], s: 0.52, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: c => [c[0], 1 - c[2]] },
  { d: [0, 0, 1], s: 0.82, c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], uv: c => [c[0], 1 - c[1]] },
  { d: [0, 0, -1], s: 0.82, c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: c => [1 - c[0], 1 - c[1]] },
];
const AO_SHADE = [1, 0.8, 0.64, 0.5];

// ---------- the volume: this chunk and a margin of its neighbours ----------
const MARGIN = LIGHT_REACH, W = CS + 2 * MARGIN, AREA = W * W, VOLUME = AREA * H;
const vol = new Uint8Array(VOLUME), sky = new Uint8Array(VOLUME), lamp = new Uint8Array(VOLUME), crown = new Int16Array(AREA);
const queue = new Int32Array(1 << 20);
const cell = (x, y, z) => x + MARGIN + (z + MARGIN) * W + y * AREA; // x, z relative to this chunk
for (const f of FACES) {
  const axes = [0, 1, 2].filter(axis => f.d[axis] === 0), weight = [STEP_X, AREA, W];
  const offset = (a, b) => [0, 1, 2].reduce((sum, axis) => sum + weight[axis] * (axis === axes[0] ? a : axis === axes[1] ? b : 0), 0);
  f.out = f.d[0] + f.d[1] * AREA + f.d[2] * W;
  // Each corner of a face reads the open cell in front of it, the two beside that, and the one across the diagonal.
  f.near = f.c.map(corner => { const a = corner[axes[0]] ? 1 : -1, b = corner[axes[1]] ? 1 : -1; return [offset(a, 0), offset(0, b), offset(a, b)]; });
}

function gather(ch) {
  let top = 0;
  for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) {
    const c = chunks.get(key(ch.cx + nx, ch.cz + nz));
    if (c.top > top) top = c.top;
  }
  top = Math.min(top + 1, H - 2);
  for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) {
    const { d } = chunks.get(key(ch.cx + nx, ch.cz + nz));
    const x0 = nx < 0 ? CS - MARGIN : 0, x1 = nx > 0 ? MARGIN : CS, z0 = nz < 0 ? CS - MARGIN : 0, z1 = nz > 0 ? MARGIN : CS;
    const shiftX = nx * CS + MARGIN, shiftZ = (nz * CS + MARGIN) * W;
    for (let y = 0; y <= top; y++) {
      const from = y * CS * CS, to = y * AREA + shiftZ;
      for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) vol[to + z * W + x + shiftX] = d[from + z * CS + x];
    }
  }
  vol.fill(AIR, (top + 1) * AREA, (top + 2) * AREA);
  return top;
}
// Light spreads a block at a time and loses a step each block, and more through leaves.
function flood(level, tail, top) {
  const ceiling = (top + 1) * AREA;
  let head = 0;
  while (head < tail) {
    const i = queue[head++], l = level[i] - 1;
    if (l <= 0) continue;
    const x = i % W, z = Math.floor(i / W) % W;
    for (let k = 0; k < 6; k++) {
      if ((k === 0 && x === 0) || (k === 1 && x === W - 1) || (k === 2 && z === 0) || (k === 3 && z === W - 1)) continue;
      const n = i + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -W : k === 3 ? W : k === 4 ? -AREA : AREA);
      if (n < 0 || n >= ceiling) continue;
      const a = l - DIM[vol[n]];
      if (a > level[n] && tail < queue.length) { level[n] = a; queue[tail++] = n; }
    }
  }
}
function lightSky(top) {
  sky.fill(0, 0, (top + 2) * AREA);
  for (let i = 0; i < AREA; i++) {
    let l = 15, y = top + 1;
    crown[i] = -1;
    sky[i + y * AREA] = 15;
    for (y = top; y >= 0 && l > 0; y--) {
      const v = i + y * AREA;
      l -= DIM[vol[v]];
      if (l < 15 && crown[i] < 0) crown[i] = y;
      if (l <= 0) break;
      sky[v] = l;
    }
    if (crown[i] < 0) crown[i] = 0;
  }
  // Only the cells beside a shadow need to spread sideways: open sky above a column already holds.
  let tail = 0;
  const seed = (from, to) => {
    for (let y = crown[from] + 1; y <= crown[to]; y++) {
      const out = from + y * AREA, into = to + y * AREA;
      if (DIM[vol[into]] < 15 && sky[into] < 14 && tail < queue.length) queue[tail++] = out;
    }
  };
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = x + z * W;
    if (x > 0) seed(i, i - 1);
    if (x < W - 1) seed(i, i + 1);
    if (z > 0) seed(i, i - W);
    if (z < W - 1) seed(i, i + W);
  }
  flood(sky, tail, top);
}
function lightLamps(ch, top) {
  lamp.fill(0, 0, (top + 2) * AREA);
  let tail = 0;
  for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) {
    const c = chunks.get(key(ch.cx + nx, ch.cz + nz));
    for (const i of lampsOf(c)) {
      const y = Math.floor(i / (CS * CS)), rest = i - y * CS * CS, lx = rest % CS, lz = Math.floor(rest / CS);
      const x = lx + nx * CS, z = lz + nz * CS;
      if (x < -MARGIN || z < -MARGIN || x >= CS + MARGIN || z >= CS + MARGIN || y > top) continue;
      const v = cell(x, y, z);
      if (tail >= queue.length) continue;
      lamp[v] = EMIT[c.d[i]];
      queue[tail++] = v;
    }
  }
  flood(lamp, tail, top);
}

// ---------- the output ----------
class Layer {
  constructor() { this.quads = 0; this.size(1 << 12); }
  size(n) {
    const old = this;
    const pos = new Float32Array(n * 12), uvl = new Float32Array(n * 12), lit = new Uint8Array(n * 16), tint = new Uint8Array(n * 16), index = new Uint32Array(n * 6);
    if (old.pos) { pos.set(old.pos); uvl.set(old.uvl); lit.set(old.lit); tint.set(old.tint); index.set(old.index); }
    Object.assign(this, { pos, uvl, lit, tint, index, cap: n });
  }
  // Starts a quad and hands back where to write it.
  open(flip) {
    if (this.quads === this.cap) this.size(this.cap * 2);
    const q = this.quads++, b = q * 4, i = q * 6, ix = this.index;
    // The diagonal runs between the two brighter corners, or the shading across a face would crease the wrong way.
    if (flip) { ix[i] = b + 1; ix[i + 1] = b + 2; ix[i + 2] = b + 3; ix[i + 3] = b + 1; ix[i + 4] = b + 3; ix[i + 5] = b; }
    else { ix[i] = b; ix[i + 1] = b + 1; ix[i + 2] = b + 2; ix[i + 3] = b; ix[i + 4] = b + 2; ix[i + 5] = b + 3; }
    return b;
  }
  vertex(v, x, y, z, u, t, tile, s, l, shade, sway, tr, tg, tb, glow) {
    const a = v * 3, c = v * 4;
    this.pos[a] = x; this.pos[a + 1] = y; this.pos[a + 2] = z;
    this.uvl[a] = u; this.uvl[a + 1] = t; this.uvl[a + 2] = tile;
    this.lit[c] = s; this.lit[c + 1] = l; this.lit[c + 2] = shade; this.lit[c + 3] = sway;
    this.tint[c] = tr; this.tint[c + 1] = tg; this.tint[c + 2] = tb; this.tint[c + 3] = glow;
  }
  geometry(water) {
    if (!this.quads) return null;
    const g = new THREE.BufferGeometry(), n = this.quads * 4;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('lit', new THREE.BufferAttribute(this.lit.slice(0, n * 4), 4, true));
    if (!water) {
      g.setAttribute('uvl', new THREE.BufferAttribute(this.uvl.slice(0, n * 3), 3));
      g.setAttribute('tint', new THREE.BufferAttribute(this.tint.slice(0, n * 4), 4, true));
    }
    g.setIndex(new THREE.BufferAttribute(this.index.slice(0, this.quads * 6), 1));
    g.computeBoundingSphere();
    return g;
  }
}
const layers = [new Layer(), new Layer(), new Layer(), new Layer()];

// Corner light: the open cell in front of the face and whichever of the three around it are open too. Blocks count for the shadow.
const cornerSky = [0, 0, 0, 0], cornerLamp = [0, 0, 0, 0], cornerShade = [0, 0, 0, 0];
function lightFace(f, front) {
  for (let k = 0; k < 4; k++) {
    const [da, db, dd] = f.near[k], a = front + da, b = front + db, c = front + dd, shutA = OPAQUE[vol[a]], shutB = OPAQUE[vol[b]], shutC = OPAQUE[vol[c]];
    let s = sky[front], l = lamp[front], n = 1;
    if (!shutA) { s += sky[a]; l += lamp[a]; n++; }
    if (!shutB) { s += sky[b]; l += lamp[b]; n++; }
    if (!shutC && !(shutA && shutB)) { s += sky[c]; l += lamp[c]; n++; }
    cornerSky[k] = s / n * 17; cornerLamp[k] = l / n * 17;
    cornerShade[k] = AO_SHADE[shutA && shutB ? 3 : shutA + shutB + shutC];
  }
}
function cubeFace(layer, f, x, y, z, front, look, tile, hue, sway, drift) {
  lightFace(f, front);
  const flip = cornerShade[0] * cornerSky[0] + cornerShade[2] * cornerSky[2] < cornerShade[1] * cornerSky[1] + cornerShade[3] * cornerSky[3];
  const v = layer.open(flip), shade = f.s * drift * 255;
  for (let k = 0; k < 4; k++) {
    const c = f.c[k];
    let [u, t] = f.uv(c);
    if (hue.spin) { const a = hue.spin; if (a === 1) [u, t] = [t, 1 - u]; else if (a === 2) [u, t] = [1 - u, 1 - t]; else if (a === 3) [u, t] = [1 - t, u]; }
    layer.vertex(v + k, x + c[0], y + c[1], z + c[2], u, t, tile, cornerSky[k], cornerLamp[k], shade * cornerShade[k], sway, hue.r, hue.g, hue.b, look.glow);
  }
}
// A box that isn't a whole block lights itself from the brightest cell touching it, which is how a stair on a roof sees the sky.
function brightest(level, v) {
  return Math.max(level[v], level[v + 1], level[v - 1], level[v + W], level[v - W], level[v + AREA], v >= AREA ? level[v - AREA] : 0);
}
function box(layer, [x0, y0, z0, x1, y1, z1], x, y, z, v, look, hue) {
  const s = brightest(sky, v) * 17, l = Math.max(brightest(lamp, v), EMIT[look.id]) * 17;
  const lo = [x0 / 16, y0 / 16, z0 / 16], hi = [x1 / 16, y1 / 16, z1 / 16];
  for (const f of FACES) {
    const axis = f.d[0] ? 0 : f.d[1] ? 1 : 2, atEdge = f.d[axis] > 0 ? hi[axis] === 1 : lo[axis] === 0;
    if (atEdge && OPAQUE[vol[v + f.out]]) continue;
    const q = layer.open(false), tile = look.tiles[f.d[1] > 0 ? 0 : f.d[1] < 0 ? 2 : 1], shade = f.s * 255;
    for (let k = 0; k < 4; k++) {
      const c = f.c[k], px = c[0] ? hi[0] : lo[0], py = c[1] ? hi[1] : lo[1], pz = c[2] ? hi[2] : lo[2], [u, t] = f.uv([px, py, pz]);
      layer.vertex(q + k, x + px, y + py, z + pz, u, t, tile, s, l, shade, 0, hue.r, hue.g, hue.b, look.glow);
    }
  }
}
function fence(layer, x, y, z, v, look, hue) {
  box(layer, FENCE_POST, x, y, z, v, look, hue);
  [-W, 1, W, -1].forEach((step, side) => {
    const next = vol[v + step];
    if (next === ID.Fence || OPAQUE[next]) for (const rail of FENCE_RAILS[side]) box(layer, rail, x, y, z, v, look, hue);
  });
}
// Two crossed planes, nudged off centre so that a field of grass doesn't stand in rows.
function cross(layer, x, y, z, v, wx, wz, look, hue) {
  const s = Math.max(sky[v], sky[v + AREA]) * 17, l = Math.max(lamp[v], EMIT[look.id]) * 17, tile = look.tiles[1];
  const ox = look.sway === 255 ? 0 : (hash3(wx, y, wz) - 0.5) * 0.36, oz = look.sway === 255 ? 0 : (hash3(wz, y, wx) - 0.5) * 0.36, tall = 1 + hash3(wx, 3, wz) * 0.16;
  for (const [ax, az, bx, bz] of [[0.1, 0.1, 0.9, 0.9], [0.1, 0.9, 0.9, 0.1]]) {
    const q = layer.open(false);
    layer.vertex(q, x + ax + ox, y, z + az + oz, 0, 1, tile, s, l, 210, 0, hue.r, hue.g, hue.b, look.glow);
    layer.vertex(q + 1, x + ax + ox, y + tall, z + az + oz, 0, 0, tile, s, l, 255, look.sway, hue.r, hue.g, hue.b, look.glow);
    layer.vertex(q + 2, x + bx + ox, y + tall, z + bz + oz, 1, 0, tile, s, l, 255, look.sway, hue.r, hue.g, hue.b, look.glow);
    layer.vertex(q + 3, x + bx + ox, y, z + bz + oz, 1, 1, tile, s, l, 210, 0, hue.r, hue.g, hue.b, look.glow);
  }
}
// How deep the water is under a surface block, in blocks. Shore corners average down towards nothing, and that is where the foam shows.
const depthMemo = new Int8Array(AREA);
function waterDepth(v) {
  const i = v % AREA;
  if (depthMemo[i] >= 0) return depthMemo[i];
  let n = 0;
  while (n < 12 && vol[v - n * AREA] === WATER) n++;
  return (depthMemo[i] = n);
}
function waterFace(layer, f, x, y, z, v, top) {
  const q = layer.open(false), s = Math.min(255, Math.max(sky[v + f.out], sky[v + AREA]) * 17), surface = f.d[1] > 0, drop = top ? 0.12 : 0;
  for (let k = 0; k < 4; k++) {
    const c = f.c[k], high = c[1] === 1;
    let depth = 40;
    if (surface) {
      const stepX = c[0] ? 1 : -1, stepZ = c[2] ? W : -W;
      depth = (waterDepth(v) + waterDepth(v + stepX) + waterDepth(v + stepZ) + waterDepth(v + stepX + stepZ)) / 4 * 21;
    }
    layer.vertex(q + k, x + c[0], y + c[1] - (high ? drop : 0), z + c[2], 0, 0, 0, s, depth, surface ? 255 : 0, 0, 0, 0, 0, 0);
  }
}

const hue = { r: 255, g: 255, b: 255, spin: 0 };
function meshChunk(k, ch) {
  const { cx, cz, d } = ch, bx = cx * CS, bz = cz * CS, cols = columnsOf(cx, cz), top = gather(ch);
  lightSky(top); lightLamps(ch, top);
  depthMemo.fill(-1);
  for (const layer of layers) layer.quads = 0;
  // Most of a chunk is solid rock: inside a layer with no gaps, only the chunk's rim can show a face.
  const full = new Uint8Array(top + 3);
  for (let y = 0; y <= top; y++) {
    let i = y * CS * CS;
    const end = i + CS * CS;
    while (i < end && OPAQUE[d[i]]) i++;
    full[y] = i === end ? 1 : 0;
  }
  for (let y = 0; y <= top; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    if (full[y] && y > 0 && full[y - 1] && full[y + 1] && x > 0 && x < CS - 1 && z > 0 && z < CS - 1) continue;
    const v = cell(x, y, z), id = vol[v];
    if (id === AIR) continue;
    const look = LOOK[id], layer = layers[look.layer], column = x + z * CS, wx = bx + x, wz = bz + z;
    if (look.tint) {
      const tint = look.tint === 1 ? cols.grass : cols.leaves, at = column * 3;
      hue.r = tint[at]; hue.g = tint[at + 1]; hue.b = tint[at + 2];
    } else hue.r = hue.g = hue.b = 255;
    hue.spin = 0;
    if (look.layer === WATER_LAYER) {
      const covered = vol[v + AREA] === WATER;
      for (const f of FACES) {
        if (y === 0 && f.d[1] < 0) continue;
        const n = vol[v + f.out];
        if (n === AIR || BL[n].passable) waterFace(layer, f, x, y, z, v, !covered);
      }
      continue;
    }
    if (look.cross) { cross(layer, x, y, z, v, wx, wz, look, hue); continue; }
    if (look.fence) { fence(layer, x, y, z, v, look, hue); continue; }
    if (look.boxes) { for (const b of look.boxes) box(layer, b, x, y, z, v, look, hue); continue; }
    const drift = 0.95 + 0.05 * hash3(wx, y, wz); // no two blocks of a wall are quite the same
    for (const f of FACES) {
      if (y === 0 && f.d[1] < 0) continue;
      const front = v + f.out, n = vol[front];
      if (OPAQUE[n] || n === id || (look.layer === CUTOUT_LAYER && LOOK[n].layer === CUTOUT_LAYER && LOOK[n].cube)) continue;
      const up = f.d[1] > 0;
      hue.spin = up && look.spin ? Math.floor(hash3(wz, wx, 9) * 4) : 0;
      cubeFace(layer, f, x, y, z, front, look, look.tiles[up ? 0 : f.d[1] < 0 ? 2 : 1], hue, look.sway, drift);
    }
  }
  hide(k);
  const m = { meshes: [] }, mats = [solidMat, cutoutMat, glassMat, waterMat];
  layers.forEach((layer, i) => {
    const g = layer.geometry(i === WATER_LAYER);
    if (!g) return;
    const mesh = new THREE.Mesh(g, mats[i]);
    mesh.position.set(bx, 0, bz);
    mesh.renderOrder = i >= GLASS_LAYER ? 1 : 0;
    scene.add(mesh);
    m.meshes.push(mesh);
  });
  shown.set(k, m);
  ch.dirty = false;
}
function hide(k) {
  const m = shown.get(k);
  if (!m) return;
  for (const mesh of m.meshes) { scene.remove(mesh); mesh.geometry.dispose(); }
  shown.delete(k);
}
on('chunk:unloaded', hide);

export const chunkShown = (x, z) => shown.has(key(Math.floor(x / CS), Math.floor(z / CS)));

// Meshes what is missing or changed, nearest first, until the deadline. Changed chunks go first; the first chunk is always done.
export function meshChunks(px, pz, deadline) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), toMesh = [];
  for (let dx = -RD; dx <= RD; dx++) for (let dz = -RD; dz <= RD; dz++) {
    const k = key(pcx + dx, pcz + dz), ch = chunks.get(k);
    if (ch && (ch.dirty || !shown.has(k))) toMesh.push([ch.dirty && shown.has(k) ? -1 : dx * dx + dz * dz, k, ch]);
  }
  toMesh.sort((a, b) => a[0] - b[0]);
  let n = 0;
  for (const [, k, ch] of toMesh) {
    if (n && performance.now() >= deadline) break;
    if (neighboursLoaded(ch.cx, ch.cz)) { meshChunk(k, ch); n++; }
  }
}

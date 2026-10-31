// Turning a chunk into faces. Numbers go in and numbers come out, with no imports, so this can run on a worker: see view/chunkmesh.js for who asks.
// A job is a volume of blocks, the chunk and a margin of its neighbours. It works out how sky and lamp light reach every open block, in red, green
// and blue, because a lamp's colour fades by the block like its strength does. Then it writes faces into four layers: solid, cut-out, glass and water.
// Flat tops of a kind are merged into one quad, which is most of what a chunk is, and costs nothing to look at because blocks repeat their tile.
//
// A vertex is 24 bytes. Six shorts: x, y, z and u, v in 64ths of a block, and the tile. Twelve bytes:
//   lit  = sky light, shade, sway, glow
//   lamp = red, green, blue, depth of water above (in eighths of the byte, 0 when dry)
//   tint = red, green, blue, flags
// Water uses lit as sky, depth below, 255 for a surface and nothing. Quads have no index of their own, because every quad's is the same.
import { ALL_FACES, SECTION, linkSection } from './culling.js';

export const FIXED = 64;
export const FLAG = { SPIN: 8, SOLID_LEAF: 16, FOLIAGE: 32 }; // the low three bits of flags are the face: 0 to 5 as in FACES, 6 for plants
export const CROSS_FACE = 6;
export const SOLID_LAYER = 0, CUTOUT_LAYER = 1, GLASS_LAYER = 2, WATER_LAYER = 3;
const SURFACE = 56 / FIXED; // water stands a little below the top of its block
const SIDE_DEPTH = 40, DEEP_MARGIN = 6, MAX_ABOVE = 31;

const FENCE_POST = [6, 0, 6, 10, 16, 10];
const FENCE_RAILS = [[[7, 12, 0, 9, 15, 6], [7, 6, 0, 9, 9, 6]], [[10, 12, 7, 16, 15, 9], [10, 6, 7, 16, 9, 9]], [[7, 12, 10, 9, 15, 16], [7, 6, 10, 9, 9, 16]], [[0, 12, 7, 6, 15, 9], [0, 6, 7, 6, 9, 9]]]; // n, e, s, w

// ---------- the faces of a cube ----------
const STEP_X = 1, UP = 2, FACES = [
  { d: [1, 0, 0], s: 0.66, c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: c => [1 - c[2], 1 - c[1]] },
  { d: [-1, 0, 0], s: 0.66, c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: c => [c[2], 1 - c[1]] },
  { d: [0, 1, 0], s: 1.0, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], uv: c => [c[0], c[2]] },
  { d: [0, -1, 0], s: 0.52, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: c => [c[0], 1 - c[2]] },
  { d: [0, 0, 1], s: 0.82, c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], uv: c => [c[0], 1 - c[1]] },
  { d: [0, 0, -1], s: 0.82, c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: c => [1 - c[0], 1 - c[1]] },
];
const AO_SHADE = [1, 0.86, 0.74, 0.62];

// ---------- what blocks are like, sent once by whoever owns the block tables ----------
let CS, H, MARGIN, W, AREA, AIR, WATER, FENCE, OPAQUE, DIM, EMIT, RED, GREEN, BLUE, WET, LOOK, SMOOTH;
let sky, lampR, lampG, lampB, crown, depthMemo, depthMemoY;
let vol = null, top = 0;
const queue = new Int32Array(1 << 20);
const cell = (x, y, z) => x + MARGIN + (z + MARGIN) * W + y * AREA; // x, z relative to this chunk

export const volumeSize = (cs, h, margin) => (cs + 2 * margin) ** 2 * h;
export function setTables(t) {
  ({ CS, H, MARGIN, AIR, WATER, FENCE, OPAQUE, DIM, EMIT, RED, GREEN, BLUE, WET, LOOK, SMOOTH } = t);
  W = CS + 2 * MARGIN; AREA = W * W;
  const size = AREA * H;
  sky = new Uint8Array(size); lampR = new Uint8Array(size); lampG = new Uint8Array(size); lampB = new Uint8Array(size);
  crown = new Int16Array(AREA); depthMemo = new Int8Array(AREA); depthMemoY = new Int16Array(AREA);
  for (const f of FACES) {
    const axes = [0, 1, 2].filter(axis => f.d[axis] === 0), weight = [STEP_X, AREA, W];
    const offset = (a, b) => [0, 1, 2].reduce((sum, axis) => sum + weight[axis] * (axis === axes[0] ? a : axis === axes[1] ? b : 0), 0);
    f.out = f.d[0] + f.d[1] * AREA + f.d[2] * W;
    // Each corner of a face reads the open cell in front of it, the two beside that, and the one across the diagonal.
    f.near = f.c.map(corner => { const a = corner[axes[0]] ? 1 : -1, b = corner[axes[1]] ? 1 : -1; return [offset(a, 0), offset(0, b), offset(a, b)]; });
  }
}
const hash3 = (x, y, z) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- light ----------
// Light spreads a block at a time and loses a step each block, and more through leaves.
function flood(level, tail) {
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
function lightSky() {
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
  flood(sky, tail);
}
// The three colours spread together: a cell goes back on the queue if any of them rose, which for a white lamp is no more work than one colour.
function lightLamps() {
  const size = (top + 2) * AREA, ceiling = (top + 1) * AREA;
  lampR.fill(0, 0, size); lampG.fill(0, 0, size); lampB.fill(0, 0, size);
  let tail = 0, head = 0;
  for (let v = 0; v < ceiling; v++) {
    const id = vol[v];
    if (!EMIT[id] || tail >= queue.length) continue;
    lampR[v] = RED[id]; lampG[v] = GREEN[id]; lampB[v] = BLUE[id];
    queue[tail++] = v;
  }
  while (head < tail) {
    const i = queue[head++], r = lampR[i] - 1, g = lampG[i] - 1, b = lampB[i] - 1;
    if (r <= 0 && g <= 0 && b <= 0) continue;
    const x = i % W, z = Math.floor(i / W) % W;
    for (let k = 0; k < 6; k++) {
      if ((k === 0 && x === 0) || (k === 1 && x === W - 1) || (k === 2 && z === 0) || (k === 3 && z === W - 1)) continue;
      const n = i + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -W : k === 3 ? W : k === 4 ? -AREA : AREA);
      if (n < 0 || n >= ceiling) continue;
      const dim = DIM[vol[n]];
      let rose = false;
      if (r - dim > lampR[n]) { lampR[n] = r - dim; rose = true; }
      if (g - dim > lampG[n]) { lampG[n] = g - dim; rose = true; }
      if (b - dim > lampB[n]) { lampB[n] = b - dim; rose = true; }
      if (rose && tail < queue.length) queue[tail++] = n;
    }
  }
}

// ---------- the output ----------
class Layer {
  constructor() { this.quads = 0; this.low = Infinity; this.high = -Infinity; this.size(1 << 12); }
  size(n) {
    const cell = new Int16Array(n * 24), info = new Uint8Array(n * 48);
    if (this.cell) { cell.set(this.cell); info.set(this.info); }
    this.cell = cell; this.info = info; this.cap = n;
  }
  clear() { this.quads = 0; this.low = Infinity; this.high = -Infinity; }
  // Starts a quad and hands back where to write it.
  open() {
    if (this.quads === this.cap) this.size(this.cap * 2);
    return this.quads++ * 4;
  }
  vertex(v, x, y, z, u, t, tile, s, shade, sway, glow, r, g, b, wet, tr, tg, tb, flags) {
    const a = v * 6, c = v * 12, { cell, info } = this;
    cell[a] = x * FIXED; cell[a + 1] = y * FIXED; cell[a + 2] = z * FIXED; cell[a + 3] = tile; cell[a + 4] = u * FIXED; cell[a + 5] = t * FIXED;
    info[c] = s; info[c + 1] = shade; info[c + 2] = sway; info[c + 3] = glow;
    info[c + 4] = r; info[c + 5] = g; info[c + 6] = b; info[c + 7] = wet;
    info[c + 8] = tr; info[c + 9] = tg; info[c + 10] = tb; info[c + 11] = flags;
    if (y < this.low) this.low = y;
    if (y > this.high) this.high = y;
  }
}
const layers = [new Layer(), new Layer(), new Layer(), new Layer()];

// Corner light: the open cell in front of the face and whichever of the three around it are open too. Blocks count for the shadow.
const cornerSky = [0, 0, 0, 0], cornerR = [0, 0, 0, 0], cornerG = [0, 0, 0, 0], cornerB = [0, 0, 0, 0], cornerShade = [0, 0, 0, 0];
function lightFace(f, front) {
  if (!SMOOTH) {
    for (let k = 0; k < 4; k++) { cornerSky[k] = sky[front] * 17; cornerR[k] = lampR[front] * 17; cornerG[k] = lampG[front] * 17; cornerB[k] = lampB[front] * 17; cornerShade[k] = 1; }
    return;
  }
  for (let k = 0; k < 4; k++) {
    const [da, db, dd] = f.near[k], a = front + da, b = front + db, c = front + dd, shutA = OPAQUE[vol[a]], shutB = OPAQUE[vol[b]], shutC = OPAQUE[vol[c]];
    let s = sky[front], lr = lampR[front], lg = lampG[front], lb = lampB[front], n = 1;
    if (!shutA) { s += sky[a]; lr += lampR[a]; lg += lampG[a]; lb += lampB[a]; n++; }
    if (!shutB) { s += sky[b]; lr += lampR[b]; lg += lampG[b]; lb += lampB[b]; n++; }
    if (!shutC && !(shutA && shutB)) { s += sky[c]; lr += lampR[c]; lg += lampG[c]; lb += lampB[c]; n++; }
    cornerSky[k] = s / n * 17; cornerR[k] = lr / n * 17; cornerG[k] = lg / n * 17; cornerB[k] = lb / n * 17;
    cornerShade[k] = AO_SHADE[shutA && shutB ? 3 : shutA + shutB + shutC];
  }
}
const evenFace = () => {
  for (let k = 1; k < 4; k++) if (cornerSky[k] !== cornerSky[0] || cornerShade[k] !== cornerShade[0] || cornerR[k] !== cornerR[0] || cornerG[k] !== cornerG[0] || cornerB[k] !== cornerB[0]) return false;
  return true;
};
// How much water stands over a cell, counting it.
function waterAbove(v) {
  let n = 0;
  while (n < MAX_ABOVE && WET[vol[v]]) { n++; v += AREA; }
  return n * 8;
}
function cubeFace(layer, k, x, y, z, look, tile, hue, sway, drift, wet) {
  const f = FACES[k], flip = cornerShade[0] * cornerSky[0] + cornerShade[2] * cornerSky[2] < cornerShade[1] * cornerSky[1] + cornerShade[3] * cornerSky[3];
  // The diagonal runs between the two brighter corners, or the shading across a face would crease the wrong way. Starting from the next corner turns it.
  const v = layer.open(), turn = flip ? 3 : 0, shade = f.s * drift * 255, flags = k | look.flags | (k === UP ? hue.spin : 0);
  for (let i = 0; i < 4; i++) {
    const c = f.c[i], [u, t] = f.uv(c);
    layer.vertex(v + (i + turn) % 4, x + c[0], y + c[1], z + c[2], u, t, tile, cornerSky[i], shade * cornerShade[i], sway, look.glow, cornerR[i], cornerG[i], cornerB[i], wet, hue.r, hue.g, hue.b, flags);
  }
}
// A box that isn't a whole block lights itself from the brightest cell touching it, which is how a stair on a roof sees the sky.
function brightest(level, v) {
  return Math.max(level[v], level[v + 1], level[v - 1], level[v + W], level[v - W], level[v + AREA], v >= AREA ? level[v - AREA] : 0);
}
function box(layer, [x0, y0, z0, x1, y1, z1], x, y, z, v, look, hue) {
  const s = brightest(sky, v) * 17, lr = brightest(lampR, v) * 17, lg = brightest(lampG, v) * 17, lb = brightest(lampB, v) * 17;
  const lo = [x0 / 16, y0 / 16, z0 / 16], hi = [x1 / 16, y1 / 16, z1 / 16], wet = WET[vol[v]] ? waterAbove(v) : 0;
  FACES.forEach((f, k) => {
    const axis = f.d[0] ? 0 : f.d[1] ? 1 : 2, atEdge = f.d[axis] > 0 ? hi[axis] === 1 : lo[axis] === 0;
    if (atEdge && OPAQUE[vol[v + f.out]]) return;
    const q = layer.open(), tile = look.tiles[f.d[1] > 0 ? 0 : f.d[1] < 0 ? 2 : 1], shade = f.s * 255;
    for (let i = 0; i < 4; i++) {
      const c = f.c[i], px = c[0] ? hi[0] : lo[0], py = c[1] ? hi[1] : lo[1], pz = c[2] ? hi[2] : lo[2], [u, t] = f.uv([px, py, pz]);
      layer.vertex(q + i, x + px, y + py, z + pz, u, t, tile, s, shade, 0, look.glow, lr, lg, lb, wet, hue.r, hue.g, hue.b, k | look.flags);
    }
  });
}
function fence(layer, x, y, z, v, look, hue) {
  box(layer, FENCE_POST, x, y, z, v, look, hue);
  [-W, 1, W, -1].forEach((step, side) => {
    const next = vol[v + step];
    if (next === FENCE || OPAQUE[next]) for (const rail of FENCE_RAILS[side]) box(layer, rail, x, y, z, v, look, hue);
  });
}
// Two crossed planes, nudged off centre so that a field of grass doesn't stand in rows.
function cross(layer, x, y, z, v, wx, wz, look, hue) {
  const s = Math.max(sky[v], sky[v + AREA]) * 17, lr = lampR[v] * 17, lg = lampG[v] * 17, lb = lampB[v] * 17, tile = look.tiles[1], flags = CROSS_FACE | FLAG.FOLIAGE | look.flags, wet = WET[vol[v]] ? waterAbove(v) : 0;
  const ox = look.sway === 255 ? 0 : (hash3(wx, y, wz) - 0.5) * 0.36, oz = look.sway === 255 ? 0 : (hash3(wz, y, wx) - 0.5) * 0.36, tall = 1 + hash3(wx, 3, wz) * 0.16;
  for (const [ax, az, bx, bz] of [[0.1, 0.1, 0.9, 0.9], [0.1, 0.9, 0.9, 0.1]]) {
    const q = layer.open();
    layer.vertex(q, x + ax + ox, y, z + az + oz, 0, 1, tile, s, 210, 0, look.glow, lr, lg, lb, wet, hue.r, hue.g, hue.b, flags);
    layer.vertex(q + 1, x + ax + ox, y + tall, z + az + oz, 0, 0, tile, s, 255, look.sway, look.glow, lr, lg, lb, wet, hue.r, hue.g, hue.b, flags);
    layer.vertex(q + 2, x + bx + ox, y + tall, z + bz + oz, 1, 0, tile, s, 255, look.sway, look.glow, lr, lg, lb, wet, hue.r, hue.g, hue.b, flags);
    layer.vertex(q + 3, x + bx + ox, y, z + bz + oz, 1, 1, tile, s, 210, 0, look.glow, lr, lg, lb, wet, hue.r, hue.g, hue.b, flags);
  }
}

// ---------- water ----------
// How deep the water is under a surface block, in blocks. Shore corners average down towards nothing, and that is where the foam shows.
function waterDepth(v) {
  const i = v % AREA, y = Math.floor(v / AREA);
  if (depthMemoY[i] === y) return depthMemo[i];
  let n = 0;
  while (n < 12 && v - n * AREA >= 0 && WET[vol[v - n * AREA]]) n++;
  depthMemoY[i] = y;
  return (depthMemo[i] = n);
}
const cornerDepth = [0, 0, 0, 0];
function surfaceDepths(f, v) {
  for (let k = 0; k < 4; k++) {
    const c = f.c[k], stepX = c[0] ? 1 : -1, stepZ = c[2] ? W : -W;
    cornerDepth[k] = (waterDepth(v) + waterDepth(v + stepX) + waterDepth(v + stepZ) + waterDepth(v + stepX + stepZ)) / 4 * 21;
  }
}
function waterSide(k, x, y, z, v, surface) {
  const layer = layers[WATER_LAYER], f = FACES[k], q = layer.open(), front = v + f.out, s = Math.min(255, Math.max(sky[front], sky[v + AREA]) * 17), r = lampR[front] * 17, g = lampG[front] * 17, b = lampB[front] * 17;
  for (let i = 0; i < 4; i++) {
    const c = f.c[i], height = c[1] && surface ? SURFACE : c[1];
    layer.vertex(q + i, x + c[0], y + height, z + c[2], 0, 0, 0, s, SIDE_DEPTH, 0, 0, r, g, b, 0, 255, 255, 255, k);
  }
}
function waterTop(x, y, z, v) {
  const f = FACES[UP], front = v + AREA, s = sky[front];
  lightFace(f, front);
  surfaceDepths(f, v);
  if (evenFace() && cornerDepth[1] === cornerDepth[0] && cornerDepth[2] === cornerDepth[0] && cornerDepth[3] === cornerDepth[0]) { plan(x, z, WATER_LAYER, 0, 0, cornerDepth[0], 0, 0); return; }
  const layer = layers[WATER_LAYER], q = layer.open();
  for (let i = 0; i < 4; i++) {
    const c = f.c[i];
    layer.vertex(q + i, x + c[0], y + SURFACE, z + c[2], 0, 0, 0, Math.min(255, Math.max(cornerSky[i], s * 17)), cornerDepth[i], 255, 0, cornerR[i], cornerG[i], cornerB[i], 0, 255, 255, 255, UP);
  }
}
function waterCell(x, y, z, v) {
  const surface = !WET[vol[v + AREA]];
  for (let k = 0; k < 6; k++) {
    const f = FACES[k];
    if (y === 0 && f.d[1] < 0) continue;
    const n = vol[v + f.out];
    if (WET[n] || !(n === AIR || LOOK[n].passable)) continue;
    if (k === UP) waterTop(x, y, z, v); else waterSide(k, x, y, z, v, surface);
  }
}

// ---------- flat tops ----------
// Tops that are lit evenly are not written at once but planned, one layer of blocks at a time, then joined into rectangles. Grass drifts slowly in colour from column to
// column, and the corners of a rectangle carry the colours of the columns there, so the drift survives being joined.
const COLOUR_SLACK = 36;
let planKind, planTile, planFlags, planSky, planShade, planR, planG, planB, planWet, planGlow;
function makePlan() {
  const n = CS * CS;
  planKind = new Int8Array(n).fill(-1); planTile = new Int16Array(n); planFlags = new Uint8Array(n); planSky = new Float32Array(n); planShade = new Float32Array(n);
  planR = new Float32Array(n); planG = new Float32Array(n); planB = new Float32Array(n); planWet = new Uint8Array(n); planGlow = new Uint8Array(n);
}
function plan(x, z, kind, tile, flags, shade, wet, glow) {
  const c = x + z * CS;
  planKind[c] = kind; planTile[c] = tile; planFlags[c] = flags; planSky[c] = cornerSky[0]; planShade[c] = shade; planR[c] = cornerR[0]; planG[c] = cornerG[0]; planB[c] = cornerB[0]; planWet[c] = wet; planGlow[c] = glow;
}
const planned = (a, b, tint) => {
  if (planKind[b] !== planKind[a] || planTile[b] !== planTile[a] || planFlags[b] !== planFlags[a] || planSky[b] !== planSky[a] || planShade[b] !== planShade[a] || planR[b] !== planR[a] || planG[b] !== planG[a] || planB[b] !== planB[a] || planWet[b] !== planWet[a] || planGlow[b] !== planGlow[a]) return false;
  if (!tint || !(planFlags[a] & TINTED)) return true;
  const i = a * 3, j = b * 3;
  return Math.abs(tint[i] - tint[j]) + Math.abs(tint[i + 1] - tint[j + 1]) + Math.abs(tint[i + 2] - tint[j + 2]) <= COLOUR_SLACK;
};
const TINTED = 128; // only in the plan: the top takes the grass colour
function joinTops(y, grass) {
  const f = FACES[UP];
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const a = x + z * CS, kind = planKind[a];
    if (kind < 0) continue;
    let w = 1, d = 1;
    while (x + w < CS && planned(a, a + w, grass)) w++;
    grow: while (z + d < CS) {
      for (let i = 0; i < w; i++) if (!planned(a, x + i + (z + d) * CS, grass)) break grow;
      d++;
    }
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) planKind[x + i + (z + j) * CS] = -1;
    const layer = layers[kind], q = layer.open(), water = kind === WATER_LAYER, flags = planFlags[a] & ~TINTED, tinted = planFlags[a] & TINTED;
    for (let i = 0; i < 4; i++) {
      const c = f.c[i], px = x + c[0] * w, pz = z + c[2] * d, col = tinted ? (x + c[0] * (w - 1) + (z + c[2] * (d - 1)) * CS) * 3 : 0;
      const r = tinted ? grass[col] : 255, g = tinted ? grass[col + 1] : 255, b = tinted ? grass[col + 2] : 255;
      if (water) layer.vertex(q + i, px, y + SURFACE, pz, 0, 0, 0, planSky[a], planShade[a], 255, 0, planR[a], planG[a], planB[a], 0, 255, 255, 255, UP);
      else layer.vertex(q + i, px, y + 1, pz, c[0] * w, c[2] * d, planTile[a], planSky[a], planShade[a], 0, planGlow[a], planR[a], planG[a], planB[a], planWet[a], r, g, b, UP | flags);
    }
  }
}

// ---------- a chunk ----------
const hue = { r: 255, g: 255, b: 255, spin: 0 };
function layerRange(from, to, full, bx, bz, grass, leaves) {
  for (let y = from; y <= to; y++) {
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      if (full[y] && y > 0 && full[y - 1] && full[y + 1] && x > 0 && x < CS - 1 && z > 0 && z < CS - 1) continue;
      const v = cell(x, y, z), id = vol[v];
      if (id === AIR) continue;
      if (WET[id]) waterCell(x, y, z, v);
      if (id === WATER) continue;
      const look = LOOK[id], layer = layers[look.layer], column = x + z * CS, wx = bx + x, wz = bz + z;
      if (look.tint) {
        const tint = look.tint === 1 ? grass : leaves, at = column * 3;
        hue.r = tint[at]; hue.g = tint[at + 1]; hue.b = tint[at + 2];
      } else hue.r = hue.g = hue.b = 255;
      hue.spin = look.spin ? FLAG.SPIN : 0;
      if (look.cross) { cross(layer, x, y, z, v, wx, wz, look, hue); continue; }
      if (look.fence) { fence(layer, x, y, z, v, look, hue); continue; }
      if (look.boxes) { for (const b of look.boxes) box(layer, b, x, y, z, v, look, hue); continue; }
      // Solid blocks get their small differences from the shader, so that a merged top still shows them. Leaves sway and are never merged, so they keep them here.
      const drift = look.layer === SOLID_LAYER ? 1 : 0.95 + 0.05 * hash3(wx, y, wz);
      for (let k = 0; k < 6; k++) {
        const f = FACES[k];
        if (y === 0 && f.d[1] < 0) continue;
        const front = v + f.out, n = vol[front];
        if (OPAQUE[n] || n === id || (look.foliage && LOOK[n].foliage)) continue;
        const up = k === UP, wet = WET[n] ? waterAbove(front) : 0;
        lightFace(f, front);
        if (up && look.layer === SOLID_LAYER && look.tint !== 2 && evenFace()) {
          plan(x, z, SOLID_LAYER, look.tiles[0], look.flags | hue.spin | (look.tint === 1 ? TINTED : 0), f.s * 255 * cornerShade[0], wet, look.glow);
          continue;
        }
        cubeFace(layer, k, x, y, z, look, look.tiles[up ? 0 : f.d[1] < 0 ? 2 : 1], hue, look.sway, drift, wet);
      }
    }
    joinTops(y, grass);
  }
}
const harvest = () => {
  const out = [];
  layers.forEach((layer, i) => {
    const n = layer.quads * 4;
    if (n) out.push({ layer: i, quads: layer.quads, low: layer.low, high: layer.high, cell: layer.cell.slice(0, n * 6), info: layer.info.slice(0, n * 12) });
    layer.clear();
  });
  return out;
};
// Cave walls cost triangles whether or not anyone can see them, so what lies well below a chunk's lowest ground is a second mesh, drawn only with the camera underground.
function lowestGround() {
  let lowest = top;
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    let y = lowest;
    while (y > 0 && !OPAQUE[vol[cell(x, y, z)]]) y--;
    if (y < lowest) lowest = y;
  }
  return lowest;
}
// Which faces of each section can reach which, for view/culling.js. Above the highest block it is all open sky.
function sectionLinks() {
  const rows = H / SECTION, links = new Uint8Array(rows * 6);
  for (let s = 0; s < rows; s++) {
    if (s * SECTION > top) links.fill(ALL_FACES, s * 6, (s + 1) * 6);
    else linkSection(vol, OPAQUE, cell(0, s * SECTION, 0), 1, AREA, W, links, s * 6);
  }
  return links;
}
// `volume` holds the chunk and its margin, with `height` the highest layer anything is in. Hands back the two meshes and what the view needs to know to skip them.
export function meshVolume({ volume, height, cx, cz, grass, leaves }) {
  vol = volume; top = height;
  if (!planKind) makePlan();
  lightSky(); lightLamps();
  depthMemoY.fill(-1);
  const bx = cx * CS, bz = cz * CS, full = new Uint8Array(top + 3);
  for (let y = 0; y <= top; y++) {
    let whole = 1;
    rows: for (let z = 0; z < CS; z++) { const row = cell(0, y, z); for (let x = 0; x < CS; x++) if (!OPAQUE[vol[row + x]]) { whole = 0; break rows; } }
    full[y] = whole;
  }
  const ground = lowestGround(), cut = Math.max(1, ground - DEEP_MARGIN);
  layerRange(cut, top, full, bx, bz, grass, leaves);
  const upper = harvest();
  layerRange(0, cut - 1, full, bx, bz, grass, leaves);
  return { upper, deep: harvest(), links: sectionLinks() };
}

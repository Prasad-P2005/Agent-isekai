// Draws the cave designs from the real generator, to look over before it goes into the world: node tools/cave_designs.mjs [what]
// Nothing here touches a save. It builds a piece of the deeper world in memory, and a small voxel renderer lights it with the game's own
// formula from view/materials.js. Everything lands in docs/caves/.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { BL, ID } from '../client/js/sim/blocks.js';
import { CAVE_BIOMES, carveDeep, forgetCaves, hallAt } from '../client/js/sim/caves.js';
import { NZ, fbm, initNoise, ss } from '../client/js/sim/noise.js';
import { genChunk, heightAt, setWorldData } from '../client/js/sim/terrain.js';
import { TILE, tilePixels } from '../client/js/view/blocktex.js';

const ROOT = new URL('../', import.meta.url), OUT = new URL('docs/caves/', ROOT);
const CS = 16, SEA = 112, HEIGHT = 224, SEED = 7321;
const { Air, Water, Stone, Dirt, Grass, Bedrock, Sand, Snow, Magma } = ID;

// ---------- a plain piece of land to dig under: the real one's shape, without its towns ----------
const heightOf = (x, z) => {
  const hills = fbm(NZ.H, x / 150, z / 150, 4), peak = ss(0.2, 0.7, NZ.M(x / 420, z / 420));
  return Math.round(SEA + 7 + hills * 13 + peak * peak * 58 * (0.6 + 0.4 * fbm(NZ.F, x / 40, z / 40, 3)));
};
function makeChunk(cx, cz, biomeAt) {
  const d = new Uint8Array(CS * CS * HEIGHT), h = new Int16Array(CS * CS);
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = cx * CS + x, wz = cz * CS + z, top = heightOf(wx, wz);
    h[x + z * CS] = top;
    d[x + z * CS] = Bedrock;
    for (let y = 1; y <= top; y++) d[x + z * CS + y * CS * CS] = y === top ? (top <= SEA + 1 ? Sand : top > SEA + 46 ? Snow : Grass) : y > top - 4 ? Dirt : Stone;
    for (let y = top + 1; y <= SEA; y++) d[x + z * CS + y * CS * CS] = Water;
  }
  carveDeep(cx, cz, d, { h }, { sea: SEA, height: HEIGHT, biomeAt, surfaceAt: (x, z) => heightOf(Math.round(x), Math.round(z)), steepAt: (x, z) => Math.abs(heightOf(x + 1, z) - heightOf(x - 1, z)) + Math.abs(heightOf(x, z + 1) - heightOf(x, z - 1)) >= 6 });
  return d;
}
class Volume {
  constructor(x0, z0, chunks, gen) {
    Object.assign(this, { x0, z0, w: chunks * CS, d: chunks * CS, h: HEIGHT });
    this.v = new Uint8Array(this.w * this.d * HEIGHT);
    for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
      const c = gen(Math.floor(x0 / CS) + cx, Math.floor(z0 / CS) + cz), layers = c.length / (CS * CS);
      for (let y = 0; y < layers; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) this.v[this.i(cx * CS + x, y, cz * CS + z)] = c[x + z * CS + y * CS * CS];
    }
  }
  i(x, y, z) { return x + z * this.w + y * this.w * this.d; }
  at(x, y, z) { return x < 0 || y < 0 || z < 0 || x >= this.w || y >= HEIGHT || z >= this.d ? 1 : this.v[this.i(x, y, z)]; }
  // Sky straight down and sideways, and each block's own light by its colour, a flood per channel as the mesher does it once.
  light() {
    const { w, d, v } = this, size = v.length, channels = [0, 1, 2].map(() => new Uint8Array(size)), sky = new Uint8Array(size), layer = w * d;
    const clear = id => id === Air || id === Water || BL[id].passable || BL[id].shape;
    const flood = (field, seeds, straight) => {
      const buckets = Array.from({ length: 16 }, () => []);
      for (const [p, level] of seeds) { if (field[p] < level) { field[p] = level; buckets[level].push(p); } }
      for (let level = 15; level > 0; level--) for (const p of buckets[level]) {
        if (field[p] !== level) continue;
        const x = p % w, z = Math.floor(p / w) % d;
        for (const [q, ok] of [[p - 1, x > 0], [p + 1, x < w - 1], [p - w, z > 0], [p + w, z < d - 1], [p - layer, p >= layer], [p + layer, p + layer < size]]) {
          if (!ok || !clear(v[q])) continue;
          const next = straight && q === p - layer && level === 15 ? 15 : level - 1;
          if (next > field[q]) { field[q] = next; buckets[next].push(q); }
        }
      }
    };
    const sun = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) sun.push([this.i(x, HEIGHT - 1, z), 15]);
    flood(sky, sun, true);
    const lamps = [[], [], []];
    for (let p = 0; p < size; p++) {
      const b = BL[v[p]];
      if (!b?.emit) continue;
      const c = b.side ?? b.top, peak = Math.max(...c, 0.01);
      c.forEach((value, n) => lamps[n].push([p, Math.round(b.emit * value / peak)]));
    }
    channels.forEach((field, n) => flood(field, lamps[n], false));
    Object.assign(this, { sky, lamp: channels });
    return this;
  }
}

// ---------- the renderer: one ray a pixel through the blocks, lit as view/materials.js lights them ----------
const DAY = [1, 0.98, 0.92], SKY = [0.55, 0.74, 0.93], WATER_TINT = [0.42, 0.66, 0.74];
// The air of each biome: what the rock shows with no lamp near, and the haze that far walls fade into. This is the one thing the game does not do yet.
const AIR = {
  crystal: { floor: [0.13, 0.2, 0.34], haze: [0.11, 0.2, 0.38] }, fungal: { floor: [0.12, 0.2, 0.24], haze: [0.08, 0.2, 0.24] }, verdant: { floor: [0.14, 0.22, 0.15], haze: [0.14, 0.26, 0.2] },
  marble: { floor: [0.84, 0.82, 0.78], haze: [0.7, 0.67, 0.6] }, drip: { floor: [0.5, 0.45, 0.38], haze: [0.3, 0.26, 0.21] }, plain: { floor: [0.09, 0.095, 0.115], haze: [0.012, 0.013, 0.02] }, frozen: { floor: [0.2, 0.3, 0.42], haze: [0.3, 0.44, 0.58] }, ember: { floor: [0.3, 0.13, 0.1], haze: [0.36, 0.11, 0.05] },
};
let air = AIR.crystal, torch = 0; // the hero's own light, for places nothing else lights
const texCache = new Map();
function faceTile(id, face) {
  const key = id * 4 + face;
  if (texCache.has(key)) return texCache.get(key);
  const tex = [].concat(BL[id].tex ?? 'stone'), name = face === 0 ? tex[0] : face === 2 ? (tex[2] ?? tex[1] ?? tex[0]) : (tex[1] ?? tex[0]), px = tilePixels(name);
  texCache.set(key, px);
  return px;
}
function shade(V, albedo, lx, ly, lz, ao, glow, n, t = 0) {
  // the air the face looks into, and its neighbours, so that the light does not come in hard blocks
  const p = V.i(Math.max(0, Math.min(V.w - 1, lx)), Math.max(0, Math.min(HEIGHT - 1, ly)), Math.max(0, Math.min(V.d - 1, lz)));
  const sky = (V.sky[p] / 15) ** 2 * (0.35 + 0.65 * V.sky[p] / 15), out = [0, 0, 0], held = torch ? Math.max(0, 1 - t / torch) ** 2 : 0;
  for (let c = 0; c < 3; c++) {
    const lamp = Math.min(1, (V.lamp[c][p] / 15) ** 2 * 1.3 + held * [1, 0.9, 0.74][c]), light = 1 - (1 - DAY[c] * sky) * (1 - lamp) * (1 - air.floor[c]);
    out[c] = albedo[c] * Math.max(light * ao * n, glow);
  }
  return out;
}
const solidAt = (V, x, y, z) => { const id = V.at(x, y, z); return id !== Air && id !== Water && !BL[id]?.passable && !BL[id]?.shape; };
function occlusion(V, cx, cy, cz, axis, u, v) {
  // four corners of the face, each darkened by what stands around it, blended over the face
  const uu = axis === 0 ? [0, 1, 0] : [1, 0, 0], vv = axis === 2 ? [0, 1, 0] : [0, 0, 1], corner = (a, b) => {
    const s = solidAt(V, cx + uu[0] * a, cy + uu[1] * a, cz + uu[2] * a), t = solidAt(V, cx + vv[0] * b, cy + vv[1] * b, cz + vv[2] * b), both = solidAt(V, cx + uu[0] * a + vv[0] * b, cy + uu[1] * a + vv[1] * b, cz + uu[2] * a + vv[2] * b);
    return s && t ? 0.45 : 1 - (s + t + both) * 0.17;
  };
  const a = corner(-1, -1), b = corner(1, -1), c = corner(-1, 1), d = corner(1, 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function trace(V, ox, oy, oz, dx, dy, dz, range) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz), ix = Math.abs(1 / dx), iy = Math.abs(1 / dy), iz = Math.abs(1 / dz);
  let tx = (sx > 0 ? x + 1 - ox : ox - x) * ix, ty = (sy > 0 ? y + 1 - oy : oy - y) * iy, tz = (sz > 0 ? z + 1 - oz : oz - z) * iz, t = 0, axis = 1, wet = 0;
  let px = x, py = y, pz = z;
  for (let n = 0; n < range * 2; n++) {
    const id = V.at(x, y, z);
    if (id === Water) wet += 1;
    else if (id !== Air) {
      const b = BL[id];
      const box = BOXES[b.shape];
      if (box) {
        const hit = boxHit(ox, oy, oz, dx, dy, dz, x, y, z, box);
        if (hit != null) { const tile = faceTile(id, 1), rgb = [tile[0] / 255, tile[1] / 255, tile[2] / 255].map(v => v * (b.glow ? 1.15 : 0.8)); return { rgb, t: hit, wet }; }
      } else if (b.shape === 'cross' || b.passable) { // two crossed planes, tested against the tile's holes
        const px2 = tilePixels([].concat(b.tex)[0]), hit = cross(px2, ox, oy, oz, dx, dy, dz, x, y, z, t);
        if (hit) return { rgb: shade(V, hit, x, y, z, 1, (b.glow ?? 0) * 0.9, 0.92, t), t, wet };
      } else {
        if (t > 400) break;
        const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
        const u = axis === 0 ? hz - Math.floor(hz) : hx - Math.floor(hx), v = axis === 1 ? hz - Math.floor(hz) : 1 - (hy - Math.floor(hy));
        const face = axis !== 1 ? 1 : dy < 0 ? 0 : 2, tile = faceTile(id, face), k = (Math.min(TILE - 1, Math.floor(u * TILE)) + Math.min(TILE - 1, Math.floor(v * TILE)) * TILE) * 4;
        const tinted = b.tint && tile[k + 3] > 200, albedo = [0, 1, 2].map(c => tile[k + c] / 255 * (tinted ? b.top[c] * 1.3 : 1));
        const n3 = axis === 1 ? (dy < 0 ? 1 : 0.62) : axis === 0 ? 0.8 : 0.72;
        return { rgb: shade(V, albedo, px, py, pz, occlusion(V, px, py, pz, axis, u, axis === 1 ? hz - Math.floor(hz) : hy - Math.floor(hy)), (b.glow ?? 0) * 0.95, n3, t), t, wet };
      }
    }
    px = x; py = y; pz = z;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += ix; axis = 0; } else if (ty < tz) { y += sy; t = ty; ty += iy; axis = 1; } else { z += sz; t = tz; tz += iz; axis = 2; }
    if (t > range) break;
    if (y >= HEIGHT) return { rgb: SKY, t: 9999, wet };
  }
  return { rgb: V.sky[V.i(Math.max(0, Math.min(V.w - 1, x)), Math.max(0, Math.min(HEIGHT - 1, y)), Math.max(0, Math.min(V.d - 1, z)))] > 12 ? SKY : air.haze, t: range, wet, far: true };
}
const BOXES = { lantern: [5, 2, 5, 11, 12, 11], crystal_tip: [4, 0, 4, 12, 15, 12] };
function boxHit(ox, oy, oz, dx, dy, dz, cx, cy, cz, b) {
  let near = 0, far = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz], c = [cx, cy, cz];
  for (let i = 0; i < 3; i++) {
    const inv = 1 / d[i];
    let a = (c[i] + b[i] / 16 - o[i]) * inv, e = (c[i] + b[i + 3] / 16 - o[i]) * inv;
    if (a > e) [a, e] = [e, a];
    near = Math.max(near, a); far = Math.min(far, e);
  }
  return near <= far ? near : null;
}
function cross(tile, ox, oy, oz, dx, dy, dz, cx, cy, cz, t0) {
  let best = null, bestT = 1e9;
  for (const [a, b] of [[1, 1], [1, -1]]) { // the planes x + z = c and x - z = c through the middle of the block
    const denom = dx * a + dz * b;
    if (Math.abs(denom) < 1e-5) continue;
    const c = (cx + 0.5) * a + (cz + 0.5) * b, t = (c - ox * a - oz * b) / denom;
    if (t < t0 || t >= bestT) continue;
    const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
    if (hx < cx || hx >= cx + 1 || hz < cz || hz >= cz + 1 || hy < cy || hy >= cy + 1) continue;
    const u = hx - cx, v = 1 - (hy - cy), k = (Math.min(TILE - 1, Math.floor(u * TILE)) + Math.min(TILE - 1, Math.floor(v * TILE)) * TILE) * 4;
    if (tile[k + 3] < 100) continue;
    bestT = t; best = [tile[k] / 255, tile[k + 1] / 255, tile[k + 2] / 255];
  }
  return best;
}
function render(V, cam, w, h, range = 210) {
  const px = new Uint8Array(w * h * 3), cosP = Math.cos(cam.pitch), sinP = Math.sin(cam.pitch), cosY = Math.cos(cam.yaw), sinY = Math.sin(cam.yaw), focal = 0.5 * h / Math.tan(cam.fov / 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = (i - w / 2) / focal, b = (h / 2 - j) / focal, fx = -sinY * cosP, fy = sinP, fz = -cosY * cosP, rx = cosY, rz = -sinY, ux = sinY * sinP, uy = cosP, uz = cosY * sinP;
    let dx = fx + rx * a + ux * b, dy = fy + uy * b, dz = fz + rz * a + uz * b;
    const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
    const hit = trace(V, cam.x, cam.y, cam.z, dx || 1e-6, dy || 1e-6, dz || 1e-6, range), fog = hit.t > 9000 ? 0 : 0.92 * ss(range * 0.1, range * 0.92, hit.t), k = (i + j * w) * 3;
    for (let c = 0; c < 3; c++) {
      const wet = hit.wet ? WATER_TINT[c] ** Math.min(4, 1 + hit.wet / 8) : 1, v = (hit.rgb[c] * wet) * (1 - fog) + air.haze[c] * fog;
      px[k + c] = Math.round(255 * Math.min(1, Math.max(0, v)));
    }
  }
  return { w, h, px };
}

// ---------- pictures ----------
const TABLE = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function savePng(name, { w, h, px }) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(px.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1);
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(t)); return Buffer.concat([len, t, crc]); };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  writeFileSync(new URL(name, OUT), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(name, `${w} x ${h}`);
}
const FONT = {
  ' ': [0, 0, 0, 0, 0], A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01], G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f], I: [0x00, 0x41, 0x7f, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40], M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63], Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43], 0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0x00, 0x42, 0x7f, 0x40, 0x00], 2: [0x42, 0x61, 0x51, 0x49, 0x46],
  3: [0x21, 0x41, 0x45, 0x4b, 0x31], 4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39], 6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03], 8: [0x36, 0x49, 0x49, 0x49, 0x36],
  9: [0x06, 0x49, 0x49, 0x29, 0x1e], "'": [0, 0, 0x07, 0, 0], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '.': [0, 0x60, 0x60, 0, 0], ',': [0, 0x80, 0x60, 0, 0], ':': [0, 0x36, 0x36, 0, 0],
};
function text(img, s, x, y, c = [255, 244, 230], scale = 2, shadow = true) {
  const dot = (a, b, col) => { for (let u = 0; u < scale; u++) for (let v = 0; v < scale; v++) { const k = (a + u + (b + v) * img.w) * 3; if (k >= 0 && k < img.px.length) img.px.set(col, k); } };
  for (const ch of s.toUpperCase()) {
    for (let col = 0; col < 5; col++) for (let row = 0; row < 7; row++) if ((FONT[ch] ?? FONT[' '])[col] >> row & 1) {
      if (shadow) dot(x + col * scale + scale, y + row * scale + scale, [24, 22, 36]);
      dot(x + col * scale, y + row * scale, c);
    }
    x += 6 * scale;
  }
}

// ---------- a place to stand: the spot on a floor whose whole view is the most open, looking a little upward ----------
function reach(V, x, y, z, dx, dy, dz, most = 180) {
  for (let t = 3; t < most; t += 3) { const id = V.at(Math.floor(x + dx * t), Math.floor(y + dy * t), Math.floor(z + dz * t)); if (id !== Air && !BL[id]?.passable) return t; }
  return most;
}
function bestView(V, avoid = 40) {
  let best = null;
  for (let z = avoid; z < V.d - avoid; z += 8) for (let x = avoid; x < V.w - avoid; x += 8) {
    let run = 0, floor = 0, biggest = 0, spot = 0;
    for (let y = 14; y < 118; y++) { if (V.at(x, y, z) === Air) { if (!run) floor = y; run++; if (run > biggest) { biggest = run; spot = floor; } } else run = 0; }
    if (biggest < 24) continue;
    const eye = spot + 5 + Math.min(biggest * 0.12, 8);
    for (let a = 0; a < 12; a++) {
      const yaw = a / 12 * Math.PI * 2;
      let open = 0, near = 999;
      for (const side of [-0.5, -0.25, 0, 0.25, 0.5]) for (const lift of [0.02, 0.2, 0.42]) {
        const c = Math.cos(lift), t = reach(V, x, eye, z, -Math.sin(yaw + side) * c, Math.sin(lift), -Math.cos(yaw + side) * c);
        open += Math.min(t, 150); near = Math.min(near, t);
      }
      const score = open / 15 + Math.min(near, 30) * 1.6 + biggest * 0.5;
      if (!best || score > best.score) best = { score, x: x + 0.5, y: eye, z: z + 0.5, yaw, far: reach(V, x, eye, z, -Math.sin(yaw), 0, -Math.cos(yaw)), tall: biggest };
    }
  }
  return best;
}
// Stands a tiny figure on the floor ahead, two blocks tall as the hero is, because nothing else says how big this is.
function placeHero(V, cam) {
  const dx = -Math.sin(cam.yaw), dz = -Math.cos(cam.yaw), t = Math.min(cam.far * 0.5, 22), x = Math.floor(cam.x + dx * t), z = Math.floor(cam.z + dz * t);
  let y = Math.floor(cam.y);
  while (y > 4 && V.at(x, y - 1, z) === Air) y--;
  V.v[V.i(x, y, z)] = ID.RedWool; V.v[V.i(x, y + 1, z)] = ID.Plaster;
  return { x, y, z };
}
const biomeField = (x, z) => CAVE_BIOMES[Math.floor(ss(-0.6, 0.6, NZ.BIOME(x / 190, z / 190) * 0.8 + 0.3 * NZ.BIOME(x / 61, z / 61)) * 6.999)];
function findHall(step = 32) {
  let best = null, score = -1;
  for (let z = 0; z < 6000; z += step) for (let x = 0; x < 6000; x += step) {
    const hall = hallAt(x, z);
    if (!hall) continue;
    let width = 0;
    for (const [a, b] of [[-90, 0], [90, 0], [0, -90], [0, 90], [-60, -60], [60, 60], [-60, 60], [60, -60]]) if (hallAt(x + a, z + b)) width++;
    const s = hall.m + width + (hall.ceil - hall.floor) / 100;
    if (s > score) { score = s; best = { x, z }; }
  }
  return best;
}

// ---------- the sheets ----------
const VIEWS = {
  crystal: 'Crystal Cathedral', fungal: 'Fungal Grotto', verdant: 'Verdant Hollow', marble: 'Marble Halls', drip: 'Dripstone Depths', frozen: 'Frozen Vault', ember: 'Ember Deeps',
};
function biomeView(biome, n, hallSpot) {
  air = AIR[biome];
  const V = new Volume(hallSpot.x - 192, hallSpot.z - 192, 24, (cx, cz) => makeChunk(cx, cz, () => biome)).light(), cam = bestView(V);
  if (!cam) { console.log('no hall for', biome); return; }
  const hero = placeHero(V, cam);
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -1; c <= 3; c++) { const p = V.i(hero.x + a, hero.y + c, hero.z + b); V.lamp.forEach(f => { f[p] = Math.max(f[p], 11); }); }
  const pitch = 0.2, img = render(V, { ...cam, pitch, fov: 1.3 }, 960, 540);
  text(img, VIEWS[biome], 16, 14, [250, 193, 60], 3);
  text(img, `${Math.round(cam.far)} blocks to the far wall, ${cam.tall} tall. The red speck is the hero, 2 blocks tall.`, 16, 42, [255, 244, 230], 1);
  savePng(`${n}-${biome}.png`, img);
}
// A place on the floor of a passage: open along a line, close on both sides of it, with head room.
function passageSpot(V, low, high) {
  let best = null;
  for (let y = 60; y < 112; y++) for (let z = 40; z < V.d - 40; z += 3) for (let x = 40; x < V.w - 40; x += 3) {
    if (V.at(x, y, z) !== Air || BL[V.at(x, y - 1, z)]?.passable || V.at(x, y - 1, z) === Air || V.at(x, y - 1, z) === Water) continue;
    const tall = reach2(V, x, y, z, 0, 1, 0);
    if (tall < 3 || tall > high + 3) continue;
    for (let a = 0; a < 8; a++) {
      const yaw = a / 8 * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw), left = reach2(V, x, y + 1, z, dz, 0, -dx), right = reach2(V, x, y + 1, z, -dz, 0, dx), wide = left + right - 1;
      if (wide < low || wide > high || Math.abs(left - right) > 1) continue;
      const ahead = reach2(V, x, y + 1, z, dx, 0, dz, 40);
      if (ahead < 14) continue;
      let ore = 0;
      for (let t = 2; t < 18; t += 2) for (const [a2, b2] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-5, 2], [5, 2], [-5, -2], [5, -2], [2, 5], [-2, 5]]) { const id = V.at(Math.floor(x + dx * t + dz * a2), y + b2, Math.floor(z + dz * t - dx * a2)); if (/Ore$/.test(BL[id]?.name ?? '')) ore++; }
      const score = ore * 6 + Math.min(ahead, 30);
      if (!best || score > best.score) best = { score, ahead, x: x + 0.5, y: y + 1.6, z: z + 0.5, yaw, wide, tall, far: ahead };
    }
  }
  return best;
}
function reach2(V, x, y, z, dx, dy, dz, most = 16) {
  for (let t = 1; t < most; t++) if (V.at(Math.floor(x + 0.5 + dx * t), Math.floor(y + 0.5 + dy * t), Math.floor(z + 0.5 + dz * t)) !== Air) return t;
  return most;
}
function passageView(file, title, low, high, spot) {
  air = AIR.plain; torch = 34;
  const V = new Volume(spot.x, spot.z, 24, (cx, cz) => makeChunk(cx, cz, biomeField)).light(), cam = passageSpot(V, low, high);
  if (!cam) { console.log('no passage for', title); torch = 0; return; }
  const img = render(V, { ...cam, pitch: 0.02, fov: 1.35 }, 960, 540, 90);
  text(img, title, 16, 14, [250, 193, 60], 3);
  text(img, `${cam.wide} wide and ${cam.tall} tall here. Lit by a torch in the hero's hand. Up here it is plain rock and ore: the biomes are deeper.`, 16, 42, [255, 244, 230], 1);
  savePng(file, img);
  torch = 0;
}
// The crystals the story sends you for, standing in the real world on the real seed, at noon.
function dragonspine(file) {
  const world = JSON.parse(readFileSync(new URL('tests/client/world.json', ROOT)));
  initNoise(world.seed); setWorldData(world);
  const lz = world.lands.findIndex(r => r.some(l => l.structure === 'crystal_spire')), lx = world.lands[lz].findIndex(l => l.structure === 'crystal_spire'), cx = lx * 128 + 64, cz = lz * 128 + 64;
  air = { floor: [0.3, 0.32, 0.36], haze: SKY };
  const V = new Volume(cx - 128, cz - 128, 16, (a, b) => genChunk(a, b)).light(), middle = 128;
  let top = HEIGHT - 1;
  while (top > 0 && V.at(middle, top, middle) === Air) top--;
  // Walks round the spire until something stands with a clear view of it, a little below the tip.
  const aim = [middle, top - 15, middle];
  let cam = null;
  for (const away of [36, 42, 30, 48]) for (let a = 0; a < 48 && !cam; a++) {
    const yaw = a / 48 * Math.PI * 2, x = middle + Math.sin(yaw) * away, z = middle + Math.cos(yaw) * away;
    let y = HEIGHT - 1;
    while (y > 0 && V.at(Math.floor(x), y, Math.floor(z)) === Air) y--;
    y += 3;
    const to = [aim[0] - x, aim[1] - y, aim[2] - z], far = Math.hypot(...to);
    let open = true;
    for (let t = 2; t < far - 8 && open; t++) if (V.at(Math.floor(x + to[0] * t / far), Math.floor(y + to[1] * t / far), Math.floor(z + to[2] * t / far)) !== Air) open = false;
    if (open) cam = { x, y, z, yaw, pitch: Math.asin(to[1] / far) };
  }
  if (!cam) { console.log('no clear view of the spire'); return; }
  const img = render(V, { ...cam, fov: 1.3 }, 960, 540, 300);
  text(img, 'A Crystal Spire in the Dragonspine', 16, 14, [250, 193, 60], 3);
  text(img, 'The real terrain on the real seed, with the new shards.', 16, 42, [40, 36, 54], 1, false);
  savePng(file, img);
}
// ---------- can you walk it? A flood from the open air by the hero's own limits (sim/player.js): up one block, down five, any distance into water, up through water ----------
const FALL_SAFE = 5, FORMATION = new Set([ID.ManaCrystal, ID.ManaShard, ID.AmethystBlock, ID.MushroomCap, ID.MushroomStem, ID.BlueIce, ID.Ice, ID.Fence, ID.OakLog, ID.Lantern]);
function walkable(V, groundOf = heightOf) {
  const clear = (x, y, z) => { const id = V.at(x, y, z); return id === Air || id === Water || BL[id]?.passable; };
  const climb = id => BL[id]?.climbable || id === ID.HangingRoots || id === ID.GlowVine;
  const stands = (x, y, z) => clear(x, y, z) && clear(x, y + 1, z) && (!clear(x, y - 1, z) || V.at(x, y, z) === Water || climb(V.at(x, y, z)));
  const safeGround = (x, y, z) => V.at(x, y - 1, z) !== Magma && V.at(x, y, z) !== Magma;
  const next = (x, y, z, out) => {
    out.length = 0;
    const here = V.at(x, y, z);
    if (here === Water || climb(here)) { if (clear(x, y + 1, z) && (V.at(x, y + 1, z) === Water || climb(V.at(x, y + 1, z)) || stands(x, y + 1, z))) out.push(x, y + 1, z); }
    if (climb(here) && clear(x, y - 1, z)) out.push(x, y - 1, z);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + a, nz = z + b;
      if (clear(nx, y, nz) && clear(nx, y + 1, nz)) {
        let ly = y;
        while (ly > 1 && clear(nx, ly - 1, nz) && V.at(nx, ly, nz) !== Water && !climb(V.at(nx, ly, nz))) ly--;
        if ((y - ly <= FALL_SAFE || V.at(nx, ly, nz) === Water) && safeGround(nx, ly, nz)) out.push(nx, ly, nz);
      } else if (clear(nx, y + 1, nz) && clear(nx, y + 2, nz) && clear(x, y + 2, z) && safeGround(nx, y + 1, nz)) out.push(nx, y + 1, nz);
    }
  };
  // Everything that starts on the open ground, and everywhere it can get to.
  const size = V.v.length, seen = new Uint8Array(size), queue = new Int32Array(size), out = [];
  const edgesFrom = [], edgesTo = [];
  let head = 0, tail = 0;
  const key = (x, y, z) => V.i(x, y, z), un = p => { const y = Math.floor(p / (V.w * V.d)), r = p - y * V.w * V.d; return [r % V.w, y, Math.floor(r / V.w)]; };
  const surface = (x, y, z) => y >= groundOf(V.x0Chunk + x, V.z0Chunk + z);
  for (let z = 0; z < V.d; z++) for (let x = 0; x < V.w; x++) {
    for (let y = HEIGHT - 3; y > 80; y--) if (stands(x, y, z) && surface(x, y, z) && V.at(x, y, z) !== Water) { const p = key(x, y, z); if (!seen[p]) { seen[p] = 1; queue[tail++] = p; } break; }
  }
  const starts = tail;
  while (head < tail) {
    const [x, y, z] = un(queue[head++]);
    next(x, y, z, out);
    for (let i = 0; i < out.length; i += 3) {
      if (out[i] < 0 || out[i + 2] < 0 || out[i] >= V.w || out[i + 2] >= V.d) continue;
      const q = key(out[i], out[i + 1], out[i + 2]);
      edgesFrom.push(q); edgesTo.push(queue[head - 1]); // kept backwards, to ask afterwards who can get home
      if (!seen[q]) { seen[q] = 1; queue[tail++] = q; }
    }
  }
  // Home: walk the same steps in reverse from the open ground.
  const first = new Int32Array(size).fill(-1), link = new Int32Array(edgesFrom.length);
  for (let i = 0; i < edgesFrom.length; i++) { link[i] = first[edgesFrom[i]]; first[edgesFrom[i]] = i; }
  const home = new Uint8Array(size), back = new Int32Array(tail);
  let h2 = 0, t2 = 0;
  for (let i = 0; i < starts; i++) { home[queue[i]] = 1; back[t2++] = queue[i]; }
  while (h2 < t2) { const p = back[h2++]; for (let e = first[p]; e >= 0; e = link[e]) { const q = edgesTo[e]; if (!home[q]) { home[q] = 1; back[t2++] = q; } } }
  // How much of what is down there that adds up to.
  let cave = 0, reached = 0, returned = 0, hall = 0, hallReached = 0;
  const seenFloor = new Uint8Array(V.w * V.d), map = new Uint8Array(V.w * V.d);
  for (let z = 0; z < V.d; z++) for (let x = 0; x < V.w; x++) {
    const top = groundOf(V.x0Chunk + x, V.z0Chunk + z) - 6, h = hallAt(V.x0Chunk + x, V.z0Chunk + z);
    for (let y = 4; y < top; y++) {
      if (!stands(x, y, z) || V.at(x, y, z) === Water) continue;
      if (FORMATION.has(V.at(x, y - 1, z))) continue; // the top of a spike is not a floor anyone needs
      const p = key(x, y, z), isHall = h && y < h.floor + 10;
      cave++; if (isHall) hall++;
      if (seen[p]) { reached++; if (isHall) hallReached++; if (home[p]) returned++; }
      map[x + z * V.w] = Math.max(map[x + z * V.w], seen[p] ? (home[p] ? 3 : 2) : 1);
    }
    void seenFloor;
  }
  return { cave, reached, returned, hall, hallReached, map };
}
function walkReport(file, biomeAt) {
  air = AIR.plain;
  const size = 28, x0 = spot.x - 224, z0 = spot.z - 224, V = new Volume(x0, z0, size, (cx, cz) => makeChunk(cx, cz, biomeAt));
  V.x0Chunk = Math.floor(x0 / CS) * CS; V.z0Chunk = Math.floor(z0 / CS) * CS;
  const r = walkable(V);
  const pct = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(1)}%`, scale = 2, w = V.w * scale, h = V.d * scale + 70, px = new Uint8Array(w * h * 3).fill(40);
  const COL = [[0.2, 0.2, 0.25], [0.78, 0.22, 0.22], [0.92, 0.66, 0.2], [0.3, 0.8, 0.42]];
  for (let z = 0; z < V.d; z++) for (let x = 0; x < V.w; x++) for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) px.set(COL[r.map[x + z * V.w]].map(v => v * 255), (x * scale + a + (z * scale + b + 70) * w) * 3);
  const img = { w, h, px };
  text(img, 'Where the hero can walk', 12, 8, [250, 193, 60], 3);
  text(img, `Green: walk there and back. Amber: there, but needs a dig or ladder home. Red: not on foot. ${pct(r.reached, r.cave)} of cave floor reached, ${pct(r.returned, r.reached)} of that with a way home.`, 12, 38, [255, 244, 230], 1);
  text(img, `Halls: ${pct(r.hallReached, r.hall)} of hall floor reached. Tested with step 1, fall ${FALL_SAFE}, no tools, no digging.`, 12, 52, [255, 244, 230], 1);
  savePng(file, img);
  console.log(`walk: cave floor reached ${pct(r.reached, r.cave)}, home from there ${pct(r.returned, r.reached)}, hall floor reached ${pct(r.hallReached, r.hall)} (${r.cave} floor cells)`);
}
// The Old Ways, seen from the road itself.
function roadView(file, title, biome, wantOpen) {
  air = AIR[biome]; torch = wantOpen ? 0 : 22;
  const V = new Volume(spot.x - 192, spot.z - 192, 24, (cx, cz) => makeChunk(cx, cz, () => (biome === 'plain' ? 'drip' : biome))).light();
  let best = null;
  const DIRS = [[0, 0, -1], [Math.PI / 2, -1, 0], [Math.PI, 0, 1], [-Math.PI / 2, 1, 0]];
  for (let z = 40; z < V.d - 40; z++) for (let x = 40; x < V.w - 40; x++) for (let y = 14; y < 112; y++) {
    if (V.at(x, y, z) !== ID.Planks || V.at(x, y + 1, z) !== Air || V.at(x, y + 2, z) !== Air) continue;
    for (const [yaw, dx, dz] of DIRS) {
      let run = 0;
      if (wantOpen) { // a walkway between two rails, high enough to feel it
        while (run < 70 && V.at(x + dx * run, y + 1, z + dz * run) === Air && V.at(x + dz * 2 + dx * run, y + 1, z + dx * 2 + dz * run) === ID.Fence && V.at(x - dz * 2 + dx * run, y + 1, z - dx * 2 + dz * run) === ID.Fence) run++;
        const below = reach2(V, x + dz * 3, y, z + dx * 3, 0, -1, 0, 40);
        if (run < 14) continue;
        const score = run + below;
        if (!best || score > best.score) best = { score, x: x + 0.5, y: y + 2.6, z: z + 0.5, yaw };
      } else { // between timbers, with a roof a hand above the head
        while (run < 40 && V.at(x + dx * run, y + 1, z + dz * run) === Air && V.at(x + dx * run, y + 4, z + dz * run) !== Air && V.at(x + dx * run, y + 5, z + dz * run) !== Air) run++;
        let posts = 0;
        for (let k = 0; k < run; k++) if (V.at(x + dz * 2 + dx * k, y + 1, z + dx * 2 + dz * k) === ID.OakLog) posts++;
        if (run < 16 || !posts) continue;
        const score = run + posts * 3;
        if (!best || score > best.score) best = { score, x: x + 0.5, y: y + 2.6, z: z + 0.5, yaw };
      }
    }
  }
  if (!best) { console.log('no road for', title); torch = 0; return; }
  const img = render(V, { ...best, pitch: wantOpen ? -0.06 : -0.04, fov: 1.3 }, 960, 540, wantOpen ? 210 : 90);
  text(img, title, 16, 14, [250, 193, 60], 3);
  savePng(file, img);
  torch = 0;
}
const BLOCK_COLOUR = id => BL[id]?.top ?? [1, 0, 1];
function section(file, title, z0, x0, wide, biomeAt, labels = []) {
  const scale = 2, chunks = Math.ceil(wide / CS), w = wide * scale, h = HEIGHT * scale, px = new Uint8Array(w * h * 3).fill(0), zc = Math.floor(z0 / CS), z = z0 - zc * CS;
  for (let cx = 0; cx < chunks; cx++) {
    const c = makeChunk(Math.floor(x0 / CS) + cx, zc, biomeAt);
    for (let x = 0; x < CS; x++) for (let y = 0; y < HEIGHT; y++) {
      const id = c[x + z * CS + y * CS * CS], open = id === Air, col = open ? (y > heightOf(Math.floor(x0 / CS) * CS + cx * CS + x, zc * CS + z) ? [0.55, 0.74, 0.93] : [0.03, 0.03, 0.06]) : BLOCK_COLOUR(id).map(v => v * (id === Stone ? 0.72 : 0.9));
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) { const k = ((cx * CS + x) * scale + a + ((HEIGHT - 1 - y) * scale + b) * w) * 3; if (k >= 0 && k + 2 < px.length) { px[k] = col[0] * 255; px[k + 1] = col[1] * 255; px[k + 2] = col[2] * 255; } }
    }
  }
  const img = { w, h, px };
  for (const [y, name, colour] of [[SEA, 'Sea level', [122, 196, 232]], [50, 'Deepstone begins', [200, 196, 214]], [12, 'The burning sea', [255, 150, 70]]]) {
    const row = (HEIGHT - 1 - y) * scale;
    for (let x = 0; x < w; x += 14) for (let a = 0; a < 7; a++) { const k = (x + a + row * w) * 3; img.px.set(colour, k); }
    text(img, name, w - name.length * 12 - 16, row + 5, colour);
  }
  text(img, title, 16, 12, [250, 193, 60], 3);
  for (const [s, x, y, tx, ty] of labels) {
    text(img, s, x, y);
    const steps = Math.max(Math.abs(tx - x), Math.abs(ty - y));
    for (let i = 0; i < steps; i += 4) { const k = (Math.round(x + (tx - x) * i / steps) + Math.round(y + 16 + (ty - y - 16) * i / steps) * w) * 3; if (k > 0) img.px.set([255, 244, 230], k); }
  }
  savePng(file, img);
}
function plan(file, title, y, x0, z0, size, biomeAt) {
  const chunks = Math.ceil(size / CS), px = new Uint8Array(size * size * 3);
  for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
    const c = makeChunk(Math.floor(x0 / CS) + cx, Math.floor(z0 / CS) + cz, biomeAt);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const id = c[x + z * CS + y * CS * CS], k = (cx * CS + x + (cz * CS + z) * size) * 3, col = id === Air ? [0.04, 0.04, 0.08] : BLOCK_COLOUR(id).map(v => v * 0.8);
      if (k + 2 < px.length) { px[k] = col[0] * 255; px[k + 1] = col[1] * 255; px[k + 2] = col[2] * 255; }
    }
  }
  const img = { w: size, h: size, px };
  text(img, title, 12, 10, [250, 193, 60], 2);
  savePng(file, img);
}

const LABELS = [['Colossal hall', 1000, 150, 1090, 300], ['Normal tunnel', 230, 150, 305, 262], ['Tight squeeze', 740, 150, 852, 232], ['Ravine', 1780, 90, 1880, 170], ['Lake', 1140, 300, 1134, 372]];
mkdirSync(OUT, { recursive: true });
initNoise(SEED);
const want = process.argv[2];
const spot = findHall();
console.log('biggest hall near', spot);
if (!want || want === 'section') {
  section('1-cross-section.png', 'The world from the side', spot.z, spot.x - 500, 1000, biomeField, LABELS);
  plan('2-plan-deep.png', 'From above, at height 44: the colossal halls', 44, spot.x - 500, spot.z - 500, 1000, biomeField);
  plan('3-plan-high.png', 'From above, at height 96: tunnels and squeezes', 96, spot.x - 500, spot.z - 500, 1000, biomeField);
}
if (!want || want === 'tight') passageView('4-tight.png', 'Tight: a squeeze', 2, 3, { x: spot.x + 500, z: spot.z + 300 });
if (!want || want === 'normal') passageView('5-normal.png', 'Normal: a tunnel', 6, 9, { x: spot.x + 500, z: spot.z + 300 });
let n = 6;
for (const biome of CAVE_BIOMES) { if (!want || want === biome) biomeView(biome, n, spot); n++; }
if (!want || want === 'road') { roadView('14-old-way-bridge.png', 'The Old Ways: a bridge across a hall', 'frozen', true); roadView('15-old-way-tunnel.png', 'The Old Ways: a lit corridor', 'plain', false); }
if (!want || want === 'walk') walkReport('16-where-you-can-walk.png', biomeField);
forgetCaves();
if (!want || want === 'spire') dragonspine('13-dragonspine-crystals.png');
// The same measure on the real world, on the seed the tests use: towns, seas, the lot. A land at a time, because they differ.
if (!want || want === 'real') {
  const world = JSON.parse(readFileSync(new URL('tests/client/world.json', ROOT)));
  forgetCaves(); initNoise(world.seed); setWorldData(world);
  let cave = 0, reached = 0, returned = 0, hall = 0, hallReached = 0;
  for (const [lx, lz] of [[2, 2], [6, 2], [2, 6], [6, 6]]) { // wide enough that the road network is not cut off at the edges of the picture
    const V = new Volume(lx * 128 - 256, lz * 128 - 256, 40, (a, b) => genChunk(a, b));
    V.x0Chunk = lx * 128 - 256; V.z0Chunk = lz * 128 - 256;
    const r = walkable(V, heightAt);
    cave += r.cave; reached += r.reached; returned += r.returned; hall += r.hall; hallReached += r.hallReached;
    console.log(`land ${lx},${lz}: cave floor ${(100 * r.reached / Math.max(1, r.cave)).toFixed(1)}%, home ${(100 * r.returned / Math.max(1, r.reached)).toFixed(1)}%, hall ${(100 * r.hallReached / Math.max(1, r.hall)).toFixed(1)}% of ${r.hall}`);
  }
  console.log(`real world: cave floor reached ${(100 * reached / cave).toFixed(1)}%, home ${(100 * returned / reached).toFixed(1)}%, hall floor ${(100 * hallReached / hall).toFixed(1)}%`);
}

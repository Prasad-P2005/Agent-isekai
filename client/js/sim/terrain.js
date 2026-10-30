// Terrain and structure generation. The world layout (lands, settlements, buildings) comes from the server;
// this module turns it into blocks deterministically.
import { BIOMES, REALMS, WORLD } from '../core/content.js';
import { NZ, fbm, ss, mulberry, hash2 } from './noise.js';

export const CS = WORLD.chunk, H = WORLD.height, SEA = WORLD.sea, LAND = WORLD.land;
export const B = Object.fromEntries(BIOMES.map((b, i) => [b.key, i]));
export const REALM = BIOMES.map(b => [b.name, b.kind]);
const REALM_B = Object.fromEntries(Object.entries(REALMS).map(([name, r]) => [name, B[r.biome]]));
const BASE_H = [SEA - 16, SEA + 1, SEA + 7, SEA + 5, SEA + 5, SEA + 24, SEA + 8];
const OCEAN_LAND = { b: B.OCEAN, structure: 'none', density: 0.2, settlement: null, name: 'The Endless Sea' };

export const chunkKey = (cx, cz) => (cx + 16384) * 32768 + (cz + 16384);

let W = null;
// Every chunk also runs its neighbours' features, so the same columns are asked for again and again and each
// miss costs eight noise samples. Height only depends on the column, so each one is computed once.
const heightCache = new Map(); // chunk key -> column heights; 0 = not computed yet, real heights are at least 4
export function setWorldData(w) { W = w; heightCache.clear(); for (const row of w.lands) for (const L of row) delete L._c; }
export const settlement = id => W.settlements[id];
function land(lx, lz) {
  const L = W.lands[lz]?.[lx];
  if (!L) return OCEAN_LAND;
  return L._c || (L._c = { b: REALM_B[L.realm], structure: L.structure, density: L.density, settlement: L.settlement, name: L.name });
}
export const landOf = (x, z) => land(Math.floor(x / LAND), Math.floor(z / LAND));
export const landName = L => (L.settlement != null ? settlement(L.settlement).name : L.name) || REALM[L.b][0];

export function heightAt(x, z) { // whole block coordinates
  const k = chunkKey(x >> 4, z >> 4), i = (x & 15) + (z & 15) * CS;
  let column = heightCache.get(k);
  if (!column) heightCache.set(k, column = new Int16Array(CS * CS));
  return column[i] || (column[i] = columnHeight(x, z));
}
function columnHeight(x, z) {
  const fx = x / LAND - 0.5, fz = z / LAND - 0.5, lx = Math.floor(fx), lz = Math.floor(fz);
  let tx = fx - lx, tz = fz - lz;
  tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  let base = 0, mt = 0, landness = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const w = (i ? tx : 1 - tx) * (j ? tz : 1 - tz), b = land(lx + i, lz + j).b;
    base += w * BASE_H[b]; mt += w * (b === B.PEAKS); landness += w * (b !== B.OCEAN);
  }
  const hl = fbm(NZ.H, x / 90, z / 90, 4), m = Math.max(0, fbm(NZ.M, x / 110, z / 110, 4) + 0.35);
  let h = base + hl * (3 + 6 * landness) + mt * m * m * 60;
  const L = landOf(x, z);
  if (L.settlement != null) { // settlements sit on levelled ground
    const S = settlement(L.settlement), t = 1 - ss(24, 31, Math.hypot(x - S.cx, z - S.cz));
    h = h * (1 - t) + (SEA + 5) * t;
  }
  return Math.max(4, Math.min(H - 24, Math.floor(h)));
}
export function biomeAt(x, z, h) {
  if (h < SEA) return B.OCEAN;
  if (h <= SEA + 1) return B.BEACH;
  const b = landOf(x, z).b;
  if (b === B.DEMON) return B.DEMON;
  if (b === B.OCEAN) return B.BEACH;
  if (h > SEA + 38) return B.PEAKS;
  return b;
}

// spawn hints for creatures that live in structures (mermaids in palaces, the Demon Lord in his castle)
export const hintQueue = [];
const hintSeen = new Set();
function hint(kind, x, y, z) { const k = kind + x + ',' + y + ',' + z; if (hintSeen.has(k)) return; hintSeen.add(k); hintQueue.push({ kind, x, y, z }); }

// ===================== structures =====================
function blob(set, cx, cy, cz, rx, ry, rz, id, r) {
  for (let dx = -rx; dx <= rx; dx++) for (let dy = -ry; dy <= ry; dy++) for (let dz = -rz; dz <= rz; dz++) {
    const d = (dx * dx) / (rx * rx + .5) + (dy * dy) / (ry * ry + .5) + (dz * dz) / (rz * rz + .5);
    if (d <= 1 && (d < 0.7 || r() > 0.3)) set(cx + dx, cy + dy, cz + dz, id, true);
  }
}
function oak(x, y, z, set, r) { const th = 4 + Math.floor(r() * 3); blob(set, x, y + th, z, 2, 2, 2, 7, r); for (let i = 0; i < th; i++) set(x, y + i, z, 6); }
function elfTree(x, y, z, set, r) {
  const th = 8 + Math.floor(r() * 5);
  blob(set, x, y + th, z, 3, 3, 3, 9, r); blob(set, x, y + th - 3, z, 2, 1, 2, 9, r);
  for (let i = 0; i < th; i++) set(x, y + i, z, 8);
  if (r() < 0.5) set(x + 2, y + th - 4, z, 22, true);
  if (r() < 0.5) set(x - 2, y + th - 4, z, 22, true);
}
function giantTree(x, y, z, set, r) {
  const th = 20 + Math.floor(r() * 5), py = y + 9;
  for (let dx = -5; dx <= 6; dx++) for (let dz = -5; dz <= 6; dz++) {
    const d = Math.hypot(dx - 0.5, dz - 0.5);
    if (d < 5.6) set(x + dx, py, z + dz, 18);
    if (d >= 4.8 && d < 5.6 && (dx + dz) % 2 === 0) set(x + dx, py + 1, z + dz, 8);
  }
  for (const [dx, dz] of [[-4, 0], [5, 1], [1, -4], [0, 5]]) { set(x + dx, py + 1, z + dz, 8); set(x + dx, py + 2, z + dz, 22); }
  for (let dx = 2; dx <= 4; dx++) for (let dz = -3; dz <= -1; dz++) for (let dy = 1; dy <= 3; dy++) {
    const edge = dx === 2 || dx === 4 || dz === -3 || dz === -1;
    set(x + dx, py + dy, z + dz, dy === 3 ? 9 : edge ? (dy === 2 ? 21 : 8) : 0);
  }
  blob(set, x, y + th, z, 6, 4, 6, 9, r); blob(set, x + 3, y + th - 6, z - 2, 3, 2, 3, 9, r); blob(set, x - 3, y + th - 8, z + 3, 3, 2, 3, 9, r);
  for (let i = -1; i < th; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y + i, z + dz, 8);
  for (const [dx, dz] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) { set(x + dx, y, z + dz, 8); set(x + dx, y - 1, z + dz, 8); }
  for (let i = 0; i < 5; i++) set(x + Math.floor(r() * 9) - 4, y, z + Math.floor(r() * 9) - 4, 26, true);
}
function foundation(set, x, y, z, id) { const g = heightAt(x, z); for (let yy = y; yy > g; yy--) set(x, yy, z, id); }
function house(x, y, z, set, r, small) {
  const hw = small || r() < 0.5 ? 2 : 3, hd = small || r() < 0.5 ? 2 : 3;
  for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
    foundation(set, x + dx, y - 1, z + dz, 19);
    set(x + dx, y - 1, z + dz, 18);
    const ex = Math.abs(dx) === hw, ez = Math.abs(dz) === hd;
    for (let dy = 0; dy < 4; dy++) {
      let id = 0;
      if (ex && ez) id = 6;
      else if (ex || ez) id = (dy === 1 && (dx === 0 || dz === 0)) ? 21 : (dy === 3 ? 6 : 18);
      if (dx === 0 && dz === hd && dy < 2) id = 0;
      set(x + dx, y + dy, z + dz, id);
    }
  }
  set(x, y + 3, z, 22);
  for (let k = 0; ; k++) {
    const ex = hw + 1 - k, ez = hd + 1 - k;
    if (ex < 0 || ez < 0) break;
    for (let dx = -ex; dx <= ex; dx++) for (let dz = -ez; dz <= ez; dz++) set(x + dx, y + 4 + k, z + dz, 20);
  }
}
function tower(x, y, z, set) {
  const top = y + 14;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const d = dx * dx + dz * dz;
    if (d > 10) continue;
    foundation(set, x + dx, y - 1, z + dz, 19);
    for (let yy = y; yy <= top; yy++) set(x + dx, yy, z + dz, d > 4.5 ? 19 : ((yy - y) % 5 === 4 ? 18 : 0));
    if (d > 4.5 && (dx + dz) % 2 === 0) set(x + dx, top + 1, z + dz, 19);
  }
  for (let yy = y; yy < y + 2; yy++) set(x, yy, z - 3, 0);
  set(x, top + 1, z, 22);
  for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4]]) for (let yy = top - 6; yy < top - 1; yy++) set(x + dx, yy, z + dz, 30);
  for (let yy = y + 5; yy < top; yy += 4) set(x + 3, yy, z, 21);
}
function acacia(x, y, z, set, r) {
  const th = 4 + Math.floor(r() * 2), ox = r() < 0.5 ? 1 : -1, oz = r() < 0.5 ? 1 : -1;
  for (let i = 0; i < th; i++) set(x, y + i, z, 6);
  set(x + ox, y + th, z + oz, 6); set(x + 2 * ox, y + th + 1, z + 2 * oz, 6);
  const cx = x + 2 * ox, cy = y + th + 2, cz = z + 2 * oz;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = dx * dx + dz * dz;
    if (d <= 10) set(cx + dx, cy, cz + dz, 32, true);
    if (d <= 3) set(cx + dx, cy + 1, cz + dz, 32, true);
  }
}
function hut(x, y, z, set) {
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = dx * dx + dz * dz;
    if (d > 10) continue;
    foundation(set, x + dx, y - 1, z + dz, 25);
    set(x + dx, y - 1, z + dz, 25);
    for (let dy = 0; dy < 3; dy++) set(x + dx, y + dy, z + dz, d > 5 ? (dy === 1 ? 18 : 6) : 0);
  }
  set(x, y, z + 3, 0); set(x, y + 1, z + 3, 0); set(x, y + 1, z - 3, 0);
  for (let k = 0; k <= 4; k++) {
    const rr = 4 - k;
    for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) if (dx * dx + dz * dz <= rr * rr + 1) set(x + dx, y + 3 + k, z + dz, 23);
  }
  for (let i = 0; i < 4; i++) set(x + 5, y + i, z, i % 2 ? 33 : 6);
  set(x + 5, y + 4, z, 22);
  set(x, y - 1, z + 6, 19); set(x, y, z + 6, 22);
}
function crystals(x, y, z, set, r) {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    let px = x + Math.floor(r() * 5) - 2;
    const pz = z + Math.floor(r() * 5) - 2, len = 3 + Math.floor(r() * 5), lx = r() < 0.3 ? (r() < 0.5 ? 1 : -1) : 0, py = heightAt(px, pz) + 1;
    for (let k = 0; k < len; k++) { set(px, py + k, pz, 16); if (k === 2) px += lx; }
  }
}
function reef(x, y, z, set, r) {
  if (r() < 0.4) { const len = Math.min(SEA - 2 - y, 3 + Math.floor(r() * 12)); for (let k = 0; k < len; k++) set(x, y + k, z, 14); return; }
  const id = 11 + Math.floor(r() * 3);
  let px = x, py = y, pz = z;
  for (let k = 0; k < 6 + r() * 8 && py < SEA - 1; k++) {
    set(px, py, pz, id);
    const m = Math.floor(r() * 4);
    if (m === 0) px += r() < 0.5 ? 1 : -1; else if (m === 1) pz += r() < 0.5 ? 1 : -1; else py++;
  }
}
function palace(x, y, z, set, r) {
  const R = 6;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    foundation(set, x + dx, y - 1, z + dz, 15);
    set(x + dx, y - 1, z + dz, 15);
    for (let dy = 0; dy <= R; dy++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > R + 0.5) continue;
      set(x + dx, y + dy, z + dz, d > R - 0.6 ? (dy === 2 && (dx === 0 || dz === 0) ? 21 : 15) : 5);
    }
  }
  for (let dy = 0; dy < 4; dy++) set(x, y + dy, z, dy === 3 ? 16 : 15);
  set(x, y + 4, z, 22);
  hint('mermaid', x + 2, y + 1, z); hint('mermaid', x - 2, y + 1, z + 1);
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { for (let dy = -1; dy < 8; dy++) set(x + dx, y + dy, z + dz, 15); set(x + dx, y + 8, z + dz, 16); }
  for (let i = 0; i < 12; i++) set(x + Math.floor(r() * 15) - 7, y, z + Math.floor(r() * 15) - 7, 11 + Math.floor(r() * 3), true);
}
function spire(x, y, z, set) {
  for (let dy = -1; dy < 26; dy++) {
    const rad = dy < 3 ? 3 : Math.max(0, 2.6 - dy / 10);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz <= rad * rad + 0.5) set(x + dx, y + dy, z + dz, dy < 3 ? 15 : 16);
  }
  set(x, y + 26, z, 22);
}
function ruins(x, y, z, set, r) {
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
    if (Math.abs(dx) !== 5 && Math.abs(dz) !== 5 && !(dx === 0 && Math.abs(dz) < 5 && r() < 0.3)) continue;
    const g = heightAt(x + dx, z + dz), hgt = Math.floor(r() * 6);
    for (let dy = 1; dy <= hgt; dy++) set(x + dx, g + dy, z + dz, r() < 0.15 ? 7 : 19);
  }
  set(x, heightAt(x, z) + 1, z, 16);
}
function stall(x, y, z, set, r) {
  const roof = r() < 0.5 ? 20 : 30;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
    foundation(set, x + dx, y - 1, z + dz, 19);
    for (let dy = 0; dy < 3; dy++) set(x + dx, y + dy, z + dz, 0);
    set(x + dx, y + 3, z + dz, roof);
  }
  for (let dx = -2; dx <= 2; dx++) set(x + dx, y, z - 1, 18);
  for (const dx of [-2, 2]) for (const dz of [-1, 1]) for (let dy = 0; dy < 3; dy++) set(x + dx, y + dy, z + dz, 6);
  set(x, y + 1, z - 1, 22);
}
function streetStall(x, y, z, set, r) {
  const awning = r() < 0.5 ? 20 : 30;
  for (let dx = -1; dx <= 1; dx++) {
    set(x + dx, y - 1, z, 18);
    set(x + dx, y, z, 18);
    if (Math.abs(dx) === 1) { set(x + dx, y + 1, z, 6); set(x + dx, y + 2, z, 6); }
    set(x + dx, y + 3, z, awning);
  }
  set(x, y + 1, z, 22);
}
function demonCastle(x, y, z, set) {
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > 10.5) continue;
    if (d > 8.5) { set(x + dx, heightAt(x + dx, z + dz), z + dz, 36); continue; } // magma moat
    foundation(set, x + dx, y - 1, z + dz, 37);
    set(x + dx, y - 1, z + dz, 37);
    for (let dy = 0; dy < 22; dy++) set(x + dx, y + dy, z + dz, d > 6.5 ? 37 : (dy % 7 === 6 && d > 2 ? 34 : 0));
    if (d > 6.5 && (dx + dz) % 2 === 0) { set(x + dx, y + 22, z + dz, 37); set(x + dx, y + 23, z + dz, 36); }
  }
  for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -9; dz <= -6; dz++) set(x + dx, y + dy, z + dz, 0);
  for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4]]) set(x + dx, y - 1, z + dz, 36);
  hint('demon_lord', x, y, z);
  hint('demon_knight', x + 3, y, z + 3); hint('demon_knight', x - 3, y, z + 3);
}
function magmaSpike(x, y, z, set, r) { const n = 2 + Math.floor(r() * 5); for (let i = 0; i < n; i++) set(x, y + i, z, i === n - 1 ? 36 : 37); }
function deadTree(x, y, z, set, r) { const n = 3 + Math.floor(r() * 4); for (let i = 0; i < n; i++) set(x, y + i, z, 34); set(x + 1, y + n - 1, z, 34); set(x - 1, y + n - 2, z, 34); }

// ---- settlement buildings, placed from the server's layout ----
const DOORV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
let STYLE = null; // 'elf' while building the elven capital: elderwood walls, living-leaf roofs
function building(x, y, z, set, o) {
  if (STYLE === 'elf') o = { ...o, wall: 8, corner: 8, roof: 9, floor: o.floor === 15 ? 15 : 18 };
  const { hw, hd, h } = o;
  for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
    foundation(set, x + dx, y - 1, z + dz, 19);
    set(x + dx, y - 1, z + dz, o.floor);
    const ex = Math.abs(dx) === hw, ez = Math.abs(dz) === hd;
    for (let dy = 0; dy < h; dy++) {
      let id = 0;
      if (ex && ez) id = o.corner;
      else if (ex || ez) id = o.windows && (dy === 1 || dy === 2) && ((dx + dz) & 1) ? 21 : o.wall;
      set(x + dx, y + dy, z + dz, id);
    }
  }
  const [fx, fz] = DOORV[o.door || 's'], doorX = x + fx * hw, doorZ = z + fz * hd;
  set(doorX, y, doorZ, 0); set(doorX, y + 1, doorZ, 0); set(doorX, y + 2, doorZ, 22);
  for (let k = 0; ; k++) {
    const ex = hw + 1 - k, ez = hd + 1 - k;
    if (ex < 0 || ez < 0) break;
    for (let dx = -ex; dx <= ex; dx++) for (let dz = -ez; dz <= ez; dz++) set(x + dx, y + h + k, z + dz, o.roof);
  }
  set(x, y + h - 1, z, 22);
  return { fx, fz, px: fz ? 1 : 0, pz: fx ? 1 : 0, doorX, doorZ, depth: fz ? hd : hw, top: y + h + Math.min(hw, hd) + 1 };
}
const BUILD = {
  house: (b, y, set, r) => house(b.x, y, b.z, set, r, true),
  stall: (b, y, set, r) => stall(b.x, y, b.z, set, r),
  street_stall: (b, y, set, r) => streetStall(b.x, y, b.z, set, r),
  treehouse: (b, y, set, r) => giantTree(b.x, y, b.z, set, r),
  hut: (b, y, set, r) => hut(b.x, y, b.z, set, r),
  keep: () => {}, // built with the city walls
  well: (b, y, set) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { set(b.x + dx, y - 1, b.z + dz, dx || dz ? 19 : 5); set(b.x + dx, y + 3, b.z + dz, 18); }
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (let dy = 0; dy < 3; dy++) set(b.x + dx, y + dy, b.z + dz, 6);
  },
  guild: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 4, hd: 3, h: 5, wall: 18, corner: 6, roof: 20, floor: 18, windows: 1, door: b.door });
    const cx = b.x - g.fx * (g.depth - 2), cz = b.z - g.fz * (g.depth - 2);
    for (let k = -2; k <= 2; k++) set(cx + g.px * k, y, cz + g.pz * k, 18); // reception counter
    set(cx + g.px * 2, y + 1, cz + g.pz * 2, 22);
    for (const k of [-2, 2]) for (let dy = 2; dy <= 3; dy++) set(g.doorX + g.px * k, y + dy, g.doorZ + g.pz * k, 30);
  },
  hospital: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 4, hd: 3, h: 5, wall: 15, corner: 15, roof: 20, floor: 15, windows: 1, door: b.door });
    for (const [k, dy] of [[0, 2], [0, 3], [0, 4], [-1, 3], [1, 3]]) set(g.doorX + g.px * k, y + dy, g.doorZ + g.pz * k, 20); // red cross
    for (let k = -3; k <= 3; k += 2) set(b.x - g.fx * (g.depth - 1) + g.px * k, y, b.z - g.fz * (g.depth - 1) + g.pz * k, 20); // beds
  },
  inn: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 3, hd: 3, h: 6, wall: 18, corner: 6, roof: 23, floor: 18, windows: 1, door: b.door });
    for (const k of [-1, 1]) { set(b.x + g.px * k * 2, y, b.z + g.pz * k * 2, 18); set(b.x + g.px * k * 2, y + 1, b.z + g.pz * k * 2, 22); }
  },
  smithy: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 3, hd: 2, h: 4, wall: 19, corner: 19, roof: 34, floor: 19, windows: 0, door: b.door });
    const fx = b.x - g.fx * (g.depth - 1), fz = b.z - g.fz * (g.depth - 1);
    set(fx, y, fz, 36); set(fx, y + 1, fz, 36); set(b.x, y, b.z, 37);
  },
  church: (b, y, set) => {
    const g = building(b.x, y, b.z, set, { hw: 3, hd: 4, h: 7, wall: 15, corner: 3, roof: 37, floor: 15, windows: 1, door: b.door });
    for (let i = 0; i < 4; i++) set(b.x, g.top + i, b.z, 15);
    set(b.x, g.top + 4, b.z, 16);
  },
  elfhall: (b, y, set) => { building(b.x, y, b.z, set, { hw: 3, hd: 3, h: 5, wall: 8, corner: 8, roof: 9, floor: 18, windows: 1, door: b.door }); set(b.x + 1, y, b.z + 1, 26); set(b.x - 1, y, b.z - 1, 26); },
  lodge: (b, y, set) => building(b.x, y, b.z, set, { hw: 3, hd: 2, h: 4, wall: 6, corner: 33, roof: 23, floor: 25, windows: 0, door: b.door }),
  shrine: (b, y, set, r) => {
    giantTree(b.x, y, b.z, set, r);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = b.x + Math.round(Math.cos(a) * 8), z = b.z + Math.round(Math.sin(a) * 8); set(x, y, z, 16); set(x, y + 1, z, 16); }
  },
  palace: (b, y, set, r) => { // the World Tree palace of the elven ruler
    giantTree(b.x, y, b.z, set, r);
    giantTree(b.x + 1, y + 1, b.z + 1, set, r);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, x = b.x + Math.round(Math.cos(a) * 9), z = b.z + Math.round(Math.sin(a) * 9);
      for (let dy = 0; dy < 4; dy++) set(x, y + dy, z, dy === 3 ? 16 : 15);
    }
    for (let dx = 2; dx <= 4; dx++) for (let dz = 2; dz <= 4; dz++) set(b.x + dx, y - 1, b.z + dz, 15); // throne dais
    set(b.x + 3, y, b.z + 4, 16); set(b.x + 3, y + 1, b.z + 4, 16);
  },
  chief: (b, y, set, r) => {
    hut(b.x, y, b.z, set, r);
    for (const [dx, dz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) { for (let i = 0; i < 5; i++) set(b.x + dx, y + i, b.z + dz, i % 2 ? 33 : 6); set(b.x + dx, y + 5, b.z + dz, 22); }
  },
};
function settlementChunk(cx, cz, S, set) {
  const bx = cx * CS, bz = cz * CS;
  for (let x = bx; x < bx + CS; x++) for (let z = bz; z < bz + CS; z++) {
    const dx = x - S.cx, dz = z - S.cz, d = Math.hypot(dx, dz), g = heightAt(x, z);
    const largeCity = S.type === 'city', road = (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) && d < (largeCity ? 28.5 : 27);
    if (S.type === 'city' || S.type === 'elfcity') {
      const M = S.type === 'elfcity' ? { wall: 8, top: 9, road: 15, post: 8, lamp: 26 } : { wall: 19, top: 19, road: 29, post: 6, lamp: 22 };
      if (road) set(x, g, z, M.road);
      const wallInner = largeCity ? 28.5 : 26.5, wallOuter = largeCity ? 29.5 : 28;
      if (d >= wallInner && d < wallOuter) { // wall with four gates
        const gate = Math.abs(dx) <= 2 || Math.abs(dz) <= 2;
        for (let y = g + 1; y <= g + 6; y++) if (!gate || y >= g + 5) set(x, y, z, M.wall);
        if ((x + z) % 2 === 0) set(x, g + 7, z, M.top);
        if (gate && (Math.abs(dx) === 2 || Math.abs(dz) === 2)) set(x, g + 4, z, M.lamp);
      }
      if (largeCity && d >= wallOuter && d <= 31.5 && (Math.abs(dx) <= 1 || Math.abs(dz) <= 1)) set(x, g, z, M.road);
      if (d < wallInner - 1 && d > 10 && (Math.abs(dx) === 2 || Math.abs(dz) === 2) && ((dx + dz) & 7) === 0) { set(x, g + 1, z, M.post); set(x, g + 2, z, M.post); set(x, g + 3, z, M.lamp); }
    } else if (S.type !== 'elf' && d <= 27 && (road || d < 4.5)) set(x, g, z, S.type === 'beast' ? 25 : d < 4.5 ? 19 : 29);
  }
  if (S.type === 'city' && Math.floor(S.cx / CS) - 1 === cx && Math.floor(S.cz / CS) - 1 === cz) tower(S.cx, heightAt(S.cx, S.cz) + 1, S.cz, set);
  STYLE = S.type === 'elfcity' ? 'elf' : null;
  for (const b of S.layout) {
    if (Math.floor(b.x / CS) !== cx || Math.floor(b.z / CS) !== cz) continue;
    BUILD[b.kind](b, heightAt(b.x, b.z) + 1, set, mulberry(hash2(b.x, b.z)));
  }
  STYLE = null;
}

// features of a chunk: settlements, landmarks, then vegetation
function features(cx, cz, set) {
  const r = mulberry(hash2(cx, cz)), bx = cx * CS, bz = cz * CS;
  const L = landOf(bx + 8, bz + 8);
  const ix = ((cx % 4) + 4) % 4, iz = ((cz % 4) + 4) % 4, heart = ix === 1 && iz === 1;
  const sx = bx + 4 + Math.floor(r() * 8), sz = bz + 4 + Math.floor(r() * 8), sh = heightAt(sx, sz), roll = r();
  let big = false;
  if (L.settlement != null) {
    const S = settlement(L.settlement);
    settlementChunk(cx, cz, S, set);
    if (S.type !== 'elf' && S.type !== 'elfcity') return;
    big = true;
  } else {
    const hx = bx + 16, hz = bz + 16;
    switch (L.structure) {
      case 'treehouse_grove': if (sh > SEA + 1 && roll < 0.45) { giantTree(sx, sh + 1, sz, set, r); big = true; } break;
      case 'mermaid_palace': if (heart && sh < SEA - 9) { palace(sx, sh + 1, sz, set, r); big = true; } break;
      case 'crystal_spire': if (heart) { spire(hx, heightAt(hx, hz) + 1, hz, set); big = true; } break;
      case 'demon_castle': if (heart) { demonCastle(hx, heightAt(hx, hz) + 1, hz, set); big = true; } break;
      case 'ruins': if (roll < 0.4) { ruins(sx, sh, sz, set, r); big = true; } break;
    }
  }
  const base = [12, 1, 6, 2, 2, 3, 4][biomeAt(bx + 8, bz + 8, heightAt(bx + 8, bz + 8))];
  const count = Math.round(base * (0.2 + 1.6 * L.density));
  for (let i = 0; i < count; i++) {
    const x = bx + Math.floor(r() * CS), z = bz + Math.floor(r() * CS), rr = r();
    if (big && Math.abs(x - sx) < 8 && Math.abs(z - sz) < 8) continue;
    if (L.settlement != null) { const S = settlement(L.settlement); if (Math.hypot(x - S.cx, z - S.cz) < 30) continue; }
    const h = heightAt(x, z), b = biomeAt(x, z, h);
    if (b === B.ELF) elfTree(x, h + 1, z, set, r);
    else if (b === B.KINGDOM) oak(x, h + 1, z, set, r);
    else if (b === B.BEAST) { if (rr < 0.5) acacia(x, h + 1, z, set, r); }
    else if (b === B.PEAKS) { if (rr < 0.6) crystals(x, h + 1, z, set, r); }
    else if (b === B.OCEAN) reef(x, h + 1, z, set, r);
    else if (b === B.DEMON) { if (rr < 0.5) magmaSpike(x, h + 1, z, set, r); else deadTree(x, h + 1, z, set, r); }
  }
}

export const idx = (x, y, z) => x + z * CS + y * CS * CS;
export function genChunk(cx, cz, edits) {
  const d = new Uint8Array(CS * CS * H), bx = cx * CS, bz = cz * CS;
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = bx + x, wz = bz + z, h = heightAt(wx, wz), b = biomeAt(wx, wz, h), det = NZ.D(wx / 9, wz / 9);
    d[idx(x, 0, z)] = 31;
    for (let y = 1; y <= h; y++) {
      const depth = h - y;
      let id = 3;
      if (b === B.OCEAN) id = depth < 3 ? (h < SEA - 14 && det > 0 ? 29 : 4) : 3;
      else if (b === B.BEACH) id = depth < 4 ? 4 : 3;
      else if (b === B.PEAKS) id = depth === 0 ? (h > SEA + 46 ? 17 : det > 0.2 ? 1 : 3) : 3;
      else if (b === B.ELF) id = depth === 0 ? 10 : depth < 4 ? 2 : 3;
      else if (b === B.DEMON) id = depth === 0 ? (det > 0.55 ? 36 : 35) : depth < 3 ? 34 : 3;
      else if (b === B.BEAST) id = depth === 0 ? (det > 0.5 ? 25 : 24) : depth < 4 ? 25 : 3;
      else id = depth === 0 ? 1 : depth < 4 ? 2 : 3;
      d[idx(x, y, z)] = id;
    }
    for (let y = h + 1; y <= SEA; y++) d[idx(x, y, z)] = 5;
  }
  const set = (wx, y, wz, id, soft) => {
    const x = wx - bx, z = wz - bz;
    if (x < 0 || z < 0 || x >= CS || z >= CS || y < 1 || y >= H) return;
    const i = idx(x, y, z);
    if (soft && d[i] !== 0 && d[i] !== 5) return;
    if (id === 0 && y <= SEA && d[i] === 5) return;
    d[i] = id;
  };
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) features(cx + dx, cz + dz, set);
  if (edits) for (const [i, id] of edits) d[i] = id;
  return d;
}

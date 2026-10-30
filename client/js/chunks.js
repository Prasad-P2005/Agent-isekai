// Chunk storage, block access, meshing and streaming around the player.
import * as THREE from 'three';
import { BL } from './blocks.js';
import { hash3 } from './noise.js';
import { CS, H, SEA, genChunk, idx, chunkKey as key } from './terrain.js';
import { scene, opaqueMat, transMat, RD } from './scene.js';

export const chunks = new Map();
const edits = new Map();

export function getBlock(wx, y, wz) {
  if (y < 0) return 31; if (y >= H) return 0;
  const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS), ch = chunks.get(key(cx, cz));
  return ch ? ch.d[idx(wx - cx * CS, y, wz - cz * CS)] : 0;
}
export function chunkReady(x, z) { const ch = chunks.get(key(Math.floor(x / CS), Math.floor(z / CS))); return !!(ch && ch.meshed); }
export function setBlock(wx, y, wz, id) {
  if (y < 1 || y >= H) return;
  const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS), k = key(cx, cz), ch = chunks.get(k);
  if (!ch) return;
  const lx = wx - cx * CS, lz = wz - cz * CS, i = idx(lx, y, lz);
  ch.d[i] = id; ch.dirty = true;
  if (!edits.has(k)) edits.set(k, new Map());
  edits.get(k).set(i, id);
  const mark = (a, b) => { const n = chunks.get(key(a, b)); if (n) n.dirty = true; };
  if (lx === 0) mark(cx - 1, cz); if (lx === CS - 1) mark(cx + 1, cz);
  if (lz === 0) mark(cx, cz - 1); if (lz === CS - 1) mark(cx, cz + 1);
}

const FACES = [
  { d: [1, 0, 0], s: 0.8, c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { d: [-1, 0, 0], s: 0.8, c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { d: [0, 1, 0], s: 1.0, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { d: [0, -1, 0], s: 0.5, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: [0, 0, 1], s: 0.65, c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { d: [0, 0, -1], s: 0.65, c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
// A small amount of corner shading gives voxel forms depth without adding
// extra meshes or expensive real-time shadow maps. Each corner of a face reads
// the blocks at these offsets (two edge neighbours, then the diagonal), which
// are built once because the mesher needs them for every vertex it emits.
for (const f of FACES) {
  const axes = [0, 1, 2].filter(axis => f.d[axis] === 0);
  const step = (a, b) => [0, 1, 2].map(axis => (axis === axes[0] ? a : axis === axes[1] ? b : 0));
  f.ao = f.c.map(corner => {
    const a = corner[axes[0]] ? 1 : -1, b = corner[axes[1]] ? 1 : -1;
    return [...step(a, 0), ...step(0, b), ...step(a, b)];
  });
}
function occludesAO(id) { return id !== 0 && id !== 5 && id !== 21; }
function cornerAO(get, x, y, z, o) {
  const sideA = occludesAO(get(x + o[0], y + o[1], z + o[2]));
  const sideB = occludesAO(get(x + o[3], y + o[4], z + o[5]));
  if (sideA && sideB) return 0.72;
  const diagonal = occludesAO(get(x + o[6], y + o[7], z + o[8]));
  return 1 - (Number(sideA) + Number(sideB) + Number(diagonal)) * 0.075;
}
function buildGeo(buf) {
  if (!buf.p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
  g.setIndex(buf.i);
  g.computeBoundingSphere();
  return g;
}
function meshChunk(ch) {
  const { cx, cz, d } = ch, bx = cx * CS, bz = cz * CS;
  const op = { p: [], n: [], c: [], i: [] }, tr = { p: [], n: [], c: [], i: [] };
  const get = (x, y, z) => {
    if (y < 0) return 31; if (y >= H) return 0;
    if (x >= 0 && x < CS && z >= 0 && z < CS) return d[idx(x, y, z)];
    return getBlock(bx + x, y, bz + z);
  };
  // Most of a chunk is solid rock. Inside a layer with no gaps, between two more
  // of the same, every block is hidden: only the chunk's rim can show a face.
  const full = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    let i = y * CS * CS;
    const end = i + CS * CS;
    while (i < end && d[i] && !BL[d[i]].transparent) i++;
    full[y] = i === end ? 1 : 0;
  }
  for (let y = 0; y < H; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    if (full[y] && y > 0 && full[y - 1] && full[y + 1] && x > 0 && x < CS - 1 && z > 0 && z < CS - 1) continue;
    const id = d[idx(x, y, z)];
    if (!id) continue;
    const bd = BL[id], isT = !!bd.transparent;
    let v = 0; // per-block colour variation, worked out only if a face turns out to be visible
    for (const f of FACES) {
      const n = get(x + f.d[0], y + f.d[1], z + f.d[2]);
      if (id === 5) { if (n !== 0) continue; }
      else if (isT) { if (n === id || (n !== 0 && !BL[n].transparent)) continue; }
      else if (n !== 0 && !BL[n].transparent) continue;
      if (!v) v = 0.93 + 0.07 * hash3(bx + x, y, bz + z);
      const buf = isT ? tr : op, col = f.d[1] > 0 ? bd.top : f.d[1] < 0 ? bd.bot : bd.side;
      // Fixed side tint stays restrained; world lights handle the main shading.
      let sh = bd.glow ? Math.max(f.s, bd.glow) * 1.1 : (f.d[1] > 0 ? 1 : f.d[1] < 0 ? 0.74 : 0.9);
      if (!bd.glow && y < SEA - 2) sh *= 0.72 + 0.28 * Math.max(0, 1 - (SEA - y) / 30);
      const base = buf.p.length / 3, drop = (id === 5 && f.d[1] > 0) ? 0.12 : 0;
      for (let k = 0; k < 4; k++) {
        const c = f.c[k], ao = cornerAO(get, x, y, z, f.ao[k]);
        buf.p.push(x + c[0], y + c[1] - (c[1] ? drop : 0), z + c[2]);
        buf.n.push(f.d[0], f.d[1], f.d[2]);
        buf.c.push(col[0] * sh * v * ao, col[1] * sh * v * ao, col[2] * sh * v * ao);
      }
      buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  for (const m of [ch.mesh, ch.tmesh]) if (m) { scene.remove(m); m.geometry.dispose(); }
  ch.mesh = ch.tmesh = null;
  const g1 = buildGeo(op), g2 = buildGeo(tr);
  if (g1) { ch.mesh = new THREE.Mesh(g1, opaqueMat); ch.mesh.position.set(bx, 0, bz); scene.add(ch.mesh); }
  if (g2) { ch.tmesh = new THREE.Mesh(g2, transMat); ch.tmesh.position.set(bx, 0, bz); ch.tmesh.renderOrder = 1; scene.add(ch.tmesh); }
  ch.meshed = true; ch.dirty = false;
}

// Time for chunk work each frame. The nearest chunk of each kind is always done, so a slow machine still loads.
const FRAME_BUDGET_MS = 5;
// all eight: corner shading reads the diagonal chunks too
function neighboursLoaded(ch) {
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!chunks.has(key(ch.cx + a, ch.cz + b))) return false;
  return true;
}
export function updateChunks(px, pz) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), toGen = [], toMesh = [];
  for (let dx = -RD - 1; dx <= RD + 1; dx++) for (let dz = -RD - 1; dz <= RD + 1; dz++) {
    const cx = pcx + dx, cz = pcz + dz, dist = dx * dx + dz * dz, ch = chunks.get(key(cx, cz));
    if (!ch) toGen.push([dist, cx, cz]);
    else if (Math.abs(dx) <= RD && Math.abs(dz) <= RD && (!ch.meshed || ch.dirty)) toMesh.push([ch.dirty && ch.meshed ? -1 : dist, ch]);
  }
  const deadline = performance.now() + FRAME_BUDGET_MS;
  toGen.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < toGen.length && (!i || performance.now() < deadline); i++) {
    const [, cx, cz] = toGen[i];
    chunks.set(key(cx, cz), { cx, cz, d: genChunk(cx, cz, edits.get(key(cx, cz))), meshed: false, dirty: false });
  }
  toMesh.sort((a, b) => a[0] - b[0]);
  let n = 0;
  for (const [, ch] of toMesh) {
    if (n && performance.now() >= deadline) break;
    if (neighboursLoaded(ch)) { meshChunk(ch); n++; }
  }
  for (const [k, ch] of chunks) {
    if (Math.abs(ch.cx - pcx) > RD + 3 || Math.abs(ch.cz - pcz) > RD + 3) {
      for (const m of [ch.mesh, ch.tmesh]) if (m) { scene.remove(m); m.geometry.dispose(); }
      chunks.delete(k);
    }
  }
}

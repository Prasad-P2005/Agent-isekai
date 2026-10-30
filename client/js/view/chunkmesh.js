// Turning chunks of blocks into meshes.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { AIR, BEDROCK, BL, GLASS, WATER } from '../sim/blocks.js';
import { RD, chunks, getBlock, neighboursLoaded } from '../sim/chunks.js';
import { hash3 } from '../sim/noise.js';
import { CS, H, SEA, idx, chunkKey as key } from '../sim/terrain.js';
import { opaqueMat, scene, transMat } from './scene.js';

const shown = new Map(); // chunk key -> its meshes

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
function occludesAO(id) { return id !== AIR && id !== WATER && id !== GLASS; }
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
function hide(k) {
  const m = shown.get(k);
  if (!m) return;
  for (const mesh of [m.mesh, m.tmesh]) if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  shown.delete(k);
}
on('chunk:unloaded', hide);
function meshChunk(k, ch) {
  const { cx, cz, d } = ch, bx = cx * CS, bz = cz * CS;
  const op = { p: [], n: [], c: [], i: [] }, tr = { p: [], n: [], c: [], i: [] };
  const get = (x, y, z) => {
    if (y < 0) return BEDROCK; if (y >= H) return AIR;
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
      if (id === WATER) { if (n !== AIR) continue; }
      else if (isT) { if (n === id || (n !== AIR && !BL[n].transparent)) continue; }
      else if (n !== AIR && !BL[n].transparent) continue;
      if (!v) v = 0.93 + 0.07 * hash3(bx + x, y, bz + z);
      const buf = isT ? tr : op, col = f.d[1] > 0 ? bd.top : f.d[1] < 0 ? bd.bot : bd.side;
      // Fixed side tint stays restrained; world lights handle the main shading.
      let sh = bd.glow ? Math.max(f.s, bd.glow) * 1.1 : (f.d[1] > 0 ? 1 : f.d[1] < 0 ? 0.74 : 0.9);
      if (!bd.glow && y < SEA - 2) sh *= 0.72 + 0.28 * Math.max(0, 1 - (SEA - y) / 30);
      const base = buf.p.length / 3, drop = (id === WATER && f.d[1] > 0) ? 0.12 : 0;
      for (let k = 0; k < 4; k++) {
        const c = f.c[k], ao = cornerAO(get, x, y, z, f.ao[k]);
        buf.p.push(x + c[0], y + c[1] - (c[1] ? drop : 0), z + c[2]);
        buf.n.push(f.d[0], f.d[1], f.d[2]);
        buf.c.push(col[0] * sh * v * ao, col[1] * sh * v * ao, col[2] * sh * v * ao);
      }
      buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  hide(k);
  const m = { mesh: null, tmesh: null }, g1 = buildGeo(op), g2 = buildGeo(tr);
  if (g1) { m.mesh = new THREE.Mesh(g1, opaqueMat); m.mesh.position.set(bx, 0, bz); scene.add(m.mesh); }
  if (g2) { m.tmesh = new THREE.Mesh(g2, transMat); m.tmesh.position.set(bx, 0, bz); m.tmesh.renderOrder = 1; scene.add(m.tmesh); }
  shown.set(k, m);
  ch.dirty = false;
}

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

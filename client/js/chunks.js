// Chunk storage, block access, meshing and streaming around the player.
import * as THREE from 'three';
import { BL } from './blocks.js';
import { hash3 } from './noise.js';
import { CS, H, SEA, genChunk, idx } from './terrain.js';
import { scene, opaqueMat, transMat, RD } from './scene.js';

export const chunks = new Map();
const edits = new Map();
export const key = (x, z) => x + ',' + z;

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
function buildGeo(buf) {
  if (!buf.p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
  g.setIndex(buf.i);
  g.computeBoundingSphere();
  return g;
}
function meshChunk(ch) {
  const { cx, cz, d } = ch, bx = cx * CS, bz = cz * CS;
  const op = { p: [], c: [], i: [] }, tr = { p: [], c: [], i: [] };
  const get = (x, y, z) => {
    if (y < 0) return 31; if (y >= H) return 0;
    if (x >= 0 && x < CS && z >= 0 && z < CS) return d[idx(x, y, z)];
    return getBlock(bx + x, y, bz + z);
  };
  for (let y = 0; y < H; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const id = d[idx(x, y, z)];
    if (!id) continue;
    const bd = BL[id], isT = !!bd.transparent, v = 0.88 + 0.12 * hash3(bx + x, y, bz + z);
    for (const f of FACES) {
      const n = get(x + f.d[0], y + f.d[1], z + f.d[2]);
      if (id === 5) { if (n !== 0) continue; }
      else if (isT) { if (n === id || (n !== 0 && !BL[n].transparent)) continue; }
      else if (n !== 0 && !BL[n].transparent) continue;
      const buf = isT ? tr : op, col = f.d[1] > 0 ? bd.top : f.d[1] < 0 ? bd.bot : bd.side;
      let sh = bd.glow ? Math.max(f.s, bd.glow) * 1.15 : f.s * v;
      if (!bd.glow && y < SEA - 2) sh *= 0.6 + 0.4 * Math.max(0, 1 - (SEA - y) / 30);
      const base = buf.p.length / 3, drop = (id === 5 && f.d[1] > 0) ? 0.12 : 0;
      for (const c of f.c) { buf.p.push(x + c[0], y + c[1] - (c[1] ? drop : 0), z + c[2]); buf.c.push(col[0] * sh, col[1] * sh, col[2] * sh); }
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

export function updateChunks(px, pz) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), toGen = [], toMesh = [];
  for (let dx = -RD - 1; dx <= RD + 1; dx++) for (let dz = -RD - 1; dz <= RD + 1; dz++) {
    const cx = pcx + dx, cz = pcz + dz, dist = dx * dx + dz * dz, ch = chunks.get(key(cx, cz));
    if (!ch) toGen.push([dist, cx, cz]);
    else if (Math.abs(dx) <= RD && Math.abs(dz) <= RD && (!ch.meshed || ch.dirty)) toMesh.push([ch.dirty && ch.meshed ? -1 : dist, ch]);
  }
  toGen.sort((a, b) => a[0] - b[0]);
  for (const [, cx, cz] of toGen.slice(0, 3)) chunks.set(key(cx, cz), { cx, cz, d: genChunk(cx, cz, edits.get(key(cx, cz))), meshed: false, dirty: false });
  toMesh.sort((a, b) => a[0] - b[0]);
  let n = 0;
  for (const [, ch] of toMesh) {
    if (n >= 2) break;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => chunks.has(key(ch.cx + a, ch.cz + b)))) { meshChunk(ch); n++; }
  }
  for (const [k, ch] of chunks) {
    if (Math.abs(ch.cx - pcx) > RD + 3 || Math.abs(ch.cz - pcz) > RD + 3) {
      for (const m of [ch.mesh, ch.tmesh]) if (m) { scene.remove(m); m.geometry.dispose(); }
      chunks.delete(k);
    }
  }
}

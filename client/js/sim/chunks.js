// Chunk storage, block access and streaming around the player. Drawing them is view/chunkmesh.js.
import { emit } from '../core/events.js';
import { AIR, BEDROCK } from './blocks.js';
import { edits, recordEdit } from './edits.js';
import { CS, H, genChunk, idx, chunkKey as key } from './terrain.js';

export const RD = 7; // render distance in chunks
export const chunks = new Map();

export function getBlock(wx, y, wz) {
  if (y < 0) return BEDROCK; if (y >= H) return AIR;
  const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS), ch = chunks.get(key(cx, cz));
  return ch ? ch.d[idx(wx - cx * CS, y, wz - cz * CS)] : AIR;
}
// A chunk is safe to simulate once its neighbours exist too, so nothing walks off into missing ground.
export function neighboursLoaded(cx, cz) {
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!chunks.has(key(cx + a, cz + b))) return false;
  return true;
}
export const chunkReady = (x, z) => neighboursLoaded(Math.floor(x / CS), Math.floor(z / CS));
export function setBlock(wx, y, wz, id) {
  if (y < 1 || y >= H) return;
  const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS), k = key(cx, cz), ch = chunks.get(k);
  if (!ch) return;
  const lx = wx - cx * CS, lz = wz - cz * CS, i = idx(lx, y, lz);
  ch.d[i] = id; ch.dirty = true;
  recordEdit(k, i, id);
  emit('chunk:edited', { cx, cz });
  const mark = (a, b) => { const n = chunks.get(key(a, b)); if (n) n.dirty = true; };
  if (lx === 0) mark(cx - 1, cz); if (lx === CS - 1) mark(cx + 1, cz);
  if (lz === 0) mark(cx, cz - 1); if (lz === CS - 1) mark(cx, cz + 1);
}

// Generates what is missing, nearest first, until the deadline. The nearest chunk is always done, so a slow machine still loads.
export function streamChunks(px, pz, deadline) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), toGen = [];
  for (let dx = -RD - 1; dx <= RD + 1; dx++) for (let dz = -RD - 1; dz <= RD + 1; dz++) {
    const cx = pcx + dx, cz = pcz + dz;
    if (!chunks.has(key(cx, cz))) toGen.push([dx * dx + dz * dz, cx, cz]);
  }
  toGen.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < toGen.length && (!i || performance.now() < deadline); i++) {
    const [, cx, cz] = toGen[i], k = key(cx, cz);
    chunks.set(k, { cx, cz, d: genChunk(cx, cz, edits.get(k)), dirty: false });
  }
  for (const [k, ch] of chunks) {
    if (Math.abs(ch.cx - pcx) > RD + 3 || Math.abs(ch.cz - pcz) > RD + 3) {
      chunks.delete(k);
      emit('chunk:unloaded', k);
    }
  }
}

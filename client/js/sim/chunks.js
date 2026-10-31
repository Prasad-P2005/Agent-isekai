// Chunk storage, block access and streaming around the player. Drawing them is view/chunkmesh.js.
import { emit } from '../core/events.js';
import { AIR, BEDROCK, EMIT } from './blocks.js';
import { edits, recordEdit } from './edits.js';
import { CS, H, genChunk, idx, chunkKey as key, topOf } from './terrain.js';

export const RD = 10; // render distance in chunks
export const LIGHT_REACH = 12; // how many blocks a lamp's light crosses, so how far a change to one must spread
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
// Lamps are found once per chunk: a whole chunk would be too much to read every time one changes.
export function lampsOf(ch) {
  if (ch.lamps) return ch.lamps;
  const out = [], { d } = ch;
  for (let i = 0; i < d.length; i++) if (EMIT[d[i]]) out.push(i);
  return (ch.lamps = out);
}
export function setBlock(wx, y, wz, id) {
  if (y < 1 || y >= H) return;
  const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS), k = key(cx, cz), ch = chunks.get(k);
  if (!ch) return;
  const lx = wx - cx * CS, lz = wz - cz * CS, i = idx(lx, y, lz), reach = EMIT[ch.d[i]] || EMIT[id] ? LIGHT_REACH : 1;
  ch.d[i] = id; ch.dirty = true; ch.lamps = null; ch.top = Math.max(ch.top, y);
  recordEdit(k, i, id);
  emit('chunk:edited', { cx, cz });
  const mark = (a, b) => { const n = chunks.get(key(a, b)); if (n) n.dirty = true; };
  const west = lx < reach, east = lx >= CS - reach, north = lz < reach, south = lz >= CS - reach;
  if (west) mark(cx - 1, cz); if (east) mark(cx + 1, cz); if (north) mark(cx, cz - 1); if (south) mark(cx, cz + 1);
  if (reach > 1) { if (west && north) mark(cx - 1, cz - 1); if (east && north) mark(cx + 1, cz - 1); if (west && south) mark(cx - 1, cz + 1); if (east && south) mark(cx + 1, cz + 1); }
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
    const [, cx, cz] = toGen[i], k = key(cx, cz), d = genChunk(cx, cz, edits.get(k));
    chunks.set(k, { cx, cz, d, top: topOf(d), lamps: null, dirty: false });
  }
  for (const [k, ch] of chunks) {
    if (Math.abs(ch.cx - pcx) > RD + 3 || Math.abs(ch.cz - pcz) > RD + 3) {
      chunks.delete(k);
      emit('chunk:unloaded', k);
    }
  }
}

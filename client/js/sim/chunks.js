// Chunk storage, block access and streaming around the player. Drawing them is view/chunkmesh.js.
import { emit, on } from '../core/events.js';
import { settings } from '../core/settings.js';
import { AIR, BEDROCK, EMIT } from './blocks.js';
import { edits, recordEdit } from './edits.js';
import { CS, H, genChunk, idx, chunkKey as key, topOf } from './terrain.js';

export let RD = settings.renderDistance; // render distance in chunks
const SIM_REACH = 8; // however little is drawn, creatures come and go this far from the hero
export const LIGHT_REACH = 12; // how many blocks a lamp's light crosses, so how far a change to one must spread
export const chunks = new Map();
on('settings:changed', moved => { if (moved.includes('renderDistance')) RD = settings.renderDistance; });

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

// A farm makes chunks on other threads (view/workers.js) and hands them to landChunk. Without one they are made here, which is what the tests do.
let farm = null, wanted = [], scanX = null, scanZ = null, scanReach = 0, scanSize = -1;
export function useFarm(f) { farm = f; scanSize = -1; }
export function landChunk(cx, cz, d) {
  const k = key(cx, cz), mine = edits.get(k);
  if (chunks.has(k) || Math.abs(cx - scanX) > scanReach + 4 || Math.abs(cz - scanZ) > scanReach + 4) return;
  if (mine) for (const [i, id] of mine) d[i] = id;
  chunks.set(k, { cx, cz, d, top: topOf(d), lamps: null, dirty: false });
}
// The list of what is missing only changes when the hero crosses a chunk or something arrives, so most frames have nothing to look at.
function scan(pcx, pcz, reach) {
  const far = (reach + 2.5) ** 2, list = []; // a chunk at the rim is only drawn once all eight around it exist
  for (let dx = -reach - 3; dx <= reach + 3; dx++) for (let dz = -reach - 3; dz <= reach + 3; dz++) {
    const d = dx * dx + dz * dz;
    if (d <= far && !chunks.has(key(pcx + dx, pcz + dz))) list.push([d, pcx + dx, pcz + dz]);
  }
  wanted = list.sort((a, b) => b[0] - a[0]); // nearest last, to be taken off the end
  for (const [k, ch] of chunks) {
    if (Math.abs(ch.cx - pcx) > reach + 4 || Math.abs(ch.cz - pcz) > reach + 4) {
      chunks.delete(k);
      emit('chunk:unloaded', k);
    }
  }
}
// Generates what is missing, nearest first, until the deadline. The nearest chunk is always done, so a slow machine still loads.
export function streamChunks(px, pz, deadline) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), reach = Math.max(RD, SIM_REACH);
  if (pcx !== scanX || pcz !== scanZ || reach !== scanReach || chunks.size !== scanSize) { scanX = pcx; scanZ = pcz; scanReach = reach; scan(pcx, pcz, reach); }
  for (let first = true; wanted.length && (first || performance.now() < deadline); first = false) {
    const [, cx, cz] = wanted[wanted.length - 1];
    if (farm && !farm.ask(cx, cz)) break; // the farm is full: the rest wait their turn
    wanted.pop();
    if (!farm) landChunk(cx, cz, genChunk(cx, cz));
  }
  scanSize = chunks.size;
}

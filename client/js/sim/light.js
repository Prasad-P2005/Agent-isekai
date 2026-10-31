// How bright a spot is, for whatever decides what may appear there. The mesher floods light properly for drawing. This is the cheap answer:
// lamps fall off with distance and walls do not stop them, which only ever errs on the side of a safe room.
import { DIM, EMIT, WARDS } from './blocks.js';
import { chunks, getBlock, lampsOf } from './chunks.js';
import { CS, chunkKey as key } from './terrain.js';

export function lampLight(x, y, z) {
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  let best = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const c = chunks.get(key(cx + a, cz + b));
    if (!c) continue;
    for (const i of lampsOf(c)) {
      const id = c.d[i];
      if (!WARDS[id]) continue;
      const ly = Math.floor(i / (CS * CS)), rest = i - ly * CS * CS, lx = c.cx * CS + rest % CS, lz = c.cz * CS + Math.floor(rest / CS);
      best = Math.max(best, EMIT[id] - Math.abs(x - lx) - Math.abs(y - ly) - Math.abs(z - lz));
    }
  }
  return best;
}
// 15 under open sky, less through leaves and water, nothing under a roof. Time of day is the caller's business.
export function skyLight(x, y, z) {
  const c = chunks.get(key(Math.floor(x / CS), Math.floor(z / CS)));
  if (!c) return 0;
  let level = 15;
  for (let yy = y; yy <= c.top && level > 0; yy++) level -= DIM[getBlock(x, yy, z)];
  return Math.max(0, level);
}

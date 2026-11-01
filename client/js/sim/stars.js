// What falls. The server says where, and the compass points there. A crater is cut when the ground has loaded, through setBlock so that it saves like any other change,
// and walking up to it tells the server it was found.
import { emit } from '../core/events.js';
import { AIR, BL, ID } from './blocks.js';
import { chunkReady, getBlock, setBlock } from './chunks.js';
import { player } from './player.js';
import { SEA, heightAt } from './terrain.js';

const LOOK_EVERY = 0.5, FOUND_WITHIN = 6, RADIUS = 4, DEPTH_PER_BLOCK = 0.8, SCORCHED = 0.45;
const { Obsidian, Blackstone, ManaCrystal } = ID;
const stars = [];
let lookT = 0;

export function fallStar(x, z) { stars.push({ x: Math.floor(x), z: Math.floor(z), cut: false }); }
export const clearStars = () => { stars.length = 0; };

function cutCrater(s) {
  const top = heightAt(s.x, s.z);
  if (top < SEA) return; // it went into the water, which keeps its own secrets
  for (let dz = -RADIUS; dz <= RADIUS; dz++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const away = Math.hypot(dx, dz);
    if (away > RADIUS) continue;
    const x = s.x + dx, z = s.z + dz, ground = heightAt(x, z), floor = ground - Math.round((RADIUS - away) * DEPTH_PER_BLOCK);
    for (let y = ground + 1; y > floor; y--) if (BL[getBlock(x, y, z)]?.hardness != null) setBlock(x, y, z, AIR);
    setBlock(x, floor, z, Math.random() < SCORCHED ? Obsidian : Blackstone);
  }
  const heart = top - Math.round(RADIUS * DEPTH_PER_BLOCK);
  setBlock(s.x, heart + 1, s.z, ManaCrystal);
}
const ready = s => [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]].every(([a, b]) => chunkReady(s.x + a, s.z + b));
export function updateStars(dt) {
  lookT -= dt;
  if (lookT > 0 || !stars.length) return;
  lookT = LOOK_EVERY;
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    if (!s.cut && ready(s)) { s.cut = true; cutCrater(s); }
    if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < FOUND_WITHIN) { stars.splice(i, 1); emit('star:reached'); }
  }
}

// Things lying in the world: what a block gives up, what a creature leaves behind, and whatever the hero throws away. Each is a small body with a fall of its own, in
// Minecraft's numbers: it pops out, lands, and after a moment can be walked over and taken. Alike things lying close together become one stack, and what is left for five
// minutes of play is gone. A thing past the loaded world waits, and ages no further. Drawing them is view/drops.js. They go to the server with the bag, in one report,
// so that a crash can neither lose a thrown stack nor leave it in two places.
import { keyOf } from '../core/bindings.js';
import { ITEMS } from '../core/content.js';
import { emit, toast } from '../core/events.js';
import { rolled, rule } from '../core/rules.js';
import { creative } from '../core/state.js';
import { Vec3 } from '../core/vec3.js';
import { ents } from './beings.js';
import { MAGMA, solid, wet } from './blocks.js';
import { chunkReady, getBlock } from './chunks.js';
import { addItem, bag, changed, heldStack, hotbar } from './inventory.js';
import { eye, lookDir, player } from './player.js';

const GRAVITY = 16, AIR_KEEP = 0.667, GROUND_KEEP = 2.4e-5, WATER_KEEP = 0.02, RISE = 1.2, RISE_RATE = 12, FALLS_AT = 30; // Minecraft's, per second rather than per tick
const WIDE = 0.125, TALL = 0.25;
const TAKE_ACROSS = 1.3, TAKE_BELOW = 0.5, TAKE_ABOVE = 2.3; // the hero's body and a block all round, or half a block up and down
const SETTLED_WAIT = 0.5, THROWN_WAIT = 2, TOO_FULL_WAIT = 0.5, FULL_TOLD_EVERY = 8; // what falls can be picked up at once, and what is thrown gives the hand time to leave
const LIFETIME = 300, COPY_LIFETIME = 20, MOST = 256, JOIN_WITHIN = 1, JOIN_EVERY = 30, WAKE_EVERY = 8;
const THROW_SPEED = 6, THROW_RISE = 2, THROW_FROM = 0.3, POP_ACROSS = 3, POP_UP = 4;
const OFFER_WITHIN = 3; // a thrown thing that comes to rest by a Law Stone is hers
const ESCAPES = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 2, 0]];

export const drops = [];
let joinT = 0, fullT = 0;

const blocked = (x, y, z) => {
  for (const dx of [-WIDE, WIDE]) for (const dz of [-WIDE, WIDE]) for (const dy of [0, TALL]) if (solid(getBlock(Math.floor(x + dx), Math.floor(y + dy), Math.floor(z + dz)))) return true;
  return false;
};
function lay(id, n, x, y, z, { vel = null, wait = SETTLED_WAIT, dur, thrown = false, copy = false, age = 0 }) {
  drops.push({ id, n, ...(ITEMS[id].dur ? { dur: dur ?? ITEMS[id].dur } : {}), pos: new Vec3(x, y, z), last: new Vec3(x, y, z), vel: vel ? vel.clone() : new Vec3(), age, wait, rest: false, thrown, copy, tick: Math.floor(Math.random() * WAKE_EVERY), seed: Math.random() * Math.PI * 2, lit: -1 });
  while (drops.length > MOST) drops.shift();
}
// `wait` is how long before it can be taken. `copy` is what creative mode throws, which was never really in the bag, so it can never get into it.
export function spawnDrop(id, n, x, y, z, options = {}) {
  const it = ITEMS[id];
  if (!it || n <= 0) return;
  for (let left = n; left > 0; left -= it.stack) lay(id, Math.min(left, it.stack), x, y, z, options);
  emit('blocks:changed');
}
// Out of a block or a body, in whatever direction it happens to go.
export function popOut(id, n, x, y, z, dur) {
  const away = () => (Math.random() - 0.5) * POP_ACROSS;
  spawnDrop(id, n, x + away() * 0.08, y, z + away() * 0.08, { dur, vel: new Vec3(away(), POP_UP * (0.7 + Math.random() * 0.3), away()) });
}
// What a creature leaves where it fell. Items are named after what the data calls them, the same way tools/make_items.py names them.
const slug = name => name.toLowerCase().replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
export function leaveBehind(e) {
  const { loot, meat, drops: extras = [], h } = e.def, { x, z } = e.pos, y = e.pos.y + h / 2, luck = rule('loot');
  if (loot) popOut(slug(loot.name), rolled(luck), x, y, z);
  if (meat) popOut(meat, 1, x, y, z);
  for (const [id, chance, least, most] of extras) if (Math.random() < chance * luck) popOut(id, least + Math.floor(Math.random() * (most - least + 1)), x, y, z);
}
// From the hero, where they are looking.
export function throwAway(id, n, dur, copy = false) {
  const from = eye(), d = lookDir(), vel = d.clone().multiplyScalar(THROW_SPEED);
  vel.y += THROW_RISE;
  from.y -= THROW_FROM;
  spawnDrop(id, n, from.x + d.x * THROW_FROM, from.y + d.y * THROW_FROM, from.z + d.z * THROW_FROM, { dur, vel, wait: THROWN_WAIT, thrown: true, copy });
  emit('drop:thrown');
}
// One of what is in the hand, or all of it. Creative mode throws a copy, because its hotbar holds no real things.
export function tossHeld(all) {
  const s = heldStack();
  if (!s) return false;
  if (creative()) { throwAway(s.id, all ? ITEMS[s.id].stack : 1, s.dur, true); return true; }
  const n = all ? s.n : 1;
  throwAway(s.id, n, s.dur);
  s.n -= n;
  if (s.n <= 0) bag()[hotbar.slot] = null;
  changed();
  return true;
}

function remove(i) { drops.splice(i, 1); emit('blocks:changed'); }
function moveAxis(d, axis, by) {
  const was = d.pos[axis];
  d.pos[axis] += by;
  if (!blocked(d.pos.x, d.pos.y, d.pos.z)) return false;
  d.pos[axis] = was;
  d.vel[axis] = 0;
  return true;
}
// A block was set down on it, or it landed in a wall: it moves to the nearest room there is.
function shoveOut(d) {
  const x = Math.floor(d.pos.x), y = Math.floor(d.pos.y), z = Math.floor(d.pos.z);
  for (const [a, b, c] of ESCAPES) if (!solid(getBlock(x + a, y + b, z + c))) { d.pos.set(x + a + 0.5, y + b + 0.1, z + c + 0.5); d.last.copy(d.pos); d.rest = false; return; }
}
function fall(d, dt) {
  const inWater = wet(getBlock(Math.floor(d.pos.x), Math.floor(d.pos.y + TALL / 2), Math.floor(d.pos.z)));
  if (inWater) d.vel.y = Math.min(RISE, d.vel.y + RISE_RATE * dt); // it floats up, and bobs at the top
  else d.vel.y = Math.max(-FALLS_AT, d.vel.y - GRAVITY * dt);
  const hit = moveAxis(d, 'y', d.vel.y * dt) && d.vel.y === 0, down = hit && blocked(d.pos.x, d.pos.y - 0.02, d.pos.z), keep = (inWater ? WATER_KEEP : down ? GROUND_KEEP : AIR_KEEP) ** dt;
  d.vel.x *= keep; d.vel.z *= keep;
  moveAxis(d, 'x', d.vel.x * dt);
  moveAxis(d, 'z', d.vel.z * dt);
  if (down && Math.hypot(d.vel.x, d.vel.z) < 0.05) { d.rest = true; d.vel.set(0, 0, 0); }
}
// Worn tools stay as they are: only what stacks becomes one stack.
function joinUp() {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i], it = ITEMS[d.id];
    if (it.dur || d.copy) continue;
    for (let j = i - 1; j >= 0; j--) {
      const o = drops[j];
      if (o.id !== d.id || o.copy || !d.rest || !o.rest || o.n >= it.stack || Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y, o.pos.z - d.pos.z) > JOIN_WITHIN) continue;
      const moved = Math.min(d.n, it.stack - o.n);
      o.n += moved; d.n -= moved;
      o.age = Math.min(o.age, d.age); o.wait = Math.max(o.wait, d.wait); o.thrown ||= d.thrown;
      if (!d.n) { remove(i); break; }
    }
  }
}
function take(d, i) {
  const left = addItem(d.id, d.n, d.dur);
  if (left === d.n) {
    d.wait = TOO_FULL_WAIT;
    if (fullT <= 0) { fullT = FULL_TOLD_EVERY; toast(`Your bag is full. ${keyOf('drop')} throws things out of it.`, 3); }
    return;
  }
  emit('drop:taken', { id: d.id, x: d.pos.x, y: d.pos.y, z: d.pos.z });
  d.n = left;
  if (!left) remove(i);
}
const inReach = d => {
  const p = player.pos, across = TAKE_ACROSS * rule('pickup'), up = d.pos.y - p.y;
  return Math.abs(d.pos.x - p.x) <= across && Math.abs(d.pos.z - p.z) <= across && up >= -TAKE_BELOW && up <= TAKE_ABOVE;
};
function wake(d, i) {
  if (d.age > (d.copy ? COPY_LIFETIME : LIFETIME)) return remove(i);
  if (blocked(d.pos.x, d.pos.y, d.pos.z)) return shoveOut(d);
  if (!blocked(d.pos.x, d.pos.y - 0.02, d.pos.z) || wet(getBlock(Math.floor(d.pos.x), Math.floor(d.pos.y), Math.floor(d.pos.z)))) d.rest = false;
  if (getBlock(Math.floor(d.pos.x), Math.floor(d.pos.y - 0.02), Math.floor(d.pos.z)) === MAGMA) { emit('drop:burnt', d); return remove(i); }
  if (d.thrown && !d.copy && d.rest && ents.some(e => e.kind === 'law_stone' && e.pos.distanceTo(d.pos) < OFFER_WITHIN)) { emit('item:offered', { id: d.id, n: d.n, x: d.pos.x, y: d.pos.y, z: d.pos.z }); remove(i); }
}
export function updateDrops(dt) {
  fullT -= dt;
  const free = !creative();
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.last.copy(d.pos);
    if (d.wait > 0) d.wait -= dt;
    if (d.rest) {
      if (++d.tick % WAKE_EVERY === 0) { if (!chunkReady(d.pos.x, d.pos.z)) continue; d.age += dt * WAKE_EVERY; wake(d, i); if (drops[i] !== d) continue; }
    } else {
      if (!chunkReady(d.pos.x, d.pos.z)) continue; // nothing falls out of the world while its ground is away
      d.age += dt;
      fall(d, dt);
      if (++d.tick % WAKE_EVERY === 0) { wake(d, i); if (drops[i] !== d) continue; }
    }
    if (free && !d.copy && d.wait <= 0 && inReach(d)) take(d, i);
  }
  if (--joinT <= 0) { joinT = JOIN_EVERY; joinUp(); }
}

// ---------- what the server keeps ----------
export const dropReport = () => drops.filter(d => !d.copy).map(d => ({ id: d.id, n: d.n, ...(d.dur != null ? { dur: d.dur } : {}), x: d.pos.x, y: d.pos.y, z: d.pos.z, age: d.age, wait: Math.max(0, d.wait), thrown: d.thrown }));
export function loadDrops(saved = []) {
  drops.length = 0;
  for (const s of saved) if (ITEMS[s.id]) lay(s.id, s.n, s.x, s.y, s.z, { dur: s.dur, wait: s.wait ?? 0, thrown: !!s.thrown, age: s.age ?? 0 });
}

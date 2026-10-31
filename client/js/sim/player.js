// The player: movement physics, health/mana and block raycasting.
import { G } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { Vec3 } from '../core/vec3.js';
import { BEDROCK, MAGMA, WATER, solid } from './blocks.js';
import { getBlock } from './chunks.js';
import { H, LAND, heightAt, landOf } from './terrain.js';

const EYE_HEIGHT = 1.62;
const VIEW_RANGE = 96, VIEW_CONE = 0.35; // past this, haze does the hiding. The cone is wider than the screen, to allow for a turn of the head
const FLIGHT_COST = 4, FLIGHT_SPRINT_COST = 10; // mana per second
const MANA_REGEN = 0.06, SPIRE_FLOW = 3, WARD_PRICE = 2; // a share of the well per second, how much faster it fills by a Crystal Spire, mana for each point of a warded blow
// How quickly the body takes up the speed it is asked for, per second. Higher is snappier.
const GRIP = { walk: 12, stop: 16, air: 5, water: 6, fly: 7 };
const STEP_SPRING = 20, MAX_STEP_LAG = 1.4, STEP_CLEARANCE = 0.001;
export const player = {
  pos: new Vec3(), vel: new Vec3(), kb: new Vec3(), spawn: new Vec3(), lastEye: new Vec3(),
  onGround: false, fly: false, yaw: 0, pitch: 0, ready: false, restored: false, stepLag: 0, stepRate: 0,
  hp: 20, mana: 100, wardT: 0, iframe: 0, dj: false, wanted: 0, lastHurt: 99, atkCd: 0, wet: false, sprinting: false,
};
export const has = a => !!G.profile && G.profile.abilities.includes(a);
export const maxHp = () => (G.profile ? G.profile.max_hp : 20);
export const maxMana = () => (G.profile ? G.profile.max_mana : 100);
// Where the player sees from, and so where they aim from: the crosshair stays true while the eye catches up with a step.
export const eye = () => new Vec3(player.pos.x, player.pos.y + EYE_HEIGHT - player.stepLag, player.pos.z);
export function lookDir() {
  const c = Math.cos(player.pitch);
  return new Vec3(-Math.sin(player.yaw) * c, Math.sin(player.pitch), -Math.cos(player.yaw) * c);
}

// Puts the player where the save says. A new game starts at the world spawn.
export function placePlayer(world) {
  const saved = world.player;
  player.ready = false; player.fly = false; player.yaw = player.pitch = 0; player.onGround = false;
  player.vel.set(0, 0, 0); player.kb.set(0, 0, 0); player.stepLag = player.stepRate = 0;
  player.spawn.set(world.spawn.x, heightAt(Math.floor(world.spawn.x), Math.floor(world.spawn.z)) + 2, world.spawn.z);
  player.restored = !!saved.pos;
  player.pos.copy(saved.pos || player.spawn);
  player.hp = saved.hp > 0 ? saved.hp : maxHp();
  player.mana = saved.mana ?? maxMana();
  player.wardT = 0;
  player.wanted = saved.wanted || 0;
  G.dayTime = world.day_time ?? G.dayTime;
}
// Called once the ground under the player has loaded.
export function settlePlayer() {
  const p = player.pos;
  if (!player.restored) {
    let y = H - 1; while (y > 0 && !getBlock(Math.floor(p.x), y, Math.floor(p.z))) y--;
    p.y = y + 1; player.spawn.copy(p);
  }
  player.ready = true;
}

export function collides(p) {
  for (let x = Math.floor(p.x - 0.3); x <= Math.floor(p.x + 0.3); x++)
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + 1.79); y++)
      for (let z = Math.floor(p.z - 0.3); z <= Math.floor(p.z + 0.3); z++)
        if (solid(getBlock(x, y, z))) return true;
  return false;
}
// Walks up a one-block ledge. The body stands on top at once, because a real hop made the player bob on every block edge.
// What the player sees is the eye, which is left where it was and rises after the body on a spring.
function stepUp() {
  if (!player.onGround || player.fly) return false;
  const rise = Math.floor(player.pos.y) + 1 + STEP_CLEARANCE - player.pos.y;
  player.pos.y += rise;
  if (collides(player.pos)) { player.pos.y -= rise; return false; }
  player.vel.y = Math.max(0, player.vel.y); // a jump pressed against the ledge still jumps
  player.stepLag = Math.min(MAX_STEP_LAG, player.stepLag + rise);
  return true;
}
function moveAxis(a, d) {
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.2)), s = d / steps;
  for (let i = 0; i < steps; i++) {
    player.pos[a] += s;
    if (!collides(player.pos) || (a !== 'y' && stepUp())) continue;
    player.pos[a] -= s;
    if (a === 'y' && s < 0) player.onGround = true;
    player.vel[a] = 0;
    return;
  }
}
export function updatePlayer(dt) {
  const p = player.pos, keys = G.keys;
  player.lastEye.copy(eye());
  const inWater = getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) === WATER;
  if (inWater && !player.wet && player.vel.y < -3) emit('player:splashed', { x: p.x, y: p.y, z: p.z, speed: -player.vel.y });
  player.wet = inWater;
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  player.sprinting = !!sprint && !player.fly && Math.hypot(player.vel.x, player.vel.z) > 5;
  let speed = player.fly ? (sprint ? 30 : 14) : (sprint ? 6.5 : 4.3);
  if (has('swift')) speed *= 1.5;
  if (inWater && !player.fly) speed *= 0.6;
  if (player.fly) { player.mana -= (sprint ? FLIGHT_SPRINT_COST : FLIGHT_COST) * dt; if (player.mana <= 0) { player.mana = 0; player.fly = false; toast('Your mana ran dry; flight fades.'); } }
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) { mx += fx; mz += fz; }
  if (keys.KeyS || keys.ArrowDown) { mx -= fx; mz -= fz; }
  if (keys.KeyA || keys.ArrowLeft) { mx += fz; mz -= fx; }
  if (keys.KeyD || keys.ArrowRight) { mx -= fz; mz += fx; }
  const l = Math.hypot(mx, mz) || 1;
  player.kb.multiplyScalar(Math.max(0, 1 - 6 * dt));
  const rate = player.fly ? GRIP.fly : inWater ? GRIP.water : !player.onGround ? GRIP.air : mx || mz ? GRIP.walk : GRIP.stop;
  const grip = 1 - Math.exp(-rate * dt);
  player.vel.x += (mx / l * speed - player.vel.x) * grip;
  player.vel.z += (mz / l * speed - player.vel.z) * grip;
  if (player.fly) player.vel.y += (((keys.Space ? 1 : 0) - (sprint ? 1 : 0)) * 12 - player.vel.y) * grip;
  else if (inWater) player.vel.y = keys.Space ? 4 : Math.max(player.vel.y - 12 * dt, -2.5);
  else { player.vel.y = Math.max(player.vel.y - 28 * dt, -50); if (keys.Space && player.onGround) player.vel.y = 9; }
  moveAxis('x', (player.vel.x + player.kb.x) * dt);
  moveAxis('z', (player.vel.z + player.kb.z) * dt);
  player.onGround = false;
  const vy = player.vel.y;
  moveAxis('y', player.vel.y * dt);
  if (player.onGround) {
    player.dj = false;
    if (vy < -5) emit('player:landed', -vy);
    if (vy < -17 && !inWater) damagePlayer(Math.round((-vy - 17) * 0.7), 'a fall');
  }
  player.stepRate -= (STEP_SPRING * STEP_SPRING * player.stepLag + 2 * STEP_SPRING * player.stepRate) * dt;
  player.stepLag += player.stepRate * dt;
  // the world is finite: the sea goes on forever, but you may not
  const lim = G.world.lands.length * LAND + 20;
  if (p.x < -20 || p.z < -20 || p.x > lim || p.z > lim) {
    p.x = Math.min(lim, Math.max(-20, p.x)); p.z = Math.min(lim, Math.max(-20, p.z));
    toast('Beyond lies only the endless sea…', 2);
  }
}

export function raycast(o, dir, max, hits = solid) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let n = [0, 0, 0], t = 0;
  while (t <= max) {
    const id = getBlock(x, y, z);
    if (hits(id) && id !== BEDROCK) return { x, y, z, n, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
  }
  return null;
}
export function lineOfSight(a, b) {
  const d = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z), len = d.length();
  if (len < 0.01) return true;
  d.multiplyScalar(1 / len);
  const hit = raycast(a, d, len);
  return !hit || hit.t >= len - 0.6;
}

// Whether the hero could see this spot right now, so that nothing appears or vanishes in front of them.
export function inView(x, y, z) {
  const from = eye(), d = lookDir(), dx = x - from.x, dy = y - from.y, dz = z - from.z, l = Math.hypot(dx, dy, dz) || 1;
  return l < VIEW_RANGE && (dx * d.x + dy * d.y + dz * d.z) / l > VIEW_CONE && lineOfSight(from, { x, y, z });
}

// ---------- health ----------
export function damagePlayer(n, src, killer = null) {
  if (n <= 0 || player.iframe > 0 || !player.ready || G.phase !== 'world') return;
  n = Math.max(1, Math.round(n * (1 - (G.profile?.armor || 0))));
  player.iframe = 0.4;
  if (player.wardT > 0) n = wardOff(n);
  if (n <= 0) return;
  player.hp -= n; player.lastHurt = 0;
  emit('player:hurt');
  if (player.hp <= 0) die(src, killer);
}
// A ward pays for a blow in mana. Whatever the mana can't cover gets through, and the ward falls with it.
function wardOff(n) {
  const held = Math.min(n, player.mana / WARD_PRICE);
  player.mana -= held * WARD_PRICE;
  emit('ward:struck');
  if (held === n) return 0;
  player.wardT = 0;
  emit('ward:broken');
  return Math.ceil(n - held);
}
function die(src, killer) {
  toast(`☠ You were slain by ${src}. Your soul returns to the world…`, 6);
  player.hp = maxHp(); player.mana = maxMana(); player.wardT = 0; player.fly = false; player.wanted = 0;
  player.pos.copy(player.spawn); player.vel.set(0, 0, 0); player.kb.set(0, 0, 0); player.stepLag = player.stepRate = 0;
  // Only a monster can grow into a nemesis: the law's servants are just doing their job.
  emit('player:died', { by: src, kind: killer && !killer.def.lawful && !killer.def.hunter ? killer.kind : '' });
}
export function heal(n) { player.hp = Math.min(maxHp(), player.hp + n); }
export function updateStats(dt) {
  player.iframe -= dt; player.atkCd -= dt; player.lastHurt += dt;
  if (player.wardT > 0) { player.wardT -= dt; if (player.wardT <= 0) emit('ward:broken'); }
  // Holding flight up takes all you've got. The Spires give mana off freely, which is why the Law Stones stand at their feet.
  if (!player.fly) player.mana = Math.min(maxMana(), player.mana + maxMana() * MANA_REGEN * (landOf(player.pos.x, player.pos.z).structure === 'crystal_spire' ? SPIRE_FLOW : 1) * dt);
  if (player.lastHurt > 5) heal(0.25 * dt);
  if (player.hp > maxHp()) player.hp = maxHp();
  if (getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.1), Math.floor(player.pos.z)) === MAGMA) damagePlayer(2, 'magma');
}

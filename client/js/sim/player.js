// The player: movement physics, health/mana and block raycasting.
import { G } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { Vec3 } from '../core/vec3.js';
import { BEDROCK, MAGMA, WATER, solid } from './blocks.js';
import { getBlock } from './chunks.js';
import { H, LAND, heightAt } from './terrain.js';

const EYE_HEIGHT = 1.62;
export const player = {
  pos: new Vec3(), vel: new Vec3(), kb: new Vec3(), spawn: new Vec3(),
  onGround: false, fly: false, yaw: 0, pitch: 0, ready: false, restored: false,
  hp: 20, mana: 100, maxMana: 100, iframe: 0, dj: false, wanted: 0, lastHurt: 99, atkCd: 0,
};
export const has = a => !!G.profile && G.profile.abilities.includes(a);
export const maxHp = () => (G.profile ? G.profile.max_hp : 20);
export const eye = () => new Vec3(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
export function lookDir() {
  const c = Math.cos(player.pitch);
  return new Vec3(-Math.sin(player.yaw) * c, Math.sin(player.pitch), -Math.cos(player.yaw) * c);
}

// Puts the player where the save says. A new game starts at the world spawn.
export function placePlayer(world) {
  const saved = world.player;
  player.ready = false; player.fly = false; player.yaw = player.pitch = 0; player.onGround = false;
  player.vel.set(0, 0, 0); player.kb.set(0, 0, 0);
  player.spawn.set(world.spawn.x, heightAt(Math.floor(world.spawn.x), Math.floor(world.spawn.z)) + 2, world.spawn.z);
  player.restored = !!saved.pos;
  player.pos.copy(saved.pos || player.spawn);
  player.hp = saved.hp > 0 ? saved.hp : maxHp();
  player.mana = saved.mana ?? player.maxMana;
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
function moveAxis(a, d) {
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.2)), s = d / steps;
  for (let i = 0; i < steps; i++) {
    player.pos[a] += s;
    if (collides(player.pos)) {
      // auto-step: walk up a single block ledge if there is room above it
      if (a !== 'y' && player.onGround && !player.fly) {
        player.pos.y += 1.01;
        // Treat this as a grounded step, not a tiny jump. Adding upward velocity
        // here made the player bob and repeatedly settle on every block edge.
        if (!collides(player.pos)) { player.vel.y = 0; continue; }
        player.pos.y -= 1.01;
      }
      player.pos[a] -= s;
      if (a === 'y') { if (s < 0) player.onGround = true; player.vel.y = 0; }
      return;
    }
  }
}
export function updatePlayer(dt) {
  const p = player.pos, keys = G.keys;
  const inWater = getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)) === WATER;
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  let speed = player.fly ? (sprint ? 30 : 14) : (sprint ? 6.5 : 4.3);
  if (has('swift')) speed *= 1.5;
  if (inWater && !player.fly) speed *= 0.6;
  if (player.fly) { player.mana -= 4 * dt; if (player.mana <= 0) { player.mana = 0; player.fly = false; toast('Your mana ran dry; flight fades.'); } }
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) { mx += fx; mz += fz; }
  if (keys.KeyS || keys.ArrowDown) { mx -= fx; mz -= fz; }
  if (keys.KeyA || keys.ArrowLeft) { mx += fz; mz -= fx; }
  if (keys.KeyD || keys.ArrowRight) { mx -= fz; mz += fx; }
  const l = Math.hypot(mx, mz) || 1;
  player.kb.multiplyScalar(Math.max(0, 1 - 6 * dt));
  player.vel.x = mx / l * speed + player.kb.x; player.vel.z = mz / l * speed + player.kb.z;
  if (player.fly) player.vel.y = ((keys.Space ? 1 : 0) - (sprint ? 1 : 0)) * 12;
  else if (inWater) player.vel.y = keys.Space ? 4 : Math.max(player.vel.y - 12 * dt, -2.5);
  else { player.vel.y = Math.max(player.vel.y - 28 * dt, -50); if (keys.Space && player.onGround) player.vel.y = 9; }
  moveAxis('x', player.vel.x * dt);
  moveAxis('z', player.vel.z * dt);
  player.onGround = false;
  const vy = player.vel.y;
  moveAxis('y', player.vel.y * dt);
  if (player.onGround) {
    player.dj = false;
    if (vy < -17 && !inWater) damagePlayer(Math.round((-vy - 17) * 0.7), 'a fall');
  }
  // the world is finite: the sea goes on forever, but you may not
  const lim = G.world.lands.length * LAND + 20;
  if (p.x < -20 || p.z < -20 || p.x > lim || p.z > lim) {
    p.x = Math.min(lim, Math.max(-20, p.x)); p.z = Math.min(lim, Math.max(-20, p.z));
    toast('Beyond lies only the endless sea…', 2);
  }
}

export function raycast(o, dir, max) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let n = [0, 0, 0], t = 0;
  while (t <= max) {
    const id = getBlock(x, y, z);
    if (solid(id) && id !== BEDROCK) return { x, y, z, n, t };
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

// ---------- health ----------
export function damagePlayer(n, src) {
  if (n <= 0 || player.iframe > 0 || !player.ready || G.phase !== 'world') return;
  n = Math.max(1, Math.round(n * (1 - (G.profile?.armor || 0))));
  player.hp -= n; player.iframe = 0.4; player.lastHurt = 0;
  emit('player:hurt');
  if (player.hp <= 0) die(src);
}
function die(src) {
  toast(`☠ You were slain by ${src}. Your soul returns to the world…`, 6);
  player.hp = maxHp(); player.mana = player.maxMana; player.fly = false; player.wanted = 0;
  player.pos.copy(player.spawn); player.vel.set(0, 0, 0); player.kb.set(0, 0, 0);
  emit('player:died', src);
}
export function heal(n) { player.hp = Math.min(maxHp(), player.hp + n); }
export function updateStats(dt) {
  player.iframe -= dt; player.atkCd -= dt; player.lastHurt += dt;
  player.mana = Math.min(player.maxMana, player.mana + 6 * dt);
  if (player.lastHurt > 5) heal(0.25 * dt);
  if (player.hp > maxHp()) player.hp = maxHp();
  if (getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.1), Math.floor(player.pos.z)) === MAGMA) damagePlayer(2, 'magma');
}

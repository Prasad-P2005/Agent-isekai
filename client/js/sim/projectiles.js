// Fireballs and anything else that flies.
import { emit, on } from '../core/events.js';
import { solid } from './blocks.js';
import { getBlock } from './chunks.js';
import { ents, hurtEntity, isFoe } from './entities.js';
import { damagePlayer, player } from './player.js';

const FIREBALL_DMG = 14, PLAYER_HIT_RADIUS = 0.9;
export const projectiles = [];

// With no `opts` it is the player's own fireball. { hostile: true, dmg, src, killer } makes it a bolt aimed at the player,
// and { blast, dmg, size } a heavy shot that ignores everyone on the way down and bursts where it lands.
export function spawnProjectile(pos, vel, opts = null) {
  const pr = { pos, vel, life: 2.5, hit: false, hostile: !!opts?.hostile, dmg: opts?.dmg ?? FIREBALL_DMG, src: opts?.src, killer: opts?.killer ?? null, blast: opts?.blast ?? 0, size: opts?.size ?? 1 };
  projectiles.push(pr);
  emit('projectile:spawned', pr);
  return pr;
}
on('foe:shot', ({ pos, vel, dmg, src, killer }) => spawnProjectile(pos, vel, { hostile: true, dmg, src, killer }));

function strikePlayer(pr) {
  const p = pr.pos;
  if (Math.hypot(player.pos.x - p.x, player.pos.y + 0.9 - p.y, player.pos.z - p.z) >= PLAYER_HIT_RADIUS) return;
  damagePlayer(pr.dmg, pr.src, pr.killer);
  pr.hit = true;
}
function strikeBeings(pr) {
  const p = pr.pos;
  for (const e of ents) {
    if (Math.hypot(e.pos.x - p.x, e.pos.y + e.def.h / 2 - p.y, e.pos.z - p.z) < Math.max(e.def.w, e.def.h) / 2 + 0.6) {
      const l = Math.hypot(pr.vel.x, pr.vel.z) || 1;
      hurtEntity(e, pr.dmg, pr.vel.x / l, pr.vel.z / l); pr.hit = true;
      return;
    }
  }
}
// Full force at the centre, half at the edge, and only to foes: nothing can be aimed around a bystander from that high up.
function burst(pr) {
  for (const e of ents.filter(isFoe)) {
    const dx = e.pos.x - pr.pos.x, dz = e.pos.z - pr.pos.z, away = e.pos.distanceTo(pr.pos), l = Math.hypot(dx, dz) || 1;
    if (away < pr.blast) hurtEntity(e, Math.round(pr.dmg * (1 - away / pr.blast / 2)), dx / l, dz / l);
  }
}
export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i], p = pr.pos;
    p.addScaledVector(pr.vel, dt); pr.life -= dt;
    pr.hit = solid(getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
    if (!pr.hit && !pr.blast) (pr.hostile ? strikePlayer : strikeBeings)(pr);
    if (pr.hit || pr.life <= 0) {
      projectiles.splice(i, 1);
      if (pr.hit && pr.blast) burst(pr);
      emit('projectile:removed', pr);
    }
  }
}

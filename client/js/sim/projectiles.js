// Fireballs and anything else that flies.
import { emit } from '../core/events.js';
import { solid } from './blocks.js';
import { getBlock } from './chunks.js';
import { ents, hurtEntity } from './entities.js';

export const projectiles = [];

export function spawnProjectile(pos, vel) {
  const pr = { pos, vel, life: 2.5 };
  projectiles.push(pr);
  emit('projectile:spawned', pr);
}
export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i], p = pr.pos;
    p.addScaledVector(pr.vel, dt); pr.life -= dt;
    let dead = pr.life <= 0 || solid(getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
    for (const e of ents) {
      if (dead) break;
      if (Math.hypot(e.pos.x - p.x, e.pos.y + e.def.h / 2 - p.y, e.pos.z - p.z) < Math.max(e.def.w, e.def.h) / 2 + 0.6) {
        const l = Math.hypot(pr.vel.x, pr.vel.z) || 1;
        hurtEntity(e, 14, pr.vel.x / l, pr.vel.z / l); dead = true;
      }
    }
    if (dead) { projectiles.splice(i, 1); emit('projectile:removed', pr); }
  }
}

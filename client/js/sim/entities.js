// Creatures and people: bodies moving through the world and hitting each other. What they want is brains.js, what arrives spawning.js,
// and what leaves lifetime.js. Their bodies are drawn in view/bodies.js.
import { G, creative } from '../core/state.js';
import { CREATURES, WORLD } from '../core/content.js';
import { emit, toast } from '../core/events.js';
import { Vec3 } from '../core/vec3.js';
import { ents, isMonsterKind, isNight, killerName } from './beings.js';
import { alarmKin, callForHelp, shoot, think } from './brains.js';
import { getBlock, chunkReady } from './chunks.js';
import { WATER, solid } from './blocks.js';
import { IDLE_FROM, despawns, offDuty } from './lifetime.js';
import { skyLight } from './light.js';
import { updatePaths } from './paths.js';
import { hintQueue, heightAt } from './terrain.js';
import { heldDef, wearHeld } from './inventory.js';
import { player, damagePlayer, has, eye, inView, lookDir } from './player.js';

export { ents, isNight } from './beings.js';
export const ENT = CREATURES;
const MAX_BEINGS = 72, MAX_HOSTILE = 30, SKY_FALLS_AT = 9, CLIMB = 3.6, HOP = 8, CLIMB_OVER = 0.5, RESTOCK_AFTER = 1800, BITE_AND_BACK = 1.2;
const BOSS_BOLT_DMG = 9, BOSS_BOLT_GAP = [0, 4, 2.5];

export function spawnEntity(kind, x, y, z, opts = {}) {
  const base = ENT[kind];
  if (!base) return null;
  // Only monsters are limited by monsters: a crowd of slimes must not keep the law or the Demon Lord from arriving.
  if (ents.length >= MAX_BEINGS || (isMonsterKind(base) && !base.boss && ents.filter(e => isMonsterKind(e.def)).length >= MAX_HOSTILE)) return null;
  const D = { ...base };
  if (opts.body != null) D.body = opts.body;
  if (opts.hair != null) D.hair = opts.hair;
  if (opts.power) { D.hp = Math.round(D.hp * opts.power); D.dmg = Math.round(D.dmg * (1 + (opts.power - 1) / 2)); } // a monster with a name
  const e = {
    kind, def: D, pos: new Vec3(x, y, z), last: new Vec3(x, y, z), vel: new Vec3(), kb: new Vec3(), yaw: Math.random() * 6.28,
    hp: opts.hp ?? D.hp, maxHp: D.hp, onGround: false, wanderT: 0, wdir: [0, 0], cd: 0.5, hopT: 0, flash: 0,
    fleeT: 0, angryT: opts.angry ? 999 : 0, frozenT: 0, reportT: 0, reportLaw: null, summonT: 6, boltT: 0, phase: 0, attacked: false,
    name: opts.name || (kind === 'demon_lord' ? G.world.demon_lord_name : D.label), title: opts.title || '', res: opts.res || null, natural: !!opts.natural,
    home: opts.home || null, // the structure this being lives in; leaving the area hands the spot back so it returns
    service: opts.service || null, role: opts.role || null, named: opts.named || '', power: opts.power || 0,
    cat: opts.cat || null, nocturnal: !!opts.nocturnal, // which spawn cap it counts against, and whether daylight thins it out
    mx: 0, mz: 0, pace: 0, aim: null, flyY: null, bumped: false, climbT: 0, backT: 0, strafeT: 0, chaseT: 0, flank: Math.random() < 0.5 ? 1 : -1,
    alertT: 0, senseT: 0, sees: false, called: false, route: null, routeT: 0, askedRoute: false, routeTo: null, idleT: 0, offT: 0, leaving: false, hurtT: 999,
  };
  if (e.res) e.res._ent = e;
  ents.push(e);
  emit('entity:spawned', e);
  return e;
}
export function removeEntity(e) {
  const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1);
  if (e.res) e.res._ent = null;
  emit('entity:removed', e);
}
function leaveWorld(e) {
  if (e.home) { e.home.hp = e.hp; hintQueue.push(e.home); } // it comes back, and it comes back as wounded as it left
  else if (e.named) emit('foe:lost', e); // a foe with a name does not give up because you ran
  removeEntity(e);
}
function collidesBox(p, hw, h) {
  for (let x = Math.floor(p.x - hw); x <= Math.floor(p.x + hw); x++)
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + h - 0.01); y++)
      for (let z = Math.floor(p.z - hw); z <= Math.floor(p.z + hw); z++)
        if (solid(getBlock(x, y, z))) return true;
  return false;
}
export const fitsAt = (x, y, z, h = 1.8) => !collidesBox({ x, y, z }, 0.3, h);
// A ledge one block high with room on top: the only wall worth jumping at.
function ledgeAhead(e) {
  const hw = Math.min(0.45, e.def.w / 2), y = Math.floor(e.pos.y), ax = Math.floor(e.pos.x + e.mx * (hw + 0.4)), az = Math.floor(e.pos.z + e.mz * (hw + 0.4)), tall = Math.ceil(e.def.h);
  if (!solid(getBlock(ax, y, az))) return false;
  for (let k = 1; k <= tall; k++) if (solid(getBlock(ax, y + k, az))) return false;
  return !solid(getBlock(Math.floor(e.pos.x), y + tall, Math.floor(e.pos.z)));
}
function moveEnt(e, a, d) {
  const hw = Math.min(0.45, e.def.w / 2), steps = Math.max(1, Math.ceil(Math.abs(d) / 0.2)), s = d / steps;
  for (let i = 0; i < steps; i++) {
    e.pos[a] += s;
    if (collidesBox(e.pos, hw, e.def.h)) {
      e.pos[a] -= s;
      if (a === 'y') { if (s < 0) e.onGround = true; e.vel.y = 0; }
      return true;
    }
  }
  return false;
}
// Spells that pick their own targets only touch those already against the hero, so that a stray bolt can't make a criminal of them.
export const isFoe = o => (o.def.lawful ? o.angryT > 0 || player.wanted > 0 || !!G.profile?.crowned : o.def.wild ? o.angryT > 0 : !o.def.friendly);

function updateEntity(e, dt) {
  const D = e.def, p = e.pos;
  e.last.copy(p);
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z, dy = player.pos.y - p.y, dist = Math.hypot(dx, dz) || 0.001;
  const wanted = player.wanted, bounty = G.profile?.bounty || 0;
  e.hurtT += dt;
  e.idleT = dist < IDLE_FROM || e.aim ? 0 : e.idleT + dt;
  e.leaving = offDuty(e, { wanted, bounty });
  if (e.leaving) e.offT += dt;
  // Before the chunk check: a creature left behind in unloaded ground must still go, or it holds a spawn slot forever.
  const seen = () => inView(p.x, p.y + D.h * 0.6, p.z), underSky = () => skyLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) >= SKY_FALLS_AT;
  if (despawns(e, { dist, night: isNight(), wanted, bounty, roll: Math.random(), seen, underSky })) return leaveWorld(e);
  // Before the chunk check too: a witness who has run into unloaded ground is still on their way to the watch.
  if (e.reportT > 0) { e.reportT -= dt; if (e.reportT <= 0) emit('witness:report', e); }
  if (D.sacred || !chunkReady(p.x, p.z)) return;
  if (e.frozenT > 0) { e.frozenT -= dt; return; } // locked in ice: it neither thinks nor moves, and its grudges wait for it
  e.fleeT -= dt; e.angryT -= dt;
  if (D.regen && e.hurtT > 6 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + D.regen * dt);
  const inWater = getBlock(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z)) === WATER;
  const free = player.ready && (G.locked || G.focused) && !G.uiOpen && !creative(); // to a brain, a creative hero is as absent as a paused one
  think(e, dt, { dist, dx, dz, dy, free, canHit: free && Math.abs(dy) < 16, crowned: !!G.profile?.crowned });

  const tgt = e.aim, tp = tgt === 'player' ? player.pos : tgt ? tgt.pos : null, { mx, mz } = e;
  let speed = D.speed * e.pace * (D.boss && e.phase === 2 ? 1.4 : 1);
  if (mx || mz) e.yaw = Math.atan2(-mx, -mz);
  if (D.slime) { e.hopT -= dt; if (e.onGround) { speed = 0; if ((mx || mz) && e.hopT <= 0) { e.vel.y = 7; e.hopT = 0.5 + Math.random() * 0.6; } } }
  e.kb.multiplyScalar(Math.max(0, 1 - 5 * dt));
  e.vel.x = mx * speed + e.kb.x; e.vel.z = mz * speed + e.kb.z;
  if (D.fly) flyEnt(e, tp, dt);
  else {
    if (D.swim && inWater) e.vel.y = getBlock(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z)) === WATER ? Math.sin(performance.now() / 900 + e.yaw) * 0.6 : -0.8;
    else if (inWater) e.vel.y = Math.min(e.vel.y + 18 * dt, 2.5);
    else e.vel.y = Math.max(e.vel.y - 28 * dt, -40);
    const bx = moveEnt(e, 'x', e.vel.x * dt), bz = moveEnt(e, 'z', e.vel.z * dt);
    e.onGround = false;
    moveEnt(e, 'y', e.vel.y * dt);
    if (bx || bz) { // a wall is walked round, and only a step is jumped
      if (D.climbs) e.vel.y = CLIMB;
      else if ((e.onGround || inWater) && !D.slime && ledgeAhead(e)) e.vel.y = HOP;
      else e.bumped = true;
    }
    if (p.y < -10) return removeEntity(e);
  }
  // attack
  if (tp && D.dmg) {
    e.cd -= dt;
    const reach = D.w / 2 + 1.0 + (D.quad ? D.w * 0.6 : 0), tdx = tp.x - p.x, tdz = tp.z - p.z, td = Math.hypot(tdx, tdz) || 0.01;
    if (Math.hypot(td, tp.y - p.y + 0.5) < reach + 0.6 && e.cd <= 0) {
      e.cd = D.fly ? 1.6 : 1.0;
      emit('entity:struck', e);
      if (tgt === 'player') { damagePlayer(D.dmg, killerName(e), e); player.kb.set(tdx / td * 7, 0, tdz / td * 7); player.vel.y = Math.max(player.vel.y, 5); }
      else hurtEntity(tgt, D.dmg, tdx / td, tdz / td, e);
      if (D.brain === 'pack' || D.brain === 'skirmisher') e.backT = BITE_AND_BACK;
    }
  }
  if (tgt === 'player' && D.boss) bossTurn(e, dt);
}
// Small things fly into walls and rise over them. Ghosts and the Wyrm go where they please.
function flyEnt(e, tp, dt) {
  const D = e.def, p = e.pos, hover = D.hover || 0, big = D.brain === 'wyrm', limit = big ? 14 : 7;
  e.climbT -= dt;
  const free = tp ? tp.y + hover + (Math.hypot(tp.x - p.x, tp.z - p.z) > 7 ? 7 : 0.5) : Math.max(p.y, heightAt(p.x | 0, p.z | 0) + 12 + hover);
  e.vel.y = Math.max(-limit, Math.min(limit, ((e.climbT > 0 ? p.y + 3 : e.flyY ?? free) - p.y) * 2));
  if (big || D.ghost) { p.addScaledVector(e.vel, dt); return; }
  const bx = moveEnt(e, 'x', e.vel.x * dt), bz = moveEnt(e, 'z', e.vel.z * dt);
  moveEnt(e, 'y', e.vel.y * dt);
  if (bx || bz) { e.climbT = CLIMB_OVER; e.bumped = true; }
}
// The Demon Lord's fight has three stages, set by his wounds: he summons, then he calls fire, then the crown drives him harder.
function bossTurn(e, dt) {
  const share = e.hp / e.maxHp, phase = share > 2 / 3 ? 0 : share > 1 / 3 ? 1 : 2, p = e.pos;
  if (phase > e.phase) { e.phase = phase; e.summonT = 0; emit('boss:phase', phase); }
  e.summonT -= dt;
  if (e.summonT <= 0) {
    e.summonT = 12;
    for (let i = 0; i < 2; i++) {
      const x = p.x + Math.random() * 4 - 2, z = p.z + Math.random() * 4 - 2;
      let y = p.y + 3;
      while (!fitsAt(x, y, z, 2.2) && y > p.y) y--; // a low ceiling must not swallow them
      spawnEntity(phase === 2 && !i ? 'demon_knight' : 'imp', x, y, z);
    }
  }
  if (!phase) return;
  e.boltT -= dt;
  if (e.boltT <= 0) { e.boltT = BOSS_BOLT_GAP[phase]; shoot(e, BOSS_BOLT_DMG); }
}

export function hurtEntity(e, dmg, dirx, dirz, by = 'player') {
  const D = e.def, byPlayer = by === 'player';
  if (e.hp <= 0 || D.sacred) return;
  e.hurtT = 0;
  if (byPlayer) e.alertT = Math.max(e.alertT, 9); // whatever just hit it knows where you are now
  if (D.warded) {
    if (!byPlayer) return; // only the hero can end this, or the world would never hear of it
    if (!G.profile?.oathbound) { e.flash = 0.2; toast(D.warded, 2); return; }
  }
  e.hp -= dmg; e.flash = 0.2;
  e.kb.set(dirx * 7, 0, dirz * 7); if (!D.fly) e.vel.y = 4;
  if (byPlayer && D.friendly) {
    if (D.lawful) { e.angryT = 25; callForHelp(e); } else e.fleeT = 12;
    if (!e.attacked && e.hp > 0) { e.attacked = true; emit('crime:committed', { type: 'attack_civilian', victim: e }); }
  }
  if (byPlayer && D.wild) { if (D.brain === 'prey') e.fleeT = 8; else e.angryT = 30; alarmKin(e); }
  if (!byPlayer && D.friendly && !D.lawful) e.fleeT = 8;
  if (e.hp > 0) return;
  e.fell = true; // the view lets the body drop before it goes
  removeEntity(e);
  if (e.home && !D.unique && !D.boss && !D.sacred) hintQueue.push({ ...e.home, hp: undefined, due: RESTOCK_AFTER }); // a garrison fills up again, in time
  const resident = e.res ? { settlement: Math.floor(e.res.id / WORLD.resident_id_base), id: e.res.id } : null;
  if (e.res) e.res.dead = true;
  if (byPlayer && D.friendly) emit('crime:committed', { type: 'kill_' + D.race, victim: e });
  if (byPlayer || resident) emit('entity:killed', { kind: e.kind, byPlayer, resident, named: e.named });
}
export function pickEntity(max) {
  const o = eye(), d = lookDir();
  let best = null;
  for (const e of ents) {
    const hw = e.def.quad ? e.def.w * 0.9 : e.def.w / 2 + 0.1;
    const mn = [e.pos.x - hw, e.pos.y, e.pos.z - hw], mxv = [e.pos.x + hw, e.pos.y + e.def.h, e.pos.z + hw], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    let t0 = 0, t1 = max;
    for (let i = 0; i < 3 && t0 <= t1; i++) {
      const inv = 1 / dd[i]; let a = (mn[i] - oo[i]) * inv, b = (mxv[i] - oo[i]) * inv;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 <= t1 && (!best || t0 < best.t)) best = { e, t: t0 };
  }
  return best;
}
const FIST_CD = 0.35, FIST_REACH = 4.5, SWEEP_REACH = 2.6, SWEEP_SHARE = 0.4, CLEAVE_REACH = 3.8, CLEAVE_SHARE = 0.7, STRONG = 4;
const blowOf = (it, e) => ((has('giant_strength') ? 9 : 4) + (it?.dmg ?? 0) + (player.buffs.strength > 0 ? STRONG : 0)) * (it?.bane && (e.def.demon || e.def.undead) ? it.bane : 1);
export const reachOfHand = () => heldDef()?.reach ?? FIST_REACH;
// A sword clips what stands beside the target and a greatsword cleaves it. Only foes: a swing must never commit a crime the player did not aim.
function sweep(it, target, dmg) {
  const [range, share] = it.motion === 'cleave' ? [CLEAVE_REACH, CLEAVE_SHARE] : it.motion === 'slash' ? [SWEEP_REACH, SWEEP_SHARE] : [0, 0];
  if (!range) return;
  for (const o of ents.filter(isFoe)) {
    if (o === target || o.pos.distanceTo(target.pos) > range) continue;
    const dx = o.pos.x - player.pos.x, dz = o.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
    hurtEntity(o, Math.max(1, Math.round(dmg * share)), dx / l, dz / l);
  }
}
export function meleeHit(e) {
  if (player.atkCd > 0) return;
  const it = heldDef(), dmg = Math.round(blowOf(it, e));
  player.atkCd = it?.cd ?? FIST_CD;
  emit('player:struck');
  const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
  hurtEntity(e, dmg, dx / l, dz / l);
  if (it) { sweep(it, e, dmg); wearHeld(it.tool ? 2 : 1); }
}

export function updateEntities(dt) {
  updatePaths(dt);
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i]) updateEntity(ents[i], dt);
}

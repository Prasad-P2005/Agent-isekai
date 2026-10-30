// Creatures and people: AI, combat and natural (Minecraft-like) spawning. Their bodies are drawn in view/bodies.js.
import { G } from '../core/state.js';
import { CREATURES, WORLD } from '../core/content.js';
import { emit, toast } from '../core/events.js';
import { Vec3 } from '../core/vec3.js';
import { getBlock, chunkReady } from './chunks.js';
import { GROUND, WATER, solid } from './blocks.js';
import { despawns } from './lifetime.js';
import { H, SEA, B, biomeAt, hintQueue, heightAt, landOf } from './terrain.js';
import { player, damagePlayer, has, eye, lookDir } from './player.js';

export const ENT = CREATURES;
export const ents = [];
const MAX_BEINGS = 60, MAX_HOSTILE = 25, APPEAR_RANGE = 48, LAIR_RING = 18;
const BOLT_SPEED = 16, BOSS_BOLT_DMG = 9, BOSS_BOLT_GAP = [0, 4, 2.5], BREATH_GAP = 5, BREATH_RANGE = [5, 24]; // rare on purpose: fire costs particles

export function spawnEntity(kind, x, y, z, opts = {}) {
  const base = ENT[kind];
  if (!base) return null;
  if (ents.length >= MAX_BEINGS || (!base.friendly && ents.filter(e => !e.def.friendly).length >= MAX_HOSTILE)) return null;
  const D = { ...base };
  if (opts.body != null) D.body = opts.body;
  if (opts.hair != null) D.hair = opts.hair;
  if (opts.power) { D.hp = Math.round(D.hp * opts.power); D.dmg = Math.round(D.dmg * (1 + (opts.power - 1) / 2)); } // a monster with a name
  const e = {
    kind, def: D, pos: new Vec3(x, y, z), last: new Vec3(x, y, z), vel: new Vec3(), kb: new Vec3(), yaw: Math.random() * 6.28,
    hp: opts.hp ?? D.hp, maxHp: D.hp, onGround: false, wanderT: 0, wdir: [0, 0], cd: 0.5, hopT: 0, flash: 0,
    fleeT: 0, angryT: opts.angry ? 999 : 0, frozenT: 0, reportT: 0, reportLaw: null, summonT: 6, boltT: BREATH_GAP, phase: 0, attacked: false,
    name: opts.name || (kind === 'demon_lord' ? G.world.demon_lord_name : D.label), title: opts.title || '', res: opts.res || null, natural: !!opts.natural,
    home: opts.home || null, // the structure this being lives in; leaving the area hands the spot back so it returns
    service: opts.service || null, role: opts.role || null, named: opts.named || '',
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
export const isNight = () => Math.sin(G.dayTime * Math.PI * 2) < -0.1;
const isMonster = o => !o.def.friendly && !o.def.lawful && !o.def.hunter;
// Spells that pick their own targets only touch those already against the hero, so that a stray bolt can't make a criminal of them.
export const isFoe = o => (o.def.lawful ? o.angryT > 0 || player.wanted > 0 || !!G.profile?.crowned : !o.def.friendly);
function nearestEnt(e, filter, range) {
  let best = null, bd = range;
  for (const o of ents) { if (o === e || o.hp <= 0 || !filter(o)) continue; const d = o.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}

function updateEntity(e, dt) {
  const D = e.def, p = e.pos;
  e.last.copy(p);
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z, dy = player.pos.y - p.y, dist = Math.hypot(dx, dz) || 0.001;
  // Before the chunk check: a creature left behind in unloaded ground must still go, or it holds a spawn slot forever.
  if (despawns(e, { dist, night: isNight(), wanted: player.wanted, bounty: G.profile?.bounty || 0, roll: Math.random() })) return leaveWorld(e);
  // Before the chunk check too: a witness who has run into unloaded ground is still on their way to the watch.
  if (e.reportT > 0) { e.reportT -= dt; if (e.reportT <= 0) emit('witness:report', e); }
  if (D.sacred || !chunkReady(p.x, p.z)) return;
  if (e.frozenT > 0) { e.frozenT -= dt; return; } // locked in ice: it neither thinks nor moves, and its grudges wait for it
  e.fleeT -= dt; e.angryT -= dt;
  const inWater = getBlock(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z)) === WATER;
  const crowned = !!G.profile?.crowned;
  if (crowned && D.friendly && !D.lawful && dist < 14) e.fleeT = Math.max(e.fleeT, 2); // nobody stays near the new Demon Lord

  // choose a target: the player, another creature, or nobody
  const canHitPlayer = player.ready && (G.locked || G.focused) && !G.uiOpen && Math.abs(dy) < 16;
  const flee = !D.lawful && (e.reportT > 0 || e.fleeT > 0); // the law stands its ground: only civilians run
  let tgt = null;
  if (!flee) {
    if (D.lawful) {
      if (canHitPlayer && (player.wanted > 0 || e.angryT > 0 || crowned) && dist < 40) tgt = 'player';
      else tgt = nearestEnt(e, isMonster, 14);
    } else if (D.hunter) { if (canHitPlayer && dist < 60) tgt = 'player'; }
    else if (!D.friendly) {
      if (canHitPlayer && !crowned && dist < (D.fly || D.boss ? 40 : 22)) tgt = 'player';
      const v = D.demon ? nearestEnt(e, o => (o.def.friendly || o.def.lawful) && !o.def.sacred, 18) : nearestEnt(e, o => o.def.lawful, 6);
      if (v && (!tgt || v.pos.distanceTo(p) < dist)) tgt = v;
    }
  }
  const tp = tgt === 'player' ? player.pos : tgt ? tgt.pos : null;
  let mx = 0, mz = 0, speed = D.speed * (D.boss && e.phase === 2 ? 1.4 : 1);
  if (flee) { mx = -dx / dist; mz = -dz / dist; speed *= 1.5; }
  else if (tp) { const tx = tp.x - p.x, tz = tp.z - p.z, l = Math.hypot(tx, tz) || 1; mx = tx / l; mz = tz / l; }
  else if (D.friendly && dist < 4) { e.yaw = Math.atan2(-dx, -dz); speed = 0; }
  else if (D.fly && e.home) { // it circles above its lair, and a chase that pulled it away only bends the circle back
    const hx = e.home.x - p.x, hz = e.home.z - p.z, r = Math.hypot(hx, hz) || 1, pull = Math.max(-1, Math.min(1, (r - LAIR_RING) / LAIR_RING)), round = 1 - Math.abs(pull);
    mx = (hx * pull - hz * round) / r; mz = (hz * pull + hx * round) / r; speed *= 0.7;
  } else {
    // residents keep to their schedule: work by day, home by night
    const home = e.res && (isNight() ? e.res.night : e.res.work);
    if (home && Math.hypot(home.x - p.x, home.z - p.z) > 5) {
      const tx = home.x - p.x, tz = home.z - p.z, l = Math.hypot(tx, tz); mx = tx / l; mz = tz / l; speed *= 0.7;
    } else {
      e.wanderT -= dt;
      if (e.wanderT <= 0) { e.wanderT = 2 + Math.random() * 4; const a = Math.random() * 6.28; e.wdir = Math.random() < 0.5 ? [0, 0] : [Math.cos(a), Math.sin(a)]; }
      [mx, mz] = e.wdir; speed *= 0.4;
    }
  }
  if (mx || mz) e.yaw = Math.atan2(-mx, -mz);
  if (D.slime) { e.hopT -= dt; if (e.onGround) { speed = 0; if ((mx || mz) && e.hopT <= 0) { e.vel.y = 7; e.hopT = 0.5 + Math.random() * 0.6; } } }
  e.kb.multiplyScalar(Math.max(0, 1 - 5 * dt));
  e.vel.x = mx * speed + e.kb.x; e.vel.z = mz * speed + e.kb.z;
  if (D.fly) {
    const hover = D.hover || 0; // what a big body needs to clear the ground, and whoever it is biting
    const ty = tp ? tp.y + hover + (Math.hypot(tp.x - p.x, tp.z - p.z) > 7 ? 7 : 0.5) : Math.max(p.y, heightAt(p.x | 0, p.z | 0) + 12 + hover);
    e.vel.y = Math.max(-7, Math.min(7, (ty - p.y) * 2));
    p.addScaledVector(e.vel, dt);
  } else {
    if (D.swim && inWater) e.vel.y = getBlock(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z)) === WATER ? Math.sin(performance.now() / 900 + e.yaw) * 0.6 : -0.8;
    else if (inWater) e.vel.y = Math.min(e.vel.y + 18 * dt, 2.5);
    else e.vel.y = Math.max(e.vel.y - 28 * dt, -40);
    const bx = moveEnt(e, 'x', e.vel.x * dt), bz = moveEnt(e, 'z', e.vel.z * dt);
    e.onGround = false;
    moveEnt(e, 'y', e.vel.y * dt);
    if ((bx || bz) && (e.onGround || inWater) && !D.slime) e.vel.y = 8;
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
    }
  }
  if (tgt === 'player') {
    if (D.boss) bossTurn(e, dt);
    else if (D.breath && dist > BREATH_RANGE[0] && dist < BREATH_RANGE[1]) { e.boltT -= dt; if (e.boltT <= 0) { e.boltT = BREATH_GAP; shoot(e, D.breath); } }
  }
}
const killerName = e => (e.name === e.def.label ? 'a ' + e.def.label : e.name);
// projectiles.js makes the bolt: it needs this file for what fireballs hit, so this file must not import it.
function shoot(e, dmg) {
  const from = new Vec3(e.pos.x, e.pos.y + e.def.h * 0.75, e.pos.z), at = eye();
  const d = new Vec3(at.x - from.x, at.y - from.y, at.z - from.z), l = d.length() || 1;
  emit('foe:shot', { pos: from, vel: d.multiplyScalar(BOLT_SPEED / l), dmg, src: killerName(e), killer: e });
}
// The Demon Lord's fight has three stages, set by his wounds: he summons, then he calls fire, then the crown drives him harder.
function bossTurn(e, dt) {
  const share = e.hp / e.maxHp, phase = share > 2 / 3 ? 0 : share > 1 / 3 ? 1 : 2, p = e.pos;
  if (phase > e.phase) { e.phase = phase; e.summonT = 0; emit('boss:phase', phase); }
  e.summonT -= dt;
  if (e.summonT <= 0) {
    e.summonT = 12;
    for (let i = 0; i < 2; i++) spawnEntity(phase === 2 && !i ? 'demon_knight' : 'imp', p.x + Math.random() * 4 - 2, p.y + 3, p.z + Math.random() * 4 - 2);
  }
  if (!phase) return;
  e.boltT -= dt;
  if (e.boltT <= 0) { e.boltT = BOSS_BOLT_GAP[phase]; shoot(e, BOSS_BOLT_DMG); }
}

export function hurtEntity(e, dmg, dirx, dirz, by = 'player') {
  const D = e.def, byPlayer = by === 'player';
  if (e.hp <= 0 || D.sacred) return;
  if (D.boss) {
    if (!byPlayer) return; // only the hero can end this, or the world would never hear of it
    if (!G.profile?.oathbound) { e.flash = 0.2; toast('Your blow slides off him. The First Law holds.', 2); return; }
  }
  e.hp -= dmg; e.flash = 0.2;
  e.kb.set(dirx * 7, 0, dirz * 7); if (!D.fly) e.vel.y = 4;
  if (byPlayer && D.friendly) {
    if (D.lawful) e.angryT = 25; else e.fleeT = 12;
    if (!e.attacked && e.hp > 0) { e.attacked = true; emit('crime:committed', { type: 'attack_civilian', victim: e }); }
  }
  if (!byPlayer && D.friendly && !D.lawful) e.fleeT = 8;
  if (e.hp > 0) return;
  e.fell = true; // the view lets the body drop before it goes
  removeEntity(e);
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
export function meleeHit(e) {
  if (player.atkCd > 0) return;
  player.atkCd = 0.35;
  emit('player:struck');
  const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
  hurtEntity(e, (has('giant_strength') ? 9 : 4) + (G.profile?.weapon || 0), dx / l, dz / l);
}

// ---------- spawning ----------
function topGround(x, z) { for (let y = H - 1; y > 0; y--) if (GROUND.has(getBlock(x, y, z))) return y; return 0; }
function ringPos(rmin, rmax) {
  const a = Math.random() * 6.28, r = rmin + Math.random() * (rmax - rmin);
  const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
  return { x: x + 0.5, y: topGround(x, z) + 1, z: z + 0.5 };
}
const FIRST = ['Aldo', 'Brina', 'Cedric', 'Dara', 'Edda', 'Finn', 'Greta', 'Holt', 'Ilse', 'Jorah', 'Kira', 'Lars', 'Mira', 'Nils', 'Odile', 'Pell', 'Runa', 'Sten', 'Tove', 'Ulric'];
export function spawnNear(kind, n, rmin, rmax, opts = {}) {
  for (let i = 0; i < n; i++) {
    const q = ringPos(rmin, rmax);
    if (!chunkReady(q.x, q.z)) continue;
    const o = ENT[kind]?.friendly && !opts.name ? { ...opts, name: FIRST[Math.floor(Math.random() * FIRST.length)] } : opts;
    spawnEntity(kind, q.x, ENT[kind]?.fly ? q.y + 6 : q.y, q.z, o);
  }
}
export const SPAWN_TABLE = { [B.ELF]: ['slime', 'wolf'], [B.KINGDOM]: ['slime', 'goblin', 'wolf'], [B.BEAST]: ['wolf', 'goblin', 'orc'], [B.PEAKS]: ['wolf', 'orc'],
  [B.BEACH]: ['slime'], [B.OCEAN]: [], [B.DEMON]: ['imp', 'demon_knight'] };
let spawnTimer = 5, hintTimer = 0;
function naturalSpawning(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  const night = isNight();
  spawnTimer = night ? 2.5 : 8;
  if (ents.filter(e => e.natural && !e.def.friendly).length >= (night ? 14 : 4)) return;
  const q = ringPos(24, 40), x = Math.floor(q.x), z = Math.floor(q.z), y = q.y - 1;
  if (!chunkReady(x, z) || y <= SEA || solid(getBlock(x, y + 1, z))) return;
  const L = landOf(x, z);
  if (L.settlement != null && !night) return; // villages are safe by day
  const b = biomeAt(x, z, y), table = SPAWN_TABLE[b];
  let kind = table[Math.floor(Math.random() * table.length)];
  if (b === B.PEAKS && night && Math.random() < 0.03) kind = 'dragon';
  if (kind) spawnEntity(kind, x + 0.5, y + 1, z + 0.5, { natural: true });
}
function structureSpawning(dt) {
  hintTimer -= dt;
  if (hintTimer > 0) return;
  hintTimer = 0.5;
  for (let i = hintQueue.length - 1; i >= 0; i--) {
    const h = hintQueue[i], d = Math.hypot(h.x - player.pos.x, h.z - player.pos.z);
    if (d > (ENT[h.kind]?.seen_from ?? APPEAR_RANGE) || !chunkReady(h.x, h.z)) continue;
    if (h.kind === 'demon_lord' && G.world.demon_lord_dead) { hintQueue.splice(i, 1); continue; }
    let y = h.y; while (!fitsAt(h.x + 0.5, y, h.z + 0.5) && y < H - 2) y++;
    const hp = h.hp ?? (h.kind === 'demon_lord' ? G.world.boss_hp : undefined); // wounds outlast a reload
    if (spawnEntity(h.kind, h.x + 0.5, y, h.z + 0.5, { home: h, hp })) hintQueue.splice(i, 1); // no room right now: try again next time
  }
}
export function updateEntities(dt) {
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i]) updateEntity(ents[i], dt);
  naturalSpawning(dt);
  structureSpawning(dt);
}

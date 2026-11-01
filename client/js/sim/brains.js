// What each creature wants, depending on what it is. A brain never moves anything: it sets where the creature is heading (e.mx, e.mz), how
// fast (e.pace) and who it means to hit (e.aim), and sim/entities.js does the walking and the fighting. Which brain is `brain` in creatures.json.
import { creative } from '../core/state.js';
import { emit } from '../core/events.js';
import { rule } from '../core/rules.js';
import { Vec3 } from '../core/vec3.js';
import { MAGMA, WATER, solid } from './blocks.js';
import { getBlock } from './chunks.js';
import { ents, isMonster, isNight, killerName, nearestEnt } from './beings.js';
import { ask, awayFromHero, followRoute, towardHero } from './paths.js';
import { eye, lineOfSight, player } from './player.js';
import { heightAt, lairAt } from './terrain.js';

const SIGHT = 22, MEMORY = 9, SENSE_GAP = 0.35, HEARD = 5, HEARD_RUNNING = 11, FAR_FLOOR = 16;
const BOLT_SPEED = 16, ARROW_SPEED = 15, ARROW_SIZE = 0.45, ARROW_GAP = 2.4, ARCHER_FAR = 15, ARCHER_NEAR = 6, STRAFE_GAP = 2.5;
const LOW_HP = 0.35, BRAVE_WITH = 2, FRIENDS = 10, PACK_CALL = 18, ENCIRCLE = 7, FLANK = 0.8, SPOOK = 13, SPOOK_RUNNING = 20, ALARM = 12, CALL_FOR_HELP = 22;
const POUNCE_RANGE = 7, POUNCE_GAP = 3, POUNCE_KICK = 11, CLIMB_AWAY = 2.2, GRAZE = 0.35, POST_LEASH = 1.5, ROUTE_FROM = 6, ERRAND_PACE = 0.7, RE_ROUTE = 4;
// The Wyrm. It wakes when you are in its hall, and any time you are on its mountain once it has a grudge. Leaving is when it really starts.
const LAIR_WAKE = 34, LAIR_RANGE = 72, CHASE_FOR = 40, CHASE_REACH = 200, CHASE_PACE = 1.7, GRUDGE_GAP = 0.65;
const BREATH_GAP = 3.2, BREATH_GAP_CHASE = 1.9, BREATH_NEAR = 5, BREATH_FAR = 24, BREATH_FAR_CHASE = 46, BREATH_SPEED = 26, BREATH_SIZE = 2, RIM_CLEAR = 12, SHAFT_NEAR = 7, CRUISE = 14;

export const go = (e, x, z, pace = 1) => { e.mx = x; e.mz = z; e.pace = pace; };
const stop = e => go(e, 0, 0, 0);
function straight(e, tx, tz, pace = 1) {
  const x = tx - e.pos.x, z = tz - e.pos.z, l = Math.hypot(x, z) || 1;
  go(e, x / l, z / l, pace);
}
// Would one step this way drop it down a cliff, into deep water or into fire?
function badFooting(e, mx, mz) {
  const x = Math.floor(e.pos.x + mx * 1.2), z = Math.floor(e.pos.z + mz * 1.2), y = Math.floor(e.pos.y);
  for (let yy = y + 1; yy >= y - 3; yy--) {
    const id = getBlock(x, yy, z);
    if (id === WATER && getBlock(x, yy + 1, z) === WATER) return true;
    if (solid(id)) return id === MAGMA;
  }
  return true;
}
function wander(e, dt, pace = 0.4) {
  e.wanderT -= dt;
  if (e.wanderT <= 0 || e.bumped || (e.wdir[0] || e.wdir[1]) && !e.def.swim && !e.def.fly && badFooting(e, e.wdir[0], e.wdir[1])) {
    e.wanderT = 2 + Math.random() * 4;
    const a = Math.random() * 6.28;
    e.wdir = Math.random() < 0.5 ? [0, 0] : [Math.cos(a), Math.sin(a)];
  }
  go(e, e.wdir[0], e.wdir[1], pace);
}
// Round corners and through doors if there is a way, and in a straight line if the hero is somewhere walkers cannot go.
function chaseHero(e, pace = 1) {
  const way = e.def.fly ? null : towardHero(e.pos);
  if (way) go(e, way.x, way.z, pace); else straight(e, player.pos.x, player.pos.z, pace);
}
function runFromHero(e, pace = 1.5) {
  const way = awayFromHero(e.pos);
  if (way) go(e, way.x, way.z, pace);
  else { const x = e.pos.x - player.pos.x, z = e.pos.z - player.pos.z, l = Math.hypot(x, z) || 1; go(e, x / l, z / l, pace); }
}
// An errand: a found path if it needs one. A target close by in the open is just walked to.
function walkTo(e, t, pace) {
  const d = Math.hypot(t.x - e.pos.x, t.z - e.pos.z);
  if (e.route && Math.hypot(e.route.to.x - t.x, e.route.to.z - t.z) > 1) e.route = null;
  const step = followRoute(e);
  if (step) return go(e, step.x, step.z, pace);
  if (d < ROUTE_FROM) return straight(e, t.x, t.z, pace);
  e.routeT -= 1 / 60;
  if (e.routeT <= 0) { e.routeT = RE_ROUTE; ask(e, t); }
  straight(e, t.x, t.z, pace);
}
function shoot(e, dmg, speed = BOLT_SPEED, size = 1) {
  const from = new Vec3(e.pos.x, e.pos.y + e.def.h * 0.75, e.pos.z), at = eye();
  const d = new Vec3(at.x - from.x, at.y - from.y, at.z - from.z), l = d.length() || 1;
  emit('foe:shot', { pos: from, vel: d.multiplyScalar(speed / l), dmg, src: killerName(e), killer: e, size });
}
export { shoot };
const companions = (e, range) => { let n = 0; for (const o of ents) if (o !== e && o.kind === e.kind && o.hp > 0 && o.pos.distanceTo(e.pos) < range) n++; return n; };
// A wolf that smells you tells the others. So does anything else that hunts together.
function rally(e, range) { for (const o of ents) if (o.kind === e.kind && o.pos.distanceTo(e.pos) < range) { o.alertT = Math.max(o.alertT, MEMORY); o.sees = o.sees || e.sees; } }

// Whether it knows where the hero is. Seeing needs a clear line, a noise needs only to be close, and what it has noticed it remembers for a while.
function senses(e, c, dt) {
  e.senseT -= dt; e.alertT -= dt;
  if (!c.free) { e.alertT = 0; return false; }
  if (e.senseT <= 0) {
    e.senseT = SENSE_GAP + Math.random() * 0.15;
    const keen = rule('notice'), sight = (e.def.sight ?? SIGHT) * (isNight() && !e.def.fly ? 0.8 : 1) * keen, level = Math.abs(c.dy) < FAR_FLOOR;
    e.sees = level && c.dist < sight && lineOfSight({ x: e.pos.x, y: e.pos.y + e.def.h * 0.8, z: e.pos.z }, eye());
    if (e.sees || (level && c.dist < (player.sprinting ? HEARD_RUNNING : HEARD) * keen)) e.alertT = MEMORY;
  }
  return e.alertT > 0;
}
const huntsHero = (e, c, dt) => !c.crowned && senses(e, c, dt);
function fightNearby(e, c, knows, range) { // whichever foe of its own is closer than the hero
  const D = e.def, v = D.demon ? nearestEnt(e, o => (o.def.friendly || o.def.lawful) && !o.def.sacred, 18) : nearestEnt(e, o => o.def.lawful, range);
  if (v && (!knows || v.pos.distanceTo(e.pos) < c.dist)) { e.aim = v; straight(e, v.pos.x, v.pos.z); return true; }
  return false;
}
function goHomeOrWander(e, dt) {
  if (e.home && Math.hypot(e.home.x - e.pos.x, e.home.z - e.pos.z) > 6) walkTo(e, e.home, ERRAND_PACE);
  else wander(e, dt);
}

// ---------- monsters ----------
function brute(e, dt, c) {
  const knows = huntsHero(e, c, dt);
  if (knows) e.aim = 'player';
  if (fightNearby(e, c, knows, 6)) return;
  if (knows) chaseHero(e); else goHomeOrWander(e, dt);
}
const hopper = brute;
// Bold among friends. Alone or badly hurt, it looks to its skin.
function coward(e, dt, c) {
  const knows = huntsHero(e, c, dt), hurt = e.hp < e.maxHp * LOW_HP, friends = companions(e, FRIENDS);
  if (knows && (hurt || (!friends && c.dist < 8 && e.hp < e.maxHp))) return runFromHero(e);
  if (knows) { e.aim = 'player'; if (friends >= BRAVE_WITH || c.dist < 4) rally(e, FRIENDS); chaseHero(e); return; }
  if (!fightNearby(e, c, false, 6)) goHomeOrWander(e, dt);
}
// Spreads out around the hero rather than arriving in a line, closes when it is near, and darts back after a bite.
function pack(e, dt, c) {
  const knows = huntsHero(e, c, dt);
  if (!knows) { if (!fightNearby(e, c, false, 6)) wander(e, dt); return; }
  e.aim = 'player';
  if (!e.called) { e.called = true; rally(e, PACK_CALL); }
  if (e.backT > 0) { e.backT -= dt; return runFromHero(e, 0.9); }
  chaseHero(e);
  if (c.dist > ENCIRCLE) { const s = e.flank, x = e.mx - e.mz * s * FLANK, z = e.mz + e.mx * s * FLANK, l = Math.hypot(x, z) || 1; go(e, x / l, z / l); }
}
// Keeps its range and keeps moving, and only looses when it has a clear shot.
function archer(e, dt, c) {
  const knows = huntsHero(e, c, dt);
  if (!knows) return goHomeOrWander(e, dt);
  e.boltT -= dt; e.strafeT -= dt;
  if (e.strafeT <= 0) { e.strafeT = STRAFE_GAP * (0.6 + Math.random()); e.flank = -e.flank; }
  if (c.dist > ARCHER_FAR || !e.sees) chaseHero(e);
  else if (c.dist < ARCHER_NEAR) { e.aim = 'player'; runFromHero(e, 1); }
  else go(e, -c.dz / c.dist * e.flank, c.dx / c.dist * e.flank, 0.5);
  if (e.sees && c.dist < e.def.sight && e.boltT <= 0) { e.boltT = ARROW_GAP; emit('entity:struck', e); shoot(e, e.def.shot, ARROW_SPEED, ARROW_SIZE); }
}
// Waits in the dark until you are close, then leaps.
function lurker(e, dt, c) {
  const knows = huntsHero(e, c, dt);
  e.boltT -= dt;
  if (!knows) return stop(e);
  e.aim = 'player';
  chaseHero(e);
  if (c.dist < POUNCE_RANGE && e.onGround && e.boltT <= 0) { e.boltT = POUNCE_GAP; e.vel.y = 7; e.kb.set(e.mx * POUNCE_KICK, 0, e.mz * POUNCE_KICK); }
}
const ghost = (e, dt, c) => { const knows = huntsHero(e, c, dt); if (knows) { e.aim = 'player'; straight(e, player.pos.x, player.pos.z); } else wander(e, dt); };
// In, bite, up and away, and back again.
function skirmisher(e, dt, c) {
  const knows = huntsHero(e, c, dt);
  if (e.backT > 0) { e.backT -= dt; e.flyY = player.pos.y + 6; return runFromHero(e, 1); }
  e.flyY = null;
  if (knows) e.aim = 'player';
  if (fightNearby(e, c, knows, 6)) return;
  if (knows) straight(e, player.pos.x, player.pos.z); else wander(e, dt);
}

// ---------- animals ----------
function prey(e, dt, c) {
  if (e.fleeT > 0) return runFromHero(e, 1);
  const threat = nearestEnt(e, isMonster, 9);
  if (threat || (c.canHit && c.dist < (player.sprinting ? SPOOK_RUNNING : SPOOK))) {
    for (const o of ents) if (o.kind === e.kind && o.pos.distanceTo(e.pos) < ALARM) o.fleeT = 5 + Math.random() * 2; // the whole herd goes
    return runFromHero(e, 1);
  }
  wander(e, dt, GRAZE);
}
function neutral(e, dt, c) {
  if (e.angryT > 0 && c.canHit) { e.aim = 'player'; chaseHero(e); return; }
  wander(e, dt);
}
function flutter(e, dt) {
  e.wanderT -= dt;
  if (e.wanderT <= 0 || e.bumped) { e.wanderT = 0.4 + Math.random() * 0.8; const a = Math.random() * 6.28; e.wdir = [Math.cos(a), Math.sin(a)]; e.flyY = e.pos.y + Math.random() * 4 - 2; }
  go(e, e.wdir[0], e.wdir[1], 1);
}

// ---------- people ----------
// Work by day, home by night, and away from anything with teeth. Shopkeepers stay at their counters.
function folk(e, dt, c) {
  const D = e.def;
  if (c.crowned && D.friendly && !D.lawful && c.dist < 14) e.fleeT = Math.max(e.fleeT, 2); // nobody stays near the new Demon Lord
  if (!D.lawful && (e.reportT > 0 || e.fleeT > 0)) return runFromHero(e, 1.5); // the law stands its ground: only civilians run
  const danger = !D.lawful && !D.sacred && D.friendly && nearestEnt(e, isMonster, 9);
  if (danger) { const x = e.pos.x - danger.pos.x, z = e.pos.z - danger.pos.z, l = Math.hypot(x, z) || 1; return go(e, x / l, z / l, 1.5); }
  const post = e.res && (isNight() ? e.res.night : e.res.work), staffed = e.res?.service;
  if (post) {
    const far = Math.hypot(post.x - e.pos.x, post.z - e.pos.z);
    if (far > (staffed ? POST_LEASH : 5)) return walkTo(e, post, ERRAND_PACE);
    if (staffed) { if (c.dist < 6) e.yaw = Math.atan2(-c.dx, -c.dz); return stop(e); }
  }
  if (D.friendly && c.dist < 4) { e.yaw = Math.atan2(-c.dx, -c.dz); return stop(e); }
  wander(e, dt);
}
// The law stands its ground, and calls for help when it is struck.
function warden(e, dt, c) {
  const D = e.def, wantsHero = c.canHit && (player.wanted > 0 || e.angryT > 0 || c.crowned) && c.dist < 40;
  if (e.leaving) { const x = e.pos.x - player.pos.x, z = e.pos.z - player.pos.z, l = Math.hypot(x, z) || 1; return go(e, x / l, z / l, 0.7); }
  if (wantsHero) { e.aim = 'player'; return chaseHero(e); }
  const v = nearestEnt(e, isMonster, 14);
  if (v) { e.aim = v; return straight(e, v.pos.x, v.pos.z); }
  folk(e, dt, c);
}
function tracker(e, dt, c) {
  if (e.leaving) { const x = e.pos.x - player.pos.x, z = e.pos.z - player.pos.z, l = Math.hypot(x, z) || 1; return go(e, x / l, z / l, 0.7); }
  if (c.canHit && c.dist < e.def.sight) { e.aim = 'player'; chaseHero(e); } else wander(e, dt);
}

// ---------- the Wyrm ----------
const buried = p => p.y < heightAt(Math.floor(p.x), Math.floor(p.z)) - 1; // inside the mountain, not on it
function wake(e, mood) { e.mood = mood; emit('dragon:mood', mood); }
function wyrm(e, dt, c) {
  const h = e.home, L = lairAt();
  if (!h || !L) { e.aim = 'player'; straight(e, player.pos.x, player.pos.z); return; }
  const fromLair = Math.hypot(player.pos.x - h.x, player.pos.z - h.z), trespass = c.free && fromLair < (h.grudge ? LAIR_RANGE : LAIR_WAKE);
  e.mood ||= 'asleep';
  if (e.mood === 'asleep') {
    stop(e); e.flyY = h.y; e.pos.x += (h.x - e.pos.x) * 0.02; e.pos.z += (h.z - e.pos.z) * 0.02;
    if (trespass || e.hurtT < 0.2) wake(e, 'wakes');
    return;
  }
  if (creative()) e.mood = 'home'; // awake with nobody to chase, or it would hang in the air as it does for a pause
  e.boltT -= dt;
  const away = e.mood === 'chases', gap = (away ? BREATH_GAP_CHASE : BREATH_GAP) * (h.grudge ? GRUDGE_GAP : 1), reach = away ? BREATH_FAR_CHASE : BREATH_FAR;
  if (e.mood === 'home') {
    if (trespass) return wake(e, 'wakes');
    if (Math.hypot(h.x - e.pos.x, h.z - e.pos.z) > SHAFT_NEAR) { straight(e, h.x, h.z, 1.2); e.flyY = heightAt(Math.floor(h.x), Math.floor(h.z)) + RIM_CLEAR; return; }
    stop(e); e.flyY = h.y;
    if (e.pos.y < h.y + 1) e.mood = 'asleep';
    return;
  }
  if (!c.free) return stop(e);
  e.aim = 'player';
  if (e.mood === 'wakes' && fromLair > LAIR_RANGE) { h.grudge = true; e.chaseT = CHASE_FOR; wake(e, 'chases'); }
  if (e.mood === 'chases') {
    e.chaseT -= dt;
    if (fromLair < LAIR_RANGE) e.mood = 'wakes';
    else if (e.chaseT <= 0 || fromLair > CHASE_REACH) { wake(e, 'warns'); e.mood = 'home'; e.aim = null; return; }
  }
  // Inside and outside are joined by the shaft, so that is the way between them.
  if (buried(player.pos) !== buried(e.pos) && Math.hypot(L.x - e.pos.x, L.z - e.pos.z) > SHAFT_NEAR) {
    straight(e, L.x, L.z, 1.2); e.flyY = buried(e.pos) ? e.pos.y : heightAt(Math.floor(L.x), Math.floor(L.z)) + RIM_CLEAR; e.aim = null; return;
  }
  if (buried(player.pos) !== buried(e.pos)) { stop(e); e.flyY = buried(e.pos) ? heightAt(Math.floor(L.x), Math.floor(L.z)) + RIM_CLEAR : player.pos.y + 3; e.aim = null; return; }
  straight(e, player.pos.x, player.pos.z, away ? CHASE_PACE : 1);
  e.flyY = buried(e.pos) ? player.pos.y + 3 : Math.max(player.pos.y + 9, heightAt(Math.floor(e.pos.x + e.mx * CRUISE), Math.floor(e.pos.z + e.mz * CRUISE)) + RIM_CLEAR);
  if (c.dist > BREATH_NEAR && c.dist < reach && e.boltT <= 0) { e.boltT = gap; emit('entity:struck', e); shoot(e, e.def.breath, BREATH_SPEED, BREATH_SIZE); }
}

const BRAINS = { folk, warden, tracker, prey, neutral, flutter, hopper, coward, pack, archer, lurker, brute, ghost, skirmisher, wyrm };
export function think(e, dt, c) {
  e.aim = null;
  (BRAINS[e.def.brain] ?? (e.def.friendly ? folk : brute))(e, dt, c);
  e.bumped = false;
}
export const callForHelp = e => { for (const o of ents) if (o.def.lawful && o.pos.distanceTo(e.pos) < CALL_FOR_HELP) o.angryT = Math.max(o.angryT, 25); };
export const alarmKin = e => {
  for (const o of ents) {
    if (o.kind !== e.kind || o.pos.distanceTo(e.pos) >= ALARM) continue;
    if (e.def.brain === 'prey') o.fleeT = Math.max(o.fleeT, 8); else o.angryT = Math.max(o.angryT, 30);
  }
};

// What the player can cast and drink. What each spell costs is in content/abilities.json, so that the shop and the book can show it.
import { ABILITIES } from '../core/content.js';
import { emit, toast } from '../core/events.js';
import { Vec3 } from '../core/vec3.js';
import { ents, hurtEntity, isFoe } from './entities.js';
import { collides, eye, has, heal, lineOfSight, lookDir, maxMana, player, raycast } from './player.js';
import { spawnProjectile } from './projectiles.js';
import { heightAt } from './terrain.js';

const FROST_RADIUS = 8, FROST_DMG = 8, FROST_TIME = 4;
const BOLT_RANGE = 30, BOLT_AIM = 0.96, BOLT_DMG = 18, CHAIN_TARGETS = 4, CHAIN_RANGE = 9, CHAIN_FADE = 0.75;
const BLINK_RANGE = 14, BLINK_MIN = 2, BLINK_STEP = 0.5, BLINK_LIFTS = [0.1, 1.1];
const WARD_TIME = 10;
const METEOR_RANGE = 40, METEOR_HEIGHT = 34, METEOR_SPEED = 42, METEOR_DMG = 60, METEOR_BLAST = 7, METEOR_SIZE = 2.4;
const UP = new Vec3(0, 1, 0);

const spellName = id => ABILITIES[id].label.replace(/^[A-Z] /, '');
function ready(id) {
  const cost = ABILITIES[id].mana;
  if (!has(id)) { toast(`You do not know ${spellName(id)}. (Buy a scroll from a merchant)`); return false; }
  if (cost > maxMana()) { toast(`${spellName(id)} takes ${cost} mana, and your well only holds ${maxMana()}. Attune to a Mana Crystal at a temple, or keep casting.`); return false; }
  if (player.mana < cost) { toast('Not enough mana.', 2); return false; }
  return true;
}
function spend(id) {
  player.mana -= ABILITIES[id].mana;
  emit('mana:spent', ABILITIES[id].mana);
}
function pay(id) {
  if (!ready(id)) return false;
  spend(id);
  return true;
}

export function doubleJump() {
  if (!player.onGround && !player.fly && !player.dj && has('double_jump')) { player.dj = true; player.vel.y = 9; }
}
export function toggleFlight() {
  if (has('flight')) { player.fly = !player.fly; player.vel.y = 0; } else toast('You have not learned flight.', 2);
}
export function castFireball() {
  if (!pay('fireball')) return;
  const d = lookDir();
  emit('fireball:cast', spawnProjectile(eye().addScaledVector(d, 0.8), d.multiplyScalar(30)));
}
export function castHeal() {
  if (!pay('heal')) return;
  heal(8); toast('✚ Healing light surrounds you.', 2);
}

// ---------- frost: everything around you stops ----------
export function castFrostNova() {
  if (!pay('frost_nova')) return;
  const caught = ents.filter(e => isFoe(e) && e.pos.distanceTo(player.pos) < FROST_RADIUS);
  emit('frost:cast', { at: player.pos.clone(), caught });
  for (const e of caught) {
    hurtEntity(e, FROST_DMG, 0, 0);
    if (!e.def.boss) e.frozenT = FROST_TIME; // the Demon Lord only feels the cold
  }
}

// ---------- lightning: no flight to lead, so it forgives a rough aim, and it leaps from foe to foe ----------
const chest = e => new Vec3(e.pos.x, e.pos.y + e.def.h * 0.6, e.pos.z);
function boltTarget(from, dir) {
  let best = null, bestAim = BOLT_AIM;
  for (const e of ents) {
    if (!isFoe(e)) continue;
    const at = chest(e), dist = at.distanceTo(from);
    if (dist > BOLT_RANGE) continue;
    const aim = ((at.x - from.x) * dir.x + (at.y - from.y) * dir.y + (at.z - from.z) * dir.z) / dist;
    if (aim > bestAim && lineOfSight(from, at)) { best = e; bestAim = aim; }
  }
  return best;
}
function nextLink(e, struck) {
  let best = null, bestDist = CHAIN_RANGE;
  for (const o of ents) {
    if (struck.includes(o) || !isFoe(o)) continue;
    const dist = o.pos.distanceTo(e.pos);
    if (dist < bestDist && lineOfSight(chest(e), chest(o))) { best = o; bestDist = dist; }
  }
  return best;
}
export function castChainLightning() {
  if (!pay('chain_lightning')) return;
  const from = eye(), d = lookDir(), struck = [];
  for (let e = boltTarget(from, d); e && struck.length < CHAIN_TARGETS; e = nextLink(e, struck)) struck.push(e);
  // Struck first, wounded after: a kill takes a body out of the world, and the bolt still has to be drawn to it.
  const points = struck.map(chest);
  if (!points.length) points.push(from.clone().addScaledVector(d, raycast(from, d, BOLT_RANGE)?.t ?? BOLT_RANGE));
  emit('lightning:cast', { points, struck: struck.length > 0 });
  struck.forEach((e, i) => {
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
    hurtEntity(e, Math.round(BOLT_DMG * CHAIN_FADE ** i), dx / l, dz / l);
  });
}

// ---------- blink: the eye has a clear line to the spot, so the body is walked back along it until it fits ----------
function blinkSpot(from, d, reach) {
  const to = new Vec3();
  for (let t = reach; t >= BLINK_MIN; t -= BLINK_STEP) {
    for (const lift of BLINK_LIFTS) {
      to.set(from.x + d.x * t, from.y + d.y * t + lift, from.z + d.z * t);
      if (!collides(to)) return to;
    }
  }
  return null;
}
export function castBlink() {
  if (!ready('blink')) return;
  const from = eye(), d = lookDir(), to = blinkSpot(from, d, raycast(from, d, BLINK_RANGE)?.t ?? BLINK_RANGE);
  if (!to) return toast('There is no room to blink.', 2);
  spend('blink');
  const was = player.pos.clone();
  player.pos.copy(to); player.vel.set(0, 0, 0); player.kb.set(0, 0, 0); player.stepLag = player.stepRate = 0;
  emit('blink:cast', { from: was, to });
}

// ---------- the ward: see damagePlayer, which is where it does its work ----------
export function castManaWard() {
  if (!pay('mana_ward')) return;
  player.wardT = WARD_TIME;
  emit('ward:raised');
}

// ---------- the meteor: it comes down from the open sky onto what you are looking at ----------
export function castMeteor() {
  if (!ready('meteor')) return;
  const from = eye(), d = lookDir(), hit = raycast(from, d, METEOR_RANGE), at = from.clone().addScaledVector(d, hit ? hit.t : METEOR_RANGE);
  if (hit) { at.x += hit.n[0] * 0.5; at.y += hit.n[1] * 0.5; at.z += hit.n[2] * 0.5; } // out of the face it hit, or the sky looks blocked by that very block
  else at.y = heightAt(Math.floor(at.x), Math.floor(at.z)) + 1;
  if (raycast(at, UP, METEOR_HEIGHT)) return toast('No meteor can reach this spot. It needs open sky.', 2);
  spend('meteor');
  const pr = spawnProjectile(at.clone().addScaledVector(UP, METEOR_HEIGHT), new Vec3(0, -METEOR_SPEED, 0), { dmg: METEOR_DMG, blast: METEOR_BLAST, size: METEOR_SIZE });
  emit('meteor:called', { at, pr, fall: METEOR_HEIGHT / METEOR_SPEED });
}

// The server keeps the potion count, so a drink only takes effect once it answers.
export const drink = item => emit('item:used', item);
export function drank(item, ok) {
  if (!ok) return toast(item === 'potion' ? 'No health potions.' : 'No mana potions.', 2);
  if (item === 'potion') heal(10); else player.mana = Math.min(maxMana(), player.mana + 50);
}

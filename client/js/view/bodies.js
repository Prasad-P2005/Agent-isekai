// How creatures look: meshes, name labels and animation, kept in step with the simulation each frame.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { STEP } from '../core/loop.js';
import { WATER } from '../sim/blocks.js';
import { getBlock } from '../sim/chunks.js';
import { ss } from '../sim/noise.js';
import { ents } from '../sim/entities.js';
import { player } from '../sim/player.js';
import { buildAvatar, lookFor } from './avatar.js';
import { buildCreature } from './creatures.js';
import { spray } from './fireball.js';
import { newMotion } from './pose.js';
import { BODY_LAYER, late, scene } from './scene.js';

const STRIKE_TIME = 0.42, TURN_EASE = 12, PACE_EASE = 10, AIR_EASE = 14, HEAD_EASE = 8, SCARED_EASE = 8;
const STRIDE_WALK = 5.2, STRIDE_RUN = 4.2, TALL = 1.8, RUN_FROM = 2, RUN_AT = 3.4, FAST = 9;
const LOOK_RANGE = 5, GLARE_RANGE = 12, MAX_LOOK = 0.9, MAX_NOD = 0.4, STILL_BEYOND = 64;
const HURT_TINT = 0x880000, ICE_TINT = 0x1f6a9a, BANK = 12, MAX_BANK = 0.45;
const SWIM_EASE = 6, LAND_FADE = 7, HARD_LANDING = 0.5, GAZE_GAP = [2.5, 7], GAZE_REACH = 0.7, WORK_GAP = [1.1, 2.6];
const WORKERS = new Set(['blacksmith', 'farmer', 'hunter', 'baker', 'fisherman']); // jobs that are done with the arm, so they keep at it while nobody needs them
const FALL_TIME = 0.75, FALL_EASE = 9, FALL_TINT = 0x660000, POOF = 6; // a body drops, then goes in a little puff of cubes
const POOF_KIND = { palette: [0xd8d4cc, 0xa8a4a0, 0x77736f].map(c => new THREE.Color(c)), life: [0.3, 0.6], size: [0.14, 0.3], speed: [0.5, 2], spread: 0.45, drag: 3, lift: 0.5, fall: 0 };
const between = ([a, b]) => a + Math.random() * (b - a);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const clamp = (v, n) => Math.max(-n, Math.min(n, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function drawLabel(e) {
  const { canvas: c, tex } = e.view, x = c.getContext('2d');
  x.clearRect(0, 0, 256, 80);
  x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#000';
  const name = (e.reportT > 0 ? '❗ ' : e.angryT > 0 ? '⚔ ' : '') + e.name;
  const calm = e.def.friendly || e.def.wild;
  x.font = '30px Jersey, sans-serif'; x.fillStyle = calm ? '#bfffff' : '#ffb0b0';
  x.strokeText(name, 128, 24); x.fillText(name, 128, 24);
  if (e.title) { x.font = '20px Jersey, sans-serif'; x.fillStyle = '#ffe9a8'; x.strokeText(e.title, 128, 46); x.fillText(e.title, 128, 46); }
  x.fillStyle = '#300'; x.fillRect(48, 56, 160, 9);
  x.fillStyle = calm ? '#3c3' : '#e33'; x.fillRect(48, 56, 160 * Math.max(0, e.hp / e.maxHp), 9);
  tex.needsUpdate = true;
}
// The label changes rarely, so it is only redrawn when something on it does.
const labelState = e => `${e.hp}|${e.reportT > 0}|${e.angryT > 0}`;

on('entity:spawned', e => {
  const D = e.def, mats = [], seed = e.res?.id ?? [...e.name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7);
  const { g, extra, pose } = D.avatar ? buildAvatar(lookFor(e.kind, e.res?.job, seed, D), D.h, mats) : buildCreature(e.kind, D, mats);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, sizeAttenuation: false }));
  sprite.scale.set(0.24, 0.075, 1); sprite.position.y = D.h + 0.35; g.traverse(o => { if (o.isMesh) o.layers.enable(BODY_LAYER); }); g.add(late(sprite)); // constant on-screen size
  e.view = { g, mats, extra, pose, canvas, tex, sprite, motion: newMotion(Math.abs(seed)), yaw: e.yaw, pace: 0, strikeAge: STRIKE_TIME, label: labelState(e), tint: 0, gaze: 0, gazeT: between(GAZE_GAP), workT: between(WORK_GAP) };
  drawLabel(e);
  g.position.set(e.pos.x, e.pos.y, e.pos.z);
  g.rotation.y = e.yaw;
  scene.add(g);
});
function dispose(g) {
  scene.remove(g);
  g.traverse(o => {
    o.skeleton?.dispose();
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) { o.material.map?.dispose(); o.material.dispose(); }
  });
}
const fallen = [];
on('entity:removed', e => {
  if (!e.fell) return dispose(e.view.g);
  const v = e.view, side = Math.random() < 0.5 ? 1 : -1;
  v.sprite.visible = false;
  for (const m of v.mats) m.emissive?.setHex(FALL_TINT);
  fallen.push({ g: v.g, side, age: 0, tall: e.def.h });
});
function layDown(dt) {
  for (let i = fallen.length - 1; i >= 0; i--) {
    const f = fallen[i];
    f.age += dt;
    f.g.rotation.z += (f.side * Math.PI / 2 - f.g.rotation.z) * ease(FALL_EASE, dt);
    if (f.age < FALL_TIME) continue;
    spray(POOF_KIND, f.g.position, POOF, null, Math.max(1, f.tall / 2));
    dispose(f.g);
    fallen.splice(i, 1);
  }
}
const strike = e => { if (e?.view) e.view.strikeAge = 0; };
on('entity:struck', strike);
on('foe:shot', ({ killer }) => strike(killer));

function moveBody(e, v, dt) {
  const m = v.motion, D = e.def, reach = D.h / TALL;
  // Measured from where it truly went, so that nothing marches on the spot against a wall.
  const moved = Math.hypot(e.pos.x - e.last.x, e.pos.z - e.last.z) / STEP;
  v.pace += (moved - v.pace) * ease(PACE_EASE, dt);
  const relative = v.pace / reach;
  m.t += dt;
  m.walk = Math.min(1, relative / 0.6);
  m.run = ss(RUN_FROM, RUN_AT, relative);
  m.phase += dt * v.pace * (STRIDE_WALK + (STRIDE_RUN - STRIDE_WALK) * m.run) / reach;
  m.phase %= Math.PI * 2000;
  const wet = getBlock(Math.floor(e.pos.x), Math.floor(e.pos.y + D.h * 0.5), Math.floor(e.pos.z)) === WATER;
  m.swim += ((wet ? 1 : 0) - m.swim) * ease(SWIM_EASE, dt);
  if (e.onGround && m.air > HARD_LANDING) m.land = 1;
  m.land *= Math.exp(-LAND_FADE * dt);
  m.air += ((!e.onGround && !D.fly && !D.sacred && !D.swim && !wet ? 1 : 0) - m.air) * ease(AIR_EASE, dt);
  m.rise = clamp(e.vel.y / FAST, 1);
  v.strikeAge = Math.min(STRIKE_TIME, v.strikeAge + dt);
  m.strike = v.strikeAge < STRIKE_TIME ? v.strikeAge / STRIKE_TIME : 0;
  m.hurt = Math.max(0, e.flash / 0.2);
  m.scared += ((e.fleeT > 0 || e.reportT > 0 ? 1 : 0) - m.scared) * ease(SCARED_EASE, dt);
  m.cross = !D.friendly || e.angryT > 0;

  const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z, dy = player.pos.y - e.pos.y, dist = Math.hypot(dx, dz);
  m.near = D.friendly && dist < LOOK_RANGE;
  const watching = m.near || (!D.friendly && dist < GLARE_RANGE), idle = m.walk < 0.1 && !watching;
  if (idle) { // with nothing to do, a body looks about and gets on with its work
    v.gazeT -= dt;
    if (v.gazeT <= 0) { v.gazeT = between(GAZE_GAP); v.gaze = Math.random() < 0.4 ? 0 : (Math.random() - 0.5) * 2 * GAZE_REACH; }
    if (e.res && WORKERS.has(e.res.job)) { v.workT -= dt; if (v.workT <= 0) { v.workT = between(WORK_GAP); v.strikeAge = 0; } }
  }
  m.look += ((watching ? clamp(wrap(Math.atan2(-dx, -dz) - v.yaw), MAX_LOOK) : idle ? v.gaze : 0) - m.look) * ease(HEAD_EASE, dt); // turns to look at you
  m.nod += ((watching ? clamp(Math.atan2(dy, dist + 1), MAX_NOD) : 0) - m.nod) * ease(HEAD_EASE, dt);
  m.bank += (clamp(wrap(e.yaw - v.yaw) * BANK, MAX_BANK) - m.bank) * ease(HEAD_EASE, dt); // leans into a turn, by how far the body is behind it
  v.pose(v.extra, m);
}
function syncBody(e, dt, blend) {
  const v = e.view, D = e.def, p = e.pos, l = e.last;
  v.g.position.set(l.x + (p.x - l.x) * blend, l.y + (p.y - l.y) * blend, l.z + (p.z - l.z) * blend);
  v.yaw += wrap(e.yaw - v.yaw) * ease(TURN_EASE, dt);
  v.g.rotation.y = v.yaw;
  if (e.flash > 0) e.flash -= dt;
  const tint = e.flash > 0 ? HURT_TINT : e.frozenT > 0 ? ICE_TINT : 0;
  if (tint !== v.tint) { v.tint = tint; for (const m of v.mats) m.emissive?.setHex(tint); }
  const label = labelState(e);
  if (label !== v.label) { v.label = label; drawLabel(e); }
  const far = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
  v.sprite.visible = far < (D.friendly ? 14 : 28) || e.hp < e.maxHp; // no label clutter from afar
  if (far < Math.max(STILL_BEYOND, D.seen_from ?? 0) && !(e.frozenT > 0)) moveBody(e, v, dt); // ice holds a body in whatever pose it was caught
}

export function syncBodies(dt, blend) {
  for (const e of ents) syncBody(e, dt, blend);
  layDown(dt);
}

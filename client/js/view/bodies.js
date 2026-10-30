// How creatures and projectiles look: meshes, name labels and animation, kept in step with the simulation each frame.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { ents } from '../sim/entities.js';
import { player } from '../sim/player.js';
import { animateAvatar, buildAvatar, lookFor } from './avatar.js';
import { scene } from './scene.js';

function part(g, mats, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z); mats.push(m.material); g.add(m); return m;
}
function buildBody(D) {
  const g = new THREE.Group(), mats = [], { w, h } = D, extra = {};
  if (D.slime) {
    const b = part(g, mats, w, h, w, D.body, 0, h / 2, 0); b.material.transparent = true; b.material.opacity = 0.75;
    for (const a of [-1, 1]) part(g, mats, 0.14, 0.14, 0.04, 0x111111, a * 0.2, h * 0.65, -w / 2 - 0.01);
  } else if (D.quad) {
    const bl = w * 1.7;
    part(g, mats, w * 0.8, h * 0.45, bl, D.body, 0, h * 0.6, 0);
    part(g, mats, w * 0.6, w * 0.55, w * 0.75, D.head, 0, h * 0.8, -bl / 2 - w * 0.3);
    for (const a of [-1, 1]) part(g, mats, 0.1, 0.1, 0.04, 0xff3020, a * w * 0.18, h * 0.86, -bl / 2 - w * 0.68);
    extra.legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => part(g, mats, w * 0.2, h * 0.4, w * 0.2, D.body, a * w * 0.28, h * 0.2, b * bl * 0.35));
    part(g, mats, w * 0.15, w * 0.15, bl * 0.6, D.body, 0, h * 0.7, bl * 0.75);
    if (D.wings) extra.wings = [-1, 1].map(s => part(g, mats, w * 1.6, 0.08, w * 1.1, 0x701010, s * w * 1.15, h * 0.85, 0));
  } else {
    const s = h * 0.22;
    extra.legs = D.tail ? [] : [-1, 1].map(a => part(g, mats, w * 0.38, h * 0.45, w * 0.4, 0x3a3a5a, a * w * 0.2, h * 0.225, 0));
    if (D.tail) { part(g, mats, w * 0.7, h * 0.45, w * 0.45, D.body, 0, h * 0.225, 0); part(g, mats, w * 0.9, 0.08, 0.3, D.hair, 0, 0.04, 0.1); }
    part(g, mats, w, h * 0.35, w * 0.55, D.body, 0, h * 0.625, 0);
    extra.arms = [-1, 1].map(a => part(g, mats, w * 0.25, h * 0.33, w * 0.25, D.head, a * (w / 2 + w * 0.13), h * 0.62, 0));
    part(g, mats, s, s, s, D.head, 0, h * 0.89, 0);
    part(g, mats, s * 1.08, s * 0.3, s * 1.08, D.hair, 0, h * 0.89 + s * 0.42, 0.02);
    for (const a of [-1, 1]) part(g, mats, 0.07, 0.07, 0.02, 0x111111, a * s * 0.22, h * 0.9, -s / 2 - 0.01);
    if (D.ears) for (const a of [-1, 1]) part(g, mats, 0.28, 0.07, 0.07, D.head, a * (s / 2 + 0.12), h * 0.92, 0);
    if (D.catEars) for (const a of [-1, 1]) part(g, mats, 0.1, 0.16, 0.06, D.hair, a * s * 0.3, h * 0.89 + s * 0.65, 0);
    if (D.crown) for (const a of [-1, 0, 1]) part(g, mats, 0.08, 0.14, 0.08, 0xffd700, a * s * 0.35, h * 0.89 + s * 0.7, 0);
  }
  return { g, mats, extra };
}
function drawLabel(e) {
  const { canvas: c, tex } = e.view, x = c.getContext('2d');
  x.clearRect(0, 0, 256, 80);
  x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#000';
  const name = (e.reportT > 0 ? '❗ ' : e.angryT > 0 ? '⚔ ' : '') + e.name;
  x.font = 'bold 24px sans-serif'; x.fillStyle = e.def.friendly ? '#bfffff' : '#ffb0b0';
  x.strokeText(name, 128, 24); x.fillText(name, 128, 24);
  if (e.title) { x.font = '17px sans-serif'; x.fillStyle = '#ffe9a8'; x.strokeText(e.title, 128, 46); x.fillText(e.title, 128, 46); }
  x.fillStyle = '#300'; x.fillRect(48, 56, 160, 9);
  x.fillStyle = e.def.friendly ? '#3c3' : '#e33'; x.fillRect(48, 56, 160 * Math.max(0, e.hp / e.maxHp), 9);
  tex.needsUpdate = true;
}
// The label changes rarely, so it is only redrawn when something on it does.
const labelState = e => `${e.hp}|${e.reportT > 0}|${e.angryT > 0}`;

on('entity:spawned', e => {
  const D = e.def, avatar = !!D.avatar;
  let g, mats = [], extra;
  if (avatar) { // designed anime-style block character
    const seed = e.res?.id ?? [...e.name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7);
    ({ g, extra } = buildAvatar(lookFor(e.kind, e.res?.job, seed, D), D.h, mats));
  } else ({ g, mats, extra } = buildBody(D));
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, sizeAttenuation: false }));
  sprite.scale.set(0.24, 0.075, 1); sprite.position.y = D.h + 0.35; g.add(sprite); // constant on-screen size
  e.view = { g, mats, extra, canvas, tex, sprite, avatar, anim: 0, label: labelState(e) };
  drawLabel(e);
  g.position.set(e.pos.x, e.pos.y, e.pos.z);
  scene.add(g);
});
on('entity:removed', e => {
  scene.remove(e.view.g);
  e.view.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.shared) { o.material.map?.dispose(); o.material.dispose(); } });
});

function syncBody(e, dt) {
  const v = e.view, D = e.def;
  v.anim += dt * Math.hypot(e.vel.x, e.vel.z) * 3;
  const sw = Math.sin(v.anim) * 0.6, t = performance.now() / 1000;
  if (v.avatar) animateAvatar(e, player.pos.x, player.pos.z, t);
  else {
    v.extra.legs?.forEach((l, i) => { l.rotation.x = i % 2 ? sw : -sw; });
    v.extra.arms?.forEach((l, i) => { l.rotation.x = i % 2 ? -sw : sw; });
  }
  v.extra.wings?.forEach((wg, i) => { wg.rotation.z = Math.sin(performance.now() / 180) * 0.5 * (i ? 1 : -1); });
  if (e.flash > 0) { e.flash -= dt; for (const m of v.mats) m.emissive?.setHex(e.flash > 0 ? 0x880000 : 0x000000); }
  const label = labelState(e);
  if (label !== v.label) { v.label = label; drawLabel(e); }
  v.g.position.set(e.pos.x, e.pos.y, e.pos.z); v.g.rotation.y = e.yaw;
  v.sprite.visible = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) < (D.friendly ? 14 : 28) || e.hp < e.maxHp; // no label clutter from afar
}

const flying = new Map(); // projectile -> mesh
on('projectile:spawned', pr => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  m.position.set(pr.pos.x, pr.pos.y, pr.pos.z); scene.add(m);
  flying.set(pr, m);
});
on('projectile:removed', pr => {
  const m = flying.get(pr);
  scene.remove(m); m.geometry.dispose(); m.material.dispose();
  flying.delete(pr);
});

export function syncBodies(dt) {
  for (const e of ents) syncBody(e, dt);
  for (const [pr, m] of flying) m.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
}

// Creatures and people: bodies, AI, combat, projectiles and natural (Minecraft-like) spawning.
import * as THREE from 'three';
import { G } from './state.js';
import { scene, camera } from './scene.js';
import { getBlock, chunkReady } from './chunks.js';
import { solid, GROUND } from './blocks.js';
import { CS, H, SEA, B, biomeAt, hintQueue, groundAt, landOf } from './terrain.js';
import { player, damagePlayer, has } from './player.js';
import { crime, report } from './people.js';
import { toast, applyState } from './ui.js';
import { api } from './api.js';
import { buildAvatar, lookFor, animateAvatar } from './avatar.js';

export const ENT = {
  villager: { label: 'Villager', friendly: 1, race: 'human', hp: 20, speed: 1.4, w: 0.6, h: 1.8, body: 0x7b5a3a, head: 0xf1c27d, hair: 0x5a3a1a },
  merchant: { label: 'Merchant', friendly: 1, race: 'human', hp: 20, speed: 1.2, w: 0.6, h: 1.8, body: 0x7a2a8a, head: 0xf1c27d, hair: 0x222222 },
  king: { label: 'King', friendly: 1, race: 'human', hp: 60, speed: 1, w: 0.7, h: 2, body: 0xc8a02a, head: 0xf1c27d, hair: 0xffd36b, crown: 1 },
  knight: { label: 'Knight', friendly: 1, lawful: 1, race: 'human', hp: 40, dmg: 5, speed: 2.2, w: 0.6, h: 1.9, body: 0x9aa0a8, head: 0xc8ced6, hair: 0x3557c9 },
  adventurer: { label: 'Adventurer', friendly: 1, lawful: 1, race: 'human', hp: 40, dmg: 5, speed: 2.4, w: 0.6, h: 1.85, body: 0x4a6a8a, head: 0xf1c27d, hair: 0x3a2a1a },
  elf_royal: { label: 'Elf Royal', friendly: 1, race: 'elf', hp: 80, speed: 1, w: 0.6, h: 2, body: 0xe8f4ff, head: 0xfde3c8, hair: 0xf5e6a0, ears: 1, crown: 1 },
  elf_guard: { label: 'Elven Guard', friendly: 1, lawful: 1, race: 'elf', hp: 45, dmg: 6, speed: 2.6, w: 0.6, h: 1.95, body: 0x3a7a5a, head: 0xfde3c8, hair: 0xd8d0b8, ears: 1 },
  elf: { label: 'Elf', friendly: 1, race: 'elf', hp: 24, speed: 1.8, w: 0.6, h: 1.9, body: 0x2e8b57, head: 0xfde3c8, hair: 0xf5e6a0, ears: 1 },
  mermaid: { label: 'Mermaid', friendly: 1, race: 'mermaid', hp: 20, speed: 2.2, w: 0.6, h: 1.6, body: 0x2fb5b5, head: 0xfde3c8, hair: 0xff6fa8, tail: 1, swim: 1 },
  beastkin: { label: 'Beastkin', friendly: 1, race: 'beastkin', hp: 26, speed: 2, w: 0.6, h: 1.8, body: 0xa0522d, head: 0xd9a066, hair: 0x6a4020, catEars: 1 },
  golem: { label: 'Iron Golem', lawful: 1, hp: 120, dmg: 10, speed: 2.8, w: 1.2, h: 2.8, body: 0xb0b0a8, head: 0x9a9a92, hair: 0x6a8a4a },
  bounty_hunter: { label: 'Bounty Hunter', hunter: 1, hp: 35, dmg: 6, speed: 3.6, w: 0.6, h: 1.85, body: 0x3a2a1a, head: 0xe0b080, hair: 0x111111 },
  slime: { label: 'Slime', hp: 10, dmg: 2, speed: 2.6, w: 0.9, h: 0.9, body: 0x6cd96c, slime: 1 },
  goblin: { label: 'Goblin', hp: 14, dmg: 3, speed: 3, w: 0.6, h: 1.3, body: 0x5a3a1a, head: 0x5a8a2a, hair: 0x2a2a1a, ears: 1 },
  wolf: { label: 'Dire Wolf', hp: 16, dmg: 4, speed: 4.6, w: 0.8, h: 1.0, body: 0x6e6e6e, head: 0x7a7a7a, quad: 1 },
  orc: { label: 'Orc', hp: 40, dmg: 7, speed: 2.4, w: 0.9, h: 2.2, body: 0x4a3020, head: 0x5f8f4a, hair: 0x111111 },
  dragon: { label: 'Dragon', hp: 180, dmg: 12, speed: 5.5, w: 2.4, h: 2.2, body: 0xb02020, head: 0xc03030, quad: 1, wings: 1, fly: 1 },
  imp: { label: 'Imp', demon: 1, hp: 14, dmg: 3, speed: 4, w: 0.5, h: 1.0, body: 0xc03030, head: 0xd04040, hair: 0x220000, catEars: 1, fly: 1 },
  demon_knight: { label: 'Demon Knight', demon: 1, hp: 55, dmg: 8, speed: 3, w: 0.8, h: 2.2, body: 0x2a1a30, head: 0x5a1a2a, hair: 0xff3020, catEars: 1 },
  demon_lord: { label: 'Demon Lord', demon: 1, boss: 1, hp: 700, dmg: 18, speed: 3.2, w: 1.3, h: 3.4, body: 0x3a0a4a, head: 0x7a1a3a, hair: 0xffd36b, catEars: 1 },
};
export const ents = [];
// beings drawn as designed anime-style block characters (monsters keep their creature bodies)
const AVATARS = new Set(['villager', 'merchant', 'king', 'knight', 'adventurer', 'elf', 'elf_royal', 'elf_guard', 'mermaid', 'beastkin', 'bounty_hunter', 'demon_lord']);

function part(g, mats, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z); mats.push(m.material); g.add(m); return m;
}
export function buildBody(D) {
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
  const c = e.canvas, x = c.getContext('2d');
  x.clearRect(0, 0, 256, 80);
  x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = '#000';
  const name = (e.reportT > 0 ? '❗ ' : e.angryT > 0 ? '⚔ ' : '') + e.name;
  x.font = 'bold 24px sans-serif'; x.fillStyle = e.def.friendly ? '#bfffff' : '#ffb0b0';
  x.strokeText(name, 128, 24); x.fillText(name, 128, 24);
  if (e.title) { x.font = '17px sans-serif'; x.fillStyle = '#ffe9a8'; x.strokeText(e.title, 128, 46); x.fillText(e.title, 128, 46); }
  x.fillStyle = '#300'; x.fillRect(48, 56, 160, 9);
  x.fillStyle = e.def.friendly ? '#3c3' : '#e33'; x.fillRect(48, 56, 160 * Math.max(0, e.hp / e.maxHp), 9);
  e.tex.needsUpdate = true;
}
export function spawnEntity(kind, x, y, z, opts = {}) {
  const base = ENT[kind];
  if (!base) return null;
  if (ents.length >= 60 || (!base.friendly && ents.filter(e => !e.def.friendly).length >= 25)) return null;
  const D = { ...base };
  if (opts.body != null) D.body = opts.body;
  if (opts.hair != null) D.hair = opts.hair;
  const avatar = AVATARS.has(kind);
  let g, mats = [], extra;
  if (avatar) { // designed anime-style block character
    const seed = opts.res?.id ?? [...(opts.name || kind)].reduce((h, c) => h * 31 + c.charCodeAt(0), 7);
    ({ g, extra } = buildAvatar(lookFor(kind, opts.res?.job, seed, D), D.h, mats));
  } else ({ g, mats, extra } = buildBody(D));
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, sizeAttenuation: false }));
  sprite.scale.set(0.24, 0.075, 1); sprite.position.y = D.h + 0.35; g.add(sprite); // constant on-screen size
  const e = {
    kind, def: D, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), kb: new THREE.Vector3(), yaw: Math.random() * 6.28,
    hp: D.hp, maxHp: D.hp, mesh: g, mats, extra, canvas, tex, onGround: false, wanderT: 0, wdir: [0, 0], cd: 0.5, hopT: 0, flash: 0, anim: 0,
    sprite, avatar, fleeT: 0, angryT: opts.angry ? 999 : 0, reportT: 0, reportLaw: null, summonT: 6, attacked: false,
    name: opts.name || (kind === 'demon_lord' ? G.world.demon_lord_name : D.label), title: opts.title || '', res: opts.res || null, natural: !!opts.natural,
  };
  if (e.res) e.res._ent = e;
  drawLabel(e);
  g.position.copy(e.pos); scene.add(g); ents.push(e);
  return e;
}
export function removeEntity(e) {
  const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1);
  if (e.res) e.res._ent = null;
  scene.remove(e.mesh);
  e.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
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
function nearestEnt(e, filter, range) {
  let best = null, bd = range;
  for (const o of ents) { if (o === e || o.hp <= 0 || !filter(o)) continue; const d = o.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}

function updateEntity(e, dt) {
  const D = e.def, p = e.pos;
  if (!chunkReady(p.x, p.z)) return;
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z, dy = player.pos.y - p.y, dist = Math.hypot(dx, dz) || 0.001;
  if (!e.res && (dist > 130 || (e.natural && !D.friendly && !isNight() && dist > 28 && Math.random() < 0.002))) return removeEntity(e);
  if (D.lawful && !D.friendly && player.wanted <= 0 && dist > 12) return removeEntity(e); // golems go home
  if (D.hunter && (G.profile?.bounty || 0) <= 0) return removeEntity(e);
  e.fleeT -= dt; e.angryT -= dt;
  if (e.reportT > 0) { e.reportT -= dt; if (e.reportT <= 0) report(e); }
  const inWater = getBlock(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z)) === 5;

  // choose a target: the player, another creature, or nobody
  const canHitPlayer = player.ready && G.locked && Math.abs(dy) < 16;
  const flee = e.reportT > 0 || e.fleeT > 0;
  let tgt = null;
  if (!flee) {
    if (D.lawful) {
      if (canHitPlayer && (player.wanted > 0 || e.angryT > 0) && dist < 40) tgt = 'player';
      else tgt = nearestEnt(e, isMonster, 14);
    } else if (D.hunter) { if (canHitPlayer && dist < 60) tgt = 'player'; }
    else if (!D.friendly) {
      if (canHitPlayer && dist < (D.fly || D.boss ? 40 : 22)) tgt = 'player';
      const v = D.demon ? nearestEnt(e, o => o.def.friendly || o.def.lawful, 18) : nearestEnt(e, o => o.def.lawful, 6);
      if (v && (!tgt || v.pos.distanceTo(p) < dist)) tgt = v;
    }
  }
  const tp = tgt === 'player' ? player.pos : tgt ? tgt.pos : null;
  let mx = 0, mz = 0, speed = D.speed;
  if (flee) { mx = -dx / dist; mz = -dz / dist; speed *= 1.5; }
  else if (tp) { const tx = tp.x - p.x, tz = tp.z - p.z, l = Math.hypot(tx, tz) || 1; mx = tx / l; mz = tz / l; }
  else if (D.friendly && dist < 4) { e.yaw = Math.atan2(-dx, -dz); speed = 0; }
  else {
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
    const ty = tp ? tp.y + (Math.hypot(tp.x - p.x, tp.z - p.z) > 7 ? 7 : 0.5) : Math.max(p.y, groundAt(p.x | 0, p.z | 0) + 12);
    e.vel.y = Math.max(-7, Math.min(7, (ty - p.y) * 2));
    p.addScaledVector(e.vel, dt);
  } else {
    if (D.swim && inWater) e.vel.y = getBlock(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z)) === 5 ? Math.sin(performance.now() / 900 + e.yaw) * 0.6 : -0.8;
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
      if (tgt === 'player') { damagePlayer(D.dmg, e.name === D.label ? 'a ' + D.label : e.name); player.kb.set(tdx / td * 7, 0, tdz / td * 7); player.vel.y = Math.max(player.vel.y, 5); }
      else hurtEntity(tgt, D.dmg, tdx / td, tdz / td, e);
    }
  }
  if (D.boss && tgt === 'player') { e.summonT -= dt; if (e.summonT <= 0) { e.summonT = 12; for (let i = 0; i < 2; i++) spawnEntity('imp', p.x + Math.random() * 4 - 2, p.y + 3, p.z + Math.random() * 4 - 2); } }
  // animation
  e.anim += dt * Math.hypot(e.vel.x, e.vel.z) * 3;
  const sw = Math.sin(e.anim) * 0.6;
  if (e.avatar) animateAvatar(e, player.pos.x, player.pos.z, performance.now() / 1000);
  else {
    e.extra.legs?.forEach((l, i) => { l.rotation.x = i % 2 ? sw : -sw; });
    e.extra.arms?.forEach((l, i) => { l.rotation.x = i % 2 ? -sw : sw; });
  }
  e.extra.wings?.forEach((wg, i) => { wg.rotation.z = Math.sin(performance.now() / 180) * 0.5 * (i ? 1 : -1); });
  if (e.flash > 0) { e.flash -= dt; for (const m of e.mats) m.emissive?.setHex(e.flash > 0 ? 0x880000 : 0x000000); }
  if ((e.reportT > 0) !== e._shownReport) { e._shownReport = e.reportT > 0; drawLabel(e); }
  e.mesh.position.copy(p); e.mesh.rotation.y = e.yaw;
  e.sprite.visible = dist < (D.friendly ? 14 : 28) || e.hp < e.maxHp; // no label clutter from afar
}

export function hurtEntity(e, dmg, dirx, dirz, by = 'player') {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.2;
  e.kb.set(dirx * 7, 0, dirz * 7); if (!e.def.fly) e.vel.y = 4;
  drawLabel(e);
  const D = e.def, byPlayer = by === 'player';
  if (byPlayer && D.friendly) {
    if (D.lawful) e.angryT = 25; else e.fleeT = 12;
    if (!e.attacked && e.hp > 0) { e.attacked = true; crime('attack_civilian', e); }
  }
  if (!byPlayer && D.friendly && !D.lawful) e.fleeT = 8;
  if (e.hp > 0) return;
  removeEntity(e);
  const resident = e.res ? { settlement: Math.floor(e.res.id / 1000), id: e.res.id } : null;
  if (e.res) e.res.dead = true;
  if (byPlayer && D.friendly) crime('kill_' + D.race, e);
  if (byPlayer || resident) {
    api.event({ type: 'kill', kind: e.kind, by_player: byPlayer, resident }).then(res => {
      applyState(res);
      for (const m of res.messages || []) toast(m, 2);
    }).catch(() => {});
  }
}
export function pickEntity(max) {
  const o = camera.position, d = new THREE.Vector3(); camera.getWorldDirection(d);
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
  const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
  hurtEntity(e, (has('giant_strength') ? 9 : 4) + (G.profile?.weapon || 0), dx / l, dz / l);
}

// ---------- projectiles ----------
const projectiles = [];
export function spawnProjectile(pos, vel) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  m.position.copy(pos); scene.add(m);
  projectiles.push({ m, vel, life: 2.5 });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i], p = pr.m.position;
    p.addScaledVector(pr.vel, dt); pr.life -= dt;
    let dead = pr.life <= 0 || solid(getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
    for (const e of ents) {
      if (dead) break;
      if (Math.hypot(e.pos.x - p.x, e.pos.y + e.def.h / 2 - p.y, e.pos.z - p.z) < Math.max(e.def.w, e.def.h) / 2 + 0.6) {
        const l = Math.hypot(pr.vel.x, pr.vel.z) || 1;
        hurtEntity(e, 14, pr.vel.x / l, pr.vel.z / l); dead = true;
      }
    }
    if (dead) { scene.remove(pr.m); pr.m.geometry.dispose(); pr.m.material.dispose(); projectiles.splice(i, 1); }
  }
}

// ---------- spawning ----------
export function topGround(x, z) { for (let y = H - 1; y > 0; y--) if (GROUND.has(getBlock(x, y, z))) return y; return 0; }
export function ringPos(rmin, rmax) {
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
  if (!chunkReady(x, z) || y <= SEA || getBlock(x, y + 1, z) !== 0) return;
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
    if (d > 48 || !chunkReady(h.x, h.z)) continue;
    hintQueue.splice(i, 1);
    if (h.kind === 'demon_lord' && G.world.demon_lord_dead) continue;
    let y = h.y; while (!fitsAt(h.x + 0.5, y, h.z + 0.5) && y < H - 2) y++;
    spawnEntity(h.kind, h.x + 0.5, y, h.z + 0.5);
  }
}
export function updateEntities(dt) {
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i]) updateEntity(ents[i], dt);
  updateProjectiles(dt);
  naturalSpawning(dt);
  structureSpawning(dt);
}

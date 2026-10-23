// Residents (planned by the god on the server), crimes & witnesses, law enforcement and conversations.
import * as THREE from 'three';
import { G } from './state.js';
import { api } from './api.js';
import { chunkReady } from './chunks.js';
import { landOf, settlement, heightAt } from './terrain.js';
import { player, lineOfSight } from './player.js';
import { ents, spawnEntity, removeEntity, fitsAt, spawnNear, isNight, pickEntity } from './entities.js';
import { toast, applyState, openService, openConversation, applyEffects } from './ui.js';

// ---------- residents: only the ones near the player physically exist ----------
const MAX_RESIDENTS = 34, SPAWN_DIST = 56, DESPAWN_DIST = 76;
let residentTimer = 0;
export function updateResidents(dt) {
  residentTimer -= dt;
  if (residentTimer > 0) return;
  residentTimer = 0.7;
  const night = isNight(), candidates = [];
  // despawn residents left behind, wherever they are (the player may have died, been exiled or flown away)
  for (const e of ents.slice()) if (e.res && e.pos.distanceTo(player.pos) > DESPAWN_DIST) removeEntity(e);
  for (const S of G.world.settlements) {
    if (Math.hypot(S.cx - player.pos.x, S.cz - player.pos.z) > 140) continue;
    for (const r of S.residents) {
      if (r._ent || r.dead) continue;
      const t = night ? r.night : r.work, d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
      if (d <= SPAWN_DIST && chunkReady(t.x, t.z)) candidates.push([r.notable || r.service ? d - 40 : d, r, t]);
    }
  }
  // the people that matter (rulers, shopkeepers, guild staff) and the nearest ones get the limited slots
  candidates.sort((a, b) => a[0] - b[0]);
  let live = ents.filter(e => e.res).length;
  for (const [, r, t] of candidates) {
    if (live >= MAX_RESIDENTS) break;
    let y = heightAt(Math.floor(t.x), Math.floor(t.z)) + 1; // ground floor, not the roof
    while (!fitsAt(t.x, y, t.z) && y < 150) y++;
    if (spawnEntity(r.kind, t.x, y, t.z, { name: r.name, title: r.label, body: r.body, hair: r.hair, res: r })) live++;
  }
}
export async function reloadSettlement(id) {
  const fresh = await api.settlement(id);
  const old = G.world.settlements[id];
  for (const r of old.residents) if (r._ent) removeEntity(r._ent);
  G.world.settlements[id] = { ...old, ...fresh };
}

// ---------- crimes ----------
export function inCity(x, z) {
  const L = landOf(x, z);
  if (L.settlement == null) return false;
  const S = settlement(L.settlement);
  return (S.type === 'city' || S.type === 'elfcity') && Math.hypot(x - S.cx, z - S.cz) <= 28;
}
const REALM_NAME = ['ocean', 'ocean', 'elf', 'human', 'beast', 'peaks', 'demon'];
function witnesses(victim) {
  const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z), range = isNight() ? 12 : 26;
  const lawmen = [], civilians = [];
  for (const o of ents) {
    if (!(o.def.friendly || o.def.lawful) || o.hp <= 0 || o === victim) continue;
    if (o.pos.distanceTo(player.pos) > range) continue;
    if (!lineOfSight(new THREE.Vector3(o.pos.x, o.pos.y + o.def.h * 0.9, o.pos.z), eye)) continue;
    (o.def.lawful ? lawmen : civilians).push(o);
  }
  if (victim && victim.hp > 0) civilians.push(victim); // a surviving victim is a witness too
  return { lawmen, civilians };
}
export async function crime(type, victim) {
  const { lawmen, civilians } = witnesses(victim);
  const res = await api.crime({
    crime: type, in_city: inCity(player.pos.x, player.pos.z), realm: REALM_NAME[landOf(player.pos.x, player.pos.z).b],
    lawmen: lawmen.map(o => o.name), civilians: civilians.map(o => o.name), victim: victim ? `${victim.name} the ${victim.def.label}` : '',
  });
  applyState(res);
  if (!res.results.length) {
    for (const w of civilians) w.fleeT = 10;
    if (type !== 'vandalism') toast(civilians.length ? `😱 ${civilians.length} people saw that and run screaming… but no law here punishes it.` : '🤫 Nobody saw that, and no law here forbids it.', 4);
  }
  for (const r of res.results) {
    if (r.outcome === 'unseen') toast(`🤫 Nobody saw that… "${r.law}" was broken in secret.`, 4);
    else if (r.outcome === 'punished') applyEffects(r.effects);
    else if (r.outcome === 'witnessed') {
      const ws = civilians.filter(o => r.witnesses.includes(o.name));
      for (const w of ws) { w.reportT = 20; w.reportLaw = r.law; w.fleeT = 20; }
      toast(`⚠ ${r.witnesses.join(', ')} saw you! Silence them within 20s or be reported for "${r.law}"`, 6);
    }
  }
}
export async function report(e) {
  const law = e.reportLaw;
  for (const o of ents) if (o.reportLaw === law) { o.reportT = 0; o.reportLaw = null; }
  const res = await api.report(law, `${e.name} the ${e.def.label}`);
  applyState(res);
  applyEffects(res.effects);
}
let vandalT = 0;
export function onBreakBlock(x, z, id, BUILT) {
  if (BUILT.has(id) && inCity(x, z) && performance.now() - vandalT > 8000) { vandalT = performance.now(); crime('vandalism', null); }
}

// ---------- wanted level & bounty hunters ----------
let hunterT = 30;
export function updateLaw(dt) {
  if (player.wanted > 0) {
    const chased = ents.some(o => o.def.lawful && (o.angryT > 0 || !o.def.friendly) && o.pos.distanceTo(player.pos) < 30);
    player.wanted -= dt * (chased ? 0.2 : 1); // hiding from the law makes the hunt end sooner
    if (player.wanted <= 0) { player.wanted = 0; for (const o of ents) if (o.def.lawful) o.angryT = 0; toast('The hunt for you has ended… for now.', 3); }
  }
  hunterT -= dt;
  if ((G.profile?.bounty || 0) > 0 && hunterT <= 0) {
    hunterT = 70;
    if (ents.filter(e => e.def.hunter).length < 2) { spawnNear('bounty_hunter', 1, 20, 28); toast(`A bounty hunter is tracking you (bounty ${G.profile.bounty}).`, 4); }
  }
}

// ---------- talking ----------
export async function talkToNearest() {
  const aimed = pickEntity(6);
  let best = aimed && aimed.e.def.friendly ? aimed.e : null, bd = 4.5;
  if (!best) for (const e of ents) { const d = e.pos.distanceTo(player.pos); if (e.def.friendly && d < bd) { best = e; bd = d; } }
  if (!best) return toast('No one is near enough to talk to.', 2);
  if (best.talking) return;
  if (best.angryT > 0) return toast(`${best.name} is in no mood to talk!`, 2);
  const r = best.res, sid = r ? Math.floor(r.id / 1000) : -1;
  if (best.def.lawful && ((G.profile?.bounty || 0) > 0 || player.wanted > 0)) return openService('bounty', best, sid, `${best.name}: "You're a wanted criminal. Pay up, or surrender."`);
  const service = r?.service && !['king', 'elder', 'chief'].includes(r.service) ? r.service : null;
  openConversation(best, sid, service);
}

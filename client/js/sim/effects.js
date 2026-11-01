// Applying what the server decided: the new player state, and the effects only the client can carry out.
import { G, creative } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { ents } from './entities.js';
import { applyParcels, takeBlock } from './inventory.js';
import { fillSpells } from './abilities.js';
import { sleptThrough } from './momentum.js';
import { has, heal, maxMana, player } from './player.js';
import { spawnNear } from './spawning.js';
import { LAND, SEA, heightAt } from './terrain.js';

// Faith only moves on the server, so what the screen makes of it is worked out from the difference.
function faithMoved(was, now) {
  if (now.level > was.level) emit('level:up', now);
  else if (now.faith > was.faith) emit('faith:gained', now.faith - was.faith);
}
export function applyState(res) {
  if (!res) return;
  if (res.rules) G.rules = res.rules;
  if (res.player && G.profile) faithMoved(G.profile, res.player);
  // The client owns the block inventory: the server's copy can be a moment behind what was just mined.
  if (res.player) G.profile = { ...res.player, blocks: G.profile?.blocks ?? res.player.blocks, bag: G.profile?.bag ?? res.player.bag, worn: G.profile?.worn ?? res.player.worn, seen: G.profile?.seen ?? res.player.seen, spells: G.profile?.spells ?? res.player.spells, bestiary: [...new Set([...res.player.bestiary ?? [], ...G.profile?.bestiary ?? []])] };
  if (res.player) { applyParcels(res.player.parcels); fillSpells(); }
  if (res.story) { G.objective = res.story.objective; G.oaths = res.story.oaths; G.marks = res.story.marks; emit('objective:changed', G.objective); }
  for (const o of res.reached || []) toast(`📜 New objective: ${o}`, 7);
  if (res.banner) emit('banner', { title: res.banner, line: '' });
}
// The moment the mode changes. Going back, the hero keeps only what they really have: real blocks, and flight if they learned it.
export function creativeChanged() {
  if (creative()) toast('✨ Creative mode: every block is in your bag, F flies, and nothing can touch you.', 5);
  else {
    if (!has('flight')) player.fly = false;
    toast('Creative mode is off.', 2);
  }
  emit('hotbar:changed');
  emit('creative:changed');
}
// A land far from here, on solid ground. Exile sets you down somewhere strange: it does not drop you out of the sky.
function exileLand() {
  const here = [Math.floor(player.pos.x / LAND), Math.floor(player.pos.z / LAND)], far = [];
  G.world.lands.forEach((row, lz) => row.forEach((land, lx) => {
    if (land.realm !== 'ocean' && land.realm !== 'demon' && land.structure !== 'dragon_peak' && Math.hypot(lx - here[0], lz - here[1]) >= 3) far.push([lx, lz]);
  }));
  return far[Math.floor(Math.random() * far.length)];
}
export function applyEffects(fx) {
  if (!fx) return;
  if (fx.text) toast(`⚖ ${fx.by ? `${fx.by} enforced "${fx.law}": ` : ''}${fx.text}!`, 6);
  if (fx.clear_wanted) { player.wanted = 0; for (const o of ents) if (o.def.lawful) o.angryT = 0; }
  else if (fx.wanted != null) player.wanted = fx.wanted ? Math.max(player.wanted, fx.wanted) : 0;
  for (const s of fx.spawn || []) spawnNear(s.kind, s.count, 14, 22, { angry: s.angry });
  if (fx.exile) {
    const [lx, lz] = exileLand(), x = lx * LAND + LAND / 2 + 0.5, z = lz * LAND + LAND / 2 + 0.5;
    player.pos.set(x, Math.max(heightAt(Math.floor(x), Math.floor(z)), SEA) + 2, z); player.vel.set(0, 0, 0);
  }
  if (fx.heal) heal(fx.heal);
  if (fx.mana) player.mana = maxMana();
  if (fx.morning) { G.dayTime = 0.05; sleptThrough(); }
  for (const [id, n] of Object.entries(fx.take_blocks || {})) for (let i = 0; i < n; i++) takeBlock(Number(id));
}

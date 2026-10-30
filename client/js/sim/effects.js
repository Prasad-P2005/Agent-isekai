// Applying what the server decided: the new player state, and the effects only the client can carry out.
import { G } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { ents, spawnNear } from './entities.js';
import { takeBlock } from './inventory.js';
import { heal, maxMana, player } from './player.js';
import { LAND, SEA, heightAt } from './terrain.js';

export function applyState(res) {
  if (!res) return;
  // The client owns the block inventory: the server's copy can be a moment behind what was just mined.
  if (res.player) G.profile = { ...res.player, blocks: G.profile?.blocks ?? res.player.blocks };
  if (res.story) { G.objective = res.story.objective; G.oaths = res.story.oaths; G.marks = res.story.marks; emit('objective:changed', G.objective); }
  for (const o of res.reached || []) toast(`📜 New objective: ${o}`, 7);
}
// A land far from here, on solid ground. Exile sets you down somewhere strange: it does not drop you out of the sky.
function exileLand() {
  const here = [Math.floor(player.pos.x / LAND), Math.floor(player.pos.z / LAND)], far = [];
  G.world.lands.forEach((row, lz) => row.forEach((land, lx) => {
    if (land.realm !== 'ocean' && land.realm !== 'demon' && Math.hypot(lx - here[0], lz - here[1]) >= 3) far.push([lx, lz]);
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
  if (fx.morning) G.dayTime = 0.05;
  for (const [id, n] of Object.entries(fx.take_blocks || {})) for (let i = 0; i < n; i++) takeBlock(Number(id));
}

// Applying what the server decided: the new player state, and the effects only the client can carry out.
import { G } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { ents, spawnNear } from './entities.js';
import { heal, player } from './player.js';
import { LAND } from './terrain.js';

export function applyState(res) {
  if (!res) return;
  // The client owns the block inventory: the server's copy can be a moment behind what was just mined.
  if (res.player) G.profile = { ...res.player, blocks: G.profile?.blocks ?? res.player.blocks };
  if (res.story) { G.objective = res.story.objective; emit('objective:changed', G.objective); }
  for (const o of res.reached || []) toast(`📜 New objective: ${o}`, 7);
}
export function applyEffects(fx) {
  if (!fx) return;
  if (fx.text) toast(`⚖ ${fx.by ? `${fx.by} enforced "${fx.law}": ` : ''}${fx.text}!`, 6);
  if (fx.clear_wanted) { player.wanted = 0; for (const o of ents) if (o.def.lawful) o.angryT = 0; }
  else if (fx.wanted != null) player.wanted = fx.wanted ? Math.max(player.wanted, fx.wanted) : 0;
  for (const s of fx.spawn || []) spawnNear(s.kind, s.count, 14, 22, { angry: s.angry });
  if (fx.exile) {
    const n = G.world.lands.length, lx = Math.floor(Math.random() * n), lz = Math.floor(Math.random() * n);
    player.pos.set(lx * LAND + LAND / 2 + 0.5, 140, lz * LAND + LAND / 2 + 0.5); player.vel.set(0, 0, 0);
  }
  if (fx.heal) heal(fx.heal);
  if (fx.mana) player.mana = player.maxMana;
  if (fx.morning) G.dayTime = 0.05;
}

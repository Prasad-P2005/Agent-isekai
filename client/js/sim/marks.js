// Where the things the hero is after are right now, for the compass and both maps. The server says what is wanted (G.marks).
// Here a person or creature is followed once they exist, a hunt shows only while its prey is about, and a choice narrows to the nearest.
import { WORLD } from '../core/content.js';
import { G } from '../core/state.js';
import { ents } from './entities.js';
import { player } from './player.js';

// A landmark's creature is somewhere on its land, and a hunt takes whichever is nearest to you.
function creatureFor(m) {
  const from = m.x == null ? player.pos : m;
  let best = null, reach = m.x == null ? Infinity : WORLD.land;
  for (const e of ents) {
    if (e.kind !== m.creature || e.hp <= 0) continue;
    const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
    if (d < reach) { reach = d; best = e; }
  }
  return best;
}
function beingBehind(m) {
  if (m.person != null) return ents.find(e => e.res?.id === m.person) ?? null;
  return m.creature ? creatureFor(m) : null;
}
export function questMarks() {
  const chosen = new Map(); // id -> the nearest mark with that id
  for (const m of G.marks) {
    const e = beingBehind(m), x = e ? e.pos.x : m.x, z = e ? e.pos.z : m.z;
    if (x == null) continue;
    const dist = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (!(chosen.get(m.id)?.dist <= dist)) chosen.set(m.id, { ...m, x, z, dist });
  }
  return [...chosen.values()];
}

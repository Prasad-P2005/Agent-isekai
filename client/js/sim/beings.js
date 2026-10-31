// Who is in the world, apart from what they do, so that the code that decides what they do can read the list without a cycle.
import { G } from '../core/state.js';

export const ents = [];
export const isNight = () => Math.sin(G.dayTime * Math.PI * 2) < -0.1;
const monstrous = D => !D.friendly && !D.lawful && !D.hunter && !D.wild;
export const isMonsterKind = monstrous;
export const isMonster = o => monstrous(o.def);
export function nearestEnt(e, filter, range) {
  let best = null, bd = range;
  for (const o of ents) { if (o === e || o.hp <= 0 || !filter(o)) continue; const d = o.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}
export const killerName = e => (e.name === e.def.label ? 'a ' + e.def.label : e.name);

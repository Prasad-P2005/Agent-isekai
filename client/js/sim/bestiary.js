// The journal's list of creatures: a kind is entered the first time the hero gets a proper look at it.
import { BESTIARY } from '../core/content.js';
import { G } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { ents } from './beings.js';
import { inView, player } from './player.js';

const LOOK_EVERY = 0.5, GOOD_LOOK = 34;
let lookT = 0;
export const hasSeen = kind => !!G.profile?.bestiary?.includes(kind);
export function spotted(kind, label) {
  if (hasSeen(kind) || !BESTIARY.entries[kind]) return;
  G.profile.bestiary = [...(G.profile.bestiary ?? []), kind];
  toast(`📖 New journal entry: ${label}`, 3);
  emit('creature:spotted', kind);
}
export function updateSightings(dt) {
  lookT -= dt;
  if (lookT > 0 || !player.ready) return;
  lookT = LOOK_EVERY;
  for (const e of ents) {
    if (hasSeen(e.kind) || e.pos.distanceTo(player.pos) > GOOD_LOOK) continue;
    if (inView(e.pos.x, e.pos.y + e.def.h * 0.6, e.pos.z)) spotted(e.kind, e.def.label);
  }
}

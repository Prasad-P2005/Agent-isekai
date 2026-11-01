// What makes one more fight worth it: a run of kills in quick succession, and the rhythm of the nights. Every kill in a run is worth more Faith, and a night survived is
// the one thing a death can take away, because it costs nothing but the streak.
import { creative, G } from '../core/state.js';
import { emit, on } from '../core/events.js';
import { isNight } from './beings.js';

const CHAIN_WINDOW = 9; // seconds to land the next kill
export const fervor = { chain: 0, left: 0 };
export function landedKill() { fervor.chain++; fervor.left = CHAIN_WINDOW; }

let wasNight = null, spoiled = false; // spoiled: this night does not count, because the hero fell or slept through it
export const sleptThrough = () => { spoiled = true; };
on('player:died', () => { fervor.chain = 0; fervor.left = 0; spoiled = true; });
export function updateMomentum(dt) {
  if (fervor.left > 0 && (fervor.left -= dt) <= 0) fervor.chain = 0;
  const night = isNight();
  if (night && wasNight === false) { spoiled = false; emit('night:fell'); }
  if (!night && wasNight === true && !spoiled && !creative()) emit('night:survived');
  wasNight = night;
}
export const resetMomentum = () => { wasNight = G.world ? isNight() : null; spoiled = false; fervor.chain = 0; fervor.left = 0; };

// What the Laws in force do to the world. A rule is a multiplier, 1 when nothing bends it, and it comes from two places: what the god has written for the hero and what is
// happening now, which the server sends as G.rules, and the Old Law of the land underfoot, set as the hero walks. Each rule is read in the one place it is decided.
import { G } from './state.js';

let land = null;
export const setLandLaw = effects => { land = effects ?? null; };
export const rule = key => (G.rules?.[key] ?? 1) * (G.rules?.silent ? 1 : land?.[key] ?? 1);
// How many of something a Law's luck comes to: 1.5 is one and a coin toss for a second, and 0.7 is a seven in ten chance of any at all.
export const rolled = luck => Math.floor(luck) + (Math.random() < luck % 1 ? 1 : 0);

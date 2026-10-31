// When a creature leaves the world, on Minecraft's rules: far enough away and it is simply gone; a little way off, with nothing to do for a
// while, it may go at any moment. Unlike Minecraft, nothing goes while the hero is looking at it. Residents are not decided here: people.js
// spawns and removes them as the player moves.
const HARD_RANGE = 128, DAWN_RANGE = 24, IDLE_BEFORE = 20; // seconds with the hero far off and nothing to fight
export const IDLE_FROM = 40; // blocks from the hero
const SOFT_CHANCE = 1 / 600, DAWN_CHANCE = 1 / 300, OFF_DUTY_GRACE = 8; // per step, at 60 a second: about ten and five seconds

// The law's own stop when their job is done, and walk off rather than vanish.
export function offDuty(e, { wanted, bounty }) {
  const D = e.def;
  return (D.lawful && !D.friendly && wanted <= 0) || (!!D.hunter && bounty <= 0);
}
export function despawns(e, c) {
  if (e.reportT > 0 || e.res) return false; // nobody slips out of the world on their way to report you
  if (c.dist > HARD_RANGE) return true;
  if (offDuty(e, c)) return e.offT > OFF_DUTY_GRACE || !c.seen();
  if (e.home || e.named) return false;
  if (e.nocturnal && !c.night && c.dist > DAWN_RANGE && c.roll < DAWN_CHANCE && !c.seen() && c.underSky()) return true; // daylight thins the monsters out
  return c.dist > IDLE_FROM && e.idleT > IDLE_BEFORE && c.roll < SOFT_CHANCE && !c.seen();
}

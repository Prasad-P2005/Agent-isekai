// When a creature leaves the world. Residents are not decided here: people.js spawns and removes them as the player moves.
const FAR_AWAY = 130, MONSTER_FADE_RANGE = 28, GOLEM_LEASH = 12, MONSTER_FADE_CHANCE = 0.002;

export function despawns(e, { dist, night, wanted, bounty, roll }) {
  const D = e.def;
  if (e.reportT > 0) return false; // nobody slips out of the world on their way to report you
  if (!e.res && dist > FAR_AWAY) return true;
  if (!e.res && e.natural && !D.friendly && !night && dist > MONSTER_FADE_RANGE && roll < MONSTER_FADE_CHANCE) return true; // daylight thins the monsters out
  if (D.lawful && !D.friendly && wanted <= 0 && dist > GOLEM_LEASH) return true; // golems go home
  return !!D.hunter && bounty <= 0;
}

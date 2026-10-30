// Block types, from content/blocks.json: colours for top / side / bottom faces, and how each block behaves.
import { BLOCKS } from '../core/content.js';

const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
export const BL = [];
for (const b of BLOCKS) {
  const top = rgb(b.top), side = b.side ? rgb(b.side) : top, bot = b.bot ? rgb(b.bot) : side;
  BL[b.id] = { ...b, top, side, bot };
}
const idOf = name => BLOCKS.find(b => b.name === name).id;
export const AIR = idOf('Air'), WATER = idOf('Water'), GLASS = idOf('Glass'), BEDROCK = idOf('Bedrock'), MAGMA = idOf('Magma');

export const solid = id => id !== AIR && id !== WATER;
// seconds to break by hand (a pickaxe divides this); Infinity = unbreakable
export const hardness = id => (BL[id].unbreakable ? Infinity : BL[id].hardness ?? 1);
// what you get when a block breaks
export function dropOf(id) {
  const { drop, drop_chance: chance } = BL[id];
  if (chance != null) return Math.random() < chance ? id : 0; // leaves sometimes
  return drop ?? id;
}
export const GROUND = new Set(BLOCKS.filter(b => b.ground).map(b => b.id));
// blocks that belong to buildings: breaking them inside a city is vandalism
export const BUILT = new Set(BLOCKS.filter(b => b.built).map(b => b.id));

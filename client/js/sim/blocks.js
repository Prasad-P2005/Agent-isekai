// Block types, from content/blocks.json: colours for the maps, textures and shapes for the world, and how each block behaves.
import { BLOCKS } from '../core/content.js';

const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
export const BL = [];
for (const b of BLOCKS) {
  const top = rgb(b.top), side = b.side ? rgb(b.side) : top, bot = b.bot ? rgb(b.bot) : side;
  BL[b.id] = { ...b, top, side, bot };
}
// By name without its spaces: ID.OakLog, ID.StoneBricks.
export const ID = Object.fromEntries(BLOCKS.map(b => [b.name.replace(/\W/g, ''), b.id]));
export const AIR = ID.Air, WATER = ID.Water, GLASS = ID.Glass, BEDROCK = ID.Bedrock, MAGMA = ID.Magma;

const table = pick => Uint8Array.from({ length: 256 }, (_, id) => (BL[id] ? pick(BL[id], id) : 0));
const isCube = b => !b.shape && !b.transparent && !b.cutout;
const ROOFING = /^(stairs|slab)/; // no cube, but no daylight gets through a roof either
const SOLID = table((b, id) => id !== AIR && id !== WATER && !b.passable);
// What light does at each block: OPAQUE stops it dead, DIM is how much it loses passing through, EMIT is what a block gives off.
export const OPAQUE = table((b, id) => id !== AIR && isCube(b));
export const DIM = table((b, id) => (id === WATER ? 1 : id !== AIR && (isCube(b) || ROOFING.test(b.shape)) ? 15 : b.dim ?? 0));
export const EMIT = table(b => b.emit ?? 0);

export const solid = id => SOLID[id] === 1;
export const pickable = id => id !== AIR && id !== WATER;
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

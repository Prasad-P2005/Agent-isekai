// What the mesher is told. It runs on workers and knows nothing of the game, so the block tables go to it as plain numbers, and each job is a copy of the blocks it needs.
import { settings } from '../core/settings.js';
import { AIR, BL, DIM, EMIT, ID, OPAQUE, WATER, WET } from '../sim/blocks.js';
import { LIGHT_REACH, chunks } from '../sim/chunks.js';
import { CS, H, chunkKey as key } from '../sim/terrain.js';
import { tileIndex } from './blocktex.js';
import { CUTOUT_LAYER, FLAG, GLASS_LAYER, SOLID_LAYER, WATER_LAYER } from './mesher.js';

const SHAPES = { // boxes in sixteenths of a block: [x0, y0, z0, x1, y1, z1]
  slab: [[0, 0, 0, 16, 8, 16]],
  carpet: [[0, 0, 0, 16, 1, 16]],
  layer: [[0, 0, 0, 16, 3, 16]],
  torch: [[7, 0, 7, 9, 11, 9]],
  lantern: [[5, 2, 5, 11, 11, 11], [6, 11, 6, 10, 12, 10], [7, 12, 7, 9, 16, 9]],
  crystal_tip: [[3, 0, 3, 13, 5, 13], [5, 5, 5, 11, 10, 11], [7, 10, 7, 9, 16, 9]],
  chest: [[1, 0, 1, 15, 14, 15]],
  anvil: [[2, 0, 2, 14, 3, 14], [4, 3, 5, 12, 5, 11], [5, 5, 6, 11, 9, 10], [1, 9, 4, 15, 15, 12]],
  stairs_n: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 16, 16, 8]],
  stairs_s: [[0, 0, 0, 16, 8, 16], [0, 8, 8, 16, 16, 16]],
  stairs_e: [[0, 0, 0, 16, 8, 16], [8, 8, 0, 16, 16, 16]],
  stairs_w: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 8, 16, 16]],
};
const SWAY = { leaves: 0.34, plant: 0.67, kelp: 1 };
const LAMP_COLOUR = [1, 0.8, 0.52]; // for a light that names none
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
function lookOf(b, id) {
  const tex = [].concat(b.tex ?? []), tiles = [tex[0], tex[1] ?? tex[0], tex[2] ?? tex[1] ?? tex[0]].map(name => tileIndex(name));
  const leaf = !!b.cutout && !b.shape, fast = leaf && !settings.leaves;
  return {
    tiles, tint: b.tint === 'grass' ? 1 : b.tint === 'leaves' ? 2 : 0, sway: fast ? 0 : Math.round((SWAY[b.sway] ?? 0) * 255), glow: Math.round((b.glow ?? 0) * 255), spin: !!b.spin, passable: !!b.passable,
    layer: id === WATER ? WATER_LAYER : b.transparent ? GLASS_LAYER : b.cutout && !fast ? CUTOUT_LAYER : SOLID_LAYER,
    cross: b.shape === 'cross', fence: b.shape === 'fence', boxes: SHAPES[b.shape] ?? null, foliage: leaf, flags: (leaf ? FLAG.FOLIAGE : 0) | (fast ? FLAG.SOLID_LEAF : 0),
  };
}
// Under water the sky fades in the shader, by depth: light levels would drop a whole step a block, and the sea bed would go black.
export function meshTables() {
  const dim = DIM.slice(), channel = i => Uint8Array.from(EMIT, (level, id) => { const c = BL[id]?.light ? hex(BL[id].light) : LAMP_COLOUR; return Math.round(level * c[i]); });
  for (let id = 0; id < 256; id++) if (WET[id]) dim[id] = 0;
  return { CS, H, MARGIN: LIGHT_REACH, AIR, WATER, FENCE: ID.Fence, OPAQUE, DIM: dim, EMIT, RED: channel(0), GREEN: channel(1), BLUE: channel(2), WET, SMOOTH: !!settings.smoothLight, LOOK: BL.map(lookOf) };
}

const MARGIN = LIGHT_REACH, W = CS + 2 * MARGIN, AREA = W * W;
// Copies a chunk and a margin of its neighbours into `vol`, and says how high anything goes.
export function gather(ch, vol) {
  let top = 0;
  for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) {
    const c = chunks.get(key(ch.cx + nx, ch.cz + nz));
    if (c.top > top) top = c.top;
  }
  top = Math.min(top + 1, H - 2);
  for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) {
    const { d } = chunks.get(key(ch.cx + nx, ch.cz + nz));
    const x0 = nx < 0 ? CS - MARGIN : 0, x1 = nx > 0 ? MARGIN : CS, z0 = nz < 0 ? CS - MARGIN : 0, z1 = nz > 0 ? MARGIN : CS;
    const shiftX = nx * CS + MARGIN, shiftZ = (nz * CS + MARGIN) * W;
    for (let y = 0; y <= top; y++) {
      const from = y * CS * CS, to = y * AREA + shiftZ;
      for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) vol[to + z * W + x + shiftX] = d[from + z * CS + x];
    }
  }
  vol.fill(AIR, (top + 1) * AREA); // the volume is used again, and what was above this last time must not count
  return top;
}

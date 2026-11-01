// Blocks that are not whole cubes, as boxes in sixteenths of a block: [x0, y0, z0, x1, y1, z1]. The mesher builds the world from these, and the hand holds them.
export const SHAPES = {
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

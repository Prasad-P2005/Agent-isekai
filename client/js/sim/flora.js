// What grows: every tree and shrub of every realm. Each one is drawn through `set`, so a tree on a chunk's edge
// is finished by the chunk next door. Leaves are `soft` (true), so they never eat a neighbour's trunk.
import { ID } from './blocks.js';

const {
  OakLog, OakLeaves, BirchLog, BirchLeaves, SpruceLog, SpruceLeaves, PalmLog, PalmLeaves, AcaciaLeaves, Elderwood, ElvenLeaves, Glowshroom, GlowVine,
  Planks, Glass, Lantern, Blackstone, Cactus, Stone, MushroomCap, MossyCobblestone, Moss, Air,
} = ID;
const trunk = (x, y, z, n, id, set) => { for (let i = 0; i < n; i++) set(x, y + i, z, id); };

export function blob(set, cx, cy, cz, rx, ry, rz, id, r) {
  for (let dx = -rx; dx <= rx; dx++) for (let dy = -ry; dy <= ry; dy++) for (let dz = -rz; dz <= rz; dz++) {
    const d = (dx * dx) / (rx * rx + .5) + (dy * dy) / (ry * ry + .5) + (dz * dz) / (rz * rz + .5);
    if (d <= 1 && (d < 0.7 || r() > 0.3)) set(cx + dx, cy + dy, cz + dz, id, true);
  }
}
// The classic crown: two broad layers with nibbled corners under two narrow ones.
function crown(x, y, z, leaf, set, r, wide = 2) {
  for (let dy = -2; dy <= 1; dy++) {
    const reach = dy < 0 ? wide : wide - 1;
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
      const corner = Math.abs(dx) === reach && Math.abs(dz) === reach;
      if (!corner || (dy < 1 && r() < 0.5)) set(x + dx, y + dy, z + dz, leaf, true);
    }
  }
}
export function oak(x, y, z, set, r) {
  const th = 4 + Math.floor(r() * 3);
  crown(x, y + th, z, OakLeaves, set, r);
  trunk(x, y, z, th, OakLog, set);
}
// One old oak in a dozen: boughs reaching out, each with its own crown.
export function greatOak(x, y, z, set, r) {
  const th = 7 + Math.floor(r() * 3);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const bough = th - 2 - Math.floor(r() * 3);
    set(x + dx, y + bough, z + dz, OakLog); set(x + dx * 2, y + bough + 1, z + dz * 2, OakLog); set(x + dx * 3, y + bough + 1, z + dz * 3, OakLog);
    blob(set, x + dx * 3, y + bough + 2, z + dz * 3, 3, 2, 3, OakLeaves, r);
  }
  blob(set, x, y + th + 1, z, 3, 2, 3, OakLeaves, r);
  trunk(x, y, z, th + 1, OakLog, set);
}
export function birch(x, y, z, set, r) {
  const th = 5 + Math.floor(r() * 3);
  crown(x, y + th, z, BirchLeaves, set, r);
  trunk(x, y, z, th, BirchLog, set);
}
export function spruce(x, y, z, set, r) {
  const th = 7 + Math.floor(r() * 5);
  for (let dy = th + 1; dy >= 2; dy--) { // skirts: each tier a little wider than the last, with a narrow one between
    const down = th + 1 - dy, reach = Math.max(0, Math.min(3, Math.ceil(down / 2.5)) - (down % 2 ? 0 : 1));
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) if (Math.abs(dx) + Math.abs(dz) <= reach + 1) set(x + dx, y + dy, z + dz, SpruceLeaves, true);
  }
  set(x, y + th + 2, z, SpruceLeaves, true);
  trunk(x, y, z, th, SpruceLog, set);
}
export function palm(x, y, z, set, r) {
  const th = 6 + Math.floor(r() * 3), ox = r() < 0.5 ? 1 : -1, oz = r() < 0.5 ? 1 : -1;
  let px = x, pz = z;
  for (let i = 0; i < th; i++) { // leans further the higher it gets
    set(px, y + i, pz, PalmLog);
    if (i === th >> 1) px += ox;
    if (i === th - 2) pz += oz;
  }
  const top = y + th;
  set(px, top, pz, PalmLeaves, true);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const n = dx && dz ? 2 : 3;
    for (let k = 1; k <= n; k++) set(px + dx * k, top - (k > 1 ? 1 : 0), pz + dz * k, PalmLeaves, true);
    set(px + dx * (n + 1), top - 2, pz + dz * (n + 1), PalmLeaves, true);
  }
}
export function acacia(x, y, z, set, r) {
  const th = 4 + Math.floor(r() * 2), ox = r() < 0.5 ? 1 : -1, oz = r() < 0.5 ? 1 : -1;
  trunk(x, y, z, th, OakLog, set);
  set(x + ox, y + th, z + oz, OakLog); set(x + 2 * ox, y + th + 1, z + 2 * oz, OakLog);
  const cx = x + 2 * ox, cy = y + th + 2, cz = z + 2 * oz;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = dx * dx + dz * dz;
    if (d <= 10) set(cx + dx, cy, cz + dz, AcaciaLeaves, true);
    if (d <= 3) set(cx + dx, cy + 1, cz + dz, AcaciaLeaves, true);
  }
}
// Fat as a house and barely taller, with a flat fan of a crown: the Wilds' great landmark tree.
export function baobab(x, y, z, set, r) {
  const th = 6 + Math.floor(r() * 3);
  for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) trunk(x + dx, y - 1, z + dz, th + 1, OakLog, set);
  for (const [dx, dz] of [[-1, 0], [2, 1], [1, -1], [0, 2]]) trunk(x + dx, y, z + dz, 2 + Math.floor(r() * 3), OakLog, set);
  for (const [dx, dz] of [[3, 0], [-2, 1], [1, 3], [0, -2]]) {
    set(x + Math.sign(dx), y + th, z + Math.sign(dz), OakLog); set(x + dx, y + th + 1, z + dz, OakLog);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (a * a + b * b < 6) set(x + dx + a, y + th + 2, z + dz + b, AcaciaLeaves, true);
  }
}
export function elfTree(x, y, z, set, r) {
  const th = 8 + Math.floor(r() * 5);
  blob(set, x, y + th, z, 3, 3, 3, ElvenLeaves, r); blob(set, x, y + th - 3, z, 2, 1, 2, ElvenLeaves, r);
  trunk(x, y, z, th, Elderwood, set);
  for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { // pale vines trail from the lowest leaves
    if (r() < 0.6) { const drop = 1 + Math.floor(r() * 3); for (let i = 1; i <= drop; i++) set(x + dx, y + th - 2 - i, z + dz, GlowVine, true); }
  }
  if (r() < 0.5) set(x + 2, y + th - 4, z, Lantern, true);
  if (r() < 0.5) set(x - 2, y + th - 4, z, Lantern, true);
}
const STAIR = [[3, -2], [3, -1], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3]];
export function giantTree(x, y, z, set, r) {
  const th = 20 + Math.floor(r() * 5), py = y + 9;
  for (let dx = -5; dx <= 6; dx++) for (let dz = -5; dz <= 6; dz++) {
    const d = Math.hypot(dx - 0.5, dz - 0.5);
    if (d < 5.6) set(x + dx, py, z + dz, Planks);
    if (d >= 4.8 && d < 5.6 && (dx + dz) % 2 === 0) set(x + dx, py + 1, z + dz, Elderwood);
  }
  for (const [dx, dz] of [[-4, 0], [5, 1], [1, -4], [0, 5]]) { set(x + dx, py + 1, z + dz, Elderwood); set(x + dx, py + 2, z + dz, Lantern); }
  for (let dx = 2; dx <= 4; dx++) for (let dz = -3; dz <= -1; dz++) for (let dy = 1; dy <= 3; dy++) {
    const edge = dx === 2 || dx === 4 || dz === -3 || dz === -1;
    set(x + dx, py + dy, z + dz, dy === 3 ? ElvenLeaves : edge ? (dy === 2 ? Glass : Elderwood) : Air);
  }
  blob(set, x, y + th, z, 6, 4, 6, ElvenLeaves, r); blob(set, x + 3, y + th - 6, z - 2, 3, 2, 3, ElvenLeaves, r); blob(set, x - 3, y + th - 8, z + 3, 3, 2, 3, ElvenLeaves, r);
  for (let i = -1; i < th; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y + i, z + dz, Elderwood);
  for (const [dx, dz] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) { set(x + dx, y, z + dz, Elderwood); set(x + dx, y - 1, z + dz, Elderwood); }
  // Steps wind up the trunk and come out through the platform.
  STAIR.forEach(([dx, dz], i) => { set(x + dx, y + i, z + dz, Planks); if (i >= 6) { set(x + dx, py, z + dz, Air); set(x + dx, py + 1, z + dz, Air); } });
  for (let i = 0; i < 5; i++) set(x + Math.floor(r() * 9) - 4, y, z + Math.floor(r() * 9) - 4, Glowshroom, true);
}
// A mushroom the size of a tree, its cap lighting the forest floor beneath it.
export function giantMushroom(x, y, z, set, r) {
  const th = 5 + Math.floor(r() * 4), reach = 3;
  trunk(x, y, z, th, Elderwood, set);
  for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
    const d = Math.hypot(dx, dz);
    if (d <= reach + 0.4) set(x + dx, y + th, z + dz, MushroomCap);
    if (d <= reach - 1) set(x + dx, y + th + 1, z + dz, MushroomCap);
    if (d > reach - 0.6 && d <= reach + 0.4) set(x + dx, y + th - 1, z + dz, MushroomCap);
  }
}
export function deadTree(x, y, z, set, r, wood = Blackstone) {
  const n = 3 + Math.floor(r() * 4);
  trunk(x, y, z, n, wood, set);
  set(x + 1, y + n - 1, z, wood); set(x - 1, y + n - 2, z, wood); set(x, y + n - 1, z + 1, wood);
}
export function cactus(x, y, z, set, r) {
  const n = 2 + Math.floor(r() * 3);
  trunk(x, y, z, n, Cactus, set);
  if (n > 2 && r() < 0.5) { set(x + 1, y + 1, z, Cactus); set(x + 1, y + 2, z, Cactus); }
}
export function bush(x, y, z, leaf, set, r) {
  set(x, y, z, leaf, true);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (r() < 0.7) set(x + dx, y, z + dz, leaf, true);
  if (r() < 0.5) set(x, y + 1, z, leaf, true);
}
export function fallenLog(x, y, z, wood, set, r) {
  const n = 4 + Math.floor(r() * 3), along = r() < 0.5;
  for (let i = 0; i < n; i++) {
    set(along ? x + i : x, y, along ? z : z + i, wood);
    if (r() < 0.3) set(along ? x + i : x, y + 1, along ? z : z + i, Moss, true);
  }
}
export function boulder(x, y, z, set, r) {
  blob(set, x, y, z, 2, 1 + Math.floor(r() * 2), 2, r() < 0.4 ? MossyCobblestone : Stone, r);
}

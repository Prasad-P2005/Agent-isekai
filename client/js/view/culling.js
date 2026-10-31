// What can be seen from where the eye is, worked out the way block games do it: Tommo's "advanced cave culling", which Minecraft and Sodium both use. No imports, so that
// a worker can run the first half and the tests can run all of it.
//
// A world is cut into sections, 16 blocks each way. When a chunk is meshed, a flood fill through each section's open blocks records which of its six faces can reach which.
// Then each frame a walk starts from the section the eye is in and spreads from section to section, through a face only if the section it entered can get there.
//
// The rule that matters is that culling may draw too much but must never hide what can be seen. The walk keeps it by following what a sight line can do:
// - A straight line never turns back along an axis, so the walk only moves outward from the eye, on each axis separately. This is what stops it creeping round corners.
// - A line inside the view stays inside it, because the view is convex with the eye at its point. So a section out of view need not be walked through. Near is left out,
//   because the first stretch of every line is in front of the near plane.
// - A section can be entered through several faces, and each opens different exits, so it is walked again when a new one arrives. Visiting each section once would hide things.

export const SECTION = 16;
export const ALL_FACES = 63; // +x, -x, +y, -y, +z, -z, in the order of the mesher's faces
const STEP_X = [1, -1, 0, 0, 0, 0], STEP_Y = [0, 0, 1, -1, 0, 0], STEP_Z = [0, 0, 0, 0, 1, -1], BACK = [1, 0, 3, 2, 5, 4];
const LAST = SECTION - 1, CELLS = SECTION ** 3, GROWN = 1; // what is drawn in a section can lean this far out of it: plants sway, and tall grass overhangs
const MID = SECTION / 2, COLUMN_REACH = MID * Math.SQRT2 + GROWN;

// ---------- which faces of a section can reach which ----------
const filled = new Uint8Array(CELLS), stack = new Int16Array(CELLS);
// `origin` is where the section starts in `vol`, and the steps are how far one block along each axis is. Writes six masks into `out`: for each face, the faces it reaches.
export function linkSection(vol, opaque, origin, stepX, stepY, stepZ, out, at) {
  out.fill(0, at, at + 6);
  filled.fill(0);
  const at_ = (x, y, z) => origin + x * stepX + y * stepY + z * stepZ;
  for (let start = 0; start < CELLS; start++) {
    if (filled[start]) continue;
    filled[start] = 1;
    if (opaque[vol[at_(start & LAST, start >> 8, (start >> 4) & LAST)]]) continue;
    let top = 0, faces = 0;
    stack[top++] = start;
    while (top) {
      const c = stack[--top], x = c & LAST, z = (c >> 4) & LAST, y = c >> 8;
      for (let d = 0; d < 6; d++) {
        const nx = x + STEP_X[d], ny = y + STEP_Y[d], nz = z + STEP_Z[d];
        if (nx < 0 || nx > LAST || ny < 0 || ny > LAST || nz < 0 || nz > LAST) { faces |= 1 << d; continue; }
        const n = nx + (nz << 4) + (ny << 8);
        if (filled[n]) continue;
        filled[n] = 1; // a wall only needs looking at once
        if (!opaque[vol[at_(nx, ny, nz)]]) stack[top++] = n;
      }
    }
    for (let d = 0; d < 6; d++) if (faces & (1 << d)) out[at + d] |= faces;
  }
}
// The sections of a mesh, as one bit each.
export function sectionsOf(low, high) {
  let mask = 0;
  for (let s = Math.floor(low / SECTION); s <= Math.floor(high / SECTION); s++) mask |= 1 << s;
  return mask;
}

// ---------- the view ----------
// The four sides of the view from a projection times view matrix, as [a, b, c, d] with a point inside when ax + by + cz + d >= 0 (Gribb and Hartmann).
export function sidePlanes(m, out) {
  const row = (i, sign, k) => { for (let j = 0; j < 4; j++) out[k + j] = m[3 + j * 4] + sign * m[i + j * 4]; };
  row(0, 1, 0); row(0, -1, 4); row(1, 1, 8); row(1, -1, 12);
  return out;
}
// A box is only out if its corner furthest along a plane's normal is behind it. That lets through a few boxes near the view's corners, which costs a little and hides nothing.
export function boxInView(p, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 16; i += 4) {
    const a = p[i], b = p[i + 1], c = p[i + 2];
    if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + p[i + 3] < 0) return false;
  }
  return true;
}

// ---------- the walk ----------
let entered, walked, waiting, looked, queue, room = 0;
function clear(n) {
  if (n > room) {
    room = n;
    entered = new Uint8Array(n); walked = new Uint8Array(n); waiting = new Uint8Array(n); looked = new Uint8Array(n);
    queue = new Int32Array(n * 7); // each section can be queued once for each face, and once more for the eye
    return;
  }
  entered.fill(0, 0, n); walked.fill(0, 0, n); waiting.fill(0, 0, n); looked.fill(0, 0, n);
}
// `grid` holds a square of columns around the eye, `reach` of them each way: each is its links, or null if nothing is known about it, which counts as open. `limit` is how far
// anything can be seen. Marks `seen` with one mask of sections for each column.
export function walkSight(grid, reach, rows, eyeX, eyeY, eyeZ, planes, limit, seen) {
  const across = reach * 2 + 1, layer = across * across, cx = Math.floor(eyeX / SECTION), cz = Math.floor(eyeZ / SECTION), cy = Math.max(0, Math.min(rows - 1, Math.floor(eyeY / SECTION)));
  const far = (limit + COLUMN_REACH) ** 2, start = reach + reach * across + cy * layer;
  clear(layer * rows);
  seen.fill(0, 0, layer);
  let head = 0, tail = 0;
  queue[tail++] = start; waiting[start] = 1;
  while (head < tail) {
    const s = queue[head++], y = Math.floor(s / layer), column = s - y * layer, ix = column % across, iz = Math.floor(column / across), dx = ix - reach, dz = iz - reach, dy = y - cy;
    waiting[s] = 0;
    seen[column] |= 1 << y;
    const fresh = entered[s] & ~walked[s], links = grid[column];
    walked[s] |= fresh;
    let exits = ALL_FACES; // out of the eye's own section, any way at all
    if (s !== start && links) {
      exits = 0;
      for (let f = 0; f < 6; f++) if (fresh & (1 << f)) exits |= links[y * 6 + f];
    }
    if (dx > 0) exits &= ~2; if (dx < 0) exits &= ~1;
    if (dy > 0) exits &= ~8; if (dy < 0) exits &= ~4;
    if (dz > 0) exits &= ~32; if (dz < 0) exits &= ~16;
    for (let d = 0; d < 6; d++) {
      if (!(exits & (1 << d))) continue;
      const nx = ix + STEP_X[d], ny = y + STEP_Y[d], nz = iz + STEP_Z[d];
      if (nx < 0 || nx >= across || nz < 0 || nz >= across || ny < 0 || ny >= rows) continue;
      const n = nx + nz * across + ny * layer, by = 1 << BACK[d];
      if (entered[n] & by) continue;
      if (!looked[n]) {
        const x0 = (cx + nx - reach) * SECTION, z0 = (cz + nz - reach) * SECTION, y0 = ny * SECTION;
        const away = (x0 + MID - eyeX) ** 2 + (z0 + MID - eyeZ) ** 2;
        looked[n] = away <= far && boxInView(planes, x0 - GROWN, y0 - GROWN, z0 - GROWN, x0 + SECTION + GROWN, y0 + SECTION + GROWN, z0 + SECTION + GROWN) ? 1 : 2;
      }
      if (looked[n] === 2) continue;
      entered[n] |= by;
      if (!waiting[n]) { waiting[n] = 1; queue[tail++] = n; }
    }
  }
}

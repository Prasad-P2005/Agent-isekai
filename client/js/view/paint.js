// What surfaces look like, in big pixels, the way a Minecraft skin is painted. Each colour is a ramp of seven tones, and a
// surface is shaded by hand-sized clusters of them: lighter on top, darker at the foot, with soft blotches so that no area is
// flat. A paint is a function from a pixel of a box's face to a colour, or to -1 for a hole, so that a cape can tear.
export const INK = 0x3f2029, CREAM = 0xfff1df;

export function mixHex(a, b, t) {
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
const TONES = [0.56, 0.42, 0.28, 0.14, 0, -0.14, -0.3], BASE = 4; // towards the ink for shadow, towards cream for light
const ramps = new Map();
function ramp(c) {
  let r = ramps.get(c);
  if (!r) ramps.set(c, r = TONES.map(k => (k >= 0 ? mixHex(c, INK, k) : mixHex(c, CREAM, -k))));
  return r;
}
export const hash = (i, j, s = 0) => {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// The light on a box: from above and to the left, with its edges turning away so that a block reads as having volume.
const FACE_LIGHT = { top: 1.3, bottom: -2.2, front: 0, back: -0.6, left: 0.1, right: -0.9 };
function form(i, j, W, H, face) {
  let t = FACE_LIGHT[face];
  if (face !== 'top' && face !== 'bottom' && H > 2) t += (0.5 - j / (H - 1)) * 1.3;
  if (H > 3) t += j === 0 ? 0.6 : j === H - 1 ? -0.9 : 0;
  if (W > 3) t += i === 0 ? 0.2 : i === W - 1 ? -0.7 : 0;
  return t;
}
// `draw` puts marks on faces: { all, side, front, back, top, bottom }, each a list of [x, y, width, height, colour]. Marks are
// shaded like everything else. A negative x or y counts from the far edge, and a width or height of 0 means the whole way across.
function opsFor(draw) {
  if (!draw) return null;
  const faces = {};
  for (const f of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
    const side = f === 'left' || f === 'right' ? draw.side || [] : [], round = f === 'top' || f === 'bottom' ? [] : draw.all || [];
    faces[f] = [...round, ...side, ...(draw[f] || [])];
  }
  return faces;
}
function surface(c, grain, { draw, cut } = {}) {
  const seed = c % 9973, ops = opsFor(draw);
  return (i, j, W, H, face) => {
    if (cut?.(i, j, W, H, face)) return -1;
    let color = c;
    const list = ops?.[face];
    if (list) for (let n = list.length - 1; n >= 0; n--) {
      const [ox, oy, ow, oh, oc] = list[n], x = ox < 0 ? W + ox : ox, y = oy < 0 ? H + oy : oy;
      if (i >= x && i < x + (ow || W) && j >= y && j < y + (oh || H)) { color = oc; break; }
    }
    const t = form(i, j, W, H, face) + grain(i, j, W, H, face, seed) * (color === c ? 1 : 0.6);
    return ramp(color)[Math.max(0, Math.min(6, Math.round(t) + BASE))];
  };
}
// Soft blotches two pixels across, with a little single-pixel texture on top.
const blotch = (i, j, s, big, small) => (hash(i >> 1, j >> 1, s) - 0.5) * big + (hash(i, j, s + 1) - 0.5) * small;

// ---------------- materials ----------------
export const plain = (c, o) => surface(c, (i, j, W, H, f, s) => blotch(i, j, s, 0.8, 0.5), o);
export const flesh = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, j, s) - 0.5) * 0.5, o);
export const cloth = (c, o) => surface(c, (i, j, W, H, f, s) => blotch(i, j, s, 1, 0.5), o);
export const leather = (c, o) => surface(c, (i, j, W, H, f, s) => blotch(i, j, s, 1.4, 0.6), o);
export const wood = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, j >> 2, s) - 0.5) * 1.6, o);
export const fur = (c, o) => surface(c, (i, j, W, H, f, s) => blotch(i, j, s, 1.2, 1.5), o);
// Long folds down the fall of the cloth, for capes and robes.
export const drape = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, 0, s) - 0.5) * 2 + (hash(i, j >> 2, s + 1) - 0.5) * 0.5, o);
// Bright along its top left and dark at its foot, with a catch of light: armour is the one thing here that shines.
export const metal = (c, o) => surface(c, (i, j, W, H, f, s) => (i < 2 && j < 2 ? 1.2 : 0) + (i + j === 3 ? 0.9 : 0) + blotch(i, j, s, 0.8, 0.4), o);
export const hair = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, 0, s) - 0.5) * 1.8 + (hash(i, j >> 1, s + 1) - 0.5) * 1.5, o);
export const stone = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i >> 1, j >> 1, s) - 0.5) * 2 + (hash(i, j, s + 1) - 0.5) * 0.8 - (((i + (j >> 2 & 1) * 3) % 6 === 5 || j % 4 === 3) ? 0.9 : 0), o);
// Broad scales in offset rows, each dark along one edge and its foot.
export const scales = (c, o) => surface(c, (i, j, W, H, f, s) => {
  const row = j >> 1, x = i + (row & 1) * 2;
  return (x % 4 === 3 ? -0.6 : 0) + (j & 1 ? -0.3 : 0.2) + (hash(x >> 2, row, s) - 0.5) * 0.7;
}, o);
export const plates = (c, o) => surface(c, (i, j, W, H, f, s) => (j % 4 === 3 ? -1.4 : 0.2) + (hash(i, j, s) - 0.5) * 0.6, o);

// ---------------- helpers for `draw` and `cut` ----------------
// The same mark on both sides of the middle.
export const both = (x, y, w, h, c) => [[x, y, w, h, c], [-x - w, y, w, h, c]];
// Eats into the bottom edge at random depths, a pixel at a time: the torn hem of a cape.
export const torn = (depth, seed = 1) => (i, j, W, H, f) => f !== 'top' && j >= H - Math.floor(hash(i, 0, seed) * (depth + 1));

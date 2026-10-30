// What surfaces look like, one art pixel at a time. A paint is a function from a pixel of a box's face to a colour, or to
// -1 for a hole, so that a cape can tear and a hairline can show the face behind it. Every colour is drawn from a short
// ramp of six tones with warm shadows, which is what keeps a surface reading as pixel art and not as noise.
export const INK = 0x3f2029, CREAM = 0xfff1df;

export function mixHex(a, b, t) {
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
const TONES = [0.66, 0.46, 0.24, 0, -0.2, -0.42]; // towards the ink for shadow, towards cream for light
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

// The light on a box, from above and to the left, with a bevel along its edges so that each piece stands out from the next.
const FACE_LIGHT = { top: 1.2, bottom: -1.8, front: 0, back: -0.5, left: 0.1, right: -0.6 };
function form(i, j, W, H, face, bevel) {
  let t = FACE_LIGHT[face];
  if (face !== 'top' && face !== 'bottom') t += (0.5 - j / H) * 1.1;
  if (H > 3) t += j === 0 ? 0.9 * bevel : j === H - 1 ? -1.1 * bevel : 0;
  if (W > 3) t += i === 0 ? 0.3 * bevel : i === W - 1 ? -0.6 * bevel : 0;
  return t;
}

// `draw` paints detail on faces: { all, side, front, back, top, bottom }, each a list of [x, y, width, height, colour].
// A negative x or y counts from the far edge, and a width or height of 0 means the whole way across.
function opsFor(draw) {
  if (!draw) return null;
  const faces = {};
  for (const f of ['front', 'back', 'left', 'right', 'top', 'bottom']) {
    const side = f === 'left' || f === 'right' ? draw.side || [] : [], round = f === 'top' || f === 'bottom' ? [] : draw.all || [];
    faces[f] = [...round, ...side, ...(draw[f] || [])];
  }
  return faces;
}
function surface(c, grain, { draw, cut, bevel = 1 } = {}) {
  const seed = c % 9973, ops = opsFor(draw);
  return (i, j, W, H, face) => {
    if (cut?.(i, j, W, H, face)) return -1;
    let color = c;
    const list = ops?.[face];
    if (list) for (let n = list.length - 1; n >= 0; n--) {
      const [ox, oy, ow, oh, oc] = list[n], x = ox < 0 ? W + ox : ox, y = oy < 0 ? H + oy : oy;
      if (i >= x && i < x + (ow || W) && j >= y && j < y + (oh || H)) { color = oc; break; }
    }
    const t = form(i, j, W, H, face, bevel) + grain(i, j, W, H, face, seed) * (color === c ? 1 : 0.35);
    return ramp(color)[Math.max(0, Math.min(5, Math.round(t) + 3))];
  };
}

// ---------------- materials ----------------
export const plain = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, j, s) - 0.5) * 0.5, o);
export const cloth = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i >> 1, 0, s) - 0.5) * 1.5 + (hash(i, j >> 2, s + 1) - 0.5) * 0.8, o);
export const flesh = (c, o) => surface(c, () => 0, { bevel: 0.5, ...o });
export const leather = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i >> 1, j >> 1, s) - 0.5) * 1.4 - ((i === 1 || i === W - 2) && j % 3 === 0 ? 1 : 0), o);
export const wood = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, j >> 3, s) - 0.5) * 1.5, { bevel: 0.6, ...o });
// A hard shine that runs across the plate, and a dark edge so that one plate reads against another.
export const metal = (c, o) => surface(c, (i, j, W, H, f, s) => ((i + j * 2) % 13 < 2 ? 1.6 : 0) + (hash(i, j, s) - 0.5) * 0.4, { bevel: 1.5, ...o });
export const hair = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, 0, s) - 0.5) * 2 + (f !== 'top' && Math.abs(j / H - 0.3) < 0.1 ? 1.3 : 0), { bevel: 0.5, ...o });
export const fur = (c, o) => surface(c, (i, j, W, H, f, s) => (hash(i, j >> 1, s) - 0.5) * 2.2, { bevel: 0.4, ...o });
export const stone = (c, o) => surface(c, (i, j, W, H, f, s) => {
  const cell = hash(i >> 2, j >> 2, s), seam = (i & 3) === 0 && hash(i >> 2, j >> 2, s + 1) < 0.4 || (j & 3) === 0 && hash(i >> 2, j >> 2, s + 2) < 0.4;
  return (cell - 0.5) * 1.2 + (hash(i, j, s) - 0.5) * 0.5 - (seam ? 1.6 : 0);
}, o);
// Rows of overlapping scales, each lit at the top and dark along its lower lip.
export const scales = (c, o) => surface(c, (i, j, W, H, f, s) => {
  const row = j >> 1, u = (i + (row & 1) * 2) & 3, lip = (j & 1) === 1 && u !== 1;
  return (lip || u === 0 ? -1.3 : 0.5) + (hash(row, (i + (row & 1) * 2) >> 2, s) - 0.5) * 1.1;
}, { bevel: 0.5, ...o });
// The broad plates along a belly, in bands across the body.
export const plates = (c, o) => surface(c, (i, j, W, H, f, s) => (j % 5 === 4 ? -2 : j % 5 === 0 ? 0.8 : 0) + (hash(i, j >> 2, s) - 0.5) * 0.4, { bevel: 0.5, ...o });

// ---------------- helpers for `draw` and `cut` ----------------
// The same mark on both sides of the middle.
export const both = (x, y, w, h, c) => [[x, y, w, h, c], [-x - w, y, w, h, c]];
// Stands up from a line of a face at random heights: the torn hem of a cape.
export const torn = (depth, seed = 1) => (i, j, W, H, f) => f !== 'top' && j >= H - 1 - Math.floor(hash(i >> 1, 0, seed) * depth);

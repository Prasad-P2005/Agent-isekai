// What the hero holds and where it sits in the view. The arm, the swing and the way each kind of thing is held are Minecraft's own numbers, applied
// in its own order, so the feel is the one people already have in their hands. Nothing here needs three.js or the page, which is what lets
// tools/hand_sheets.mjs draw exactly what the game draws. Positions are in blocks, x right, y up and z towards the viewer, the same as three.js.
import { BL } from '../sim/blocks.js';
import { TILE, tilePixels } from './blocktex.js';
import { ITEM_SIZE, PALETTES, spritePixels } from './itemart.js';
import { cloth, flesh, leather, mixHex, plain, INK } from './paint.js';
import { SHAPES } from './shapes.js';
import { ss } from '../sim/noise.js';

const { sin, cos, sqrt, PI } = Math, RAD = PI / 180;

// A stack of moves, each one inside the last. Column-major, as a Matrix4 reads it.
export class Pose {
  m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  translate(x, y, z) { const m = this.m; for (let i = 0; i < 4; i++) m[12 + i] += m[i] * x + m[4 + i] * y + m[8 + i] * z; return this; }
  rotX(deg) { return this.#turn(deg, 4, 8); }
  rotY(deg) { return this.#turn(deg, 8, 0); }
  rotZ(deg) { return this.#turn(deg, 0, 4); }
  #turn(deg, a, b) {
    const m = this.m, c = cos(deg * RAD), s = sin(deg * RAD);
    for (let i = 0; i < 4; i++) { const u = m[a + i], v = m[b + i]; m[a + i] = u * c + v * s; m[b + i] = v * c - u * s; }
    return this;
  }
  scale(k) { for (let i = 0; i < 12; i++) this.m[i] *= k; return this; }
  apply(x, y, z) { const m = this.m; return [0, 1, 2].map(i => m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i]); }
}

// ---------- the swing ----------
const STILL = [0, 0, 0], ARM_AT = [-0.08, 0.17, -0.04]; // a little higher and further in than Minecraft's, so that the arm reads as an arm and not a stump
// The bare arm. `swing` runs 0 to 1 through a blow, and `equip` 1 is out of sight below the view and 0 is ready. `at` is where sway and the like have carried it.
export function armPose(swing, equip, at = STILL) {
  const root = sqrt(swing), p = new Pose();
  p.translate(at[0] + ARM_AT[0] + 0.64 - 0.3 * sin(root * PI), at[1] + ARM_AT[1] - 0.6 - equip * 0.6 + 0.4 * sin(root * 2 * PI), at[2] + ARM_AT[2] - 0.72 - 0.4 * sin(swing * PI));
  p.rotY(45 + 70 * sin(root * PI)).rotZ(-20 * sin(swing * swing * PI));
  return p.translate(-1, 3.6, 3.5).rotZ(120).rotX(200).rotY(-135).translate(5.6, 0, 0);
}
// Anything in the hand. A `motion` is the item's own way of moving, on top of where it rests: x, y, z, then turns in radians. One with an `arc` also carries the whole thing round a tilted axis, in degrees.
const REST = [0.56, -0.52, -0.72];
export function itemPose(swing, equip, at = STILL, motion = null) {
  const root = sqrt(swing), bite = sin(root * PI), p = new Pose();
  p.translate(at[0] - 0.4 * bite, at[1] + 0.2 * sin(root * 2 * PI), at[2] - 0.2 * sin(swing * PI));
  p.translate(REST[0], REST[1] - 0.6 * equip, REST[2]);
  if (motion?.arc) {
    const { pivot, yaw, turn, wrist, pitch, twist, shift } = motion.arc, [x, y, z] = pivot.map((v, i) => v - REST[i]);
    p.translate(x, y, z).rotY(yaw).rotZ(turn).rotY(-yaw).translate(-x, -y, -z);
    p.translate(...shift).rotZ(wrist).rotX(pitch).rotY(twist);
  } else if (motion) p.translate(motion.x, motion.y, motion.z).rotX(motion.rx / RAD).rotY(motion.ry / RAD).rotZ(motion.rz / RAD);
  return p.rotY(45 - 20 * sin(swing * swing * PI)).rotZ(-20 * bite).rotX(-80 * bite).rotY(-45);
}

// ---------- the cut: how a blade swings ----------
// A cut is a rigid arc round a point below the view, like a wiper: the hilt stays out of sight, since nothing holds it, and the blade stays one size as it crosses. `from` and `to` are the ends of the arc in degrees (positive is to the left, as the viewer sees it) and `yaw` swings the arc's axis from pointing at the eye, at 0, to across the view, at 90, for a blow falling away from the eye. Past 90 it falls inward as well, towards the middle of the view.
// `shift`, `pitch` and `twist` set the blade for the arc: a sprite is flat, so it is turned to face the eye as it crosses. `wrist` is how far the blade lags at the start of the strike and leads at the end, which is what makes the tip whip.
// The times are shares of a swing: out to `from` by `load`, through to `to` by `land`, then back to rest. A blow lands on the click, so the load is short enough not to read as a delay.
export const CUTS = {
  slash: [
    { pivot: [0.5, -1.25, -0.85], yaw: 0, from: -9, to: 92, wrist: 14, shift: [0, 0.14, 0], pitch: -20, twist: 62 }, // the forehand: down across the body from high on the right
    { pivot: [0.08, -1.32, -0.85], yaw: 0, from: 66, to: -30, wrist: -12, shift: [0, 0.04, 0], pitch: -20, twist: 62, under: true }, // the backhand: flatter, and back the other way
    { pivot: [0.32, -0.85, -0.45], yaw: 122, from: 10, to: -74, wrist: 0, shift: [-0.12, 0.14, 0], pitch: -8, twist: 44 }, // the finish: down through the middle
  ],
  cleave: [
    { pivot: [0.32, -0.85, -0.45], yaw: 122, from: 14, to: -78, wrist: 0, shift: [-0.12, 0.18, 0], pitch: -8, twist: 44 },
    { pivot: [0.32, -0.85, -0.45], yaw: 150, from: 14, to: -70, wrist: 0, shift: [-0.12, 0.18, 0], pitch: -8, twist: 44 },
  ],
};
export const CUT_TIMES = { slash: { load: 0.14, land: 0.5 }, cleave: { load: 0.26, land: 0.6 } };
const WHIP = 2.2, DIP = 0.62; // how hard the strike starts, and how far below the view a blade travels when it is going back
const whip = t => 1 - (1 - t) ** WHIP, settle = t => 1 - (1 - t) ** 2; // both leave at full speed and arrive gently
const arch = t => sin(PI * Math.min(1, Math.max(0, t)));
// The pose of a blade `p` of the way through a swing. It leaves rest and comes back to it exactly, so a swing has no pop at either end.
export function cutMotion(kind, n, p) {
  const list = CUTS[kind], cut = list[n % list.length], { load, land } = CUT_TIMES[kind], strike = (p - load) / (land - load);
  const set = p < load ? settle(p / load) : p < land ? 1 : 1 - ss(land, 1, p);
  const turn = p < load ? cut.from * (cut.under ? set * set : set) : p < land ? cut.from + (cut.to - cut.from) * whip(strike) : cut.to * set; // one going under the view drops first and crosses after
  const wrist = (p < load ? -set : p < land ? 2 * whip(strike) - 1 : set) * cut.wrist;
  const under = DIP * (p < load ? (cut.under ? arch(p / load) : 0) : p < land ? 0 : arch((p - land) / (1 - land))); // going back is out of sight, or it reads as the cut rewinding
  return { arc: { pivot: cut.pivot, yaw: cut.yaw, turn, wrist, pitch: cut.pitch * set, twist: cut.twist * set, shift: [cut.shift[0] * set, cut.shift[1] * set - under, cut.shift[2] * set] } };
}

// ---------- the mark a cut leaves on the air ----------
// A crescent traced from the very poses the blade goes through, so it cannot be anywhere the blade was not, and then drawn as big square pixels on a grid fixed to the view, one pixel of the blade across, like everything else here.
// A bright rim where the tip went and a thin body inside it. A pixel narrows away towards the rim as it ages, and at the end drops out by itself, so the crescent breaks up instead of fading as a sheet. One mesh, no particles, for the fifth of a second a cut is on the air.
const HEEL = [0.46, 0.44, 0.5], TIP = [0.95, 0.91, 0.5]; // a blade runs corner to corner of its drawing
const GRID = 0.044, BEHIND = 1.8, SWEEP = 140, ACROSS = 28; // the grid sits at BEHIND, further off than any blade reaches, so that the blade is always in front of its own mark
const STEPS = 3, RIM = 0.86, REACH = 0.5, BREAK_UP = 0.5, RIM_ALPHA = 0.95, BODY_ALPHA = 0.42, LIFE = { slash: 0.26, cleave: 0.2 };
export const TRAIL_CELLS = 260, TRAIL_DEPTH = BEHIND;
export const TRAIL_INDEX = Array.from({ length: TRAIL_CELLS }, (_, i) => [0, 1, 2, 0, 2, 3].map(k => i * 4 + k)).flat();
const speck = (x, y) => { const n = sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };
const traced = new Map();
function trailPixels(kind, n) {
  const list = CUTS[kind], at = n % list.length, key = `${kind}/${at}`;
  if (!traced.has(key)) {
    const { load, land } = CUT_TIMES[kind], seen = new Map();
    for (let c = 0; c <= SWEEP; c++) { // evenly along the arc, which is not evenly in time
      const born = load + (land - load) * (1 - (1 - c / SWEEP) ** (1 / WHIP)), pose = itemPose(0, 0, STILL, cutMotion(kind, at, born));
      holdTool(pose);
      const heel = pose.apply(...HEEL), tip = pose.apply(...TIP);
      for (let r = 0; r <= ACROSS; r++) {
        const f = r / ACROSS, [x, y, z] = heel.map((v, i) => v + (tip[i] - v) * f), ix = Math.floor(x / -z / GRID), iy = Math.floor(y / -z / GRID), cell = `${ix},${iy}`, had = seen.get(cell);
        if (had) had.f = Math.max(had.f, f); else seen.set(cell, { ix, iy, born, f, grain: speck(ix, iy) });
      }
    }
    traced.set(key, [...seen.values()]);
  }
  return traced.get(key);
}
const channels = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
// What a blade of this palette leaves: its own colour, lifted so that it reads as light and not as mud.
export function trailInk(palette, shade = k => k) {
  const { ramp } = PALETTES[palette] ?? PALETTES.iron;
  return { rim: channels(mixHex(ramp[0], 0xffffff, 0.35)).map(shade), body: channels(mixHex(ramp[1], 0xffffff, 0.15)).map(shade) };
}
// Writes the crescent as it stands `p` of the way through a swing into four corners a pixel, and returns how many pixels there are.
export function writeTrail(kind, n, p, ink, pos, rgba) {
  const life = LIFE[kind], g = GRID * BEHIND;
  let cells = 0;
  for (const { ix, iy, born, f, grain } of trailPixels(kind, n)) {
    const left = 1 - (p - born) / life;
    if (p < born || left <= grain * BREAK_UP || f < 1 - REACH * left || cells === TRAIL_CELLS) continue;
    const rim = f >= RIM, colour = rim ? ink.rim : ink.body, alpha = (rim ? RIM_ALPHA : BODY_ALPHA) * Math.ceil(left * STEPS) / STEPS, at = cells++ * 4;
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([dx, dy], i) => {
      pos.set([(ix + dx) * g, (iy + dy) * g, -BEHIND], (at + i) * 3);
      rgba.set([...colour, alpha], (at + i) * 4);
    });
  }
  return cells;
}
// How each kind of thing sits in the hand. A model is made in a one-block box, so each ends by centring it.
const centred = p => p.translate(-0.5, -0.5, -0.5);
const GRIP = [1.13 / 16, 3.2 / 16, 1.13 / 16], SPRITE_SCALE = 0.68, THING_SCALE = 0.46; // a tool is long and thin, and a bottle at that size fills the corner of the view
// Minecraft's own numbers put one face of a block square to the eye this far right of centre, which reads as a slab. Tilted and turned, it shows its top and two sides.
const BLOCK_AT = [-0.1, 0.1, -0.12], BLOCK_TILT = 17, BLOCK_TURN = 17, BLOCK_SIZE = 0.38;
export const holdBlock = p => centred(p.translate(...BLOCK_AT).rotX(BLOCK_TILT).rotY(BLOCK_TURN).scale(BLOCK_SIZE));
export const holdTool = p => centred(p.translate(...GRIP).rotY(-90).rotZ(55).scale(SPRITE_SCALE));
export const holdThing = p => centred(p.translate(...GRIP).rotY(-90).rotZ(25).scale(THING_SCALE));

// ---------- blocks: cut from the same tiles the world uses ----------
const LIGHT = { top: 1, bottom: 0.5, south: 0.8, north: 0.8, east: 0.6, west: 0.6 };
// Each face: the name for its light, which of the three tiles it shows, its corners, and how a corner maps onto the tile, all from a box in sixteenths.
const FACES = [
  ['top', 0, ([a, , c, d, e, f]) => [[a, e, f], [d, e, f], [d, e, c], [a, e, c]], (x, y, z) => [x, z]],
  ['bottom', 2, ([a, b, c, d, , f]) => [[a, b, c], [d, b, c], [d, b, f], [a, b, f]], (x, y, z) => [x, 16 - z]],
  ['south', 1, ([a, b, , d, e, f]) => [[a, b, f], [d, b, f], [d, e, f], [a, e, f]], (x, y) => [x, 16 - y]],
  ['north', 1, ([a, b, c, d, e]) => [[d, b, c], [a, b, c], [a, e, c], [d, e, c]], (x, y) => [16 - x, 16 - y]],
  ['east', 1, ([, b, c, d, e, f]) => [[d, b, f], [d, b, c], [d, e, c], [d, e, f]], (x, y, z) => [16 - z, 16 - y]],
  ['west', 1, ([a, b, c, , e, f]) => [[a, b, c], [a, b, f], [a, e, f], [a, e, c]], (x, y, z) => [z, 16 - y]],
];
const CUBE = [[0, 0, 0, 16, 16, 16]], TILES = 3, EDGE = 0.02;
const FLAT_SHAPES = new Set(['cross', 'torch']); // what grows, and a torch, are carried as the picture of themselves
const HAND_SHAPES = { fence: [[6, 0, 0, 10, 16, 4], [6, 0, 12, 10, 16, 16], [7, 6, 4, 9, 8, 12], [7, 12, 4, 9, 14, 12]] };

// A tile as a held block shows it: tinted only where the tile says, as the terrain does, with its holes kept for what has holes.
function bake(b, name, into, at) {
  const px = tilePixels(name);
  for (let i = 0; i < TILE * TILE; i++) {
    const from = i * 4, to = (i % TILE + at + Math.floor(i / TILE) * TILE * TILES) * 4, a = px[from + 3], tinted = b.tint && a > 200;
    for (let c = 0; c < 3; c++) into[to + c] = Math.min(255, px[from + c] * (tinted ? b.top[c] * 1.3 : 1));
    into[to + 3] = b.cutout ? (a > 100 ? 255 : 0) : b.transparent ? 170 : 255;
  }
}
// Whether a block is held as its picture rather than as a solid thing. An item with a drawing of its own shows that instead, as seeds do.
export const heldFlat = id => FLAT_SHAPES.has(BL[id].shape);
export function blockModel(id) {
  const b = BL[id], tex = [].concat(b.tex ?? 'dirt'), names = [tex[0], tex[1] ?? tex[0], tex[2] ?? tex[1] ?? tex[0]];
  if (FLAT_SHAPES.has(b.shape)) return { ...flatModel(tintedTile(b, names[0])), glow: !!b.emit };
  const pixels = new Uint8Array(TILE * TILE * TILES * 4), pos = [], uv = [], shade = [], index = [];
  names.forEach((name, i) => bake(b, name, pixels, i * TILE));
  for (const box of HAND_SHAPES[b.shape] ?? SHAPES[b.shape] ?? CUBE) for (const [name, tile, corners, map] of FACES) {
    const first = pos.length / 3;
    for (const [x, y, z] of corners(box)) {
      pos.push(x / 16, y / 16, z / 16); shade.push(LIGHT[name]);
      const [u, v] = map(x, y, z);
      uv.push((Math.max(EDGE, Math.min(16 - EDGE, u)) + tile * TILE) / (TILE * TILES), Math.max(EDGE, Math.min(16 - EDGE, v)) / TILE);
    }
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  return { pos, uv, shade, index, pixels, width: TILE * TILES, height: TILE, cutout: !!b.cutout, glass: !!b.transparent, glow: !!b.emit };
}
function tintedTile(b, name) {
  const px = tilePixels(name), out = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const tinted = b.tint && px[i + 3] > 200;
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(255, px[i + c] * (tinted ? b.top[c] * 1.3 : 1));
    out[i + 3] = px[i + 3] > 100 ? 255 : 0;
  }
  return out;
}

// ---------- items: a 16 by 16 picture pushed out into a slab, so that the drawing and the model can never disagree ----------
const FRONT = 8.5 / 16, BACK = 7.5 / 16, N = ITEM_SIZE;
export function flatModel(px) {
  const pos = [], colour = [], index = [], solidAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && px[(x + y * N) * 4 + 3] > 0;
  const quad = (corners, r, g, b, k) => {
    const first = pos.length / 3;
    for (const c of corners) { pos.push(...c); colour.push(r * k, g * k, b * k); }
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!solidAt(x, y)) continue;
    const i = (x + y * N) * 4, [r, g, b] = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
    const x0 = x / N, x1 = (x + 1) / N, top = (N - y) / N, foot = (N - 1 - y) / N;
    quad([[x0, foot, FRONT], [x1, foot, FRONT], [x1, top, FRONT], [x0, top, FRONT]], r, g, b, 1);
    quad([[x1, foot, BACK], [x0, foot, BACK], [x0, top, BACK], [x1, top, BACK]], r, g, b, 0.72);
    if (!solidAt(x, y - 1)) quad([[x0, top, FRONT], [x1, top, FRONT], [x1, top, BACK], [x0, top, BACK]], r, g, b, 1);
    if (!solidAt(x, y + 1)) quad([[x0, foot, BACK], [x1, foot, BACK], [x1, foot, FRONT], [x0, foot, FRONT]], r, g, b, 0.5);
    if (!solidAt(x + 1, y)) quad([[x1, foot, FRONT], [x1, foot, BACK], [x1, top, BACK], [x1, top, FRONT]], r, g, b, 0.62);
    if (!solidAt(x - 1, y)) quad([[x0, foot, BACK], [x0, foot, FRONT], [x0, top, FRONT], [x0, top, BACK]], r, g, b, 0.8);
  }
  return { pos, colour, index };
}
export const spriteModel = (art, pal) => flatModel(spritePixels(art, pal));

// ---------- the arm: one box, four by twelve by four, as on a skin ----------
const ARM = [-8, 0, -2, -4, 12, 2], GUARD = [-8.4, 1, -2.4, -3.6, 8.4, 2.4];
export const ARM_END = [-6 / 16, 12 / 16, 0]; // the end of the hand
const ARM_FACES = [ // which way each face looks, and what paint.js calls it for its light. y runs down the arm, from the shoulder to the hand.
  ['south', 'front'], ['north', 'back'], ['east', 'right'], ['west', 'left'], ['bottom', 'top'], ['top', 'bottom'],
];
const NORMALS = { top: [0, 1, 0], bottom: [0, -1, 0], south: [0, 0, 1], north: [0, 0, -1], east: [1, 0, 0], west: [-1, 0, 0] };
// A face of the box is lit by how it faces the eye once the arm is at rest, so that the side you see reads as the side in the light.
function restLight(name) {
  const p = armPose(0, 0), [x, y, z] = NORMALS[name], m = p.m;
  const n = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  return 0.62 + 0.38 * Math.max(0, n[0] * -0.34 + n[1] * 0.58 + n[2] * 0.74);
}
// `paint(j)` says what covers the arm that far down it. A paint is one from paint.js, from a pixel of a face to a colour.
function boxModel(box, paintAt, width = 4, length = 12) {
  const sheet = width * 4 + width * 2, pixels = new Uint8Array(sheet * length * 4), pos = [], uv = [], shade = [], index = [];
  const [a, b, c, d, e, f] = box, slot = {};
  ARM_FACES.forEach(([name, face], n) => {
    slot[name] = n * width;
    const tall = name === 'top' || name === 'bottom' ? width : length;
    for (let j = 0; j < tall; j++) for (let i = 0; i < width; i++) {
      const along = name === 'top' ? length - 1 : name === 'bottom' ? 0 : j, colour = paintAt(along)(i, along, width, length, face), k = (n * width + i + j * sheet) * 4; // the top of the box is the end of the hand
      if (colour >= 0) pixels.set([colour >> 16 & 255, colour >> 8 & 255, colour & 255, 255], k);
    }
  });
  for (const [name, , corners] of FACES) {
    const first = pos.length / 3, light = restLight(name), flip = name === 'top' || name === 'bottom', tall = flip ? width : length;
    corners([a, b, c, d, e, f]).forEach(([x, y, z], n) => { // corners run round the face, and the first two are the nearest the shoulder
      pos.push(x / 16, y / 16, z / 16); shade.push(light);
      uv.push((slot[name] + (n === 1 || n === 2 ? width - EDGE : EDGE)) / sheet, (n >= 2 ? tall - EDGE : EDGE) / length);
    });
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  return { pos, uv, shade, index, pixels, width: sheet, height: length };
}
export const armModel = paintAt => boxModel(ARM, paintAt);
export const guardModel = paint => boxModel(GUARD, () => paint);
// The hero's own arm: a sleeve, a bracer with its straps, and a bare hand. Nothing else on a skin is this close to the eye.
export function heroArm(look) {
  const skin = flesh(look.skin), sleeve = cloth(look.top), bracer = leather(look.gauntlets ?? look.armor ?? mixHex(look.top, INK, 0.3)), strap = plain(look.belt ?? mixHex(look.top, INK, 0.5));
  return j => (j >= 9 ? skin : j === 8 || j === 5 ? strap : j > 5 ? bracer : sleeve);
}

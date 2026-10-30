// People: grown adults of every build, drawn as pixel art on blocks. Each surface is painted (see paint.js), so that a coat
// has folds and gold trim, armour has plates and a torn cape really is torn. A few people are small and sweet, on purpose.
import * as THREE from 'three';

import { AMBER, CLAY, COAL, COVER, CREAM, DUSK, GOLD, LEAF, LEATHER, LILAC, LINEN, MAUVE, PALE, PLUM, RED, ROSE, SKY, SLATE, lookFor } from './outfits.js';
import { both, cloth, flesh, hair, leather, metal, plain, torn, wood } from './paint.js';
import { poseFigure } from './pose.js';
import { INK, Rig, figureBones, handBoxes, held, mixHex } from './voxel.js';

export { lookFor };
// The player's own character, seen in the bag and in the hand at the corner of the view.
export const heroLook = () => lookFor('villager', 'adventurer', 23, { race: 'human' });

// ---------------- the face: 15x15, one pixel for each art pixel of the head ----------------
const FACE = 15, faces = new Map();
const darker = (c, k = 0.3) => mixHex(c, INK, k), lighter = (c, k = 0.3) => mixHex(c, CREAM, k);

function drawFace(put, L, mood) {
  const skin = L.skin, shade = darker(skin, 0.2), deep = darker(skin, 0.42);
  if (L.hooded) { // in the shadow of the hood, there is only a chin and a glint of eyes
    put(0, 0, FACE, FACE, darker(L.hatColor, 0.8));
    put(3, 11, 9, 4, darker(skin, 0.68));
    put(4, 12, 7, 3, darker(skin, 0.55));
    if (mood !== 'shut') for (const x of [4, 9]) put(x, 8, 2, 1, mood === 'cross' ? RED : lighter(L.eyes, 0.5));
    return;
  }
  const demon = L.job === 'demon_lord', brow = darker(L.hair, 0.35), iris = L.eyes;
  put(0, 0, FACE, FACE, skin);
  put(0, 0, FACE, 4, shade); put(0, 0, 1, FACE, shade); put(14, 0, 1, FACE, shade); // the shadow the hair throws, and the turn of the head
  put(1, 13, 13, 2, shade); put(0, 12, 2, 3, deep); put(13, 12, 2, 3, deep); // the jaw
  if (L.cute) {
    put(2, 11, 3, 1, mixHex(skin, ROSE, 0.45)); put(10, 11, 3, 1, mixHex(skin, ROSE, 0.45));
    for (const [x, outer] of [[2, 1], [9, 13]]) {
      if (mood === 'shut') { put(x, 9, 4, 1, INK); continue; }
      if (mood === 'hurt') { put(x, 8, 4, 1, INK); put(x + 1, 9, 2, 1, INK); put(x, 10, 4, 1, INK); continue; }
      put(x, 7, 4, 1, INK); put(x, 8, 4, 3, CREAM); put(x + 1, 8, 2, 3, iris); put(x + 1, 8, 2, 1, darker(iris, 0.4)); put(x + 1, 9, 2, 1, INK); put(x + 1, 8, 1, 1, CREAM);
      if (L.female) put(outer, 7, 1, 1, INK);
    }
    put(6, 12, 3, 1, mood === 'hurt' ? INK : mixHex(skin, RED, 0.5));
    return;
  }
  // Sharper brows and narrower eyes than a child's: most of these people have seen a thing or two.
  const browY = 6, eyeY = 8;
  for (const [x, inner] of [[2, 5], [9, 9]]) {
    if (mood === 'cross' || demon) for (let i = 0; i < 4; i++) put(x + i, browY - 1 + (x === 2 ? i >> 1 : (3 - i) >> 1), 1, 2, brow);
    else { put(x, browY, 4, 1, brow); if (!L.female) put(inner, browY + 1, 1, 1, brow); }
  }
  for (const [x, irisAt, whiteAt, pupil] of [[3, 1, 0, 2], [9, 0, 2, 0]]) {
    if (mood === 'shut') { put(x, eyeY + 1, 3, 1, deep); continue; }
    if (mood === 'hurt') { put(x, eyeY, 3, 1, INK); put(x + 1, eyeY + 1, 1, 1, INK); continue; }
    put(x, eyeY - 1, 3, 1, L.female ? INK : deep);
    put(x, eyeY, 3, 2, CREAM);
    put(x + irisAt, eyeY, 2, 2, iris);
    put(x + pupil, eyeY, 1, 1, demon ? iris : INK);
    put(x + whiteAt, eyeY + 1, 1, 1, lighter(iris, 0.3));
    if (L.female) put(x === 3 ? 2 : 12, eyeY - 1, 1, 1, INK);
  }
  put(8, 9, 1, 3, shade); put(6, 11, 3, 1, shade); // the nose, lit from the left
  if (L.old) { put(3, 11, 2, 1, shade); put(10, 11, 2, 1, shade); put(5, 4, 5, 1, deep); }
  if (mood === 'hurt') { put(5, 12, 5, 2, INK); put(6, 13, 3, 1, RED); }
  else if (L.female) { put(6, 12, 3, 1, mixHex(skin, RED, 0.55)); put(6, 13, 3, 1, mixHex(skin, RED, 0.35)); }
  else put(5, 13, 5, 1, deep);
  if (L.beard) {
    const b = L.beard, low = darker(b, 0.2);
    put(1, 11, 13, 4, b); put(1, 14, 13, 1, low); put(2, 11, 3, 1, skin); put(10, 11, 3, 1, skin); put(5, 12, 5, 1, low); put(6, 13, 3, 1, darker(skin, 0.5));
  }
  if (L.glasses) for (const x of [2, 8]) { put(x, 7, 5, 1, INK); put(x, 10, 5, 1, INK); put(x, 7, 1, 4, INK); put(x + 4, 7, 1, 4, INK); put(7, 8, 1, 1, INK); }
}
function faceOf(L, mood) {
  const key = [L.skin, L.eyes, L.hair, L.female, L.glasses, L.job === 'demon_lord', L.cute, L.beard, L.old, L.hooded, L.hatColor, mood].join();
  if (faces.has(key)) return faces.get(key);
  const px = new Uint8Array(FACE * FACE * 4);
  // Rows run bottom to top here, which is the way up a plane's coordinates are.
  drawFace((x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= FACE || j >= FACE) continue;
      const k = ((FACE - 1 - j) * FACE + i) * 4;
      px[k] = c >> 16 & 255; px[k + 1] = c >> 8 & 255; px[k + 2] = c & 255; px[k + 3] = 255;
    }
  }, L, mood);
  const tex = new THREE.DataTexture(px, FACE, FACE, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.userData.shared = true; // outlives any one character: other people may be wearing this face
  faces.set(key, mat);
  return mat;
}

// ---------------- what hands hold ----------------
// Tilts allow for the bent elbow of an arm carrying something: UP ends up upright and OUT keeps a long pole clear of the face.
const FORWARD = -1.2, UP = -0.72, OUT = -0.12;
const IRON = metal(PALE), DARK_IRON = metal(SLATE), BRASS = metal(GOLD), SHAFT = wood(COVER), GRIP = leather(COVER);
const TOOLS = {
  sword: held(FORWARD, [[2.4, 8, 2.4, -1, GRIP], [12, 2.4, 3, 4, BRASS], [4, 34, 2, 22, IRON], [2.4, 4, 2, 41, IRON]]),
  doom: held(-1.6, [[3, 14, 3, 0, GRIP], [22, 3, 4, 8, metal(DUSK)], [9, 58, 3, 38, DARK_IRON], [3, 58, 3.6, 38, metal(RED)], [4, 7, 3, 70, DARK_IRON]], -4, -0.3),
  spear: held(UP, [[2.4, 68, 2.4, 12, SHAFT], [6, 13, 2, 52, IRON], [3, 6, 2, 61, IRON], [5, 2.4, 3, 44, plain(RED)]], -4, OUT),
  staff: held(UP, [[3, 60, 3, 10, SHAFT], [7, 3, 7, 40, BRASS], [7, 9, 7, 46, plain(LILAC)], [3, 3, 3, 52, plain(CREAM)]], -4, OUT),
  trident: held(UP, [[3, 60, 3, 10, BRASS], [16, 3, 3, 38, BRASS], [3, 12, 3, 45, IRON], [12, 2.4, 2.4, 43, BRASS]], -4, OUT),
  sceptre: held(FORWARD, [[2.4, 22, 2.4, 5, BRASS], [6, 6, 6, 18, plain(RED)], [2, 3, 2, 22, BRASS]]),
  hammer: held(FORWARD, [[2.4, 24, 2.4, 5, SHAFT], [8, 13, 9, 17, metal(MAUVE)], [8.4, 3, 9.4, 17, metal(DUSK)]]),
  hoe: held(UP, [[2.4, 56, 2.4, 8, SHAFT], [3, 5, 12, 36, metal(MAUVE)]], -4, OUT),
  rod: held(-1.05, [[2, 68, 2, 16, SHAFT], [3, 8, 3, 0, GRIP], [1.2, 22, 1.2, 46, plain(PALE)]], -4, OUT),
  pin: held(FORWARD, [[2.4, 26, 2.4, 4, wood(LEATHER)], [5, 15, 5, 4, wood(LINEN)]]),
  mug: [[7, 9, 7, 0, -6, -6, wood(LEATHER)], [8, 2, 8, 0, -1, -6, plain(LINEN)], [2, 5, 3, 0, -6, -1, wood(LEATHER)]],
};
const SHIELD_FACE = metal(0x2f78b8, { draw: { side: [[7, 0, 4, 0, GOLD], [0, 9, 0, 4, GOLD]] }, bevel: 1 });
const CARRIED = {
  shield: [[2.4, 26, 18, -5, -8, 0, SHIELD_FACE], [3, 2, 18.4, -5, 5, 0, BRASS], [3, 2, 18.4, -5, -21, 0, BRASS]],
  ledger: [[7, 14, 12, -2, -8, 0, leather(COVER)], [7.4, 12, 1, -2, -8, -5.6, plain(LINEN)]],
  book: [[6, 15, 12, -2, -8, 0, leather(RED, { draw: { all: [[0, 2, 0, 1, GOLD], [0, -3, 0, 1, GOLD]] } })]],
  satchel: [[7, 12, 14, -1, -10, 0, leather(COVER)], [7.4, 4, 14.4, -1, -6, 0, leather(LEATHER)], [1, 8, 1, -1, -1, 0, plain(LEATHER)]],
  basket: [[12, 8, 12, -1, -13, 0, wood(LEATHER)], [9, 2, 9, -1, -8, 0, plain(LEAF)], [3, 3, 3, -1, -8, 0, plain(GOLD)], [1.5, 6, 10, -1, -6, 0, wood(LEATHER)]],
};
const BACK_ITEMS = {
  sword: T => [[4, 38, 3, 2, T - 8, 7.5, leather(COVER, { draw: { all: [[0, 0, 0, 3, GOLD], [0, -3, 0, 3, GOLD]] } }), 0.5], [12, 2.4, 3, -7, T + 8, 7.5, BRASS, 0.5], [2.4, 9, 2.4, -10.5, T + 14, 7.5, GRIP, 0.5]],
  bow: T => [[2.4, 18, 2.4, -6, T + 6, 7.5, SHAFT, -0.25], [2.4, 18, 2.4, -9, T - 11, 7.5, SHAFT, 0.25], [2.4, 18, 2.4, -6, T - 28, 7.5, SHAFT, 0.75], [1, 46, 1, -1, T - 11, 8, plain(LINEN), 0.05]],
  lute: T => [[15, 18, 5, 2, T - 10, 8.5, wood(LEATHER), 0.4], [3, 18, 3, -7, T + 7, 8.5, SHAFT, 0.4], [6, 4, 3, -11, T + 16, 8.5, wood(LEATHER), 0.4]],
  pack: T => [[20, 20, 12, 0, T - 8, 13, leather(COVER)], [21, 3, 13, 0, T - 4, 13, leather(LEATHER)], [14, 6, 8, 0, T + 5, 13, cloth(CLAY)], [16, 10, 4, 0, T - 12, 20, leather(LEATHER)]],
};

// ---------------- the body ----------------
// Numbers are art pixels. `chest` and `belly` are width and depth. Heads are all one size, which is what sets the
// proportions: about a fifth of the height, except on the small and the sweet.
const BUILDS = {
  normal: { leg: 30, trunk: 24, span: 13, upper: 13, fore: 12, armW: 7, legW: 8, stance: 4.5, chest: [19, 11], belly: [16, 10], stature: 1 },
  strong: { leg: 30, trunk: 26, span: 16, upper: 14, fore: 13, armW: 9, legW: 10, stance: 5.5, chest: [25, 14], belly: [20, 12], stature: 1.05 },
  slim: { leg: 33, trunk: 24, span: 11.5, upper: 14, fore: 13, armW: 6, legW: 7, stance: 4, chest: [17, 10], belly: [13, 9], stature: 1.03 },
  stout: { leg: 26, trunk: 25, span: 15, upper: 12, fore: 11, armW: 8, legW: 9, stance: 5, chest: [23, 15], belly: [24, 17], stature: 0.95 },
  small: { leg: 20, trunk: 18, span: 10, upper: 9, fore: 9, armW: 5, legW: 6, stance: 3.5, chest: [15, 9], belly: [13, 8], stature: 0.8, headScale: 1.16 },
  giant: { leg: 44, trunk: 34, span: 19, upper: 18, fore: 17, armW: 11, legW: 13, stance: 7, chest: [31, 16], belly: [24, 14], stature: 1 },
};
const CROWN = 18; // from the neck to the top of the hair

function dressLegs(rig, x, L, P) {
  const W = P.legW, thigh = Math.ceil(P.leg / 2) - 1, shin = Math.floor(P.leg / 2), boot = Math.round(shin * 0.72), calf = shin - boot + 1;
  const bare = L.skirt === 'dress', cover = bare ? flesh(L.skin) : cloth(L.bottom, { draw: { front: [[0, 2, 0, 1, darker(L.bottom, 0.25)]] } });
  const cuff = lighter(L.shoes, 0.18), boots = L.plate ? metal(L.armor) : leather(L.shoes, { draw: { all: [[0, 0, 0, 2, cuff], [0, -2, 0, 2, darker(L.shoes, 0.3)]] } });
  x.legs.forEach((bone, i) => {
    const list = [[W, thigh + 1, W + 1, 0, -thigh / 2, 0, cover]];
    if (L.plate) list.push([W + 1, thigh * 0.7, W + 2, 0, -thigh * 0.6, -0.2, metal(L.armor)]);
    rig.add(bone, list);
    const lower = [[W, calf, W + 1, 0, -calf / 2, 0, bare ? cloth(L.socks) : cover], [W + 1, boot, W + 2, 0, boot / 2 - shin, -0.2, boots], [W + 1, 3, W + 5, 0, 1.5 - shin, -2, boots]];
    if (L.plate) lower.push([W + 1.6, 5, W + 2.6, 0, 0, -0.3, metal(L.armor)]);
    rig.add(x.shins[i], lower);
  });
}
// A bell of stepped skirts from the waist to the floor, on a bone of its own so that it can swing.
function dressHem(rig, x, L, P) {
  const hem = rig.bone(x.hips, 0, 0, 0), tiers = 4, h = (P.leg + 2) / tiers, wide = P.belly[0], deep = P.belly[1] + 1, list = [];
  for (let i = 0; i < tiers; i++) {
    const strip = L.trim ? [[Math.floor((wide + i * 3) / 2) - 1, 0, 2, 0, L.trim]] : [], hemline = L.trim && i === tiers - 1 ? { all: [[0, -2, 0, 2, L.trim]] } : {};
    list.push([wide + i * 3, h + 0.5, deep + i * 3, 0, 2 - h * (i + 0.5), 0, cloth(L.bottom, { draw: { front: strip, ...hemline } })]);
  }
  rig.add(hem, list);
  x.soft.push({ b: hem, k: 0.25 });
}
function dressMermaid(rig, x, L) {
  const c = L.bottom, scale = cloth(c, { draw: { all: [[0, 3, 0, 1, lighter(c, 0.3)]] } }), sizes = [[16, 10, 11], [13, 9, 9], [10, 8, 7]];
  x.tail = [];
  let parent = x.hips, at = -1;
  sizes.forEach(([w, h, d]) => {
    const b = rig.bone(parent, 0, at, 0);
    rig.add(b, [[w, h + 1, d, 0, -h / 2, 0, scale]]);
    x.tail.push(b); parent = b; at = -h;
  });
  const fin = rig.bone(parent, 0, at, 0), lit = plain(lighter(c, 0.3)), tip = plain(0x7fe0e0);
  rig.add(fin, [[8, 3, 5, 0, -1, 0, scale], [12, 3, 4, -6, -2, 1, lit, 0.4], [12, 3, 4, 6, -2, 1, lit, -0.4], [8, 2.4, 3, -13, -5, 1, tip, 0.5], [8, 2.4, 3, 13, -5, 1, tip, -0.5]]);
  x.tail.push(fin);
}
function dressCape(rig, x, L, P) {
  const c = L.cape, T = P.trunk, [W, D] = P.chest, lining = darker(c, 0.4), len = Math.round((P.leg + T) * 0.46), wide = W + 6;
  const sheet = (hemColor, tear) => cloth(c, { draw: { front: [[0, 0, 0, 0, lining]], back: hemColor ? [[0, -3, 0, 2, hemColor]] : [] }, cut: tear ? torn(9, c & 255) : undefined });
  const upper = rig.bone(x.chest, 0, T - 2, D / 2 + 1), lower = rig.bone(upper, 0, -len, 0);
  rig.add(upper, [[wide, len + 1, 2, 0, -len / 2, 0, sheet(null, false)]]);
  rig.add(lower, [[wide, len, 2, 0, -len / 2, 0, sheet(L.torn ? null : L.trim, L.torn)]]);
  x.soft.push({ b: upper, k: 0.6 }, { b: lower, k: 0.5, lag: 0.7 });
  const spots = L.mantle ? [...both(3, 2, 1, 2, INK), ...both(7, 3, 1, 2, INK)] : [];
  rig.add(x.chest, [[W + 7, 6, D + 5, 0, T, 0.5, cloth(L.mantle || c, { draw: { all: spots } })]]);
}
function dressTrunk(rig, x, L, P) {
  const T = P.trunk, [W, D] = P.chest, [BW, BD] = P.belly, skin = L.skin, top = L.top, hipW = L.female ? Math.max(BW + 3, W - 1) : BW + 1;
  const mid = W >> 1, neckline = [[mid - 2, 0, 4, 1, skin], [mid - 1, 1, 2, 2, skin], [mid, 3, 1, 3, darker(top, 0.35)]];
  const shirt = cloth(top, { draw: { front: L.collar ? [[mid - 3, 0, 6, 2, L.collar], [mid - 1, 2, 2, 2, L.collar]] : neckline } });
  const chest = [[BW, 10, BD, 0, 3, 0, cloth(top)], [W, T - 7, D, 0, 8 + (T - 8) / 2, 0, shirt]];
  const hips = [[hipW, 9, BD + 1, 0, 0.5, 0, cloth(L.bottom)]];

  if (L.armor && L.plate) {
    const a = L.armor, seam = darker(a, 0.4), trim = L.trim || lighter(a, 0.3);
    chest.push([W + 2, T - 7, D + 2, 0, T / 2 + 3, 0, metal(a, { draw: { front: [[0, -1, 0, 1, trim], [mid, 0, 2, 0, lighter(a, 0.25)], [mid - 4, 4, 2, 1, seam], [mid + 4, 4, 2, 1, seam]], back: [[0, -1, 0, 1, trim]] } })]);
    chest.push([BW + 2, 8, BD + 2, 0, 3, 0, metal(darker(a, 0.12), { draw: { all: [[0, 3, 0, 1, seam]] } })]);
    if (!L.gown) hips.push([hipW + 3, 8, BD + 4, 0, -3, 0, metal(a, { draw: { all: [[0, 3, 0, 1, seam], [0, -1, 0, 1, trim]] } })]);
  } else if (L.armor) {
    const a = L.armor, strap = lighter(a, 0.25);
    chest.push([W + 1.4, T - 8, D + 1.4, 0, T / 2 + 3.5, 0, leather(a, { draw: { front: [[mid - 1, 0, 2, 0, darker(a, 0.35)], ...both(4, 3, 2, 1, strap), ...both(4, 7, 2, 1, strap)], back: [[0, 5, 0, 1, strap]] } })]);
  }
  if (L.tabard) {
    const c = L.tabard, crest = [[3, 6, 4, 8, L.trim || GOLD], [1, 8, 8, 3, L.trim || GOLD]];
    chest.push([10, T + 1, 1, 0, T / 2 - 0.5, -(D / 2 + 1.4), cloth(c, { draw: { all: crest } })], [10, T, 1, 0, T / 2, D / 2 + 1.4, cloth(c)]);
    hips.push([10, 17, 1, 0, -8, -(BD / 2 + 2.6), cloth(c, { draw: { all: [[0, -2, 0, 1, L.trim || GOLD]] }, cut: torn(3, 7) })], [10, 15, 1, 0, -7, BD / 2 + 2.6, cloth(c)]);
  }
  if (L.coat) {
    const c = L.coat, t = L.trim, open = [[mid - 2, 0, 5, 0, top], ...(t ? [[mid - 3, 0, 1, 0, t], [mid + 3, 0, 1, 0, t]] : [])];
    const buttons = t ? [[mid + 5, 4, 1, 1, t], [mid + 5, 9, 1, 1, t], [mid + 5, 14, 1, 1, t]] : [];
    chest.push([W + 1.6, T + 1, D + 1.6, 0, T / 2 - 0.5, 0, cloth(c, { draw: { front: [...open, ...buttons], all: t ? [[0, -1, 0, 1, t]] : [] } })]);
    const hem = rig.bone(x.hips, 0, 2, 0), len = Math.round(P.leg * 0.72), slit = (i, j, Wd, H, f) => f === 'front' && Math.abs(i - Wd / 2) < 2.5;
    rig.add(hem, [[W + 2, len, D + 2, 0, -len / 2, 0, cloth(c, { draw: t ? { all: [[0, -2, 0, 2, t]] } : undefined, cut: slit })]]);
    x.soft.push({ b: hem, k: 0.22 });
  }
  if (L.apron) {
    const a = L.apron;
    chest.push([W - 6, T - 9, 1, 0, T / 2 - 1, -(D / 2 + 0.6), cloth(a)], [2, 9, 1, -(mid - 4), T - 4, -(D / 2 + 0.6), cloth(a)], [2, 9, 1, mid - 4, T - 4, -(D / 2 + 0.6), cloth(a)]);
    hips.push([hipW, 22, 1, 0, -7, -(BD / 2 + 1), cloth(a)]);
  }
  if (L.belt) hips.push([hipW + 1, 3, BD + 2.4, 0, 3, 0, leather(L.belt, { draw: { front: [[(hipW >> 1) - 1, 0, 3, 0, GOLD]] } })]);
  if (L.bandolier) chest.push([4, T * 1.25, 1, 0, T / 2, -(D / 2 + 1.1), leather(L.bandolier, { draw: { all: [[1, 3, 2, 2, PALE], [1, 9, 2, 2, PALE], [1, 15, 2, 2, PALE]] } }), -0.55]);
  if (L.pouch) hips.push([6, 8, 5, (hipW >> 1) + 1, -2, -3, leather(LEATHER)], [7, 2.4, 5.4, (hipW >> 1) + 1, 1, -3, leather(COVER)]);
  if (L.skirt === 'long') hips.push([hipW + 2, 7, BD + 4, 0, -2, 0, cloth(L.bottom)], [hipW + 5, 8, BD + 7, 0, -8, 0, cloth(L.bottom)], [hipW + 8, 9, BD + 10, 0, -15, 0, cloth(L.bottom, { draw: { all: [[0, -2, 0, 1, lighter(L.bottom, 0.4)]] } })]);
  if (L.skirt === 'dress') hips.push([hipW + 2, 7, BD + 4, 0, -1, 0, cloth(top)], [hipW + 5, 7, BD + 7, 0, -7, 0, cloth(top, { draw: { all: [[0, -2, 0, 1, CREAM]] } })]);
  if (L.trim && L.gown) chest.push([3, T, 1, 0, T / 2 - 1, -(D / 2 + 0.2), plain(L.trim)]);
  if (L.bow) chest.push([9, 4, 2, 0, T - 4, -(D / 2 + 1), plain(L.bow)], [3, 5, 2.4, 0, T - 4, -(D / 2 + 1.2), plain(darker(L.bow, 0.2))]);
  if (L.tail) {
    const root = rig.bone(x.hips, 0, 3, BD / 2 + 1), tip = rig.bone(root, 0, -9, 4), fluff = hair(L.hair, { draw: { all: [[0, -4, 0, 4, CREAM]] } });
    rig.add(root, [[5, 11, 5, 0, -4, 1, hair(L.hair)]]);
    rig.add(tip, [[5, 11, 5, 0, -4, 1, fluff]]);
    x.soft.push({ b: root, k: 0.6 }, { b: tip, k: 1, lag: 0.8 });
  }
  if (L.scarf) {
    const end = rig.bone(x.chest, 4, T - 2, D / 2 + 1), s = L.scarf;
    chest.push([W + 3, 6, D + 4, 0, T, 0.4, cloth(s, { draw: { all: [[0, 4, 0, 1, darker(s, 0.3)]] } })]);
    rig.add(end, [[6, 18, 2, 0, -9, 0, cloth(s, { cut: torn(4, 3) })]]);
    x.soft.push({ b: end, k: 0.9, lag: 1.6 });
  }
  if (L.cape) dressCape(rig, x, L, P);
  if (L.hat === 'hood') chest.push([W + 5, 5, D + 5, 0, T, 0.5, cloth(L.hatColor)]);
  if (L.back) chest.push(...BACK_ITEMS[L.back](T));
  if (L.quiver) chest.push([6, 24, 6, 8, T - 8, D / 2 + 3, leather(LEATHER, { draw: { all: [[0, 2, 0, 2, COVER]] } }), -0.25], ...[0, 3, -3].map(a => [2, 8, 2, 11 + a, T + 7, D / 2 + 3, plain(LINEN), -0.25]), ...[0, 3, -3].map(a => [3, 4, 1, 12 + a, T + 11, D / 2 + 3, plain(RED), -0.25]));
  rig.add(x.chest, chest);
  rig.add(x.hips, hips);
}
function dressArms(rig, x, L, P) {
  const W = P.armW, bare = L.bareArms, sleeveC = L.coat || L.top, cuffC = L.trim || (L.armor ? L.armor : darker(sleeveC, 0.3));
  const sleeve = bare ? flesh(L.skin) : cloth(sleeveC), fore = bare ? flesh(L.skin) : cloth(sleeveC, { draw: { all: [[0, -3, 0, 3, cuffC]] } });
  const palm = L.gloves ? (L.plate ? metal(L.gloves) : leather(L.gloves)) : flesh(L.skin), k = W / 7;
  x.arms.forEach((arm, i) => {
    const upper = [[W, P.upper + 1, W + 1, 0, 0.5 - P.upper / 2, 0, sleeve]];
    if (L.armor && L.plate) { // pauldrons of two lames, the mark of something that means business
      const a = L.armor, trim = L.trim || lighter(a, 0.3);
      upper.push([W + 5, 7, W + 6, 0, 1.5, 0, metal(a, { draw: { all: [[0, -1, 0, 1, trim]] } })], [W + 3, 5, W + 4, 0, -3.5, 0, metal(darker(a, 0.14))]);
    } else if (L.armor) upper.push([W + 3, 6, W + 4, 0, 0.5, 0, leather(L.armor)]);
    rig.add(arm, upper);
    const lower = [[W, P.fore + 1, W + 1, 0, 0.5 - P.fore / 2, 0, fore]];
    if (L.armor && L.plate) lower.push([W + 1.4, P.fore - 2, W + 2.4, 0, -P.fore / 2 - 0.5, 0, metal(L.armor, { draw: { all: [[0, 0, 0, 1, lighter(L.armor, 0.3)]] } })]);
    else if (L.armor) lower.push([W + 1, P.fore - 4, W + 2, 0, -P.fore / 2 - 1, 0, leather(L.armor, { draw: { all: [[0, 3, 0, 1, GOLD], [0, -3, 0, 1, GOLD]] } })]);
    rig.add(x.fores[i], lower);
    rig.add(x.hands[i], handBoxes(palm, k));
  });
  if (L.held) { rig.add(x.hands[1], TOOLS[L.held]); x.carry[1] = true; }
  if (L.off) { rig.add(L.off === 'shield' ? x.fores[0] : x.hands[0], CARRIED[L.off]); x.carry[0] = true; }
}

// ---------------- the head ----------------
// Hair is a shell around the head with its edge cut out of it, so that the fringe can be any shape and the face shows behind.
const HAIR_W = 16, FRINGES = {
  short: i => [4, 5, 4, 3, 4, 3, 4, 3, 4, 4, 3, 4, 3, 4, 5, 4][i],
  spiky: i => [5, 3, 5, 2, 5, 3, 4, 2, 5, 3, 5, 2, 4, 3, 5, 4][i],
  swept: i => Math.max(2, 7 - (i >> 1)),
  messy: i => [6, 3, 5, 4, 2, 5, 3, 6, 2, 4, 5, 2, 5, 3, 6, 4][i],
  crop: () => 3,
  parted: i => 2 + (Math.abs(i - 7) >> 1),
  blunt: () => 5,
};
const FRINGE_OF = { long: 'parted', ponytail: 'short', bob: 'blunt', side: 'swept', twintails: 'blunt', braid: 'parted' };
function shellCut(style, female) {
  const fringe = FRINGES[FRINGE_OF[style] || style] || FRINGES.short, longSides = female || style === 'long' || style === 'bob', sides = longSides ? 15 : style === 'crop' ? 6 : 8;
  return (i, j, W, H, f) => {
    if (f === 'bottom') return true;
    if (f === 'front') return j >= fringe(Math.floor(i * HAIR_W / W)) + (i < 1 || i >= W - 1 ? (longSides ? 12 : 4) : 0);
    if (f === 'left' || f === 'right') return j >= ((f === 'left' ? i >= W - 3 : i < 3) ? sides - 2 : sides);
    return f === 'back' && j >= (longSides ? H : H - 2);
  };
}
function hairOf(rig, x, L) {
  const H = L.hair, style = L.style, capped = !!L.hat && !['leaves', 'nurse'].includes(L.hat), strand = hair(H), list = [[16, 16, 16, 0, 9.2, 0, hair(H, { cut: shellCut(style, L.female) })]];
  const hang = (px, py, pz, boxes, k = 0.45, lag = 0) => { const b = rig.bone(x.head, px, py, pz); rig.add(b, boxes); x.soft.push({ b, k, lag }); };
  if (!capped) {
    if (style === 'spiky') list.push([4, 4, 4, -5, 18, -2, strand, 0.35], [4, 5, 4, -1, 19, 1, strand, 0.1], [4, 4, 4, 3, 19, -3, strand, -0.2], [4, 4, 4, 6, 17.5, 3, strand, -0.5], [4, 3, 4, -3, 18, 5, strand]);
    if (style === 'messy') list.push([6, 3, 6, -4, 18, -3, strand, 0.25], [5, 3, 5, 4, 18.5, 1, strand, -0.3], [4, 2.4, 4, 0, 18, 5, strand]);
    if (style === 'swept') list.push([11, 3, 8, 3, 18.5, -4, strand, -0.12], [6, 3, 6, 7, 17, -6, strand, -0.4]);
  }
  if (style === 'long') hang(0, 6, 8.5, [[15, 22, 2.4, 0, -9, 0, hair(H, { cut: torn(3, 5) })]], 0.35);
  if (style === 'side') hang(6, 8, -7, [[5, 15, 4, 0, -6, 0, hair(H, { cut: torn(3, 6) })]], 0.25, 1);
  if (style === 'bob') list.push([17, 8, 17, 0, 5, 0.3, hair(H, { cut: (i, j, W, Hh, f) => f === 'front' || f === 'top' || f === 'bottom' || torn(2, 8)(i, j, W, Hh, f) })]);
  const ribbon = L.bow || RED;
  if (style === 'ponytail') { list.push([5, 3, 2.4, 0, 14, 9, plain(ribbon)]); hang(0, 14, 9, [[6, 8, 5, 0, -4, 1.5, strand], [5, 12, 4, 0, -13, 2, hair(H, { cut: torn(3, 9) })]], 0.55); }
  if (style === 'braid') hang(0, 8, 8.5, [[5, 7, 4, 0, -3, 0, strand], [4, 7, 4, 0, -10, 0, strand], [4, 6, 3, 0, -16, 0, strand], [5, 2.4, 3.4, 0, -19, 0, plain(ribbon)], [3, 3, 3, 0, -21.5, 0, strand]], 0.45);
  if (style === 'twintails') for (const s of [-1, 1]) { list.push([3, 3, 3, s * 9, 14, 1, plain(ribbon)]); hang(s * 10, 13, 1, [[5, 7, 5, s, -3, 0, strand], [6, 9, 5, s * 1.5, -10, 0, strand], [4, 7, 4, s * 1.5, -17, 0, hair(H, { cut: torn(2, 4) })]], 0.5, s); }
  return list;
}
function helmetOf(L) {
  const a = L.armor, seam = darker(a, 0.45), p = L.plume || RED;
  const visor = [[1, 7, 15, 2, COAL], [7, 3, 1, 12, seam], ...both(4, 10, 1, 1, COAL), ...both(4, 12, 1, 1, COAL), ...both(2, 11, 1, 1, COAL), [0, 0, 0, 1, L.trim || lighter(a, 0.4)]];
  return [[17, 17, 17, 0, 9, 0, metal(a, { draw: { front: visor, all: [[0, -1, 0, 1, L.trim || seam]], top: [[7, 0, 3, 0, L.trim || GOLD]] } })], [3, 3, 16, 0, 19, 0, metal(darker(a, 0.2))], [3, 5, 15, 0, 22.5, 1, plain(p)], [3, 11, 4, 0, 18, 10.5, plain(p)]];
}
function hoodOf(c) {
  const shell = cloth(c, { cut: (i, j, W, H, f) => f === 'bottom' || (f === 'front' && j >= 2 && j < H - 1 && i >= 2 && i < W - 2) }), peak = cloth(darker(c, 0.1));
  return [[18, 18, 18, 0, 9, 0.3, shell], [12, 3, 12, 0, 19, 1, peak], [9, 6, 5, 0, 15, 11, peak], [6, 5, 4, 0, 11, 14, peak], [3, 4, 3, 0, 7, 16, peak]];
}
function hatOf(L) {
  const c = L.hatColor, list = [];
  if (L.hat === 'nurse') list.push([11, 4, 2.4, 0, 18, -5, plain(CREAM)], [3, 1, 1, 0, 18, -6.6, plain(RED)], [1, 3, 1, 0, 18, -6.6, plain(RED)]);
  if (L.hat === 'chef') list.push([17, 3, 17, 0, 17, 0, cloth(CREAM)], [19, 9, 19, 0, 23, 0, cloth(CREAM)]);
  if (L.hat === 'straw') list.push([28, 1.4, 28, 0, 17, 0, cloth(0xd8b868)], [15, 9, 15, 0, 21, 0, cloth(0xd8b868, { draw: { all: [[0, 7, 0, 2, RED]] } })]);
  if (L.hat === 'bandana') list.push([17, 5, 17, 0, 15.5, 0, cloth(c, { draw: { all: [[0, -2, 0, 1, darker(c, 0.3)]] } })], [5, 3, 2.4, 0, 15, 9.5, cloth(c)], [2, 7, 1, -1.5, 11, 10, cloth(c)], [2, 7, 1, 1.5, 11, 10, cloth(c)]);
  if (L.hat === 'veil') list.push([17, 5, 17, 0, 15.5, 0, cloth(c)], [17, 22, 2.4, 0, 4, 9, cloth(c)], [1.4, 15, 8, -8.4, 7, 5, cloth(c)], [1.4, 15, 8, 8.4, 7, 5, cloth(c)], [17, 1.4, 1, 0, 14, -8.6, plain(CREAM)]);
  if (L.hat === 'leaves') for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; list.push([4, 2.4, 3, Math.cos(a) * 8.6, 14.5, Math.sin(a) * 8.6, plain(i % 2 ? LEAF : 0xc98aa8)]); }
  if (L.hat === 'feather') list.push([17, 5, 17, 0, 16, 0, cloth(PLUM)], [22, 1.4, 22, 0, 14, 0, cloth(PLUM)], [1.4, 13, 4, 7, 22, 4, plain(GOLD), -0.4], [1, 11, 1, 7, 22, 4, plain(AMBER), -0.4]);
  if (L.hat === 'feathers') {
    list.push([17, 3, 17, 0, 15, 0, cloth(RED, { draw: { all: [[0, 1, 0, 1, GOLD]] } })]);
    for (let i = 0; i < 5; i++) list.push([3, 15, 2, -6 + i * 3, 21, 7, plain([RED, GOLD, SKY][i % 3]), (2 - i) * 0.18]);
  }
  return list;
}
function crownOf(L) {
  const list = [], bright = metal(GOLD);
  if (L.crown === 'crown') {
    list.push([15, 3, 15, 0, 18, 0, metal(GOLD, { draw: { front: [[6, 1, 3, 1, RED]] } })]);
    for (const [a, b] of [[-6, -6], [0, -6], [6, -6], [-6, 6], [0, 6], [6, 6], [-6, 0], [6, 0]]) list.push([3, 3.4, 3, a, 21, b, bright]);
  }
  if (L.crown === 'tiara') list.push([15, 1.6, 1.4, 0, 14.5, -8.2, bright], [3, 3, 1.4, 0, 16, -8.4, plain(0x7ae0ff)], [2, 2, 1.4, -3, 15.5, -8.2, bright], [2, 2, 1.4, 3, 15.5, -8.2, bright]);
  if (L.crown === 'horns') { const low = metal(SLATE), high = metal(DUSK), tip = metal(PALE); for (const s of [-1, 1]) list.push([4, 7, 4, s * 7.5, 19, 0, low, s * -0.5], [3, 7, 3, s * 11, 24, 0, high, s * -0.7], [2, 7, 2, s * 15.5, 28, 0, tip, s * -1]); }
  return list;
}
function dressHead(rig, x, L) {
  const skin = flesh(L.skin), list = [[7, 3, 7, 0, 0.5, 0, skin], [15, 15, 15, 0, 9, 0, skin], [1, 4, 3, -8, 8, 1, skin], [1, 4, 3, 8, 8, 1, skin]];
  if (L.helmet) list.push(...helmetOf(L));
  else if (L.hat === 'hood') list.push(...hoodOf(L.hatColor));
  else list.push(...hairOf(rig, x, L));
  if (L.elfEars && !L.helmet) for (const s of [-1, 1]) list.push([6, 2.4, 2.4, s * 10, 8.5, 1, skin, s * 0.35], [4, 2, 2, s * 13, 10, 1, skin, s * 0.6]);
  if (L.catEars) { const fur = hair(L.hair); for (const s of [-1, 1]) list.push([5, 5, 2.4, s * 5, 19, 1, fur], [3, 3, 2.4, s * 5, 22.5, 1, fur], [3, 3, 1, s * 5, 19, -0.4, plain(0xc98aa8)]); }
  list.push(...hatOf(L), ...crownOf(L));
  rig.add(x.head, list);
  x.face = new THREE.Mesh(new THREE.PlaneGeometry(FACE, FACE), faceOf(L, 'open'));
  x.face.position.set(0, 9, -7.56); x.face.rotation.y = Math.PI;
  x.head.add(x.face);
}

// ---------------- build ----------------
export function buildAvatar(L, height, mats) {
  const P = BUILDS[L.build], headScale = P.headScale ?? 1, neck = P.trunk + 1;
  const rig = new Rig(height * P.stature, P.leg + 4 + neck + CROWN * headScale, mats), x = figureBones(rig, { ...P, neck });
  x.look = L; x.mood = 'open'; x.busy = L.busy;
  if (L.mermaid) { x.legs = []; x.shins = []; dressMermaid(rig, x, L); }
  else if (L.gown) { x.legs = []; x.shins = []; dressHem(rig, x, L, P); }
  else dressLegs(rig, x, L, P);
  dressTrunk(rig, x, L, P);
  dressArms(rig, x, L, P);
  dressHead(rig, x, L);
  rig.finish();
  x.head.scale.setScalar(headScale); // after binding, or the bind pose would simply undo it
  return { g: rig.g, extra: x, pose: poseAvatar };
}

const BLINK_EVERY = 3.9, BLINK = 0.13, WORK_EVERY = 3.4, WORK_BLOW = 1.1;
export function poseAvatar(x, m) {
  const clock = m.t + m.seed * 1.7;
  // Someone with a tool and nothing better to do gets on with the job, until there is somebody to look at.
  if (x.busy && !m.strike && !m.near && m.walk < 0.1 && clock % WORK_EVERY < WORK_BLOW) m.strike = (clock % WORK_EVERY) / WORK_BLOW;
  poseFigure(x, m);
  const mood = m.hurt > 0.2 ? 'hurt' : clock % BLINK_EVERY < BLINK ? 'shut' : m.cross ? 'cross' : 'open';
  if (mood !== x.mood) { x.mood = mood; x.face.material = faceOf(x.look, mood); }
}

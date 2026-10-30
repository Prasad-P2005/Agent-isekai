// People, as Minecraft skins are drawn: an 8 pixel head on a 12 pixel body and 12 pixel legs, every surface shaded by hand in big
// pixels (see paint.js), with armour, capes and hair as chunky layers on top. Men are grown and serious, and every girl is cute.
import * as THREE from 'three';

import { COAL, COVER, CREAM, DUSK, GOLD, LEAF, LEATHER, LILAC, LINEN, MAUVE, PALE, PLUM, RED, ROSE, SKY, SLATE, lookFor } from './outfits.js';
import { both, cloth, drape, flesh, hair, leather, metal, plain, torn, wood } from './paint.js';
import { poseFigure } from './pose.js';
import { INK, LIFT, Rig, figureBones, held, mixHex } from './voxel.js';

export { lookFor };
// The player's own character, seen in the bag and in the hand at the corner of the view.
export const heroLook = () => lookFor('villager', 'adventurer', 23, { race: 'human' });

// ---------------- the face: 8x8 as on a skin, and 15x15 on a girl, because cute needs the extra pixels ----------------
const FACE = 8, GIRL_FACE = 15, faces = new Map();
const darker = (c, k = 0.3) => mixHex(c, INK, k), lighter = (c, k = 0.3) => mixHex(c, CREAM, k);

function girlFace(put, L, mood) {
  const skin = L.skin, iris = L.eyes, blush = mixHex(skin, ROSE, 0.32);
  put(0, 0, GIRL_FACE, GIRL_FACE, skin);
  put(0, 0, GIRL_FACE, 3, darker(skin, 0.14));
  for (const [x, outer] of [[2, 1], [9, 13]]) {
    put(x + 1, 5, 2, 1, darker(L.hair, 0.2));
    put(x - 1 + (x === 2 ? 0 : 2), 11, 3, 1, blush);
    if (mood === 'shut') { put(x, 9, 4, 1, INK); continue; }
    if (mood === 'hurt') { put(x, 7, 4, 1, INK); put(x + 1, 8, 2, 1, INK); put(x, 9, 4, 1, INK); continue; }
    put(x, 6, 4, 1, INK); put(outer, 6, 1, 2, INK);
    put(x, 7, 4, 4, iris);
    put(x, 7, 4, 1, darker(iris, 0.4));
    put(x + 1, 8, 2, 2, INK);
    put(x, 10, 4, 1, lighter(iris, 0.45));
    put(x, 7, 1, 1, CREAM); // a sparkle at the top of each eye, and a small one below it
    put(x + 3, 9, 1, 1, CREAM);
  }
  if (mood === 'hurt') { put(6, 12, 3, 2, INK); return; }
  const lip = mixHex(skin, RED, 0.42);
  put(6, 12, 1, 1, lip); put(7, 13, 1, 1, lip); put(8, 12, 1, 1, lip);
}
function drawFace(put, L, mood) {
  if (L.female) return girlFace(put, L, mood);
  const skin = L.skin, shade = darker(skin, 0.18), deep = darker(skin, 0.4);
  if (L.hooded) { // in the shadow of the hood, there is only a glint of eyes
    put(0, 0, FACE, FACE, darker(L.hatColor, 0.82));
    if (mood !== 'shut') { const glint = mood === 'cross' ? RED : lighter(L.eyes, 0.5); put(2, 4, 1, 1, glint); put(5, 4, 1, 1, glint); }
    return;
  }
  const brow = darker(L.hair, 0.3), demon = L.job === 'demon_lord';
  put(0, 0, FACE, FACE, skin);
  put(0, 0, FACE, 2, shade); put(0, 2, 1, 6, shade); put(7, 2, 1, 6, shade);
  for (const [x, inner] of [[1, 2], [5, 5]]) {
    put(x, 3, 2, 1, brow);
    if (mood === 'cross' || demon) put(inner, 4, 1, 1, brow); // drawn down to the nose
  }
  if (mood === 'shut') { put(1, 4, 2, 1, deep); put(5, 4, 2, 1, deep); }
  else if (mood === 'hurt') { put(1, 4, 2, 1, INK); put(5, 4, 2, 1, INK); }
  else if (!(demon)) { put(1, 4, 1, 1, CREAM); put(2, 4, 1, 1, L.eyes); put(5, 4, 1, 1, L.eyes); put(6, 4, 1, 1, CREAM); }
  else { put(1, 4, 1, 1, L.eyes); put(6, 4, 1, 1, L.eyes); }
  put(3, 5, 2, 1, shade);
  if (L.old) { put(1, 5, 2, 1, shade); put(5, 5, 2, 1, shade); }
  put(3, 6, 2, 1, mood === 'hurt' ? INK : deep);
  if (L.beard) { put(0, 6, 8, 2, L.beard); put(1, 5, 1, 1, L.beard); put(6, 5, 1, 1, L.beard); put(3, 6, 2, 1, darker(skin, 0.5)); }
  if (L.glasses) { for (const x of [1, 5]) { put(x, 3, 2, 1, INK); put(x, 5, 2, 1, INK); } put(3, 4, 2, 1, INK); put(0, 4, 1, 1, INK); put(7, 4, 1, 1, INK); }
}
function faceOf(L, mood) {
  const key = [L.skin, L.eyes, L.hair, L.female, L.glasses, L.job === 'demon_lord', L.beard, L.old, L.hooded, L.hatColor, mood].join();
  if (faces.has(key)) return faces.get(key);
  const size = L.female ? GIRL_FACE : FACE, px = new Uint8Array(size * size * 4);
  // Rows run bottom to top here, which is the way up a plane's coordinates are.
  drawFace((x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      const k = ((size - 1 - j) * size + i) * 4;
      px[k] = c >> 16 & 255; px[k + 1] = c >> 8 & 255; px[k + 2] = c & 255; px[k + 3] = 255;
    }
  }, L, mood);
  const tex = new THREE.DataTexture(px, size, size, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: LIFT });
  mat.userData.shared = true; // outlives any one character: other people may be wearing this face
  faces.set(key, mat);
  return mat;
}

// ---------------- what hands hold ----------------
// Tilts allow for the bent elbow of an arm carrying something: UP ends up upright and OUT keeps a long pole clear of the face.
const FORWARD = -1.2, UP = -0.72, OUT = -0.14, GRIP = -1;
const IRON = metal(PALE), BRASS = metal(GOLD), SHAFT = wood(COVER);
const TOOLS = {
  sword: held(FORWARD, [[1, 3, 1, -0.5, leather(COVER), 0], [4, 1, 1, 1.4, BRASS], [1.6, 12, 0.8, 8, IRON]], GRIP),
  doom: held(-1.6, [[1.4, 5, 1.4, 0, leather(COVER)], [8, 1.4, 2, 3, metal(DUSK)], [3.4, 24, 1, 16, metal(SLATE)], [1, 24, 1.4, 16, metal(RED)]], GRIP, -0.3),
  spear: held(UP, [[1, 26, 1, 5, SHAFT], [2.4, 5, 1, 20, IRON]], GRIP, OUT),
  staff: held(UP, [[1.2, 24, 1.2, 4, SHAFT], [3, 3, 3, 17, plain(LILAC)]], GRIP, OUT),
  trident: held(UP, [[1.2, 24, 1.2, 4, BRASS], [6, 1.2, 1.2, 15, BRASS], [1.2, 5, 1.2, 18, BRASS]], GRIP, OUT),
  regalia: held(UP, [[1.2, 26, 1.2, 5, BRASS], [3.6, 3.6, 3.6, 19, plain(RED)], [1, 3.6, 1, 22, BRASS], [3, 1, 1, 22, BRASS]], GRIP, -0.24),
  hammer: held(FORWARD, [[1, 9, 1, 2, SHAFT], [3.4, 5, 3.4, 7, metal(MAUVE)]], GRIP),
  hoe: held(UP, [[1, 22, 1, 3, SHAFT], [1, 2, 4.6, 14, metal(MAUVE)]], GRIP, OUT),
  rod: held(-1.05, [[0.8, 26, 0.8, 6, SHAFT]], GRIP, OUT),
  pin: held(FORWARD, [[2.4, 7, 2.4, 1.6, wood(LINEN)]], GRIP),
  mug: [[2.8, 3.4, 2.8, 0, -2, -2.6, wood(LEATHER)]],
};
const CARRIED = {
  shield: [[1, 11, 8, -2.6, -2, 0, plain(0x2f78b8, { draw: { side: [[3, 0, 2, 0, GOLD], [0, 3, 0, 2, GOLD]] } })]],
  book: [[2.4, 6, 4.6, -0.6, -3, 0, leather(RED)]],
  basket: [[4.6, 3.2, 4.6, -0.4, -4.6, 0, wood(LEATHER)], [3.4, 0.8, 3.4, -0.4, -2.8, 0, plain(LEAF)]],
};
const BACK_ITEMS = {
  sword: (T, D) => [[1.6, 15, 1, 0.6, T - 3, D / 2 + 0.6, leather(COVER), 0.5], [4.6, 1, 1.2, -3, T + 3, D / 2 + 0.6, BRASS, 0.5], [1, 3.4, 1, -4.2, T + 5, D / 2 + 0.6, leather(COVER), 0.5]],
  bow: (T, D) => [[1, 19, 1.2, -2, T - 4, D / 2 + 0.6, wood(COVER), 0.08]],
  lute: (T, D) => [[5.6, 6.6, 2, 0.8, T - 4, D / 2 + 1, wood(LEATHER), 0.4], [1.2, 7.4, 1.2, -2.7, T + 3, D / 2 + 1, SHAFT, 0.4]],
  pack: (T, D) => [[8, 8.6, 4.6, 0, T - 3.5, D / 2 + 2.3, leather(COVER)], [6.6, 1.4, 3.4, 0, T + 1.4, D / 2 + 2.3, cloth(0xcf7f4e)]],
};

// ---------------- the body ----------------
// Numbers are the world's pixels. Everyone is the same height: 12 of leg, 12 of body and 8 of head, which is what a skin is.
// `chest` is width and depth, `arm` the same for a limb, and the body is `C` tall above a hip of 3.
const BASE = { leg: 12, C: 9, upper: 6, fore: 4, headScale: 1 };
const BUILDS = {
  normal: { ...BASE, chest: [8, 4], arm: [4, 4], thigh: [4, 4], span: 6, stance: 2 },
  strong: { ...BASE, chest: [10, 5], arm: [5, 5], thigh: [5, 5], span: 7.5, stance: 2.5 },
  slim: { ...BASE, chest: [7, 4], arm: [3, 4], thigh: [3.6, 4], span: 5, stance: 1.8 },
  stout: { ...BASE, chest: [10, 6], arm: [4, 4], thigh: [4.6, 5], span: 7, stance: 2.4 },
  girl: { ...BASE, chest: [7, 4], arm: [3, 3], thigh: [3.4, 3.6], span: 5, stance: 1.8, headScale: 1.14 },
  mermaid: { ...BASE, leg: 19, chest: [7, 4], arm: [3, 3], thigh: [3.4, 3.6], span: 5, stance: 1.8, headScale: 1.14 },
  giant: { leg: 17, C: 13, upper: 8, fore: 7, headScale: 1.15, chest: [13, 7], arm: [6, 6], thigh: [6, 6], span: 9.5, stance: 3.2 },
};
const CROWN = 9; // from the neck to the top of the hair

function dressLegs(rig, x, L, P) {
  const [W, D] = P.thigh, thigh = Math.ceil(P.leg / 2) - 1, shin = Math.floor(P.leg / 2), cover = L.skirt ? flesh(L.skin) : cloth(L.bottom), boots = L.gauntlets && L.plate ? metal(L.shoes) : leather(L.shoes);
  x.legs.forEach((bone, i) => {
    rig.add(bone, [[W, thigh + 1, D, 0, -thigh / 2, 0, cover]]);
    const lower = [[W - 0.08, shin, D - 0.08, 0, -shin / 2, 0, cover], [W + 0.5, shin * 0.6, D + 0.5, 0, -shin * 0.7, 0, boots]]; // a hair narrower, or the overlap with the thigh flickers
    if (L.plate) lower.push([W + 0.8, 2.4, D + 0.8, 0, 0, 0, metal(L.armor)]); // the knee
    rig.add(x.shins[i], lower);
  });
}
// A robe to the floor in three steps, on a bone of its own so that it can swing.
function dressHem(rig, x, L, P) {
  const hem = rig.bone(x.hips, 0, 0, 0), [W, D] = P.chest, h = (P.leg + 1) / 3, list = [];
  for (let i = 0; i < 3; i++) {
    const w = W + 1 + i * 1.4, mid = (Math.round(w) >> 1) - 1;
    list.push([w, h + 0.3, D + 1 + i * 1.4, 0, 1 - h * (i + 0.5), 0, drape(L.bottom, { draw: { front: L.trim ? [[mid, 0, 2, 0, L.trim]] : [], all: L.trim && i === 2 ? [[0, -1, 0, 1, L.trim]] : [] } })]);
  }
  rig.add(hem, list);
  x.soft.push({ b: hem, k: 0.2 });
}
// A long tapering tail, ending in a broad fan.
function dressMermaid(rig, x, L) {
  const c = L.bottom, fan = plain(lighter(c, 0.45));
  x.tail = []; x.swims = true; x.legs = []; x.shins = [];
  let parent = x.hips, at = -0.5;
  [[6, 5, 4], [5, 5, 4], [4, 5, 3], [3, 4, 2.4]].forEach(([w, h, d]) => {
    const b = rig.bone(parent, 0, at, 0);
    rig.add(b, [[w, h + 0.4, d, 0, -h / 2, 0, cloth(c)]]);
    x.tail.push(b); parent = b; at = -h;
  });
  const fin = rig.bone(parent, 0, at, 0);
  rig.add(fin, [[2.4, 2, 1.6, 0, -0.5, 0, fan], [5, 4, 1, -2.4, -2, 0, fan, 0.55], [5, 4, 1, 2.4, -2, 0, fan, -0.55], [3, 2.4, 1, -5.6, -4.6, 0, fan, 0.85], [3, 2.4, 1, 5.6, -4.6, 0, fan, -0.85]]);
  x.tail.push(fin);
}
function dressCape(rig, x, L, P) {
  const c = L.cape, [W, D] = P.chest, len = L.mantle ? 11.5 : Math.round(P.leg * 0.72), wide = W + 2;
  const sheet = tear => drape(c, { draw: { front: [[0, 0, 0, 0, darker(c, 0.3)]], back: L.trim && !tear ? [[0, -1, 0, 1, L.trim]] : [] }, cut: tear ? torn(3, c & 255) : undefined });
  const upper = rig.bone(x.chest, 0, P.C - 1, D / 2 + 0.5), lower = rig.bone(upper, 0, -len, 0);
  rig.add(upper, [[wide, len + 0.4, 0.8, 0, -len / 2, 0, sheet(false)]]);
  rig.add(lower, [[wide, len, 0.8, 0, -len / 2, 0, sheet(L.torn)]]);
  x.soft.push({ b: upper, k: L.mantle ? 0.35 : 0.6 }, { b: lower, k: L.mantle ? 0.3 : 0.5, lag: 0.7 });
}
function dressTrunk(rig, x, L, P) {
  const C = P.C, [W, D] = P.chest, mid = W >> 1, hipW = L.female ? W + 1 : W, skin = L.skin, list = [], hips = [];
  const art = [];
  if (L.gown && L.trim) art.push([mid - 1, 0, 2, 0, L.trim]);
  else if (L.apron) art.push([mid - 2, 3, 4, 0, L.apron]);
  else if (L.mermaid) art.push([0, 0, 0, 2, skin], ...both(1, 2, 1, 1, CREAM));
  else if (!L.armor && !L.coat) art.push([mid - 1, 0, 2, 2, skin], [mid, 2, 1, 1, darker(L.top, 0.3)]);
  list.push([W, C + 0.4, D, 0, C / 2 - 0.2, 0, (L.gown ? drape : cloth)(L.top, { draw: { front: art } })]);

  const beltFront = [[(hipW >> 1) - 1, 0, 2, 2, GOLD]];
  if (L.apron) beltFront.push([(hipW >> 1) - 2, 0, 4, 0, L.apron]);
  hips.push([hipW + 0.12, 3.6, D + (L.female ? 0.4 : 0.12), 0, 1.2, 0, cloth(L.bottom, { draw: { all: L.belt ? [[0, 0, 0, 1, L.belt]] : [], front: L.belt ? beltFront : L.apron ? beltFront.slice(1) : [] } })]);
  if (L.skirt) hips.push([hipW + 1, 3, D + 1.4, 0, -1.2, 0, drape(L.bottom)], [hipW + 2, 3.4, D + 2.4, 0, -3.6, 0, drape(L.bottom, { draw: { all: [[0, -1, 0, 1, lighter(L.bottom, 0.5)]] } })]);

  if (L.armor) {
    const a = L.armor, trim = L.trim ?? lighter(a, 0.25), paint = L.plate ? metal : leather;
    list.push([W + 0.7, C - 1, D + 0.7, 0, C / 2 + 0.2, 0, paint(a, { draw: { front: [[mid - 1, 0, 2, 0, darker(a, 0.28)], [0, -1, 0, 1, trim]] } })]);
  }
  if (L.tabard) {
    const c = L.tabard, cross = L.trim ? [[1, 2, 3, 1, L.trim], [2, 1, 1, 4, L.trim]] : [];
    list.push([5, C - 1, 0.5, 0, C / 2 - 0.4, -(D / 2 + 0.6), cloth(c, { draw: { all: cross } })]);
    hips.push([5, 8, 0.5, 0, -2.4, -(D / 2 + 0.6), drape(c, { cut: torn(2, 3) })], [5, 7, 0.5, 0, -2, D / 2 + 0.6, drape(c, { cut: torn(2, 4) })]);
  }
  if (L.coat) {
    const c = L.coat, t = L.trim, open = [[mid - 1, 0, 2, 0, L.top], ...(t ? [[mid - 2, 0, 1, 0, t], [mid + 1, 0, 1, 0, t]] : [])];
    list.push([W + 0.7, C + 0.4, D + 0.7, 0, C / 2 - 0.2, 0, cloth(c, { draw: { front: open } })]);
    const hem = rig.bone(x.hips, 0, 1, 0), len = Math.round(P.leg * 0.75);
    rig.add(hem, [[W + 1, len, D + 1, 0, -len / 2, 0, drape(c, { draw: { all: t ? [[0, -1, 0, 1, t]] : [] }, cut: (i, j, Wd, H, f) => f === 'front' && Math.abs(i - (Wd - 1) / 2) < 1 })]]);
    x.soft.push({ b: hem, k: 0.2 });
  }
  if (L.tail) {
    const root = rig.bone(x.hips, 0, 1, D / 2 + 0.4), tip = rig.bone(root, 0, -4, 1.6);
    rig.add(root, [[2, 4.4, 2, 0, -1.6, 0.4, hair(L.hair)]]);
    rig.add(tip, [[2, 4.4, 2, 0, -1.6, 0.4, hair(L.hair, { draw: { all: [[0, -2, 0, 2, CREAM]] } })]]);
    x.soft.push({ b: root, k: 0.6 }, { b: tip, k: 1, lag: 0.8 });
  }
  if (L.cape) dressCape(rig, x, L, P);
  if (L.mantle) list.push([W + 3, 2.8, D + 2.6, 0, C - 0.6, 0.2, plain(CREAM, { draw: { all: [...both(1, 1, 1, 1, INK), ...both(4, 0, 1, 1, INK)] } })]); // ermine
  if (L.scarf) list.push([W + 1.4, 2.2, D + 2, 0, C - 0.2, 0.2, drape(L.scarf)], [W + 2.2, 1.4, 1.2, 0, C - 1.8, D / 2 + 0.6, drape(L.scarf)]);
  if (L.hat === 'hood') list.push([W + 1.4, 1.8, D + 1.8, 0, C, 0.2, cloth(L.hatColor)]);
  if (L.back) list.push(...BACK_ITEMS[L.back](C, D));
  rig.add(x.chest, list);
  rig.add(x.hips, hips);
}
function dressArms(rig, x, L, P) {
  const [W, D] = P.arm, skin = flesh(L.skin), sleeve = L.bareArms ? skin : cloth(L.coat || L.top), cuff = L.trim && !L.plate ? { all: [[0, -1, 0, 1, L.trim]] } : undefined;
  const fist = L.gauntlets ? (L.plate || L.pads ? metal(L.gauntlets) : leather(L.gauntlets)) : skin;
  x.arms.forEach((arm, i) => {
    const upper = [[W, P.upper + 0.4, D, 0, 0.2 - P.upper / 2, 0, sleeve]];
    if (L.pads) upper.push([W + 1.2, 2.6, D + 1.2, 0, 0.7, 0, metal(L.pads)]);
    rig.add(arm, upper);
    const lower = [[W - 0.08, P.fore + 0.4, D - 0.08, 0, 0.2 - P.fore / 2, 0, L.bareArms ? skin : cloth(L.coat || L.top, { draw: cuff })]];
    if (L.gauntlets) lower.push([W + 0.4, P.fore - 1, D + 0.4, 0, -P.fore / 2 - 0.4, 0, L.plate || L.pads ? metal(L.gauntlets) : leather(L.gauntlets)]);
    rig.add(x.fores[i], lower);
    rig.add(x.hands[i], [[W + (L.gauntlets ? 0.3 : 0.08), 2, D + (L.gauntlets ? 0.3 : 0.08), 0, -1, 0, fist]]);
  });
  if (L.held) { rig.add(x.hands[1], TOOLS[L.held]); x.carry[1] = true; }
  if (L.off) { rig.add(L.off === 'shield' ? x.fores[0] : x.hands[0], CARRIED[L.off]); x.carry[0] = true; }
}

// ---------------- the head ----------------
// Hair is a shell one pixel wider than the head, with its edge cut out, as the second layer of a skin. Tufts on top give it a shape.
const FRINGES = {
  short: [3, 2, 3, 2, 3, 2, 3, 2, 3], spiky: [3, 1, 3, 2, 1, 3, 1, 2, 3], swept: [4, 4, 3, 3, 2, 2, 2, 1, 2], crop: [2, 2, 2, 2, 2, 2, 2, 2, 2],
  parted: [5, 3, 2, 2, 1, 2, 2, 3, 5], blunt: [3, 3, 3, 3, 3, 3, 3, 3, 3],
};
const FRINGE_OF = { long: 'parted', ponytail: 'blunt', bob: 'blunt', side: 'swept', twintails: 'blunt' };
function shellCut(style, female) {
  const fringe = FRINGES[FRINGE_OF[style] || style] || FRINGES.short, longSides = female || style === 'long', sides = longSides ? 9 : style === 'crop' ? 3 : 5;
  return (i, j, W, H, f) => {
    if (f === 'bottom') return true;
    if (f === 'front') return j >= fringe[Math.min(8, i)] + (i === 0 || i === W - 1 ? (longSides ? 5 : 2) : 0);
    if (f === 'left' || f === 'right') return j >= sides;
    return f === 'back' && j >= (longSides ? H : H - 1);
  };
}
function hairOf(rig, x, L) {
  const H = L.hair, style = L.style, capped = !!L.hat && !['leaves', 'nurse'].includes(L.hat), strand = hair(H), ribbon = plain(L.bow || RED), list = [[9, 9, 9, 0, 4.6, 0, hair(H, { cut: shellCut(style, L.female) })]];
  const hang = (px, py, pz, boxes, k = 0.45, lag = 0) => { const b = rig.bone(x.head, px, py, pz); rig.add(b, boxes); x.soft.push({ b, k, lag }); };
  if (!capped) {
    if (style === 'short' || style === 'crop') list.push([3.4, 1.4, 3.4, -1.6, 9.2, -1, strand], [3, 1, 3, 2, 9.1, 1.4, strand]);
    if (style === 'spiky') list.push([2.4, 2.4, 2.4, -2.6, 9.6, -1, strand, 0.3], [2.4, 3, 2.4, 0, 9.9, 0.6, strand], [2.4, 2.4, 2.4, 2.6, 9.6, -0.6, strand, -0.3], [2.4, 2, 2.4, -0.6, 9.4, 2.8, strand]);
    if (style === 'swept') list.push([6.4, 1.6, 4.6, 0.8, 9.4, -1.6, strand, -0.1], [3, 1.4, 3, 3, 9, -3, strand, -0.3]);
  }
  if (style === 'long') hang(0, 3.4, 4.6, [[8, 10, 1, 0, -4, 0, hair(H, { cut: torn(2, 5) })]], 0.3);
  if (style === 'side') hang(2.8, 4.4, -3.8, [[2.4, 8, 2, 0, -3.6, 0, strand]], 0.25, 1);
  if (style === 'bob') list.push([9.6, 4, 9.6, 0, 2.6, 0.2, hair(H, { cut: (i, j, W, Hh, f) => f === 'front' || f === 'top' || f === 'bottom' })]);
  if (style === 'ponytail') { list.push([2.4, 1.4, 1, 0, 7, 5, ribbon]); hang(0, 7, 5, [[2.6, 9, 2.4, 0, -3.8, 0.8, strand]], 0.55); }
  if (style === 'twintails') for (const s of [-1, 1]) { list.push([1.4, 1.4, 1.4, s * 4.8, 7, 0.4, ribbon]); hang(s * 5.4, 6.6, 0.4, [[2.4, 9, 2.4, s * 0.6, -3.8, 0, strand]], 0.5, s); }
  if (L.female && L.bow && style !== 'ponytail' && style !== 'twintails' && !L.hat && !L.crown) list.push([3.4, 1.4, 1, -2.2, 7.4, -4.4, ribbon]); // a bow in her hair
  return list;
}
const helmetOf = L => {
  const a = L.armor, slit = [[1, 4, 7, 1, COAL], [4, 4, 1, 4, COAL]];
  return [[9, 9.4, 9, 0, 4.4, 0, metal(a, { draw: { front: slit, all: [[0, -1, 0, 1, L.trim ?? darker(a, 0.3)]] } })], [1.4, 3, 7, 0, 10, 0, plain(RED)]];
};
const hoodOf = c => [[9.6, 9.6, 9.6, 0, 4.4, 0.2, cloth(c, { cut: (i, j, W, H, f) => f === 'bottom' || (f === 'front' && j >= 1 && j < H - 1 && i >= 1 && i < W - 1) })], [4, 3, 2, 0, 7, 5.6, cloth(darker(c, 0.1))]];
function hatOf(L) {
  const c = L.hatColor, list = [];
  if (L.hat === 'nurse') list.push([5, 2, 1, 0, 9.2, -2.6, plain(CREAM, { draw: { all: [[2, 0, 1, 2, RED]] } })]);
  if (L.hat === 'chef') list.push([9, 1.4, 9, 0, 8.8, 0, cloth(CREAM)], [10, 4.6, 10, 0, 12, 0, cloth(CREAM)]);
  if (L.hat === 'straw') list.push([14, 0.8, 14, 0, 8.8, 0, cloth(0xd8b868)], [8, 4, 8, 0, 11, 0, cloth(0xd8b868, { draw: { all: [[0, -1, 0, 1, RED]] } })]);
  if (L.hat === 'bandana') list.push([9.4, 3, 9.4, 0, 7.6, 0, cloth(c)]);
  if (L.hat === 'veil') list.push([9.4, 3, 9.4, 0, 7.6, 0, cloth(c)], [9, 11, 1, 0, 2, 5, drape(c)]);
  if (L.hat === 'leaves') for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; list.push([2, 1, 1.6, Math.cos(a) * 4.6, 7.4, Math.sin(a) * 4.6, plain(i % 2 ? LEAF : 0xf3a0c0)]); }
  if (L.hat === 'feather') list.push([9.4, 2.8, 9.4, 0, 8.2, 0, cloth(PLUM)], [0.8, 6, 2, 3.6, 11, 2, plain(GOLD), -0.4]);
  if (L.hat === 'feathers') { list.push([9.4, 1.6, 9.4, 0, 7.8, 0, cloth(RED)]); for (let i = 0; i < 3; i++) list.push([1.6, 7, 0.8, -2.2 + i * 2.2, 11, 3.6, plain([RED, GOLD, SKY][i]), (1 - i) * 0.25]); }
  return list;
}
function crownOf(L) {
  const list = [], gold = metal(GOLD);
  if (L.crown === 'crown') { // a tall one, over a cap of red velvet
    list.push([8.6, 2.4, 8.6, 0, 9.6, 0, gold], [7, 3, 7, 0, 10.4, 0, plain(RED)]);
    for (const [a, b] of [[-3.5, -3.5], [0, -3.5], [3.5, -3.5], [-3.5, 3.5], [0, 3.5], [3.5, 3.5], [-3.5, 0], [3.5, 0]]) list.push([1.6, 2.6, 1.6, a, 11.6, b, gold]);
  }
  if (L.crown === 'tiara') list.push([8, 1, 0.8, 0, 7.4, -4.6, gold], [1.6, 1.6, 0.8, 0, 8, -4.7, plain(0x7ae0ff)]);
  if (L.crown === 'horns') for (const s of [-1, 1]) list.push([2.4, 4, 2.4, s * 4.4, 10.4, 0, metal(SLATE), s * -0.6], [1.6, 4, 1.6, s * 7, 14, 0, metal(PALE), s * -0.8]);
  return list;
}
function dressHead(rig, x, L) {
  // The head has no front of its own: the face plane is its front, and two surfaces that close together would flicker.
  const skin = flesh(L.skin), list = [[8, 8, 8, 0, 4, 0, flesh(L.skin, { cut: (i, j, W, H, f) => f === 'front' })]];
  if (L.helmet) list.push(...helmetOf(L));
  else if (L.hat === 'hood') list.push(...hoodOf(L.hatColor));
  else list.push(...hairOf(rig, x, L));
  if (L.elfEars && !L.helmet) for (const s of [-1, 1]) list.push([5.6, 1.4, 1, s * 6.4, 5.4, 0.4, skin, s * 0.5]);
  if (L.catEars) { const ear = hair(L.hair); for (const s of [-1, 1]) list.push([2.4, 2.8, 1, s * 2.8, 10, 0.4, ear]); }
  if (L.mermaid) for (const s of [-1, 1]) list.push([3, 2.4, 0.6, s * 5.4, 4.6, 0.4, plain(lighter(L.bottom, 0.45)), s * 0.5]); // little fins for ears
  list.push(...hatOf(L), ...crownOf(L));
  rig.add(x.head, list);
  x.face = new THREE.Mesh(new THREE.PlaneGeometry(FACE, FACE), faceOf(L, 'open'));
  x.face.position.set(0, 4, -4); x.face.rotation.y = Math.PI;
  x.head.add(x.face);
}

// ---------------- build ----------------
export function buildAvatar(L, height, mats) {
  const P = BUILDS[L.build], rig = new Rig(height, P.leg + 3 + P.C + CROWN * P.headScale, mats);
  const x = figureBones(rig, { ...P, trunk: P.C, waist: 3, neck: P.C, shoulder: P.C - 1 });
  x.look = L; x.mood = 'open'; x.busy = L.busy; x.bob = 0.4;
  if (L.mermaid) dressMermaid(rig, x, L);
  else if (L.gown) { x.legs = []; x.shins = []; dressHem(rig, x, L, P); }
  else dressLegs(rig, x, L, P);
  dressTrunk(rig, x, L, P);
  dressArms(rig, x, L, P);
  dressHead(rig, x, L);
  rig.finish();
  x.head.scale.setScalar(P.headScale); // after binding, or the bind pose would simply undo it
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

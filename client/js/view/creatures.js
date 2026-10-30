// Everything alive that is not a person: built like people, in art pixels, ink and warm shadow, with a body of its own.
// The colours come from content/creatures.json, so a named monster painted differently still works. A kind with no
// model here falls back on the shape its data asks for.
import * as THREE from 'three';
import { COVER, CREAM, DUSK, GOLD, LEATHER, MAUVE, PALE, ROSE, SLATE } from './outfits.js';
import { poseBeast, poseDragon, poseFigure, poseFlier, poseSlime, poseStone } from './pose.js';
import { INK, Rig, figureBones, handBoxes, held, mixHex, solid } from './voxel.js';

const EMBER = 0xffd24a, FORWARD = -1.2;
const paint = c => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c ?? MAUVE);
const paints = D => ({ body: paint(D.body), head: paint(D.head ?? D.body), hair: paint(D.hair ?? D.body) });
const darker = (c, k = 0.3) => mixHex(c, INK, k), lighter = (c, k = 0.3) => mixHex(c, CREAM, k);

// Plain limbs for any upright body.
function limbs(rig, x, P, { armW = 6, legW = 8, arm, leg, fist, k = 1 }) {
  const thigh = Math.ceil(P.leg / 2) - 1, shin = Math.floor(P.leg / 2), foot = Math.max(3, shin >> 1), calf = shin - foot + 1;
  x.legs.forEach((bone, i) => {
    rig.add(bone, [[legW, thigh + 1, legW + 1, 0, -thigh / 2, 0, leg[0]]]);
    rig.add(x.shins[i], [[legW, calf, legW + 1, 0, -calf / 2, 0, leg[1]], [legW + 1, foot, legW + 5, 0, foot / 2 - shin, -2, leg[2]]]);
  });
  x.arms.forEach((bone, i) => {
    rig.add(bone, [[armW, P.upper + 1, armW + 1, 0, 0.5 - P.upper / 2, 0, arm[0]]]);
    rig.add(x.fores[i], [[armW, P.fore + 1, armW + 1, 0, 0.5 - P.fore / 2, 0, arm[1]]]);
    rig.add(x.hands[i], handBoxes(fist, k));
  });
}
function hang(rig, x, parent, px, py, pz, boxes, k, lag = 0) {
  const b = rig.bone(parent, px, py, pz);
  rig.add(b, boxes);
  x.soft.push({ b, k, lag });
  return b;
}

// ---------------- the small and the wicked ----------------
function goblin(D, mats) {
  const { body, head: skin, hair } = paints(D), P = { leg: 14, trunk: 14, span: 11, upper: 9, fore: 8 };
  const rig = new Rig(D.h, 60, mats), x = figureBones(rig, P), dark = darker(skin);
  x.hunch = 0.32;
  limbs(rig, x, P, { armW: 6, legW: 7, arm: [skin, skin], leg: [skin, skin, dark], fist: skin });
  rig.add(x.hips, [[15, 7, 11, 0, 1, 0, body], [8, 10, 1, 0, -5, -6, darker(body, 0.2)], [16, 2.4, 11.6, 0, 3, 0, LEATHER]]);
  rig.add(x.chest, [[16, 16, 10, 0, 6, 0, body], [6, 3, 6, 0, 14.5, 0, skin], [3, 16, 1, -3, 6, -5.4, LEATHER, 0.5]]);
  const ear = s => [[14, 6, 3, s * 20, 13, 0, skin, s * 0.25], [10, 4, 3, s * 30, 17, 0, skin, s * 0.35], [8, 2, 3.4, s * 20, 13, 0, 0xf3a0c0, s * 0.25]];
  rig.add(x.head, [[26, 22, 22, 0, 12, 0, skin], [27, 3, 23, 0, 18, -0.5, dark], [4, 4, 9, 0, 10, -14, skin], [5, 3, 5, 0, 11, -17, dark],
    [5, 4, 1, -6, 13, -11.4, EMBER], [5, 4, 1, 6, 13, -11.4, EMBER], [2, 2, 1, -6, 13, -11.9, INK], [2, 2, 1, 6, 13, -11.9, INK],
    [14, 1.6, 1, 0, 5, -11.4, INK], [2, 3, 1, -4, 4, -11.8, CREAM], [2, 3, 1, 4, 4, -11.8, CREAM],
    [8, 6, 8, 0, 25, 2, hair], [5, 6, 5, 3, 29, 3, hair, -0.4], ...ear(-1), ...ear(1)]);
  rig.add(x.hands[1], held(FORWARD, [[2.4, 10, 2.4, 0, COVER], [6, 16, 6, 12, LEATHER], [7, 4, 7, 16, darker(LEATHER)], [2, 3, 2, 18, PALE]]));
  x.carry[1] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

function imp(D, mats) {
  const { body, head: skin, hair } = paints(D), P = { leg: 10, trunk: 11, span: 8.5, upper: 6, fore: 6 };
  const rig = new Rig(D.h, 52, mats), x = figureBones(rig, P), dark = darker(body), web = darker(body, 0.45);
  x.hover = true; x.dangle = 0.45;
  limbs(rig, x, P, { armW: 4, legW: 5, arm: [body, skin], leg: [body, skin, dark], fist: skin, k: 0.7 });
  rig.add(x.hips, [[10, 6, 8, 0, 1, 0, body]]);
  rig.add(x.chest, [[12, 13, 8, 0, 5, 0, body], [8, 7, 1, 0, 5, -4.4, lighter(body, 0.25)]]);
  rig.add(x.head, [[24, 20, 20, 0, 11, 0, skin], [25, 3, 21, 0, 17, -0.5, darker(skin, 0.2)],
    [6, 5, 1, -6, 12, -10.4, EMBER], [6, 5, 1, 6, 12, -10.4, EMBER], [2, 4, 1, -5, 12, -10.9, INK], [2, 4, 1, 5, 12, -10.9, INK],
    [12, 3, 1, 0, 6, -10.4, INK], [2, 2, 1, -3, 6, -10.9, CREAM], [2, 2, 1, 1, 6, -10.9, CREAM],
    [5, 8, 5, -8, 24, 0, hair, 0.2], [3, 6, 3, -10, 30, 0, hair, 0.5], [5, 8, 5, 8, 24, 0, hair, -0.2], [3, 6, 3, 10, 30, 0, hair, -0.5]]);
  x.wings = [-1, 1].map(s => rig.add(rig.bone(x.chest, s * 4, 9, 4), [[22, 2.4, 3, s * 11, 2, 0, dark], [20, 2, 11, s * 11, 0, 5, web], [8, 2, 6, s * 21, 0, 3, web]]));
  const tail = hang(rig, x, x.hips, 0, 2, 4, [[2.4, 2.4, 11, 0, 0, 5, body]], 0.7);
  hang(rig, x, tail, 0, 0, 11, [[2.4, 2.4, 9, 0, 0, 4, body], [6, 2.4, 6, 0, 0, 11, hair]], 1, 0.9);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFlier };
}

// ---------------- the large ----------------
function orc(D, mats) {
  const { body, head: skin, hair } = paints(D), P = { leg: 28, trunk: 30, span: 21, upper: 17, fore: 16 };
  const rig = new Rig(D.h, 100, mats), x = figureBones(rig, P), dark = darker(skin), hide = darker(body, 0.15);
  x.hunch = 0.14;
  limbs(rig, x, P, { armW: 11, legW: 13, arm: [skin, skin], leg: [body, body, hide], fist: skin, k: 1.6 });
  rig.add(x.hips, [[28, 10, 18, 0, 0, 0, body], [30, 4, 19, 0, 4, 0, LEATHER], [6, 5, 1, 0, 4, -10, MAUVE], [13, 20, 1, 0, -8, -9.6, hide], [13, 18, 1, 0, -7, 9.6, hide]]);
  rig.add(x.chest, [[34, 32, 22, 0, 13, 0, skin], [30, 8, 23, 0, 2, 0, dark], [6, 42, 1, 0, 13, -11.4, LEATHER, -0.6], [6, 40, 1, 0, 13, 11.4, LEATHER, 0.6], [12, 6, 16, 0, 30, 0, dark]]);
  rig.add(x.arms[0], [[17, 9, 17, 0, 2, 0, hide], [17.4, 1.4, 17.4, 0, -1, 0, MAUVE], [4, 7, 4, -5, 9, 0, PALE], [4, 7, 4, 5, 9, 0, PALE]]);
  rig.add(x.fores[0], [[12.6, 6, 13, 0, -8, 0, LEATHER]]);
  rig.add(x.fores[1], [[12.6, 6, 13, 0, -8, 0, LEATHER]]);
  rig.add(x.head, [[24, 22, 22, 0, 9, -3, skin], [28, 9, 23, 0, 1, -4, dark], [25, 4, 23, 0, 15, -3.5, dark], [6, 3, 2, 0, 9, -15, dark],
    [4, 3, 1, -6, 11, -14.7, EMBER], [4, 3, 1, 6, 11, -14.7, EMBER], [17, 1.6, 1, 0, 3, -15.7, INK], [3, 8, 3, -9, 6, -15.5, CREAM], [3, 8, 3, 9, 6, -15.5, CREAM],
    [4, 9, 3, -14, 11, -2, skin], [4, 9, 3, 14, 11, -2, skin], [5, 8, 7, 0, 23, -11, hair], [5, 11, 7, 0, 24, -4, hair], [5, 9, 7, 0, 23, 3, hair], [5, 6, 7, 0, 21, 10, hair]]);
  rig.add(x.hands[1], held(FORWARD, [[3, 30, 3, 4, COVER], [2.4, 16, 22, 17, MAUVE], [2.8, 18, 3, 17, PALE], [3.4, 3, 3.4, 14, LEATHER]], -6));
  x.carry[1] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

function demonKnight(D, mats) {
  const { body, head: trim, hair: glow } = paints(D), P = { leg: 40, trunk: 30, span: 18, upper: 17, fore: 16 };
  const rig = new Rig(D.h, 110, mats), x = figureBones(rig, P), plate = lighter(body, 0.12), edge = darker(body, 0.4);
  limbs(rig, x, P, { armW: 9, legW: 11, arm: [plate, body], leg: [body, plate, edge], fist: trim, k: 1.2 });
  rig.add(x.hips, [[26, 10, 16, 0, 0, 0, body], [28, 7, 18, 0, -2, 0, plate], [10, 20, 1, 0, -9, -9.4, trim], [28.4, 1.4, 18.4, 0, -5, 0, trim]]);
  rig.add(x.chest, [[30, 32, 18, 0, 14, 0, plate], [22, 10, 1, 0, 20, -9.4, trim], [5, 5, 1, 0, 20, -10, glow], [32, 4, 20, 0, 0, 0, edge], [2, 26, 1, 0, 8, -9.6, edge]]);
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    rig.add(x.arms[i], [[15, 11, 17, 0, 2, 0, trim], [15.4, 1.4, 17.4, 0, -2, 0, glow], [4, 12, 5, s * 5, 12, 0, edge, s * -0.35]]);
    rig.add(x.fores[i], [[10.4, 7, 11, 0, -9, 0, trim]]);
    rig.add(x.shins[i], [[11.6, 7, 12, 0, 2, -0.6, trim], [4, 6, 4, 0, 4, -7, edge]]);
  }
  rig.add(x.head, [[26, 26, 26, 0, 14, 0, plate], [28, 5, 28, 0, 22, 0, trim], [28.4, 3, 28.4, 0, 3, 0, edge], [20, 3.4, 1, 0, 14, -13.4, glow], [3, 10, 1, 0, 8, -13.4, edge],
    [7, 12, 7, -13, 31, 0, edge, 0.3], [5, 11, 5, -18, 40, 0, trim, 0.55], [3, 9, 3, -23, 47, 0, glow, 0.8], [7, 12, 7, 13, 31, 0, edge, -0.3], [5, 11, 5, 18, 40, 0, trim, -0.55], [3, 9, 3, 23, 47, 0, glow, -0.8]]);
  const cape = hang(rig, x, x.chest, 0, 28, 9, [[28, 26, 2, 0, -13, 0, darker(trim, 0.2)]], 0.7);
  hang(rig, x, cape, 0, -26, 0, [[8, 20, 2, -10, -10, 0, trim], [9, 25, 2, 0, -12, 0, darker(trim, 0.2)], [8, 16, 2, 10, -8, 0, trim]], 0.7, 0.7);
  rig.add(x.hands[1], held(-1.7, [[3.4, 12, 3.4, 0, edge], [20, 3, 5, 7, trim], [10, 54, 3, 35, plate], [3, 54, 3.6, 35, glow], [6, 7, 3, 65, plate]]));
  x.carry[1] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

function golem(D, mats) {
  const { body, head: stone, hair: moss } = paints(D), P = { leg: 28, trunk: 36, span: 29, upper: 24, fore: 24 };
  const rig = new Rig(D.h, 110, mats), x = figureBones(rig, P), seam = darker(body, 0.45);
  x.hunch = 0.1;
  limbs(rig, x, P, { armW: 16, legW: 15, arm: [body, stone], leg: [stone, body, seam], fist: stone, k: 2 });
  rig.add(x.hips, [[32, 10, 20, 0, 0, 0, stone], [33, 1.4, 21, 0, -3, 0, seam]]);
  rig.add(x.chest, [[44, 40, 28, 0, 16, 0, body], [48, 12, 30, 0, 32, 0, stone], [44.4, 1.4, 28.4, 0, 8, 0, seam], [14, 14, 1, 0, 19, -14.6, seam], [8, 8, 1, 0, 19, -15, GOLD],
    [16, 5, 3, -12, 39, -14, moss], [10, 5, 3, 17, 38, -14, moss], [22, 4, 8, 6, 40, 8, moss], [8, 7, 2, -18, 33, -15, moss], [4, 9, 1, -20, 29, -16, moss]]);
  rig.add(x.head, [[22, 20, 20, 0, 6, -6, stone], [24, 4, 22, 0, 13, -6, seam], [5, 3, 1, -6, 8, -16.4, EMBER], [5, 3, 1, 6, 8, -16.4, EMBER], [4, 8, 3, 0, 4, -17, seam], [14, 4, 8, 3, 17, -6, moss]]);
  rig.add(x.arms[0], [[17, 6, 18, 0, -8, 0, seam]]);
  rig.add(x.arms[1], [[17, 6, 18, 0, -8, 0, seam]]);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// A plain upright body for a kind nobody has drawn yet.
function brute(D, mats) {
  const { body, head: skin, hair } = paints(D), P = { leg: 26, trunk: 20, span: 13, upper: 11, fore: 10 };
  const rig = new Rig(D.h, 84, mats), x = figureBones(rig, P);
  limbs(rig, x, P, { arm: [body, skin], leg: [body, body, darker(body)], fist: skin });
  rig.add(x.hips, [[18, 8, 12, 0, 1, 0, body]]);
  rig.add(x.chest, [[20, 22, 12, 0, 9, 0, body]]);
  rig.add(x.head, [[28, 26, 26, 0, 14, 0, skin], [30, 6, 28, 0, 27, 0, hair], [4, 5, 1, -7, 13, -13.4, INK], [4, 5, 1, 7, 13, -13.4, INK]]);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// ---------------- four legs ----------------
function wolf(D, mats) {
  const { body, head } = paints(D), dark = darker(body, 0.4), pale = lighter(body, 0.4), rig = new Rig(D.h, 60, mats);
  const spine = rig.bone(null, 0, 31, 0), x = { spine, spineY: 31, legs: [], shins: [], wag: [] };
  rig.add(spine, [[20, 18, 50, 0, 0, 4, body], [28, 28, 22, 0, 3, -15, dark], [22, 7, 18, 0, -12, -14, pale], [18, 4, 30, 0, -9, 10, pale], [8, 5, 14, 0, 11, 14, dark], [10, 7, 12, 0, 19, -16, dark]]);
  x.head = rig.bone(spine, 0, 10, -27);
  rig.add(x.head, [[20, 17, 19, 0, 2, -9, head], [25, 10, 8, 0, -2, -3, dark], [21, 2.4, 20, 0, 9, -9, dark], [11, 8, 18, 0, -2, -26, lighter(head, 0.2)], [11.4, 2.4, 18.4, 0, 2, -26, head], [6, 3.4, 3, 0, 1, -35, INK],
    [4, 3, 1, -6, 5, -18.8, ROSE], [4, 3, 1, 6, 5, -18.8, ROSE], [6, 7, 4, -6, 14, -6, head], [6, 7, 4, 6, 14, -6, head], [4, 6, 3, -6, 20, -6, dark], [4, 6, 3, 6, 20, -6, dark], [3, 5, 1, -6, 14, -8.4, 0xf3a0c0], [3, 5, 1, 6, 14, -8.4, 0xf3a0c0],
    [2, 4, 2, -3.5, -7, -31, CREAM], [2, 4, 2, 3.5, -7, -31, CREAM]]);
  x.jaw = rig.bone(x.head, 0, -6, -17);
  rig.add(x.jaw, [[10, 3, 18, 0, -1, -10, pale], [2, 3, 2, -3.5, 1.5, -17, CREAM], [2, 3, 2, 3.5, 1.5, -17, CREAM]]);
  for (const [s, z] of [[-1, -18], [1, -18], [-1, 20], [1, 20]]) {
    const leg = rig.bone(spine, s * 8, -8, z), shin = rig.bone(leg, 0, -12, 0);
    rig.add(leg, [[7, 14, 9, 0, -6, 0, body]]);
    rig.add(shin, [[5, 11, 6, 0, -5, 0, dark], [7, 3, 10, 0, -9.5, -2, dark], [2, 2, 2, -2, -10, -8, CREAM], [2, 2, 2, 2, -10, -8, CREAM]]);
    x.legs.push(leg); x.shins.push(shin);
  }
  const tail = rig.bone(spine, 0, 6, 28), end = rig.bone(tail, 0, 0, 12);
  rig.add(tail, [[7, 7, 13, 0, 0, 6, body]]);
  rig.add(end, [[9, 9, 14, 0, 0, 7, dark], [6, 6, 6, 0, 0, 16, pale]]);
  x.wag.push(tail, end);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseBeast };
}

function dragon(D, mats) {
  const { body, head } = paints(D), dark = darker(body, 0.35), pale = lighter(body, 0.45), web = darker(body, 0.5), rig = new Rig(D.h, 74, mats);
  const spine = rig.bone(null, 0, 42, 0), x = { spine, spineY: 42, legs: [], neck: [], wag: [], wings: [], tips: [] };
  const ridge = [-24, -8, 8, 24].map(z => [4, 9, 9, 0, 21, z, dark]);
  rig.add(spine, [[44, 34, 70, 0, 0, 0, body], [34, 6, 58, 0, -17, 0, pale], ...ridge]);
  const neck = rig.bone(spine, 0, 10, -35), neck2 = rig.bone(neck, 0, 6, -26);
  rig.add(neck, [[24, 24, 28, 0, 2, -12, body], [4, 7, 7, 0, 16, -12, dark], [18, 3, 26, 0, -10, -12, pale]]);
  rig.add(neck2, [[20, 20, 26, 0, 2, -12, body], [4, 7, 7, 0, 14, -12, dark], [14, 3, 24, 0, -8, -12, pale]]);
  x.neck.push(neck, neck2);
  x.head = rig.bone(neck2, 0, 8, -24);
  rig.add(x.head, [[26, 20, 30, 0, 2, -14, head], [20, 12, 20, 0, -2, -36, head], [27, 4, 22, 0, 11, -12, dark], [5, 3, 2, -6, 2, -46, INK], [5, 3, 2, 6, 2, -46, INK],
    [1, 5, 6, -13.4, 6, -18, GOLD], [1, 5, 6, 13.4, 6, -18, GOLD], [1, 3, 2, -13.8, 6, -18, INK], [1, 3, 2, 13.8, 6, -18, INK],
    [5, 5, 24, -9, 15, 6, PALE, 0, 0.4], [5, 5, 24, 9, 15, 6, PALE, 0, 0.4], [3, 3, 12, -9, 20, 20, CREAM, 0, 0.5], [3, 3, 12, 9, 20, 20, CREAM, 0, 0.5],
    [2, 4, 2, -7, -9, -42, CREAM], [2, 4, 2, 7, -9, -42, CREAM], [2, 4, 2, 0, -9, -45, CREAM]]);
  x.jaw = rig.bone(x.head, 0, -9, -20);
  rig.add(x.jaw, [[20, 5, 34, 0, -2, -18, pale], [2, 3, 2, -7, 1.5, -30, CREAM], [2, 3, 2, 7, 1.5, -30, CREAM]]);
  let parent = spine, at = [0, 2, 35];
  for (const [w, h, len] of [[30, 24, 34], [20, 16, 32], [12, 10, 32]]) {
    const b = rig.bone(parent, ...at);
    rig.add(b, [[w, h, len, 0, 0, len / 2, body], [w - 8, 3, len, 0, -h / 2, len / 2, pale], [3, 7, 7, 0, h / 2 + 2, len / 2, dark]]);
    x.wag.push(b); parent = b; at = [0, 0, len];
  }
  rig.add(parent, [[24, 2.4, 16, 0, 0, 38, dark], [12, 2.4, 10, 0, 0, 49, web]]);
  for (const s of [-1, 1]) {
    const wing = rig.bone(spine, s * 22, 16, -10), tip = rig.bone(wing, s * 50, 0, 0);
    rig.add(wing, [[50, 7, 14, s * 25, 0, 0, body], [46, 2.4, 42, s * 24, -1, 18, web], [4, 5, 5, s * 4, 3, -8, CREAM]]);
    rig.add(tip, [[60, 5, 8, s * 30, 0, 0, body], [56, 2.4, 48, s * 28, -1, 20, web], [34, 2.4, 20, s * 32, -1, 52, web], [5, 4, 8, s * 62, 0, -3, PALE]]);
    x.wings.push(wing); x.tips.push(tip);
    for (const z of [-24, 24]) {
      const leg = rig.bone(spine, s * 20, -14, z), shin = rig.bone(leg, 0, -14, 0);
      rig.add(leg, [[14, 18, 18, 0, -7, 0, body]]);
      rig.add(shin, [[10, 12, 12, 0, -6, -1, dark], [12, 3, 16, 0, -12, -3, dark], [2, 3, 3, -4, -13, -12, CREAM], [2, 3, 3, 4, -13, -12, CREAM]]);
      x.legs.push(leg);
    }
  }
  rig.finish();
  return { g: rig.g, extra: x, pose: poseDragon };
}

// ---------------- slime and stone ----------------
function slime(D, mats) {
  const c = paint(D.body), core = darker(c, 0.25), lit = lighter(c, 0.55), g = new THREE.Group(), blob = new THREE.Group();
  const flesh = [[44, 26, 44, 0, 18, 0, c], [36, 6, 36, 0, 34, 0, c], [36, 5, 36, 0, 2.5, 0, c]];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), jelly = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
  mats.push(mat, jelly);
  // The outline and what floats inside are solid, and show through the jelly around them.
  blob.add(solid(flesh, mat, 'hull'));
  blob.add(solid([[18, 14, 18, 0, 14, 0, core], [6, 8, 1, -9, 22, -22.4, INK], [6, 8, 1, 9, 22, -22.4, INK], [2, 3, 1, -10, 24, -22.9, CREAM], [2, 3, 1, 8, 24, -22.9, CREAM], [8, 2, 1, 0, 13, -22.4, INK]], mat, 'fill'));
  blob.add(solid([...flesh, [8, 1, 8, -10, 37.5, -6, lit], [4, 1, 4, 6, 37.5, 2, lit]], jelly, 'fill'));
  blob.children.forEach(m => { m.scale.setScalar(D.h / 37); });
  g.add(blob);
  return { g, extra: { blob }, pose: poseSlime };
}

// A diamond in steps, as pixel art would draw one, which keeps its shape as it turns.
const crystalOf = (k, c) => [[6, 5, 13, lighter(c, 0.4)], [10, 6, 8, lighter(c, 0.15)], [14, 6, 2, c], [10, 6, -4, c], [6, 5, -9, darker(c, 0.2)]].map(([w, h, y, tint]) => [w * k, h * k, w * k, 0, y * k, 0, tint]);
function stone(D, mats, kind) {
  const { body, head: glow } = paints(D), edge = darker(body, 0.3), carved = kind === 'law_stone';
  const total = carved ? 130 : 80, rig = new Rig(D.h, total, mats), root = rig.bone(null, 0, 0, 0), y = carved ? 118 : 66;
  if (carved) {
    const lines = [84, 74, 64, 54, 44, 34].map((at, i) => [i % 2 ? 26 : 34, 2, 1, 0, at, -9.4, glow]);
    rig.add(root, [[60, 8, 26, 0, 4, 0, edge], [52, 8, 22, 0, 11, 0, body], [46, 90, 18, 0, 60, 0, body], [46.4, 2, 18.4, 0, 96, 0, edge], [38, 6, 14, 0, 106, 0, body], ...lines]);
  } else {
    rig.add(root, [[52, 16, 42, 0, 8, 0, edge], [42, 15, 34, 3, 23, -2, body], [32, 12, 26, -2, 37, 1, edge], [22, 10, 18, 2, 48, 0, body], [14, 2, 1, 3, 23, -19.4, glow], [8, 2, 1, -2, 37, -12.4, glow]]);
  }
  const crystal = rig.bone(root, 0, y, 0);
  rig.add(crystal, crystalOf(carved ? 1 : 0.8, glow));
  rig.finish();
  return { g: rig.g, extra: { crystal, crystalY: y }, pose: poseStone };
}

const MODELS = { goblin, imp, orc, demon_knight: demonKnight, golem, wolf, dragon, slime, cairn: stone, law_stone: stone };
export function buildCreature(kind, D, mats) {
  const make = MODELS[kind] || (D.slime ? slime : D.stone ? stone : D.wings ? dragon : D.quad ? wolf : brute);
  return make(D, mats, kind);
}

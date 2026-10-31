// Everything alive that is not a person, built like people and painted with the same materials at the same size of pixel.
// The colours come from content/creatures.json, so a named monster painted differently still works. A kind with no
// model here falls back on the shape its data asks for.
import * as THREE from 'three';
import { COVER, CREAM, GOLD, LEATHER, MAUVE, OLIVE, PALE, ROSE } from './outfits.js';
import { cloth, drape, flesh, fur, hash, leather, metal, plain, plates, scales, stone as rock, torn, wood } from './paint.js';
import { poseBat, poseBeast, poseCrab, poseDragon, poseFigure, poseFlier, poseSlime, poseSpider, poseStone } from './pose.js';
import { Atlas, INK, Rig, figureBones, handBoxes, held, mixHex, solid } from './voxel.js';

const EMBER = 0xffd24a, FORWARD = -1.2, UP = -0.72; // UP allows for the bent elbow of a carrying arm, as it does in avatar.js
const hex = c => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c ?? MAUVE);
const paints = D => ({ body: hex(D.body), head: hex(D.head ?? D.body), hair: hex(D.hair ?? D.body) });
const darker = (c, k = 0.3) => mixHex(c, INK, k), lighter = (c, k = 0.3) => mixHex(c, CREAM, k);

// Plain limbs for any upright body. `thin` is how much narrower the lower ones are.
function limbs(rig, x, P, { armW = 6, legW = 8, arm, leg, fist, k = 1, thin = 0 }) {
  const thigh = Math.ceil(P.leg / 2) - 1, shin = Math.floor(P.leg / 2), foot = Math.max(3, shin >> 1), calf = shin - foot + 1;
  x.legs.forEach((bone, i) => {
    rig.add(bone, [[legW, thigh + 1, legW + 1, 0, -thigh / 2, 0, leg[0]]]);
    rig.add(x.shins[i], [[legW - thin, calf, legW + 1 - thin, 0, -calf / 2, 0, leg[1]], [legW + 1, foot, legW + 5, 0, foot / 2 - shin, -2, leg[2]]]);
  });
  x.arms.forEach((bone, i) => {
    rig.add(bone, [[armW, P.upper + 1, armW + 1, 0, 0.5 - P.upper / 2, 0, arm[0]]]);
    rig.add(x.fores[i], [[armW - thin, P.fore + 1, armW + 1 - thin, 0, 0.5 - P.fore / 2, 0, arm[1]]]);
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
  const { body, head, hair: tuft } = paints(D), P = { leg: 14, trunk: 14, span: 11, upper: 9, fore: 8 };
  const rig = new Rig(D.h, 60, mats), x = figureBones(rig, P), skin = flesh(head), dark = flesh(darker(head)), rag = cloth(body, { cut: torn(3, 2) });
  x.hunch = 0.32;
  limbs(rig, x, P, { armW: 6, legW: 7, arm: [skin, skin], leg: [skin, skin, dark], fist: skin });
  rig.add(x.hips, [[15, 7, 11, 0, 1, 0, cloth(body)], [8, 10, 1, 0, -5, -6, rag], [16, 2.4, 11.6, 0, 3, 0, leather(LEATHER)]]);
  rig.add(x.chest, [[16, 16, 10, 0, 6, 0, cloth(body)], [6, 3, 6, 0, 14.5, 0, skin], [3, 18, 1, -3, 6, -5.4, leather(LEATHER), 0.5]]);
  const ear = s => [[14, 6, 3, s * 20, 13, 0, skin, s * 0.25], [10, 4, 3, s * 30, 17, 0, skin, s * 0.35]];
  rig.add(x.head, [[26, 22, 22, 0, 12, 0, skin], [27, 3, 23, 0, 18, -0.5, dark], [4, 4, 9, 0, 10, -14, skin], [5, 3, 5, 0, 11, -17, dark],
    [5, 4, 1, -6, 13, -11.4, EMBER], [5, 4, 1, 6, 13, -11.4, EMBER], [2, 2, 1, -6, 13, -11.9, INK], [2, 2, 1, 6, 13, -11.9, INK],
    [14, 1.6, 1, 0, 5, -11.4, INK], [2, 3, 1, -4, 4, -11.8, CREAM], [2, 3, 1, 4, 4, -11.8, CREAM],
    [8, 6, 8, 0, 25, 2, fur(tuft)], [5, 6, 5, 3, 29, 3, fur(tuft), -0.4], ...ear(-1), ...ear(1)]);
  rig.add(x.hands[1], held(FORWARD, [[2.4, 10, 2.4, 0, wood(COVER)], [6, 16, 6, 12, wood(LEATHER)], [7, 4, 7, 16, wood(darker(LEATHER))], [2, 3, 2, 18, plain(PALE)]]));
  x.carry[1] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

function imp(D, mats) {
  const { body, head, hair: horn } = paints(D), P = { leg: 10, trunk: 11, span: 8.5, upper: 6, fore: 6 };
  const rig = new Rig(D.h, 52, mats), x = figureBones(rig, P), hide = flesh(body), skin = flesh(head), web = plain(darker(body, 0.45));
  x.hover = true; x.dangle = 0.45;
  limbs(rig, x, P, { armW: 4, legW: 5, arm: [hide, skin], leg: [hide, skin, flesh(darker(body))], fist: skin, k: 0.7 });
  rig.add(x.hips, [[10, 6, 8, 0, 1, 0, hide]]);
  rig.add(x.chest, [[12, 13, 8, 0, 5, 0, hide], [8, 7, 1, 0, 5, -4.4, flesh(lighter(body, 0.25))]]);
  rig.add(x.head, [[24, 20, 20, 0, 11, 0, skin], [25, 3, 21, 0, 17, -0.5, flesh(darker(head, 0.2))],
    [6, 5, 1, -6, 12, -10.4, EMBER], [6, 5, 1, 6, 12, -10.4, EMBER], [2, 4, 1, -5, 12, -10.9, INK], [2, 4, 1, 5, 12, -10.9, INK],
    [12, 3, 1, 0, 6, -10.4, INK], [2, 2, 1, -3, 6, -10.9, CREAM], [2, 2, 1, 1, 6, -10.9, CREAM],
    [5, 8, 5, -8, 24, 0, horn, 0.2], [3, 6, 3, -10, 30, 0, horn, 0.5], [5, 8, 5, 8, 24, 0, horn, -0.2], [3, 6, 3, 10, 30, 0, horn, -0.5]]);
  x.wings = [-1, 1].map(s => rig.add(rig.bone(x.chest, s * 4, 9, 4), [[22, 2.4, 3, s * 11, 2, 0, hide], [20, 2, 11, s * 11, 0, 5, web], [8, 2, 6, s * 21, 0, 3, web]]));
  const tail = hang(rig, x, x.hips, 0, 2, 4, [[2.4, 2.4, 11, 0, 0, 5, hide]], 0.7);
  hang(rig, x, tail, 0, 0, 11, [[2.4, 2.4, 9, 0, 0, 4, hide], [6, 2.4, 6, 0, 0, 11, plain(horn)]], 1, 0.9);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFlier };
}

// ---------------- the dead ----------------
// Rows with gaps between them, a breastbone down the front and the line of the spine up the back.
const ribcage = (i, j, W, H, f) => f === 'top' || f === 'bottom' || (j % 2 === 1 && !((f === 'front' || f === 'back') && Math.abs(i - (W - 1) / 2) < 1));
function skeleton(D, mats) {
  const { body, head, hair: rag } = paints(D), P = { leg: 29, trunk: 24, span: 12, upper: 12, fore: 12, neck: 25 };
  const rig = new Rig(D.h, 76, mats), x = figureBones(rig, P), bone = plain(body), pale = plain(lighter(body, 0.25)), shade = plain(darker(body, 0.25)), stave = wood(COVER), tatter = cloth(rag, { cut: torn(3, 9) });
  x.hunch = 0.06;
  x.legs.forEach((thigh, i) => {
    rig.add(thigh, [[5, 15, 5, 0, -7, 0, bone]]);
    rig.add(x.shins[i], [[6.4, 3, 6.4, 0, 0, 0, pale], [4.4, 12, 4.4, 0, -6, 0, bone], [6, 3, 11, 0, -12.5, -2, pale]]);
  });
  x.arms.forEach((arm, i) => {
    rig.add(arm, [[7, 5, 7, 0, 0, 0, pale], [5, 13, 5, 0, -6, 0, bone]]);
    rig.add(x.fores[i], [[6.4, 3, 6.4, 0, 0, 0, pale], [4.4, 12, 4.4, 0, -6, 0, bone]]);
    rig.add(x.hands[i], handBoxes(pale, 0.7));
  });
  rig.add(x.hips, [[15, 7, 9, 0, 0, 0, bone], [12, 12, 1, 0, -6, -5.2, tatter], [12, 10, 1, 0, -5, 5.2, tatter]]);
  rig.add(x.chest, [[17, 19, 10, 0, 13, 0, plain(body, { cut: ribcage })], [4.4, 26, 4.4, 0, 11, 0.6, shade], [25, 3.4, 7, 0, 22.6, 0, pale], [5, 5, 5, 0, 25, 0, shade],
    [7, 18, 5, -3, 13, 8.4, leather(COVER), 0.3], [3.4, 6, 3.4, -6.4, 23.6, 8.4, plain(PALE), 0.3]]);
  const skull = plain(head, { draw: { front: [[1, 2, 2, 3, INK], [-3, 2, 2, 3, INK], [3, 4, 2, 2, INK]] } });
  rig.add(x.head, [[19, 15, 19, 0, 11, 0, skull], [14, 5, 14, 0, 2, -2.4, plain(darker(head, 0.12), { draw: { front: [[1, 0, 1, 1, INK], [-2, 0, 1, 1, INK]] } })]]);
  // The bow is in the left hand, so that the right arm's blow reads as a draw and a loose. Its limbs lean back from the grip, and the string joins their tips.
  rig.add(x.hands[0], [...held(UP, [[3.4, 9, 3.4, 0, leather(COVER)]], -3), ...held(UP + 0.3, [[2.4, 24, 2.6, 13, stave]], -3), ...held(UP - 0.3, [[2.4, 24, 2.6, -13, stave]], -3), [1.6, 46, 1.6, 0, 1.7, 5.3, plain(rag), 0, UP]]);
  x.carry[0] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// A robe with nobody in it, drifting a little off the ground, and all there is under the hood is two lights.
function wraith(D, mats) {
  const { body, head: ash, hair: glow } = paints(D), P = { leg: 36, trunk: 23, span: 15, upper: 13, fore: 13 };
  const rig = new Rig(D.h, 88, mats), x = figureBones(rig, P), robe = drape(body), deep = darker(body, 0.25), rag = (seed, depth = 4) => drape(deep, { cut: torn(depth, seed) }), hand = flesh(ash);
  x.hover = true; x.bob = 0; x.hunch = 0.16; x.legs = []; x.shins = []; x.carry = [true, true];
  rig.add(x.hips, [[20, 14, 14, 0, -2, 0, robe]]);
  const skirt = hang(rig, x, x.hips, 0, -8, 0, [[24, 13, 17, 0, -5.5, 0, robe]], 0.25);
  hang(rig, x, skirt, 0, -11, 0, [[28, 13, 20, 0, -5.5, 0, rag(3, 3)]], 0.35, 0.6);
  for (const s of [-1, 1]) hang(rig, x, x.hips, s * 8, 2, 11, [[7, 34, 1.2, 0, -16, 0, rag(5 + s)]], 0.5, s);
  rig.add(x.chest, [[22, 25, 13, 0, 10.5, 0, robe], [31, 7, 18, 0, 20, 0.6, cloth(deep)]]);
  const cape = hang(rig, x, x.chest, 0, 22, 8, [[26, 24, 1.4, 0, -11, 0, drape(deep)]], 0.4);
  hang(rig, x, cape, 0, -23, 0, [[25.6, 22, 1.2, 0, -10, 0, rag(11, 5)]], 0.5, 0.7);
  x.arms.forEach((arm, i) => {
    rig.add(arm, [[10, 14, 11, 0, -6, 0, robe]]);
    rig.add(x.fores[i], [[9.4, 14, 10.4, 0, -6.5, 0, rag(7 + i, 3)]]);
    rig.add(x.hands[i], handBoxes(hand, 0.6));
    hang(rig, x, x.fores[i], 0, -8, 5.6, [[8.4, 14, 1.2, 0, -6.4, 0, rag(13 + i)]], 0.6, i);
  });
  const hood = cloth(darker(body, 0.12), { cut: (i, j, W, H, f) => f === 'bottom' || (f === 'front' && j >= 2 && j < H - 1 && i >= 2 && i < W - 2) });
  rig.add(x.head, [[21, 21, 21, 0, 10, 1, plain(darker(body, 0.8))], [25, 25, 25, 0, 10.5, 0, hood], [12, 5.4, 14, 0, 23, 5, cloth(deep)], [4.4, 2.4, 1, -4.4, 11.6, -9.6, glow], [4.4, 2.4, 1, 4.4, 11.6, -9.6, glow]]);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// ---------------- the large ----------------
function orc(D, mats) {
  const { body, head, hair: crest } = paints(D), P = { leg: 30, trunk: 32, span: 22, upper: 19, fore: 18 };
  const rig = new Rig(D.h, 104, mats), x = figureBones(rig, P), skin = flesh(head), dark = flesh(darker(head)), hide = leather(darker(body, 0.15)), strap = leather(LEATHER), iron = metal(MAUVE);
  x.hunch = 0.14;
  limbs(rig, x, P, { armW: 12, legW: 13, arm: [skin, skin], leg: [leather(body), leather(body), hide], fist: skin, k: 1.6 });
  rig.add(x.hips, [[28, 10, 18, 0, 0, 0, leather(body)], [30, 4, 19, 0, 4, 0, strap], [6, 5, 1, 0, 4, -10, iron], [13, 22, 1, 0, -9, -9.6, leather(body, { cut: torn(4, 4) })], [13, 20, 1, 0, -8, 9.6, leather(body, { cut: torn(4, 5) })]]);
  rig.add(x.chest, [[36, 32, 22, 0, 14, 0, skin], [30, 9, 23, 0, 2, 0, dark], [6, 44, 1, 0, 14, -11.4, strap, -0.6], [6, 42, 1, 0, 14, 11.4, strap, 0.6], [14, 7, 16, 0, 31, 0, dark]]);
  rig.add(x.arms[0], [[18, 9, 18, 0, 2, 0, metal(darker(body, 0.2))], [18.4, 1.4, 18.4, 0, -1, 0, iron], [4, 8, 4, -5, 10, 0, plain(PALE)], [4, 8, 4, 5, 10, 0, plain(PALE)]]);
  for (const f of x.fores) rig.add(f, [[13, 7, 14, 0, -9, 0, hide]]);
  rig.add(x.head, [[23, 21, 21, 0, 9, -3, skin], [27, 9, 22, 0, 1, -4, dark], [24, 4, 22, 0, 14, -3.5, dark], [6, 3, 2, 0, 8, -14.5, dark],
    [4, 2.4, 1, -6, 10.5, -14.2, EMBER], [4, 2.4, 1, 6, 10.5, -14.2, EMBER], [17, 1.6, 1, 0, 3, -15.2, INK], [3, 8, 3, -9, 6, -15, plain(CREAM)], [3, 8, 3, 9, 6, -15, plain(CREAM)],
    [4, 9, 3, -13, 11, -2, skin], [4, 9, 3, 13, 11, -2, skin], [5, 8, 7, 0, 22, -10, fur(crest)], [5, 11, 7, 0, 24, -3, fur(crest)], [5, 9, 7, 0, 23, 4, fur(crest)], [5, 6, 7, 0, 21, 10, fur(crest)]]);
  rig.add(x.hands[1], held(FORWARD, [[3, 34, 3, 5, wood(COVER)], [2.4, 18, 26, 20, metal(MAUVE)], [2.8, 20, 3, 20, metal(PALE)], [3.4, 3, 3.4, 16, leather(LEATHER)]], -6));
  x.carry[1] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

function demonKnight(D, mats) {
  const { body, head: trim, hair: glow } = paints(D), P = { leg: 40, trunk: 30, span: 18, upper: 17, fore: 16 };
  const rig = new Rig(D.h, 110, mats), x = figureBones(rig, P), plate = metal(lighter(body, 0.14)), dark = metal(body), edge = metal(darker(body, 0.4)), band = metal(trim);
  limbs(rig, x, P, { armW: 9, legW: 11, arm: [plate, dark], leg: [dark, plate, edge], fist: band, k: 1.2 });
  rig.add(x.hips, [[26, 10, 16, 0, 0, 0, dark], [28, 7, 18, 0, -2, 0, plate], [10, 20, 1, 0, -9, -9.4, cloth(trim, { cut: torn(4, 6) })], [28.4, 1.4, 18.4, 0, -5, 0, band]]);
  rig.add(x.chest, [[30, 32, 18, 0, 14, 0, plate], [22, 10, 1, 0, 20, -9.4, band], [5, 5, 1, 0, 20, -10, plain(glow)], [32, 4, 20, 0, 0, 0, edge], [2, 26, 1, 0, 8, -9.6, edge]]);
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    rig.add(x.arms[i], [[15, 11, 17, 0, 2, 0, band], [15.4, 1.4, 17.4, 0, -2, 0, plain(glow)], [4, 12, 5, s * 5, 12, 0, edge, s * -0.35]]);
    rig.add(x.fores[i], [[10.4, 7, 11, 0, -9, 0, band]]);
    rig.add(x.shins[i], [[11.6, 7, 12, 0, 2, -0.6, band], [4, 6, 4, 0, 4, -7, edge]]);
  }
  rig.add(x.head, [[26, 26, 26, 0, 14, 0, plate], [28, 5, 28, 0, 22, 0, band], [28.4, 3, 28.4, 0, 3, 0, edge], [20, 3.4, 1, 0, 14, -13.4, plain(glow)], [3, 10, 1, 0, 8, -13.4, edge],
    [7, 12, 7, -13, 31, 0, edge, 0.3], [5, 11, 5, -18, 40, 0, band, 0.55], [3, 9, 3, -23, 47, 0, plain(glow), 0.8], [7, 12, 7, 13, 31, 0, edge, -0.3], [5, 11, 5, 18, 40, 0, band, -0.55], [3, 9, 3, 23, 47, 0, plain(glow), -0.8]]);
  const cape = hang(rig, x, x.chest, 0, 28, 9, [[28, 26, 2, 0, -13, 0, cloth(darker(trim, 0.2))]], 0.7);
  hang(rig, x, cape, 0, -26, 0, [[28, 26, 2, 0, -13, 0, cloth(darker(trim, 0.2), { cut: torn(12, 8) })]], 0.7, 0.7);
  rig.add(x.hands[1], held(-1.7, [[3.4, 12, 3.4, 0, leather(darker(body, 0.3))], [20, 3, 5, 7, band], [10, 54, 3, 35, plate], [3, 54, 3.6, 35, plain(glow)], [6, 7, 3, 65, plate]]));
  x.carry[1] = true;
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

function golem(D, mats) {
  const { body, head: slab, hair: moss } = paints(D), P = { leg: 28, trunk: 36, span: 29, upper: 24, fore: 24 };
  const rig = new Rig(D.h, 110, mats), x = figureBones(rig, P), pale = rock(body), dark = rock(slab), seam = plain(darker(body, 0.45)), green = fur(moss);
  x.hunch = 0.1;
  limbs(rig, x, P, { armW: 16, legW: 15, arm: [pale, dark], leg: [dark, pale, seam], fist: dark, k: 2 });
  rig.add(x.hips, [[32, 10, 20, 0, 0, 0, dark], [33, 1.4, 21, 0, -3, 0, seam]]);
  rig.add(x.chest, [[44, 40, 28, 0, 16, 0, pale], [48, 12, 30, 0, 32, 0, dark], [44.4, 1.4, 28.4, 0, 8, 0, seam], [14, 14, 1, 0, 19, -14.6, seam], [8, 8, 1, 0, 19, -15, plain(GOLD)],
    [16, 5, 3, -12, 39, -14, green], [10, 5, 3, 17, 38, -14, green], [22, 4, 8, 6, 40, 8, green], [8, 7, 2, -18, 33, -15, green], [4, 9, 1, -20, 29, -16, green]]);
  rig.add(x.head, [[22, 20, 20, 0, 6, -6, dark], [24, 4, 22, 0, 13, -6, seam], [5, 3, 1, -6, 8, -16.4, EMBER], [5, 3, 1, 6, 8, -16.4, EMBER], [4, 8, 3, 0, 4, -17, seam], [14, 4, 8, 3, 17, -6, green]]);
  for (const a of x.arms) rig.add(a, [[17, 6, 18, 0, -8, 0, seam]]);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// Bent over under its own shoulders. Both arms count as carrying, because a bent elbow is what brings hands this long back
// under a hunch; the club hangs out in front, with its end near the ground, and comes over the top when it swings.
function troll(D, mats) {
  const { body, head, hair: moss } = paints(D), P = { leg: 38, trunk: 46, span: 30, upper: 28, fore: 28, stance: 12, neck: 44 };
  const rig = new Rig(D.h, 108, mats), x = figureBones(rig, P), hide = leather(body), dark = leather(darker(body, 0.3)), skin = leather(head), mossy = fur(mixHex(moss, OLIVE, 0.5)), bark = wood(COVER), loin = leather(darker(moss, 0.2), { cut: torn(3, 6) });
  x.hunch = 0.35; x.carry = [true, true];
  limbs(rig, x, P, { armW: 15, legW: 18, arm: [hide, skin], leg: [hide, hide, dark], fist: dark, k: 2.4, thin: 0.6 });
  rig.add(x.hips, [[42, 14, 28, 0, 1, 0, hide], [44, 4, 30, 0, 5, 0, leather(LEATHER)], [18, 26, 1.4, 0, -9.6, -14.8, loin], [18, 24, 1.4, 0, -8.6, 14.8, loin]]);
  rig.add(x.chest, [[46, 36, 33, 0, 17, 0, hide], [54, 17, 37, 0, 36, 3, dark], [34, 22, 1.4, 0, 12, -17, skin], [40, 7, 26, 0, 46.4, 4, mossy], [22, 6, 9, -8, 39, 22, mossy], [14, 8, 7, 12, 29, 18, mossy]]);
  for (const a of x.arms) rig.add(a, [[18, 7, 19, 0, 2, 0, mossy]]);
  rig.add(x.head, [[26, 20, 23, 0, 8, -5, skin], [29, 6, 12, 0, 14.4, -12, dark], [8, 11, 8, 0, 6, -19.4, leather(lighter(head, 0.2))], [22, 8, 17, 0, -1, -9, dark], [18, 1.6, 1, 0, 2.4, -17.9, INK],
    [4.4, 2.4, 1, -7, 9.6, -17.2, EMBER], [4.4, 2.4, 1, 7, 9.6, -17.2, EMBER], [3, 5, 3, -7, 5, -17, plain(CREAM)], [3, 5, 3, 7, 5, -17, plain(CREAM)],
    [11, 5, 8, -17, 8, -2, skin, 0.35], [11, 5, 8, 17, 8, -2, skin, -0.35], [16, 5, 16, 0, 20, -2, mossy], [9, 5, 9, 4, 23, 1, mossy]]);
  rig.add(x.hands[1], [...held(-2.35, [[6, 36, 6, 11, bark], [11, 24, 12, 38, bark], [8, 7, 8, 52, wood(darker(COVER, 0.2))], [12.4, 7, 13.4, 33, mossy]], -6), [15, 4.4, 4.4, 8, -25.6, -20, bark, 0.4], [8, 6, 8, 15, -23, -20, mossy]]);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// A plain upright body for a kind nobody has drawn yet.
function brute(D, mats) {
  const { body, head, hair: top } = paints(D), P = { leg: 30, trunk: 24, span: 13, upper: 13, fore: 12 };
  const rig = new Rig(D.h, 76, mats), x = figureBones(rig, { ...P, neck: 25 }), skin = flesh(head), coat = cloth(body);
  limbs(rig, x, P, { armW: 7, arm: [coat, skin], leg: [coat, coat, leather(darker(body))], fist: skin });
  rig.add(x.hips, [[18, 9, 11, 0, 1, 0, coat]]);
  rig.add(x.chest, [[20, 25, 11, 0, 11, 0, coat]]);
  rig.add(x.head, [[15, 15, 15, 0, 9, 0, skin], [16, 5, 16, 0, 15, 0, fur(top)], [2, 2, 1, -3, 9, -7.8, INK], [2, 2, 1, 3, 9, -7.8, INK]]);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseFigure };
}

// ---------------- four legs ----------------
function wolf(D, mats) {
  const { body, head } = paints(D), coat = fur(body), dark = fur(darker(body, 0.4)), pale = fur(lighter(body, 0.4)), face = fur(head), rig = new Rig(D.h, 60, mats);
  const spine = rig.bone(null, 0, 31, 0), x = { spine, spineY: 31, legs: [], shins: [], wag: [] };
  rig.add(spine, [[20, 18, 50, 0, 0, 4, coat], [28, 28, 22, 0, 3, -15, dark], [22, 7, 18, 0, -12, -14, pale], [18, 4, 30, 0, -9, 10, pale], [8, 5, 14, 0, 11, 14, dark], [10, 7, 12, 0, 19, -16, dark]]);
  x.head = rig.bone(spine, 0, 10, -27);
  rig.add(x.head, [[20, 17, 19, 0, 2, -9, face], [25, 10, 8, 0, -2, -3, dark], [21, 2.4, 20, 0, 9, -9, dark], [11, 8, 18, 0, -2, -26, fur(lighter(head, 0.2))], [11.4, 2.4, 18.4, 0, 2, -26, face], [6, 3.4, 3, 0, 1, -35, INK],
    [4, 3, 1, -6, 5, -18.8, ROSE], [4, 3, 1, 6, 5, -18.8, ROSE], [6, 7, 4, -6, 14, -6, face], [6, 7, 4, 6, 14, -6, face], [4, 6, 3, -6, 20, -6, dark], [4, 6, 3, 6, 20, -6, dark],
    [2, 4, 2, -3.5, -7, -31, CREAM], [2, 4, 2, 3.5, -7, -31, CREAM]]);
  x.jaw = rig.bone(x.head, 0, -6, -17);
  rig.add(x.jaw, [[10, 3, 18, 0, -1, -10, pale], [2, 3, 2, -3.5, 1.5, -17, CREAM], [2, 3, 2, 3.5, 1.5, -17, CREAM]]);
  for (const [s, z] of [[-1, -18], [1, -18], [-1, 20], [1, 20]]) {
    const leg = rig.bone(spine, s * 8, -8, z), shin = rig.bone(leg, 0, -12, 0);
    rig.add(leg, [[7, 14, 9, 0, -6, 0, coat]]);
    rig.add(shin, [[5, 11, 6, 0, -5, 0, dark], [7, 3, 10, 0, -9.5, -2, dark], [2, 2, 2, -2, -10, -8, CREAM], [2, 2, 2, 2, -10, -8, CREAM]]);
    x.legs.push(leg); x.shins.push(shin);
  }
  const tail = rig.bone(spine, 0, 6, 28), end = rig.bone(tail, 0, 0, 12);
  rig.add(tail, [[7, 7, 13, 0, 0, 6, coat]]);
  rig.add(end, [[9, 9, 14, 0, 0, 7, dark], [6, 6, 6, 0, 0, 16, pale]]);
  x.wag.push(tail, end);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseBeast };
}

// Long in the leg and slight in the body, with a white rump and a tail held up to show it, which is most of what anyone sees of a deer.
function deer(D, mats) {
  const { body, head, hair: pale } = paints(D), coat = fur(body), dark = fur(darker(body, 0.35)), cream = fur(pale), face = fur(head), horn = plain(darker(pale, 0.3)), hoof = plain(darker(body, 0.65)), rig = new Rig(D.h, 90, mats);
  const spine = rig.bone(null, 0, 46, 0), x = { spine, spineY: 46, legs: [], shins: [], wag: [] };
  rig.add(spine, [[17, 17, 50, 0, 0, 3, coat], [20, 21, 20, 0, 0, -15, coat], [19, 20, 16, 0, 0.5, 23, coat], [14, 3.4, 40, 0, 9.4, 2, dark], [12, 4, 34, 0, -9, 3, cream],
    [13, 13, 2, 0, 1, 31, cream], [10, 12, 2, 0, -1, -25, cream], [11, 30, 13, 0, 14.5, -27, coat, 0, -0.59], [7, 20, 2, 0, 10.6, -32.7, cream, 0, -0.59]]);
  x.head = rig.bone(spine, 0, 25, -34);
  rig.add(x.head, [[14, 13, 17, 0, 3, -7, face], [14.6, 2.4, 14, 0, 9, -7, dark], [9, 7, 14, 0, 0.4, -21, fur(lighter(head, 0.2))], [6, 3.4, 2, 0, 2, -28.4, INK], [1, 3.4, 3.4, -7.2, 4.6, -9, INK], [1, 3.4, 3.4, 7.2, 4.6, -9, INK],
    ...[-1, 1].flatMap(s => [[9, 4, 6, s * 10.5, 9.5, -1, face, s * 0.35], [3.4, 11, 3.4, s * 5.6, 14, -2, horn, s * -0.3], [3.4, 7, 3.4, s * 6.4, 15.6, -5.6, horn, 0, -0.7], [7, 3.4, 3.4, s * 9, 17.4, -2, horn, s * 0.5]])]);
  x.jaw = rig.bone(x.head, 0, -3.4, -14);
  rig.add(x.jaw, [[8, 2.4, 14, 0, 0.2, -6, cream]]);
  for (const [s, z, k] of [[-1, -17, 1], [1, -17, 1], [-1, 22, 1.3], [1, 22, 1.3]]) {
    const leg = rig.bone(spine, s * 6, -6, z), shin = rig.bone(leg, 0, -20, 0);
    rig.add(leg, [[7 * k, 26, 9 * k, 0, -8, 0, coat]]);
    rig.add(shin, [[5, 18, 5.6, 0, -9, 0, dark], [6, 4, 7, 0, -18, -0.6, hoof]]);
    x.legs.push(leg); x.shins.push(shin);
  }
  const tail = rig.bone(spine, 0, 6, 30);
  rig.add(tail, [[7, 3.4, 11, 0, 3.5, 4.2, coat, 0, -0.7], [9, 3.4, 12, 0, 1.4, 5.8, cream, 0, -0.7]]);
  x.wag.push(tail);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseBeast };
}

// All shoulder, on legs that look borrowed from something smaller, with its head carried low and its bristles up.
function boar(D, mats) {
  const { body, head, hair: bristle } = paints(D), coat = fur(body), dark = fur(darker(body, 0.35)), mane = fur(bristle), face = fur(head), hoof = plain(darker(body, 0.6)), tusk = plain(CREAM), rig = new Rig(D.h, 60, mats);
  const spine = rig.bone(null, 0, 33, 0), x = { spine, spineY: 33, legs: [], shins: [], wag: [] };
  rig.add(spine, [[30, 28, 54, 0, 0, 2, coat], [34, 31, 22, 0, 2, -15, dark], [32, 30, 20, 0, 0.4, 20, coat], [22, 4, 36, 0, -14.4, 2, dark], [12, 3, 40, 0, 14.4, 2, mane],
    ...[[-24, 25], [-14, 27], [-4, 24], [6, 22], [16, 22], [26, 20]].map(([z, top]) => [6.8, top - 11, 6.8, 0, (top + 11) / 2, z, mane])]);
  x.head = rig.bone(spine, 0, -3, -29);
  rig.add(x.head, [[26, 24, 20, 0, 1.4, -6, face], [27.6, 6, 14.6, 0, 11.4, -7.6, mane], [16, 14, 17, 0, -4, -21, face], [14, 11, 3, 0, -3, -30, flesh(mixHex(head, ROSE, 0.35))],
    [2.4, 3.4, 1, -3.4, -3, -31.6, INK], [2.4, 3.4, 1, 3.4, -3, -31.6, INK], [3.4, 3.4, 1, -9, 4, -16.2, INK], [3.4, 3.4, 1, 9, 4, -16.2, INK], [7, 9, 3.4, -11, 16, -1, dark, 0.2], [7, 9, 3.4, 11, 16, -1, dark, -0.2]]);
  x.jaw = rig.bone(x.head, 0, -11, -14);
  rig.add(x.jaw, [[13, 3.4, 15, 0, -0.6, -7.5, dark], ...[-1, 1].flatMap(s => [[3.4, 9, 3.4, s * 9.4, 2.4, -11, tusk], [3, 5.4, 3, s * 10.4, 8.6, -12, tusk, s * -0.35, 0.3]])]);
  for (const [s, z] of [[-1, -16], [1, -16], [-1, 20], [1, 20]]) {
    const leg = rig.bone(spine, s * 10, -14, z), shin = rig.bone(leg, 0, -8, 0);
    rig.add(leg, [[11, 14, 13, 0, -3, 0, coat]]);
    rig.add(shin, [[9, 8, 11, 0, -4, 0, dark], [10, 3.4, 12, 0, -9.3, -0.6, hoof]]);
    x.legs.push(leg); x.shins.push(shin);
  }
  const tail = rig.bone(spine, 0, 9, 30);
  rig.add(tail, [[3.4, 3.4, 8, 0, 0, 3.5, dark], [5, 6, 5, 0, -1, 8, mane]]);
  x.wag.push(tail);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseBeast };
}

// ---------------- many legs ----------------
// A leg held out to one side: up to a knee, then down to the foot. All four numbers are from the joint before.
function legOut(rig, x, parent, [hipX, hipY, z], s, [reach, rise, out, drop], thick, upper, lower) {
  const leg = rig.bone(parent, s * hipX, hipY, z), shin = rig.bone(leg, s * reach, rise, 0);
  rig.add(leg, [[Math.hypot(reach, rise) + 1, thick, thick, s * reach / 2, rise / 2, 0, upper, s * Math.atan2(rise, reach)]]);
  rig.add(shin, [[thick * 0.7, Math.hypot(out, drop), thick * 0.7, s * out / 2, -drop / 2, 0, lower, s * Math.atan2(out, drop)]]);
  x.legs.push(leg); x.shins.push(shin);
}
function crab(D, mats) {
  const { body, head: top, hair: sand } = paints(D), rim = plain(body), palm = plain(top), dark = plain(darker(body, 0.35)), under = plain(sand), rig = new Rig(D.h, 30, mats);
  const spine = rig.bone(null, 0, 10, 0), x = { spine, spineY: 10, legs: [], shins: [], splay: [0.45, 0, -0.45], arms: [], nips: [] };
  rig.add(spine, [[37, 9, 25, 0, 0.5, 0, rim], [27, 3.4, 18, 0, 6.2, 0.6, plates(top)], [27, 3.4, 18, 0, -4.2, 0, under], [14, 3.4, 1, 0, -1, -12.8, dark],
    ...[-1, 1].flatMap(s => [[2.4, 5, 2.4, s * 5, 6.5, -10, dark], [4, 4, 4, s * 5, 10.5, -10, INK]])]);
  for (const z of [-6, 1.5, 9]) for (const s of [-1, 1]) legOut(rig, x, spine, [15, -1, z], s, [10, 4, 5, 13], 3.4, rim, dark);
  for (const s of [-1, 1]) {
    const arm = rig.bone(spine, s * 15, 1, -9), claw = rig.bone(arm, s * 9, 3, -5), nip = rig.bone(claw, 0, 8, -3);
    rig.add(arm, [[13, 4.4, 5, s * 4.6, 1.4, -2.6, rim, s * 0.28, 0, s * 0.5]]);
    rig.add(claw, [[10, 10, 11, 0, 3.6, 0, palm], [7, 8, 3.4, 0, 12, 3.4, under]]);
    rig.add(nip, [[7, 9, 3.4, 0, 3.6, 0, under]]);
    x.arms.push(arm); x.nips.push(nip);
  }
  rig.finish();
  return { g: rig.g, extra: x, pose: poseCrab };
}

function spider(D, mats) {
  const { body, head, hair: mark } = paints(D), coat = fur(body), hide = fur(head), fang = plain(head, { draw: { all: [[0, -1, 0, 1, CREAM]] } }), rig = new Rig(D.h, 48, mats);
  const spine = rig.bone(null, 0, 24, 0), x = { spine, spineY: 24, legs: [], shins: [], splay: [0.85, 0.3, -0.25, -0.8] };
  rig.add(spine, [[21, 14, 26, 0, 1, -8, hide], [15, 3.4, 18, 0, 8.4, -8, coat], [3.4, 3.4, 1, -3.4, 4, -21.4, mark], [3.4, 3.4, 1, 3.4, 4, -21.4, mark], [3.4, 2.4, 1, -7.4, 6, -21.4, mark], [3.4, 2.4, 1, 7.4, 6, -21.4, mark]]);
  x.jaw = rig.bone(spine, 0, -3, -19);
  rig.add(x.jaw, [[4, 9, 3.4, -3.6, -3.6, -2.8, fang], [4, 9, 3.4, 3.6, -3.6, -2.8, fang]]);
  x.belly = rig.bone(spine, 0, 3, 4);
  const marked = fur(body, { draw: { top: [[2, 2, 4, 2, mark], [3, 4, 2, 3, mark], [2, 7, 4, 2, mark]], back: [[3, 1, 2, 3, mark]] } }); // an hourglass, for those who look down on it
  rig.add(x.belly, [[34, 18, 28, 0, 5, 19, coat], [26, 25, 36, 0, 5.4, 19, marked]]);
  for (const z of [-17, -11, -5, 1]) for (const s of [-1, 1]) legOut(rig, x, spine, [9, -1, z], s, [17, 24, 9, 47], 7, coat, hide);
  rig.finish();
  return { g: rig.g, extra: x, pose: poseSpider };
}

// ---------------- the dragon ----------------
// A wing is thin skin stretched between long bones: ribbed, scalloped between the ribs, narrowing to the tip and torn along its edge.
function wingSkin(c, side, ribs, taper) {
  const skin = flesh(darker(c, 0.32)), near = flesh(darker(c, 0.5)), rib = flesh(darker(c, 0.68));
  return (i, j, W, H, f) => {
    if (f !== 'top' && f !== 'bottom') return -1;
    const back = (f === 'bottom' ? H - 1 - j : j) / H, out = (side > 0 ? i : W - 1 - i) / W, between = Math.abs(Math.sin(out * Math.PI * ribs));
    if (back > (1 - taper * out * out) * (1 - 0.26 * between) - hash(i >> 1, 0, 3) * 0.06) return -1;
    if (Math.abs(out - Math.round(out * ribs) / ribs) * W < 1.2) return rib(i, j, W, H, f);
    return (back < 0.3 ? near : skin)(i, j, W, H, f);
  };
}
function dragon(D, mats) {
  const { body, head, hair: fire } = paints(D), hide = scales(body), brow = scales(darker(head, 0.15)), face = scales(head), belly = plates(mixHex(GOLD, body, 0.5)), bone = plain(0xd8ccb8), tip = plain(0x4a3a3a), spike = plain(darker(fire, 0.5)), rig = new Rig(D.h, 70, mats, 512);
  const spine = rig.bone(null, 0, 40, 0), x = { spine, spineY: 40, legs: [], shins: [], neck: [], wag: [], wings: [], elbows: [], tips: [] };
  const fin = (y, z, h) => [2.4, h, 7, 0, y, z, spike, 0, -0.45];
  rig.add(spine, [[36, 32, 46, 0, 0, -6, hide], [28, 3, 44, 0, -16, -6, belly], [40, 12, 30, 0, 10, -14, hide], fin(21, -24, 12), fin(20, -9, 13), fin(18, 6, 11)]);
  const rump = rig.bone(spine, 0, -1, 15);
  rig.add(rump, [[31, 27, 28, 0, 0, 13, hide], [23, 3, 26, 0, -14, 13, belly], fin(17, 8, 10), fin(16, 22, 9)]);

  let parent = spine, at = [0, 8, -29];
  for (const [w, len] of [[25, 18], [22, 18], [19, 18], [16, 16]]) {
    const b = rig.bone(parent, ...at);
    rig.add(b, [[w, w, len + 2, 0, 0, -len / 2, hide], [w - 8, 2.4, len + 1, 0, -w / 2, -len / 2, belly], fin(w * 0.68, -len / 2, w * 0.45)]);
    x.neck.push(b); parent = b; at = [0, 0, -len];
  }
  x.head = rig.bone(parent, 0, 1, -16);
  rig.add(x.head, [[20, 15, 21, 0, 2, -9, face], [22, 4, 13, 0, 9.5, -9, brow], [15, 10, 21, 0, -1, -28, face], [15.4, 2.4, 21, 0, 4.4, -28, brow], [5, 3, 5, -4, 6, -35, brow], [5, 3, 5, 4, 6, -35, brow],
    [2, 1.6, 1, -4, 5, -37.8, INK], [2, 1.6, 1, 4, 5, -37.8, INK], [1, 3, 5, -10.6, 5.5, -13, plain(EMBER)], [1, 3, 5, 10.6, 5.5, -13, plain(EMBER)], [1, 1.6, 2, -11, 5.5, -13, plain(INK)], [1, 1.6, 2, 11, 5.5, -13, plain(INK)],
    [5, 5, 26, -7, 12, 12, bone, 0, -0.3], [5, 5, 26, 7, 12, 12, bone, 0, -0.3], [3, 3, 16, -7, 19, 32, tip, 0, -0.42], [3, 3, 16, 7, 19, 32, tip, 0, -0.42],
    [3, 3, 16, -12, 6, 8, bone, 0, -0.1, -0.35], [3, 3, 16, 12, 6, 8, bone, 0, -0.1, 0.35], [2.4, 7, 9, -11, -3, 0, tip], [2.4, 7, 9, 11, -3, 0, tip],
    ...[-5, -1.7, 1.7, 5].map(t => [1.6, 3.4, 1.6, t, -7.6, -36, plain(CREAM)]), ...[-1, 1].flatMap(s => [-22, -27, -32].map(z => [1.6, 3, 1.6, s * 6.6, -7.2, z, plain(CREAM)]))]);
  x.jaw = rig.bone(x.head, 0, -6, -12);
  rig.add(x.jaw, [[14, 5, 30, 0, -3, -14, belly], [14.4, 2, 30.4, 0, -5.4, -14, face], ...[-1, 1].flatMap(s => [-13, -19, -25].map(z => [1.6, 3, 1.6, s * 5.6, 0.6, z, plain(CREAM)]))]);

  parent = rump; at = [0, 1, 26];
  [[23, 21, 24], [18, 17, 24], [14, 13, 24], [11, 10, 24], [8, 7, 22], [5, 5, 20]].forEach(([w, h, len], i) => {
    const b = rig.bone(parent, ...at);
    rig.add(b, [[w, h, len + 2, 0, 0, len / 2, hide], [Math.max(3, w - 8), 2.4, len + 1, 0, -h / 2, len / 2, belly], ...(i < 5 ? [fin(h * 0.7, len / 2, h * 0.45 + 2)] : [])]);
    x.wag.push(b); parent = b; at = [0, 0, len];
  });
  rig.add(parent, [[20, 2.4, 20, 0, 0, 28, plain(fire), 0, 0, 0.785], [8, 2.4, 8, 0, 0.4, 28, tip, 0, 0, 0.785]]);

  for (const s of [-1, 1]) {
    const wing = rig.bone(spine, s * 17, 14, -20), elbow = rig.bone(wing, s * 36, 0, 0), wrist = rig.bone(elbow, s * 40, 0, 0);
    rig.add(wing, [[38, 8, 9, s * 18, 0, 0, hide], [10, 10, 12, s * 2, 0, 0, hide], [36, 1.4, 50, s * 19, -1, 28, wingSkin(fire, s, 1, 0)]]);
    rig.add(elbow, [[42, 6, 7, s * 20, 0, 0, hide], [40, 1.4, 68, s * 20, -1, 35, wingSkin(fire, s, 2, 0)]]);
    rig.add(wrist, [[58, 4, 5, s * 28, 0, 0, hide], [5, 10, 5, s * 2, 5, -3, bone], [3, 7, 3, s * 2, 11, -3, tip], [8, 4, 4, s * 60, 0, 0, bone], [56, 1.4, 68, s * 28, -1, 35, wingSkin(fire, s, 2, 0.9)]]);
    x.wings.push(wing); x.elbows.push(elbow); x.tips.push(wrist);
    for (const [parentBone, y, z, big] of [[spine, -12, -18, 1], [rump, -10, 14, 1.25]]) {
      const leg = rig.bone(parentBone, s * 16, y, z), shin = rig.bone(leg, 0, -18 * big, 0);
      rig.add(leg, [[13 * big, 22 * big, 16 * big, 0, -8 * big, 0, hide]]);
      rig.add(shin, [[9 * big, 15 * big, 10 * big, 0, -7 * big, 0, hide], [12 * big, 4, 16 * big, 0, -15 * big, -3, hide], ...[-3, 0, 3].map(t => [2.4, 3, 7, t * big, -16 * big, -14 * big, tip])]);
      x.legs.push(leg); x.shins.push(shin);
    }
  }
  rig.finish();
  return { g: rig.g, extra: x, pose: poseDragon };
}

// ---------------- small things ----------------
// The same skin as the dragon's wing, on something that would fit in a hand.
function bat(D, mats) {
  const { body, head, hair: skin } = paints(D), coat = fur(body), face = fur(head), dark = fur(darker(body, 0.3)), rig = new Rig(D.h, 27, mats);
  const root = rig.bone(null, 0, 10, 0), x = { body: root, bodyY: 10, wings: [], tips: [] };
  rig.add(root, [[11, 12, 9, 0, 0, 0, coat], [13, 3.4, 11, 0, 4.4, 0, dark], [2.4, 3.4, 2.4, -2.6, -7, 0, dark], [2.4, 3.4, 2.4, 2.6, -7, 0, dark]]);
  x.head = rig.bone(root, 0, 5, 0);
  rig.add(x.head, [[12, 10, 11, 0, 4.4, -1, face], [5, 3, 2, 0, 2.4, -7, flesh(lighter(head, 0.2))], [3.4, 2.4, 1, -3.4, 6, -6.7, EMBER], [3.4, 2.4, 1, 3.4, 6, -6.7, EMBER], [2, 2, 1, -1.6, 0, -7.4, CREAM], [2, 2, 1, 1.6, 0, -7.4, CREAM],
    [4.4, 7, 2.4, -4, 12, 0, face, 0.2], [4.4, 7, 2.4, 4, 12, 0, face, -0.2]]);
  for (const s of [-1, 1]) {
    const wing = rig.bone(root, s * 5, 3, 0), tip = rig.bone(wing, s * 14, 0, 0);
    rig.add(wing, [[15, 2.4, 3.4, s * 7, 0.4, -1.4, dark], [14, 1.4, 17, s * 7, 0, 7, wingSkin(skin, s, 0.5, 0)]]);
    rig.add(tip, [[16, 2, 2.4, s * 8, 0.2, -1, dark], [16.4, 1.4, 17, s * 8.2, 0, 7, wingSkin(skin, s, 0.5, 0.85)]]);
    x.wings.push(wing); x.tips.push(tip);
  }
  rig.finish();
  return { g: rig.g, extra: x, pose: poseBat };
}

// Only the lookbook draws this one as a body: fish in the water are view/fish.js. It holds still to be looked at.
function fish(D, mats) {
  const { body, head, hair: fin } = paints(D), silver = plain(body), bright = plain(head), tail = plain(fin), rig = new Rig(D.h, 12, mats), root = rig.bone(null, 0, 5, 0);
  rig.add(root, [[6.8, 10, 18, 0, 0, 0, silver], [5.4, 7, 5, 0, -0.4, -11, bright], [7.4, 2.4, 2.4, 0, 1, -8, INK], [3.4, 3.4, 9, 0, 6, 1, tail], [3.4, 10, 3.4, 0, 0, 10, tail], [3.4, 13, 3.4, 0, 0, 13.4, tail]]);
  rig.finish();
  return { g: rig.g, extra: {}, pose: () => {} };
}

// ---------------- slime and stone ----------------
function slime(D, mats) {
  const c = hex(D.body), g = new THREE.Group(), blob = new THREE.Group(), sheet = new Atlas(128), jelly = plain(c);
  const inside = [[18, 14, 18, 0, 14, 0, plain(darker(c, 0.25))], [6, 8, 1, -9, 22, -22.4, INK], [6, 8, 1, 9, 22, -22.4, INK], [2, 3, 1, -10, 24, -22.9, CREAM], [2, 3, 1, 8, 24, -22.9, CREAM], [8, 2, 1, 0, 13, -22.4, INK]];
  const outside = [[44, 26, 44, 0, 18, 0, jelly], [36, 6, 36, 0, 34, 0, jelly], [36, 5, 36, 0, 2.5, 0, jelly], [8, 1, 8, -10, 37.5, -6, plain(lighter(c, 0.55))], [4, 1, 4, 6, 37.5, 2, plain(lighter(c, 0.55))]];
  const size = D.h / 37, core = solid(inside, sheet, undefined, size), shell = solid(outside, sheet, undefined, size);
  core.material = sheet.material();
  shell.material = sheet.material({ transparent: true, opacity: 0.72, depthWrite: false, alphaTest: 0 });
  mats.push(core.material, shell.material);
  blob.add(core, shell);
  blob.children.forEach(m => { m.scale.setScalar(size); });
  g.add(blob);
  return { g, extra: { blob }, pose: poseSlime };
}

// A diamond in steps, as pixel art would draw one, which keeps its shape as it turns.
const crystalOf = (k, c) => [[6, 5, 13, lighter(c, 0.4)], [10, 6, 8, lighter(c, 0.15)], [14, 6, 2, c], [10, 6, -4, c], [6, 5, -9, darker(c, 0.2)]].map(([w, h, y, tint]) => [w * k, h * k, w * k, 0, y * k, 0, plain(tint)]);
function stone(D, mats, kind) {
  const { body, head: glow } = paints(D), face = rock(body), edge = rock(darker(body, 0.3)), carved = kind === 'law_stone';
  const total = carved ? 130 : 80, rig = new Rig(D.h, total, mats), root = rig.bone(null, 0, 0, 0), y = carved ? 118 : 66;
  if (carved) {
    const lines = [84, 74, 64, 54, 44, 34].map((at, i) => [i % 2 ? 26 : 34, 2, 1, 0, at, -9.4, plain(glow)]);
    rig.add(root, [[60, 8, 26, 0, 4, 0, edge], [52, 8, 22, 0, 11, 0, face], [46, 90, 18, 0, 60, 0, face], [46.4, 2, 18.4, 0, 96, 0, edge], [38, 6, 14, 0, 106, 0, face], ...lines]);
  } else {
    rig.add(root, [[52, 16, 42, 0, 8, 0, edge], [42, 15, 34, 3, 23, -2, face], [32, 12, 26, -2, 37, 1, edge], [22, 10, 18, 2, 48, 0, face], [14, 2, 1, 3, 23, -19.4, plain(glow)], [8, 2, 1, -2, 37, -12.4, plain(glow)]]);
  }
  const crystal = rig.bone(root, 0, y, 0);
  rig.add(crystal, crystalOf(carved ? 1 : 0.8, glow));
  rig.finish();
  return { g: rig.g, extra: { crystal, crystalY: y }, pose: poseStone };
}

const MODELS = { goblin, imp, orc, demon_knight: demonKnight, golem, wolf, dragon, slime, cairn: stone, law_stone: stone, deer, boar, crab, bat, fish, skeleton, spider, troll, wraith };
export function buildCreature(kind, D, mats) {
  const make = MODELS[kind] || (D.slime ? slime : D.stone ? stone : D.wings ? dragon : D.quad ? wolf : brute);
  return make(D, mats, kind);
}

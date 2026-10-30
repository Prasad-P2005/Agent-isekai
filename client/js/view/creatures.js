// Everything alive that is not a person, built like people: art pixels on boxes, painted with the same materials.
// The colours come from content/creatures.json, so a named monster painted differently still works. A kind with no
// model here falls back on the shape its data asks for.
import * as THREE from 'three';
import { COVER, CREAM, GOLD, LEATHER, MAUVE, PALE, ROSE } from './outfits.js';
import { cloth, flesh, fur, hash, leather, metal, plain, plates, scales, stone as rock, torn, wood } from './paint.js';
import { poseBeast, poseDragon, poseFigure, poseFlier, poseSlime, poseStone } from './pose.js';
import { Atlas, INK, Rig, figureBones, handBoxes, held, mixHex, solid } from './voxel.js';

const EMBER = 0xffd24a, FORWARD = -1.2;
const hex = c => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c ?? MAUVE);
const paints = D => ({ body: hex(D.body), head: hex(D.head ?? D.body), hair: hex(D.hair ?? D.body) });
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

// ---------------- the dragon ----------------
// A wing is thin skin stretched between long bones: ribbed, scalloped between the ribs, narrowing to the tip and torn along its edge.
function wingSkin(c, side, ribs, taper) {
  const skin = plain(darker(c, 0.32)), near = plain(darker(c, 0.5)), rib = plain(darker(c, 0.68));
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

// ---------------- slime and stone ----------------
function slime(D, mats) {
  const c = hex(D.body), g = new THREE.Group(), blob = new THREE.Group(), sheet = new Atlas(128), jelly = plain(c);
  const inside = [[18, 14, 18, 0, 14, 0, plain(darker(c, 0.25))], [6, 8, 1, -9, 22, -22.4, INK], [6, 8, 1, 9, 22, -22.4, INK], [2, 3, 1, -10, 24, -22.9, CREAM], [2, 3, 1, 8, 24, -22.9, CREAM], [8, 2, 1, 0, 13, -22.4, INK]];
  const outside = [[44, 26, 44, 0, 18, 0, jelly], [36, 6, 36, 0, 34, 0, jelly], [36, 5, 36, 0, 2.5, 0, jelly], [8, 1, 8, -10, 37.5, -6, plain(lighter(c, 0.55))], [4, 1, 4, 6, 37.5, 2, plain(lighter(c, 0.55))]];
  const core = solid(inside, sheet), shell = solid(outside, sheet);
  core.material = sheet.material();
  shell.material = sheet.material({ transparent: true, opacity: 0.72, depthWrite: false, alphaTest: 0 });
  mats.push(core.material, shell.material);
  blob.add(core, shell);
  blob.children.forEach(m => { m.scale.setScalar(D.h / 37); });
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

const MODELS = { goblin, imp, orc, demon_knight: demonKnight, golem, wolf, dragon, slime, cairn: stone, law_stone: stone };
export function buildCreature(kind, D, mats) {
  const make = MODELS[kind] || (D.slime ? slime : D.stone ? stone : D.wings ? dragon : D.quad ? wolf : brute);
  return make(D, mats, kind);
}

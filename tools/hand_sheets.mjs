// Draws what the hero holds, to look over without starting the game: node tools/hand_sheets.mjs
// It uses the same poses and models as the game (client/js/view/held.js) and a small rasteriser of its own, and writes docs/hand/. Nothing but Node itself is needed.
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ARM_END, CUTS, Pose, TRAIL_CELLS, TRAIL_INDEX, armModel, armPose, blockModel, cutMotion, heldFlat, heroArm, holdBlock, holdThing, holdTool, itemPose, spriteModel, trailInk, writeTrail } from '../client/js/view/held.js';
import { heroLook } from '../client/js/view/outfits.js';

const ROOT = new URL('../', import.meta.url), OUT = new URL('docs/hand/', ROOT);
const ITEMS = JSON.parse(readFileSync(new URL('content/items.json', ROOT), 'utf8'));
const W = 384, H = 216, GAP = 6, COLUMNS = 4, VIEW = 70 * Math.PI / 180, NEAR = 0.05;
const SKY = [0x8f, 0xc4, 0xe8], GRASS = [0x6d, 0xa0, 0x4a], DIRT = [0x5a, 0x42, 0x2c];

function backdrop(px) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H, c = t < 0.45 ? SKY.map(v => v + (255 - v) * t * 0.6) : ((Math.floor(x / 24) + Math.floor(y / 24)) % 2 ? GRASS : GRASS.map(v => v * 0.92));
    px.set(t > 0.97 ? DIRT : c, (x + y * W) * 3);
  }
}
const tan = Math.tan(VIEW / 2), aspect = W / H;
// Every triangle to the screen, clipped at the near plane as the real camera does, with a depth buffer and perspective-correct texture lookup.
function draw(px, depth, m, pose) {
  const vertex = i => {
    const [x, y, z] = pose.apply(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
    return { x, y, z, u: m.uv ? m.uv[i * 2] : 0, v: m.uv ? m.uv[i * 2 + 1] : 0, a: m.rgba ? m.rgba[i * 4 + 3] : 1, c: m.rgba ? [m.rgba[i * 4], m.rgba[i * 4 + 1], m.rgba[i * 4 + 2]] : m.colour ? [m.colour[i * 3], m.colour[i * 3 + 1], m.colour[i * 3 + 2]] : [m.shade[i], m.shade[i], m.shade[i]] };
  };
  const between = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, a: a.a + (b.a - a.a) * t, c: a.c.map((k, i) => k + (b.c[i] - k) * t) });
  const screen = v => ({ ...v, w: -v.z, sx: (v.x / (-v.z * tan * aspect) + 1) * W / 2, sy: (1 - v.y / (-v.z * tan)) * H / 2 });
  for (let t = 0; t < m.index.length; t += 3) {
    const corners = [vertex(m.index[t]), vertex(m.index[t + 1]), vertex(m.index[t + 2])], kept = [];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 3], aIn = -a.z > NEAR, bIn = -b.z > NEAR;
      if (aIn) kept.push(a);
      if (aIn !== bIn) kept.push(between(a, b, (-NEAR - a.z) / (b.z - a.z)));
    });
    for (let i = 1; i + 1 < kept.length; i++) triangle(px, depth, m, screen(kept[0]), screen(kept[i]), screen(kept[i + 1]));
  }
}
function triangle(px, depth, m, a, b, c) {
  const area = (b.sx - a.sx) * (c.sy - a.sy) - (b.sy - a.sy) * (c.sx - a.sx);
  if (area >= 0 && !m.twoSided) return; // the screen's y runs down, so a face towards the eye winds negative
  const x0 = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx))), x1 = Math.min(W - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
  const y0 = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy))), y1 = Math.min(H - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = x + 0.5, qy = y + 0.5;
    const l0 = ((b.sx - qx) * (c.sy - qy) - (b.sy - qy) * (c.sx - qx)) / area, l1 = ((c.sx - qx) * (a.sy - qy) - (c.sy - qy) * (a.sx - qx)) / area, l2 = 1 - l0 - l1;
    if (l0 < 0 || l1 < 0 || l2 < 0) continue;
    const w = 1 / (l0 / a.w + l1 / b.w + l2 / c.w), at = x + y * W;
    if (w >= depth[at]) continue;
    const mix = pick => (l0 * pick(a) / a.w + l1 * pick(b) / b.w + l2 * pick(c) / c.w) * w;
    let rgb = [255, 255, 255], alpha = m.rgba ? mix(p => p.a) : 1;
    if (m.pixels) {
      const tx = Math.min(m.width - 1, Math.floor(mix(p => p.u) * m.width)), ty = Math.min(m.height - 1, Math.floor(mix(p => p.v) * m.height)), k = (tx + ty * m.width) * 4;
      rgb = [m.pixels[k], m.pixels[k + 1], m.pixels[k + 2]]; alpha = m.pixels[k + 3] / 255;
      if (alpha < 0.5 && m.cutout) continue;
    }
    for (let k = 0; k < 3; k++) { const shaded = Math.min(255, rgb[k] * mix(p => p.c[k])), at3 = at * 3 + k; px[at3] = alpha < 1 ? px[at3] + (shaded - px[at3]) * alpha : shaded; }
    if (alpha === 1) depth[at] = w;
  }
}
function frame(paint) {
  const px = new Uint8Array(W * H * 3), depth = new Float32Array(W * H).fill(Infinity);
  backdrop(px);
  paint(px, depth);
  return px;
}
const arm = armModel(heroArm(heroLook()));
const bare = (swing, equip = 0) => frame((px, depth) => draw(px, depth, arm, armPose(swing, equip)));
function holding(id, swing = 0) {
  const it = ITEMS[id], block = Number.isInteger(it.block) ? it.block : it.place?.[0], sprite = it.art && (block == null || heldFlat(block));
  const m = sprite ? spriteModel(it.art, it.pal) : blockModel(block), hold = m.pixels ? holdBlock : ['tools', 'weapons'].includes(it.group) ? holdTool : holdThing;
  m.twoSided = !m.pixels || m.cutout;
  return frame((px, depth) => { const p = itemPose(swing, 0); hold(p); draw(px, depth, m, p); });
}
// The middle of the view, so that where a cut passes can be judged.
function crosshair(px) {
  for (let i = -5; i <= 5; i++) for (const [x, y] of [[W / 2 + i, H / 2], [W / 2, H / 2 + i]]) px.set([255, 255, 255], (x + y * W) * 3);
}
// One frame of a cut, `p` of the way through the swing, with the ribbon behind the blade as the game draws it.
function cutFrame(id, kind, n, p) {
  const it = ITEMS[id], m = spriteModel(it.art, it.pal), pos = new Float32Array(TRAIL_CELLS * 12), rgba = new Float32Array(TRAIL_CELLS * 16);
  m.twoSided = true;
  const cells = writeTrail(kind, n, p, trailInk(it.pal), pos, rgba), ribbon = { pos, rgba, index: TRAIL_INDEX.slice(0, cells * 6), twoSided: true };
  return frame((px, depth) => {
    const pose = itemPose(0, 0, undefined, cutMotion(kind, n, p));
    holdTool(pose); draw(px, depth, m, pose); draw(px, depth, ribbon, new Pose()); crosshair(px);
  });
}
const CUT_FRAMES = [0.14, 0.17, 0.2, 0.23, 0.26, 0.3, 0.36, 0.44];
const cutRows = (id, kind, frames = CUT_FRAMES) => Object.fromEntries(CUTS[kind].map((c, n) => [`hand-${kind}-${n}`, frames.map(p => cutFrame(id, kind, n, p))]));
const ROWS = {
  ...cutRows('iron_sword', 'slash'),
  ...cutRows('iron_greatsword', 'cleave', [0.26, 0.29, 0.32, 0.35, 0.39, 0.44, 0.5, 0.58]),
  'hand-slash-inks': ['wood_sword', 'stone_sword', 'iron_sword', 'gold_sword', 'mithril_sword', 'adamant_sword', 'dragon_sword'].filter(id => ITEMS[id]).map(id => cutFrame(id, 'slash', 0, 0.23)),
  'hand-arm': [bare(0), bare(0.25), bare(0.5), bare(0.75)],
  'hand-blocks': ['dirt', 'stone', 'oak_log', 'planks', 'glass', 'oak_leaves', 'sand', 'cobblestone', 'lantern', 'chest', 'fence', 'anvil'].filter(id => ITEMS[id]).map(id => holding(id)),
  'hand-shapes': Object.keys(ITEMS).filter(id => /stairs|slab/.test(id)).slice(0, 4).concat(['torch', 'poppy', 'tall_grass', 'kelp'].filter(id => ITEMS[id])).map(id => holding(id)),
  'hand-items': ['iron_sword', 'iron_pickaxe', 'mithril_axe', 'stick', 'apple', 'potion', 'bread', 'wheat_seeds'].filter(id => ITEMS[id]).map(id => holding(id)),
  'hand-swing': [0, 0.2, 0.45, 0.8].map(s => holding('oak_log', s)),
};
const PALM = armPose(0.25, 0).apply(...ARM_END);
console.log('palm at full reach', PALM.map(v => v.toFixed(2)).join(' '));

function sheet(frames) {
  const rows = Math.ceil(frames.length / COLUMNS), w = COLUMNS * (W + GAP) + GAP, h = rows * (H + GAP) + GAP, px = new Uint8Array(w * h * 3).fill(0x2e);
  frames.forEach((f, n) => {
    const left = GAP + (n % COLUMNS) * (W + GAP), top = GAP + Math.floor(n / COLUMNS) * (H + GAP);
    for (let y = 0; y < H; y++) px.set(f.subarray(y * W * 3, (y + 1) * W * 3), (left + (top + y) * w) * 3);
  });
  return { w, h, px };
}
function png({ w, h, px }) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(px.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1);
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(t)); return Buffer.concat([len, t, crc]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync(OUT, { recursive: true });
for (const [name, frames] of Object.entries(ROWS)) { writeFileSync(new URL(`${name}.png`, OUT), png(sheet(frames))); console.log(name, frames.length); }

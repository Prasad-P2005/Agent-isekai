// The world seen from straight above: a colour for each column, and how a being shows on a map.
// ui/minimap.js paints real blocks a chunk at a time, and ui/map.js paints the whole world from the terrain alone.
import { AIR, BL, GLASS, WATER, solid } from './blocks.js';
import { chunks } from './chunks.js';
import { NZ, hash3 } from './noise.js';
import { player } from './player.js';
import { B, CS, H, SEA, biomeAt, chunkKey as key, heightAt, idx, landOf, settlement } from './terrain.js';

const RELIEF = 0.06, MAX_RELIEF = 0.32; // how much each block of slope lights or shades a column
const DEEP = 30;                        // blocks of water that hide the sea floor completely
const MUTED = 0.2;                      // block colours are vivid until the game's lighting softens them, so this softens them too
const TREES = { [B.ELF]: [9, 0.75], [B.KINGDOM]: [7, 0.16], [B.BEAST]: [32, 0.08] }; // the leaves, and how much of the land they cover at full density

// The light comes from the north-west, so a column standing above its neighbours on that side catches it.
const relief = (y, n, w) => 1 + Math.max(-MAX_RELIEF, Math.min(MAX_RELIEF, (2 * y - n - w) * RELIEF));
function throughWater(bed, blocks) {
  const sea = BL[WATER].top, depth = Math.min(1, blocks / DEEP), mix = 0.72 + 0.28 * depth, dark = 1 - 0.45 * depth;
  return bed.map((c, i) => (c + (sea[i] - c) * mix) * dark);
}
function paint(pixels, p, [r, g, b], light) {
  const grey = (r * 0.3 + g * 0.59 + b * 0.11) * MUTED, keep = 1 - MUTED;
  pixels[p] = (r * keep + grey) * light * 255; pixels[p + 1] = (g * keep + grey) * light * 255; pixels[p + 2] = (b * keep + grey) * light * 255; pixels[p + 3] = 255;
}
// A block's colour as the map shows it, for drawing over a survey.
export function mapColour(id, light = 1) {
  const pixel = new Uint8ClampedArray(4);
  paint(pixel, 0, BL[id].top, light);
  return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
}

function surface(d, x, z) {
  let y = H - 1;
  while (y > 0 && (d[idx(x, y, z)] === AIR || d[idx(x, y, z)] === GLASS)) y--;
  return y;
}

// RGBA for the CS × CS columns of a chunk, read from its real blocks so buildings, trees and the player's changes all show.
export function surveyChunk({ cx, cz, d }) {
  const north = chunks.get(key(cx, cz - 1)), west = chunks.get(key(cx - 1, cz));
  const tops = new Int16Array(CS * CS), pixels = new Uint8ClampedArray(CS * CS * 4);
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const i = x + z * CS, y = tops[i] = surface(d, x, z), id = d[idx(x, y, z)];
    const n = z ? tops[i - CS] : north ? surface(north.d, x, CS - 1) : y;
    const w = x ? tops[i - 1] : west ? surface(west.d, CS - 1, z) : y;
    let colour = BL[id].top;
    if (id === WATER) {
      let floor = y;
      while (!solid(d[idx(x, floor, z)])) floor--;
      colour = throughWater(BL[d[idx(x, floor, z)]].top, y - floor);
    }
    paint(pixels, i * 4, colour, relief(y, n, w));
  }
  return pixels;
}

// ---------- the whole world, without loading it ----------
// The short version of genChunk's choice of top block. Only the map depends on it, so a difference is just a slightly different shade.
function groundOf(b, h, det) {
  if (b === B.ELF) return 10;
  if (b === B.BEAST) return det > 0.5 ? 25 : 24;
  if (b === B.DEMON) return det > 0.55 ? 36 : 35;
  if (b === B.PEAKS) return h > SEA + 46 ? 17 : det > 0.2 ? 1 : 3;
  return b === B.KINGDOM ? 1 : 4; // the rest is sand: beaches and the sea bed
}
// Trees are round blobs on a staggered four-block grid, as many as the land's density allows. Towns stand on cleared ground.
const onCellEdge = v => (v & 3) === 0 || (v & 3) === 3;
function canopy(x, z, b) {
  const trees = TREES[b], L = landOf(x, z), cell = x + ((z >> 2 & 1) << 1);
  if (!trees || (onCellEdge(cell) && onCellEdge(z)) || hash3(cell >> 2, 0, z >> 2) >= trees[1] * L.density) return null;
  if (L.settlement != null) { const S = settlement(L.settlement); if (Math.hypot(x - S.cx, z - S.cz) < 30) return null; }
  return BL[trees[0]].top;
}
const seaLevelled = (x, z) => Math.max(SEA, heightAt(x, z));
// RGBA for one row of the world. This asks only for heights, because generating chunks here would queue their creatures' spawn hints.
export function surveyRow(z, x0, width) {
  const pixels = new Uint8ClampedArray(width * 4);
  for (let i = 0; i < width; i++) {
    const x = x0 + i, h = heightAt(x, z), b = biomeAt(x, z, h), ground = BL[groundOf(b, h, NZ.D(x / 9, z / 9))].top;
    const colour = h < SEA ? throughWater(ground, SEA - h) : canopy(x, z, b) ?? ground;
    paint(pixels, i * 4, colour, relief(Math.max(h, SEA), seaLevelled(x, z - 1), seaLevelled(x - 1, z)));
  }
  return pixels;
}

// 'foe' if it would hurt you right now, 'notable' for the people worth finding, 'folk' for everyone else.
export function mapRole(e) {
  const D = e.def;
  if (e.angryT > 0 || (!D.friendly && !D.lawful) || (D.lawful && player.wanted > 0)) return 'foe';
  return e.res?.notable || e.res?.service ? 'notable' : 'folk';
}

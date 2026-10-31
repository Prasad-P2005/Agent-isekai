// Every block face in the game, painted once at load as 16 x 16 pixel art: a few tones laid in clusters, the way a block texture is
// drawn by hand. It needs neither three.js nor the page, so the bag's icons and the tests can read the same tiles the world uses.
// An opaque tile's alpha says what a tint touches: 255 takes it, DRY does not, which is how grass tints and the dirt under it stays dirt.
import { mulberry } from '../sim/noise.js';

export const TILE = 16;
const N = TILE, DRY = 128;
const hex = c => [c >> 16 & 255, c >> 8 & 255, c & 255];
const mod = (a, b) => ((a % b) + b) % b;
const mix = (a, b, t) => a + (b - a) * t;

function brush(name) {
  const px = new Uint8Array(N * N * 4), r = mulberry([...name].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 7));
  const put = (x, y, colour, alpha = 255) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (x + y * N) * 4, [a, b, c] = hex(colour);
    px[i] = a; px[i + 1] = b; px[i + 2] = c; px[i + 3] = alpha;
  };
  const clear = (x, y) => { if (x >= 0 && y >= 0 && x < N && y < N) px[(x + y * N) * 4 + 3] = 0; };
  return { px, r, put, clear };
}
// Smooth noise that wraps at the tile's edges, or the seams would show on every block.
function field(r, cellsX, cellsY = cellsX) {
  const grid = Array.from({ length: cellsX * cellsY }, () => r()), at = (a, b) => grid[mod(a, cellsX) + mod(b, cellsY) * cellsX];
  return (x, y) => {
    const fx = x / N * cellsX, fy = y / N * cellsY, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    return mix(mix(at(ix, iy), at(ix + 1, iy), tx), mix(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
  };
}
const layered = (r, a, b, c = a, d = b) => { const low = field(r, a, b), high = field(r, c * 2, d * 2); return (x, y) => low(x, y) * 0.65 + high(x, y) * 0.35 + r() * 0.1; };
// Tones go by rank, not value, so that each one covers its share of the tile and the clusters stay crisp.
function ranked(value) {
  const order = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) order.push([value(x, y), x, y]);
  order.sort((a, b) => a[0] - b[0]);
  const rank = new Float32Array(N * N);
  order.forEach(([, x, y], i) => { rank[x + y * N] = i / order.length; });
  return (x, y) => rank[mod(x, N) + mod(y, N) * N];
}
const tone = (ramp, t) => ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
function wash(b, ramp, value, alpha = 255) {
  const rank = ranked(value);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) b.put(x, y, tone(ramp, rank(x, y)), alpha);
}
const mottled = (ramp, cells = 4, alpha = 255) => b => wash(b, ramp, layered(b.r, cells, cells), alpha);
const streaked = (ramp, cellsX = 3, cellsY = 7) => b => wash(b, ramp, layered(b.r, cellsX, cellsY));
function specks(b, colours, count, size = 1) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(b.r() * N), y = Math.floor(b.r() * N), c = colours[Math.floor(b.r() * colours.length)];
    for (let a = 0; a < size; a++) for (let e = 0; e < size; e++) b.put(mod(x + a, N), mod(y + e, N), c);
  }
}

// Worn stones packed together, each with a lit top left and a shaded bottom right.
function stones(ramp, mortar, seeds = 9) {
  return b => {
    const pts = Array.from({ length: seeds }, (_, i) => ({ x: (i % 3 + b.r() * 0.7) / 3 * N, y: (Math.floor(i / 3) + b.r() * 0.7) / 3 * N, tone: b.r() }));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let first = 99, second = 99, near = null, ox = 0, oy = 0;
      for (const p of pts) for (const sx of [-N, 0, N]) for (const sy of [-N, 0, N]) {
        const dx = x - p.x - sx, dy = y - p.y - sy, d = Math.hypot(dx, dy);
        if (d < first) { second = first; first = d; near = p; ox = dx; oy = dy; } else if (d < second) second = d;
      }
      const lit = (ox + oy < -3 ? 0.3 : ox + oy > 3 ? -0.3 : 0) + near.tone * 0.7;
      b.put(x, y, second - first < 1.25 ? mortar : tone(ramp, Math.max(0, Math.min(0.99, lit))));
    }
  };
}
function bricks(ramp, mortar, high = 4, wide = 8) {
  return b => {
    const tones = Array.from({ length: 16 }, () => b.r());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = Math.floor(y / high), bx = x + (row & 1) * (wide >> 1), inRow = y % high, inBrick = bx % wide;
      if (inRow === high - 1 || inBrick === wide - 1) { b.put(x, y, mortar); continue; }
      const t = tones[(row * 3 + Math.floor(bx / wide)) & 15] * 0.75 + (inRow === 0 || inBrick === 0 ? 0.25 : 0) + b.r() * 0.08;
      b.put(x, y, tone(ramp, Math.min(0.99, t)));
    }
  };
}
function planks(ramp, seam) {
  return b => {
    const grain = ranked(layered(b.r, 2, 8));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = y >> 2, joint = (row & 1 ? 11 : 4) + (row >> 1) * 3;
      b.put(x, y, y % 4 === 3 || mod(x, N) === joint % N ? seam : tone(ramp, grain(x, y)));
    }
    for (let row = 0; row < 4; row++) { const joint = ((row & 1 ? 11 : 4) + (row >> 1) * 3) % N; b.put(mod(joint - 1, N), row * 4 + 1, ramp[0]); b.put(mod(joint + 1, N), row * 4 + 1, ramp[0]); } // nails
  };
}
function bark(ramp, dark) {
  return b => {
    wash(b, ramp, layered(b.r, 7, 2, 8, 2));
    for (let i = 0; i < 9; i++) { const x = Math.floor(b.r() * N), y = Math.floor(b.r() * N), len = 2 + Math.floor(b.r() * 4); for (let k = 0; k < len; k++) b.put(x, mod(y + k, N), dark); }
  };
}
function rings(rim, light, dark) {
  return b => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      b.put(x, y, d > 6.5 ? rim : Math.floor(d + b.r() * 0.6) % 2 ? dark : light);
    }
  };
}
function leafy(ramp, holes = 0.14, cells = 8, sparkle = null) {
  return b => {
    wash(b, ramp, layered(b.r, cells, cells, cells, cells));
    if (sparkle != null) specks(b, [sparkle], 5);
    for (let i = 0; i < N * N * holes; i++) { const x = Math.floor(b.r() * N), y = Math.floor(b.r() * N); b.clear(x, y); if (b.r() < 0.4) b.clear(x + 1, y); }
  };
}
function fractured(ramp, cracks) { // cells of dark rock with something bright showing between them
  return b => {
    stones(ramp, cracks[0], 7)(b);
    const pick = ranked((x, y) => { const c = (x + y * N) * 4; return b.px[c] + b.r(); });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b.px[(x + y * N) * 4] === (cracks[0] >> 16 & 255) && pick(x, y) > 0.82) b.put(x, y, cracks[1]);
  };
}
const ore = (colours, count = 6, rock = mottledStone) => b => {
  rock(b);
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(b.r() * 12), y = 2 + Math.floor(b.r() * 12);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) if (b.r() < 0.8) b.put(x + dx, y + dy, colours[Math.floor(b.r() * colours.length)]);
    b.put(x, y, colours[0]);
  }
};
// Cut stones set in the rock: bigger than ore flecks, each with a lit corner, so that a gem vein reads from across a cavern.
const gems = (colours, rock = mottledStone, count = 3) => b => {
  rock(b);
  for (let i = 0; i < count; i++) {
    const x = 1 + (i * 5 + Math.floor(b.r() * 3)) % 12, y = 2 + Math.floor(b.r() * 10);
    for (const [dx, dy, c] of [[0, 0, 1], [1, 0, 1], [2, 0, 2], [0, 1, 0], [1, 1, 1], [2, 1, 2], [1, 2, 2], [1, -1, 0]]) b.put(x + dx, y + dy, colours[c]);
    b.put(x, y, colours[3]);
  }
};
const STONE = [0x6e706b, 0x7b7d77, 0x868982, 0x91948d, 0x9fa29b];
const mottledStone = b => wash(b, STONE, layered(b.r, 3, 6, 4, 7));
const DEEP = [0x35353f, 0x3f3f4b, 0x4a4a58, 0x565665, 0x626272];
const deepstone = b => wash(b, DEEP, layered(b.r, 6, 3, 7, 4));
// A picture laid over a tile: one character to a pixel, and a dot leaves what is already there.
function picture(rows, colours) {
  return b => rows.forEach((row, y) => [...row].forEach((c, x) => { if (colours[c] != null) b.put(x, y, colours[c]); }));
}
// A block of worked metal: a raised plate inside a dark frame, with the light across one corner.
function plated(ramp, line) {
  return b => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1, bevel = x === 1 || y === 1, shade = x === N - 2 || y === N - 2;
      b.put(x, y, edge ? line : bevel ? ramp[3] : shade ? ramp[0] : tone(ramp, 0.2 + 0.4 * ((x + y) / 30) + (mod(x - y, 16) < 3 ? 0.35 : 0) + b.r() * 0.08));
    }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) b.put(x, y, line);
  };
}
// Cut crystal, in facets that catch the light.
function faceted(ramp, line) {
  return b => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = mod(x + y * 2, 16), c = mod(x * 2 - y, 16);
      b.put(x, y, a < 1 || c < 1 ? line : tone(ramp, mod(Math.floor(x / 5) * 0.27 + Math.floor(y / 5) * 0.31 + b.r() * 0.08, 1)));
    }
  };
}
const DIRT = [0x5e4532, 0x6d523e, 0x7b5f49, 0x876b54];
const dirt = b => { wash(b, DIRT, layered(b.r, 5, 5), DRY); specks(b, [0x4d3828, 0x92775f], 7); for (let i = 0; i < N * N * 4; i += 4) b.px[i + 3] = DRY; };
const BLADES = [0xb4b4b4, 0xcacaca, 0xdedede, 0xf2f2f2];
const WHEAT_T = [0xa07f32, 0xc9a23f, 0xe5c257];

function grassSide(b) {
  dirt(b);
  const lip = field(b.r, 8, 1);
  for (let x = 0; x < N; x++) {
    const depth = 3 + Math.floor(lip(x, 0) * 3);
    for (let y = 0; y < depth; y++) b.put(x, y, BLADES[Math.floor(b.r() * BLADES.length)]);
    if (b.r() < 0.45) b.put(x, depth, BLADES[0]);
  }
}
function roofTiles(ramp, line) {
  return b => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = y >> 2, bx = x + (row & 1) * 3, inTile = bx % 6, inRow = y % 4;
      b.put(x, y, inRow === 3 || (inTile === 5 && inRow < 2) ? line : tone(ramp, (inRow === 0 ? 0.8 : 0.35) + b.r() * 0.2));
    }
  };
}
function thatch(ramp, line) {
  return b => {
    wash(b, ramp, layered(b.r, 9, 2, 9, 2));
    for (let row = 1; row < 4; row++) for (let x = 0; x < N; x++) if (b.r() < 0.55) b.put(x, row * 4 - 1, line);
  };
}
function glass(b) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const rim = x === 0 || y === 0 || x === N - 1 || y === N - 1, shine = (x + y) % 11 < 2 && x + y > 3 && x + y < 26;
    b.put(x, y, rim ? 0xcbe6ef : shine ? 0xffffff : 0xdff4fb, rim ? 225 : shine ? 120 : 46);
  }
}
function ice(b) {
  wash(b, [0x9fd2f0, 0xaedcf4, 0xc0e6f8, 0xd6f0fb], layered(b.r, 3, 3), 205);
  for (let i = 0; i < 12; i++) b.put(Math.floor(b.r() * N), Math.floor(b.r() * N), 0xffffff, 225);
}
// Long sharp facets running up the block, so that a stack of them reads as one crystal. Each facet is lit along one edge.
function crystal(b) {
  const ramp = [0x62c4f4, 0x74d0f8, 0x8adcff, 0x9ce4ff, 0xb0ecff], cuts = [0, 4, 9, 13];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const slant = mod(x + (y >> 2), N), facet = cuts.findLastIndex(c => c <= slant), edge = slant === cuts[facet];
    b.put(x, y, edge ? 0xd4f6ff : ramp[(facet * 2 + (slant - cuts[facet] > 1 ? 1 : 0)) % ramp.length]);
  }
}
function manaCluster(b) {
  empty(b);
  const ramp = [0x2a88c8, 0x4ab8f0, 0x8adcff, 0xd4f6ff];
  for (const [cx, tall, wide, lean] of [[8, 15, 3, 0], [4, 10, 2, -0.3], [12, 11, 2, 0.3], [6, 6, 1.5, -0.1], [10, 7, 1.5, 0.1]]) for (let k = 0; k < tall; k++) {
    const half = Math.min(wide, (tall - k) * 0.8), mid = cx + lean * k;
    for (let x = Math.round(mid - half); x <= Math.round(mid + half) - 1; x++) b.put(x, N - 1 - k, ramp[x < mid - half / 3 ? 2 : x < mid + half / 3 ? 3 : 1]);
    if (k === tall - 1) b.put(Math.round(mid), N - 1 - k, 0xffffff);
  }
}
function lantern(b) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) b.put(x, y, 0xffe9a0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (y < 4 || y > 12 || x % 6 === 5) b.put(x, y, 0x3c3230);
  specks(b, [0xfff8d8, 0xffc65a], 10);
}
function torch(b) {
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) b.clear(x, y);
  for (let y = 6; y < N; y++) for (const x of [7, 8]) b.put(x, y, y % 3 ? 0x6d4c30 : 0x57391f);
  for (const [x, y, c] of [[7, 5, 0xffd26a], [8, 5, 0xffe7a0], [7, 6, 0xffb040], [8, 6, 0xffc860]]) b.put(x, y, c);
}
function timber(b) {
  mottled([0xdccfb2, 0xe6dcc2, 0xefe6d0], 5)(b);
  const beam = 0x5c432c;
  for (let i = 0; i < N; i++) { b.put(i, 0, beam); b.put(i, N - 1, beam); b.put(0, i, beam); b.put(N - 1, i, beam); b.put(i, i, beam); b.put(i, Math.min(N - 1, i + 1), beam); }
}
function bookshelf(b) {
  planks([0x8f6d48, 0x9f7c54, 0xad8a60], 0x5c432c)(b);
  const spines = [0xa83232, 0x2f5fa8, 0x3a8a4a, 0xc99a3a, 0x6a3a8a, 0x8a5a3a];
  for (const shelf of [1, 9]) {
    for (let y = 0; y < 6; y++) for (let x = 0; x < N; x++) b.put(x, shelf + y, y === 5 ? 0x5c432c : 0x3a2a1a);
    for (let x = 1; x < N - 1; x += 2) { const c = spines[Math.floor(b.r() * spines.length)], top = shelf + Math.floor(b.r() * 2); for (let y = top; y < shelf + 5; y++) { b.put(x, y, c); b.put(x + 1, y, c); } }
  }
}
function barrelSide(b) {
  planks([0x7a5a3a, 0x8a6a46, 0x97754f], 0x5c432c)(b);
  for (const y of [3, 12]) for (let x = 0; x < N; x++) { b.put(x, y, 0x5a5a60); b.put(x, y + 1, 0x3e3e44); }
}
function hayBand(b) {
  thatch([0xb8913a, 0xcfa848, 0xe0bc58], 0x9a7a30)(b);
  for (const x of [4, 11]) for (let y = 0; y < N; y++) b.put(x, y, 0x7a5a2a);
}
function banner(b) {
  mottled([0x2c47ab, 0x3557c9, 0x4166da], 6)(b);
  for (let i = 0; i < N; i++) { b.put(i, 0, 0xd6b24a); b.put(i, N - 1, 0xd6b24a); b.put(0, i, 0xd6b24a); b.put(N - 1, i, 0xd6b24a); }
  for (const [x, y] of [[7, 4], [8, 4], [6, 6], [7, 6], [8, 6], [9, 6], [5, 8], [10, 8], [7, 8], [8, 8], [7, 10], [8, 10]]) b.put(x, y, 0xe8c85a);
}
function totem(b) {
  bark([0x8a4a2a, 0xa0522d, 0xb4623a], 0x5e3019)(b);
  for (let y = 0; y < N; y += 8) {
    for (const x of [3, 4, 11, 12]) { b.put(x, y + 3, 0xf0e0b0); b.put(x, y + 4, 0x2a1a10); }
    for (let x = 5; x < 11; x++) b.put(x, y + 6, 0x2a1a10);
    for (let x = 0; x < N; x++) b.put(x, y, 0xd8a03a);
  }
}
const coral = ramp => b => { stones(ramp, ramp[0], 16)(b); specks(b, [ramp[3]], 8); };
function farmland(b) {
  wash(b, [0x46321f, 0x54402b, 0x614a33], layered(b.r, 4, 4));
  for (const y of [1, 5, 9, 13]) for (let x = 0; x < N; x++) { b.put(x, y, 0x3a2919); b.put(x, y + 1, 0x322315); }
}
function path(b) { wash(b, [0x7f6442, 0x94774f, 0xa3875c, 0xb09669], layered(b.r, 5, 5)); specks(b, [0x6c573c, 0x8a8078], 8); }

// ---------- sprites: what grows, drawn on two crossed planes ----------
const empty = b => { for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) b.clear(x, y); };
function blades(ramp, count, low = 3) {
  return b => {
    empty(b);
    for (let i = 0; i < count; i++) {
      let x = 2 + b.r() * 12;
      const top = low + Math.floor(b.r() * 7), lean = (b.r() - 0.5) * 0.7, c = ramp[Math.floor(b.r() * ramp.length)];
      for (let y = N - 1; y >= top; y--) { b.put(Math.round(x), y, y < top + 2 ? ramp[ramp.length - 1] : c); x += lean; }
    }
  };
}
function fern(b) {
  empty(b);
  for (const [lean, rise] of [[-6.5, 7], [6.5, 7], [-3.5, 11], [3.5, 11], [0.5, 13]]) { // fronds rise from the root, then arch over
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, x = Math.round(7.5 + lean * t), y = Math.round(N - 1 - rise * Math.sin(t * 2.2) / Math.sin(1.57));
      b.put(x, y, BLADES[1]);
      if (i % 2 && i > 2) { b.put(x + 1, y, BLADES[2]); b.put(x - 1, y, BLADES[0]); b.put(x, y + 1, BLADES[2]); }
    }
  }
}
function flower(head) {
  return b => {
    empty(b);
    for (let y = 8; y < N; y++) b.put(8, y, y % 3 ? 0x4f8a3a : 0x3f7330);
    for (const [x, y] of [[9, 12], [10, 11], [7, 13], [6, 12]]) b.put(x, y, 0x5f9f44);
    head(b);
  };
}
const round = (colour, shade, heart) => b => {
  for (const [x, y] of [[7, 4], [8, 4], [9, 4], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [7, 7], [8, 7], [9, 7]]) b.put(x, y, b.r() < 0.25 ? shade : colour);
  b.put(8, 5, heart); b.put(8, 6, heart);
};
const star = (colour, shade, heart) => b => {
  for (let i = 1; i <= 3; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.put(8 + dx * i, 6 + dy * i, i === 3 ? shade : colour);
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.put(8 + dx, 6 + dy, colour);
  b.put(8, 6, heart);
};
function wheat(b) {
  empty(b);
  for (const [x, top] of [[3, 3], [6, 1], [9, 2], [12, 4]]) {
    for (let y = N - 1; y > top + 4; y--) b.put(x, y, 0x8fa24a);
    for (let y = top; y <= top + 5; y++) { b.put(x, y, WHEAT_T[2]); if (y % 2) { b.put(x - 1, y, WHEAT_T[1]); b.put(x + 1, y, WHEAT_T[0]); } }
  }
}
function deadBush(b) {
  empty(b);
  for (const [x, lean] of [[8, 0], [6, -0.6], [10, 0.6], [7, -0.9], [9, 0.9]]) { let at = x; for (let y = N - 1; y > 5 + Math.abs(lean) * 3; y--) { b.put(Math.round(at), y, y % 2 ? 0x6d5138 : 0x57402c); at += lean * 0.4; } }
}
function kelp(b) {
  empty(b);
  for (let y = 0; y < N; y++) {
    const x = 7 + Math.round(Math.sin(y * 0.8)), c = y % 4 === 0 ? 0x3aa368 : 0x2e8b57;
    b.put(x, y, c); b.put(x + 1, y, c); b.put(x - 1, y, 0x246f46);
    if (y % 4 === 1) { b.put(x + 2, y, 0x3aa368); b.put(x + 3, y + 1, 0x3aa368); }
    if (y % 4 === 3) { b.put(x - 2, y, 0x2e8b57); b.put(x - 3, y + 1, 0x2e8b57); }
  }
}
function vine(b) {
  empty(b);
  for (const [x, length] of [[3, 13], [6, 16], [9, 10], [12, 15]]) for (let y = 0; y < length; y++) { b.put(x + Math.round(Math.sin(y * 0.7 + x)), y, y % 5 === 4 ? 0xc8fff0 : y % 2 ? 0x6fe0b8 : 0x4fc49c); }
}
function mushroom(cap, spot) {
  return b => {
    empty(b);
    for (let y = 9; y < N; y++) for (const x of [7, 8]) b.put(x, y, 0xe4dcc8);
    for (let y = 5; y < 10; y++) { const half = y === 5 ? 2 : y === 6 ? 4 : 5; for (let x = 8 - half; x < 8 + half; x++) b.put(x, y, y === 9 ? cap[0] : cap[1]); }
    for (const [x, y] of [[5, 7], [8, 6], [10, 8]]) b.put(x, y, spot);
  };
}
function lilyPad(b) {
  empty(b);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), notch = x > 7 && Math.abs(y - x + 2) < 1.5;
    if (d < 7 && !notch) b.put(x, y, d < 4 + b.r() * 2 ? 0x4fa85a : 0x3f8f4a);
  }
}

// ---------- the deep ----------
const LIME = [0xb0a288, 0xbaac92, 0xc4b69c, 0xcebfa6, 0xd8cab2];
function veined(ramp, vein, lines = 3) { // pale stone with a few thin lines wandering through it
  return b => {
    wash(b, ramp, layered(b.r, 3, 3, 5, 5));
    for (let i = 0; i < lines; i++) {
      let x = Math.floor(b.r() * N), y = 0;
      const lean = b.r() < 0.5 ? 1 : -1;
      for (; y < N; y++) { b.put(mod(x, N), y, vein[Math.floor(b.r() * vein.length)]); if (b.r() < 0.6) x += lean; if (b.r() < 0.2) b.put(mod(x + lean, N), y, vein[0]); }
    }
  };
}
function drip(up) { // a spike of wet stone, narrowing to its point
  return b => {
    empty(b);
    for (const [cx, tall, wide] of [[8, 16, 3.4], [3, 9, 2], [12, 11, 2.2]]) for (let k = 0; k < tall; k++) {
      const half = wide * (1 - k / tall), y = up ? N - 1 - k : k;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half) - 1; x++) b.put(x, y, tone(LIME, Math.min(0.99, (x - cx + half) / (half * 2 + 0.01) * 0.7 + 0.15 + b.r() * 0.1)));
      b.put(Math.round(cx), y, LIME[4]);
    }
  };
}
function crystalCluster(b) {
  empty(b);
  const ramp = [0x6a3eb8, 0x8e5ee0, 0xb48af8, 0xdcc4ff];
  for (const [cx, tall, wide, lean] of [[8, 15, 3, 0], [4, 10, 2, -0.3], [12, 11, 2, 0.3], [6, 6, 1.5, -0.1], [10, 7, 1.5, 0.1]]) for (let k = 0; k < tall; k++) {
    const half = Math.min(wide, (tall - k) * 0.8), mid = cx + lean * k;
    for (let x = Math.round(mid - half); x <= Math.round(mid + half) - 1; x++) b.put(x, N - 1 - k, ramp[x < mid - half / 3 ? 2 : x < mid + half / 3 ? 3 : 1]);
    if (k === tall - 1) b.put(Math.round(mid), N - 1 - k, 0xffffff);
  }
}
function roots(b) {
  empty(b);
  for (const [x, length] of [[2, 11], [5, 15], [8, 9], [10, 14], [13, 12]]) { let at = x; for (let y = 0; y < length; y++) { b.put(Math.round(at), y, y % 3 ? 0x8f7450 : 0x6f5838); at += Math.sin(y * 0.9 + x) * 0.5; } }
}
function pillarSide(b) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) b.put(x, y, x % 4 === 1 ? 0xc8c6bc : x % 4 === 3 ? 0xfafaf4 : 0xe8e6de);
  for (let x = 0; x < N; x++) { b.put(x, 0, 0xb8b6ac); b.put(x, N - 1, 0xb8b6ac); }
}
function myceliumSide(b) {
  dirt(b);
  const lip = field(b.r, 8, 1);
  for (let x = 0; x < N; x++) { const depth = 2 + Math.floor(lip(x, 0) * 3); for (let y = 0; y < depth; y++) b.put(x, y, tone([0x5e5068, 0x7a6a8a, 0x8f7ea0], b.r())); }
}

function ropeLadder(b) {
  empty(b);
  for (let y = 0; y < N; y++) for (const x of [3, 12]) b.put(x, y, y % 3 ? 0xb8925a : 0x8a6a3a);
  for (let y = 2; y < N; y += 4) for (let x = 3; x <= 12; x++) { b.put(x, y, 0xa87a48); b.put(x, y + 1, 0x7a5a3a); }
}

// ---------- the stations ----------
const WOOD = { h: 0xc9a06c, p: 0xa8835a, d: 0x7a5a3a, k: 0x3f2a1a, s: 0xc8cede, g: 0x8b92a8, r: 0xc02c42, y: 0xfac13c };
const FIRE = { k: 0x2a1a1a, r: 0xc83a18, o: 0xff7a1a, y: 0xffc83c, w: 0xfff0a0, s: 0x8b8c84, d: 0x55564f, b: 0x7a3f33 };
const CHEST = { k: 0x2e2030, s: 0xa8aebb, l: 0xd8dce4, y: 0xfac13c, o: 0xc9740f, d: 0x5a3a22 };
const ROCK_PLANKS = planks([0x96724c, 0xa8835a, 0xb49068, 0xbf9c74], 0x6d4f33);
const FORGE_BRICK = bricks([0x6d3a30, 0x7a3f33, 0x8c4c3c, 0x9c5a48], 0x3a2020);
const tableTop = b => {
  ROCK_PLANKS(b);
  picture(['kkkkkkkkkkkkkkkk', 'kh............dk', 'k.kkkkkkkkkkkk.k', 'k.kppkppkppkpk.k', 'k.kppkppkppkpk.k', 'k.kkkkkkkkkkkk.k', 'k.kppkppkppkpk.k', 'k.kppkppkppkpk.k', 'k.kkkkkkkkkkkk.k', 'k.kppkppkppkpk.k', 'k.kppkppkppkpk.k', 'k.kkkkkkkkkkkk.k', 'k..............k', 'k..............k', 'kd............dk', 'kkkkkkkkkkkkkkkk'], WOOD)(b);
};
const tableSide = b => {
  ROCK_PLANKS(b);
  picture(['kkkkkkkkkkkkkkkk', 'k..............k', 'k.ssg......dd..k', 'k.ssg.....dhd..k', 'k..d......dhd..k', 'k..d.......d...k', 'k..d.......d...k', 'k..d...gsssss..k', 'k..d..gssssss..k', 'k.....ddd......k', 'k.....dhd......k', 'k.....ddd......k', 'k..............k', 'k..............k', 'k..............k', 'kkkkkkkkkkkkkkkk'], WOOD)(b);
};
const cobbled = stones([0x62635e, 0x75766f, 0x87887f, 0x999a91], 0x484945);
const oven = lit => b => {
  cobbled(b);
  const mouth = lit
    ? ['................', '................', '....kkkkkkkk....', '...kkkkkkkkkk...', '...kkrokkorkk...', '...krooyyoork...', '...kroyywyork...', '...kroywwyork...', 'ddddddddddddddd.', '...krrooyorrk...', '...kkrrrrrrkk...', '...kkkkkkkkkk...', '................', '................', '................', '................']
    : ['................', '................', '....kkkkkkkk....', '...kkkkkkkkkk...', '...kkkkkkkkkk...', '...kkkkkkkkkk...', '...kkkkkkkkkk...', '...kkkkkkkkkk...', 'ddddddddddddddd.', '...kkkkkkkkkk...', '...kkkkkkkkkk...', '...kkkkkkkkkk...', '................', '................', '................', '................'];
  picture(mouth, FIRE)(b);
};
const forge = lit => b => {
  FORGE_BRICK(b);
  const glow = lit ? { 1: 0xff7a1a, 2: 0xffc83c, 3: 0xfff0a0 } : { 1: 0x2a1a1a, 2: 0x2a1a1a, 3: 0x2a1a1a };
  picture(['................', '.ssssssssssssss.', '.s............s.', '...kkkkkkkkkk...', '..kk11111111kk..', '..k1112222111k..', '..k1122332211k..', '..k1223333221k..', '..k1223333221k..', '..k1122222211k..', '..kk11111111kk..', '...kkkkkkkkkk...', '.ssssssssssssss.', '.s.s.s.s.s.s.s..', '................', '................'], { ...FIRE, ...glow, s: 0x8b92a8 })(b);
};
const forgeTop = b => {
  FORGE_BRICK(b);
  picture(['................', '................', '..kkkkkkkkkkkk..', '..ksssssssssss..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ks.k.k.k.k.s..', '..ksssssssssss..', '..kkkkkkkkkkkk..', '................', '................'], { k: 0x241418, s: 0x8b92a8 })(b);
};
function anvilTile(b) { mottled([0x3a3a44, 0x4a4a54, 0x5a5a66, 0x6a6a78], 5)(b); for (let x = 0; x < N; x++) b.put(x, 0, 0x7e7e8c); }
const alchemyTop = b => {
  planks([0x5c4632, 0x6a5038, 0x785c42], 0x3f2e20)(b);
  picture(['................', '..vvv...........', '.vVVVv.......g..', '.vVVVv......gcg.', '.vVVVv.....gcccg', '..vvv......gcccg', '..........gccccg', '...........gggg.', '......y.........', '.....yyy........', '....bbbbb.......', '....bwwwb.......', '....bbbbb.......', '.........d.d.d..', '................', '................'], { v: 0x6d42b8, V: 0xb086f0, g: 0xbfe0ee, c: 0x62d0ff, y: 0xfac13c, b: 0x7a3f33, w: 0xf0e6d0, d: 0xd8bcff })(b);
};
const alchemySide = b => {
  planks([0x6a5038, 0x785c42, 0x866a4c], 0x3f2e20)(b);
  picture(['kkkkkkkkkkkkkkkk', 'k..............k', 'k.g...g....g...k', 'k.r..gvg..gcg..k', 'krrr.gvg.cccc..k', 'krrr.gvg.cccc..k', 'kkkkkkkkkkkkkkkk', 'k..............k', 'k...g.....g..g.k', 'k..gyg...ggggg.k', 'k..gyg...gcccg.k', 'k..gyg...gcccg.k', 'kkkkkkkkkkkkkkkk', 'k..............k', 'k..............k', 'kkkkkkkkkkkkkkkk'], { k: 0x2e2030, g: 0xbfe0ee, r: 0xd8344a, v: 0xb086f0, c: 0x62d0ff, y: 0xfac13c })(b);
};
const chestWood = planks([0x8f6636, 0xa87a48, 0xb88a54, 0xc49a62], 0x5a3a22);
const chestSide = b => {
  chestWood(b);
  picture(['kkkkkkkkkkkkkkkk', 'k.............dk', 'k.............dk', 'k.............dk', 'ssssssssssssssss', 'kkkkkkkyykkkkkkk', '.......yoy......', '.......yoo......', '................', '................', '................', '................', 'ssssssssssssssss', 'k.............dk', 'k.............dk', 'kkkkkkkkkkkkkkkk'], CHEST)(b);
};
const chestTop = b => {
  chestWood(b);
  picture(['kkkkkkkkkkkkkkkk', 'k.............dk', 'k.............dk', 'k.............dk', 'ssssssssssssssss', 'k.............dk', 'k.............dk', 'k.............dk', 'k.............dk', 'k.............dk', 'k.............dk', 'ssssssssssssssss', 'k.............dk', 'k.............dk', 'k.............dk', 'kkkkkkkkkkkkkkkk'], CHEST)(b);
};
function chiseled(b) {
  bricks([0x74766f, 0x83857e, 0x8f918a, 0x9b9d96], 0x55564f, 16, 16)(b);
  picture(['ddddddddddddddd', 'd.............d', 'd.ddddddddddd.d', 'd.d.........d.d', 'd.d.ddddddd.d.d', 'd.d.d.....d.d.d', 'd.d.d.ddd.d.d.d', 'd.d.d.d.d.d.d.d', 'd.d.d.ddd.d.d.d', 'd.d.d.....d.d.d', 'd.d.ddddddd.d.d', 'd.d.........d.d', 'd.ddddddddddd.d', 'd.............d', 'ddddddddddddddd'], { d: 0x62635e })(b);
}
function polishedStone(b) {
  mottled([0x9a9c95, 0xa4a69f, 0xaeb0a8], 3)(b);
  for (let i = 0; i < N; i++) { b.put(i, 0, 0x7f817a); b.put(0, i, 0x7f817a); b.put(i, N - 1, 0x7f817a); b.put(N - 1, i, 0x7f817a); b.put(i, 1, 0xbcbeb6); b.put(1, i, 0xbcbeb6); }
}

// ---------- the list ----------
const PAINT = {
  stone: mottledStone,
  dirt,
  grass_top: mottled(BLADES, 6),
  grass_side: grassSide,
  sand: mottled([0xd2c491, 0xdccf9f, 0xe4d9ad, 0xecdfb6], 6),
  gravel: stones([0x6a6866, 0x7d7a78, 0x908d8a, 0xa5a29e], 0x54514f, 16),
  snow: mottled([0xe6eefa, 0xeef4fc, 0xf6fafe, 0xffffff], 5),
  ice,
  red_clay: mottled([0xa9623a, 0xbb6f44, 0xc77a4a, 0xd28a58], 5),
  moss: mottled([0x3f7a3c, 0x4f8f4a, 0x5ea255, 0x6fb362], 8),
  path,
  farmland,
  cobble: stones([0x62635e, 0x75766f, 0x87887f, 0x999a91], 0x484945),
  mossy_cobble: b => { stones([0x62635e, 0x75766f, 0x87887f, 0x999a91], 0x484945)(b); const moss = ranked(layered(b.r, 3, 3)); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (moss(x, y) > 0.68) b.put(x, y, tone([0x4f7a3f, 0x5f8f4a, 0x6fa354], b.r())); },
  stone_bricks: bricks([0x74766f, 0x83857e, 0x8f918a, 0x9b9d96], 0x55564f),
  mossy_bricks: b => { bricks([0x74766f, 0x83857e, 0x8f918a, 0x9b9d96], 0x55564f)(b); const moss = ranked(layered(b.r, 3, 3)); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (moss(x, y) > 0.72) b.put(x, y, tone([0x4f7a3f, 0x5f8f4a], b.r())); },
  pearlstone: bricks([0xddcfe2, 0xe8daea, 0xf1e5f2, 0xfaf1f8], 0xc7b8cf, 8, 16),
  planks: planks([0x96724c, 0xa8835a, 0xb49068, 0xbf9c74], 0x6d4f33),
  plaster: mottled([0xdccfb2, 0xe6dcc2, 0xefe6d0], 5),
  timber,
  sandstone: bricks([0xc9b277, 0xd7c188, 0xe2cd96], 0xb09a62, 8, 16),
  sandstone_top: mottled([0xcdb67c, 0xd9c48a, 0xe5d19c], 5),
  terracotta: mottled([0xa55e3a, 0xb56a42, 0xc0754c], 3),
  terracotta_dark: mottled([0x6c3e2e, 0x7a4634, 0x87503d], 3),
  coal_ore: ore([0x2a2a2c, 0x3a3a3e, 0x4a4a4e]),
  iron_ore: ore([0xc99a6a, 0xd8ae80, 0xe5c6a0]),
  mana_ore: ore([0xb0ecff, 0x6accf8, 0xe8fbff], 5),
  mana_crystal: crystal,
  mana_cluster: manaCluster,
  oak_bark: bark([0x5f472e, 0x705638, 0x7f6443], 0x4a3622),
  oak_top: rings(0x5f472e, 0xa88a60, 0x8b704f),
  birch_bark: b => { bark([0xcfcabb, 0xdcd8cc, 0xe8e4da], 0xc2bdae)(b); specks(b, [0x2f2a24], 7, 2); },
  birch_top: rings(0xbdb7a6, 0xd9cfae, 0xc4b890),
  spruce_bark: bark([0x3f2e20, 0x4c3827, 0x5a4431], 0x2f2218),
  spruce_top: rings(0x3f2e20, 0x8a6a48, 0x6a5138),
  palm_bark: b => { bark([0x7c6644, 0x8f7650, 0x9f865e], 0x655236)(b); for (let y = 2; y < N; y += 4) for (let x = 0; x < N; x++) b.put(x, y, 0x655236); },
  elder_bark: bark([0xd2cab0, 0xe0dac4, 0xece7d6], 0xbfb69a),
  elder_top: rings(0xcfc7ad, 0xece6d4, 0xd8d0b8),
  leaves: leafy(BLADES, 0.16),
  birch_leaves: leafy([0x5f8f47, 0x75a355, 0x8ab566, 0x9fc476], 0.16),
  spruce_leaves: leafy([0x2c4f3a, 0x375f46, 0x437052, 0x4f8060], 0.2),
  palm_leaves: leafy([0x4f9a3f, 0x62ad4a, 0x78be58, 0x8fcc68], 0.26, 10),
  elf_leaves: leafy([0x2f9f86, 0x3cb89a, 0x4fd0ae, 0x6fe6c4], 0.15, 8, 0xd6fff0),
  roof_tiles: roofTiles([0x8f4038, 0xa94e43, 0xbc5c50, 0xcc6c5e], 0x6d2f29),
  slate: roofTiles([0x3f4659, 0x4f5870, 0x5c6680, 0x6a7590], 0x2c3142),
  thatch: thatch([0xb8923f, 0xcea84e, 0xdcb95e, 0xe8c970], 0x96762f),
  hay_side: hayBand,
  hay_top: thatch([0xb8913a, 0xcfa848, 0xe0bc58], 0x9a7a30),
  glass,
  lantern,
  torch,
  banner,
  totem,
  bookshelf,
  barrel_side: barrelSide,
  barrel_top: rings(0x5a5a60, 0x9f7c54, 0x8a6a46),
  bedrock: stones([0x2f2f31, 0x3c3c3f, 0x4a4a4e, 0x595960], 0x1e1e20),
  blackstone: mottled([0x201926, 0x2a2230, 0x352c3c, 0x41374a], 4),
  obsidian: b => { mottled([0x120a1e, 0x1a1028, 0x241836, 0x2e2046], 4)(b); specks(b, [0x54408a], 4); },
  ash_top: b => { mottled([0x4a1520, 0x5a1a28, 0x6a2030, 0x7a2838], 4)(b); specks(b, [0x2a2230, 0x8f8a8a], 9); },
  ash_side: b => { mottled([0x2a1a20, 0x3a1a20, 0x46242c], 4)(b); for (let x = 0; x < N; x++) for (let y = 0; y < 2 + (x * 7 % 3); y++) b.put(x, y, 0x5a1a28); },
  basalt_side: streaked([0x38353e, 0x4a4650, 0x57535e, 0x655f6c], 8, 2),
  basalt_top: stones([0x3f3c46, 0x4a4650, 0x57535e], 0x2c2a30, 6),
  magma: fractured([0x3a1410, 0x4c1a12, 0x5e2214], [0xff8a1a, 0xffd24a]),
  bone_side: streaked([0xd0c8ae, 0xe0d8c0, 0xece6d2], 7, 2),
  bone_top: rings(0xd8d0b8, 0xece6d2, 0xc4bca2),
  wool_red: mottled([0x9a2e2e, 0xb23a3a, 0xc44848], 8),
  wool_white: mottled([0xd8d6cf, 0xe8e6e0, 0xf4f2ec], 8),
  coral_pink: coral([0xc84a80, 0xe85c95, 0xff6fa8, 0xff9ac4]),
  coral_orange: coral([0xc86c28, 0xe8843a, 0xff9b4a, 0xffbd7c]),
  coral_blue: coral([0x2a8cc4, 0x3aa8e4, 0x4ac6ff, 0x8adcff]),
  mushroom_cap: b => { mottled([0x3fb0bc, 0x4fc0cc, 0x5ccfd8, 0x7ce0e6], 5)(b); specks(b, [0xd8ffff], 8, 2); },
  cactus_side: b => { streaked([0x2f6f3a, 0x3f8a4a, 0x4f9c58], 8, 2)(b); for (let y = 2; y < N; y += 5) for (const x of [3, 8, 13]) b.put(x, y, 0xe4dcb0); },
  cactus_top: b => { mottled([0x3f8a4a, 0x4f9c58, 0x62ad68], 4)(b); for (let i = 0; i < N; i++) { b.put(i, 0, 0x2f6f3a); b.put(0, i, 0x2f6f3a); b.put(i, N - 1, 0x2f6f3a); b.put(N - 1, i, 0x2f6f3a); } },
  tall_grass: blades(BLADES, 11),
  dry_grass: blades([0x9a8440, 0xb59c4e, 0xcdb460, 0xe0ca78], 9),
  sea_grass: blades([0x1f7a52, 0x2f8f5f, 0x45a874], 8, 1),
  fern,
  poppy: flower(round(0xd8413c, 0xa82e2e, 0x2a1a1a)),
  dandelion: flower(round(0xf2d24a, 0xd9b030, 0xfff0a0)),
  cornflower: flower(star(0x4f7ee0, 0x3558b0, 0xe8f0ff)),
  fae_bloom: flower(star(0xf08cf0, 0xc060e0, 0xfff4ff)),
  wheat,
  dead_bush: deadBush,
  kelp,
  glow_vine: vine,
  glowshroom: mushroom([0x3fb0c4, 0x7cf6ff], 0xe8ffff),
  red_mushroom: mushroom([0x9a2e2a, 0xc8483c], 0xf4efe0),
  lily_pad: lilyPad,
  // ores: what lies near the surface sits in stone, and what lies deep in Deepstone
  copper_ore: ore([0xe8935a, 0xcc7040, 0xffc79a]),
  silver_ore: ore([0xffffff, 0xd6dee8, 0xb0bccc], 5),
  gold_ore: ore([0xffdc60, 0xf7ae2a, 0xfff6b8], 5),
  mithril_ore: ore([0xa6f2ff, 0x62ccf7, 0xecfcff], 5, deepstone),
  adamant_ore: ore([0xc48ef8, 0x8e52e4, 0xf0dcff], 5, deepstone),
  ruby_ore: gems([0xff5a6e, 0xd8203c, 0x98142c, 0xffc0c8], deepstone),
  sapphire_ore: gems([0x5aa4ff, 0x2460d8, 0x163e9c, 0xc0e4ff], deepstone),
  emerald_ore: gems([0x5fe89a, 0x20b868, 0x14804c, 0xc8ffd8], deepstone),
  // the deep
  deepstone,
  cobbled_deepstone: stones([0x2e2e38, 0x3c3c48, 0x4a4a58, 0x5a5a6a], 0x22222a),
  deepstone_bricks: bricks([0x3f3f4b, 0x4a4a58, 0x565665, 0x626272], 0x2a2a34),
  marble: veined([0xdedcd4, 0xe8e6de, 0xf0efe9, 0xf8f7f2], [0xb8b6ac, 0xc8c6bc]),
  polished_marble: b => { veined([0xe8e6de, 0xf0efe9, 0xf8f7f2], [0xd0cec4], 2)(b); for (let i = 0; i < N; i++) { b.put(i, 0, 0xc8c6bc); b.put(0, i, 0xc8c6bc); b.put(i, N - 1, 0xc8c6bc); b.put(N - 1, i, 0xc8c6bc); } },
  pillar_side: pillarSide,
  pillar_top: b => { veined([0xe8e6de, 0xf0efe9], [0xd0cec4], 1)(b); rings(0xb8b6ac, 0xf8f7f2, 0xe0ded6)(b); },
  gilded_marble: veined([0xe4e2da, 0xecebe4, 0xf4f3ec], [0xfac13c, 0xffe58a, 0xd6960f], 4),
  limestone: b => { wash(b, LIME, layered(b.r, 8, 2, 8, 3)); },
  stalactite: drip(false),
  stalagmite: drip(true),
  amethyst: faceted([0x7444c8, 0x9a68e0, 0xb88af0, 0xd0a4ff], 0xecdcff),
  crystal_cluster: crystalCluster,
  glow_moss: b => { mottled([0x2f7a5a, 0x3f946c, 0x4fae82, 0x62c49a], 8)(b); specks(b, [0xc8fff0, 0x9ff0d8], 9); },
  mycelium_top: b => { mottled([0x5e5068, 0x6c5c78, 0x7a6a8a, 0x8a7a9a], 7)(b); specks(b, [0xa8e8f0, 0xd8c8e8], 7); },
  mycelium_side: myceliumSide,
  stem_side: streaked([0xd4ccb8, 0xe4dcc8, 0xf0e8d6], 8, 2),
  stem_top: rings(0xc4bca8, 0xf0e8d6, 0xdcd4c0),
  blue_ice: b => { faceted([0x4f94dc, 0x62a8e8, 0x7cbcf0, 0x9ad0f8], 0xcceaff)(b); },
  hanging_roots: roots,
  rope_ladder: ropeLadder,
  // building
  birch_planks: planks([0xc8b88e, 0xd4c59c, 0xdfd2ac, 0xe8dcba], 0x9a8a64),
  spruce_planks: planks([0x54402a, 0x634c33, 0x72583c, 0x7f6446], 0x38281a),
  palm_planks: planks([0xb08e4e, 0xc0a05c, 0xcdb06a, 0xd8be7a], 0x82683a),
  elder_planks: planks([0xdcd4bc, 0xe8e0ca, 0xf0ead8, 0xf8f2e4], 0xb8ae92),
  bricks: bricks([0x8f4a3a, 0xa85a48, 0xb86a56, 0xc87a64], 0xc8bcb0),
  polished_stone: polishedStone,
  chiseled_stone: chiseled,
  coal_block: plated([0x1e1e22, 0x2a2a2e, 0x38383e, 0x4a4a52], 0x101012),
  copper_block: plated([0xf09a62, 0xcc7040, 0xb05c34, 0x9c4c2c], 0x6f3220),
  iron_block: plated([0xeef0f4, 0xd6dae2, 0xbcc2cc, 0xa8aebb], 0x7a8092),
  silver_block: plated([0xffffff, 0xf0f4fa, 0xdce4f0, 0xc6d2e6], 0x93a2be),
  gold_block: plated([0xfff0a0, 0xffdc60, 0xfac13c, 0xf7ae2a], 0xcc7a12),
  mithril_block: plated([0xc8f6ff, 0x8ce4fb, 0x62ccf7, 0x48b0ec], 0x1c5cac),
  adamant_block: plated([0xc48ef8, 0xa86ef0, 0x8e52e4, 0x7a40cc], 0x3a1a7c),
  ruby_block: faceted([0xb01830, 0xd8203c, 0xf0405a, 0xff7a8c], 0xffc0c8),
  sapphire_block: faceted([0x1a4cb0, 0x2460d8, 0x3f80f0, 0x7ab0ff], 0xc0e4ff),
  emerald_block: faceted([0x149858, 0x20b868, 0x40d488, 0x7ae8aa], 0xc8ffd8),
  // stations
  table_top: tableTop,
  table_side: tableSide,
  furnace_top: stones([0x75766f, 0x87887f, 0x999a91], 0x484945, 16),
  furnace_front: oven(false),
  furnace_lit: oven(true),
  forge_top: forgeTop,
  forge_front: forge(false),
  forge_lit: forge(true),
  anvil: anvilTile,
  alchemy_top: alchemyTop,
  alchemy_side: alchemySide,
  chest_top: chestTop,
  chest_side: chestSide,
};

// A pixel with no colour of its own would pull its neighbours towards black as the mipmaps shrink, so it borrows the tile's average.
function fillHoles(px) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  if (!n) return;
  for (let i = 0; i < px.length; i += 4) if (!px[i + 3]) { px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; }
}
export const TILE_NAMES = Object.keys(PAINT);
const tiles = new Map(TILE_NAMES.map(name => {
  const b = brush(name);
  PAINT[name](b);
  fillHoles(b.px);
  return [name, b.px];
}));
const INDEX = new Map(TILE_NAMES.map((name, i) => [name, i]));
export const tileIndex = name => INDEX.get(name);
export const tilePixels = name => tiles.get(name);
// All of them end to end, ready to be the layers of one texture.
export function allTiles() {
  const out = new Uint8Array(N * N * 4 * TILE_NAMES.length);
  TILE_NAMES.forEach((name, i) => out.set(tiles.get(name), i * N * N * 4));
  return out;
}
// Mining cracks: ten stages, each adding to the last, so that a block breaks along the same lines every time.
export const CRACK_STAGES = 10;
export function crackPixels() {
  const out = new Uint8Array(N * N * CRACK_STAGES * 4), r = mulberry(1776);
  const paths = Array.from({ length: CRACK_STAGES }, () => {
    let x = 4 + r() * 8, y = 4 + r() * 8;
    const points = [], dx = (r() - 0.5) * 1.6, dy = (r() - 0.5) * 1.6;
    for (let i = 0; i < 9; i++) { points.push([Math.round(x), Math.round(y)]); x += dx + (r() - 0.5); y += dy + (r() - 0.5); }
    return points;
  });
  for (let stage = 0; stage < CRACK_STAGES; stage++) for (let s = 0; s <= stage; s++) for (const [x, y] of paths[s]) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    out[(x + y * N + stage * N * N) * 4 + 3] = 170;
  }
  return out;
}

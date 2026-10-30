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
const ore = (colours, count = 6) => b => {
  mottledStone(b);
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(b.r() * 12), y = 2 + Math.floor(b.r() * 12);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) if (b.r() < 0.8) b.put(x + dx, y + dy, colours[Math.floor(b.r() * colours.length)]);
    b.put(x, y, colours[0]);
  }
};
const STONE = [0x6e706b, 0x7b7d77, 0x868982, 0x91948d, 0x9fa29b];
const mottledStone = b => wash(b, STONE, layered(b.r, 3, 6, 4, 7));
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
function crystal(b) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = mod(x + y, 8), c = mod(x - y, 8);
    b.put(x, y, a < 1 || c < 1 ? 0xf0dcff : tone([0x7a4fc0, 0x9468dc, 0xb086f0, 0xc9a4ff], mod(a * 0.09 + c * 0.05 + b.r() * 0.12, 1)));
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
  mana_ore: ore([0xc9a4ff, 0xa87ef0, 0xe0ccff], 5),
  mana_crystal: crystal,
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

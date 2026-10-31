// Seeded RNG, hashing and simplex noise.
export function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
let SEED = 1;
export const hash2 = (x, z) => (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ SEED) >>> 0;
export const hash3 = (x, y, z) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function makeSimplex(seed) {
  const r = mulberry(seed), p = new Uint8Array(512), a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (x, y) => {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
    let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { g = (p[ii + p[jj]] & 7) * 2; tt *= tt; n += tt * tt * (G[g] * x0 + G[g + 1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { g = (p[ii + i1 + p[jj + j1]] & 7) * 2; tt *= tt; n += tt * tt * (G[g] * x1 + G[g + 1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { g = (p[ii + 1 + p[jj + 1]] & 7) * 2; tt *= tt; n += tt * tt * (G[g] * x2 + G[g + 1] * y2); }
    return 70 * n;
  };
}
// True 3D noise, for what must look right from every side: a hall's walls show the seams of the slices below.
function makeSimplex3(seed) {
  const r = mulberry(seed), a = new Uint8Array(256), p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  const G = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
  const F = 1 / 3, K = 1 / 6;
  const corner = (x, y, z, g) => { const t = 0.6 - x * x - y * y - z * z; if (t <= 0) return 0; const i = g * 3, tt = t * t; return tt * tt * (G[i] * x + G[i + 1] * y + G[i + 2] * z); };
  return (x, y, z) => {
    const s = (x + y + z) * F, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * K;
    const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    const i1 = x0 >= y0 && x0 >= z0 ? 1 : 0, j1 = !i1 && y0 >= z0 ? 1 : 0, k1 = !i1 && !j1 ? 1 : 0;
    const i2 = x0 >= z0 || x0 >= y0 ? 1 : 0, j2 = y0 >= x0 || y0 >= z0 ? 1 : 0, k2 = z0 >= x0 || z0 >= y0 ? 1 : 0;
    const a2 = i2 + j2 + k2 === 3 ? (x0 >= y0 && y0 >= z0 ? [1, 1, 0] : x0 >= z0 && z0 >= y0 ? [1, 0, 1] : z0 >= x0 && x0 >= y0 ? [1, 0, 1] : y0 >= x0 && x0 >= z0 ? [1, 1, 0] : [0, 1, 1]) : [i2, j2, k2];
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const pick = (a1, b1, c1) => p[ii + a1 + p[jj + b1 + p[kk + c1]]] % 12;
    return 32 * (corner(x0, y0, z0, pick(0, 0, 0))
      + corner(x0 - i1 + K, y0 - j1 + K, z0 - k1 + K, pick(i1, j1, k1))
      + corner(x0 - a2[0] + 2 * K, y0 - a2[1] + 2 * K, z0 - a2[2] + 2 * K, pick(a2[0], a2[1], a2[2]))
      + corner(x0 - 1 + 3 * K, y0 - 1 + 3 * K, z0 - 1 + 3 * K, pick(1, 1, 1)));
  };
}
export function fbm(n, x, z, o) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < o; i++) { s += a * n(x * f, z * f); t += a; a *= 0.5; f *= 2; } return s / t; }
// Three slices of 2D noise, which is all a cave needs and a third of the price of the real thing per sample.
export const noise3 = (n, x, y, z) => (n(x, y) + n(y + 31.7, z) + n(z - 17.3, x)) / 1.5;
export const ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
export const NZ = {};
export function initNoise(seed) {
  SEED = seed;
  // the seed offsets are part of the terrain: changing one reshapes every existing world
  NZ.H = makeSimplex(seed + 1); NZ.M = makeSimplex(seed + 2); NZ.D = makeSimplex(seed + 5);
  NZ.W = makeSimplex(seed + 7); NZ.R = makeSimplex(seed + 11); NZ.F = makeSimplex(seed + 13);
  NZ.CA = makeSimplex(seed + 17); NZ.CB = makeSimplex(seed + 19);
  // the deep, in sim/caves.js: new fields only ever join the end of this list
  NZ.HALL = makeSimplex(seed + 23); NZ.LEVEL = makeSimplex(seed + 29); NZ.PILLAR = makeSimplex(seed + 31); NZ.BIOME = makeSimplex(seed + 37);
  NZ.ROCK = makeSimplex3(seed + 41); NZ.GRIT = makeSimplex3(seed + 43); NZ.RIBBON = makeSimplex(seed + 47);
  NZ.GIRTH = makeSimplex3(seed + 59); NZ.THREAD_A = makeSimplex3(seed + 61); NZ.THREAD_B = makeSimplex3(seed + 67); NZ.PATCH = makeSimplex3(seed + 71);
}

// The sky over the world: a gradient that follows the sun, stars, a sun and two moons in square pixels, and blocky clouds that drift
// and throw their shadows on the ground. Each realm leans the colours its own way, and walking between them shifts the sky slowly.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { settings } from '../core/settings.js';
import { RD } from '../sim/chunks.js';
import { ss } from '../sim/noise.js';
import { player } from '../sim/player.js';
import { B, climateAt } from '../sim/terrain.js';
import { WORLD } from '../core/content.js';
import { CLOUD_CELL, CLOUD_CELLS, CLOUD_SPAN, cloudMap, cloudMat, shared, skyMat } from './materials.js';
import { shadersActive } from './pipeline.js';
import { ambientLight, scene, sunLight } from './scene.js';

const SUN_FAR = 400, SUN_TILT = 0.22, CLOUD_Y = WORLD.sea + 80, CLOUD_DEEP = 5, CLOUD_FILL = 0.56, WIND = [1.6, 0.5]; // blocks a second
const MOOD_EASE = 0.5, UNDER_EASE = 8;
const SKY_LIFT = 1.2, SUN_ORB = 7, MOON_ORB = 1.6, CLOUD_LIFT = 1.7, BODY_SUN = 2.4, BODY_FILL = 1.7, MOONLIGHT = [0.13, 0.17, 0.3], NIGHT_FILL = [0.022, 0.03, 0.058];
const rgb = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const DAY = { zenith: rgb(0x4d86d8), horizon: rgb(0xb6daf0), light: [1, 0.985, 0.94] };
const NIGHT = { zenith: rgb(0x050a1c), horizon: rgb(0x0e1830), light: [0.17, 0.21, 0.34] };
const DUSK = { horizon: rgb(0xf08a52), glow: rgb(0xff7a30), light: [1, 0.74, 0.56], cloud: rgb(0xffb08a) };
// What each realm does to that: [zenith, horizon, sunlight tint, how close the haze comes].
const MOODS = {
  [B.DEMON]: { zenith: rgb(0x3a1216), horizon: rgb(0x8a3424), light: [1, 0.72, 0.62], cloud: rgb(0x4a2a2a), haze: 0.62, pull: 0.82 },
  [B.ELF]: { zenith: rgb(0x3f8ccc), horizon: rgb(0xb0ecd8), light: [0.94, 1, 0.96], cloud: rgb(0xeafff6), haze: 0.86, pull: 0.5 },
  [B.BEAST]: { zenith: rgb(0x5c90c8), horizon: rgb(0xe8d6a8), light: [1, 0.96, 0.86], cloud: rgb(0xfff4e0), haze: 1, pull: 0.55 },
  [B.PEAKS]: { zenith: rgb(0x3a74d0), horizon: rgb(0xd4e8f8), light: [0.96, 0.98, 1], cloud: rgb(0xffffff), haze: 1.05, pull: 0.5 },
  [B.MIRE]: { zenith: rgb(0x5a7f76), horizon: rgb(0xa8bda0), light: [0.88, 0.96, 0.86], cloud: rgb(0xc4d2bc), haze: 0.7, pull: 0.7 },
};
const mood = { zenith: [0, 0, 0], horizon: [0, 0, 0], light: [1, 1, 1], cloud: [1, 1, 1], haze: 1, pull: 0 };
let moodReady = false, wind = 0, clock = 0, under = 0;

// ---------- the dome and the lights in it ----------
const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skyMat);
dome.frustumCulled = false; dome.renderOrder = -10;
scene.add(dome);

export const heavens = new THREE.Group();
scene.add(heavens);
function pixelDisc(n, paint) {
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [c, a] = paint(x - n / 2 + 0.5, y - n / 2 + 0.5, x, y), i = (x + y * n) * 4;
    [px[i], px[i + 1], px[i + 2]] = c.map(v => v * 255); px[i + 3] = a * 255;
  }
  const t = new THREE.DataTexture(px, n, n);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
function orb(texture, size, at, blending) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending }));
  m.position.set(...at); m.lookAt(0, 0, 0); m.renderOrder = -5; m.frustumCulled = false;
  heavens.add(m);
  return m;
}
const sunTexture = pixelDisc(24, (x, y) => {
  const d = Math.max(Math.abs(x), Math.abs(y));
  if (d < 5) return [rgb(0xfffbe6), 1];
  if (d < 7) return [rgb(0xffe99a), 1];
  return [rgb(0xffd060), Math.round(Math.max(0, 1 - (d - 7) / 5) * 4) / 4 * 0.55];
});
const moonTexture = (light, dark, spots) => pixelDisc(16, (x, y, px, py) => {
  if (Math.hypot(x, y) > 7.2) return [light, 0];
  const pit = spots.some(([a, b, r]) => Math.hypot(px - a, py - b) < r);
  return [pit ? dark : light, 1];
});
const sunOrb = orb(sunTexture, 110, [SUN_FAR, 0, SUN_FAR * SUN_TILT], THREE.AdditiveBlending);
const moons = [
  orb(moonTexture(rgb(0xffcbea), rgb(0xe89ccc), [[5, 5, 2], [10, 9, 2.4], [6, 11, 1.2]]), 46, [-SUN_FAR * 0.95, -SUN_FAR * 0.3, -SUN_FAR * 0.28], THREE.NormalBlending),
  orb(moonTexture(rgb(0xd6ecff), rgb(0xa8c8e8), [[6, 7, 1.8], [10, 5, 1.2]]), 28, [-SUN_FAR * 0.8, SUN_FAR * 0.42, SUN_FAR * 0.36], THREE.NormalBlending),
];

// ---------- clouds ----------
function cloudBits() {
  const n = CLOUD_CELLS, bits = new Uint8Array(n * n);
  const lump = (x, y, cells, seed) => {
    const fx = x / n * cells, fy = y / n * cells, ix = Math.floor(fx), iy = Math.floor(fy), at = (a, b) => { const h = Math.sin(((a + cells) % cells) * 127.1 + ((b + cells) % cells) * 311.7 + seed) * 43758.5453; return h - Math.floor(h); };
    const u = fx - ix, v = fy - iy, sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) bits[x + y * n] = lump(x, y, 8, 3.1) * 0.7 + lump(x, y, 20, 8.3) * 0.3 > CLOUD_FILL ? 1 : 0;
  return bits;
}
let flatQuads = 0;
function cloudGeometry(bits) {
  const n = CLOUD_CELLS, pos = [], shade = [], index = [], filled = (x, y) => bits[((x + n) % n) + ((y + n) % n) * n];
  const quad = (a, b, c, d, s) => { const v = pos.length / 3; pos.push(...a, ...b, ...c, ...d); shade.push(s, s, s, s); index.push(v, v + 1, v + 2, v, v + 2, v + 3); };
  const C = CLOUD_CELL, D = CLOUD_DEEP;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!filled(x, y)) continue;
    const x0 = x * C, x1 = x0 + C, z0 = y * C, z1 = z0 + C;
    quad([x0, D, z1], [x1, D, z1], [x1, D, z0], [x0, D, z0], 1);
    quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], 0.72);
    flatQuads += 2;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!filled(x, y)) continue;
    const x0 = x * C, x1 = x0 + C, z0 = y * C, z1 = z0 + C;
    if (!filled(x + 1, y)) quad([x1, 0, z1], [x1, 0, z0], [x1, D, z0], [x1, D, z1], 0.82);
    if (!filled(x - 1, y)) quad([x0, 0, z0], [x0, 0, z1], [x0, D, z1], [x0, D, z0], 0.82);
    if (!filled(x, y + 1)) quad([x0, 0, z1], [x1, 0, z1], [x1, D, z1], [x0, D, z1], 0.9);
    if (!filled(x, y - 1)) quad([x1, 0, z0], [x0, 0, z0], [x0, D, z0], [x1, D, z0], 0.9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
const bits = cloudBits(), cloudShape = cloudGeometry(bits);
shared.uCloudMap.value = cloudMap(bits);
const banks = Array.from({ length: 9 }, (_, i) => {
  const m = new THREE.Mesh(cloudShape, cloudMat);
  m.userData.at = [i % 3 - 1, Math.floor(i / 3) - 1];
  m.frustumCulled = false;
  scene.add(m);
  return m;
});
function driftClouds(at, dt) {
  wind += dt;
  for (const m of banks) m.visible = settings.clouds > 0;
  cloudShape.setDrawRange(0, settings.clouds > 1 ? Infinity : flatQuads * 6); // the fast ones are only the top and the bottom
  const ox = wind * WIND[0], oz = wind * WIND[1], baseX = Math.floor((at.x - ox) / CLOUD_SPAN) * CLOUD_SPAN + ox, baseZ = Math.floor((at.z - oz) / CLOUD_SPAN) * CLOUD_SPAN + oz;
  for (const m of banks) m.position.set(baseX + m.userData.at[0] * CLOUD_SPAN, CLOUD_Y, baseZ + m.userData.at[1] * CLOUD_SPAN);
  shared.uCloudWind.value.set(ox, oz);
}

// ---------- the time of day ----------
export const sunHeight = () => Math.sin(G.dayTime * Math.PI * 2);
const set = (colour, [r, g, b]) => colour.setRGB(r, g, b);
// With shaders the same colours go in as light, not as paint.
const glowing = (colour, c, lift = 1) => colour.setRGB(c[0] ** 2.2 * lift, c[1] ** 2.2 * lift, c[2] ** 2.2 * lift);
const nightLightColor = new THREE.Color(0xa9bfd6), dayLightColor = new THREE.Color(0xffefd8);

// What the realm underfoot asks of the sky, eased so that crossing a border takes a while to show.
function feelRealm(p, dt) {
  const mix = climateAt(p.x, p.z), goal = { zenith: DAY.zenith, horizon: DAY.horizon, light: DAY.light, cloud: [1, 1, 1], haze: 1 };
  for (const [b, m] of Object.entries(MOODS)) {
    const w = mix[b] * m.pull;
    if (w <= 0) continue;
    goal.zenith = blend(goal.zenith, m.zenith, w); goal.horizon = blend(goal.horizon, m.horizon, w); goal.light = blend(goal.light, m.light, w); goal.cloud = blend(goal.cloud, m.cloud, w);
    goal.haze += (m.haze - goal.haze) * w;
  }
  const ease = moodReady ? 1 - Math.exp(-MOOD_EASE * dt) : 1;
  moodReady = true;
  for (const key of ['zenith', 'horizon', 'light', 'cloud']) mood[key] = blend(mood[key], goal[key], ease);
  mood.haze += (goal.haze - mood.haze) * ease;
}
// The sun by day and the moon by night, whichever is up: both fade out at the horizon, so that the swap is never seen.
function lightWithShaders(sun, zenith, horizon) {
  const up = ss(0, 0.09, Math.abs(sun)), warm = ss(0.02, 0.5, sun), power = up * settings.sunPower / 100, c = shared.uSunColour.value;
  if (sun >= 0) {
    const low = [3.1, 1.55, 0.66], high = [2.7, 2.5, 2.15], tint = mood.light;
    c.setRGB((low[0] + (high[0] - low[0]) * warm) * tint[0] * power, (low[1] + (high[1] - low[1]) * warm) * tint[1] * power, (low[2] + (high[2] - low[2]) * warm) * tint[2] * power);
    shared.uLightDir.value.copy(shared.uSunDir.value);
  } else {
    c.setRGB(MOONLIGHT[0] * power, MOONLIGHT[1] * power, MOONLIGHT[2] * power);
    shared.uLightDir.value.copy(shared.uSunDir.value).negate();
  }
  const fill = settings.shade / 100, day = ss(-0.08, 0.28, sun), wide = blend(horizon, zenith, 0.6).map(v => v ** 2.2);
  shared.uAmbient.value.setRGB((wide[0] * 1.5 * day + NIGHT_FILL[0]) * fill, (wide[1] * 1.5 * day + NIGHT_FILL[1]) * fill, (wide[2] * 1.5 * day + NIGHT_FILL[2]) * fill);
}
export function updateSky(at, dt, underwater) {
  clock += dt;
  feelRealm(player.pos, dt);
  driftClouds(at, dt);
  const turn = G.dayTime * Math.PI * 2, sun = Math.sin(turn), day = ss(-0.08, 0.28, sun), dusk = Math.exp(-((sun / 0.2) ** 2)), night = 1 - ss(-0.22, 0.08, sun);

  shared.uTime.value = clock;
  shared.uTurn.value = turn;
  shared.uSunDir.value.set(Math.cos(turn), sun, SUN_TILT).normalize();
  const shaders = shadersActive(), paint = shaders ? glowing : set;
  const zenith = blend(NIGHT.zenith, mood.zenith, day), horizon = blend(blend(NIGHT.horizon, mood.horizon, day), DUSK.horizon, dusk * 0.85);
  paint(shared.uZenith.value, zenith, SKY_LIFT);
  paint(shared.uHorizon.value, horizon, SKY_LIFT);
  paint(shared.uGlow.value, DUSK.glow.map(v => v * dusk * ss(-0.3, 0.05, sun) + 0.28 * day * (v * 0.3 + 0.7)), SKY_LIFT);
  if (shaders) lightWithShaders(sun, zenith, horizon);
  set(shared.uDaylight.value, blend(blend(NIGHT.light, mood.light, day), DUSK.light, dusk * 0.6 * ss(-0.3, 0, sun)));
  paint(shared.uCloudColour.value, blend(blend(blend([0.09, 0.11, 0.17], [1, 1, 1], day), DUSK.cloud, dusk * 0.8), mood.cloud, 0.6 * day), CLOUD_LIFT);
  shared.uCloudShade.value = 0.2 * day;
  shared.uSunlit.value = 0.12 + 0.88 * day;
  shared.uNight.value = night;
  under += ((underwater ? 1 : 0) - under) * (1 - Math.exp(-UNDER_EASE * dt));
  shared.uUnder.value = under > 0.97 ? 1 : under < 0.03 ? 0 : under;
  paint(shared.uUnderColour.value, blend([0.015, 0.05, 0.09], [0.07, 0.3, 0.42], 0.15 + 0.85 * day), 1);
  const far = (RD * 16 - 8) * mood.haze * settings.fogFade / 100;
  shared.uSwayOn.value = settings.sway;
  sunOrb.material.color.setScalar(shaders ? SUN_ORB : 1);
  shared.uFogFar.value = far; shared.uFogNear.value = far * 0.5;

  heavens.position.copy(at);
  heavens.rotation.z = turn;
  for (const m of moons) { m.material.opacity = 0.25 + 0.75 * night; m.material.color.setScalar(shaders ? MOON_ORB : 1); }

  // Bodies are lit the ordinary way, so their lights follow the same day.
  const light = 0.25 + 0.75 * ss(-0.25, 0.25, sun);
  sunLight.position.set(Math.cos(turn) * 0.7, Math.max(0.12, sun), Math.sin(turn) * 0.7);
  sunLight.color.copy(nightLightColor).lerp(dayLightColor, light);
  sunLight.intensity = (0.08 + 1.25 * light) * (shaders ? BODY_SUN : 1);
  ambientLight.intensity = (0.28 + 0.58 * light) * (shaders ? BODY_FILL : 1);
  const c = under > 0.5 ? shared.uUnderColour.value : shared.uHorizon.value;
  scene.fog.color.setRGB(c.r, c.g, c.b, shaders ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace);
  scene.fog.near = under > 0.5 ? 2 : far * 0.5; scene.fog.far = under > 0.5 ? 34 : far;
}

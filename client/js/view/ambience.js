// The air of each realm: fireflies in the elven dusk, embers and ash over the Wastes, snow on the Peaks, dust on the savanna, bubbles
// underwater. One draw call of at most 72 points, which is few on purpose: the player sees this all the time. Indoors it fades away.
import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { solid } from '../sim/blocks.js';
import { getBlock } from '../sim/chunks.js';
import { player } from '../sim/player.js';
import { B, climateAt } from '../sim/terrain.js';
import { camera, late, scene, stillCamera } from './scene.js';
import { sunHeight } from './sky.js';

const COUNT = 72, BOX = 15, ROOF_CHECK = 8, ROOF_EVERY = 0.4, FADE = 2.5;
const STYLES = {
  fireflies: { colours: [0xd9ff7a, 0xa8ffb4, 0xfff28a], size: 0.13, fall: 0, wander: 0.7, blink: 2.4, share: 0.5 },
  petals: { colours: [0xffc0ec, 0xffd8f4, 0xa8ffe0], size: 0.09, fall: 0.35, wander: 0.5, blink: 0, share: 0.3 },
  pollen: { colours: [0xfff4c8, 0xfff8e0], size: 0.06, fall: 0.04, wander: 0.3, blink: 0, share: 0.3 },
  dust: { colours: [0xd8bc84, 0xc8a870], size: 0.07, fall: 0.02, wander: 0.9, blink: 0, share: 0.45 },
  snow: { colours: [0xffffff, 0xeef6ff], size: 0.09, fall: 1.7, wander: 0.5, blink: 0, share: 1 },
  embers: { colours: [0xff8a30, 0xffc050, 0xff5a20, 0x5a5058, 0x7a7078], size: 0.1, fall: -1.1, wander: 0.6, blink: 3.5, share: 0.7 },
  bubbles: { colours: [0xcff4ff, 0xa8e4f4], size: 0.09, fall: -1.4, wander: 0.25, blink: 0, share: 0.45 },
};
function styleHere(p, under) {
  if (under) return STYLES.bubbles;
  const mix = climateAt(p.x, p.z), night = sunHeight() < 0.05;
  let best = 0;
  for (let b = 1; b < mix.length; b++) if (mix[b] > mix[best]) best = b;
  if (best === B.DEMON) return STYLES.embers;
  if (best === B.PEAKS) return p.y > 80 ? STYLES.snow : STYLES.pollen;
  if (best === B.ELF) return night ? STYLES.fireflies : STYLES.petals;
  if (best === B.BEAST) return night ? STYLES.fireflies : STYLES.dust;
  if (best === B.KINGDOM || best === B.MIRE) return night ? STYLES.fireflies : STYLES.pollen;
  return null;
}

const position = new Float32Array(COUNT * 3), colour = new Float32Array(COUNT * 4), motes = [];
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
geometry.setAttribute('color', new THREE.BufferAttribute(colour, 4).setUsage(THREE.DynamicDrawUsage));
const points = late(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false })));
points.frustumCulled = false;
scene.add(points);
const tint = new THREE.Color();
for (let i = 0; i < COUNT; i++) motes.push({ x: 0, y: 0, z: 0, seed: Math.random() * 100, style: null, on: false });

function settle(m, at, style, anywhere) { // a mote joins at the edge of the box it left, or anywhere when the air changes
  m.style = style;
  m.on = !!style && Math.random() < style.share * (settings.particles > 1 ? 1 : 0.4);
  m.x = at.x + (Math.random() - 0.5) * 2 * BOX; m.z = at.z + (Math.random() - 0.5) * 2 * BOX;
  m.y = at.y + (anywhere || !style?.fall ? (Math.random() - 0.5) * 2 * BOX : style.fall > 0 ? BOX : -BOX);
  if (m.on) tint.set(style.colours[Math.floor(Math.random() * style.colours.length)]);
  m.r = tint.r; m.g = tint.g; m.b = tint.b;
}
let clock = 0, roofT = 0, open = 1, sheltered = false, last = null, restyle = 0;
function underRoof(at) {
  for (let y = 1; y <= ROOF_CHECK; y++) if (solid(getBlock(Math.floor(at.x), Math.floor(at.y) + y, Math.floor(at.z)))) return true;
  return false;
}
export function updateAmbience(dt, under) {
  points.visible = !stillCamera.matches && settings.particles > 0;
  if (!points.visible) return;
  const at = camera.position;
  clock += dt;
  roofT -= dt; restyle -= dt;
  if (roofT <= 0) { roofT = ROOF_EVERY; sheltered = !under && underRoof(at); }
  open += ((sheltered ? 0 : 1) - open) * (1 - Math.exp(-FADE * dt));
  if (restyle <= 0) {
    restyle = 1;
    const style = styleHere(player.pos, under);
    if (style !== last) { last = style; for (const m of motes) if (Math.random() < 0.5) settle(m, at, style, true); }
  }
  points.material.size = last?.size ?? 0.1;
  motes.forEach((m, i) => {
    const s = m.style;
    if (!s) { colour[i * 4 + 3] = 0; if (Math.random() < dt) settle(m, at, last, true); return; }
    const phase = clock * 0.7 + m.seed;
    m.x += Math.sin(phase) * s.wander * dt; m.z += Math.cos(phase * 0.8) * s.wander * dt; m.y += (Math.sin(phase * 1.3) * s.wander * 0.4 - s.fall) * dt;
    if (Math.abs(m.x - at.x) > BOX || Math.abs(m.z - at.z) > BOX || Math.abs(m.y - at.y) > BOX) settle(m, at, last, false);
    position[i * 3] = m.x; position[i * 3 + 1] = m.y; position[i * 3 + 2] = m.z;
    colour[i * 4] = m.r; colour[i * 4 + 1] = m.g; colour[i * 4 + 2] = m.b;
    const edge = 1 - Math.max(Math.abs(m.x - at.x), Math.abs(m.z - at.z), Math.abs(m.y - at.y)) / BOX;
    colour[i * 4 + 3] = (m.on ? 1 : 0) * Math.min(1, edge * 4) * open * (s.blink ? 0.3 + 0.7 * Math.max(0, Math.sin(clock * s.blink + m.seed)) : 0.8);
  });
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

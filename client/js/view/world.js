// Drawing the world: the camera follows the player, the sky follows the time of day.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { G } from '../core/state.js';
import { WATER } from '../sim/blocks.js';
import { RD, getBlock } from '../sim/chunks.js';
import { aim } from '../sim/mining.js';
import { ss } from '../sim/noise.js';
import { eye, player } from '../sim/player.js';
import { B, landOf } from '../sim/terrain.js';
import { syncBodies } from './bodies.js';
import { syncFireballs } from './fireball.js';
import { drawHand, syncHand } from './hand.js';
import { DEMON_SKY, NIGHT_SKY, SKY, UNDER, ambientLight, camera, highlight, renderer, scene, sky, skyNow, stillCamera, sunLight } from './scene.js';
import './spells.js';

const dayLightColor = new THREE.Color(0xffefd8), nightLightColor = new THREE.Color(0xa9bfd6);
export const sunHeight = () => Math.sin(G.dayTime * Math.PI * 2);

const TELEPORT = 4; // further than a step can carry the eye
const BOB = 0.032, SWAY = 0.018, STRIDES_PER_BLOCK = 1.45, GAIT_EASE = 10, FULL_GAIT = 6.5, DIP_SPRING = 18, DIP_KICK = 0.14, MAX_IMPACT = 22;
let stride = 0, gait = 0, dip = 0, dipRate = 0;
on('player:landed', speed => { dipRate -= Math.min(speed, MAX_IMPACT) * DIP_KICK; });

// Drawn between the last two steps of the simulation, which is what keeps the view gliding at any refresh rate.
function placeCamera(blend) {
  const e = eye(), was = player.lastEye, t = e.distanceTo(was) > TELEPORT ? 1 : blend;
  camera.position.set(was.x + (e.x - was.x) * t, was.y + (e.y - was.y) * t, was.z + (e.z - was.z) * t);
  camera.rotation.set(player.pitch, player.yaw, 0);
  sky.position.copy(camera.position);
}
// A walk the head can feel: a light bob with each footfall, and a dip when the knees take a landing.
function walkCamera(dt) {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  stride += speed * STRIDES_PER_BLOCK * dt;
  gait += ((player.onGround && !player.fly ? Math.min(1, speed / FULL_GAIT) : 0) - gait) * (1 - Math.exp(-GAIT_EASE * dt));
  dipRate -= (DIP_SPRING * DIP_SPRING * dip + 2 * DIP_SPRING * dipRate) * dt;
  dip += dipRate * dt;
  if (stillCamera.matches) return;
  const across = Math.sin(stride) * SWAY * gait;
  camera.position.x += Math.cos(player.yaw) * across;
  camera.position.z -= Math.sin(player.yaw) * across;
  camera.position.y += Math.cos(stride * 2) * BOB * gait + dip;
}
export function isUnderwater() {
  return getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === WATER;
}
function updateSky() {
  const p = player.pos, sunH = sunHeight();
  sky.rotation.z = G.dayTime * Math.PI * 2 - 0.5;
  const light = 0.25 + 0.75 * ss(-0.25, 0.25, sunH);
  skyNow.copy(SKY).lerp(NIGHT_SKY, 1 - (light - 0.25) / 0.75);
  if (landOf(p.x, p.z).b === B.DEMON) skyNow.lerp(DEMON_SKY, 0.6);
  // Warm sunlight and a cooler, softer night fill make the world respond to
  // its time of day instead of baking the same brightness into every face.
  sunLight.position.set(Math.cos(G.dayTime * Math.PI * 2) * 0.7, Math.max(0.12, sunH), Math.sin(G.dayTime * Math.PI * 2) * 0.7);
  sunLight.color.copy(nightLightColor).lerp(dayLightColor, light);
  sunLight.intensity = 0.08 + 1.25 * light;
  ambientLight.intensity = 0.28 + 0.58 * light;
  const under = isUnderwater();
  scene.background.copy(under ? UNDER : skyNow); scene.fog.color.copy(under ? UNDER : skyNow);
  scene.fog.near = under ? 2 : 40; scene.fog.far = under ? 28 : RD * 16 - 8;
}
export function renderWorld(dt, blend) {
  placeCamera(blend);
  walkCamera(dt);
  updateSky();
  syncBodies(dt, blend);
  syncFireballs(dt);
  syncHand(dt, stride, gait);
  const t = aim.block;
  highlight.visible = !!t;
  if (t) highlight.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  renderer.render(scene, camera);
  drawHand();
}
// The last frame before this may still be heaven's scene on the canvas.
export function paintFirstFrame() {
  placeCamera(1);
  scene.background.copy(SKY);
  scene.fog.color.copy(SKY);
  renderer.render(scene, camera);
}

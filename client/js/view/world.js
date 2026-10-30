// Drawing the world: the camera follows the player, the sky follows the time of day.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { WATER } from '../sim/blocks.js';
import { RD, getBlock } from '../sim/chunks.js';
import { aim } from '../sim/mining.js';
import { ss } from '../sim/noise.js';
import { eye, player } from '../sim/player.js';
import { B, landOf } from '../sim/terrain.js';
import { syncBodies } from './bodies.js';
import { DEMON_SKY, NIGHT_SKY, SKY, UNDER, ambientLight, camera, highlight, renderer, scene, sky, skyNow, sunLight } from './scene.js';

const dayLightColor = new THREE.Color(0xffefd8), nightLightColor = new THREE.Color(0xa9bfd6);
export const sunHeight = () => Math.sin(G.dayTime * Math.PI * 2);

function placeCamera() {
  const e = eye();
  camera.position.set(e.x, e.y, e.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  sky.position.copy(camera.position);
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
export function renderWorld(dt) {
  placeCamera();
  updateSky();
  syncBodies(dt);
  const t = aim.block;
  highlight.visible = !!t;
  if (t) highlight.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  renderer.render(scene, camera);
}
// The last frame before this may still be heaven's scene on the canvas.
export function paintFirstFrame() {
  placeCamera();
  scene.background.copy(SKY);
  scene.fog.color.copy(SKY);
  renderer.render(scene, camera);
}

// Drawing the world: the camera follows the player, and everything else is drawn around it.
import { on } from '../core/events.js';
import { settings } from '../core/settings.js';
import { wet } from '../sim/blocks.js';
import { getBlock } from '../sim/chunks.js';
import { aim } from '../sim/mining.js';
import { eye, player } from '../sim/player.js';
import { updateAmbience } from './ambience.js';
import { updateCaveAir } from './caveair.js';
import { syncArrows } from './arrows.js';
import { syncBodies } from './bodies.js';
import { cullChunks } from './chunkmesh.js';
import { syncFireballs } from './fireball.js';
import { updateFish } from './fish.js';
import { syncCracks } from './fx.js';
import { drawHand, syncHand } from './hand.js';
import { shared } from './materials.js';
import { drawScene } from './pipeline.js';
import { camera, highlight, stillCamera } from './scene.js';
import { updateSky } from './sky.js';
import './spells.js';

export { sunHeight } from './sky.js';

const TELEPORT = 4; // further than a step can carry the eye
const BOB = 0.032, SWAY = 0.018, STRIDES_PER_BLOCK = 1.45, GAIT_EASE = 10, FULL_GAIT = 6.5, DIP_SPRING = 18, DIP_KICK = 0.14, MAX_IMPACT = 22;
const SPRINT_FOV = 7, FLIGHT_FOV = 12, SWIM_FOV = -5, FOV_EASE = 7, LEAN = 0.0035, LEAN_EASE = 8, HURT_ROLL = 0.07, HURT_FADE = 9, SWIM_ROLL = 0.018, WATERLINE = 0.875;
let stride = 0, gait = 0, dip = 0, dipRate = 0, fov = settings.fov, lean = 0, flinch = 0, clock = 0;
on('player:landed', speed => { dipRate -= Math.min(speed, MAX_IMPACT) * DIP_KICK; });
on('camera:kick', k => { dipRate -= k; });
on('player:hurt', () => { flinch = Math.random() < 0.5 ? HURT_ROLL : -HURT_ROLL; });
on('settings:changed', moved => { if (moved.includes('fov')) { fov = camera.fov = settings.fov; camera.updateProjectionMatrix(); } });

// Drawn between the last two steps of the simulation, which is what keeps the view gliding at any refresh rate.
function placeCamera(blend) {
  const e = eye(), was = player.lastEye, t = e.distanceTo(was) > TELEPORT ? 1 : blend;
  camera.position.set(was.x + (e.x - was.x) * t, was.y + (e.y - was.y) * t, was.z + (e.z - was.z) * t);
  camera.rotation.set(player.pitch, player.yaw, 0);
}
// A walk the head can feel: a light bob with each footfall, and a dip when the knees take a landing.
function walkCamera(dt, under) {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  clock += dt;
  stride += speed * STRIDES_PER_BLOCK * dt;
  gait += ((player.onGround && !player.fly ? Math.min(1, speed / FULL_GAIT) : 0) - gait) * (1 - Math.exp(-GAIT_EASE * dt));
  dipRate -= (DIP_SPRING * DIP_SPRING * dip + 2 * DIP_SPRING * dipRate) * dt;
  dip += dipRate * dt;
  if (stillCamera.matches) return;
  if (settings.bobbing) {
    const across = Math.sin(stride) * SWAY * gait;
    camera.position.x += Math.cos(player.yaw) * across;
    camera.position.z -= Math.sin(player.yaw) * across;
    camera.position.y += Math.cos(stride * 2) * BOB * gait + dip;
  }
  // The view opens up with speed, narrows underwater, leans into a sidestep and rolls with a blow.
  const goal = settings.fov + (player.sprinting ? SPRINT_FOV : 0) + (player.fly && speed > 16 ? FLIGHT_FOV : 0) + (under ? SWIM_FOV : 0);
  fov += (goal - fov) * (1 - Math.exp(-FOV_EASE * dt));
  if (Math.abs(fov - camera.fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const sideways = player.vel.x * Math.cos(player.yaw) - player.vel.z * Math.sin(player.yaw);
  lean += (-sideways * LEAN - lean) * (1 - Math.exp(-LEAN_EASE * dt));
  flinch *= Math.exp(-HURT_FADE * dt);
  camera.rotation.z = lean + flinch + (under ? Math.sin(clock * 1.1) * SWIM_ROLL : 0);
}
// The eye is under once it is below the surface, which stands a little under the top of the block.
export function isUnderwater() {
  const { x, y, z } = camera.position, bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  return wet(getBlock(bx, by, bz)) && (y - by < WATERLINE || wet(getBlock(bx, by + 1, bz)));
}
// Chunks are chosen last, once the camera has done everything it is going to do this frame.
function placeChunks() {
  camera.updateMatrixWorld();
  cullChunks(camera, shared.uFogFar.value);
}
export function renderWorld(dt, blend) {
  placeCamera(blend);
  updateCaveAir(dt, camera.position);
  const under = isUnderwater();
  walkCamera(dt, under);
  updateSky(camera.position, dt, under);
  updateAmbience(dt, under);
  updateFish(dt);
  syncBodies(dt, blend);
  syncFireballs(dt);
  syncArrows();
  syncHand(dt, stride, gait);
  syncCracks();
  const t = aim.block;
  highlight.visible = !!t;
  if (t) highlight.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  placeChunks();
  drawScene();
  drawHand();
}
// The last frame before this may still be heaven's scene on the canvas.
export function paintFirstFrame() {
  placeCamera(1);
  updateSky(camera.position, 0, false);
  placeChunks();
  drawScene();
}

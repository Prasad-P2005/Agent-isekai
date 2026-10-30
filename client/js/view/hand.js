// The hero's own right hand, in the corner of the view. It breathes, sways with the walk, lags behind a turn of the head,
// and does the work: mining, punching, placing and throwing fire. All of it is decoration on what the simulation announces.
// It lives in its own scene, drawn over a cleared depth buffer, so that it can never poke into a wall the player stands against.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { G } from '../core/state.js';
import { miningBar } from '../sim/mining.js';
import { ss } from '../sim/noise.js';
import { player } from '../sim/player.js';
import { heroLook } from './avatar.js';
import { GOLD } from './outfits.js';
import { cloth, flesh, leather, plain } from './paint.js';
import { ambientLight, camera, renderer } from './scene.js';
import { Atlas, INK, mixHex, solid } from './voxel.js';

const PX = 0.02; // one art pixel of the hand, in view units
// It comes in from the corner of the view at an angle, thumb side up, so that it is the hand you see and not the length of the arm.
const REST_AT = new THREE.Vector3(0.82, -0.62, -0.05), REST_TURN = new THREE.Euler(0.38, 0.45, -0.35);
const THRUST_AT = new THREE.Vector3(0.48, -0.56, -0.42), THRUST_TURN = new THREE.Euler(0.3, 0.29, 0);
// The middle of the palm at full reach, where a spell is drawn leaving the hand.
export const PALM = new THREE.Vector3(0, 0, -0.84).applyEuler(THRUST_TURN).add(THRUST_AT);
const CAST_TIME = 0.42, SWING_TIME = 0.3, PLACE_TIME = 0.2;
const RELAXED = 0.5, EASE = 14, LAG_FADE = 11, LAG_TURN = 0.3, MAX_LAG = 0.12, FIRE_GLOW = 0xffa24a;

const scene = new THREE.Scene(), rig = new THREE.Group(), arm = new THREE.Group(), wrist = new THREE.Group();
const skyLight = new THREE.HemisphereLight(0xf4f3ec, 0x62645b, 0.8), palmFire = new THREE.PointLight(FIRE_GLOW, 0, 3, 2);
palmFire.position.copy(PALM).multiplyScalar(0.9);
scene.add(skyLight, rig);
rig.add(arm, palmFire);
arm.scale.setScalar(PX);

// ---------------- the hand itself ----------------
const look = heroLook(), sheet = new Atlas(128), material = new THREE.MeshLambertMaterial();
const skin = flesh(look.skin), knuckle = plain(mixHex(look.skin, INK, 0.16)), sleeve = cloth(look.top), bracer = leather(look.armor ?? mixHex(look.top, INK, 0.3)), strap = plain(look.belt ?? mixHex(look.top, INK, 0.5));
const WRIST_AT = -34, FINGERS_AT = -13, FINGER_LEN = 4.5;

arm.add(solid([[11, 11, 30, 0, 0, -11, sleeve], [13, 13, 9, 0, 0, -29, bracer], [13.4, 13.4, 1.6, 0, 0, -26, strap], [13.4, 13.4, 1.6, 0, 0, -32, strap], [3, 1, 3, 0, 6.8, -29, plain(GOLD)]], sheet, material));
wrist.position.z = WRIST_AT;
arm.add(wrist);
wrist.add(solid([[11, 10, 3, 0, 0, -1, skin], [15, 7, 13, 0, 0, -6.5, skin], [15.4, 1, 3, 0, 3.8, -11, knuckle]], sheet, material));
// Four fingers of two joints each, and a thumb, so that the hand can close into a fist and open flat.
const fingers = [-5.4, -1.8, 1.8, 5.4].map((x, i) => {
  const base = new THREE.Group(), tip = new THREE.Group(), length = FINGER_LEN - Math.abs(i - 1.5) * 0.5;
  base.position.set(x, 0.5, FINGERS_AT);
  tip.position.z = -length;
  base.add(solid([[3.2, 4.4, length + 0.4, 0, 0, -length / 2, skin]], sheet, material), tip);
  tip.add(solid([[3.2, 4, length, 0, 0, -length / 2, skin], [3.4, 0.6, 1.4, 0, 2.1, -length + 0.8, knuckle]], sheet, material));
  wrist.add(base);
  return { base, tip };
});
const thumb = new THREE.Group();
thumb.position.set(-7.5, -1.5, -4);
thumb.add(solid([[4, 4, 8, 0, 0, -4, skin]], sheet, material));
wrist.add(thumb);
material.map = sheet.texture(); // only now that every part has been painted onto it

function closeHand(curl) {
  for (const { base, tip } of fingers) { base.rotation.x = -curl * 1.25; tip.rotation.x = -curl * 1.45; }
  thumb.rotation.set(-curl * 0.5, 0.7 - curl * 1.3, 0);
}

// ---------------- what it is doing ----------------
let castAge = CAST_TIME, swingAge = SWING_TIME, swingTime = SWING_TIME, swingSize = 1, clock = 0, curl = RELAXED, lift = 0, turnLag = 0, tiltLag = 0, lastYaw = 0, lastPitch = 0;
function swing(time, size) { swingAge = 0; swingTime = time; swingSize = size; }
on('player:struck', () => swing(SWING_TIME, 1.2));
on('player:placed', () => swing(PLACE_TIME, 0.6));
export function throwFire(glow = FIRE_GLOW) { castAge = 0; palmFire.color.setHex(glow); }

const at = new THREE.Vector3();
export function syncHand(dt, stride, gait) {
  clock += dt;
  const working = G.mouseDown && !G.uiOpen;
  if (working && swingAge >= swingTime) swing(SWING_TIME, miningBar.shown ? 1 : 0.8); // held down, it keeps going
  castAge = Math.min(CAST_TIME, castAge + dt);
  swingAge = Math.min(swingTime, swingAge + dt);

  // Out fast, a moment held at full reach, then lowered away.
  const reach = ss(0, 0.07, castAge) * (1 - ss(0.17, CAST_TIME, castAge));
  const p = swingAge / swingTime, punch = Math.sin(Math.PI * p) * swingSize, arc = Math.sin(Math.PI * Math.sqrt(p)) * swingSize;

  const ease = 1 - Math.exp(-EASE * dt), fade = Math.exp(-LAG_FADE * dt);
  curl += ((punch > 0.02 || working ? 1 : RELAXED) * (1 - reach) - curl) * ease;
  closeHand(curl);
  lift += (Math.max(-0.06, Math.min(0.1, -player.vel.y * 0.006)) - lift) * ease;
  turnLag = Math.max(-MAX_LAG, Math.min(MAX_LAG, turnLag * fade + (player.yaw - lastYaw) * LAG_TURN));
  tiltLag = Math.max(-MAX_LAG, Math.min(MAX_LAG, tiltLag * fade + (player.pitch - lastPitch) * LAG_TURN));
  lastYaw = player.yaw; lastPitch = player.pitch;

  at.lerpVectors(REST_AT, THRUST_AT, reach);
  at.x += Math.sin(stride) * 0.02 * gait + turnLag - 0.24 * arc;
  at.y += Math.cos(stride * 2) * 0.016 * gait + Math.sin(clock * 1.6) * 0.004 + lift - tiltLag + 0.2 * arc;
  at.z -= 0.34 * punch;
  arm.position.copy(at);
  arm.rotation.set(REST_TURN.x + (THRUST_TURN.x - REST_TURN.x) * reach - 0.3 * punch, REST_TURN.y + (THRUST_TURN.y - REST_TURN.y) * reach - 0.1 * arc, REST_TURN.z * (1 - reach) * (1 - 0.7 * arc));
  wrist.rotation.x = 0.95 * reach; // the palm turns to face what it throws at

  palmFire.intensity = 0.5 * (1 - ss(0, 0.26, castAge));
  skyLight.intensity = ambientLight.intensity * 2.4; // this light stands in for the sun as well
  rig.position.copy(camera.position); rig.quaternion.copy(camera.quaternion);
}
export function drawHand() {
  renderer.autoClear = false; renderer.clearDepth();
  renderer.render(scene, camera);
  renderer.autoClear = true;
}

// Built now rather than on the first frame.
closeHand(RELAXED);
renderer.compile(scene, camera);

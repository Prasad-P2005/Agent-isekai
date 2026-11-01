// The hero's own right arm, in the corner of the view, as Minecraft draws it: one blocky arm when the hand is empty, and only the thing itself when it is not.
// It sways with the walk, lags behind a turn of the head, and does the work: mining, punching, placing and throwing fire. All of it is decoration on what the
// simulation announces. It has its own scene and camera, drawn over a cleared depth buffer, so that it can never poke into a wall and does not stretch with the field of view.
// Where things sit and how they swing is view/held.js. Colours go through untouched by the tone mapping, so a block in the hand matches the same block in the world.
import * as THREE from 'three';
import { emit, on } from '../core/events.js';
import { G } from '../core/state.js';
import { ITEMS } from '../core/content.js';
import { rule } from '../core/rules.js';
import { heldStack, worn } from '../sim/inventory.js';
import { lampLight, skyLight } from '../sim/light.js';
import { digging } from '../sim/mining.js';
import { ss } from '../sim/noise.js';
import { player } from '../sim/player.js';
import { heroLook } from './avatar.js';
import { ARM_END, CUTS, CUT_TIMES, Pose, TRAIL_CELLS, TRAIL_DEPTH, TRAIL_INDEX, armModel, armPose, cutMotion, guardModel, heroArm, holdBlock, holdThing, holdTool, itemPose, spriteModel, trailInk, writeTrail } from './held.js';
import { PALETTES } from './itemart.js';
import { geometryOf, inDisplay, itemModel, textureOf } from './itemmesh.js';
import { metal } from './paint.js';
import { camera, renderer } from './scene.js';
import { sunHeight } from './sky.js';

const VIEW = 70; // the arm's own field of view, whatever the player has set for the world
const CAST_TIME = 0.42, SWING_TIME = 0.3, PLACE_TIME = 0.2, CAST_REACH = 0.25; // a spell leaves from the far end of a punch
const EASE = 14, LAG_FADE = 11, LAG_TURN = 0.3, MAX_LAG = 0.12, FIRE_GLOW = 0xffa24a;
const SEE_EVERY = 0.2, LIGHT_EASE = 5, DARKEST = 0.26, NIGHT_SKY = 0.3, FLASH = 0.6, GLEAM = 0.06;
const CHAIN = 0.7, COME_BACK = 0.7, TRAIL_DIM = 0.5; // a pause this long after a blow starts a run of cuts again; how far below the view a blade cut short returns from; the mark never falls below this light
const SHIELD_DOWN = [-1.3, -1.25, -0.8], SHIELD_UP = [-0.32, -0.42, -0.75], SHIELD_SIZE = 0.74;
const TOOL_GROUPS = new Set(['tools', 'weapons']);
// The end of the hand at full reach, where a spell is drawn leaving it.
export const PALM = new THREE.Vector3(...armPose(CAST_REACH, 0).apply(...ARM_END));

const scene = new THREE.Scene(), view = new THREE.PerspectiveCamera(VIEW, innerWidth / innerHeight, 0.05, 40);
on('canvas:resized', () => { view.aspect = camera.aspect; view.updateProjectionMatrix(); });

// ---------------- turning models into meshes ----------------
const OWN_COLOURS = { vertexColors: true, toneMapped: false };
const paintedWith = m => new THREE.MeshBasicMaterial({ ...OWN_COLOURS, map: textureOf(m), alphaTest: m.cutout ? 0.5 : 0, transparent: !!m.glass, side: m.cutout ? THREE.DoubleSide : THREE.FrontSide });
const flatMat = new THREE.MeshBasicMaterial({ ...OWN_COLOURS, side: THREE.DoubleSide }), shieldMat = flatMat.clone();
function meshOf(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
function place(mesh, pose) { mesh.matrix.fromArray(pose.m); mesh.matrixWorldNeedsUpdate = true; }

// ---------------- what there is to see ----------------
const look = armModel(heroArm(heroLook())), armMat = paintedWith(look), arm = meshOf(geometryOf(look), armMat);
// Armour on the arm: a plate over the sleeve, in the colours of what is worn.
const plate = guardModel(metal(0xffffff)), guardMat = paintedWith(plate), guard = meshOf(geometryOf(plate), guardMat);
const item = meshOf(new THREE.BufferGeometry(), flatMat), shield = meshOf(new THREE.BufferGeometry(), shieldMat);

const models = new Map();
function modelOf(it) {
  const { key, model: m } = itemModel(it);
  if (!models.has(key)) {
    models.set(key, { geometry: geometryOf(m), material: m.pixels ? paintedWith(m) : flatMat, glow: !!m.glow, hold: m.pixels ? holdBlock : TOOL_GROUPS.has(it.group) ? holdTool : holdThing });
  }
  return models.get(key);
}
let heldId = null, heldIt = null, heldModel = null, shieldId = null, guardId = null, swapT = 0;
function syncHeld() {
  const id = heldStack()?.id ?? null;
  if (id !== heldId) {
    heldId = id; heldIt = id ? ITEMS[id] : null; swapT = 1;
    heldModel = heldIt ? modelOf(heldIt) : null;
    if (heldModel) { item.geometry = heldModel.geometry; item.material = heldModel.material; }
  }
  const off = worn().off?.id ?? null;
  if (off !== shieldId) { shieldId = off; const it = off ? ITEMS[off] : null; shield.visible = !!it?.art && it.slot === 'off'; if (shield.visible) shield.geometry = geometryOf(spriteModel(it.art, it.pal)); }
  const body = worn().body?.id ?? null;
  if (body !== guardId) { guardId = body; if (body) guardMat.color.setHex(PALETTES[ITEMS[body].pal]?.ramp[1] ?? 0xffffff); }
}

// ---------------- what it is doing ----------------
let castAge = CAST_TIME, swingAge = SWING_TIME, swingTime = SWING_TIME, clock = 0, lift = 0, turnLag = 0, tiltLag = 0, lastYaw = 0, lastPitch = 0, combo = 0, kicked = true, casting = false;
let useAge = 1, useKind = null, cutting = false, swungAt = -CHAIN;
// A cut is what a blade does when it is swung. Placing, throwing and blocking only move the hand, and neither does a blade chopping at a block.
function swing(time, cut = false) {
  const through = swingAge / swingTime;
  if (cut && cutting && through < CUT_TIMES[heldIt?.motion]?.land) return; // the blade is already on its way, and this blow is the one it is making
  if (cut && cutting && through < 1) swapT = Math.max(swapT, COME_BACK); // it was still coming back under the view
  if (clock - swungAt - swingTime > CHAIN) combo = 0; // so that a fight opens with the forehand
  swungAt = clock; swingAge = 0; swingTime = time; combo++; kicked = false; cutting = cut;
}
const holdsBlade = () => !!CUTS[heldIt?.motion];
const blowTime = () => heldIt.cd * rule('swing') * 0.95; // done just as the next blow comes due, and a Law that quickens the arm quickens this
on('player:struck', () => swing(holdsBlade() ? blowTime() : Math.max(SWING_TIME, (heldIt?.cd ?? 0) * 0.95), holdsBlade()));
on('player:placed', () => swing(PLACE_TIME));
on('drop:thrown', () => swing(PLACE_TIME));
on('player:used', kind => { useKind = kind; useAge = 0; });
on('player:blocked', () => swing(0.16));

// ---------------- how each thing moves ----------------
// Blocks and bare hands swing as they do in Minecraft. Weapons and tools each have a motion of their own: p runs 0 to 1 over a swing, and each returns how far it moves the hand from rest: x, y, z in view units, then turns in radians.
const hump = t => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
const rise = (a, b, t) => ss(a, b, t);
const MOTIONS = {
  // A run of cuts, and a slow great cut over the shoulder. Both are in view/held.js.
  slash: (p, n) => cutMotion('slash', n - 1, p),
  cleave: (p, n) => cutMotion('cleave', n - 1, p),
  // Two quick jabs, and every third blow the blade spins in the hand.
  stab: (p, n) => { const spin = n % 3 === 2; return { x: -0.05 * hump(p), y: 0.04 * hump(p), z: -0.42 * hump(p), rx: -0.12 * hump(p), ry: 0, rz: 0, spin: spin ? p * Math.PI * 2 : 0 }; },
  // Straight out to the full length of the arm.
  thrust: p => { const out = rise(0, 0.32, p) * (1 - rise(0.45, 1, p)); return { x: -0.32 * out, y: 0.14 * out, z: -0.74 * out, rx: 0.16 * out, ry: 0.3 * out, rz: 0 }; },
  // A round swing up and over.
  bash: p => { const a = p * Math.PI * 2; return { x: -0.24 * Math.sin(a) * hump(p), y: 0.3 * Math.cos(a * 0.5) * hump(p), z: -0.26 * hump(p), rx: 1.1 * hump(p) - 2.2 * rise(0.1, 0.7, p) * hump(p), ry: -0.3 * hump(p), rz: 0.3 * hump(p) }; },
  // A pendulum from the shoulder: back, through and back.
  pendulum: p => { const a = Math.sin(p * Math.PI * 2); return { x: -0.1 * hump(p), y: 0.16 * a, z: -0.22 * hump(p), rx: -0.9 * a, ry: 0, rz: 0.1 * a }; },
  // The whole arm goes into a chop.
  chop: p => { const up = rise(0, 0.3, p), down = rise(0.32, 0.56, p), back = rise(0.6, 1, p); return { x: 0, y: 0.34 * up - 0.46 * down + 0.12 * back, z: -0.28 * down + 0.28 * back, rx: 1 * up - 1.7 * down + 0.7 * back, ry: -0.2 * up, rz: 0.25 * up - 0.25 * back }; },
  // In, lift, and toss it over the shoulder.
  scoop: p => { const dig = rise(0, 0.4, p), lift2 = rise(0.4, 0.75, p), back = rise(0.75, 1, p); return { x: 0.1 * lift2 * (1 - back), y: -0.3 * dig + 0.56 * lift2 - 0.26 * back, z: -0.36 * dig + 0.36 * back, rx: -0.9 * dig + 1.6 * lift2 - 0.7 * back, ry: 0, rz: -0.5 * lift2 + 0.5 * back }; },
  // Down and drawn back along the ground.
  sweep: p => ({ x: -0.16 * hump(p), y: -0.28 * hump(p), z: -0.3 * hump(p * 0.6) + 0.2 * rise(0.6, 1, p) * hump(p), rx: -0.8 * hump(p), ry: (-0.4 + 0.8 * p) * hump(p), rz: 0 }),
  // A slow lift and a slam you can feel in the camera.
  slam: p => { const up = rise(0, 0.55, p), down = rise(0.56, 0.72, p), back = rise(0.8, 1, p); return { x: -0.14 * up + 0.14 * down, y: 0.5 * up - 0.74 * down + 0.24 * back, z: 0.1 * up - 0.34 * down + 0.24 * back, rx: 1.4 * up - 2.3 * down + 0.9 * back, ry: 0, rz: 0.3 * up - 0.3 * down, kick: p > 0.7 ? 1.5 : 0 }; },
  snip: p => ({ x: -0.04 * hump(p), y: 0, z: -0.2 * hump(p), rx: 0, ry: 0, rz: 0.5 * Math.sin(p * Math.PI * 4) }),
  channel: p => ({ x: -0.3 * hump(p), y: 0.26 * hump(p), z: -0.44 * hump(p), rx: 0.5 * hump(p), ry: 0.3 * hump(p), rz: 0 }),
  draw: p => ({ x: 0, y: 0, z: -0.12 * hump(p), rx: 0, ry: 0, rz: 0 }),
};
// To the mouth and tilted, for a moment, then back down.
const USE_TIME = 0.55;
const useMotion = (t, kind) => { const lifted = rise(0, 0.3, t) * (1 - rise(0.75, 1, t)), nod = kind === 'drink' ? 1 : Math.sin(t * 24) * 0.25; return { x: -0.62 * lifted, y: 0.42 * lifted + (kind === 'eat' ? 0.03 * nod * lifted : 0), z: -0.1 * lifted, rx: (kind === 'drink' ? 0.9 : 0.4) * lifted, ry: 0.5 * lifted, rz: 0.3 * lifted * nod }; };

// The mark a cut leaves on the air, which view/held.js works out from the blade's own path.
const trailPos = new Float32Array(TRAIL_CELLS * 12), trailRgba = new Float32Array(TRAIL_CELLS * 16), trailShape = new THREE.BufferGeometry();
trailShape.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
trailShape.setAttribute('color', new THREE.BufferAttribute(trailRgba, 4).setUsage(THREE.DynamicDrawUsage));
trailShape.setIndex(TRAIL_INDEX);
const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const trail = new THREE.Mesh(trailShape, trailMat);
trail.frustumCulled = false; trail.visible = false;
scene.add(trail);
const inks = {};
function syncTrail(kind, p, at, light) {
  const cells = kind ? writeTrail(kind, combo - 1, p, inks[heldIt.pal] ??= trailInk(heldIt.pal, inDisplay), trailPos, trailRgba) : 0;
  trail.visible = cells > 0;
  if (!trail.visible) return;
  trailShape.setDrawRange(0, cells * 6);
  trailShape.attributes.position.needsUpdate = trailShape.attributes.color.needsUpdate = true;
  trail.position.set(at[0] * TRAIL_DEPTH, at[1] * TRAIL_DEPTH, 0); // it is further off than the blade, so the same sway on the screen is a longer way
  trailMat.color.setScalar(Math.max(TRAIL_DIM, light));
}
let guardUp = 0;
const glow = new THREE.Color(FIRE_GLOW);
export function throwFire(colour = FIRE_GLOW) { castAge = 0; glow.setHex(colour); }

// ---------------- how bright it is where the hero stands ----------------
let seeT = 0, seen = 1, lit = 1;
function lightHere(dt) {
  seeT -= dt;
  if (seeT <= 0) {
    seeT = SEE_EVERY;
    const x = Math.floor(player.pos.x), y = Math.floor(player.pos.y + 1.5), z = Math.floor(player.pos.z);
    seen = Math.max(skyLight(x, y, z) / 15 * (NIGHT_SKY + (1 - NIGHT_SKY) * ss(-0.2, 0.25, sunHeight())), lampLight(x, y, z) / 15, DARKEST);
  }
  lit += (seen - lit) * (1 - Math.exp(-LIGHT_EASE * dt));
  return inDisplay(lit);
}

export function syncHand(dt, stride, gait) {
  clock += dt;
  const working = G.mouseDown && !G.uiOpen;
  if (working && swingAge >= swingTime) { const cut = holdsBlade() && !digging.on; swing(cut ? blowTime() : SWING_TIME, cut); emit('hand:swung', digging.on); } // held down, it keeps going
  castAge = Math.min(CAST_TIME, castAge + dt);
  swingAge = Math.min(swingTime, swingAge + dt);
  useAge = Math.min(1, useAge + dt / USE_TIME);
  swapT = Math.max(0, swapT - dt * 6);
  syncHeld();

  // Out fast, a moment held at full reach, then lowered away.
  const reach = ss(0, 0.07, castAge) * (1 - ss(0.17, CAST_TIME, castAge)), now = reach > 0.002;
  if (casting && !now) swapT = 1; // what was put away for the spell comes back up
  casting = now;
  const p = swingAge / swingTime, moving = swingAge < swingTime, motion = heldIt && (cutting || !holdsBlade()) ? MOTIONS[heldIt.motion] : null, pull = player.drawing != null ? Math.min(1, player.drawing / 0.8) : 0;
  const m = useAge < 1 ? useMotion(useAge, useKind) : motion && moving ? motion(p, combo) : null, blow = moving && !m ? p : 0;
  if (m?.kick && !kicked) { kicked = true; emit('camera:kick', m.kick); }

  const ease = 1 - Math.exp(-EASE * dt), fade = Math.exp(-LAG_FADE * dt);
  lift += (Math.max(-0.06, Math.min(0.1, -player.vel.y * 0.006)) - lift) * ease;
  turnLag = Math.max(-MAX_LAG, Math.min(MAX_LAG, turnLag * fade + (player.yaw - lastYaw) * LAG_TURN));
  tiltLag = Math.max(-MAX_LAG, Math.min(MAX_LAG, tiltLag * fade + (player.pitch - lastPitch) * LAG_TURN));
  lastYaw = player.yaw; lastPitch = player.pitch;
  const at = [Math.sin(stride) * 0.02 * gait + turnLag - 0.3 * pull, Math.cos(stride * 2) * 0.016 * gait + Math.sin(clock * 1.6) * 0.004 + lift - tiltLag + 0.12 * pull, 0.2 * pull];
  const raised = swapT * swapT; // what is in the hand changes below the edge of the view

  // The arm only shows with nothing in the hand, or when what is there has been put away to cast.
  const showArm = !heldIt || casting, light = lightHere(dt), flash = FLASH * (1 - ss(0, 0.26, castAge));
  arm.visible = showArm;
  guard.visible = showArm && !!guardId;
  if (showArm) {
    const pose = armPose(casting ? CAST_REACH * reach : blow, casting ? (heldIt ? 1 - reach : 0) : raised, at);
    place(arm, pose); place(guard, pose);
    armMat.color.setRGB(light + glow.r * flash, light + glow.g * flash, light + glow.b * flash);
  }
  item.visible = !!heldIt && !casting;
  if (item.visible) {
    const moved = m?.arc ? m : m || pull ? { x: m?.x ?? 0, y: m?.y ?? 0, z: m?.z ?? 0, rx: m?.rx ?? 0, ry: (m?.ry ?? 0) - 0.4 * pull, rz: m?.rz ?? 0 } : null, pose = itemPose(blow, raised, at, moved);
    if (m?.spin) pose.rotX(m.spin * 180 / Math.PI);
    heldModel.hold(pose);
    place(item, pose);
    const gleam = heldIt.art?.endsWith('2') ? 1 + GLEAM + GLEAM * Math.sin(clock * 2.2) : 1; // what only the deep can make has a slow gleam
    item.material.color.setScalar((heldModel.glow ? 1 : light) * gleam);
  }
  syncTrail(cutting && moving && useAge >= 1 && holdsBlade() ? heldIt.motion : null, p, at, light);
  guardUp += ((player.guarding ? 1 : 0) - guardUp) * (1 - Math.exp(-16 * dt));
  if (shield.visible) {
    const u = guardUp, pose = new Pose().translate(...SHIELD_DOWN.map((d, i) => d + (SHIELD_UP[i] - d) * u)).scale(SHIELD_SIZE).translate(-0.5, -0.5, -0.5);
    place(shield, pose);
    shieldMat.color.setScalar(light);
  }
  view.rotation.z = camera.rotation.z; // a blow knocks the arm with the head
}
export function drawHand() {
  renderer.autoClear = false; renderer.clearDepth();
  renderer.render(scene, view);
  renderer.autoClear = true;
}

// Built now rather than on the first frame.
renderer.compile(scene, view);

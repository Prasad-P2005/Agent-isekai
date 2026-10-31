// The hero's own right hand, in the corner of the view. It breathes, sways with the walk, lags behind a turn of the head,
// and does the work: mining, punching, placing and throwing fire. All of it is decoration on what the simulation announces.
// It lives in its own scene, drawn over a cleared depth buffer, so that it can never poke into a wall the player stands against.
import * as THREE from 'three';
import { emit, on } from '../core/events.js';
import { G } from '../core/state.js';
import { BL } from '../sim/blocks.js';
import { ITEMS } from '../core/content.js';
import { heldStack, offDef, worn } from '../sim/inventory.js';
import { miningBar } from '../sim/mining.js';
import { ss } from '../sim/noise.js';
import { player } from '../sim/player.js';
import { heroLook } from './avatar.js';
import { TILE, tilePixels } from './blocktex.js';
import { ITEM_SIZE, PALETTES, spritePixels } from './itemart.js';
import { GOLD } from './outfits.js';
import { cloth, flesh, leather, plain } from './paint.js';
import { ambientLight, camera, renderer } from './scene.js';
import { Atlas, INK, LIFT, mixHex, solid } from './voxel.js';

const PX = 0.02; // one art pixel of the hand, in view units
const BLOCK = 0.024; // what that comes to at the size of the world's pixels, seen this close
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
const look = heroLook(), sheet = new Atlas(128), material = new THREE.MeshLambertMaterial({ color: LIFT });
const skin = flesh(look.skin), knuckle = plain(mixHex(look.skin, INK, 0.16)), sleeve = cloth(look.top), bracer = leather(look.gauntlets ?? look.armor ?? mixHex(look.top, INK, 0.3)), strap = plain(look.belt ?? mixHex(look.top, INK, 0.5));
const WRIST_AT = -34, FINGERS_AT = -13, FINGER_LEN = 4.5;

arm.add(solid([[11, 11, 30, 0, 0, -11, sleeve], [13, 13, 9, 0, 0, -29, bracer], [13.4, 13.4, 1.6, 0, 0, -26, strap], [13.4, 13.4, 1.6, 0, 0, -32, strap], [3, 1, 3, 0, 6.8, -29, plain(GOLD)]], sheet, material, BLOCK));
wrist.position.z = WRIST_AT;
arm.add(wrist);
wrist.add(solid([[11, 10, 3, 0, 0, -1, skin], [15, 7, 13, 0, 0, -6.5, skin], [15.4, 1, 3, 0, 3.8, -11, knuckle]], sheet, material, BLOCK));
// Four fingers of two joints each, and a thumb, so that the hand can close into a fist and open flat.
const fingers = [-5.4, -1.8, 1.8, 5.4].map((x, i) => {
  const base = new THREE.Group(), tip = new THREE.Group(), length = FINGER_LEN - Math.abs(i - 1.5) * 0.5;
  base.position.set(x, 0.5, FINGERS_AT);
  tip.position.z = -length;
  base.add(solid([[3.2, 4.4, length + 0.4, 0, 0, -length / 2, skin]], sheet, material, BLOCK), tip);
  tip.add(solid([[3.2, 4, length, 0, 0, -length / 2, skin], [3.4, 0.6, 1.4, 0, 2.1, -length + 0.8, knuckle]], sheet, material, BLOCK));
  wrist.add(base);
  return { base, tip };
});
const thumb = new THREE.Group();
thumb.position.set(-7.5, -1.5, -4);
thumb.add(solid([[4, 4, 8, 0, 0, -4, skin]], sheet, material, BLOCK));
wrist.add(thumb);
material.map = sheet.texture(); // only now that every part has been painted onto it

// The block in hand, a real little cube of it, sitting in the palm.
const HELD_SIZE = 11;
const held = new THREE.Mesh(new THREE.BoxGeometry(HELD_SIZE, HELD_SIZE, HELD_SIZE), []);
held.position.set(0, -3, -19); // the palm faces down, so it rides out past the fingers where it can be seen
held.rotation.set(0.1, 0.6, 0);
held.visible = false;
wrist.add(held);
const faceTextures = new Map(), heldLooks = new Map();
function faceTexture(name) {
  if (!faceTextures.has(name)) {
    const t = new THREE.DataTexture(tilePixels(name), TILE, TILE);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.y = -1; t.offset.y = 1; // tiles are painted from the top row down
    t.needsUpdate = true;
    faceTextures.set(name, t);
  }
  return faceTextures.get(name);
}
function heldLook(id) {
  if (!heldLooks.has(id)) {
    const b = BL[id], [top, side = top, bottom = side] = [].concat(b.tex ?? 'dirt'), tint = b.tint ? new THREE.Color().setRGB(...b.top, THREE.SRGBColorSpace) : new THREE.Color(LIFT);
    const face = name => new THREE.MeshLambertMaterial({ map: faceTexture(name), color: name === 'dirt' ? LIFT : tint, alphaTest: b.cutout ? 0.4 : 0, side: b.cutout ? THREE.DoubleSide : THREE.FrontSide });
    heldLooks.set(id, [side, side, top, bottom, side, side].map(face));
  }
  return heldLooks.get(id);
}
// ---------------- a tool: its own 16 by 16 sprite, pushed out into a slab, so that the drawing and the model can never disagree ----------------
const SLAB = 0.5; // half the thickness, in sprite pixels
const FACES_OF_PIXEL = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 1, 0]], [0, -1, [0, -1, 0]]];
function extrude(px) {
  const N = ITEM_SIZE, pos = [], nor = [], col = [], colour = new THREE.Color();
  const solidAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && px[(x + y * N) * 4 + 3] > 0;
  const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) { pos.push(...v); nor.push(...n); col.push(colour.r, colour.g, colour.b); } };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!solidAt(x, y)) continue;
    const i = (x + y * N) * 4, top = N - y, bottom = N - 1 - y;
    colour.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace);
    quad([x, bottom, SLAB], [x + 1, bottom, SLAB], [x + 1, top, SLAB], [x, top, SLAB], [0, 0, 1]);
    quad([x + 1, bottom, -SLAB], [x, bottom, -SLAB], [x, top, -SLAB], [x + 1, top, -SLAB], [0, 0, -1]);
    for (const [dx, dy, n] of FACES_OF_PIXEL) {
      if (solidAt(x + dx, y - dy)) continue;
      const x0 = dx > 0 ? x + 1 : x, x1 = dx < 0 ? x : x + 1, y0 = dy > 0 ? top : bottom, y1 = dy < 0 ? bottom : top;
      if (dx) quad([x0, y0, SLAB], [x0, y0, -SLAB], [x0, y1, -SLAB], [x0, y1, SLAB], n);
      else quad([x0, y0, -SLAB], [x0, y0, SLAB], [x1, y0, SLAB], [x1, y0, -SLAB], n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const TOOL_SCALE = 1.9, TOOL_GRIP = [-3.5, -2.5, 0]; // where the fist closes on a sprite whose handle is at its lower left
const models = new Map(), toolMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: LIFT, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0 });
function modelOf(art, pal) {
  const key = `${art}/${pal}`;
  if (!models.has(key)) { const g = extrude(spritePixels(art, pal)); g.translate(...TOOL_GRIP); models.set(key, g); }
  return models.get(key);
}
const tool = new THREE.Mesh(new THREE.BufferGeometry(), toolMat);
tool.scale.setScalar(TOOL_SCALE);
tool.position.set(0, -2, -11);
tool.rotation.set(0, Math.PI / 2, 0); // the sprite's plane runs fore and aft, with the tip forward and up
tool.visible = false;
wrist.add(tool);
// The shield is on the other arm, out of the hand's way until it is wanted.
const shield = new THREE.Mesh(new THREE.BufferGeometry(), toolMat), SHIELD_DOWN = new THREE.Vector3(-1.3, -1.25, -0.8), SHIELD_UP = new THREE.Vector3(-0.32, -0.42, -0.75);
shield.scale.setScalar(0.046);
shield.visible = false;
rig.add(shield);
// Armour on the arm in view: a plate over the sleeve, in the colours of what is worn.
const guardMat = new THREE.MeshLambertMaterial({ color: 0xffffff }), guard = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 24), guardMat);
guard.position.z = -18;
guard.visible = false;
arm.add(guard);

let heldId = null, heldIt = null, shieldId = null, guardId = null, swapT = 0;
function syncHeld(reach) {
  const s = heldStack(), id = s?.id ?? null;
  if (id !== heldId) {
    heldId = id; heldIt = id ? ITEMS[id] : null; swapT = 1;
    if (heldIt?.art) tool.geometry = modelOf(heldIt.art, heldIt.pal);
    else if (heldIt) held.material = heldLook(heldIt.block ?? heldIt.place[0]);
  }
  tool.visible = !!heldIt?.art && reach < 0.3;
  held.visible = !!heldIt && !heldIt.art && reach < 0.3;
  const off = worn().off?.id ?? null;
  if (off !== shieldId) { shieldId = off; const it = off ? ITEMS[off] : null; shield.visible = !!it?.art && it.slot === 'off'; if (shield.visible) shield.geometry = modelOf(it.art, it.pal); }
  const body = worn().body?.id ?? null;
  if (body !== guardId) { guardId = body; guard.visible = !!body; if (body) guardMat.color.setHex(PALETTES[ITEMS[body].pal]?.ramp[1] ?? 0xffffff).multiply(LIFT); }
}

function closeHand(curl) {
  for (const { base, tip } of fingers) { base.rotation.x = -curl * 1.25; tip.rotation.x = -curl * 1.45; }
  thumb.rotation.set(-curl * 0.5, 0.7 - curl * 1.3, 0);
}

// ---------------- what it is doing ----------------
let castAge = CAST_TIME, swingAge = SWING_TIME, swingTime = SWING_TIME, swingSize = 1, clock = 0, curl = RELAXED, lift = 0, turnLag = 0, tiltLag = 0, lastYaw = 0, lastPitch = 0, combo = 0, kicked = true;
let useAge = 1, useKind = null;
function swing(time, size) { swingAge = 0; swingTime = time; swingSize = size; combo++; kicked = false; }
on('player:struck', () => swing(Math.max(SWING_TIME, (heldIt?.cd ?? 0) * 0.95), 1.2));
on('player:placed', () => swing(PLACE_TIME, 0.6));
on('player:used', kind => { useKind = kind; useAge = 0; });
on('player:blocked', () => { swing(0.16, 0.3); });

// ---------------- how each thing moves ----------------
// Every kind has a motion of its own. p runs 0 to 1 over a swing, and each returns how far it moves the arm from rest: x, y, z in view units, then turns in radians.
const hump = t => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
const rise = (a, b, t) => ss(a, b, t), TRAIL_MOTIONS = new Set(['slash', 'cleave']);
const MOTIONS = {
  // Flat across the body, one way and then the other.
  slash: (p, n) => { const side = n % 2 ? 1 : -1, t = rise(0, 0.75, p); return { x: side * (0.3 - 0.6 * t) * hump(p * 0.5 + 0.25), y: 0.1 * hump(p), z: -0.3 * hump(p), rx: -0.25 * hump(p), ry: side * (0.9 - 1.8 * t), rz: side * 0.5 * hump(p) }; },
  // Over the shoulder, a hold at the top, then all of it coming down.
  cleave: p => { const up = rise(0, 0.38, p), down = rise(0.42, 0.68, p); return { x: -0.2 * up + 0.2 * down, y: 0.42 * up - 0.6 * down, z: 0.14 * up - 0.42 * down, rx: 1.2 * up - 2 * down, ry: -0.35 * up + 0.35 * down, rz: 0.5 * up - 0.5 * down }; },
  // Two quick jabs, and every third blow the blade spins in the hand.
  stab: (p, n) => { const spin = n % 3 === 2; return { x: -0.05 * hump(p), y: 0.04 * hump(p), z: -0.42 * hump(p), rx: -0.12 * hump(p), ry: 0, rz: 0, spin: spin ? p * Math.PI * 2 : 0 }; },
  // Straight out to the full length of the arm.
  thrust: p => { const out = rise(0, 0.32, p) * (1 - rise(0.45, 1, p)); return { x: -0.32 * out, y: 0.14 * out, z: -0.74 * out, rx: 0.16 * out, ry: 0.3 * out, rz: 0 }; },
  // A round swing up and over.
  bash: p => { const a = p * Math.PI * 2; return { x: -0.24 * Math.sin(a) * hump(p), y: 0.3 * Math.cos(a * 0.5) * hump(p), z: -0.26 * hump(p), rx: 1.1 - 2.2 * rise(0.1, 0.7, p), ry: -0.3 * hump(p), rz: 0.3 * hump(p) }; },
  // A pendulum from the shoulder: back, through and back.
  pendulum: p => { const a = Math.sin(p * Math.PI * 2); return { x: -0.1 * hump(p), y: 0.16 * a, z: -0.22 * hump(p), rx: -0.9 * a, ry: 0, rz: 0.1 * a }; },
  // The whole arm goes into a chop.
  chop: p => { const up = rise(0, 0.3, p), down = rise(0.32, 0.56, p), back = rise(0.6, 1, p); return { x: 0, y: 0.34 * up - 0.46 * down + 0.12 * back, z: -0.28 * down + 0.28 * back, rx: 1 * up - 1.7 * down + 0.7 * back, ry: -0.2 * up, rz: 0.25 * up - 0.25 * back }; },
  // In, lift, and toss it over the shoulder.
  scoop: p => { const dig = rise(0, 0.4, p), lift2 = rise(0.4, 0.75, p), back = rise(0.75, 1, p); return { x: 0.1 * lift2 * (1 - back), y: -0.3 * dig + 0.56 * lift2 - 0.26 * back, z: -0.36 * dig + 0.36 * back, rx: -0.9 * dig + 1.6 * lift2 - 0.7 * back, ry: 0, rz: -0.5 * lift2 + 0.5 * back }; },
  // Down and drawn back along the ground.
  sweep: p => ({ x: -0.16 * hump(p), y: -0.28 * hump(p), z: -0.3 * hump(p * 0.6) + 0.2 * rise(0.6, 1, p), rx: -0.8 * hump(p), ry: -0.4 + 0.8 * p, rz: 0 }),
  // A slow lift and a slam you can feel in the camera.
  slam: p => { const up = rise(0, 0.55, p), down = rise(0.56, 0.72, p), back = rise(0.8, 1, p); return { x: -0.14 * up + 0.14 * down, y: 0.5 * up - 0.74 * down + 0.24 * back, z: 0.1 * up - 0.34 * down + 0.24 * back, rx: 1.4 * up - 2.3 * down + 0.9 * back, ry: 0, rz: 0.3 * up - 0.3 * down, kick: p > 0.7 ? 1.5 : 0 }; },
  snip: p => ({ x: -0.04 * hump(p), y: 0, z: -0.2 * hump(p), rx: 0, ry: 0, rz: 0.5 * Math.sin(p * Math.PI * 4) }),
  channel: p => ({ x: -0.3 * hump(p), y: 0.26 * hump(p), z: -0.44 * hump(p), rx: 0.5 * hump(p), ry: 0.3 * hump(p), rz: 0 }),
  draw: p => ({ x: 0, y: 0, z: -0.12 * hump(p), rx: 0, ry: 0, rz: 0 }),
};
// To the mouth and tilted, for a moment, then back down.
const USE_TIME = 0.55;
const useMotion = (t, kind) => { const lifted = rise(0, 0.3, t) * (1 - rise(0.75, 1, t)), nod = kind === 'drink' ? 1 : Math.sin(t * 24) * 0.25; return { x: -0.62 * lifted, y: 0.42 * lifted + (kind === 'eat' ? 0.03 * nod * lifted : 0), z: -0.1 * lifted, rx: (kind === 'drink' ? 0.9 : 0.4) * lifted, ry: 0.5 * lifted, rz: 0.3 * lifted * nod }; };

// A slash leaves a thin bright arc on the air. One mesh, no particles.
const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const trail = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.8, 18, 1, 0, Math.PI * 0.8), trailMat);
trail.position.set(0.1, -0.2, -1);
scene.add(trail);
let guardUp = 0;
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
  const p = swingAge / swingTime, moving = swingAge < swingTime, motion = heldIt?.art ? MOTIONS[heldIt.motion] : null;
  const punch = motion ? 0 : Math.sin(Math.PI * p) * swingSize, arc = motion ? 0 : Math.sin(Math.PI * Math.sqrt(p)) * swingSize;
  useAge = Math.min(1, useAge + dt / USE_TIME);
  const m = useAge < 1 ? useMotion(useAge, useKind) : motion && moving ? motion(p, combo) : null, pull = player.drawing != null ? Math.min(1, player.drawing / 0.8) : 0;
  if (m?.kick && !kicked) { kicked = true; emit('camera:kick', m.kick); }
  swapT = Math.max(0, swapT - dt * 6);

  const ease = 1 - Math.exp(-EASE * dt), fade = Math.exp(-LAG_FADE * dt);
  curl += ((punch > 0.02 || working ? 1 : RELAXED) * (1 - reach) - curl) * ease;
  closeHand(heldIt ? Math.max(curl, 0.75) : curl);
  syncHeld(reach);
  lift += (Math.max(-0.06, Math.min(0.1, -player.vel.y * 0.006)) - lift) * ease;
  turnLag = Math.max(-MAX_LAG, Math.min(MAX_LAG, turnLag * fade + (player.yaw - lastYaw) * LAG_TURN));
  tiltLag = Math.max(-MAX_LAG, Math.min(MAX_LAG, tiltLag * fade + (player.pitch - lastPitch) * LAG_TURN));
  lastYaw = player.yaw; lastPitch = player.pitch;

  at.lerpVectors(REST_AT, THRUST_AT, reach);
  at.x += Math.sin(stride) * 0.02 * gait + turnLag - 0.24 * arc;
  at.y += Math.cos(stride * 2) * 0.016 * gait + Math.sin(clock * 1.6) * 0.004 + lift - tiltLag + 0.2 * arc;
  at.z -= 0.34 * punch;
  at.y -= 0.5 * swapT * swapT; // what is in the hand changes below the edge of the view
  at.x += (m?.x ?? 0) - 0.3 * pull; at.y += (m?.y ?? 0) + 0.12 * pull; at.z += (m?.z ?? 0) + 0.2 * pull;
  arm.position.copy(at);
  arm.rotation.set(REST_TURN.x + (THRUST_TURN.x - REST_TURN.x) * reach - 0.3 * punch + (m?.rx ?? 0), REST_TURN.y + (THRUST_TURN.y - REST_TURN.y) * reach - 0.1 * arc + (m?.ry ?? 0) - 0.4 * pull, REST_TURN.z * (1 - reach) * (1 - 0.7 * arc) + (m?.rz ?? 0));
  tool.rotation.x = m?.spin ?? 0;
  const hot = TRAIL_MOTIONS.has(heldIt?.motion) && moving ? hump((p - 0.12) / 0.6) : 0;
  trailMat.opacity = 0.5 * hot;
  trail.visible = hot > 0.01;
  if (trail.visible) { trail.rotation.z = (combo % 2 ? -0.4 : 0.6) - p * 1.2; trailMat.color.setHex(PALETTES[heldIt.pal]?.ramp[1] ?? 0xffffff); }
  toolMat.emissiveIntensity = heldIt?.art?.endsWith('2') ? 0.04 + 0.04 * Math.sin(clock * 2.2) : 0; // what only the deep can make has a slow gleam
  const raised = player.guarding ? 1 : 0;
  guardUp += (raised - guardUp) * (1 - Math.exp(-16 * dt));
  shield.position.lerpVectors(SHIELD_DOWN, SHIELD_UP, guardUp);
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

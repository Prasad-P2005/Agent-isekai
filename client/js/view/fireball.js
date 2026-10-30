// How a fireball looks: the ball, its trail and the blast. All of it is decoration on what the simulation announces.
// Every cube goes through one instanced mesh, so the whole effect is a single draw call.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { solid } from '../sim/blocks.js';
import { getBlock } from '../sim/chunks.js';
import { ss } from '../sim/noise.js';
import { PALM, throwFire } from './hand.js';
import { camera, renderer, scene, stillCamera } from './scene.js';

// The colours of the fire icon, hottest first. Stepped through rather than blended, so that it stays pixel art.
const FIRE = [0xfff4e6, 0xffd24a, 0xf59e1b, 0xd9701a, 0xd8344a, 0x8f1d38].map(c => new THREE.Color(c));
const ASH = [0x3a3036, 0x5a4c50, 0x7d7070].map(c => new THREE.Color(c));
const shade = (palette, t) => palette[Math.min(palette.length - 1, Math.max(0, Math.floor(t * palette.length)))];
const between = ([a, b]) => a + Math.random() * (b - a);

// ---------------- cubes ----------------
// This is the most used attack, so it stays cheap: a few chunky cubes rather than many small ones.
// A ball is 15 cubes and about 25 of trail, a blast 42, or 16 for an enemy bolt. The pools fit five blasts at once, which is a full mana bar.
// A meteor's blast is 72: it costs a whole well, so it can afford to be seen. view/spells.js draws the other spells with these same cubes.
const MAX_CUBES = 320, MAX_CINDERS = 240;
// One flat colour would make a cube read as a hexagon, so each face keeps its own shade.
const FACE_SHADES = [0.86, 0.86, 1, 0.7, 0.93, 0.93];
const box = new THREE.BoxGeometry(1, 1, 1);
box.setAttribute('color', new THREE.Float32BufferAttribute(FACE_SHADES.flatMap(s => Array(12).fill(s)), 3));
const cubes = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), MAX_CUBES);
cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cubes.setColorAt(0, FIRE[0]);
cubes.frustumCulled = false; cubes.count = 0;
scene.add(cubes);

const place = new THREE.Vector3(), size = new THREE.Vector3(), matrix = new THREE.Matrix4();
let drawn = 0;
function cube(x, y, z, s, turn, color) {
  if (drawn === MAX_CUBES) return;
  cubes.setMatrixAt(drawn, matrix.compose(place.set(x, y, z), turn, size.setScalar(s)));
  cubes.setColorAt(drawn++, color);
}

// ---------------- cinders: small cubes that fly, cool and go out ----------------
const TURNS = Array.from({ length: 16 }, () => new THREE.Quaternion().random());
const BLOOM = { palette: FIRE, life: [0.16, 0.45], size: [0.6, 1.2], speed: [2, 15], spread: 0.4, drag: 6, lift: 1, fall: 0 };
const EMBER = { palette: FIRE, life: [0.35, 0.85], size: [0.24, 0.52], speed: [6, 17], spread: 0.5, drag: 5, lift: 1.5, fall: 0 };
const SPARK = { palette: FIRE, life: [0.5, 1.1], size: [0.07, 0.13], speed: [8, 18], spread: 0.3, drag: 1, lift: 0, fall: 18 };
const SMOKE = { palette: ASH, life: [0.9, 1.7], size: [0.7, 1.2], speed: [1, 3.5], spread: 0.9, drag: 3, lift: 1.7, fall: 0, swells: true };
const TRAIL = { palette: FIRE, life: [0.22, 0.5], size: [0.18, 0.32], speed: [0.2, 1.1], spread: 0.16, drag: 3, lift: 1, fall: 0 };
const TRAIL_SMOKE = { ...SMOKE, life: [0.45, 0.9], size: [0.2, 0.36], speed: [0.1, 0.7], spread: 0.14 };
const PUFF = { ...EMBER, size: [0.1, 0.22], speed: [0.5, 2.5], spread: 0.2 };
const PALM_SPARK = { ...EMBER, size: [0.03, 0.07], speed: [2, 6], spread: 0.04, life: [0.12, 0.28] };

const cinders = Array.from({ length: MAX_CINDERS }, () => ({ age: 0, life: 0 }));
const heading = new THREE.Vector3();
let nextCinder = 0;
// The oldest cinder gives way when the pool runs out, which nobody can see in the middle of a blast.
export function spray(kind, at, n, drift, scale = 1) {
  for (let i = 0; i < n; i++) {
    const c = cinders[nextCinder]; nextCinder = (nextCinder + 1) % MAX_CINDERS;
    heading.randomDirection();
    c.x = at.x + heading.x * kind.spread; c.y = at.y + heading.y * kind.spread; c.z = at.z + heading.z * kind.spread;
    heading.multiplyScalar(between(kind.speed));
    if (drift) heading.add(drift);
    c.vx = heading.x; c.vy = heading.y; c.vz = heading.z;
    c.age = 0; c.life = between(kind.life); c.size = between(kind.size) * scale; c.kind = kind; c.turn = TURNS[nextCinder % TURNS.length];
  }
}
function burn(dt) {
  for (const c of cinders) {
    if (c.age >= c.life) continue;
    c.age += dt;
    const t = c.age / c.life, k = c.kind, slow = Math.max(0, 1 - k.drag * dt);
    if (t >= 1) continue;
    c.vx *= slow; c.vz *= slow; c.vy = c.vy * slow + (k.lift * k.drag - k.fall) * dt;
    const x = c.x + c.vx * dt, y = c.y + c.vy * dt, z = c.z + c.vz * dt;
    if (k.fall && solid(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))) c.vx = c.vy = c.vz = 0; // sparks settle on the ground
    else { c.x = x; c.y = y; c.z = z; }
    cube(c.x, c.y, c.z, c.size * (k.swells ? Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.15)) : 1 - t * t), c.turn, shade(k.palette, t));
  }
}

// ---------------- glows: flat pixel sprites around the fire ----------------
// Plain alpha blending, because adding light to a bright sky washes the orange out to white.
function pixelTexture(alpha) {
  const n = 32, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = Math.round(Math.max(0, Math.min(1, alpha(d))) * 5) / 5 * 255;
  }
  const tex = new THREE.DataTexture(px, n, n);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}
export const HALO = pixelTexture(d => Math.max(0, 1 - d) ** 2 * 1.3), RING = pixelTexture(d => (d > 0.72 && d < 1 ? 1.2 - Math.abs(d - 0.86) * 8 : 0));
const sprites = Array.from({ length: 20 }, () => {
  // Drawn over the world: a flash cut in half by the wall it hit looks wrong, and a ball only blasts what it can see.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  s.visible = false; scene.add(s);
  return s;
});
function takeSprite(map, color) {
  const s = sprites.find(s => !s.visible);
  if (s) { s.material.map = map; s.material.color.setHex(color); s.visible = true; }
  return s;
}
const flares = [];
export function flare(map, color, at, opacity, from, to, life) {
  const s = takeSprite(map, color);
  if (s) { s.position.copy(at); flares.push({ s, age: 0, opacity, from, to, life }); }
}
function burnFlares(dt) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i], t = (f.age += dt) / f.life;
    if (t >= 1) { f.s.visible = false; flares.splice(i, 1); continue; }
    f.s.scale.setScalar(f.from + (f.to - f.from) * (1 - (1 - t) ** 3));
    f.s.material.opacity = f.opacity * (1 - t);
  }
}

// ---------------- the ball ----------------
const BALL_RADIUS = 0.25, BALL_CUBE = 0.27, BALL_LIGHT = 9, HAND_EASE = 0.18, TRAIL_GAP = 0.6;
const SHELL = Array.from({ length: 14 }, (_, i) => { // an even spread of points over a sphere
  const y = 1 - (i + 0.5) / 7, r = Math.sqrt(1 - y * y), a = i * 2.39996;
  return { dir: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), phase: i * 1.7 };
});
const flying = new Map(); // projectile -> how it is drawn
const point = new THREE.Vector3(), spot = new THREE.Vector3(), toEye = new THREE.Vector3(), drift = new THREE.Vector3(), turn = new THREE.Quaternion();

on('projectile:spawned', pr => {
  const at = new THREE.Vector3().copy(pr.pos);
  flying.set(pr, { at, fromHand: new THREE.Vector3(), axis: new THREE.Vector3().randomDirection(), spin: new THREE.Quaternion(), age: 0, grown: 0, owed: 0, halo: takeSprite(HALO, 0xff8a2a) });
});
function drawBall(b, size) {
  const { at, spin, age } = b, radius = BALL_RADIUS * size;
  toEye.copy(camera.position).sub(at).normalize();
  cube(at.x, at.y, at.z, radius * 1.3, spin, FIRE[1]);
  for (const s of SHELL) {
    spot.copy(s.dir).applyQuaternion(spin);
    // The middle of the ball as you see it burns hottest and its rim coolest, from any side.
    const boil = Math.sin(age * 17 + s.phase), r = radius * (1 + 0.2 * boil), heat = 0.68 - 0.6 * Math.max(0, spot.dot(toEye)) + 0.2 * Math.sin(age * 29 + s.phase * 3);
    cube(at.x + spot.x * r, at.y + spot.y * r, at.z + spot.z * r, BALL_CUBE * size * (1 + 0.28 * boil), spin, shade(FIRE, heat));
  }
}
function flyBall(pr, b, dt) {
  b.age += dt;
  point.copy(b.at);
  const k = Math.max(0, 1 - b.age / HAND_EASE);
  b.at.copy(pr.pos).addScaledVector(b.fromHand, k * k);
  b.spin.multiply(turn.setFromAxisAngle(b.axis, dt * 9));
  // It starts as a spark in the palm: at full size, this close to the eye, it would fill the screen.
  b.grown = ss(0, HAND_EASE * 1.3, b.age);
  const size = (0.3 + 0.7 * b.grown) * pr.size;
  drawBall(b, size);
  if (b.halo) {
    b.halo.position.copy(b.at); b.halo.scale.setScalar((1.7 + 0.25 * Math.sin(b.age * 23)) * b.grown * b.grown * pr.size);
    b.halo.material.opacity = 0.5;
  }
  // Laid along the whole stretch flown this frame, or the trail would come out in clumps.
  b.owed += point.distanceTo(b.at) / (TRAIL_GAP * pr.size);
  drift.copy(pr.vel).multiplyScalar(0.05);
  for (const from = point.clone(); b.owed >= 1; b.owed--) {
    point.copy(from).lerp(b.at, Math.random());
    spray(TRAIL, point, 1, drift, size);
    if (Math.random() < 0.15) spray(TRAIL_SMOKE, point, 1, drift, size);
  }
}

// ---------------- the blast ----------------
const BLAST_LIGHT = 60, LIGHT_FADE = 7;
const FIREBALL_BLAST = { bloom: 24, ember: 8, spark: 6, smoke: 4, size: 1, shake: 0.75 };
const BOLT_BLAST = { bloom: 10, ember: 3, spark: 2, smoke: 1, size: 0.7, shake: 0 }; // enemy fire: the camera stays the player's
const METEOR_BLAST = { bloom: 40, ember: 14, spark: 10, smoke: 8, size: 2, shake: 1 };
const flash = { at: new THREE.Vector3(), power: 0 };
const light = new THREE.PointLight(0xff9a3c, 0, 18, 2);
scene.add(light); // always here at zero: adding a light later would recompile every lit material mid-fight
let trauma = 0;
export function shake(amount) { trauma = Math.min(1, trauma + amount); }

function blast(at, kind) {
  // Up close the same cubes would fill the screen with shards, so a blast at your feet is a finer one.
  const away = camera.position.distanceTo(at), scale = kind.size * (0.3 + 0.7 * ss(1, 10, away));
  flare(HALO, 0xffd98a, at, 1, 3 * scale, 10 * scale, 0.26);
  flare(RING, 0xffb04a, at, 0.85, 2 * scale, 12 * scale, 0.36);
  spray(BLOOM, at, kind.bloom, null, scale); spray(EMBER, at, kind.ember, null, scale); spray(SPARK, at, kind.spark, null, scale); spray(SMOKE, at, kind.smoke, null, scale);
  flash.at.copy(at); flash.power = BLAST_LIGHT * scale;
  shake(kind.shake * Math.max(0, 1 - away / 26));
}
function fizzle(at) {
  spray(PUFF, at, 6); spray(TRAIL_SMOKE, at, 2);
  flash.at.copy(at); flash.power = BALL_LIGHT;
}
on('projectile:removed', pr => {
  const b = flying.get(pr);
  if (b.halo) b.halo.visible = false;
  flying.delete(pr);
  if (!pr.hit) return fizzle(b.at);
  // A hit is found one step inside what was struck, so the blast is drawn back out at the surface.
  spot.copy(pr.vel).normalize();
  blast(point.copy(pr.pos).addScaledVector(spot, -0.5), pr.blast ? METEOR_BLAST : pr.hostile ? BOLT_BLAST : FIREBALL_BLAST);
});
function lightFire(dt) {
  flash.power *= Math.exp(-LIGHT_FADE * dt);
  let newest = null;
  for (const b of flying.values()) newest = b;
  if (newest && flash.power < BALL_LIGHT) {
    light.position.copy(newest.at);
    light.intensity = BALL_LIGHT * newest.grown * (1 + 0.2 * Math.sin(newest.age * 31));
  } else {
    light.position.copy(flash.at);
    light.intensity = flash.power;
  }
}

// ---------------- leaving the hand ----------------
const RECOIL = 0.02, RECOIL_TIME = 0.26;
let castAge = RECOIL_TIME;

on('fireball:cast', pr => {
  const b = flying.get(pr);
  // The ball truly flies from the eye to the crosshair. It is drawn leaving the palm and eases onto that line.
  point.copy(PALM).applyQuaternion(camera.quaternion).add(camera.position);
  b.fromHand.copy(point).sub(pr.pos);
  b.at.copy(point);
  castAge = 0; throwFire();
  flare(HALO, 0xffc46a, point, 0.8, 0.25, 1, 0.16);
  spray(PALM_SPARK, point, 4, drift.copy(pr.vel).multiplyScalar(0.12));
});

// ---------------- each frame ----------------
let clock = 0;
function shakeCamera(dt) {
  trauma = Math.max(0, trauma - 2.2 * dt);
  castAge = Math.min(RECOIL_TIME, castAge + dt);
  if (stillCamera.matches) return;
  const hard = trauma * trauma;
  camera.rotation.x += hard * 0.05 * Math.sin(clock * 47) + RECOIL * Math.sin(Math.PI * castAge / RECOIL_TIME);
  camera.rotation.y += hard * 0.05 * Math.sin(clock * 61 + 1);
  camera.rotation.z += hard * 0.035 * Math.sin(clock * 53 + 2);
}
export function syncFireballs(dt) {
  clock += dt;
  drawn = 0;
  for (const [pr, b] of flying) flyBall(pr, b, dt);
  burn(dt);
  burnFlares(dt);
  lightFire(dt);
  shakeCamera(dt);
  if (cubes.count || drawn) { cubes.count = drawn; cubes.instanceMatrix.needsUpdate = true; cubes.instanceColor.needsUpdate = true; }
}

// Built now rather than on the first cast, when the pause would land in the middle of a fight.
renderer.compile(scene, camera);

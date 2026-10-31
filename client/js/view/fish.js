// A few small fish in the water near the hero, and slight on purpose: three schools of six in one draw call. They live only in the view, so
// nothing can hit them, nothing depends on them and they cost the simulation nothing. They scatter from whoever swims too close.
import * as THREE from 'three';
import { WATER } from '../sim/blocks.js';
import { spotted } from '../sim/bestiary.js';
import { getBlock } from '../sim/chunks.js';
import { inView } from '../sim/player.js';
import { CREATURES } from '../core/content.js';
import { SEA, heightAt } from '../sim/terrain.js';
import { camera, scene } from './scene.js';
import { sunHeight } from './sky.js';

const SCHOOLS = 3, PER_SCHOOL = 6, COUNT = SCHOOLS * PER_SCHOOL, REACH = 26, GONE = 36, NEAREST = 8, TRIES = 4, MIN_DEPTH = 2;
const CRUISE = 1.1, DART = 4.5, SPOOK = 4, SPREAD = 1.3, WIGGLE = 9, SEEN_FROM = 12, LOOK_EVERY = 1, DIM_NIGHT = 0.35;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.13, 0.07), new THREE.MeshBasicMaterial({ toneMapped: false }), COUNT);
mesh.frustumCulled = false;
mesh.count = COUNT;
scene.add(mesh);
const silver = new THREE.Color(CREATURES.fish.body), pale = new THREE.Color(CREATURES.fish.head), tint = new THREE.Color();
for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, tint.copy(silver).lerp(pale, (i % PER_SCHOOL) / PER_SCHOOL));
const offsets = Array.from({ length: COUNT }, () => [Math.random() * 2 - 1, Math.random() - 0.5, Math.random() * 2 - 1].map(v => v * SPREAD));
const schools = Array.from({ length: SCHOOLS }, () => ({ here: false, x: 0, y: 0, z: 0, yaw: 0, turn: 0, clock: Math.random() * 6 }));
const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), spot = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), flat = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);
let lookT = 0;

const swimmable = (x, y, z) => getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === WATER;
function settle(s) {
  for (let i = 0; i < TRIES; i++) {
    const a = Math.random() * 6.28, r = NEAREST + Math.random() * (REACH - NEAREST), x = Math.floor(camera.position.x + Math.cos(a) * r), z = Math.floor(camera.position.z + Math.sin(a) * r);
    if (SEA - heightAt(x, z) < MIN_DEPTH) continue;
    const y = SEA - Math.floor(Math.random() * Math.min(5, SEA - heightAt(x, z)));
    if (!swimmable(x, y, z)) continue;
    Object.assign(s, { here: true, x: x + 0.5, y: y + 0.5, z: z + 0.5, yaw: a, turn: 0 });
    return;
  }
}
function swim(s, dt) {
  const dx = s.x - camera.position.x, dz = s.z - camera.position.z, near = Math.hypot(dx, dz, s.y - camera.position.y), scared = near < SPOOK;
  if (near > GONE) { s.here = false; return; }
  s.turn -= dt; s.clock += dt;
  if (s.turn <= 0) { s.turn = 1 + Math.random() * 2; s.want = s.yaw + (Math.random() - 0.5) * 1.6; }
  if (scared) s.want = Math.atan2(dz, dx);
  s.yaw += ((s.want ?? s.yaw) - s.yaw) * Math.min(1, dt * (scared ? 8 : 1.5));
  const speed = scared ? DART : CRUISE, nx = s.x + Math.cos(s.yaw) * speed * dt, nz = s.z + Math.sin(s.yaw) * speed * dt;
  if (swimmable(nx + Math.cos(s.yaw), s.y, nz + Math.sin(s.yaw))) { s.x = nx; s.z = nz; } else { s.yaw += Math.PI; s.want = s.yaw; }
}
function place(s, first) {
  for (let i = 0; i < PER_SCHOOL; i++) {
    const n = first + i, o = offsets[n];
    if (!s.here) { mesh.setMatrixAt(n, matrix.makeScale(0, 0, 0)); continue; }
    const wave = Math.sin(s.clock * 1.5 + n) * 0.2;
    spot.set(s.x + o[0], s.y + o[1] + wave * 0.5, s.z + o[2]);
    turn.setFromAxisAngle(UP, -s.yaw + Math.sin(s.clock * WIGGLE + n) * 0.25);
    mesh.setMatrixAt(n, matrix.compose(spot, turn, swimmable(spot.x, spot.y, spot.z) ? flat : none)); // a fish that would poke out of the water is not drawn
  }
}
export function updateFish(dt) {
  const brightness = DIM_NIGHT + (1 - DIM_NIGHT) * Math.min(1, Math.max(0, sunHeight() + 0.2));
  mesh.material.color.setScalar(brightness);
  lookT -= dt;
  schools.forEach((s, i) => {
    if (s.here) swim(s, dt); else settle(s);
    place(s, i * PER_SCHOOL);
    if (lookT <= 0 && s.here && Math.hypot(s.x - camera.position.x, s.z - camera.position.z) < SEEN_FROM && inView(s.x, s.y, s.z)) spotted('fish', CREATURES.fish.label);
  });
  if (lookT <= 0) lookT = LOOK_EVERY;
  mesh.instanceMatrix.needsUpdate = true;
}

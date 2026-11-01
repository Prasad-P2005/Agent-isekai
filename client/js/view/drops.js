// What lies on the ground, as Minecraft draws it: a block is a real small block in its true shape, an item is its drawing pushed out into a slab, and both turn slowly and
// bob. A stack shows as a little heap of up to five, as Minecraft's do. Each kind of thing is one instanced mesh, so a hundred of them cost a draw call per kind.
// They use the same lights as bodies, so they follow the sun in both looks, and each is dimmed by how sheltered the spot it lies on is. What lies near the hero has a small
// blocky shadow, as it does in Minecraft, all of them one draw call.
import * as THREE from 'three';
import { ITEMS } from '../core/content.js';
import { on } from '../core/events.js';
import { drops } from '../sim/drops.js';
import { lampLight, skyLight } from '../sim/light.js';
import { player } from '../sim/player.js';
import { geometryOf, itemModel, textureOf } from './itemmesh.js';
import { late, scene } from './scene.js';
import { LIFT } from './voxel.js';

const BLOCK_SIZE = 0.25, FLAT_SIZE = 0.5, TURN = 1, BOB_RATE = 2, BOB = 0.1, DRAW_WITHIN = 72, LIGHT_EVERY = 0.3, DARKEST = 0.22, FIRST_ROOM = 8;
const HEAP = [[0, 0, 0], [0.35, 0.3, -0.3], [-0.3, 0.6, 0.35], [0.3, 0.9, 0.3], [-0.35, 1.2, -0.3]];
const copiesOf = n => (n <= 1 ? 1 : n <= 16 ? 2 : n <= 32 ? 3 : n <= 48 ? 4 : 5); // Minecraft's own steps
const FLY_TIME = 0.15, HERO_CHEST = 1;
const SHADOWS = 64, SHADOW_WITHIN = 28, SHADOW_SIZE = 0.5, SHADOW_LIFT = 0.015, SHADOW_DARK = 130, SHADOW_PIXELS = 8;

const batches = new Map(), matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), spot = new THREE.Vector3(), size = new THREE.Vector3(), tint = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
function shadowTexture() {
  const N = SHADOW_PIXELS, px = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px[(x + y * N) * 4 + 3] = Math.max(0, Math.round(SHADOW_DARK * (1 - (Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2)) ** 2)));
  const t = new THREE.DataTexture(px, N, N);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
const shadows = late(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), SHADOWS));
shadows.frustumCulled = false; shadows.count = 0; shadows.visible = false;
scene.add(shadows);
const FLAT = new THREE.Quaternion();
function newMesh(b, room) {
  const mesh = new THREE.InstancedMesh(b.geometry, b.material, room);
  mesh.setColorAt(0, tint.setScalar(1));
  mesh.frustumCulled = false; mesh.count = 0;
  if (b.see) late(mesh);
  scene.add(mesh);
  return mesh;
}
function batchOf(it) {
  const { key, model: m } = itemModel(it);
  let b = batches.get(key);
  if (b) return b;
  // Blocks lose the shading the hand bakes in, because here the real lights do that job as they turn.
  const geometry = geometryOf(m.pixels ? { ...m, shade: m.shade.map(() => 1) } : m);
  geometry.translate(-0.5, -0.5, -0.5);
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, color: LIFT, map: m.pixels ? textureOf(m) : null, alphaTest: m.cutout ? 0.5 : 0, transparent: !!m.glass, side: m.pixels && !m.cutout ? THREE.FrontSide : THREE.DoubleSide });
  b = { geometry, material, see: !!m.glass, glow: !!m.glow, size: m.pixels ? BLOCK_SIZE : FLAT_SIZE, n: 0, room: FIRST_ROOM, mesh: null };
  b.mesh = newMesh(b, b.room);
  batches.set(key, b);
  return b;
}
function makeRoom(b, need) {
  if (need <= b.room) return;
  const old = b.mesh, room = b.room * 2, mesh = newMesh(b, room);
  mesh.instanceMatrix.array.set(old.instanceMatrix.array);
  mesh.instanceColor.array.set(old.instanceColor.array);
  mesh.count = old.count;
  scene.remove(old);
  old.dispose();
  b.mesh = mesh; b.room = room;
}
function put(b, x, y, z, yaw, scale, lit) {
  makeRoom(b, b.n + 1);
  turn.setFromAxisAngle(UP, yaw);
  b.mesh.setMatrixAt(b.n, matrix.compose(spot.set(x, y, z), turn, size.setScalar(scale)));
  b.mesh.setColorAt(b.n, tint.setScalar(lit));
  b.n++;
}
function lightAt(d, b) {
  if (b.glow) return 1;
  const x = Math.floor(d.pos.x), y = Math.floor(d.pos.y + 0.2), z = Math.floor(d.pos.z);
  return Math.max(skyLight(x, y, z) / 15, lampLight(x, y, z) / 15, DARKEST);
}
let clock = 0, lightT = 0;
const flying = [];
on('drop:taken', ({ id, x, y, z }) => flying.push({ id, x, y, z, age: 0 }));
export function syncDrops(dt, blend) {
  clock += dt;
  lightT -= dt;
  const looking = lightT <= 0;
  if (looking) lightT = LIGHT_EVERY;
  for (const b of batches.values()) b.n = 0;
  let shaded = 0;
  for (const d of drops) {
    const far = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z);
    if (far > DRAW_WITHIN) continue;
    const b = batchOf(ITEMS[d.id]);
    if (looking || d.lit < 0) d.lit = lightAt(d, b);
    const x = d.last.x + (d.pos.x - d.last.x) * blend, y = d.last.y + (d.pos.y - d.last.y) * blend, z = d.last.z + (d.pos.z - d.last.z) * blend;
    if (d.rest && far < SHADOW_WITHIN && shaded < SHADOWS) shadows.setMatrixAt(shaded++, matrix.compose(spot.set(x, y + SHADOW_LIFT, z), FLAT, size.setScalar(SHADOW_SIZE)));
    const yaw = clock * TURN + d.seed, c = Math.cos(yaw), s = Math.sin(yaw), base = y + b.size / 2 + (Math.sin(clock * BOB_RATE + d.seed) + 1) * BOB * 0.5 + 0.02;
    for (let i = copiesOf(d.n) - 1; i >= 0; i--) {
      const [ox, oy, oz] = HEAP[i], gap = b.size * 0.35;
      put(b, x + (ox * c + oz * s) * gap, base + oy * gap, z + (oz * c - ox * s) * gap, yaw, b.size, d.lit);
    }
  }
  // Taken: it flies the last bit into the hero, which is only for the eye, since the bag already has it.
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.age += dt;
    if (f.age >= FLY_TIME) { flying.splice(i, 1); continue; }
    const t = f.age / FLY_TIME, p = player.pos, b = batchOf(ITEMS[f.id]);
    put(b, f.x + (p.x - f.x) * t, f.y + (p.y + HERO_CHEST - f.y) * t, f.z + (p.z - f.z) * t, clock, b.size, 1);
  }
  shadows.count = shaded;
  shadows.visible = shaded > 0;
  shadows.instanceMatrix.needsUpdate = true;
  for (const b of batches.values()) {
    b.mesh.count = b.n;
    b.mesh.visible = b.n > 0;
    if (!b.n) continue;
    b.mesh.instanceMatrix.needsUpdate = true;
    b.mesh.instanceColor.needsUpdate = true;
  }
}

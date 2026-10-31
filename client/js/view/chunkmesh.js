// Chunks on screen. Workers turn blocks into faces (view/mesher.js); this sends them the work, puts what comes back into the scene, and chooses each frame what is worth
// drawing. Most of a world is not, and view/culling.js works out which sections the eye can reach. Whatever is left is handed over as a plain list, so a frame costs what can
// be seen rather than what is loaded.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { LIGHT_REACH, RD, chunks, neighboursLoaded } from '../sim/chunks.js';
import { CS, H, columnsOf, chunkKey as key } from '../sim/terrain.js';
import { SECTION, boxInView, sectionsOf, sidePlanes, walkSight } from './culling.js';
import { gather, meshTables } from './meshtables.js';
import { CUTOUT_LAYER, meshVolume, setTables, volumeSize } from './mesher.js';
import { cutoutMat, glassMat, shadowCutoutMat, shadowSolidMat, solidMat, waterMat } from './materials.js';
import { LATE_LAYER, renderer, scene } from './scene.js';
import { MESHERS, startPool } from './workers.js';
import { settings } from '../core/settings.js';

const shown = new Map(); // chunk key -> what is drawn for it
let queue = [], lastX = null, lastZ = null, lastRD = 0, lastSize = -1, stale = true;

// ---------- sending the work out ----------
const VOLUME = volumeSize(CS, H, LIGHT_REACH), IN_HAND = MESHERS * 2;
const spare = []; // volumes come back with the answer
const takeVolume = () => spare.pop() ?? new Uint8Array(VOLUME);
let pool = null;
function meshersFailed() {
  pool = null;
  for (const c of chunks.values()) if (c.meshing) { c.meshing = 0; c.dirty = true; }
  stale = true;
}
function sendTables() {
  const t = meshTables();
  setTables(t);
  pool?.tell({ tables: t });
}
pool = startPool(new URL('./mesher.worker.js', import.meta.url), MESHERS, landMesh, meshersFailed);
sendTables();

let stamps = 0;
function send(k, ch) {
  const volume = takeVolume(), height = gather(ch, volume), { grass, leaves } = columnsOf(ch.cx, ch.cz), stamp = ++stamps;
  ch.dirty = false; ch.meshing = stamp;
  const job = { key: k, stamp, volume, height, cx: ch.cx, cz: ch.cz, grass: grass.slice(), leaves: leaves.slice() };
  if (pool) pool.give(job, [volume.buffer, job.grass.buffer, job.leaves.buffer]);
  else { landMesh({ key: k, stamp, volume, ...meshVolume(job) }); }
}

// ---------- what comes back ----------
// Quads all have the same six indices, so one list serves every mesh. It only ever grows, and a mesh keeps the one it was given.
let quadIndex = null;
function indexFor(quads) {
  if (quadIndex && quadIndex.count >= quads * 6) return quadIndex;
  const n = Math.max(1 << 16, Math.ceil(quads * 1.5)), ix = new Uint32Array(n * 6);
  for (let q = 0, i = 0, v = 0; q < n; q++, i += 6, v += 4) { ix[i] = v; ix[i + 1] = v + 1; ix[i + 2] = v + 2; ix[i + 3] = v; ix[i + 4] = v + 2; ix[i + 5] = v + 3; }
  return (quadIndex = new THREE.BufferAttribute(ix, 1));
}
const forget = function () { this.array = null; }; // once it is on the card there is no use keeping a copy of it here
const MATERIALS = [solidMat, cutoutMat, glassMat, waterMat], SHADOW_MATERIALS = [shadowSolidMat, shadowCutoutMat];
const ORDER = [0, 0, 2, 1]; // water goes before glass, so that a window over the sea blends onto it
function geometryOf(part) {
  const g = new THREE.BufferGeometry(), place = new THREE.InterleavedBuffer(part.cell, 6).onUpload(forget), look = new THREE.InterleavedBuffer(part.info, 12).onUpload(forget);
  g.setAttribute('cell', new THREE.InterleavedBufferAttribute(place, 4, 0));
  g.setAttribute('uvs', new THREE.InterleavedBufferAttribute(place, 2, 4));
  g.setAttribute('lit', new THREE.InterleavedBufferAttribute(look, 4, 0, true));
  g.setAttribute('lamp', new THREE.InterleavedBufferAttribute(look, 4, 4, true));
  g.setAttribute('tint', new THREE.InterleavedBufferAttribute(look, 4, 8, true));
  g.setIndex(indexFor(part.quads));
  g.setDrawRange(0, part.quads * 6);
  // three sorts by this. It is worked out here, because there is no `position` for it to read.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, (part.low + part.high) / 2, CS / 2), Math.hypot(CS * 0.71, (part.high - part.low) / 2 + 1));
  return g;
}
function meshOf(geometry, material, bx, bz, order) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(bx, 0, bz);
  m.updateMatrix(); m.matrixWorld.copy(m.matrix);
  m.matrixAutoUpdate = false; m.matrixWorldNeedsUpdate = false; m.frustumCulled = false; m.renderOrder = order;
  if (order) m.layers.set(LATE_LAYER);
  return m;
}
function dropGeometry(g) {
  g.index = null; // the list is shared, and disposing a geometry would delete it
  g.dispose();
}
function hide(k) {
  const c = shown.get(k);
  if (!c) return;
  for (const p of [...c.parts, ...c.deep]) dropGeometry(p.mesh.geometry);
  shown.delete(k);
}
function build(parts, bx, bz) {
  return parts.map(part => {
    const geometry = geometryOf(part), mesh = meshOf(geometry, MATERIALS[part.layer], bx, bz, ORDER[part.layer]);
    return { mesh, low: part.low, high: part.high + 1, sections: sectionsOf(part.low, part.high), shadow: part.layer <= CUTOUT_LAYER ? meshOf(geometry, SHADOW_MATERIALS[part.layer], bx, bz, 0) : null };
  });
}
// New meshes are uploaded a few at a time, or a burst of them would hitch the frame they arrive on.
const arrived = [], UPLOADS_A_FRAME = 6;
function landMesh(data) {
  spare.push(data.volume);
  arrived.push(data);
}
function publish(data) {
  const ch = chunks.get(data.key);
  if (!ch || ch.meshing !== data.stamp) return; // gone, or changed again and meshed again
  ch.meshing = 0;
  if (ch.dirty) stale = true; // changed while it was out
  const bx = ch.cx * CS, bz = ch.cz * CS;
  hide(data.key);
  shown.set(data.key, { cx: ch.cx, cz: ch.cz, x: bx + CS / 2, z: bz + CS / 2, links: data.links, at: -1, parts: build(data.upper, bx, bz), deep: build(data.deep, bx, bz) });
}
on('chunk:unloaded', hide);
export const chunkShown = (x, z) => shown.has(key(Math.floor(x / CS), Math.floor(z / CS)));

// ---------- what is missing ----------
on('chunk:edited', () => { stale = true; });
export function remeshAll() {
  sendTables();
  for (const c of chunks.values()) c.dirty = true;
  stale = true;
}
on('settings:changed', moved => { if (moved.includes('leaves') || moved.includes('smoothLight')) remeshAll(); });
// A lost graphics context takes every mesh with it, and the copies here were let go after upload, so they are made again.
renderer.domElement.addEventListener('webglcontextrestored', () => { shown.clear(); remeshAll(); });
function survey(pcx, pcz, dirX, dirZ) {
  const reach = (RD + 0.8) ** 2, list = [];
  for (let dx = -RD - 1; dx <= RD + 1; dx++) for (let dz = -RD - 1; dz <= RD + 1; dz++) {
    const d = dx * dx + dz * dz;
    if (d > reach) continue;
    const k = key(pcx + dx, pcz + dz), ch = chunks.get(k);
    if (!ch || ch.meshing || !(ch.dirty || !shown.has(k))) continue;
    const ahead = dx * dirX + dz * dirZ;
    list.push([ch.dirty && shown.has(k) ? -1 : ahead < 0 ? d * 2.5 : d, k, ch]); // what you are looking at comes first
  }
  queue = list.sort((a, b) => b[0] - a[0]);
}
// Sends off what is missing or changed, nearest first, until the deadline. Changed chunks go first.
export function meshChunks(px, pz, deadline, dirX = 0, dirZ = 0) {
  const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
  for (let done = 0; arrived.length && done < UPLOADS_A_FRAME; done++) publish(arrived.shift());
  if (stale || pcx !== lastX || pcz !== lastZ || RD !== lastRD || chunks.size !== lastSize) {
    survey(pcx, pcz, dirX, dirZ);
    lastX = pcx; lastZ = pcz; lastRD = RD; lastSize = chunks.size; stale = false;
  }
  let sent = 0;
  while (queue.length && (!sent || performance.now() < deadline) && (!pool || pool.busy < IN_HAND)) {
    const [, k, ch] = queue.pop();
    if (chunks.get(k) !== ch || !neighboursLoaded(ch.cx, ch.cz) || ch.meshing) continue;
    send(k, ch);
    sent++;
  }
  // Chunks whose neighbours were not there yet stay off the list until the next arrival, which is what puts them back on it.
}

// ---------- what is worth drawing ----------
export const worldGroup = new THREE.Group();
export const shadowGroup = new THREE.Group();
worldGroup.matrixAutoUpdate = shadowGroup.matrixAutoUpdate = false;
scene.add(worldGroup);
export const shadowScene = new THREE.Scene();
shadowScene.add(shadowGroup);

const ROWS = H / SECTION, EDGE = CS / 2, SWAYS = 1, grid = [], planes = new Float64Array(16), clip = new THREE.Matrix4(), visible = [];
let seen = new Uint16Array(0);
export const drawn = { chunks: 0, meshes: 0, loaded: 0 };
// `limit` is how far anything can be seen.
export function cullChunks(camera, limit) {
  const { x: px, y: py, z: pz } = camera.position, reach = RD + 1, across = reach * 2 + 1, cx = Math.floor(px / CS), cz = Math.floor(pz / CS);
  sidePlanes(clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements, planes);
  if (seen.length < across * across) seen = new Uint16Array(across * across);
  grid.length = across * across;
  grid.fill(null);
  for (const c of shown.values()) {
    const ix = c.cx - cx + reach, iz = c.cz - cz + reach;
    c.at = ix >= 0 && ix < across && iz >= 0 && iz < across ? ix + iz * across : -1;
    if (c.at >= 0) grid[c.at] = c.links;
  }
  walkSight(grid, reach, ROWS, px, py, pz, planes, limit, seen);
  visible.length = 0;
  let chunksDrawn = 0;
  for (const c of shown.values()) {
    const reached = c.at < 0 ? 0 : seen[c.at];
    if (!reached) continue;
    const x0 = c.x - EDGE - SWAYS, x1 = c.x + EDGE + SWAYS, z0 = c.z - EDGE - SWAYS, z1 = c.z + EDGE + SWAYS, before = visible.length;
    for (const p of c.parts) if (reached & p.sections && boxInView(planes, x0, p.low, z0, x1, p.high, z1)) visible.push(p.mesh);
    for (const p of c.deep) if (reached & p.sections && boxInView(planes, x0, p.low, z0, x1, p.high, z1)) visible.push(p.mesh);
    if (visible.length > before) chunksDrawn++;
  }
  worldGroup.children = visible;
  drawn.chunks = chunksDrawn; drawn.meshes = visible.length; drawn.loaded = shown.size;
}
// What throws a shadow into a square of the sun's view. Chunks behind a ridge still count: their shadows may fall on this side of it.
export function listCasters(list, centre, right, up, half) {
  list.length = 0;
  for (const c of shown.values()) {
    const dx = c.x - centre.x, dz = c.z - centre.z;
    for (const p of c.parts) {
      if (!p.shadow) continue;
      const y = (p.low + p.high) / 2 - centre.y, spread = (p.high - p.low) / 2 + CS * 0.71;
      if (Math.abs(dx * right.x + y * right.y + dz * right.z) < half + spread && Math.abs(dx * up.x + y * up.y + dz * up.z) < half + spread) list.push(p.shadow);
    }
  }
  return list;
}

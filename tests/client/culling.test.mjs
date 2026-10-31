// Culling may draw too much, but it must never hide what can be seen. So these do not only try a few cases: they cast sight lines through real terrain from real places, the
// way the screen would, and fail if a line reaches anything the culling threw away. The rest pin down the rules it is built on, which come from Tommo's "advanced cave culling".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../client/vendor/three.module.js';
import { BL, ID, OPAQUE, WATER } from '../../client/js/sim/blocks.js';
import { LIGHT_REACH, chunks, getBlock } from '../../client/js/sim/chunks.js';
import { initNoise } from '../../client/js/sim/noise.js';
import { B, CS, H, LAND, SEA, chunkKey, columnsOf, genChunk, heightAt, landOf, setWorldData, topOf } from '../../client/js/sim/terrain.js';
import { ALL_FACES, SECTION, boxInView, linkSection, sectionsOf, sidePlanes, walkSight } from '../../client/js/view/culling.js';
import { gather, meshTables } from '../../client/js/view/meshtables.js';
import { CUTOUT_LAYER, SOLID_LAYER, WATER_LAYER, meshVolume, setTables, volumeSize } from '../../client/js/view/mesher.js';

const world = JSON.parse(readFileSync(new URL('./world.json', import.meta.url)));
const ROWS = H / SECTION, REACH = 5, ACROSS = REACH * 2 + 1, LIMIT = (REACH - 1) * CS, UP = 2, CROSS = 6;
const OPEN = () => new Uint8Array(ROWS * 6).fill(ALL_FACES), SHUT = () => new Uint8Array(ROWS * 6);
const everywhere = () => { const p = new Float64Array(16); for (let i = 3; i < 16; i += 4) p[i] = 1; return p; }; // nothing is ever out of this view
let seed = 1;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// ---------- which faces reach which ----------
const size = SECTION, cells = () => new Uint8Array(size ** 3), at = (x, y, z) => x + z * size + y * size * size, opaque = Uint8Array.from({ length: 256 }, (_, id) => (id === 1 ? 1 : 0));
const linksOf = vol => { const out = new Uint8Array(6); linkSection(vol, opaque, 0, 1, size * size, size, out, 0); return out; };
const fill = (vol, id) => vol.fill(id);
const reaches = (links, a, b) => (links[a] & (1 << b)) !== 0;

test('an empty section joins every face to every other', () => {
  const links = linksOf(cells());
  for (let a = 0; a < 6; a++) assert.equal(links[a], ALL_FACES);
});
test('a solid section joins nothing', () => {
  const vol = cells(); fill(vol, 1);
  assert.deepEqual([...linksOf(vol)], [0, 0, 0, 0, 0, 0]);
});
test('a straight tunnel joins its two ends and nothing else', () => {
  const vol = cells(); fill(vol, 1);
  for (let x = 0; x < size; x++) vol[at(x, 8, 8)] = 0;
  const links = linksOf(vol);
  assert.ok(reaches(links, 0, 1) && reaches(links, 1, 0));
  for (const other of [2, 3, 4, 5]) assert.ok(!reaches(links, 0, other));
});
test('a wall with no gap keeps its two sides apart', () => {
  const vol = cells();
  for (let y = 0; y < size; y++) for (let z = 0; z < size; z++) vol[at(8, y, z)] = 1;
  const links = linksOf(vol);
  assert.ok(!reaches(links, 0, 1) && reaches(links, 0, 2) && reaches(links, 1, 2));
  vol[at(8, 8, 8)] = 0; // one gap is all it takes
  assert.ok(reaches(linksOf(vol), 0, 1));
});
test('two separate rooms in one section do not join each other', () => {
  const vol = cells(); fill(vol, 1);
  for (let x = 0; x < 4; x++) vol[at(x, 2, 2)] = 0; // from the -x face to a dead end
  for (let z = 15; z > 11; z--) vol[at(14, 2, z)] = 0; // from the +z face to a dead end
  const links = linksOf(vol);
  assert.ok(!reaches(links, 1, 4));
});

// ---------- the walk ----------
// A small world in a flat grid of columns, built from which faces each section joins.
function board(shape) {
  const grid = Array.from({ length: ACROSS * ACROSS }, () => OPEN()), put = (dx, dz, row, links) => { grid[dx + REACH + (dz + REACH) * ACROSS].set(links, row * 6); };
  shape(put);
  return grid;
}
const EYE = { x: 8.5, y: 8.5, z: 8.5 }, wall = [0, 0, 0, 0, 0, 0];
const walk = (grid, planes = everywhere(), limit = 1e6) => {
  const seen = new Uint16Array(ACROSS * ACROSS);
  walkSight(grid, REACH, ROWS, EYE.x, EYE.y, EYE.z, planes, limit, seen);
  return (dx, dz, row) => (seen[dx + REACH + (dz + REACH) * ACROSS] >> row & 1) === 1;
};
const shutAround = put => { for (let dx = -REACH; dx <= REACH; dx++) for (let dz = -REACH; dz <= REACH; dz++) for (let row = 0; row < ROWS; row++) put(dx, dz, row, wall); };
const link = (...pairs) => { const l = [0, 0, 0, 0, 0, 0]; for (const [a, b] of pairs) { l[a] |= 1 << b; l[b] |= 1 << a; } return l; };

test('a wall is seen, and what is behind it is not', () => {
  const seenAt = walk(board(put => { shutAround(put); put(1, 0, 0, link([0, 1])); put(2, 0, 0, wall); }));
  assert.ok(seenAt(1, 0, 0) && seenAt(2, 0, 0));
  assert.ok(!seenAt(3, 0, 0));
});
test('the eye sees out of its own section in every direction', () => {
  const seenAt = walk(board(() => {}));
  for (const [dx, dz, row] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]]) assert.ok(seenAt(dx, dz, row));
});
test('the walk never turns back along an axis, because a line of sight cannot', () => {
  // A passage east, north, then back west: joined all the way, but no straight line can follow it.
  const seenAt = walk(board(put => {
    shutAround(put);
    put(1, 0, 0, link([1, 4]));
    put(1, 1, 0, link([5, 1]));
    put(0, 1, 0, link([0, 1]));
    put(-1, 1, 0, link([0, 1]));
  }));
  assert.ok(seenAt(1, 1, 0), 'the first turn is a line a sight line can take');
  assert.ok(!seenAt(0, 1, 0) || !seenAt(-1, 1, 0), 'back west it is not');
});
test('a section is walked again for each new face it is entered by', () => {
  // A section with two channels. The walk reaches it first by the one with no way on, and only the other leads to what is behind. Visiting it once would hide that.
  const seenAt = walk(board(put => {
    shutAround(put);
    put(1, 0, 0, link([1, 4])); // from the eye, then south
    put(0, 1, 0, link([5, 0])); // south from the eye, then east
    put(1, 1, 0, [0, 0, 0, 0, 1 << 5, 0].map((v, i) => (i === 5 ? 1 << 4 : i === 1 ? 1 << 0 : i === 0 ? 1 << 1 : v))); // north to south, west to east, kept apart
    put(2, 1, 0, link([1, 0]));
    put(1, 2, 0, link([5, 4]));
  }));
  assert.ok(seenAt(2, 1, 0), 'east out of the far section');
  assert.ok(seenAt(1, 2, 0), 'south out of the far section');
});
test('a column nothing is known about counts as open', () => {
  const grid = board(shutAround), middle = REACH + REACH * ACROSS;
  grid[middle] = OPEN(); grid[middle + 1] = null; grid[middle + 2] = OPEN();
  const seenAt = walk(grid);
  assert.ok(seenAt(1, 0, 0) && seenAt(2, 0, 0));
});
test('nothing past the limit is walked', () => {
  const seenAt = walk(board(() => {}), everywhere(), 40);
  assert.ok(seenAt(2, 0, 0));
  assert.ok(!seenAt(5, 0, 0));
});
test('sections out of view are not walked', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 900);
  camera.position.set(EYE.x, EYE.y, EYE.z); camera.rotation.set(0, -Math.PI / 2, 0); camera.updateMatrixWorld(); // looking along +x
  const planes = sidePlanes(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements, new Float64Array(16)), seenAt = walk(board(() => {}), planes);
  assert.ok(seenAt(3, 0, 0));
  assert.ok(!seenAt(-3, 0, 0));
});
test('a mesh knows every section it touches', () => {
  assert.equal(sectionsOf(0, 15), 0b1);
  assert.equal(sectionsOf(15, 16), 0b11);
  assert.equal(sectionsOf(40, 70), 0b11100);
});

// ---------- the view ----------
const cameraAt = (x, y, z, yaw, pitch) => {
  const c = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 900);
  c.rotation.order = 'YXZ'; c.position.set(x, y, z); c.rotation.set(pitch, yaw, 0); c.updateMatrixWorld();
  return c;
};
const clipOf = camera => new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
test('the planes agree with the projection itself', () => {
  for (let i = 0; i < 300; i++) {
    const camera = cameraAt(random() * 100, random() * 100, random() * 100, random() * 6, random() - 0.5), clip = clipOf(camera), planes = sidePlanes(clip.elements, new Float64Array(16));
    for (let j = 0; j < 20; j++) {
      const p = new THREE.Vector3(random() * 200 - 50, random() * 200 - 50, random() * 200 - 50), c = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(clip);
      const inside = Math.abs(c.x) <= c.w && Math.abs(c.y) <= c.w, planesSay = boxInView(planes, p.x, p.y, p.z, p.x, p.y, p.z);
      assert.equal(planesSay, inside);
    }
  }
});
test('a box with any point in view is never rejected', () => {
  for (let i = 0; i < 2000; i++) {
    const camera = cameraAt(0, 0, 0, random() * 6, random() - 0.5), clip = clipOf(camera), planes = sidePlanes(clip.elements, new Float64Array(16));
    const x = random() * 120 - 60, y = random() * 120 - 60, z = random() * 120 - 60, s = 1 + random() * 16;
    if (boxInView(planes, x, y, z, x + s, y + s, z + s)) continue;
    for (let j = 0; j < 40; j++) {
      const c = new THREE.Vector4(x + random() * s, y + random() * s, z + random() * s, 1).applyMatrix4(clip);
      assert.ok(!(Math.abs(c.x) <= c.w && Math.abs(c.y) <= c.w), 'rejected a box with a point in view');
    }
  }
});

// ---------- real terrain ----------
initNoise(world.seed); setWorldData(world);
setTables(meshTables());
const volume = new Uint8Array(volumeSize(CS, H, LIGHT_REACH)), meshed = new Map();
function load(cx, cz) {
  const k = chunkKey(cx, cz);
  if (chunks.has(k)) return;
  const d = genChunk(cx, cz);
  chunks.set(k, { cx, cz, d, top: topOf(d), lamps: null, dirty: false });
}
function meshOf(cx, cz) {
  const k = chunkKey(cx, cz);
  if (!meshed.has(k)) meshed.set(k, remesh(cx, cz));
  return meshed.get(k);
}
function remesh(cx, cz) {
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) load(cx + a, cz + b);
  const height = gather(chunks.get(chunkKey(cx, cz)), volume), { grass, leaves } = columnsOf(cx, cz);
  return meshVolume({ volume, height, cx, cz, grass, leaves });
}
function placeOf(kind) {
  const lands = world.lands.length;
  for (let z = 0; z < lands; z++) for (let x = 0; x < lands; x++) {
    const wx = (x + 0.5) * LAND, wz = (z + 0.5) * LAND, land = landOf(wx, wz);
    if (kind === 'town' ? land.settlement != null : land.b === kind && land.settlement == null) return [wx, wz];
  }
  return null;
}
const REGIONS = [['town', 'town'], ['mountains', B.PEAKS], ['sea', B.OCEAN], ['forest', B.ELF], ['fen', B.MIRE], ['wastes', B.DEMON]];
function eyesIn(wx, wz, count) {
  const eyes = [], around = () => [Math.floor(wx + (random() - 0.5) * CS * 4), Math.floor(wz + (random() - 0.5) * CS * 4)];
  for (let i = 0; i < count; i++) {
    const [x, z] = around(), h = heightAt(x, z);
    eyes.push(['on the ground', x + 0.5, h + 2.62, z + 0.5]);
    eyes.push(['in the air', x + 0.5, h + 30, z + 0.5]);
    eyes.push(['high up', x + 0.5, h + 70, z + 0.5]);
    if (h < SEA) eyes.push(['under water', x + 0.5, Math.min(SEA - 1, h + 2.5), z + 0.5]);
    const [ux, uz] = around();
    for (let y = heightAt(ux, uz) - 6; y > 6; y--) if (!OPAQUE[getBlock(ux, y, uz)]) { eyes.push(['in a cave', ux + 0.5, y + 0.5, uz + 0.5]); break; }
  }
  return eyes;
}
function sightOf(camera, limit) {
  const planes = sidePlanes(clipOf(camera).elements, new Float64Array(16)), { x, y, z } = camera.position, cx = Math.floor(x / CS), cz = Math.floor(z / CS), grid = new Array(ACROSS * ACROSS);
  for (let dz = -REACH; dz <= REACH; dz++) for (let dx = -REACH; dx <= REACH; dx++) grid[dx + REACH + (dz + REACH) * ACROSS] = meshOf(cx + dx, cz + dz).links;
  const seen = new Uint16Array(ACROSS * ACROSS);
  walkSight(grid, REACH, ROWS, x, y, z, planes, limit, seen);
  return { seen, planes, cx, cz };
}
// Along a line through the blocks, to the first one that stops it. Every section it passes through has something in it that the line could see.
function trace(o, d, max, visit) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z), t = 0;
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z), dx = Math.abs(1 / d.x), dy = Math.abs(1 / d.y), dz = Math.abs(1 / d.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * dx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * dy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * dz;
  while (t <= max && y >= 0 && y < H) {
    visit(x, y, z);
    if (OPAQUE[getBlock(x, y, z)]) return;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; } else if (ty < tz) { y += sy; t = ty; ty += dy; } else { z += sz; t = tz; tz += dz; }
  }
}
const totals = {};
for (const [name, kind] of REGIONS) {
  test(`every sight line in the ${name} ends somewhere that was drawn`, t => {
    const spot = placeOf(kind);
    if (!spot) return t.skip(`this world has no ${name}`);
    for (const [where, x, y, z] of eyesIn(spot[0], spot[1], 3)) {
      for (let view = 0; view < 3; view++) {
        const camera = cameraAt(x, y, z, random() * 6.283, (random() - 0.5) * 2.6), { seen, planes, cx, cz } = sightOf(camera, LIMIT);
        for (let ray = 0; ray < 1200; ray++) {
          const d = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, 0.5).unproject(camera).sub(camera.position).normalize();
          trace(camera.position, d, LIMIT, (bx, by, bz) => {
            const ix = Math.floor(bx / CS) - cx + REACH, iz = Math.floor(bz / CS) - cz + REACH, row = Math.floor(by / SECTION);
            assert.ok((seen[ix + iz * ACROSS] >> row & 1) === 1, `${where} at ${x} ${y} ${z}: the block at ${bx} ${by} ${bz} can be seen but was culled`);
          });
        }
        // How much the walk saves on top of the view alone.
        let inView = 0, walked = 0;
        for (let iz = 0; iz < ACROSS; iz++) for (let ix = 0; ix < ACROSS; ix++) for (let row = 0; row < ROWS; row++) {
          const x0 = (cx + ix - REACH) * CS, z0 = (cz + iz - REACH) * CS, y0 = row * SECTION;
          if (Math.hypot(x0 + 8 - x, z0 + 8 - z) > LIMIT + 12 || !boxInView(planes, x0 - 1, y0 - 1, z0 - 1, x0 + 17, y0 + 17, z0 + 17)) continue;
          inView++;
          if (seen[ix + iz * ACROSS] >> row & 1) walked++;
        }
        const tally = (totals[where] ??= { inView: 0, walked: 0 });
        tally.inView += inView; tally.walked += walked;
      }
    }
  });
}
test('from a cave the walk draws far less than the view alone would', t => {
  for (const [where, { inView, walked }] of Object.entries(totals)) t.diagnostic(`${where}: ${walked} of the ${inView} sections in view drawn (${Math.round(100 - 100 * walked / inView)}% saved)`);
  assert.ok(totals['in a cave'].walked < totals['in a cave'].inView * 0.75);
});

// ---------- faces ----------
const facesOf = part => {
  const out = [];
  for (let q = 0; q < part.quads; q++) {
    const corner = i => [part.cell[(q * 4 + i) * 6] / 64, part.cell[(q * 4 + i) * 6 + 1] / 64, part.cell[(q * 4 + i) * 6 + 2] / 64];
    out.push({ corners: [0, 1, 2, 3].map(corner), face: part.info[q * 4 * 12 + 11] & 7, sky: part.info[q * 4 * 12], wet: part.info[q * 4 * 12 + 7] });
  }
  return out;
};
const partsOf = ({ upper, deep }, layer) => [...upper, ...deep].filter(p => p.layer === layer).flatMap(facesOf);
const blockAt = (cx, cz, x, y, z) => chunks.get(chunkKey(cx + Math.floor(x / CS), cz + Math.floor(z / CS))).d[((x % CS) + CS) % CS + (((z % CS) + CS) % CS) * CS + y * CS * CS];
const simpleCube = id => id !== 0 && !BL[id].shape && !BL[id].transparent && !BL[id].cutout && id !== WATER;

for (const [name, kind] of REGIONS) {
  test(`in the ${name}, every open top is drawn exactly once and nothing is drawn inside rock`, t => {
    const spot = placeOf(kind);
    if (!spot) return t.skip(`this world has no ${name}`);
    const cx = Math.floor(spot[0] / CS), cz = Math.floor(spot[1] / CS), mesh = meshOf(cx, cz), count = new Map();
    for (const f of partsOf(mesh, SOLID_LAYER)) {
      if (f.face !== UP) continue;
      const xs = f.corners.map(c => c[0]), zs = f.corners.map(c => c[2]), y = f.corners[0][1] - 1;
      for (let x = Math.min(...xs); x < Math.max(...xs); x++) for (let z = Math.min(...zs); z < Math.max(...zs); z++) count.set(`${x},${y},${z}`, (count.get(`${x},${y},${z}`) ?? 0) + 1);
    }
    let wanted = 0;
    for (let y = 1; y < H - 1; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const id = blockAt(cx, cz, x, y, z), above = blockAt(cx, cz, x, y + 1, z), k = `${x},${y},${z}`, open = simpleCube(id) && !OPAQUE[above] && above !== id;
      if (open) { wanted++; assert.equal(count.get(k), 1, `the top of ${BL[id].name} at ${k} is drawn ${count.get(k) ?? 0} times`); }
      else if (simpleCube(id)) assert.equal(count.get(k), undefined, `a hidden top of ${BL[id].name} at ${k} was drawn`);
    }
    const quads = partsOf(mesh, SOLID_LAYER).filter(f => f.face === UP).length;
    t.diagnostic(`${wanted} open tops in ${quads} quads`);
  });
}

// ---------- water ----------
const edited = (cx, cz, changes) => {
  const ch = chunks.get(chunkKey(cx, cz)), was = changes.map(([x, y, z]) => ch.d[x + z * CS + y * CS * CS]);
  changes.forEach(([x, y, z, id]) => { ch.d[x + z * CS + y * CS * CS] = id; });
  const mesh = remesh(cx, cz);
  changes.forEach(([x, y, z], i) => { ch.d[x + z * CS + y * CS * CS] = was[i]; });
  return mesh;
};
function deepWaterSpot() {
  const [wx, wz] = placeOf(B.OCEAN), cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
  meshOf(cx, cz);
  for (let z = 4; z < 12; z++) for (let x = 4; x < 12; x++) if (heightAt(cx * CS + x, cz * CS + z) < SEA - 8 && blockAt(cx, cz, x, SEA - 3, z) === WATER) return { cx, cz, x, z, y: SEA - 3 };
  return null;
}
test('a plant in the sea leaves no hole in the water', () => {
  const { cx, cz, x, y, z } = deepWaterSpot();
  for (const id of [ID.Kelp, ID.SeaGrass]) {
    const sides = partsOf(edited(cx, cz, [[x, y, z, id]]), WATER_LAYER).filter(f => f.corners.every(c => c[1] < SEA - 1));
    assert.deepEqual(sides, [], `water walled itself off around ${BL[id].name}`);
  }
});
test('the plant is still drawn, and knows it is under water', () => {
  const { cx, cz, x, y, z } = deepWaterSpot(), plants = partsOf(edited(cx, cz, [[x, y, z, ID.Kelp]]), CUTOUT_LAYER).filter(f => f.face === CROSS);
  assert.ok(plants.some(f => f.wet > 0));
});
test('light reaches the sea bed, and the bed knows how deep it is', () => {
  const { cx, cz } = deepWaterSpot(), tops = partsOf(meshOf(cx, cz), SOLID_LAYER).filter(f => f.face === UP && f.wet > 0);
  assert.ok(tops.length > 0);
  assert.ok(Math.max(...tops.map(f => f.sky)) > 200, 'the sea bed went dark');
});
test('dry ground below the sea is not called wet', () => {
  const { cx, cz, x, z } = deepWaterSpot(), y = SEA - 3, changes = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let up = 0; up < SEA + 2 - y; up++) changes.push([x + dx, y + up, z + dz, 0]);
  const floor = partsOf(edited(cx, cz, changes), SOLID_LAYER).filter(f => f.corners.some(c => c[1] === y));
  assert.ok(floor.every(f => f.wet === 0));
});
test('a narrow trench has a floor and walls, and sees the sky', () => {
  const [wx, wz] = placeOf(B.KINGDOM) ?? placeOf(B.ELF), cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
  meshOf(cx, cz);
  const y = heightAt(cx * CS + 8, cz * CS + 8), changes = [];
  for (let x = 4; x < 12; x++) for (let up = 0; up < 3; up++) changes.push([x, y - up, 8, 0]);
  const faces = partsOf(edited(cx, cz, changes), SOLID_LAYER), floor = faces.filter(f => f.face === UP && f.corners[0][1] === y - 2 && f.corners.every(c => c[2] >= 8 && c[2] <= 9));
  assert.ok(floor.length > 0, 'the trench has no floor');
  assert.ok(floor.every(f => f.sky > 200), 'the sky does not reach the floor of the trench');
  for (const side of [4, 5]) assert.ok(faces.some(f => f.face === side && f.corners.every(c => c[1] <= y + 1 && c[1] >= y - 2)), 'a wall of the trench is missing');
});

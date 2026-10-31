// What the world does when it is touched: cracks in a block being mined, chips when it goes, dust, and splashes.
// All of it uses the fireball's cubes, so it adds no draw calls. Chips are 7 cubes a block (3 for a plant), a landing 5 and a splash 9.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { BL, solid } from '../sim/blocks.js';
import { getBlock } from '../sim/chunks.js';
import { aim, miningBar } from '../sim/mining.js';
import { player } from '../sim/player.js';
import { CRACK_STAGES, TILE, crackPixels } from './blocktex.js';
import { spray } from './fireball.js';
import { late, scene } from './scene.js';

const CHIPS = 7, PLANT_CHIPS = 3, PLACE_PUFF = 3, LANDING_DUST = 5, DUSTY_LANDING = 9, SPLASH = 9;
const WATER_SPRAY = { palette: [0xe8f6ff, 0xbfe4f4, 0x8cc8e0].map(c => new THREE.Color(c)), life: [0.3, 0.6], size: [0.08, 0.17], speed: [1.5, 4], spread: 0.5, drag: 1, lift: 0, fall: 15 };
const here = new THREE.Vector3(), up = new THREE.Vector3();

const painted = (colour, f = 1) => new THREE.Color().setRGB(colour[0] * f, colour[1] * f, colour[2] * f, THREE.SRGBColorSpace);
const chipKinds = new Map();
function chips(id) {
  if (!chipKinds.has(id)) {
    const b = BL[id];
    chipKinds.set(id, { palette: [painted(b.top, 1.08), painted(b.side), painted(b.side, 0.75)], life: [0.35, 0.75], size: [0.09, 0.18], speed: [1, 3.2], spread: 0.32, drag: 1.2, lift: 0.4, fall: 16 });
  }
  return chipKinds.get(id);
}
on('block:broken', ({ x, y, z, id }) => spray(chips(id), here.set(x + 0.5, y + 0.5, z + 0.5), BL[id].passable ? PLANT_CHIPS : CHIPS));
on('player:placed', () => { const t = aim.block; if (t) spray(chips(getBlock(t.x, t.y, t.z) || 1), here.set(t.x + 0.5 + t.n[0] * 0.6, t.y + 0.5 + t.n[1] * 0.6, t.z + 0.5 + t.n[2] * 0.6), PLACE_PUFF); });
on('player:landed', speed => {
  const { x, y, z } = player.pos, under = getBlock(Math.floor(x), Math.floor(y - 0.5), Math.floor(z));
  if (solid(under)) spray(chips(under), here.set(x, y + 0.1, z), speed > DUSTY_LANDING ? LANDING_DUST : 2, up.set(0, 1.5, 0));
});
on('player:splashed', ({ x, y, z, speed }) => spray(WATER_SPRAY, here.set(x, y + 0.5, z), SPLASH, up.set(0, 2 + Math.min(speed, 16) * 0.25, 0)));

// ---------- cracks ----------
const strip = new THREE.DataTexture(crackPixels(), TILE, TILE * CRACK_STAGES);
strip.magFilter = strip.minFilter = THREE.NearestFilter;
strip.repeat.set(1, 1 / CRACK_STAGES);
strip.needsUpdate = true;
const cracks = late(new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), new THREE.MeshBasicMaterial({ map: strip, transparent: true, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
cracks.visible = false;
scene.add(cracks);
export function syncCracks() {
  const t = aim.block;
  cracks.visible = !!t && miningBar.shown && miningBar.progress > 0;
  if (!cracks.visible) return;
  cracks.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  strip.offset.y = Math.min(CRACK_STAGES - 1, Math.floor(miningBar.progress * CRACK_STAGES)) / CRACK_STAGES;
}

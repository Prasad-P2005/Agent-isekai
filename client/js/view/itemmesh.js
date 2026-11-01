// Turning the models in view/held.js into three.js, for the two places that draw things as things: the hero's hand and the ground.
import * as THREE from 'three';
import { blockModel, heldFlat, spriteModel } from './held.js';

export const inDisplay = k => k ** 2.2; // a shade as painted, which the renderer will encode back to the same value
export function geometryOf(m) {
  const g = new THREE.BufferGeometry(), colour = m.colour ? m.colour.map(inDisplay) : m.shade.flatMap(k => Array(3).fill(inDisplay(k)));
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  if (m.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  g.setIndex(m.index);
  return g;
}
export function textureOf(m) {
  const t = new THREE.DataTexture(m.pixels, m.width, m.height);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
// An item's model: its drawing pushed out into a slab, or the true shape of the block it is. Each is made once, because a slab is a lot of faces.
const made = new Map();
export function itemModel(it) {
  const block = Number.isInteger(it.block) ? it.block : it.place?.[0], sprite = it.art && (block == null || heldFlat(block)), key = sprite ? `${it.art}/${it.pal}` : block;
  if (!made.has(key)) made.set(key, { key, model: sprite ? spriteModel(it.art, it.pal) : blockModel(block) });
  return made.get(key);
}

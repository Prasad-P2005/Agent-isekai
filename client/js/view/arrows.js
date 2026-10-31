// Arrows in flight. A thin stick that points where it is going: nothing the eye can linger on needs more.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { scene } from './scene.js';

const flying = new Map(), shape = new THREE.BoxGeometry(0.05, 0.05, 0.8), wood = new THREE.MeshBasicMaterial({ color: 0x9a7446 }), ahead = new THREE.Vector3();
on('projectile:spawned', pr => { if (!pr.arrow) return; const m = new THREE.Mesh(shape, wood); scene.add(m); flying.set(pr, m); });
on('projectile:removed', pr => { const m = flying.get(pr); if (m) { scene.remove(m); flying.delete(pr); } });
export function syncArrows() {
  for (const [pr, m] of flying) { m.position.set(pr.pos.x, pr.pos.y, pr.pos.z); m.lookAt(ahead.set(pr.pos.x + pr.vel.x, pr.pos.y + pr.vel.y, pr.pos.z + pr.vel.z)); }
}

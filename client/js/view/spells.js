// How the spells other than the fireball look. They share its cubes and glows, so that all the magic stays a single draw call.
// A nova is 24 cubes and 4 for each foe it catches, lightning about one cube per block and a half, a blink 14 and a ward 8.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { player } from '../sim/player.js';
import { HALO, RING, flare, shake, spray } from './fireball.js';
import { PALM, throwFire } from './hand.js';
import { camera } from './scene.js';

const steps = hexes => hexes.map(c => new THREE.Color(c));
const ICE = steps([0xfff4e6, 0xc8f0ff, 0x62d0ff, 0x1f8fe0, 0x0f5aa8]);
const ARC = steps([0xfff4e6, 0xd9c8ff, 0xb98af0, 0x6d42b8]);
const WARD = steps([0xc8f0ff, 0x62d0ff, 0x1f8fe0]);
const ICE_GLOW = 0x62d0ff, ARC_GLOW = 0xb98af0;

const FROST = { palette: ICE, life: [0.35, 0.6], size: [0.28, 0.5], speed: [0, 0.6], spread: 0.3, drag: 3, lift: 0, fall: 0 };
const ICE_SHARD = { palette: ICE, life: [0.3, 0.6], size: [0.14, 0.28], speed: [2, 6], spread: 0.4, drag: 4, lift: 0, fall: 6 };
const ARC_CUBE = { palette: ARC, life: [0.1, 0.2], size: [0.14, 0.26], speed: [0, 0.3], spread: 0.05, drag: 2, lift: 0, fall: 0 };
const ARC_SPARK = { palette: ARC, life: [0.15, 0.35], size: [0.1, 0.2], speed: [3, 9], spread: 0.2, drag: 4, lift: 0, fall: 0 };
const BLINK = { palette: ARC, life: [0.25, 0.5], size: [0.16, 0.34], speed: [1, 4], spread: 0.5, drag: 4, lift: 0.5, fall: 0 };
const SHIELD = { palette: WARD, life: [0.3, 0.55], size: [0.08, 0.16], speed: [1, 3], spread: 0.5, drag: 3, lift: 0.3, fall: 0 };

const FROST_RING = 24, RING_SPEED = 24, ARC_GAP = 1.5, ARC_JAG = 1.1;
const BODY_HEIGHT = 1, AHEAD = 1.6; // how far before the eye a ward's light shows
const point = new THREE.Vector3(), drift = new THREE.Vector3();

// Where a spell is drawn leaving the hand, as the fireball is.
const palm = () => new THREE.Vector3().copy(PALM).applyQuaternion(camera.quaternion).add(camera.position);
const ahead = () => point.set(0, 0, -AHEAD).applyQuaternion(camera.quaternion).add(camera.position);

on('frost:cast', ({ at, caught }) => {
  throwFire(ICE_GLOW);
  point.set(at.x, at.y + BODY_HEIGHT, at.z);
  for (let i = 0; i < FROST_RING; i++) {
    const a = i / FROST_RING * Math.PI * 2;
    spray(FROST, point, 1, drift.set(Math.cos(a) * RING_SPEED, 0, Math.sin(a) * RING_SPEED));
  }
  flare(HALO, 0xc8f0ff, ahead(), 0.35, 2, 5, 0.3);
  for (const e of caught) spray(ICE_SHARD, point.set(e.pos.x, e.pos.y + e.def.h / 2, e.pos.z), 4);
  shake(0.2);
});

// One cube at each step along the way, knocked out of line furthest in the middle, so that the bolt jags and hits true.
function arc(a, b) {
  const n = Math.max(2, Math.ceil(a.distanceTo(b) / ARC_GAP));
  for (let i = 0; i <= n; i++) {
    const t = i / n, jag = Math.sin(Math.PI * t) * ARC_JAG;
    point.set(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * jag, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * jag, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * jag);
    spray(ARC_CUBE, point, 1);
  }
}
on('lightning:cast', ({ points, struck }) => {
  throwFire(ARC_GLOW);
  let from = palm();
  flare(HALO, 0xd9c8ff, from, 0.8, 0.25, 1, 0.14);
  for (const to of points) {
    arc(from, to);
    if (struck) { flare(HALO, 0xd9c8ff, to, 0.9, 1, 3.5, 0.2); spray(ARC_SPARK, to, 3); }
    from = to;
  }
  shake(0.15);
});

function vanish(at) {
  point.set(at.x, at.y + BODY_HEIGHT, at.z);
  spray(BLINK, point, 7);
}
on('blink:cast', ({ from, to }) => {
  vanish(from); vanish(to);
  flare(HALO, 0xd9c8ff, ahead(), 0.4, 1.5, 4, 0.2);
});

on('ward:raised', () => {
  throwFire(ICE_GLOW);
  flare(RING, ICE_GLOW, ahead(), 0.6, 1, 3.5, 0.35);
  spray(SHIELD, point.set(player.pos.x, player.pos.y + BODY_HEIGHT, player.pos.z), 8);
});
on('ward:struck', () => flare(RING, ICE_GLOW, ahead(), 0.7, 1.2, 2.6, 0.22));
on('ward:broken', () => flare(HALO, 0x1f8fe0, ahead(), 0.3, 2, 4, 0.3));

// A ring on the ground says where it will land, for exactly as long as it has left to fall.
on('meteor:called', ({ at, fall }) => {
  throwFire();
  flare(RING, 0xffb04a, at, 0.7, 7, 9, fall);
});

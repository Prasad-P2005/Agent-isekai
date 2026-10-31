// The hero in the bag: a small render on its own canvas, low enough in resolution to read as pixel art.
import * as THREE from 'three';
import { ITEMS } from '../core/content.js';
import { worn } from '../sim/inventory.js';
import { buildAvatar, heroLook } from './avatar.js';
import { PALETTES } from './itemart.js';
import { newMotion } from './pose.js';

const HEIGHT = 2.7, TURN = 0.7;
const motion = newMotion();
let renderer = null, scene = null, camera = null, figure = null, bones = null, pose = null, raf = 0, dressed = null;

// What the hero wears, in the terms a body is drawn in. Colours come from the set's own palette, so that the armour on the body is the armour in the slot.
const SOFT = new Set(['leather', 'trollhide', 'arcane', 'elven']);
function lookInArmour() {
  const L = heroLook(), W = worn(), pal = s => (s ? PALETTES[ITEMS[s.id].pal] : null), set = s => (s ? ITEMS[s.id].set : null);
  const body = pal(W.body), head = pal(W.head), legs = pal(W.legs), feet = pal(W.feet), which = set(W.body);
  if (body) {
    Object.assign(L, { armor: body.ramp[1], plate: !SOFT.has(which), trim: body.accent[1], pads: body.ramp[2], gauntlets: body.ramp[3], cape: null, scarf: null, tabard: null, back: null });
    if (which === 'knight') Object.assign(L, { tabard: body.accent[1], trim: body.handle[0], cape: body.accent[2] });
    if (which === 'dragonscale') Object.assign(L, { cape: body.ramp[3], torn: true, trim: body.accent[1] });
    if (which === 'demonplate') Object.assign(L, { cape: body.accent[2], torn: true, trim: body.accent[1] });
    if (which === 'arcane') Object.assign(L, { coat: body.ramp[1], armor: null, plate: false, pads: null });
    if (which === 'elven') Object.assign(L, { scarf: body.ramp[2] });
  }
  if (head) Object.assign(L, { helmet: true, helmetColor: head.ramp[1], plume: set(W.head) === 'knight' ? head.accent[1] : false, trim: L.trim ?? head.accent[1], crown: set(W.head) === 'demonplate' || set(W.head) === 'dragonscale' ? 'horns' : null });
  if (legs) L.bottom = legs.ramp[2];
  if (feet) L.shoes = feet.ramp[2];
  return L;
}
function dress() {
  const sign = Object.values(worn()).map(s => s?.id ?? '').join();
  if (sign === dressed) return;
  dressed = sign;
  if (figure) scene.remove(figure);
  ({ g: figure, extra: bones, pose } = buildAvatar(lookInArmour(), HEIGHT, []));
  scene.add(figure);
}

function build(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8884a0, 1.9));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.3);
  sun.position.set(-1, 2, 2);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(26, canvas.width / canvas.height, 0.1, 50);
  camera.position.set(0, 1.5, 8);
  camera.lookAt(0, 1.4, 0);
}

export function showPortrait(canvas) {
  if (!renderer) build(canvas);
  cancelAnimationFrame(raf);
  const turn = now => {
    dress(); // cheap when nothing has changed
    figure.rotation.y = Math.PI + now / 1000 * TURN;
    motion.t = now / 1000;
    pose(bones, motion);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(turn);
  };
  raf = requestAnimationFrame(turn);
}
export function hidePortrait() { cancelAnimationFrame(raf); }

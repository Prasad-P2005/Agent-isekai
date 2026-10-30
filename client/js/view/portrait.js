// The hero in the bag: a small render on its own canvas, low enough in resolution to read as pixel art.
import * as THREE from 'three';
import { buildAvatar, heroLook } from './avatar.js';
import { newMotion } from './pose.js';

const HEIGHT = 2.7, TURN = 0.7;
const motion = newMotion();
let renderer = null, scene = null, camera = null, figure = null, bones = null, pose = null, raf = 0;

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
  ({ g: figure, extra: bones, pose } = buildAvatar(heroLook(), HEIGHT, []));
  scene.add(figure);
}

export function showPortrait(canvas) {
  if (!renderer) build(canvas);
  cancelAnimationFrame(raf);
  const turn = now => {
    figure.rotation.y = Math.PI + now / 1000 * TURN;
    motion.t = now / 1000;
    pose(bones, motion);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(turn);
  };
  raf = requestAnimationFrame(turn);
}
export function hidePortrait() { cancelAnimationFrame(raf); }

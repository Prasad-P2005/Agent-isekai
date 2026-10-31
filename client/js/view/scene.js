// Renderer, world scene, camera and the lights that bodies are drawn by.
import * as THREE from 'three';
import { emit, on } from '../core/events.js';
import { settings } from '../core/settings.js';
import { RD } from '../sim/chunks.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const MAX_DENSITY = 1.5;
let autoScale = 1;
renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DENSITY));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.info.autoReset = false; // a frame is several passes, and the debug line wants the whole of it
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9c8d0, 40, RD * 16 - 8);
export const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';
export const stillCamera = matchMedia('(prefers-reduced-motion: reduce)');

// What is seen through rather than stood on is on its own layer, because with shaders it is drawn in a pass of its own, after the solid world.
export const LATE_LAYER = 1, BODY_LAYER = 2;
camera.layers.enable(LATE_LAYER);
export const late = o => { o.layers.set(LATE_LAYER); return o; };

export function fitCanvas() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DENSITY) * settings.renderScale / 100 * autoScale);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  emit('canvas:resized');
}
export const scaleNow = () => autoScale;
export function setAutoScale(s) { autoScale = s; fitCanvas(); }
addEventListener('resize', fitCanvas);
on('settings:changed', moved => {
  if (moved.includes('autoScale') && !settings.autoScale) autoScale = 1;
  if (moved.includes('renderScale') || moved.includes('autoScale')) fitCanvas();
});
fitCanvas();

export const ambientLight = new THREE.HemisphereLight(0xf4f3ec, 0x62645b, 0.8);
ambientLight.layers.enableAll();
scene.add(ambientLight);
export const sunLight = new THREE.DirectionalLight(0xfff0d8, 1.35);
sunLight.position.set(0.5, 1, 0.3);
sunLight.layers.enableAll();
scene.add(sunLight);

export const highlight = late(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })));
highlight.visible = false;
scene.add(highlight);

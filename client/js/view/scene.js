// Renderer, world scene, camera and the lights that bodies are drawn by.
import * as THREE from 'three';
import { RD } from '../sim/chunks.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9c8d0, 40, RD * 16 - 8);
export const BASE_FOV = 75;
export const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';
export const stillCamera = matchMedia('(prefers-reduced-motion: reduce)');
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

export const ambientLight = new THREE.HemisphereLight(0xf4f3ec, 0x62645b, 0.8);
scene.add(ambientLight);
export const sunLight = new THREE.DirectionalLight(0xfff0d8, 1.35);
sunLight.position.set(0.5, 1, 0.3);
scene.add(sunLight);

export const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
highlight.visible = false;
scene.add(highlight);

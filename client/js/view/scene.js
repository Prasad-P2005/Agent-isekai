// Renderer, world scene, camera, sky and shared materials.
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
export const SKY = new THREE.Color(0xa9c8d0), UNDER = new THREE.Color(0x24586c), NIGHT_SKY = new THREE.Color(0x111822), DEMON_SKY = new THREE.Color(0x5a2525);
export const skyNow = new THREE.Color();
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 40, RD * 16 - 8);
export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 600);
camera.rotation.order = 'YXZ';
export const stillCamera = matchMedia('(prefers-reduced-motion: reduce)');
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

export const opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const transMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false, side: THREE.DoubleSide });

// a sun and two moons
export const sky = new THREE.Group();
scene.add(sky);
const skyBody = (color, r, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color, fog: false })); m.position.set(x, y, z); sky.add(m); };
skyBody(0xfff1b0, 22, 180, 280, -300);
skyBody(0xffb6e6, 14, -320, 160, -150);
skyBody(0xc8e6ff, 9, -260, 210, 120);

export const ambientLight = new THREE.HemisphereLight(0xf4f3ec, 0x62645b, 0.8);
scene.add(ambientLight);
export const sunLight = new THREE.DirectionalLight(0xfff0d8, 1.35);
sunLight.position.set(0.5, 1, 0.3);
scene.add(sunLight);

export const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000 }));
highlight.visible = false;
scene.add(highlight);

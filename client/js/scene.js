// Renderer, world scene, camera, sky and shared materials.
import * as THREE from 'three';

export const RD = 7; // render distance in chunks
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
export const SKY = new THREE.Color(0x9fd0ff), UNDER = new THREE.Color(0x1b4f8a), NIGHT_SKY = new THREE.Color(0x0a0f2a), DEMON_SKY = new THREE.Color(0x5a0a14);
export const skyNow = new THREE.Color();
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 40, RD * 16 - 8);
export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 600);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

export const opaqueMat = new THREE.MeshBasicMaterial({ vertexColors: true });
export const transMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });

// a sun and two moons
export const sky = new THREE.Group();
scene.add(sky);
const skyBody = (color, r, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color, fog: false })); m.position.set(x, y, z); sky.add(m); };
skyBody(0xfff1b0, 22, 180, 280, -300);
skyBody(0xffb6e6, 14, -320, 160, -150);
skyBody(0xc8e6ff, 9, -260, 210, 120);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
export const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
sunLight.position.set(0.5, 1, 0.3);
scene.add(sunLight);

export const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000 }));
highlight.visible = false;
scene.add(highlight);

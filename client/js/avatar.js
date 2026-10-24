// Blocky anime-style characters, designed in code: pixel-art faces with big sparkly eyes,
// anime hairstyles (twin-tails, ponytails, ahoge...), job outfits and race features.
// Each character is a handful of merged meshes (head, torso, arms, legs) so many can be on screen at once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './noise.js';

// ---------------- palettes ----------------
const HAIR = { pink: 0xff8fc8, silver: 0xe2e6f0, blonde: 0xffdc7a, black: 0x2a2838, brown: 0x7a4a2a, red: 0xd8483a, blue: 0x4a7ae0,
  lavender: 0xb89aff, mint: 0x7fe0c0, orange: 0xff9a4a, white: 0xf6f4f0, chestnut: 0xa0522d, navy: 0x2a3a6a };
const EYES = [0x3a7aff, 0x2ab08a, 0xd83a5a, 0x9a5aff, 0xe0a020, 0xff6ab0, 0x40c0e0];
const SKIN = [0xffe6d6, 0xffdcc4, 0xf3c9a6, 0xdca27c];
const pick = (r, a) => a[Math.floor(r() * a.length)];

// ---------------- the look of a character ----------------
// job/kind decide the outfit; a personal seed decides hair, eyes and style.
export function lookFor(kind, job, seed, def) {
  const r = mulberry((seed * 2654435761) >>> 0 || 7);
  const race = def.race || 'human';
  // Keep the settlement population visibly mixed instead of letting the default
  // lean heavily toward women. Job-specific characters still keep their role.
  let female = r() < 0.5;
  if (['king', 'elf_king', 'blacksmith'].includes(job)) female = false;
  if (['queen', 'elf_queen', 'receptionist', 'nurse', 'herbalist'].includes(job) || kind === 'mermaid' || kind === 'goddess') female = true;
  if (kind === 'god') female = false;
  const hairPool = race === 'elf' ? ['silver', 'blonde', 'mint', 'white', 'lavender'] : race === 'beastkin' ? ['brown', 'orange', 'white', 'black', 'chestnut']
    : ['pink', 'blonde', 'black', 'brown', 'red', 'blue', 'lavender', 'navy', 'chestnut', 'silver'];
  const L = {
    female, race, job: job || kind,
    skin: race === 'beastkin' ? pick(r, SKIN.slice(1)) : pick(r, SKIN.slice(0, 3)),
    hair: HAIR[pick(r, hairPool)], eyes: pick(r, EYES),
    style: female ? pick(r, ['long', 'twintails', 'ponytail', 'bob', 'long', 'side']) : pick(r, ['short', 'spiky', 'swept', 'messy', 'crop']),
    ahoge: r() < 0.35, glasses: false, top: 0x6a8acc, bottom: 0x3a3a5a, socks: 0xf4f4f4, shoes: 0x4a3020,
    skirt: female ? 'skirt' : null, cape: null, apron: null, armor: null, coat: null, hat: null, crown: null, bow: female && r() < 0.35 ? pick(r, [0xd83a4a, 0x3a6ae0, 0xffb0d0]) : null,
    back: null, belt: null, gown: false, tail: race === 'beastkin', catEars: race === 'beastkin', elfEars: race === 'elf', mermaid: kind === 'mermaid',
  };
  const outfit = OUTFITS[L.job] || OUTFITS[kind] || OUTFITS.villager;
  outfit(L, r);
  if (def.body != null && OUTFITS[L.job] === undefined && OUTFITS[kind] === undefined) L.top = def.body;
  return L;
}
const OUTFITS = {
  villager: (L, r) => { L.top = pick(r, [0x7aa0d0, 0xd08a7a, 0x8ac08a, 0xe0c070, 0xb08ad0]); L.bottom = L.female ? pick(r, [0x4a5a8a, 0x8a4a5a]) : 0x5a4a3a; },
  king: L => { L.top = 0xf4ecd8; L.bottom = 0x3a2a5a; L.cape = 0xc0182a; L.crown = 'crown'; L.belt = 0xffd34d; L.style = 'short'; },
  queen: L => { L.top = 0xb8306a; L.gown = true; L.bottom = 0xd84a8a; L.cape = 0x6a1a3a; L.crown = 'tiara'; L.style = 'long'; L.belt = 0xffd34d; },
  elf_king: L => { L.top = 0xe8f0e0; L.bottom = 0x2a5a3a; L.cape = 0x3a8a5a; L.crown = 'crown'; L.belt = 0xffd34d; L.style = 'long'; },
  elf_queen: L => { L.top = 0xeef6ff; L.gown = true; L.bottom = 0xcfe8ff; L.cape = 0x7fd0c0; L.crown = 'tiara'; L.style = 'long'; L.belt = 0xffd34d; },
  god: L => { L.female = false; L.top = 0xffffff; L.gown = true; L.bottom = 0xfff4e0; L.belt = 0xffd34d; L.crown = 'tiara'; L.style = 'messy'; L.hair = HAIR.blonde; L.eyes = 0xe0a020; L.cape = 0xffe9a8; L.bow = null; },
  goddess: L => { L.top = 0xffffff; L.gown = true; L.bottom = 0xfff4e0; L.belt = 0xffd34d; L.crown = 'tiara'; L.style = 'long'; L.hair = HAIR.pink; L.eyes = 0x40c0e0; L.ahoge = true; L.bow = 0xffd34d; },
  receptionist: L => { L.top = 0x2a3a6a; L.bottom = 0x2a3a6a; L.skirt = 'skirt'; L.bow = 0xe03a4a; L.socks = 0x1a1a2a; L.apron = null; L.collar = 0xffffff; },
  guild_master: (L, r) => { L.top = 0x3a2a2a; L.bottom = 0x2a2a2a; L.coat = 0x5a2a1a; L.cape = 0x8a1a1a; L.back = 'sword'; L.style = L.female ? 'ponytail' : 'spiky'; L.skirt = null; },
  adventurer: (L, r) => { L.top = pick(r, [0x3a6aa0, 0xa03a3a, 0x3a8a5a, 0x8a5aa0]); L.bottom = 0x4a3a2a; L.armor = 0x8a6a4a; L.belt = 0x3a2a1a; L.back = pick(r, ['sword', 'sword', 'bow']); L.skirt = L.female ? 'short' : null; L.shoes = 0x5a3a20; L.cape = r() < 0.5 ? pick(r, [0x8a1a2a, 0x2a4a8a]) : null; },
  knight: L => { L.top = 0x3557c9; L.bottom = 0x6a7080; L.armor = 0xc8ced6; L.cape = 0x3557c9; L.skirt = null; L.shoes = 0x8a8f98; L.helmet = true; },
  elf_guard: L => { L.top = 0x3a7a5a; L.bottom = 0x2a4a3a; L.armor = 0xd8e0d0; L.cape = 0x3a9a6a; L.back = 'bow'; L.skirt = null; L.shoes = 0x5a4a2a; },
  doctor: L => { L.top = 0x7ab0e0; L.bottom = 0x3a4a6a; L.coat = 0xffffff; L.glasses = true; L.skirt = null; },
  nurse: L => { L.top = 0xffc8dc; L.bottom = 0xffc8dc; L.skirt = 'dress'; L.apron = 0xffffff; L.hat = 'nurse'; L.bow = null; },
  herbalist: L => { L.top = 0x6ab06a; L.bottom = 0x4a8a4a; L.skirt = 'dress'; L.apron = 0xf0e8d0; L.hat = 'leaves'; },
  innkeeper: L => { L.top = 0xf0e0c0; L.bottom = 0x6a3a2a; L.apron = 0xffffff; L.skirt = L.female ? 'dress' : null; L.hat = 'bandana'; },
  blacksmith: L => { L.top = 0x5a5a5a; L.bottom = 0x3a3a3a; L.apron = 0x5a3a20; L.style = 'messy'; L.skirt = null; },
  farmer: L => { L.top = 0x8b7652; L.bottom = 0x5b4b37; L.hat = 'straw'; L.skirt = null; },
  fisherman: L => { L.top = 0x477f91; L.bottom = 0x354b50; L.hat = 'bandana'; L.hatColor = 0x526d78; L.back = 'fishing_rod'; L.skirt = null; },
  peddler: L => { L.top = 0x806447; L.bottom = 0x53493c; L.coat = 0x6f5d48; L.hat = 'bandana'; L.hatColor = 0x8e624a; L.skirt = null; },
  priest: L => { L.top = 0xffffff; L.bottom = 0xf4f0e0; L.gown = true; L.belt = 0xd8b040; L.hat = L.female ? 'veil' : null; L.cape = 0x3a4a8a; },
  merchant: (L, r) => { L.top = pick(r, [0x8a3a9a, 0x3a8a6a, 0xc08a2a]); L.bottom = 0x5a4a3a; L.apron = 0xe8dcc0; L.hat = 'bandana'; L.belt = 0x3a2a1a; },
  baker: L => { L.top = 0xffffff; L.bottom = 0xd8b890; L.apron = 0xffffff; L.hat = 'chef'; },
  bard: (L, r) => { L.top = pick(r, [0xe0503a, 0x3a8ae0, 0xe0b03a]); L.bottom = 0x3a2a5a; L.hat = 'feather'; L.back = 'lute'; L.cape = 0x5a2a6a; },
  farmer: L => { L.top = 0xe8dcb0; L.bottom = 0x3a5a9a; L.hat = 'straw'; L.skirt = null; },
  guard: L => OUTFITS.knight(L),
  elder: L => { L.top = 0x4a8a5a; L.bottom = 0x3a6a4a; L.gown = true; L.hair = HAIR.white; L.style = 'long'; L.cape = 0xe8e0c8; L.hat = 'leaves'; },
  ranger: L => { L.top = 0x3a6a3a; L.bottom = 0x4a3a2a; L.hat = 'hood'; L.back = 'bow'; L.cape = 0x2a5a2a; L.skirt = L.female ? 'short' : null; },
  chief: L => { L.top = 0xa0522d; L.bottom = 0x6a3a1a; L.cape = 0xd8c8a0; L.hat = 'feathers'; L.belt = 0xffd34d; L.skirt = null; },
  shaman: L => { L.top = 0x5a2a6a; L.bottom = 0x3a1a4a; L.gown = true; L.hat = 'feathers'; L.belt = 0xf0f0e0; },
  hunter: L => { L.top = 0x8a6a3a; L.bottom = 0x5a3a20; L.back = 'bow'; L.armor = 0xb89a6a; L.skirt = L.female ? 'short' : null; },
  warrior: L => { L.top = 0x8a2a1a; L.bottom = 0x4a2a1a; L.armor = 0xb89a6a; L.back = 'sword'; L.skirt = null; },
  merchant_caravan: L => OUTFITS.merchant(L, Math.random),
  mermaid: L => { L.top = 0xff8fb8; L.bottom = 0x2fb5b5; L.skirt = null; L.style = 'long'; L.hair = pick(Math.random, [HAIR.pink, HAIR.mint, HAIR.blue]); },
  bounty_hunter: L => { L.top = 0x2a2a2a; L.bottom = 0x2a2a2a; L.coat = 0x4a3a2a; L.hat = 'hood'; L.back = 'sword'; L.skirt = null; L.female = false; L.style = 'short'; },
  demon_lord: L => { L.top = 0x2a0a3a; L.bottom = 0x1a0a2a; L.cape = 0x6a0a1a; L.armor = 0x3a2a4a; L.crown = 'horns'; L.hair = HAIR.silver; L.eyes = 0xff2020; L.style = 'long'; L.skin = 0xd8c8e0; L.female = false; L.skirt = null; L.bow = null; },
};

// ---------------- the face: 32x32 pixel art ----------------
const faceCache = new Map();
const hexCss = h => '#' + h.toString(16).padStart(6, '0');
function shade(h, k) { const c = new THREE.Color(h); c.multiplyScalar(k); return '#' + c.getHexString(); }
function faceTexture(L) {
  const key = [L.skin, L.eyes, L.hair, L.female, L.glasses, L.job === 'demon_lord'].join();
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d'), px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  px(0, 0, 32, 32, hexCss(L.skin));
  const eyeTop = L.female ? 13 : 14, eyeH = L.female ? 8 : 5;
  for (const ex of [5, 21]) {
    px(ex, eyeTop, 6, eyeH, '#ffffff');                       // sclera
    px(ex + 1, eyeTop, 4, eyeH, hexCss(L.eyes));              // iris
    px(ex + 1, eyeTop, 4, Math.ceil(eyeH / 2), shade(L.eyes, 0.6)); // darker upper iris
    if (L.female) px(ex + 1, eyeTop + eyeH - 2, 4, 1, shade(L.eyes, 1.35)); // luminous lower iris
    px(ex + 2, eyeTop + 2, 2, eyeH - 4, '#1a1020');           // pupil
    if (L.female) px(ex + 1, eyeTop + 1, 2, 2, '#ffffff'); // bright anime eye glint
    if (L.female) px(ex + 4, eyeTop + eyeH - 3, 1, 1, '#ffffff'); // second sparkle
    px(ex - 1, eyeTop - 1, 8, 2, '#20141e');   // upper lash / defined lid
    if (L.female) px(ex === 5 ? ex - 1 : ex + 6, eyeTop - 2, 1, 2, '#20141e'); // lash flick
    // Straighter, thicker brows give male faces a clearer anime read at game scale.
    px(ex, eyeTop - (L.female ? 4 : 5), 6, L.female ? 1 : 2, shade(L.hair, 0.55));
  }
  if (L.female || L.job === 'goddess') { g.globalAlpha = 0.45; px(3, 23, 5, 2, '#ff6a8a'); px(24, 23, 5, 2, '#ff6a8a'); g.globalAlpha = 1; } // blush
  px(15, 22, 2, 1, shade(L.skin, 0.88)); // small pixel nose adds face definition
  if (L.female) {
    px(15, 27, 2, 1, '#c04a5a'); px(14, 26, 1, 1, '#c04a5a'); px(17, 26, 1, 1, '#c04a5a');
  } else {
    px(15, 27, 2, 1, '#705448'); // understated natural mouth line
  }
  if (L.glasses) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 1; g.strokeRect(4.5, eyeTop - 1.5, 9, eyeH + 3); g.strokeRect(18.5, eyeTop - 1.5, 9, eyeH + 3); px(13, eyeTop + 1, 6, 1, '#3a2a2a'); }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  faceCache.set(key, mat);
  return mat;
}

// ---------------- geometry helpers ----------------
const tmpColor = new THREE.Color();
function merged(list) {
  const geos = list.map(([w, h, d, x, y, z, c, rz = 0, rx = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    tmpColor.setHex(c);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const m = mergeGeometries(geos);
  geos.forEach(g => g.dispose());
  return m;
}

// ---------------- build ----------------
// Unit proportions (before scaling to the creature's height): legs 0.62, torso 0.55, head 0.48.
const HEAD = 0.56, HIP = 0.62, SHOULDER = 1.15, NECK = 1.17, TOTAL = 1.8;
export function buildAvatar(L, height, mats) {
  const root = new THREE.Group(), body = new THREE.Group();
  const s = height / TOTAL;
  body.scale.setScalar(s);
  root.add(body);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mats.push(mat);
  const mesh = (list, parent) => { const m = new THREE.Mesh(merged(list), mat); parent.add(m); return m; };
  const hairC = L.hair, skin = L.skin;

  // ---- legs (pivot at the hip) ----
  const legs = [-1, 1].map(side => {
    const g = new THREE.Group(); g.position.set(side * 0.1, HIP, 0); body.add(g);
    const bare = L.skirt || L.gown;
    const parts = L.mermaid ? [] : [
      [0.17, 0.62, 0.2, 0, -0.31, 0, bare ? skin : L.bottom],                    // leg
      ...(bare ? [[0.18, 0.4, 0.21, 0, -0.42, 0, L.socks]] : []),                // thigh-high socks
      [0.19, 0.16, 0.24, 0, -0.54, -0.02, L.shoes],                              // shoes
    ];
    if (L.armor && !bare) parts.push([0.19, 0.18, 0.22, 0, -0.38, 0, L.armor]);  // greaves
    if (parts.length) mesh(parts, g);
    return g;
  });
  // ---- torso & everything worn on it ----
  // A stepped silhouette adds a gentle waist and fuller hips while keeping
  // the same clean voxel construction used by the rest of the character.
  const torso = L.female ? [
    [0.44, 0.22, 0.27, 0, 1.04, 0, L.top],
    [0.36, 0.22, 0.24, 0, 0.82, 0, L.top],
    [0.49, 0.2, 0.3, 0, 0.65, 0, L.top],
    [0.14, 0.05, 0.14, 0, 1.17, 0, skin],
  ] : [
    [0.42, 0.55, 0.24, 0, 0.895, 0, L.top],
    [0.14, 0.05, 0.14, 0, 1.17, 0, skin],
  ];
  if (L.collar) torso.push([0.2, 0.12, 0.02, 0, 1.08, -0.125, L.collar]);
  if (L.bow) torso.push([0.16, 0.07, 0.04, 0, 1.08, -0.14, L.bow], [0.05, 0.1, 0.04, 0, 1.03, -0.14, L.bow]);
  if (L.belt) torso.push([0.44, 0.05, 0.26, 0, 0.66, 0, L.belt]);
  if (L.apron) torso.push([0.34, 0.6, 0.02, 0, 0.75, -0.13, L.apron]);
  if (L.armor) torso.push([0.44, 0.3, 0.26, 0, 1.0, 0, L.armor]);
  if (L.skirt === 'skirt') torso.push([0.48, 0.24, 0.3, 0, 0.53, 0, L.bottom], [0.52, 0.06, 0.34, 0, 0.43, 0, L.bottom]);
  if (L.skirt === 'short') torso.push([0.46, 0.16, 0.28, 0, 0.57, 0, L.bottom]);
  if (L.skirt === 'dress') torso.push([0.48, 0.25, 0.3, 0, 0.52, 0, L.top], [0.54, 0.16, 0.36, 0, 0.34, 0, L.top]);
  if (L.gown) torso.push([0.5, 0.3, 0.32, 0, 0.5, 0, L.bottom], [0.58, 0.32, 0.4, 0, 0.18, 0, L.bottom], [0.6, 0.04, 0.42, 0, 0.02, 0, L.belt || L.bottom]);
  if (L.coat) torso.push([0.46, 0.59, 0.28, 0, 0.88, 0.005, L.coat], [0.48, 0.42, 0.04, 0, 0.42, 0.13, L.coat], [0.04, 0.42, 0.24, -0.23, 0.42, 0, L.coat], [0.04, 0.42, 0.24, 0.23, 0.42, 0, L.coat], [0.12, 0.5, 0.02, 0, 0.9, -0.15, L.top]);
  if (L.cape) torso.push([0.5, 0.82, 0.03, 0, 0.75, 0.15, L.cape], [0.46, 0.06, 0.3, 0, 1.17, 0.02, L.cape]);
  if (L.back === 'sword') torso.push([0.05, 0.7, 0.05, 0.08, 0.95, 0.16, 0xc8ced6, 0.5], [0.16, 0.04, 0.06, 0.2, 1.17, 0.16, 0x8a6a2a, 0.5]);
  if (L.back === 'bow') torso.push([0.04, 0.8, 0.04, 0, 0.95, 0.16, 0x8a5a2a, -0.4], [0.02, 0.75, 0.02, 0.06, 0.95, 0.17, 0xf0f0e0, -0.4]);
  if (L.back === 'lute') torso.push([0.24, 0.3, 0.06, 0.05, 0.85, 0.17, 0xb87a3a, 0.4], [0.05, 0.3, 0.04, -0.06, 1.1, 0.17, 0x6a4a2a, 0.4]);
  if (L.back === 'fishing_rod') torso.push([0.035, 0.9, 0.035, -0.2, 1.0, 0.18, 0x765a3d, -0.24], [0.018, 0.4, 0.018, -0.4, 1.32, 0.18, 0xc9b78e, 0.1]);
  if (L.tail) torso.push([0.07, 0.07, 0.25, 0, 0.62, 0.22, hairC], [0.07, 0.25, 0.07, 0, 0.78, 0.33, hairC], [0.08, 0.08, 0.08, 0, 0.92, 0.33, 0xffffff]);
  if (L.mermaid) torso.push([0.36, 0.4, 0.24, 0, 0.42, 0, L.bottom], [0.28, 0.25, 0.2, 0, 0.12, 0.05, L.bottom], [0.46, 0.06, 0.24, 0, 0.0, 0.12, 0x7fe0e0]);
  mesh(torso, body);
  // ---- arms (pivot at the shoulder) ----
  const arms = [-1, 1].map(side => {
    const g = new THREE.Group(); g.position.set(side * 0.275, SHOULDER, 0); body.add(g);
    const sleeve = L.gown || L.coat ? (L.coat || L.top) : L.top;
    const parts = [[0.13, 0.4, 0.15, 0, -0.2, 0, sleeve], [0.12, 0.1, 0.14, 0, -0.45, 0, skin]];
    if (L.armor) parts.push([0.18, 0.1, 0.2, 0, 0.0, 0, L.armor]);
    if (L.job === 'blacksmith') parts[0][6] = skin;
    mesh(parts, g);
    return g;
  });
  // ---- head: face, hair, ears, hats ----
  const head = new THREE.Group(); head.position.set(0, NECK, 0); body.add(head);
  const hy = 0.03 + HEAD / 2; // head centre above the neck pivot
  const headParts = [[HEAD, HEAD, HEAD, 0, hy, 0, skin]];
  const top = hy + HEAD / 2, front = -HEAD / 2, H = hairC;
  if (!L.helmet) {
    headParts.push([0.6, 0.12, 0.58, 0, top + 0.02, 0.02, H]);                  // crown of the hair
    headParts.push([0.6, 0.58, 0.06, 0, hy + 0.02, HEAD / 2 + 0.03, H]);                    // back
    const sideHairH = L.female ? 0.4 : 0.28;
    const sideHairY = L.female ? hy + 0.06 : hy + 0.12;
    headParts.push([0.04, sideHairH, 0.58, -HEAD / 2 - 0.02, sideHairY, 0, H], [0.04, sideHairH, 0.58, HEAD / 2 + 0.02, sideHairY, 0, H]); // sides
    // bangs: a jagged fringe over the forehead
    const bangs = L.female ? [0.12, 0.16, 0.1, 0.17, 0.12] : [0.1, 0.14, 0.08, 0.13, 0.1];
    bangs.forEach((len, i) => headParts.push([0.12, len + 0.06, 0.05, -0.24 + i * 0.12, top - len / 2 + 0.05, front - 0.02, H]));
    if (L.style === 'long') headParts.push([0.6, 0.85, 0.07, 0, hy - 0.32, HEAD / 2 + 0.05, H], [0.06, 0.6, 0.12, -0.3, hy - 0.22, 0.12, H], [0.06, 0.6, 0.12, 0.3, hy - 0.22, 0.12, H]);
    if (L.style === 'side') headParts.push([0.52, 0.5, 0.07, 0, hy - 0.15, 0.27, H], [0.1, 0.6, 0.1, 0.26, hy - 0.3, -0.1, H]);
    if (L.style === 'bob') headParts.push([0.6, 0.36, 0.08, 0, hy - 0.08, 0.28, H], [0.07, 0.4, 0.5, -0.3, hy - 0.06, 0.02, H], [0.07, 0.4, 0.5, 0.3, hy - 0.06, 0.02, H]);
    if (L.style === 'ponytail') headParts.push([0.14, 0.14, 0.1, 0, top - 0.08, 0.3, L.bow || 0xd83a4a], [0.13, 0.6, 0.12, 0, hy - 0.22, 0.36, H, 0, 0.2]);
    if (L.style === 'twintails') for (const s2 of [-1, 1]) headParts.push([0.08, 0.08, 0.08, s2 * 0.29, top - 0.06, 0.06, L.bow || 0xff6ab0], [0.13, 0.7, 0.13, s2 * 0.36, hy - 0.3, 0.08, H, s2 * 0.12]);
    if (L.style === 'spiky') {
      for (let i = 0; i < 5; i++) headParts.push([0.12, 0.22, 0.12, -0.22 + i * 0.11, top + 0.1, 0.04, H, (i - 2) * 0.28]);
    }
    if (L.style === 'messy') headParts.push([0.56, 0.08, 0.56, 0, top + 0.06, 0.02, H], [0.12, 0.17, 0.1, 0.2, top + 0.12, 0.1, H, 0.5], [0.12, 0.14, 0.1, -0.17, top + 0.1, -0.03, H, -0.45]);
    if (L.style === 'swept') headParts.push([0.18, 0.22, 0.12, 0.21, top + 0.08, -0.02, H, 0.55], [0.12, 0.14, 0.1, -0.17, top + 0.04, 0.05, H, -0.25]);
    if (L.style === 'crop') {
      headParts.push([0.58, 0.06, 0.56, 0, top + 0.04, 0.01, H]);
      for (let i = 0; i < 3; i++) headParts.push([0.11, 0.12, 0.08, -0.12 + i * 0.12, top + 0.08, 0.02, H, (i - 1) * 0.18]);
    }
    const shine = new THREE.Color(H).lerp(new THREE.Color(0xffffff), 0.45).getHex(); // the anime 'angel ring' highlight
    headParts.push([0.6, 0.03, 0.02, 0, top - 0.1, HEAD / 2 + 0.04, shine], [0.02, 0.03, 0.5, -HEAD / 2 - 0.035, top - 0.1, 0, shine], [0.02, 0.03, 0.5, HEAD / 2 + 0.035, top - 0.1, 0, shine]);
    if (L.female && L.style !== 'bob') for (const s2 of [-1, 1]) headParts.push([0.07, 0.42, 0.07, s2 * 0.27, hy - 0.06, front + 0.03, H]); // locks framing the face
    if (L.ahoge) headParts.push([0.03, 0.18, 0.05, 0.04, top + 0.13, -0.02, H, -0.35]);
  } else {
    headParts.push([0.54, 0.2, 0.54, 0, top - 0.04, 0.0, L.armor], [0.54, 0.44, 0.06, 0, hy, 0.26, L.armor], [0.04, 0.44, 0.54, -0.27, hy, 0, L.armor], [0.04, 0.44, 0.54, 0.27, hy, 0, L.armor],
      [0.06, 0.2, 0.2, 0, top + 0.14, 0.05, 0xd83a3a]); // plume
  }
  if (L.elfEars) for (const s2 of [-1, 1]) headParts.push([0.2, 0.06, 0.06, s2 * 0.33, hy + 0.02, 0.0, skin, s2 * 0.45]);
  if (L.catEars) for (const s2 of [-1, 1]) headParts.push([0.12, 0.14, 0.06, s2 * 0.15, top + 0.09, 0.02, H], [0.06, 0.08, 0.02, s2 * 0.15, top + 0.08, -0.02, 0xffa0b8]);
  const gold = 0xffd34d;
  if (L.crown === 'crown') { headParts.push([0.5, 0.08, 0.5, 0, top + 0.07, 0, gold]); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [0, -0.22], [-0.2, 0.2], [0.2, 0.2]]) headParts.push([0.07, 0.1, 0.07, x, top + 0.15, z, gold]); headParts.push([0.06, 0.06, 0.02, 0, top + 0.07, -0.26, 0xd8203a]); }
  if (L.crown === 'tiara') headParts.push([0.4, 0.05, 0.04, 0, top - 0.01, front - 0.04, gold], [0.08, 0.08, 0.04, 0, top + 0.04, front - 0.05, 0x7ae0ff]);
  if (L.crown === 'horns') for (const s2 of [-1, 1]) headParts.push([0.08, 0.26, 0.08, s2 * 0.2, top + 0.12, 0, 0x1a1a1a, s2 * -0.5]);
  if (L.hat === 'nurse') headParts.push([0.36, 0.1, 0.04, 0, top + 0.02, front + 0.06, 0xffffff], [0.06, 0.06, 0.01, 0, top + 0.03, front + 0.035, 0xe03a4a]);
  if (L.hat === 'chef') headParts.push([0.5, 0.06, 0.5, 0, top + 0.05, 0, 0xffffff], [0.44, 0.24, 0.44, 0, top + 0.2, 0, 0xffffff]);
  if (L.hat === 'straw') headParts.push([0.8, 0.04, 0.8, 0, top + 0.03, 0, 0xe0c070], [0.46, 0.14, 0.46, 0, top + 0.1, 0, 0xe0c070], [0.47, 0.04, 0.47, 0, top + 0.06, 0, 0xd83a3a]);
  if (L.hat === 'bandana') headParts.push([0.54, 0.08, 0.54, 0, top - 0.02, 0, L.hatColor || 0xd84a3a]);
  if (L.hat === 'veil') headParts.push([0.56, 0.1, 0.56, 0, top + 0.03, 0, 0x2a2a4a], [0.56, 0.6, 0.04, 0, hy - 0.08, 0.28, 0x2a2a4a]);
  if (L.hat === 'leaves') for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; headParts.push([0.1, 0.05, 0.06, Math.cos(a) * 0.24, top + 0.02, Math.sin(a) * 0.24, i % 2 ? 0x5ac06a : 0xff9ac8]); }
  if (L.hat === 'feather') headParts.push([0.5, 0.1, 0.5, 0, top + 0.05, 0, 0x5a2a6a], [0.03, 0.3, 0.08, 0.2, top + 0.2, 0.1, 0xffd34d, -0.4]);
  if (L.hat === 'feathers') for (let i = 0; i < 5; i++) headParts.push([0.04, 0.26, 0.06, -0.16 + i * 0.08, top + 0.12, 0.12, [0xd83a3a, 0xffd34d, 0x3a8ae0][i % 3], (i - 2) * 0.25]);
  if (L.hat === 'hood') headParts.push([0.56, 0.14, 0.56, 0, top + 0.03, 0.01, L.cape || 0x3a5a3a], [0.56, 0.5, 0.06, 0, hy, 0.28, L.cape || 0x3a5a3a], [0.05, 0.5, 0.56, -0.28, hy, 0, L.cape || 0x3a5a3a], [0.05, 0.5, 0.56, 0.28, hy, 0, L.cape || 0x3a5a3a]);
  mesh(headParts, head);
  // the face itself is a textured plane on the front of the head
  const face = new THREE.Mesh(new THREE.PlaneGeometry(HEAD, HEAD), faceTexture(L));
  face.position.set(0, hy, front - 0.002); face.rotation.y = Math.PI;
  head.add(face);
  return { g: root, extra: { legs, arms, head } };
}

// idle and walking motion
export function animateAvatar(e, px, pz, t) {
  const x = e.extra;
  const speed = Math.hypot(e.vel.x, e.vel.z), sw = Math.sin(e.anim) * Math.min(0.7, speed * 0.3);
  x.legs.forEach((l, i) => { l.rotation.x = i ? sw : -sw; });
  x.arms.forEach((a, i) => { a.rotation.x = (i ? -sw : sw); a.rotation.z = (i ? -1 : 1) * (0.06 + Math.sin(t * 1.5 + e.yaw) * 0.02); });
  const dx = px - e.pos.x, dz = pz - e.pos.z;
  let look = 0;
  if (Math.hypot(dx, dz) < 5 && e.def.friendly) { look = Math.atan2(-dx, -dz) - e.yaw; look = Math.atan2(Math.sin(look), Math.cos(look)); }
  x.head.rotation.y += (Math.max(-0.9, Math.min(0.9, look)) - x.head.rotation.y) * 0.15; // turns to look at you
  x.head.rotation.x = Math.sin(t * 1.1 + e.yaw) * 0.03;
}

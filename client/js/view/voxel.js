// How anything living is built. Boxes are laid out in art pixels, as the interface is, and every face of every box is
// painted into one texture (see paint.js), a texel for each art pixel. A figure is one skinned mesh however many parts it
// has, so a crowd costs a draw call a body rather than one a limb.
import * as THREE from 'three';
import { plain } from './paint.js';

export { CREAM, INK, mixHex } from './paint.js';

const CUTOUT = 0.5;
const FACES = [
  { name: 'right', n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], across: 2, down: 1 },
  { name: 'left', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], across: 2, down: 1 },
  { name: 'top', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], across: 0, down: 2 },
  { name: 'bottom', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], across: 0, down: 2 },
  { name: 'back', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], across: 0, down: 1 },
  { name: 'front', n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], across: 0, down: 1 },
];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function turned([x, y, z], rz, rx, ry) {
  if (rx) [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  if (ry) [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), z * Math.cos(ry) - x * Math.sin(ry)];
  if (rz) [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x, y, z];
}

// A sheet of RGBA pixels that grows as it fills. Faces sit on it in rows.
export class Atlas {
  constructor(width = 256) { this.w = width; this.h = 128; this.px = new Uint8Array(this.w * this.h * 4); this.x = this.y = this.row = 0; }
  claim(w, h) {
    if (this.x + w > this.w) { this.x = 0; this.y += this.row; this.row = 0; }
    this.row = Math.max(this.row, h);
    while (this.y + h > this.h) {
      this.h += 128;
      const next = new Uint8Array(this.w * this.h * 4);
      next.set(this.px);
      this.px = next;
    }
    const at = [this.x, this.y];
    this.x += w;
    return at;
  }
  paint(paint, W, H, face) {
    const [ax, ay] = this.claim(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = paint(i, j, W, H, face), k = ((ay + j) * this.w + ax + i) * 4;
      if (c < 0) continue;
      this.px[k] = c >> 16 & 255; this.px[k + 1] = c >> 8 & 255; this.px[k + 2] = c & 255; this.px[k + 3] = 255;
    }
    return [ax, ay];
  }
  // Texture coordinates stay in pixels until here, which lets the sheet go on growing while the geometry is built.
  texture() {
    const t = new THREE.DataTexture(this.px, this.w, this.h, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(1 / this.w, 1 / this.h);
    t.needsUpdate = true;
    return t;
  }
  material(options) { return new THREE.MeshLambertMaterial({ map: this.texture(), alphaTest: CUTOUT, ...options }); }
}

class Boxes {
  pos = []; nor = []; uv = []; idx = []; owner = [];
  constructor(atlas) { this.atlas = atlas; }
  // A box is [width, height, depth, x, y, z, paint or colour, tilt about z, tilt about x, tilt about y], with x, y, z its middle.
  add([w, h, d, x, y, z, paint, rz = 0, rx = 0, ry = 0], bone, origin) {
    const size = [w, h, d], at = [x + origin[0], y + origin[1], z + origin[2]], fill = typeof paint === 'function' ? paint : plain(paint);
    for (const f of FACES) {
      const W = Math.max(1, Math.ceil(size[f.across])), H = Math.max(1, Math.ceil(size[f.down])), [ax, ay] = this.atlas.paint(fill, W, H, f.name);
      const first = this.pos.length / 3, [nx, ny, nz] = turned(f.n, rz, rx, ry);
      for (const [a, b] of CORNERS) {
        const [px, py, pz] = turned([0, 1, 2].map(i => (f.n[i] + f.u[i] * a + f.v[i] * b) * size[i] / 2), rz, rx, ry);
        this.pos.push(px + at[0], py + at[1], pz + at[2]);
        this.nor.push(nx, ny, nz);
        this.uv.push(a < 0 ? ax + 0.02 : ax + W - 0.02, b > 0 ? ay + 0.02 : ay + H - 0.02);
        this.owner.push(bone);
      }
      this.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

// A plain mesh, for what never needs bones. Several can share an atlas; give them its material once it is full.
export function solid(list, atlas, material) {
  const out = new Boxes(atlas);
  for (const box of list) out.add(box, 0, [0, 0, 0]);
  return new THREE.Mesh(out.geometry(), material);
}

export class Rig {
  constructor(height, total, mats, sheet = 256) {
    this.g = new THREE.Group(); this.body = new THREE.Group();
    this.body.scale.setScalar(height / total);
    this.g.add(this.body);
    this.mats = mats; this.bones = []; this.boxes = new Boxes(new Atlas(sheet));
  }
  bone(parent, x, y, z) {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    b.origin = parent ? [parent.origin[0] + x, parent.origin[1] + y, parent.origin[2] + z] : [x, y, z];
    parent?.add(b);
    this.bones.push(b);
    return b;
  }
  add(bone, list) {
    const i = this.bones.indexOf(bone);
    for (const box of list) this.boxes.add(box, i, bone.origin);
    return bone;
  }
  // Every vertex follows exactly one bone, which is what keeps the joints blocky.
  finish() {
    const geometry = this.boxes.geometry(), n = this.boxes.owner.length;
    const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
    this.boxes.owner.forEach((bone, i) => { index[i * 4] = bone; weight[i * 4] = 1; });
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
    const material = this.boxes.atlas.material();
    this.mats.push(material);
    const mesh = new THREE.SkinnedMesh(geometry, material);
    this.body.add(mesh);
    mesh.add(this.bones[0]);
    mesh.bind(new THREE.Skeleton(this.bones));
    // Set by hand: a limb swung out must not cull the body, and working it out from the posed vertices would cost a frame.
    geometry.computeBoundingSphere();
    mesh.boundingSphere = geometry.boundingSphere.clone();
    mesh.boundingSphere.radius *= 1.4;
    return mesh;
  }
}

// The bones every upright body shares. Index 0 of each pair is the left limb, 1 the right, which is the one that strikes.
export function figureBones(rig, { leg, trunk, span, upper, fore, waist = 4, stance = 5, neck = trunk }) {
  const x = { arms: [], fores: [], hands: [], legs: [], shins: [], soft: [], carry: [false, false], hipY: leg, hunch: 0, dangle: 0, hover: false };
  x.hips = rig.bone(null, 0, leg, 0);
  x.chest = rig.bone(x.hips, 0, waist, 0);
  x.head = rig.bone(x.chest, 0, neck, 0);
  for (const side of [-1, 1]) {
    const arm = rig.bone(x.chest, side * span, trunk - 3, 0), forearm = rig.bone(arm, 0, -upper, 0);
    x.arms.push(arm); x.fores.push(forearm); x.hands.push(rig.bone(forearm, 0, -fore, 0));
    const thigh = rig.bone(x.hips, side * stance, -1, 0);
    x.legs.push(thigh); x.shins.push(rig.bone(thigh, 0, 1 - Math.ceil(leg / 2), 0));
  }
  return x;
}

// Boxes for a hand hanging from the wrist: palm, three fingers and a thumb to the front. `k` is the width of the wrist, in sevenths.
export const handBoxes = (c, k = 1) => [
  [7 * k, 4 * k, 8 * k, 0, -2 * k, 0, c],
  [7 * k, 3 * k, 2.4 * k, 0, -5.5 * k, -2.8 * k, c], [7 * k, 3 * k, 2.4 * k, 0, -5.5 * k, 0, c], [7 * k, 3 * k, 2.4 * k, 0, -5.5 * k, 2.8 * k, c],
  [2.4 * k, 4 * k, 3 * k, 0, -3 * k, -5 * k, c],
];
// Something held in a fist. Parts are [width, length, depth, distance along the handle, paint]. `tilt` is the angle the
// handle leans from straight up, negative pointing it forward, and `lean` carries it out to the side, away from the head.
export const held = (tilt, parts, grip = -4, lean = 0) => parts.map(([w, l, d, at, c]) => {
  const up = at * Math.cos(tilt);
  return [w, l, d, -up * Math.sin(lean), grip + up * Math.cos(lean), at * Math.sin(tilt), c, lean, tilt];
});

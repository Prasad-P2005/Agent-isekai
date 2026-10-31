// How the world is shaded: the block layers, water, the sky and the clouds. All of it reads one set of shared uniforms, which
// view/sky.js updates each frame. Colours stay in display space from painted texture to screen, as block games do: tone mapping
// is for the bodies, and here it would only pull the art towards grey.
import * as THREE from 'three';
import { SEA } from '../sim/terrain.js';
import { TILE, TILE_NAMES, allTiles } from './blocktex.js';

export const CLOUD_CELLS = 64, CLOUD_CELL = 12, CLOUD_SPAN = CLOUD_CELLS * CLOUD_CELL;
const RIPPLE_SIZE = 64;

function tileArray() {
  const t = new THREE.DataArrayTexture(allTiles(), TILE, TILE, TILE_NAMES.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
// Two channels of wrapping value noise, which the water reads as the slope of its ripples.
function rippleMap() {
  const n = RIPPLE_SIZE, px = new Uint8Array(n * n * 4);
  const lump = (x, y, cells, seed) => {
    const fx = x / n * cells, fy = y / n * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    const at = (a, b) => { const h = Math.sin(((a % cells + cells) % cells) * 127.1 + ((b % cells + cells) % cells) * 311.7 + seed) * 43758.5453; return h - Math.floor(h); };
    const u = fx - ix, v = fy - iy, sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (x + y * n) * 4;
    px[i] = (lump(x, y, 6, 1.5) * 0.6 + lump(x, y, 14, 2.5) * 0.4) * 255;
    px[i + 1] = (lump(x, y, 6, 7.5) * 0.6 + lump(x, y, 14, 9.5) * 0.4) * 255;
    px[i + 3] = 255;
  }
  const t = new THREE.DataTexture(px, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
export function cloudMap(bits) {
  const px = new Uint8Array(CLOUD_CELLS * CLOUD_CELLS * 4);
  for (let i = 0; i < bits.length; i++) { px[i * 4] = bits[i] * 255; px[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(px, CLOUD_CELLS, CLOUD_CELLS);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export const shared = {
  uTime: { value: 0 }, uTurn: { value: 0 },
  uTiles: { value: tileArray() }, uRipple: { value: rippleMap() }, uCloudMap: { value: null }, uCloudWind: { value: new THREE.Vector2() },
  uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uDaylight: { value: new THREE.Color() }, uLamp: { value: new THREE.Color(1, 0.8, 0.52) },
  uCave: { value: 0 }, uCaveAir: { value: new THREE.Color() }, uCaveHaze: { value: new THREE.Color() }, uTorch: { value: 0 },
  uFogNear: { value: 90 }, uFogFar: { value: 150 }, uUnder: { value: 0 }, uUnderColour: { value: new THREE.Color() },
  uNight: { value: 0 }, uSunlit: { value: 1 }, uCloudColour: { value: new THREE.Color() }, uCloudShade: { value: 0 },
};

// The sky's colour in a direction. Fog fades to this rather than to one flat colour, which is what puts the land into the sky at sunset.
const SKY = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uUnderColour;
uniform float uUnder;
vec3 skyColour(vec3 d) {
  float up = clamp(d.y, 0.0, 1.0), sun = max(dot(d, uSunDir), 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.5));
  c += uGlow * (pow(sun, 5.0) * 0.45 * (1.0 - up) + pow(sun, 40.0) * 0.35);
  if (d.y < 0.0) c *= 1.0 + d.y * 0.25;
  return c;
}
`;
const FOG = /* glsl */`
uniform float uFogNear, uFogFar, uCave;
uniform vec3 uCaveHaze;
vec3 fogged(vec3 colour, vec3 world) {
  vec3 ray = world - cameraPosition;
  float dist = length(ray);
  float near = mix(mix(uFogNear, 24.0, uCave), 1.5, uUnder), far = mix(uFogFar, 34.0, uUnder);
  return mix(colour, mix(mix(skyColour(ray / dist), uCaveHaze, uCave), uUnderColour, uUnder), smoothstep(near, far, dist));
}
`;

const BLOCK_VERTEX = /* glsl */`
attribute vec3 uvl;
attribute vec4 lit;
attribute vec4 tint;
uniform float uTime;
varying vec3 vUvl, vWorld;
varying vec4 vLit, vTint;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (lit.a > 0.0) { // leaves stir, plants bend at the top, and kelp leans with the current
    float slow = lit.a > 0.9 ? 1.1 : 1.8, reach = lit.a > 0.9 ? 0.2 : lit.a > 0.6 ? 0.11 : 0.04;
    float wave = uTime * slow + world.x * 0.7 + world.z * 0.55 + world.y * 0.35;
    float gust = 0.65 + 0.35 * sin(uTime * 0.31 + world.x * 0.05 + world.z * 0.04);
    world.x += sin(wave) * reach * gust;
    world.z += cos(wave * 0.83) * reach * gust;
  }
  vUvl = uvl; vLit = lit; vTint = tint; vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
const BLOCK_FRAGMENT = /* glsl */`
uniform sampler2DArray uTiles;
uniform sampler2D uCloudMap;
uniform vec2 uCloudWind;
uniform vec3 uDaylight, uLamp, uCaveAir;
uniform float uTorch;
uniform float uTime, uCloudShade, uSunlit;
varying vec3 vUvl, vWorld;
varying vec4 vLit, vTint;
${SKY}${FOG}
float caustic(vec2 p) { // light through moving water, on the blocks' own pixel grid
  p = floor(p * 8.0) / 8.0;
  float a = sin(p.x * 2.3 + uTime * 1.1 + sin(p.y * 1.7 + uTime * 0.7) * 1.4);
  float b = sin(p.y * 2.9 - uTime * 0.9 + sin(p.x * 1.3 - uTime * 0.6) * 1.4);
  return pow(0.5 + 0.5 * a * b, 3.0);
}
void main() {
  vec4 tex = texture(uTiles, vUvl);
#if defined(CUTOUT)
  if (tex.a < 0.4) discard;
  vec3 albedo = tex.rgb * vTint.rgb;
  float alpha = 1.0;
#elif defined(BLEND)
  vec3 albedo = tex.rgb * vTint.rgb;
  float alpha = tex.a;
#else
  vec3 albedo = tex.rgb * mix(vec3(1.0), vTint.rgb, clamp(tex.a * 2.0 - 1.0, 0.0, 1.0));
  float alpha = 1.0;
#endif
  float sky = vLit.r * vLit.r * (0.35 + 0.65 * vLit.r);
  float cover = texture2D(uCloudMap, (vWorld.xz - uCloudWind) / ${CLOUD_SPAN.toFixed(1)}).r;
  sky *= 1.0 - uCloudShade * cover * smoothstep(0.5, 1.0, vLit.r); // a cloud's shadow crosses the open ground and leaves the shade alone
  float lamp = vLit.g * vLit.g * (1.0 + 0.05 * sin(uTime * 7.0 + floor(vWorld.x * 0.2) * 3.1 + floor(vWorld.z * 0.2) * 1.7));
  float held = uTorch * pow(max(0.0, 1.0 - length(vWorld - cameraPosition) / 18.0), 2.0); // a torch in the hand
  lamp = max(lamp, held);
  vec3 light = 1.0 - (1.0 - uDaylight * sky) * (1.0 - uLamp * clamp(lamp, 0.0, 1.0)) * (1.0 - uCaveAir * uCave);
  light = max(light, vec3(0.045, 0.05, 0.07));
  vec3 colour = albedo * light * vLit.b;
  if (vTint.a > 0.0) colour = mix(colour, albedo * (0.94 + 0.08 * sin(uTime * 1.6 + vWorld.x + vWorld.z)), vTint.a);
  if (vWorld.y < ${SEA.toFixed(1)}) {
    float depth = ${SEA.toFixed(1)} - vWorld.y;
    colour *= mix(vec3(1.0), vec3(0.6, 0.82, 0.88), clamp(depth / 14.0, 0.0, 1.0) * step(0.02, vLit.r)); // the sea's colour, not a cave's: nothing that sees no sky is under water
    colour += albedo * caustic(vWorld.xz * 0.9 + vWorld.y * 0.3) * 0.5 * uSunlit * vLit.r * exp(-depth * 0.09);
  }
  gl_FragColor = vec4(fogged(colour, vWorld), alpha);
}
`;
const WATER_VERTEX = /* glsl */`
attribute vec4 lit;
uniform float uTime;
varying vec3 vWorld;
varying vec2 vWater;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (lit.b > 0.5) world.y += (sin(uTime * 1.3 + world.x * 0.9 + world.z * 0.4) + sin(uTime * 0.9 - world.z * 1.1 + world.x * 0.3)) * 0.035 - 0.02;
  vWorld = world.xyz; vWater = lit.rg;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
const WATER_FRAGMENT = /* glsl */`
uniform sampler2D uRipple, uCloudMap;
uniform vec3 uDaylight;
uniform float uTime, uSunlit;
varying vec3 vWorld;
varying vec2 vWater;
${SKY}${FOG}
const vec3 SHALLOW = vec3(0.27, 0.74, 0.74), DEEP = vec3(0.05, 0.25, 0.48);
void main() {
  vec3 ray = normalize(vWorld - cameraPosition);
  vec2 cell = floor(vWorld.xz * 16.0) / 16.0; // ripples keep to the pixels of the blocks around them
  vec2 a = texture2D(uRipple, cell * 0.11 + uTime * vec2(0.021, 0.013)).rg, b = texture2D(uRipple, cell * 0.27 - uTime * vec2(0.017, 0.029)).rg;
  vec3 normal = normalize(vec3((a.x + b.x - 1.0) * 0.26, 1.0, (a.y + b.y - 1.0) * 0.26));
  float sky = vWater.r, depth = vWater.g;
  if (!gl_FrontFacing) { // from below, the surface is a bright, shifting ceiling
    vec3 up = mix(uUnderColour * 1.5, skyColour(vec3(ray.x, -ray.y, ray.z)), 0.35 + 0.3 * a.x);
    gl_FragColor = vec4(up, 0.82);
    return;
  }
  float facing = pow(1.0 - max(dot(-ray, normal), 0.0), 3.0), fresnel = mix(0.05, 0.85, facing);
  vec3 bounce = reflect(ray, normal);
  bounce.y = abs(bounce.y);
  vec3 body = mix(SHALLOW, DEEP, smoothstep(0.0, 0.75, depth)) * (uDaylight * (0.4 + 0.6 * sky) + 0.03);
  vec3 colour = mix(body, skyColour(bounce) * (0.35 + 0.65 * sky), fresnel);
  float glint = pow(max(dot(bounce, uSunDir), 0.0), 260.0) * uSunlit * sky;
  colour += step(0.2, glint) * vec3(1.0, 0.96, 0.85) + glint * 0.6;
  float shore = 1.0 - smoothstep(0.02, 0.16, depth); // foam comes and goes at the waterline
  float foam = step(0.5 + 0.2 * sin(uTime * 0.9 + vWorld.x * 0.6 + vWorld.z * 0.8), a.x + (b.y - 0.5) * 0.5 + shore * 0.4) * shore;
  colour = mix(colour, vec3(0.93, 0.97, 0.98) * (uDaylight * 0.9 + 0.1), foam * 0.85);
  gl_FragColor = vec4(fogged(colour, vWorld), mix(mix(0.5, 0.9, smoothstep(0.0, 0.6, depth)) + fresnel * 0.25, 0.95, foam));
}
`;

function blockMaterial(defines, options = {}) {
  return new THREE.ShaderMaterial({ uniforms: shared, vertexShader: BLOCK_VERTEX, fragmentShader: BLOCK_FRAGMENT, defines, toneMapped: false, ...options });
}
export const solidMat = blockMaterial({});
export const cutoutMat = blockMaterial({ CUTOUT: 1 }, { side: THREE.DoubleSide });
export const glassMat = blockMaterial({ BLEND: 1 }, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
export const waterMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

export const skyMat = new THREE.ShaderMaterial({
  uniforms: shared, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  vertexShader: /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 at = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = at.xyww;
}
`,
  fragmentShader: /* glsl */`
uniform float uTime, uTurn, uNight;
varying vec3 vDir;
${SKY}
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir), colour = skyColour(d);
  if (uNight > 0.01 && d.y > -0.05) { // the stars turn with the sun and moons, in square pixels like theirs
    float c = cos(uTurn), s = sin(uTurn);
    vec3 q = vec3(c * d.x + s * d.y, -s * d.x + c * d.y, d.z);
    float band = pow(max(0.0, 1.0 - abs(q.z + 0.25 * sin(q.x * 3.0)) * 2.2), 3.0); // the great river of stars this world has instead of a Milky Way
    colour += uNight * band * vec3(0.05, 0.03, 0.09);
    vec3 cell = floor(q * 170.0);
    float h = hash(cell), edge = 0.9955 - band * 0.006;
    if (h > edge) colour += uNight * (0.5 + 0.5 * sin(uTime * (1.0 + h * 5.0) + h * 60.0)) * mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.8), fract(h * 91.0));
  }
  gl_FragColor = vec4(mix(colour, uUnderColour, uUnder), 1.0);
}
`,
});
export const cloudMat = new THREE.ShaderMaterial({
  uniforms: shared, toneMapped: false,
  vertexShader: /* glsl */`
attribute float shade;
varying float vShade;
varying vec3 vWorld;
void main() {
  vShade = shade;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,
  fragmentShader: /* glsl */`
uniform vec3 uCloudColour;
varying float vShade;
varying vec3 vWorld;
${SKY}
void main() {
  vec3 ray = vWorld - cameraPosition;
  float dist = length(ray);
  gl_FragColor = vec4(mix(uCloudColour * vShade, skyColour(ray / dist), smoothstep(180.0, ${(CLOUD_SPAN * 0.62).toFixed(1)}, dist)), 1.0);
}
`,
});

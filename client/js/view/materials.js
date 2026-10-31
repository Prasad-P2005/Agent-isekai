// How the world is shaded: the block layers, water, the sky and the clouds. All of it reads one set of shared uniforms, which view/sky.js updates each frame.
//
// There are two looks in these same shaders. The base game works as block games do: colours stay in display space from painted texture to screen, because tone mapping
// is for the bodies and here it would only pull the art towards grey. With SHADERS defined, view/pipeline.js takes over: colours go linear and bright, sunlight and shadow
// are worked out per pixel, and everything is drawn into a high range buffer that is tone mapped at the end. Each block below reads as either one or the other.
import * as THREE from 'three';
import { TILE, TILE_NAMES, allTiles } from './blocktex.js';

export const CLOUD_CELLS = 64, CLOUD_CELL = 12, CLOUD_SPAN = CLOUD_CELLS * CLOUD_CELL;
const RIPPLE_SIZE = 64;

function tileArray() {
  const t = new THREE.DataArrayTexture(allTiles(), TILE, TILE, TILE_NAMES.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; // a merged top runs across many blocks
  t.generateMipmaps = true;
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
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
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
  uTime: { value: 0 }, uTurn: { value: 0 }, uSwayOn: { value: 1 },
  uTiles: { value: tileArray() }, uRipple: { value: rippleMap() }, uCloudMap: { value: null }, uCloudWind: { value: new THREE.Vector2() },
  uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uDaylight: { value: new THREE.Color() }, uLamp: { value: new THREE.Color(1, 1, 1) },
  uCave: { value: 0 }, uCaveAir: { value: new THREE.Color() }, uCaveHaze: { value: new THREE.Color() }, uTorch: { value: 0 },
  uSpark: { value: new THREE.Vector4(0, -999, 0, 1) }, uSparkColour: { value: new THREE.Color(0, 0, 0) }, // one moving light: the fireball in the air, or its blast
  uFogNear: { value: 90 }, uFogFar: { value: 150 }, uUnder: { value: 0 }, uUnderColour: { value: new THREE.Color() },
  uNight: { value: 0 }, uSunlit: { value: 1 }, uCloudColour: { value: new THREE.Color() }, uCloudShade: { value: 0 },
  // only with shaders
  uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColour: { value: new THREE.Color() }, uAmbient: { value: new THREE.Color() }, uLeafGlow: { value: 1 },
  uShadowMap: { value: null }, uShadowMat: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] }, uShadowBias: { value: new THREE.Vector3(0.06, 0.16, 0.5) }, uShadowTexel: { value: new THREE.Vector2(1, 1) },
  uColor: { value: null }, uDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) }, uDepthA: { value: -1 }, uDepthB: { value: -0.2 },
  uViewProj: { value: new THREE.Matrix4() }, uRippleHeight: { value: 1 }, uClarity: { value: 1 },
};

// The sky's colour in a direction. Fog fades to this rather than to one flat colour, which is what puts the land into the sky at sunset.
const SKY = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uUnderColour;
uniform float uUnder;
vec3 skyColour(vec3 d) {
  float up = clamp(d.y, 0.0, 1.0), sun = max(dot(d, uSunDir), 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.5));
#ifdef SHADERS
  float low = 1.0 - up;
  c += uGlow * (pow(sun, 3.0) * 0.55 * low * low + pow(sun, 18.0) * 0.6 + pow(sun, 220.0) * 3.0);
#else
  c += uGlow * (pow(sun, 5.0) * 0.45 * (1.0 - up) + pow(sun, 40.0) * 0.35);
#endif
  if (d.y < 0.0) c *= 1.0 + d.y * 0.25;
  return c;
}
`;
const FOG = /* glsl */`
uniform float uFogNear, uFogFar, uCave, uClarity;
uniform vec3 uCaveHaze;
#ifdef SHADERS
const vec3 WATER_LOSS = vec3(0.3, 0.075, 0.05); // what a block of water takes out of the light going through it: red first, which is why deep water is blue
#endif
vec3 fogged(vec3 colour, vec3 world) {
  vec3 ray = world - cameraPosition;
  float dist = length(ray);
  float amount = smoothstep(min(mix(uFogNear, 24.0, uCave), uFogFar * 0.9), uFogFar, dist); // near must stay below far, at the shortest render distance too
#ifdef SHADERS
  amount = max(amount, (1.0 - exp(-dist * 0.0024)) * 0.5 * (1.0 - uCave)); // the far land goes pale before it goes
#endif
  vec3 air = mix(colour, mix(skyColour(ray / dist), uCaveHaze, uCave), amount);
  if (uUnder <= 0.0) return air;
#ifdef SHADERS
  vec3 through = exp(-WATER_LOSS * dist / uClarity);
  return mix(air, colour * through + uUnderColour * (1.0 - through), uUnder);
#else
  return mix(air, mix(colour, uUnderColour, smoothstep(1.5, 34.0, dist)), uUnder);
#endif
}
`;
const NOISE = /* glsl */`
float grain(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); } // a noise that spreads evenly, so a few samples read as many
`;
// Three squares of the sun's view side by side, sharpest first. A pixel reads the sharpest one it falls inside, and the edge between two is broken up with noise.
const SHADOW_VERTEX = /* glsl */`
uniform mat4 uShadowMat[3];
uniform vec3 uShadowBias;
varying vec3 vShadow0, vShadow1, vShadow2;
void shadowCoords(vec3 world, vec3 normal) {
  vShadow0 = (uShadowMat[0] * vec4(world + normal * uShadowBias.x, 1.0)).xyz;
  vShadow1 = (uShadowMat[1] * vec4(world + normal * uShadowBias.y, 1.0)).xyz;
  vShadow2 = (uShadowMat[2] * vec4(world + normal * uShadowBias.z, 1.0)).xyz;
}
`;
const SHADOW_FRAGMENT = /* glsl */`
uniform highp sampler2DShadow uShadowMap;
uniform vec2 uShadowTexel;
varying vec3 vShadow0, vShadow1, vShadow2;
#ifndef NO_SHADOWS
float edgeOf(vec3 p) { return max(max(abs(p.x - 0.5), abs(p.y - 0.5)) * 2.0, abs(p.z - 0.5) * 2.0); }
float tapsAt(vec3 p, float tile, float radius, float noise) {
  vec2 at = vec2((p.x + tile) / 3.0, p.y);
#if SHADOW_TAPS > 1
  float sum = 0.0, turn = noise * 6.2831853;
  for (int i = 0; i < SHADOW_TAPS; i++) {
    float r = sqrt((float(i) + 0.5) / float(SHADOW_TAPS)), a = float(i) * 2.399963 + turn;
    sum += texture(uShadowMap, vec3(at + vec2(cos(a), sin(a)) * r * radius * uShadowTexel, p.z));
  }
  return sum / float(SHADOW_TAPS);
#else
  return texture(uShadowMap, vec3(at, p.z));
#endif
}
#endif
float sunShadow(float noise) {
#ifdef NO_SHADOWS
  return 1.0;
#else
  float a = edgeOf(vShadow0), b = edgeOf(vShadow1), c = edgeOf(vShadow2), fray = 0.96 - noise * 0.12;
  if (a < fray) return tapsAt(vShadow0, 0.0, 2.4, noise);
  if (b < fray) return tapsAt(vShadow1, 1.0, 1.7, noise);
  if (c < 0.98) return mix(tapsAt(vShadow2, 2.0, 1.1, noise), 1.0, smoothstep(0.8, 0.98, c)); // past the last square it simply fades out
  return 1.0;
#endif
}
`;

const BLOCK_VERTEX = /* glsl */`
attribute vec4 cell;
attribute vec2 uvs;
attribute vec4 lit;
attribute vec4 lamp;
attribute vec4 tint;
uniform float uTime, uSwayOn;
varying vec3 vUvl, vWorld, vNormal, vLamp, vTint, vFlags;
varying vec4 vLit;
#ifdef SHADERS
${SHADOW_VERTEX}
#endif
const vec3 NORMALS[7] = vec3[7](vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), vec3(0.0, 1.0, 0.0));
const float FACE_SHADE[7] = float[7](0.66, 0.66, 1.0, 0.52, 0.82, 0.82, 1.0);
void main() {
  vec4 world = modelMatrix * vec4(cell.xyz / 64.0, 1.0);
  int flags = int(tint.a * 255.0 + 0.5), face = flags & 7;
  if (lit.b > 0.0) { // leaves stir, plants bend at the top, and kelp leans with the current
    float slow = lit.b > 0.9 ? 1.1 : 1.8, reach = (lit.b > 0.9 ? 0.2 : lit.b > 0.6 ? 0.11 : 0.04) * uSwayOn;
    float wave = uTime * slow + world.x * 0.7 + world.z * 0.55 + world.y * 0.35;
    float gust = 0.65 + 0.35 * sin(uTime * 0.31 + world.x * 0.05 + world.z * 0.04);
    world.x += sin(wave) * reach * gust;
    world.z += cos(wave * 0.83) * reach * gust;
  }
  vUvl = vec3(uvs / 64.0, cell.w);
  vNormal = NORMALS[face];
  vLamp = lamp.rgb; vTint = tint.rgb; vWorld = world.xyz;
  vFlags = vec3((flags & 8) != 0 ? 1.0 : 0.0, (flags & 16) != 0 ? 1.0 : 0.0, (flags & 32) != 0 ? 1.0 : 0.0); // the top turns, a solid leaf, sunlight comes through it
#ifdef SHADERS
  vLit = vec4(lit.r, clamp(lit.g / FACE_SHADE[face], 0.0, 1.0), lit.a, lamp.a * 31.875); // the sun does the work of the face shading here, which leaves corner shade
  shadowCoords(world.xyz, vNormal);
#else
  vLit = vec4(lit.r, lit.g, lit.a, lamp.a * 31.875);
#endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
const BLOCK_FRAGMENT = /* glsl */`
uniform sampler2DArray uTiles;
uniform sampler2D uCloudMap;
uniform vec2 uCloudWind;
uniform vec3 uDaylight, uLamp, uCaveAir, uSparkColour;
uniform vec4 uSpark;
uniform float uTorch;
uniform float uTime, uCloudShade, uSunlit;
varying vec3 vUvl, vWorld, vNormal, vLamp, vTint, vFlags;
varying vec4 vLit;
${SKY}${FOG}
const vec3 TORCH = vec3(1.0, 0.72, 0.42);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float blockHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
// The top of a grassy block is turned a random way, so that a meadow doesn't show its grid.
vec4 tileColour() {
  if (vFlags.x < 0.5) return texture(uTiles, vUvl);
  vec2 f = fract(vUvl.xy);
  float r = floor(hash(floor(vWorld.xz + 0.001)) * 4.0);
  vec2 turned = r < 1.0 ? f : r < 2.0 ? vec2(f.y, 1.0 - f.x) : r < 3.0 ? 1.0 - f : vec2(1.0 - f.y, f.x);
  return textureGrad(uTiles, vec3(turned, vUvl.z), dFdx(vUvl.xy), dFdy(vUvl.xy));
}
#ifdef SHADERS
uniform vec3 uLightDir, uSunColour, uAmbient;
uniform float uLeafGlow;
${NOISE}${SHADOW_FRAGMENT}
// Light through moving water, sharp lines on the blocks' own pixel grid.
float caustic(vec2 p) {
  p = floor(p * 16.0) / 16.0;
  float t = uTime * 0.7;
  float a = sin(p.x * 1.7 + t + sin(p.y * 1.3 - t * 0.7) * 1.6), b = sin(p.y * 2.1 - t * 0.8 + sin(p.x * 1.1 + t * 0.5) * 1.6);
  return pow(1.0 - abs(a + b) * 0.5, 6.0);
}
#else
float caustic(vec2 p) { // light through moving water, on the blocks' own pixel grid
  p = floor(p * 8.0) / 8.0;
  float a = sin(p.x * 2.3 + uTime * 1.1 + sin(p.y * 1.7 + uTime * 0.7) * 1.4);
  float b = sin(p.y * 2.9 - uTime * 0.9 + sin(p.x * 1.3 - uTime * 0.6) * 1.4);
  return pow(0.5 + 0.5 * a * b, 3.0);
}
#endif
void main() {
  vec4 tex = tileColour();
#if defined(CUTOUT)
  if (tex.a < 0.4) discard;
  vec3 albedo = tex.rgb * vTint;
  float alpha = 1.0;
#elif defined(BLEND)
  vec3 albedo = tex.rgb * vTint;
  float alpha = tex.a;
#else
  vec3 albedo = tex.rgb * mix(vec3(1.0), vTint, clamp(tex.a * 2.0 - 1.0, 0.0, 1.0));
  if (vFlags.y > 0.5) albedo = vTint * (tex.a < 0.4 ? vec3(0.3) : tex.rgb); // fast leaves have no holes, just dark places
  albedo *= 0.95 + 0.05 * blockHash(floor(vWorld - vNormal * 0.5)); // no two blocks of a wall are quite the same
  float alpha = 1.0;
#endif
  float cover = texture2D(uCloudMap, (vWorld.xz - uCloudWind) / ${CLOUD_SPAN.toFixed(1)}).r;
  float flicker = 1.0 + 0.05 * sin(uTime * 7.0 + floor(vWorld.x * 0.2) * 3.1 + floor(vWorld.z * 0.2) * 1.7);
  float held = uTorch * pow(max(0.0, 1.0 - length(vWorld - cameraPosition) / 18.0), 2.0); // a torch in the hand
  vec3 toSpark = uSpark.xyz - vWorld;
  float spark = max(0.0, 1.0 - length(toSpark) / uSpark.w);
  spark *= spark * (0.45 + 0.55 * max(dot(vNormal, normalize(toSpark)), 0.0)); // the moving light has a side it faces
  float depth = vLit.a; // how much water stands over this, in blocks
#ifdef SHADERS
  albedo = pow(albedo, vec3(2.2));
  float noise = grain(gl_FragCoord.xy), skyLevel = vLit.r, shade = vLit.g;
  // The sky level keeps the sun out of a cave however the shadow map falls.
  float open = smoothstep(0.3, 0.8, skyLevel) * (1.0 - min(1.0, uCloudShade * 3.0) * cover), sun = open > 0.001 ? sunShadow(noise) * open : 0.0;
  float facing = max(dot(vNormal, uLightDir), 0.0), leafy = vFlags.z;
  vec3 ray = normalize(vWorld - cameraPosition);
  float behind = pow(max(dot(ray, uLightDir), 0.0), 4.0);
  // Foliage takes the light on every side, and glows when it is between you and the sun.
  float direct = mix(facing, 0.5 + 0.5 * facing, leafy);
  vec3 through = uSunColour * sun * leafy * uLeafGlow * (0.16 + 1.1 * behind);
  vec3 sky = uAmbient * skyLevel * skyLevel * (0.66 + 0.34 * (vNormal.y * 0.5 + 0.5)) * shade;
  vec3 lamp = vLamp * vLamp * vLamp * 2.6 * flicker * uLamp + TORCH * held * 1.5 + uSparkColour * spark;
  vec3 air = uCaveAir * uCaveAir * uCave * 1.6 + vec3(0.004, 0.005, 0.008);
  vec3 sunlit = uSunColour * direct * sun * mix(0.72 + 0.28 * shade, 1.0, leafy);
  if (depth > 0.0) { // light has come down through the water to get here
    vec3 loss = exp(-WATER_LOSS * depth / uClarity);
    sunlit *= loss; sky *= loss; through *= loss;
#ifdef CAUSTICS
    sunlit += uSunColour * caustic(vWorld.xz * 0.9 + vWorld.y * 0.3 + vNormal.xz) * sun * loss * 1.4 * max(vNormal.y, 0.25);
#endif
  }
  vec3 colour = albedo * (sunlit + sky + lamp + air) + albedo * vec3(1.05, 1.2, 0.55) * through;
  colour = mix(colour, albedo * 1.3, vLit.b) + albedo * vLit.b * vLit.b * 1.6;
#else
  float sky = vLit.r * vLit.r * (0.35 + 0.65 * vLit.r);
  sky *= 1.0 - uCloudShade * cover * smoothstep(0.5, 1.0, vLit.r); // a cloud's shadow crosses the open ground and leaves the shade alone
  vec3 lamp = max(vLamp * vLamp * flicker, TORCH * held) + uSparkColour * spark;
  vec3 light = 1.0 - (1.0 - uDaylight * sky) * (1.0 - uLamp * clamp(lamp, 0.0, 1.0)) * (1.0 - uCaveAir * uCave);
  light = max(light, vec3(0.045, 0.05, 0.07));
  vec3 colour = albedo * light * vLit.g;
  if (vLit.b > 0.0) colour = mix(colour, albedo * (0.94 + 0.08 * sin(uTime * 1.6 + vWorld.x + vWorld.z)), vLit.b);
  if (depth > 0.0) {
    colour *= mix(vec3(0.82, 0.94, 0.97), vec3(0.3, 0.54, 0.66), clamp(depth / 24.0, 0.0, 1.0)); // the deeper the bluer
    if (vNormal.y > 0.5) colour += albedo * caustic(vWorld.xz * 0.9) * 0.3 * uSunlit * vLit.r * exp(-depth * 0.09);
  }
#endif
  gl_FragColor = vec4(fogged(colour, vWorld), alpha);
}
`;
const WATER_VERTEX = /* glsl */`
attribute vec4 cell;
attribute vec4 lit;
attribute vec4 lamp;
varying vec3 vWorld, vLamp;
varying vec2 vWater;
varying float vSurface, vViewZ;
#ifdef SHADERS
${SHADOW_VERTEX}
#endif
void main() {
  vec4 world = modelMatrix * vec4(cell.xyz / 64.0, 1.0), view = viewMatrix * world;
  vWorld = world.xyz; vWater = lit.rg; vLamp = lamp.rgb; vSurface = lit.b; vViewZ = -view.z;
#ifdef SHADERS
  shadowCoords(world.xyz, vec3(0.0, 1.0, 0.0));
#endif
  gl_Position = projectionMatrix * view;
}
`;
// The base game's water: a plain clear blue that keeps to the blocks' pixels.
const WATER_PLAIN = /* glsl */`
const vec3 SHALLOW = vec3(0.24, 0.62, 0.76), DEEP = vec3(0.07, 0.27, 0.52);
void main() {
  vec3 ray = normalize(vWorld - cameraPosition);
  vec2 cell = floor(vWorld.xz * 16.0) / 16.0; // ripples keep to the pixels of the blocks around them
  vec2 a = texture2D(uRipple, cell * 0.11 + uTime * vec2(0.021, 0.013)).rg, b = texture2D(uRipple, cell * 0.27 - uTime * vec2(0.017, 0.029)).rg;
  float sky = vWater.r, depth = vWater.g;
  if (!gl_FrontFacing) { // from below, the surface is a bright, shifting ceiling, and a wall of water is only a pane
    vec3 up = vSurface > 0.5 ? mix(uUnderColour * 1.5, skyColour(vec3(ray.x, -ray.y, ray.z)), 0.35 + 0.3 * a.x) : uUnderColour;
    gl_FragColor = vec4(fogged(up, vWorld), vSurface > 0.5 ? 0.82 : 0.4);
    return;
  }
  float level = sky * sky * (0.35 + 0.65 * sky), shimmer = (a.x + b.y - 1.0) * 0.5 * vSurface;
  vec3 lamp = vLamp * vLamp, light = 1.0 - (1.0 - uDaylight * level) * (1.0 - uLamp * clamp(lamp, 0.0, 1.0));
  light = max(light, vec3(0.05, 0.06, 0.09));
  vec3 body = mix(SHALLOW, DEEP, smoothstep(0.0, 0.75, depth)) * (1.0 + shimmer) * light;
  float grazing = pow(1.0 - max(abs(ray.y), 0.0), 4.0);
  vec3 colour = mix(body, skyColour(vec3(ray.x, abs(ray.y), ray.z)) * (0.35 + 0.65 * sky), grazing * 0.55 * vSurface);
  gl_FragColor = vec4(fogged(colour, vWorld), mix(0.52, 0.84, smoothstep(0.0, 0.6, depth)) + grazing * 0.12);
}
`;
// With shaders, water is drawn solid: it reads what lies behind it from the finished picture, bends it, dims it by how much water the eye looks through, and lays the sky
// and the land over it by how shallow the angle is. Reflections walk along the depth buffer, and where they find nothing they fall back on the sky.
const WATER_DEEP = /* glsl */`
uniform highp sampler2D uColor;
uniform highp sampler2D uDepth;
uniform mat4 uViewProj;
uniform vec2 uResolution;
uniform vec3 uLightDir, uSunColour, uAmbient;
uniform float uDepthA, uDepthB, uRippleHeight;
${NOISE}${SHADOW_FRAGMENT}
const vec3 WATER_GLOW = vec3(0.012, 0.075, 0.11);
float viewZ(float d) { return uDepthB / (d * 2.0 - 1.0 + uDepthA); }
vec3 waterNormal(vec2 p, float dist) {
  vec2 a = texture2D(uRipple, p * 0.05 + uTime * vec2(0.014, 0.009)).rg, b = texture2D(uRipple, p * 0.13 - uTime * vec2(0.021, 0.031)).rg, c = texture2D(uRipple, p * 0.37 + uTime * vec2(-0.043, 0.037)).rg;
  vec2 slope = ((a - 0.5) + (b - 0.5) * 0.7 + (c - 0.5) * 0.4) * 0.34 * uRippleHeight / (1.0 + dist * 0.012);
  return normalize(vec3(slope.x, 1.0, slope.y));
}
#ifdef REFLECTIONS
// Steps out along the ray, each a little longer than the last, until it passes behind something, then closes in on where.
vec4 traced(vec3 from, vec3 dir, float noise) {
  float t = 0.4 + noise * 0.5, last = 0.0, stride = 0.7;
  for (int i = 0; i < REFLECTIONS; i++) {
    vec4 clip = uViewProj * vec4(from + dir * t, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float gap = clip.w - viewZ(texture2D(uDepth, uv).r);
    if (gap > 0.0 && gap < stride * 2.5 + 0.6) {
      float a = last, b = t;
      for (int j = 0; j < 4; j++) {
        float m = (a + b) * 0.5;
        vec4 c = uViewProj * vec4(from + dir * m, 1.0);
        if (c.w - viewZ(texture2D(uDepth, c.xy / c.w * 0.5 + 0.5).r) > 0.0) b = m; else a = m;
      }
      vec4 c = uViewProj * vec4(from + dir * b, 1.0);
      uv = c.xy / c.w * 0.5 + 0.5;
      vec2 edge = min(uv, 1.0 - uv);
      return vec4(texture2D(uColor, uv).rgb, smoothstep(0.0, 0.08, min(edge.x, edge.y)));
    }
    last = t; t += stride; stride *= 1.22;
  }
  return vec4(0.0);
}
#endif
void main() {
  vec3 view = vWorld - cameraPosition;
  float dist = length(view);
  vec3 ray = view / dist;
  vec3 normal = vSurface > 0.5 ? waterNormal(vWorld.xz, dist) : vec3(0.0, 1.0, 0.0);
  vec2 screen = gl_FragCoord.xy / uResolution;
  float noise = grain(gl_FragCoord.xy), sky = vWater.r, skyMask = sky * sky;
  vec3 lamp = vLamp * vLamp * vLamp * 2.2;
  if (!gl_FrontFacing) { // from below, the sky is a bright circle overhead and the rest of the surface is a mirror
    vec3 bent = refract(ray, vec3(normal.x, -normal.y, normal.z), 1.33);
    vec3 colour = dot(bent, bent) > 0.0 ? mix(skyColour(bent) * 1.5, uUnderColour, 0.2) : uUnderColour * (0.5 + 0.5 * texture2D(uRipple, vWorld.xz * 0.1).r);
    if (vSurface < 0.5) colour = uUnderColour;
    gl_FragColor = vec4(fogged(colour + uSunColour * pow(max(dot(bent, uLightDir), 0.0), 64.0) * 0.5, vWorld), 1.0);
    return;
  }
  // How much water the eye looks through to reach what is behind it.
  float behind = viewZ(texture2D(uDepth, screen).r);
  float thick = max(behind - vViewZ, 0.0) * dist / max(vViewZ, 0.001);
  vec2 bentAt = screen + normal.xz * 0.05 * min(thick * 0.25, 1.0) / (1.0 + dist * 0.03);
  float bentBehind = viewZ(texture2D(uDepth, bentAt).r);
  if (bentBehind < vViewZ) { bentAt = screen; bentBehind = behind; } // what the bend landed on stands in front of the water
  thick = max(bentBehind - vViewZ, 0.0) * dist / max(vViewZ, 0.001);
  vec3 through = exp(-WATER_LOSS * thick / uClarity), below = texture2D(uColor, bentAt).rgb * through;
  float sun = sunShadow(noise) * smoothstep(0.3, 0.8, sky);
  below += (WATER_GLOW * (uAmbient * 2.2 * skyMask + uSunColour * 0.5 * sun) + lamp * 0.16) * (1.0 - through);
  vec3 bounce = reflect(ray, normal);
  bounce.y = abs(bounce.y);
  vec3 mirror = skyColour(bounce) * mix(0.3, 1.0, skyMask);
#ifdef REFLECTIONS
  vec4 hit = traced(vWorld + vec3(0.0, 0.02, 0.0), bounce, noise);
  mirror = mix(mirror, hit.rgb, hit.a);
#endif
  float facing = max(dot(-ray, normal), 0.0), fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 colour = mix(below, mirror, fresnel);
  // The sun on the water: a tight glint, and a broad sheen under it.
  vec3 half_ = normalize(uLightDir - ray);
  float glint = pow(max(dot(normal, half_), 0.0), 700.0) * 14.0 + pow(max(dot(normal, half_), 0.0), 60.0) * 0.12;
  colour += uSunColour * glint * sun;
  // Foam comes and goes where the water runs out.
  float shore = 1.0 - smoothstep(0.0, 0.9, thick);
  if (shore > 0.0 && vSurface > 0.5) {
    float foam = smoothstep(0.55, 0.62, texture2D(uRipple, floor(vWorld.xz * 16.0) / 16.0 * 0.2 + uTime * 0.012).r + shore * 0.55 - 0.25 + 0.1 * sin(uTime * 0.9 + vWorld.x * 0.6 + vWorld.z * 0.8));
    colour = mix(colour, (uSunColour * sun * 0.9 + uAmbient * skyMask * 1.2) * 0.9, foam * shore);
  }
  gl_FragColor = vec4(fogged(colour, vWorld), 1.0);
}
`;
const WATER_FRAGMENT = /* glsl */`
uniform sampler2D uRipple, uCloudMap;
uniform vec3 uDaylight, uLamp;
uniform float uTime, uSunlit;
varying vec3 vWorld, vLamp;
varying vec2 vWater;
varying float vSurface, vViewZ;
${SKY}${FOG}
#ifdef SHADERS
${WATER_DEEP}
#else
${WATER_PLAIN}
#endif
`;

const worldMaterials = [];
function kept(material) { worldMaterials.push(material); return material; }
function blockMaterial(defines, options = {}) {
  return kept(new THREE.ShaderMaterial({ uniforms: shared, vertexShader: BLOCK_VERTEX, fragmentShader: BLOCK_FRAGMENT, defines, toneMapped: false, ...options }));
}
export const solidMat = blockMaterial({});
export const cutoutMat = blockMaterial({ CUTOUT: 1 }, { side: THREE.DoubleSide });
export const glassMat = blockMaterial({ BLEND: 1 }, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
export const waterMat = kept(new THREE.ShaderMaterial({ uniforms: shared, vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT, defines: {}, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));

// What the sun sees. Only depth matters, and the sway matches, or a tree's shadow would stand still under its moving leaves.
const CASTER_VERTEX = /* glsl */`
attribute vec4 cell;
attribute vec2 uvs;
attribute vec4 lit;
uniform float uTime, uSwayOn;
varying vec3 vUvl;
void main() {
  vec4 world = modelMatrix * vec4(cell.xyz / 64.0, 1.0);
  if (lit.b > 0.0) {
    float slow = lit.b > 0.9 ? 1.1 : 1.8, reach = (lit.b > 0.9 ? 0.2 : lit.b > 0.6 ? 0.11 : 0.04) * uSwayOn;
    float wave = uTime * slow + world.x * 0.7 + world.z * 0.55 + world.y * 0.35;
    float gust = 0.65 + 0.35 * sin(uTime * 0.31 + world.x * 0.05 + world.z * 0.04);
    world.x += sin(wave) * reach * gust;
    world.z += cos(wave * 0.83) * reach * gust;
  }
  vUvl = vec3(uvs / 64.0, cell.w);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
const CASTER_FRAGMENT = /* glsl */`
uniform sampler2DArray uTiles;
varying vec3 vUvl;
void main() {
#ifdef CUTOUT
  if (texture(uTiles, vUvl).a < 0.4) discard;
#endif
  gl_FragColor = vec4(1.0);
}
`;
const caster = (defines, side) => new THREE.ShaderMaterial({ uniforms: shared, vertexShader: CASTER_VERTEX, fragmentShader: CASTER_FRAGMENT, defines, side, colorWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1.2, polygonOffsetUnits: 2 });
export const shadowSolidMat = caster({}, THREE.FrontSide); // every way into a closed shape starts at a face towards the light
export const shadowCutoutMat = caster({ CUTOUT: 1 }, THREE.DoubleSide);

export const skyMat = kept(new THREE.ShaderMaterial({
  uniforms: shared, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false, defines: {},
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
}));
export const cloudMat = kept(new THREE.ShaderMaterial({
  uniforms: shared, toneMapped: false, defines: {},
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
  ray /= dist;
  vec3 colour = uCloudColour * vShade;
#ifdef SHADERS
  float sun = max(dot(ray, uSunDir), 0.0);
  colour += uGlow * (pow(sun, 4.0) * 0.5 + pow(sun, 30.0)) * (0.4 + 0.6 * vShade); // lit through from behind, like the rest of the air
#endif
  gl_FragColor = vec4(mix(colour, skyColour(ray), smoothstep(180.0, ${(CLOUD_SPAN * 0.62).toFixed(1)}, dist)), 1.0);
}
`,
}));

// Switches every world material between the two looks. three keeps compiled shaders, so going back and forth is quick after the first time.
export function setLook(defines) {
  for (const m of worldMaterials) {
    for (const k of ['SHADERS', 'NO_SHADOWS', 'SHADOW_TAPS', 'CAUSTICS', 'REFLECTIONS']) delete m.defines[k];
    Object.assign(m.defines, defines);
    m.needsUpdate = true;
  }
  waterMat.depthWrite = !!defines.SHADERS;
}

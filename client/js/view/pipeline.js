// How a frame is drawn. With shaders off that is one call, straight to the screen. With them on, it goes:
//   1. the sun's view, into three squares of one depth map, near ones often and far ones rarely
//   2. the solid world, into a high range picture with its depth kept
//   3. contact shadows from that depth, laid over the picture
//   4. water and glass, which read the picture behind them
//   5. shafts of light, by walking each view ray through the shadow map at half size
//   6. bloom, from a chain of ever smaller copies
//   7. tone mapping and the colour settings, then smoothed edges, to the screen
// Everything here is switched by settings:changed and rebuilt at the top of the next frame, never in the middle of one. If a shader will not compile on this machine the
// game goes back to its base look and says so, because a black screen is the one thing that must not happen.
import * as THREE from 'three';
import { emit, on, toast } from '../core/events.js';
import { settings, turnOffShaders } from '../core/settings.js';
import { listCasters, shadowGroup, shadowScene } from './chunkmesh.js';
import { setLook, shared } from './materials.js';
import { BODY_LAYER, LATE_LAYER, camera, renderer, scene } from './scene.js';

const QUALITY = [null, { tile: 640, far: 120 }, { tile: 1024, far: 180 }, { tile: 1365, far: 220 }, { tile: 2048, far: 270 }]; // shadows setting -> pixels a square, and how far the last one reaches
const NEAR_HALF = 20, MID_HALF = 58, DEPTH_RANGE = 1000, SHADOW_TAPS = [1, 5, 9], REFLECT_STEPS = [0, 0, 24, 48], RAY_STEPS = [0, 6, 10, 16], EVERY = [1, 2, 4], BLOOM_STEPS = 5;
const AO_SAMPLES = [0, 8, 14], RAY_RANGE = 110, RAY_DENSITY = 0.006, EXPOSURE = 0.74;

const canRun = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
let active = false, stale = true, built = false, failed = false, frame = 0;
export const shadersActive = () => active;

renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  console.error('A shader would not compile.', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
  failed = true;
};
function fallBack(why) {
  console.error(why);
  failed = false;
  if (!settings.shaders) return;
  toast('Shaders would not run on this graphics card, so they are off.', 8);
  turnOffShaders();
}

// ---------- full screen passes ----------
const quadScene = new THREE.Scene(), quadCamera = new THREE.Camera(), triangle = new THREE.BufferGeometry();
triangle.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const quad = new THREE.Mesh(triangle);
quad.frustumCulled = false;
quadScene.add(quad);
function pass(material, target) {
  quad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(quadScene, quadCamera);
}
const COVER = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const GRAIN = /* glsl */`
float grain(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
// A sampler is low precision unless told otherwise, which is too little for colours brighter than white.
const fullScreen = (fragmentShader, uniforms, options = {}) => new THREE.ShaderMaterial({ vertexShader: COVER, fragmentShader: `precision highp sampler2D;\n${fragmentShader}`, uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending, ...options });

const tDepth = { value: null }, tColor = { value: null }, uTexel = { value: new THREE.Vector2() };
const uProjInv = { value: new THREE.Vector2() }, uProjScale = { value: 1 }, uInvViewProj = { value: new THREE.Matrix4() }, uEye = { value: new THREE.Vector3() };

// Contact shadows: what stands close above a surface darkens it. Normals come from the depth itself, so nothing else has to be drawn for this.
const aoMat = fullScreen(/* glsl */`
uniform highp sampler2D tDepth;
uniform vec2 uProjInv, uTexel;
uniform float uDepthA, uDepthB, uProjScale;
varying vec2 vUv;
${GRAIN}
vec3 viewAt(vec2 uv) {
  float z = uDepthB / (texture2D(tDepth, uv).r * 2.0 - 1.0 + uDepthA);
  return vec3((uv * 2.0 - 1.0) * uProjInv * z, -z);
}
void main() {
  if (texture2D(tDepth, vUv).r >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewAt(vUv), n = normalize(cross(dFdx(p), dFdy(p)));
  float reach = min(1.1 * uProjScale / -p.z, 42.0), turn = grain(gl_FragCoord.xy) * 6.2831853, sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES), a = float(i) * 2.399963 + turn;
    vec3 q = viewAt(vUv + vec2(cos(a), sin(a)) * t * reach * uTexel) - p;
    float near = dot(q, q);
    sum += max(dot(n, q) - 0.03, 0.0) / (near + 0.06) * (1.0 - smoothstep(0.5, 3.0, near));
  }
  gl_FragColor = vec4(vec3(clamp(1.0 - sum / float(SAMPLES) * 1.3, 0.0, 1.0)), 1.0);
}
`, { tDepth, uProjInv, uTexel: { value: new THREE.Vector2() }, uDepthA: shared.uDepthA, uDepthB: shared.uDepthB, uProjScale }, { defines: { SAMPLES: 8 } });

// A small blur, which is all that noisy half size passes need.
const softMat = fullScreen(/* glsl */`
uniform sampler2D tColor;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tColor, vUv) * 2.0;
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)) + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0));
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)) + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0));
  c += texture2D(tColor, vUv + uTexel * vec2(-2.0, 0.0)) * 0.5 + texture2D(tColor, vUv + uTexel * vec2(2.0, 0.0)) * 0.5;
  c += texture2D(tColor, vUv + uTexel * vec2(0.0, -2.0)) * 0.5 + texture2D(tColor, vUv + uTexel * vec2(0.0, 2.0)) * 0.5;
  gl_FragColor = c / 8.0;
}
`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } });

// The picture goes across with its depth, so that water can be drawn over it with the depth test still working, while it reads the picture it came from.
const tShade = { value: null }, uShade = { value: 0 };
const restoreMat = fullScreen(/* glsl */`
uniform sampler2D tColor, tShade;
uniform highp sampler2D tDepth;
uniform float uShade;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).r;
  vec3 c = texture2D(tColor, vUv).rgb;
  if (uShade > 0.0 && d < 1.0) c *= texture2D(tShade, vUv).r;
  gl_FragColor = vec4(c, 1.0);
  gl_FragDepth = d;
}
`, { tColor: { value: null }, tDepth: { value: null }, tShade, uShade }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });

// Shafts of light: each view ray is walked through the two far squares of the shadow map, counting how much of it the sun reaches.
const raysMat = fullScreen(/* glsl */`
uniform highp sampler2D tDepth;
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uInvViewProj, uShadowMat[3];
uniform vec3 uEye, uLightDir, uSunColour, uUnderColour;
uniform float uUnder, uCave, uRange, uDensity;
varying vec2 vUv;
${GRAIN}
bool inside(vec3 p) { return p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0 && p.z > 0.0 && p.z < 1.0; }
float sunSeen(vec3 p) {
  vec3 a = (uShadowMat[1] * vec4(p, 1.0)).xyz;
  if (inside(a)) return texture(uShadowMap, vec3((a.x + 1.0) / 3.0, a.y, a.z));
  vec3 b = (uShadowMat[2] * vec4(p, 1.0)).xyz;
  if (inside(b)) return texture(uShadowMap, vec3((b.x + 2.0) / 3.0, b.y, b.z));
  return 1.0;
}
void main() {
  vec4 w = uInvViewProj * vec4(vUv * 2.0 - 1.0, texture2D(tDepth, vUv).r * 2.0 - 1.0, 1.0);
  vec3 to = w.xyz / w.w - uEye;
  float dist = length(to), span = min(dist, uRange), stride = span / float(STEPS), t = stride * grain(gl_FragCoord.xy), lit = 0.0;
  vec3 ray = to / dist;
  for (int i = 0; i < STEPS; i++) { lit += sunSeen(uEye + ray * t); t += stride; }
  lit /= float(STEPS);
  // Light scatters forward, so shafts are strongest looking towards the sun.
  float mu = dot(ray, uLightDir), g = 0.74, phase = 0.08 + 0.92 * (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5)) * 6.0;
  vec3 shafts = uSunColour * lit * phase * (1.0 - exp(-span * uDensity));
  vec3 sunk = uUnderColour * uSunColour * lit * 3.5 * (0.3 + phase) * (1.0 - exp(-span * 0.05)); // water is far thicker than air
  gl_FragColor = vec4(mix(shafts, sunk, uUnder) * (1.0 - uCave), 1.0);
}
`, { tDepth: { value: null }, uShadowMap: shared.uShadowMap, uInvViewProj, uShadowMat: shared.uShadowMat, uEye, uLightDir: shared.uLightDir, uSunColour: shared.uSunColour, uUnderColour: shared.uUnderColour, uUnder: shared.uUnder, uCave: shared.uCave, uRange: { value: RAY_RANGE }, uDensity: { value: RAY_DENSITY } }, { defines: { STEPS: 10 } });

// Bloom halves the picture a few times, keeping only what is brighter than white the first time, then adds the sizes back together from the smallest up.
const downMat = fullScreen(/* glsl */`
uniform sampler2D tColor;
uniform vec2 uTexel;
uniform float uBright;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * 4.0;
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c /= 8.0;
  if (uBright > 0.0) c *= smoothstep(uBright * 0.6, uBright * 1.5, max(c.r, max(c.g, c.b)));
  gl_FragColor = vec4(min(c, vec3(24.0)), 1.0);
}
`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uBright: { value: 0 } });
const upMat = fullScreen(/* glsl */`
uniform sampler2D tColor, tSmall;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSmall, vUv).rgb * 4.0;
  c += (texture2D(tSmall, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tSmall, vUv + uTexel * vec2(1.0, 0.0)).rgb + texture2D(tSmall, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tSmall, vUv + uTexel * vec2(0.0, 1.0)).rgb) * 2.0;
  c += texture2D(tSmall, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSmall, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSmall, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSmall, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(texture2D(tColor, vUv).rgb + c / 16.0, 1.0);
}
`, { tColor: { value: null }, tSmall: { value: null }, uTexel: { value: new THREE.Vector2() } });

const tBloom = { value: null }, tRays = { value: null };
const look = { uExposure: { value: 1 }, uContrast: { value: 1 }, uSaturation: { value: 1 }, uWarmth: { value: 0 }, uVignette: { value: 0 }, uBloomPower: { value: 0 }, uRaysPower: { value: 0 }, uWarp: { value: 0 } };
const finishMat = fullScreen(/* glsl */`
uniform sampler2D tColor, tBloom, tRays;
uniform float uTime, uUnder, uWarp, uExposure, uContrast, uSaturation, uWarmth, uVignette, uBloomPower, uRaysPower;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if (uUnder > 0.0) uv += vec2(sin(uv.y * 24.0 + uTime * 1.7), cos(uv.x * 19.0 + uTime * 1.3)) * 0.0024 * uUnder * uWarp;
  vec3 c = texture2D(tColor, uv).rgb + texture2D(tRays, uv).rgb * uRaysPower + texture2D(tBloom, uv).rgb * uBloomPower;
  c *= uExposure;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); // the film curve: bright things roll off instead of clipping
  c = pow(c, vec3(1.0 / 2.2));
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  c *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth);
  vec2 q = vUv - 0.5;
  gl_FragColor = vec4(clamp(c * (1.0 - dot(q, q) * uVignette), 0.0, 1.0), 1.0);
}
`, { tColor: { value: null }, tBloom, tRays, uTime: shared.uTime, uUnder: shared.uUnder, ...look });

const fxaaMat = fullScreen(/* glsl */`
uniform sampler2D tColor;
uniform vec2 uTexel;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 m = texture2D(tColor, vUv).rgb;
  float nw = luma(texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb), ne = luma(texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb);
  float sw = luma(texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb), se = luma(texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb), mid = luma(m);
  float low = min(mid, min(min(nw, ne), min(sw, se))), high = max(mid, max(max(nw, ne), max(sw, se)));
  if (high - low < max(0.04, high * 0.1)) { gl_FragColor = vec4(m, 1.0); return; }
  vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
  float reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125), small = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * small, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tColor, vUv + dir * -0.16667).rgb + texture2D(tColor, vUv + dir * 0.16667).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, vUv + dir * -0.5).rgb + texture2D(tColor, vUv + dir * 0.5).rgb);
  float lb = luma(b);
  gl_FragColor = vec4(lb < low || lb > high ? a : b, 1.0);
}
`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } });

// ---------- targets ----------
let sceneRT, finalRT, aoRT, aoSoftRT, raysRT, raysSoftRT, finishRT, shadowRT, downs = [], ups = [];
const owned = [];
function own(rt) { owned.push(rt); return rt; }
const picture = (w, h, options = {}) => own(new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, ...options }));
function drop() {
  for (const rt of owned.splice(0)) { rt.depthTexture?.dispose(); rt.dispose(); }
  built = false;
}
function build() {
  drop();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()), w = size.x, h = size.y, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  const depthOf = () => new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
  sceneRT = picture(w, h, { depthBuffer: true, depthTexture: depthOf() });
  finalRT = picture(w, h, { depthBuffer: true, depthTexture: depthOf() });
  shared.uColor.value = sceneRT.texture; shared.uDepth.value = sceneRT.depthTexture; shared.uResolution.value.set(w, h);
  restoreMat.uniforms.tColor.value = sceneRT.texture; restoreMat.uniforms.tDepth.value = sceneRT.depthTexture;
  tDepth.value = sceneRT.depthTexture;
  raysMat.uniforms.tDepth.value = finalRT.depthTexture;
  finishMat.uniforms.tColor.value = finalRT.texture;
  aoMat.uniforms.uTexel.value.set(1 / hw, 1 / hh);
  uProjScale.value = camera.projectionMatrix.elements[5] * hh * 0.5;
  const fine = { type: THREE.UnsignedByteType, format: THREE.RedFormat };
  aoRT = picture(hw, hh, fine); aoSoftRT = picture(hw, hh, fine);
  raysRT = picture(hw, hh); raysSoftRT = picture(hw, hh);
  finishRT = own(new THREE.WebGLRenderTarget(w, h, { depthBuffer: false }));
  fxaaMat.uniforms.tColor.value = finishRT.texture; fxaaMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  downs = []; ups = [];
  for (let i = 0, a = hw, b = hh; i < BLOOM_STEPS; i++, a = Math.max(1, a >> 1), b = Math.max(1, b >> 1)) {
    downs.push(picture(a, b));
    if (i < BLOOM_STEPS - 1) ups.push(picture(a, b));
  }
  const q = QUALITY[settings.shadows];
  if (q) {
    const tile = Math.min(q.tile, Math.floor(renderer.capabilities.maxTextureSize / 3));
    const depth = new THREE.DepthTexture(tile * 3, tile, THREE.UnsignedIntType);
    depth.compareFunction = THREE.LessEqualCompare; depth.minFilter = depth.magFilter = THREE.LinearFilter;
    shadowRT = own(new THREE.WebGLRenderTarget(tile * 3, tile, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: true, depthTexture: depth, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    shadowRT.scissorTest = true;
    shadowRT.tile = tile;
    shared.uShadowMap.value = depth;
    shared.uShadowTexel.value.set(1 / (tile * 3), 1 / tile);
    cascades.forEach((c, i) => { c.half = [NEAR_HALF, MID_HALF, q.far][i]; c.fresh = false; const texel = 2 * c.half / tile; shared.uShadowBias.value.setComponent(i, texel * 2.2 + 0.015); });
  } else shadowRT = null;
  built = true;
}
on('canvas:resized', () => { stale = true; });

// ---------- the settings ----------
function apply() {
  stale = false;
  const was = active;
  active = !!settings.shaders && canRun;
  if (settings.shaders && !canRun) { turnOffShaders(); toast('This graphics card cannot run shaders.', 6); }
  if (active) {
    const defines = { SHADERS: 1 };
    if (settings.shadows) defines.SHADOW_TAPS = SHADOW_TAPS[settings.softShadows]; else defines.NO_SHADOWS = 1;
    if (settings.caustics) defines.CAUSTICS = 1;
    if (REFLECT_STEPS[settings.waterQuality]) defines.REFLECTIONS = REFLECT_STEPS[settings.waterQuality];
    setLook(defines);
    aoMat.defines.SAMPLES = AO_SAMPLES[settings.ssao] || 8; aoMat.needsUpdate = true;
    raysMat.defines.STEPS = RAY_STEPS[settings.godRays] || 6; raysMat.needsUpdate = true;
    build();
  } else {
    setLook({});
    drop();
  }
  if (was !== active) emit('look:changed', active);
}
const SHAPING = ['shaders', 'shadows', 'softShadows', 'caustics', 'waterQuality', 'ssao', 'godRays'];
on('settings:changed', moved => { if (moved.some(id => SHAPING.includes(id))) stale = true; });
function readDials() {
  look.uExposure.value = EXPOSURE * settings.exposure / 100;
  look.uContrast.value = settings.contrast / 100;
  look.uSaturation.value = settings.saturation / 100;
  look.uWarmth.value = settings.warmth / 500;
  look.uVignette.value = settings.vignette / 100;
  look.uBloomPower.value = 0.16 * settings.bloom / 100;
  look.uRaysPower.value = settings.godRays ? settings.godRayStrength / 100 : 0;
  look.uWarp.value = settings.underwaterWarp / 100;
  shared.uLeafGlow.value = settings.leafGlow / 100;
  shared.uRippleHeight.value = settings.waterRipple / 100;
  shared.uClarity.value = settings.waterClarity / 100;
  uShade.value = settings.ssao ? 1 : 0;
}

// ---------- the sun's view ----------
const cascades = [0, 1, 2].map(i => ({ eye: new THREE.OrthographicCamera(-1, 1, 1, -1, 1, DEPTH_RANGE), half: 1, fresh: false, every: EVERY[i] }));
for (const c of cascades) { c.eye.up.set(0, 0, 1); c.eye.matrixAutoUpdate = false; }
const right = new THREE.Vector3(), up = new THREE.Vector3(), centre = new THREE.Vector3(), casters = [], toTile = new THREE.Matrix4(), bodyDepth = new THREE.MeshDepthMaterial({ colorWrite: false });
toTile.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function drawCascade(c, i) {
  const light = shared.uLightDir.value, tile = shadowRT.tile, texel = 2 * c.half / tile;
  right.crossVectors(c.eye.up, light).normalize(); up.crossVectors(light, right);
  // The square only ever moves by whole pixels of the map, or every shadow's edge would crawl as the hero walks.
  const p = camera.position, r = Math.floor(p.dot(right) / texel) * texel, u = Math.floor(p.dot(up) / texel) * texel, along = p.dot(light);
  centre.copy(right).multiplyScalar(r).addScaledVector(up, u).addScaledVector(light, along);
  const e = c.eye;
  e.left = -c.half; e.right = c.half; e.top = c.half; e.bottom = -c.half; e.updateProjectionMatrix();
  e.position.copy(centre).addScaledVector(light, DEPTH_RANGE / 2);
  e.updateMatrix(); e.lookAt(centre); e.updateMatrix(); e.updateMatrixWorld(true); // lookAt reads where the eye is from its matrix
  shadowRT.viewport.set(i * tile, 0, tile, tile); shadowRT.scissor.set(i * tile, 0, tile, tile);
  shadowGroup.children = listCasters(casters, centre, right, up, c.half);
  renderer.setRenderTarget(shadowRT);
  renderer.render(shadowScene, e);
  if (i === 0 && settings.bodyShadows) { // only the sharpest square is near enough to show them
    renderer.autoClear = false; scene.overrideMaterial = bodyDepth; e.layers.set(BODY_LAYER);
    renderer.render(scene, e);
    scene.overrideMaterial = null; e.layers.set(0); renderer.autoClear = true;
  }
  shared.uShadowMat.value[i].multiplyMatrices(toTile, e.projectionMatrix).multiply(e.matrixWorldInverse);
  c.fresh = true;
}
function drawShadows() {
  if (!shadowRT || shared.uSunColour.value.r + shared.uSunColour.value.b <= 0) return;
  frame++;
  cascades.forEach((c, i) => { if (!c.fresh || (frame + i) % c.every === 0) drawCascade(c, i); });
}

// ---------- a frame ----------
function bloom() {
  const u = downMat.uniforms;
  let from = finalRT;
  downs.forEach((rt, i) => {
    u.tColor.value = from.texture; u.uTexel.value.set(0.5 / from.width, 0.5 / from.height); u.uBright.value = i ? 0 : 1;
    pass(downMat, rt);
    from = rt;
  });
  for (let i = ups.length - 1; i >= 0; i--) {
    upMat.uniforms.tColor.value = downs[i].texture; upMat.uniforms.tSmall.value = from.texture; upMat.uniforms.uTexel.value.set(1 / ups[i].width, 1 / ups[i].height);
    pass(upMat, ups[i]);
    from = ups[i];
  }
  tBloom.value = from.texture;
}
function soften(from, to) {
  softMat.uniforms.tColor.value = from.texture; softMat.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
  pass(softMat, to);
}
function fullFrame() {
  const e = camera.projectionMatrix.elements, view = shared.uViewProj.value;
  shared.uDepthA.value = e[10]; shared.uDepthB.value = e[14]; uProjInv.value.set(1 / e[0], 1 / e[5]); uProjScale.value = e[5] * (aoRT.height) * 0.5;
  view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  uInvViewProj.value.copy(view).invert();
  uEye.value.copy(camera.position);
  readDials();
  drawShadows();
  camera.layers.set(0);
  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, camera);
  if (settings.ssao) {
    pass(aoMat, aoRT);
    soften(aoRT, aoSoftRT);
    tShade.value = aoSoftRT.texture;
  }
  pass(restoreMat, finalRT);
  camera.layers.set(LATE_LAYER);
  renderer.autoClear = false;
  renderer.setRenderTarget(finalRT);
  renderer.render(scene, camera);
  renderer.autoClear = true;
  camera.layers.set(0); camera.layers.enable(LATE_LAYER);
  if (settings.godRays && shadowRT) {
    pass(raysMat, raysRT);
    soften(raysRT, raysSoftRT);
    tRays.value = raysSoftRT.texture;
  } else tRays.value = null;
  bloom();
  pass(finishMat, settings.fxaa ? finishRT : null);
  if (settings.fxaa) pass(fxaaMat, null);
}
export function drawScene() {
  if (failed) fallBack('Falling back to the base look.');
  if (stale) apply();
  renderer.info.reset();
  if (!active) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  if (!built) build();
  try { fullFrame(); } catch (error) {
    renderer.autoClear = true; scene.overrideMaterial = null;
    camera.layers.set(0); camera.layers.enable(LATE_LAYER);
    fallBack(error);
    renderer.setRenderTarget(null);
  }
}

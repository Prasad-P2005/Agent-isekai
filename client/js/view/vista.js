// The real world behind the main menu: the camera drifts round the capital at dusk, high enough to clear anything, with the city to the right of the menu. Nothing is simulated and
// nobody is in it. Until there is land to look at, the painting stays up, and it stays up for good if this never starts. Entering a world starts the page again, so nothing here
// can leak into play, and that is why it may do as it likes with the camera, the clock and the hero's position.
import { WORLD } from '../core/content.js';
import { emit } from '../core/events.js';
import { G } from '../core/state.js';
import { RD } from '../sim/chunks.js';
import { loadEdits } from '../sim/edits.js';
import { initNoise } from '../sim/noise.js';
import { player } from '../sim/player.js';
import { CS, heightAt, setWorldData } from '../sim/terrain.js';
import { chunkShown, drawn } from './chunkmesh.js';
import { camera, stillCamera } from './scene.js';

const TURN = 0.012, LIFT = 30, LOOK_AT = 10, ASIDE = 0.24, RING = 24, FOV = 58; // radians a second (a lap in about nine minutes), blocks over the ground, how high on the city to look, how far the view turns to put the city beside the menu
const NEAREST = 44, FURTHEST = 96, SHARE_OF_SIGHT = 0.6;
const DUSK = 0.465, DUSK_SWING = 0.025, DUSK_RATE = 0.05; // the sun stays low: long light and warm colours, and never dark enough to lose the land
const ENOUGH_CHUNKS = 36, GIVE_UP_WAITING = 9; // how much to have before the painting lifts, and how long to wait for that on a slow machine
let running = false, focus = null, ring = [], radius = 0, surveyed = 0, turn = 0, clock = 0, waited = 0, revealed = false;

const ground = (x, z) => Math.max(heightAt(Math.floor(x), Math.floor(z)), WORLD.sea);
// The height to fly at, all the way round. Each point also looks at its neighbours, so that the camera has risen before a hill arrives rather than as it does.
function survey() {
  surveyed = RD;
  radius = Math.max(NEAREST, Math.min(FURTHEST, RD * CS * SHARE_OF_SIGHT));
  const heights = Array.from({ length: RING }, (_, i) => { const a = i / RING * Math.PI * 2; return ground(focus.x + Math.cos(a) * radius, focus.z + Math.sin(a) * radius); });
  ring = heights.map((h, i) => Math.max(h, heights[(i + 1) % RING], heights[(i + RING - 1) % RING]) + LIFT);
}
function flightHeight(angle) {
  const at = (((angle / (Math.PI * 2)) % 1) + 1) % 1 * RING, i = Math.floor(at), t = at - i, eased = t * t * (3 - 2 * t);
  return ring[i % RING] + (ring[(i + 1) % RING] - ring[i % RING]) * eased;
}

export function startVista(w) {
  if (!focus) {
    initNoise(w.seed); setWorldData(w); loadEdits(w.block_edits);
    emit('world:loaded', w);
    const city = w.settlements.find(s => s.type === 'city') ?? w.settlements[0], x = city?.cx ?? w.spawn.x, z = city?.cz ?? w.spawn.z;
    focus = { x, y: ground(x, z) + LOOK_AT, z };
    turn = (w.seed % 628) / 100; // every world is seen from its own side
    survey();
    camera.fov = FOV; camera.updateProjectionMatrix();
  }
  running = true;
}
export function stopVista() { running = false; }
export const vistaOn = () => running;

function reveal(dt, x, z) {
  waited += dt;
  if (revealed || !((chunkShown(focus.x, focus.z) && chunkShown(x, z) && drawn.chunks >= ENOUGH_CHUNKS) || waited > GIVE_UP_WAITING)) return;
  revealed = true;
  emit('vista:ready');
}
export function stepVista(dt) {
  if (surveyed !== RD) survey();
  clock += dt;
  if (!stillCamera.matches) turn += dt * TURN;
  const x = focus.x + Math.cos(turn) * radius, z = focus.z + Math.sin(turn) * radius, y = flightHeight(turn), dx = focus.x - x, dz = focus.z - z;
  camera.position.set(x, y, z);
  camera.rotation.set(Math.atan2(focus.y - y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz) + ASIDE, 0);
  player.pos.set(x, y, z);
  player.yaw = camera.rotation.y;
  G.dayTime = DUSK + DUSK_SWING * Math.sin(clock * DUSK_RATE);
  reveal(dt, x, z);
}

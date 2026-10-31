// The air underground. Rock with no lamp near it still shows faintly, far walls fade into a haze of the biome's colour, lamps take on its light, and a torch in the hand lights the way.
// None of it is baked: these are a few uniforms that follow the hero, so walking from one biome to another is a slow change of the air.
import { WORLD } from '../core/content.js';
import { heldStack, worn } from '../sim/inventory.js';
import { player } from '../sim/player.js';
import { caveBiomeAt, heightAt } from '../sim/terrain.js';
import { shared } from './materials.js';

const UNDER = 1, FADE = 2.4, BIOME_TOP = WORLD.sea - 28, TORCHES = new Set(['torch', 'lantern']), NIGHT_SIGHT = 0.3;
const WARM = [1, 0.8, 0.52]; // a lamp's light here is its own colour, so the biome only leans on it, by how far it differs from plain lamplight
const AIR = {
  plain: { floor: [0.09, 0.095, 0.115], haze: [0.012, 0.013, 0.02], lamp: [1, 0.8, 0.52] },
  crystal: { floor: [0.13, 0.2, 0.34], haze: [0.11, 0.2, 0.38], lamp: [0.62, 0.86, 1] },
  fungal: { floor: [0.12, 0.2, 0.24], haze: [0.08, 0.2, 0.24], lamp: [0.5, 0.95, 1] },
  verdant: { floor: [0.14, 0.22, 0.15], haze: [0.14, 0.26, 0.2], lamp: [0.8, 1, 0.7] },
  marble: { floor: [0.84, 0.82, 0.78], haze: [0.7, 0.67, 0.6], lamp: [1, 0.9, 0.7] },
  drip: { floor: [0.5, 0.45, 0.38], haze: [0.3, 0.26, 0.21], lamp: [1, 0.85, 0.6] },
  frozen: { floor: [0.2, 0.3, 0.42], haze: [0.3, 0.44, 0.58], lamp: [0.75, 0.9, 1] },
  ember: { floor: [0.3, 0.13, 0.1], haze: [0.36, 0.11, 0.05], lamp: [1, 0.6, 0.3] },
};
const now = { floor: [...AIR.plain.floor], haze: [...AIR.plain.haze], lamp: [...AIR.plain.lamp] };
let cave = 0, torch = 0;
export function updateCaveAir(dt, eye) {
  const x = Math.floor(eye.x), z = Math.floor(eye.z), under = eye.y < heightAt(x, z) - UNDER, want = AIR[eye.y < BIOME_TOP ? caveBiomeAt(x, z) : 'plain'], ease = 1 - Math.exp(-FADE * dt);
  cave += ((under ? 1 : 0) - cave) * ease;
  for (const part of ['floor', 'haze', 'lamp']) for (let c = 0; c < 3; c++) now[part][c] += (want[part][c] - now[part][c]) * ease;
  const lit = TORCHES.has(heldStack()?.id) || TORCHES.has(worn().off?.id);
  torch += ((lit ? 1 : 0) - torch) * (1 - Math.exp(-10 * dt));
  const sight = player.buffs.night_sight > 0 ? NIGHT_SIGHT : 0;
  shared.uCave.value = cave;
  shared.uCaveAir.value.setRGB(now.floor[0] + sight, now.floor[1] + sight, now.floor[2] + sight);
  shared.uCaveHaze.value.setRGB(...now.haze);
  shared.uLamp.value.setRGB(1 + (now.lamp[0] / WARM[0] - 1) * cave * 0.6, 1 + (now.lamp[1] / WARM[1] - 1) * cave * 0.6, 1 + (now.lamp[2] / WARM[2] - 1) * cave * 0.6);
  shared.uTorch.value = torch;
}

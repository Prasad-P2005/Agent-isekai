// One step of the simulation. Everything that moves the game forward happens here, in a fixed order.
import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { chunkReady } from './chunks.js';
import { updateEntities } from './entities.js';
import { updateHands } from './hands.js';
import { updateAim, updateMining } from './mining.js';
import { updateLaw, updateResidents } from './people.js';
import { collides, player, updatePlayer, updateStats } from './player.js';
import { updateProjectiles } from './projectiles.js';
import { updateSpawning } from './spawning.js';
import { updateStations } from './stations.js';
import { updateSightings } from './bestiary.js';
import { LAND, landOf } from './terrain.js';

const DAY_LENGTH = 600; // seconds
let currentLand = null;

export function stepWorld(dt) {
  const p = player.pos;
  if (chunkReady(p.x, p.z)) updatePlayer(dt);
  let guard = 0; while (collides(p) && guard++ < 40) p.y += 1;
  const lx = Math.floor(p.x / LAND), lz = Math.floor(p.z / LAND), land = lx + ',' + lz;
  if (land !== currentLand) { currentLand = land; emit('land:entered', { lx, lz, land: landOf(p.x, p.z) }); }
  updateEntities(dt); updateSpawning(dt); updateSightings(dt); updateProjectiles(dt); updateResidents(dt); updateLaw(dt); updateStats(dt); updateStations(dt);
  updateAim(); updateMining(dt); updateHands(dt);
  G.dayTime = (G.dayTime + dt / DAY_LENGTH) % 1;
}

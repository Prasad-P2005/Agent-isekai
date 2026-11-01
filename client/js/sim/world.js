// One step of the simulation. Everything that moves the game forward happens here, in a fixed order.
import { BIOMES, REALMS } from '../core/content.js';
import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { rule, setLandLaw } from '../core/rules.js';
import { isNight } from './beings.js';
import { chunkReady } from './chunks.js';
import { updateDrops } from './drops.js';
import { updateEntities } from './entities.js';
import { updateHands } from './hands.js';
import { updateAim, updateMining } from './mining.js';
import { updateMomentum } from './momentum.js';
import { updateLaw, updateResidents } from './people.js';
import { collides, player, updatePlayer, updateStats } from './player.js';
import { updateProjectiles } from './projectiles.js';
import { updateSpawning } from './spawning.js';
import { updateStations } from './stations.js';
import { updateSightings } from './bestiary.js';
import { updateStars } from './stars.js';
import { LAND, landOf } from './terrain.js';

const DAY_LENGTH = 600; // seconds
let currentLand = null;

export function stepWorld(dt) {
  const p = player.pos;
  if (chunkReady(p.x, p.z)) updatePlayer(dt);
  let guard = 0; while (collides(p) && guard++ < 40) p.y += 1;
  const lx = Math.floor(p.x / LAND), lz = Math.floor(p.z / LAND), land = lx + ',' + lz;
  if (land !== currentLand) {
    currentLand = land;
    const here = landOf(p.x, p.z);
    setLandLaw(REALMS[BIOMES[here.b].realm]?.law?.effects);
    emit('land:entered', { lx, lz, land: here });
  }
  updateEntities(dt); updateSpawning(dt); updateSightings(dt); updateProjectiles(dt); updateResidents(dt); updateLaw(dt); updateStats(dt); updateStations(dt);
  updateAim(); updateMining(dt); updateHands(dt); updateMomentum(dt); updateStars(dt); updateDrops(dt);
  G.dayTime = (G.dayTime + dt / DAY_LENGTH * rule(isNight() ? 'night_speed' : 'day_speed')) % 1;
}

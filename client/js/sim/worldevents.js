// What each world event from the server (see content/events.json) does around the player.
import { SPAWN_TABLE, spawnNear } from './entities.js';
import { player } from './player.js';
import { biomeAt } from './terrain.js';

export const WORLD_EVENTS = {
  demon_raid({ wave = 1 }) {
    spawnNear('imp', Math.min(8, 2 + wave), 16, 26);
    spawnNear('demon_knight', Math.min(4, Math.floor(wave / 2)), 16, 26);
  },
  merchant_caravan() {
    spawnNear('merchant', 2, 8, 12, { title: 'Travelling Merchant' });
    spawnNear('adventurer', 1, 8, 12, { title: 'Caravan Guard' });
  },
  festival() {}, // prices are the server's business
  monster_horde() {
    const t = SPAWN_TABLE[biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z), Math.floor(player.pos.y))] || ['goblin'];
    for (let i = 0; i < 5; i++) spawnNear(t[i % t.length] || 'goblin', 1, 16, 24, { natural: true });
  },
};

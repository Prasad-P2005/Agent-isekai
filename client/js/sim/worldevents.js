// What each world event from the server (see content/events.json) does around the player.
import { SPAWN_TABLE, ents, spawnNear } from './entities.js';
import { player } from './player.js';
import { biomeAt } from './terrain.js';

const localMonsters = () => {
  const t = SPAWN_TABLE[biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z), Math.floor(player.pos.y))];
  return t?.length ? t : ['goblin'];
};
export const WORLD_EVENTS = {
  demon_raid({ wave = 1 }) {
    spawnNear('imp', Math.min(8, 2 + wave), 16, 26);
    spawnNear('demon_knight', Math.min(4, Math.floor(wave / 2)), 16, 26);
  },
  merchant_caravan() {
    spawnNear('merchant', 2, 8, 12, { title: 'Travelling Merchant', service: 'trade' });
    spawnNear('adventurer', 1, 8, 12, { title: 'Caravan Guard' });
  },
  festival() {}, // prices are the server's business
  monster_horde() {
    const t = localMonsters();
    for (let i = 0; i < 5; i++) spawnNear(t[i % t.length], 1, 16, 24, { natural: true });
  },
  traveller({ role, title }) {
    spawnNear('villager', 1, 10, 16, { title, role });
  },
  named_foe({ kind, name, title, power, nemesis }) {
    if (nemesis && ents.some(e => e.named === 'nemesis')) return; // it is already here
    const t = localMonsters();
    spawnNear(kind || t[Math.floor(Math.random() * t.length)], 1, 18, 26, { name, title, power, named: nemesis ? 'nemesis' : name });
  },
};

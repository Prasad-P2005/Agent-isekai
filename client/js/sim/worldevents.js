// What each world event from the server (see content/events.json) does around the player.
import { ents } from './entities.js';
import { localMonsters, onItsWay, spawnNear } from './spawning.js';
import { fallStar } from './stars.js';

const monstersHere = () => { const t = localMonsters(); return t.length ? t : ['goblin']; };
export const WORLD_EVENTS = {
  demon_raid({ wave = 1 }) {
    spawnNear('imp', Math.min(8, 2 + wave), 22, 32);
    spawnNear('demon_knight', Math.min(4, Math.floor(wave / 2)), 22, 32);
  },
  merchant_caravan() {
    spawnNear('merchant', 2, 14, 20, { title: 'Travelling Merchant', service: 'trade' });
    spawnNear('adventurer', 1, 14, 20, { title: 'Caravan Guard' });
  },
  festival() {}, // prices are the server's business
  monster_horde() {
    const t = monstersHere();
    for (let i = 0; i < 5; i++) spawnNear(t[i % t.length], 1, 22, 30, { natural: true });
  },
  traveller({ role, title }) {
    spawnNear('villager', 1, 14, 22, { title, role });
  },
  named_foe({ kind, name, title, power, nemesis }) {
    if (nemesis && (ents.some(e => e.named === 'nemesis') || onItsWay('nemesis'))) return; // it is already here
    const t = monstersHere();
    spawnNear(kind || t[Math.floor(Math.random() * t.length)], 1, 22, 30, { name, title, power, named: nemesis ? 'nemesis' : name });
  },
  blood_moon() {}, // the Laws in force do this one, and the sky shows it
  star_fall({ x, z }) { fallStar(x, z); },
  siege({ count, knights }) {
    spawnNear('imp', count - knights, 16, 28);
    spawnNear('demon_knight', knights, 16, 28);
  },
};

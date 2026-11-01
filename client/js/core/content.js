// The game's data: the same files the server reads, so the two sides cannot disagree.
const NAMES = ['world', 'realms', 'blocks', 'creatures', 'abilities', 'services', 'jobs', 'laws', 'guild', 'events', 'spawns', 'bestiary', 'items', 'recipes', 'title', 'news'];

async function read(name) {
  if (typeof window === 'undefined' && typeof WorkerGlobalScope === 'undefined') { // tests run the simulation in Node, without a server
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(new URL(`../../../content/${name}.json`, import.meta.url), 'utf8'));
  }
  const res = await fetch(`/content/${name}.json`);
  if (!res.ok) throw new Error(`Cannot load game data: ${name}`);
  return res.json();
}

const [world, realms, blocks, creatures, abilities, services, jobs, laws, guild, events, spawns, bestiary, items, recipes, title, news] = await Promise.all(NAMES.map(read));
for (const c of Object.values(creatures)) for (const part of ['body', 'head', 'hair']) if (c[part]) c[part] = parseInt(c[part].slice(1), 16);

export const WORLD = world, BIOMES = realms.biomes, REALMS = realms.realms, BLOCKS = blocks, CREATURES = creatures,
  ABILITIES = abilities, SERVICES = services, JOBS = jobs, LAWS = laws, GUILD = guild, EVENTS = events, SPAWNS = spawns, BESTIARY = bestiary, ITEMS = items, RECIPES = recipes, TITLE = title, NEWS = news;

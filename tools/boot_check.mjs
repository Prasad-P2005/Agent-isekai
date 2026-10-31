// Starts the real client on a stand-in page, without a browser: node --no-warnings tools/boot_check.mjs
// Real modules and real three.js, with a fake DOM and a fake GPU. It cannot say how anything looks and it does not compile shaders, but anything that
// would stop the page starting, or throw when the bag, a station or the hand is used, throws here. One duplicated name stops every module, and
// `node --check` does not see it, so run this after changing the client.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

const REPO = new URL('../', import.meta.url).href;
const client = new URL('client/', REPO);
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: new URL('vendor/three.module.js', client).href, shortCircuit: true };
    if (spec.startsWith('three/addons/')) return { url: new URL(spec.replace('three/addons/', 'vendor/addons/'), client).href, shortCircuit: true };
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    const out = next(url, ctx);
    if (!url.startsWith(new URL('js/', client).href)) return out;
    const src = String(out.source ?? readFileSync(new URL(url), 'utf8')).replaceAll('new THREE.WebGLRenderer(', 'new globalThis.FakeRenderer(');
    return { ...out, format: 'module', source: src };
  },
});

// ---------- a page ----------
const html = readFileSync(new URL('index.html', client), 'utf8'), ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])), missing = new Set();
const noop = () => {}, ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'canvas' ? { width: 96, height: 96 } : k === 'getImageData' || k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4 * 512 * 512) }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
const elements = new Map();
function el(id = '') {
  const listeners = {}, e = {
    id, style: {}, dataset: {}, listeners, children: [], classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, textContent: '', innerHTML: '', value: '', className: '', scrollTop: 0, clientWidth: 800, clientHeight: 600, width: 96, height: 120,
    addEventListener(t, f) { (listeners[t] ??= []).push(f); }, removeEventListener: noop, append: noop, appendChild: c => c, prepend: noop, remove: noop, focus: noop, blur: noop, setAttribute: noop, getContext: () => ctx2d, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelector: () => el(), querySelectorAll: () => [], closest: () => null, requestPointerLock: () => Promise.resolve(), setSelectionRange: noop, toDataURL: () => 'data:,', contains: () => false, setPointerCapture: noop,
  };
  return e;
}
globalThis.document = {
  body: el('body'), documentElement: el('html'), activeElement: null, pointerLockElement: null, createElement: () => el(), createElementNS: () => el(), addEventListener: noop, removeEventListener: noop, exitPointerLock: noop, hasFocus: () => true, querySelectorAll: () => [],
  getElementById(id) { if (!ids.has(id)) missing.add(id); if (!elements.has(id)) elements.set(id, el(id)); return elements.get(id); },
};
const globalListeners = {};
Object.assign(globalThis, {
  window: globalThis, addEventListener: (t, f) => { (globalListeners[t] ??= []).push(f); }, removeEventListener: noop, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, requestAnimationFrame: noop, cancelAnimationFrame: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }), localStorage: { getItem: () => null, setItem: noop }, ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } }, Image: class {},
  FakeRenderer: class { constructor() { return new Proxy({ domElement: el('gl'), shadowMap: {}, capabilities: {}, info: {} }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } }); } },
  fetch: async url => {
    if (String(url).startsWith('/content/')) { const body = readFileSync(new URL(`content/${String(url).slice(9)}`, REPO), 'utf8'); return { ok: true, json: async () => JSON.parse(body) }; }
    return { ok: true, json: async () => ({ has_world: false }) };
  },
});

// ---------- start it ----------
const js = p => new URL(`js/${p}`, client).href;
await import(js('main.js'));
console.log('main.js ran');
await new Promise(r => setTimeout(r, 50));
const { G } = await import(js('core/state.js')), { emit } = await import(js('core/events.js'));
const { ITEMS } = await import(js('core/content.js'));
const inv = await import(js('sim/inventory.js')), { initNoise } = await import(js('sim/noise.js')), terrain = await import(js('sim/terrain.js'));
const { streamChunks } = await import(js('sim/chunks.js')), { player, settlePlayer } = await import(js('sim/player.js')), { stepWorld } = await import(js('sim/world.js'));
const { loadEdits } = await import(js('sim/edits.js')), { loadStations } = await import(js('sim/stations.js')), { fillSpells, castSlot } = await import(js('sim/abilities.js')), hands = await import(js('sim/hands.js'));
const { openPage, closePanel } = await import(js('ui/panels.js')), { updateHUD } = await import(js('ui/hud.js')), { meshChunks, setDeepShown } = await import(js('view/chunkmesh.js')), { renderWorld } = await import(js('view/world.js')), { aim } = await import(js('sim/mining.js'));

const fixture = JSON.parse(readFileSync(new URL('tests/client/world.json', REPO)));
const profile = { gold: 30, bounty: 0, blocks: {}, bag: [{ id: 'potion', n: 1 }, ...Array(35).fill(null)], worn: { head: null, body: null, legs: null, feet: null, off: null }, seen: [], spells: ['', ''], abilities: ['fireball', 'heal', 'flight'], max_hp: 20, max_mana: 100, parcels: [], parcels_taken: 0, bestiary: [], guild_rank: 0, kills: 0, deaths: 0 };
G.world = { ...fixture, settlements: fixture.settlements.map(s => ({ ...s, residents: [] })), player: profile, currency: 'gold', spawn: { x: 500, z: 500 }, name: 'Test', day_time: 0.2, block_edits: {}, stations: {} };
G.profile = profile; G.oaths = []; G.marks = []; G.objective = 'x';
initNoise(fixture.seed); terrain.setWorldData(G.world); loadEdits({});
inv.startBag(profile); loadStations({}); fillSpells();
console.log('spells', profile.spells);
const x = 500, z = 500;
player.pos.set(x + 0.5, terrain.heightAt(x, z) + 1, z + 0.5); player.spawn.copy(player.pos); player.ready = true;
G.phase = 'world'; G.locked = true; G.focused = true;
streamChunks(x, z, Infinity);
meshChunks(x, z, Infinity);
console.log('chunks meshed');
for (let i = 0; i < 30; i++) stepWorld(1 / 60);
updateHUD(1 / 60);
renderWorld(1 / 60, 1);
console.log('world step, HUD and a frame ran');

// ---------- the bag ----------
const $ = id => document.getElementById(id), fire = (element, type, e) => { for (const f of element.listeners[type] ?? []) f(e); };
const slot = (c, i) => ({ dataset: { c, i: String(i) } }), press = (c, i, extra = {}) => { const b = slot(c, i), e = { button: 0, shiftKey: false, preventDefault: noop, target: { closest: s => (s.includes('data-c') ? b : null) }, ...extra }; fire($('bag'), 'mousedown', e); for (const f of globalListeners.mouseup ?? []) f({ button: 0 }); };
inv.addItem('oak_log', 4); inv.addItem('planks', 20); inv.addItem('stick', 8); inv.addItem('iron_sword'); inv.addItem('knight_chest'); inv.addItem('coal', 3); inv.addItem('raw_iron', 2);
openPage('bag');
console.log('bag opened, html', $('bagitems').innerHTML.length, $('sidebody').innerHTML.length);
press('bag', 1); press('bag', 12); press('bag', 12, { shiftKey: true });
fire($('bag'), 'mouseover', { target: { closest: () => slot('bag', 1) } });
press('worn', 'body');
const click = (attr, dataset, shiftKey = false) => fire($('bagside'), 'click', { shiftKey, target: { closest: s => (s === `[data-${attr}]` ? { dataset } : null) } });
click('side', { side: 'spells' }); click('spell', { spell: 'heal', to: '0' }); click('side', { side: 'recipes' }); click('group', { group: 'tools' }); click('only', {}); click('only', {}); click('group', { group: 'all' });
click('recipe', { recipe: 'crafting_table' }); press('out', 0); click('recipe', { recipe: 'crafting_table' }, true);
$('bagsort').listeners.click[0]();
closePanel();
console.log('bag clicks ran', inv.count('crafting_table'), inv.count('planks'));
for (const kind of ['table', 'anvil', 'alchemy', 'furnace', 'forge', 'chest']) { emit('station:opened', { kind, x: 500, y: 300, z: 500 }); press('bag', 2); press('bag', 3); closePanel(); }
console.log('every station opened');

// ---------- hands ----------
for (const id of ['iron_sword', 'mithril_greatsword', 'silver_dagger', 'dragon_spear', 'gold_mace', 'adamant_pickaxe', 'iron_axe', 'copper_shovel', 'wood_hoe', 'dragon_hammer', 'hunting_bow', 'archmage_staff', 'shears', 'torch', 'planks', 'bread', 'potion']) {
  inv.bag()[0] = { id, n: 3, ...(ITEMS[id].dur ? { dur: ITEMS[id].dur } : {}) }; inv.selectSlot(0);
  emit('player:struck');
  for (let i = 0; i < 40; i++) renderWorld(1 / 60, 1);
}
inv.worn().off = { id: 'wooden_shield', n: 1, dur: 120 }; inv.worn().head = { id: 'dragonscale_helm', n: 1, dur: 900 }; inv.worn().body = { id: 'demonplate_chest', n: 1, dur: 800 };
renderWorld(1 / 60, 1);
console.log('every motion ran');
inv.bag()[0] = { id: 'hunting_bow', n: 1, dur: 384 }; inv.addItem('arrow', 8);
G.mouseRight = true; hands.pressUse(); for (let i = 0; i < 40; i++) stepWorld(1 / 60); hands.releaseUse(); G.mouseRight = false;
inv.bag()[0] = { id: 'bread', n: 2 }; player.hp = 5; hands.pressUse(); console.log('ate, hp', player.hp, 'bread', inv.count('bread'));
hands.drinkBest(['potion']); castSlot(0); castSlot(1);
inv.bag()[0] = { id: 'iron_pickaxe', n: 1, dur: 250 }; G.mouseDown = true; player.pitch = -1.4; for (let i = 0; i < 200; i++) stepWorld(1 / 60); G.mouseDown = false;
console.log('mined, aim', !!aim.block);
// underground, for the air and the deep mesh
player.pos.y = 60; for (let i = 0; i < 5; i++) renderWorld(1 / 60, 1); setDeepShown(false);
console.log('underground frame ran');
console.log(missing.size ? `IDS MISSING FROM index.html: ${[...missing].join(', ')}` : 'every element the code asks for exists');
process.exit(0);

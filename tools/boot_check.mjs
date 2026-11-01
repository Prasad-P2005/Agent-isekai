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
    id, style: { setProperty: noop, removeProperty: noop }, dataset: {}, listeners, children: [], classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, textContent: '', innerHTML: '', value: '', className: '', scrollTop: 0, clientWidth: 800, clientHeight: 600, width: 96, height: 120,
    addEventListener(t, f) { (listeners[t] ??= []).push(f); }, removeEventListener: noop, append: noop, appendChild: c => c, prepend: noop, remove: noop, focus: noop, blur: noop, setAttribute: noop, getContext: () => ctx2d, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelector: () => el(), querySelectorAll: () => [], closest: () => null, requestPointerLock: () => Promise.resolve(), setSelectionRange: noop, toDataURL: () => 'data:,', contains: () => false, setPointerCapture: noop, animate: noop,
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
  FakeRenderer: class { constructor() { return new Proxy({ domElement: el('gl'), shadowMap: {}, capabilities: {}, info: { reset: noop, render: {}, memory: {} } }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } }); } },
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
const { ITEMS, RECIPES } = await import(js('core/content.js')), { isKnown } = await import(js('sim/crafting.js'));
const inv = await import(js('sim/inventory.js')), { initNoise } = await import(js('sim/noise.js')), terrain = await import(js('sim/terrain.js'));
const { streamChunks } = await import(js('sim/chunks.js')), { player, settlePlayer } = await import(js('sim/player.js')), { stepWorld } = await import(js('sim/world.js'));
const { loadEdits } = await import(js('sim/edits.js')), { loadStations } = await import(js('sim/stations.js')), { fillSpells, castSlot } = await import(js('sim/abilities.js')), hands = await import(js('sim/hands.js'));
const { openPage, closePanel } = await import(js('ui/panels.js')), { updateHUD } = await import(js('ui/hud.js')), { meshChunks } = await import(js('view/chunkmesh.js')), { renderWorld } = await import(js('view/world.js')), { aim } = await import(js('sim/mining.js'));

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
for (let i = 0; i < 3; i++) meshChunks(x, z, Infinity); // meshes come back on the next call, and it is taking them in that has broken before
console.log('chunks meshed');
for (let i = 0; i < 30; i++) stepWorld(1 / 60);
updateHUD(1 / 60);
renderWorld(1 / 60, 1);
console.log('world step, HUD and a frame ran');

// ---------- every creature ----------
// Spawning is random, so a kind that cannot be drawn only shows up when someone walks into it.
const { CREATURES } = await import(js('core/content.js')), { removeEntity, spawnEntity } = await import(js('sim/entities.js'));
for (const kind of Object.keys(CREATURES)) {
  const e = spawnEntity(kind, x + 3.5, player.pos.y, z + 3.5, { natural: true, name: kind }); // the stand-in world has no Demon Lord's name to give him
  if (e && !e.view) throw new Error(`a ${kind} has no body`);
  renderWorld(1 / 60, 1);
  if (e) removeEntity(e);
}
console.log('every creature has a body');

// ---------- the bag ----------
const $ = id => document.getElementById(id), fire = (element, type, e) => { for (const f of element.listeners[type] ?? []) f(e); };
const slots = new Map(), slot = (c, i) => { const key = `${c} ${i}`; if (!slots.has(key)) slots.set(key, { dataset: { c, i: String(i) } }); return slots.get(key); };
const at = (c, i) => ({ closest: s => (s.includes('data-c') ? slot(c, i) : null) });
const down = (c, i, extra = {}) => fire($('bag'), 'mousedown', { button: 0, shiftKey: false, preventDefault: noop, target: at(c, i), ...extra }), up = () => { for (const f of globalListeners.mouseup ?? []) f({ button: 0 }); }, press = (c, i, extra) => { down(c, i, extra); up(); };
inv.addItem('oak_log', 4); inv.addItem('planks', 20); inv.addItem('stick', 8); inv.addItem('iron_sword'); inv.addItem('knight_chest'); inv.addItem('coal', 3); inv.addItem('raw_iron', 2);
openPage('bag');
console.log('bag opened');
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

// ---------- the mouse tweaks ----------
// Checked step by step, because a drag that loses or doubles a stack looks like nothing on the screen.
let bad = 0;
const expect = (what, got, want) => { if (got !== want) { bad++; console.log(`WRONG ${what}: ${got}, wanted ${want}`); } };
const n = i => inv.bag()[i]?.n ?? 0, row = (...is) => is.map(n).join(), total = id => inv.bag().reduce((sum, s) => sum + (s?.id === id ? s.n : 0), 0);
const over = (c, i, extra = {}) => fire($('bag'), 'mouseover', { shiftKey: false, target: at(c, i), ...extra }), spin = (c, i, deltaY) => fire($('bag'), 'wheel', { deltaY, deltaMode: 0, preventDefault: noop, target: at(c, i) });
const shift = { shiftKey: true }, right = { button: 2 };
inv.bag().fill(null);
inv.bag()[9] = { id: 'planks', n: 64 }; inv.bag()[10] = { id: 'planks', n: 5 }; inv.bag()[11] = { id: 'stick', n: 8 }; inv.bag()[25] = { id: 'coal', n: 3 };
openPage('bag');
press('bag', 9);
down('bag', 12); expect('laid down on the press', n(12), 64);
over('bag', 13); expect('shared by two', row(12, 13), '32,32');
over('bag', 14); expect('shared by three', row(12, 13, 14), '21,21,21');
over('bag', 11); expect('another item left alone', n(11), 8);
up();
press('bag', 15); expect('the rest stayed in the hand', n(15), 1);
expect('nothing lost in a share', total('planks'), 69);
press('bag', 12);
down('bag', 16, right); over('bag', 17, right); over('bag', 16, right); over('bag', 11, right); up();
expect('a right drag drops one per entry', row(16, 17, 11), '2,1,8');
press('bag', 18); expect('and keeps the rest', n(18), 18);
down('bag', 13); over('bag', 14); over('bag', 10); over('bag', 11); up();
expect('a left drag collects its own item', row(13, 14, 10, 11), '0,0,0,8');
press('bag', 20); expect('collected stack', n(20), 47);
down('bag', 15); over('bag', 16, shift); up();
expect('shift sends what a held item matches', row(16, 0), '0,2');
press('bag', 21);
down('bag', 17, shift); over('bag', 18, shift); over('bag', 11, shift); up();
expect('shift alone sends everything crossed', row(17, 18, 11, 0, 1), '0,0,0,21,8');
expect('nothing lost in a drag', total('planks'), 69);
spin('bag', 20, 100); expect('wheel down pushes one', row(20, 0), '46,22');
spin('bag', 20, -100); expect('wheel up pulls one', row(20, 0), '47,21');
spin('bag', 20, 10); expect('a trackpad flick is not a notch', n(20), 47);
spin('bag', 20, 30); expect('two are', n(20), 46);
spin('bag', 20, -100);
press('bag', 20); down('grid', 0, right); over('grid', 2, right); up(); press('bag', 19);
expect('two planks on the grid', n(19), 45);
spin('grid', 0, -100); expect('wheel up fills a grid slot from the bag', total('planks'), 66);
spin('out', 0, 100); expect('wheel down on a result makes one', total('stick'), 12);
press('bag', 25); press('bag', 25); expect('a double click with nothing to gather puts it back', n(25), 3);
closePanel();
expect('what the grid held came back', total('planks'), 67);
emit('station:opened', { kind: 'chest', x: 500, y: 300, z: 500 });
const before = n(19);
spin('bag', 19, 100); expect('wheel down fills a chest', n(19), before - 1);
spin('bag', 19, -100); expect('wheel up empties it', n(19), before);
press('bag', 19); press('bag', 19); closePanel();
expect('a double click gathers without loss', total('planks'), 67);
const sword = RECIPES.find(r => r.out === 'iron_sword');
expect('a stick opens no tool', isKnown(sword, ['stick']), false);
expect('the metal does', isKnown(sword, ['stick', 'iron_ingot']), true);
if (bad) { console.log(`${bad} WRONG`); process.exit(1); }
console.log('the mouse tweaks hold');

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
player.pos.y = 60; for (let i = 0; i < 5; i++) renderWorld(1 / 60, 1);
console.log('underground frame ran');
console.log(missing.size ? `IDS MISSING FROM index.html: ${[...missing].join(', ')}` : 'every element the code asks for exists');
process.exit(0);

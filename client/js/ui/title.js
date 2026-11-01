// The way in: the boot screen, the main menu over the living world, loading a world from the server, and the walk from there into the game.
// The menu's pages (Worlds, New World, How to Play, What's New, Credits and the settings) are pages of the same book the game uses, opened over it.
import { keyOf } from '../core/bindings.js';
import { G } from '../core/state.js';
import { TITLE } from '../core/content.js';
import { emit, on, toast } from '../core/events.js';
import { settings } from '../core/settings.js';
import { api, playingSlot } from '../net/api.js';
import { saveAndLeave, startSync } from '../net/sync.js';
import { applyState } from '../sim/effects.js';
import { chunkReady, chunks } from '../sim/chunks.js';
import { loadEdits } from '../sim/edits.js';
import { resetMomentum } from '../sim/momentum.js';
import { initNoise } from '../sim/noise.js';
import { placePlayer, player } from '../sim/player.js';
import { fallStar } from '../sim/stars.js';
import { CS, chunkKey, hintQueue, setWorldData } from '../sim/terrain.js';
import { chunkShown } from '../view/chunkmesh.js';
import { renderer } from '../view/scene.js';
import { startVista, stopVista } from '../view/vista.js';
import { paintFirstFrame } from '../view/world.js';
import { esc, icon } from './art.js';
import { startHeaven } from './heaven.js';
import { renderStory } from './hud.js';
import { resetInput } from './input.js';
import { showCreativeMode } from './inventory.js';
import { fillSpells } from '../sim/abilities.js';
import { loadDrops } from '../sim/drops.js';
import { startBag } from '../sim/inventory.js';
import { loadStations } from '../sim/stations.js';
import { actionsHTML, movesHTML } from './journal.js';
import { openPage } from './panels.js';
import { pause } from './pointer.js';
import { arrivingToPlay, backToTitle, playWorld } from './session.js';
import { actLabel, playedFor, setWorlds } from './worlds.js';

const $ = id => document.getElementById(id);
const overlay = $('overlay'), loading = $('loading'), menu = $('titlemenu');
const showKeys = () => { $('moves').innerHTML = movesHTML(); $('controls').innerHTML = actionsHTML(); };
showKeys();
on('bindings:changed', showKeys);
const pick = list => list[Math.floor(Math.random() * list.length)];

// ---------- the screen everything waits behind ----------
const BAR_EASE = 8;
let shownBar = 0;
function setLoad(share, line) {
  shownBar = Math.max(shownBar, share);
  $('loadfill').style.width = `${Math.round(shownBar * 100)}%`;
  if (line) $('loadline').textContent = line;
}
function showLoading(line) {
  shownBar = 0;
  setLoad(0, line);
  $('loadbar').style.visibility = '';
  $('loadtip').textContent = pick(TITLE.tips).replace(/\{(\w+)\}/g, (_, action) => keyOf(action));
  loading.style.display = 'flex';
}
const hideLoading = () => { loading.style.display = 'none'; };
function failed(line) {
  $('loadbar').style.visibility = 'hidden';
  $('loadtip').textContent = '';
  $('loadline').textContent = line;
  $('loadagain').style.display = 'inline-block';
  loading.style.display = 'flex';
}
$('loadagain').addEventListener('click', () => location.replace(location.pathname));

// ---------- the main menu ----------
function menuItems(worlds) {
  const last = worlds[0];
  return [
    last && { label: 'Continue', detail: `${last.name}, ${actLabel(last)}, ${playedFor(last.clock)}`, art: 'sun', gold: true, go: () => playWorld(last.id).catch(() => { $('splash').textContent = 'That world could not be opened.'; }) },
    { label: 'New World', art: 'sparkle', gold: !last, go: () => openPage('newworld') },
    last && { label: 'Worlds', art: 'map', go: () => openPage('worlds') },
    { label: 'Options', art: 'gear', go: () => openPage('graphics') },
    { label: 'How to Play', art: 'scroll', go: () => openPage('howto') },
    { label: 'What\'s New', art: 'star', go: () => openPage('news') },
    { label: 'Credits', art: 'journal', go: () => openPage('credits') },
  ].filter(Boolean);
}
let items = [], lastFocus = 0;
function drawMenu(worlds) {
  items = menuItems(worlds);
  menu.innerHTML = items.map((m, i) => `<button type="button" data-item="${i}"${m.gold ? ' class="gold"' : ''} style="--i:${i}">${icon(m.art)}<span>${esc(m.label)}${m.detail ? `<small>${esc(m.detail)}</small>` : ''}</span></button>`).join('');
}
const buttons = () => [...menu.querySelectorAll('button')];
const focusItem = i => buttons()[i]?.focus({ preventScroll: true });
menu.addEventListener('click', e => {
  const b = e.target.closest?.('[data-item]');
  if (!b) return;
  lastFocus = Number(b.dataset.item);
  items[lastFocus]?.go();
});
menu.addEventListener('pointerover', e => e.target.closest?.('button')?.focus({ preventScroll: true })); // the mouse and the arrow keys keep one place between them
// Enter and Space are the browser's. Only walking the list is ours.
addEventListener('keydown', e => {
  if (G.phase !== 'title' || G.uiOpen || !document.body.classList.contains('ontitle')) return;
  const step = e.code === 'ArrowDown' ? 1 : e.code === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const all = buttons(), at = all.indexOf(document.activeElement);
  focusItem(at < 0 ? 0 : (at + step + all.length) % all.length);
});
async function refreshMenu(focusAfter = false) {
  let worlds = [];
  try { worlds = (await api.saves()).worlds ?? []; } catch { /* the first draw said so already */ }
  setWorlds(worlds);
  drawMenu(worlds);
  if (focusAfter) focusItem(Math.min(lastFocus, items.length - 1));
}
on('title:back', () => refreshMenu(true));

// The painting is there from the first frame, and the real land takes over when it has loaded enough to be worth seeing.
async function startBackdrop() {
  if (!settings.titleWorld) return;
  try {
    const w = await api.vista();
    if (w?.lands) startVista(w);
  } catch { /* the painting stays */ }
}
on('vista:ready', () => $('titleart').classList.add('gone'));
on('vista:failed', () => $('titleart').classList.remove('gone'));
on('settings:changed', moved => {
  if (G.phase !== 'title' || !moved.includes('titleWorld')) return;
  if (settings.titleWorld) { $('titleart').classList.remove('gone'); startBackdrop(); return; }
  stopVista();
  $('titleart').classList.remove('gone');
});
function showTitle(worlds) {
  setWorlds(worlds);
  drawMenu(worlds);
  $('splash').textContent = pick(TITLE.splashes);
  $('titleversion').textContent = TITLE.version;
  $('titlestudio').textContent = TITLE.studio;
  document.body.classList.add('ontitle');
  hideLoading();
  focusItem(0);
  startBackdrop();
}

export async function title() {
  if (renderer.capabilities.isWebGL2 === false) return failed('This game needs WebGL 2, which this browser or graphics card does not have.');
  if (arrivingToPlay()) {
    showLoading('Opening the world');
    try { await load(); } catch (e) { console.error('Could not load the world:', e); failed('The world could not be opened.'); }
    return;
  }
  let got;
  try { got = await api.saves(); } catch { return failed('Cannot reach the game server.'); }
  showTitle(got.worlds ?? []);
}

// ---------- into the world ----------
async function load() {
  setLoad(0.08, 'Reading the chronicle');
  const w = await api.world();
  playingSlot(w.slot);
  G.world = w; G.profile = w.player; G.oaths = w.oaths; G.marks = w.marks; G.rules = w.rules;
  resetInput();
  setLoad(0.2, 'Raising the land');
  initNoise(w.seed); setWorldData(w); loadEdits(w.block_edits);
  emit('world:loaded', w);
  placePlayer(w);
  w.echoes.forEach((e, i) => hintQueue.push({ kind: 'echo', x: Math.floor(e.x), y: null, z: Math.floor(e.z), role: `echo:${i}` })); // heights are found when the ground has loaded
  if (w.star) fallStar(w.star.x, w.star.z);
  resetMomentum();
  startBag(w.player); loadStations(w.stations); loadDrops(w.ground); fillSpells(); showCreativeMode();
  renderStory({ beats: w.story.beats.slice(-3), objective: w.objective, law_texts: w.law_texts, law_book: w.law_book });
  startSync(renderStory);
  if (w.player.descended) { G.phase = 'world'; enterWorld({ returning: true }); return; }
  if (!w.brief) { hideLoading(); startHeaven(enterWorld); return; }
  applyState(await api.descend()); // chosen when the world was made: no talk in heaven
  w.player.descended = true;
  G.phase = 'world';
  enterWorld();
}
// How much of the ground around the hero is ready, which is what the bar is really showing.
function groundShare() {
  const cx = Math.floor(player.pos.x / CS), cz = Math.floor(player.pos.z / CS);
  let have = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (chunks.has(chunkKey(cx + a, cz + b))) have++;
  return 0.25 + have / 9 * 0.55 + (chunkReady(player.pos.x, player.pos.z) && chunkShown(player.pos.x, player.pos.z) ? 0.2 : 0);
}
async function enterWorld({ returning = false } = {}) {
  if (!player.ready) {
    if (loading.style.display === 'none') showLoading('Finding your feet');
    setLoad(0.25, 'Finding your feet');
    while (!player.ready && G.phase === 'world') {
      setLoad(groundShare());
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (G.phase !== 'world') return;
    setLoad(1);
  }
  paintFirstFrame();
  hideLoading();
  if (returning) { pause('Welcome back'); return; }
  overlay.querySelector('h1').textContent = G.world.name;
  $('lede').textContent = 'Your new life begins here. Click to enter the world.';
  $('menu').innerHTML = '<p class="go">Click anywhere to begin</p>';
  overlay.style.display = 'flex';
}

// ---------- and out again ----------
let quitting = false;
$('quit').addEventListener('click', async () => {
  if (quitting) return;
  quitting = true;
  try {
    await saveAndLeave();
    backToTitle();
  } catch {
    quitting = false;
    toast('The server did not answer, so the world is not saved yet. Try again in a moment.', 5);
  }
});
// Another tab opened another world. This page has nothing left to play, and what it holds was saved up to the moment that happened.
let closing = false;
on('world:closed', () => {
  if (closing) return;
  closing = true;
  backToTitle();
});

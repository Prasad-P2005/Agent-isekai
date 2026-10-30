// The title screen, loading a world from the server, and the walk from there into the game.
import { G } from '../core/state.js';
import { api } from '../net/api.js';
import { startSync } from '../net/sync.js';
import { loadEdits } from '../sim/edits.js';
import { initNoise } from '../sim/noise.js';
import { placePlayer, player } from '../sim/player.js';
import { setWorldData } from '../sim/terrain.js';
import { paintFirstFrame } from '../view/world.js';
import { startHeaven } from './heaven.js';
import { renderStory, setOracle } from './hud.js';
import { resetInput } from './input.js';
import { loadHotbar } from './inventory.js';

const $ = id => document.getElementById(id);
const overlay = $('overlay');

export async function title() {
  let st;
  try { st = await api.status(); } catch { $('menu').innerHTML = '<p>Cannot reach the game server.</p>'; return; }
  setOracle(st.llm_online ? `God: LLM ${st.model}` : 'The god is silent (LLM offline): default world');
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $('menu').appendChild(b); };
  $('menu').innerHTML = '';
  if (st.has_world) btn(`Continue: ${st.name}`, () => load());
  btn(st.has_world ? 'New World' : 'Create World', async () => {
    $('menu').innerHTML = '<p class="go">✨ The god is dreaming up a new world… (30-90 s)</p>';
    try { await api.newWorld(null); await load(); } catch (e) { $('menu').innerHTML = `<p>Creation failed: ${e.message}</p>`; }
  });
}
async function load() {
  const w = await api.world();
  G.world = w; G.profile = w.player;
  resetInput();
  initNoise(w.seed); setWorldData(w); loadEdits(w.block_edits);
  placePlayer(w);
  loadHotbar();
  renderStory({ beats: w.story.beats.slice(-3), objective: w.objective, law_texts: w.law_texts });
  startSync(renderStory);
  overlay.style.display = 'none';
  if (!w.player.descended) startHeaven(enterWorld);
  else { G.phase = 'world'; enterWorld(); }
}
async function enterWorld() {
  overlay.classList.add('in-world');
  overlay.querySelector('h1').textContent = G.world.name;
  overlay.querySelector('.box > p:not(.go)').textContent = 'Your new life is taking shape…';
  $('menu').innerHTML = '<p class="go">Preparing your world…</p>';
  $('controls').style.display = 'block';
  // Keep the heaven scene from showing through the translucent entry overlay.
  // The world renderer needs a few frames to generate and mesh the spawn chunk.
  overlay.style.background = 'rgba(9,14,13,.96)';
  overlay.style.display = 'flex';
  while (!player.ready && G.phase === 'world') {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  if (G.phase !== 'world') return;
  // Paint the world scene before making the entry screen translucent.
  paintFirstFrame();
  overlay.style.background = '';
  overlay.querySelector('.box > p:not(.go)').textContent = 'Your new life begins here. Click to enter the world.';
  $('menu').innerHTML = '<p class="go">Click anywhere to begin</p>';
}

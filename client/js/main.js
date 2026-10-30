// Entry point. Each frame: load chunks, step the simulation, draw. See the folders for everything else.
import { G, isPaused } from './core/state.js';
import { fixedSteps } from './core/loop.js';
import { api } from './net/api.js';
import { chunkReady, getBlock, streamChunks } from './sim/chunks.js';
import { ents, hurtEntity, spawnNear } from './sim/entities.js';
import { stopAiming } from './sim/mining.js';
import { player, settlePlayer } from './sim/player.js';
import { TOWNS, heightAt } from './sim/terrain.js';
import { stepWorld } from './sim/world.js';
import { updateCompass } from './ui/compass.js';
import { renderHeaven } from './ui/heaven.js';
import { updateHUD } from './ui/hud.js';
import './ui/input.js';
import { updateWorldMap } from './ui/map.js';
import { updateMinimap } from './ui/minimap.js';
import { title } from './ui/title.js';
import { chunkShown, meshChunks } from './view/chunkmesh.js';
import { renderWorld } from './view/world.js';

const FRAME_BUDGET_MS = 5; // time for chunk work each frame
const simulate = fixedSteps(stepWorld);
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000), p = player.pos; last = now;
  if (!G.world) return;
  const deadline = performance.now() + FRAME_BUDGET_MS;
  streamChunks(p.x, p.z, deadline);
  meshChunks(p.x, p.z, deadline);
  if (G.phase === 'heaven') return renderHeaven(dt);
  if (G.phase !== 'world') return;
  if (!player.ready && chunkReady(p.x, p.z) && chunkShown(p.x, p.z)) settlePlayer();
  const running = player.ready && !isPaused();
  const blend = running ? simulate(dt) : 1;
  if (!running) stopAiming();
  updateHUD(dt);
  updateCompass();
  updateMinimap(dt);
  updateWorldMap(dt);
  renderWorld(running ? dt : 0, blend);
}
requestAnimationFrame(frame);
title();

// debug handle for the browser console and automated play-tests
// isekai.teleport('Nebula') or isekai.teleport(x, z) moves you safely onto the ground
function teleport(a, b) {
  const s = typeof a === 'string' ? G.world.settlements.find(s => s.name.toLowerCase().includes(a.toLowerCase())) : null;
  const x = s ? s.cx + 3.5 : Number(a), z = s ? s.cz + TOWNS[s.type].reach + 3.5 : Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return `No place called "${a}". Try: ${G.world.settlements.map(s => s.name).join(', ')}`;
  player.pos.set(x, heightAt(Math.floor(x), Math.floor(z)) + 2, z); player.vel.set(0, 0, 0);
  return s ? `Teleported to ${s.name}` : `Teleported to ${x}, ${z}`;
}
const overlay = document.getElementById('overlay');
window.isekai = { G, player, ents, api, getBlock, hurtEntity, spawnNear, teleport, setLocked: v => { G.locked = v; G.focused = v; overlay.style.display = v ? 'none' : 'flex'; } };

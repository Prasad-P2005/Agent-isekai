// Entry point. Each frame: load chunks, step the simulation, draw. See the folders for everything else.
import { settings } from './core/settings.js';
import { G, isPaused } from './core/state.js';
import { fixedSteps } from './core/loop.js';
import { api } from './net/api.js';
import { chunkReady, getBlock, streamChunks } from './sim/chunks.js';
import { ents, hurtEntity } from './sim/entities.js';
import { stopAiming } from './sim/mining.js';
import { player, settlePlayer } from './sim/player.js';
import { spawnNear } from './sim/spawning.js';
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
import { scaleNow, setAutoScale } from './view/scene.js';
import { renderWorld } from './view/world.js';

const FRAME_BUDGET_MS = 5; // time for chunk work each frame
const PAUSED_FPS = 30; // nothing is moving, so a paused game keeps the machine cool
const TUNE_EVERY = 1.5, SCALE_STEP = 0.07, MIN_SCALE = 0.5, EASY_ROUNDS = 3; // auto resolution: how often it looks, how far it moves, and how long it waits before going back up
const simulate = fixedSteps(stepWorld);
let last = performance.now(), tuneT = 0, tuneFrames = 0, easy = 0;

// Lower quickly and raise slowly, or the picture would pump up and down around the target.
function tuneResolution(seconds) {
  if (!settings.autoScale || isPaused()) { tuneT = tuneFrames = 0; return; }
  tuneT += seconds; tuneFrames++;
  if (tuneT < TUNE_EVERY) return;
  const fps = tuneFrames / tuneT, target = Math.min(settings.fpsCap || 60, 60), scale = scaleNow();
  tuneT = tuneFrames = 0;
  if (fps < target * 0.86 && scale > MIN_SCALE) { easy = 0; setAutoScale(Math.max(MIN_SCALE, scale - SCALE_STEP)); }
  else if (fps > target * 0.97 && scale < 1 && ++easy >= EASY_ROUNDS) { easy = 0; setAutoScale(Math.min(1, scale + SCALE_STEP)); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const fps = isPaused() && G.phase === 'world' ? Math.min(settings.fpsCap || PAUSED_FPS, PAUSED_FPS) : settings.fpsCap, gap = fps ? 1000 / fps : 0, since = now - last;
  if (since < gap - 1) return;
  const dt = Math.min(0.05, since / 1000), p = player.pos; last = now;
  if (!G.world) return;
  tuneResolution(since / 1000);
  const deadline = performance.now() + FRAME_BUDGET_MS;
  streamChunks(p.x, p.z, deadline);
  meshChunks(p.x, p.z, deadline, -Math.sin(player.yaw), -Math.cos(player.yaw));
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

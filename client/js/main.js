// Entry point: title screen, loading the world from the server, input, and the main loop.
import * as THREE from 'three';
import { G } from './state.js';
import { api } from './api.js';
import { initNoise, ss } from './noise.js';
import { BL, BUILT, hardness, dropOf } from './blocks.js';
import { setWorldData, heightAt, landOf, landName, REALM, LAND, SEA } from './terrain.js';
import { updateChunks, getBlock, setBlock, chunkReady } from './chunks.js';
import { renderer, scene, camera, sky, sunLight, highlight, opaqueMat, transMat, SKY, UNDER, NIGHT_SKY, DEMON_SKY, skyNow, RD } from './scene.js';
import { player, updatePlayer, updateStats, raycast, collides, doubleJump, castFireball, castHeal, drink, has, maxHp } from './player.js';
import { updateEntities, pickEntity, meleeHit, ents, hurtEntity, spawnNear } from './entities.js';
import { updateResidents, updateLaw, talkToNearest, onBreakBlock } from './people.js';
import { toast, updateHUD, renderStory, startFeed, openPrayer, closePanel, toggleLaws, setOracle, applyState } from './ui.js';
import { startHeaven, renderHeaven } from './heaven.js';
import { inventory, addBlock, takeBlock, renderHotbar, hotbarId, selectSlot, cycleSlot, openInventory } from './inventory.js';

const $ = id => document.getElementById(id);
const overlay = $('overlay');

// ---------- title screen ----------
async function title() {
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
  renderHotbar();
  initNoise(w.seed); setWorldData(w);
  renderStory({ beats: w.story.beats.slice(-3), objective: w.objective, law_texts: w.law_texts });
  player.pos.set(w.spawn.x, heightAt(Math.floor(w.spawn.x), Math.floor(w.spawn.z)) + 2, w.spawn.z);
  player.spawn.copy(player.pos);
  player.hp = maxHp();
  startFeed();
  overlay.style.display = 'none';
  if (!w.player.descended) startHeaven(enterWorld);
  else { G.phase = 'world'; enterWorld(); }
}
function enterWorld() {
  $('menu').innerHTML = '<p class="go">Click to enter the world</p>';
  $('controls').style.display = 'block';
  overlay.style.display = 'flex';
}

// ---------- input ----------
addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (G.uiOpen) { if (e.code === 'Escape') closePanel(); return; }
  if (!G.locked) return;
  if (e.code === 'KeyF') { if (has('flight')) { player.fly = !player.fly; player.vel.y = 0; } else toast('You have not learned flight.', 2); }
  if (e.code === 'Space') doubleJump();
  if (e.code === 'KeyQ') castFireball();
  if (e.code === 'KeyR') castHeal();
  if (e.code === 'KeyG') drink('potion');
  if (e.code === 'KeyV') drink('mana');
  if (e.code === 'KeyE') talkToNearest();
  if (e.code === 'KeyL') toggleLaws();
  if (e.code === 'KeyI') openInventory();
  if (e.code === 'KeyT') { e.preventDefault(); openPrayer(); }
  if (/^Digit\d$/.test(e.code)) selectSlot((Number(e.code[5]) + 9) % 10);
});
addEventListener('keyup', e => { G.keys[e.code] = false; });
overlay.addEventListener('click', e => { if (G.phase === 'world' && player.ready && !e.target.closest('button')) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  G.locked = document.pointerLockElement === renderer.domElement;
  overlay.style.display = G.locked || G.uiOpen || G.phase !== 'world' ? 'none' : 'flex';
  if (!G.locked) for (const k in G.keys) G.keys[k] = false;
});
document.addEventListener('mousemove', e => {
  if (!G.locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022));
});

// ---------- mining (hold left mouse) and building (right mouse, uses your inventory) ----------
let target = null, mining = null, mouseDown = false;
addEventListener('wheel', e => { if (G.locked) cycleSlot(e.deltaY > 0 ? 1 : -1); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', e => { if (e.button === 0) { mouseDown = false; mining = null; } });
addEventListener('mousedown', e => {
  if (!G.locked) return;
  if (e.button === 0) {
    mouseDown = true;
    const hit = pickEntity(4.5);
    if (hit && (!target || hit.t < target.t)) { mouseDown = false; return meleeHit(hit.e); }
  } else if (e.button === 2 && target) {
    const id = hotbarId();
    if (!id) return toast('Nothing to place. Mine some blocks first (hold left click).', 2);
    const x = target.x + target.n[0], y = target.y + target.n[1], z = target.z + target.n[2], p = player.pos;
    const overlap = x + 1 > p.x - 0.3 && x < p.x + 0.3 && z + 1 > p.z - 0.3 && z < p.z + 0.3 && y + 1 > p.y && y < p.y + 1.8;
    if (!overlap && [0, 5].includes(getBlock(x, y, z)) && takeBlock(id)) setBlock(x, y, z, id);
  }
});
function updateMining(dt) {
  const bar = $('minebar');
  if (!mouseDown || !target) { mining = null; bar.style.display = 'none'; return; }
  const id = getBlock(target.x, target.y, target.z);
  if (!mining || mining.x !== target.x || mining.y !== target.y || mining.z !== target.z) mining = { x: target.x, y: target.y, z: target.z, t: 0 };
  const need = hardness(id) / (G.profile?.tool || 1);
  if (!isFinite(need)) { bar.style.display = 'block'; bar.firstChild.style.width = '0%'; bar.lastChild.textContent = `${BL[id].name} cannot be broken`; return; }
  mining.t += dt;
  bar.style.display = 'block'; bar.firstChild.style.width = Math.min(100, 100 * mining.t / need) + '%'; bar.lastChild.textContent = BL[id].name;
  if (mining.t < need) return;
  const { x, y, z } = mining;
  const nearWater = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => getBlock(x + a, y + b, z + c) === 5);
  setBlock(x, y, z, nearWater && y <= SEA ? 5 : 0);
  const drop = dropOf(id);
  if (drop) addBlock(drop);
  onBreakBlock(x, z, id, BUILT);
  mining = null;
}

// ---------- main loop ----------
let last = performance.now(), currentLand = null, realmT = 0, hudT = 0, frames = 0, fps = 0, fpsT = 0;
function showLand(L) {
  $('realm').innerHTML = `${landName(L).replace(/</g, '&lt;')}<small>${REALM[L.b][1]}</small>`;
  $('realm').style.opacity = 1; realmT = 4;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.world) return;
  updateChunks(player.pos.x, player.pos.z);
  if (G.phase === 'heaven') return renderHeaven(dt);
  if (G.phase !== 'world') return;

  const p = player.pos;
  if (!player.ready && chunkReady(p.x, p.z)) {
    let y = 159; while (y > 0 && !getBlock(Math.floor(p.x), y, Math.floor(p.z))) y--;
    p.y = y + 1; player.spawn.copy(p); player.ready = true;
  }
  if (player.ready && G.locked) {
    if (chunkReady(p.x, p.z)) updatePlayer(dt);
    let guard = 0; while (collides(p) && guard++ < 40) p.y += 1;
    const lx = Math.floor(p.x / LAND), lz = Math.floor(p.z / LAND), lk = lx + ',' + lz;
    if (lk !== currentLand) {
      currentLand = lk; showLand(landOf(p.x, p.z));
      api.event({ type: 'enter_land', lx, lz }).then(applyState).catch(() => {});
    }
    updateEntities(dt); updateResidents(dt); updateLaw(dt); updateStats(dt); updateMining(dt);
    G.dayTime = (G.dayTime + dt / 600) % 1;
  }
  updateHUD(dt);
  if (realmT > 0) { realmT -= dt; if (realmT <= 0) $('realm').style.opacity = 0; }

  camera.position.set(p.x, p.y + 1.62, p.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  sky.position.copy(camera.position);
  const sunH = Math.sin(G.dayTime * Math.PI * 2);
  sky.rotation.z = G.dayTime * Math.PI * 2 - 0.5;
  const light = 0.25 + 0.75 * ss(-0.25, 0.25, sunH);
  skyNow.copy(SKY).lerp(NIGHT_SKY, 1 - (light - 0.25) / 0.75);
  if (landOf(p.x, p.z).b === 6) skyNow.lerp(DEMON_SKY, 0.6);
  opaqueMat.color.setScalar(light); transMat.color.setScalar(light); sunLight.intensity = 1.1 * light;
  const under = getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === 5;
  scene.background.copy(under ? UNDER : skyNow); scene.fog.color.copy(under ? UNDER : skyNow);
  scene.fog.near = under ? 2 : 40; scene.fog.far = under ? 28 : RD * 16 - 8;
  $('water').style.display = under ? 'block' : 'none';

  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  target = G.locked ? raycast(camera.position, dir, 7) : null;
  highlight.visible = !!target;
  if (target) highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

  frames++; fpsT += dt; if (fpsT >= 1) { fps = frames; frames = 0; fpsT = 0; }
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.25; $('hud').textContent = `XYZ ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}\n${sunH < -0.1 ? '🌙 Night' : '☀ Day'} · ${fps} fps · ${ents.length} beings`; }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
title();
// debug handle for the browser console and automated play-tests
// isekai.teleport('Nebula') or isekai.teleport(x, z) moves you safely onto the ground
function teleport(a, b) {
  const s = typeof a === 'string' ? G.world.settlements.find(s => s.name.toLowerCase().includes(a.toLowerCase())) : null;
  const x = s ? s.cx + 3.5 : Number(a), z = s ? s.cz + 33.5 : Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return `No place called "${a}". Try: ${G.world.settlements.map(s => s.name).join(', ')}`;
  player.pos.set(x, heightAt(Math.floor(x), Math.floor(z)) + 2, z); player.vel.set(0, 0, 0);
  return s ? `Teleported to ${s.name}` : `Teleported to ${x}, ${z}`;
}
window.isekai = { G, player, ents, api, getBlock, hurtEntity, spawnNear, teleport, setLocked: v => { G.locked = v; overlay.style.display = v ? 'none' : 'flex'; } };

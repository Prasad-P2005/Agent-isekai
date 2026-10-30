// Keyboard, mouse and pointer lock.
import { G, controlsActive } from '../core/state.js';
import { toast } from '../core/events.js';
import { castFireball, castHeal, doubleJump, drink, toggleFlight } from '../sim/abilities.js';
import { meleeHit, pickEntity } from '../sim/entities.js';
import { cycleSlot, selectSlot } from '../sim/inventory.js';
import { aim, placeBlock } from '../sim/mining.js';
import { talkToNearest } from '../sim/people.js';
import { player } from '../sim/player.js';
import { renderer } from '../view/scene.js';
import { toggleLaws } from './hud.js';
import { openInventory } from './inventory.js';
import { closeWorldMap, isWorldMapOpen, toggleWorldMap } from './map.js';
import { closePanel, openPrayer } from './panels.js';

const overlay = document.getElementById('overlay');
let pointerLockFallback = false;
const NO_POINTER_LOCK = 'Pointer lock is unavailable. Use WASD or the arrow keys to move; press Esc to pause.';

export function resetInput() {
  pointerLockFallback = false;
  G.locked = G.focused = G.uiOpen = false;
  G.keys = {};
}
function releaseKeys() { for (const k in G.keys) G.keys[k] = false; }

addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && G.focused && !G.locked && !G.uiOpen) {
    G.focused = false;
    overlay.style.display = 'flex';
    releaseKeys();
    return;
  }
  if (e.code === 'KeyM') { e.preventDefault(); toggleWorldMap(); return; }
  if (G.uiOpen) { if (e.code === 'Escape') { if (isWorldMapOpen()) closeWorldMap(); else closePanel(); } return; }
  if (!controlsActive()) return;
  if (e.code === 'KeyF') toggleFlight();
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

overlay.addEventListener('click', e => {
  if (G.phase !== 'world' || !player.ready || e.target.closest('button')) return;
  G.focused = true;
  overlay.style.display = 'none';
  const fallBack = () => {
    pointerLockFallback = true;
    G.focused = true;
    overlay.style.display = 'none';
    toast(NO_POINTER_LOCK, 7);
  };
  try {
    const request = renderer.domElement.requestPointerLock;
    if (typeof request !== 'function') throw new Error('Pointer lock is unavailable');
    const result = request.call(renderer.domElement);
    if (result?.catch) result.catch(fallBack);
  } catch {
    fallBack();
  }
});
document.addEventListener('pointerlockchange', () => {
  G.locked = document.pointerLockElement === renderer.domElement;
  if (G.locked) { G.focused = true; pointerLockFallback = false; }
  else if (!pointerLockFallback) G.focused = false;
  overlay.style.display = G.locked || G.focused || G.uiOpen || G.phase !== 'world' ? 'none' : 'flex';
  if (!G.locked) releaseKeys();
});
document.addEventListener('mousemove', e => {
  if (!controlsActive()) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022));
});

addEventListener('wheel', e => { if (controlsActive()) cycleSlot(e.deltaY > 0 ? 1 : -1); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', e => { if (e.button === 0) G.mouseDown = false; });
addEventListener('mousedown', e => {
  if (!controlsActive() || G.uiOpen) return;
  if (e.button === 0) {
    G.mouseDown = true;
    const hit = pickEntity(4.5);
    if (hit && (!aim.block || hit.t < aim.block.t)) { G.mouseDown = false; meleeHit(hit.e); }
  } else if (e.button === 2) placeBlock();
});

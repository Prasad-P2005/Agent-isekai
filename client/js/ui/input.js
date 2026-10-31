// Keyboard and mouse buttons. Who holds the mouse is decided in pointer.js.
import { G, controlsActive } from '../core/state.js';
import { castSlot, doubleJump, toggleFlight } from '../sim/abilities.js';
import { meleeHit, pickEntity, reachOfHand } from '../sim/entities.js';
import { drinkBest, pressUse, releaseUse } from '../sim/hands.js';
import { cycleSlot, selectSlot } from '../sim/inventory.js';
import { aim } from '../sim/mining.js';
import { talkToNearest } from '../sim/people.js';
import { toggleDebug } from './hud.js';
import './inventory.js';
import './journal.js';
import './map.js';
import { closePanel, menuOpen, openPrayer, togglePage } from './panels.js';
import { capture, isPauseShown, pause, resetPointer, usingFreeMouse } from './pointer.js';

const PAGE_KEYS = { KeyI: 'bag', KeyJ: 'journal', KeyL: 'laws', KeyM: 'map' };

export function resetInput() {
  resetPointer();
  G.uiOpen = false;
  G.keys = {};
}

addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && e.repeat) return; // Esc held after closing a menu must not go on to pause
  if (e.code === 'F3') { e.preventDefault(); toggleDebug(); return; }
  if (PAGE_KEYS[e.code]) { e.preventDefault(); togglePage(PAGE_KEYS[e.code]); return; }
  if (G.uiOpen) {
    if (e.code === 'Escape' || (e.code === 'KeyE' && !menuOpen())) closePanel();
    return;
  }
  if (isPauseShown()) {
    // Esc cannot resume: the browser only hands the mouse back for a click or another key.
    if (e.code === 'Enter' || e.code === 'Space' || (e.code === 'Escape' && usingFreeMouse())) { e.preventDefault(); capture(); }
    return;
  }
  if (e.code === 'Escape' && G.focused && !G.locked) { pause(); return; }
  if (!controlsActive()) return;
  if (e.code === 'KeyF') toggleFlight();
  if (e.code === 'Space') doubleJump();
  if (!e.repeat && e.code === 'KeyQ') castSlot(0); // a held key must not pour a whole well away
  if (!e.repeat && e.code === 'KeyR') castSlot(1);
  if (e.code === 'KeyG') drinkBest(['potion', 'greater_health']);
  if (e.code === 'KeyV') drinkBest(['mana', 'greater_mana']);
  if (e.code === 'KeyE') talkToNearest();
  if (e.code === 'KeyT') { e.preventDefault(); openPrayer(); }
  if (/^Digit[1-9]$/.test(e.code)) selectSlot(Number(e.code[5]) - 1);
});
addEventListener('keyup', e => { G.keys[e.code] = false; });

addEventListener('wheel', e => { if (controlsActive() && !G.uiOpen) cycleSlot(e.deltaY > 0 ? 1 : -1); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', e => { if (e.button === 0) G.mouseDown = false; if (e.button === 2) { G.mouseRight = false; releaseUse(); } });
addEventListener('mousedown', e => {
  if (!controlsActive() || G.uiOpen) return;
  if (e.button === 0) {
    G.mouseDown = true;
    const hit = pickEntity(reachOfHand());
    if (hit && (!aim.block || hit.t < aim.block.t)) { G.mouseDown = false; meleeHit(hit.e); }
  } else if (e.button === 2) { G.mouseRight = true; pressUse(); }
});

// Keyboard and mouse buttons. Who holds the mouse is decided in pointer.js.
import { actionOf, flipSprint } from '../core/bindings.js';
import { toast } from '../core/events.js';
import { setSetting, settings } from '../core/settings.js';
import { G, controlsActive } from '../core/state.js';
import { castSlot, doubleJump, toggleFlight } from '../sim/abilities.js';
import { meleeHit, pickEntity, reachOfHand } from '../sim/entities.js';
import { tossHeld } from '../sim/drops.js';
import { drinkBest, pressUse, releaseUse } from '../sim/hands.js';
import { cycleSlot, selectSlot } from '../sim/inventory.js';
import { aim } from '../sim/mining.js';
import { talkToNearest } from '../sim/people.js';
import { toggleDebug, toggleHud } from './hud.js';
import './inventory.js';
import './extras.js';
import './journal.js';
import './look.js';
import './map.js';
import './settings.js';
import { closePanel, menuOpen, openPrayer, togglePage } from './panels.js';
import { capture, isPauseShown, pause, resetPointer, usingFreeMouse } from './pointer.js';

const PAGES = { bag: 'bag', journal: 'journal', laws: 'laws', map: 'map', settings: 'graphics' };

export function resetInput() {
  resetPointer();
  G.uiOpen = false;
  G.keys = {};
}

const typing = e => e.target.matches?.('input[type=search], input[type=text]');
addEventListener('keydown', e => {
  if (typing(e) && e.code !== 'Escape') return; // I closes the bag, unless the I is part of the word "iron"
  G.keys[e.code] = true;
  if (!menuOpen() && G.phase !== 'title' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); // in a menu these belong to its sliders and buttons
  if (e.code === 'Escape' && e.repeat) return; // Esc held after closing a menu must not go on to pause
  const act = actionOf(e.code);
  if (/^F\d/.test(e.code) && act) e.preventDefault();
  if (act === 'debug') { toggleDebug(); return; }
  if (act === 'hideHud') { toggleHud(); return; }
  if (act === 'shaders' && !e.repeat) { setSetting('shaders', settings.shaders ? 0 : 1); toast(`Shaders ${settings.shaders ? 'on' : 'off'}`, 2); return; }
  if (PAGES[act]) { e.preventDefault(); togglePage(PAGES[act]); return; }
  if (G.uiOpen) {
    if (e.code === 'Escape' || (act === 'talk' && !menuOpen())) closePanel();
    return;
  }
  if (isPauseShown()) {
    // Esc cannot resume: the browser only hands the mouse back for a click or another key.
    if (e.code === 'Enter' || e.code === 'Space' || (e.code === 'Escape' && usingFreeMouse())) { e.preventDefault(); capture(); }
    return;
  }
  if (e.code === 'Escape' && G.focused && !G.locked) { pause(); return; }
  if (!controlsActive()) return;
  if (act === 'sprint' && !e.repeat && settings.sprintMode) flipSprint();
  if (act === 'fly') toggleFlight();
  if (act === 'jump') doubleJump();
  if (!e.repeat && act === 'spell1') castSlot(0); // a held key must not pour a whole well away
  if (!e.repeat && act === 'spell2') castSlot(1);
  if (act === 'drop') { e.preventDefault(); tossHeld(e.ctrlKey); } // Ctrl+G is the browser's too, and held down this goes on throwing, as Minecraft's does
  if (act === 'health') drinkBest(['potion', 'greater_health']);
  if (act === 'mana') drinkBest(['mana', 'greater_mana']);
  if (act === 'talk') talkToNearest();
  if (act === 'pray') { e.preventDefault(); openPrayer(); }
  if (/^Digit[1-9]$/.test(e.code)) selectSlot(Number(e.code[5]) - 1);
});
addEventListener('keyup', e => { G.keys[e.code] = false; });

addEventListener('wheel', e => { if (controlsActive() && !G.uiOpen) cycleSlot((e.deltaY > 0) !== !!settings.wheelFlip ? 1 : -1); });
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

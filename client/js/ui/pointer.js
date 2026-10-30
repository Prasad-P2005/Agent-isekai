// Who has the mouse: the game, a menu or the pause screen. Only this module decides, so that closing a
// menu always lands back in the game.
//
// The browser's rules shape everything here, and these are Chrome's:
// - A lock needs a click or key press, unless the page released the previous lock itself.
// - After the player escapes a lock, every request fails for 1.25 s.
// - Letting go of Esc counts as pressing it. Lock while Esc is down and the release drops the lock again,
//   which looks exactly like the player pausing. So a lock always waits for Esc to come up.
import { G, controlsActive } from '../core/state.js';
import { toast } from '../core/events.js';
import { player } from '../sim/player.js';
import { renderer } from '../view/scene.js';

const $ = id => document.getElementById(id);
const canvas = renderer.domElement, overlay = $('overlay');
const ESCAPE_COOLDOWN = 1300, RETRY_EVERY = 250, RETRY_FOR = 1700;
const FAILURES_BEFORE_FREE_MOUSE = 2;
const NO_LOCK = 'Pointer lock is unavailable. Use WASD or the arrow keys to move; press Esc to pause.';
const LOOK = 0.0022, MAX_LOOK_STEP = 500, SKIP_AFTER_LOCK = 2; // a jump this big in one event is a browser glitch, not a flick
const MAX_PITCH = 1.55, SPEED_KEY = 'isekai-mouse-speed';

let wanting = false;   // the player should have the mouse; a lock is on its way
let releasing = false; // we gave the lock up and the browser has not confirmed it yet
let requesting = false;
let escHeld = false;
let giveUpAt = 0, retryTimer = 0, escapedAt = -Infinity, failures = 0;
let freeMouse = typeof canvas.requestPointerLock !== 'function'; // no lock to be had: play with the cursor showing
let skipMoves = 0;

export const mouse = { speed: 1 };
try { mouse.speed = Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { /* no storage */ }
export function setMouseSpeed(speed) {
  mouse.speed = speed;
  try { localStorage.setItem(SPEED_KEY, speed); } catch { /* no storage */ }
}

function stopInput() {
  for (const k in G.keys) G.keys[k] = false;
  G.mouseDown = false;
}

function requestLock() {
  clearTimeout(retryTimer);
  if (!wanting || G.locked || releasing || escHeld || requesting) return;
  requesting = true;
  try {
    const result = canvas.requestPointerLock();
    if (result?.catch) result.catch(lockFailed);
  } catch (error) {
    lockFailed(error);
  }
}
function lockFailed(error) {
  if (!requesting) return; // the promise and the pointerlockerror event report the same failure
  requesting = false;
  if (!wanting) return;
  const needsGesture = error?.name === 'NotAllowedError';
  if (!needsGesture && performance.now() < giveUpAt) { retryTimer = setTimeout(requestLock, RETRY_EVERY); return; }
  if (!needsGesture && ++failures >= FAILURES_BEFORE_FREE_MOUSE) {
    freeMouse = true; wanting = false;
    toast(NO_LOCK, 7);
    return;
  }
  pause();
}
document.addEventListener('pointerlockerror', lockFailed);

// Back to the game. Play resumes at once and the lock catches up, so a wait never feels like a frozen screen.
export function capture() {
  overlay.style.display = 'none';
  G.focused = true;
  if (freeMouse || (G.locked && !releasing)) return; // while releasing, G.locked is out of date
  wanting = true;
  giveUpAt = performance.now() + RETRY_FOR;
  // A request during the cooldown could use up the click that earned it, so wait the cooldown out first.
  const wait = escapedAt + ESCAPE_COOLDOWN - performance.now();
  if (wait > 0) { giveUpAt += wait; retryTimer = setTimeout(requestLock, wait); } else requestLock();
}
// A menu takes the mouse.
export function release() {
  clearTimeout(retryTimer);
  wanting = requesting = false;
  G.focused = false;
  stopInput();
  if (!document.pointerLockElement) return;
  releasing = true;
  document.exitPointerLock();
}
export function pause() {
  clearTimeout(retryTimer);
  wanting = requesting = false;
  G.focused = false;
  stopInput();
  overlay.classList.add('in-world', 'paused');
  $('pausename').textContent = G.world.name;
  overlay.style.display = 'flex';
  $('resume').focus({ preventScroll: true });
}
export const isPauseShown = () => overlay.classList.contains('paused') && overlay.style.display === 'flex';
export const usingFreeMouse = () => freeMouse;
export function resetPointer() {
  clearTimeout(retryTimer);
  wanting = releasing = requesting = false;
  G.locked = G.focused = false;
}

document.addEventListener('pointerlockchange', () => {
  G.locked = document.pointerLockElement === canvas;
  requesting = false;
  if (G.locked) {
    releasing = false;
    if (!wanting) { releasing = true; document.exitPointerLock(); return; } // a lock that arrived after the player paused
    wanting = false; failures = 0;
    G.focused = false;
    skipMoves = SKIP_AFTER_LOCK;
    return;
  }
  if (releasing) { // the release we asked for; a menu may already have closed again
    releasing = false;
    requestLock();
    return;
  }
  // The browser took the lock: Esc, or the window lost focus.
  escapedAt = performance.now();
  stopInput();
  if (!G.uiOpen && G.phase === 'world') pause();
});

// Listening on the way down, so that an input swallowing the key cannot hide it from us.
addEventListener('keydown', e => { if (e.code === 'Escape') escHeld = true; }, true);
addEventListener('keyup', e => { if (e.code === 'Escape') { escHeld = false; requestLock(); } }, true);
addEventListener('blur', () => {
  escHeld = false;
  stopInput();
  if (G.focused && !G.uiOpen && G.phase === 'world') pause();
});

document.addEventListener('mousemove', e => {
  if (!controlsActive()) return;
  if (skipMoves > 0) { skipMoves--; return; }
  if (Math.abs(e.movementX) > MAX_LOOK_STEP || Math.abs(e.movementY) > MAX_LOOK_STEP) return;
  player.yaw -= e.movementX * LOOK * mouse.speed;
  player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch - e.movementY * LOOK * mouse.speed));
});

overlay.addEventListener('click', e => {
  if (G.phase !== 'world' || !player.ready || e.target.closest('button')) return;
  capture();
});
$('resume').addEventListener('click', capture);

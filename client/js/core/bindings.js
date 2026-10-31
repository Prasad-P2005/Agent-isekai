// Which key does what. Everything reads keys through here, so that the simulation asks "is the hero moving forward" rather than "is W down".
// The mouse buttons, Esc and the number row stay fixed: Esc is how the browser hands the mouse back, and the rest are what the screen shows.
import { G } from './state.js';
import { emit } from './events.js';

const KEY = 'isekai-keys';

export const ACTIONS = [
  { id: 'forward', group: 'Moving', label: 'Forward', keys: ['KeyW', 'ArrowUp'] },
  { id: 'back', group: 'Moving', label: 'Back', keys: ['KeyS', 'ArrowDown'] },
  { id: 'left', group: 'Moving', label: 'Left', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'right', group: 'Moving', label: 'Right', keys: ['KeyD', 'ArrowRight'] },
  { id: 'jump', group: 'Moving', label: 'Jump or swim', keys: ['Space'] },
  { id: 'sprint', group: 'Moving', label: 'Sprint', keys: ['ShiftLeft', 'ShiftRight'] },
  { id: 'fly', group: 'Moving', label: 'Fly', keys: ['KeyF'] },
  { id: 'talk', group: 'Doing', label: 'Talk or trade', keys: ['KeyE'] },
  { id: 'pray', group: 'Doing', label: 'Pray to the god', keys: ['KeyT'] },
  { id: 'spell1', group: 'Doing', label: 'First spell', keys: ['KeyQ'] },
  { id: 'spell2', group: 'Doing', label: 'Second spell', keys: ['KeyR'] },
  { id: 'health', group: 'Doing', label: 'Drink a health potion', keys: ['KeyG'] },
  { id: 'mana', group: 'Doing', label: 'Drink a mana potion', keys: ['KeyV'] },
  { id: 'bag', group: 'Menus', label: 'Bag', keys: ['KeyI'] },
  { id: 'journal', group: 'Menus', label: 'Journal', keys: ['KeyJ'] },
  { id: 'laws', group: 'Menus', label: 'Laws', keys: ['KeyL'] },
  { id: 'map', group: 'Menus', label: 'Map', keys: ['KeyM'] },
  { id: 'settings', group: 'Menus', label: 'Settings', keys: ['KeyO'] },
  { id: 'debug', group: 'Menus', label: 'Frame rate and position', keys: ['F3'] },
  { id: 'shaders', group: 'Menus', label: 'Shaders on or off', keys: ['F4'] },
  { id: 'hideHud', group: 'Menus', label: 'Hide the screen display', keys: ['F1'] },
];
const FIXED = new Set(['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);
const defaults = () => Object.fromEntries(ACTIONS.map(a => [a.id, [...a.keys]]));

export const bindings = defaults();
try {
  const stored = JSON.parse(localStorage.getItem(KEY)) ?? {};
  for (const a of ACTIONS) if (Array.isArray(stored[a.id]) && stored[a.id].length) bindings[a.id] = stored[a.id].filter(k => typeof k === 'string');
} catch { /* no storage, or nothing usable in it */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(bindings)); } catch { /* no storage */ }
  emit('bindings:changed');
}
export const held = action => { const k = G.keys; return bindings[action].some(code => k[code]); };
export const pressed = (action, code) => bindings[action].includes(code);
export const actionOf = code => ACTIONS.find(a => bindings[a.id].includes(code))?.id ?? null;
export const canBind = code => !FIXED.has(code);
// The new key takes the place of the first one, the arrow keys and the like stay as they were, and whatever held the key before gets the old one, so nothing is left without a key.
export function rebind(action, code) {
  if (!canBind(code)) return false;
  const was = bindings[action][0], other = ACTIONS.find(a => a.id !== action && bindings[a.id].includes(code));
  if (other) bindings[other.id] = bindings[other.id].map(k => (k === code ? was : k));
  bindings[action] = [code, ...bindings[action].slice(1).filter(k => k !== code)];
  save();
  return true;
}
export function resetBindings() {
  Object.assign(bindings, defaults());
  save();
}

const NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps Lock' };
export function keyName(code) {
  if (NAMES[code]) return NAMES[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
export const keyOf = action => keyName(bindings[action][0]);
export const spellKey = slot => keyOf(slot ? 'spell2' : 'spell1');

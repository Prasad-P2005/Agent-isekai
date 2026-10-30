// The game's messages. The simulation announces what happened; the screen, the network and other systems listen.
const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push(fn);
}
export function emit(name, data) { for (const fn of listeners.get(name) || []) fn(data); }
export const toast = (text, seconds = 5) => emit('toast', { text, seconds });

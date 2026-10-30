// Shared mutable game state across client modules.
export const G = {
  world: null,      // world data from the server
  profile: null,    // player profile (gold, abilities, ...) owned by the server
  phase: 'title',   // title | heaven | world
  locked: false,    // pointer lock active
  focused: false,   // world controls active when pointer lock is unavailable
  uiOpen: false,    // a panel (shop, prayer, ...) has the mouse
  keys: {},
  mouseDown: false,
  objective: '',
  marks: [],        // what the hero is after, from the server; sim/marks.js says where it is now
  dayTime: 0.08,    // 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
};
export const controlsActive = () => G.locked || G.focused;
export const isPaused = () => !controlsActive() || G.uiOpen;

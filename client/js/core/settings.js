// How the player wants the game to look. Each option is one entry here, and the settings pages in ui/settings.js are drawn from this list,
// so a new option is a new line. Nothing here touches the DOM or three, so the simulation can read it too. Whoever cares listens for
// 'settings:changed', which says which keys moved, and acts on those.
import { emit } from './events.js';

const KEY = 'isekai-graphics';

const offOn = [[0, 'Off'], [1, 'On']];
const scale = (low, high) => [[0, 'Off'], [1, low], [2, high]];
// kind 'range' is a slider, anything with `choices` is a row of buttons. `heavy` means a change rebuilds the world's meshes, so it says so.
export const OPTIONS = [
  { id: 'renderDistance', page: 'graphics', group: 'View', label: 'Render distance', about: 'How many chunks you can see in each direction', min: 4, max: 20, step: 1, unit: ' chunks', def: 10 },
  { id: 'renderScale', page: 'graphics', group: 'View', label: 'Resolution', about: 'Lower is much faster and a little softer', min: 40, max: 100, step: 5, unit: '%', def: 100 },
  { id: 'autoScale', page: 'graphics', group: 'View', label: 'Auto resolution', about: 'Lowers the resolution by itself when the frame rate drops', choices: offOn, def: 0 },
  { id: 'fullscreen', page: 'graphics', group: 'View', label: 'Full screen', choices: offOn, def: 0, session: true },
  { id: 'fpsCap', page: 'graphics', group: 'View', label: 'Frame rate limit', about: 'A limit saves power and keeps a laptop cool', choices: [[30, '30'], [60, '60'], [90, '90'], [120, '120'], [0, 'Max']], def: 0 },
  { id: 'fov', page: 'graphics', group: 'View', label: 'Field of view', min: 60, max: 110, step: 1, unit: '°', def: 75 },
  { id: 'fovEffects', page: 'graphics', group: 'View', label: 'Speed widens the view', about: 'Sprinting and flying open the view out. Swimming narrows it', min: 0, max: 100, step: 10, unit: '%', def: 100 },
  { id: 'bobbing', page: 'graphics', group: 'View', label: 'View bobbing', about: 'The head moves with each step', choices: offOn, def: 1 },
  { id: 'titleWorld', page: 'graphics', group: 'View', label: 'Live title screen', about: 'The real world behind the main menu. Off shows a painting, which is kinder to a weak machine', choices: offOn, def: 1 },

  { id: 'leaves', page: 'graphics', group: 'World', label: 'Leaves', about: 'Fast draws a tree as a solid shape, which is the biggest saving in a forest', choices: [[0, 'Fast'], [1, 'Fancy']], def: 1, heavy: true },
  { id: 'smoothLight', page: 'graphics', group: 'World', label: 'Smooth lighting', about: 'Soft shade in corners and where blocks meet', choices: offOn, def: 1, heavy: true },
  { id: 'sway', page: 'graphics', group: 'World', label: 'Moving plants', choices: offOn, def: 1 },
  { id: 'clouds', page: 'graphics', group: 'World', label: 'Clouds', choices: [[0, 'Off'], [1, 'Fast'], [2, 'Fancy']], def: 2 },
  { id: 'particles', page: 'graphics', group: 'World', label: 'Air particles', about: 'Fireflies, ash, snow and bubbles', choices: [[0, 'Off'], [1, 'Few'], [2, 'All']], def: 2 },
  { id: 'fish', page: 'graphics', group: 'World', label: 'Fish', choices: offOn, def: 1 },
  { id: 'fogFade', page: 'graphics', group: 'World', label: 'Distance haze', about: 'How soon the far land fades into the sky', min: 50, max: 150, step: 5, unit: '%', def: 100 },
  { id: 'fxaa', page: 'graphics', group: 'World', label: 'Smooth edges', about: 'Softens jagged edges with shaders on', choices: offOn, def: 1 },

  { id: 'shaders', page: 'shaders', group: 'Shaders', label: 'Shaders', about: 'Sun shadows, soft light, glowing skies and deep water. Needs a good graphics card', choices: offOn, def: 0 },
  { id: 'shadows', page: 'shaders', group: 'Shadows', label: 'Sun shadows', choices: [[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High'], [4, 'Ultra']], def: 2 },
  { id: 'softShadows', page: 'shaders', group: 'Shadows', label: 'Soft edges', about: 'More samples make softer shadows', choices: [[0, 'Off'], [1, 'Soft'], [2, 'Softest']], def: 1 },
  { id: 'bodyShadows', page: 'shaders', group: 'Shadows', label: 'Shadows of creatures', choices: offOn, def: 1 },

  { id: 'waterQuality', page: 'shaders', group: 'Water', label: 'Water', about: 'High adds reflections of the land. Ultra traces them further', choices: [[1, 'Low'], [2, 'High'], [3, 'Ultra']], def: 2 },
  { id: 'caustics', page: 'shaders', group: 'Water', label: 'Light on the sea bed', choices: offOn, def: 1 },
  { id: 'waterRipple', page: 'shaders', group: 'Water', label: 'Ripple height', min: 0, max: 200, step: 10, unit: '%', def: 100 },
  { id: 'waterClarity', page: 'shaders', group: 'Water', label: 'Clarity', about: 'How far you can see down into water', min: 30, max: 200, step: 10, unit: '%', def: 100 },
  { id: 'underwaterWarp', page: 'shaders', group: 'Water', label: 'Underwater wobble', min: 0, max: 200, step: 10, unit: '%', def: 100 },

  { id: 'godRays', page: 'shaders', group: 'Light', label: 'God rays', about: 'Shafts of light through trees and fog', choices: [[0, 'Off'], [1, 'Low'], [2, 'High'], [3, 'Ultra']], def: 2 },
  { id: 'godRayStrength', page: 'shaders', group: 'Light', label: 'God ray strength', min: 0, max: 200, step: 10, unit: '%', def: 100 },
  { id: 'bloom', page: 'shaders', group: 'Light', label: 'Bloom', about: 'Bright things glow', min: 0, max: 200, step: 10, unit: '%', def: 100 },
  { id: 'ssao', page: 'shaders', group: 'Light', label: 'Contact shadows', about: 'Deepens the dark where things meet', choices: scale('Low', 'High'), def: 1 },
  { id: 'leafGlow', page: 'shaders', group: 'Light', label: 'Sun through leaves', min: 0, max: 200, step: 10, unit: '%', def: 100 },
  { id: 'sunPower', page: 'shaders', group: 'Light', label: 'Sunlight', min: 40, max: 160, step: 5, unit: '%', def: 100 },
  { id: 'shade', page: 'shaders', group: 'Light', label: 'Shade brightness', about: 'How much sky light fills the shadows', min: 40, max: 180, step: 5, unit: '%', def: 100 },

  { id: 'exposure', page: 'shaders', group: 'Colour', label: 'Exposure', min: 50, max: 160, step: 5, unit: '%', def: 100 },
  { id: 'contrast', page: 'shaders', group: 'Colour', label: 'Contrast', min: 70, max: 140, step: 5, unit: '%', def: 100 },
  { id: 'saturation', page: 'shaders', group: 'Colour', label: 'Colour strength', min: 40, max: 170, step: 5, unit: '%', def: 112 },
  { id: 'warmth', page: 'shaders', group: 'Colour', label: 'Warmth', min: -50, max: 50, step: 5, unit: '', def: 8 },
  { id: 'vignette', page: 'shaders', group: 'Colour', label: 'Dark corners', min: 0, max: 200, step: 10, unit: '%', def: 60 },

  { id: 'volume', page: 'sound', group: 'Levels', label: 'Everything', min: 0, max: 100, step: 5, unit: '%', def: 70 },
  { id: 'effectsVolume', page: 'sound', group: 'Levels', label: 'Effects', about: 'The world, fights and magic', min: 0, max: 100, step: 5, unit: '%', def: 100 },
  { id: 'uiVolume', page: 'sound', group: 'Levels', label: 'Menus', about: 'Buttons and the bag', min: 0, max: 100, step: 5, unit: '%', def: 80 },
  { id: 'quietAway', page: 'sound', group: 'Away', label: 'Quiet when away', about: 'Silence while another window has your attention', choices: offOn, def: 1 },

  { id: 'invertMouse', page: 'controls', group: 'Mouse', label: 'Invert looking up and down', choices: offOn, def: 0 },
  { id: 'wheelFlip', page: 'controls', group: 'Mouse', label: 'Reverse the hotbar wheel', choices: offOn, def: 0 },
  { id: 'sprintMode', page: 'controls', group: 'Mouse', label: 'Sprint', about: 'Toggle means one press starts it and another stops it', choices: [[0, 'Hold'], [1, 'Toggle']], def: 0 },

  { id: 'uiScale', page: 'screen', group: 'Size', label: 'Interface size', about: 'Everything on the screen, in whole pixels so that the art stays sharp', choices: [[0, 'Auto'], [2, 'Normal'], [3, 'Large'], [4, 'Huge']], def: 0 },
  { id: 'toastTime', page: 'screen', group: 'Size', label: 'Messages stay for', min: 50, max: 250, step: 25, unit: '%', def: 100 },
  { id: 'crosshair', page: 'screen', group: 'Sight', label: 'Crosshair', choices: [[1, 'Cross'], [2, 'Dot'], [0, 'Off']], def: 1 },
  { id: 'showHand', page: 'screen', group: 'Sight', label: 'Your hand', about: 'The arm, and whatever it holds', choices: offOn, def: 1 },
  { id: 'showCompass', page: 'screen', group: 'On the screen', label: 'Compass', choices: offOn, def: 1 },
  { id: 'showMinimap', page: 'screen', group: 'On the screen', label: 'Minimap', choices: offOn, def: 1 },
  { id: 'showQuest', page: 'screen', group: 'On the screen', label: 'Quest note', choices: offOn, def: 1 },
  { id: 'showFps', page: 'screen', group: 'On the screen', label: 'Frame rate', choices: offOn, def: 0 },

  { id: 'reduceMotion', page: 'access', group: 'Movement', label: 'Reduce motion', about: 'Stills the camera and the menus. As the system follows your device', choices: [[0, 'As the system'], [1, 'On']], def: 0 },
  { id: 'shake', page: 'access', group: 'Movement', label: 'Camera jolts', about: 'From landings, kills and being hit', min: 0, max: 100, step: 10, unit: '%', def: 100 },
  { id: 'hitStop', page: 'access', group: 'Movement', label: 'Pause on a kill', about: 'The tiny stop in time when something dies', choices: offOn, def: 1 },
  { id: 'hurtFlash', page: 'access', group: 'Sight', label: 'Red flash when hurt', min: 0, max: 100, step: 10, unit: '%', def: 100 },
  { id: 'brightness', page: 'access', group: 'Sight', label: 'Brightness', about: 'Of the world only', min: 70, max: 150, step: 5, unit: '%', def: 100 },
  { id: 'colourFilter', page: 'access', group: 'Sight', label: 'Colour help', about: 'Shifts the colours that are hard to tell apart', choices: [[0, 'Off'], [1, 'Weak red'], [2, 'Weak green'], [3, 'Weak blue']], def: 0 },
  { id: 'plainFont', page: 'access', group: 'Reading', label: 'Letters', about: 'Plain swaps the pixel fonts for your system font', choices: [[0, 'Pixel'], [1, 'Plain']], def: 0 },
];
const DEFAULTS = Object.fromEntries(OPTIONS.map(o => [o.id, o.def]));

// A preset is only a set of values, so it is shown as chosen for as long as they all still hold.
const PRESET_BASE = {
  potato: { renderDistance: 5, renderScale: 70, autoScale: 1, leaves: 0, smoothLight: 0, sway: 0, clouds: 0, particles: 0, fish: 0, fogFade: 100, shaders: 0, titleWorld: 0 },
  low: { renderDistance: 7, renderScale: 85, autoScale: 1, leaves: 0, smoothLight: 1, sway: 0, clouds: 1, particles: 1, fish: 1, fogFade: 100, shaders: 0, titleWorld: 1 },
  balanced: { renderDistance: 10, renderScale: 100, autoScale: 0, leaves: 1, smoothLight: 1, sway: 1, clouds: 2, particles: 2, fish: 1, fogFade: 100, shaders: 0, titleWorld: 1 },
  high: { renderDistance: 14, renderScale: 100, autoScale: 0, leaves: 1, smoothLight: 1, sway: 1, clouds: 2, particles: 2, fish: 1, fogFade: 100, shaders: 0, titleWorld: 1 },
};
const shaderLook = { shaders: 1, leaves: 1, smoothLight: 1, sway: 1, clouds: 2, particles: 2, fish: 1, fogFade: 100 };
const PRESET_SHADERS = {
  shaderLite: { ...shaderLook, renderDistance: 8, renderScale: 75, autoScale: 1, shadows: 1, softShadows: 0, bodyShadows: 0, waterQuality: 1, caustics: 1, godRays: 0, ssao: 0, bloom: 80, fxaa: 1 },
  shaderMedium: { ...shaderLook, renderDistance: 10, renderScale: 85, autoScale: 0, shadows: 2, softShadows: 1, bodyShadows: 1, waterQuality: 2, caustics: 1, godRays: 1, ssao: 1, bloom: 100, fxaa: 1 },
  shaderHigh: { ...shaderLook, renderDistance: 12, renderScale: 100, autoScale: 0, shadows: 3, softShadows: 1, bodyShadows: 1, waterQuality: 2, caustics: 1, godRays: 2, ssao: 1, bloom: 100, fxaa: 1 },
  shaderUltra: { ...shaderLook, renderDistance: 16, renderScale: 100, autoScale: 0, shadows: 4, softShadows: 2, bodyShadows: 1, waterQuality: 3, caustics: 1, godRays: 3, ssao: 2, bloom: 110, fxaa: 1 },
};
export const PRESETS = { ...PRESET_BASE, ...PRESET_SHADERS };
export const PRESET_NAMES = {
  graphics: [['potato', 'Potato'], ['low', 'Low'], ['balanced', 'Balanced'], ['high', 'High']],
  shaders: [['shaderLite', 'Lite'], ['shaderMedium', 'Medium'], ['shaderHigh', 'High'], ['shaderUltra', 'Ultra']],
};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
// `session` is for what lasts only as long as the page does: a browser will not start full screen by itself, so remembering it would only be a lie.
const LASTING = OPTIONS.filter(o => !o.session).map(o => o.id);
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(LASTING.map(id => [id, settings[id]])))); } catch { /* no storage */ }
}
function fit(option, value) {
  if (option.choices) return option.choices.some(([v]) => v === value) ? value : option.def;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(option.min, Math.min(option.max, value)) : option.def;
}
export const settings = { ...DEFAULTS };
{
  const stored = read();
  for (const o of OPTIONS) if (o.id in stored && !o.session) settings[o.id] = fit(o, stored[o.id]);
}
const optionOf = id => OPTIONS.find(o => o.id === id);

function change(values) {
  const moved = [];
  for (const [id, value] of Object.entries(values)) {
    const v = fit(optionOf(id), value);
    if (settings[id] !== v) { settings[id] = v; moved.push(id); }
  }
  if (!moved.length) return;
  save();
  emit('settings:changed', moved);
}
export const setSetting = (id, value) => change({ [id]: value });
export const applyPreset = name => change(PRESETS[name]);
export const resetSettings = page => change(Object.fromEntries(OPTIONS.filter(o => o.page === page).map(o => [o.id, o.def])));
export const presetHolds = name => Object.entries(PRESETS[name]).every(([id, v]) => settings[id] === v);
// For the game itself, when shaders turn out not to work here: remembered as off, so that the next start does not fail the same way.
export const turnOffShaders = () => setSetting('shaders', 0);

// What the options change about the page itself: the size of its pixels, which parts of the HUD are there, the font and the colour help. Nothing here touches the game.
import { on } from '../core/events.js';
import { setSetting, settings } from '../core/settings.js';
import { renderer } from '../view/scene.js';

const root = document.documentElement, { body } = document, canvas = renderer.domElement;
const COLOUR_HELP = ['', 'url(#helpred)', 'url(#helpgreen)', 'url(#helpblue)']; // the filters are at the top of index.html
const DRESSING = ['uiScale', 'crosshair', 'showCompass', 'showMinimap', 'showQuest', 'plainFont', 'reduceMotion', 'brightness', 'colourFilter'];

function dress() {
  if (settings.uiScale) root.style.setProperty('--px', settings.uiScale); else root.style.removeProperty('--px');
  body.classList.toggle('cross-dot', settings.crosshair === 2);
  body.classList.toggle('cross-off', settings.crosshair === 0);
  body.classList.toggle('no-compass', !settings.showCompass);
  body.classList.toggle('no-minimap', !settings.showMinimap);
  body.classList.toggle('no-quest', !settings.showQuest);
  body.classList.toggle('plain', !!settings.plainFont);
  body.classList.toggle('still', !!settings.reduceMotion);
  canvas.style.filter = settings.brightness === 100 ? '' : `brightness(${settings.brightness}%)`;
  root.style.filter = COLOUR_HELP[settings.colourFilter];
}
dress();

// Full screen is the browser's to give, and Esc or F11 can end it behind our back, so the option follows what is really happening.
function fullScreen() {
  const now = !!document.fullscreenElement;
  if (!!settings.fullscreen === now) return;
  if (now) document.exitFullscreen();
  else root.requestFullscreen?.().catch(() => setSetting('fullscreen', 0));
}
document.addEventListener('fullscreenchange', () => setSetting('fullscreen', document.fullscreenElement ? 1 : 0));

on('settings:changed', moved => {
  if (moved.some(id => DRESSING.includes(id))) dress();
  if (moved.includes('uiScale')) dispatchEvent(new Event('resize')); // the compass and the maps measure themselves in these pixels
  if (moved.includes('fullscreen')) fullScreen();
});

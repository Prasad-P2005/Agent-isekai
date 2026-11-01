// Going into a world and coming out of one. Both start the page again behind a fade, because the world lives in dozens of modules and only a fresh page is sure to hold none of the
// last one. The address says what the new page is for, so a refresh in the middle of play still lands on the title, as it should.
import { G } from '../core/state.js';
import { api } from '../net/api.js';

const PLAY = 'play', FADE_MS = 380, TOPMOST = 70;
const $ = id => document.getElementById(id);

// Reading this also clears it, or a refresh would walk straight back in.
export function arrivingToPlay() {
  const place = globalThis.location, asked = new URLSearchParams(place?.search ?? '').has(PLAY);
  if (asked) history.replaceState(null, '', place.pathname);
  return asked;
}
function startAgain(search) {
  G.phase = 'title'; // the page is on its way out: nothing should report from here on
  const fade = $('fade');
  fade.style.zIndex = TOPMOST; // over the book, which may well be what the button was on
  fade.style.transition = `opacity ${FADE_MS}ms steps(5)`;
  fade.style.opacity = 1;
  setTimeout(() => location.replace(location.pathname + search), FADE_MS + 20);
}
export const playOpenWorld = () => startAgain(`?${PLAY}`);
export const backToTitle = () => startAgain('');
export async function playWorld(id) {
  await api.openSlot(id);
  playOpenWorld();
}

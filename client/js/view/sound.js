// Every sound in the game, made on the spot from oscillators and a little noise, so there is nothing to load. All of it is decoration on what the simulation announces.
// Each one is short and small: a hit should be felt in the same instant as its flash, and nothing here should be something you tire of hearing.
import { on } from '../core/events.js';
import { settings } from '../core/settings.js';
import { BL } from '../sim/blocks.js';
import { fervor } from '../sim/momentum.js';

const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext, FULL = 0.85, EASE = 0.06;
const LEVELS = ['volume', 'effectsVolume', 'uiVolume', 'quietAway'];
let ctx = null, master = null, noise = null, effects = null, menus = null;

// Every sound is on a channel of its own kind, and they all go through the one master.
function setLevels() {
  if (!ctx) return;
  const away = settings.quietAway && (document.hidden || !document.hasFocus()), now = ctx.currentTime;
  master.gain.setTargetAtTime(away ? 0 : settings.volume / 100 * FULL, now, EASE);
  effects.gain.setTargetAtTime(settings.effectsVolume / 100, now, EASE);
  menus.gain.setTargetAtTime(settings.uiVolume / 100, now, EASE);
}
const channel = () => { const g = ctx.createGain(); g.connect(master); return g; };
// A browser only starts sound after the player has done something.
function wake() {
  if (ctx?.state === 'suspended') ctx.resume();
  if (ctx || !Context) return;
  ctx = new Context();
  master = ctx.createGain();
  master.connect(ctx.destination);
  effects = channel(); menus = channel();
  setLevels();
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}
addEventListener('pointerdown', wake, true); // first of all, so that the press that starts the sound can be heard
addEventListener('keydown', wake, true);
on('settings:changed', moved => { if (moved.some(id => LEVELS.includes(id))) setLevels(); });
for (const change of ['blur', 'focus']) addEventListener(change, setLevels);
document.addEventListener('visibilitychange', setLevels);

function tone(freq, time, { type = 'sine', gain = 0.2, slide = 1, at = 0, to = effects } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + time);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + time);
  o.connect(g).connect(to);
  o.start(t);
  o.stop(t + time + 0.02);
}
function hiss(time, cutoff, { gain = 0.2, at = 0, band = false, to = effects } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  f.type = band ? 'bandpass' : 'lowpass';
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + time);
  s.connect(f).connect(g).connect(to);
  s.start(t, Math.random() * 0.8, time + 0.02);
}
const chord = (notes, time, gap, o) => notes.forEach((n, i) => tone(n, time, { ...o, at: i * gap }));
const semitones = n => 2 ** (n / 12);

// ---------- the interface: everything you can press answers ----------
const press = bright => { tone(bright ? 780 : 540, 0.06, { type: 'triangle', gain: 0.16, slide: 0.72, to: menus }); hiss(0.025, 2800, { gain: 0.06, to: menus }); };
document.addEventListener('click', e => { const b = e.target.closest?.('button'); if (b && !b.disabled) press(b.classList.contains('gold')); }, true);
document.addEventListener('pointerdown', e => { if (e.target.closest?.('.slot:not(button)')) press(false); }, true); // the bag acts on the press, so its slots answer then
document.addEventListener('focusin', e => { if (e.target.closest?.('#titlemenu')) tone(420, 0.035, { type: 'triangle', gain: 0.05, to: menus }); }); // the main menu is walked up and down, and each step answers
on('talk:opened', () => tone(330, 0.09, { type: 'triangle', gain: 0.08, to: menus }));

// ---------- the world under the hand ----------
const BREAK = {
  pick: () => { hiss(0.09, 2600, { gain: 0.16 }); tone(150, 0.06, { type: 'square', gain: 0.05, slide: 0.6 }); },
  axe: () => { tone(230, 0.08, { type: 'triangle', gain: 0.14, slide: 0.55 }); hiss(0.06, 1300, { gain: 0.08 }); },
  shovel: () => hiss(0.11, 800, { gain: 0.2 }),
  hoe: () => hiss(0.07, 3400, { gain: 0.07 }),
};
on('block:broken', ({ id }) => (BREAK[BL[id]?.tool] ?? BREAK.hoe)());
on('hand:swung', mining => hiss(mining ? 0.035 : 0.09, mining ? 1900 : 1000, { gain: mining ? 0.05 : 0.07, band: !mining })); // working, or a swing at the air
on('player:placed', () => { tone(120, 0.07, { type: 'triangle', gain: 0.16, slide: 0.7 }); hiss(0.04, 900, { gain: 0.07 }); });
on('item:gained', () => tone(860 + Math.random() * 180, 0.05, { type: 'triangle', gain: 0.05 }));
on('drop:thrown', () => { hiss(0.07, 1300, { gain: 0.06, band: true }); tone(300, 0.05, { type: 'triangle', gain: 0.04, slide: 0.7 }); });
on('drop:burnt', () => hiss(0.16, 3200, { gain: 0.08 }));
on('item:offered', () => chord([392, 494, 587], 0.4, 0.09, { gain: 0.06 }));

// ---------- fights ----------
on('player:struck', () => hiss(0.1, 1100, { gain: 0.05, band: true }));
on('entity:hit', ({ killed }) => {
  tone(170, 0.07, { type: 'square', gain: 0.07, slide: 0.5 });
  hiss(0.05, 1800, { gain: 0.1 });
  if (!killed) return;
  tone(95, 0.2, { type: 'sawtooth', gain: 0.1, slide: 0.45 });
  tone(420 * semitones(Math.min(fervor.chain, 12)), 0.16, { type: 'triangle', gain: 0.08, at: 0.03 }); // each kill in a run rings a step higher
});
on('player:hurt', () => { tone(88, 0.18, { type: 'sawtooth', gain: 0.16, slide: 0.6 }); hiss(0.07, 700, { gain: 0.12 }); });
on('player:blocked', () => { tone(1250, 0.05, { type: 'square', gain: 0.05 }); hiss(0.04, 3000, { gain: 0.06 }); });
on('player:died', () => chord([220, 174, 130, 98], 0.34, 0.14, { type: 'triangle', gain: 0.12 }));
on('fireball:cast', () => { hiss(0.22, 1000, { gain: 0.12 }); tone(190, 0.18, { type: 'sawtooth', gain: 0.05, slide: 2.2 }); });

// ---------- faith, and the god ----------
on('faith:gained', () => tone(690, 0.09, { gain: 0.035 }));
on('level:up', () => chord([523, 659, 784, 1047], 0.3, 0.08, { type: 'triangle', gain: 0.09 }));
on('law:written', ({ tier }) => {
  tone(196, 2.4, { gain: 0.16 }); tone(392, 1.7, { gain: 0.08 }); tone(587, 1.2, { gain: 0.05, at: 0.02 });
  if (tier === 'fabled') chord([784, 988, 1175, 1568], 1, 0.12, { type: 'triangle', gain: 0.05 });
});
on('act:opened', () => { tone(147, 2, { gain: 0.14 }); tone(294, 1.5, { gain: 0.07 }); });
on('scene:opened', () => tone(220, 1.1, { gain: 0.08 }));
on('night:fell', () => tone(73, 1.5, { gain: 0.12 }));
on('night:survived', () => chord([587, 740, 880], 0.5, 0.11, { gain: 0.07 }));

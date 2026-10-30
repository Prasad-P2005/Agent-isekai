// An atlas of the finite world, using the same land and settlement data as the terrain.
import { G } from './state.js';
import { player } from './player.js';
import { LAND, landOf, landName } from './terrain.js';

const $ = id => document.getElementById(id);
const mapEl = $('worldmap'), grid = $('mapgrid'), footer = $('mapfooter');
let opened = false;

const REALM_LABEL = { ocean: 'Open sea', human: 'Human lands', elf: 'Elven forest', beast: 'Beastkin wilds', peaks: 'Dragonspine Peaks', demon: 'Demon wastes' };

// Built each time the map opens. The game is paused while it is open, so the player's marker can't go stale.
function buildMap() {
  const lands = G.world.lands;
  const px = Math.floor(player.pos.x / LAND), pz = Math.floor(player.pos.z / LAND);
  grid.style.gridTemplateColumns = `repeat(${lands[0].length}, max-content)`;
  grid.replaceChildren();
  lands.forEach((row, z) => row.forEach((land, x) => {
    const tile = document.createElement('div');
    const settlement = land.settlement == null ? null : G.world.settlements[land.settlement];
    const nameText = settlement?.name || land.name || REALM_LABEL[land.realm];
    tile.className = `map-tile realm-${land.realm}`;
    tile.title = `${nameText} · ${REALM_LABEL[land.realm]} · region ${x}, ${z}`;
    const coord = document.createElement('span'); coord.className = 'map-coordinate'; coord.textContent = `${x},${z}`;
    const name = document.createElement('span'); name.className = 'map-name'; name.textContent = nameText;
    tile.append(coord);
    if (settlement) { const pin = document.createElement('i'); pin.className = 'map-location'; pin.setAttribute('aria-label', 'Settlement'); tile.append(pin); }
    tile.append(name);
    if (x === px && z === pz) {
      const marker = document.createElement('i'); marker.className = 'map-player'; marker.setAttribute('aria-label', 'You are here');
      marker.style.left = `${(player.pos.x / LAND - px) * 100}%`; marker.style.top = `${(player.pos.z / LAND - pz) * 100}%`;
      tile.classList.add('current'); tile.append(marker);
    }
    grid.append(tile);
  }));
  footer.textContent = `You are in ${landName(landOf(player.pos.x, player.pos.z))} · region ${px}, ${pz} · each square is ${LAND} × ${LAND} blocks`;
}

export function isWorldMapOpen() { return opened; }

export function toggleWorldMap() {
  if (opened) {
    closeWorldMap();
    return;
  }
  if (!G.world || G.phase !== 'world' || G.uiOpen) return;
  opened = true;
  G.uiOpen = true;
  buildMap();
  mapEl.style.display = 'flex';
  mapEl.setAttribute('aria-hidden', 'false');
  document.exitPointerLock();
  $('mapclose').focus();
}

export function closeWorldMap() {
  if (!opened) return;
  opened = false;
  G.uiOpen = false;
  mapEl.style.display = 'none';
  mapEl.setAttribute('aria-hidden', 'true');
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  try {
    const result = canvas.requestPointerLock();
    if (result?.catch) result.catch(() => { G.focused = true; });
  } catch {
    G.focused = true;
  }
}

$('maptoggle').addEventListener('click', toggleWorldMap);
$('mapclose').addEventListener('click', closeWorldMap);

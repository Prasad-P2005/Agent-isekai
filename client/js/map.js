// A live atlas of the finite world, using the same land and settlement data as the terrain.
import { G } from './state.js';
import { player } from './player.js';
import { LAND, landOf, landName } from './terrain.js';

const $ = id => document.getElementById(id);
const mapEl = $('worldmap'), grid = $('mapgrid'), footer = $('mapfooter');
let opened = false, tiles = [];

const REALM_CLASS = {
  ocean: 'ocean', beach: 'coast', coast: 'coast', human: 'human', city: 'human',
  elf: 'elf', elfcity: 'elf', beast: 'beast', beastkin: 'beast', peaks: 'peaks', demon: 'demon',
};
const REALM_LABEL = {
  ocean: 'Open sea', beach: 'Coast', coast: 'Coast', human: 'Human lands', city: 'Human lands',
  elf: 'Elven forest', elfcity: 'Elven forest', beast: 'Beastkin wilds', beastkin: 'Beastkin wilds',
  peaks: 'Dragonspine Peaks', demon: 'Demon wastes',
};

function buildMap() {
  const lands = G.world?.lands;
  if (!lands?.length) return;
  tiles = [];
  const width = Math.max(...lands.map(row => row.length));
  grid.style.gridTemplateColumns = `repeat(${width}, max-content)`;
  grid.replaceChildren();
  for (let z = 0; z < lands.length; z++) {
    for (let x = 0; x < width; x++) {
      const land = lands[z][x];
      const tile = document.createElement('div');
      if (!land) {
        tile.className = 'map-tile realm-ocean';
        tile.title = `Open sea · region ${x}, ${z}`;
        const coord = document.createElement('span'); coord.className = 'map-coordinate'; coord.textContent = `${x},${z}`;
        const name = document.createElement('span'); name.className = 'map-name'; name.textContent = 'Open sea';
        tile.append(coord, name);
      } else {
        const realm = String(land.realm || '').toLowerCase();
        const kind = REALM_CLASS[realm] || 'human';
        const settlement = land.settlement == null ? null : G.world.settlements?.[land.settlement];
        const nameText = settlement?.name || land.name || REALM_LABEL[realm] || 'Uncharted land';
        tile.className = `map-tile realm-${kind}`;
        tile.title = `${nameText} · ${REALM_LABEL[realm] || realm || 'Region'} · region ${x}, ${z}`;
        const coord = document.createElement('span'); coord.className = 'map-coordinate'; coord.textContent = `${x},${z}`;
        const name = document.createElement('span'); name.className = 'map-name'; name.textContent = nameText;
        tile.append(coord);
        if (settlement) { const pin = document.createElement('i'); pin.className = 'map-location'; pin.setAttribute('aria-label', 'Settlement'); tile.append(pin); }
        tile.append(name);
      }
      grid.append(tile);
      tiles.push({ x, z, el: tile });
    }
  }
  updateWorldMap();
}

export function updateWorldMap() {
  if (!opened || !G.world) return;
  const x = Math.floor(player.pos.x / LAND), z = Math.floor(player.pos.z / LAND);
  const localX = ((player.pos.x / LAND) % 1 + 1) % 1;
  const localZ = ((player.pos.z / LAND) % 1 + 1) % 1;
  const active = tiles.find(t => t.x === x && t.z === z);
  for (const tile of tiles) {
    const current = tile === active;
    tile.el.classList.toggle('current', current);
    let marker = tile.el.querySelector('.map-player');
    if (current && !marker) { marker = document.createElement('i'); marker.className = 'map-player'; marker.setAttribute('aria-label', 'You are here'); tile.el.append(marker); }
    else if (!current && marker) marker.remove();
    if (current && marker) { marker.style.left = `${localX * 100}%`; marker.style.top = `${localZ * 100}%`; }
  }
  const region = landOf(player.pos.x, player.pos.z);
  footer.textContent = `You are in ${landName(region)} · region ${x}, ${z} · each square is ${LAND} × ${LAND} blocks`;
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

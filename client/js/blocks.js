// Block types: colours for top / side / bottom faces.
export const BL = [];
const hex = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
function def(id, name, top, side = top, bot = side, opt = {}) { BL[id] = { name, top: hex(top), side: hex(side), bot: hex(bot), ...opt }; }
def(0, 'Air', 0);
def(1, 'Grass', 0x5fb04a, 0x7d8a3e, 0x7a5a3a);
def(2, 'Dirt', 0x7a5a3a);
def(3, 'Stone', 0x8a8a8f);
def(4, 'Sand', 0xe6d8a0);
def(5, 'Water', 0x2f7fd8, 0x2f7fd8, 0x2f7fd8, { transparent: true });
def(6, 'Oak Log', 0x8a6a42, 0x6b4a2b);
def(7, 'Oak Leaves', 0x3f8f3a);
def(8, 'Elderwood', 0xd8d0b8, 0xe8e2d0);
def(9, 'Elven Leaves', 0x56d6b0, 0x47c4a0, 0x3aa888, { glow: 0.9 });
def(10, 'Fae Grass', 0x48c27a, 0x5f8a50, 0x7a5a3a);
def(11, 'Pink Coral', 0xff6fa8);
def(12, 'Orange Coral', 0xff9b4a);
def(13, 'Blue Coral', 0x4ac6ff);
def(14, 'Kelp', 0x2e8b57);
def(15, 'Pearlstone', 0xf3e6f0, 0xe8d6ec);
def(16, 'Mana Crystal', 0xc79cff, 0xb07cff, 0xb07cff, { glow: 1 });
def(17, 'Snow', 0xf4f8ff);
def(18, 'Planks', 0xb88a55);
def(19, 'Cobblestone', 0x6f6f75);
def(20, 'Roof Tiles', 0xb5463a);
def(21, 'Glass', 0xbfe8ff, 0xbfe8ff, 0xbfe8ff, { transparent: true });
def(22, 'Lantern', 0xffe08a, 0xffd36b, 0xffd36b, { glow: 1 });
def(23, 'Thatch', 0xd8b35a);
def(24, 'Savanna Grass', 0xb8b04a, 0xa08a48, 0x9a6a3a);
def(25, 'Red Clay', 0xc77a4a);
def(26, 'Glowshroom', 0x7cf6ff, 0x9fe8ff, 0xd0e0e0, { glow: 1 });
def(29, 'Gravel', 0x7d7a78);
def(30, 'Royal Banner', 0x3557c9);
def(31, 'Bedrock', 0x333333);
def(32, 'Acacia Leaves', 0x8aa83a);
def(33, 'Tribal Totem', 0xa0522d, 0xc0603a);
def(34, 'Blackstone', 0x2a2230);
def(35, 'Ashen Ground', 0x6a1a2a, 0x3a1a20, 0x2a2230);
def(36, 'Magma', 0xff6a1a, 0xff4a10, 0xff4a10, { glow: 1 });
def(37, 'Obsidian', 0x1a1028);
export const solid = id => id !== 0 && id !== 5;
// seconds to break by hand (a pickaxe divides this); Infinity = unbreakable
const HARD = { 1: 0.7, 2: 0.6, 3: 3, 4: 0.6, 6: 2, 7: 0.3, 8: 2, 9: 0.3, 10: 0.7, 11: 0.8, 12: 0.8, 13: 0.8, 14: 0.3, 15: 3.5, 16: 4, 17: 0.5,
  18: 1.5, 19: 3.5, 20: 1.5, 21: 0.5, 22: 0.5, 23: 0.8, 24: 0.7, 25: 1, 26: 0.3, 29: 0.8, 30: 0.6, 31: Infinity, 32: 0.3, 33: 2, 34: 4, 35: 1, 36: 3, 37: 15 };
export const hardness = id => HARD[id] ?? 1;
// what you get when a block breaks
export function dropOf(id) {
  if ([1, 10, 24].includes(id)) return 2;          // grass -> dirt
  if (id === 3) return 19;                          // stone -> cobblestone
  if ([7, 9, 32].includes(id)) return Math.random() < 0.25 ? id : 0; // leaves sometimes
  if (id === 21) return 0;                          // glass shatters
  return id;
}
export const GROUND = new Set([1, 2, 3, 4, 10, 15, 17, 19, 24, 25, 29, 31, 34, 35, 36, 37]);
// blocks that belong to buildings: breaking them inside a city is vandalism
export const BUILT = new Set([6, 15, 18, 19, 20, 21, 22, 23, 30]);

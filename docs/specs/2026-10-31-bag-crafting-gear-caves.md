# The bag, crafting, gear and the deep caves

Status: **built**. Items and caves were approved on 2026-10-31. Everything below is in the game, and where the build went a better way than this plan first said, the sections say what was built.

## How it was checked

- The tests were updated but not run, by request.
- `node --no-warnings tools/boot_check.mjs` starts the real client on a stand-in page and uses the bag, every station and every held item. It cannot judge looks or compile shaders.
- `node tools/item_sheets.mjs` and `node tools/cave_designs.mjs` draw from the real code, and the sheets in `docs/items/` and `docs/caves/` were checked by eye.
- `node tools/cave_designs.mjs real` floods the real terrain by the hero's own limits, with no tools and no digging. On four areas 640 blocks wide: 74.9% of cave floor reached, 89.8% of hall floor, and 94.9% of what is reached has a way home on foot.

## What is wrong today

- The hotbar stores block ids, so a stack that runs out stays behind as a ghost.
- The bag is a list that cannot be arranged. Blocks, loot and gear are three separate stores, and gear is only a number on the player.
- There is no crafting, a tool is just a mining multiplier, and only blocks can sit in the hotbar.
- Caves are one kind of tunnel, in a world with only 48 blocks below the sea.

## 1. One item table

`content/items.json` is the one list of everything the player can hold. It is written by `tools/make_items.py`, like the art, so change the tables there and commit what it writes. Both sides read it.

Each entry has a `name`, a `group` (`tools`, `weapons`, `armor`, `materials`, `food`, `potions`, `blocks`), a `stack` and its art (`art`, `pal`). Then, as needed:

| Field | Meaning |
| ----- | ------- |
| `block` | The block it places. `place` lists four when it faces the way you look (stairs) |
| `dur` | Uses before it breaks. Anything with `dur` does not stack |
| `tool`, `level`, `speed` | Tool class, what it can harvest, how fast it mines |
| `dmg`, `cd`, `reach`, `motion` | Added damage, seconds between swings, reach, and its animation |
| `slot`, `def` | Armour slot and defence |
| `use` | What a right click does: `heal`, `mana`, `buff` |
| `value` | What a trader pays |

Item ids are strings: `iron_sword`, `raw_mithril`, `planks`. Monster loot in `creatures.json` keeps its name and gains an id from it, so "Orc Tusk" is `orc_tusk`.

Stacks hold 99, against Minecraft's 64, because this game mines a lot by hand.

## 2. Who owns the bag

**The client owns the slots, as it already owns the blocks.** Mining, durability and crafting happen too fast for a round trip, and crafting only needs the shared recipes.

- `Player.bag` is a list of 36 slots, `null` or `{id, n, dur?}`. The first nine are the hotbar. `Player.worn` holds the four armour pieces and the off hand.
- The client sends the bag with `/api/blocks`, debounced as now, and with `/talk` and `/service` so that a trader sees what is really there.
- `Player.blocks` stays, as a summary the client sends: block id to count. The story, favors and attunement read it unchanged.
- **Parcels.** The server cannot reach into the bag, so what it gives or takes waits in `Player.parcels` as `{seq, id, n}`, with `n` negative for a take. Every `state_payload` carries them. The client applies each one once, and acknowledges the highest `seq` in its next sync, in the same request as the new bag, so a crash cannot lose or double a parcel. A parcel that does not fit waits until it does.
- A new step in `persistence/migrations.py` moves `blocks`, `loot`, potions and bought gear into slots, and old gear is matched to the nearest new item.

`Player.weapon`, `armor`, `tool`, `potions`, `mana_potions` and `loot` go. Damage, defence and mining speed are read from what is held and worn.

**Creative mode** (`Player.creative`, added while this spec was written) keeps its promise that the hero's real stock is left alone:

- While it is on, the bag's slots give way to a searchable palette of every item, with no counts. Clicking one copies it to a separate creative hotbar, so the real hotbar is untouched and comes back when the mode ends. That replaces `keepOwnedBlocks`.
- Nothing is spent, nothing wears, and mining drops nothing, as now.
- Recipes cost nothing and stations open as usual.
- `PALETTE` in `sim/blocks.js` becomes every item, and leaves out the lit furnace and forge.

## 3. The hotbar

- Nine slots, the first row of the bag, keys 1 to 9. **It shows anything**: blocks, tools, weapons, armour, potions, food.
- A used-up stack leaves an empty slot, so ghosts cannot exist.
- New items fill the hotbar first and then the bag, and a stack already there takes them.
- A broken tool leaves its slot empty and says so.
- The quick potion slots leave the dock. G and V still drink the first potion they find.
- Selecting a slot shows its name above the dock for two seconds, as Minecraft does, then fades.
- The dock is: bars on top, then nine slots, then the two spell slots.

## 4. The bag

A compact slate panel in the middle of the screen, after the reference: about 280 by 250 art pixels, where the book takes 600 by 350. The recipe book sits against its right edge.

```
+------------------------------------------+ +--------------------------+
| [helm]  +--------+ [off]  [ ][ ]         | | Recipes | Spells         |
| [body]  |        |        [ ][ ] -> [ ]  | | [search.......] [only ok]|
| [legs]  |  hero  |                       | | All Tools Arms Armour... |
| [feet]  |        |   coin 120   [Q][R]   | | [i][i][i][i][i][i]       |
|         +--------+                       | | [i][i][i][i][i][i]       |
| [ ][ ][ ][ ][ ][ ][ ][ ][ ]              | | [i][i][i][i][i][i]       |
| [ ][ ][ ][ ][ ][ ][ ][ ][ ]              | |--------------------------|
| [ ][ ][ ][ ][ ][ ][ ][ ][ ]              | | Iron Sword               |
| ---------------------------              | | [i][i] -> [sword]  Craft |
| [ ][ ][ ][ ][ ][ ][ ][ ][ ]              | +--------------------------+
+------------------------------------------+
```

- The 2 by 2 grid is always there. A station swaps it for its own panel, as in the second reference, while the slots below stay put.
- Controls follow Minecraft's:
  - Click picks up or puts down a stack, and swaps with what is there.
  - Right click splits a stack, or puts down one.
  - Shift-click moves a stack between the hotbar and the bag, or into a station.
  - Double click gathers matching items onto the cursor.
  - Keys 1 to 9 over a slot swap it with that hotbar slot.
  - Dragging a held stack spreads it evenly.
- A **Sort** button merges stacks and orders the bag by group, leaving the hotbar alone.
- A tooltip at the cursor replaces the line above the slots: name, group, stats, durability, what it sells for.
- Durability shows as a thin bar along the bottom of the slot.
- Gold, health and the rest go to one line, because the panel is meant to be small.
- Everything is in `--u`, and everything is still a page of the book: `definePage` with a `view` of its own.

## 5. Crafting

Minecraft's shaped recipes on a grid, which also means the recipe book can fill the grid for you.

| Station | Panel | Makes |
| ------- | ----- | ----- |
| By hand | 2 by 2 | Planks, sticks, torches, the crafting table |
| Crafting Table | 3 by 3 | Most things, up to silver gear |
| Furnace | Input, fuel, output | Ores to ingots, sand to glass, cooking |
| Forge | Two inputs, fuel, output | Mithril, adamant and dragonsteel, which a furnace is not hot enough for |
| Anvil | 3 by 3, plus repair | Mithril and better gear, and repairing with the tool's own material |
| Alchemy Table | Bottle and two ingredients | Potions |
| Chest | 27 slots | Storage |

- Right click on a station opens it, and on anything else it does what it did before.
- Furnaces and chests are saved in `World.stations`, keyed by block position, and sent with the bag. Furnaces run on the game clock, even out of sight, like every other timer. Breaking one moves what it held into the bag, or leaves it in the block until there is room.
- **Recipe book**: tabs by group, a search box, and the "only what I can make" toggle.
  - Click a recipe to lay it into the grid.
  - Shift-click to craft as many as the bag allows.
  - A recipe you cannot make shows what is missing in red.
  - Recipes unlock when you first hold one of their ingredients, as Minecraft's do, so the book grows with the game. A toast says so.
- `content/recipes.json` is written by the same tool. Each recipe gives `out`, `n`, `at`, and `shape` with `keys`, or `of` for shapeless, or `in`, `time` for smelting. Patterns can shift around the grid and mirror left to right, as in Minecraft. Hand recipes also work on larger grids.

## 6. Tools and weapons

Nine tiers. The numbers start from Minecraft's and spread further, because this game has further to go.

| Tier | Harvest level | Speed | Durability | Damage | Made from |
| ---- | ------------- | ----- | ---------- | ------ | --------- |
| Wood | 0 | 2 | 59 | +1 | Planks |
| Stone | 1 | 4 | 131 | +2 | Cobblestone |
| Copper | 1 | 5 | 191 | +2 | Copper ingot |
| Gold | 1 | 12 | 64 | +2 | Gold ingot. Very fast, very fragile |
| Iron | 2 | 6 | 250 | +3 | Iron ingot |
| Silver | 2 | 7 | 320 | +4 | Silver ingot. Half as much again against the undead and demons |
| Mithril | 3 | 9 | 900 | +7 | Mithril ingot |
| Adamant | 4 | 11 | 1800 | +10 | Adamant ingot |
| Dragonsteel | 5 | 14 | 3000 | +14 | Adamant and Dragon Scale, at the forge |

Ten kinds in every tier, so 90 items:

| Kind | Damage | Seconds per swing | Durability | What it is for |
| ---- | ------ | ----------------- | ---------- | -------------- |
| Pickaxe | x0.6 | 0.55 | x1 | Stone and ore |
| Axe | x1.3 | 0.7 | x1 | Wood, and a heavy blow |
| Shovel | x0.5 | 0.55 | x1 | Dirt, sand, gravel and snow. Right click makes a path |
| Hoe | x0.3 | 0.45 | x1 | Leaves and crops. Right click tills soil |
| Hammer | x1.3 | 0.9 | x3 | A pickaxe that breaks three by three, slowly |
| Sword | x1 | 0.4 | x1 | Balanced, with a sweep that clips what stands beside the target |
| Greatsword | x1.7 | 0.85 | x1.5 | A wide cleave. Nothing in the off hand |
| Dagger | x0.6 | 0.25 | x0.8 | Very fast |
| Spear | x0.9 | 0.5 | x1 | Reach 6 instead of 4.5 |
| Mace | x1.4 | 0.75 | x1 | Heavy knockback |

And outside the tiers: four bows, four kinds of arrow, five shields for the off hand, four staffs that strengthen spells while held, and shears.

**Mining** uses Minecraft's rule on our `hardness`, which stays "seconds by hand":

- The right tool divides the time by its `speed`.
- The wrong tool, or none, takes `hardness` as written.
- A block above the tool's `level` takes 3.3 times as long and drops nothing.
- Blocks gain `tool` and `level` in `blocks.json`. Stone needs a wooden pickaxe at least, as in Minecraft.
- Mana Ore and Mana Crystal stay at level 0, because the story needs them.

**Durability**: one for a block, two for a tool used as a weapon, one for a weapon used as a weapon, two for a weapon used on a block. Instant blocks cost nothing. At zero the item breaks with a sound and a toast.

**Repair** at the anvil: one unit of the tool's material gives back a quarter of its durability.

## 7. Armour

Four slots and 14 sets, so 56 items. A set is 24 units of material, as in Minecraft: 5, 8, 7 and 4.

| Set | Style | Comes from |
| --- | ----- | ---------- |
| Leather, Trollhide | Soft | Hides |
| Chainmail | Mail | Iron rings |
| Copper, Iron | Plate | Ingots |
| Silver, Gold | Fine plate | Ingots |
| Knight | Plumed plate, blue and gold | Iron and Golem Core |
| Mithril, Adamant | Winged plate | Ingots, at the anvil |
| Dragonscale | Scale, horned helm | Dragon Scale |
| Demonplate | Black spikes, red glow | Demon Horn and Wraith Ash |
| Elven | Leaf and gold | Elderwood, Emerald |
| Arcane | Robes and a tall hat | Wool, Amethyst. Low defence, faster mana |

- Each piece adds points to `def`. Damage taken is `1 - def / 50`, capped at 80%, which keeps the plain fraction `damagePlayer` already uses.
- Armour wears: one durability per piece for every four health taken, as in Minecraft.
- Worn armour is drawn on the hero in the bag and on the arm in view, with the look built from the set's colours through `view/avatar.js`, at the same chunky resolution as everyone else.

## 8. Animations

Every kind moves in its own way in `view/hand.js`. The held model is the item's own 16 by 16 sprite, extruded into a solid pixel slab, so art and model cannot disagree.

| Kind | Motion |
| ---- | ------ |
| Sword | A flat slash, alternating left and right, with a short arc trail |
| Greatsword | A wind-up over the shoulder and a falling cleave, with dust where it lands |
| Dagger | Two quick stabs, and every third blow a spin in the hand |
| Spear | A long straight thrust, the hand sliding down the shaft |
| Mace | A round overhead swing, with a ring on the ground on a hit |
| Pickaxe | A pendulum swing from the shoulder, sparks on ore |
| Axe | A chop with the whole arm, chips on wood |
| Shovel | Dig in, lift and toss |
| Hoe | A sweep down and back |
| Hammer | A slow lift and a slam, with a small camera kick |
| Bow | Draw with the arm pulling back and the view tightening, then release with a kick |
| Staff | Held upright, the gem glowing, and thrust forward on a cast |
| Shield | Raised across the view while right click is held |
| Food and potions | Lifted to the mouth, tilted, and finished with crumbs or bubbles |

Swapping items dips the hand out and back. Every top-tier item idles with a slow glint along its edge. Particle budgets stay as they are: a few chunky cubes, listed at the top of the file, because these are the most used things in the game.

## 9. Spells

- Two spell slots, on Q and R, shown at the right of the dock.
- The side panel's **Spells** tab lists every spell known. Clicking one puts it in the chosen slot. `Player.spells` saves the pair.
- Z, X, C, B and H stop casting. Passive abilities stay passive, and F still flies.
- New heroes start with fireball and heal in the two slots if they know them. A migration fills the slots from what an old hero knows.

## 10. Ores

Minecraft places each ore by height, as a triangle around a best depth, with rarer ores deeper. Heights here are for the deepened world in section 11.

| Ore | Needs level | Height | Drops | Notes |
| --- | ----------- | ------ | ----- | ----- |
| Coal | 0 | 40 to 200, best at 110 | Coal | Also on cave walls |
| Copper | 1 | 50 to 130, best at 90 | Raw Copper | Big veins |
| Iron | 1 | 20 to 125, best at 70 | Raw Iron | Big veins |
| Silver | 2 | 15 to 80, best at 50 | Raw Silver | |
| Gold | 2 | 10 to 70, best at 35 | Raw Gold | More in the Beast Lands |
| Mana Ore | 0 | 15 to 100, best at 60 | Mana Crystal | Kept easy for the story |
| Ruby | 2 | 5 to 55 | Ruby | Single blocks. More in the Wastes |
| Sapphire | 2 | 5 to 55 | Sapphire | Single blocks. More under the sea |
| Emerald | 2 | 5 to 55 | Emerald | Single blocks. More in the Elven realm |
| Mithril | 3 | 5 to 45, best at 22 | Raw Mithril | In Deepstone, and in crystal caverns |
| Adamant | 4 | 3 to 25, best at 10 | Raw Adamant | Very rare, and near the lava sea |

## 11. The deeper world

Colossal halls need room. Today the sea is at 48, so a town stands on only 53 blocks of rock.

- `world.json` goes to `sea: 112`, `height: 224`. All of `land.js` is already relative to `SEA`, so the surface rises unchanged and 64 new blocks of rock appear beneath it.
- A migration moves `block_edits` and `player.pos` up by 64.
- Below y 50 stone gives way to Deepstone.
- This reshapes every world, on purpose: `tests/client/world.json` and `WORLD_HASH` get refreshed.

## 12. Caves

A new layer, `sim/caves.js`, replaces `carveCaves`. Like Minecraft's, it samples a coarse 4 by 8 by 4 lattice and blends between the points, because most of a chunk is nowhere near a cave.

| Technique, from Minecraft | Size here | How |
| ------------------------- | --------- | --- |
| **Cheese** caves | **Colossal**: 40 to 90 blocks tall, hundreds across | A regional mask says where a hall may be. Inside it the floor and vault are smooth heights that close at the mask's edge, with noise on the walls and vault only |
| **Noise pillars** | 4 to 12 wide, floor to roof | Rock added back inside a hall, flaring at both ends |
| **2D spaghetti** | **Normal**: 3 to 9 wide, long and winding | Where a 2D noise crosses zero, in three layers at heights that drift slowly, so a tunnel cannot get steep. Flat floors, arched roofs |
| **Noodle** caves | **Tight**: 1 to 3 wide, a squeeze | True 3D threads, gated into patches. These are the side trips |
| **Cave entrances** | Gentle ramps from the fields | The top layer of tunnels climbs to the ground in places |
| **Carvers**: ravines | Up to 66 deep, 4 to 20 wide | A seeded worm. The floor rises to the ground at each end, so it can be walked out of, and a pool at the bottom breaks a fall |
| **Lava level** | The floor of the world | Below y 12 all open space is magma |

Minecraft's aquifers are not used, because their stone barriers left flat slabs standing in the halls. A lake here is a basin in a hall's floor with its own level, and its bank falls away a block at a time so that it can be walked.

## 12b. Walkable by construction

Everything follows from what the hero can do (`sim/player.js`): step up 1 block, jump 1.45, fall 5 unhurt, and fall any distance into water.

- Hall floors have no noise on them, so their steps are one block.
- Tunnels are near level by construction, and the layers drift to one height in places so that a player can change between them. The lower two sink to meet a hall's floor.
- **The Old Ways** are Minecraft's mineshafts grown into a network: 3 by 3 corridors with timber every 4 blocks, railed trestle bridges on log legs across open space, crossings every 72 blocks or so with chests, ramps to the surface with four lamps at each mouth, and a rope ladder down from every bridge.
- Wherever a road passes a tunnel, a shaft with a rope ladder joins them.
- Rock has fallen against any ledge of 2 to 5 blocks, as a ramp, so that a drop is rarely a trap.
- Rope ladders, vines and hanging roots can be climbed, and rope ladders can be crafted.
- Light: a faint glow on bare rock and a haze of the biome's colour (`view/caveair.js`), and a torch or lantern in either hand lights the way.

The size of a cave is therefore a property of depth and region, not luck:

| Depth | What you find |
| ----- | ------------- |
| Top 30 blocks | Noodles and spaghetti, mouths on hillsides and ravines |
| Middle | Spaghetti opening into lakes and normal halls |
| Below y 60 | Colossal halls, in Deepstone, joined by wide tunnels |

**Cave biomes** make them majestic. Chosen by a slow 2D noise and the realm above:

| Biome | Under | Looks like |
| ----- | ----- | ---------- |
| Crystal Cathedral | The Dragonspine, the Elven realm | Amethyst and Mana Crystal walls, glowing clusters on every surface |
| Fungal Grotto | The Mirefen | Mycelium floors, giant glowing mushrooms |
| Verdant Hollow | The Kingdom | Moss, vines and glow vines, flowers under a skylight |
| Marble Halls | The Kingdom, deep | White marble with gold veins, and pillars cut square by a lost age |
| Dripstone Depths | Anywhere dry | Limestone, stalactites and stalagmites |
| Frozen Vault | The Peaks | Ice walls, and frozen lakes where an aquifer would be |
| Ember Deeps | The Wastes | Basalt columns and rivers of magma |

**Rules that stay**: nothing carves under a town or through a seabed, a cave only breaks the surface on a slope or in a ravine, and the lair of the Wyrm is carved last. Glowing blocks make deep caves readable without a torch, but not safe.

**Spawning**: `spawns.json` gains rules per cave biome, and colossal halls can hold bigger packs. The cave category keeps its cap.

**Performance**: generation stays under about 6 ms a chunk. Cave walls cost triangles whether or not anyone can see them, so each chunk gets a separate **deep mesh** below its surface, drawn only while the camera is underground or close to a cave mouth. Without that, every chunk in view would pay for caves nobody can see.

## Choices made on your behalf

- Crafting runs on the client, because the client owns the bag. It is single player, so nothing is lost by that.
- A full bag leaves mined drops behind, with a toast. There are no item entities on the ground. Parcels wait, so nothing the server gives can be lost.
- Durability is in, as in Minecraft.
- Stone needs a pickaxe, as in Minecraft. A new hero must find a tree first.
- Hotbar is nine slots, not ten, to match the bag's nine columns.
- Dragonsteel is the top tier, and the Wyrm is the only source of Dragon Scale, so it is a late-game reward with one source.

## Sources

Minecraft Wiki: [Tiers](https://minecraft.wiki/w/Tiers), [Crafting](https://minecraft.wiki/w/Crafting), [Recipe Book](https://minecraft.wiki/w/Recipe_Book), [Inventory](https://minecraft.wiki/w/Inventory), [Breaking](https://minecraft.wiki/w/Breaking), [Item durability](https://minecraft.wiki/w/Item_durability), [Smelting](https://minecraft.wiki/w/Smelting), [Sword](https://minecraft.wiki/w/Sword), [Armor](https://minecraft.wiki/w/Armor), [Cave](https://minecraft.wiki/w/Cave), [Aquifer](https://minecraft.wiki/w/Aquifer).

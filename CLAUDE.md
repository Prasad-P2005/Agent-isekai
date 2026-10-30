# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

dont use superpowers

dont test: run the tests or play the game in a browser only when asked

## Commands

```bash
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"     # first time; on Linux/macOS use .venv/bin/
.venv/Scripts/python -m isekai                                    # http://localhost:8000
.venv/Scripts/python -m pytest                                    # all tests, no network needed
.venv/Scripts/python -m pytest tests/test_rules.py::test_guild_quest_flow   # one test
node --test "tests/client/*.test.mjs"                             # the simulation, terrain and shared data (Node 21+, no install)
docker compose up --build
```

Changelog emails live in `emails/`: write an entry in `emails/changelogs/`, run `python tools/make_changelog.py <entry>.json`, and send the `.html` and `.txt` it writes with `emails/title.png` attached under the content id `title`, from `noreply@system.solithix.com`. Pictures load from `gallery/` on GitHub, so push them before sending.

There is no linter, formatter or JS build step. If a map or terrain change is deliberate, refresh the stored copy with `python tests/test_world.py` and update `WORLD_HASH` in `tests/client/terrain.test.mjs`.

The client is plain ES modules served as-is from `client/`, with three.js vendored in `client/vendor/` and resolved by the import map in `index.html` (and again in `lookbook.html`). The interface's sprites in `client/img/ui/` and `client/css/icons.css` are drawn by `python tools/make_ui_art.py` (standard library only), so change the art there and commit what it writes. The fonts are vendored in `client/vendor/fonts/`.

Settings are environment variables read once in `isekai/config.py`, and the README lists them all.

Debugging: `http://localhost:8000/lookbook.html` renders every character; in the browser console, `isekai.teleport('name')`, `isekai.G`, `isekai.ents`.

## Architecture

One FastAPI process, one `Game` (`isekai/core/game.py`), one saved `World` (`isekai/core/state.py`). Single player, no auth.

**The split between server and client is the key thing to understand.** The server owns state and rules: player profile, laws, economy, story, residents. The client owns the simulation: terrain, physics, combat, creature AI. They meet over HTTP:

- The client reports what happened (`/api/event`, `/crime`, `/report`, `/blocks`, `/context`) and applies the `state_payload` it gets back. Effects it must carry out, such as spawning golems, come back as a dict for `applyEffects` in `client/js/sim/effects.js`.
- The server cannot push. Anything it originates goes through `World.push()` into the feed, which the client polls every 2.5 s (`startSync`, `handleFeed` in `net/sync.js`).
- Terrain never crosses the wire. The server sends the seed, lands and building layouts, and `client/js/sim/terrain.js` turns them into blocks deterministically. Anything that changes noise offsets, RNG draw order or structure generation reshapes existing worlds. Only the player's changes are stored: `sim/edits.js` tracks them, and `/api/blocks` saves them in `World.block_edits` together with the inventory, so the two cannot disagree.

**Server layers.** `api/` only reads requests and calls `core/commands.py`, which is everything the player can do. Commands use `systems/` (laws, shop, guild, story, storyteller, dialogue, favors, chronicle, people), which know nothing about HTTP. `world/` lays out the map, `world/genesis.py` draws a new world from its seed, and `persistence/` reads, writes and upgrades saves.

**One game clock.** `World.clock` counts seconds played. It only advances in `Game.tick`, and only while `Game.playing()`, which needs a recent `/api/context` report saying `playing: true`. Merely polling the feed does not count. Cooldowns, festivals, raids, world events, idle narration, favors and the guild board all run on it, so a pause pauses them all. Use `World.after()` for anything due later: timers are saved, so a restart cannot lose them. Never use `time.time()` or `asyncio.sleep` for gameplay.

**Client layers.** `core/` is shared basics, `sim/` is the game itself, `view/` draws it, `net/` talks to the server and `ui/` is the page. The rule that keeps this working: `sim/` imports only `core/` and `sim/`, never `three`, the DOM, `view/`, `ui/` or `net/`. It announces what happened with `emit` from `core/events.js`, and the others listen. That is why `tests/client/sim.test.mjs` can run the whole simulation in Node. Each entity's meshes live on `e.view`, which only `view/bodies.js` touches. The simulation advances in fixed 1/60 s steps (`core/loop.js`, `sim/world.js`).

**Creature lifetimes.** `sim/lifetime.js` decides when a creature leaves the world. Beings that live in structures carry a `home` hint, handed back to `hintQueue` when they leave, so they return with the player and keep their wounds. Residents are spawned and removed by `updateResidents` instead. A witness with a report pending never leaves, or running away would silence them. `sacred` creatures (the stones, the Voice of the Deep) have no AI and cannot be hurt, so the story cannot lose them.

**The god cannot touch the world.** This is the game's premise. There is no LLM: the god is `systems/storyteller.py`, which runs on the game clock and picks from options the engine offers.

- `direct()` runs on every tick: scheduled raids, easing war prices, decrees and idle narration. `omen()` runs from a saved timer and sets off one event from `allowed_events()`, and a prayer for help (`answer_prayer`) goes through the same list, so the god can only ever lean on a rule.
- `narrate()` is the god's voice, and routine lines give way if she spoke a moment ago. `decree()` adds a law from `decrees` in `content/laws.json` once its `when` is met.
- **The story is data.** `content/story.json` holds the chapters, oaths, scenes and beats. A beat names its speaker, what it needs and what it changes, and `systems/story.py` only reads those rules, so a new story conversation is a new beat and needs no code. A scene plays once, in the book, from a `scene` feed item. What an ending does to the world beyond flags and fields goes in `_end`.
- **The First Law is real.** `hurtEntity` refuses to wound the Demon Lord until `player.oathbound`, and only the player can hurt him, so his death always reaches the server. His wounds stay on the `home` hint and in `World.boss_hp`.

**Quest marks** say where the things the hero is after are. `systems/marks.py` builds them from the story (`marks` on a chapter or an oath in `story.json`, which take the same conditions as a beat and name a speaker, a `places` entry or a `hunt`), the guild quest and the favor, and they travel with the objective. Marks that share an `id` are alternatives. `sim/marks.js` follows the person or creature behind a mark and keeps the nearest alternative, and `ui/compass.js` and both maps read that one list, `questMarks()`.

**What people say** is built in `systems/dialogue.py` from the pools in `content/lines/`. Those files merge into one flat table (`LINES`), so pool names are global and the files only organise the writing. `lines.say` takes a line nobody has heard lately (`World.said`), expands `#rule#` from other pools, then fills `{blank}`; `tests/test_lines.py` lists which blanks each pool may use. A person's temperament and life come from the seed and their id (`trait_of`, `life_of`), so they cost nothing to save. Real events go into `World.chronicle` with `chronicle.record` and reach other settlements at walking pace (`known_at`) as `gossip:<kind>` lines. Conversations are topic buttons: each exchange returns the next `topics`, and story beats appear among them.

**Settlements** are built in layers: `world/map.py` places them from the `MAP_ROWS` grid, `world/layouts.py` positions buildings, `content/jobs.json` declares jobs, `systems/people/roster.py` turns those into residents with seeded RNG, and `world/genesis.py` names everything from `content/names.json`. Someone who dies is replaced in place by `succession.py`, keeping their id, so what a post owes the hero survives and a settlement never fills up with the dead. `replaceSettlement` keeps everyone unchanged standing where they are. On the client only residents near the player exist as entities (`updateResidents` in `sim/people.js`).

## Shared data

`content/*.json` is the single source of truth for what both sides need: world sizes, realms, blocks, creatures, items, services, jobs, laws, guild quests, abilities (with their mana costs) and event names. The server loads it in `isekai/content.py` and the client in `client/js/core/content.js`, served from `/content`. Change the data once and both sides follow. `names.json`, `story.json`, `favors.json` and `lines/` are read only by the server.

Three things are still code on one side that names data from the other. `tests/client/` checks them, so a mismatch fails a test:

| Data                            | Code it must match                                                   |
| ------------------------------- | -------------------------------------------------------------------- |
| `Building.kind` in `layouts.py` | `BUILD` table in `sim/terrain.js`                                    |
| `jobs` in `content/jobs.json`   | `OUTFITS` in `view/outfits.js`                                       |
| `content/events.json`           | `WORLD_EVENTS` in `sim/worldevents.js`; `run_event` in `storyteller.py` |

Job `work` and `night` values are building kinds, or one of `field`, `gate`, `shore` (`_spot` in `roster.py`).

## Saves

`World` is pydantic and saved whole, so new fields need defaults. `load()` returns `None` for an unreadable save, and the game then behaves as if no world exists, but the file is first set aside as `world.unreadable-<time>.json`, so creating a new world cannot destroy it. Changes that need old saves rewritten go in a new step in `STEPS` in `persistence/migrations.py`; `save_version` and new worlds follow automatically.

## Client notes

The interface has two materials: the book (peach paper, for what the player reads and decides) and the slate (mauve stone, for what their hands use: the dock and the bag). Everything in `css/style.css` is a multiple of `--u`, one art pixel, and `--text` and `--title` are multiples of the fonts' own grids, so keep sizes on it or the pixels stop lining up. Sprites are 9-slices used through `border-image` with `image-rendering: pixelated`.

`ui/pointer.js` is the only place that may lock the mouse, release it or show the pause screen: `capture()` returns to the game, `release()` hands the mouse to a menu and `pause()` shows the card. Its header lists Chrome's rules, the one that bites being that releasing Esc counts as pressing it, so a lock taken while Esc is down is dropped at once. Automated tests cannot see that: keys sent over CDP skip the browser's handling.

Menus are pages of one book. `definePage(name, { tab, view, render, leave })` in `ui/panels.js` adds one, `togglePage` opens it, and `render` fills `#pageleft` and `#pageright`, or a layout of its own when `view` names one (the bag and the world map). Shops and conversations use the same spread with the tabs hidden. Text from the simulation, the server or the god goes through `rich()` in `ui/art.js`, which swaps its emoji for sprites.

Characters are drawn like Minecraft skins: big chunky pixels, an 8 pixel head on a 12 pixel body and 12 pixel legs, shaded by hand-sized clusters of tones, with armour, capes and hair as chunky layers on top. Keep it at that resolution: finer pixels look busy, and flat colours look bad. One size of pixel runs through every model (`PIXEL` in `view/voxel.js`), so a dragon's pixels match a farmer's, and only girls' faces are finer, because cute needs the pixels. Men come in mixed adult builds, every girl is cute (`girlish` in `view/outfits.js`), humans all stand 1.8 tall like the player, and kings wear robes to the floor. `view/voxel.js` is how anything living is built: every face of every box is painted into one texture sheet and rigged into one skinned mesh, so a body costs about two draw calls. `view/paint.js` holds the materials. A paint maps a pixel of a face to a colour or to -1 for a hole, which is how a cape tears and hair gets a hairline; `draw` adds marks like trim. Don't let two surfaces share a plane where they overlap, or they flicker: the head has no front of its own for this reason, and lower limbs are a hair narrower than upper ones. Body materials carry `LIFT`, because the world's light and tone mapping dim a colour to about half of what was painted. Colours are the palette at the top of `view/outfits.js`, which is the one in `tools/make_ui_art.py`. People are in `view/avatar.js`, everything else in `view/creatures.js`, and `view/pose.js` holds the motion as plain functions of a record from `newMotion()`, so the world, the bag, heaven and the lookbook share it. A bone's scale has to be set after `rig.finish()`, or binding cancels it. The player's own hand is `view/hand.js`, and the simulation only announces what it does (`player:struck`, `player:placed`, `fireball:cast`).

Bodies and the camera are drawn between the last two steps of the simulation: `fixedSteps` returns how far it got, `e.last` and `player.lastEye` hold the step before. Walking up a ledge lifts `player.pos` at once and adds the height to `player.stepLag`, which `eye()` subtracts and a spring takes back down, so what the player sees rises smoothly while the physics stays simple.

Keep particles low on anything the player sees often. The fireball is the most used attack, so `view/fireball.js` lists its cube counts at the top: use a few chunky cubes rather than many small ones, and keep those counts down when changing it. `view/spells.js` draws the other spells through the same cubes and lists its own counts.

Spells live in `sim/abilities.js`. Those that choose their own targets strike only `isFoe`, so that they can never commit a crime for the player, and all damage still goes through `hurtEntity`, so the First Law holds. `Player.max_mana` belongs to the server, like `max_hp`: `systems/magic.py` deepens it, the client reads it through `maxMana()`, and spent mana reaches the server in handfuls as `cast` events.

`client/js/` has no import cycles, so module top level is free to use imports. Keep it that way: dependencies point from `ui/` down through `net/` and `view/` to `sim/` and `core/`. `core/content.js` loads the data with a top-level `await`, which pauses every module that imports it. `lookbook.html` imports `view/avatar.js` and `view/creatures.js` directly and must keep working without the game, so nothing they import may need `core/content.js`.

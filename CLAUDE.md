# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"     # first time; on Linux/macOS use .venv/bin/
.venv/Scripts/python -m isekai                                    # http://localhost:8000
.venv/Scripts/python -m pytest                                    # all tests, no LLM or network needed
.venv/Scripts/python -m pytest tests/test_rules.py::test_guild_quest_flow   # one test
node --test "tests/client/*.test.mjs"                             # the simulation, terrain and shared data (Node 21+, no install)
docker compose up --build                                         # needs .env (copy .env.example)
```

There is no linter, formatter or JS build step. Python tests use `OfflineLLM` (never answers) or `ScriptedLLM` (answers from a queue) from `tests/fakes.py`. If a map or terrain change is deliberate, refresh the stored copy with `python tests/test_world.py` and update `WORLD_HASH` in `tests/client/terrain.test.mjs`.

The client is plain ES modules served as-is from `client/`, with three.js vendored in `client/vendor/` and resolved by the import map in `index.html` (and again in `lookbook.html`).

Settings are environment variables read once in `isekai/config.py`. Only Compose loads `.env`; a native run needs them exported. Besides the ones in the README there are `ISEKAI_HOST`, `ISEKAI_CLIENT_DIR`, `ISEKAI_CONTENT_DIR` and `ISEKAI_LLM_TIMEOUT`.

Debugging: `http://localhost:8000/lookbook.html` renders every character; in the browser console, `isekai.teleport('name')`, `isekai.G`, `isekai.ents`. Without a key the LLM goes offline and the game falls back to a default world, which is the cheap way to run it: each real request counts against a small OpenRouter quota (see the README).

## Architecture

One FastAPI process, one `Game` (`isekai/core/game.py`), one saved `World` (`isekai/core/state.py`). Single player, no auth.

**The split between server and client is the key thing to understand.** The server owns state and rules: player profile, laws, economy, story, residents. The client owns the simulation: terrain, physics, combat, creature AI. They meet over HTTP:

- The client reports what happened (`/api/event`, `/crime`, `/report`, `/blocks`, `/context`) and applies the `state_payload` it gets back. Effects it must carry out, such as spawning golems, come back as a dict for `applyEffects` in `client/js/sim/effects.js`.
- The server cannot push. Anything it originates goes through `World.push()` into the feed, which the client polls every 2.5 s (`startSync`, `handleFeed` in `net/sync.js`).
- Terrain never crosses the wire. The server sends the seed, lands and building layouts, and `client/js/sim/terrain.js` turns them into blocks deterministically. Anything that changes noise offsets, RNG draw order or structure generation reshapes existing worlds. Only the player's changes are stored: `sim/edits.js` tracks them, and `/api/blocks` saves them in `World.block_edits` together with the inventory, so the two cannot disagree.

**Server layers.** `api/` only reads requests and calls `core/commands.py`, which is everything the player can do. Commands use `systems/` (laws, shop, guild, story, people), which know nothing about HTTP or the LLM. `god/` holds the LLM turns and `persistence/` reads, writes and upgrades saves.

**One game clock.** `World.clock` counts seconds played. It only advances in `Game.tick`, and only while `Game.playing()`, which needs a recent `/api/context` report saying `playing: true`. Merely polling the feed does not count. Cooldowns, festivals, raids, idle narration and the guild board all run on it, so a pause pauses them all. Use `World.after()` for anything due later: timers are saved, so a restart cannot lose them. Never use `time.time()` or `asyncio.sleep` for gameplay.

**Client layers.** `core/` is shared basics, `sim/` is the game itself, `view/` draws it, `net/` talks to the server and `ui/` is the page. The rule that keeps this working: `sim/` imports only `core/` and `sim/`, never `three`, the DOM, `view/`, `ui/` or `net/`. It announces what happened with `emit` from `core/events.js`, and the others listen. That is why `tests/client/sim.test.mjs` can run the whole simulation in Node. Each entity's meshes live on `e.view`, which only `view/bodies.js` touches. The simulation advances in fixed 1/60 s steps (`core/loop.js`, `sim/world.js`).

**Creature lifetimes.** `sim/lifetime.js` decides when a creature leaves the world. Beings that live in structures carry a `home` hint, handed back to `hintQueue` when they leave, so they return with the player. Residents are spawned and removed by `updateResidents` instead.

**The god cannot touch the world.** This is the game's premise and the LLM's actual constraint: it produces text and picks from options the engine offers.

- All LLM calls go through `LLM.ask(prompt, PydanticModel)` in `isekai/llm/client.py`, which returns `None` on any failure. Every caller must have a fallback, because the game has to be fully playable offline and the tests rely on it. Pass `urgent=True` when the player is waiting; background work yields to it.
- `Narrator` (`isekai/god/narrator.py`) runs one queue of `call(reason)` turns. A turn may narrate, decree a law and trigger one event, and only events from `allowed_events()` are honoured.
- `laws.py`'s `CRIMES`, `SCOPES` and `PUNISHMENTS` also generate the `Literal` types in the LLM schemas in `genesis.py` and `narrator.py`. LLM output is untrusted: `validate_law`, `clean_name`, `clean_prose` and `clean_text` exist because small models leak JSON into strings.
- The story is tracked by the engine (`isekai/systems/story.py`), not the LLM. Flags are set by `story.meet` and `commands.enter_land`.
- A lost connection takes the LLM offline for a growing wait, then it tries again. A refused key (401, 402) stays off until the next `ping`.

**Settlements** are built in layers: `world/map.py` places them from the `MAP_ROWS` grid, `world/layouts.py` positions buildings, `content/jobs.json` declares jobs, and `systems/people/roster.py` turns an optional god plan into residents with seeded RNG. `Game.new_world` makes default rosters immediately, then `_plan_all` upgrades them in the background and announces each one with a `settlement` feed item so the client refetches it. On the client only residents near the player exist as entities (`updateResidents` in `sim/people.js`).

## Shared data

`content/*.json` is the single source of truth for what both sides need: world sizes, realms, blocks, creatures, items, services, jobs, laws, guild quests, abilities and event names. The server loads it in `isekai/content.py` and the client in `client/js/core/content.js`, served from `/content`. Change the data once and both sides follow.

Three things are still code on one side that names data from the other. `tests/client/` checks them, so a mismatch fails a test:

| Data | Code it must match |
|---|---|
| `Building.kind` in `layouts.py` | `BUILD` table in `sim/terrain.js` |
| `jobs` in `content/jobs.json` | `OUTFITS` in `view/outfits.js` |
| `content/events.json` | `WORLD_EVENTS` in `sim/worldevents.js`; `run_event` in `narrator.py` |

Job `work` and `night` values are building kinds, or one of `field`, `gate`, `shore` (`_spot` in `roster.py`).

## Saves

`World` is pydantic and saved whole, so new fields need defaults. `load()` returns `None` for an unreadable save, and the game then behaves as if no world exists, but the file is first set aside as `world.unreadable-<time>.json`, so creating a new world cannot destroy it. Changes that need old saves rewritten go in a new step in `STEPS` in `persistence/migrations.py`; `save_version` and new worlds follow automatically.

## Client notes

`client/js/` has no import cycles, so module top level is free to use imports. Keep it that way: dependencies point from `ui/` down through `net/` and `view/` to `sim/` and `core/`. `core/content.js` loads the data with a top-level `await`, which pauses every module that imports it. `lookbook.html` imports `view/avatar.js` directly and must keep working without the game, so nothing `avatar.js` imports may need `core/content.js`.

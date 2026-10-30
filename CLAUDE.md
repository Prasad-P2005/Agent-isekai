# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"     # first time; on Linux/macOS use .venv/bin/
.venv/Scripts/python -m isekai                                    # http://localhost:8000
.venv/Scripts/python -m pytest                                    # all tests, no LLM or network needed
.venv/Scripts/python -m pytest tests/test_rules.py::test_guild_quest_flow   # one test
docker compose up --build                                         # needs .env (copy .env.example)
```

There is no linter, formatter, JS build step or JS test suite. The client is plain ES modules served as-is from `client/`, with three.js vendored in `client/vendor/` and resolved by the import map in `index.html` (and again in `lookbook.html`).

Settings are environment variables read once in `isekai/config.py`. Only Compose loads `.env`; a native run needs them exported. Besides the ones in the README there are `ISEKAI_HOST`, `ISEKAI_CLIENT_DIR` and `ISEKAI_LLM_TIMEOUT`.

Debugging: `http://localhost:8000/lookbook.html` renders every character; in the browser console, `isekai.teleport('name')`, `isekai.G`, `isekai.ents`. Without a key the LLM goes offline and the game falls back to a default world, which is the cheap way to run it: each real request counts against a small OpenRouter quota (see the README).

## Architecture

One FastAPI process, one `Game` (`isekai/game.py`), one saved `World` (`isekai/state.py`). Single player, no auth.

**The split between server and client is the key thing to understand.** The server owns state and rules: player profile, laws, economy, story, residents. The client owns the simulation: terrain, physics, combat, creature AI. They meet over HTTP:

- The client reports what happened (`/api/event`, `/crime`, `/report`, `/blocks`) and applies the `state_payload` it gets back. Effects it must carry out, such as spawning golems, come back as a dict for `applyEffects` in `client/js/ui.js`.
- The server cannot push. Anything it originates goes through `World.push()` into the feed, which the client polls every 2.5 s (`startFeed`, `handleFeed` in `ui.js`).
- Terrain never crosses the wire. The server sends the seed, lands and building layouts, and `client/js/terrain.js` turns them into blocks deterministically. Anything that changes noise offsets, RNG draw order or structure generation reshapes existing worlds. Mined and placed blocks live only in `edits` in `chunks.js` and are lost on reload; only the inventory is synced.

**The god cannot touch the world.** This is the game's premise and the LLM's actual constraint: it produces text and picks from options the engine offers.

- All LLM calls go through `LLM.ask(prompt, PydanticModel)` in `isekai/llm/client.py`, which returns `None` on any failure. Every caller must have a fallback, because the game has to be fully playable offline and the tests rely on it. Pass `urgent=True` when the player is waiting; background work yields to it.
- `Narrator` (`isekai/god/narrator.py`) runs one queue of `call(reason)` turns. A turn may narrate, decree a law and trigger one event, and only events from `allowed_events()` are honoured.
- `laws.py`'s `CRIMES`, `SCOPES` and `PUNISHMENTS` also generate the `Literal` types in the LLM schemas in `genesis.py` and `narrator.py`. LLM output is untrusted: `validate_law`, `clean_name`, `clean_prose` and `clean_text` exist because small models leak JSON into strings.
- The story is tracked by the engine (`isekai/story/stages.py`), not the LLM. Flags are set in `/api/talk` (`STORY_TALKS`) and `Game.on_enter_land`.

**Settlements** are built in layers: `world/map.py` places them from the `MAP_ROWS` grid, `world/layouts.py` positions buildings, `people/jobs.py` declares jobs declaratively, and `people/roster.py` turns an optional god plan into residents with seeded RNG. `Game.new_world` makes default rosters immediately, then `_plan_all` upgrades them in the background and announces each one with a `settlement` feed item so the client refetches it. On the client only residents near the player exist as entities (`updateResidents` in `people.js`).

## Contracts that cross the Python/JS boundary

Nothing enforces these, so a change on one side needs its partner:

| Python | JavaScript |
|---|---|
| `Building.kind` in `layouts.py` | `BUILD` table in `terrain.js` |
| `LAND = 64` in `world/map.py` | `LAND` in `terrain.js` |
| `Job.kind` in `jobs.py` | `ENT` in `entities.js` |
| job names in `jobs.py` | `OUTFITS` in `avatar.js` |
| `Job.service`, `SERVICES` in `shop.py` | `TITLES` in `ui.js` |
| `CRIMES` in `laws.py` | `'kill_' + D.race` in `entities.js`, `crime(...)` calls |
| `Land.realm`, `SCOPE_REALM` | `REALM_B` in `terrain.js`, `REALM_NAME` in `people.js` |
| `EVENTS`, `run_event` in `narrator.py` | `handleFeed` in `ui.js` |
| ability names in `shop.py` | `ABIL` in `ui.js`, `has(...)` calls |
| `Resident.id == settlement.id * 1000 + i` | `Math.floor(res.id / 1000)` in `entities.js`, `people.js` |

Job `work` and `night` values are building kinds, or one of `field`, `gate`, `shore` (`_spot` in `roster.py`).

## Saves

`World` is pydantic and saved whole, so new fields need defaults. `load()` returns `None` for an unreadable save, and the game then behaves as if no world exists. Changes that need old saves rewritten go in `migrate_world_society` (`people/society.py`) behind a `society_version` bump; remember to set the same version in `Game.new_world`.

## Client notes

`client/js/` modules import each other in cycles (`entities` ↔ `player` ↔ `ui` ↔ `people`). That works because imported bindings are only used inside functions at runtime, so don't use one at module top level. `lookbook.html` imports `avatar.js` directly and must keep working without the game.

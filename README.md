# Isekai Realms

You die on Earth, meet a god in heaven, and are reborn into a voxel fantasy world to slay the Demon Lord.
The world, its people, its laws and its story are written by an LLM (through OpenRouter) acting as a god who
**cannot touch the world directly**: he acts only through the world's rules.

## Run it

Create an [OpenRouter API key](https://openrouter.ai/keys), then copy the example settings and paste the key into `.env`:

```bash
cp .env.example .env
```

Then run the app with Docker Compose:

```bash
docker compose up --build
```

Open `http://localhost:8000`. Compose keeps world saves in a named volume and publishes the game on this machine only, because the game has no login and anyone who can reach it can spend your OpenRouter credits. Stop with `docker compose down`.

You can also run the app directly:

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'   # first time only
export ISEKAI_LLM_API_KEY=sk-or-...
.venv/bin/python -m isekai         # http://localhost:8000
.venv/bin/pytest                   # tests (no LLM needed)
node --test "tests/client/*.test.mjs"   # the game simulation, terrain and shared data (Node 21+)
```

Settings come from environment variables: `ISEKAI_LLM_API_KEY`, `ISEKAI_LLM_URL`, `ISEKAI_LLM_MODEL`, `ISEKAI_PORT`, `ISEKAI_SAVE_DIR`.
`ISEKAI_LLM_MODEL` can be any OpenRouter model with a provider that supports both structured outputs and temperature.
The default model is free, but OpenRouter caps free use at 20 requests a minute and 50 a day (1,000 a day once you have bought 10 credits). A new world uses 14 requests, and every person's reply and god narration uses one. Past the cap, the god goes quiet and people only answer "…" until the quota resets at midnight UTC. `ISEKAI_GOD_IDLE` sets the seconds between unprompted narrations (default 600); raise it to save requests.
The world is saved to `saves/world.json` after every action, including the blocks you mine and place, where you stand and the time of day.

## How a playthrough goes

1. **Heaven**: chat with the god (LLM), then descend. A "Chapter I" card introduces the world.
2. **The finite world**: an 8×8 grid of 64×64-block lands: 4 human villages, 2 walled human cities with rulers,
   the walled elven capital with its Elf King or Queen, 2 elven villages, 4 beastkin villages, mermaid seas, the Dragonspine Peaks and the Demon Lord's castle.
3. **The storyline**, tracked by the engine, narrated by the god:
   meet the King → win the favor of the Elf King/Queen and a Beastkin Chief → finish 2 guild quests →
   enter the demon lands → slay the Demon Lord → return to the King.

## Systems

| System | Where | What it does |
|---|---|---|
| Genesis | `isekai/god/genesis.py` | The god names the world, rulers, settlements, Demon Lord, and writes the laws |
| Settlement plans | `isekai/god/planner.py`, `isekai/systems/people/` | The god plans each settlement's population and notable people (guild master, receptionist, doctors…); the engine guarantees required jobs, homes and workplaces |
| Laws & crimes | `isekai/systems/laws.py`, `client/js/sim/people.js` | Crimes need a law covering the place; witnessed crimes are punished (golems, guards, bounty, fine, exile, curse); civilian witnesses run to report you, so silence them or flee |
| The god in the world | `isekai/god/narrator.py` | Narrates events, may decree new laws, may trigger only the world events the rules allow (raids, caravans, festivals, hordes) |
| Economy & guild | `isekai/systems/shop.py`, `isekai/systems/guild.py` | Loot → merchants; potions, weapons, armor, skill scrolls; doctors, inns, priests; guild quests and ranks |
| Dialogue | `isekai/god/dialogue.py` | Every person speaks in character with memory of past conversations |
| Client | `client/js/` | `sim/` is the game (terrain, physics, combat, creature AI), `view/` draws it with three.js, `ui/` is the page, `net/` talks to the server |
| Game data | `content/` | Blocks, creatures, items, jobs and laws, shared by the server and the client |

## Characters

Everyone is a block character designed in code (`client/js/view/avatar.js`): pixel-art anime faces, anime hairstyles
(twin-tails, ponytails, bobs, *ahoge*), outfits by job (guild uniform, royal gowns, armor, nurse cap, priest robes…),
elf ears, beastkin cat ears and tails. Open `http://localhost:8000/lookbook.html` to see the whole cast.

## Settlements & livelihoods

Settlement populations use seeded occupation mixes, so each world has a consistent social layout. Human capitals have a larger wall ring, a dense residential district, an inner market, and room for 100–180 residents; villages keep their smaller footprints. Farmers work fields beyond city walls, guards patrol the gates, established merchants work inside the market, and street peddlers trade outside the gates. Fisherfolk appear only in coastal settlements and work along the shore. Rural human villages favor farming, while elven and beastkin settlements retain their forest and hunting trades.

## Building

Blocks are not free: hold left click to mine (harder blocks take longer, bedrock is unbreakable, pickaxes from the
blacksmith speed it up). Mined blocks go to your inventory (`I`) and are spent when you build.

## Controls

WASD move · Space jump · Shift sprint · E talk to whoever is under the crosshair (type to chat; shops and services open alongside) ·
T pray · L laws · I inventory · Q fireball · R heal · G/V potions · F flight · click attack · hold click mine · right click place.

Browser console helpers: `isekai.teleport('Crownstone')`, `isekai.G.profile`, `isekai.ents`.

# Isekai Realms

You die on Earth, meet a god in heaven, and are reborn into a voxel fantasy world to slay the Demon Lord.
The god **cannot touch the world directly**. Gods have no hands, only Laws, and the world enforces those whether anyone likes it or not.
Nothing here needs an AI service or a key: the story, the people and every line of dialogue are written and shipped with the game.

## Install and run

Get the code:

```bash
git clone https://github.com/Prasad-P2005/Agent-isekai.git
cd Agent-isekai
```

Then use Docker or Python. Either way the game runs at `http://localhost:8000`. Play it in a desktop browser with WebGL, using a keyboard and mouse.

### Option 1: Docker

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/), or Docker Engine with the Compose plugin.

```bash
docker compose up --build
```

Stop with `Ctrl+C`. These cover the rest:

| To | Run |
|---|---|
| Start in the background | `docker compose up -d --build` |
| See the logs | `docker compose logs -f` |
| Stop and keep your world | `docker compose down` |
| Update to the latest code | `git pull`, then `docker compose up -d --build` |
| Back up your world while the game is up | `docker compose cp app:/data/world.json ./world-backup.json` |
| Delete your world for good | `docker compose down -v` |

To load a backup, or a world you played outside Docker:

```bash
docker compose stop
docker compose cp ./world-backup.json app:/data/world.json
docker compose start
```

Your world lives in the `game-saves` volume, so it survives rebuilds and `docker compose down`. Only `-v` deletes it. Once started, the game comes back whenever Docker starts, until you stop it.

Compose publishes the game on this machine only, because the game has no login. To use another port, change the first `8000` in `compose.yaml`, for example to `"127.0.0.1:9000:8000"`.

### Option 2: Python

You need Python 3.10 or newer.

Windows (PowerShell):

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
.venv\Scripts\python -m isekai
```

macOS and Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python -m isekai
```

The first two lines are only needed once. After that, the last line starts the game. Stop with `Ctrl+C`.

## Tests

Run these from a Python install. The first is the same on macOS and Linux with `.venv/bin/python`. The second needs Node 21+ and nothing else.

```powershell
.venv\Scripts\python -m pytest
node --test "tests/client/*.test.mjs"
```

`pytest` covers the server. `node --test` covers the game simulation, terrain and shared data. Neither needs the network.

## Settings

Settings are environment variables:

| Variable | Default | What it sets |
|---|---|---|
| `ISEKAI_PORT` | `8000` | The port the server listens on |
| `ISEKAI_HOST` | `127.0.0.1` | The address the server binds to. The game has no login, so keep it on this machine unless you trust the network |
| `ISEKAI_SAVE_DIR` | `saves/` | Where `world.json` is written |
| `ISEKAI_CLIENT_DIR` | `client/` | The browser client to serve |
| `ISEKAI_CONTENT_DIR` | `content/` | The game data to load |

To run on another port without Docker:

```powershell
$env:ISEKAI_PORT = "9000"; .venv\Scripts\python -m isekai    # Windows (PowerShell)
```

```bash
ISEKAI_PORT=9000 .venv/bin/python -m isekai                  # macOS and Linux
```

`compose.yaml` sets the host, port and save folder for Docker (`0.0.0.0`, `8000` and `/data`).

## Saves

The world is saved to `saves/world.json` (`/data/world.json` in Docker) after every action, including the blocks you mine and place, where you stand and the time of day. **New World** on the title screen replaces it.

Saves from older versions upgrade themselves when they load. A save that cannot be read is never overwritten: it is moved aside as `world.unreadable-<time>.json`, and the game starts as if no world exists.

## How a playthrough goes

1. **Heaven**: talk with the god, then descend. A "Chapter I" card introduces the world.
2. **The finite world**: a 10×10 grid of 128×128-block lands whose borders wander and blend, tied together by rivers and roads: 5 human villages, 2 walled human cities with rulers,
   the walled elven capital with its Elf King or Queen, 2 elven villages, 5 beastkin villages, mermaid seas, the Mirefen, the Dragonspine Peaks with the Wyrmcrown, and the Demon Lord's castle.
3. **The storyline**, in `content/story.json`:
   - **Act I**: the King explains the First Law: no mortal hand can wound the Demon Lord, unless every people swears to amend it.
   - **Act II, The Four Oaths**: prove yourself to the Guild for the Crown, gather Mana Crystals for the Elves, hunt orcs for the Tribes, and carry a broken treaty from the port queen to the Sea. The order is yours.
   - **Act III, The One Who Came Before**: a cairn in the southern ruins, carved in a language only you can read. Make the god tell you the truth, then amend the First Law at a Law Stone.
   - **Act IV, The Throne**: a three-stage fight with a Demon Lord who keeps his wounds, and who remembers being someone else.
   - **Act V, The Crown**: give it to the King, break it on a Law Stone, or put it on. Each ending changes the world you keep playing in.

## Systems

| System | Where | What it does |
|---|---|---|
| Genesis | `isekai/world/genesis.py` | Each seed draws its own world: names, rulers, economy, raid pace and two local laws |
| Settlements | `isekai/systems/people/` | Everyone has a job, a workplace and a home. The dead are replaced, so towns live on |
| Laws & crimes | `isekai/systems/laws.py`, `client/js/sim/people.js` | Crimes need a law covering the place; witnessed crimes are punished (golems, guards, bounty, fine, exile, curse); civilian witnesses run to report you, so silence them; adventurers and guards fight back |
| The god | `isekai/systems/storyteller.py` | Narrates, decrees new laws as you earn them, and sets off the world events the rules allow (raids, caravans, festivals, hordes, travellers, named foes) |
| Story | `isekai/systems/story.py`, `content/story.json` | Chapters, oaths, scenes, and three endings |
| Quest marks | `isekai/systems/marks.py`, `client/js/sim/marks.js` | The compass and both maps point at what you are after, and follow the person or creature behind it |
| Dialogue | `isekai/systems/dialogue.py`, `content/lines/` | Thousands of combinations of hand-written lines, chosen by job, people, temperament, the hour and the war. Nothing repeats soon, and everyone has a life they will tell you about |
| World memory | `isekai/systems/chronicle.py` | What you do becomes gossip that spreads town by town. Your renown changes how people greet you and what traders charge |
| Favors | `isekai/systems/favors.py` | Anyone can ask for help: fetch, hunt, deliver or go and look |
| Nemesis | `isekai/systems/storyteller.py` | The monster that kills you gets a name, gets stronger, and comes back |
| Magic | `isekai/systems/magic.py`, `client/js/sim/abilities.js` | Spells from scrolls, and a well of mana that deepens as you use it |
| Economy & guild | `isekai/systems/shop.py`, `isekai/systems/guild.py` | Loot to merchants; potions, weapons, armor, skill scrolls; doctors, inns, priests; guild quests and ranks |
| Saves | `isekai/persistence/` | Reads and writes the world file, and upgrades old saves |
| Client | `client/js/` | `sim/` is the game (terrain, physics, combat, creature AI), `view/` draws it with three.js, `ui/` is the page, `net/` talks to the server |
| Game data | `content/` | Blocks, creatures, items, jobs, laws, the story and the line library |

## Characters

Everyone is pixel art painted on blocks, like a detailed Minecraft skin. Most people are serious adults of mixed builds, and a few are small and cute on purpose. Outfits follow the job, elves have their ears, and beastkin have cat ears and tails.
People are in `client/js/view/avatar.js` and everything else is in `client/js/view/creatures.js`. Open `http://localhost:8000/lookbook.html` to see the whole cast.

## Settlements & livelihoods

Settlement populations use seeded occupation mixes, so each world has a consistent social layout. Human capitals have a larger wall ring, a dense residential district, an inner market, and room for 100–180 residents; villages keep their smaller footprints. Farmers work fields beyond city walls, guards patrol the gates, established merchants work inside the market, and street peddlers trade outside the gates. Fisherfolk appear only in coastal settlements and work along the shore. Rural human villages favor farming, while elven and beastkin settlements retain their forest and hunting trades.

## Building

Blocks are not free: hold left click to mine (harder blocks take longer, bedrock is unbreakable, pickaxes from the
blacksmith speed it up). Mined blocks go to your bag (`I`) and are spent when you build.

Creative mode is a switch on the pause screen. While it is on, your bag holds every block, placing costs nothing, a click
breaks a block at once, `F` flies for free, every spell is free and nothing can hurt you. Monsters, the Wyrm and the law
ignore you. The First Law still holds, so the Wyrm and the Demon Lord cannot be wounded until you are Oathbound. The mode
is saved with your world, and what you build stays when you turn it off.

## Crafting, gear and the deep

Everything you carry sits in one bag of 36 slots, and the first nine are your hotbar, which holds anything. The right tool
mines faster, and better blocks need a better pickaxe: nine tiers from wood to dragonsteel, in ten kinds of tool and weapon, and
fourteen sets of armour. Tools wear out, and an anvil repairs them. A crafting table, furnace, forge, anvil, alchemy table and
chest each open with a right click. The recipe book in the bag grows as you pick things up.

Under the land are three sizes of cave. Tight squeezes and winding tunnels near the top lead down to colossal halls, each in a biome
of its own. The Old Ways run through all of it: lit corridors, bridges and rope ladders, with lamps marking where they meet the surface.

## Controls

| Action | Key |
|---|---|
| Move | WASD or the arrow keys |
| Jump, sprint | Space, Shift |
| Attack, mine, use what is in your hand | Click, hold click, right click |
| Climb a rope ladder or vine | W up, S down |
| Choose a dock slot | 1–0 or the mouse wheel |
| Talk to whoever is under the crosshair | E, then pick what to say with a click or 1–9. Shops and services open alongside |
| Pray to the god | T |
| Bag, journal, laws, map | I, J, L, M |
| Your two chosen spells (pick them in the bag) | Q, R |
| Health and mana potions | G, V |
| Flight | F |
| Pause and resume | Esc to pause. Click, Enter or Space to resume |
| Position and frame rate | F3 |

You start with no spells. Scrolls at a market teach them, along with double jump, swift, giant strength and flight. Your maximum mana starts at 100 and grows three ways: attune to a Mana Crystal at a temple, keep casting, and swear the Oath of the Elves. A meteor costs 120, so it has to wait until you have grown it.

## Debugging

In the browser console:

```js
isekai.teleport('Town name')   // town names come from the world's seed
isekai.teleport(x, z)
isekai.G.profile
isekai.ents
```

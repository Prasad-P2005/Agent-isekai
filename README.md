# Isekai Realms

You die on Earth, meet a god in heaven, and are reborn into a voxel fantasy world to slay the Demon Lord.
The god **cannot touch the world directly**. Gods have no hands, only Laws, and the world enforces those whether anyone likes it or not.
Nothing here needs an AI service or a key: the story, the people and every line of dialogue are written and shipped with the game.

## Run it

```bash
docker compose up --build
```

Open `http://localhost:8000`. Compose keeps world saves in a named volume and publishes the game on this machine only, because the game has no login. Stop with `docker compose down`.

You can also run the app directly:

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'   # first time only
.venv/bin/python -m isekai         # http://localhost:8000
.venv/bin/pytest                   # tests
node --test "tests/client/*.test.mjs"   # the game simulation, terrain and shared data (Node 21+)
```

Settings come from environment variables: `ISEKAI_PORT`, `ISEKAI_SAVE_DIR`.
The world is saved to `saves/world.json` after every action, including the blocks you mine and place, where you stand and the time of day.

## How a playthrough goes

1. **Heaven**: talk with the god, then descend. A "Chapter I" card introduces the world.
2. **The finite world**: an 8×8 grid of 64×64-block lands: 4 human villages, 2 walled human cities with rulers,
   the walled elven capital with its Elf King or Queen, 2 elven villages, 4 beastkin villages, mermaid seas, the Dragonspine Peaks and the Demon Lord's castle.
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
| Dialogue | `isekai/systems/dialogue.py`, `content/lines/` | Thousands of combinations of hand-written lines, chosen by job, people, temperament, the hour and the war. Nothing repeats soon, and everyone has a life they will tell you about |
| World memory | `isekai/systems/chronicle.py` | What you do becomes gossip that spreads town by town. Your renown changes how people greet you and what traders charge |
| Favors | `isekai/systems/favors.py` | Anyone can ask for help: fetch, hunt, deliver or go and look |
| Nemesis | `isekai/systems/storyteller.py` | The monster that kills you gets a name, gets stronger, and comes back |
| Economy & guild | `isekai/systems/shop.py`, `isekai/systems/guild.py` | Loot to merchants; potions, weapons, armor, skill scrolls; doctors, inns, priests; guild quests and ranks |
| Client | `client/js/` | `sim/` is the game (terrain, physics, combat, creature AI), `view/` draws it with three.js, `ui/` is the page, `net/` talks to the server |
| Game data | `content/` | Blocks, creatures, items, jobs, laws, the story and the line library |

## Characters

Everyone is a block character designed in code (`client/js/view/avatar.js`): pixel-art anime faces, anime hairstyles
(twin-tails, ponytails, bobs, *ahoge*), outfits by job (guild uniform, royal gowns, armor, nurse cap, priest robes…),
elf ears, beastkin cat ears and tails. Open `http://localhost:8000/lookbook.html` to see the whole cast.

## Settlements & livelihoods

Settlement populations use seeded occupation mixes, so each world has a consistent social layout. Human capitals have a larger wall ring, a dense residential district, an inner market, and room for 100–180 residents; villages keep their smaller footprints. Farmers work fields beyond city walls, guards patrol the gates, established merchants work inside the market, and street peddlers trade outside the gates. Fisherfolk appear only in coastal settlements and work along the shore. Rural human villages favor farming, while elven and beastkin settlements retain their forest and hunting trades.

## Building

Blocks are not free: hold left click to mine (harder blocks take longer, bedrock is unbreakable, pickaxes from the
blacksmith speed it up). Mined blocks go to your bag (`I`) and are spent when you build.

## Controls

WASD move · Space jump · Shift sprint · E talk to whoever is under the crosshair (pick what to say with a click or 1–9; shops and services open alongside) ·
T pray to the god · I bag · J journal · L laws · M map · Q fireball · R heal · Z frost nova · X chain lightning · C blink · B mana ward · H meteor · G/V potions · F flight · click attack · hold click mine · right click place · F3 position and frame rate.

Spells come from scrolls at a market. Your maximum mana starts at 100 and grows three ways: attune to a Mana Crystal at a temple, keep casting, and swear the Oath of the Elves. A meteor costs 120, so it has to wait until you have grown it.

Browser console helpers: `isekai.teleport('Crownstone')`, `isekai.G.profile`, `isekai.ents`.

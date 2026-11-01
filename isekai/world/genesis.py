"""Genesis: a new world drawn from the seed. Its names, rulers, economy and local laws differ from world to world,
while the map and the story keep their shape."""
from __future__ import annotations

import random

from ..content import LINES, NAMES, WORLD
from ..core.state import Echo, Pos, Settlement, World
from ..systems.laws import DEFAULT_LAWS, LOCAL_LAWS
from ..systems.lines import fill
from ..systems.people.roster import make_roster
from .layouts import TOWNS
from .map import build_map

RAID_MINUTES = (5.0, 11.0)
STONES = 11  # one for each who came before the one who left the cairn
FIRST_STONE = (7.0, 6.0)  # from where the hero lands, so that the first thing they find is a question


def ruler_of(world: World, s: Settlement) -> tuple[str | None, str | None]:
    if s.type == "elfcity":
        return world.elf_ruler_title, world.elf_ruler_name
    if s.type != "city":
        return None, None
    if s.id == world.capital().id:
        return "king", world.king_name
    return "queen", s.ruler


def first_spawn(world: World) -> Pos:
    """Just south of the village nearest the capital, on dry ground beyond its farmers."""
    capital = world.capital()
    village = min(world.settlements_of("human"), key=lambda s: (s.cx - capital.cx) ** 2 + (s.cz - capital.cz) ** 2)
    return Pos(x=village.cx + 5.5, z=village.cz + TOWNS["human"]["reach"] + 3.5)


def place_echoes(world: World) -> None:
    """The first stone is beside where the hero lands. The rest spread out across open land, nearest first, so that following them is a way of seeing the world."""
    rng, land = random.Random(f"{world.seed}/echoes"), WORLD["land"]
    spawn_x, spawn_z = world.spawn.x, world.spawn.z
    around = sorted(((lx, lz) for lz, row in enumerate(world.lands) for lx, l in enumerate(row) if l.realm != "ocean" and l.structure == "none" and l.settlement is None),
                    key=lambda spot: ((spot[0] + 0.5) * land - spawn_x) ** 2 + ((spot[1] + 0.5) * land - spawn_z) ** 2)
    gap = (len(around) - 1) / max(1, STONES - 2)
    chosen = [around[round(i * gap)] for i in range(STONES - 1)] if around else []
    world.echoes =[Echo(x=spawn_x + FIRST_STONE[0], z=spawn_z + FIRST_STONE[1]), *(Echo(x=(lx + rng.uniform(0.3, 0.7)) * land, z=(lz + rng.uniform(0.3, 0.7)) * land) for lx, lz in chosen)]


def _name_places(world: World, rng: random.Random) -> None:
    pools = {t: rng.sample(NAMES[f"{t}_places"], len(NAMES[f"{t}_places"])) for t in ("human", "city", "elf", "elfcity", "beast")}
    for s in world.settlements:
        s.name = pools[s.type].pop()
        s.description = fill(world, rng.choice(LINES[f"about:{s.type}"]), rng, place=s.name)


def found_settlement(world: World, s: Settlement) -> None:
    """A place that appears after genesis: named from what is left, and peopled."""
    rng = random.Random(f"{world.seed}/{s.id}")
    taken = {o.name for o in world.settlements}
    s.name = rng.choice([n for n in NAMES[f"{s.type}_places"] if n not in taken])
    s.description = fill(world, rng.choice(LINES[f"about:{s.type}"]), rng, place=s.name)
    make_roster(s, world.seed)
    world.settlements.append(s)


def run_genesis(world: World, name: str = "", god_is: str = "") -> None:
    """The seed chooses everything, unless the player asked for a name for the world or for a god or a goddess. The draws stay in order, so that a seed keeps its world."""
    rng = random.Random(world.seed)
    world.lands, world.settlements, world.demon_land = build_map()
    drawn = rng.choice(NAMES["worlds"])
    world.name = name or drawn
    god = rng.choice([g for g in NAMES["gods"] if g["is"] == god_is] or NAMES["gods"])
    world.god_name, world.god_is = god["name"], god["is"]
    world.kingdom = rng.choice(NAMES["kingdoms"])
    world.king_name = rng.choice(NAMES["kings"])
    elf = rng.choice(NAMES["elf_rulers"])
    world.elf_ruler_name, world.elf_ruler_title = elf["name"], f"elf_{elf['is']}"
    world.demon_lord_name = rng.choice(NAMES["demon_lords"])
    world.demon_realm_name = rng.choice(NAMES["demon_realms"])
    world.raid_every = rng.uniform(*RAID_MINUTES) * 60
    world.prosperity = rng.choice(("poor", "normal", "normal", "rich"))
    world.currency = rng.choice(NAMES["currencies"])
    _name_places(world, rng)
    world.settlements_of("city")[1].ruler = rng.choice(NAMES["queens"])
    world.lands[world.demon_land[1]][world.demon_land[0]].name = world.demon_realm_name
    world.premise = fill(world, rng.choice(LINES["premise"]), rng)
    world.god_intro = fill(world, rng.choice(LINES["god_intro"]), rng)
    world.hero = fill(world, rng.choice(LINES["hero"]), rng)
    world.laws = [*DEFAULT_LAWS, *rng.sample(LOCAL_LAWS, 2)]
    for s in world.settlements:
        job, name = ruler_of(world, s)
        make_roster(s, world.seed, job, name)
    world.spawn = first_spawn(world)
    place_echoes(world)
    world.genesis_done = True

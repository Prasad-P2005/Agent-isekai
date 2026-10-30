"""Genesis: a new world drawn from the seed. Its names, rulers, economy and local laws differ from world to world,
while the map and the story keep their shape."""
from __future__ import annotations

import random

from ..content import LINES, NAMES
from ..core.state import Pos, Settlement, World
from ..systems.laws import DEFAULT_LAWS, LOCAL_LAWS
from ..systems.lines import fill
from ..systems.people.roster import make_roster
from .layouts import TOWNS
from .map import build_map

RAID_MINUTES = (5.0, 11.0)


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


def _name_places(world: World, rng: random.Random) -> None:
    pools = {t: rng.sample(NAMES[f"{t}_places"], len(NAMES[f"{t}_places"])) for t in ("human", "city", "elf", "elfcity", "beast")}
    for s in world.settlements:
        s.name = pools[s.type].pop()
        s.description = fill(world, rng.choice(LINES[f"about:{s.type}"]), rng, place=s.name)


def run_genesis(world: World) -> None:
    rng = random.Random(world.seed)
    world.lands, world.settlements, world.demon_land = build_map()
    world.name = rng.choice(NAMES["worlds"])
    god = rng.choice(NAMES["gods"])
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
    world.genesis_done = True

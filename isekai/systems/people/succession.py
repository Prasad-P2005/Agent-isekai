"""Life goes on: when someone dies, a new person takes their place. They keep the post and its id, so what the post
owes the hero (a temple's blessing, say) does not reset, and a settlement never fills up with the dead."""
from __future__ import annotations

import random

from ...core.state import Resident, Settlement, World
from .jobs import ROYAL
from .names import gen_name

SUCCESSOR_DELAY = 120.0  # seconds of game time before someone takes over an essential job
NEWCOMER_DELAY = 600.0  # and before a new face moves into anyone else's


def delay_for(dead: Resident) -> float:
    return SUCCESSOR_DELAY if dead.service else NEWCOMER_DELAY


def appoint_heir(world: World, s: Settlement, dead: Resident) -> Resident:
    rng = random.Random(dead.id + int(world.clock))
    heir = dead.model_copy(update={"dead": False, "met": 0, "told": 0, "grudge": False, "role": None, "name": gen_name(dead.race, rng)})
    s.residents[s.residents.index(dead)] = heir
    if dead.job in ROYAL:
        s.ruler = heir.name
    if dead.job == "king" and s.id == world.capital().id:
        world.king_name = heir.name
    if dead.job in ("elf_king", "elf_queen"):
        world.elf_ruler_name = heir.name
    s.version += 1
    world.push("settlement", f"{heir.name} takes over as {heir.label} of {s.name}.", id=s.id, version=s.version)
    return heir

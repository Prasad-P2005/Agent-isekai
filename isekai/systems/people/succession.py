"""Life goes on: when someone with an essential job dies, a new person takes over."""
from __future__ import annotations

import random

from ...core.state import Resident, Settlement, World
from .names import gen_name

SUCCESSOR_DELAY = 120.0  # seconds of game time


def appoint_heir(world: World, s: Settlement, dead: Resident) -> Resident:
    rng = random.Random(dead.id + int(world.clock))
    heir = dead.model_copy(update={"id": max(r.id for r in s.residents) + 1, "dead": False, "memory": [], "personality": "",
                                   "name": gen_name(dead.race, rng)})
    s.residents.append(heir)
    if dead.job == "king" and s.id == world.capital().id:
        world.king_name = heir.name
    s.version += 1
    world.push("settlement", f"{heir.name} takes over as {heir.label} of {s.name}.", id=s.id, version=s.version)
    return heir

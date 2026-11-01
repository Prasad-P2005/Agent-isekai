"""When the Throne's armies march on a settlement. The world does not wait: there is a timer, a place on the compass, and if the hero is not there to break the assault,
people die and the prices of everything go up. The fighting only starts when the hero arrives, because the client only simulates what is near them."""
from __future__ import annotations

import random

from ..content import WORLD
from ..core.state import Settlement, Siege, World
from . import chronicle, faith
from .lines import say
from .people.succession import delay_for

LAND = WORLD["land"]
TIME, STORY_TIME = 240.0, 360.0  # seconds of play to get there and break it
FIRST_ASSAULT, MOST_ASSAULT = 5, 12
WAR_WHEN_LOST = 0.12
DEAD_WHEN_LOST = 3
WORTH, PAY = 60, 45
ASSAULTERS = ("imp", "demon_knight")


def _land_of(world: World) -> tuple[int, int] | None:
    pos = world.player.pos
    return (int(pos.x // LAND), int(pos.z // LAND)) if pos else None


def target(world: World) -> Settlement | None:
    """The nearest settlement the hero is not already standing in."""
    here, pos = _land_of(world), world.player.pos
    if not here:
        return None
    return min((s for s in world.settlements if (s.lx, s.lz) != here), key=lambda s: (s.cx - pos.x) ** 2 + (s.cz - pos.z) ** 2, default=None)


def _spawn_assault(world: World) -> None:
    left = world.siege.needed - world.siege.slain
    world.push("event", "", event="siege", count=left, knights=left // 4)


def begin(world: World, s: Settlement, story: bool = False) -> None:
    time = STORY_TIME if story else TIME
    world.siege = Siege(settlement=s.id, due=world.clock + time, needed=min(MOST_ASSAULT, FIRST_ASSAULT + world.raid_level // 2), story=story)
    world.after(time, "siege_end")
    world.push("event", say(world, "event:siege", place=s.name), event="siege", count=0, knights=0)
    if _land_of(world) == (s.lx, s.lz):
        arrive(world)


def arrive(world: World) -> None:
    """The hero is here, so the assault is too. Coming back after running away brings back whoever is left."""
    siege = world.siege
    if not siege.begun:
        world.push("narration", say(world, "tell:siege_arrival", place=world.settlements[siege.settlement].name))
        world.mark("narration")
    siege.begun = True
    _spawn_assault(world)


def entered(world: World, lx: int, lz: int) -> None:
    if world.siege:
        s = world.settlements[world.siege.settlement]
        if (lx, lz) == (s.lx, s.lz):
            arrive(world)


def on_kill(world: World, kind: str) -> str | None:
    siege = world.siege
    if not siege or not siege.begun or kind not in ASSAULTERS:
        return None
    siege.slain += 1
    if siege.slain < siege.needed:
        return f"The assault: {siege.slain}/{siege.needed}"
    return _held(world)


def _held(world: World) -> str:
    siege, p = world.siege, world.player
    s = world.settlements[siege.settlement]
    pay = PAY + siege.needed * 10
    world.siege = None
    world.timers = [t for t in world.timers if t.kind != "siege_end"]
    p.gold += pay
    chronicle.fame(world, 4)
    chronicle.record(world, "siege_held", place=s.name)
    faith.earn(world, WORTH)
    if siege.story:
        world.story.flags["capital_held"] = True
    world.push("narration", say(world, "tell:capital_held" if siege.story else "tell:siege_held", place=s.name))
    world.mark("narration")
    return f"{s.name} holds! +{pay} {world.currency}"


def expired(world: World) -> None:
    """Nobody came. What it costs is real: people die, and their posts stand empty until someone takes them up."""
    siege = world.siege
    if not siege:
        return
    s = world.settlements[siege.settlement]
    world.siege = None
    living = [r for r in s.residents if not r.dead and not r.notable]
    for r in random.sample(living, min(DEAD_WHEN_LOST, len(living))):
        r.dead = True
        world.after(delay_for(r), "successor", settlement=s.id, resident=r.id)
    s.version += 1
    world.push("settlement", "", id=s.id, version=s.version)
    world.war_pressure += WAR_WHEN_LOST
    chronicle.record(world, "siege_lost", place=s.name)
    if siege.story:
        world.story.flags["capital_fell"] = True
    world.push("narration", say(world, "tell:capital_fell" if siege.story else "tell:siege_lost", place=s.name))
    world.mark("narration")

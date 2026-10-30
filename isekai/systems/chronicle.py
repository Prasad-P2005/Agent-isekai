"""What the world remembers: the hero's standing, and the deeds people pass on to each other."""
from __future__ import annotations

from ..content import WORLD
from ..core.state import Deed, Settlement, World

GOSSIP_PACE = 25.0  # seconds of game time for news to cross one land
KEPT = 40
STANDINGS = ((60, "legend"), (30, "famous"), (10, "known"), (-9, "stranger"), (-29, "infamous"))


def fame(world: World, change: int) -> None:
    world.player.renown += change


def standing(world: World) -> str:
    renown = world.player.renown
    return next((name for floor, name in STANDINGS if renown >= floor), "feared")


def record(world: World, kind: str, **blanks) -> None:
    pos = world.player.pos
    land = WORLD["land"]
    world.chronicle.append(Deed(kind=kind, lx=int(pos.x // land) if pos else 0, lz=int(pos.z // land) if pos else 0, at=world.clock,
                                blanks={k: str(v) for k, v in blanks.items()}))
    del world.chronicle[:-KEPT]


def known_at(world: World, s: Settlement | None) -> list[Deed]:
    """The deeds that have reached this settlement, newest first. Away from settlements, news has reached everyone."""
    def arrived(d: Deed) -> bool:
        return s is None or world.clock - d.at >= (abs(d.lx - s.lx) + abs(d.lz - s.lz)) * GOSSIP_PACE
    return [d for d in reversed(world.chronicle) if arrived(d)]

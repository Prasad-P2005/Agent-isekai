"""Where every building of a settlement stands. Shared by terrain generation (client) and NPC schedules (server)."""
from __future__ import annotations

import math

from ..core.state import Building, Settlement


def _r(v: float) -> int:
    return math.floor(v + 0.5)


def make_layout(s: Settlement) -> list[Building]:
    out: list[Building] = []

    def add(kind: str, ox: int, oz: int) -> None:
        door = ("w" if ox > 0 else "e") if abs(ox) > abs(oz) else ("n" if oz > 0 else "s")
        out.append(Building(kind=kind, x=s.cx + ox, z=s.cz + oz, door=door))

    def ring(kind: str, n: int, radius: float, offset: float = 0.0, special: dict[int, str] | None = None) -> None:
        for i in range(n):
            a = i / n * math.tau + offset
            add((special or {}).get(i, kind), _r(math.cos(a) * radius), _r(math.sin(a) * radius))

    if s.type == "human":
        add("well", 0, 0); add("guild", 0, -13); add("hospital", 13, 0); add("inn", 0, 13)
        add("smithy", -13, 0); add("church", 13, -14); add("stall", -6, 6); add("stall", 6, 6)
        ring("house", 8, 23, math.pi / 8)
    elif s.type == "city":
        add("keep", 0, 0); add("guild", 0, -13); add("hospital", 13, 0); add("inn", 0, 13); add("church", -13, 0)
        add("smithy", -13, -13)
        for ox, oz in ((7, 7), (-7, 7), (7, -7), (-7, -7)):
            add("stall", ox, oz)
        # A broad residential quarter surrounds the civic and market center.
        ring("house", 16, 21, math.radians(10))
        ring("house", 24, 25, math.radians(6))
        # Peddlers and traveling traders work beyond the city gates.
        ring("street_stall", 4, 31)
    elif s.type == "elfcity":
        # the elven capital: a palace in the World Tree, the same institutions as a human city, built the elven way
        add("palace", 0, 0); add("guild", 0, -13); add("elfhall", 13, 0); add("inn", 0, 13); add("church", -13, 0)
        for ox, oz in ((8, 8), (-8, 8), (8, -8), (-8, -8)):
            add("stall", ox, oz)
        ring("treehouse", 4, 22, math.pi / 4)
    elif s.type == "elf":
        add("shrine", 0, 0); add("elfhall", 0, -14); add("stall", 6, 7)
        ring("treehouse", 6, 20)
    else:
        add("chief", 0, 0); add("lodge", 14, 0); add("smithy", -14, 0); add("stall", 0, 12)
        ring("hut", 6, 20, math.pi / 6)
    return out

"""Where every building of a settlement stands, and the streets that reach them. Shared by terrain generation (client)
and NPC schedules (server). A town grows as a real one does: the streets come first, then each building takes the nearest
free lot facing one, so the same town keeps the same plan on every load."""
from __future__ import annotations

import math
import random

from ..content import WORLD
from ..core.state import Building, Settlement

SIZE = {kind: tuple(half) for kind, half in WORLD["buildings"].items()}  # half width, half depth
TOWNS = WORLD["towns"]
STRIP = 2  # open ground between a street and the walls that face it, where the lamps stand
DIRS = ((0, -1), (1, 0), (0, 1), (-1, 0))


def _r(v: float) -> int:
    return math.floor(v + 0.5)


def _facing_middle(x: int, z: int) -> str:
    return ("w" if x > 0 else "e") if abs(x) > abs(z) else ("n" if z > 0 else "s")


class Plan:
    """A town being laid out, in blocks from its centre."""

    def __init__(self, s: Settlement):
        self.s, self.rng = s, random.Random(f"{s.type}/{s.id}")
        self.reach, self.wall = TOWNS[s.type]["reach"], TOWNS[s.type].get("wall")
        self.buildings: list[Building] = []
        self.streets: list[list[int]] = []
        self.lanes: list[tuple[int, int, int, int, int]] = []
        self.used: set[tuple[int, int]] = set()

    def _claim(self, x0: int, z0: int, x1: int, z1: int) -> None:
        self.used.update((x, z) for x in range(x0, x1 + 1) for z in range(z0, z1 + 1))

    def street(self, ax: int, az: int, bx: int, bz: int, width: int = 1) -> None:
        """`width` is how many blocks the street runs to either side of its middle."""
        self.streets.append([self.s.cx + ax, self.s.cz + az, self.s.cx + bx, self.s.cz + bz, width])
        self.lanes.append((ax, az, bx, bz, width))
        steps = max(abs(bx - ax), abs(bz - az), 1)
        for i in range(steps + 1):
            x, z = ax + (bx - ax) * i // steps, az + (bz - az) * i // steps
            self._claim(x - width, z - width, x + width, z + width)

    def square(self, x: int, z: int, half: int) -> None:
        self.street(x - half, z, x + half, z, half)

    def arm(self, dx: int, dz: int, start: int, end: int, width: int = 1, bend: int = 0) -> None:
        """A street heading out from the middle of town. One bend keeps it from running dead straight."""
        jog = self.rng.randint(-bend, bend) if bend else 0
        if not jog:
            self.street(dx * start, dz * start, dx * end, dz * end, width)
            return
        turn = self.rng.randint(start + 6, end - 8)
        px, pz = -dz * jog, dx * jog
        self.street(dx * start, dz * start, dx * turn, dz * turn, width)
        self.street(dx * turn, dz * turn, dx * turn + px, dz * turn + pz, width)
        self.street(dx * turn + px, dz * turn + pz, dx * end + px, dz * end + pz, width)

    def branch(self, count: int, length: int) -> None:
        """Side lanes off the straight stretches."""
        straight = [l for l in self.lanes if (l[0] == l[2]) != (l[1] == l[3]) and abs(l[2] - l[0]) + abs(l[3] - l[1]) >= 12]
        for _ in range(count):
            ax, az, bx, bz, _width = self.rng.choice(straight)
            at, side = self.rng.uniform(0.3, 0.9), self.rng.choice((-1, 1))
            x, z = _r(ax + (bx - ax) * at), _r(az + (bz - az) * at)
            ex, ez = (x, z + side * length) if az == bz else (x + side * length, z)
            if math.hypot(ex, ez) < self.reach:
                self.street(x, z, ex, ez, 0)

    def fits(self, kind: str, x: int, z: int, margin: int, limit: float) -> bool:
        hw, hd = SIZE[kind]
        if math.hypot(abs(x) + hw, abs(z) + hd) > limit:
            return False
        return not any((a, b) in self.used for a in range(x - hw - margin, x + hw + margin + 1) for b in range(z - hd - margin, z + hd + margin + 1))

    def raw(self, kind: str, x: int, z: int, door: str = "s") -> None:
        """A building whose spot was chosen by hand, which nothing else may then take."""
        hw, hd = SIZE[kind]
        self.buildings.append(Building(kind=kind, x=self.s.cx + x, z=self.s.cz + z, door=door))
        self._claim(x - hw, z - hd, x + hw, z + hd)

    def put(self, kind: str, x: int, z: int, door: str, margin: int = 1, limit: float | None = None) -> bool:
        if not self.fits(kind, x, z, margin, limit or (self.wall - 3 if self.wall else self.reach)):
            return False
        self.raw(kind, x, z, door)
        return True

    def lots(self, kind: str, strip: int):
        """Every spot along a street where `kind` could stand with its door to the road."""
        hw, hd = SIZE[kind]
        for ax, az, bx, bz, width in self.lanes:
            if az == bz:
                for x in range(min(ax, bx), max(ax, bx) + 1, 2):
                    yield x, az + width + strip + hd + 1, "n"
                    yield x, az - width - strip - hd - 1, "s"
            elif ax == bx:
                for z in range(min(az, bz), max(az, bz) + 1, 2):
                    yield ax + width + strip + hw + 1, z, "w"
                    yield ax - width - strip - hw - 1, z, "e"

    def build(self, kind: str, count: int = 1, jitter: float = 3.0, margin: int = 1, strip: int = STRIP) -> int:
        """Takes the nearest lots, a little out of order: `jitter` is how many blocks of distance a lot may lose to chance."""
        placed = 0
        for x, z, door in sorted(self.lots(kind, strip), key=lambda lot: math.hypot(lot[0], lot[1]) + self.rng.random() * jitter):
            if placed == count:
                break
            placed += self.put(kind, x, z, door, margin)
        return placed

    def ring(self, kind: str, count: int, radius: float, offset: float = 0.0) -> None:
        for i in range(count):
            a = i / count * math.tau + offset
            x, z = _r(math.cos(a) * radius), _r(math.sin(a) * radius)
            self.put(kind, x, z, _facing_middle(x, z))

    def scatter(self, kind: str, count: int, near: float, far: float, margin: int = 2) -> None:
        """Out past the houses, at no particular angle."""
        for _ in range(count * 16):
            if not count:
                return
            a, d = self.rng.random() * math.tau, self.rng.uniform(near, far)
            x, z = _r(math.cos(a) * d), _r(math.sin(a) * d)
            count -= self.put(kind, x, z, _facing_middle(x, z), margin, far + 8)


def _human(p: Plan) -> None:
    p.raw("well", 0, 0)
    p.raw("stall", -4, 4)
    p.raw("stall", 4, 4)
    p.square(0, 0, 6)
    for dx, dz in DIRS:
        p.arm(dx, dz, 7, p.reach - 1, 1, 4)
    p.branch(5, 15)
    for kind in ("guild", "inn", "hospital", "smithy", "church"):
        p.build(kind)
    p.build("house", 18, 14, 2)
    p.scatter("farm", 5, 30, p.reach + 4)
    p.scatter("barn", 1, 28, p.reach + 2)
    p.scatter("windmill", 1, 30, p.reach + 4)


def _city(p: Plan) -> None:
    edge = p.wall + 3
    p.raw("keep", 0, 0)
    p.square(0, 0, 17)
    p.raw("fountain", 27, -27)
    for x in (23, 31):
        for z in (-32, -22):
            p.raw("stall", x, z)
    p.square(27, -27, 7)
    for dx, dz in DIRS:
        p.arm(dx, dz, 17, p.reach, 2)
    for at in (-38, 38):
        p.street(-38, at, 38, at)
        p.street(at, -38, at, 38)
    for at in (-27, 27):
        p.street(-37, at, 37, at, 0)
        p.street(at, -37, at, 37, 0)
    for kind in ("guild", "hospital", "inn", "church", "smithy"):
        p.build(kind, jitter=1, strip=1)
    p.build("house", 40, 2, 0, 1)  # a broad residential quarter, wall to wall
    for x, z in ((-4, -edge), (edge, -4), (4, edge), (-edge, 4)):  # peddlers work just outside the gates
        p.raw("street_stall", x, z)
    for x in (-52, 52):
        for z in (-52, 52):
            p.raw("farm", x, z, _facing_middle(x, z))


def _elfcity(p: Plan) -> None:
    # the elven capital: a palace in the World Tree, the same institutions as a human city, built the elven way
    p.raw("palace", 0, 0)
    p.square(0, 0, 9)
    for dx, dz in DIRS:
        p.arm(dx, dz, 10, p.reach, 1, 3)
    p.branch(4, 12)
    for kind in ("guild", "elfhall", "inn", "church"):
        p.build(kind)
    p.build("stall", 4, 2)
    p.ring("treehouse", 8, 35, math.pi / 8)


def _elf(p: Plan) -> None:
    p.raw("shrine", 0, 0)
    for dx, dz in DIRS:
        p.arm(dx, dz, 8, p.reach - 2, 0, 3)
    p.build("elfhall")
    p.build("stall")
    p.ring("treehouse", 8, 29, math.pi / 8)  # between the streets, never across them


def _beast(p: Plan) -> None:
    p.raw("chief", 0, 0)
    for dx, dz in DIRS:
        p.arm(dx, dz, 6, p.reach, 0)
    p.build("lodge", jitter=0)
    p.build("smithy", jitter=0)
    p.build("stall", jitter=0)
    p.ring("hut", 8, 28, math.pi / 8)


TOWN_PLANS = {"human": _human, "city": _city, "elfcity": _elfcity, "elf": _elf, "beast": _beast}


def make_layout(s: Settlement) -> tuple[list[Building], list[list[int]]]:
    """The buildings of a town, and its streets as [from x, from z, to x, to z, width]."""
    plan = Plan(s)
    TOWN_PLANS[s.type](plan)
    return plan.buildings, plan.streets

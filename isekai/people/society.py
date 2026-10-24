"""Deterministic settlement roles, districts, and migration for older world saves."""
from __future__ import annotations

from ..state import World
from ..world.layouts import make_layout
from ..world.map import LAND
from .jobs import POPULATION
from .roster import rebalance_roster


def _move_port_village(world: World) -> None:
    """Move the southeast human village to the coast, keeping its identity and resident IDs."""
    village = next((s for s in world.settlements if s.type == "human" and (s.lx, s.lz) == (2, 5)), None)
    destination = world.land_at(1, 5)
    source = world.land_at(2, 5)
    if not village or not destination or not source or destination.settlement is not None:
        return
    source.settlement, source.structure = None, "none"
    destination.settlement, destination.structure = village.id, "village"
    village.lx, village.lz = 1, 5
    village.cx, village.cz = LAND + LAND // 2, 5 * LAND + LAND // 2


def _coastline(world: World) -> None:
    directions = ((0, -1, "north"), (1, 0, "east"), (0, 1, "south"), (-1, 0, "west"))
    for settlement in world.settlements:
        settlement.coastal = False
        settlement.shore_direction = None
        for dx, dz, direction in directions:
            neighbor = world.land_at(settlement.lx + dx, settlement.lz + dz)
            if neighbor and neighbor.realm == "ocean":
                settlement.coastal = True
                settlement.shore_direction = direction
                break


def _clear_initial_spawn(world: World) -> None:
    """Keep the first-person camera clear of the nearest village's outdoor workers."""
    capital = world.capital()
    village = min(world.settlements_of("human"), key=lambda s: (s.cx - capital.cx) ** 2 + (s.cz - capital.cz) ** 2)
    if (world.spawn.x - village.cx) ** 2 + (world.spawn.z - village.cz) ** 2 < 33**2:
        world.spawn.x, world.spawn.z = village.cx + 5.5, village.cz + 35.5


def migrate_world_society(world: World) -> bool:
    """Upgrade one saved world once while preserving story-critical residents and world progress."""
    if world.society_version >= 4:
        return False
    _move_port_village(world)
    _coastline(world)
    _clear_initial_spawn(world)
    for settlement in world.settlements:
        settlement.layout = make_layout(settlement)
        target = POPULATION[settlement.type][2] if settlement.type == "city" else len(settlement.residents)
        rebalance_roster(settlement, world.seed, target)
    world.society_version = 4
    return True

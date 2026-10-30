"""Upgrades for saves written by older versions of the game. Add a step to STEPS and every save catches up on load."""
from __future__ import annotations

from ..core.state import World
from ..systems.people.jobs import POPULATION
from ..systems.people.roster import rebalance_roster, rehome
from ..systems.people.succession import NEWCOMER_DELAY, SUCCESSOR_DELAY
from ..systems.story import BEATS, advance
from ..world.genesis import first_spawn
from ..world.layouts import make_layout
from ..world.map import LAND


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


def _to_4(world: World) -> None:
    """Districts and livelihoods, keeping story-critical residents and world progress."""
    _move_port_village(world)
    _coastline(world)
    _clear_initial_spawn(world)
    for settlement in world.settlements:
        settlement.layout, settlement.streets = make_layout(settlement)
        target = POPULATION[settlement.type][2] if settlement.type == "city" else len(settlement.residents)
        rebalance_roster(settlement, world.seed, target)


def _replace_the_lost_dead(world: World) -> None:
    """Replacements used to wait in memory, so a restart could lose them for good. Queue any that went missing."""
    for s in world.settlements:
        living = {r.job for r in s.residents if not r.dead}
        for r in s.residents:
            if r.dead and r.service and r.job not in living:
                living.add(r.job)
                world.after(SUCCESSOR_DELAY, "successor", settlement=s.id, resident=r.id)


def _to_5(world: World) -> None:
    """City houses no longer overlap, and schedules moved from wall-clock time to the game clock."""
    for s in world.settlements_of("city"):
        s.layout, s.streets = make_layout(s)
        rehome(s, world.seed)
    world.cooldowns.clear()
    world.festival_until = 0
    _replace_the_lost_dead(world)


def _to_6(world: World) -> None:
    """The story became chapters and oaths, curses became reversible, and everyone who dies is now replaced."""
    f, p = world.story.flags, world.player
    f["oath_elves"] = f.pop("elf_trust", False)
    f["oath_tribes"] = f.pop("beast_trust", False)
    won = f.pop("victory", False)
    if world.demon_lord_dead:  # an old hero who already won keeps that win
        f.update(met_king=True, oath_crown=True, oath_elves=True, oath_tribes=True, oath_sea=True, read_note=True, god_confessed=True, law_amended=True, lord_slain=True)
        p.oathbound = True
        if won:
            world.ending, f["ended"] = "hero", True
        else:
            p.has_crown = True
    world.story.stage = 0
    advance(world)
    p.loot.pop("Demon Lord's Crown", None)
    p.cursed_hp = max(0, 20 - p.max_hp)
    world.war_pressure = min(0.3, world.raid_level * 0.02)
    for s in world.settlements:
        for r in s.residents:
            if r.dead and not r.service:
                world.after(NEWCOMER_DELAY, "successor", settlement=s.id, resident=r.id)


def _to_7(world: World) -> None:
    """The Elder Tree now gives mana, so anyone who has already sworn the Oath of the Elves is owed it."""
    if world.story.flags.get("oath_elves"):
        world.player.max_mana += BEATS["elf_oath"]["max_mana"]


def _to_8(world: World) -> None:
    """Lands doubled in width and towns were replanned around streets, so everything with a position moves. Progress,
    people and the bag all carry over. Blocks the player placed go: the ground they stood on no longer exists."""
    for s in world.settlements:
        s.cx, s.cz = s.lx * LAND + LAND // 2, s.lz * LAND + LAND // 2
        s.layout, s.streets = make_layout(s)
        rehome(s, world.seed)
    world.block_edits.clear()
    world.player.pos = None  # wakes at the spawn: wherever they stood may now be inside a hill
    world.spawn = first_spawn(world)


STEPS = {4: _to_4, 5: _to_5, 6: _to_6, 7: _to_7, 8: _to_8}
CURRENT_VERSION = max(STEPS)


def migrate(world: World) -> bool:
    """Bring a saved world up to date. Returns whether anything changed."""
    pending = [version for version in sorted(STEPS) if world.save_version < version]
    for version in pending:
        STEPS[version](world)
        world.save_version = version
    return bool(pending)

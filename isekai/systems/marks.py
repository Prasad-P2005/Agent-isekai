"""Where the things the hero is after are, for the compass and the maps. Marks with the same id are alternatives: any one will do,
so the client points at the nearest. A mark without x and z is a hunt, which the client places on the prey once it is about."""
from __future__ import annotations

from ..content import CREATURES, STORY, WORLD
from ..core.state import Resident, World
from .lines import fill
from .story import SPEAKERS, wanted

LAND = WORLD["land"]
ID_BASE = WORLD["resident_id_base"]
PLACES = STORY["places"]
GUILD_JOB = "guild_master"  # one to a guild


def _person(id_: str, sort: str, r: Resident, label: str) -> dict:
    return {"id": id_, "sort": sort, "label": label, "x": r.work.x, "z": r.work.z, "person": r.id}


def _hunt(creature: str) -> dict:
    return {"id": f"hunt:{creature}", "sort": "hunt", "label": CREATURES[creature]["label"], "creature": creature}


def _landmarks(world: World, place: str) -> list[dict]:
    spec, label = PLACES[place], fill(world, PLACES[place]["label"])
    return [{"id": place, "sort": "story", "label": label, "x": (lx + 0.5) * LAND, "z": (lz + 0.5) * LAND, "creature": spec.get("creature")}
            for lz, row in enumerate(world.lands) for lx, land in enumerate(row) if land.structure == spec["structure"]]


def _at(world: World, place: str) -> list[dict]:
    if place == "echo":  # any stone will do, so the compass takes the nearest unread
        return [{"id": "echo", "sort": "story", "label": "A worn stone", "x": e.x, "z": e.z} for i, e in enumerate(world.echoes) if not world.story.flags.get(f"echo_{i}")]
    if place in PLACES:
        return _landmarks(world, place)
    if place == "guild":
        return [_person(place, "story", r, f"The guild in {s.name}") for s in world.settlements for r in s.residents if r.job == GUILD_JOB]
    return [_person(place, "story", r, f"{r.label} {r.name}") for s in world.settlements for r in s.residents if SPEAKERS.get(r.job) == place]


def _resident(world: World, id_: str, sort: str, resident: int, label: str) -> list[dict]:
    r = next((r for r in world.settlements[resident // ID_BASE].residents if r.id == resident), None)
    return [_person(id_, sort, r, label)] if r else []


def _guild(world: World) -> list[dict]:
    q = world.player.active_quest
    if not q:
        return []
    if q.progress < q.count:
        return [_hunt(q.kind)]
    return [_person("turn_in", "guild", r, f"Turn in at {s.name}") for s in world.settlements if s.id == q.settlement for r in s.residents if r.job == GUILD_JOB]


def _favor(world: World) -> list[dict]:
    f = world.player.favor
    if not f:
        return []
    if f.kind == "deliver":
        return _resident(world, "favor", "favor", int(f.target), f"Letter for {f.target_name}")
    if f.kind == "visit" and not f.progress:
        lx, lz = map(int, f.target.split(","))
        return [{"id": "favor", "sort": "favor", "label": f.target_name, "x": (lx + 0.5) * LAND, "z": (lz + 0.5) * LAND}]
    if f.kind == "hunt" and f.progress < f.count:
        return [_hunt(f.target)]
    return _resident(world, "favor", "favor", f.giver, f.giver_name)


def _omens(world: World) -> list[dict]:
    """What the world has just done, which will not wait."""
    out = []
    if world.siege:
        s = world.settlements[world.siege.settlement]
        out.append({"id": "siege", "sort": "story", "label": f"Defend {s.name}", "x": s.cx, "z": s.cz})
    if world.star:
        out.append({"id": "star", "sort": "story", "label": "A fallen star", "x": world.star.x, "z": world.star.z})
    return out


def quest_marks(world: World) -> list[dict]:
    """Everything the hero is after right now: the story, the guild quest and the favor."""
    story = [m for rule in wanted(world) for m in ([_hunt(rule["hunt"])] if "hunt" in rule else _at(world, rule["at"]))]
    return story + _guild(world) + _favor(world) + _omens(world)

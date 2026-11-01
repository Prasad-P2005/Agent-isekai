"""Favors: small errands anyone can ask of the hero. Each person has one in mind at a time, and it changes as time passes."""
from __future__ import annotations

import random

from ..content import BLOCK_NAMES, CREATURES, FAVORS
from ..core.state import Favor, Resident, Settlement, World
from . import chronicle, faith
from .edicts import rule
from .lines import say

FRESH_EVERY = 900  # seconds of play before someone has a new favor in mind
FAVOR_WORTH = 15


def offer(world: World, s: Settlement, who: Resident) -> Favor:
    """What this person would ask right now. Always the same answer until they think of something new."""
    rng = random.Random(f"{world.seed}:{who.id}:{int(world.clock // FRESH_EVERY)}")
    kind = rng.choice(("fetch", "fetch", "hunt", "hunt", "deliver", "visit"))
    base = {"giver": who.id, "giver_name": who.name, "settlement": s.id}
    if kind == "fetch":
        spec = rng.choice(FAVORS["fetch"])
        count = rng.randint(*spec["count"])
        name = BLOCK_NAMES[spec["block"]]
        return Favor(kind=kind, target=str(spec["block"]), target_name=name, count=count, reward=count * spec["pay"],
                     summary=f"Bring {count} {name} to {who.name} in {s.name}", **base)
    if kind == "hunt":
        spec = rng.choice(FAVORS["hunt"])
        count = rng.randint(*spec["count"])
        name = CREATURES[spec["kind"]]["label"]
        return Favor(kind=kind, target=spec["kind"], target_name=name, count=count, reward=count * spec["pay"],
                     summary=f"Slay {count} {name} for {who.name} in {s.name}", **base)
    other = rng.choice([o for o in world.settlements if o.id != s.id])
    if kind == "deliver":
        person = rng.choice([r for r in other.residents if r.service and not r.dead] or [next(r for r in other.residents if not r.dead)])
        return Favor(kind=kind, target=str(person.id), target_name=f"{person.name} in {other.name}", reward=FAVORS["deliver_pay"],
                     summary=f"Carry {who.name}'s letter to {person.name} in {other.name}", **base)
    return Favor(kind=kind, target=f"{other.lx},{other.lz}", target_name=other.name, reward=FAVORS["visit_pay"],
                 summary=f"Go to {other.name} and bring word back to {who.name} in {s.name}", **base)


def _blanks(f: Favor) -> dict:
    return {"thing": f.target_name, "count": f.count, "pay": f.reward, "giver": f.giver_name, "target": f.target_name, "summary": f.summary}


def pitch(world: World, favor: Favor) -> str:
    return say(world, f"favor:{favor.kind}", **_blanks(favor))


def on_kill(world: World, kind: str) -> str | None:
    f = world.player.favor
    if f and f.kind == "hunt" and f.target == kind and f.progress < f.count:
        f.progress += 1
        return f"Favor: {f.progress}/{f.count} {f.target_name}"
    return None


def on_enter(world: World, lx: int, lz: int) -> str | None:
    f = world.player.favor
    if f and f.kind == "visit" and f.target == f"{lx},{lz}" and not f.progress:
        f.progress = 1
        return f"You have seen {f.target_name}. {f.giver_name} is waiting to hear about it."
    return None


def can_finish(world: World, who: Resident | None) -> bool:
    f = world.player.favor
    if not f or not who:
        return False
    if f.kind == "deliver":
        return f.target == str(who.id)
    if f.giver != who.id:
        return False
    return world.player.blocks.get(f.target, 0) >= f.count if f.kind == "fetch" else f.progress >= f.count


def finish(world: World) -> tuple[str, dict]:
    p, f = world.player, world.player.favor
    fx: dict = {}
    if f.kind == "fetch":
        p.blocks[f.target] -= f.count
        fx["take_blocks"] = {f.target: f.count}
    p.gold += round(f.reward * rule(world, "bounty"))
    p.favors_done += 1
    p.favor = None
    chronicle.fame(world, 1)
    faith.earn(world, FAVOR_WORTH)
    chronicle.record(world, "favor", giver=f.giver_name)
    return say(world, f"favor:{'delivered' if f.kind == 'deliver' else 'thanks'}", **_blanks(f)), fx


def still_waiting(world: World) -> str:
    return say(world, "favor:waiting", **_blanks(world.player.favor))

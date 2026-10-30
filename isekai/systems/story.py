"""The main storyline. The chapters and every story conversation are data (content/story.json):
each beat says who speaks it, what it needs, and what it changes. This module only reads those rules."""
from __future__ import annotations

import random

from ..content import STORY
from ..core.state import Resident, World
from . import chronicle
from .lines import fill

CHAPTERS = STORY["chapters"]
BEATS = STORY["beats"]
SCENES = STORY["scenes"]
OATHS = STORY["oaths"]
SPEAKERS = {"king": "king", "queen": "queen", "elf_king": "elf", "elf_queen": "elf", "elder": "elf", "chief": "chief"}
STAGE_RAIDS = 1  # the Demon Lord turns on the world once the hero has been named


def speaker_of(who: Resident | None, creature: str) -> str | None:
    if who:
        return SPEAKERS.get(who.job)
    return creature if creature in ("mermaid_queen", "cairn", "law_stone", "god") else None


def oaths_sworn(world: World) -> list[str]:
    return [o for o in OATHS if world.story.flags.get(o)]


def act(world: World) -> int:
    return CHAPTERS[world.story.stage]["act"]


def objective(world: World) -> str:
    chapter = CHAPTERS[world.story.stage]
    remaining = ", ".join(fill(world, spec["name"]) for o, spec in OATHS.items() if not world.story.flags.get(o))
    return fill(world, chapter["objective"], sworn=len(oaths_sworn(world)), remaining=remaining)


def oath_list(world: World) -> list[dict]:
    """Where each oath stands, for the journal: the furthest step reached is the one to show."""
    p, f, counts = world.player, world.story.flags, world.story.counts
    if not f.get("met_king"):  # the hero has not heard of the Oaths yet
        return []
    blanks = {"guild": min(2, p.guild_done), "crystals": min(3, p.blocks.get("16", 0)), "orcs": counts.get("orcs", 0)}
    out = []
    for oath, spec in OATHS.items():
        step = next(text for flag, text in reversed(spec["steps"]) if flag is None or f.get(flag))
        out.append({"name": fill(world, spec["name"]), "done": bool(f.get(oath)), "hint": fill(world, step, **blanks)})
    return out


def _met(world: World, needs: dict) -> bool:
    f, p, counts = world.story.flags, world.player, world.story.counts
    return (all(f.get(k) for k in needs.get("needs", []))
            and not any(f.get(k) for k in needs.get("not", []))
            and all(getattr(p, k) for k in needs.get("has", []))
            and not any(getattr(p, k) for k in needs.get("lacks", []))
            and (not needs.get("open_ending") or world.ending is None)
            and (not needs.get("all_oaths") or len(oaths_sworn(world)) == len(OATHS))
            and p.guild_done >= needs.get("guild_done", 0)
            and p.guild_done < needs.get("guild_below", p.guild_done + 1)
            and all(p.blocks.get(b, 0) >= n for b, n in needs.get("blocks", {}).items())
            and all(p.blocks.get(b, 0) < n for b, n in needs.get("blocks_below", {}).items())
            and all(counts.get(k, 0) >= n for k, n in needs.get("counts", {}).items())
            and all(counts.get(k, 0) < n for k, n in needs.get("counts_below", {}).items()))


def wanted(world: World) -> list[dict]:
    """The chapter's marks that stand right now, and those of each unsworn oath once the hero has heard of them."""
    f = world.story.flags
    rules = CHAPTERS[world.story.stage].get("marks", []) + [m for oath, spec in OATHS.items() if f.get("met_king") and not f.get(oath) for m in spec["marks"]]
    return [m for m in rules if _met(world, m)]


def offered(world: World, speaker: str | None) -> list[str]:
    """The story conversations this person can have right now."""
    return [beat for beat, spec in BEATS.items() if spec["speaker"] == speaker and _met(world, spec)]


def label(world: World, beat: str) -> str:
    return fill(world, BEATS[beat]["label"])


def play(world: World, beat: str, rng: random.Random | None = None) -> dict:
    """Speak a beat and apply what it changes. Returns its lines, any gift, and what the client must do."""
    spec, p, f = BEATS[beat], world.player, world.story.flags
    fx: dict = {}
    for flag in spec.get("sets", []):
        f[flag] = True
    for field, value in spec.get("player", {}).items():
        setattr(p, field, value)
    if "take" in spec:
        for block, n in spec["take"].items():
            p.blocks[block] = p.blocks.get(block, 0) - n
        fx["take_blocks"] = spec["take"]
    p.gold += spec.get("gold", 0)
    p.max_hp += spec.get("max_hp", 0)
    p.max_mana += spec.get("max_mana", 0)
    if "heal" in spec:
        fx["heal"] = spec["heal"]
    if (ability := spec.get("learn")) and ability not in p.abilities:
        p.abilities.append(ability)
    chronicle.fame(world, spec.get("renown", 0))
    if spec.get("deed"):
        chronicle.record(world, spec["deed"])
    if spec.get("ending"):
        _end(world, spec["ending"])
    return {"lines": [fill(world, line, rng) for line in spec["lines"]], "gift": fill(world, spec["gift"]) if spec.get("gift") else None, "fx": fx}


def _end(world: World, ending: str) -> None:
    """How the story's choice changes the world from here on."""
    world.ending = ending
    world.player.has_crown = False
    if ending == "broken":
        world.laws = []  # every Law falls silent, so people only have each other now
        _god_falls(world)


def _god_falls(world: World) -> None:
    """The god lands in the village nearest the hero's first steps, and has to learn how to be a person."""
    village = min(world.settlements_of("human"), key=lambda s: (s.cx - world.spawn.x) ** 2 + (s.cz - world.spawn.z) ** 2)
    someone = next(r for r in village.residents if not r.notable and not r.dead)
    someone.name, someone.role, someone.notable = world.god_name, "fallen_god", True
    village.version += 1
    world.push("settlement", "", id=village.id, version=village.version)


def on_kill(world: World, kind: str) -> str | None:
    """A trial may be counting this creature."""
    for trial in STORY["hunts"]:
        if trial["kind"] == kind and world.story.flags.get(trial["flag"]):
            done = world.story.counts.get(trial["count"], 0)
            if done < trial["needed"]:
                world.story.counts[trial["count"]] = done + 1
                return fill(world, trial["progress"], done=done + 1, needed=trial["needed"])
    return None


def scene_for(world: World, name: str) -> dict | None:
    """A scene plays once: it interrupts the world, so it has to earn that."""
    flag, spec = f"scene_{name}", SCENES[name]
    if world.story.flags.get(flag) or not _met(world, spec):
        return None
    world.story.flags[flag] = True
    return {"title": fill(world, spec.get("title", "")), "lines": [{"who": fill(world, who), "text": fill(world, text)} for who, text in spec["lines"]]}


def play_scene(world: World, name: str) -> None:
    if scene := scene_for(world, name):
        world.push("scene", scene["title"], lines=scene["lines"])


def advance(world: World) -> list[dict]:
    """Move through every finished chapter. Returns the chapters reached."""
    reached = []
    while world.story.stage < len(CHAPTERS) - 1 and _met(world, CHAPTERS[world.story.stage]["done"]):
        world.story.stage += 1
        reached.append(CHAPTERS[world.story.stage])
    return reached

"""Turning the line library into something said.

A pool is a list of lines in content/lines. `say` takes one nobody has heard lately, then fills it in:
#rule# is replaced by a random line from the pool `rule`, and {blank} by a fact about this world or this moment.
"""
from __future__ import annotations

import random
import re

from ..content import LINES, NAMES
from ..core.state import World

RULE = re.compile(r"#(\w+)#")
DEPTH = 6  # a rule can use other rules, this far down


class _Blanks(dict):
    def __missing__(self, key: str) -> str:
        return ""


def facts(world: World) -> dict[str, str]:
    """What any line may mention. Tests check that the lines ask for nothing else."""
    elf_city = world.settlements_of("elfcity")
    second = world.settlements_of("city")[1:]
    return {
        "world": world.name, "god": world.god_name, "godkind": world.god_is, "kingdom": world.kingdom, "king": world.king_name,
        "capital": world.capital().name, "second_city": second[0].name if second else "", "second_ruler": (second[0].ruler or "") if second else "",
        "elf_ruler": world.elf_ruler_name, "elf_title": "Elf Queen" if world.elf_ruler_title == "elf_queen" else "Elf King",
        "elf_capital": elf_city[0].name if elf_city else "", "beast_village": world.settlements_of("beast")[0].name,
        "demon_lord": world.demon_lord_name, "demon_realm": world.demon_realm_name, "currency": world.currency, "hero": world.hero,
        "old_hero": random.Random(world.seed).choice(NAMES["earth_names"]),  # who the Demon Lord was, before
    }


def expand(text: str, rng: random.Random) -> str:
    for _ in range(DEPTH):
        if "#" not in text:
            break
        text = RULE.sub(lambda m: rng.choice(LINES.get(m.group(1)) or [""]), text)
    return text


def fill(world: World, text: str, rng: random.Random | None = None, **blanks) -> str:
    return expand(text, rng or random).format_map(_Blanks(facts(world), **blanks))


def fresh(world: World, pool: str, rng: random.Random) -> str:
    """A line from a pool, leaving out the ones said lately. Nothing repeats until most of the pool has been heard."""
    lines = LINES.get(pool)
    if not lines:
        return ""
    recent = world.said.setdefault(pool, [])
    unheard = [i for i in range(len(lines)) if i not in recent] or list(range(len(lines)))
    choice = rng.choice(unheard)
    recent.append(choice)
    del recent[:-max(1, len(lines) * 3 // 4)]
    return lines[choice]


def say(world: World, pool: str, rng: random.Random | None = None, **blanks) -> str:
    rng = rng or random
    return fill(world, fresh(world, pool, rng), rng, **blanks)


def some_of(world: World, weighted: list[tuple[str, float]], rng: random.Random | None = None, **blanks) -> str:
    """Pick one of several pools by weight and say a line from it. Pools with nothing in them are skipped."""
    rng = rng or random
    usable = [(pool, weight) for pool, weight in weighted if LINES.get(pool)]
    if not usable:
        return ""
    pool = rng.choices([p for p, _ in usable], [w for _, w in usable])[0]
    return say(world, pool, rng, **blanks)

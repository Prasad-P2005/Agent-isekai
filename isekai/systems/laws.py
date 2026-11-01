"""The laws of the world, enforced here deterministically.

A crime only has consequences if a law covers it *where* it happened, and — for laws that need a witness —
only if someone saw it. Lawmen (guards, golems) punish on the spot; civilians run off to report it,
and the client only calls `report` if the witness survives long enough.
"""
from __future__ import annotations

import random

from ..content import LAWS
from ..core.state import Law, World
from . import chronicle, faith

CRIME_TEXT = LAWS["crimes"]
CRIMES = list(CRIME_TEXT)
SCOPE_REALM = LAWS["scopes"]  # scope -> the realm it covers, or None for scopes that do not depend on the realm
SCOPES = list(SCOPE_REALM)
PUNISHMENTS = LAWS["punishments"]
DEFAULT_LAWS = [Law(**law) for law in LAWS["default_laws"]]
LOCAL_LAWS = [Law(**law) for law in LAWS["local_laws"]]
RENOWN_LOST = 3


def law_text(l: Law) -> str:
    """Name, then what it covers, then what follows. The book splits a law at the arrow."""
    seen = "and someone saw" if l.needs_witness else "and the gods always see"
    return f"{l.name}: You {CRIME_TEXT[l.crime]} {LAWS['scope_words'][l.scope]}, {seen} -> {LAWS['punishment_words'][l.punishment]}"


def in_scope(law: Law, in_city: bool, realm: str) -> bool:
    if law.scope == "everywhere":
        return True
    if law.scope == "cities":
        return in_city
    return SCOPE_REALM.get(law.scope) == realm


def judge(world: World, crime: str, in_city: bool, realm: str, lawmen: list[str], civilians: list[str]) -> list[dict]:
    """Decide what happens for each law the crime breaks. Returns one result per law."""
    results = []
    for law in world.laws:
        if law.crime != crime or not in_scope(law, in_city, realm):
            continue
        if not law.needs_witness:
            results.append({"law": law.name, "outcome": "punished", "by": "the gods themselves", "effects": punish(world, law, "the gods themselves")})
        elif lawmen:
            results.append({"law": law.name, "outcome": "punished", "by": lawmen[0], "effects": punish(world, law, lawmen[0])})
        elif civilians:
            results.append({"law": law.name, "outcome": "witnessed", "by": civilians[0], "witnesses": civilians[:3]})
        else:
            results.append({"law": law.name, "outcome": "unseen"})
    return results


def find_law(world: World, name: str) -> Law | None:
    return next((l for l in world.laws if l.name == name), None)


def punish(world: World, law: Law, by: str) -> dict:
    """Apply a law's punishment to the player profile; return the effects the client must carry out."""
    p, sev = world.player, law.severity
    p.notoriety += 1
    chronicle.fame(world, -RENOWN_LOST)
    faith.lose(world, faith.SIN)
    fx: dict = {"wanted": 50 * sev, "spawn": []}
    if law.punishment == "golem_hunters":
        n = min(4, sev)
        fx["spawn"].append({"kind": "golem", "count": n})
        fx["text"] = f"{n} Iron Golem{'s were' if n > 1 else ' was'} awakened to hunt you"
    elif law.punishment == "guards":
        fx["spawn"].append({"kind": "knight", "count": 1 + sev, "angry": True})
        fx["text"] = f"{1 + sev} guards are coming for you"
    elif law.punishment == "bounty":
        p.bounty += 40 * sev
        fx["text"] = f"a bounty of {40 * sev} {world.currency} is on your head"
    elif law.punishment == "fine":
        fine = 30 * sev
        paid = min(p.gold, fine)
        p.gold -= paid
        p.bounty += fine - paid
        fx.update(wanted=0, text=f"you were fined {fine} {world.currency}")
    elif law.punishment == "exile":
        fx.update(wanted=0, exile=True, text="you were exiled to a distant land")
    elif law.punishment == "curse":
        if p.abilities:
            lost = random.choice(p.abilities)
            p.abilities.remove(lost)
            p.cursed_abilities.append(lost)
            fx["text"] = f"you were cursed and lost {lost.replace('_', ' ')}"
        else:
            taken = p.max_hp - max(10, p.max_hp - 4)
            p.max_hp -= taken
            p.cursed_hp += taken
            fx["text"] = "you were cursed: max health -4"
        fx["wanted"] = 0
    fx["law"], fx["by"] = law.name, by
    return fx

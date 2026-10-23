"""Laws are written by the god at genesis (or decreed later) and enforced here, deterministically.

A crime only has consequences if a law covers it *where* it happened, and — for laws that need a witness —
only if someone saw it. Lawmen (guards, golems) punish on the spot; civilians run off to report it,
and the client only calls `report` if the witness survives long enough.
"""
from __future__ import annotations

import random

from ..state import Law, World

CRIMES = ["kill_human", "kill_elf", "kill_beastkin", "kill_mermaid", "attack_civilian", "vandalism"]
SCOPES = ["everywhere", "cities", "human_kingdom", "elven_forest", "beastkin_savanna"]
PUNISHMENTS = ["golem_hunters", "guards", "bounty", "fine", "exile", "curse"]
SCOPE_REALM = {"human_kingdom": "human", "elven_forest": "elf", "beastkin_savanna": "beast"}
CRIME_TEXT = {"kill_human": "murdered a human", "kill_elf": "murdered an elf", "kill_beastkin": "murdered a beastkin",
              "kill_mermaid": "murdered a mermaid", "attack_civilian": "attacked a civilian", "vandalism": "vandalised a city"}

DEFAULT_LAWS = [
    Law(name="Law of the Crown", crime="kill_human", scope="everywhere", needs_witness=True, punishment="golem_hunters", severity=3),
    Law(name="Peace of the Market", crime="attack_civilian", scope="cities", needs_witness=True, punishment="guards", severity=2),
    Law(name="Pact of the Elder Trees", crime="kill_elf", scope="everywhere", needs_witness=False, punishment="curse", severity=2),
    Law(name="Blood Price of the Tribes", crime="kill_beastkin", scope="everywhere", needs_witness=True, punishment="bounty", severity=2),
    Law(name="City Stones", crime="vandalism", scope="cities", needs_witness=True, punishment="fine", severity=1),
]


def validate_law(raw: dict | Law | None) -> Law | None:
    if raw is None:
        return None
    d = raw.model_dump() if isinstance(raw, Law) else dict(raw)
    if d.get("crime") not in CRIMES:
        return None
    sev = d.get("severity")
    return Law(name=str(d.get("name") or "Unnamed Law")[:40], crime=d["crime"],
               scope=d.get("scope") if d.get("scope") in SCOPES else "everywhere",
               needs_witness=d.get("needs_witness") is not False,
               punishment=d.get("punishment") if d.get("punishment") in PUNISHMENTS else "bounty",
               severity=max(1, min(4, int(sev))) if isinstance(sev, (int, float)) else 2)


def law_text(l: Law) -> str:
    return (f"{l.name}: {l.crime.replace('_', ' ')} ({l.scope}) -> {l.punishment.replace('_', ' ')}"
            f"{', only if witnessed' if l.needs_witness else ', the gods see all'}")


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
            fx["text"] = f"you were cursed and lost {lost.replace('_', ' ')}"
        else:
            p.max_hp = max(10, p.max_hp - 4)
            fx["text"] = "you were cursed: max health -4"
        fx["wanted"] = 0
    fx["law"], fx["by"] = law.name, by
    return fx

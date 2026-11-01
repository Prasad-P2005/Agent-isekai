"""The Laws the god writes for the hero. She cannot touch the world, so this is the whole of her power: she says a Law out loud and the world enforces it,
and every Law has a second line, which is the price. The hero chooses what to ask for, so choosing a price is choosing how hard the world is.

Everything a Law does is a multiplier called a rule. `effects` works them out and they go to the client with the state, and each rule bends in the one place it is
decided. Laws last until a newer one crowds them out, because the world can only hold a few of hers.

Which Laws she offers is a deal of three, and each card comes from a different place:

    what you do    a sign is drawn from `Player.deeds`, so the more someone digs the more she thinks about digging, and a Law of that sign is drawn from what is left
    how you are    `moods` reads the moment (hurt, broke, wanted, night, war) and draws from the Laws written for it
    pure chance    a tier is rolled and any Law of it is taken, whatever the hero has been doing. The longer nothing rare has come, the better those odds get

Within the first two a Law's weight is its tier, how much of the hero's deeds its sign holds, how many moods it answers, whether it deepens or sits beside a Law in force,
and how lately it was shown. Each card in a hand has a different sign where it can, a card can be written in gold or in red, and a Law Stone adds a fourth card. The hand is
kept in `Player.deal` until a Law is written, so that closing the book and coming back cannot change it, and the hero may ask for other words once for each Law."""
from __future__ import annotations

import random

from ..content import EDICTS, WORLD
from ..core.state import Edict, World
from . import chronicle
from .lines import fill

LAWS, TIERS, INKS, WHY, CHANCE, PULL = (EDICTS[k] for k in ("laws", "tiers", "inks", "why", "chance", "pull"))
MOST, OFFERED = EDICTS["most"], EDICTS["offered"]  # more than three on offer and choosing stops being a pleasure
BEST_RANK = 3
GROWTH = 0.5  # how much of a Law's gift each deepening adds
SOFTENED = 0.5  # how much of a second line is left once the hero has forgiven her
BLOOD_MOON = {"monster_cap": 2.0, "monster_power": 1.4, "faith": 2.0}
HURT_BELOW, FELL_WITHIN, CRUISING_FROM = 0.5, 300.0, 3
POOR_BELOW, RICH_FROM = 40, 500
NIGHT = (0.5, 1.0)  # of the day


def _ink(ink: str, part: str) -> float:
    return INKS[ink][part] if ink else 1


def _gift(value: float, rank: int, ink: str = "") -> float:
    return max(0.0, 1 + (value - 1) * _ink(ink, "gift") * (1 + GROWTH * (rank - 1)))


def _price(world: World, value: float, ink: str = "") -> float:
    cost = 1 + (value - 1) * _ink(ink, "price")
    return max(0.05, 1 + (cost - 1) * SOFTENED if world.story.flags.get("forgave") else cost)


def effects(world: World) -> dict[str, float]:
    """Every rule that is not 1, multiplied together. Once the fifth line is written, second lines ask for nothing."""
    out: dict[str, float] = {}

    def times(key: str, value: float) -> None:
        out[key] = out.get(key, 1.0) * value

    for key, value in WORLD["difficulty"].get(world.difficulty, {}).get("rules", {}).items():  # how hard the world was made, which no Law can undo
        times(key, value)
    for edict in world.edicts:
        spec = LAWS[edict.id]
        for key, value in spec["gifts"].items():
            times(key, _gift(value, edict.rank, edict.ink))
        if world.ending != "named":
            for key, value in spec["costs"].items():
                times(key, _price(world, value, edict.ink))
    if world.blood_moon:
        for key, value in BLOOD_MOON.items():
            times(key, value)
    return out


def rule(world: World, key: str) -> float:
    return effects(world).get(key, 1.0)


def for_client(world: World) -> dict:
    return {**effects(world), "silent": world.ending == "broken", "omen": "blood_moon" if world.blood_moon else ""}


def can_ask(world: World) -> bool:
    return world.player.petitions > 0 and world.ending != "broken"


def _rank_of(world: World, law: str) -> int:
    return next((e.rank for e in world.edicts if e.id == law), 0)


# ---------- what she has been watching ----------
def noted(world: World, sign: str, amount: float = 1) -> None:
    """A deed of this sign. What the hero does most is what she thinks about most."""
    deeds = world.player.deeds
    deeds[sign] = deeds.get(sign, 0) + amount


def leaning(world: World) -> str:
    """The sign she is thinking about most, or nothing if she has not seen enough yet."""
    deeds = world.player.deeds
    return max(sorted(deeds), key=deeds.get) if deeds else ""


def moods(world: World) -> set[str]:
    """How things stand with the hero this moment."""
    p, out = world.player, set()
    if (p.hp is not None and p.hp / p.max_hp < HURT_BELOW) or not world.cooldown_ready("hero_fell", FELL_WITHIN):
        out.add("hurting")
    elif p.level >= CRUISING_FROM:
        out.add("cruising")
    if p.gold < POOR_BELOW:
        out.add("poor")
    elif p.gold >= RICH_FROM:
        out.add("rich")
    if p.bounty > 0 or p.wanted > 0:
        out.add("wanted")
    if NIGHT[0] <= world.day_time < NIGHT[1]:
        out.add("night")
    for mood, now in (("blood_moon", world.blood_moon), ("war", world.siege), ("hunted", world.nemesis)):
        if now:
            out.add(mood)
    return out


# ---------- the deal ----------
def _open(world: World) -> list[str]:
    """Every Law that could be written now."""
    p = world.player

    def allowed(law: str) -> bool:
        spec, rank = LAWS[law], _rank_of(world, law)
        return rank < BEST_RANK and (rank > 0 or p.written >= TIERS[spec["tier"]]["from"]) and (not spec.get("ability") or spec["ability"] in p.abilities)
    return [law for law in LAWS if allowed(law)]


def _weight(world: World, law: str, now: set[str]) -> float:
    p, spec = world.player, LAWS[law]
    total = sum(p.deeds.values()) or 1
    held = {LAWS[e.id]["sign"] for e in world.edicts}
    weight = TIERS[spec["tier"]]["weight"] * (1 + PULL["watched"] * p.deeds.get(spec["sign"], 0) / total)
    weight *= PULL["mood"] ** len(now & set(spec.get("moods", ())))
    weight *= PULL["deepen"] if _rank_of(world, law) else PULL["kin"] if spec["sign"] in held else 1
    return weight * PULL["lately"] ** p.shown.count(law)


def _weighed(world: World, rng: random.Random, laws: list[str], now: set[str]) -> str:
    return rng.choices(laws, [_weight(world, law, now) for law in laws])[0]


def _for_deeds(world: World, rng: random.Random, pool: list[str], now: set[str]) -> tuple[str, str] | None:
    deeds = world.player.deeds
    signs = sorted(deeds)
    if not signs:
        return None
    sign = rng.choices(signs, [deeds[s] for s in signs])[0]
    some = [law for law in pool if LAWS[law]["sign"] == sign]
    return (_weighed(world, rng, some, now), sign) if some else None


def _for_moment(world: World, rng: random.Random, pool: list[str], now: set[str]) -> tuple[str, str] | None:
    some = [law for law in pool if now & set(LAWS[law].get("moods", ()))]
    if not some:
        return None
    law = _weighed(world, rng, some, now)
    return law, rng.choice(sorted(now & set(LAWS[law]["moods"])))


def _by_chance(world: World, rng: random.Random, pool: list[str], now: set[str]) -> tuple[str, str]:
    """No weights here: this is the card that can be anything, and the one that makes the others feel chosen."""
    dry, roll = world.player.dry, rng.random()
    fabled = CHANCE["fabled"] + CHANCE["fabled_step"] * dry
    tier = "fabled" if roll < fabled else "rare" if roll < fabled + CHANCE["rare"] + CHANCE["rare_step"] * dry else "common"
    return rng.choice([law for law in pool if LAWS[law]["tier"] == tier] or pool), "wild"


def _unlike(pool: list[str], cards: list[dict]) -> list[str]:
    """What is left, and of a different sign from the hand so far if that can be done."""
    taken, signs = {c["id"] for c in cards}, {LAWS[c["id"]]["sign"] for c in cards}
    left = [law for law in pool if law not in taken]
    return [law for law in left if LAWS[law]["sign"] not in signs] or left


def _written_in(rng: random.Random) -> str:
    roll = rng.random()
    for ink, spec in INKS.items():
        if roll < spec["chance"]:
            return ink
        roll -= spec["chance"]
    return ""


def _new_card(world: World, rng: random.Random, law: str, why: str) -> dict:
    return {"id": law, "why": why, "ink": "" if _rank_of(world, law) else _written_in(rng)}


def _deal(world: World) -> list[dict]:
    p, now, pool, cards = world.player, moods(world), _open(world), []
    rng = random.Random(f"{world.seed}:law:{p.written}:{p.redraws}")
    for hand in (_for_deeds, _for_moment, _by_chance):
        left = _unlike(pool, cards)
        if len(cards) < OFFERED and left:
            law, why = hand(world, rng, left, now) or _by_chance(world, rng, left, now)
            cards.append(_new_card(world, rng, law, why))
    rng.shuffle(cards)
    p.shown = (p.shown + [c["id"] for c in cards])[-PULL["memory"]:]
    p.dry = 0 if any(LAWS[c["id"]]["tier"] != "common" for c in cards) else p.dry + 1
    return cards


def _dealt(world: World) -> list[dict]:
    p = world.player
    at = f"{p.written}:{p.redraws}"
    if p.deal.get("at") != at:
        p.deal = {"at": at, "cards": _deal(world)}
    return p.deal["cards"]


def _card(world: World, dealt: dict) -> dict:
    law, ink = dealt["id"], dealt["ink"]
    spec, rank = LAWS[law], _rank_of(world, law)
    return {"id": law, "name": spec["name"], "gift": spec["gift"], "second": spec["second"], "rank": rank + 1, "deepens": bool(rank),
            "tier": spec["tier"], "tier_label": TIERS[spec["tier"]]["label"], "ink": ink, "ink_label": INKS[ink]["label"] if ink else "", "why": WHY[dealt["why"]]}


def offers(world: World, at_stone: bool = False) -> list[dict]:
    """What she can write next. A hand once dealt stays dealt. At a Law Stone the world is thin, and she can get one more past it, and a better one."""
    p, cards = world.player, _dealt(world)
    if at_stone and not p.deal.get("stone"):
        p.deal["stone"] = True
        rng, pool = random.Random(f"{world.seed}:stone:{p.written}:{p.redraws}"), _unlike(_open(world), cards)
        fine = [law for law in pool if LAWS[law]["tier"] != "common"] or pool
        if fine:
            cards.append(_new_card(world, rng, rng.choice(fine), "stone_card"))
            p.shown = (p.shown + [cards[-1]["id"]])[-PULL["memory"]:]
    p.laws_seen += [c["id"] for c in cards if c["id"] not in p.laws_seen]
    return [_card(world, c) for c in cards]


def can_redraw(world: World) -> bool:
    return can_ask(world) and not world.player.redrawn


def redraw(world: World) -> bool:
    """Other words. Once for each Law, so that a bad hand is not the end of it and a good one still means something."""
    if not can_redraw(world):
        return False
    world.player.redrawn = True
    world.player.redraws += 1
    return True


def write(world: World, law: str) -> str | None:
    """Write a Law she has offered. One already in force deepens: its gift grows and its price does not. A new one can push out the oldest."""
    card = next((c for c in offers(world) if c["id"] == law), None) if can_ask(world) else None
    if not card:
        return None
    p, spec, faded = world.player, LAWS[law], None
    p.petitions -= 1
    p.written += 1
    p.redrawn = False
    p.deeds = {sign: amount * PULL["fade"] for sign, amount in p.deeds.items()}  # she has said what she had to say about that, and watches again
    held = next((e for e in world.edicts if e.id == law), None)
    if held:
        held.rank += 1
    else:
        world.edicts.append(Edict(id=law, ink=card["ink"]))
        if len(world.edicts) > MOST:
            faded = world.edicts.pop(0)
    world.push("law", spec["name"], gift=spec["gift"], second=spec["second"], rank=held.rank if held else 1, faded=LAWS[faded.id]["name"] if faded else "", tier=spec["tier"], ink=card["ink_label"])
    chronicle.record(world, "law", edict=spec["name"])
    return fill(world, spec["line"])


def watching(world: World) -> str:
    return EDICTS["watching"].get(leaning(world), "")


def codex(world: World) -> dict:
    """Every Law she has ever shown the hero, for the book. It is a collection, and how far along it is shows what else there is to find."""
    known = {*world.player.laws_seen, *(e.id for e in world.edicts)}
    return {"seen": [{"name": spec["name"], "gift": spec["gift"], "second": spec["second"], "tier": TIERS[spec["tier"]]["label"]} for law, spec in LAWS.items() if law in known], "all": len(LAWS)}


def in_force(world: World) -> list[dict]:
    """The hero's Laws as the book shows them."""
    free = world.ending == "named"
    return [{"name": LAWS[e.id]["name"], "gift": LAWS[e.id]["gift"], "second": "" if free else LAWS[e.id]["second"], "rank": e.rank, "ink": INKS[e.ink]["label"] if e.ink else ""} for e in world.edicts]

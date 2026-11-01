"""Faith: what the hero's deeds are worth to a god with nothing else to go on. It is the one bar every deed fills, and a full bar is a level: a little more health,
and a Law she owes them. Dying costs none of it, because a death should cost a moment and not an hour. A crime does cost some, because she saw."""
from __future__ import annotations

from ..content import CREATURES, ITEMS, WORLD
from ..core.state import World
from .edicts import rule
from .lines import say

FIRST, STEP, HEAD_START, MOST = (WORLD["faith"][k] for k in ("first", "step", "head_start", "most"))
HP_A_LEVEL = 1
MANA_LEVELS, MANA_A_LEVEL = 2, 5  # every second level
CHAIN_BONUS, LONGEST_CHAIN = 0.25, 8
HP_FOR_ONE = 6  # health a creature must have for each point it is worth
NIGHT_WORTH, LONGEST_NIGHTS = 8, 6  # what surviving a night is worth, growing with the run of them
LAND_WORTH, SIGHT_WORTH = 10, 5
BLOCK_WORTH, ITEM_WORTH, DEAR_WORTH, DEAR_VALUE = 2, 4, 12, 40  # for something the hero has never held before
SIN = 12  # what a punished crime costs
NEAR_MISS = 0.4  # a share of the bar: closer than this to the next Law, and a death says so
OFFER_GAP, OFFER_SHARE, OFFER_LEAST, OFFER_MOST = 120.0, 0.5, 1, 40  # a gift is worth a share of what it would sell for, and only one at a time counts
KIND_GAP, KIND_WORTH = 300.0, 2  # a kind word, now and then
SOUP, SOUP_WORTH = "mushroom_stew", 30  # she has been asking about soup since the beginning


def need(level: int) -> int:
    return FIRST + STEP * (level - 1)


def earn(world: World, amount: float) -> int:
    """Add Faith, and take every level it reaches. Returns how many."""
    p = world.player
    if p.level >= MOST or amount <= 0:
        return 0
    levels = 0
    p.faith += max(1, round(amount * rule(world, "faith")))
    while p.level < MOST and p.faith >= need(p.level):
        p.faith -= need(p.level)
        p.level += 1
        levels += 1
        p.faith += round(need(p.level) * HEAD_START)  # the next bar starts with something on it: people run for a goal they feel they have already begun
        p.max_hp += HP_A_LEVEL
        if p.level % MANA_LEVELS == 0:
            p.max_mana += MANA_A_LEVEL
        if world.ending != "broken":
            p.petitions += 1
    if levels and world.ending != "broken":
        world.push("narration", say(world, "tell:law_ready"))
        world.mark("narration")
    return levels


def lose(world: World, amount: int) -> None:
    """It never takes a level back, only what was on the way to the next."""
    world.player.faith = max(0, world.player.faith - amount)


def for_kill(kind: str, chain: int) -> float:
    worth = max(1, round(CREATURES.get(kind, {}).get("hp", HP_FOR_ONE) / HP_FOR_ONE))
    return worth * (1 + CHAIN_BONUS * (max(1, min(LONGEST_CHAIN, chain)) - 1))


def for_item(item: str) -> int:
    spec = ITEMS.get(item, {})
    if spec.get("value", 0) >= DEAR_VALUE:
        return DEAR_WORTH
    return BLOCK_WORTH if spec.get("group") == "blocks" else ITEM_WORTH


def found(world: World, item: str) -> bool:
    """The first time the hero holds a kind of thing. Each is credited once."""
    p = world.player
    if item not in ITEMS or item in p.found:
        return False
    p.found.append(item)
    earn(world, for_item(item))
    return True


def can_offer(world: World) -> bool:
    return world.cooldown_ready("offering", OFFER_GAP)


def offer(world: World, item: str, n: int) -> str:
    """Something given up. She has no use for it, which is why it counts. Faith is only earned by doing things, so it cannot be bought in bulk: one gift counts, and
    whatever is given in the time after that is taken with thanks and earns nothing."""
    spec = ITEMS[item]
    if not can_offer(world):
        return say(world, "pray:offer_soon")
    world.mark("offering")
    value = spec.get("value", 0) * n
    earn(world, max(OFFER_LEAST, min(OFFER_MOST, round(value * OFFER_SHARE))))
    if item == SOUP and not world.story.flags.get("gave_soup"):
        world.story.flags["gave_soup"] = True
        earn(world, SOUP_WORTH)
        return say(world, "pray:offer_soup")
    pool = "pray:offer_dear" if value >= DEAR_VALUE else "pray:offer_junk" if not spec.get("value") else "pray:offer"
    return say(world, pool, item=spec["name"])


def kind_word(world: World) -> None:
    if world.cooldown_ready("kind_word", KIND_GAP):
        world.mark("kind_word")
        earn(world, KIND_WORTH)


def dawn(world: World) -> str:
    """Another night survived. The run of them is the one thing a death can take."""
    p = world.player
    p.nights += 1
    p.best_nights = max(p.best_nights, p.nights)
    earn(world, NIGHT_WORTH * min(LONGEST_NIGHTS, p.nights))
    return f"Night {p.nights} survived"


def so_close(world: World) -> str | None:
    """How near the last death came to the next Law. Only said when it is true and close."""
    p = world.player
    left = need(p.level) - p.faith
    return f"You were {left} Faith from your next Law." if left <= need(p.level) * NEAR_MISS and world.ending != "broken" else None

"""The hero's well of mana. It deepens at a temple, one Mana Crystal at a time, and slowly with every spell cast."""
from __future__ import annotations

from ..core.state import World

CRYSTAL = "16"  # the Mana Crystal's block id
START_MANA = 100
ATTUNE_MANA = 20
PRACTICE_MANA = 5
PRACTICE_RATE = 2  # mana to spend for each point of the well, so that a deep well is slower to deepen


def attune_price(world: World, base: int) -> int:
    """Each attunement costs more than the last, so crystals alone cannot deepen a well for ever."""
    return base + world.player.max_mana - START_MANA


def attune(world: World) -> tuple[str, dict]:
    p = world.player
    p.blocks[CRYSTAL] -= 1
    p.max_mana += ATTUNE_MANA
    return f"The crystal goes dark in your hands, and what it held stays with you. Max mana {p.max_mana}.", {"mana": 999, "take_blocks": {CRYSTAL: 1}}


def practice(world: World, spent: float) -> str | None:
    p = world.player
    p.mana_practice += max(0, spent)
    needed = p.max_mana * PRACTICE_RATE
    if p.mana_practice < needed:
        return None
    p.mana_practice -= needed
    p.max_mana += PRACTICE_MANA
    return f"✨ Practice has deepened your well. Max mana {p.max_mana}."

"""The main storyline. Objectives are tracked by the engine; the god only narrates them."""
from __future__ import annotations

from ..state import World


def _elf(w: World) -> str:
    s = w.settlements_of("elfcity")
    return f"{'the Elf Queen' if w.elf_ruler_title == 'elf_queen' else 'the Elf King'} {w.elf_ruler_name} of {s[0].name}" if s else "an Elven Elder"


def _beast(w: World) -> str:
    return w.settlements_of("beast")[0].name


STAGES = [
    (lambda w: f"Travel to the capital {w.capital().name} and speak with King {w.king_name}", lambda w: w.story.flags.get("met_king", False)),
    (lambda w: f"Win the favor of {_elf(w)} and a Beastkin Chief (e.g. {_beast(w)})",
     lambda w: w.story.flags.get("elf_trust", False) and w.story.flags.get("beast_trust", False)),
    (lambda w: f"Prove your strength: complete 2 Adventurers' Guild quests ({min(2, w.player.guild_done)}/2)", lambda w: w.player.guild_done >= 2),
    (lambda w: f"Cross the Dragonspine Peaks into {w.demon_realm_name}", lambda w: w.story.flags.get("reached_demon_land", False)),
    (lambda w: f"Slay the Demon Lord {w.demon_lord_name} in his castle", lambda w: w.demon_lord_dead),
    (lambda w: f"The Demon Lord is dead. Return to King {w.king_name} as a hero", lambda w: w.story.flags.get("victory", False)),
    (lambda w: "You saved the world. Live your new life as you wish.", lambda w: False),
]


def objective(world: World) -> str:
    return STAGES[world.story.stage][0](world)


def advance(world: World) -> list[str]:
    """Advance through every completed stage. Returns the new objectives reached."""
    reached = []
    if world.demon_lord_dead and world.story.stage < 5:  # a hero who rushes the final boss skips the middle chapters
        world.story.stage = 5
        reached.append(objective(world))
    while world.story.stage < len(STAGES) - 1 and STAGES[world.story.stage][1](world):
        world.story.stage += 1
        reached.append(objective(world))
    return reached

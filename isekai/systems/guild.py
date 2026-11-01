"""Adventurers' Guild: monster-hunting quests with rewards and ranks."""
from __future__ import annotations

import random

from ..content import GUILD
from ..core.state import GuildQuest, World
from . import faith
from .chronicle import fame
from .edicts import rule

RANKS = GUILD["ranks"]
QUEST_WORTH = 25
QUEST_TYPES = [(q["kind"], q["title"], q["count"], q["reward"]) for q in GUILD["quests"]]


def board(world: World, settlement_id: int) -> list[GuildQuest]:
    # the board refreshes every 10 minutes of play
    rng = random.Random(world.seed * 31 + settlement_id * 7 + int(world.clock // 600))
    rank = world.player.guild_rank
    pool = QUEST_TYPES[: 3 + rank + rank // 2]
    out = []
    for kind, title, n, reward in rng.sample(pool, 3):
        count = n + rng.randint(0, 2)
        out.append(GuildQuest(title=title, kind=kind, count=count, reward=round(reward * count / n * (1 + 0.2 * rank)), settlement=settlement_id))
    return out


def accept(world: World, settlement_id: int, idx: int) -> str:
    p = world.player
    if p.active_quest:
        return "You already have an active quest. Finish it first."
    quests = board(world, settlement_id)
    if not 0 <= idx < len(quests):
        return "That quest is no longer posted."
    p.active_quest = quests[idx]
    return f"Quest accepted: {quests[idx].title} ({quests[idx].count} {quests[idx].kind})."


def on_kill(world: World, kind: str) -> str | None:
    q = world.player.active_quest
    if q and q.kind == kind and q.progress < q.count:
        q.progress += 1
        return f"Guild quest: {q.progress}/{q.count} {kind}"
    return None


def turn_in(world: World) -> str:
    p, q = world.player, world.player.active_quest
    if not q:
        return "You have no active quest."
    if q.progress < q.count:
        return f"Not done yet: {q.progress}/{q.count} {q.kind}."
    pay = round(q.reward * rule(world, "bounty"))
    p.gold += pay
    p.guild_done += 1
    p.active_quest = None
    fame(world, 2)
    faith.earn(world, QUEST_WORTH)
    if p.guild_done % 2 == 0 and p.guild_rank < len(RANKS) - 1:
        p.guild_rank += 1
        return f"Quest complete! +{pay} {world.currency}. You are promoted to rank {RANKS[p.guild_rank]}!"
    return f"Quest complete! +{pay} {world.currency}."

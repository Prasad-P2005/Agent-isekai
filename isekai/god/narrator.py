"""The god in the mortal world: helpless to act directly, he narrates, decrees new laws, and may trigger
world events — but only the events the world's rules allow at that moment."""
from __future__ import annotations

import asyncio
import re
import logging
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

from ..content import EVENTS as WORLD_EVENTS
from ..systems.laws import CRIMES, PUNISHMENTS, SCOPES, law_text, validate_law
from ..systems.story import objective

if TYPE_CHECKING:
    from ..core.game import Game

log = logging.getLogger(__name__)
EVENTS = ["none", *WORLD_EVENTS]


def clean_text(s: str) -> str:
    """Strip JSON debris small models leave around prose: trailing '",' or stray quotes."""
    return re.sub(r'^[\s"\',]+|[\s"\',]+$', "", s or "").replace('\\n', " ").strip()


class Decree(BaseModel):
    name: str
    crime: Literal[tuple(["none", *CRIMES])]  # type: ignore[valid-type]
    scope: Literal[tuple(SCOPES)]  # type: ignore[valid-type]
    needs_witness: bool
    punishment: Literal[tuple(PUNISHMENTS)]  # type: ignore[valid-type]
    severity: int


class GodTurn(BaseModel):
    narration: str
    decree: Decree
    event: Literal[tuple(EVENTS)]  # type: ignore[valid-type]


def allowed_events(game: "Game") -> list[str]:
    """The rules that bind the god: which events may happen right now."""
    w, ctx = game.world, game.ctx
    out = []
    if not w.demon_lord_dead and w.story.stage >= 1 and w.cooldown_ready("demon_raid", 150):
        out.append("demon_raid")
    if not ctx.get("night") and w.cooldown_ready("merchant_caravan", 180):
        out.append("merchant_caravan")
    if not ctx.get("night") and ctx.get("in_settlement") and w.cooldown_ready("festival", 300):
        out.append("festival")
    if ctx.get("night") and w.cooldown_ready("monster_horde", 150):
        out.append("monster_horde")
    return out


def run_event(game: "Game", event: str, cause: str = "the god") -> bool:
    w = game.world
    if event not in allowed_events(game) and cause == "the god":
        return False
    w.mark(event)
    if event == "demon_raid":
        w.raid_level += 1
        w.push("event", f"🔥 The armies of {w.demon_lord_name} attack! (wave {w.raid_level})", event="demon_raid", wave=w.raid_level)
    elif event == "merchant_caravan":
        w.push("event", "🐎 A merchant caravan arrives nearby, its wagons full of goods.", event="merchant_caravan")
    elif event == "festival":
        w.festival_until = w.clock + 180
        w.push("event", "🎉 A festival begins! Merchants lower their prices for a while.", event="festival")
    elif event == "monster_horde":
        w.push("event", "🌑 A horde of monsters stirs in the darkness…", event="monster_horde")
    return True


class Narrator:
    def __init__(self, game: "Game"):
        self.game = game
        self.queue: asyncio.Queue[str] = asyncio.Queue()

    def call(self, reason: str) -> None:
        if self.queue.qsize() < 3:
            self.queue.put_nowait(reason)

    async def worker(self) -> None:
        while True:
            reason = await self.queue.get()
            try:
                await self.turn(reason)
            except Exception:  # never let one bad turn kill the narrator
                log.exception("god turn failed")

    async def turn(self, reason: str) -> None:
        g, w = self.game, self.game.world
        if not w or not w.genesis_done:
            return
        w.mark("narration")
        p, ctx = w.player, g.ctx
        allowed = allowed_events(g)
        prompt = f"""You are {w.god_name}, the casual, friendly {w.god_is} of "{w.name}", narrating the hero's story like a fun anime narrator. You cannot touch the mortal world directly. You act ONLY through its rules:
1) you may decree ONE new law (or use crime "none"), which the world will enforce automatically from now on;
2) you may trigger ONE world event that the rules allow right now: {', '.join(allowed) or 'none'} (or "none").
Laws in force: {'; '.join(law_text(l) for l in w.laws)}
Demon Lord {w.demon_lord_name} of {w.demon_realm_name}: {'DEFEATED' if w.demon_lord_dead else f'alive, {w.raid_level} raids so far'}.
Hero: {w.hero}. Gold {p.gold}, bounty {p.bounty}, notoriety {p.notoriety}, kills {p.kills}, deaths {p.deaths}, abilities: {', '.join(p.abilities) or 'none'}.
Hero is at: {ctx.get('place', 'the wilds')} ({'night' if ctx.get('night') else 'day'}).
Story so far: {' '.join(w.story.beats[-3:])}
Current objective: {objective(w)}
WHAT JUST HAPPENED: {reason}
Narrate this moment in 1-2 dramatic sentences that continue the story. Only decree a law or trigger an event if it makes the story better (usually choose none)."""
        t = await g.llm.ask(prompt, GodTurn)
        if not t:
            return
        text = clean_text(t.narration)
        if text:
            w.push("narration", text[:400])
        if t.decree.crime != "none" and len(w.laws) < 8 and w.cooldown_ready("decree", 300):
            law = validate_law(t.decree.model_dump())
            if law and all(l.name != law.name for l in w.laws):
                w.laws.append(law)
                w.mark("decree")
                w.push("decree", f"📜 {w.god_name} decrees a new law: {law_text(law)}", law=law.model_dump())
        if t.event != "none":
            run_event(g, t.event)
        g.save()

"""The Game ties the world state, the LLM god and the rule systems together. One instance per running server."""
from __future__ import annotations

import asyncio
import logging
import random
import time
from pathlib import Path

from .. import config
from ..god.genesis import run_genesis, tidy_names
from ..god.narrator import Narrator, run_event
from ..god.planner import plan_settlement, ruler_of
from ..llm.client import LLM
from ..persistence.migrations import CURRENT_VERSION, migrate
from ..persistence.saves import load, save
from ..systems.people.roster import make_roster
from ..systems.people.succession import appoint_heir
from ..systems.story import advance, objective
from ..world.map import build_map
from .state import World

log = logging.getLogger(__name__)
TICK = 5  # seconds between ticks of the game clock
PLAYING_TIMEOUT = 12  # with no report from the client for this long, assume nobody is playing


class Game:
    def __init__(self, llm: LLM | None = None, save_path: Path | None = None):
        self.llm = llm or LLM()
        self.save_path = save_path or config.SAVE_DIR / "world.json"
        self.world: World | None = load(self.save_path)
        if self.world and migrate(self.world):
            save(self.world, self.save_path)
        self.narrator = Narrator(self)
        self.ctx: dict = {}  # live context reported by the client (night, place, playing, ...)
        self.last_report = 0.0
        self.creating = False
        self._tasks: list[asyncio.Task] = []

    # ---------- lifecycle ----------
    def start(self) -> None:
        self._tasks += [asyncio.create_task(self.narrator.worker()), asyncio.create_task(self._clock())]
        if self.world and self.world.genesis_done:
            self._tasks.append(asyncio.create_task(self._plan_all()))

    def save(self) -> None:
        if self.world:
            save(self.world, self.save_path)

    def playing(self) -> bool:
        """Someone is really playing: not paused, in a menu, or just leaving a tab open."""
        w = self.world
        if not w or not w.genesis_done or not w.player.descended:
            return False
        return bool(self.ctx.get("playing")) and time.monotonic() - self.last_report < PLAYING_TIMEOUT

    async def new_world(self, seed: int | None = None) -> World:
        self.creating = True
        try:
            await self.llm.ping()
            w = World(seed=seed or random.randrange(1, 10**9), save_version=CURRENT_VERSION)
            w.lands, w.settlements, w.demon_land = build_map()
            await run_genesis(w, self.llm)
            for s in w.settlements:
                rj, rn = ruler_of(w, s)
                make_roster(s, None, w.seed, rj, rn)
            tidy_names(w)
            village = min(w.settlements_of("human"), key=lambda s: (s.cx - w.capital().cx) ** 2 + (s.cz - w.capital().cz) ** 2)
            # Start just beyond the village work ring, not among the farmers.
            w.spawn.x, w.spawn.z = village.cx + 5.5, village.cz + 35.5
            self.world = w
            self.save()
            self._tasks.append(asyncio.create_task(self._plan_all()))
            return w
        finally:
            self.creating = False

    async def _plan_all(self) -> None:
        """Plan every settlement's people in the background, nearest to the spawn first."""
        w = self.world
        order = sorted(w.settlements, key=lambda s: (s.cx - w.spawn.x) ** 2 + (s.cz - w.spawn.z) ** 2)
        for s in order:
            if s.planned or w is not self.world:
                continue
            if await plan_settlement(w, self.llm, s):
                w.push("settlement", f"The people of {s.name} go about their lives.", id=s.id, version=s.version)
                self.save()
            elif not self.llm.online:
                break

    # ---------- the game clock ----------
    async def _clock(self) -> None:
        while True:
            await asyncio.sleep(TICK)
            if self.playing():
                self.tick(TICK)

    def tick(self, seconds: float) -> None:
        """Advance the game clock. Everything scheduled happens here, so pausing the game pauses all of it."""
        w = self.world
        w.clock += seconds
        self._run_timers()
        if not w.demon_lord_dead and w.story.stage >= 1 and w.cooldown_ready("scheduled_raid", w.raid_every):
            if "scheduled_raid" in w.cooldowns:
                run_event(self, "demon_raid", cause="the rules")
                self.narrator.call(f"the armies of {w.demon_lord_name} launched raid wave {w.raid_level} near the hero")
            w.mark("scheduled_raid")
        if w.cooldown_ready("narration", config.GOD_IDLE_INTERVAL):
            self.narrator.call("time passes; keep the story moving")
        self.save()

    def _run_timers(self) -> None:
        w = self.world
        due = [t for t in w.timers if t.due <= w.clock]
        w.timers = [t for t in w.timers if t.due > w.clock]
        for timer in due:
            if timer.kind == "successor":
                self._successor(timer.data["settlement"], timer.data["resident"])

    def _successor(self, settlement_id: int, resident_id: int) -> None:
        s = self.world.settlements[settlement_id]
        dead = next(r for r in s.residents if r.id == resident_id)
        heir = appoint_heir(self.world, s, dead)
        self.narrator.call(f"after the death of {dead.name}, {heir.name} became the new {heir.label} of {s.name}")

    # ---------- shared by the commands ----------
    def state_payload(self, **extra) -> dict:
        w = self.world
        return {"player": w.player.model_dump(), "story": {"stage": w.story.stage, "objective": objective(w)}, **extra}

    def check_story(self) -> list[str]:
        reached = advance(self.world)
        for o in reached:
            self.narrator.call(f"the hero completed a chapter of their journey; the next objective is: {o}")
        return reached

"""The Game ties the world state and the rule systems together. One instance per running server."""
from __future__ import annotations

import asyncio
import logging
import random
import time
from pathlib import Path

from .. import config
from ..persistence.migrations import CURRENT_VERSION, migrate
from ..persistence.saves import load, save
from ..systems import storyteller, story
from ..systems.marks import quest_marks
from ..systems.people.succession import appoint_heir
from ..systems.story import objective
from ..world.genesis import run_genesis
from .state import World

log = logging.getLogger(__name__)
TICK = 5  # seconds between ticks of the game clock
PLAYING_TIMEOUT = 12  # with no report from the client for this long, assume nobody is playing


class Game:
    def __init__(self, save_path: Path | None = None):
        self.save_path = save_path or config.SAVE_DIR / "world.json"
        self.world: World | None = load(self.save_path)
        if self.world and migrate(self.world):
            save(self.world, self.save_path)
        self.ctx: dict = {}  # live context reported by the client (night, place, playing, ...)
        self.last_report = 0.0
        self._tasks: list[asyncio.Task] = []

    # ---------- lifecycle ----------
    def start(self) -> None:
        self._tasks.append(asyncio.create_task(self._clock()))

    def save(self) -> None:
        if self.world:
            save(self.world, self.save_path)

    def playing(self) -> bool:
        """Someone is really playing: not paused, in a menu, or just leaving a tab open."""
        w = self.world
        if not w or not w.genesis_done or not w.player.descended:
            return False
        return bool(self.ctx.get("playing")) and time.monotonic() - self.last_report < PLAYING_TIMEOUT

    def new_world(self, seed: int | None = None) -> World:
        w = World(seed=seed or random.randrange(1, 10**9), save_version=CURRENT_VERSION)
        run_genesis(w)
        self.world = w
        self.save()
        return w

    # ---------- the game clock ----------
    async def _clock(self) -> None:
        while True:
            await asyncio.sleep(TICK)
            if self.playing():
                self.tick(TICK)

    def tick(self, seconds: float) -> None:
        """Advance the game clock. Everything scheduled happens here, so pausing the game pauses all of it."""
        self.world.clock += seconds
        self._run_timers()
        storyteller.direct(self, seconds)
        self.save()

    def _run_timers(self) -> None:
        w = self.world
        due = [t for t in w.timers if t.due <= w.clock]
        w.timers = [t for t in w.timers if t.due > w.clock]
        for timer in due:
            if timer.kind == "successor":
                self._successor(timer.data["settlement"], timer.data["resident"])
            elif timer.kind == "omen":
                storyteller.omen(self)
            elif timer.kind == "nemesis":
                storyteller.nemesis_returns(self)

    def _successor(self, settlement_id: int, resident_id: int) -> None:
        s = self.world.settlements[settlement_id]
        dead = next((r for r in s.residents if r.id == resident_id and r.dead), None)
        if not dead:
            return
        heir = appoint_heir(self.world, s, dead)
        if heir.service:
            storyteller.narrate(self.world, "successor", dead=dead.name, heir=heir.name, post=heir.label, place=s.name)

    # ---------- shared by the commands ----------
    def state_payload(self, **extra) -> dict:
        w = self.world
        return {"player": w.player.model_dump(), "story": {"stage": w.story.stage, "act": story.act(w), "objective": objective(w), "oaths": story.oath_list(w), "marks": quest_marks(w)}, **extra}

    def check_story(self) -> list[str]:
        """Move the story on if it can. Each new chapter announces itself, and an act opens with a title card."""
        w, reached = self.world, story.advance(self.world)
        for chapter in reached:
            storyteller.narrate(w, f"chapter:{chapter['id']}", important=True)
            if chapter.get("card"):
                w.push("act", chapter["card"]["title"], subtitle=chapter["card"]["subtitle"])
        return [objective(w)] if reached else []

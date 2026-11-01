"""The Game ties the world state and the rule systems together. One instance per running server."""
from __future__ import annotations

import asyncio
import logging
import os
import random
import time
import zlib
from pathlib import Path

from .. import config
from ..content import WORLD
from ..persistence import saves
from ..persistence.migrations import CURRENT_VERSION, migrate
from ..persistence.saves import load, save
from ..systems import edicts, siege, storyteller, story
from ..systems.marks import quest_marks
from ..systems.people.succession import appoint_heir
from ..systems.story import objective
from ..world.genesis import run_genesis
from .state import World

log = logging.getLogger(__name__)
TICK = 5  # seconds between ticks of the game clock
PLAYING_TIMEOUT = 12  # with no report from the client for this long, assume nobody is playing
SEEDS = 2**31  # a seed has to fit the client's noise as well as Python's
NAME_LENGTH = 32
SAMPLE_SEED = 20261101  # the world behind the title screen for someone who has none of their own yet


def seed_of(asked: int | str | None) -> int | None:
    """A number is used as it stands, and anything else is hashed, so that a word can be a seed."""
    text = str(asked).strip() if asked is not None else ""
    if not text:
        return None
    return (abs(int(text)) if text.lstrip("-").isdigit() else zlib.crc32(text.encode("utf-8"))) % SEEDS or 1


def tidy_name(name: str) -> str:
    return " ".join(name.split())[:NAME_LENGTH]


class Game:
    def __init__(self, save_path: Path | None = None):
        self.save_path = save_path or self._last_played(config.SAVE_DIR)
        self.world: World | None = load(self.save_path)
        if self.world and migrate(self.world):
            save(self.world, self.save_path)
        self.ctx: dict = {}  # live context reported by the client (night, place, playing, ...)
        self.last_report = 0.0
        self._tasks: list[asyncio.Task] = []
        self._sample: World | None = None

    @staticmethod
    def _last_played(folder: Path) -> Path:
        return next(iter(saves.slots(folder)), folder / "world.json")

    @property
    def slot(self) -> str:
        """Which world is open. A page says which one it thinks it is playing, so that a tab left open cannot write into another world."""
        return self.save_path.stem

    @property
    def folder(self) -> Path:
        return self.save_path.parent

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

    def new_world(self, seed: int | None = None, *, name: str = "", difficulty: str = "fair", creative: bool = False, god_is: str = "", brief: bool = False) -> World:
        """A new world in a file of its own, so that making one never costs the last one."""
        self.save()
        w = World(seed=seed or random.randrange(1, 10**9), save_version=CURRENT_VERSION, difficulty=difficulty if difficulty in WORLD["difficulty"] else "fair", brief=brief)
        run_genesis(w, tidy_name(name), god_is)
        w.player.creative = creative
        if self.world:
            self.save_path = saves.fresh_slot(self.folder, w.name)
        self.world, self.ctx = w, {}
        self.save()
        return w

    # ---------- the saved worlds ----------
    def worlds(self) -> dict:
        """Every saved world, the one played last first. `open` is whichever the server has in hand."""
        rows = []
        chapters = story.CHAPTERS
        for path in saves.slots(self.folder):
            if (row := saves.peek(path)):
                rows.append({**row, "id": path.stem, "act": chapters[min(row["stage"], len(chapters) - 1)]["act"]})
        return {"open": self.slot if self.world else None, "worlds": rows}

    def open_slot(self, slot: str) -> World | None:
        path = saves.slot_path(self.folder, slot)
        if path is None:
            return None
        if path == self.save_path and self.world:
            return self.world
        world = load(path)
        if not world:
            return None
        self.save()
        self.save_path, self.world, self.ctx = path, world, {}
        migrate(world)
        self.save()  # the file's time is how the next start knows which world was played last
        return world

    def rename_slot(self, slot: str, name: str) -> bool:
        path, name = saves.slot_path(self.folder, slot), tidy_name(name)
        if path is None or not name:
            return False
        if path == self.save_path and self.world:
            self.world.name = name
            self.save()
            return True
        world = load(path)
        if not world:
            return False
        was = path.stat()
        world.name = name
        save(world, path)
        os.utime(path, (was.st_atime, was.st_mtime))  # naming a world is not playing it
        return True

    def copy_slot(self, slot: str) -> str | None:
        path = saves.slot_path(self.folder, slot)
        if path is None:
            return None
        self.save()
        world = load(path)
        if not world:
            return None
        world.name = tidy_name(f"{world.name} copy")
        copy = saves.fresh_slot(self.folder, world.name)
        save(world, copy)
        return copy.stem

    def delete_slot(self, slot: str) -> bool:
        path = saves.slot_path(self.folder, slot)
        if path is None:
            return False
        was_open = path == self.save_path
        if was_open:
            self.world, self.ctx = None, {}
        saves.discard(path)
        if was_open:
            self.save_path = self._last_played(self.folder)
            self.world = load(self.save_path)
        return True

    def import_world(self, data: dict) -> str | None:
        """A world someone exported, as a new slot. It is checked like any save, and nothing already here is touched."""
        try:
            world = World.model_validate(data)
        except ValueError:
            return None
        if not world.genesis_done:
            return None
        migrate(world)
        path = saves.fresh_slot(self.folder, world.name)
        save(world, path)
        return path.stem

    def vista(self) -> dict:
        """What the title screen needs to draw the land behind the menu. Someone with no world yet gets a sample, which is never saved."""
        world = self.world
        if not world or not world.genesis_done:
            if self._sample is None:
                self._sample = World(seed=SAMPLE_SEED, save_version=CURRENT_VERSION)
                run_genesis(self._sample)
            world = self._sample
        data = world.model_dump(include={"seed", "lands", "settlements", "spawn", "block_edits"})
        for settlement in data["settlements"]:
            settlement["residents"] = []  # only the buildings show from up there
        return data

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
            elif timer.kind == "siege_end":
                siege.expired(self.world)
            elif timer.kind == "star_fades":
                storyteller.star_fades(self.world)

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
        return {"player": w.player.model_dump(), "rules": edicts.for_client(w), "story": {"stage": w.story.stage, "act": story.act(w), "objective": objective(w), "oaths": story.oath_list(w), "marks": quest_marks(w)}, **extra}

    def check_story(self) -> list[str]:
        """Move the story on if it can. Each new chapter announces itself, and an act opens with a title card."""
        w, reached = self.world, story.advance(self.world)
        for chapter in reached:
            storyteller.narrate(w, f"chapter:{chapter['id']}", important=True)
            if chapter.get("card"):
                w.push("act", chapter["card"]["title"], subtitle=chapter["card"]["subtitle"])
        self._story_moves()
        return [objective(w)] if reached else []

    def _story_moves(self) -> None:
        """Scenes that come by themselves. One that sends an army waits for any assault already under way."""
        w = self.world
        for name in story.due_scenes(w):
            marching = story.SCENES[name].get("siege")
            if marching and w.siege:
                continue
            story.play_scene(w, name)
            if marching:
                siege.begin(w, w.capital(), story=True)

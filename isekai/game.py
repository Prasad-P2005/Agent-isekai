"""The Game ties the world state, the LLM god and the rule systems together. One instance per running server."""
from __future__ import annotations

import asyncio
import logging
import random
import time
from pathlib import Path

from . import config
from .economy import guild
from .economy.shop import LOOT
from .god.genesis import run_genesis, tidy_names
from .god.narrator import Narrator, run_event
from .god.planner import plan_settlement, ruler_of
from .llm.client import LLM
from .people.names import gen_name
from .people.roster import make_roster
from .people.society import migrate_world_society
from .state import World, load, save
from .story.stages import advance, objective
from .world.map import build_map

log = logging.getLogger(__name__)


class Game:
    def __init__(self, llm: LLM | None = None, save_path: Path | None = None):
        self.llm = llm or LLM()
        self.save_path = save_path or config.SAVE_DIR / "world.json"
        self.world: World | None = load(self.save_path)
        if self.world and migrate_world_society(self.world):
            save(self.world, self.save_path)
        self.narrator = Narrator(self)
        self.ctx: dict = {}  # live context reported by the client (night, place, ...)
        self.last_active = 0.0
        self.creating = False
        self.successor_delay = 120.0
        self._tasks: list[asyncio.Task] = []

    # ---------- lifecycle ----------
    def start(self) -> None:
        self._tasks += [asyncio.create_task(self.narrator.worker()), asyncio.create_task(self._clock())]
        if self.world and self.world.genesis_done:
            self._tasks.append(asyncio.create_task(self._plan_all()))

    def save(self) -> None:
        if self.world:
            save(self.world, self.save_path)

    def touch(self) -> None:
        self.last_active = time.time()

    async def new_world(self, seed: int | None = None) -> World:
        self.creating = True
        try:
            await self.llm.ping()
            w = World(seed=seed or random.randrange(1, 10**9))
            w.lands, w.settlements, w.demon_land = build_map()
            await run_genesis(w, self.llm)
            for s in w.settlements:
                rj, rn = ruler_of(w, s)
                make_roster(s, None, w.seed, rj, rn)
            w.society_version = 4
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

    async def _clock(self) -> None:
        """Scheduled world rules: demon raids and the god's idle narration, only while someone is playing."""
        while True:
            await asyncio.sleep(5)
            w = self.world
            if not w or not w.genesis_done or not w.player.descended or time.time() - self.last_active > 30:
                continue
            if not w.demon_lord_dead and w.story.stage >= 1 and w.cooldown_ready("scheduled_raid", w.raid_every):
                if "scheduled_raid" in w.cooldowns:
                    run_event(self, "demon_raid", cause="the rules")
                    self.narrator.call(f"the armies of {w.demon_lord_name} launched raid wave {w.raid_level} near the hero")
                w.mark("scheduled_raid")
            if time.time() - self.narrator.last > config.GOD_IDLE_INTERVAL:
                self.narrator.call("time passes; keep the story moving")

    # ---------- events reported by the client ----------
    def state_payload(self, **extra) -> dict:
        w = self.world
        return {"player": w.player.model_dump(), "story": {"stage": w.story.stage, "objective": objective(w)}, **extra}

    def check_story(self) -> list[str]:
        reached = advance(self.world)
        for o in reached:
            self.narrator.call(f"the hero completed a chapter of their journey; the next objective is: {o}")
        return reached

    def on_kill(self, kind: str, resident: dict | None, by_player: bool) -> list[str]:
        w, msgs = self.world, []
        if resident:
            s = w.settlements[resident["settlement"]]
            r = next((r for r in s.residents if r.id == resident["id"]), None)
            if r and not r.dead:
                r.dead = True
                if r.service:
                    self._tasks.append(asyncio.create_task(self._successor(s, r)))
        if not by_player or resident:
            return msgs
        p = w.player
        p.kills += 1
        if kind in LOOT:
            name = LOOT[kind][0]
            p.loot[name] = p.loot.get(name, 0) + 1
            msgs.append(f"+1 {name}")
        if (m := guild.on_kill(w, kind)):
            msgs.append(m)
        if kind == "demon_lord":
            w.demon_lord_dead = True
            self.narrator.call(f"THE HERO SLEW THE DEMON LORD {w.demon_lord_name}! His armies scatter")
        elif kind == "dragon":
            self.narrator.call("the hero slew a mighty dragon")
        elif p.kills % 8 == 0:
            self.narrator.call(f"the hero has now slain {p.kills} monsters")
        return msgs

    async def _successor(self, s, dead) -> None:
        """Life goes on: someone new takes over an essential job (shopkeeper, doctor, ruler...)."""
        await asyncio.sleep(self.successor_delay)
        rng = random.Random(dead.id + int(time.time()))
        heir = dead.model_copy(update={"id": max(r.id for r in s.residents) + 1, "dead": False, "memory": [], "personality": "",
                                       "name": gen_name(dead.race, rng)})
        s.residents.append(heir)
        if dead.job == "king" and s.id == self.world.capital().id:
            self.world.king_name = heir.name
        s.version += 1
        self.world.push("settlement", f"{heir.name} takes over as {heir.label} of {s.name}.", id=s.id, version=s.version)
        self.narrator.call(f"after the death of {dead.name}, {heir.name} became the new {heir.label} of {s.name}")
        self.save()

    def on_enter_land(self, lx: int, lz: int) -> None:
        w = self.world
        land = w.land_at(lx, lz)
        if not land:
            return
        if land.realm == "demon":
            w.story.flags["reached_demon_land"] = True
        k = f"{lx},{lz}"
        if k in w.visited:
            return
        w.visited.append(k)
        if land.settlement is not None:
            s = w.settlements[land.settlement]
            self.narrator.call(f"the hero arrived for the first time at {s.name}, a {s.type} settlement. {s.description}")
        elif land.structure != "none" or land.realm == "demon":
            self.narrator.call(f"the hero arrived for the first time at {land.name or land.structure.replace('_', ' ')} ({land.realm} lands)")

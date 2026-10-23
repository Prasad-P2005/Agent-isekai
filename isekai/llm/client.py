"""Async Ollama client that forces JSON output matching a pydantic model."""
from __future__ import annotations

import asyncio
import copy
import logging
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .. import config

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

SYSTEM = """You are the storyteller-god of a fantasy reincarnation (isekai) anime world made of voxel blocks.
Peoples: humans (villages, two walled cities with rulers, adventurers' guilds), elves (villages in the woods),
beastkin/demi-humans (tribal villages in the savanna), mermaids (under the sea), and the Demon Lord in the demon
wastes beyond the Dragonspine Peaks. Keep everything consistent, fun and short. Answer only in JSON."""


def inline_schema(schema: dict) -> dict:
    """Resolve $ref/$defs so small models' grammar converters get a flat schema."""
    defs = schema.get("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(copy.deepcopy(defs[node["$ref"].split("/")[-1]]))
            return {k: walk(v) for k, v in node.items() if k not in ("$defs", "title", "default")}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


class LLM:
    def __init__(self, url: str = config.LLM_URL, model: str = config.LLM_MODEL):
        self.url, self.model = url, model
        self.online = True
        self._lock = asyncio.Lock()  # one request at a time: small GPUs can't run them in parallel
        self._waiting_fg = 0  # player-facing requests waiting; background work yields to them
        self._http = httpx.AsyncClient(timeout=config.LLM_TIMEOUT)

    async def ask(self, prompt: str, schema: type[T], system: str = SYSTEM, temperature: float = 0.9, urgent: bool = False) -> T | None:
        """Return a validated instance of `schema`, or None if the LLM is unreachable or answers badly.
        `urgent` requests (the player is waiting: dialogue, heaven) go ahead of background work (narration, planning)."""
        if not self.online:
            return None
        if urgent:
            self._waiting_fg += 1
            try:
                return await self._ask(prompt, schema, system, temperature)
            finally:
                self._waiting_fg -= 1
        while self._waiting_fg:
            await asyncio.sleep(0.2)
        return await self._ask(prompt, schema, system, temperature)

    async def _ask(self, prompt: str, schema: type[T], system: str, temperature: float) -> T | None:
        body = {
            "model": self.model, "stream": False, "think": False, "keep_alive": "30m",
            "format": inline_schema(schema.model_json_schema()), "options": {"temperature": temperature},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        }
        async with self._lock:
            try:
                res = await self._http.post(f"{self.url}/api/chat", json=body)
                res.raise_for_status()
                return schema.model_validate_json(res.json()["message"]["content"])
            except (httpx.ConnectError, httpx.ConnectTimeout) as e:
                log.warning("LLM unreachable at %s: %s", self.url, e)
                self.online = False
            except (httpx.HTTPError, ValidationError, KeyError, ValueError) as e:
                log.warning("LLM request failed: %s", e)
        return None

    async def ping(self) -> bool:
        try:
            self.online = (await self._http.get(f"{self.url}/api/tags", timeout=5)).status_code == 200
        except httpx.HTTPError:
            self.online = False
        return self.online

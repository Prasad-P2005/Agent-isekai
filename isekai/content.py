"""The game's data. The browser client loads the same files from /content, so the two sides cannot disagree."""
from __future__ import annotations

import json

from . import config


def _load(name: str):
    return json.loads((config.CONTENT_DIR / f"{name}.json").read_text(encoding="utf-8"))


def color(value: str | None) -> int | None:
    return int(value[1:], 16) if value else None


WORLD = _load("world")
REALMS = _load("realms")["realms"]
BLOCK_IDS = {b["id"] for b in _load("blocks")}
CREATURES = _load("creatures")
ABILITIES = _load("abilities")
ITEMS = _load("items")
SERVICES = _load("services")
JOBS = _load("jobs")
LAWS = _load("laws")
GUILD = _load("guild")
EVENTS = _load("events")

CHUNK_VOLUME = WORLD["chunk"] ** 2 * WORLD["height"]

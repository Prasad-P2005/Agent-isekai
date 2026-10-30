"""The game's data. The browser client loads the same files from /content, so the two sides cannot disagree."""
from __future__ import annotations

import json

from . import config


def _load(name: str):
    return json.loads((config.CONTENT_DIR / f"{name}.json").read_text(encoding="utf-8"))


def _load_lines() -> dict[str, list[str]]:
    """Every file in content/lines is one flat table of line pools. The files only keep the writing organised."""
    pools: dict[str, list[str]] = {}
    for path in sorted((config.CONTENT_DIR / "lines").glob("*.json")):
        pools.update(json.loads(path.read_text(encoding="utf-8")))
    return pools


def color(value: str | None) -> int | None:
    return int(value[1:], 16) if value else None


WORLD = _load("world")
REALMS = _load("realms")["realms"]
BLOCK_IDS = {b["id"] for b in _load("blocks")}
BLOCK_NAMES = {b["id"]: b["name"] for b in _load("blocks")}
CREATURES = _load("creatures")
ABILITIES = _load("abilities")
ITEMS = _load("items")
SERVICES = _load("services")
JOBS = _load("jobs")
LAWS = _load("laws")
GUILD = _load("guild")
EVENTS = _load("events")
NAMES = _load("names")
STORY = _load("story")
FAVORS = _load("favors")
LINES = _load_lines()

CHUNK_VOLUME = WORLD["chunk"] ** 2 * WORLD["height"]

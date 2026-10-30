"""Reading and writing the world file."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from ..core.state import World

log = logging.getLogger(__name__)


def save(world: World, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(world.model_dump_json(), encoding="utf-8")  # the feed is full of emoji, which the Windows default can't encode
    tmp.replace(path)


def _set_aside(path: Path) -> None:
    """The game treats an unreadable save as no world, so 'Create World' would write over it. Keep it safe first."""
    kept = path.with_name(f"{path.stem}.unreadable-{int(time.time())}{path.suffix}")
    try:
        path.replace(kept)
        log.warning("could not read %s: kept it as %s", path, kept.name)
    except OSError:
        log.exception("could not read or move %s", path)


def load(path: Path) -> World | None:
    if not path.exists():
        return None
    try:
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:  # saved on Windows before saves were always UTF-8
            text = raw.decode("cp1252")
        return World.model_validate(json.loads(text))
    except (ValueError, OSError):
        _set_aside(path)
        return None

"""Reading and writing the world files. Each world is one file in the save folder, and the file's name is its id, which is called its slot."""
from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path

from ..core.state import World

log = logging.getLogger(__name__)
SLOT = re.compile(r"[A-Za-z0-9_-]{1,64}")  # a set-aside save has a dot in its name, so it is never taken for a world
TRASH = "trash"
_peeked: dict[Path, tuple[int, dict]] = {}


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


def _text(path: Path) -> str:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:  # saved on Windows before saves were always UTF-8
        return raw.decode("cp1252")


def load(path: Path) -> World | None:
    if not path.exists():
        return None
    try:
        return World.model_validate(json.loads(_text(path)))
    except (ValueError, OSError):
        _set_aside(path)
        return None


# ---------- the folder ----------
def slots(folder: Path) -> list[Path]:
    """Every world in the folder, the one played last first."""
    if not folder.is_dir():
        return []
    return sorted((p for p in folder.glob("*.json") if SLOT.fullmatch(p.stem)), key=lambda p: p.stat().st_mtime, reverse=True)


def slot_path(folder: Path, slot: str) -> Path | None:
    """The file of a slot, if there is one. The id comes from a request, so it has to pass before it goes near a path."""
    path = folder / f"{slot}.json"
    return path if SLOT.fullmatch(slot) and path.is_file() else None


def fresh_slot(folder: Path, name: str) -> Path:
    """A file for a new world, named after it so that the folder can be read by a person."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "world"
    path, n = folder / f"{slug}.json", 1
    while path.exists():
        n += 1
        path = folder / f"{slug}-{n}.json"
    return path


def peek(path: Path) -> dict | None:
    """What the Worlds page shows about a save. It is read as plain data, and kept until the file changes, because a whole World is a lot to build for one row."""
    try:
        stamp = path.stat().st_mtime_ns
        held = _peeked.get(path)
        if held and held[0] == stamp:
            return held[1]
        data = json.loads(_text(path))
    except (ValueError, OSError):
        return None
    if not isinstance(data, dict) or not data.get("genesis_done"):
        return None
    hero = data.get("player") or {}
    story = data.get("story") or {}
    out = {
        "name": data.get("name", "A world"), "seed": data.get("seed", 0), "hero": data.get("hero", ""), "god": data.get("god_name", ""), "god_is": data.get("god_is", "goddess"),
        "difficulty": data.get("difficulty", "fair"), "clock": data.get("clock", 0), "stage": story.get("stage", 0), "ending": data.get("ending"), "level": hero.get("level", 1),
        "kills": hero.get("kills", 0), "deaths": hero.get("deaths", 0), "nights": hero.get("best_nights", 0), "laws": len(data.get("edicts") or []), "creative": hero.get("creative", False),
        "descended": hero.get("descended", False), "played_at": int(stamp / 1e9),
    }
    _peeked[path] = (stamp, out)
    return out


def discard(path: Path) -> None:
    """A deleted world goes to the trash folder, not out of existence: this is the one button that could lose someone a hundred hours."""
    bin_ = path.parent / TRASH
    bin_.mkdir(exist_ok=True)
    path.replace(bin_ / f"{path.stem}-{int(time.time())}{path.suffix}")
    _peeked.pop(path, None)

import json
from collections import Counter
from pathlib import Path

from isekai.persistence.saves import load, save
from isekai.world.map import LAND, build_map

TERRAIN_WORLD = Path(__file__).parent / "client" / "world.json"


def test_saves_keep_emoji_and_old_windows_saves_still_load(world, tmp_path):
    path = tmp_path / "world.json"
    world.push("event", "🔥 The armies attack…")
    save(world, path)
    assert load(path).feed[-1].text == "🔥 The armies attack…"

    world.feed.clear()
    world.name = "Café — Aldervale"
    path.write_bytes(world.model_dump_json().encode("cp1252"))
    assert load(path).name == "Café — Aldervale"


def test_map_has_the_planned_settlements(world):
    assert Counter(s.type for s in world.settlements) == {"human": 4, "city": 2, "elfcity": 1, "elf": 2, "beast": 4}
    assert world.land_at(*world.demon_land).structure == "demon_castle"


def test_every_settlement_has_its_required_jobs(world):
    for s in world.settlements:
        jobs = Counter(r.job for r in s.residents)
        if s.type == "human":
            assert jobs["guild_master"] == 1 and jobs["receptionist"] == 1 and jobs["doctor"] >= 2 and jobs["adventurer"] >= 2
        if s.type == "city":
            assert jobs["king"] + jobs["queen"] == 1
        if s.type == "elfcity":
            assert jobs["elf_king"] + jobs["elf_queen"] == 1 and jobs["guild_master"] == 1 and jobs["receptionist"] == 1
            assert all(r.kind in ("elf", "elf_guard", "elf_royal") for r in s.residents)
        assert 20 <= len(s.residents) <= 180


def test_buildings_do_not_overlap(world):
    # half width, half depth of each BUILD entry in client/js/terrain.js; neighbours may share a wall
    size = {"guild": (4, 3), "hospital": (4, 3), "inn": (3, 3), "smithy": (3, 2), "church": (3, 4), "house": (2, 2),
            "stall": (2, 1), "street_stall": (1, 0), "well": (1, 1), "treehouse": (6, 6), "elfhall": (3, 3), "hut": (3, 3), "chief": (3, 3), "lodge": (3, 2),
            "shrine": (0, 0), "keep": (3, 3), "palace": (6, 6)}
    overlaps = []
    for s in world.settlements:
        bs = s.layout
        for i, a in enumerate(bs):
            for b in bs[i + 1:]:
                (ax, az), (bx, bz) = size[a.kind], size[b.kind]
                if abs(a.x - b.x) <= ax + bx - 1 and abs(a.z - b.z) <= az + bz - 1:
                    overlaps.append((s.name, a.kind, a.x, a.z, b.kind, b.x, b.z))
    assert overlaps == []


def test_cities_keep_all_their_houses(world):
    for city in world.settlements_of("city"):
        assert sum(b.kind == "house" for b in city.layout) == 40


def terrain_world() -> dict:
    lands, settlements, _ = build_map()
    return {"land": LAND, "seed": 7, "lands": [[l.model_dump() for l in row] for row in lands],
            "settlements": [s.model_dump(exclude={"residents"}) for s in settlements]}


def test_the_client_tests_use_the_current_map():
    """tests/client builds terrain from a stored copy of the map. After a deliberate map change, refresh it: python tests/test_world.py"""
    assert json.loads(TERRAIN_WORLD.read_text(encoding="utf-8")) == terrain_world()


if __name__ == "__main__":
    TERRAIN_WORLD.write_text(json.dumps(terrain_world()), encoding="utf-8")

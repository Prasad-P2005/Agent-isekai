from collections import Counter

from isekai.people.roster import make_roster


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
        assert 20 <= len(s.residents) <= 120


def test_llm_plan_is_validated(world):
    s = world.settlements_of("human")[0]
    plan = {"population": 999, "notable_people": [{"name": "Mia", "job": "receptionist", "personality": "cheerful"},
                                                  {"name": "Bob", "job": "dragon_tamer", "personality": "?"}]}
    make_roster(s, plan, world.seed)
    assert len(s.residents) == 60  # population clamped
    assert any(r.name == "Mia" and r.job == "receptionist" for r in s.residents)
    assert not any(r.job == "dragon_tamer" for r in s.residents)


def test_buildings_do_not_overlap(world):
    size = {"guild": (4, 3), "hospital": (4, 3), "inn": (3, 3), "smithy": (3, 3), "church": (4, 4), "house": (3, 3),
            "stall": (2, 2), "well": (1, 1), "treehouse": (6, 6), "elfhall": (3, 3), "hut": (4, 4), "chief": (4, 4), "lodge": (3, 3),
            "shrine": (0, 0), "keep": (4, 4), "palace": (6, 6)}
    for s in world.settlements:
        bs = s.layout
        for i, a in enumerate(bs):
            for b in bs[i + 1:]:
                (ax, az), (bx, bz) = size[a.kind], size[b.kind]
                assert abs(a.x - b.x) > ax + bx - 1 or abs(a.z - b.z) > az + bz - 1, (s.type, a, b)

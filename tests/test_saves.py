"""Saves: progress has to survive crashes, bad files and game updates."""
import json
from pathlib import Path

import pytest

from isekai.core.game import Game
from isekai.core.state import Vec3, World
from isekai.persistence.migrations import CURRENT_VERSION, migrate
from isekai.persistence.saves import load, save
from isekai.systems.story import CHAPTERS
from isekai.systems.people.succession import NEWCOMER_DELAY, SUCCESSOR_DELAY


def old_save(world, version=5):
    world.save_version = version
    return world


def test_a_save_brings_back_the_whole_world(world, tmp_path):
    world.player.gold = 77
    world.story.flags["met_king"] = True
    world.push("narration", "The sky cracks open.")
    world.block_edits = {"5": {"7": 18}}
    world.after(30, "successor", settlement=0, resident=1)
    save(world, tmp_path / "w.json")
    assert load(tmp_path / "w.json") == world


def test_no_save_file_means_no_world(tmp_path):
    assert load(tmp_path / "nothing.json") is None


@pytest.mark.parametrize("content", [b"", b"not json", b"{", b"[]", b'{"seed": "not a number"}'])
def test_an_unreadable_save_means_no_world(tmp_path, content):
    (tmp_path / "w.json").write_bytes(content)
    assert load(tmp_path / "w.json") is None


def test_an_unreadable_save_is_kept_so_a_new_world_cannot_overwrite_it(tmp_path):
    path = tmp_path / "w.json"
    path.write_bytes(b"not json")
    load(path)
    assert not path.exists()
    assert [f.read_bytes() for f in tmp_path.iterdir()] == [b"not json"]


def test_a_failed_save_keeps_the_previous_file(world, tmp_path, monkeypatch):
    path = tmp_path / "w.json"
    save(world, path)
    before = path.read_bytes()

    def disk_full(self, text, **kwargs):
        self.write_bytes(text[:10].encode())
        raise OSError("disk full")

    monkeypatch.setattr(Path, "write_text", disk_full)
    with pytest.raises(OSError):
        save(world, path)
    assert path.read_bytes() == before


def test_a_save_from_before_the_field_was_renamed_still_loads(world, tmp_path):
    data = json.loads(world.model_dump_json())
    del data["save_version"]
    data["society_version"] = 3
    assert World.model_validate(data).save_version == 3


def test_an_old_save_is_upgraded_only_once(world):
    old_save(world)
    assert migrate(world) is True
    assert world.save_version == CURRENT_VERSION
    assert migrate(world) is False


def test_every_upgrade_runs_for_a_very_old_save(world):
    old_save(world, 0)
    world.cooldowns["decree"] = 1_700_000_000
    migrate(world)
    assert world.save_version == CURRENT_VERSION and world.cooldowns == {}


def test_upgrading_keeps_the_king_and_the_players_progress(world):
    old_save(world, 3)
    world.player.gold = 500
    world.story.flags["met_king"] = True
    king = next(r for r in world.capital().residents if r.job == "king")
    king.met = 3
    migrate(world)
    kept = next(r for r in world.capital().residents if r.job == "king")
    assert (kept.id, kept.name, kept.met) == (king.id, king.name, 3)
    assert (world.player.gold, world.story.stage) == (500, 1)


def test_upgrading_moves_the_old_port_village_to_the_coast(world):
    village = next(s for s in world.settlements if (s.lx, s.lz) == (1, 5))
    old_site, coast = world.land_at(2, 5), world.land_at(1, 5)
    coast.settlement, coast.structure = None, "none"
    old_site.settlement, old_site.structure = village.id, "village"
    village.lx, village.cx, village.coastal = 2, 2 * 64 + 32, False
    old_save(world, 3)
    migrate(world)
    assert (village.lx, village.lz, village.cx) == (1, 5, 192) and village.coastal
    assert coast.settlement == village.id and old_site.settlement is None


def test_upgrading_rebuilds_city_layouts_and_rehomes_people(world):
    city = world.capital()
    city.layout = [b.model_copy(update={"x": b.x + 1}) for b in city.layout]
    village = world.settlements_of("human")[0]
    untouched = list(village.layout)
    king = next(r for r in city.residents if r.job == "king")
    king.work.x = -1
    old_save(world, 4)
    migrate(world)
    keep = next(b for b in city.layout if b.kind == "keep")
    assert (keep.x, keep.z) == (city.cx, city.cz) and king.work.x > 0
    assert village.layout == untouched


def test_upgrading_moves_everyone_onto_the_bigger_map(world):
    s = world.settlements[0]
    world.block_edits = {"5": {"7": 18}}
    world.player.pos = Vec3(x=10, y=60, z=10)
    world.player.blocks = {"19": 12}
    s.cx, s.cz, s.streets = s.lx * 64 + 32, s.lz * 64 + 32, []
    s.residents[0].work.x = -1
    old_save(world, 7)
    migrate(world)
    assert (s.cx, s.cz) == (s.lx * 128 + 64, s.lz * 128 + 64) and s.streets and s.residents[0].work.x > 0
    assert world.block_edits == {} and world.player.pos is None and world.player.blocks == {"19": 12}


def test_upgrading_clears_times_from_the_old_wall_clock(world):
    world.cooldowns["demon_raid"] = 1_700_000_000
    world.festival_until = 1_700_000_000
    old_save(world, 4)
    migrate(world)
    assert world.cooldowns == {} and world.festival_until == 0


def test_upgrading_replaces_people_a_restart_lost(world):
    capital = world.capital()
    king = next(r for r in capital.residents if r.job == "king")
    king.dead = True
    old_save(world, 4)
    migrate(world)
    assert [(t.kind, t.data) for t in world.timers] == [("successor", {"settlement": capital.id, "resident": king.id})]
    assert world.timers[0].due == world.clock + SUCCESSOR_DELAY


def test_upgrading_does_not_replace_a_job_someone_still_does(world):
    s = world.settlements_of("human")[0]
    next(r for r in s.residents if r.job == "doctor").dead = True  # the village has a second doctor
    old_save(world, 4)
    migrate(world)
    assert world.timers == []


def test_an_upgraded_save_is_written_back(world, tmp_path):
    path = tmp_path / "w.json"
    save(old_save(world), path)
    Game(path)
    assert load(path).save_version == CURRENT_VERSION


def test_a_new_world_needs_no_upgrade(tmp_path):
    world = Game(tmp_path / "w.json").new_world(seed=7)
    assert migrate(world) is False


def test_an_old_story_carries_over_to_the_oaths(world):
    world.story.flags.update(met_king=True, elf_trust=True, reached_demon_land=True)
    world.story.stage = 1
    old_save(world)
    migrate(world)
    assert world.story.stage == 1 and world.story.flags["oath_elves"]


def test_a_hero_who_already_won_keeps_the_win(world):
    world.demon_lord_dead = True
    world.story.flags["victory"] = True
    old_save(world)
    migrate(world)
    assert world.ending == "hero" and world.story.stage == len(CHAPTERS) - 1


def test_a_hero_who_killed_the_lord_still_has_the_crown_to_decide(world):
    world.demon_lord_dead = True
    world.player.loot["Demon Lord's Crown"] = 1
    old_save(world)
    migrate(world)
    assert world.player.has_crown and world.ending is None and "Demon Lord's Crown" not in world.player.loot


def test_an_oath_sworn_before_the_tree_gave_mana_still_earns_it(world):
    world.story.flags["oath_elves"] = True
    old_save(world, 6)
    migrate(world)
    assert world.player.max_mana == 150


def test_upgrading_gives_no_mana_for_an_oath_not_sworn(world):
    old_save(world, 6)
    migrate(world)
    assert world.player.max_mana == 100


def test_upgrading_keeps_an_old_curse_liftable(world):
    world.player.max_hp = 16
    old_save(world)
    migrate(world)
    assert world.player.cursed_hp == 4


def test_upgrading_queues_newcomers_for_the_empty_homes(world):
    s = world.settlements_of("human")[0]
    farmer = next(r for r in s.residents if not r.service)
    farmer.dead = True
    old_save(world)
    migrate(world)
    assert [(t.kind, t.data, t.due) for t in world.timers] == [("successor", {"settlement": s.id, "resident": farmer.id}, world.clock + NEWCOMER_DELAY)]


def test_old_saves_grow_with_the_map_and_keep_their_places(world):
    old = world.model_copy(deep=True)
    old.lands = [row[:8] for row in old.lands[:8]]
    old.settlements = old.settlements[:13]
    old.save_version = 8
    name = old.settlements[0].name
    migrate(old)
    assert len(old.lands) == 10 and len(old.settlements) == 15 and old.settlements[0].name == name
    assert all(s.name and s.residents for s in old.settlements)
    assert len({s.name for s in old.settlements}) == 15
    assert any(land.structure == "dragon_peak" for row in old.lands for land in row)

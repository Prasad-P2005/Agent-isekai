"""Several worlds in one folder: a new one costs nothing, a closed one cannot be written to, and a deleted one is still on disk."""
from fastapi.testclient import TestClient

from isekai.app import create_app
from isekai.core.game import Game, seed_of
from isekai.persistence.saves import TRASH, load
from isekai.systems import edicts


def make(tmp_path):
    return Game(tmp_path / "first.json")


def test_a_new_world_leaves_the_last_one_alone(tmp_path):
    g = make(tmp_path)
    first = g.new_world(1, name="First")
    first.player.gold = 777
    second = g.new_world(2, name="Second")
    assert second.name == "Second"
    assert g.slot != "first"
    assert load(tmp_path / "first.json").player.gold == 777


def test_worlds_are_listed_last_played_first_and_can_be_reopened(tmp_path):
    g = make(tmp_path)
    g.new_world(1, name="First")
    g.new_world(2, name="Second")
    listed = g.worlds()
    assert [w["name"] for w in listed["worlds"]] == ["Second", "First"]
    assert listed["open"] == g.slot
    assert g.open_slot("first").name == "First"
    assert g.worlds()["worlds"][0]["name"] == "First"
    assert Game(Game._last_played(g.folder)).world.name == "First"  # a restart comes back to it


def test_a_tab_on_another_world_is_turned_away(tmp_path):
    g = make(tmp_path)
    g.new_world(1, name="First")
    with TestClient(create_app(g)) as c:
        slot = c.get("/api/world").json()["slot"]
        c.post("/api/new", json={"name": "Second"})
        stale = c.post("/api/blocks", json={"blocks": {}}, headers={"X-World": slot})
        assert stale.status_code == 409
        assert c.post("/api/blocks", json={"blocks": {}}, headers={"X-World": g.slot}).status_code == 200


def test_rename_copy_and_delete(tmp_path):
    g = make(tmp_path)
    g.new_world(1, name="First")
    g.new_world(2, name="Second")
    assert g.rename_slot("first", "Renamed")
    assert load(tmp_path / "first.json").name == "Renamed"
    copy = g.copy_slot("first")
    assert load(tmp_path / f"{copy}.json").name == "Renamed copy"
    assert g.delete_slot("first")
    assert not (tmp_path / "first.json").exists()
    assert len(list((tmp_path / TRASH).glob("first-*.json"))) == 1


def test_deleting_the_open_world_opens_the_next(tmp_path):
    g = make(tmp_path)
    g.new_world(1, name="First")
    g.new_world(2, name="Second")
    assert g.delete_slot(g.slot)
    assert g.world.name == "First"


def test_slots_cannot_reach_outside_the_folder(tmp_path):
    g = make(tmp_path)
    g.new_world(1)
    (tmp_path.parent / "outside.json").write_text("{}", encoding="utf-8")
    assert g.open_slot("../outside") is None
    assert not g.delete_slot("../outside")


def test_an_import_is_checked_and_becomes_a_new_slot(tmp_path):
    g = make(tmp_path)
    world = g.new_world(1, name="First")
    assert g.import_world({"nonsense": True}) is None
    slot = g.import_world(world.model_dump(mode="json"))
    assert slot != "first"
    assert load(tmp_path / f"{slot}.json").name == "First"


def test_new_world_choices_are_kept(tmp_path):
    g = make(tmp_path)
    w = g.new_world(1, name="  Two   words  ", difficulty="hard", creative=True, god_is="god", brief=True)
    assert (w.name, w.difficulty, w.player.creative, w.god_is, w.brief) == ("Two words", "hard", True, "god", True)
    assert g.new_world(1, difficulty="impossible").difficulty == "fair"


def test_a_seed_keeps_its_world_whether_or_not_it_is_named(tmp_path):
    g = make(tmp_path)
    assert g.new_world(5).god_name == g.new_world(5, name="Mine").god_name


def test_difficulty_bends_the_rules(tmp_path):
    g = make(tmp_path)
    assert edicts.rule(g.new_world(1, difficulty="fair"), "hurt") == 1
    assert edicts.rule(g.new_world(1, difficulty="gentle"), "hurt") < 1
    assert edicts.rule(g.new_world(1, difficulty="hard"), "hurt") > 1


def test_words_are_seeds_and_the_same_word_is_the_same_seed():
    assert seed_of("moon") == seed_of(" moon ") != seed_of("sun")
    assert seed_of(42) == seed_of("42") == 42
    assert seed_of("") is None and seed_of(None) is None


def test_the_title_has_land_to_show_before_any_world_exists(tmp_path):
    g = make(tmp_path)
    shown = g.vista()
    assert shown["lands"] and shown["settlements"]
    assert not list(tmp_path.glob("*.json"))
    assert g.world is None

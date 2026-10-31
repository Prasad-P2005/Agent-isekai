"""End-to-end API tests."""
from fastapi.testclient import TestClient

from isekai.app import create_app
from isekai.core import commands
from isekai.core.game import Game
from isekai.persistence.saves import load
from isekai.systems import shop
from isekai.systems.people.succession import NEWCOMER_DELAY, SUCCESSOR_DELAY


def test_full_flow(tmp_path):
    app = create_app(Game(tmp_path / "w.json"))
    with TestClient(app) as c:
        assert c.post("/api/new", json={"seed": 7}).status_code == 200
        w = c.get("/api/world").json()
        assert len(w["settlements"]) == 15 and w["laws"]
        assert c.post("/api/heaven", json={"topic": "who_are_you"}).json()["lines"]
        c.post("/api/descend")
        r = c.post("/api/crime", json={"crime": "kill_human", "in_city": False, "realm": "human", "civilians": ["Mia"]}).json()
        assert r["results"][0]["outcome"] == "witnessed"
        r = c.post("/api/report", json={"law": r["results"][0]["law"], "by": "Mia"}).json()
        assert r["effects"]["spawn"]
        king = next(p for p in w["settlements"][[s["type"] for s in w["settlements"]].index("city")]["residents"] if p["job"] == "king")
        sid = [s["type"] for s in w["settlements"]].index("city")
        r = c.post("/api/talk", json={"settlement": sid, "resident": king["id"], "topic": "king_summons"}).json()
        assert r["story"]["stage"] == 1 and r["gift"] and r["reached"]
        assert c.get("/api/service", params={"type": "guild", "settlement": 0}).json()["quests"]
        # the elves set a trial, and bringing what they asked for wins their Oath
        ec = next(s for s in w["settlements"] if s["type"] == "elfcity")
        ruler = next(p for p in ec["residents"] if p["job"] in ("elf_king", "elf_queen"))
        at_court = {"settlement": ec["id"], "resident": ruler["id"]}
        assert any(t["id"] == "elf_trial" for t in c.post("/api/talk", json=at_court).json()["topics"])
        c.post("/api/talk", json={**at_court, "topic": "elf_trial"})
        r = c.post("/api/talk", json={**at_court, "topic": "elf_oath", "blocks": {"16": 3}}).json()
        assert "Heal" in r["gift"] and "heal" in r["player"]["abilities"] and r["player"]["max_mana"] == 150
        assert r["effects"]["take_blocks"] == {"16": 3} and r["player"]["blocks"]["16"] == 0
        # mined blocks are saved
        c.post("/api/blocks", json={"blocks": {"3": 12, "2": 0}})
        assert c.get("/api/world").json()["player"]["blocks"] == {"3": 12}
        r = c.post("/api/event", json={"type": "kill", "kind": "orc"}).json()
        assert "+1 Orc Tusk" in r["messages"] and r["player"]["loot"] == {"Orc Tusk": 1}


def event(client, **body) -> dict:
    return client.post("/api/event", json=body).json()


def talk_to(client, settlement, job: str, topic: str = "hello") -> dict:
    who = next(r for r in settlement.residents if r.job == job)
    return client.post("/api/talk", json={"settlement": settlement.id, "resident": who.id, "topic": topic}).json()


def test_a_potion_can_only_be_drunk_once(client, world):
    assert event(client, type="use", item="potion")["ok"] is True
    assert world.player.potions == 0
    assert event(client, type="use", item="potion")["ok"] is False
    assert world.player.potions == 0


def test_a_mana_potion_is_used_up(client, world):
    world.player.mana_potions = 2
    assert event(client, type="use", item="mana")["ok"] is True
    assert world.player.mana_potions == 1


def test_an_item_that_does_not_exist_cannot_be_used(client):
    assert event(client, type="use", item="elixir")["ok"] is False


def test_spent_mana_is_reported_and_deepens_the_well(client):
    assert event(client, type="cast", mana=60)["player"]["max_mana"] == 100
    r = event(client, type="cast", mana=140)
    assert r["player"]["max_mana"] == 105 and "105" in r["messages"][0]


def test_slaying_the_demon_lord_changes_the_world(client, world):
    world.story.stage = 5
    r = event(client, type="kill", kind="demon_lord")
    assert world.demon_lord_dead
    assert r["player"]["has_crown"] and r["player"]["loot"] == {}
    assert r["story"]["stage"] == 6


def test_your_kills_are_counted(client):
    event(client, type="kill", kind="orc")
    assert event(client, type="kill", kind="wolf")["player"]["kills"] == 2


def test_a_kill_by_another_creature_gives_you_nothing(client, world):
    r = event(client, type="kill", kind="orc", by_player=False)
    assert r["player"]["kills"] == 0 and r["player"]["loot"] == {}


def test_killing_a_resident_gives_no_loot_or_kill_count(client, world):
    s = world.settlements_of("human")[0]
    victim = s.residents[0]
    r = event(client, type="kill", kind=victim.kind, resident={"settlement": s.id, "id": victim.id})
    assert victim.dead and r["player"]["kills"] == 0 and r["player"]["loot"] == {}


def test_dying_is_counted(client, world):
    event(client, type="death", by="a Dire Wolf", kind="wolf")
    assert world.player.deaths == 1


def test_the_monster_that_kills_you_becomes_your_nemesis(client, world):
    event(client, type="death", by="a Dire Wolf", kind="wolf")
    assert world.nemesis.kind == "wolf" and world.pending("nemesis")
    event(client, type="death", by=world.nemesis.name, kind="wolf")
    assert world.nemesis.level == 2
    gold = world.player.gold
    event(client, type="kill", kind="wolf", named="nemesis")
    assert world.nemesis is None and world.player.gold == gold + 80 and not world.pending("nemesis")


def test_a_fall_makes_no_nemesis(client, world):
    event(client, type="death", by="a fall")
    assert world.nemesis is None


def test_the_king_gives_his_reward_only_once(client, world):
    talk_to(client, world.capital(), "king", "king_summons")
    assert world.player.gold == 130
    assert talk_to(client, world.capital(), "king", "king_summons")["gift"] is None
    assert world.player.gold == 130


def test_the_king_rewards_the_returning_hero_only_once(client, world):
    world.demon_lord_dead, world.story.stage, world.player.has_crown = True, 6, True
    r = talk_to(client, world.capital(), "king", "king_crown")
    assert r["story"]["stage"] == 7 and r["player"]["gold"] == 1030 and world.ending == "hero"
    assert talk_to(client, world.capital(), "king", "king_crown")["player"]["gold"] == 1030


def test_an_unknown_crime_is_rejected(client):
    assert client.post("/api/crime", json={"crime": "jaywalking"}).status_code == 400


def test_a_report_of_an_unknown_law_is_rejected(client):
    assert client.post("/api/report", json={"law": "No Such Law", "by": "Mia"}).status_code == 404


def test_an_unknown_settlement_is_not_found(client):
    assert client.get("/api/settlement/99").status_code == 404


def test_the_block_inventory_stays_within_limits(client, world):
    client.post("/api/blocks", json={"blocks": {"3": 99999, "4": -5}})
    assert world.player.blocks == {"3": 9999}


def test_nothing_can_happen_before_a_world_exists(client, game):
    game.world = None
    assert client.post("/api/event", json={"type": "death"}).status_code == 409


def test_mined_blocks_and_the_inventory_are_saved_together(client, game):
    client.post("/api/blocks", json={"blocks": {"19": 1}, "edits": {"1081360": {"7": 0, "8": 18}}})
    saved = load(game.save_path)
    assert saved.player.blocks == {"19": 1} and saved.block_edits == {"1081360": {"7": 0, "8": 18}}


def test_later_edits_add_to_earlier_ones(client, world):
    client.post("/api/blocks", json={"blocks": {}, "edits": {"5": {"7": 0}}})
    client.post("/api/blocks", json={"blocks": {}, "edits": {"5": {"7": 18, "8": 0}}})
    assert world.block_edits == {"5": {"7": 18, "8": 0}}


def test_impossible_block_edits_are_ignored(client, world):
    client.post("/api/blocks", json={"blocks": {}, "edits": {"5": {"99999999": 1, "7": 250}, "not-a-chunk": {"7": 1}}})
    assert world.block_edits == {}


def test_the_world_sent_to_the_client_includes_block_edits(client, world):
    world.block_edits = {"5": {"7": 18}}
    assert client.get("/api/world").json()["block_edits"] == {"5": {"7": 18}}


def report(client, **body):
    client.post("/api/context", json={"playing": True, **body})


def test_where_the_player_stands_is_saved(client, game):
    report(client, x=10.5, y=70, z=-3, hp=12.5, mana=40, wanted=33, day_time=0.6)
    p = load(game.save_path)
    assert (p.player.pos.x, p.player.pos.y, p.player.pos.z) == (10.5, 70, -3)
    assert (p.player.hp, p.player.mana, p.player.wanted, p.day_time) == (12.5, 40, 33, 0.6)


def test_reported_health_stays_within_limits(client, world):
    report(client, hp=9999)
    assert world.player.hp == 20


def test_only_a_playing_client_keeps_the_clock_running(client, game):
    game.world.player.descended = True
    assert not game.playing()
    report(client)
    assert game.playing()
    client.post("/api/context", json={"playing": False})
    assert not game.playing()


def test_polling_the_feed_does_not_count_as_playing(client, game):
    game.world.player.descended = True
    client.get("/api/feed")
    assert not game.playing()


def test_a_client_that_stops_reporting_stops_the_clock(client, game):
    game.world.player.descended = True
    report(client)
    game.last_report -= 60
    assert not game.playing()


def test_buying_through_the_api_is_saved(client, game, world):
    world.player.gold = 100
    client.post("/api/service", json={"type": "trade", "action": "buy", "item": "potion"})
    assert load(game.save_path).player.gold == 85


def kill_resident(game, s, job):
    who = next(r for r in s.residents if r.job == job)
    commands.kill(game, who.kind, {"settlement": s.id, "id": who.id}, by_player=True)
    return who


def test_dead_shopkeeper_gets_a_successor(game):
    s = game.world.settlements_of("human")[0]
    before = len(s.residents)
    m = kill_resident(game, s, "merchant")
    game.tick(SUCCESSOR_DELAY)
    heir = next(r for r in s.residents if r.id == m.id)
    assert m.dead and not heir.dead and len(s.residents) == before
    assert (heir.job, heir.service, heir.work) == ("merchant", "trade", m.work)


def test_a_successor_takes_time_to_arrive(game):
    s = game.world.settlements_of("human")[0]
    m = kill_resident(game, s, "merchant")
    game.tick(SUCCESSOR_DELAY - 1)
    assert m in s.residents and m.dead


def test_a_successor_arrives_even_if_the_server_restarts(game, tmp_path):
    s = game.world.capital()
    kill_resident(game, s, "king")
    restarted = Game(game.save_path)
    restarted.tick(SUCCESSOR_DELAY)
    assert any(r.job == "king" and not r.dead for r in restarted.world.capital().residents)


def test_a_new_king_takes_the_throne(game):
    s = game.world.capital()
    kill_resident(game, s, "king")
    game.tick(SUCCESSOR_DELAY)
    heir = next(r for r in s.residents if r.job == "king" and not r.dead)
    assert game.world.king_name == heir.name == s.ruler


def test_a_new_elven_ruler_takes_over_in_the_objective_too(game):
    s = game.world.settlements_of("elfcity")[0]
    game.world.story.stage = 1
    kill_resident(game, s, game.world.elf_ruler_title)
    game.tick(SUCCESSOR_DELAY)
    heir = next(r for r in s.residents if r.job == game.world.elf_ruler_title and not r.dead)
    assert game.world.elf_ruler_name == heir.name == s.ruler


def test_a_blessing_stays_spent_when_the_priest_is_replaced(game):
    s, p = game.world.settlements_of("human")[0], game.world.player
    p.gold = 1000
    priest = next(r for r in s.residents if r.job == "priest")
    shop.use_service(game.world, "priest", "bless", priest.id)
    kill_resident(game, s, "priest")
    game.tick(SUCCESSOR_DELAY)
    shop.use_service(game.world, "priest", "bless", priest.id)
    assert p.max_hp == 25


def test_a_newcomer_moves_into_a_farmers_home_after_a_while(game):
    s = game.world.settlements_of("human")[0]
    farmer = kill_resident(game, s, "farmer")
    game.tick(SUCCESSOR_DELAY)
    assert farmer in s.residents
    game.tick(NEWCOMER_DELAY - SUCCESSOR_DELAY)
    assert farmer not in s.residents and not next(r for r in s.residents if r.id == farmer.id).dead

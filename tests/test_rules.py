from isekai.economy import guild, shop
from isekai.laws import laws
from isekai.story.stages import advance, objective


def test_murder_without_witness_goes_unpunished(world):
    r = laws.judge(world, "kill_human", in_city=True, realm="human", lawmen=[], civilians=[])
    assert [x["outcome"] for x in r] == ["unseen"]
    assert world.player.notoriety == 0


def test_murder_seen_by_civilian_needs_a_report(world):
    r = laws.judge(world, "kill_human", True, "human", [], ["Mia"])
    assert r[0]["outcome"] == "witnessed" and r[0]["witnesses"] == ["Mia"]
    fx = laws.punish(world, laws.find_law(world, r[0]["law"]), "Mia")
    assert fx["spawn"][0]["kind"] == "golem" and world.player.notoriety == 1


def test_guard_punishes_on_the_spot(world):
    r = laws.judge(world, "kill_human", False, "human", ["Sir Gareth"], [])
    assert r[0]["outcome"] == "punished"


def test_divine_law_needs_no_witness(world):
    r = laws.judge(world, "kill_elf", False, "elf", [], [])
    assert r[0]["outcome"] == "punished" and r[0]["by"] == "the gods themselves"


def test_scope_limits_laws(world):
    assert laws.judge(world, "attack_civilian", in_city=False, realm="human", lawmen=["x"], civilians=[]) == []


def test_validate_law_rejects_garbage():
    assert laws.validate_law({"crime": "jaywalking"}) is None
    l = laws.validate_law({"crime": "vandalism", "scope": "moon", "punishment": "death", "severity": 99})
    assert (l.scope, l.punishment, l.severity) == ("everywhere", "bounty", 4)


def test_shop_and_loot(world):
    world.player.gold = 100
    assert "Bought" in shop.buy(world, "iron_sword") and world.player.weapon == 3
    assert "already" in shop.buy(world, "iron_sword")
    world.player.loot["Orc Tusk"] = 2
    shop.sell(world, "Orc Tusk", all_=True)
    assert world.player.loot["Orc Tusk"] == 0 and world.player.gold == 100 - shop.price(world, "iron_sword") + 28


def test_guild_quest_flow(world):
    q = guild.board(world, 0)[0]
    guild.accept(world, 0, 0)
    for _ in range(q.count):
        guild.on_kill(world, q.kind)
    gold = world.player.gold
    assert "complete" in guild.turn_in(world)
    assert world.player.gold == gold + q.reward and world.player.guild_done == 1


def test_story_advances_on_flags(world):
    assert "King" in objective(world)
    world.story.flags["met_king"] = True
    assert advance(world) and world.story.stage == 1


def test_llm_names_are_cleaned():
    from isekai.god.genesis import clean_name
    assert clean_name("King King Thorne-Brick, ruler of Nebula") == "Thorne-Brick"
    assert clean_name("Ironwood Marshes (East)") == "Ironwood Marshes"
    assert clean_name('"Queen Seraphine"') == "Seraphine"
    assert clean_name('demon_lord_name": "Lich-King O') == ""


def test_no_demon_raids_before_the_story_starts(world):
    from isekai.game import Game
    from isekai.god.narrator import allowed_events
    g = Game.__new__(Game)
    g.world, g.ctx = world, {}
    assert "demon_raid" not in allowed_events(g)
    world.story.stage = 1
    assert "demon_raid" in allowed_events(g)


def test_slaying_the_demon_lord_early_skips_to_the_ending(world):
    world.demon_lord_dead = True
    assert advance(world) and "Return to King" in objective(world)
    world.story.flags["victory"] = True
    advance(world)
    assert "saved the world" in objective(world)


def test_narration_debris_is_removed():
    from isekai.god.narrator import clean_text
    assert clean_text('"The sky cracks open.",') == "The sky cracks open."


def test_prose_debris_is_removed():
    from isekai.god.genesis import clean_prose
    assert clean_prose('"I saw your spark.", "first_words": ["Welcome"] }, {') == "I saw your spark."
    assert clean_prose("Hero Name (Original): Marcus Thorne") == "Marcus Thorne"
    assert clean_prose("a young knight-errant: brave but clumsy") == "a young knight-errant: brave but clumsy"

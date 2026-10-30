"""The game clock: everything scheduled runs on it, so pausing the game pauses all of it."""
from isekai.systems import guild, shop
from isekai.systems.storyteller import QUIET_SPELL, WAR_EASE, WAR_PER_RAID, omen, run_event


def test_raids_come_on_schedule(game):
    w = game.world
    w.story.stage, w.raid_every = 1, 300
    game.tick(5)
    assert w.raid_level == 0
    game.tick(299)
    assert w.raid_level == 0
    game.tick(1)
    assert w.raid_level == 1


def test_no_raids_before_the_story_starts(game):
    game.world.raid_every = 300
    game.tick(1000)
    game.tick(1000)
    assert game.world.raid_level == 0


def test_no_raids_after_the_demon_lord_dies(game):
    w = game.world
    w.story.stage, w.raid_every, w.demon_lord_dead = 1, 300, True
    game.tick(1000)
    game.tick(1000)
    assert w.raid_level == 0


def test_a_festival_ends_on_the_game_clock(game):
    game.ctx = {"in_settlement": True}
    assert run_event(game, "festival") is True
    assert shop.price(game.world, "potion") == 12
    game.tick(179)
    assert shop.price(game.world, "potion") == 12
    game.tick(2)
    assert shop.price(game.world, "potion") == 15


def test_an_event_can_happen_again_after_its_cooldown(game):
    run_event(game, "merchant_caravan")
    game.tick(179)
    assert run_event(game, "merchant_caravan") is False
    game.tick(1)
    assert run_event(game, "merchant_caravan") is True


def spoken(game) -> list[str]:
    return [i.text for i in game.world.feed if i.type == "narration"]


def test_the_god_speaks_up_after_a_quiet_spell(game):
    game.world.mark("narration")
    game.tick(QUIET_SPELL - 1)
    assert spoken(game) == []
    game.tick(1)
    assert len(spoken(game)) == 1


def test_world_events_happen_with_no_one_to_cause_them(game):
    game.ctx = {"in_settlement": True}
    omen(game)
    assert [i.data["event"] for i in game.world.feed if i.type == "event"]
    assert game.world.pending("omen")


def test_a_raid_presses_on_prices_and_quiet_times_ease_them(game):
    w = game.world
    w.story.stage = 1
    run_event(game, "demon_raid", cause="the rules")
    assert w.war_pressure == WAR_PER_RAID
    game.tick(60)
    assert w.war_pressure == WAR_PER_RAID - WAR_EASE


def test_the_quest_board_changes_with_play_time(game):
    first = [q.title for q in guild.board(game.world, 0)]
    assert [q.title for q in guild.board(game.world, 0)] == first
    boards = set()
    for _ in range(30):
        game.tick(600)
        boards.add(tuple(q.title for q in guild.board(game.world, 0)))
    assert len(boards) > 1


def test_the_clock_is_saved(game):
    from isekai.persistence.saves import load
    game.tick(42)
    assert load(game.save_path).clock == 42

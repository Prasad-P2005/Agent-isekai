from isekai.core.state import GuildQuest, Law
from isekai.systems import bag, guild, laws, magic, shop
from isekai.systems.story import advance, objective


def law(punishment: str, severity: int = 2) -> Law:
    return Law(name="Test Law", crime="kill_human", punishment=punishment, severity=severity)


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


def test_shop_and_loot(world):
    world.player.gold = 100
    assert "Bought" in shop.buy(world, "iron_sword") and bag.count(world.player, "iron_sword") == 1
    world.player.bag[1] = {"id": "orc_tusk", "n": 2}
    shop.sell(world, "orc_tusk", all_=True)
    assert bag.count(world.player, "orc_tusk") == 0 and world.player.gold == 100 - shop.price(world, "iron_sword") + 28


def test_a_bounty_punishment_raises_the_bounty(world):
    fx = laws.punish(world, law("bounty"), "Mia")
    assert world.player.bounty == 80 and fx["wanted"] == 100


def test_a_fine_is_paid_from_your_gold(world):
    world.player.gold = 100
    fx = laws.punish(world, law("fine"), "Mia")
    assert (world.player.gold, world.player.bounty, fx["wanted"]) == (40, 0, 0)


def test_a_fine_you_cannot_pay_becomes_a_bounty(world):
    world.player.gold = 20
    laws.punish(world, law("fine"), "Mia")
    assert (world.player.gold, world.player.bounty) == (0, 40)


def test_a_curse_takes_an_ability(world):
    world.player.abilities = ["heal"]
    laws.punish(world, law("curse"), "the gods themselves")
    assert world.player.abilities == [] and world.player.max_hp == 20


def test_a_curse_on_someone_with_no_abilities_lowers_max_health(world):
    laws.punish(world, law("curse"), "the gods themselves")
    assert world.player.max_hp == 16


def test_a_curse_never_lowers_max_health_below_ten(world):
    world.player.max_hp = 12
    laws.punish(world, law("curse"), "the gods themselves")
    assert world.player.max_hp == 10


def test_exile_tells_the_client_to_move_you(world):
    fx = laws.punish(world, law("exile"), "Mia")
    assert fx["exile"] is True and fx["wanted"] == 0


def test_guards_come_angry(world):
    fx = laws.punish(world, law("guards"), "Mia")
    assert fx["spawn"] == [{"kind": "knight", "count": 3, "angry": True}]


def test_you_cannot_buy_without_enough_money(world):
    world.player.gold = 59
    shop.buy(world, "iron_sword")
    assert (world.player.gold, bag.count(world.player, "iron_sword")) == (59, 0)


def test_buying_an_unknown_item_changes_nothing(world):
    world.player.gold = 100
    shop.buy(world, "excalibur")
    assert world.player.gold == 100


def test_selling_one_keeps_the_rest(world):
    world.player.gold = 0
    world.player.bag[1] = {"id": "orc_tusk", "n": 3}
    shop.sell(world, "orc_tusk", all_=False)
    assert bag.count(world.player, "orc_tusk") == 2 and world.player.gold == 14


def test_you_cannot_sell_what_you_do_not_have(world):
    world.player.gold = 0
    shop.sell(world, "Orc Tusk", all_=True)
    assert world.player.gold == 0


def test_the_war_raises_prices(world):
    world.war_pressure = 0.2
    assert shop.price(world, "potion") == 18


def test_the_war_can_only_raise_prices_so_far(world):
    world.war_pressure = 5
    assert shop.price(world, "potion") == 20


def test_traders_charge_what_they_think_of_you(world):
    world.player.renown = -40
    assert shop.price(world, "potion") == 20


def test_a_festival_lowers_prices(world):
    world.festival_until = world.clock + 60
    assert shop.price(world, "potion") == 12


def test_services_cost_money(world):
    world.player.gold = 100
    _, effects = shop.use_service(world, "doctor", "treat", None)
    assert world.player.gold == 90 and effects == {"heal": 999}


def test_services_are_refused_without_money(world):
    world.player.gold = 9
    _, effects = shop.use_service(world, "doctor", "treat", None)
    assert world.player.gold == 9 and effects == {}


def test_a_service_nobody_offers_is_refused(world):
    world.player.gold = 100
    _, effects = shop.use_service(world, "doctor", "resurrect", None)
    assert world.player.gold == 100 and effects == {}


def test_a_curse_can_be_lifted_and_gives_back_what_it_took(world):
    world.player.gold = 100
    world.player.max_hp, world.player.abilities = 25, ["heal"]
    laws.punish(world, law("curse"), "the gods themselves")
    laws.punish(world, law("curse"), "the gods themselves")
    assert (world.player.abilities, world.player.max_hp) == ([], 21)
    shop.use_service(world, "doctor", "cure", None)
    assert (world.player.abilities, world.player.max_hp, world.player.gold) == (["heal"], 25, 40)


def test_you_are_not_charged_to_lift_a_curse_you_do_not_have(world):
    world.player.gold = 100
    shop.use_service(world, "doctor", "cure", None)
    assert world.player.gold == 100


def test_a_priest_blesses_you_only_once(world):
    world.player.gold = 1000
    shop.use_service(world, "priest", "bless", 7)
    shop.use_service(world, "priest", "bless", 7)
    assert (world.player.max_hp, world.player.gold) == (25, 920)


def test_a_second_priest_can_bless_you_too(world):
    world.player.gold = 1000
    shop.use_service(world, "priest", "bless", 7)
    shop.use_service(world, "priest", "bless", 8)
    assert world.player.max_hp == 30


def test_a_mana_crystal_deepens_the_well_at_a_temple(world):
    world.player.gold, world.player.blocks = 1000, {"16": 2}
    _, effects = shop.use_service(world, "priest", "attune", 7)
    assert (world.player.max_mana, world.player.blocks["16"], world.player.gold) == (120, 1, 975)
    assert effects == {"mana": 999, "take_blocks": {"16": 1}}


def test_each_attunement_costs_more_than_the_last(world):
    world.player.gold, world.player.blocks = 1000, {"16": 2}
    shop.use_service(world, "priest", "attune", 7)
    shop.use_service(world, "priest", "attune", 7)
    assert (world.player.max_mana, world.player.gold) == (140, 1000 - 25 - 45)


def test_you_cannot_attune_without_a_crystal_or_the_money(world):
    world.player.gold = 1000
    shop.use_service(world, "priest", "attune", 7)
    assert (world.player.max_mana, world.player.gold) == (100, 1000)
    world.player.gold, world.player.blocks = 0, {"16": 1}
    shop.use_service(world, "priest", "attune", 7)
    assert (world.player.max_mana, world.player.blocks["16"]) == (100, 1)


def test_casting_slowly_deepens_the_well(world):
    assert magic.practice(world, 199) is None
    assert "105" in magic.practice(world, 1)
    assert (world.player.max_mana, world.player.mana_practice) == (105, 0)
    assert magic.practice(world, 209) is None  # a deeper well takes longer


def test_paying_your_bounty_clears_it_for_a_fee(world):
    world.player.gold, world.player.bounty = 200, 100
    _, effects = shop.use_service(world, "bounty", "pay", None)
    assert (world.player.gold, world.player.bounty) == (75, 0) and effects["clear_wanted"]


def test_surrender_costs_half_your_money_and_all_your_loot(world):
    world.player.gold, world.player.bounty = 101, 100
    world.player.bag[1] = {"id": "orc_tusk", "n": 3}
    _, effects = shop.use_service(world, "bounty", "surrender", None)
    assert (world.player.gold, world.player.bounty, bag.count(world.player, "orc_tusk")) == (50, 0, 0) and effects["clear_wanted"]


def test_guild_quest_flow(world):
    q = guild.board(world, 0)[0]
    guild.accept(world, 0, 0)
    for _ in range(q.count):
        guild.on_kill(world, q.kind)
    gold = world.player.gold
    assert "complete" in guild.turn_in(world)
    assert world.player.gold == gold + q.reward and world.player.guild_done == 1


def test_only_one_quest_at_a_time(world):
    guild.accept(world, 0, 0)
    first = world.player.active_quest
    guild.accept(world, 0, 1)
    assert world.player.active_quest is first


def test_a_quest_cannot_be_turned_in_early(world):
    world.player.gold = 0
    world.player.active_quest = GuildQuest(title="Hunt", kind="slime", count=2, reward=50, progress=1)
    guild.turn_in(world)
    assert world.player.gold == 0 and world.player.active_quest is not None


def test_only_the_right_monster_counts_for_a_quest(world):
    world.player.active_quest = GuildQuest(title="Hunt", kind="slime", count=2, reward=50)
    guild.on_kill(world, "goblin")
    assert world.player.active_quest.progress == 0


def test_every_second_quest_raises_your_guild_rank(world):
    ranks = []
    for _ in range(4):
        world.player.active_quest = GuildQuest(title="Hunt", kind="slime", count=1, reward=50, progress=1)
        guild.turn_in(world)
        ranks.append(world.player.guild_rank)
    assert ranks == [0, 1, 1, 2]


def test_story_advances_on_flags(world):
    assert "King" in objective(world)
    world.story.flags["met_king"] = True
    assert advance(world) and world.story.stage == 1


def test_no_demon_raids_before_the_story_starts(world):
    from isekai.core.game import Game
    from isekai.systems.storyteller import allowed_events
    g = Game.__new__(Game)
    g.world, g.ctx = world, {}
    assert "demon_raid" not in allowed_events(g)
    world.story.stage = 1
    assert "demon_raid" in allowed_events(g)



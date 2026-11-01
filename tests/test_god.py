"""The god as she is now: Faith, Laws with two lines, the director, sieges, the stones and the fifth line."""
import random
import re
from pathlib import Path

from isekai.content import EDICTS, ITEMS, LINES, REALMS
from isekai.core import commands
from isekai.core.state import Edict, Star, Vec3
from isekai.persistence.migrations import migrate
from isekai.systems import bag, dialogue, edicts, faith, marks, shop, siege, story, storyteller
from isekai.systems.story import advance
from isekai.world.genesis import STONES, place_echoes

ROOT = Path(__file__).parent.parent


def stand_in_capital(world):
    c = world.capital()
    world.player.pos = Vec3(x=c.cx, y=70, z=c.cz)


def ask(world, law="open_hands"):
    """Have her write this Law, whatever she happens to be offering."""
    world.player.petitions += 1
    while law not in [c["id"] for c in edicts.offers(world)]:
        world.player.written += 1
    next(c for c in world.player.deal["cards"] if c["id"] == law)["ink"] = ""  # these tests are about plain Laws
    return edicts.write(world, law)


# ---------- Faith ----------
def test_a_full_bar_is_a_level_a_little_health_and_a_law(world):
    p = world.player
    faith.earn(world, faith.need(1))
    assert (p.level, p.max_hp, p.petitions) == (2, 21, 1)


def test_every_new_bar_starts_with_a_head_start(world):
    faith.earn(world, faith.need(1) - world.player.faith)
    assert world.player.level == 2 and world.player.faith == round(faith.need(2) * faith.HEAD_START)


def test_a_new_hero_starts_with_something_on_the_bar(world):
    assert world.player.faith > 0


def test_the_first_law_is_close(world):
    """Speeding up towards a first reward is what predicts staying, so a first walk should reach it: two lands, five new creatures, ten new things."""
    first_walk = 2 * faith.LAND_WORTH + 5 * faith.SIGHT_WORTH + 10 * faith.BLOCK_WORTH
    assert faith.need(1) - world.player.faith <= first_walk


def test_a_crime_never_takes_a_level_back(world):
    world.player.level, world.player.faith = 4, 3
    faith.lose(world, 500)
    assert (world.player.level, world.player.faith) == (4, 0)


def test_a_run_of_kills_is_worth_more_up_to_a_limit(world):
    assert faith.for_kill("wolf", 3) > faith.for_kill("wolf", 1)
    assert faith.for_kill("wolf", 50) == faith.for_kill("wolf", faith.LONGEST_CHAIN)


def test_something_new_is_credited_once(world):
    before = world.player.faith
    assert faith.found(world, "oak_log") and world.player.faith > before
    assert not faith.found(world, "oak_log")


def test_dying_costs_nothing_earned_but_ends_the_run_of_nights(game):
    p = game.world.player
    p.nights, p.faith, p.level, p.gold = 4, 30, 3, 77
    commands.death(game, "a wolf", "wolf")
    assert (p.nights, p.faith, p.level, p.gold) == (0, 30, 3, 77)


def test_a_close_death_says_how_close(world):
    world.player.faith = faith.need(1) - 5
    assert "5 Faith" in faith.so_close(world)
    world.player.faith = 0
    assert faith.so_close(world) is None


def test_each_night_in_a_row_is_worth_more(world):
    p = world.player
    p.level, p.faith = 30, 0
    faith.dawn(world)
    first = p.faith
    faith.dawn(world)
    assert p.nights == 2 and p.faith - first > first and p.best_nights == 2


# ---------- Laws with two lines ----------
def test_every_law_has_a_gift_and_a_price(world):
    for spec in EDICTS["laws"].values():
        assert spec["gift"] and spec["second"] and spec["gifts"] and spec["costs"], spec["name"]


def test_a_law_changes_the_rules(world):
    ask(world)
    assert edicts.rule(world, "loot") == 2 and edicts.rule(world, "monster_cap") == 1.5


def test_a_law_must_be_earned(world):
    assert not edicts.can_ask(world) and edicts.write(world, "open_hands") is None


def test_only_what_she_offers_can_be_written(world):
    world.player.petitions = 1
    held_back = next(law for law in EDICTS["laws"] if law not in [c["id"] for c in edicts.offers(world)])
    assert edicts.write(world, held_back) is None and world.player.petitions == 1


def test_she_offers_three_and_looking_again_changes_nothing(world):
    assert len(edicts.offers(world)) == edicts.OFFERED
    assert edicts.offers(world) == edicts.offers(world)


def test_asking_again_deepens_the_gift_and_not_the_price(world):
    ask(world)
    ask(world)
    assert world.edicts == [Edict(id="open_hands", rank=2)]
    assert edicts.rule(world, "loot") == 2.5 and edicts.rule(world, "monster_cap") == 1.5


def test_a_law_can_only_deepen_so_far(world):
    for _ in range(edicts.BEST_RANK):
        ask(world)
    assert "open_hands" not in [c["id"] for c in edicts.offers(world)]


def test_the_world_only_holds_three(world):
    for law in ("open_hands", "deep_wells", "swift_feet", "iron_skin"):
        ask(world, law)
    assert [e.id for e in world.edicts] == ["deep_wells", "swift_feet", "iron_skin"]


def test_a_new_law_is_announced_with_both_lines(world):
    ask(world)
    item = world.feed[-1]
    assert item.type == "law" and item.data["gift"] and item.data["second"]


def test_forgiveness_softens_the_second_line(world):
    ask(world)
    world.story.flags["forgave"] = True
    assert edicts.rule(world, "monster_cap") == 1.25 and edicts.rule(world, "loot") == 2


def test_prices_follow_the_laws(world):
    before = shop.price(world, "potion")
    ask(world, "fair_measure")
    assert shop.price(world, "potion") < before


def test_every_rule_something_sets_is_read_somewhere():
    client = "\n".join(p.read_text(encoding="utf8") for p in (ROOT / "client/js").rglob("*.js"))
    server = "\n".join(p.read_text(encoding="utf8") for p in (ROOT / "isekai").rglob("*.py"))
    read = set(re.findall(r"\brule\('(\w+)'\)", client)) | set(re.findall(r'rule\(\w+, "(\w+)"\)', server)) | {"day_speed", "night_speed"}
    named = {k for spec in EDICTS["laws"].values() for k in (*spec["gifts"], *spec["costs"])} | {k for r in REALMS.values() for k in r["law"]["effects"]}
    assert named - read == set()


def test_prayer_offers_a_law_only_when_one_is_earned(world):
    assert not any(t["id"] == "petition" for t in dialogue.pray_menu(world, random.Random(1)))
    world.player.petitions = 1
    out = dialogue.pray(world, "petition", lambda: "")
    assert len(out["petition"]) == edicts.OFFERED and any(t["id"] == "petition" for t in out["topics"])
    law = out["petition"][0]["id"]
    dialogue.pray(world, f"law:{law}", lambda: "")
    assert [e.id for e in world.edicts] == [law] and world.player.petitions == 0


# ---------- how she decides ----------
def hands(world, count=300):
    """What she would offer, again and again, with nothing but the draw changing."""
    out = []
    for n in range(count):
        world.player.written, world.player.deal, world.player.shown = n, {}, []
        out += [c["id"] for c in edicts.offers(world)]
    return out


def sign_share(laws, sign):
    return sum(EDICTS["laws"][law]["sign"] == sign for law in laws) / len(laws)


def test_every_law_says_what_it_is_and_why_it_might_come():
    for spec in EDICTS["laws"].values():
        assert spec["tier"] in EDICTS["tiers"] and spec["sign"] in EDICTS["why"], spec["name"]
        assert all(m in EDICTS["why"] for m in spec.get("moods", ())), spec["name"]


def test_what_the_hero_does_is_what_she_thinks_about(world):
    world.player.deeds = {"stone": 50.0}
    digging = sign_share(hands(world), "stone")
    world.player.deeds = {"blade": 50.0}
    assert digging > 0.25 and digging > sign_share(hands(world), "stone") * 2


def test_how_the_hero_is_doing_changes_what_comes(world):
    world.player.gold = 1000
    calm = hands(world)
    world.player.gold, world.player.hp = 0, 1
    hurt = hands(world)
    wanted = {law for law, spec in EDICTS["laws"].items() if "hurting" in spec.get("moods", ())}
    assert sum(law in wanted for law in hurt) > sum(law in wanted for law in calm)


def test_a_hand_has_a_spread_of_signs(world):
    cards = edicts.offers(world)
    assert len({EDICTS["laws"][c["id"]]["sign"] for c in cards}) == len(cards)


def test_fabled_laws_wait_until_the_hero_has_written_a_few(world):
    world.player.written = 0
    assert all(EDICTS["laws"][c["id"]]["tier"] != "fabled" for c in edicts.offers(world))


def test_a_long_dry_spell_makes_something_rare_likelier(world):
    def rare_share(dry):
        world.player.dry, seen = dry, 0
        for n in range(300):
            world.player.written, world.player.deal, world.player.dry = 5 + n, {}, dry
            seen += any(c["tier"] != "common" for c in edicts.offers(world))
        return seen
    assert rare_share(8) > rare_share(0)


def test_she_asks_after_a_law_only_if_the_hero_could_use_it(world):
    assert "open_sky" not in hands(world)
    world.player.abilities.append("flight")
    assert "open_sky" in hands(world, 1500)


def test_a_law_written_in_gold_gives_more_for_the_same_price(world):
    world.edicts = [Edict(id="open_hands", ink="gold")]
    assert edicts.rule(world, "loot") == 2.5 and edicts.rule(world, "monster_cap") == 1.5


def test_a_law_written_in_red_weighs_more_on_both_lines(world):
    world.edicts = [Edict(id="open_hands", ink="red")]
    assert edicts.rule(world, "loot") > 2 and edicts.rule(world, "monster_cap") > 1.5


def test_other_words_are_a_new_hand_once_for_each_law(world):
    world.player.petitions = 1
    first = edicts.offers(world)
    assert edicts.redraw(world) and edicts.offers(world) != first
    assert not edicts.redraw(world)
    edicts.write(world, edicts.offers(world)[0]["id"])
    world.player.petitions = 1
    assert edicts.can_redraw(world)


def test_a_law_stone_adds_a_better_card(world):
    world.player.petitions, world.player.written = 1, 4
    here = edicts.offers(world, at_stone=True)
    assert len(here) == edicts.OFFERED + 1 and here[-1]["tier"] != "common"
    assert edicts.offers(world) == here and edicts.write(world, here[-1]["id"])


def test_a_law_written_quiets_what_she_was_thinking_about(world):
    world.player.deeds = {"stone": 10.0}
    ask(world)
    assert world.player.deeds["stone"] < 10


def test_the_book_keeps_every_law_she_has_shown(world):
    shown = edicts.offers(world)
    book = edicts.codex(world)
    assert len(book["seen"]) == len(shown) and book["all"] == len(EDICTS["laws"])
    for _ in range(6):
        world.player.written += 1
        edicts.offers(world)
    assert len(edicts.codex(world)["seen"]) > len(shown)


def test_she_says_what_she_has_been_watching(world):
    world.player.deeds = {"stone": 3.0, "blade": 1.0}
    assert edicts.watching(world) == EDICTS["watching"]["stone"]


def test_a_law_says_how_rare_it_was(world):
    ask(world, "open_hands")
    assert world.feed[-1].data["tier"] == "common"


def test_she_remarks_on_a_good_hand(world):
    world.player.petitions, world.player.written = 1, 3
    world.player.deal = {"at": "3:0", "cards": [{"id": "glass_blade", "why": "wild", "ink": ""}]}
    assert dialogue.pray(world, "petition", lambda: "")["lines"][0] in LINES["pray:hand_fabled"]


# ---------- talking with her ----------
def test_she_greets_the_hero_by_how_things_stand(world):
    world.player.hp = 1
    heard = {dialogue.pray(world, "hello", lambda: "", rng=random.Random(n))["lines"][0] for n in range(20)}
    assert heard & set(LINES["pray:hello:hurting"])


def test_soup_means_something_to_her(world):
    before = world.player.level, world.player.faith
    line = faith.offer(world, "mushroom_stew", 1)
    assert line in LINES["pray:offer_soup"] and (world.player.level, world.player.faith) > before and world.story.flags["gave_soup"]


def test_she_only_remarks_on_the_first_few_things_thrown(world):
    for _ in range(storyteller.THROWS_NOTICED + 2):
        world.cooldowns.pop("narration", None)
        storyteller.saw_a_throw(world)
    assert world.story.counts["throws"] == storyteller.THROWS_NOTICED


def test_she_has_something_to_say_on_every_topic(world):
    for topic in ("pray_more", "pray_back", "pray_self", "pray_deeds", "pray_leaning", "pray_news", "pray_joke", "pray_thanks", "pray_curse", "pray_sins", "pray_offer"):
        assert dialogue.pray(world, topic, lambda: "")["lines"][0] != "…", topic


def test_the_chatter_stays_short_enough_for_the_small_box(world):
    world.player.bounty = 10
    assert len(dialogue.pray_menu(world, random.Random(1), chatting=True)) <= 8 and len(dialogue.pray_menu(world, random.Random(1))) <= 6


def test_she_tells_her_story_in_order_and_then_stops(world):
    first = dialogue.pray(world, "pray_self", lambda: "")["lines"][0]
    second = dialogue.pray(world, "pray_self", lambda: "")["lines"][0]
    assert first != second and world.player.god_told == 2
    world.player.god_told = len(LINES["pray:self"])
    assert dialogue.pray(world, "pray_self", lambda: "")["lines"][0]


def test_she_says_how_far_off_the_next_law_is(world):
    world.player.deeds = {"stone": 5.0}
    left = str(faith.need(1) - world.player.faith)
    assert left in dialogue.pray(world, "pray_leaning", lambda: "")["lines"][0]


def test_what_she_says_of_the_news_is_true(world):
    world.star = Star(x=1, z=1)
    assert any(w in dialogue.pray(world, "pray_news", lambda: "")["lines"][0].lower() for w in ("star", "sky"))


def test_an_offering_leaves_the_hand_and_earns_faith(world):
    bag.give(world, "ruby", 2)
    before = world.player.faith
    dialogue.pray(world, "pray_offer", lambda: "", held={"id": "ruby", "n": 2})
    assert bag.count(world.player, "ruby") == 0 and world.player.faith > before


def test_only_one_gift_counts_at_a_time(world):
    bag.give(world, "ruby", 2)
    dialogue.pray(world, "pray_offer", lambda: "", held={"id": "ruby", "n": 1})
    after = world.player.faith
    dialogue.pray(world, "pray_offer", lambda: "", held={"id": "ruby", "n": 1})
    assert world.player.faith == after and bag.count(world.player, "ruby") == 1


def test_nothing_can_be_offered_that_is_not_held(world):
    before = world.player.faith
    dialogue.pray(world, "pray_offer", lambda: "", held={"id": "ruby", "n": 5})
    assert world.player.faith == before and not world.player.parcels


def test_a_kind_word_is_worth_a_little_now_and_then(world):
    before = world.player.faith
    dialogue.pray(world, "pray_thanks", lambda: "")
    once = world.player.faith
    dialogue.pray(world, "pray_thanks", lambda: "")
    assert once > before and world.player.faith == once


def test_a_law_stone_can_be_prayed_at_and_other_stones_cannot(world):
    ids = lambda c: [t["id"] for t in dialogue.menu(world, None, c, None, False, random.Random(1))]
    assert "stone_pray" in ids("law_stone") and "stone_pray" not in ids("cairn")


def test_a_night_at_the_inn_can_bring_a_dream(world):
    storyteller.dream(world)
    item = world.feed[-1]
    assert item.type == "scene" and item.data["lines"][1]["who"] == world.god_name
    storyteller.dream(world)
    assert world.feed[-1] is item


def test_there_are_no_dreams_once_she_is_silent(world):
    world.ending = "broken"
    storyteller.dream(world)
    assert not any(i.type == "scene" for i in world.feed)


# ---------- the director ----------
def test_someone_on_the_ropes_is_sent_relief(game):
    w = game.world
    w.player.hp = 2
    w.mark("hero_fell")
    strained = storyteller.strain(game)
    assert strained > 0.8
    assert storyteller._weight(w, "traveller", strained) > storyteller._weight(w, "monster_horde", strained)


def test_someone_cruising_is_sent_trouble(game):
    w = game.world
    calm = storyteller.strain(game)
    assert calm == 0
    assert storyteller._weight(w, "monster_horde", calm) > storyteller._weight(w, "monster_horde", 1)


def test_a_hard_moment_is_followed_by_a_quiet_one(game):
    w = game.world
    before = storyteller._weight(w, "monster_horde", 0)
    w.mark("threat")
    assert storyteller._weight(w, "monster_horde", 0) < before


def test_how_the_hero_fell_decides_what_she_says(game):
    w = game.world
    storyteller.mourn(w, "a fall", "")
    assert any(i.text in LINES["tell:death:fall"] for i in w.feed)


def test_a_blood_moon_makes_the_night_worse_and_ends_at_dawn(game):
    w = game.world
    w.story.stage, game.ctx = 1, {"night": True}
    assert storyteller.run_event(game, "blood_moon")
    assert edicts.rule(w, "monster_cap") == 2 and edicts.for_client(w)["omen"] == "blood_moon"
    game.ctx = {"night": False}
    storyteller.direct(game, 5)
    assert not w.blood_moon and edicts.rule(w, "monster_cap") == 1


def test_a_star_is_marked_and_found_once(game):
    w = game.world
    stand_in_capital(w)
    assert storyteller.run_event(game, "star_fall")
    assert any(m["id"] == "star" for m in marks.quest_marks(w))
    commands.reached_star(game)
    assert w.star is None and w.player.parcels and w.player.parcels[-1].id in ITEMS
    assert storyteller.star_found(w) is None


def test_every_star_gift_is_a_real_item():
    assert [g for g in storyteller.STAR_GIFTS if g not in ITEMS] == []


def test_a_star_nobody_reaches_goes_out(world):
    world.star = Star(x=1, z=1)
    storyteller.star_fades(world)
    assert world.star is None


# ---------- sieges ----------
def besieged(world, story_siege=False):
    far = next(s for s in world.settlements if s.id != world.capital().id)
    stand_in_capital(world)
    siege.begin(world, far, story=story_siege)
    return far


def test_a_siege_waits_for_the_hero_to_arrive(world):
    far = besieged(world)
    assert not world.siege.begun and any(m["id"] == "siege" for m in marks.quest_marks(world))
    assert siege.on_kill(world, "imp") is None
    siege.entered(world, far.lx, far.lz)
    assert world.siege.begun and world.feed[-1].data["count"] == world.siege.needed


def test_breaking_the_assault_saves_the_town(world):
    far = besieged(world)
    siege.entered(world, far.lx, far.lz)
    gold = world.player.gold
    for _ in range(world.siege.needed):
        siege.on_kill(world, "imp")
    assert world.siege is None and world.player.gold > gold and not world.pending("siege_end")


def test_only_the_throne_counts_towards_a_siege(world):
    far = besieged(world)
    siege.entered(world, far.lx, far.lz)
    assert siege.on_kill(world, "wolf") is None and world.siege.slain == 0


def test_a_siege_nobody_answers_costs_lives(world):
    far = besieged(world)
    pressure = world.war_pressure
    siege.expired(world)
    assert world.siege is None and world.war_pressure > pressure
    assert sum(r.dead for r in far.residents) == siege.DEAD_WHEN_LOST and world.pending("successor")


def test_the_timer_is_what_ends_a_siege(game):
    w = game.world
    besieged(w)
    game.tick(siege.TIME + 1)
    assert w.siege is None


def test_the_third_oath_brings_the_army_to_the_capital(game):
    w = game.world
    w.story.flags.update(met_king=True, oath_crown=True, oath_elves=True, oath_tribes=True)
    game.check_story()
    assert w.siege and w.siege.story and w.siege.settlement == w.capital().id


def test_the_capital_remembers_how_it_went(game):
    w = game.world
    far = besieged(w, story_siege=True)
    siege.entered(w, far.lx, far.lz)
    for _ in range(w.siege.needed):
        siege.on_kill(w, "imp")
    assert w.story.flags["capital_held"] and "king_held" in story.offered(w, "king")


# ---------- the stones ----------
def test_there_is_one_stone_for_each_who_came_before_the_cairn(world):
    place_echoes(world)
    assert len(world.echoes) == STONES == 11
    assert all(f"echo_{i}" in story.BEATS for i in range(STONES))


def test_the_first_stone_is_beside_where_the_hero_lands(world):
    place_echoes(world)
    first = world.echoes[0]
    assert abs(first.x - world.spawn.x) < 12 and abs(first.z - world.spawn.z) < 12


def test_no_two_stones_share_a_land(world):
    place_echoes(world)
    lands = {(int(e.x // 128), int(e.z // 128)) for e in world.echoes[1:]}
    assert len(lands) == STONES - 1


def test_every_stone_speaks_for_itself_and_only_once(world):
    place_echoes(world)
    assert story.offered(world, "echo:3") == ["echo_3"]
    story.play(world, "echo_3")
    assert story.offered(world, "echo:3") == [] and story.offered(world, "echo:4") == ["echo_4"]


def test_reading_a_stone_turns_the_compass_towards_the_rest(world):
    place_echoes(world)
    assert "echo" not in {m["id"] for m in marks.quest_marks(world)}
    story.play(world, "echo_0")
    spots = [m for m in marks.quest_marks(world) if m["id"] == "echo"]
    assert len(spots) == STONES - 1


def test_a_stone_already_read_says_so_and_one_unread_does_not(world):
    fresh = dialogue.talk(world, None, None, "echo:2", "Worn Stone", "hello", random.Random(1))
    assert fresh["lines"][0] in LINES["stone:echo_unread"] and fresh["topics"][0]["id"] == "echo_2"
    story.play(world, "echo_2")
    read = dialogue.talk(world, None, None, "echo:2", "Worn Stone", "hello", random.Random(1))
    assert read["lines"][0] in LINES["stone:echo"]


# ---------- the fifth line ----------
def ready_for_the_fifth(world):
    place_echoes(world)
    world.story.flags.update(met_king=True, oath_crown=True, oath_elves=True, oath_tribes=True, oath_sea=True, read_note=True, god_confessed=True, law_amended=True, lord_slain=True)
    world.demon_lord_dead, world.player.has_crown = True, True
    advance(world)


def read_every_stone(world):
    for i in range(STONES):
        story.play(world, f"echo_{i}")


def test_the_fifth_line_needs_the_names(world):
    ready_for_the_fifth(world)
    world.story.flags["forgave"] = True
    assert "stone_fifth" not in story.offered(world, "law_stone")
    read_every_stone(world)
    assert "stone_fifth" in story.offered(world, "law_stone")


def test_the_fifth_line_needs_forgiveness(world):
    ready_for_the_fifth(world)
    read_every_stone(world)
    assert "stone_fifth" not in story.offered(world, "law_stone")
    story.play(world, "god_forgive")
    assert "stone_fifth" in story.offered(world, "law_stone")


def test_refusing_her_can_be_taken_back(world):
    ready_for_the_fifth(world)
    story.play(world, "god_refuse")
    assert "god_forgive" in story.offered(world, "god") and "god_refuse" not in story.offered(world, "god")


def test_the_fifth_line_frees_every_law_of_its_price(world):
    ready_for_the_fifth(world)
    read_every_stone(world)
    ask(world)
    story.play(world, "god_forgive")
    story.play(world, "stone_fifth")
    assert world.ending == "named" and edicts.rule(world, "loot") == 2 and edicts.rule(world, "monster_cap") == 1
    assert edicts.in_force(world)[0]["second"] == ""


def test_she_confides_as_faith_grows(world):
    assert "confide_1" not in story.offered(world, "god")
    world.player.level = 3
    assert "confide_1" in story.offered(world, "god")


def test_breaking_the_crown_ends_her_laws_too(world):
    ready_for_the_fifth(world)
    ask(world)
    world.player.petitions = 2
    story.play(world, "stone_break")
    assert world.edicts == [] and world.player.petitions == 0 and edicts.for_client(world)["silent"]
    faith.earn(world, faith.need(world.player.level))
    assert world.player.petitions == 0


# ---------- old saves ----------
def test_an_old_save_gets_the_stones_and_credit_for_what_it_did(world):
    world.save_version = 10
    world.player.kills, world.player.seen = 200, ["oak_log"]
    migrate(world)
    assert len(world.echoes) == STONES and world.player.found == ["oak_log"] and world.player.level > 1
    assert not faith.found(world, "oak_log")

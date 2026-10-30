"""The storyline, walked through from the King to each ending, and the talk around it."""
import random

import pytest

from isekai.content import STORY, WORLD
from isekai.core.game import Game
from isekai.core.state import Favor, GuildQuest, Vec3
from isekai.systems import chronicle, dialogue, favors, marks, story
from isekai.systems.lines import fresh
from isekai.systems.marks import quest_marks
from isekai.systems.story import advance, objective
from isekai.systems.storyteller import allowed_events, answer_prayer, decree, nemesis_rises, run_event


def king(world):
    return next(r for r in world.capital().residents if r.job == "king")


def swear_everything(world):
    world.story.flags.update(met_king=True, oath_crown=True, oath_elves=True, oath_tribes=True, oath_sea=True)
    advance(world)


def test_the_four_oaths_are_in_the_journal_only_after_the_king_explains(world):
    assert story.oath_list(world) == []
    world.story.flags["met_king"] = True
    assert len(story.oath_list(world)) == 4


def test_the_crown_will_not_swear_until_the_guild_vouches(world):
    world.story.flags["met_king"] = True
    assert story.offered(world, "king") == ["king_wait"]
    world.player.guild_done = 2
    assert story.offered(world, "king") == ["king_oath"]


def test_each_oath_is_a_different_kind_of_trial(world):
    p = world.player
    story.play(world, "tribe_trial")
    assert "tribe_oath" not in story.offered(world, "chief")
    for _ in range(3):
        story.on_kill(world, "orc")
    assert "tribe_oath" in story.offered(world, "chief")
    story.play(world, "tribe_oath")
    assert "swift" in p.abilities

    story.play(world, "elf_trial")
    assert story.offered(world, "elf") == ["elf_wait"]
    p.blocks["16"] = 3
    assert story.offered(world, "elf") == ["elf_oath"]

    assert story.offered(world, "mermaid_queen") == ["sea_trial"]
    story.play(world, "queen_treaty")
    assert story.offered(world, "mermaid_queen") == ["sea_oath"]
    story.play(world, "sea_oath")
    assert p.max_hp == 30


def test_a_fifth_orc_does_not_count_twice(world):
    story.play(world, "tribe_trial")
    for _ in range(5):
        story.on_kill(world, "orc")
    assert world.story.counts["orcs"] == 3


def test_a_trial_counts_nothing_before_it_is_given(world):
    story.on_kill(world, "orc")
    assert world.story.counts == {}


def test_the_law_cannot_be_amended_without_every_oath_and_the_truth(world):
    world.story.flags.update(met_king=True, oath_crown=True, oath_elves=True, oath_tribes=True, read_note=True, god_confessed=True)
    assert "stone_amend" not in story.offered(world, "law_stone")
    world.story.flags["oath_sea"] = True
    assert "stone_amend" in story.offered(world, "law_stone")


def test_the_story_runs_from_the_oaths_to_the_throne(world):
    swear_everything(world)
    assert "cairn" in objective(world)
    story.play(world, "cairn_read")
    advance(world)
    assert "truth" in objective(world)
    story.play(world, "god_truth")
    advance(world)
    assert "Law Stone" in objective(world)
    story.play(world, "stone_amend")
    advance(world)
    assert world.player.oathbound and world.demon_lord_name in objective(world)


def at_the_crown(world):
    swear_everything(world)
    world.story.flags.update(read_note=True, god_confessed=True, law_amended=True, lord_slain=True)
    world.demon_lord_dead, world.player.has_crown = True, True
    advance(world)
    assert world.story.stage == 6


def test_giving_the_crown_to_the_king_ends_the_story(world):
    at_the_crown(world)
    assert "king_crown" in story.offered(world, "king")
    story.play(world, "king_crown")
    advance(world)
    assert world.ending == "hero" and not world.player.has_crown and world.story.stage == 7


def test_wearing_the_crown_makes_you_the_demon_lord(world):
    at_the_crown(world)
    story.play(world, "god_wear")
    assert world.ending == "crown" and world.player.crowned and world.player.renown < 0


def test_breaking_the_crown_silences_every_law_and_grounds_the_god(world):
    at_the_crown(world)
    story.play(world, "stone_break")
    assert world.ending == "broken" and world.laws == []
    fallen = [r for s in world.settlements for r in s.residents if r.role == "fallen_god"]
    assert [r.name for r in fallen] == [world.god_name]


def test_only_one_ending_can_happen(world):
    at_the_crown(world)
    story.play(world, "king_crown")
    assert story.offered(world, "god") == [] and "stone_break" not in story.offered(world, "law_stone")


def test_a_scene_plays_only_once(world):
    world.player.oathbound = True
    story.play_scene(world, "lord_voice_ready")
    story.play_scene(world, "lord_voice_ready")
    assert sum(i.type == "scene" for i in world.feed) == 1


def test_raids_stop_when_the_story_ends(game):
    game.world.story.stage, game.world.ending = 1, "crown"
    assert "demon_raid" not in allowed_events(game)


# ---------- talking ----------
def everyone(world):
    return next(r for r in world.capital().residents if not r.notable)


def say_to(world, who, topic):
    s = world.settlements[who.id // 1000]
    return dialogue.talk(world, who, s, who.kind, who.name, topic, random.Random(1))


def test_nobody_ever_runs_out_of_things_to_say(world):
    who = everyone(world)
    for topic in ("hello", "chat", "rumor", "self", "place", "mission", "bye"):
        for _ in range(30):
            assert all(line and "{" not in line and "#" not in line for line in say_to(world, who, topic)["lines"])


def test_a_line_does_not_repeat_soon(world):
    rng = random.Random(1)
    heard = [fresh(world, "rumor:general", rng) for _ in range(30)]
    assert len(set(heard)) == len(heard)


def test_a_persons_life_never_changes(world):
    who = everyone(world)
    assert dialogue.life_of(world, who) == dialogue.life_of(world, who)
    assert dialogue.trait_of(world, who) == dialogue.trait_of(world, who)


def test_people_only_tell_their_secret_to_someone_they_know(world):
    who = everyone(world)
    who.told = dialogue.FACETS.index("secret")
    say_to(world, who, "self")
    assert who.told == dialogue.FACETS.index("secret")
    who.met = 3
    say_to(world, who, "self")
    assert who.told == len(dialogue.FACETS)


def test_news_travels_at_walking_pace(world):
    near, far = world.settlements[0], max(world.settlements, key=lambda s: abs(s.lx - world.settlements[0].lx) + abs(s.lz - world.settlements[0].lz))
    world.player.pos = Vec3(x=near.cx, y=60, z=near.cz)
    chronicle.record(world, "dragon")
    assert chronicle.known_at(world, near) and not chronicle.known_at(world, far)
    world.clock += 1000
    assert chronicle.known_at(world, far)


def test_a_grudge_is_remembered(world):
    who = everyone(world)
    who.grudge = True
    say_to(world, who, "hello")
    assert world.said.get("react:grudge")


def test_the_hero_needs_only_a_topic_for_each_story_beat():
    assert all(spec["label"] and spec["lines"] for spec in STORY["beats"].values())


def favor_of_kind(world, s, who, kind):
    for step in range(100):
        world.clock = step * favors.FRESH_EVERY
        offer = favors.offer(world, s, who)
        if offer.kind == kind:
            return offer
    raise AssertionError(f"nobody ever asked for a {kind} favor")


@pytest.mark.parametrize("kind", ["fetch", "hunt", "deliver", "visit"])
def test_every_kind_of_favor_can_be_finished(world, kind):
    s = world.capital()
    who = everyone(world)
    offer = favor_of_kind(world, s, who, kind)
    world.player.favor = offer
    if kind == "fetch":
        world.player.blocks[offer.target] = offer.count
    elif kind == "hunt":
        for _ in range(offer.count):
            favors.on_kill(world, offer.target)
    elif kind == "visit":
        favors.on_enter(world, *map(int, offer.target.split(",")))
    finisher = who
    if kind == "deliver":
        finisher = next(r for o in world.settlements for r in o.residents if str(r.id) == offer.target)
    assert favors.can_finish(world, finisher)
    gold = world.player.gold
    favors.finish(world)
    assert world.player.gold == gold + offer.reward and world.player.favor is None


def test_a_favor_cannot_be_finished_early(world):
    who = everyone(world)
    world.player.favor = Favor(kind="hunt", giver=who.id, giver_name=who.name, settlement=0, summary="x", target="wolf", count=2)
    assert not favors.can_finish(world, who)


# ---------- the god ----------
def test_the_god_writes_a_law_when_the_hero_earns_one(world):
    world.player.notoriety = 2
    assert decree(world)
    assert any(l.name == "The Hero's Restraint" for l in world.laws)


def test_the_god_cannot_write_laws_without_limit(world):
    world.player.notoriety, world.story.stage = 9, 3
    for _ in range(20):
        world.clock += 400
        decree(world)
    assert len(world.laws) <= 8


def test_a_prayer_for_help_leans_on_a_rule(game):
    answer_prayer(game)
    assert any(i.type == "event" for i in game.world.feed)
    before = len(game.world.feed)
    answer_prayer(game)
    assert len(game.world.feed) == before


def test_the_demon_lord_becomes_no_ones_nemesis(world):
    nemesis_rises(world, "demon_lord", "the Demon Lord")
    assert world.nemesis is None


def test_a_named_foe_is_a_real_event(game):
    assert run_event(game, "named_foe") is True
    item = game.world.feed[-1]
    assert item.data["name"] and item.data["power"] > 1


def test_every_new_world_is_different(tmp_path):
    a, b = Game(tmp_path / "a.json").new_world(seed=1), Game(tmp_path / "b.json").new_world(seed=2)
    assert (a.name, a.god_name, a.king_name, [s.name for s in a.settlements]) != (b.name, b.god_name, b.king_name, [s.name for s in b.settlements])
    assert len(a.laws) == 7 and a.genesis_done


def test_the_same_seed_makes_the_same_world(tmp_path):
    a, b = Game(tmp_path / "a.json").new_world(seed=9), Game(tmp_path / "b.json").new_world(seed=9)
    assert a.name == b.name and [s.name for s in a.settlements] == [s.name for s in b.settlements]


def marked(world):
    return {m["id"] for m in quest_marks(world)}


def test_the_marks_begin_with_the_king(world):
    assert marked(world) == {"king"}


def test_every_mark_in_the_story_names_somewhere_in_the_world(world):
    rules = [m for c in STORY["chapters"] for m in c.get("marks", [])] + [m for o in STORY["oaths"].values() for m in o["marks"]]
    for rule in rules:
        assert "hunt" in rule or marks._at(world, rule["at"]), rule


def test_an_oath_marks_only_its_next_step(world):
    world.story.flags["met_king"] = True
    advance(world)
    assert marked(world) == {"guild", "elf", "chief", "mermaid_queen"}
    for trial in ("elf_trial", "tribe_trial", "sea_trial"):
        story.play(world, trial)
    assert marked(world) == {"guild", "crystals", "hunt:orc", "queen"}
    world.player.guild_done, world.player.blocks["16"] = 2, 3
    for _ in range(3):
        story.on_kill(world, "orc")
    story.play(world, "queen_treaty")
    assert marked(world) == {"king", "elf", "chief", "mermaid_queen"}


def test_a_choice_of_places_shares_one_id(world):
    world.story.flags["met_king"] = True
    assert len([m for m in quest_marks(world) if m["id"] == "elf"]) > 1


def test_a_guild_quest_is_hunted_then_handed_in_where_it_was_taken(world):
    s = world.capital()
    q = world.player.active_quest = GuildQuest(title="Wolves", kind="wolf", count=1, reward=5, settlement=s.id)
    assert "hunt:wolf" in marked(world)
    q.progress = 1
    spot = next(m for m in quest_marks(world) if m["id"] == "turn_in")
    assert spot["person"] // WORLD["resident_id_base"] == s.id


def test_a_favor_marks_who_or_where_comes_next(world):
    s, other = world.settlements[0], world.settlements[1]
    giver, friend = s.residents[0], other.residents[0]
    asked = {"giver": giver.id, "giver_name": giver.name, "settlement": s.id, "summary": ""}
    spot = lambda: next(m for m in quest_marks(world) if m["id"] == "favor")
    world.player.favor = Favor(kind="deliver", target=str(friend.id), target_name=friend.name, **asked)
    assert spot()["person"] == friend.id
    world.player.favor = Favor(kind="visit", target=f"{other.lx},{other.lz}", target_name=other.name, **asked)
    assert (spot()["x"], spot()["z"]) == (other.cx, other.cz)
    world.player.favor.progress = 1
    assert spot()["person"] == giver.id

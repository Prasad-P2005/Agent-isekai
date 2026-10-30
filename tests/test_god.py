"""What the god can and cannot do when the LLM really answers."""
import pytest

from fakes import OfflineLLM, ScriptedLLM
from isekai.god import dialogue, heaven
from isekai.god.genesis import run_genesis
from isekai.god.narrator import allowed_events, run_event
from isekai.god.planner import plan_settlement
from isekai.core.state import Law
from isekai.persistence.saves import load

NO_DECREE = {"name": "", "crime": "none", "scope": "everywhere", "needs_witness": True, "punishment": "bounty", "severity": 1}
DIGGING = {**NO_DECREE, "name": "No Digging", "crime": "vandalism"}
GENESIS = {
    "world_name": "Veyra", "premise": "A land of two moons.", "god_name": "Lumi", "god_is": "god", "god_intro": "Hey there, lost soul!",
    "hero": "a wandering baker", "kingdom_name": "the Kingdom of Veyra", "capital_name": "Sunspire", "king_name": "King Thorne, ruler of Sunspire",
    "second_city_name": "Port Mara", "second_city_ruler": "Queen Ilse", "human_villages": ["Oakford", "Reedmere", "Hollowell", "Brightwater"],
    "elf_villages": ["Silverleaf", "Moonshade"], "elf_capital_name": "Aerendil", "elf_ruler_name": "Caelan", "elf_ruler_is": "king",
    "beast_villages": ["Redclaw", "Dawnmane", "Stormhide", "Longtooth"], "demon_lord_name": "Vorath", "demon_realm_name": "the Black Reach",
    "raid_every_minutes": 6, "prosperity": "rich", "currency": "crowns",
    "laws": [{"name": "City Stones", "crime": "vandalism", "scope": "cities", "needs_witness": True, "punishment": "fine", "severity": 1},
             {"name": "Elf Peace", "crime": "kill_elf", "scope": "everywhere", "needs_witness": False, "punishment": "curse", "severity": 2}],
}


def god_turn(narration="The wind turns.", decree=NO_DECREE, event="none") -> dict:
    return {"narration": narration, "decree": decree, "event": event}


async def take_turns(game, *replies) -> None:
    game.llm = ScriptedLLM(GodTurn=list(replies))
    for _ in replies:
        await game.narrator.turn("something happened")


def feed_types(world) -> list[str]:
    return [i.type for i in world.feed]


# ---------- the rules that bind the god ----------
@pytest.mark.parametrize("ctx, allowed", [
    ({}, ["merchant_caravan"]),
    ({"in_settlement": True}, ["merchant_caravan", "festival"]),
    ({"night": True}, ["monster_horde"]),
    ({"night": True, "in_settlement": True}, ["monster_horde"]),
])
def test_time_and_place_decide_which_events_are_allowed(game, ctx, allowed):
    game.ctx = ctx
    assert allowed_events(game) == allowed


def test_raids_end_with_the_demon_lord(game):
    game.world.story.stage = 1
    assert "demon_raid" in allowed_events(game)
    game.world.demon_lord_dead = True
    assert "demon_raid" not in allowed_events(game)


def test_the_god_cannot_trigger_an_event_the_rules_forbid(game):
    assert run_event(game, "demon_raid") is False
    assert game.world.raid_level == 0 and game.world.feed == []


def test_the_rules_can_start_a_raid_the_god_may_not(game):
    assert run_event(game, "demon_raid", cause="the rules") is True
    assert game.world.feed[-1].data == {"event": "demon_raid", "wave": 1}


def test_each_raid_is_the_next_wave(game):
    run_event(game, "demon_raid", cause="the rules")
    run_event(game, "demon_raid", cause="the rules")
    assert game.world.raid_level == 2 and game.world.feed[-1].data["wave"] == 2


def test_an_event_cannot_repeat_during_its_cooldown(game):
    assert run_event(game, "merchant_caravan") is True
    assert run_event(game, "merchant_caravan") is False


def test_the_narrator_keeps_only_three_turns_waiting(game):
    for i in range(5):
        game.narrator.call(f"event {i}")
    assert game.narrator.queue.qsize() == 3


# ---------- a turn of the god ----------
async def test_a_turn_narrates_without_json_debris(game):
    await take_turns(game, god_turn(narration='"The sky cracks open.",'))
    assert [(i.type, i.text) for i in game.world.feed] == [("narration", "The sky cracks open.")]


async def test_a_turn_can_trigger_an_allowed_event(game):
    await take_turns(game, god_turn(event="merchant_caravan"))
    assert feed_types(game.world) == ["narration", "event"]


async def test_a_turn_cannot_trigger_a_forbidden_event(game):
    await take_turns(game, god_turn(event="demon_raid"))
    assert game.world.raid_level == 0 and feed_types(game.world) == ["narration"]


async def test_a_decree_becomes_a_law(game):
    before = len(game.world.laws)
    await take_turns(game, god_turn(decree=DIGGING))
    assert len(game.world.laws) == before + 1 and game.world.laws[-1].name == "No Digging"
    assert feed_types(game.world) == ["narration", "decree"]


async def test_the_god_cannot_decree_more_than_eight_laws(game):
    game.world.laws = [Law(name=f"Law {i}", crime="vandalism") for i in range(8)]
    await take_turns(game, god_turn(decree=DIGGING))
    assert len(game.world.laws) == 8


async def test_the_god_must_wait_between_decrees(game):
    await take_turns(game, god_turn(decree=DIGGING), god_turn(decree={**DIGGING, "name": "No Swimming"}))
    assert [l.name for l in game.world.laws].count("No Swimming") == 0


async def test_a_law_cannot_be_decreed_twice(game):
    before = len(game.world.laws)
    await take_turns(game, god_turn(decree={**DIGGING, "name": game.world.laws[0].name}))
    assert len(game.world.laws) == before


async def test_a_turn_is_saved(game):
    await take_turns(game, god_turn(narration="Remember this."))
    assert load(game.save_path).feed[-1].text == "Remember this."


async def test_a_silent_god_changes_nothing(game):
    await game.narrator.turn("something happened")
    assert game.world.feed == [] and not game.save_path.exists()


# ---------- creating the world ----------
async def test_genesis_builds_the_world_from_the_answer(world):
    await run_genesis(world, ScriptedLLM(Genesis=[GENESIS]))
    assert (world.name, world.god_name, world.god_is) == ("Veyra", "Lumi", "god")
    assert (world.currency, world.prosperity, world.raid_every) == ("crowns", "rich", 360)
    assert [s.name for s in world.settlements_of("city")] == ["Sunspire", "Port Mara"]
    assert (world.elf_ruler_name, world.elf_ruler_title) == ("Caelan", "elf_king")
    assert world.land_at(*world.demon_land).name == "the Black Reach"
    assert world.genesis_done


async def test_genesis_cleans_the_names_it_is_given(world):
    await run_genesis(world, ScriptedLLM(Genesis=[{**GENESIS, "demon_lord_name": 'demon_lord_name": "Lich-King'}]))
    assert world.king_name == "Thorne"
    assert world.settlements_of("city")[1].ruler == "Ilse"
    assert world.demon_lord_name == "Malzareth"


@pytest.mark.parametrize("asked, seconds", [(1, 180), (6, 360), (99, 900)])
async def test_genesis_limits_how_often_raids_come(world, asked, seconds):
    await run_genesis(world, ScriptedLLM(Genesis=[{**GENESIS, "raid_every_minutes": asked}]))
    assert world.raid_every == seconds


async def test_murder_stays_a_crime_whatever_the_god_writes(world):
    await run_genesis(world, ScriptedLLM(Genesis=[GENESIS]))
    assert world.laws[0].crime == "kill_human" and world.laws[0].scope == "everywhere"
    assert [l.name for l in world.laws[1:]] == ["City Stones", "Elf Peace"]


async def test_a_world_with_almost_no_laws_gets_the_default_ones(world):
    await run_genesis(world, ScriptedLLM(Genesis=[{**GENESIS, "laws": []}]))
    assert len(world.laws) == 5


async def test_missing_village_names_are_filled_in(world):
    await run_genesis(world, ScriptedLLM(Genesis=[{**GENESIS, "human_villages": ["Oakford"]}]))
    assert [s.name for s in world.settlements_of("human")] == ["Oakford", "Ashford", "Greenhollow", "Stonebridge"]


# ---------- settlement plans ----------
async def test_a_plan_fills_the_settlement(world):
    s = world.settlements_of("human")[0]
    plan = {"description": "A sleepy mill town.", "population": 30, "rumor": "The well is haunted.",
            "notable_people": [{"name": "Mia", "job": "receptionist", "personality": "cheerful"}]}
    assert await plan_settlement(world, ScriptedLLM(Plan=[plan]), s) is True
    assert s.planned and (s.description, s.rumor) == ("A sleepy mill town.", "The well is haunted.")
    assert next(r for r in s.residents if r.name == "Mia").personality == "cheerful"


async def test_no_plan_leaves_the_default_people_in_place(world):
    s = world.settlements_of("human")[0]
    people = list(s.residents)
    assert await plan_settlement(world, OfflineLLM(), s) is False
    assert not s.planned and s.residents == people


# ---------- talking ----------
async def test_people_remember_what_was_said(world):
    s = world.settlements_of("human")[0]
    who = s.residents[0]
    llm = ScriptedLLM(Line=[{"line": "Hello."}, {"line": "Again?"}])
    await dialogue.speak(world, llm, who, s, "", "", "a casual conversation", "Hi there")
    await dialogue.speak(world, llm, who, s, "", "", "a casual conversation", "Me again")
    assert who.memory == ['Hero: "Hi there"', 'You: "Hello."', 'Hero: "Me again"', 'You: "Again?"']
    assert 'Hero: "Hi there"' in llm.prompts[1]


async def test_memory_keeps_the_last_eight_lines(world):
    s = world.settlements_of("human")[0]
    who = s.residents[0]
    who.memory = [f"line {i}" for i in range(8)]
    await dialogue.speak(world, ScriptedLLM(Line=[{"line": "Hello."}]), who, s, "", "", "a casual conversation")
    assert len(who.memory) == 8 and who.memory[0] == "line 1" and who.memory[-1] == 'You: "Hello."'


async def test_a_person_with_no_answer_says_dots(world):
    s = world.settlements_of("human")[0]
    assert await dialogue.speak(world, OfflineLLM(), s.residents[0], s, "", "", "a casual conversation") == "…"


async def test_the_god_remembers_the_talk_in_heaven(world):
    llm = ScriptedLLM(Reply=[{"reply": "Ehehe, hi!"}, {"reply": "Still here!"}])
    assert await heaven.god_reply(world, llm, "Who are you?") == "Ehehe, hi!"
    await heaven.god_reply(world, llm, "Where am I?")
    assert "Who are you?" in llm.prompts[1] and "Ehehe, hi!" in llm.prompts[1]
    assert world.heaven_chat[0] == ("Soul", "Who are you?")

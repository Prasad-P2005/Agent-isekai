"""The line library is hand-written data, so a typo would only show up mid-conversation. These read every line."""
import re

import pytest

from isekai.content import JOBS, LINES, STORY
from isekai.systems.dialogue import FACETS, TOPICS, TRAITS

BLANK = re.compile(r"\{(\w+)\}")
RULE = re.compile(r"#(\w+)#")
FACTS = {"world", "god", "godkind", "kingdom", "king", "capital", "second_city", "second_ruler", "elf_ruler", "elf_title", "elf_capital", "beast_village",
         "demon_lord", "demon_realm", "currency", "hero", "old_hero"}
SPEECH = {"you", "me", "job", "home", "ruler"}
# what each pool is given besides the facts
EXTRA = {"tell:death": {"by"}, "tell:raid": {"wave"}, "tell:kills": {"kills"}, "tell:successor": {"dead", "heir", "post", "place"},
         "tell:punished": {"deed", "law", "by", "victim"}, "tell:unseen": {"deed", "victim"}, "tell:reported": {"by", "law"},
         "tell:nemesis_named": {"foe", "title", "by"}, "tell:nemesis_slain": {"foe", "title"},
         "event:demon_raid": {"wave"}, "event:named_foe": {"foe", "title"}, "event:nemesis": {"foe", "title"},
         "about:": {"place"}, "tell:arrive:": {"place"}, "favor:": {"thing", "count", "pay", "giver", "target", "summary"} | SPEECH,
         "gossip:raid": {"wave"}, "gossip:festival": {"place"}, "gossip:arrival": {"place"}, "gossip:hero_fell": {"by"}, "gossip:favor": {"giver"},
         "gossip:named_foe": {"foe"}, "gossip:nemesis": {"foe", "title"}, "gossip:murder": {"victim", "place"}}
WRITTEN_BY_THE_GOD = ("tell:", "event:", "pray:", "stone:", "premise", "god_intro", "hero", "about:")


def allowed(pool: str) -> set[str]:
    out = set(FACTS)
    for prefix, names in EXTRA.items():
        if pool == prefix or (prefix.endswith(":") and pool.startswith(prefix)):
            out |= names
    if not pool.startswith(WRITTEN_BY_THE_GOD):
        out |= SPEECH
    return out


def test_every_blank_is_one_the_game_fills():
    wrong = {(pool, name) for pool, lines in LINES.items() for line in lines for name in BLANK.findall(line) if name not in allowed(pool)}
    assert wrong == set()


def test_every_rule_exists():
    assert {name for lines in LINES.values() for line in lines for name in RULE.findall(line) if name not in LINES} == set()


def test_no_line_is_empty_or_written_twice_in_a_pool():
    for pool, lines in LINES.items():
        assert all(line.strip() for line in lines), pool
        assert len(set(lines)) == len(lines), pool


def needed_pools() -> list[str]:
    chapters = [c["id"] for c in STORY["chapters"]]
    pools = [f"{kind}:{t}" for kind in ("greet", "bye", "opener", "closer") for t in TRAITS]
    pools += [f"job:{job}" for job in JOBS["jobs"]] + [f"bio:{f}" for f in FACETS] + ["bio:done", "role:fallen_god"]
    pools += [f"react:{r}" for r in ("crowned", "grudge", "bounty", "cursed", "infamous", "famous", "legend", "friend", "returning")]
    pools += [f"race:{r}" for r in ("human", "elf", "beastkin", "mermaid")] + [f"home:{t}" for t in ("human", "city", "elf", "elfcity", "beast")]
    pools += [f"time:{t}" for t in ("dawn", "day", "dusk", "night")] + [f"state:{s}" for s in ("raid", "festival", "war", "lord_dead")]
    pools += [f"ending:{e}" for e in ("hero", "crown", "broken")]
    pools += [f"act:{n}" for n in range(1, 7)] + [f"rumor:act{n}" for n in range(1, 7)] + [f"pray:act{n}" for n in range(1, 7)] + [f"tell:idle:{n}" for n in range(1, 7)]
    pools += [f"rumor:{t}" for t in ("general", "human", "city", "elf", "elfcity", "beast", "wild")]
    pools += [f"place:{t}" for t in ("human", "city", "elf", "elfcity", "beast", "wild")] + [f"about:{t}" for t in ("human", "city", "elf", "elfcity", "beast")]
    pools += [f"mission:{c}" for c in chapters] + [f"pray:{c}" for c in chapters] + [f"tell:chapter:{c}" for c in chapters[1:]]
    pools += [f"gossip:{g}" for g in ("raid", "festival", "arrival", "hero_fell", "favor", "named_foe", "nemesis", "dragon", "murder", "demon_lord", "oath", "amended", "ending_hero", "ending_crown", "ending_broken")]
    pools += [f"beckon:{s}" for s in ("king", "queen", "elf", "chief", "mermaid_queen")] + ["stone:cairn", "stone:law_stone", "premise", "hero", "god_intro"]
    pools += [f"you_{s}" for s in ("legend", "famous", "known", "stranger", "infamous", "feared")]
    pools += [f"favor:{f}" for f in ("fetch", "hunt", "deliver", "visit", "accepted", "declined", "waiting", "thanks", "delivered")]
    return pools


@pytest.mark.parametrize("pool", needed_pools())
def test_the_code_finds_every_pool_it_asks_for(pool):
    assert LINES.get(pool), pool


def test_every_topic_can_be_said():
    assert all(TOPICS.values())

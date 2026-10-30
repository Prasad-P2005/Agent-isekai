"""What people say. Nothing here is scripted scene by scene: a person's voice comes from who they are (their job, people
and temperament), and what is on their mind comes from the moment (the hour, the war, the hero's deeds and what they have
heard). The story's own conversations are beats in story.py, and they appear here as extra topics."""
from __future__ import annotations

import random

from ..content import CREATURES, LINES, STORY
from ..core.state import Resident, Settlement, World
from . import chronicle, favors, story
from .lines import fill, say, some_of

TRAITS = ("warm", "gruff", "nervous", "cheerful", "weary", "proud", "sly", "dreamy")
FACETS = ("origin", "dream", "fear", "quirk", "secret")
TOPICS = STORY["topics"]
HEAVEN = STORY["heaven"]
OPENER, CLOSER = 0.3, 0.15  # how often a line is framed by the speaker's own turn of phrase


def trait_of(world: World, who: Resident | None, name: str = "") -> str:
    return random.Random(f"{world.seed}:{who.id if who else name}").choice(TRAITS)


def life_of(world: World, who: Resident) -> dict[str, str]:
    """A person's history. Worked out from the world seed, so that it stays the same and costs nothing to keep."""
    rng = random.Random(f"{world.seed}:{who.id}:life")
    return {facet: rng.choice(LINES[f"bio:{facet}"]) for facet in FACETS}


def _blanks(world: World, who: Resident | None, s: Settlement | None, name: str) -> dict:
    you = fill(world, "#you_" + chronicle.standing(world) + "#")
    return {"you": you, "me": who.name if who else name, "job": who.label if who else "", "home": s.name if s else "these parts",
            "ruler": (s.ruler or world.king_name) if s else world.king_name}


def _voiced(world: World, line: str, trait: str, rng: random.Random, blanks: dict) -> str:
    if rng.random() < OPENER:
        line = f"{say(world, f'opener:{trait}', rng, **blanks)} {line}"
    if rng.random() < CLOSER:
        line = f"{line} {say(world, f'closer:{trait}', rng, **blanks)}"
    return line.strip()


def _daypart(world: World) -> str:
    t = world.day_time
    return "dawn" if t < 0.06 or t > 0.97 else "day" if t < 0.44 else "dusk" if t < 0.54 else "night"


def _moment(world: World) -> list[tuple[str, float]]:
    """What is in the air right now, as weighted line pools."""
    pools: list[tuple[str, float]] = [(f"act:{story.act(world)}", 3), (f"time:{_daypart(world)}", 2)]
    if world.clock - world.cooldowns.get("demon_raid", -1e9) < 150:
        pools.append(("state:raid", 8))
    if world.clock < world.festival_until:
        pools.append(("state:festival", 8))
    if world.war_pressure > 0.12:
        pools.append(("state:war", 3))
    if world.demon_lord_dead and not world.ending:
        pools.append(("state:lord_dead", 6))
    if world.ending:
        pools.append((f"ending:{world.ending}", 8))
    return pools


def _small_talk(world: World, who: Resident | None, s: Settlement | None, creature: str, blanks: dict, rng: random.Random) -> str:
    pools = _moment(world)
    if who:
        pools += [(f"job:{who.job}", 5), (f"race:{who.race}", 2), (f"home:{s.type if s else 'human'}", 2)]
        if who.role:
            pools = [(f"role:{who.role}", 1)]
    else:
        race = CREATURES.get(creature, {}).get("race", "human")
        pools += [(f"job:{creature}", 5), (f"race:{race}", 3)]
    return some_of(world, pools, rng, **blanks)


def _greeting(world: World, who: Resident | None, trait: str, blanks: dict, rng: random.Random) -> str:
    p, renown = world.player, chronicle.standing(world)
    if who and who.role:
        return say(world, f"role:{who.role}", rng, **blanks)
    if p.crowned:
        return say(world, "react:crowned", rng, **blanks)
    if who and who.grudge:
        return say(world, "react:grudge", rng, **blanks)
    if p.bounty > 0 and rng.random() < 0.6:
        return say(world, "react:bounty", rng, **blanks)
    if p.cursed_hp or p.cursed_abilities:
        if rng.random() < 0.35:
            return say(world, "react:cursed", rng, **blanks)
    if renown in ("infamous", "feared"):
        return say(world, "react:infamous", rng, **blanks)
    if renown in ("famous", "legend") and rng.random() < 0.6:
        return say(world, f"react:{renown}", rng, **blanks)
    if who and who.met >= 5 and rng.random() < 0.6:
        return say(world, "react:friend", rng, **blanks)
    if who and who.met >= 1 and rng.random() < 0.5:
        return say(world, "react:returning", rng, **blanks)
    return say(world, f"greet:{trait}", rng, **blanks)


def _gossip(world: World, s: Settlement | None, blanks: dict, rng: random.Random) -> str:
    """Real news first, if any has reached this place. Otherwise the kind of thing people say anyway."""
    known = chronicle.known_at(world, s)
    fresh = [d for d in known if world.clock - d.at < 1200]
    if fresh and rng.random() < 0.7:
        deed = rng.choice(fresh[:6])
        line = say(world, f"gossip:{deed.kind}", rng, **blanks, **deed.blanks)
        if line:
            return line
    return some_of(world, [("rumor:general", 5), (f"rumor:act{story.act(world)}", 4), (f"rumor:{s.type if s else 'wild'}", 3)], rng, **blanks)


def _about_self(world: World, who: Resident, blanks: dict, rng: random.Random) -> str:
    if who.told >= len(FACETS) or (FACETS[who.told] == "secret" and who.met < 3):
        return say(world, "bio:done", rng, **blanks)
    line = fill(world, life_of(world, who)[FACETS[who.told]], rng, **blanks)
    who.told += 1
    return line


def _topic(topic: str, rng: random.Random) -> dict:
    return {"id": topic, "label": rng.choice(TOPICS[topic])}


def menu(world: World, who: Resident | None, creature: str, speaker: str | None, offering: bool, rng: random.Random) -> list[dict]:
    items = [{"id": beat, "label": story.label(world, beat), "story": True} for beat in story.offered(world, speaker)]
    if creature in ("cairn", "law_stone"):
        return items + [_topic("bye", rng)]
    if offering:
        return [_topic("favor_accept", rng), _topic("favor_decline", rng)]
    f = world.player.favor
    if favors.can_finish(world, who):
        items.append({"id": "favor_done", "label": rng.choice(TOPICS["favor_done"]), "story": True})
    items += [_topic("chat", rng), _topic("rumor", rng)]
    if who and not who.role:
        items.append(_topic("self", rng))
        items.append(_topic("place", rng))
        if f and f.giver == who.id and not favors.can_finish(world, who):
            items.append(_topic("favor_check", rng))
        elif not f:
            items.append(_topic("help", rng))
    items.append(_topic("mission", rng))
    items.append(_topic("bye", rng))
    return items


def talk(world: World, who: Resident | None, s: Settlement | None, creature: str, name: str, topic: str, rng: random.Random | None = None) -> dict:
    """One exchange. Returns what they say, what the hero could say next, and anything the story or a favor changed."""
    rng = rng or random.Random()
    blanks = _blanks(world, who, s, name)
    trait, speaker = trait_of(world, who, name), story.speaker_of(who, creature)
    lines, gift, fx, offering = [], None, {}, False

    if topic in story.BEATS and topic in story.offered(world, speaker):
        played = story.play(world, topic, rng)
        lines, gift, fx = played["lines"], played["gift"], played["fx"]
    elif creature in ("cairn", "law_stone"):
        lines = [say(world, f"stone:{creature}", rng)]
    elif topic == "hello":
        if who:
            who.met += 1
        beats = story.offered(world, speaker)
        lines = [_voiced(world, _greeting(world, who, trait, blanks, rng), trait, rng, blanks)]
        if beats and speaker:
            lines.append(say(world, f"beckon:{speaker}", rng, **blanks))
    elif topic == "rumor":
        lines = [_voiced(world, _gossip(world, s, blanks, rng), trait, rng, blanks)]
    elif topic == "self" and who:
        lines = [_about_self(world, who, blanks, rng)]
    elif topic == "place":
        about = s.description if s and s.description else say(world, "place:wild", rng, **blanks)
        lines = [about, _voiced(world, say(world, f"place:{s.type if s else 'wild'}", rng, **blanks), trait, rng, blanks)]
    elif topic == "mission":
        lines = [_voiced(world, some_of(world, [(f"mission:{story.CHAPTERS[world.story.stage]['id']}", 3), (f"act:{story.act(world)}", 1)], rng, **blanks), trait, rng, blanks)]
    elif topic == "help" and who and s and not world.player.favor:
        lines, offering = [favors.pitch(world, favors.offer(world, s, who))], True
    elif topic == "favor_accept" and who and s and not world.player.favor:
        world.player.favor = favors.offer(world, s, who)
        lines = [say(world, "favor:accepted", rng, **blanks)]
    elif topic == "favor_decline":
        lines = [say(world, "favor:declined", rng, **blanks)]
    elif topic == "favor_check" and world.player.favor:
        lines = [favors.still_waiting(world)]
    elif topic == "favor_done" and favors.can_finish(world, who):
        line, fx = favors.finish(world)
        lines = [line]
    elif topic == "bye":
        lines = [say(world, f"bye:{trait}", rng, **blanks)]
    else:
        lines = [_voiced(world, _small_talk(world, who, s, creature, blanks, rng), trait, rng, blanks)]
    return {"lines": [l for l in lines if l] or ["…"], "gift": gift, "fx": fx, "topics": menu(world, who, creature, speaker, offering, rng)}


def pray_menu(world: World, rng: random.Random) -> list[dict]:
    items = [{"id": beat, "label": story.label(world, beat), "story": True} for beat in story.offered(world, "god")]
    if world.ending == "broken":
        return items + [_topic("bye", rng)]
    return items + [_topic("pray_guide", rng), _topic("pray_talk", rng), _topic("pray_aid", rng), _topic("bye", rng)]


def pray(world: World, topic: str, answer_aid, rng: random.Random | None = None) -> dict:
    """The hero's prayers. `answer_aid` is the god looking for a rule she can lean on."""
    rng = rng or random.Random()
    gift, fx = None, {}
    if topic in story.BEATS and topic in story.offered(world, "god"):
        played = story.play(world, topic, rng)
        lines, gift, fx = played["lines"], played["gift"], played["fx"]
    elif world.ending == "broken":
        lines = [say(world, "pray:silence", rng)]
    elif topic == "pray_aid":
        lines = [answer_aid()]
    elif topic == "pray_guide":
        lines = [some_of(world, [(f"pray:{story.CHAPTERS[world.story.stage]['id']}", 3), ("pray:guide", 1)], rng)]
    elif topic == "hello":
        lines = [say(world, "pray:hello", rng)]
    elif topic == "bye":
        lines = [say(world, "pray:bye", rng)]
    else:
        lines = [some_of(world, [(f"pray:act{story.act(world)}", 2), ("pray:chatter", 3)], rng)]
    return {"lines": [l for l in lines if l] or ["…"], "gift": gift, "fx": fx, "topics": pray_menu(world, rng)}


def heaven(world: World, topic: str) -> dict:
    """Scene 1: the soul talks with the god before being sent down. Each question opens the next ones."""
    flags, spec = world.story.flags, HEAVEN["topics"].get(topic)
    if topic == "hello":
        lines = [world.god_intro, *HEAVEN["hello"]]
    elif spec and not flags.get(f"asked_{topic}"):
        flags[f"asked_{topic}"] = True
        lines = spec["lines"]
    else:
        lines = HEAVEN["nothing_more"]
    asked = [t for t in HEAVEN["topics"] if flags.get(f"asked_{t}")]
    open_now = list(HEAVEN["first"]) + [o for t in asked for o in HEAVEN["topics"][t].get("opens", [])]
    return {"lines": [fill(world, l) for l in lines],
            "topics": [{"id": t, "label": fill(world, HEAVEN["topics"][t]["label"])} for t in dict.fromkeys(open_now) if not flags.get(f"asked_{t}")]}

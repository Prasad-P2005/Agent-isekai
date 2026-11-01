"""What people say. Nothing here is scripted scene by scene: a person's voice comes from who they are (their job, people
and temperament), and what is on their mind comes from the moment (the hour, the war, the hero's deeds and what they have
heard). The story's own conversations are beats in story.py, and they appear here as extra topics."""
from __future__ import annotations

import random

from ..content import CREATURES, ITEMS, LINES, STORY
from ..core.state import Resident, Settlement, World
from . import bag, chronicle, edicts, faith, favors, story
from .lines import fill, say, some_of

TRAITS = ("warm", "gruff", "nervous", "cheerful", "weary", "proud", "sly", "dreamy")
FACETS = ("origin", "dream", "fear", "quirk", "secret")
TOPICS = STORY["topics"]
HEAVEN = STORY["heaven"]
OPENER, CLOSER = 0.3, 0.15  # how often a line is framed by the speaker's own turn of phrase
HELLO_MOODS = ("blood_moon", "hurting", "wanted", "hunted", "war", "night")  # the first of these that holds is what she opens with, most of the time
HELLO_MOOD_CHANCE = 0.7
ABOUT_YOU = ("pray_deeds", "pray_leaning", "pray_news")  # what she knows, which is always on offer
SMALL_TALK = ("pray_talk", "pray_self", "pray_joke", "pray_thanks", "pray_curse")  # a few of these at a time, so that the box stays small and each visit reads differently
SMALL_TALK_SHOWN = 3
STAY_ON = {*ABOUT_YOU, *SMALL_TALK, "pray_sins", "pray_more"}  # after these she goes on chatting, rather than going back to business


def is_stone(creature: str) -> bool:
    return creature in ("cairn", "law_stone") or creature.startswith("echo:")


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
    if world.blood_moon:
        pools.append(("state:blood_moon", 8))
    if world.siege:
        pools.append(("state:siege", 8))
    pools += [(f"edict:{e.id}", 3) for e in world.edicts]  # people live under what the hero asked for, and they have opinions
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
    if is_stone(creature):
        here = [{**_topic("stone_pray", rng), "story": True}] if creature == "law_stone" and world.ending != "broken" else []
        return items + here + [_topic("bye", rng)]
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
    elif is_stone(creature):
        lines = [say(world, "stone:echo_unread" if creature.startswith("echo:") and story.offered(world, speaker) else f"stone:{creature.partition(':')[0]}", rng)]
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


def pray_menu(world: World, rng: random.Random, chatting: bool = False) -> list[dict]:
    items = [{"id": beat, "label": story.label(world, beat), "story": True} for beat in story.offered(world, "god")]
    if world.ending == "broken":
        return items + [_topic("bye", rng)]
    if edicts.can_ask(world):
        items.insert(0, {"id": "petition", "label": rng.choice(TOPICS["petition"]), "story": True})
    if chatting:
        sins = ["pray_sins"] if world.player.bounty or world.player.notoriety else []
        return items + [_topic(t, rng) for t in (*ABOUT_YOU, *rng.sample([*SMALL_TALK, *sins], SMALL_TALK_SHOWN), "pray_back")]
    return items + [_topic(t, rng) for t in ("pray_guide", "pray_aid", "pray_offer", "pray_more", "bye")]


def _hello(world: World, near: str, rng: random.Random) -> str:
    """She is always watching, so she starts from whatever is happening to the hero."""
    if near == "stone":
        return say(world, "pray:stone", rng)
    now = edicts.moods(world)
    mood = next((m for m in HELLO_MOODS if m in now), None)
    return say(world, f"pray:hello:{mood}" if mood and rng.random() < HELLO_MOOD_CHANCE else "pray:hello", rng)


def _over_the_cards(world: World, cards: list[dict], first: bool, rng: random.Random) -> str:
    """What she says as she lays a hand down, which gives away when it is a good one."""
    pool = "pray:first_law" if first else "pray:hand_fabled" if any(c["tier"] == "fabled" for c in cards) else "pray:hand_ink" if any(c["ink"] for c in cards) else "pray:petition"
    return say(world, pool, rng)


def _her_story(world: World, rng: random.Random) -> str:
    """Told in order, a little at a time, and it is the one thing in the game nobody else will ever hear."""
    told, whole = world.player.god_told, LINES["pray:self"]
    if told >= len(whole):
        return say(world, "pray:self_done", rng)
    world.player.god_told += 1
    return fill(world, whole[told], rng)


def _what_she_saw(world: World, rng: random.Random) -> str:
    p = world.player
    return say(world, f"pray:deeds:{edicts.leaning(world) or 'none'}", rng, kills=p.kills, deaths=p.deaths, nights=p.best_nights, lands=len(world.visited), gold=p.gold)


def _what_she_would_write(world: World, rng: random.Random) -> str:
    """The mechanism, in her own words: what she has been watching is what she is likely to write, and how far off that is."""
    if edicts.can_ask(world):
        return say(world, "pray:leaning:ready", rng)
    p = world.player
    return say(world, f"pray:leaning:{edicts.leaning(world) or 'none'}", rng, left=faith.need(p.level) - p.faith)


def _news(world: World, rng: random.Random) -> str:
    if world.siege:
        return say(world, "pray:news:siege", rng, place=world.settlements[world.siege.settlement].name)
    if world.blood_moon:
        return say(world, "pray:news:blood_moon", rng)
    if world.star:
        return say(world, "pray:news:star", rng)
    if world.nemesis:
        return say(world, "pray:news:nemesis", rng, foe=world.nemesis.name, title=world.nemesis.title)
    return say(world, "pray:news:quiet", rng)


def _offering(world: World, held: dict | None, rng: random.Random) -> str:
    """What is in the hand, given up whole. It goes as a parcel, so it leaves the bag the same way anything the server takes does."""
    item, n = (held or {}).get("id"), int((held or {}).get("n", 0))
    if item not in ITEMS or n <= 0 or bag.count(world.player, item) < n:
        return say(world, "pray:offer_nothing", rng)
    if not faith.can_offer(world):
        return say(world, "pray:offer_soon", rng)
    bag.take(world, item, n)
    return faith.offer(world, item, n)


def pray(world: World, topic: str, answer_aid, rng: random.Random | None = None, held: dict | None = None, near: str = "") -> dict:
    """The hero's prayers. `answer_aid` is the god looking for a rule she can lean on, `held` is what is in the hand, and `near` is where they are praying from."""
    rng = rng or random.Random()
    gift, fx, petition, chatting = None, {}, None, topic in STAY_ON
    if topic == "petition" and edicts.can_ask(world):
        petition = edicts.offers(world, near == "stone")
        lines = [_over_the_cards(world, petition, not world.player.written, rng)]
    elif topic == "law_again" and edicts.redraw(world):
        lines, petition = [say(world, "pray:other_words", rng)], edicts.offers(world, near == "stone")
    elif topic.startswith("law:"):
        lines = [edicts.write(world, topic[4:]) or say(world, "pray:no_loophole", rng)]
    elif topic in story.BEATS and topic in story.offered(world, "god"):
        played = story.play(world, topic, rng)
        lines, gift, fx = played["lines"], played["gift"], played["fx"]
    elif world.ending == "broken":
        lines = [say(world, "pray:silence", rng)]
    elif topic == "pray_aid":
        lines = [answer_aid()]
    elif topic == "pray_guide":
        lines = [some_of(world, [(f"pray:{story.CHAPTERS[world.story.stage]['id']}", 3), ("pray:guide", 1)], rng)]
    elif topic == "hello":
        lines = [_hello(world, near, rng)]
    elif topic == "bye":
        lines = [say(world, "pray:bye", rng)]
    elif topic == "pray_more":
        lines = [say(world, "pray:more", rng)]
    elif topic == "pray_back":
        lines = [say(world, "pray:back", rng)]
    elif topic == "pray_offer":
        lines = [_offering(world, held, rng)]
    elif topic == "pray_self":
        lines = [_her_story(world, rng)]
    elif topic == "pray_deeds":
        lines = [_what_she_saw(world, rng)]
    elif topic == "pray_leaning":
        lines = [_what_she_would_write(world, rng)]
    elif topic == "pray_news":
        lines = [_news(world, rng)]
    elif topic == "pray_joke":
        lines = [say(world, "pray:joke", rng)]
    elif topic == "pray_curse":
        lines = [say(world, "pray:curse", rng)]
    elif topic == "pray_thanks":
        faith.kind_word(world)
        lines = [say(world, "pray:thanks", rng)]
    elif topic == "pray_sins":
        faith.kind_word(world)
        lines = [say(world, "pray:sins", rng, bounty=world.player.bounty) if world.player.bounty or world.player.notoriety else say(world, "pray:clean", rng)]
    else:
        lines = [some_of(world, [(f"pray:act{story.act(world)}", 2), ("pray:chatter", 3)], rng)]
    return {"lines": [l for l in lines if l] or ["…"], "gift": gift, "fx": fx, "topics": pray_menu(world, rng, chatting), "petition": petition, "redraw": bool(petition) and edicts.can_redraw(world)}


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

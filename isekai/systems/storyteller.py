"""The god in the mortal world. She cannot touch it: she narrates, she writes Laws, and she leans on the rules that are already there. All of it runs on the game clock.

She is also the director. Every event she can reach for is a threat or a relief, and she chooses by how the hero has been doing: someone on the ropes gets a caravan,
someone cruising gets a horde, and a hard moment is followed by a quiet one. That keeps the challenge near what the hero can do, and gives play a rhythm of pressure and rest.
What she says comes from the moment too: how the hero fell, what they just found, what they are about to walk into."""
from __future__ import annotations

import math
import random
from typing import TYPE_CHECKING

from ..content import CREATURES, LAWS, LINES, NAMES, WORLD
from ..core.state import Law, Nemesis, Star, World
from . import bag, chronicle, faith, siege, story
from .laws import law_text
from .lines import fill, say, some_of

if TYPE_CHECKING:
    from ..core.game import Game

QUIET_SPELL = 240.0  # seconds of play between unprompted narration
MIN_GAP = 12.0  # routine narration never crowds in on the last line
OMEN_GAP = (120.0, 260.0)  # seconds between world events
DECREE_GAP = 300.0
DREAM_GAP = 240.0  # she cannot come down, but someone asleep has stopped arguing
THROWS_NOTICED = 3  # the first few things the hero throws away get a word from her
MAX_LAWS = 8
NEMESIS_DELAY = (150.0, 300.0)
WAR_PER_RAID, WAR_EASE = 0.05, 0.01  # price pressure added by a raid, and eased each minute of play
THREATS = {"monster_horde": 3, "named_foe": 2, "blood_moon": 1, "siege": 2}
RELIEF = {"merchant_caravan": 3, "festival": 2, "traveller": 3, "star_fall": 2}
COOLDOWNS = {"demon_raid": 150, "merchant_caravan": 180, "festival": 300, "monster_horde": 150, "traveller": 200, "named_foe": 420, "blood_moon": 900, "star_fall": 360, "siege": 600}
FESTIVAL_LENGTH = 180
STRAIN_MEMORY, AFTER_THREAT = 300.0, 200.0  # how long a death weighs on her, and how long a quiet spell follows a threat
AGAIN_WITHIN = 180.0  # falling twice inside this is noticed
LOW_HP, LOW_HP_EVERY = 0.25, 180.0
DUSK = (0.43, 0.47)  # the part of the day she warns about the dark
DUSKS_TOLD = 3  # once the hero knows, she stops saying so
STAR_RANGE, STAR_LIFE, STAR_WORTH, STAR_PAY = (60.0, 110.0), 600.0, 30, 40
STAR_GIFTS = ("mithril_ingot", "gold_ingot", "ruby", "sapphire", "greater_health", "greater_mana")
BLOOD_MOON_WORTH = 40


def narrate(world: World, key: str, important: bool = False, **blanks) -> None:
    """A line from the god. Routine lines give way if she spoke a moment ago, so that a busy fight is not a wall of text."""
    if not important and not world.cooldown_ready("narration", MIN_GAP):
        return
    text = say(world, f"tell:{key}", **blanks)
    if text:
        world.mark("narration")
        world.push("narration", text)


def raids_on(world: World) -> bool:
    return not world.demon_lord_dead and world.story.stage >= story.STAGE_RAIDS and world.ending is None


def allowed_events(game: "Game") -> list[str]:
    """The rules that bind the god: which events may happen right now."""
    w, ctx, known = game.world, game.ctx, game.world.player.pos is not None
    night, ready = ctx.get("night"), lambda e: w.cooldown_ready(e, COOLDOWNS[e])
    out = []
    if raids_on(w) and ready("demon_raid"):
        out.append("demon_raid")
    if not night and ready("merchant_caravan"):
        out.append("merchant_caravan")
    if not night and ctx.get("in_settlement") and ready("festival"):
        out.append("festival")
    if night and ready("monster_horde"):
        out.append("monster_horde")
    if ready("traveller"):
        out.append("traveller")
    if ready("named_foe"):
        out.append("named_foe")
    if night and w.story.stage >= story.STAGE_RAIDS and not w.blood_moon and ready("blood_moon"):
        out.append("blood_moon")
    if known and not w.star and ready("star_fall"):
        out.append("star_fall")
    if raids_on(w) and known and not w.siege and ready("siege") and siege.target(w):
        out.append("siege")
    return out


def _foe_name(rng: random.Random) -> tuple[str, str]:
    foe = NAMES["foes"]
    return rng.choice(foe["names"]), rng.choice(foe["titles"])


def _drop_star(world: World) -> None:
    """Nothing says a star can't fall. It lands within a walk of the hero, and something usually comes down with it."""
    p, edge = world.player.pos, len(world.lands) * WORLD["land"] - 16
    turn, far = random.uniform(0, math.tau), random.uniform(*STAR_RANGE)
    x, z = (min(edge, max(16, v)) for v in (p.x + math.cos(turn) * far, p.z + math.sin(turn) * far))
    world.star = Star(x=x, z=z)
    world.after(STAR_LIFE, "star_fades")
    world.push("event", say(world, "event:star_fall"), event="star_fall", x=x, z=z)


def star_found(world: World) -> str | None:
    """What fell is the surprise on top: the Faith is sure and the gift is not."""
    if not world.star:
        return None
    world.star = None
    world.timers = [t for t in world.timers if t.kind != "star_fades"]
    gift = random.choice(STAR_GIFTS)
    bag.give(world, gift)
    world.player.gold += STAR_PAY
    faith.earn(world, STAR_WORTH)
    chronicle.record(world, "star")
    narrate(world, "star_found", important=True)
    return f"The star left something behind. +{STAR_PAY} {world.currency}"


def star_fades(world: World) -> None:
    if world.star:
        world.star = None
        narrate(world, "star_faded")


def run_event(game: "Game", event: str, cause: str = "the god", **data) -> bool:
    w = game.world
    if event not in allowed_events(game) and cause == "the god":
        return False
    w.mark(event)
    if event in THREATS:
        w.mark("threat")
    if event == "demon_raid":
        w.raid_level += 1
        w.war_pressure += WAR_PER_RAID
        w.push("event", say(w, "event:demon_raid", wave=w.raid_level), event="demon_raid", wave=w.raid_level)
        chronicle.record(w, "raid", wave=w.raid_level)
    elif event == "merchant_caravan":
        w.push("event", say(w, "event:merchant_caravan"), event="merchant_caravan")
    elif event == "festival":
        w.festival_until = w.clock + FESTIVAL_LENGTH
        w.push("event", say(w, "event:festival"), event="festival")
        chronicle.record(w, "festival", place=game.ctx.get("place", "the wilds"))
    elif event == "monster_horde":
        w.push("event", say(w, "event:monster_horde"), event="monster_horde")
    elif event == "traveller":
        role = random.choice(NAMES["travellers"])
        w.push("event", say(w, "event:traveller"), event="traveller", role=role["role"], title=role["title"])
    elif event == "named_foe":
        if "name" not in data:
            data["name"], data["title"] = _foe_name(random)
            data.update(kind=None, power=2.5)
        w.push("event", say(w, "event:nemesis" if data.get("nemesis") else "event:named_foe", foe=data["name"], title=data["title"]), event="named_foe", **data)
    elif event == "blood_moon":
        w.blood_moon = True
        w.push("event", say(w, "event:blood_moon"), event="blood_moon")
        chronicle.record(w, "blood_moon")
    elif event == "star_fall":
        _drop_star(w)
    elif event == "siege":
        siege.begin(w, siege.target(w))
    return True


# ---------- the nemesis ----------
def nemesis_rises(world: World, kind: str, by: str) -> None:
    """The monster that killed the hero gets a name, grows stronger for it, and comes looking again."""
    if not kind or CREATURES.get(kind, {}).get("warded"):  # the great ones have names already, and there is only one of each
        return
    n = world.nemesis
    if n and n.kind == kind:
        n.level += 1
    else:
        name, title = _foe_name(random)
        world.nemesis = n = Nemesis(kind=kind, name=name, title=title)
    world.push("toast", say(world, "tell:nemesis_named", foe=n.name, title=n.title, by=by))
    if not world.pending("nemesis"):
        world.after(random.uniform(*NEMESIS_DELAY), "nemesis")


def nemesis_returns(game: "Game") -> None:
    n = game.world.nemesis
    if n:
        run_event(game, "named_foe", cause="the rules", nemesis=True, kind=n.kind, name=n.name, title=n.title, power=2 + n.level)
        game.world.after(random.uniform(*NEMESIS_DELAY) * 2, "nemesis")


def nemesis_falls(world: World) -> tuple[str, int]:
    n, reward = world.nemesis, 0
    if not n:
        return "", 0
    reward = 40 * n.level
    world.nemesis = None
    world.timers = [t for t in world.timers if t.kind != "nemesis"]
    world.player.gold += reward
    chronicle.fame(world, 3)
    chronicle.record(world, "nemesis", foe=n.name, title=n.title)
    return say(world, "tell:nemesis_slain", foe=n.name, title=n.title), reward


# ---------- noticing ----------
def mourn(world: World, by: str, kind: str) -> None:
    """What she says when the hero falls depends on how: a death should move something on, not just cost time."""
    n, again = world.nemesis, not world.cooldown_ready("hero_fell", AGAIN_WITHIN)
    key = "death:fall" if by == "a fall" else "death:nemesis" if n and n.kind == kind else "death:again" if again else "death"
    narrate(world, key, important=True, by=by)
    world.mark("hero_fell")


def _watch(game: "Game") -> None:
    """She is always looking. These are the things she would mention."""
    w, p = game.world, game.world.player
    if p.hp is not None and p.hp / p.max_hp < LOW_HP and w.cooldown_ready("low_hp", LOW_HP_EVERY):
        w.mark("low_hp")
        narrate(w, "low_hp")
    if DUSK[0] <= w.day_time <= DUSK[1] and w.cooldown_ready("dusk", QUIET_SPELL) and w.story.counts.get("dusks", 0) < DUSKS_TOLD:
        w.mark("dusk")
        w.story.counts["dusks"] = w.story.counts.get("dusks", 0) + 1
        narrate(w, "dusk")
    if w.blood_moon and "night" in game.ctx and not game.ctx["night"]:
        w.blood_moon = False
        faith.earn(w, BLOOD_MOON_WORTH)
        narrate(w, "blood_moon_over", important=True)


def strain(game: "Game") -> float:
    """How hard things have been lately: 0 is cruising, and 1 is on the ropes."""
    w, p = game.world, game.world.player
    hurt = 1 - p.hp / p.max_hp if p.hp is not None else 0
    fell = 0.6 if not w.cooldown_ready("hero_fell", STRAIN_MEMORY) else 0
    return min(1.0, fell + hurt * 0.6)


def _weight(world: World, event: str, strained: float) -> float:
    if event in RELIEF:
        return RELIEF[event] * (1 + 2 * strained)
    return THREATS[event] * max(0.1, 1.2 - 1.5 * strained) * (1 if world.cooldown_ready("threat", AFTER_THREAT) else 0.25)


# ---------- what the god does when left alone ----------
def _due(when: dict, world: World) -> bool:
    p = world.player
    now = {"notoriety": p.notoriety, "stage": world.story.stage, "kills": p.kills, "deaths": p.deaths, "raids": world.raid_level, "renown": p.renown}
    return all(now[k] >= v for k, v in when.items())


def decree(world: World) -> bool:
    """A new law when the hero's conduct or the story calls for one."""
    if len(world.laws) >= MAX_LAWS or not world.cooldown_ready("decree", DECREE_GAP) or world.ending:
        return False
    written = {l.name for l in world.laws}
    for spec in LAWS["decrees"]:
        if spec["law"]["name"] not in written and _due(spec["when"], world):
            law = Law(**spec["law"])
            world.laws.append(law)
            world.mark("decree")
            world.push("decree", f"📜 {world.god_name} decrees a new law: {law_text(law)}", law=law.model_dump())
            world.push("toast", fill(world, spec["line"]))
            return True
    return False


def omen(game: "Game") -> None:
    """Something happens. What it is depends on where the hero is, what time it is, what the rules allow and how the last few minutes have gone."""
    w = game.world
    choices, strained = [e for e in allowed_events(game) if e in THREATS or e in RELIEF], strain(game)
    if choices:
        run_event(game, random.choices(choices, [_weight(w, e, strained) for e in choices])[0], cause="the rules")
    w.after(random.uniform(*OMEN_GAP), "omen")


def direct(game: "Game", seconds: float) -> None:
    """Called on every tick of the game clock."""
    w = game.world
    w.war_pressure = max(0, w.war_pressure - WAR_EASE * seconds / 60)
    if raids_on(w) and w.cooldown_ready("scheduled_raid", w.raid_every):
        if "scheduled_raid" in w.cooldowns:
            run_event(game, "demon_raid", cause="the rules")
            narrate(w, "raid", wave=w.raid_level)
        w.mark("scheduled_raid")
    if not w.pending("omen"):
        w.after(random.uniform(*OMEN_GAP), "omen")
    decree(w)
    _watch(game)
    if w.cooldown_ready("narration", QUIET_SPELL):
        narrate(w, f"idle:{story.act(w)}", important=True)


def answer_prayer(game: "Game") -> str:
    """She cannot act, but she knows the rules very well. If one of them can help, she will lean on it."""
    w = game.world
    if not w.cooldown_ready("prayer_answered", 300):
        return say(w, "pray:wait")
    choices = [e for e in allowed_events(game) if e in RELIEF]
    if not choices:
        return say(w, "pray:no_loophole")
    w.mark("prayer_answered")
    run_event(game, random.choice(choices), cause="the rules")
    return say(w, "pray:loophole")


def saw_a_throw(world: World) -> None:
    counts = world.story.counts
    if counts.get("throws", 0) < THROWS_NOTICED:
        counts["throws"] = counts.get("throws", 0) + 1
        narrate(world, "threw")


def dream(world: World) -> None:
    """A night at an inn. She can't reach down, but nothing says a sleeper can't wander up, and it plays as a small scene when the hero next has a moment."""
    if world.ending == "broken" or not world.cooldown_ready("dream", DREAM_GAP):
        return
    world.mark("dream")
    says = some_of(world, [("dream:talk", 3), *([("dream:law", 6)] if world.player.petitions else []), *([("dream:hurt", 4)] if not world.cooldown_ready("hero_fell", STRAIN_MEMORY) else [])])
    world.push("scene", "A dream", lines=[{"who": "", "text": say(world, "dream:open")}, {"who": world.god_name, "text": says}])


def noticed_find(world: World, item: str) -> None:
    """The first of some things gets a word from her, because this is how a new hero learns what comes next."""
    if LINES.get(f"tell:found:{item}"):
        narrate(world, f"found:{item}", important=True)

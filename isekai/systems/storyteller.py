"""The god in the mortal world: helpless to act directly, she narrates, decrees new laws and sets world events in
motion, but only the events the world's rules allow at that moment. All of it runs on the game clock."""
from __future__ import annotations

import random
from typing import TYPE_CHECKING

from ..content import CREATURES, LAWS, NAMES
from ..core.state import Law, Nemesis, World
from . import chronicle, story
from .laws import law_text
from .lines import fill, say

if TYPE_CHECKING:
    from ..core.game import Game

QUIET_SPELL = 240.0  # seconds of play between unprompted narration
MIN_GAP = 12.0  # routine narration never crowds in on the last line
OMEN_GAP = (120.0, 260.0)  # seconds between world events
DECREE_GAP = 300.0
MAX_LAWS = 8
NEMESIS_DELAY = (150.0, 300.0)
WAR_PER_RAID, WAR_EASE = 0.05, 0.01  # price pressure added by a raid, and eased each minute of play
OMEN_WEIGHTS = {"merchant_caravan": 3, "festival": 2, "monster_horde": 3, "traveller": 3, "named_foe": 2}
COOLDOWNS = {"demon_raid": 150, "merchant_caravan": 180, "festival": 300, "monster_horde": 150, "traveller": 200, "named_foe": 420}
FESTIVAL_LENGTH = 180


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
    w, ctx = game.world, game.ctx
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
    return out


def _foe_name(rng: random.Random) -> tuple[str, str]:
    foe = NAMES["foes"]
    return rng.choice(foe["names"]), rng.choice(foe["titles"])


def run_event(game: "Game", event: str, cause: str = "the god", **data) -> bool:
    w = game.world
    if event not in allowed_events(game) and cause == "the god":
        return False
    w.mark(event)
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


# ---------- what the god does when left alone ----------
def _due(when: dict, world: World) -> bool:
    p = world.player
    now = {"notoriety": p.notoriety, "stage": world.story.stage, "kills": p.kills, "deaths": p.deaths, "raids": world.raid_level, "renown": p.renown}
    return all(now[k] >= v for k, v in when.items())


def decree(world: World) -> bool:
    """A new law when the hero's conduct or the story calls for one. Writing laws is the only thing she can do."""
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
    """Something happens. What it is depends on where the hero is, what time it is and what the rules allow."""
    w = game.world
    choices = [e for e in allowed_events(game) if e in OMEN_WEIGHTS]
    if choices:
        run_event(game, random.choices(choices, [OMEN_WEIGHTS[e] for e in choices])[0], cause="the rules")
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
    if w.cooldown_ready("narration", QUIET_SPELL):
        narrate(w, f"idle:{story.act(w)}", important=True)


def answer_prayer(game: "Game") -> str:
    """She cannot act, but she knows the rules very well. If one of them can help, she will lean on it."""
    w = game.world
    if not w.cooldown_ready("prayer_answered", 300):
        return say(w, "pray:wait")
    choices = [e for e in allowed_events(game) if e in ("merchant_caravan", "festival", "traveller")]
    if not choices:
        return say(w, "pray:no_loophole")
    w.mark("prayer_answered")
    run_event(game, random.choice(choices), cause="the rules")
    return say(w, "pray:loophole")

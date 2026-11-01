"""Everything the player can do. The API only reads requests and calls these; the rules stay out of HTTP."""
from __future__ import annotations

import time

from ..content import BLOCK_IDS, CHUNK_VOLUME, CREATURES, ITEMS, WORLD
from ..systems import bag, chronicle, dialogue, edicts, faith, favors, guild, laws, magic, shop, siege, story, storyteller
from ..systems.people.succession import delay_for
from .game import Game
from .state import Vec3

DRAGON_HOARD, DRAGON_HEART = 600, 10  # what killing the Wyrm is worth
DRAGON_MOODS = {"wakes", "chases", "warns"}

MURDER_RENOWN = 6  # lost on top of what the law takes, when a killing is seen
NEMESIS_WORTH, NAMED_WORTH, GREAT_WORTH = 50, 20, 150  # in Faith
BLOCKS_A_DEED, MANA_A_DEED = 8, 20  # how much digging or casting she counts as one deed


def _finish(game: Game, **extra) -> dict:
    """Every action ends the same way: the story moves on if it can, the world is saved, the client gets the new state."""
    reached = game.check_story()
    game.save()
    return game.state_payload(reached=reached, **extra)


# ---------- the world around the player ----------
def report_context(game: Game, night: bool, place: str, in_settlement: bool, playing: bool, x: float | None, y: float | None, z: float | None,
                   hp: float | None, mana: float | None, wanted: float, day_time: float | None, boss_hp: float | None, dragon_hp: float | None = None) -> None:
    """The client's regular report: where the player is, and whether they are playing right now."""
    game.ctx = {"night": night, "place": place, "in_settlement": in_settlement, "playing": playing}
    game.last_report = time.monotonic()
    w, p = game.world, game.world.player
    if x is not None and y is not None and z is not None:
        p.pos = Vec3(x=x, y=y, z=z)
    if hp is not None:
        p.hp = max(0, min(hp, p.max_hp))
    if mana is not None:
        p.mana = max(0, min(mana, p.max_mana))
    p.wanted = max(0, wanted)
    if day_time is not None:
        w.day_time = day_time % 1
    if boss_hp is not None:
        w.boss_hp = boss_hp
    if dragon_hp is not None:
        w.dragon_hp = dragon_hp
    game.save()


def enter_land(game: Game, lx: int, lz: int) -> dict:
    w = game.world
    land = w.land_at(lx, lz)
    messages = []
    if land:
        if land.realm == "demon":
            w.story.flags["reached_demon_land"] = True
        if (lx, lz) == tuple(w.demon_land):
            story.play_scene(w, "lord_voice_ready" if w.player.oathbound else "lord_voice_early")
        if (m := favors.on_enter(w, lx, lz)):
            messages.append(m)
        siege.entered(w, lx, lz)
        k = f"{lx},{lz}"
        if k not in w.visited:
            w.visited.append(k)
            faith.earn(w, faith.LAND_WORTH)
            edicts.noted(w, "road", 2)
            if land.settlement is not None:
                s = w.settlements[land.settlement]
                storyteller.narrate(w, f"arrive:{s.type}", place=s.name)
                chronicle.record(w, "arrival", place=s.name)
            elif land.structure != "none" or land.realm == "demon":
                storyteller.narrate(w, f"arrive:{land.realm if land.structure == 'none' else land.structure}", place=land.name or land.structure.replace("_", " "))
    return _finish(game, messages=messages)


def sync_blocks(game: Game, blocks: dict[str, int], edits: dict[str, dict[str, int]], pack: dict | None = None) -> None:
    """The client mines, builds and crafts in real time, and reports the bag and the changed blocks together."""
    w = game.world
    w.player.blocks = {k: max(0, min(9999, int(v))) for k, v in blocks.items() if v > 0}
    if pack:
        bag.store(w, pack)
    for chunk, changes in edits.items():
        valid = {i: id_ for i, id_ in changes.items() if i.isdigit() and int(i) < CHUNK_VOLUME and id_ in BLOCK_IDS}
        if chunk.isdigit() and valid:
            w.block_edits.setdefault(chunk, {}).update(valid)
            edicts.noted(w, "stone", len(valid) / BLOCKS_A_DEED)
    game.save()


def set_creative(game: Game, on: bool) -> dict:
    game.world.player.creative = on
    return _finish(game)


# ---------- heaven and prayer ----------
def speak_to_god(game: Game, topic: str) -> dict:
    out = dialogue.heaven(game.world, topic)
    game.save()
    return out


def descend(game: Game) -> dict:
    w = game.world
    if not w.player.descended:
        w.player.descended = True
        storyteller.narrate(w, "descend", important=True)
        game.save()
    return game.state_payload()


def pray(game: Game, topic: str, held: dict | None = None, near: str = "", pack: dict | None = None) -> dict:
    if pack:
        bag.store(game.world, pack)
    out = dialogue.pray(game.world, topic, lambda: storyteller.answer_prayer(game), held=held, near=near)
    return _finish(game, **_exchange(out))


def threw(game: Game) -> dict:
    storyteller.saw_a_throw(game.world)
    return _finish(game)


def offered(game: Game, item: str, n: int) -> dict:
    """Something thrown down at a Law Stone. It has already left the bag, so it is hers whether or not it earns anything."""
    if item not in ITEMS or n <= 0:
        return _finish(game)
    return _finish(game, messages=[faith.offer(game.world, item, n)])


# ---------- fighting ----------
def _claim_kill(game: Game, kind: str, named: str, chain: int) -> list[str]:
    w, p, msgs = game.world, game.world.player, []
    p.kills += 1
    edicts.noted(w, "blade")
    faith.earn(w, faith.for_kill(kind, chain))
    for hook in (guild.on_kill, favors.on_kill, story.on_kill, siege.on_kill):
        if (m := hook(w, kind)):
            msgs.append(m)
    if named == "nemesis":
        line, reward = storyteller.nemesis_falls(w)
        if line:
            w.push("narration", line)
            msgs.append(f"+{reward} {w.currency}")
            faith.earn(w, NEMESIS_WORTH)
    elif named:
        w.player.gold += 40
        chronicle.fame(w, 2)
        faith.earn(w, NAMED_WORTH)
        chronicle.record(w, "named_foe", foe=named)
        msgs.append(f"{named} is slain! +40 {w.currency}")
    if kind == "demon_lord":
        w.demon_lord_dead = True
        w.story.flags["lord_slain"] = True
        p.has_crown = True
        chronicle.fame(w, 25)
        chronicle.record(w, "demon_lord")
        faith.earn(w, GREAT_WORTH)
        story.play_scene(w, "lord_falls")
    elif kind == "dragon":
        w.dragon_dead = True
        w.story.flags["wyrm_slain"] = True
        p.gold += DRAGON_HOARD
        p.max_hp += DRAGON_HEART
        msgs.append(f"The Wyrm is dead. +{DRAGON_HOARD} {w.currency} from its hoard, and +{DRAGON_HEART} health")
        chronicle.fame(w, 12)
        chronicle.record(w, "dragon")
        faith.earn(w, GREAT_WORTH)
        storyteller.narrate(w, "dragon", important=True)
    elif p.kills % 8 == 0:
        storyteller.narrate(w, "kills", kills=p.kills)
    return msgs


def kill(game: Game, kind: str, resident: dict | None, by_player: bool, named: str = "", chain: int = 0) -> dict:
    w, msgs = game.world, []
    if resident:
        s = w.settlements[resident["settlement"]]
        r = next((r for r in s.residents if r.id == resident["id"]), None)
        if r and not r.dead:
            r.dead = True
            w.after(delay_for(r), "successor", settlement=s.id, resident=r.id)
    elif by_player:
        msgs = _claim_kill(game, kind, named, chain)
    return _finish(game, messages=msgs)


def dragon_mood(game: Game, mood: str) -> dict:
    if mood in DRAGON_MOODS:
        storyteller.narrate(game.world, f"dragon:{mood}", important=True)
    return _finish(game)


def spotted(game: Game, kind: str) -> dict:
    """A kind of creature the hero has now seen, for the journal."""
    book = game.world.player.bestiary
    if kind in CREATURES and kind not in book:
        book.append(kind)
        faith.earn(game.world, faith.SIGHT_WORTH)
    return _finish(game)


def boss_phase(game: Game, phase: int) -> dict:
    storyteller.narrate(game.world, f"boss_phase:{phase}", important=True)
    return _finish(game)


def death(game: Game, by: str, kind: str = "") -> dict:
    """Nothing earned is lost, because a death should cost a moment and not an hour. It takes the run of nights, it moves the story on, and it gives something a name."""
    w = game.world
    w.player.deaths += 1
    w.player.nights = 0
    edicts.noted(w, "flesh", 3)
    storyteller.mourn(w, by, kind)
    chronicle.record(w, "hero_fell", by=by)
    storyteller.nemesis_rises(w, kind, by)
    close = faith.so_close(w)
    return _finish(game, messages=[close] if close else [])


def dawn(game: Game) -> dict:
    """The sun came up on a hero who did not fall."""
    edicts.noted(game.world, "dark", 2)
    return _finish(game, banner=faith.dawn(game.world))


def found(game: Game, item: str) -> dict:
    """The first time the hero has held a kind of thing."""
    if faith.found(game.world, item):
        storyteller.noticed_find(game.world, item)
    return _finish(game)


def reached_star(game: Game) -> dict:
    line = storyteller.star_found(game.world)
    return _finish(game, messages=[line] if line else [])


def cast(game: Game, mana: float) -> dict:
    """The client reports spent mana a handful at a time, and spending it is how a well deepens by itself."""
    edicts.noted(game.world, "spell", mana / MANA_A_DEED)
    grown = magic.practice(game.world, mana)
    return _finish(game, messages=[grown] if grown else [])


# ---------- crime ----------
def crime(game: Game, name: str, in_city: bool, realm: str, lawmen: list[str], civilians: list[str], victim: str, victim_id: int | None) -> dict | None:
    if name not in laws.CRIMES:
        return None
    w = game.world
    results = laws.judge(w, name, in_city, realm, lawmen, civilians)
    if victim_id is not None:
        s = w.settlements[victim_id // WORLD["resident_id_base"]] if victim_id // WORLD["resident_id_base"] < len(w.settlements) else None
        who = next((r for r in s.residents if r.id == victim_id), None) if s else None
        if who:
            who.grudge = True
    seen = any(r["outcome"] != "unseen" for r in results)
    if seen:
        edicts.noted(w, "dark")
    if seen and name.startswith("kill_"):
        chronicle.fame(w, -MURDER_RENOWN)
        chronicle.record(w, "murder", victim=victim, place=game.ctx.get("place", "the wilds"))
    for r in results:
        if r["outcome"] == "punished":
            storyteller.narrate(w, "punished", deed=laws.CRIME_TEXT[name], law=r["law"], by=r["by"], victim=victim)
    if any(r["outcome"] == "unseen" for r in results):
        storyteller.narrate(w, "unseen", deed=laws.CRIME_TEXT[name], victim=victim)
    game.save()
    return game.state_payload(results=results)


def report(game: Game, law_name: str, by: str) -> dict | None:
    w = game.world
    law = laws.find_law(w, law_name)
    if not law:
        return None
    effects = laws.punish(w, law, by)
    storyteller.narrate(w, "reported", by=by, law=law.name)
    game.save()
    return game.state_payload(effects=effects)


# ---------- people ----------
def _exchange(out: dict) -> dict:
    return {"lines": out["lines"], "gift": out["gift"], "effects": out["fx"], "topics": out["topics"], "petition": out.get("petition"), "redraw": out.get("redraw")}


def talk(game: Game, settlement: int | None, resident: int | None, creature: str, name: str, topic: str, blocks: dict[str, int] | None, pack: dict | None = None) -> dict:
    w = game.world
    if blocks is not None:  # the client owns the inventory, and may have mined something a moment ago
        w.player.blocks = {k: max(0, min(9999, int(v))) for k, v in blocks.items() if v > 0}
    if pack:
        bag.store(w, pack)
    s = w.settlements[settlement] if settlement is not None and 0 <= settlement < len(w.settlements) else None
    who = next((r for r in s.residents if r.id == resident), None) if s else None
    out = dialogue.talk(w, who, s, creature, name, topic or "hello")
    return _finish(game, **_exchange(out), service=who.service if who else None)


def service_view(game: Game, type_: str, settlement: int) -> dict:
    w = game.world
    out = {"type": type_, "gold": w.player.gold, "currency": w.currency}
    if type_ in ("trade", "smith"):
        out.update(shop.catalog_for(w, type_))
    elif type_ == "guild":
        out.update(quests=[q.model_dump() for q in guild.board(w, settlement)], active=w.player.active_quest.model_dump() if w.player.active_quest else None,
                   rank=guild.RANKS[w.player.guild_rank], done=w.player.guild_done)
    else:
        out["options"] = shop.service_options(w, type_)
    return out


def service_action(game: Game, type_: str, action: str, item: str, all_: bool, settlement: int, index: int, npc: int | None, pack: dict | None = None) -> dict:
    w, effects = game.world, {}
    if pack:
        bag.store(w, pack)
    if action == "buy":
        msg = shop.buy(w, item)
        edicts.noted(w, "coin")
    elif action == "sell":
        msg = shop.sell(w, item, all_)
        edicts.noted(w, "coin")
    elif action == "accept":
        msg = guild.accept(w, settlement, index)
    elif action == "turnin":
        msg = guild.turn_in(w)
    else:
        msg, effects = shop.use_service(w, type_, action, npc)
        if effects.get("morning"):
            storyteller.dream(w)
    return _finish(game, message=msg, effects=effects)


def rules(game: Game) -> dict:
    return {"laws": [laws.law_text(l) for l in game.world.laws], "allowed_events_now": storyteller.allowed_events(game), "codex": edicts.codex(game.world), "watching": edicts.watching(game.world)}

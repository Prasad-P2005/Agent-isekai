"""Everything the player can do. The API only reads requests and calls these; the rules stay out of HTTP."""
from __future__ import annotations

import time

from ..content import BLOCK_IDS, CHUNK_VOLUME
from ..god import dialogue, heaven as heaven_scene
from ..god.narrator import allowed_events
from ..systems import guild, laws, shop, story
from ..systems.people.succession import SUCCESSOR_DELAY
from .game import Game
from .state import Vec3


def _finish(game: Game, **extra) -> dict:
    """Every action ends the same way: the story moves on if it can, the world is saved, the client gets the new state."""
    reached = game.check_story()
    game.save()
    return game.state_payload(reached=reached, **extra)


# ---------- the world around the player ----------
def report_context(game: Game, night: bool, place: str, in_settlement: bool, playing: bool, x: float | None, y: float | None, z: float | None,
                   hp: float | None, mana: float | None, wanted: float, day_time: float | None) -> None:
    """The client's regular report: where the player is, and whether they are playing right now."""
    game.ctx = {"night": night, "place": place, "in_settlement": in_settlement, "playing": playing}
    game.last_report = time.monotonic()
    w, p = game.world, game.world.player
    if x is not None and y is not None and z is not None:
        p.pos = Vec3(x=x, y=y, z=z)
    if hp is not None:
        p.hp = max(0, min(hp, p.max_hp))
    if mana is not None:
        p.mana = max(0, mana)
    p.wanted = max(0, wanted)
    if day_time is not None:
        w.day_time = day_time % 1
    game.save()


def enter_land(game: Game, lx: int, lz: int) -> dict:
    w = game.world
    land = w.land_at(lx, lz)
    if land:
        if land.realm == "demon":
            w.story.flags["reached_demon_land"] = True
        k = f"{lx},{lz}"
        if k not in w.visited:
            w.visited.append(k)
            if land.settlement is not None:
                s = w.settlements[land.settlement]
                game.narrator.call(f"the hero arrived for the first time at {s.name}, a {s.type} settlement. {s.description}")
            elif land.structure != "none" or land.realm == "demon":
                game.narrator.call(f"the hero arrived for the first time at {land.name or land.structure.replace('_', ' ')} ({land.realm} lands)")
    return _finish(game)


def sync_blocks(game: Game, blocks: dict[str, int], edits: dict[str, dict[str, int]]) -> None:
    """The client mines and places blocks in real time; it reports the inventory and the changed blocks together."""
    w = game.world
    w.player.blocks = {k: max(0, min(9999, int(v))) for k, v in blocks.items() if v > 0}
    for chunk, changes in edits.items():
        valid = {i: id_ for i, id_ in changes.items() if i.isdigit() and int(i) < CHUNK_VOLUME and id_ in BLOCK_IDS}
        if chunk.isdigit() and valid:
            w.block_edits.setdefault(chunk, {}).update(valid)
    game.save()


# ---------- heaven ----------
async def speak_to_god(game: Game, message: str) -> str:
    reply = await heaven_scene.god_reply(game.world, game.llm, message.strip()[:300] or "...")
    game.save()
    return reply


def descend(game: Game) -> dict:
    w = game.world
    if not w.player.descended:
        w.player.descended = True
        game.narrator.call(f"the soul descended from heaven and awakened in the mortal world as {w.hero}, with the mission to slay the Demon Lord")
        game.save()
    return game.state_payload()


def pray(game: Game, message: str) -> None:
    game.narrator.call(f'the hero prays to you: "{message[:200]}" (you cannot act directly; answer through words, laws or allowed events)')


# ---------- fighting ----------
def _claim_kill(game: Game, kind: str) -> list[str]:
    w, p, msgs = game.world, game.world.player, []
    p.kills += 1
    if kind in shop.LOOT:
        name = shop.LOOT[kind][0]
        p.loot[name] = p.loot.get(name, 0) + 1
        msgs.append(f"+1 {name}")
    if (m := guild.on_kill(w, kind)):
        msgs.append(m)
    if kind == "demon_lord":
        w.demon_lord_dead = True
        game.narrator.call(f"THE HERO SLEW THE DEMON LORD {w.demon_lord_name}! His armies scatter")
    elif kind == "dragon":
        game.narrator.call("the hero slew a mighty dragon")
    elif p.kills % 8 == 0:
        game.narrator.call(f"the hero has now slain {p.kills} monsters")
    return msgs


def kill(game: Game, kind: str, resident: dict | None, by_player: bool) -> dict:
    w, msgs = game.world, []
    if resident:
        s = w.settlements[resident["settlement"]]
        r = next((r for r in s.residents if r.id == resident["id"]), None)
        if r and not r.dead:
            r.dead = True
            if r.service:
                w.after(SUCCESSOR_DELAY, "successor", settlement=s.id, resident=r.id)
    elif by_player:
        msgs = _claim_kill(game, kind)
    return _finish(game, messages=msgs)


def death(game: Game, by: str) -> dict:
    game.world.player.deaths += 1
    game.narrator.call(f"the hero was killed by {by} and their soul was returned to the world")
    return _finish(game)


def use_item(game: Game, item: str) -> dict:
    return _finish(game, ok=shop.use_item(game.world, item))


# ---------- crime ----------
def crime(game: Game, name: str, in_city: bool, realm: str, lawmen: list[str], civilians: list[str], victim: str) -> dict | None:
    if name not in laws.CRIMES:
        return None
    results = laws.judge(game.world, name, in_city, realm, lawmen, civilians)
    for r in results:
        if r["outcome"] == "punished":
            game.narrator.call(f"the hero {laws.CRIME_TEXT[name]} ({victim}) and {r['by']} enforced \"{r['law']}\": {r['effects']['text']}")
    if any(r["outcome"] == "unseen" for r in results):
        game.narrator.call(f"the hero {laws.CRIME_TEXT[name]} ({victim}) but nobody saw it (you may only hint at it ominously)")
    game.save()
    return game.state_payload(results=results)


def report(game: Game, law_name: str, by: str) -> dict | None:
    law = laws.find_law(game.world, law_name)
    if not law:
        return None
    effects = laws.punish(game.world, law, by)
    game.narrator.call(f"{by} reported the hero for breaking \"{law.name}\": {effects['text']}")
    game.save()
    return game.state_payload(effects=effects)


# ---------- people ----------
async def talk(game: Game, settlement: int | None, resident: int | None, kind: str, name: str, message: str) -> dict:
    w = game.world
    s = w.settlements[settlement] if settlement is not None and 0 <= settlement < len(w.settlements) else None
    who = next((r for r in s.residents if r.id == resident), None) if s else None
    situation, gift = story.meet(w, who)
    line = await dialogue.speak(w, game.llm, who, s, kind, name, situation, message.strip()[:300])
    return _finish(game, line=line, gift=gift, service=who.service if who else None)


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


def service_action(game: Game, type_: str, action: str, item: str, all_: bool, settlement: int, index: int, npc: int | None) -> dict:
    w, effects = game.world, {}
    if action == "buy":
        msg = shop.buy(w, item)
    elif action == "sell":
        msg = shop.sell(w, item, all_)
    elif action == "accept":
        msg = guild.accept(w, settlement, index)
    elif action == "turnin":
        msg = guild.turn_in(w)
    else:
        msg, effects = shop.use_service(w, type_, action, npc)
    return _finish(game, message=msg, effects=effects)


def rules(game: Game) -> dict:
    return {"laws": [laws.law_text(l) for l in game.world.laws], "allowed_events_now": allowed_events(game)}

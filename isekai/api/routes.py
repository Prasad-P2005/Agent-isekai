"""HTTP API used by the browser client."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..economy import guild, shop
from ..god import dialogue, heaven
from ..god.narrator import allowed_events
from ..laws import laws
from ..story.stages import objective

router = APIRouter(prefix="/api")


def game(request: Request):
    g = request.app.state.game
    g.touch()
    return g


def world_of(request: Request):
    g = game(request)
    if not g.world or not g.world.genesis_done:
        raise HTTPException(409, "No world yet: POST /api/new first")
    return g, g.world


# ---------- world ----------
@router.get("/status")
async def status(request: Request):
    g = game(request)
    w = g.world
    return {"has_world": bool(w and w.genesis_done), "creating": g.creating, "llm_online": g.llm.online, "model": g.llm.model,
            "name": w.name if w else None, "descended": w.player.descended if w else False}


class NewWorld(BaseModel):
    seed: int | None = None


@router.post("/new")
async def new_world(body: NewWorld, request: Request):
    g = game(request)
    if g.creating:
        raise HTTPException(409, "A world is already being created")
    w = await g.new_world(body.seed)
    return {"name": w.name, "llm_online": g.llm.online}


@router.get("/world")
async def get_world(request: Request):
    g, w = world_of(request)
    data = w.model_dump(exclude={"feed", "heaven_chat", "cooldowns"})
    data["objective"] = objective(w)
    data["law_texts"] = [laws.law_text(l) for l in w.laws]
    data["feed_next"] = w.feed_next
    return data


@router.get("/settlement/{sid}")
async def get_settlement(sid: int, request: Request):
    _, w = world_of(request)
    if not 0 <= sid < len(w.settlements):
        raise HTTPException(404)
    return w.settlements[sid].model_dump()


@router.get("/feed")
async def feed(request: Request, since: int = 0):
    _, w = world_of(request)
    return {"items": [i.model_dump() for i in w.feed if i.id >= since], "next": w.feed_next,
            "laws": [l.model_dump() for l in w.laws], "law_texts": [laws.law_text(l) for l in w.laws],
            "beats": w.story.beats[-3:], "objective": objective(w)}


class Context(BaseModel):
    night: bool = False
    place: str = ""
    in_settlement: bool = False


@router.post("/context")
async def context(body: Context, request: Request):
    g, _ = world_of(request)
    g.ctx = body.model_dump()
    return {"ok": True}


# ---------- scene 1: heaven ----------
class Say(BaseModel):
    message: str


@router.post("/heaven")
async def heaven_chat(body: Say, request: Request):
    g, w = world_of(request)
    reply = await heaven.god_reply(w, g.llm, body.message.strip()[:300] or "...")
    g.save()
    return {"reply": reply}


@router.post("/descend")
async def descend(request: Request):
    g, w = world_of(request)
    if not w.player.descended:
        w.player.descended = True
        g.narrator.call(f"the soul descended from heaven and awakened in the mortal world as {w.hero}, with the mission to slay the Demon Lord")
        g.save()
    return g.state_payload()


@router.post("/pray")
async def pray(body: Say, request: Request):
    g, _ = world_of(request)
    g.narrator.call(f'the hero prays to you: "{body.message[:200]}" (you cannot act directly; answer through words, laws or allowed events)')
    return {"ok": True}


# ---------- events ----------
class Event(BaseModel):
    type: str  # kill | death | enter_land | use
    kind: str = ""
    by_player: bool = True
    resident: dict | None = None
    lx: int = 0
    lz: int = 0
    by: str = ""
    item: str = ""


@router.post("/event")
async def event(body: Event, request: Request):
    g, w = world_of(request)
    msgs: list[str] = []
    ok = True
    if body.type == "kill":
        msgs = g.on_kill(body.kind, body.resident, body.by_player)
    elif body.type == "death":
        w.player.deaths += 1
        g.narrator.call(f"the hero was killed by {body.by} and their soul was returned to the world")
    elif body.type == "enter_land":
        g.on_enter_land(body.lx, body.lz)
    elif body.type == "use":
        field = {"potion": "potions", "mana": "mana_potions"}.get(body.item)
        ok = bool(field and getattr(w.player, field) > 0)
        if ok:
            setattr(w.player, field, getattr(w.player, field) - 1)
    reached = g.check_story()
    g.save()
    return g.state_payload(messages=msgs, ok=ok, reached=reached)


class Crime(BaseModel):
    crime: str
    in_city: bool = False
    realm: str = "human"
    lawmen: list[str] = []
    civilians: list[str] = []
    victim: str = ""


@router.post("/crime")
async def crime(body: Crime, request: Request):
    g, w = world_of(request)
    if body.crime not in laws.CRIMES:
        raise HTTPException(400, "unknown crime")
    results = laws.judge(w, body.crime, body.in_city, body.realm, body.lawmen, body.civilians)
    for r in results:
        if r["outcome"] == "punished":
            g.narrator.call(f"the hero {laws.CRIME_TEXT[body.crime]} ({body.victim}) and {r['by']} enforced \"{r['law']}\": {r['effects']['text']}")
    if any(r["outcome"] == "unseen" for r in results):
        g.narrator.call(f"the hero {laws.CRIME_TEXT[body.crime]} ({body.victim}) but nobody saw it (you may only hint at it ominously)")
    g.save()
    return g.state_payload(results=results)


class Report(BaseModel):
    law: str
    by: str


@router.post("/report")
async def report(body: Report, request: Request):
    g, w = world_of(request)
    law = laws.find_law(w, body.law)
    if not law:
        raise HTTPException(404, "no such law")
    effects = laws.punish(w, law, body.by)
    g.narrator.call(f"{body.by} reported the hero for breaking \"{law.name}\": {effects['text']}")
    g.save()
    return g.state_payload(effects=effects)


# ---------- people ----------
class Talk(BaseModel):
    message: str = ""  # what the player typed; empty = just a greeting
    settlement: int | None = None
    resident: int | None = None
    kind: str = ""
    name: str = ""


STORY_TALKS = {"king": "met_king", "queen": None, "elf_king": "elf_trust", "elf_queen": "elf_trust", "elder": "elf_trust", "chief": "beast_trust"}


@router.post("/talk")
async def talk(body: Talk, request: Request):
    g, w = world_of(request)
    s = w.settlements[body.settlement] if body.settlement is not None and 0 <= body.settlement < len(w.settlements) else None
    who = next((r for r in s.residents if r.id == body.resident), None) if s else None
    situation, gift = "a casual conversation", None
    if who and who.job in STORY_TALKS:
        flag = STORY_TALKS[who.job]
        if who.job == "king" and w.demon_lord_dead and not w.story.flags.get("victory"):
            w.story.flags["victory"] = w.story.flags["met_king"] = True
            w.player.gold += 1000
            situation, gift = "the hero returns victorious after slaying the Demon Lord; reward them as a legend", "+1000 gold and eternal glory"
        elif flag and not w.story.flags.get(flag):
            w.story.flags[flag] = True
            if who.job == "king":
                w.player.gold += 100
                situation, gift = f"you meet the hero for the first time, give them a royal writ and 100 {w.currency}, and charge them to slay the Demon Lord", f"+100 {w.currency}, Royal Writ"
            elif who.job in ("elder", "elf_king", "elf_queen"):
                if "heal" not in w.player.abilities:
                    w.player.abilities.append("heal")
                situation, gift = "you decide to trust the hero and teach them the elven healing magic", "learned Heal (R)"
            else:
                if "swift" not in w.player.abilities:
                    w.player.abilities.append("swift")
                situation, gift = "you accept the hero as a friend of the tribe and grant them the swiftness of the beasts", "learned Swift"
    if who and who.service == "guild" and w.player.active_quest:
        q = w.player.active_quest
        situation = f"the hero's guild quest: {q.title} ({q.progress}/{q.count})"
    line = await dialogue.speak(w, g.llm, who, s, body.kind, body.name, situation, body.message.strip()[:300])
    reached = g.check_story()
    g.save()
    return g.state_payload(line=line, gift=gift, service=who.service if who else None, reached=reached)


@router.get("/service")
async def service(request: Request, type: str, settlement: int = -1):
    _, w = world_of(request)
    out = {"type": type, "gold": w.player.gold, "currency": w.currency}
    if type in ("trade", "smith"):
        out.update(shop.catalog_for(w, type))
    elif type == "guild":
        out.update(quests=[q.model_dump() for q in guild.board(w, settlement)], active=w.player.active_quest.model_dump() if w.player.active_quest else None,
                   rank=guild.RANKS[w.player.guild_rank], done=w.player.guild_done)
    else:
        out["options"] = shop.service_options(w, type)
    return out


class Act(BaseModel):
    type: str
    action: str = ""
    item: str = ""
    all: bool = False
    settlement: int = -1
    index: int = 0
    npc: int | None = None


@router.post("/service")
async def act(body: Act, request: Request):
    g, w = world_of(request)
    effects: dict = {}
    if body.action == "buy":
        msg = shop.buy(w, body.item)
    elif body.action == "sell":
        msg = shop.sell(w, body.item, body.all)
    elif body.action == "accept":
        msg = guild.accept(w, body.settlement, body.index)
    elif body.action == "turnin":
        msg = guild.turn_in(w)
    else:
        msg, effects = shop.use_service(w, body.type, body.action, body.npc)
    reached = g.check_story()
    g.save()
    return g.state_payload(message=msg, effects=effects, reached=reached)


class Blocks(BaseModel):
    blocks: dict[str, int]


@router.post("/blocks")
async def blocks(body: Blocks, request: Request):
    """The client mines and places blocks in real time; it syncs the inventory here."""
    g, w = world_of(request)
    w.player.blocks = {k: max(0, min(9999, int(v))) for k, v in body.blocks.items() if v > 0}
    g.save()
    return {"ok": True}


@router.get("/rules")
async def rules(request: Request):
    g, w = world_of(request)
    return {"laws": [laws.law_text(l) for l in w.laws], "allowed_events_now": allowed_events(g)}

"""HTTP API used by the browser client. Routes only read requests and call commands: the rules live in isekai/core and isekai/systems."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..core import commands
from ..systems import laws
from ..systems.marks import quest_marks
from ..systems.story import objective, oath_list

router = APIRouter(prefix="/api")


def game(request: Request):
    return request.app.state.game


def world_of(request: Request):
    g = game(request)
    if not g.world or not g.world.genesis_done:
        raise HTTPException(409, "No world yet: POST /api/new first")
    return g, g.world


# ---------- world ----------
@router.get("/status")
async def status(request: Request):
    w = game(request).world
    return {"has_world": bool(w and w.genesis_done), "name": w.name if w else None, "descended": w.player.descended if w else False}


class NewWorld(BaseModel):
    seed: int | None = None


@router.post("/new")
async def new_world(body: NewWorld, request: Request):
    w = game(request).new_world(body.seed)
    return {"name": w.name}


@router.get("/world")
async def get_world(request: Request):
    g, w = world_of(request)
    data = w.model_dump(exclude={"feed", "said", "chronicle", "cooldowns", "timers"})
    data["objective"] = objective(w)
    data["oaths"] = oath_list(w)
    data["marks"] = quest_marks(w)
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
            "beats": w.story.beats[-3:], "objective": objective(w), "oaths": oath_list(w), "marks": quest_marks(w)}


class Context(BaseModel):
    night: bool = False
    place: str = ""
    in_settlement: bool = False
    playing: bool = False
    x: float | None = None
    y: float | None = None
    z: float | None = None
    hp: float | None = None
    mana: float | None = None
    wanted: float = 0
    day_time: float | None = None
    boss_hp: float | None = None
    dragon_hp: float | None = None


@router.post("/context")
async def context(body: Context, request: Request):
    g, _ = world_of(request)
    commands.report_context(g, **body.model_dump())
    return {"ok": True}


# ---------- scene 1: heaven ----------
class Say(BaseModel):
    topic: str = "hello"


@router.post("/heaven")
async def heaven_chat(body: Say, request: Request):
    g, _ = world_of(request)
    return commands.speak_to_god(g, body.topic)


@router.post("/descend")
async def descend(request: Request):
    g, _ = world_of(request)
    return commands.descend(g)


@router.post("/pray")
async def pray(body: Say, request: Request):
    g, _ = world_of(request)
    return commands.pray(g, body.topic)


# ---------- events ----------
class Event(BaseModel):
    type: str  # kill | death | enter_land | use | boss_phase | cast | dragon | spotted
    kind: str = ""
    by_player: bool = True
    resident: dict | None = None
    named: str = ""
    lx: int = 0
    lz: int = 0
    by: str = ""
    item: str = ""
    phase: int = 0
    mana: float = 0


@router.post("/event")
async def event(body: Event, request: Request):
    g, _ = world_of(request)
    if body.type == "kill":
        return commands.kill(g, body.kind, body.resident, body.by_player, body.named)
    if body.type == "death":
        return commands.death(g, body.by, body.kind)
    if body.type == "enter_land":
        return commands.enter_land(g, body.lx, body.lz)
    if body.type == "use":
        return commands.use_item(g, body.item)
    if body.type == "boss_phase":
        return commands.boss_phase(g, body.phase)
    if body.type == "cast":
        return commands.cast(g, body.mana)
    if body.type == "dragon":
        return commands.dragon_mood(g, body.kind)
    if body.type == "spotted":
        return commands.spotted(g, body.kind)
    raise HTTPException(400, "unknown event")


class Crime(BaseModel):
    crime: str
    in_city: bool = False
    realm: str = "human"
    lawmen: list[str] = []
    civilians: list[str] = []
    victim: str = ""
    victim_id: int | None = None


@router.post("/crime")
async def crime(body: Crime, request: Request):
    g, _ = world_of(request)
    out = commands.crime(g, body.crime, body.in_city, body.realm, body.lawmen, body.civilians, body.victim, body.victim_id)
    if out is None:
        raise HTTPException(400, "unknown crime")
    return out


class Report(BaseModel):
    law: str
    by: str


@router.post("/report")
async def report(body: Report, request: Request):
    g, _ = world_of(request)
    out = commands.report(g, body.law, body.by)
    if out is None:
        raise HTTPException(404, "no such law")
    return out


# ---------- people ----------
class Talk(BaseModel):
    topic: str = "hello"
    settlement: int | None = None
    resident: int | None = None
    creature: str = ""
    name: str = ""
    blocks: dict[str, int] | None = None


@router.post("/talk")
async def talk(body: Talk, request: Request):
    g, _ = world_of(request)
    return commands.talk(g, body.settlement, body.resident, body.creature, body.name, body.topic, body.blocks)


@router.get("/service")
async def service(request: Request, type: str, settlement: int = -1):
    g, _ = world_of(request)
    return commands.service_view(g, type, settlement)


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
    g, _ = world_of(request)
    return commands.service_action(g, body.type, body.action, body.item, body.all, body.settlement, body.index, body.npc)


class Blocks(BaseModel):
    blocks: dict[str, int]
    edits: dict[str, dict[str, int]] = {}


@router.post("/blocks")
async def blocks(body: Blocks, request: Request):
    g, _ = world_of(request)
    commands.sync_blocks(g, body.blocks, body.edits)
    return {"ok": True}


@router.get("/rules")
async def rules(request: Request):
    g, _ = world_of(request)
    return commands.rules(g)

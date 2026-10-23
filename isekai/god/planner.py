"""The god plans every settlement: population, notable people with jobs and personalities, a rumor."""
from __future__ import annotations

from pydantic import BaseModel

from ..llm.client import LLM
from ..people.jobs import JOBS_FOR
from ..people.roster import make_roster
from ..state import Settlement, World


class Person(BaseModel):
    name: str
    job: str
    personality: str


class Plan(BaseModel):
    description: str
    population: int
    rumor: str
    notable_people: list[Person]


KIND = {"human": "human village", "city": "walled human city", "elfcity": "the walled elven capital in the great forest", "elf": "elven village in the woods", "beast": "beastkin (demi-human) tribal village"}


def ruler_of(world: World, s: Settlement) -> tuple[str | None, str | None]:
    if s.type == "elfcity":
        return world.elf_ruler_title, world.elf_ruler_name
    if s.type != "city":
        return None, None
    if s.id == world.capital().id:
        return "king", world.king_name
    return "queen", s.ruler


async def plan_settlement(world: World, llm: LLM, s: Settlement) -> bool:
    jobs = [j for j in JOBS_FOR[s.type] if j not in ("king", "queen", "elf_king", "elf_queen")]
    extra = ""
    if s.type in ("human", "city"):
        extra = "Must include: a guild master and a cute receptionist at the Adventurers' Guild, 2-3 doctors at the hospital, an innkeeper, a blacksmith, a priest, merchants and several adventurers."
    if s.type in ("city", "elfcity"):
        extra += f" It is ruled by {ruler_of(world, s)[1]} (do not list the ruler)."
    if s.type == "elfcity":
        extra = "Must include: a guild master and a receptionist at the Adventurers' Guild, herbalists, an innkeeper, a priestess, merchants, elven guards and adventurers." + extra
    prompt = f"""Plan the {KIND[s.type]} "{s.name}" in the world "{world.name}" ({world.kingdom}; the Demon Lord {world.demon_lord_name} threatens everyone).
Decide its population ({'50-120' if s.type in ('city', 'elfcity') else '20-60'}), a one-sentence description, a juicy rumor, and 8-12 notable people,
each with a name, a job and a vivid anime-style personality. Allowed jobs: {', '.join(jobs)}. {extra}"""
    plan = await llm.ask(prompt, Plan)
    if not plan:
        return False
    rj, rn = ruler_of(world, s)
    make_roster(s, plan.model_dump(), world.seed, rj, rn)
    s.description, s.rumor, s.planned = plan.description[:300], plan.rumor[:300], True
    return True

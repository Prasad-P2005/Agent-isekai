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
    jobs = [j for j in JOBS_FOR[s.type] if j not in ("king", "queen", "elf_king", "elf_queen") and (j != "fisherman" or s.coastal)]
    extra = ""
    if s.type in ("human", "city"):
        extra = "Must include: a guild master and a cute receptionist at the Adventurers' Guild, 2-3 doctors at the hospital, an innkeeper, a blacksmith, a priest, merchants and several adventurers."
    if s.type == "city":
        extra += " This city has a deliberate working population: farmers tend fields beyond its walls, established market merchants work inside, and street peddlers trade outside the gates."
    elif s.type == "human":
        extra += " Keep this village compact and rural, with many farmers and a small local market."
    if s.coastal:
        extra += " This is a coastal settlement: include at least one fisherman, who works along the shore."
    if s.type in ("city", "elfcity"):
        extra += f" It is a large, densely populated walled city with distinct civic, market and residential districts, ruled by {ruler_of(world, s)[1]} (do not list the ruler)."
    elif s.type in ("elf", "beast"):
        extra += " Keep the village compact and rural, with fewer homes and a workforce suited to its local landscape."
    if s.type == "elfcity":
        extra = "Must include: a guild master and a receptionist at the Adventurers' Guild, herbalists, an innkeeper, a priestess, merchants, elven guards and adventurers." + extra
    prompt = f"""Plan the {KIND[s.type]} "{s.name}" in the world "{world.name}" ({world.kingdom}; the Demon Lord {world.demon_lord_name} threatens everyone).
Decide its population ({'100-180' if s.type == 'city' else '50-100' if s.type == 'elfcity' else '20-60'}), a one-sentence description, a juicy rumor, and 8-12 notable people,
each with a name, a job and a vivid anime-style personality. Allowed jobs: {', '.join(jobs)}. {extra}"""
    plan = await llm.ask(prompt, Plan)
    if not plan:
        return False
    rj, rn = ruler_of(world, s)
    make_roster(s, plan.model_dump(), world.seed, rj, rn)
    s.description, s.rumor, s.planned = plan.description[:300], plan.rumor[:300], True
    return True

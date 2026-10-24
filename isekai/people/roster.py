"""Turn a settlement plan (from the god, or none) into a full roster of residents with jobs, workplaces and homes."""
from __future__ import annotations

import math
import random

from ..state import Pos, Resident, Settlement
from .jobs import BASE_KIND, ELF_KIND, FILLER, JOBS, JOBS_FOR, POPULATION, RACE_OF, REQUIRED
from .names import gen_name
from ..world.map import LAND

HOME_KINDS = {"house", "treehouse", "hut", "chief", "keep", "palace"}


def _spot(s: Settlement, where: str, rng: random.Random) -> Pos:
    if where == "field":
        a = rng.random() * math.tau
        d = (30.2 + rng.random() * 0.7) if s.type == "city" else (25 + rng.random() * 5)
        x, z = s.cx + math.cos(a) * d, s.cz + math.sin(a) * d
        return Pos(x=_inside_land(x, s.lx), z=_inside_land(z, s.lz))
    if where == "shore":
        if not s.coastal or not s.shore_direction:
            return _spot(s, "field", rng)
        direction = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}[s.shore_direction]
        dx, dz = direction
        radius, along = (30.2, rng.uniform(-2, 2)) if s.type == "city" else (29, rng.uniform(-3, 3))
        x, z = s.cx + dx * radius - dz * along, s.cz + dz * radius + dx * along
        return Pos(x=_inside_land(x, s.lx), z=_inside_land(z, s.lz))
    if where == "gate":
        ox, oz = rng.choice([(0, -1), (1, 0), (0, 1), (-1, 0)])
        d = 30 if s.type == "city" else 28 if s.type == "elfcity" else 27
        return Pos(x=s.cx + ox * d + 0.5, z=s.cz + oz * d + 0.5)
    spot_kind = where
    spots = [b for b in s.layout if b.kind == spot_kind]
    if where == "street_stall" and not spots:
        spots = [b for b in s.layout if b.kind == "stall"]
    if not spots:
        return Pos(x=s.cx + 3.5, z=s.cz + 3.5)
    b = rng.choice(spots)
    if b.kind == "street_stall":
        dx, dz = b.x - s.cx, b.z - s.cz
        length = math.hypot(dx, dz) or 1
        return Pos(x=b.x + 0.5 + dx / length * 1.5, z=b.z + 0.5 + dz / length * 1.5)
    off = 4.5 if b.kind in ("palace", "shrine", "treehouse") else 0.5
    return Pos(x=b.x + off, z=b.z + off)


def _inside_land(value: float, index: int) -> float:
    return max(index * LAND + 1.5, min((index + 1) * LAND - 1.5, value))


def _filler_jobs(s: Settlement, count: int, rng: random.Random) -> list[str]:
    pool = list(FILLER[s.type])
    if s.coastal and s.type in ("human", "city"):
        pool.extend(["fisherman"] * 5)
    result: list[str] = []
    while len(result) < count:
        cycle = pool.copy()
        rng.shuffle(cycle)
        result.extend(cycle)
    return result[:count]


def _unique_name(race: str, rng: random.Random, used: set[str]) -> str:
    name = gen_name(race, rng)
    while name in used:
        name = gen_name(race, rng)
    used.add(name)
    return name


def _kind_for(race: str, job: str) -> str:
    kind = JOBS[job].kind or BASE_KIND[race]
    return ELF_KIND.get(kind, kind) if race == "elf" else kind


def _schedule(s: Settlement, job_name: str, index: int, homes: list, rng: random.Random) -> tuple[Pos, Pos]:
    job = JOBS[job_name]
    home = homes[index % len(homes)] if homes else None
    tree = home is not None and home.kind in ("treehouse", "palace", "shrine")
    night = _spot(s, job.night, rng) if job.night else Pos(
        x=(home.x if home else s.cx) + (4.5 if tree else 0.5) + (rng.random() - 0.5) * 3,
        z=(home.z if home else s.cz) + (4.5 if tree else 0.5) + (rng.random() - 0.5) * 3,
    )
    return _spot(s, job.work, rng), night


def make_roster(s: Settlement, plan: dict | None, seed: int, ruler_job: str | None = None, ruler_name: str | None = None) -> None:
    rng = random.Random(seed * 1000 + s.id)
    race, allowed = RACE_OF[s.type], JOBS_FOR[s.type]
    people: list[dict] = []
    for p in (plan or {}).get("notable_people", [])[:14]:
        job = str(p.get("job", "")).lower().strip().replace(" ", "_")
        if job in allowed and (job != "fisherman" or s.coastal) and p.get("name") and job not in ("king", "queen", "elf_king", "elf_queen"):
            people.append({"name": str(p["name"])[:24], "job": job, "personality": str(p.get("personality", ""))[:160], "notable": True})
    for job in dict.fromkeys(REQUIRED[s.type]):
        while sum(p["job"] == job for p in people) < REQUIRED[s.type].count(job):
            people.append({"name": gen_name(race, rng), "job": job, "personality": "", "notable": True})
    if ruler_job:
        people.insert(0, {"name": ruler_name or gen_name(race, rng), "job": ruler_job, "personality": "", "notable": True})
    lo, hi, default = POPULATION[s.type]
    pop = (plan or {}).get("population")
    pop = max(lo, min(hi, int(pop))) if isinstance(pop, (int, float)) else default
    used_names = {p["name"] for p in people}
    for job in _filler_jobs(s, max(0, pop - len(people)), rng):
        people.append({"name": _unique_name(race, rng, used_names), "job": job, "personality": "", "notable": False})

    homes = [b for b in s.layout if b.kind in HOME_KINDS] or [None]
    residents = []
    for i, p in enumerate(people):
        job = JOBS[p["job"]]
        work, night = _schedule(s, p["job"], i, homes, rng)
        residents.append(Resident(
            id=s.id * 1000 + i, name=p["name"], job=p["job"], label=job.label, race=race, kind=_kind_for(race, p["job"]),
            service=job.service, body=job.body, hair=job.hair, personality=p["personality"], notable=p["notable"],
            work=work, night=night))
    s.residents = residents
    s.ruler = residents[0].name if ruler_job else s.ruler
    s.version += 1


def rebalance_roster(s: Settlement, seed: int, target_population: int | None = None) -> None:
    """Apply occupation rules to existing saves without replacing named or story-critical residents."""
    rng = random.Random(seed * 1000 + s.id + 91)
    race = RACE_OF[s.type]
    homes = [b for b in s.layout if b.kind in HOME_KINDS] or [None]
    royal_jobs = {"king", "queen", "elf_king", "elf_queen"}
    fillers = [r for r in s.residents if not r.notable and not r.dead and r.job not in royal_jobs]
    used_names = {r.name for r in s.residents}
    for resident, job_name in zip(fillers, _filler_jobs(s, len(fillers), rng)):
        job = JOBS[job_name]
        resident.job, resident.label, resident.kind = job_name, job.label, _kind_for(race, job_name)
        resident.race, resident.service, resident.body, resident.hair = race, job.service, job.body, job.hair

    for job_name in dict.fromkeys(REQUIRED[s.type]):
        minimum = REQUIRED[s.type].count(job_name)
        present = sum(r.job == job_name and not r.dead for r in s.residents)
        while present < minimum:
            resident = next((r for r in fillers if r.job != job_name), None)
            if resident is None:
                break
            resident.job = job_name
            present += 1

    target = max(target_population or len(s.residents), len(s.residents))
    new_jobs = _filler_jobs(s, target - len(s.residents), rng)
    for i, job_name in enumerate(new_jobs, start=len(s.residents)):
        job = JOBS[job_name]
        work, night = _schedule(s, job_name, i, homes, rng)
        s.residents.append(Resident(
            id=s.id * 1000 + i, name=_unique_name(race, rng, used_names), job=job_name, label=job.label,
            race=race, kind=_kind_for(race, job_name), service=job.service, body=job.body, hair=job.hair,
            notable=False, work=work, night=night,
        ))

    for i, resident in enumerate(s.residents):
        if resident.job not in JOBS or (resident.job == "fisherman" and not s.coastal):
            resident.job = _filler_jobs(s, 1, rng)[0]
        job = JOBS[resident.job]
        resident.label, resident.kind, resident.race = job.label, _kind_for(race, resident.job), race
        resident.service, resident.body, resident.hair = job.service, job.body, job.hair
        resident.work, resident.night = _schedule(s, resident.job, i, homes, rng)
    s.version += 1

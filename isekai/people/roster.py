"""Turn a settlement plan (from the god, or none) into a full roster of residents with jobs, workplaces and homes."""
from __future__ import annotations

import math
import random

from ..state import Pos, Resident, Settlement
from .jobs import BASE_KIND, ELF_KIND, FILLER, JOBS, JOBS_FOR, POPULATION, RACE_OF, REQUIRED
from .names import gen_name

HOME_KINDS = {"house", "treehouse", "hut", "chief", "keep", "palace"}


def _spot(s: Settlement, where: str, rng: random.Random) -> Pos:
    if where == "field":
        a, d = rng.random() * math.tau, 18 + rng.random() * 9
        return Pos(x=s.cx + math.cos(a) * d, z=s.cz + math.sin(a) * d)
    if where == "gate":
        ox, oz = rng.choice([(0, -1), (1, 0), (0, 1), (-1, 0)])
        d = 30 if s.type in ("city", "elfcity") else 27
        return Pos(x=s.cx + ox * d + 0.5, z=s.cz + oz * d + 0.5)
    spots = [b for b in s.layout if b.kind == where]
    if not spots:
        return Pos(x=s.cx + 3.5, z=s.cz + 3.5)
    b = rng.choice(spots)
    off = 4.5 if b.kind in ("palace", "shrine", "treehouse") else 0.5
    return Pos(x=b.x + off, z=b.z + off)


def make_roster(s: Settlement, plan: dict | None, seed: int, ruler_job: str | None = None, ruler_name: str | None = None) -> None:
    rng = random.Random(seed * 1000 + s.id)
    race, allowed = RACE_OF[s.type], JOBS_FOR[s.type]
    people: list[dict] = []
    for p in (plan or {}).get("notable_people", [])[:14]:
        job = str(p.get("job", "")).lower().strip().replace(" ", "_")
        if job in allowed and p.get("name") and job not in ("king", "queen", "elf_king", "elf_queen"):
            people.append({"name": str(p["name"])[:24], "job": job, "personality": str(p.get("personality", ""))[:160], "notable": True})
    for job in set(REQUIRED[s.type]):
        while sum(p["job"] == job for p in people) < REQUIRED[s.type].count(job):
            people.append({"name": gen_name(race, rng), "job": job, "personality": "", "notable": True})
    if ruler_job:
        people.insert(0, {"name": ruler_name or gen_name(race, rng), "job": ruler_job, "personality": "", "notable": True})
    lo, hi, default = POPULATION[s.type]
    pop = (plan or {}).get("population")
    pop = max(lo, min(hi, int(pop))) if isinstance(pop, (int, float)) else default
    while len(people) < pop:
        people.append({"name": gen_name(race, rng), "job": rng.choice(FILLER[s.type]), "personality": "", "notable": False})

    homes = [b for b in s.layout if b.kind in HOME_KINDS] or [None]
    residents = []
    for i, p in enumerate(people):
        job = JOBS[p["job"]]
        home = homes[i % len(homes)]
        tree = home is not None and home.kind in ("treehouse", "palace", "shrine")
        night = _spot(s, job.night, rng) if job.night else Pos(
            x=(home.x if home else s.cx) + (4.5 if tree else 0.5) + (rng.random() - 0.5) * 3, z=(home.z if home else s.cz) + (4.5 if tree else 0.5) + (rng.random() - 0.5) * 3)
        kind = job.kind or BASE_KIND[race]
        if race == "elf":
            kind = ELF_KIND.get(kind, kind)
        residents.append(Resident(
            id=s.id * 1000 + i, name=p["name"], job=p["job"], label=job.label, race=race, kind=kind,
            service=job.service, body=job.body, hair=job.hair, personality=p["personality"], notable=p["notable"],
            work=_spot(s, job.work, rng), night=night))
    s.residents = residents
    s.ruler = residents[0].name if ruler_job else s.ruler
    s.version += 1

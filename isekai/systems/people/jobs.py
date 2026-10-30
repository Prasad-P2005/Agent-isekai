"""Every job a resident can have: how they look, where they work, where they sleep, and what service they offer."""
from dataclasses import dataclass

from ...content import JOBS as DATA, color


@dataclass(frozen=True)
class Job:
    label: str
    work: str  # building kind, or 'field' / 'gate' / 'shore'
    night: str | None = None  # None = sleep at home
    kind: str | None = None  # entity type; None = the race's default body
    service: str | None = None  # shop/service panel opened when talked to
    body: int | None = None
    hair: int | None = None


JOBS: dict[str, Job] = {name: Job(**{**spec, "body": color(spec.get("body")), "hair": color(spec.get("hair"))}) for name, spec in DATA["jobs"].items()}

RACE_OF = DATA["race_of"]
# elves have their own look for jobs whose default body is human
ELF_KIND = DATA["elf_kind"]
BASE_KIND = DATA["base_kind"]
ROYAL = set(DATA["royal"])

JOBS_FOR = DATA["jobs_for"]
# jobs every settlement of a type must have, whatever the god plans
REQUIRED = DATA["required"]
# Weighted occupation pools: rural settlements farm and trade locally;
# cities support a larger guard, guild and market workforce.
FILLER = DATA["filler"]
POPULATION = DATA["population"]

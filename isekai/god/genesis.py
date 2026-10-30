"""Genesis: the god names the world, its rulers, its settlements, the Demon Lord and writes its laws."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from ..core.state import World
from ..llm.client import LLM
from ..systems.laws import CRIMES, DEFAULT_LAWS, PUNISHMENTS, SCOPES, validate_law

Crime = Literal[tuple(CRIMES)]  # type: ignore[valid-type]
Scope = Literal[tuple(SCOPES)]  # type: ignore[valid-type]
Punishment = Literal[tuple(PUNISHMENTS)]  # type: ignore[valid-type]


class LawDraft(BaseModel):
    name: str
    crime: Crime
    scope: Scope
    needs_witness: bool
    punishment: Punishment
    severity: int


class Genesis(BaseModel):
    world_name: str
    premise: str
    god_name: str
    god_is: Literal["goddess", "god"]
    god_intro: str
    hero: str
    kingdom_name: str
    capital_name: str
    king_name: str
    second_city_name: str
    second_city_ruler: str
    human_villages: list[str]
    elf_villages: list[str]
    elf_capital_name: str
    elf_ruler_name: str
    elf_ruler_is: Literal["king", "queen"]
    beast_villages: list[str]
    demon_lord_name: str
    demon_realm_name: str
    raid_every_minutes: float
    prosperity: Literal["poor", "normal", "rich"]
    currency: str
    laws: list[LawDraft]


PROMPT = """Create a brand new isekai world. A soul who died on modern Earth is about to meet the god in heaven and be
reincarnated into this world with one mission: defeat the Demon Lord.
Invent: the world name and premise; the deity (a goddess or a god), their name and first words to the soul in heaven
(god_intro: 2 sentences, casual and friendly like a cheerful anime goddess chatting with a friend, not formal);
who the hero is reborn as; the human kingdom, its capital city and its King; a second city and its ruler;
the elven kingdom's capital city in the great forest and its Elf King or Elf Queen;
names for 4 human villages, 2 elven villages in the woods and 4 beastkin (demi-human) villages;
the Demon Lord and his realm; how often demon armies raid (raid_every_minutes, 3-15); the economy (poor/normal/rich) and currency.
Also write 4-6 LAWS that the world itself enforces. A law can require a witness, for example
{"name": "Law of the Crown", "crime": "kill_human", "scope": "cities", "needs_witness": true, "punishment": "golem_hunters", "severity": 3}
means: if someone kills a human in a city and is seen, golems hunt them, but if nobody sees it, nothing happens.
Seed: {seed}"""

FALLBACK_NAMES = {"human": ["Millbrook", "Ashford", "Greenhollow", "Stonebridge"], "elf": ["Lothariel", "Sylvanesti", "Eldergrove"],
                  "beast": ["Fangrock", "Sunpaw Den", "Thunderhoof", "Whisker Hollow"], "city": ["Aldoria", "Port Valen"], "elfcity": ["Ithilwen"]}


def clean_name(v: str | None, n: int = 40) -> str:
    """Small models decorate names: 'King Aldric, ruler of X', 'Millbrook (East)'. Keep just the name.
    Returns '' for garbage such as leaked JSON ('demon_lord_name": "Lich-King'), so the caller falls back to a default."""
    if re.search(r'[{}:_"]|\\', (v or "").strip(' "')):
        return ""
    v = re.sub(r"\s*[\(\[].*?[\)\]]", "", (v or "").strip(" .\"'"))
    v = re.split(r",| - | \u2014 | ruler of | of the kingdom", v)[0]
    v = re.sub(r"^(?:(?:King|Queen|Lord|Lady|Emperor|Empress)\s+)+", "", v.strip(), flags=re.I)
    v = v.strip(" .\"'")
    return v[:n].strip()


def clean_prose(v: str | None) -> str:
    """Cut JSON that leaked into prose ('...", "first_words": [...') and form labels ('Hero Name (Original): Marcus')."""
    v = re.split(r'"\s*,\s*"|"\s*[\]}]', (v or "").strip())[0]
    v = re.sub(r'^[A-Za-z _]{2,30}(?:\([^)]*\))?\s*:\s+', "", v.strip(' "\'[{'))
    return v.strip(' "\'[]{},')


def _s(v: str | None, default: str, n: int = 40) -> str:
    v = (v or "").strip()
    return v[:n] if v else default


def _name(v: str | None, default: str, n: int = 30) -> str:
    return clean_name(v, n) or default


def ensure_core_laws(laws: list) -> None:
    """Murdering humans is a crime throughout the kingdom, whatever else the god decides."""
    if not any(l.crime == "kill_human" and l.scope in ("everywhere", "human_kingdom") for l in laws):
        core = DEFAULT_LAWS[0].model_copy()
        if any(l.name == core.name for l in laws):
            core.name = "The King's Peace"
        laws.insert(0, core)


def tidy_names(world: World) -> None:
    """Clean every LLM-made name in place (also used to repair older saves)."""
    world.hero = clean_prose(world.hero) or "a young adventurer with a mysterious past"
    world.god_intro = clean_prose(world.god_intro) or world.god_intro
    world.premise = clean_prose(world.premise) or world.premise
    world.king_name = _name(world.king_name, "Aldric")
    world.demon_lord_name = _name(world.demon_lord_name, "Malzareth")
    if world.demon_lord_name.lower().removeprefix("the ") in ("demon lord", "demon king", "dark lord"):
        world.demon_lord_name = "Malzareth"
    used = {s.name for s in world.settlements}
    for s in world.settlements:
        if not clean_name(s.name, 30):
            i = world.settlements_of(s.type).index(s)
            spare = [n for n in FALLBACK_NAMES[s.type] if n not in used] or [f"{FALLBACK_NAMES[s.type][0]} {i + 2}"]
            s.name = spare[i % len(spare)]
            used.add(s.name)
        s.name = _name(s.name, "Nameless")
        if s.ruler:
            s.ruler = _name(s.ruler, "Seraphine")
        for r in s.residents:
            if r.job in ("king", "queen", "elf_king", "elf_queen"):
                r.name = _name(r.name, "Aldric")


async def run_genesis(world: World, llm: LLM) -> None:
    g = await llm.ask(PROMPT.replace("{seed}", str(world.seed)), Genesis)
    world.name = _s(g and g.world_name, "Aldervale", 50)
    world.premise = _s(g and clean_prose(g.premise), "A world of swords and sorcery, darkened by the Demon Lord's shadow.", 400)
    world.god_name = _s(g and g.god_name, "Aurelia", 30)
    world.god_is = g.god_is if g else "goddess"
    world.god_intro = _s(g and clean_prose(g.god_intro), f"Welcome, lost soul. I am {world.god_name}. Your life on Earth has ended, but a new one awaits you.", 500)
    world.hero = _s(g and clean_prose(g.hero), "a young adventurer with a mysterious past", 160)
    world.kingdom = _s(g and g.kingdom_name, "the Kingdom of Aldoria")
    world.king_name = _s(g and g.king_name, "Aldric III", 30)
    world.demon_lord_name = _s(g and g.demon_lord_name, "Malzareth", 30)
    world.demon_realm_name = _s(g and g.demon_realm_name, "the Ashen Throne")
    world.raid_every = max(3.0, min(15.0, g.raid_every_minutes if g else 8.0)) * 60
    world.prosperity = g.prosperity if g else "normal"
    world.currency = _s(g and g.currency, "gold", 16)
    laws = [l for l in (validate_law(d.model_dump()) for d in (g.laws if g else [])) if l][:6]
    ensure_core_laws(laws)
    world.laws = laws if len(laws) >= 2 else list(DEFAULT_LAWS)

    names = {"human": g.human_villages if g else [], "elf": g.elf_villages if g else [], "beast": g.beast_villages if g else [],
             "city": [g.capital_name, g.second_city_name] if g else [], "elfcity": [g.elf_capital_name] if g else []}
    for t, lst in names.items():
        for i, s in enumerate(world.settlements_of(t)):
            s.name = _s(lst[i] if i < len(lst) else None, FALLBACK_NAMES[t][i % len(FALLBACK_NAMES[t])], 30)
    world.elf_ruler_name = _name(g and g.elf_ruler_name, "Sylwen")
    world.elf_ruler_title = f"elf_{g.elf_ruler_is}" if g else "elf_queen"
    second = world.settlements_of("city")[1]
    second.ruler = _s(g and g.second_city_ruler, "Queen Seraphine", 30)
    lx, lz = world.demon_land
    world.lands[lz][lx].name = world.demon_realm_name
    tidy_names(world)
    world.genesis_done = True

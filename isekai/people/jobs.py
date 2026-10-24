"""Every job a resident can have: how they look, where they work, where they sleep, and what service they offer."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Job:
    label: str
    work: str  # building kind, or 'field' / 'gate'
    night: str | None = None  # None = sleep at home
    kind: str | None = None  # entity type; None = the race's default body
    service: str | None = None  # shop/service panel opened when talked to
    body: int | None = None
    hair: int | None = None


JOBS: dict[str, Job] = {
    "king": Job("King", "keep", "keep", kind="king", service="king"),
    "queen": Job("Queen", "keep", "keep", kind="king", service="king", body=0xA02060),
    "elf_king": Job("Elf King", "palace", "palace", kind="elf_royal", service="king"),
    "elf_queen": Job("Elf Queen", "palace", "palace", kind="elf_royal", service="king", body=0xE8F4FF),
    "guild_master": Job("Guild Master", "guild", kind="knight", service="guild", body=0x5A3A2A, hair=0x888888),
    "receptionist": Job("Guild Receptionist", "guild", service="guild", body=0xFF9AC8, hair=0xFFD36B),
    "adventurer": Job("Adventurer", "guild", "inn", kind="adventurer"),
    "doctor": Job("Doctor", "hospital", service="doctor", body=0xF4F4F4, hair=0x3A2A1A),
    "nurse": Job("Nurse", "hospital", service="doctor", body=0xFFFFFF, hair=0xD08050),
    "innkeeper": Job("Innkeeper", "inn", "inn", service="inn", body=0x8A5A2A),
    "blacksmith": Job("Blacksmith", "smithy", service="smith", body=0x3A3A3A, hair=0x111111),
    "priest": Job("Priest", "church", service="priest", body=0xF8F0D0, hair=0xDDDDDD),
    "merchant": Job("Market Merchant", "stall", kind="merchant", service="trade"),
    "peddler": Job("Street Peddler", "street_stall", kind="merchant", service="trade"),
    "fisherman": Job("Fisher", "shore", body=0x477f91, hair=0x493b32),
    "guard": Job("Guard", "gate", "gate", kind="knight"),
    "farmer": Job("Farmer", "field", body=0x6A8A3A),
    "baker": Job("Baker", "stall", body=0xF0D8A0),
    "bard": Job("Bard", "inn", body=0x3A6AC8, hair=0xC84A3A),
    "elder": Job("Elder", "shrine", service="elder"),
    "herbalist": Job("Herbalist", "elfhall", service="doctor", body=0x6AB06A),
    "ranger": Job("Ranger", "field", body=0x2A5A2A),
    "chief": Job("Chief", "chief", service="chief", body=0x8A3A1A, hair=0xFFD36B),
    "shaman": Job("Shaman", "lodge", service="priest", body=0x5A2A6A),
    "hunter": Job("Hunter", "field", body=0x6A4A2A),
    "warrior": Job("Warrior", "gate", "gate", kind="adventurer", body=0x8A2A1A),
}

RACE_OF = {"human": "human", "city": "human", "elfcity": "elf", "elf": "elf", "beast": "beastkin"}
# elves have their own look for jobs whose default body is human
ELF_KIND = {"knight": "elf_guard", "adventurer": "elf_guard", "merchant": "elf", "villager": "elf"}
BASE_KIND = {"human": "villager", "elf": "elf", "beastkin": "beastkin"}

JOBS_FOR = {
    "human": ["guild_master", "receptionist", "adventurer", "doctor", "nurse", "innkeeper", "blacksmith", "priest", "merchant", "peddler", "fisherman", "guard", "farmer", "baker", "bard"],
    "city": ["king", "queen", "guild_master", "receptionist", "adventurer", "doctor", "nurse", "innkeeper", "blacksmith", "priest", "merchant", "peddler", "fisherman", "guard", "farmer", "baker", "bard"],
    "elfcity": ["guild_master", "receptionist", "adventurer", "herbalist", "innkeeper", "priest", "merchant", "guard", "ranger", "bard", "elder"],
    "elf": ["elder", "herbalist", "ranger", "merchant", "adventurer", "bard"],
    "beast": ["chief", "shaman", "hunter", "warrior", "blacksmith", "merchant", "adventurer"],
}
# jobs every settlement of a type must have, whatever the god plans
REQUIRED = {
    "human": ["guild_master", "receptionist", "doctor", "doctor", "innkeeper", "blacksmith", "priest", "merchant", "adventurer", "adventurer"],
    "city": ["guild_master", "receptionist", "doctor", "doctor", "doctor", "innkeeper", "blacksmith", "priest", "merchant", "merchant",
             "adventurer", "adventurer", "adventurer", "guard", "guard"],
    "elfcity": ["guild_master", "receptionist", "herbalist", "herbalist", "innkeeper", "priest", "merchant", "merchant", "adventurer", "adventurer", "guard", "guard", "elder"],
    "elf": ["elder", "herbalist", "merchant", "ranger"],
    "beast": ["chief", "shaman", "blacksmith", "merchant", "hunter"],
}
FILLER = {
    # Weighted occupation pools: rural settlements farm and trade locally;
    # cities support a larger guard, guild and market workforce.
    "human": ["farmer"] * 6 + ["guard", "adventurer", "baker", "merchant", "peddler"],
    "city": ["farmer"] * 5 + ["guard"] * 3 + ["adventurer"] * 2 + ["merchant"] * 3 + ["peddler"] * 2 + ["baker", "bard", "nurse"],
    "elfcity": ["ranger", "ranger", "guard", "bard", "merchant", "herbalist"],
    "elf": ["ranger", "ranger", "herbalist", "bard"],
    "beast": ["hunter", "hunter", "warrior", "warrior"],
}
POPULATION = {"city": (100, 180, 130), "elfcity": (50, 100, 70), "human": (20, 60, 40), "elf": (20, 60, 30), "beast": (20, 60, 35)}

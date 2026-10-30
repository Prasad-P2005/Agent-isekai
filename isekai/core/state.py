"""All persistent game state, as pydantic models so it can be saved, loaded and sent to the client."""
from __future__ import annotations

from pydantic import AliasChoices, BaseModel, Field


class Pos(BaseModel):
    x: float
    z: float


class Vec3(BaseModel):
    x: float
    y: float
    z: float


class Building(BaseModel):
    kind: str
    x: int
    z: int
    door: str = "s"


class Resident(BaseModel):
    id: int
    name: str
    job: str
    label: str
    race: str
    kind: str  # entity body type the client renders
    service: str | None = None
    body: int | None = None
    hair: int | None = None
    personality: str = ""
    notable: bool = False
    work: Pos
    night: Pos
    dead: bool = False
    memory: list[str] = Field(default_factory=list)


class Settlement(BaseModel):
    id: int
    type: str  # human | city | elf | beast
    lx: int
    lz: int
    cx: int
    cz: int
    coastal: bool = False
    shore_direction: str | None = None
    name: str = "Nameless"
    description: str = ""
    rumor: str = ""
    ruler: str | None = None
    planned: bool = False
    version: int = 0
    layout: list[Building] = Field(default_factory=list)
    residents: list[Resident] = Field(default_factory=list)


class Land(BaseModel):
    realm: str  # elf | human | beast | peaks | ocean | demon
    structure: str = "none"
    density: float = 0.55
    settlement: int | None = None
    name: str | None = None


class Law(BaseModel):
    name: str
    crime: str
    scope: str = "everywhere"
    needs_witness: bool = True
    punishment: str = "bounty"
    severity: int = 2


class GuildQuest(BaseModel):
    title: str
    kind: str
    count: int
    reward: int
    progress: int = 0
    settlement: int = -1


class Player(BaseModel):
    gold: int = 30
    bounty: int = 0
    notoriety: int = 0
    potions: int = 1
    mana_potions: int = 0
    loot: dict[str, int] = Field(default_factory=dict)
    weapon: int = 0
    weapon_name: str = "Fists"
    armor: float = 0.0
    armor_name: str = "Clothes"
    tool: float = 1.0  # mining speed multiplier
    tool_name: str = "Bare hands"
    blocks: dict[str, int] = Field(default_factory=dict)  # block id -> count
    abilities: list[str] = Field(default_factory=list)
    max_hp: int = 20
    kills: int = 0
    deaths: int = 0
    guild_rank: int = 0
    guild_done: int = 0
    active_quest: GuildQuest | None = None
    blessed_by: list[int] = Field(default_factory=list)
    descended: bool = False
    # where the session stood; None until the client has reported, and the world spawn is used instead
    pos: Vec3 | None = None
    hp: float | None = None
    mana: float | None = None
    wanted: float = 0


class Story(BaseModel):
    stage: int = 0
    flags: dict[str, bool] = Field(default_factory=dict)
    beats: list[str] = Field(default_factory=list)


class FeedItem(BaseModel):
    id: int
    type: str  # narration | decree | event | settlement | toast
    text: str = ""
    data: dict = Field(default_factory=dict)


class Timer(BaseModel):
    """Something due later on the game clock. Saved with the world, so a restart cannot lose it."""
    due: float
    kind: str  # successor
    data: dict = Field(default_factory=dict)


class World(BaseModel):
    seed: int
    save_version: int = Field(default=0, validation_alias=AliasChoices("save_version", "society_version"))
    genesis_done: bool = False
    name: str = "Aldervale"
    premise: str = ""
    hero: str = "a reincarnated hero"
    god_name: str = "Aurelia"
    god_is: str = "goddess"
    god_intro: str = ""
    kingdom: str = "the Kingdom of Aldoria"
    king_name: str = "Aldric III"
    elf_ruler_name: str = "Sylwen"
    elf_ruler_title: str = "elf_queen"
    demon_lord_name: str = "Malzareth"
    demon_realm_name: str = "the Ashen Throne"
    demon_lord_dead: bool = False
    raid_every: float = 480
    raid_level: int = 0
    prosperity: str = "normal"
    currency: str = "gold"
    laws: list[Law] = Field(default_factory=list)
    lands: list[list[Land]] = Field(default_factory=list)
    settlements: list[Settlement] = Field(default_factory=list)
    spawn: Pos = Pos(x=0, z=0)
    demon_land: tuple[int, int] = (7, 0)
    player: Player = Field(default_factory=Player)
    story: Story = Field(default_factory=Story)
    heaven_chat: list[tuple[str, str]] = Field(default_factory=list)
    visited: list[str] = Field(default_factory=list)
    clock: float = 0  # seconds played; everything scheduled runs on this, so a pause pauses it all
    day_time: float = 0.08  # 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
    cooldowns: dict[str, float] = Field(default_factory=dict)
    timers: list[Timer] = Field(default_factory=list)
    festival_until: float = 0
    block_edits: dict[str, dict[str, int]] = Field(default_factory=dict)  # chunk key -> block index -> block id
    feed: list[FeedItem] = Field(default_factory=list)
    feed_next: int = 1

    # ---- helpers ----
    def push(self, type: str, text: str = "", **data) -> FeedItem:
        item = FeedItem(id=self.feed_next, type=type, text=text, data=data)
        self.feed_next += 1
        self.feed.append(item)
        del self.feed[:-200]
        if type == "narration" and text:
            self.story.beats.append(text)
            del self.story.beats[:-30]
        return item

    def settlements_of(self, type: str) -> list[Settlement]:
        return [s for s in self.settlements if s.type == type]

    def capital(self) -> Settlement:
        return self.settlements_of("city")[0]

    def land_at(self, lx: int, lz: int) -> Land | None:
        if 0 <= lz < len(self.lands) and 0 <= lx < len(self.lands[lz]):
            return self.lands[lz][lx]
        return None

    def cooldown_ready(self, name: str, seconds: float) -> bool:
        return name not in self.cooldowns or self.clock - self.cooldowns[name] >= seconds

    def mark(self, name: str) -> None:
        self.cooldowns[name] = self.clock

    def after(self, seconds: float, kind: str, **data) -> None:
        self.timers.append(Timer(due=self.clock + seconds, kind=kind, data=data))

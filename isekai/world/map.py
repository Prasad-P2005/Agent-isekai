"""The finite world: an 8 x 8 grid of 64 x 64-block lands, surrounded by the endless sea."""
from __future__ import annotations

from ..state import Land, Settlement
from .layouts import make_layout

LAND = 64
# Realm letter: E elf, H human, B beastkin, P peaks, O ocean, D demon.
# Feature letter: v village, C city, g grove, f forest, s spire, c demon castle, p mermaid palace, r ruins, . open land
MAP_ROWS = [
    "Ef Ev Eg Hv H. Ps D. Dc",
    "Ev Ef E. H. Hv P. Ps D.",
    "Eg EC H. HC H. H. P. P.",
    "Ef E. Hv H. H. Bv B. B.",
    "O. E. H. H. HC B. Bv B.",
    "Op H. Hv H. B. Bv B. Bv",
    "O. O. H. B. B. B. B. B.",
    "O. Op O. B. Br B. B. B.",
]
REALMS = {"E": "elf", "H": "human", "B": "beast", "P": "peaks", "O": "ocean", "D": "demon"}
FEATURES = {"g": "treehouse_grove", "s": "crystal_spire", "c": "demon_castle", "p": "mermaid_palace", "r": "ruins"}
SETTLEMENT_STRUCTURE = {"city": "city", "elfcity": "elf_city", "elf": "elf_village", "beast": "beast_village", "human": "village"}


def build_map() -> tuple[list[list[Land]], list[Settlement], tuple[int, int]]:
    lands: list[list[Land]] = []
    settlements: list[Settlement] = []
    demon_land = (7, 0)
    for lz, row in enumerate(MAP_ROWS):
        out = []
        for lx, code in enumerate(row.split()):
            realm_c, feat = code[0], code[1]
            land = Land(realm=REALMS[realm_c], structure=FEATURES.get(feat, "none"), density=0.95 if feat == "f" else 0.55)
            if feat in "vC":
                if feat == "C":
                    type_ = "elfcity" if realm_c == "E" else "city"
                else:
                    type_ = {"E": "elf", "B": "beast"}.get(realm_c, "human")
                s = Settlement(id=len(settlements), type=type_, lx=lx, lz=lz, cx=lx * LAND + LAND // 2, cz=lz * LAND + LAND // 2)
                s.layout = make_layout(s)
                settlements.append(s)
                land.structure = SETTLEMENT_STRUCTURE[type_]
                land.settlement = s.id
            if feat == "c":
                demon_land = (lx, lz)
            out.append(land)
        lands.append(out)
    return lands, settlements, demon_land

import random

SYLLABLES = {
    "human": (["Al", "Bren", "Cor", "Da", "El", "Fa", "Gar", "Hel", "Is", "Jo", "Ka", "Lu", "Ma", "Ne", "Or", "Pe", "Ro", "Sa", "Ti", "Wil"],
              ["ric", "na", "den", "la", "mund", "ra", "win", "ssa", "bert", "lia", "ton", "ette"]),
    "elf": (["Ae", "Cael", "Eli", "Fae", "Gal", "Ith", "Lir", "Syl", "Thal", "Yl"], ["adriel", "wen", "orn", "iel", "thas", "ara", "ion", "essa"]),
    "beastkin": (["Ru", "Ka", "Gro", "Nal", "Tor", "Fen", "Za", "Ba", "Ki", "Mo"], ["fus", "ba", "rr", "ka", "ra", "ro", "gan", "li"]),
}


def gen_name(race: str, rng: random.Random) -> str:
    a, b = SYLLABLES[race]
    return rng.choice(a) + rng.choice(b)

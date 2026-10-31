"""Writes the table of everything the player can hold, and every way of making it: python tools/make_items.py

Nine tiers of ten tools and fourteen sets of four pieces are far too many to keep in step by hand, so the balance
lives in the tables here and the content files are what they come to. Change it here and commit what it writes.
The art each item names is in client/js/view/itemart.js. Standard library only.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
ITEMS_FILE = CONTENT / "items.json"
RECIPES_FILE = CONTENT / "recipes.json"
STACK = 99

items: dict[str, dict] = {}
recipes: list[dict] = []


def item(id_, name, group, art=None, pal=None, stack=STACK, **extra):
    assert id_ not in items, id_
    entry = {"name": name, "group": group, "stack": stack}
    if art:
        entry["art"] = art
    if pal:
        entry["pal"] = pal
    items[id_] = {**entry, **extra}


def shaped(out, at, rows, keys, n=1, tag=""):
    recipes.append({"id": f"{out}{tag}", "out": out, "n": n, "at": at, "shape": rows, "keys": keys})


def shapeless(out, at, of, n=1, tag=""):
    recipes.append({"id": f"{out}{tag}", "out": out, "n": n, "at": at, "of": of})


def smelt(out, at, in_, time=10, n=1, tag=""):
    recipes.append({"id": f"{out}{tag}", "out": out, "n": n, "at": at, "in": in_ if isinstance(in_, list) else [in_], "time": time})


# ---------- blocks are items too ----------
SKIP = {"Air", "Water", "Bedrock", "Grass", "Fae Grass", "Savanna Grass", "Farmland", "Dirt Path", "Snow Layer", "Wheat", "Lit Furnace", "Lit Forge"}
FUEL = {"Oak Log": 15, "Birch Log": 15, "Spruce Log": 15, "Palm Log": 15, "Elderwood": 15, "Planks": 15, "Birch Planks": 15, "Spruce Planks": 15, "Palm Planks": 15, "Elder Planks": 15, "Block of Coal": 800, "Hay Bale": 20}
BLOCK_ART = {name: slug_ for name, slug_ in (("Anvil", "anvil"), ("Crafting Table", "crafting_table"), ("Furnace", "furnace"), ("Forge", "forge"), ("Alchemy Table", "alchemy_table"), ("Chest", "chest"),
                                             ("Lantern", "lantern"), ("Torch", "torch"), ("Fence", "fence"))}  # a cube would misrepresent these, or lose them at this size
BLOCK_VALUE = {"Block of Coal": 18, "Block of Copper": 36, "Block of Iron": 72, "Block of Silver": 126, "Block of Gold": 108, "Block of Mithril": 360, "Block of Adamant": 810,
               "Block of Ruby": 270, "Block of Sapphire": 270, "Block of Emerald": 270, "Mana Crystal": 30, "Amethyst Block": 40}
slug = lambda name: re.sub(r"\W+", "_", name.lower()).strip("_")


def block_items():
    stairs = {}
    for b in json.loads((CONTENT / "blocks.json").read_text(encoding="utf-8")):
        name = b["name"]
        if name in SKIP:
            continue
        if (m := re.fullmatch(r"(.*Stairs) ([NESW])", name)):
            stairs.setdefault(m[1], []).append(b["id"])
            continue
        extra = {k: v for k, v in (("fuel", FUEL.get(name)), ("value", BLOCK_VALUE.get(name)), ("art", BLOCK_ART.get(name))) if v}
        item(slug(name), name, "blocks", block=b["id"], **extra)
    for name, ids in stairs.items():
        item(slug(name), name, "blocks", block=ids[0], place=ids)


# ---------- tools and weapons ----------
# name, unit, handle, harvest level, mining speed, durability, damage, art grade, where it is made, worth of one unit
TIERS = {
    "wood": ("Wooden", "planks", "stick", 0, 2, 59, 1, 0, "table", 1),
    "stone": ("Stone", "cobblestone", "stick", 1, 4, 131, 2, 0, "table", 1),
    "copper": ("Copper", "copper_ingot", "stick", 1, 5, 191, 2, 0, "table", 5),
    "gold": ("Golden", "gold_ingot", "stick", 1, 12, 64, 2, 1, "table", 12),
    "iron": ("Iron", "iron_ingot", "stick", 2, 6, 250, 3, 1, "table", 8),
    "silver": ("Silver", "silver_ingot", "stick", 2, 7, 320, 4, 1, "table", 14),
    "mithril": ("Mithril", "mithril_ingot", "stick", 3, 9, 900, 7, 2, "anvil", 40),
    "adamant": ("Adamant", "adamant_ingot", "stick", 4, 11, 1800, 10, 2, "anvil", 90),
    "dragon": ("Dragonsteel", "dragonsteel_ingot", "old_bone", 5, 14, 3000, 14, 2, "anvil", 220),
}
# name, class, damage, seconds a swing, durability, reach, motion, units of metal, shape
KINDS = {
    "pickaxe": ("Pickaxe", "pick", 0.6, 0.55, 1, 4.5, "pendulum", 3, ["mmm", ".s.", ".s."]),
    "axe": ("Axe", "axe", 1.3, 0.7, 1, 4.5, "chop", 3, ["mm.", "ms.", ".s."]),
    "shovel": ("Shovel", "shovel", 0.5, 0.55, 1, 4.5, "scoop", 1, ["m", "s", "s"]),
    "hoe": ("Hoe", "hoe", 0.3, 0.45, 1, 4.5, "sweep", 2, ["mm", ".s", ".s"]),
    "hammer": ("Hammer", "pick", 1.3, 0.9, 3, 4.5, "slam", 6, ["mmm", "mmm", ".s."]),
    "sword": ("Sword", "blade", 1, 0.4, 1, 4.5, "slash", 2, ["m", "m", "s"]),
    "greatsword": ("Greatsword", "blade", 1.7, 0.85, 1.5, 5, "cleave", 4, [".m.", ".m.", "msm"]),
    "dagger": ("Dagger", "blade", 0.6, 0.25, 0.8, 4, "stab", 1, ["m", "s"]),
    "spear": ("Spear", "blade", 0.9, 0.5, 1, 6, "thrust", 1, ["..m", ".s.", "s.."]),
    "mace": ("Mace", "blade", 1.4, 0.75, 1, 4.5, "bash", 4, [".mm", ".mm", "s.."]),
}
SILVER_BANE = 1.5


def tools():
    for tier, (word, unit, handle, level, speed, dur, dmg, grade, at, worth) in TIERS.items():
        for kind, (kname, cls, hit, cd, wear, reach, motion, units, shape) in KINDS.items():
            id_ = f"{tier}_{kind}"
            stats = {"tool": cls, "level": level, "speed": speed} if cls != "blade" else {}
            if kind == "hammer":
                stats["area"] = 1
            if tier == "silver":
                stats["bane"] = SILVER_BANE
            group = "tools" if cls != "blade" else "weapons"
            item(id_, f"{word} {kname}", group, f"{kind}{grade}", tier, stack=1, dur=round(dur * wear), dmg=round(dmg * hit, 1), cd=cd, reach=reach, motion=motion, value=max(1, units * worth), unit=unit, **stats)
            shaped(id_, at, shape, {"m": unit, "s": handle})


BOWS = {
    "hunting_bow": ("Hunting Bow", "bow", "wood", 384, 8, ["stick", "spider_silk"], "table"),
    "longbow": ("Longbow", "longbow", "iron", 640, 12, ["iron_ingot", "spider_silk"], "table"),
    "elven_bow": ("Elven Bow", "elvenbow", "mithril", 1000, 16, ["elder_planks", "emerald"], "table"),
    "dragon_bow": ("Dragonbone Bow", "dragonbow", "dragon", 2000, 24, ["old_bone", "dragon_scale"], "anvil"),
}
ARROWS = {
    "arrow": ("Arrow", "arrow", 0, ["flint", "stick"], 4),
    "iron_arrow": ("Iron Arrow", "arrow_iron", 3, ["iron_ingot", "stick"], 4),
    "mithril_arrow": ("Mithril Arrow", "arrow_mithril", 7, ["mithril_ingot", "stick"], 6),
}
SHIELDS = {
    "wooden_shield": ("Wooden Shield", "shield0", "wood", 120, 0.35, ("planks", "iron_ingot"), "table"),
    "iron_shield": ("Iron Shield", "shield1", "iron", 336, 0.5, ("iron_ingot", "planks"), "table"),
    "knight_shield": ("Knight's Shield", "shieldk", "knight", 500, 0.6, ("knight_steel", "gold_ingot"), "anvil"),
    "mithril_shield": ("Mithril Shield", "shield2", "mithril", 900, 0.7, ("mithril_ingot", "gold_ingot"), "anvil"),
    "dragon_shield": ("Dragonscale Shield", "shieldd", "dragon", 1600, 0.8, ("dragon_scale", "dragonsteel_ingot"), "anvil"),
}
STAFFS = {
    "apprentice_staff": ("Apprentice Staff", "staff0", "wood", 1.1, ("planks", "mana_crystal"), "table"),
    "crystal_staff": ("Crystal Staff", "staff1", "silver", 1.25, ("stick", "amethyst"), "table"),
    "arcanist_staff": ("Arcanist Staff", "staff2", "mithril", 1.4, ("gold_ingot", "sapphire"), "anvil"),
    "archmage_staff": ("Archmage's Staff", "staff3", "adamant", 1.6, ("adamant_ingot", "ruby"), "anvil"),
}


def ranged_and_arcane():
    for id_, (name, art, pal, dur, dmg, (arm, cord), at) in BOWS.items():
        item(id_, name, "weapons", art, pal, stack=1, dur=dur, dmg=dmg, reach=4.5, cd=0.3, motion="draw", ammo=True)
        shaped(id_, at, [".at", "a.t", ".at"], {"a": arm, "t": cord})
    for id_, (name, pal, dmg, (tip, shaft), n) in ARROWS.items():
        item(id_, name, "weapons", "arrow", pal, arrow=dmg)
        shaped(id_, "table", ["t", "s"], {"t": tip, "s": shaft}, n)
    item("fire_arrow", "Fire Arrow", "weapons", "arrow", "ember", arrow=5, burn=True)
    shapeless("fire_arrow", "table", ["arrow", "arrow", "arrow", "arrow", "coal"], 4)
    for id_, (name, art, pal, dur, block, (face, boss), at) in SHIELDS.items():
        item(id_, name, "weapons", art, pal, stack=1, dur=dur, slot="off", block=block, motion="guard")
        shaped(id_, at, ["fbf", "fff", ".f."], {"f": face, "b": boss})
    for id_, (name, art, pal, power, (shaft, gem), at) in STAFFS.items():
        item(id_, name, "weapons", art, pal, stack=1, dmg=1, cd=0.5, reach=4.5, spell=power, motion="channel")
        shaped(id_, at, ["..g", ".s.", "s.."], {"g": gem, "s": shaft})
    item("shears", "Shears", "tools", "shears", "iron", stack=1, tool="shears", speed=6, level=0, dur=238, dmg=0, cd=0.4, reach=4.5, motion="snip")
    shaped("shears", "table", [".i", "i."], {"i": "iron_ingot"})


# ---------- armour ----------
PIECES = {  # slot, units of material, share of the set's defence, shape
    "helm": ("head", "Helm", 5, 0.18, ["mmm", "m.m"]),
    "chest": ("body", "Cuirass", 8, 0.42, ["m.m", "mmm", "mmm"]),
    "legs": ("legs", "Greaves", 7, 0.28, ["mmm", "m.m", "m.m"]),
    "boots": ("feet", "Boots", 4, 0.12, ["m.m", "m.m"]),
}
# name, styles for each piece, palette, unit, defence of the whole set, durability of the cuirass, where, worth
SOFT = ("soft", "soft", "soft", "soft")
ARMOURS = {
    "leather": ("Leather", SOFT, "leather", "leather", 7, 80, "table", 8),
    "trollhide": ("Trollhide", SOFT, "trollhide", "troll_hide", 12, 200, "table", 30),
    "chainmail": ("Chainmail", ("mail", "mail", "plate", "plate"), "chain", "chain_link", 12, 180, "table", 3),
    "copper": ("Copper", ("plate",) * 4, "copper", "copper_ingot", 12, 160, "table", 5),
    "iron": ("Iron", ("plate",) * 4, "iron", "iron_ingot", 15, 240, "table", 8),
    "gold": ("Golden", ("fine", "fine", "plate", "plate"), "gold", "gold_ingot", 11, 110, "table", 12),
    "silver": ("Silver", ("fine", "fine", "plate", "plate"), "silver", "silver_ingot", 17, 300, "table", 14),
    "knight": ("Knight", ("knight", "knight", "plate", "plate"), "knight", "knight_steel", 20, 380, "anvil", 18),
    "mithril": ("Mithril", ("wing",) * 4, "mithril", "mithril_ingot", 24, 650, "anvil", 40),
    "adamant": ("Adamant", ("wing",) * 4, "adamant", "adamant_ingot", 30, 1000, "anvil", 90),
    "dragonscale": ("Dragonscale", ("scale",) * 4, "dragon", "dragon_scale", 36, 1400, "anvil", 120),
    "demonplate": ("Demonplate", ("demon",) * 4, "demon", "demon_plate", 28, 800, "anvil", 45),
    "elven": ("Elven", ("elven",) * 4, "elven", "elven_weave", 18, 500, "table", 25),
    "arcane": ("Arcane", ("robe",) * 4, "arcane", "arcane_cloth", 8, 300, "table", 25),
}
ARMOUR_WORDS = {"soft": {"head": "Cap", "body": "Tunic", "legs": "Trousers", "feet": "Boots"}, "robe": {"head": "Hat", "body": "Robe", "legs": "Skirts", "feet": "Slippers"}}
DURABILITY_SHARE = {"head": 0.68, "body": 1, "legs": 0.94, "feet": 0.8}


def armour():
    for id_, (word, styles, pal, unit, defence, dur, at, worth) in ARMOURS.items():
        for (part, (slot, plain, units, share, shape)), style in zip(PIECES.items(), styles):
            piece = ARMOUR_WORDS.get(style, {}).get(slot, plain)
            extra = {"mana_regen": 1.5} if id_ == "arcane" else {}
            item(f"{id_}_{part}", f"{word} {piece}", "armor", f"{part}_{style}", pal, stack=1, slot=slot, **{"def": max(1, round(defence * share))}, dur=round(dur * DURABILITY_SHARE[slot]), value=units * worth, set=id_, unit=unit, **extra)
            shaped(f"{id_}_{part}", at, shape, {"m": unit})


# ---------- what the ground and the monsters give ----------
METALS = {  # id, name, palette, worth of an ingot, smelted where, how long
    "copper": ("Copper", "copper", 5, "furnace", 10),
    "iron": ("Iron", "iron", 8, "furnace", 10),
    "silver": ("Silver", "silver", 14, "furnace", 12),
    "gold": ("Gold", "gold", 12, "furnace", 12),
    "mithril": ("Mithril", "mithril", 40, "forge", 16),
    "adamant": ("Adamant", "adamant", 90, "forge", 20),
}
GEMS = {"ruby": ("Ruby", "gem_oval", 30), "sapphire": ("Sapphire", "gem_square", 30), "emerald": ("Emerald", "gem_cut", 30), "amethyst": ("Amethyst", "shard", 10)}
RAW_PALETTE = {"iron": "rawiron"}  # iron comes out of the ground rust-stained, nothing like silver
FINE_INGOTS = {"silver", "gold", "mithril", "adamant"}  # stamped by whoever poured them
# Everything monsters leave. Names match creatures.json: this is where those names become items.
LOOT = {
    "Golem Core": ("core", "golem", 40), "Hunter Badge": ("badge", "gold", 10), "Deer Hide": ("hide", "deer", 4), "Boar Tusk": ("tusk", "ivory", 6), "Crab Claw": ("claw", "crab", 3),
    "Slime Gel": ("gel", "slime", 3), "Goblin Ear": ("ear", "goblin", 6), "Wolf Pelt": ("hide", "wolf", 5), "Stolen Purse": ("purse", "purse", 12), "Old Bone": ("bone", "bone", 7),
    "Spider Silk": ("silk", "silk", 7), "Orc Tusk": ("tusk", "orc", 14), "Troll Hide": ("hide", "trollhide", 30), "Wraith Ash": ("ash", "ash", 35), "Imp Wing": ("wing", "imp", 8),
    "Demon Horn": ("horn", "demon", 25), "Dragon Scale": ("scale", "dragon", 120),
}


def materials():
    item("stick", "Stick", "materials", "stick", "wood", fuel=5, value=1)
    item("coal", "Coal", "materials", "coal", "coal", fuel=80, value=2)
    item("charcoal", "Charcoal", "materials", "coal", "charcoal", fuel=80, value=1)
    item("flint", "Flint", "materials", "flint", "flint", value=1)
    item("clay_ball", "Clay", "materials", "clay", "clay", value=1)
    item("brick", "Brick", "materials", "brick", "brick", value=2)
    item("leather", "Leather", "materials", "leather", "leather", value=8)
    item("chain_link", "Chain Links", "materials", "chain", "chain", value=3)
    item("mana_dust", "Mana Dust", "materials", "dust", "mana", value=8)
    item("glass_bottle", "Glass Bottle", "materials", "bottle", value=2)
    item("bowl", "Bowl", "materials", "bowl", "wood", value=1)
    item("wheat", "Wheat", "materials", "wheat", value=1)
    item("wheat_seeds", "Wheat Seeds", "materials", "seeds", place=[59], value=1)
    item("knight_steel", "Knight Steel", "materials", "bar", "knight", value=18)
    item("demon_plate", "Demon Plate", "materials", "bar", "demon", value=45)
    item("elven_weave", "Elven Weave", "materials", "bolt", "elven", value=25)
    item("arcane_cloth", "Arcane Cloth", "materials", "bolt", "arcane", value=25)
    for id_, (word, pal, worth, at, time) in METALS.items():
        item(f"raw_{id_}", f"Raw {word}", "materials", f"raw_{id_}", RAW_PALETTE.get(id_, pal), value=worth // 2)
        item(f"{id_}_ingot", f"{word} Ingot", "materials", "ingot_fine" if id_ in FINE_INGOTS else "ingot", pal, value=worth)
        smelt(f"{id_}_ingot", at, f"raw_{id_}", time)
    item("dragonsteel_ingot", "Dragonsteel Ingot", "materials", "ingot_fine", "dragon", value=220)
    smelt("dragonsteel_ingot", "forge", ["adamant_ingot", "dragon_scale"], 30)
    for id_, (word, art, worth) in GEMS.items():
        item(id_, word, "materials", art, id_, value=worth)
    for name, (art, pal, worth) in LOOT.items():
        item(slug(name), name, "materials", art, pal, value=worth, loot=True)


# ---------- food and potions ----------
def food():
    meal = lambda id_, name, art, pal, heal, **kw: item(id_, name, "food", art, pal, use={"heal": heal}, motion="eat", **kw)
    meal("apple", "Apple", "apple", "apple", 3, value=2)
    meal("golden_apple", "Golden Apple", "apple", "goldapple", 16, value=70)
    meal("bread", "Bread", "bread", "bread", 5, value=3)
    meal("apple_pie", "Apple Pie", "pie", "pie", 8, value=6)
    meal("raw_venison", "Raw Venison", "meat", "rawmeat", 1, value=2)
    meal("roast_venison", "Roast Venison", "meat", "cooked", 7, value=6)
    meal("raw_boar", "Raw Boar", "chop", "rawmeat", 1, value=2)
    meal("roast_boar", "Roast Boar", "chop", "cooked", 8, value=7)
    meal("grilled_crab", "Grilled Crab", "claw", "cooked", 5, value=5)
    meal("mushroom_stew", "Mushroom Stew", "stew", "stew", 7, stack=1, returns="bowl", value=5)
    meal("fae_nectar", "Fae Nectar", "nectar", "fae", 4, value=20)
    items["fae_nectar"]["use"]["mana"] = 40
    shaped("bread", "table", ["www"], {"w": "wheat"})
    shapeless("apple_pie", "hand", ["apple", "apple", "wheat", "wheat"])
    shaped("golden_apple", "table", ["ggg", "gag", "ggg"], {"g": "gold_ingot", "a": "apple"})
    shapeless("mushroom_stew", "hand", ["bowl", "red_mushroom", "glowshroom"])
    shapeless("fae_nectar", "alchemy", ["glass_bottle", "fae_bloom", "fae_bloom"])
    for raw, done in (("raw_venison", "roast_venison"), ("raw_boar", "roast_boar"), ("crab_claw", "grilled_crab")):
        smelt(done, "furnace", raw, 6)


POTIONS = {  # id, name, art, palette, effect, ingredients
    "potion": ("Health Potion", "flask", "health", {"heal": 10}, ["glass_bottle", "red_mushroom", "slime_gel"], 15),
    "greater_health": ("Greater Health Potion", "phial", "health", {"heal": 25}, ["potion", "ruby"], 60),
    "mana": ("Mana Potion", "flask", "manap", {"mana": 50}, ["glass_bottle", "mana_dust", "glowshroom"], 12),
    "greater_mana": ("Greater Mana Potion", "phial", "manap", {"mana": 120}, ["mana", "sapphire"], 55),
    "swiftness": ("Potion of Swiftness", "flask", "swift", {"buff": "swift", "time": 90}, ["glass_bottle", "imp_wing", "dandelion"], 30),
    "strength": ("Potion of Strength", "flask", "strength", {"buff": "strength", "time": 90}, ["glass_bottle", "orc_tusk", "poppy"], 35),
    "stoneskin": ("Potion of Stoneskin", "flask", "stoneskin", {"buff": "stoneskin", "time": 60}, ["glass_bottle", "boar_tusk", "iron_ingot"], 35),
    "night_sight": ("Potion of Night Sight", "round", "night", {"buff": "night_sight", "time": 180}, ["glass_bottle", "glowshroom", "cornflower"], 30),
    "fireproof": ("Potion of Fireproofing", "round", "fireproof", {"buff": "fireproof", "time": 120}, ["glass_bottle", "crab_claw", "wraith_ash"], 40),
    "water_breath": ("Potion of Water Breathing", "round", "water", {"buff": "water_breath", "time": 120}, ["glass_bottle", "kelp", "pink_coral"], 30),
}


def potions():
    for id_, (name, art, pal, use, of, worth) in POTIONS.items():
        item(id_, name, "potions", art, pal, use=use, motion="drink", returns="glass_bottle", value=worth, stack=16)
        shapeless(id_, "alchemy", of)


# ---------- every way of making the rest ----------
LOGS = {"oak_log": "planks", "birch_log": "birch_planks", "spruce_log": "spruce_planks", "palm_log": "palm_planks", "elderwood": "elder_planks"}
STORES = {"coal": "block_of_coal", "copper_ingot": "block_of_copper", "iron_ingot": "block_of_iron", "silver_ingot": "block_of_silver", "gold_ingot": "block_of_gold", "mithril_ingot": "block_of_mithril",
          "adamant_ingot": "block_of_adamant", "ruby": "block_of_ruby", "sapphire": "block_of_sapphire", "emerald": "block_of_emerald"}


def making():
    for log, plank in LOGS.items():
        shapeless(plank, "hand", [log], 4)
        smelt("charcoal", "furnace", log, tag=f"_from_{log}")
        shaped("stick", "hand", ["p", "p"], {"p": plank}, 4, f"_from_{plank}")
    for unit, store in STORES.items():
        shaped(store, "table", ["uuu", "uuu", "uuu"], {"u": unit})
        shapeless(unit, "hand", [store], 9, "_from_block")
    # materials
    shapeless("leather", "table", ["deer_hide"], 1, "_from_deer")
    shapeless("leather", "table", ["wolf_pelt"], 2, "_from_wolf")
    shapeless("chain_link", "hand", ["iron_ingot"], 4)
    shapeless("mana_dust", "hand", ["mana_crystal"], 4)
    shapeless("clay_ball", "hand", ["red_clay"], 4)
    smelt("brick", "furnace", "clay_ball", 6)
    shaped("glass_bottle", "table", ["g.g", ".g."], {"g": "glass"}, 3)
    shaped("bowl", "table", ["p.p", ".p."], {"p": "planks"}, 4)
    shaped("knight_steel", "anvil", ["iii", "ici", "iii"], {"i": "iron_ingot", "c": "golem_core"}, 8)
    shapeless("demon_plate", "anvil", ["demon_horn", "wraith_ash", "iron_ingot"], 2)
    shapeless("elven_weave", "table", ["elder_planks", "emerald", "spider_silk"], 4)
    shapeless("arcane_cloth", "table", ["white_wool", "amethyst", "mana_dust"], 4)
    # stations
    shaped("crafting_table", "hand", ["pp", "pp"], {"p": "planks"})
    shaped("furnace", "table", ["ccc", "c.c", "ccc"], {"c": "cobblestone"})
    shaped("chest", "table", ["ppp", "p.p", "ppp"], {"p": "planks"})
    shaped("forge", "table", ["bbb", "bfb", "iii"], {"b": "bricks", "f": "furnace", "i": "iron_ingot"})
    shaped("anvil", "table", ["BBB", ".i.", "iii"], {"B": "block_of_iron", "i": "iron_ingot"})
    shaped("alchemy_table", "table", ["dgd", "ppp"], {"d": "mana_dust", "g": "glass_bottle", "p": "planks"})
    # light and fences
    shaped("torch", "hand", ["c", "s"], {"c": "coal", "s": "stick"}, 4)
    shaped("torch", "hand", ["c", "s"], {"c": "charcoal", "s": "stick"}, 4, "_from_charcoal")
    shaped("lantern", "table", [".i.", "iti", ".i."], {"i": "iron_ingot", "t": "torch"})
    shaped("fence", "table", ["psp", "psp"], {"p": "planks", "s": "stick"}, 3)
    shaped("rope_ladder", "table", ["s.s", "ppp", "s.s"], {"s": "spider_silk", "p": "stick"}, 6)
    # stone
    smelt("stone", "furnace", "cobblestone")
    smelt("deepstone", "furnace", "cobbled_deepstone")
    smelt("polished_stone", "furnace", "stone")
    smelt("glass", "furnace", "sand")
    smelt("terracotta", "furnace", "red_clay")
    smelt("dark_terracotta", "furnace", "terracotta")
    shaped("stone_bricks", "hand", ["ss", "ss"], {"s": "stone"}, 4)
    shaped("deepstone_bricks", "hand", ["ss", "ss"], {"s": "deepstone"}, 4)
    shaped("polished_marble", "hand", ["mm", "mm"], {"m": "marble"}, 4)
    shaped("marble_pillar", "table", ["m", "m"], {"m": "marble"}, 2)
    shapeless("gilded_marble", "table", ["polished_marble", "gold_ingot"])
    shaped("stone_slab", "table", ["sss"], {"s": "stone_bricks"}, 6)
    shaped("chiseled_stone_bricks", "table", ["s", "s"], {"s": "stone_slab"})
    shapeless("mossy_cobblestone", "hand", ["cobblestone", "moss"])
    shapeless("mossy_stone_bricks", "hand", ["stone_bricks", "moss"])
    shaped("sandstone", "hand", ["ss", "ss"], {"s": "sand"})
    shaped("bricks", "hand", ["bb", "bb"], {"b": "brick"})
    shaped("amethyst_block", "hand", ["aa", "aa"], {"a": "amethyst"})
    shaped("bone_block", "table", ["bbb", "bbb", "bbb"], {"b": "old_bone"})
    # roofs and walls
    shaped("roof_tiles", "table", ["b.b", ".b."], {"b": "brick"}, 4)
    shaped("slate_tiles", "hand", ["cc", "cc"], {"c": "cobbled_deepstone"}, 4)
    shaped("thatch", "hand", ["ww", "ww"], {"w": "wheat"}, 2)
    shaped("hay_bale", "table", ["www", "www", "www"], {"w": "wheat"})
    for stairs, unit in (("roof_tile_stairs", "roof_tiles"), ("thatch_stairs", "thatch"), ("slate_stairs", "slate_tiles")):
        shaped(stairs, "table", ["u..", "uu.", "uuu"], {"u": unit}, 4)
    shapeless("plaster", "hand", ["sand", "clay_ball"], 2)
    shapeless("timber_frame", "table", ["plaster", "stick"])
    shaped("plank_slab", "table", ["ppp"], {"p": "planks"}, 6)
    shaped("bookshelf", "table", ["ppp", "lll", "ppp"], {"p": "planks", "l": "leather"})
    shaped("barrel", "table", ["psp", "p.p", "psp"], {"p": "planks", "s": "plank_slab"})
    # cloth
    shaped("white_wool", "hand", ["ss", "ss"], {"s": "spider_silk"})
    shapeless("red_wool", "hand", ["white_wool", "poppy"])
    shaped("red_carpet", "table", ["rr"], {"r": "red_wool"}, 3)
    shapeless("royal_banner", "table", ["white_wool", "cornflower", "gold_ingot"])


# ---------- what is for sale: who sells it, the base price, and what the shelf says about it ----------
SHOP = {
    "potion": ("trade", 15, "+10 HP, key G"), "mana": ("trade", 12, "+50 mana, key V"), "torch": ("trade", 2, "lights the dark"), "rope_ladder": ("trade", 4, "climb it, both ways"),
    "bread": ("trade", 5, "+5 HP"), "arrow": ("trade", 2, "for a bow"), "hunting_bow": ("trade", 45, "needs arrows"), "crafting_table": ("trade", 6, "3 by 3 crafting"),
    "stone_pickaxe": ("smith", 14, "mines iron"), "iron_pickaxe": ("smith", 40, "mines silver and gold"), "mithril_pickaxe": ("smith", 160, "mines adamant"), "iron_axe": ("smith", 36, "fells trees"),
    "iron_shovel": ("smith", 20, "digs soil and sand"), "iron_sword": ("smith", 60, "+3 damage"), "mithril_sword": ("smith", 220, "+7 damage"), "iron_shield": ("smith", 55, "hold right click"),
    "leather_helm": ("smith", 12, "1 defence"), "leather_chest": ("smith", 22, "3 defence"), "leather_legs": ("smith", 16, "2 defence"), "leather_boots": ("smith", 10, "1 defence"),
    "knight_helm": ("smith", 60, "4 defence"), "knight_chest": ("smith", 110, "8 defence"), "knight_legs": ("smith", 80, "6 defence"), "knight_boots": ("smith", 45, "2 defence"),
}


def stock_shops():
    for id_, (seller, base, note) in SHOP.items():
        items[id_].update(sold_by=[seller], base=base, note=note)


def check():
    """A recipe that names something nobody can hold would only show up as a blank in the book."""
    for r in recipes:
        names = [r["out"], *r.get("keys", {}).values(), *r.get("of", []), *r.get("in", [])]
        missing = [n for n in names if n not in items]
        assert not missing, (r["id"], missing)
    ids = [r["id"] for r in recipes]
    assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]


def write(path, table):
    path.write_text(json.dumps(table, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    block_items()
    materials()
    tools()
    ranged_and_arcane()
    armour()
    food()
    potions()
    making()
    stock_shops()
    check()
    write(ITEMS_FILE, items)
    write(RECIPES_FILE, recipes)
    groups = {}
    for it in items.values():
        groups[it["group"]] = groups.get(it["group"], 0) + 1
    print(len(items), "items", groups, len(recipes), "recipes")


if __name__ == "__main__":
    main()

"""Trade: what merchants and blacksmiths sell, what loot is worth, and paid services (doctors, inns, priests, bounties)."""
from __future__ import annotations

import time

from ..state import World

ABILITIES = ["fireball", "heal", "double_jump", "swift", "flight", "giant_strength"]
CATALOG = {
    "potion": {"name": "Health Potion (+10 HP, key G)", "base": 15, "sold_by": {"trade"}},
    "mana": {"name": "Mana Potion (+50 mana, key V)", "base": 12, "sold_by": {"trade"}},
    "iron_sword": {"name": "Iron Sword (+3 damage)", "base": 60, "weapon": 3, "sold_by": {"smith"}},
    "mithril_sword": {"name": "Mithril Sword (+7 damage)", "base": 220, "weapon": 7, "sold_by": {"smith"}},
    "iron_pickaxe": {"name": "Iron Pickaxe (mine 2.5x faster)", "base": 40, "tool": 2.5, "sold_by": {"smith"}},
    "mithril_pickaxe": {"name": "Mithril Pickaxe (mine 5x faster)", "base": 160, "tool": 5.0, "sold_by": {"smith"}},
    "leather": {"name": "Leather Armor (-20% damage)", "base": 50, "armor": 0.2, "sold_by": {"smith"}},
    "plate": {"name": "Knight Plate (-45% damage)", "base": 200, "armor": 0.45, "sold_by": {"smith"}},
    **{f"scroll_{a}": {"name": f"Skill Scroll: {a.replace('_', ' ')}", "base": b, "ability": a, "sold_by": {"trade"}}
       for a, b in (("fireball", 130), ("heal", 100), ("double_jump", 80), ("swift", 90), ("giant_strength", 160), ("flight", 450))},
}
LOOT = {"slime": ("Slime Gel", 3), "goblin": ("Goblin Ear", 6), "wolf": ("Wolf Pelt", 5), "orc": ("Orc Tusk", 14),
        "dragon": ("Dragon Scale", 120), "imp": ("Imp Wing", 8), "demon_knight": ("Demon Horn", 25),
        "demon_lord": ("Demon Lord's Crown", 1500), "golem": ("Golem Core", 40), "bounty_hunter": ("Hunter Badge", 10)}
LOOT_VALUE = dict(LOOT.values())
PROSPERITY = {"poor": 0.75, "normal": 1.0, "rich": 1.4}


def price_multiplier(world: World) -> float:
    threat = 0 if world.demon_lord_dead else min(0.6, world.raid_level * 0.08)  # the war drives prices up
    festival = 0.8 if time.time() < world.festival_until else 1.0
    return PROSPERITY.get(world.prosperity, 1.0) * (1 + threat) * festival


def price(world: World, item_id: str) -> int:
    return max(1, round(CATALOG[item_id]["base"] * price_multiplier(world)))


def owned(world: World, item_id: str) -> bool:
    it, p = CATALOG[item_id], world.player
    return ("tool" in it and p.tool >= it["tool"]) or ("weapon" in it and p.weapon >= it["weapon"]) or ("armor" in it and p.armor >= it["armor"]) or ("ability" in it and it["ability"] in p.abilities)


def catalog_for(world: World, service: str) -> dict:
    items = [{"id": k, "name": v["name"], "price": price(world, k), "owned": owned(world, k)} for k, v in CATALOG.items() if service in v["sold_by"]]
    sell = [{"name": n, "count": c, "price": sell_price(world, n)} for n, c in world.player.loot.items() if c > 0] if service == "trade" else []
    notes = []
    if time.time() < world.festival_until:
        notes.append("Festival prices: -20%")
    if world.raid_level and not world.demon_lord_dead:
        notes.append(f"The war with {world.demon_lord_name} has raised prices")
    return {"items": items, "sell": sell, "notes": notes}


def sell_price(world: World, name: str) -> int:
    return max(1, round(LOOT_VALUE.get(name, 1) * PROSPERITY.get(world.prosperity, 1.0)))


def buy(world: World, item_id: str) -> str:
    if item_id not in CATALOG:
        return "No such item."
    p, it, cost = world.player, CATALOG[item_id], price(world, item_id)
    if owned(world, item_id):
        return "You already own that."
    if p.gold < cost:
        return "Not enough money."
    p.gold -= cost
    if item_id == "potion":
        p.potions += 1
    elif item_id == "mana":
        p.mana_potions += 1
    elif "tool" in it:
        p.tool, p.tool_name = it["tool"], it["name"].split(" (")[0]
    elif "weapon" in it:
        p.weapon, p.weapon_name = it["weapon"], it["name"].split(" (")[0]
    elif "armor" in it:
        p.armor, p.armor_name = it["armor"], it["name"].split(" (")[0]
    elif "ability" in it:
        p.abilities.append(it["ability"])
    return f"Bought {it['name'].split(' (')[0]} for {cost} {world.currency}."


def sell(world: World, name: str, all_: bool) -> str:
    p = world.player
    n = p.loot.get(name, 0) if all_ else min(1, p.loot.get(name, 0))
    if n <= 0:
        return "You have none of that."
    p.loot[name] -= n
    p.gold += n * sell_price(world, name)
    return f"Sold {n} {name} for {n * sell_price(world, name)} {world.currency}."


SERVICES = {
    "doctor": [("treat", "Full treatment (restore all HP)", 10), ("cure", "Lift a curse (restore max HP to 20)", 60)],
    "inn": [("rest", "Rest until morning (full HP and mana)", 8)],
    "priest": [("bless", "Blessing (+5 max HP, once per priest)", 80), ("pray", "Prayer for healing (+10 HP)", 5)],
    "bounty": [("pay", "Pay off your bounty and clear your name", 0), ("surrender", "Surrender: lose half your money and all loot", 0)],
}


def service_options(world: World, service: str) -> list[dict]:
    opts = []
    for action, label, cost in SERVICES.get(service, []):
        if service == "bounty" and action == "pay":
            cost = world.player.bounty + 25
        opts.append({"action": action, "label": label, "price": round(cost * price_multiplier(world)) if service != "bounty" else cost})
    return opts


def use_service(world: World, service: str, action: str, npc_id: int | None) -> tuple[str, dict]:
    p = world.player
    opt = next((o for o in service_options(world, service) if o["action"] == action), None)
    if not opt:
        return "They don't offer that.", {}
    if action == "surrender":
        p.gold //= 2
        p.loot.clear()
        p.bounty = 0
        return "You surrender. Your crimes are forgiven, at a price.", {"wanted": 0, "clear_wanted": True}
    if p.gold < opt["price"]:
        return "Not enough money.", {}
    if action == "bless" and npc_id in p.blessed_by:
        return "You have already received this priest's blessing.", {}
    p.gold -= opt["price"]
    if action == "treat":
        return "The doctor patches you up.", {"heal": 999}
    if action == "cure":
        p.max_hp = max(p.max_hp, 20)
        return "The curse lifts.", {"heal": 999}
    if action == "rest":
        return "You sleep soundly at the inn.", {"heal": 999, "mana": 999, "morning": True}
    if action == "bless":
        p.blessed_by.append(npc_id or -1)
        p.max_hp += 5
        return "A warm light fills you. Max HP +5.", {"heal": 5}
    if action == "pray":
        return "The priest prays over you.", {"heal": 10}
    if action == "pay":
        p.bounty = 0
        return "Your name is cleared.", {"wanted": 0, "clear_wanted": True}
    return "Done.", {}

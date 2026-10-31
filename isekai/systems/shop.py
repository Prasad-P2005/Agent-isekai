"""Trade: what merchants and blacksmiths sell, what loot is worth, and paid services (doctors, inns, priests, bounties)."""
from __future__ import annotations

import re

from ..content import ABILITIES, CREATURES, ITEMS, SERVICES as SERVICE_DATA
from ..core.state import World
from . import bag, magic
from .chronicle import standing

CATALOG = {
    **{k: {**v, "name": f"{v['name']} ({v['note']})"} for k, v in ITEMS.items() if "sold_by" in v},
    **{f"scroll_{a}": {"name": f"Skill Scroll: {a.replace('_', ' ')} ({spec['about']})", "base": spec["scroll"], "ability": a, "sold_by": ["trade"]}
       for a, spec in ABILITIES.items()},
}
slug = lambda name: re.sub(r"\W+", "_", name.lower()).strip("_")
LOOT = {kind: slug(c["loot"]["name"]) for kind, c in CREATURES.items() if "loot" in c}
PROSPERITY = {"poor": 0.75, "normal": 1.0, "rich": 1.4}
WAR_CAP = 0.3  # however bad the war gets, prices never rise more than this
STANDING_PRICE = {"famous": 0.95, "legend": 0.9, "infamous": 1.15, "feared": 1.3}  # traders charge what they think of you


def price_multiplier(world: World) -> float:
    threat = 0 if world.demon_lord_dead else min(WAR_CAP, world.war_pressure)  # the war drives prices up, until things calm down
    festival = 0.8 if world.clock < world.festival_until else 1.0
    return PROSPERITY.get(world.prosperity, 1.0) * (1 + threat) * festival * STANDING_PRICE.get(standing(world), 1.0)


def price(world: World, item_id: str) -> int:
    return max(1, round(CATALOG[item_id]["base"] * price_multiplier(world)))


def owned(world: World, item_id: str) -> bool:
    it = CATALOG[item_id]
    return "ability" in it and it["ability"] in world.player.abilities  # anything else can be bought again: tools wear out


def catalog_for(world: World, service: str) -> dict:
    items = [{"id": k, "name": v["name"], "price": price(world, k), "owned": owned(world, k)} for k, v in CATALOG.items() if service in v["sold_by"]]
    sell = [{"id": k, "name": ITEMS[k]["name"], "count": n, "price": sell_price(world, k)} for k, n in bag.held(world.player).items() if ITEMS.get(k, {}).get("group") == "materials" and ITEMS[k].get("value")] if service == "trade" else []
    notes = []
    if world.clock < world.festival_until:
        notes.append("Festival prices: -20%")
    if world.war_pressure >= 0.01 and not world.demon_lord_dead:
        notes.append(f"The war with {world.demon_lord_name} has raised prices")
    return {"items": items, "sell": sell, "notes": notes}


def sell_price(world: World, item: str) -> int:
    return max(1, round(ITEMS[item].get("value", 1) * PROSPERITY.get(world.prosperity, 1.0)))


def buy(world: World, item_id: str) -> str:
    if item_id not in CATALOG:
        return "No such item."
    p, it, cost = world.player, CATALOG[item_id], price(world, item_id)
    if owned(world, item_id):
        return "You already own that."
    if p.gold < cost:
        return "Not enough money."
    p.gold -= cost
    if "ability" in it:
        p.abilities.append(it["ability"])
    else:
        bag.give(world, item_id)
    return f"Bought {it['name'].split(' (')[0]} for {cost} {world.currency}."


def sell(world: World, item: str, all_: bool) -> str:
    have = bag.count(world.player, item)
    n = have if all_ else min(1, have)
    if n <= 0 or item not in ITEMS:
        return "You have none of that."
    bag.take(world, item, n)
    world.player.gold += n * sell_price(world, item)
    return f"Sold {n} {ITEMS[item]['name']} for {n * sell_price(world, item)} {world.currency}."


SERVICES = {name: [(o["action"], o["label"], o["price"]) for o in spec["options"]] for name, spec in SERVICE_DATA.items() if "options" in spec}


def service_options(world: World, service: str) -> list[dict]:
    opts = []
    for action, label, cost in SERVICES.get(service, []):
        if service == "bounty" and action == "pay":
            cost = world.player.bounty + 25
        if action == "attune":
            cost = magic.attune_price(world, cost)
        opts.append({"action": action, "label": label, "price": round(cost * price_multiplier(world)) if service != "bounty" else cost})
    return opts


def use_service(world: World, service: str, action: str, npc_id: int | None) -> tuple[str, dict]:
    p = world.player
    opt = next((o for o in service_options(world, service) if o["action"] == action), None)
    if not opt:
        return "They don't offer that.", {}
    if action == "surrender":
        p.gold //= 2
        for item, n in bag.held(p).items():
            if ITEMS.get(item, {}).get("loot"):
                bag.take(world, item, n)
        p.bounty = 0
        return "You surrender. Your crimes are forgiven, at a price.", {"wanted": 0, "clear_wanted": True}
    if p.gold < opt["price"]:
        return "Not enough money.", {}
    if action == "bless" and npc_id in p.blessed_by:
        return "This temple has already blessed you.", {}
    if action == "cure" and not p.cursed_hp and not p.cursed_abilities:
        return "There is no curse on you to lift.", {}
    if action == "attune" and p.blocks.get(magic.CRYSTAL, 0) <= 0:
        return "You have no Mana Crystal to attune to. They grow in the Dragonspine.", {}
    p.gold -= opt["price"]
    if action == "treat":
        return "The doctor patches you up.", {"heal": 999}
    if action == "cure":
        p.max_hp += p.cursed_hp
        p.abilities += [a for a in p.cursed_abilities if a not in p.abilities]
        p.cursed_hp, p.cursed_abilities = 0, []
        return "The curse lifts, and what it took comes back to you.", {"heal": 999}
    if action == "rest":
        return "You sleep soundly at the inn.", {"heal": 999, "mana": 999, "morning": True}
    if action == "bless":
        p.blessed_by.append(npc_id or -1)
        p.max_hp += 5
        return "A warm light fills you. Max HP +5.", {"heal": 5}
    if action == "attune":
        return magic.attune(world)
    if action == "pray":
        return "The priest prays over you.", {"heal": 10}
    if action == "pay":
        p.bounty = 0
        return "Your name is cleared.", {"wanted": 0, "clear_wanted": True}
    return "Done.", {}

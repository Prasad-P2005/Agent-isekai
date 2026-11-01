"""What the hero carries. The client owns the slots, because mining and crafting cannot wait for a round trip, so the server sees a copy and never writes to it.
What the server gives or takes waits as a parcel until the client has applied it, and the client acknowledges parcels in the same request as the new bag,
so a crash can neither lose one nor apply it twice. Reading a count takes parcels into account, or a sale could be paid for twice before the client answers."""
from __future__ import annotations

from ..content import ITEMS
from ..core.state import Parcel, Player, World

MOST_ON_THE_GROUND = 256


def give(world: World, item: str, n: int = 1) -> None:
    p = world.player
    p.parcel_next += 1
    p.parcels.append(Parcel(seq=p.parcel_next, id=item, n=n))


def take(world: World, item: str, n: int = 1) -> None:
    give(world, item, -n)


def count(player: Player, item: str) -> int:
    worn = [s for s in player.worn.values() if s]
    return sum(s["n"] for s in [*player.bag, *worn] if s and s["id"] == item) + sum(c.n for c in player.parcels if c.id == item)


def held(player: Player) -> dict[str, int]:
    """Every kind of item in the bag and on its way, with how many."""
    out: dict[str, int] = {}
    for stack in player.bag:
        if stack:
            out[stack["id"]] = out.get(stack["id"], 0) + stack["n"]
    for c in player.parcels:
        out[c.id] = out.get(c.id, 0) + c.n
    return {k: n for k, n in out.items() if n > 0}


def _stack(raw: dict | None) -> dict | None:
    """A stack as the client reported it, kept only if it is a real item in a real amount."""
    if not isinstance(raw, dict) or raw.get("id") not in ITEMS:
        return None
    spec = ITEMS[raw["id"]]
    out: dict = {"id": raw["id"], "n": max(1, min(spec["stack"], int(raw.get("n", 1))))}
    if "dur" in spec:
        out["dur"] = max(1, min(spec["dur"], int(raw.get("dur", spec["dur"]))))
    return out


def _lying(raw: dict) -> dict | None:
    """Something on the ground, as the client reported it."""
    stack = _stack(raw)
    if not stack:
        return None
    return {**stack, **{k: float(raw.get(k, 0)) for k in ("x", "y", "z", "age", "wait")}, "thrown": bool(raw.get("thrown"))}


def store(world: World, pack: dict) -> None:
    """The client's report of the bag, and which parcels it has applied. Fields it did not send stay as they are."""
    p = world.player
    if pack.get("bag") is not None:
        p.bag = [_stack(s) for s in pack["bag"][:36]]
        p.bag += [None] * (36 - len(p.bag))
    if pack.get("worn") is not None:
        p.worn = {slot: _stack(pack["worn"].get(slot)) for slot in p.worn}
    if pack.get("seen") is not None:
        p.seen = [i for i in pack["seen"] if i in ITEMS]
    if pack.get("spells") is not None:
        p.spells = [*[str(s) for s in pack["spells"][:2]], "", ""][:2]
    if pack.get("stations") is not None:
        world.stations = pack["stations"]
    if pack.get("ground") is not None:
        world.ground = [g for g in map(_lying, pack["ground"][:MOST_ON_THE_GROUND]) if g]
    taken = pack.get("taken") or 0
    p.parcels = [c for c in p.parcels if c.seq > taken]
    p.parcels_taken = max(p.parcels_taken, taken)

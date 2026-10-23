import pytest

from isekai.state import World
from isekai.world.map import build_map
from isekai.people.roster import make_roster
from isekai.god.planner import ruler_of
from isekai.laws.laws import DEFAULT_LAWS


@pytest.fixture
def world() -> World:
    w = World(seed=42, genesis_done=True, laws=list(DEFAULT_LAWS))
    w.lands, w.settlements, w.demon_land = build_map()
    for i, s in enumerate(w.settlements):
        s.name = f"Town{i}"
        rj, rn = ruler_of(w, s)
        make_roster(s, None, w.seed, rj, rn)
    return w

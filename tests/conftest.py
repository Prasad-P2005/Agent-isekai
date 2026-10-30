import pytest
from fastapi.testclient import TestClient

from fakes import OfflineLLM
from isekai.app import create_app
from isekai.core.game import Game
from isekai.core.state import World
from isekai.god.planner import ruler_of
from isekai.systems.laws import DEFAULT_LAWS
from isekai.systems.people.roster import make_roster
from isekai.world.map import build_map


@pytest.fixture
def world() -> World:
    w = World(seed=42, genesis_done=True, laws=list(DEFAULT_LAWS))
    w.lands, w.settlements, w.demon_land = build_map()
    for i, s in enumerate(w.settlements):
        s.name = f"Town{i}"
        rj, rn = ruler_of(w, s)
        make_roster(s, None, w.seed, rj, rn)
    return w


@pytest.fixture
def game(world, tmp_path) -> Game:
    g = Game(OfflineLLM(), tmp_path / "w.json")
    g.world = world
    return g


@pytest.fixture
def client(game):
    with TestClient(create_app(game)) as c:
        yield c

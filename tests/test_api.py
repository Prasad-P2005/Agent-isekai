"""End-to-end API test with a fake, offline LLM (the god is silent, defaults are used)."""
from fastapi.testclient import TestClient

from isekai.app import create_app
from isekai.game import Game
from isekai.llm.client import LLM


class OfflineLLM(LLM):
    async def ask(self, *a, **k):
        return None

    async def ping(self):
        self.online = False
        return False


def test_full_flow(tmp_path):
    app = create_app(Game(OfflineLLM(), tmp_path / "w.json"))
    with TestClient(app) as c:
        assert c.post("/api/new", json={"seed": 7}).status_code == 200
        w = c.get("/api/world").json()
        assert len(w["settlements"]) == 13 and w["laws"]
        assert "reply" in c.post("/api/heaven", json={"message": "Who are you?"}).json()
        c.post("/api/descend")
        r = c.post("/api/crime", json={"crime": "kill_human", "in_city": False, "realm": "human", "civilians": ["Mia"]}).json()
        assert r["results"][0]["outcome"] == "witnessed"
        r = c.post("/api/report", json={"law": r["results"][0]["law"], "by": "Mia"}).json()
        assert r["effects"]["spawn"]
        king = next(p for p in w["settlements"][[s["type"] for s in w["settlements"]].index("city")]["residents"] if p["job"] == "king")
        sid = [s["type"] for s in w["settlements"]].index("city")
        r = c.post("/api/talk", json={"settlement": sid, "resident": king["id"]}).json()
        assert r["story"]["stage"] == 1 and r["gift"]
        assert c.get("/api/service", params={"type": "guild", "settlement": 0}).json()["quests"]
        # typed conversation with the elf ruler wins the elves' favor
        ec = next(s for s in w["settlements"] if s["type"] == "elfcity")
        ruler = next(p for p in ec["residents"] if p["job"] in ("elf_king", "elf_queen"))
        r = c.post("/api/talk", json={"settlement": ec["id"], "resident": ruler["id"], "message": "Will the elves help us?"}).json()
        assert r["gift"] and "Heal" in r["gift"] and "heal" in r["player"]["abilities"]
        # mined blocks are saved
        c.post("/api/blocks", json={"blocks": {"3": 12, "2": 0}})
        assert c.get("/api/world").json()["player"]["blocks"] == {"3": 12}
        r = c.post("/api/event", json={"type": "kill", "kind": "orc"}).json()
        assert "+1 Orc Tusk" in r["messages"]


def test_dead_shopkeeper_gets_a_successor(tmp_path):
    import asyncio
    from isekai.state import World
    from isekai.world.map import build_map
    from isekai.people.roster import make_roster
    g = Game(OfflineLLM(), tmp_path / "w.json")
    w = World(seed=1, genesis_done=True)
    w.lands, w.settlements, w.demon_land = build_map()
    for s in w.settlements:
        make_roster(s, None, w.seed)
    g.world = w
    s = w.settlements_of("human")[0]
    m = next(r for r in s.residents if r.job == "merchant")

    async def run():
        g.on_kill("merchant", {"settlement": s.id, "id": m.id}, by_player=True)
        await asyncio.gather(*g._tasks[-1:])
    g.successor_delay = 0
    asyncio.run(run())
    alive = [r for r in s.residents if r.job == "merchant" and not r.dead]
    assert alive and alive[0].id != m.id

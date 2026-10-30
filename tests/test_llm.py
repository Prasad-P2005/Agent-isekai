"""The real LLM client, talking to a fake server. Nothing here leaves the machine."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from pydantic import BaseModel

from isekai.llm.client import LLM, RETRY_MIN, inline_schema


class Reply(BaseModel):
    text: str


class Inner(BaseModel):
    n: int


class Outer(BaseModel):
    inner: Inner
    items: list[Inner]


def llm_with(handler) -> LLM:
    llm = LLM(url="http://llm.test", model="test-model", api_key="secret")
    llm._http = httpx.AsyncClient(transport=httpx.MockTransport(handler), headers=llm._http.headers)
    return llm


def answer(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


@pytest.fixture
def clock(monkeypatch):
    """The clock the LLM client reads, so tests can skip a wait instead of sitting through it."""
    now = SimpleNamespace(value=1000.0, monotonic=lambda: now.value)
    monkeypatch.setattr("isekai.llm.client.time", now)
    return now


async def test_an_answer_is_parsed_into_the_schema():
    llm = llm_with(lambda request: answer('{"text": "Hello"}'))
    assert await llm.ask("Hi", Reply) == Reply(text="Hello")


async def test_a_request_carries_the_key_the_prompt_and_the_schema():
    seen = []

    def server(request):
        seen.append(request)
        return answer('{"text": "ok"}')

    await llm_with(server).ask("Name a dragon", Reply, system="You are a god", temperature=0.1)
    request, body = seen[0], json.loads(seen[0].content)
    assert request.url == "http://llm.test/chat/completions"
    assert request.headers["authorization"] == "Bearer secret"
    assert (body["model"], body["temperature"]) == ("test-model", 0.1)
    assert body["messages"] == [{"role": "system", "content": "You are a god"}, {"role": "user", "content": "Name a dragon"}]
    assert body["response_format"]["json_schema"]["schema"]["properties"] == {"text": {"type": "string"}}


@pytest.mark.parametrize("response", [
    answer("this is not JSON"),
    answer('{"wrong": "fields"}'),
    httpx.Response(200, json={"choices": []}),
    httpx.Response(429),
    httpx.Response(500),
])
async def test_a_bad_answer_counts_as_no_answer_but_the_god_stays_online(response):
    llm = llm_with(lambda request: response)
    assert await llm.ask("Hi", Reply) is None
    assert llm.online is True


@pytest.mark.parametrize("status", [401, 402])
async def test_a_refused_key_stops_all_further_requests(status):
    calls = []

    def server(request):
        calls.append(request)
        return httpx.Response(status)

    llm = llm_with(server)
    assert await llm.ask("Hi", Reply) is None
    assert llm.online is False
    assert await llm.ask("Hi again", Reply) is None
    assert len(calls) == 1


async def test_a_slow_server_counts_as_no_answer_but_the_god_stays_online():
    def server(request):
        raise httpx.ReadTimeout("too slow")

    llm = llm_with(server)
    assert await llm.ask("Hi", Reply) is None
    assert llm.online is True


async def test_a_lost_connection_counts_as_no_answer():
    def server(request):
        raise httpx.ConnectError("no route")

    assert await llm_with(server).ask("Hi", Reply) is None


async def test_the_god_waits_before_trying_a_lost_connection_again():
    calls = []

    def server(request):
        calls.append(request)
        raise httpx.ConnectError("no route")

    llm = llm_with(server)
    await llm.ask("Hi", Reply)
    assert llm.online is False
    await llm.ask("Hi again", Reply)
    assert len(calls) == 1


async def test_the_god_comes_back_once_the_connection_does(clock):
    down = [True]

    def server(request):
        if down[0]:
            raise httpx.ConnectError("no route")
        return answer('{"text": "I am back"}')

    llm = llm_with(server)
    await llm.ask("Hi", Reply)
    down[0] = False
    clock.value += RETRY_MIN
    assert await llm.ask("Hi again", Reply) == Reply(text="I am back")
    assert llm.online is True


async def test_each_failed_retry_waits_longer(clock):
    calls = []

    def server(request):
        calls.append(request)
        raise httpx.ConnectError("no route")

    llm = llm_with(server)
    await llm.ask("Hi", Reply)
    clock.value += RETRY_MIN
    await llm.ask("Hi", Reply)
    assert len(calls) == 2
    clock.value += RETRY_MIN
    await llm.ask("Hi", Reply)
    assert len(calls) == 2  # the second wait is twice as long
    clock.value += RETRY_MIN
    await llm.ask("Hi", Reply)
    assert len(calls) == 3


async def test_a_refused_key_is_not_retried_on_its_own(clock):
    calls = []

    def server(request):
        calls.append(request)
        return httpx.Response(401)

    llm = llm_with(server)
    await llm.ask("Hi", Reply)
    clock.value += 100 * RETRY_MIN
    await llm.ask("Hi again", Reply)
    assert len(calls) == 1


async def test_requests_run_one_at_a_time():
    running = most = 0

    async def server(request):
        nonlocal running, most
        running += 1
        most = max(most, running)
        await asyncio.sleep(0.01)
        running -= 1
        return answer('{"text": "ok"}')

    llm = llm_with(server)
    await asyncio.gather(*(llm.ask(str(i), Reply) for i in range(3)))
    assert most == 1


async def test_urgent_requests_overtake_background_work():
    order, release = [], asyncio.Event()

    async def server(request):
        prompt = json.loads(request.content)["messages"][1]["content"]
        order.append(prompt)
        if prompt == "first":
            await release.wait()
        return answer('{"text": "ok"}')

    llm = llm_with(server)
    first = asyncio.create_task(llm.ask("first", Reply, urgent=True))
    await asyncio.sleep(0.01)
    background = asyncio.create_task(llm.ask("background", Reply))
    await asyncio.sleep(0.01)
    urgent = asyncio.create_task(llm.ask("urgent", Reply, urgent=True))
    await asyncio.sleep(0.01)
    release.set()
    await asyncio.gather(first, background, urgent)
    assert order == ["first", "urgent", "background"]


@pytest.mark.parametrize("response, online", [(httpx.Response(200), True), (httpx.Response(401), False)])
async def test_ping_reports_whether_the_key_works(response, online):
    llm = llm_with(lambda request: response)
    assert await llm.ping() is online and llm.online is online


async def test_ping_reports_an_unreachable_server():
    def server(request):
        raise httpx.ConnectError("no route")

    llm = llm_with(server)
    assert await llm.ping() is False and llm.online is False


def test_schemas_are_flattened_and_closed_for_strict_outputs():
    assert inline_schema(Outer.model_json_schema()) == {
        "type": "object", "additionalProperties": False, "required": ["inner", "items"],
        "properties": {
            "inner": {"type": "object", "additionalProperties": False, "required": ["n"], "properties": {"n": {"type": "integer"}}},
            "items": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["n"], "properties": {"n": {"type": "integer"}}}},
        },
    }

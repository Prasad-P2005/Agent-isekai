"""Stand-ins for the LLM, so tests can run the game with no network. `ask` matches the real signature, so a wrong call still fails."""
from isekai.llm.client import SYSTEM


class OfflineLLM:
    """The god is silent: nothing is ever answered."""

    model = "offline"

    def __init__(self):
        self.online = True

    async def ask(self, prompt, schema, system=SYSTEM, temperature=0.9, urgent=False):
        return None

    async def ping(self):
        self.online = False
        return False


class ScriptedLLM:
    """A model that answers. Replies queue under the schema they answer, and must fit it, as with the real client.
    A question with no reply queued goes unanswered."""

    model = "scripted"

    def __init__(self, **replies: list[dict]):
        self.online = True
        self.replies = replies
        self.prompts: list[str] = []

    async def ask(self, prompt, schema, system=SYSTEM, temperature=0.9, urgent=False):
        self.prompts.append(prompt)
        queue = self.replies.get(schema.__name__)
        return schema.model_validate(queue.pop(0)) if queue else None

    async def ping(self):
        return True

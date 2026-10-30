"""Scene 1: the soul talks with the god in heaven before being sent down."""
from __future__ import annotations

from pydantic import BaseModel

from ..core.state import World
from ..llm.client import LLM
from ..systems.laws import law_text


class Reply(BaseModel):
    reply: str


async def god_reply(world: World, llm: LLM, message: str) -> str:
    history = "\n".join(f"{who}: {text}" for who, text in world.heaven_chat[-8:])
    prompt = f"""You are {world.god_name}, the {world.god_is} of the world "{world.name}". You are in the heavens talking with a soul who just died on
modern-day Earth. You will reincarnate them as {world.hero}.
Facts: {world.premise} The Demon Lord {world.demon_lord_name} of {world.demon_realm_name} threatens {world.kingdom},
ruled by King {world.king_name} from the capital {world.capital().name}. You are powerless to act in the mortal world yourself; that is why you
need this soul. Their mission: slay the Demon Lord. Laws of the world: {'; '.join(law_text(l) for l in world.laws)}.
Conversation so far:
{history}
Soul: {message}
Personality: you are a casual, friendly, slightly goofy {world.god_is}, like a cheerful anime deity who chats like a close friend:
relaxed everyday language, jokes, enthusiasm, the occasional "ehehe" or "y'know", never stiff or formal, never preachy.
Reply in 1-3 short sentences."""
    r = await llm.ask(prompt, Reply, urgent=True)
    text = r.reply.strip() if r and r.reply.strip() else "The light around the god flickers. \"Go now, child. The world needs you.\""
    world.heaven_chat += [("Soul", message[:300]), (world.god_name, text)]
    return text

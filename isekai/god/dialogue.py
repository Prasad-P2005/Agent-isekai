"""Talking to people: the LLM speaks in character, using what the world knows about them."""
from __future__ import annotations

from pydantic import BaseModel

from ..llm.client import LLM
from .narrator import clean_text
from ..state import Resident, Settlement, World
from ..story.stages import objective


class Line(BaseModel):
    line: str


async def speak(world: World, llm: LLM, who: Resident | None, s: Settlement | None, kind: str, name: str, situation: str, message: str = "") -> str:
    if who:
        persona = f"You are {who.name}, the {who.label} of {s.name if s else 'the wilds'} ({s.type if s else ''} settlement). Personality: {who.personality or 'ordinary'}."
        memory = " | ".join(who.memory[-6:]) or "nothing yet"
        about = f"About your home: {s.description} Rumor: {s.rumor}" if s and s.description else ""
    else:
        persona, memory, about = f"You are {name}, a {kind} of the world {world.name}.", "nothing yet", ""
    prompt = f"""{persona} {about}
World: {world.name}. Demon Lord: {world.demon_lord_name} ({'defeated' if world.demon_lord_dead else 'alive'}).
The hero ({world.hero}) is talking to you. Their objective: {objective(world)}. Bounty on them: {world.player.bounty}.
Your conversation with them so far: {memory}
Situation: {situation}
{f'The hero says to you: "{message}"' if message else 'The hero walks up to you.'}
Reply with ONE short in-character line (max 3 sentences){', answering what they said' if message else ''}."""
    r = await llm.ask(prompt, Line, urgent=True)
    line = (clean_text(r.line) if r else "") or "…"
    if who:
        who.memory = (who.memory + ([f'Hero: "{message[:150]}"'] if message else []) + [f'You: "{line[:200]}"'])[-8:]
    return line

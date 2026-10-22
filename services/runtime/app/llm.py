"""Claude access. Structured outputs through tool use; a rules fallback when no key is configured so the runtime still works end to end."""
from __future__ import annotations
import json, hashlib, os
from typing import Any, Callable
from .config import settings

_client = None
def client():
    global _client
    if _client is None and settings.anthropic_api_key:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client

def available() -> bool: return client() is not None

_cache_path = os.path.join(os.path.dirname(__file__), "..", ".replay.json")
def _cache() -> dict:
    try: return json.load(open(_cache_path))
    except Exception: return {}
def _save(c: dict):
    try: json.dump(c, open(_cache_path, "w"), indent=1)
    except Exception: pass

async def structured(name: str, system: str, user: str, schema: dict, fallback: Callable[[], dict] | None = None, max_tokens: int = 1500) -> tuple[dict, str]:
    """Return (result, model). Uses a single forced tool call so the output always matches `schema`."""
    key = hashlib.sha256((name + system + user).encode()).hexdigest()[:24]
    if settings.replay:
        c = _cache()
        if key in c: return c[key], "replay"
    cl = client()
    if cl is None:
        if fallback is None: raise RuntimeError("no ANTHROPIC_API_KEY and no fallback")
        return fallback(), "rules-fallback"
    resp = await cl.messages.create(
        model=settings.anthropic_model, max_tokens=max_tokens,
        system=system,
        tools=[dict(name=name, description=f"Record the {name} result.", input_schema=schema)],
        tool_choice=dict(type="tool", name=name),
        messages=[dict(role="user", content=user)],
    )
    for block in resp.content:
        if block.type == "tool_use":
            out = block.input
            if settings.replay:
                c = _cache(); c[key] = out; _save(c)
            return out, settings.anthropic_model
    raise RuntimeError("no tool output")

async def text(system: str, user: str, fallback: Callable[[], str] | None = None, max_tokens: int = 800) -> tuple[str, str]:
    cl = client()
    if cl is None:
        if fallback is None: raise RuntimeError("no ANTHROPIC_API_KEY and no fallback")
        return fallback(), "rules-fallback"
    resp = await cl.messages.create(model=settings.anthropic_model, max_tokens=max_tokens, system=system, messages=[dict(role="user", content=user)])
    return "".join(b.text for b in resp.content if b.type == "text").strip(), settings.anthropic_model

"""ElevenLabs access: signed URLs for the Strada Pay voice agent, TTS for the representative side, Scribe STT for the employee side.
Every function degrades cleanly when no key is configured so the rest of the stack still runs (the apps fall back to browser speech)."""
from __future__ import annotations
import httpx
from .config import settings

BASE = "https://api.elevenlabs.io"

def available() -> bool: return bool(settings.elevenlabs_api_key)
def agent_available() -> bool: return available() and bool(settings.elevenlabs_agent_id)

def _h(): return {"xi-api-key": settings.elevenlabs_api_key or ""}

async def signed_url(agent_id: str | None = None) -> str | None:
    """Private agents need a signed URL minted server-side; the browser never sees the API key."""
    if not available(): return None
    agent_id = agent_id or settings.elevenlabs_agent_id
    if not agent_id: return None
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{BASE}/v1/convai/conversation/get-signed-url", params=dict(agent_id=agent_id), headers=_h())
        r.raise_for_status(); return r.json()["signed_url"]

async def tts(text: str, voice_id: str | None = None, model_id: str = "eleven_turbo_v2_5") -> bytes | None:
    if not available() or not text.strip(): return None
    voice_id = voice_id or settings.elevenlabs_voice_rep
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{BASE}/v1/text-to-speech/{voice_id}", params=dict(output_format="mp3_44100_64"), headers={**_h(), "accept": "audio/mpeg"},
                         json=dict(text=text, model_id=model_id, voice_settings=dict(stability=0.5, similarity_boost=0.75)))
        r.raise_for_status(); return r.content

async def stt(audio: bytes, mime: str = "audio/webm", language: str = "en") -> str | None:
    """Scribe speech-to-text for the employee's push-to-talk clips after a transfer."""
    if not available(): return None
    ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav", "audio/mpeg": "mp3"}.get(mime.split(";")[0], "webm")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{BASE}/v1/speech-to-text", headers=_h(), data=dict(model_id="scribe_v1", language_code=language, tag_audio_events="false"),
                         files=dict(file=(f"clip.{ext}", audio, mime.split(";")[0])))
        r.raise_for_status(); return (r.json().get("text") or "").strip()

async def conversation_transcript(external_id: str) -> list[dict]:
    """Pull the finished transcript of an ElevenLabs conversation (used to reconcile after a voice call)."""
    if not available(): return []
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}/v1/convai/conversations/{external_id}", headers=_h())
        r.raise_for_status()
        return [dict(who="Customer" if t.get("role") == "user" else "Voice agent", text=t.get("message") or "") for t in r.json().get("transcript", []) if t.get("message")]

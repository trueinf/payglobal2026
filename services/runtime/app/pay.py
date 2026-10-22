"""Strada Pay (employee-facing) endpoints: assistant sessions on chat and voice, tool callbacks for the ElevenLabs agent,
and the live bridge to a representative after a transfer (employee speech in via Scribe, representative speech out via TTS)."""
from __future__ import annotations
import base64
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from . import db, eleven, tools
from .agents import pay_assistant as pa
from .agents import next_best_action as nba
from .bus import hub
from .config import settings

router = APIRouter(prefix="/pay", tags=["strada-pay"])

def ser(row: dict | None): return db.jsonable(row, camelize=True) if row is not None else None

async def _conv(conv_id: str) -> dict:
    c = await db.one("select * from conversations where id = %s", conv_id)
    if not c: raise HTTPException(404, "unknown session")
    return c

# ---- who is signing in (the employee app) ----
@router.get("/employees")
async def employees():
    rows = await db.fetch("select c.id, c.name, c.employee_id, c.email, c.phone, c.pay_group, c.state, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.role = 'employee' order by c.name")
    return [ser(r) for r in rows]

@router.get("/alerts/{contact_id}")
async def my_alerts(contact_id: str):
    rows = await db.fetch("select a.*, c.number as case_number from alerts a left join cases c on c.id = a.related_case_id where a.contact_id = %s order by a.sent_at desc limit 20", contact_id)
    return [ser(r) for r in rows]

@router.post("/alerts/{alert_id}/read")
async def read_alert(alert_id: int):
    row = await db.update("alerts", alert_id, dict(read_at=db.now())); return ser(row)

# ---- sessions ----
class NewSession(BaseModel):
    contactId: str | None = None; email: str | None = None; channel: str = "chat"

@router.post("/sessions")
async def new_session(s: NewSession):
    if s.channel not in ("chat", "voice"): raise HTTPException(422, "channel must be chat or voice")
    ct = await db.one("select * from contacts where id = %s or email = %s", s.contactId or "", s.email or "")
    if not ct: raise HTTPException(404, "unknown employee")
    conv = await db.insert("conversations", dict(id=db.new_id("cv"), channel=s.channel, state="Assistant", customer_id=ct["id"], queue_id=None, handled_by_assistant=True))
    await pa.start_run(conv)
    voice = None
    if s.channel == "voice":
        url = None
        try: url = await eleven.signed_url()
        except Exception as e: url = None; print("elevenlabs signed url failed:", e)
        voice = dict(agentId=settings.elevenlabs_agent_id, signedUrl=url, configured=eleven.agent_available())
    greeting = None
    if s.channel == "chat":
        greeting = await pa.greeting(conv)
        line = await db.insert("transcript_lines", dict(conversation_id=conv["id"], who="Assistant", text=greeting))
        await hub.broadcast("transcript.line", line)
    await hub.broadcast("conversation.updated", conv)
    return dict(conversation=ser(conv), contact=ser(ct), greeting=greeting, voice=voice,
                capabilities=dict(tts=eleven.available(), stt=eleven.available(), llm="claude" if pa.llm.available() else "rules-fallback"))

@router.get("/sessions/{conv_id}")
async def get_session(conv_id: str):
    conv = await _conv(conv_id)
    lines = await db.fetch("select * from transcript_lines where conversation_id = %s order by id", conv_id)
    case = await db.one("select id, number, title, status, priority from cases where id = %s", conv["case_id"]) if conv.get("case_id") else None
    return dict(conversation=ser(conv), lines=[ser(l) for l in lines], case=ser(case))

class Message(BaseModel):
    text: str

@router.post("/sessions/{conv_id}/message")
async def message(conv_id: str, m: Message):
    """Chat: the assistant answers. After a transfer the line just goes to the representative."""
    conv = await _conv(conv_id)
    text = m.text.strip()
    if not text: raise HTTPException(422, "empty message")
    if conv["state"] == "Assistant":
        return await pa.respond(conv, text)
    if conv["state"] in ("Open", "Active"):
        line = await db.insert("transcript_lines", dict(conversation_id=conv_id, who="Customer", text=text))
        await hub.broadcast("transcript.line", line); nba.schedule(conv_id)
        return dict(reply=None, transferred=True, conversation=ser(conv))
    raise HTTPException(409, f"conversation is {conv['state']}")

class VoiceLine(BaseModel):
    who: str; text: str; externalId: str | None = None

@router.post("/sessions/{conv_id}/lines")
async def voice_line(conv_id: str, l: VoiceLine):
    """The employee app forwards what the ElevenLabs agent and the employee said, so the transcript is live in the workspace."""
    conv = await _conv(conv_id)
    if l.externalId and not conv.get("external_id"):
        await db.execute("update conversations set external_id = %s where id = %s", l.externalId, conv_id)
    who = "Customer" if l.who in ("user", "Customer") else ("Voice agent" if conv["channel"] == "voice" else "Assistant")
    line = await db.insert("transcript_lines", dict(conversation_id=conv_id, who=who, text=l.text.strip()))
    await hub.broadcast("transcript.line", line)
    if who == "Customer": nba.schedule(conv_id)
    return ser(line)

class ToolCall(BaseModel):
    model_config = dict(extra="allow")

@router.post("/sessions/{conv_id}/tools/{name}")
async def tool_call(conv_id: str, name: str, args: ToolCall):
    """Client-tool callback for the ElevenLabs voice agent (same tools as the chat agent)."""
    conv = await _conv(conv_id)
    if name not in tools.IMPL: raise HTTPException(404, f"unknown tool {name}")
    run = await pa.get_run(conv)
    await run.step("tool", f"voice agent calling {name}")
    out = await tools.call(conv, name, args.model_dump(), run)
    if name == "transfer_to_representative" and out.get("transferred"):
        await tools.announce_transfer(conv)
        await pa.finish_run(conv_id, dict(outcome="transferred", case_id=conv.get("case_id")))
    return out

class End(BaseModel):
    reason: str = "employee ended"

@router.post("/sessions/{conv_id}/end")
async def end_session(conv_id: str, e: End):
    """Employee hangs up / closes chat. In the Assistant state the conversation closes without ever reaching a queue."""
    conv = await _conv(conv_id)
    if conv["state"] == "Assistant":
        row = await db.update("conversations", conv_id, dict(state="Closed", ended_at=db.now(), closed_at=db.now(), disposition_code="Resolved by assistant", notes=e.reason))
        await pa.finish_run(conv_id, dict(outcome="resolved_by_assistant", case_id=conv.get("case_id")))
        await hub.broadcast("conversation.updated", row)
        if conv.get("case_id"):
            from .agents import case_management as cm
            import asyncio; asyncio.create_task(cm.wrapup(conv_id))
        return ser(row)
    if conv["state"] in ("Open", "Active"):
        line = await db.insert("transcript_lines", dict(conversation_id=conv_id, who="System", text="The employee left the conversation."))
        await hub.broadcast("transcript.line", line)
        if conv["state"] == "Open":   # nobody picked up: close it out
            row = await db.update("conversations", conv_id, dict(state="Closed", ended_at=db.now(), closed_at=db.now(), disposition_code="Abandoned in queue"))
            await hub.broadcast("conversation.updated", row); return ser(row)
    return ser(conv)

# ---- live bridge after transfer ----
@router.post("/sessions/{conv_id}/speech")
async def speech(conv_id: str, audio: UploadFile = File(...), mime: str = Form("audio/webm")):
    """Employee push-to-talk clip → Scribe → Customer transcript line."""
    conv = await _conv(conv_id)
    data = await audio.read()
    if not eleven.available(): raise HTTPException(503, "speech-to-text not configured")
    text = await eleven.stt(data, mime)
    if not text: return dict(text="")
    line = await db.insert("transcript_lines", dict(conversation_id=conv_id, who="Customer", text=text))
    await hub.broadcast("transcript.line", line); nba.schedule(conv_id)
    return dict(text=text, line=ser(line))

@router.get("/audio/{line_id}")
async def audio(line_id: int):
    from fastapi.responses import Response
    row = await db.one("select mime, bytes from voice_audio where line_id = %s", line_id)
    if not row: raise HTTPException(404)
    return Response(content=bytes(row["bytes"]), media_type=row["mime"], headers={"cache-control": "private, max-age=3600"})

async def speak_representative_line(line: dict):
    """Called when a Representative line lands on a voice conversation: synthesise it and tell the employee app."""
    try: mp3 = await eleven.tts(line["text"])
    except Exception as e: print("tts failed:", e); mp3 = None
    if mp3:
        await db.execute("insert into voice_audio (line_id, mime, bytes) values (%s, 'audio/mpeg', %s) on conflict (line_id) do update set bytes = excluded.bytes", line["id"], mp3)
    await hub.broadcast("voice.audio", dict(conversation_id=line["conversation_id"], line_id=line["id"], text=line["text"], has_audio=bool(mp3), url=f"/pay/audio/{line['id']}" if mp3 else None))

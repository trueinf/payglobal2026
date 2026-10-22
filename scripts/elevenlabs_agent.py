#!/usr/bin/env python3
"""Create or update the "Strada Pay assistant" voice agent on ElevenLabs, with the six client tools that call back into the runtime.
Idempotent: re-running updates the same agent and tools. Writes ELEVENLABS_AGENT_ID into .env.

    pip install elevenlabs python-dotenv
    python scripts/elevenlabs_agent.py            # create/update
    python scripts/elevenlabs_agent.py --show     # print the current config

The agent's LLM is Claude (claude-sonnet-4-5) on ElevenLabs' side; the tools run in the employee app (apps/strada-pay)
as client tools, which call POST {RUNTIME_URL}/pay/sessions/{conversationId}/tools/{name}. That is why no public URL is needed.
"""
from __future__ import annotations
import os, re, sys, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "runtime"))
from app.tools import SPECS                                     # single source of truth for the tools
from app.agents.pay_assistant import PERSONA, VOICE_NOTE         # same persona as the chat agent

AGENT_NAME = "Strada Pay assistant"
FIRST_MESSAGE = "Thank you for calling Strada Payroll Support, this is the Strada Pay assistant. Am I speaking with {{employee_name}}?"
VOICE_ID = os.environ.get("ELEVENLABS_VOICE_AGENT", "cgSgspJ2msm6clMCkdW9")   # Jessica (default library voice); any voice id works
LLM = os.environ.get("ELEVENLABS_AGENT_LLM", "claude-sonnet-4-5")

def load_env():
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("="); v = re.sub(r"\s+#.*$", "", v).strip()   # drop inline comments
                if v.startswith("#"): v = ""
                os.environ.setdefault(k.strip(), v)

def prompt_text() -> str:
    # dynamic variables come from the employee app at session start
    return PERSONA.format(name="{{employee_name}}", employer="{{employer}}", pay_group="{{pay_group}}", state="{{work_state}}", today="{{today}}", channel_note=VOICE_NOTE) + \
        "\n\nTools: every tool already knows which employee you are talking to; pass only the parameters described. " \
        "Call verify_identity as soon as the employee gives a code or the last four of their SSN. After transfer_to_representative returns, say goodbye in one short sentence and stop talking."

def to_client_tool(spec: dict) -> dict:
    schema = spec["input_schema"]
    props = {k: dict(type=v.get("type", "string"), description=v.get("description", "")) for k, v in schema.get("properties", {}).items()}
    cfg = dict(type="client", name=spec["name"], description=spec["description"], expects_response=True, response_timeout_secs=20)
    if props: cfg["parameters"] = dict(type="object", properties=props, required=schema.get("required", []))
    return cfg

def main():
    load_env()
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key: sys.exit("ELEVENLABS_API_KEY missing (put it in .env)")
    from elevenlabs import ElevenLabs
    cl = ElevenLabs(api_key=key)
    cai = cl.conversational_ai

    if "--show" in sys.argv:
        aid = os.environ.get("ELEVENLABS_AGENT_ID")
        print(json.dumps(cai.agents.get(agent_id=aid).model_dump(), indent=1, default=str)[:4000] if aid else "no ELEVENLABS_AGENT_ID"); return

    # 1. tools (create or update by name)
    existing = {t.tool_config.name: t.id for t in cai.tools.list().tools}
    tool_ids = []
    for spec in SPECS:
        cfg = to_client_tool(spec)
        if spec["name"] in existing:
            cai.tools.update(existing[spec["name"]], request=dict(tool_config=cfg)); tid = existing[spec["name"]]; print("updated tool", spec["name"], tid)
        else:
            tid = cai.tools.create(request=dict(tool_config=cfg)).id; print("created tool", spec["name"], tid)
        tool_ids.append(tid)

    # 2. agent (create or update by id, else by name)
    conv_cfg = dict(
        agent=dict(first_message=FIRST_MESSAGE, language="en",
                   prompt=dict(prompt=prompt_text(), llm=LLM, temperature=0.3, tool_ids=tool_ids)),
        tts=dict(voice_id=VOICE_ID, model_id="eleven_flash_v2", stability=0.5, speed=1.0),
        turn=dict(turn_timeout=10),
    )
    aid = os.environ.get("ELEVENLABS_AGENT_ID")
    if not aid:
        for a in cai.agents.list().agents:
            if a.name == AGENT_NAME: aid = a.agent_id; break
    if aid:
        cai.agents.update(agent_id=aid, name=AGENT_NAME, conversation_config=conv_cfg); print("updated agent", aid)
    else:
        aid = cai.agents.create(name=AGENT_NAME, conversation_config=conv_cfg).agent_id; print("created agent", aid)

    # 3. remember it
    p = ROOT / ".env"; txt = p.read_text() if p.exists() else ""
    if re.search(r"^ELEVENLABS_AGENT_ID=.*$", txt, re.M): txt = re.sub(r"^ELEVENLABS_AGENT_ID=.*$", f"ELEVENLABS_AGENT_ID={aid}", txt, flags=re.M)
    else: txt += f"\nELEVENLABS_AGENT_ID={aid}\n"
    p.write_text(txt); print("ELEVENLABS_AGENT_ID written to .env — restart the runtime")

if __name__ == "__main__": main()

# Strada — live prototype architecture

Agentic customer service for Strada US payroll on a Dynamics 365 Copilot Service workspace replica. Real agent runtime, real voice, real state; Strada's systems of record are a mock service that behaves like the real APIs.

## Services

| Path | What | Runs on |
| --- | --- | --- |
| `apps/workspace` | Copilot Service workspace replica (React + Vite + Fluent UI v9) — the representative's screen | Netlify |
| `apps/strada-pay` | Employee surface: sign-in, pay statements, documents, chat and voice (ElevenLabs) | Netlify |
| `services/runtime` | FastAPI + LangGraph. Orchestration graph (identify → understand → decide → route), one graph per agent, REST + WebSocket for the apps, ElevenLabs tool webhooks, scheduler for event-driven agents | Railway |
| `services/strada-sys` | FastAPI mock of Strada systems: Strada People, payslips, payment status, ACH returns, Strada Assist cases, pay calendar, timesheets. The only place the runtime *writes* to Strada, through the approved endpoints | Railway |
| `packages/schema` | SQL migrations (schema `strada`) + seed; applied to Supabase and to the local dev Postgres | — |

Data: Supabase Postgres (project `insightedge`, schema `strada`). Only the runtime connects to the database; the apps talk to the runtime over REST and WebSocket. LangGraph checkpoints live in the same database (`strada.checkpoints`).

LLM: Claude (Anthropic API) for every runtime agent, and as the LLM of the ElevenLabs voice agent. Voice: ElevenLabs Conversational AI agent whose tools are *client tools* — the employee app executes them by calling `POST /pay/sessions/{id}/tools/{name}` on the runtime — so local development needs no public URL; ElevenLabs TTS speaks representative lines to the employee after a transfer, ElevenLabs Scribe transcribes the employee's push-to-talk clips. `scripts/elevenlabs_agent.py` creates/updates the agent from the same tool specs the chat agent uses.

## Strada Pay assistant (phase 1)

`services/runtime/app/tools.py` holds the six tools once; `agents/pay_assistant.py` is the chat agent (LangGraph loop over Claude tool use); the ElevenLabs agent uses the same persona (`PERSONA`) and the same tools. Conversation states: `Assistant` (the assistant is handling it, nothing in a queue yet) → `Open` (transferred with context, waiting in the queue) → `Active` → `Wrap-up` → `Closed`. A transfer links the conversation to the case the assistant created or found, inserts the "Transferred to queue … with context" system line, and the workspace's notification picks it up over the WebSocket. Representative lines on a voice conversation trigger TTS (`voice_audio`) and a `voice.audio` event the employee app plays.

## Agents

Each agent is a LangGraph graph with the same contract: typed state in, tools (database + strada-sys), state writes, emitted events; every invocation logged in `strada.agent_runs` with inputs, tool calls and outputs so the UI can show that it ran.

Microsoft-named behaviours (what D365 ships): Case Management, Customer Intent, Customer Knowledge Management, Quality Evaluation.

Strada-specific: Payslip Variance Explainer, Pay Event Sentinel, Incident Clustering, Complete-Case Referral, State & Tax Rules, Identity & Risk, Day-7 Resolution Verifier, Client Insight, Garnishment Order Reader.

Human steps are LangGraph interrupts: Accept suggestions, Tier-1 take-over, disposition code before close, article approval. The workspace buttons resume a paused graph.

## Events

`strada.events` is the stream. Writers: the runtime (case created, conversation ended, case resolved), strada-sys (ACH return posted, timesheet unapproved at cut-off, payslip published) and the demo clock. Readers: Sentinel, Incident Clustering, Day-7, Knowledge Management. The runtime fans out every event to connected apps over WebSocket.

## Local development

```
cp .env.example .env            # fill ANTHROPIC_API_KEY, ELEVENLABS_*, DATABASE_URL
make db                          # local Postgres 16 in .pg/ with the strada schema and seed
make strada-sys                  # :8081
make runtime                     # :8080
cd apps/workspace && npm run dev # :5173
```

`DATABASE_URL` points at the local Postgres for development and at Supabase (session pooler) for the shared environment; the migrations are identical.

## Demo modes

`DEMO_CLOCK` lets the presenter advance time (Sentinel, Day-7). `REPLAY=1` pins model temperature and serves the last good run per use case when the network is poor.

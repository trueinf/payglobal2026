# Strada — live agentic customer service prototype

See `ARCHITECTURE.md`. Quick start:

```bash
cp .env.example .env                 # add ANTHROPIC_API_KEY (and later ELEVENLABS_*)
make install
make db                              # local Postgres 16 on :5433, schema + seed
make strada-sys                      # terminal 2 — Strada systems mock :8081
make runtime                         # terminal 3 — agent runtime :8080
make workspace                       # terminal 4 — Copilot Service workspace :5173
make strada-pay                      # terminal 5 — employee app (Strada Pay) :5174
```

Or `make up` to run Postgres, strada-sys and the runtime in the background (`make status`, `make down`), then the two apps.

Without `ANTHROPIC_API_KEY` the runtime reports `llm: rules-fallback` and the agents use deterministic rules; with it, every agent decision is a Claude call (`agent_runs.tool_calls` shows the model used).

Phase 0: schema + seed, Strada mock, runtime with Case Management and Customer Knowledge Management agents, workspace on the API with live updates over WebSocket.

Phase 1 (this build): the **Strada Pay assistant** — one employee-facing agent on two channels — and the conversation session in the workspace.

- **Chat**: open Strada Pay (:5174), sign in as an employee, *Chat with the assistant*. Claude runs the conversation with six tools (`services/runtime/app/tools.py`): verify identity, payment status, payslip explanation, bank-details update, create case, transfer to representative. Everything it does is logged as an agent run and streamed to the workspace.
- **Voice**: *Call Strada Payroll Support* starts an ElevenLabs Conversational AI session in the browser (same persona, same six tools as client tools calling back into the runtime, Claude as the agent LLM). Set it up once with `make voice-agent` — it creates the agent from the tool specs and writes `ELEVENLABS_AGENT_ID` into `.env`; restart the runtime afterwards. Because the tools are client tools, no public URL or tunnel is needed for local use.
- **Transfer with context**: when the assistant hands over, the conversation enters the Pay Distribution queue and the workspace shows the *Incoming call/chat* notification. Accept opens a session with the Communication panel (transcript, controls, *Suggest a response* from Copilot), the Active Conversation form (customer, conversation details, Copilot summary, case, disposition, recent cases, timeline) and the Copilot pane in conversation mode. End → Wrap-up runs the Case Management Agent on the transcript; closing needs a disposition code; × while Active returns the item to the queue; closed items appear under *Closed work items*.
- **Voice after transfer**: the employee's side keeps the call open — representative lines are spoken to them with ElevenLabs TTS, and their *Hold to talk* clips are transcribed with ElevenLabs Scribe (browser speech APIs as fallback when the keys are missing).
- **Supervisor view**: the Omnichannel Ongoing Conversations dashboard lists every live conversation, including the ones the assistant is handling. *Monitor* opens it read-only with the live transcript, the **Next Best Action Agent** card (stage, next step, risk, take-over recommendation — re-evaluated after every employee turn) and a live feed of the assistant's tool calls. *Assign* or *Take over* pulls an assistant-handled conversation to you immediately; the employee's voice session with the ElevenLabs agent ends and the live bridge takes over.
- `Ctrl/Cmd+Shift+I` in the workspace re-arms the seeded incoming voice call (Tom Reilly) for a demo without the employee app.

`make e2e` runs the whole loop with Playwright (chat path; needs the stack and both apps running).

Try it from a terminal while the workspace is open:

```bash
curl -s localhost:8080/intake/chat -H 'content-type: application/json' \
  -d '{"contactId":"c2","subject":"Missing pay today","text":"Luis Ortega: My pay did not come in today.\nStrada Pay assistant: I have verified your identity, let me check your deposit."}'
```

The Case Management Agent reads Strada People and payment status, predicts the fields, creates the case; it appears in My work items within a second with the AI toolbar. Resolve any case and the Knowledge Management Agent drafts an article into Knowledge search.

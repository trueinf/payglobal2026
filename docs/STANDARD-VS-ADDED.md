# What is standard Dynamics 365 and what Strada added — screen by screen

Kept during the screen walkthrough. "Standard" = ships with Dynamics 365 Customer Service / Copilot Service workspace (incl. the voice and messaging channels and Copilot). "Configuration" = standard mechanism, Strada data (queues, scripts, articles, dashboards). "Added" = built for Strada in this prototype (the agents and what shows their work).

## 0. The two apps

**Copilot Service workspace** (`apps/workspace`) replicates Dynamics 365 Customer Service as shipped; the tables below mark what Strada added on top.

**Strada Pay** (`apps/strada-pay`) is **not Dynamics 365**. It stands in for Strada's employee self-service portal — where employees already see payslips — with chat and call embedded. In a Microsoft-only build the equivalents are: the D365 chat widget embedded in the portal with a Copilot Studio agent answering first; the D365 voice channel (Azure Communication Services number, IVR, Copilot Studio voice agent). The prototype uses the Strada Pay assistant (Claude + six tools, runtime) for chat and an ElevenLabs Conversational AI agent with the same tools for voice — same shape (assistant first, transfer with context, representative in the workspace), different engine. The agents' tools, prompts and rules carry over either way; the plumbing differs.

**Where the out-of-the-box line falls for the first responder.** A Copilot Studio agent on the D365 chat widget with Dataverse as a knowledge source can, without custom work: authenticate the employee, find their open case, read its status and summary back. It cannot reach Strada's payroll systems — the returned payment and its code, the bank on file, payslip lines, a bank-details change under a risk check — without custom actions calling Strada APIs. The Strada Pay assistant is that Strada-specific first responder; in a Microsoft-only build it is built in Copilot Studio (topics + custom actions) rather than on Claude. The shipped agents (Case Management, Customer Intent, Knowledge Management, Quality Evaluation) sit behind it either way. The notifications on the Strada Pay home (bank return, payment settled, timesheet cut-off) are ours; in production they are SMS/email/portal messages sent by the agents. Everything the conversations write into D365 — cases, timeline, transcripts, queues, the Active Conversation form — is the standard side.

## 1. Omnichannel Ongoing Conversations Dashboard (Home)

| Element | Status | Note |
| --- | --- | --- |
| Top bar: app launcher, "Dynamics 365 · Copilot Service workspace", search, quick create, settings, help | Standard | |
| Dialer and conversation icons in the top bar | Standard | from the voice / messaging channels |
| Presence ring (green Available / red Busy) and user avatar | Standard | Busy while a conversation is Active |
| Session bar: site map, Home, Inbox; sessions open as tabs | Standard | multisession workspace |
| Dashboard tabs: Trial home, Customer Service Representative Dashboard, Omnichannel Ongoing Conversations Dashboard | Standard | |
| Dashboard tab: Payroll Prevention Dashboard | Added | custom dashboard (standard mechanism); content is the Strada agents' work |
| Command bar: Save As, New, Set As Default, Refresh All, Share | Standard | |
| Filter by queues pane; Default messaging queue, Default voice queue | Standard | the two default queues D365 creates |
| Queues: Pay Distribution, Ongoing Processing, Tax & Withholding, Garnishments & Deductions, Employee Documents, Misroute – Alight Benefits | Configuration | Strada queues |
| Grid toolbar: Assign, Transfer, Monitor, Copy URL | Standard | D365 also has Force close (not shown) |
| Grid columns Customer, Subject, Queue, Channel, Status, Sentiment, Duration | Standard | |
| Column "Handled by" | Added (label) | D365 calls it Agent; relabelled so an AI assistant and a person read the same |
| A bot-handled conversation listed as Active with the bot as agent | Standard | Copilot Studio bots appear the same way |
| "Strada Pay assistant" as the handler | Added | the employee-facing agent (chat + ElevenLabs voice) |
| "Take-over recommended" badge on a row | Added | from the Next Best Action Agent |
| Empty state "No data available." | Standard | (was off-standard wording; fixed) |
| Monitor → read-only session with live transcript | Standard | |
| Monitor → Next Best Action card, Agent activity feed, Take over button | Added | |

## 2. Monitor session (supervisor view of a live, assistant-handled chat)

| Element | Status | Note |
| --- | --- | --- |
| Monitoring opens its own session tab | Standard | tab label "Monitor: <customer>" and eye icon are ours |
| Communication panel: header (avatar, name, account · employee ID, timer, sentiment) | Standard | |
| Monitoring banner with Take over | Standard capability (monitor / join / take over) | banner wording and "handled by Strada Pay assistant" are ours |
| Transcript bubbles | Standard | |
| "Recording · Transcription on", Hide/Show Transcript | Standard on voice only | removed on chat (was off-standard) |
| Active Conversation form: Save, Refresh, Queue, Start time, Related; title; form selector | Standard | |
| State pill | Standard | shows "Active" while the assistant handles it (was "Assistant"; fixed) |
| Next best action card | Added | Next Best Action Agent |
| Agent activity (live) | Added | live agent-run feed; nearest standard equivalent is audit history |
| Customer → Customer Details card | Standard | enhanced Active Conversation form |
| Conversation summary section incl. Copilot summary card | Standard | |
| Copilot pane: Summarize conversation, suggested prompts, disclaimer | Standard | prompt texts are our configuration; header line reads "Live chat · Active" (fixed) |

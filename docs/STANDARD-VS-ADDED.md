# What is standard Dynamics 365 and what Strada added — screen by screen

Kept during the screen walkthrough. "Standard" = ships with Dynamics 365 Customer Service / Copilot Service workspace (incl. the voice and messaging channels and Copilot). "Configuration" = standard mechanism, Strada data (queues, scripts, articles, dashboards). "Added" = built for Strada in this prototype (the agents and what shows their work).

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

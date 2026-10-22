# Strada – Copilot Service workspace prototype

Working replica of Dynamics 365 Copilot Service workspace (Oct 2026 UI) seeded with Strada US payroll data and the five demo use cases.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # single-file bundle at dist/index.html
```

## Layout

- `src/data.ts` – accounts, contacts, queues, cases, timeline activities, knowledge articles, agent scripts. All dates are relative to "today".
- `src/store.tsx` – app state: sessions, record tabs, productivity pane, cases, activities, articles.
- `src/components/` – shell, Home dashboard, Inbox (work items), case form, timeline, Copilot surfaces, Agent scripts, Knowledge search, contact/account/article/email views.

## Demo paths

1. Home → *Pay not received – direct deposit returned (R03)* → AI toolbar (Case Management Agent) → Accept suggestions → Agent scripts "Bank return" → Knowledge search → Resolve Case.
2. Home → *Incident: multiple BW-NUR bank returns* → Details → Child Cases → Save & Route.
3. Inbox → *Moved from Illinois to Indiana* → Timeline email → Copilot pane "Create draft" → Use this draft → Send.
4. *Child-support garnishment deducted twice* → Agent scripts macros → Resolve → Knowledge search shows the article drafted by the Customer Knowledge Management Agent → open it → Approve and publish.
5. Copilot pane → "Ask a question" (e.g. "How do I handle an R03 return?") → cited articles.

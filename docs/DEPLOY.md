# Hosting — Netlify (apps) + Railway (services) + Supabase (database)

Everything deploys from this GitHub repo on push to `main`. Netlify cannot host the runtime (long-lived process, WebSockets, background agents), so the split is:

| Piece | Platform | Config in repo |
| --- | --- | --- |
| `apps/workspace`, `apps/strada-pay` | Netlify, one site each | `apps/*/netlify.toml` |
| `services/runtime`, `services/strada-sys` | Railway, one service each in one project | `services/*/Dockerfile`, `services/*/railway.json` |
| Postgres | Supabase project `insightedge`, schema `strada` (or a Railway Postgres) | migrations run by the runtime on start |

## 1. Database (Supabase)
Use the **session pooler** connection string (port 5432, *not* the transaction pooler on 6543 — the runtime uses LISTEN/NOTIFY):
`postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
Nothing to run by hand: with `MIGRATE_ON_START=true` the runtime applies `packages/schema/migrations/*.sql` (idempotent) and seeds when the schema is empty. "Reset the day" reseeds at any time.

## 2. Railway
Create a project → **New service → GitHub repo** → this repo, twice:

**strada-sys** — Settings → Build: Dockerfile path `services/strada-sys/Dockerfile` (root directory `/`). Variables: none required. Networking → Generate domain (public) *or* keep private and use the internal hostname.

**runtime** — Dockerfile path `services/runtime/Dockerfile`. Variables:
```
DATABASE_URL=<Supabase session pooler string>
ANTHROPIC_API_KEY=<key>
ANTHROPIC_MODEL=claude-sonnet-4-5
ELEVENLABS_API_KEY=<key>
ELEVENLABS_AGENT_ID=<agent id from .env>
STRADA_SYS_URL=http://strada-sys.railway.internal:8081      # or the public strada-sys URL
RUNTIME_URL=https://<runtime public domain>
MIGRATE_ON_START=true
DEMO_SECRET=<any phrase>                                    # protects /demo/* (reset, scenarios, clock)
CORS_ORIGINS=https://<workspace>.netlify.app,https://<strada-pay>.netlify.app
```
Networking → Generate domain (public; the apps and ElevenLabs talk to it). Health check is `/health`.
strada-sys needs `RUNTIME_URL=https://<runtime public domain>` so its events reach the runtime.

Plan: the Hobby plan or above, so services do not sleep before a pitch.

## 3. Netlify
**Add new site → Import from Git** → this repo, twice. For each: Base directory `apps/workspace` (or `apps/strada-pay`); build command and publish dir come from `netlify.toml`. Environment variables:
```
VITE_RUNTIME_URL=https://<runtime public domain>
VITE_DEMO_SECRET=<same as DEMO_SECRET>      # workspace only
```
Deploy. Both apps are SPAs; the redirect rule is in `netlify.toml`.

## 4. ElevenLabs
Nothing changes on the agent: tools are client tools executed by the Strada Pay app against `VITE_RUNTIME_URL`. The signed URL for private agents is minted by the hosted runtime. Microphone and WebRTC need HTTPS, which both platforms provide.

## 5. Check
`https://<runtime>/health` → `{"ok":true,"llm":"claude",...}` · workspace loads the seeded cases · Strada Pay → Tom Reilly → chat → transfer → notification in the workspace · `Ctrl/Cmd+Shift+D` scenarios work (401 means `VITE_DEMO_SECRET` is missing or differs).

## Local is unchanged
`make up` / launch configs as before; `MIGRATE_ON_START` and `DEMO_SECRET` stay unset locally.

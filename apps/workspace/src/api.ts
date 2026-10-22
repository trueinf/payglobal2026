// Runtime API client. The workspace never touches the database; everything goes through the runtime.
const BASE = (import.meta as any).env?.VITE_RUNTIME_URL ?? "http://localhost:8080";
const WS = BASE.replace(/^http/, "ws") + "/ws";

const DATE_KEYS = new Set(["nbaAt", "createdOn", "modifiedOn", "escalatedOn", "followUpBy", "firstResponseBy", "resolveBy", "resolvedOn", "at", "modifiedAt", "due", "modified", "startedAt", "acceptedAt", "endedAt", "closedAt", "sentAt", "startedAt", "finishedAt"]);
export function revive<T = any>(v: any): T {
  if (Array.isArray(v)) return v.map(revive) as any;
  if (v && typeof v === "object") {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) o[k] = DATE_KEYS.has(k) && typeof x === "string" ? new Date(x) : (k === "transcript" || k === "steps" || k === "toolCalls" || k === "payload" || k === "output" || k === "input") ? x : k === "nba" ? camelObj(x) : revive(x);
    return o;
  }
  return v;
}

async function req(method: string, path: string, body?: any) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) { let d: any = r.statusText; try { d = (await r.json()).detail ?? d; } catch {} throw new Error(typeof d === "string" ? d : JSON.stringify(d)); }
  return revive(await r.json());
}

export const api = {
  bootstrap: () => req("GET", "/bootstrap"),
  patchCase: (id: string, patch: any) => req("PATCH", `/cases/${id}`, patch),
  createCase: (c: { title: string; customerId: string; priority: string; origin: string; queueId: string; description: string }) => req("POST", "/cases", c),
  resolve: (id: string, resolution: string, billableMinutes: number, remarks = "") => req("POST", `/cases/${id}/resolve`, { resolution, billableMinutes, remarks }),
  acceptSuggestions: (id: string) => req("POST", `/cases/${id}/accept-suggestions`),
  route: (id: string) => req("POST", `/cases/${id}/route`),
  agentRuns: (caseId: string) => req("GET", `/cases/${caseId}/agent-runs`),
  addActivity: (a: any) => req("POST", "/activities", a),
  patchActivity: (id: string, patch: any) => req("PATCH", `/activities/${id}`, patch),
  patchArticle: (id: string, patch: any) => req("PATCH", `/articles/${id}`, patch),
  intake: (source: "chat" | "email" | "voice", body: { contactId: string; text: string; subject?: string; conversationId?: string }) => req("POST", `/intake/${source}`, body),
  conv: {
    accept: (id: string) => req("POST", `/conversations/${id}/accept`),
    line: (id: string, who: string, text: string) => req("POST", `/conversations/${id}/lines`, { who, text }),
    lines: (id: string) => req("GET", `/conversations/${id}/lines`),
    end: (id: string) => req("POST", `/conversations/${id}/end`),
    close: (id: string, dispositionCode?: string, notes = "") => req("POST", `/conversations/${id}/close`, { dispositionCode, notes }),
    patch: (id: string, patch: any) => req("PATCH", `/conversations/${id}`, patch),
    suggest: (id: string): Promise<{ text: string; model: string }> => req("POST", `/conversations/${id}/suggest`),
    summary: (id: string): Promise<{ text: string; model: string }> => req("POST", `/conversations/${id}/summary`),
    reopen: (id: string) => req("POST", `/conversations/${id}/reopen`),
    nba: (id: string) => req("POST", `/conversations/${id}/nba`),
    takeover: (id: string) => req("POST", `/conversations/${id}/takeover`),
  },
  clock: (advanceSeconds: number) => req("POST", "/demo/clock", { advanceSeconds }),
  reset: () => req("POST", "/demo/reset"),
};

export function connect(onMessage: (kind: string, data: any) => void): () => void {
  let ws: WebSocket | null = null; let closed = false; let timer: any;
  const open = () => {
    ws = new WebSocket(WS);
    ws.onmessage = e => { try { const m = JSON.parse(e.data); onMessage(m.kind, revive(m.data)); } catch {} };
    ws.onclose = () => { if (!closed) timer = setTimeout(open, 1500); };
  };
  open();
  return () => { closed = true; clearTimeout(timer); ws?.close(); };
}

function camelObj(v: any) { if (!v || typeof v !== "object") return v; const o: any = {}; for (const [k, x] of Object.entries(v)) o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = x; return o; }

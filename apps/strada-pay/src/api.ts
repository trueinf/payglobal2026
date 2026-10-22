// Strada Pay → runtime. The employee app only ever talks to the runtime (never to the database or Strada systems directly).
export const BASE: string = (import.meta as any).env?.VITE_RUNTIME_URL ?? "http://localhost:8080";
const WS = BASE.replace(/^http/, "ws") + "/ws";

async function req(method: string, path: string, body?: any) {
  const r = await fetch(BASE + path, { method, headers: body instanceof FormData ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  if (!r.ok) { let d: any = r.statusText; try { d = (await r.json()).detail ?? d; } catch {} throw new Error(typeof d === "string" ? d : JSON.stringify(d)); }
  return r.json();
}

export interface Employee { id: string; name: string; employeeId: string; email: string; phone?: string; payGroup: string; state: string; accountName: string; }
export interface Conversation { id: string; channel: "chat" | "voice"; state: "Assistant" | "Open" | "Active" | "Wrap-up" | "Closed"; caseId?: string | null; verified?: boolean; queueId?: string | null; }
export interface Line { id: number; conversationId: string; who: string; text: string; at: string; }
export interface SessionStart { conversation: Conversation; contact: Employee; greeting: string | null; voice: { agentId: string | null; signedUrl: string | null; configured: boolean } | null; capabilities: { tts: boolean; stt: boolean; llm: string }; }

export interface AlertRow { id: number; kind: string; title?: string; message: string; sentAt: string; readAt?: string | null; relatedCaseId?: string | null; caseNumber?: string | null; agent?: string; }

export const api = {
  alerts: (contactId: string): Promise<AlertRow[]> => req("GET", `/pay/alerts/${contactId}`),
  readAlert: (id: number) => req("POST", `/pay/alerts/${id}/read`),
  employees: (): Promise<Employee[]> => req("GET", "/pay/employees"),
  start: (contactId: string, channel: "chat" | "voice"): Promise<SessionStart> => req("POST", "/pay/sessions", { contactId, channel }),
  get: (id: string): Promise<{ conversation: Conversation; lines: Line[]; case: any }> => req("GET", `/pay/sessions/${id}`),
  message: (id: string, text: string): Promise<{ reply: string | null; transferred: boolean; conversation: Conversation }> => req("POST", `/pay/sessions/${id}/message`, { text }),
  line: (id: string, who: "user" | "agent", text: string, externalId?: string) => req("POST", `/pay/sessions/${id}/lines`, { who, text, externalId }),
  tool: (id: string, name: string, args: any) => req("POST", `/pay/sessions/${id}/tools/${name}`, args ?? {}),
  end: (id: string, reason = "employee ended") => req("POST", `/pay/sessions/${id}/end`, { reason }),
  speech: (id: string, blob: Blob, mime: string): Promise<{ text: string }> => { const f = new FormData(); f.append("audio", blob, "clip.webm"); f.append("mime", mime); return req("POST", `/pay/sessions/${id}/speech`, f); },
};

export function connect(onMessage: (kind: string, data: any) => void): () => void {
  let ws: WebSocket | null = null; let closed = false; let timer: any;
  const open = () => {
    ws = new WebSocket(WS);
    ws.onmessage = e => { try { const m = JSON.parse(e.data); onMessage(m.kind, m.data); } catch {} };
    ws.onclose = () => { if (!closed) timer = setTimeout(open, 1500); };
  };
  open();
  return () => { closed = true; clearTimeout(timer); ws?.close(); };
}

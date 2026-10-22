import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { Activity, Case, KnowledgeArticle } from "./model";
import { OWNER } from "./data";
import { api, connect } from "./api";

export type RecordTab =
  | { id: string; kind: "case"; caseId: string }
  | { id: string; kind: "contact"; contactId: string }
  | { id: string; kind: "account"; accountId: string }
  | { id: string; kind: "caseList"; view: string }
  | { id: string; kind: "article"; articleId: string }
  | { id: string; kind: "email"; activityId: string }
  | { id: string; kind: "conversation"; conversationId: string };

export interface Session { id: string; kind: "home" | "inbox" | "record"; title: string; tabs: RecordTab[]; activeTabId: string | null; conversationId?: string; monitor?: boolean; }
export interface NBA { intent: string; stage: string; nextBestAction: string; rationale: string; risk: "Low" | "Medium" | "High"; intervene: boolean; interveneReason?: string; sentiment?: string; suggestedOpening?: string; }
export type PaneTool = "copilot" | "scripts" | "knowledge";
export interface Toast { id: number; text: string; kind?: "success" | "info"; }
export interface Conversation { id: string; channel: "voice" | "chat"; state: "Assistant" | "Open" | "Active" | "Wrap-up" | "Closed"; customerId: string; caseId?: string | null; queueId: string | null; startedAt: Date; acceptedAt?: Date; endedAt?: Date; closedAt?: Date; waitingSeconds: number; sentiment: string; recording: boolean; dispositionCode?: string | null; notes: string; intent?: string | null; summary: string; verified?: boolean; verifyMethod?: string | null; transferredBy?: string | null; transferReason?: string | null; handledByAssistant?: boolean; assignedTo?: string | null; externalId?: string | null; nba?: NBA | null; nbaAt?: Date; }
export interface TranscriptLine { id: number; conversationId: string; who: string; text: string; at: Date; }
export interface AgentEvent { kind: string; agent: string; subjectId?: string; step?: string; detail?: string; tool?: string; output?: any; at: Date; runId: number; }

export interface AppState {
  loaded: boolean; connected: boolean; llm: string;
  cases: Case[];
  activities: Activity[];
  articles: KnowledgeArticle[];
  conversations: Conversation[];
  transcript: Record<string, TranscriptLine[]>;
  agentEvents: AgentEvent[];
  sessions: Session[];
  activeSessionId: string;
  inboxSelectedCaseId: string | null;
  pane: PaneTool | null;
  dashboard: "rep" | "omni" | "trial";
  toasts: Toast[];
  copilotDraft: { activityId: string; text: string } | null;
  copilotChat: { role: "user" | "assistant"; text: string; cites?: string[] }[];
  formSuggestions: Record<string, boolean>;
}

type Action =
  | { type: "hydrate"; data: any }
  | { type: "connected"; value: boolean }
  | { type: "upsertCase"; c: Case }
  | { type: "upsertActivity"; a: Activity }
  | { type: "upsertArticle"; a: KnowledgeArticle }
  | { type: "upsertConversation"; c: Conversation }
  | { type: "transcriptLine"; l: TranscriptLine }
  | { type: "agentEvent"; e: AgentEvent }
  | { type: "selectSession"; id: string }
  | { type: "closeSession"; id: string }
  | { type: "openCase"; caseId: string; inSession?: "inbox" | "new" | "current" }
  | { type: "openConversation"; conversationId: string; title: string; monitor?: boolean }
  | { type: "setTranscript"; conversationId: string; lines: TranscriptLine[] }
  | { type: "openTab"; tab: RecordTab }
  | { type: "selectTab"; tabId: string }
  | { type: "closeTab"; tabId: string }
  | { type: "selectInbox"; caseId: string }
  | { type: "setPane"; pane: PaneTool | null }
  | { type: "setDashboard"; d: AppState["dashboard"] }
  | { type: "updateCase"; caseId: string; patch: Partial<Case> }
  | { type: "addActivity"; activity: Activity }
  | { type: "updateActivity"; id: string; patch: Partial<Activity> }
  | { type: "addArticle"; article: KnowledgeArticle }
  | { type: "updateArticle"; id: string; patch: Partial<KnowledgeArticle> }
  | { type: "toast"; text: string; kind?: Toast["kind"] }
  | { type: "dismissToast"; id: number }
  | { type: "setDraft"; draft: AppState["copilotDraft"] }
  | { type: "chat"; msg: AppState["copilotChat"][number] }
  | { type: "clearChat" }
  | { type: "acceptSuggestions"; caseId: string }
  | { type: "createCase"; c: Case };

let seq = 100;
export const nextId = (p = "x") => `${p}${++seq}`;

const initial: AppState = {
  loaded: false, connected: false, llm: "",
  cases: [], activities: [], articles: [], conversations: [], transcript: {}, agentEvents: [],
  sessions: [
    { id: "home", kind: "home", title: "Home", tabs: [], activeTabId: null },
    { id: "inbox", kind: "inbox", title: "Inbox", tabs: [], activeTabId: null },
  ],
  activeSessionId: "home",
  inboxSelectedCaseId: null,
  pane: "copilot",
  dashboard: "rep",
  toasts: [],
  copilotDraft: null,
  copilotChat: [],
  formSuggestions: {},
};

const upsert = <T extends { id: any }>(list: T[], item: T, front = false): T[] => list.some(x => x.id === item.id) ? list.map(x => x.id === item.id ? { ...x, ...item } : x) : front ? [item, ...list] : [...list, item];

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "hydrate": {
      const cases: Case[] = a.data.cases; const fs: Record<string, boolean> = {};
      for (const c of cases) fs[c.id] = !!(c as any).suggestionsPending;
      const first = cases.find(c => c.status !== "Resolved");
      const sessions = s.sessions.map(se => se.id === "inbox" && first ? { ...se, tabs: [{ id: "inbox-" + first.id, kind: "case", caseId: first.id } as RecordTab], activeTabId: "inbox-" + first.id } : se);
      return { ...s, loaded: true, llm: a.data.llm, cases, activities: a.data.activities, articles: a.data.articles, conversations: a.data.conversations ?? [], formSuggestions: fs, sessions, inboxSelectedCaseId: first?.id ?? null };
    }
    case "connected": return { ...s, connected: a.value };
    case "upsertCase": return { ...s, cases: upsert(s.cases, a.c, true), formSuggestions: { ...s.formSuggestions, [a.c.id]: !!(a.c as any).suggestionsPending } };
    case "upsertActivity": return { ...s, activities: upsert(s.activities, a.a) };
    case "upsertArticle": return { ...s, articles: upsert(s.articles, a.a, true) };
    case "upsertConversation": return { ...s, conversations: upsert(s.conversations, a.c, true) };
    case "transcriptLine": { const cur = s.transcript[a.l.conversationId] ?? []; return cur.some(x => x.id === a.l.id) ? s : { ...s, transcript: { ...s.transcript, [a.l.conversationId]: [...cur, a.l] } }; }
    case "agentEvent": return { ...s, agentEvents: [a.e, ...s.agentEvents].slice(0, 200) };
    case "selectSession": return { ...s, activeSessionId: a.id };
    case "closeSession": {
      const sessions = s.sessions.filter(x => x.id !== a.id);
      return { ...s, sessions, activeSessionId: s.activeSessionId === a.id ? "home" : s.activeSessionId };
    }
    case "openCase": {
      const c = s.cases.find(x => x.id === a.caseId); if (!c) return s;
      const mode = a.inSession ?? "new";
      if (mode === "inbox") {
        const sessions = s.sessions.map(se => se.id === "inbox" ? { ...se, tabs: [{ id: "inbox-" + c.id, kind: "case", caseId: c.id } as RecordTab], activeTabId: "inbox-" + c.id } : se);
        return { ...s, sessions, activeSessionId: "inbox", inboxSelectedCaseId: c.id };
      }
      if (mode === "current" && s.activeSessionId !== "home") {
        const tabId = "t-" + c.id;
        const sessions = s.sessions.map(se => {
          if (se.id !== s.activeSessionId) return se;
          if (se.tabs.some(t => t.id === tabId)) return { ...se, activeTabId: tabId };
          return { ...se, tabs: [...se.tabs, { id: tabId, kind: "case", caseId: c.id } as RecordTab], activeTabId: tabId };
        });
        return { ...s, sessions };
      }
      const existing = s.sessions.find(se => se.kind === "record" && se.tabs[0]?.kind === "case" && (se.tabs[0] as any).caseId === c.id);
      if (existing) return { ...s, activeSessionId: existing.id };
      const id = "s-" + c.id;
      const session: Session = { id, kind: "record", title: c.title, tabs: [{ id: id + "-anchor", kind: "case", caseId: c.id }], activeTabId: id + "-anchor" };
      return { ...s, sessions: [...s.sessions, session], activeSessionId: id };
    }
    case "openConversation": {
      const id = (a.monitor ? "mon-" : "cv-") + a.conversationId;
      if (s.sessions.some(se => se.id === id)) return { ...s, activeSessionId: id };
      const session: Session = { id, kind: "record", title: (a.monitor ? "Monitor: " : "") + a.title, tabs: [{ id: id + "-anchor", kind: "conversation", conversationId: a.conversationId }], activeTabId: id + "-anchor", conversationId: a.conversationId, monitor: a.monitor };
      return { ...s, sessions: [...s.sessions, session], activeSessionId: id };
    }
    case "setTranscript": { const cur = s.transcript[a.conversationId] ?? []; const seen = new Set(cur.map(l => l.id)); return { ...s, transcript: { ...s.transcript, [a.conversationId]: [...cur, ...a.lines.filter(l => !seen.has(l.id))].sort((x, y) => x.id - y.id) } }; }
    case "openTab": {
      const sessions = s.sessions.map(se => {
        if (se.id !== s.activeSessionId) return se;
        if (se.tabs.some(t => t.id === a.tab.id)) return { ...se, activeTabId: a.tab.id };
        return { ...se, tabs: [...se.tabs, a.tab], activeTabId: a.tab.id };
      });
      return { ...s, sessions };
    }
    case "selectTab": return { ...s, sessions: s.sessions.map(se => se.id === s.activeSessionId ? { ...se, activeTabId: a.tabId } : se) };
    case "closeTab": {
      const sessions = s.sessions.map(se => {
        if (se.id !== s.activeSessionId) return se;
        const tabs = se.tabs.filter(t => t.id !== a.tabId);
        const activeTabId = se.activeTabId === a.tabId ? (tabs[tabs.length - 1]?.id ?? null) : se.activeTabId;
        return { ...se, tabs, activeTabId };
      });
      return { ...s, sessions };
    }
    case "selectInbox": return reducer(s, { type: "openCase", caseId: a.caseId, inSession: "inbox" });
    case "setPane": return { ...s, pane: a.pane };
    case "setDashboard": return { ...s, dashboard: a.d };
    case "updateCase": return { ...s, cases: s.cases.map(c => c.id === a.caseId ? { ...c, ...a.patch, modifiedOn: new Date() } : c) };
    case "addActivity": return s; // server-side; the WebSocket echo adds it
    case "updateActivity": return { ...s, activities: s.activities.map(t => t.id === a.id ? { ...t, ...a.patch, modifiedAt: new Date() } : t) };
    case "addArticle": return s; // server-side
    case "updateArticle": return { ...s, articles: s.articles.map(k => k.id === a.id ? { ...k, ...a.patch } : k) };
    case "toast": return { ...s, toasts: [...s.toasts, { id: ++seq, text: a.text, kind: a.kind }] };
    case "dismissToast": return { ...s, toasts: s.toasts.filter(t => t.id !== a.id) };
    case "setDraft": return { ...s, copilotDraft: a.draft };
    case "chat": return { ...s, copilotChat: [...s.copilotChat, a.msg] };
    case "clearChat": return { ...s, copilotChat: [] };
    case "acceptSuggestions": return { ...s, formSuggestions: { ...s.formSuggestions, [a.caseId]: false } };
    case "createCase": return s; // server-side
  }
}

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

const AGENT_SUMMARY: Record<string, (o: any, sid?: string) => string> = {
  "Case Management Agent": o => o?.number ? `Case Management Agent created ${o.number}` : `Case Management Agent updated the case`,
  "Next Best Action Agent": o => o?.intervene ? `Next Best Action Agent recommends a human take-over (${o.risk} risk)` : `Next Best Action Agent: ${o?.stage ?? "updated"}`,
  "Strada Pay assistant": o => o?.outcome === "transferred" ? "Strada Pay assistant handed over a conversation with context" : "Strada Pay assistant resolved a conversation",
  "Customer Knowledge Management Agent": o => (o?.articleId ?? o?.article_id) ? `Knowledge Management Agent drafted ${o.articleId ?? o.article_id} for review` : `Knowledge Management Agent: resolution already covered`,
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initial);
  const pending = useRef<Record<string, any>>({}); const timers = useRef<Record<string, any>>({});

  // route data actions to the runtime; the reducer keeps optimistic state and the WebSocket echo settles it
  const dispatch = useMemo<React.Dispatch<Action>>(() => (a: Action) => {
    rawDispatch(a);
    const fail = (e: any) => rawDispatch({ type: "toast", text: `Runtime: ${e.message ?? e}` });
    switch (a.type) {
      case "updateCase": {
        const { modifiedOn, ...p } = a.patch as any;
        pending.current[a.caseId] = { ...(pending.current[a.caseId] ?? {}), ...p };
        clearTimeout(timers.current[a.caseId]);
        timers.current[a.caseId] = setTimeout(() => { const body = pending.current[a.caseId]; delete pending.current[a.caseId]; api.patchCase(a.caseId, body).catch(fail); }, 500);
        break;
      }
      case "addActivity": { const { id, at, modifiedAt, ...rest } = a.activity as any; api.addActivity(rest).catch(fail); break; }
      case "updateActivity": { const { modifiedAt, ...p } = a.patch as any; api.patchActivity(a.id, p).catch(fail); break; }
      case "updateArticle": { const { modified, ...p } = a.patch as any; api.patchArticle(a.id, p).catch(fail); break; }
      case "acceptSuggestions": api.acceptSuggestions(a.caseId).catch(fail); break;
    }
  }, []);

  useEffect(() => {
    api.bootstrap().then(d => rawDispatch({ type: "hydrate", data: d })).catch(e => rawDispatch({ type: "toast", text: `Cannot reach the runtime: ${e.message}` }));
    const stop = connect((kind, data) => {
      rawDispatch({ type: "connected", value: true });
      switch (kind) {
        case "case.updated": rawDispatch({ type: "upsertCase", c: data }); break;
        case "activity.created": case "activity.updated": rawDispatch({ type: "upsertActivity", a: data }); break;
        case "article.created": case "article.updated": rawDispatch({ type: "upsertArticle", a: data }); break;
        case "conversation.updated": rawDispatch({ type: "upsertConversation", c: data }); break;
        case "transcript.line": rawDispatch({ type: "transcriptLine", l: data }); break;
        case "reset": api.bootstrap().then(d => rawDispatch({ type: "hydrate", data: d })); break;
        default:
          if (kind.startsWith("agent.")) {
            rawDispatch({ type: "agentEvent", e: { kind, agent: data.agent, subjectId: data.subject_id ?? data.subjectId, step: data.step, detail: data.detail, tool: data.tool, output: data.output, at: new Date(), runId: data.run_id ?? data.runId } });
            if (kind === "agent.done") { const f = AGENT_SUMMARY[data.agent]; rawDispatch({ type: "toast", text: f ? f(data.output) : `${data.agent} finished`, kind: "success" }); }
          }
      }
    });
    return stop;
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() { const v = useContext(Ctx); if (!v) throw new Error("store"); return v; }
export function activeSession(s: AppState) { return s.sessions.find(x => x.id === s.activeSessionId)!; }
export const owner = OWNER;

import React, { useEffect } from "react";
import { Tooltip } from "@fluentui/react-components";
import {
  Search20Regular, Lightbulb20Regular, Add20Regular, Filter20Regular, Settings20Regular, QuestionCircle20Regular,
  Call20Regular, Chat20Regular, Emoji20Regular, Navigation20Regular, Home20Regular, Home20Filled, Mail20Regular, Mail20Filled,
  Wrench20Regular, Dismiss16Regular, Eye20Regular, Sparkle20Regular, Sparkle20Filled, TaskListSquareLtr20Regular, TaskListSquareLtr20Filled, BookOpen20Regular, BookOpen20Filled,
} from "@fluentui/react-icons";
import { activeSession, useStore, type PaneTool } from "./store";
import WorkItemList from "./components/WorkItemList";
import HomeDashboard from "./components/HomeDashboard";
import RecordSession from "./components/RecordSession";
import ProductivityPane from "./components/ProductivityPane";
import CommunicationPanel from "./components/CommunicationPanel";
import IncomingNotification from "./components/IncomingNotification";
import DemoPanel from "./components/DemoPanel";
import { api } from "./api";
import { accounts, contacts } from "./data";
import { truncate } from "./util";

export default function App() {
  const { state, dispatch } = useStore();
  const session = activeSession(state);
  const isHome = session.kind === "home";
  const busy = state.conversations.some(c => c.state === "Active");

  const [demo, setDemo] = React.useState(false);
  // Ctrl/Cmd+Shift+I re-arms the seeded incoming call; Ctrl/Cmd+Shift+D toggles the presenter's demo feeds
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); api.conv.reopen("cv1").catch(() => {}); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); setDemo(v => !v); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  // Session close rules for conversations (documented): × while Active sends it back to the queue; Wrap-up needs a disposition code; Closed just closes.
  const closeSession = async (id: string) => {
    const se = state.sessions.find(x => x.id === id);
    const cv = se?.conversationId && !se.monitor ? state.conversations.find(c => c.id === se.conversationId) : undefined;
    if (cv) {
      try {
        if (cv.state === "Active") { await api.conv.close(cv.id); dispatch({ type: "toast", text: "Conversation returned to the queue" }); }
        else if (cv.state === "Wrap-up") {
          if (!cv.dispositionCode) { dispatch({ type: "toast", text: "Select a disposition code before closing" }); return; }
          await api.conv.close(cv.id, cv.dispositionCode, cv.notes); dispatch({ type: "toast", text: "Conversation closed", kind: "success" });
        }
      } catch (e: any) { dispatch({ type: "toast", text: e.message }); return; }
    }
    dispatch({ type: "closeSession", id });
  };

  useEffect(() => {
    if (!state.toasts.length) return;
    const t = setTimeout(() => dispatch({ type: "dismissToast", id: state.toasts[0].id }), 4200);
    return () => clearTimeout(t);
  }, [state.toasts, dispatch]);

  const railBtn = (tool: PaneTool, label: string, On: React.FC, Off: React.FC) => (
    <Tooltip content={label} relationship="label" positioning="before" key={tool}>
      <button className={state.pane === tool ? "active" : ""} onClick={() => dispatch({ type: "setPane", pane: state.pane === tool ? null : tool })}>
        {state.pane === tool ? <On /> : <Off />}
      </button>
    </Tooltip>
  );

  return (
    <div className="app">
      <div className="topbar">
        <button className="iconbtn" style={{ color: "#fff" }} aria-label="App launcher"><svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><circle cx="2" cy="2" r="1.6"/><circle cx="8" cy="2" r="1.6"/><circle cx="14" cy="2" r="1.6"/><circle cx="2" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="14" cy="8" r="1.6"/><circle cx="2" cy="14" r="1.6"/><circle cx="8" cy="14" r="1.6"/><circle cx="14" cy="14" r="1.6"/></svg></button>
        <span className="brand">Dynamics 365</span>
        <span className="divider" />
        <span className="appname">Copilot Service workspace</span>
        <span className="spacer" />
        <div className="icons">
          <button aria-label="Search"><Search20Regular /></button>
          <button aria-label="Ideas"><Lightbulb20Regular /></button>
          <button aria-label="Create"><Add20Regular /></button>
          <button aria-label="Filter"><Filter20Regular /></button>
          <button aria-label="Settings"><Settings20Regular /></button>
          <button aria-label="Help"><QuestionCircle20Regular /></button>
          <button aria-label="Dialer"><Call20Regular /></button>
          <button aria-label="Conversations"><Chat20Regular /></button>
          <button aria-label="Feedback"><Emoji20Regular /></button>
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: busy ? "2px solid #c4314b" : "2px solid #6ccb5f", background: busy ? "#c4314b" : "transparent", margin: "0 8px" }} title={busy ? "Busy" : "Available"} />
          <span className="avatar">PN</span>
        </div>
      </div>

      <div className="sessbar">
        <button className="burger" aria-label="Site map"><Navigation20Regular /></button>
        {state.sessions.map(s => {
          const active = s.id === state.activeSessionId;
          return (
            <div key={s.id} className={"sesstab" + (active ? " active" : "")} onClick={() => dispatch({ type: "selectSession", id: s.id })} title={s.title}>
              {s.kind === "home" ? (active ? <Home20Filled /> : <Home20Regular />) : s.kind === "inbox" ? (active ? <Mail20Filled /> : <Mail20Regular />) : s.conversationId ? (s.monitor ? <Eye20Regular /> : state.conversations.find(c => c.id === s.conversationId)?.channel === "chat" ? <Chat20Regular /> : <Call20Regular />) : <Wrench20Regular />}
              <span className="t">{truncate(s.tabs[0]?.kind === "account" ? (accounts.find(a => a.id === (s.tabs[0] as any).accountId)?.name ?? s.title) : s.tabs[0]?.kind === "contact" ? (contacts.find(c => c.id === (s.tabs[0] as any).contactId)?.name ?? s.title) : s.title, 26)}</span>
              {s.kind === "record" && <span className="x" onClick={e => { e.stopPropagation(); closeSession(s.id); }}><Dismiss16Regular /></span>}
            </div>
          );
        })}
      </div>

      <div className="body">
        {!isHome && <div className="leftcol">{session.conversationId ? <CommunicationPanel conversationId={session.conversationId} monitor={!!session.monitor} /> : <WorkItemList />}</div>}
        <div className="main">
          {isHome ? <HomeDashboard /> : <RecordSession />}
        </div>
        {!isHome && state.pane && <div className="pane"><ProductivityPane /></div>}
        <div className="rail">
          {railBtn("copilot", "Copilot", Sparkle20Filled, Sparkle20Regular)}
          {!isHome && railBtn("scripts", "Agent scripts", TaskListSquareLtr20Filled, TaskListSquareLtr20Regular)}
          {!isHome && railBtn("knowledge", "Knowledge search", BookOpen20Filled, BookOpen20Regular)}
        </div>
      </div>

      <IncomingNotification />
      {demo && <DemoPanel onClose={() => setDemo(false)} />}
      <div className="toasts">
        {state.toasts.map(t => <div key={t.id} className={"toast " + (t.kind ?? "")}>{t.text}</div>)}
      </div>
    </div>
  );
}

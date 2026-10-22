import React, { useState } from "react";
import { Input, Checkbox, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from "@fluentui/react-components";
import { ArrowLeft20Regular, SaveCopy20Regular, Add20Regular, Checkmark20Regular, ArrowClockwise20Regular, Share20Regular, ChevronDown16Regular, ChevronDown20Regular, DataBarVertical20Regular, Mail20Regular, Search20Regular, MoreVertical20Regular, TableSettings20Regular, Document20Regular, CalendarLtr20Regular, TaskListSquareLtr20Regular, ChevronLeft20Regular, ChevronRight20Regular, ChevronDoubleLeft20Regular, PersonArrowRight20Regular, ArrowSwap20Regular, Eye20Regular, Link20Regular, ArrowSortDown16Regular, ArrowSortUp16Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { api } from "../api";
import { accounts, contacts, queueItems, queues } from "../data";
import { fmtDate, fmtDateTime } from "../util";
import NewCaseDialog from "./NewCaseDialog";
import PreventionDashboard from "./PreventionDashboard";

const AZ = ["All", "#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

export default function HomeDashboard() {
  const { state, dispatch } = useStore();
  const [newCase, setNewCase] = useState(false);
  const [kw, setKw] = useState("");
  const [az, setAz] = useState("All");
  const [view, setView] = useState("My Active Cases");
  const d = state.dashboard;
  const active = state.cases.filter(c => view === "All Cases" ? true : view === "My Resolved Cases" ? c.status === "Resolved" : c.status !== "Resolved").filter(c => c.owner === "Priya Natarajan")
    .filter(c => !kw || c.title.toLowerCase().includes(kw.toLowerCase()) || c.number.toLowerCase().includes(kw.toLowerCase()))
    .filter(c => az === "All" || (az === "#" ? /^[^A-Za-z]/.test(c.title) : c.title.toUpperCase().startsWith(az)))
    .sort((a, b) => a.title.localeCompare(b.title));
  const open = state.activities.filter(a => (a.type === "task" || a.type === "appointment") && a.status !== "Completed" && a.status !== "Closed" && state.cases.find(c => c.id === a.caseId)?.status !== "Resolved").sort((a, b) => (a.due ?? a.at).getTime() - (b.due ?? b.at).getTime());
  const qi = queueItems.map(q => ({ ...q, c: state.cases.find(c => c.id === q.caseId)! })).filter(q => q.c && q.c.status !== "Resolved").sort((a, b) => b.enteredQueue.getTime() - a.enteredQueue.getTime());

  const TabIcon = DataBarVertical20Regular;
  return (
    <div className="dash">
      <div className="card dtabs">
        <div className={"dtab" + (d === "trial" ? " active" : "")} onClick={() => dispatch({ type: "setDashboard", d: "trial" })}>Trial home</div>
        <div className={"dtab" + (d === "rep" ? " active" : "")} onClick={() => dispatch({ type: "setDashboard", d: "rep" })}><TabIcon /> Customer Service Representative Dashboard</div>
        <div className={"dtab" + (d === "omni" ? " active" : "")} onClick={() => dispatch({ type: "setDashboard", d: "omni" })}><TabIcon /> Omnichannel Ongoing Conversations Dashboard</div>
        <div className={"dtab" + (d === "prevention" ? " active" : "")} onClick={() => dispatch({ type: "setDashboard", d: "prevention" })}><TabIcon /> Payroll Prevention Dashboard</div>
      </div>
      {d === "trial" ? <TrialHome /> : (
        <>
          <div className="card cmdbar">
            <button className="cmd" disabled><ArrowLeft20Regular /></button><span className="sep" />
            <button className="cmd"><SaveCopy20Regular /> Save As</button>
            <button className="cmd"><Add20Regular className="g" /> New <ChevronDown16Regular /></button>
            <button className="cmd"><Checkmark20Regular /> Set As Default</button>
            <button className="cmd"><ArrowClockwise20Regular /> Refresh All</button>
            <span className="spacer" />
            <button className="cmd outline"><Share20Regular /> Share <ChevronDown16Regular /></button>
          </div>
          <div className="title">{d === "rep" ? "Customer Service Representative Dashboard" : d === "prevention" ? "Payroll Prevention Dashboard" : "Omnichannel Ongoing Conversations Dashboard"} <ChevronDown20Regular /></div>
          {d === "rep" ? (
            <div className="scroll">
              <div className="card grid">
                <div className="hd">
                  <Menu><MenuTrigger><span className="t" style={{ cursor: "pointer" }}>{view} <ChevronDown16Regular /></span></MenuTrigger><MenuPopover><MenuList>{["My Active Cases", "My Resolved Cases", "All Cases"].map(v => <MenuItem key={v} onClick={() => setView(v)}>{v}</MenuItem>)}</MenuList></MenuPopover></Menu>
                  <button className="cmd" onClick={() => dispatch({ type: "selectSession", id: "inbox" })}><Mail20Regular /> Inbox view</button>
                  <button className="cmd" onClick={() => setNewCase(true)}><Add20Regular className="g" /> New Case</button>
                  <button className="cmd"><MoreVertical20Regular /></button>
                </div>
                <div className="flt"><Input contentBefore={<Search20Regular />} placeholder="Filter by keyword" value={kw} onChange={(_, v) => setKw(v.value)} style={{ width: 300 }} /></div>
                <div style={{ overflowX: "auto" }}>
                  <table className="dg">
                    <thead><tr>
                      <th style={{ width: 36 }}><Checkbox /></th>
                      <th><span>Case Title <ArrowSortUp16Regular /><ChevronDown16Regular /></span></th>
                      <th><span>Case Number <ChevronDown16Regular /></span></th>
                      <th><span>Priority <ChevronDown16Regular /></span></th>
                      <th><span>Origin <ChevronDown16Regular /></span></th>
                      <th><span>Customer <ChevronDown16Regular /></span></th>
                      <th><span>Status Reason <ChevronDown16Regular /></span></th>
                      <th><span>Created On <ChevronDown16Regular /></span></th>
                    </tr></thead>
                    <tbody>
                      {active.map(c => {
                        const cust = contacts.find(x => x.id === c.customerId)!;
                        return (
                          <tr key={c.id}>
                            <td><Checkbox /></td>
                            <td><a onClick={() => dispatch({ type: "openCase", caseId: c.id })}>{c.title}</a></td>
                            <td>{c.number}</td>
                            <td>{c.priority}</td>
                            <td>{c.origin}</td>
                            <td><a onClick={() => { dispatch({ type: "openCase", caseId: c.id }); dispatch({ type: "openTab", tab: { id: "ct-" + cust.id, kind: "contact", contactId: cust.id } }); }}>{cust.name}</a></td>
                            <td>{c.status}</td>
                            <td>{fmtDateTime(c.createdOn)}</td>
                          </tr>
                        );
                      })}
                      {!active.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "#616161" }}>No data available.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="az">{AZ.map(l => <span key={l} className={az === l ? "active" : ""} onClick={() => setAz(l)}>{l}</span>)}</div>
                <div className="pg"><span>Rows: 1 - {active.length} of {active.length}</span><span className="sp"><ChevronDoubleLeft20Regular /><ChevronLeft20Regular />Page 1<ChevronRight20Regular /></span></div>
              </div>

              <div className="card grid">
                <div className="hd">
                  <span className="t">Cases Available to Work On <ChevronDown16Regular /></span>
                  <button className="cmd"><ArrowClockwise20Regular /> Refresh</button>
                  <button className="cmd"><TableSettings20Regular /> See all records</button>
                  <button className="cmd"><MoreVertical20Regular /></button>
                </div>
                <div className="flt"><Input contentBefore={<Search20Regular />} placeholder="Filter by keyword" style={{ width: 300 }} /></div>
                <table className="dg">
                  <thead><tr>
                    <th style={{ width: 36 }}><Checkbox /></th>
                    <th><span>Title <ChevronDown16Regular /></span></th>
                    <th><span>Entered Queue <ArrowSortDown16Regular /><ChevronDown16Regular /></span></th>
                    <th><span>Queue <ChevronDown16Regular /></span></th>
                    <th><span>Worked By <ChevronDown16Regular /></span></th>
                  </tr></thead>
                  <tbody>
                    {qi.map(q => (
                      <tr key={q.caseId}>
                        <td><Checkbox /></td>
                        <td><a onClick={() => dispatch({ type: "openCase", caseId: q.caseId })}>{q.c.title}</a></td>
                        <td>{fmtDateTime(q.enteredQueue)}</td>
                        <td><a>{queues.find(x => x.id === q.c.queueId)!.name}</a></td>
                        <td>{q.workedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="az">{AZ.map(l => <span key={l} className={l === "All" ? "active" : ""}>{l}</span>)}</div>
                <div className="pg"><span>Rows: 1 - {qi.length} of {qi.length}</span><span className="sp"><ChevronDoubleLeft20Regular /><ChevronLeft20Regular />Page 1<ChevronRight20Regular /></span></div>
              </div>

              <div className="card grid">
                <div className="hd">
                  <span className="t">My Open Activities</span>
                  <button className="cmd"><Document20Regular /> Task</button>
                  <button className="cmd"><Mail20Regular /> Email</button>
                  <button className="cmd"><CalendarLtr20Regular /> Appointment</button>
                  <button className="cmd"><MoreVertical20Regular /></button>
                </div>
                <table className="dg">
                  <thead><tr>
                    <th style={{ width: 36 }}><Checkbox /></th>
                    <th><span>Activity Type <ChevronDown16Regular /></span></th>
                    <th><span>Subject <ChevronDown16Regular /></span></th>
                    <th><span>Regarding <ChevronDown16Regular /></span></th>
                    <th><span>Priority <ChevronDown16Regular /></span></th>
                    <th><span>Start Date <ChevronDown16Regular /></span></th>
                    <th><span>Due Date <ArrowSortUp16Regular /><ChevronDown16Regular /></span></th>
                  </tr></thead>
                  <tbody>
                    {open.map(a => {
                      const c = state.cases.find(x => x.id === a.caseId)!;
                      return (
                        <tr key={a.id}>
                          <td><Checkbox /></td>
                          <td>{a.type === "task" ? "Task" : "Appointment"}</td>
                          <td><a onClick={() => dispatch({ type: "openCase", caseId: c.id })}>{a.subject}</a></td>
                          <td><a onClick={() => dispatch({ type: "openCase", caseId: c.id })}>{c.title}</a></td>
                          <td>{c.priority}</td>
                          <td>{fmtDateTime(a.at)}</td>
                          <td>{a.due ? fmtDateTime(a.due) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="pg"><span>Rows: 1 - {open.length} of {open.length}</span></div>
              </div>
            </div>
          ) : d === "prevention" ? <PreventionDashboard /> : <Omni />}
        </>
      )}
      {newCase && <NewCaseDialog onClose={() => setNewCase(false)} />}
    </div>
  );
}

function Omni() {
  const { state, dispatch } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const live = state.conversations.filter(c => c.state === "Assistant" || c.state === "Open" || c.state === "Active" || c.state === "Wrap-up").sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const row = sel ? live.find(c => c.id === sel) : undefined;
  const openMonitor = async (c: typeof live[number]) => {
    try { const lines = await api.conv.lines(c.id); dispatch({ type: "setTranscript", conversationId: c.id, lines }); } catch {}
    dispatch({ type: "openConversation", conversationId: c.id, title: contacts.find(x => x.id === c.customerId)?.name ?? "Conversation", monitor: true });
    dispatch({ type: "setPane", pane: "copilot" });
  };
  const assign = async (c: typeof live[number]) => {
    try {
      await api.conv.takeover(c.id);
      const lines = await api.conv.lines(c.id); dispatch({ type: "setTranscript", conversationId: c.id, lines });
      dispatch({ type: "openConversation", conversationId: c.id, title: contacts.find(x => x.id === c.customerId)?.name ?? "Conversation" });
      dispatch({ type: "toast", text: "Conversation assigned to you", kind: "success" });
    } catch (e: any) { dispatch({ type: "toast", text: e.message }); }
  };
  const status = (c: typeof live[number]) => c.state === "Assistant" ? "Active · Strada Pay assistant" : c.state === "Open" ? "Open · waiting in queue" : c.state === "Active" ? `Active · ${c.assignedTo ?? "representative"}` : c.state;
  const dur = (c: typeof live[number]) => { const s = Math.floor((now - c.startedAt.getTime()) / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; };
  return (
    <div className="scroll">
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12, minHeight: 520 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 6 }}>Filter by queues <ChevronDown16Regular /></div>
          <Input contentBefore={<Search20Regular />} placeholder="Search" style={{ width: "100%", margin: "10px 0" }} />
          <div className="mini" style={{ marginBottom: 8 }}>{queues.length + 2} records</div>
          {["Default messaging queue", "Default voice queue", ...queues.map(q => q.name)].map(q => <div key={q} style={{ padding: "6px 0" }}><Checkbox label={q} /></div>)}
          <div style={{ marginTop: 10 }}><button className="cmd outline">Save filters</button></div>
        </div>
        <div className="card">
          <div className="grid hd" style={{ padding: "10px 12px" }}>
            <span className="t">Conversations</span>
            <button className="cmd" disabled={!row || row.state === "Active" || row.state === "Wrap-up"} onClick={() => row && assign(row)}><PersonArrowRight20Regular /> Assign</button>
            <button className="cmd" disabled={!row}><ArrowSwap20Regular /> Transfer</button>
            <button className="cmd" disabled={!row} onClick={() => row && openMonitor(row)}><Eye20Regular /> Monitor</button>
            <button className="cmd" disabled={!row} onClick={() => { navigator.clipboard?.writeText(location.href + "#" + row?.id); dispatch({ type: "toast", text: "Link copied" }); }}><Link20Regular /> Copy URL</button>
          </div>
          <table className="dg">
            <thead><tr><th style={{ width: 36 }}><Checkbox /></th><th>Customer</th><th>Subject</th><th>Queue</th><th>Channel</th><th>Status</th><th>Handled by</th><th>Sentiment</th><th>Duration</th></tr></thead>
            <tbody>
              {live.map(c => {
                const cust = contacts.find(x => x.id === c.customerId); const q = queues.find(x => x.id === c.queueId);
                const last = (state.transcript[c.id] ?? []).filter(l => l.who === "Customer").slice(-1)[0];
                return (
                  <tr key={c.id} className={sel === c.id ? "sel" : ""} onClick={() => setSel(c.id)} style={{ cursor: "pointer", background: sel === c.id ? "var(--sel)" : undefined }}>
                    <td><Checkbox checked={sel === c.id} onChange={() => setSel(sel === c.id ? null : c.id)} /></td>
                    <td><a onClick={e => { e.stopPropagation(); openMonitor(c); }}>{cust?.name ?? "Customer"}</a></td>
                    <td>{c.nba?.intent ?? c.intent ?? last?.text?.slice(0, 60) ?? "—"}</td>
                    <td>{q?.name ?? (c.state === "Assistant" ? "Strada Pay assistant" : "—")}</td>
                    <td>{c.channel === "voice" ? "Voice" : "Chat"}</td>
                    <td>{status(c)}{c.nba?.intervene && c.state === "Assistant" ? <span className="pill" style={{ marginLeft: 6, background: "#fde7e9", color: "#c4314b" }}>Take-over recommended</span> : null}</td>
                    <td>{c.state === "Assistant" ? "Strada Pay assistant" : c.assignedTo ?? "—"}</td>
                    <td>{c.nba?.sentiment ?? c.sentiment}</td>
                    <td>{dur(c)}</td>
                  </tr>
                );
              })}
              {!live.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#616161" }}>No ongoing conversations. Start one from Strada Pay.</td></tr>}
            </tbody>
          </table>
          <div className="pg" style={{ padding: 12, display: "flex" }}><span>{live.length ? `1 - ${live.length} of ${live.length}` : "0 - 0 of 0"} ({row ? 1 : 0} selected)</span><span className="sp" style={{ marginLeft: "auto" }}>Page 1</span></div>
        </div>
      </div>
    </div>
  );
}

function TrialHome() {
  return (
    <div className="scroll"><div className="card" style={{ padding: "40px 48px" }}>
      <div style={{ fontSize: 40, fontWeight: 700 }}>Hello, Priya Natarajan!</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 24 }}>Get started with Dynamics 365 Customer Service.</div>
      <div style={{ fontSize: 16, marginTop: 8, maxWidth: 900 }}>Provide seamless, end-to-end customer service experiences within a single solution built on the Microsoft cloud to deliver consistent, connected support across channels.</div>
      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}><CalendarLtr20Regular /> You have 30 days left in your trial.</div>
      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        {[["Engage customers", "Provide cross-channel support to your customers and transform your customer service experience.", "#0f6cbd"], ["Empower representatives", "Empower teams with productivity tools that help everyone stay focused on your customer needs.", "#2b88d8"], ["Monitor and improve operations", "Monitor and improve operations", "#0f6cbd"]].map(([t, s, col]) => (
          <div key={t} style={{ display: "grid", gridTemplateColumns: "120px 1fr", minHeight: 240, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ background: col }} />
            <div style={{ padding: 20 }}><div style={{ fontWeight: 600, fontSize: 18 }}>{t}</div><div style={{ marginTop: 8, fontSize: 15, color: "#424242" }}>{s}</div><div style={{ marginTop: 80, display: "flex", gap: 8, alignItems: "center" }}><ChevronRight20Regular /> Get started</div></div>
          </div>
        ))}
      </div>
    </div></div>
  );
}

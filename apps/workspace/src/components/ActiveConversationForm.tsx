import React, { useEffect, useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import { Save20Regular, ArrowClockwise20Regular, ChevronDown16Regular, Person16Regular, Building16Regular, Wrench16Regular, LockClosed16Regular, Sparkle20Filled, ArrowClockwise16Regular, Copy16Regular, ChevronUp20Regular, ChevronDown20Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { api } from "../api";
import { accounts, contacts, queues } from "../data";
import { fmtDate, fmtDateTime, fmtTime } from "../util";
import Subgrid from "./Subgrid";
import Timeline from "./Timeline";
import { Row, Val, Sel, mmss } from "./Form";

const CATEGORIES: Record<string, string[]> = {
  "Pay Distribution": ["Bank return – live check issued", "Bank return – re-deposit", "Delay – client file late", "Employee bank details incorrect"],
  "Documents": ["W-2 reissued", "Pay statement explained", "Document request routed"],
  "Tax": ["State withholding corrected", "Local tax explained", "Routed to tax team"],
  "Garnishments": ["Order explained", "Order corrected", "Referred to agency"],
  "Other": ["Information provided", "Referred to benefits provider", "No action required"],
};

export default function ActiveConversationForm({ conversationId, monitor = false }: { conversationId: string; monitor?: boolean }) {
  const { state, dispatch } = useStore();
  const c = state.conversations.find(x => x.id === conversationId);
  const cust = contacts.find(x => x.id === c?.customerId);
  const acct = accounts.find(a => a.id === cust?.accountId);
  const q = queues.find(x => x.id === c?.queueId);
  const kase = c?.caseId ? state.cases.find(k => k.id === c.caseId) : undefined;
  const lines = state.transcript[conversationId] ?? [];
  const [tab, setTab] = useState<"Pre-chat survey" | "Self service" | "Visitor details" | "Additional details">("Self service");
  const [category, setCategory] = useState(() => Object.keys(CATEGORIES).find(k => CATEGORIES[k].includes(c?.dispositionCode ?? "")) ?? "Pay Distribution");
  const [notes, setNotes] = useState(c?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [sumOpen, setSumOpen] = useState(true);
  const [linked, setLinked] = useState<"Case" | "Contact" | "Account">("Case");

  // Copilot conversation summary: regenerate (debounced) when new lines arrive
  useEffect(() => {
    if (!c || lines.length < 2 || c.state === "Closed") return;
    const t = setTimeout(() => { setBusy(true); api.conv.summary(c.id).catch(() => {}).finally(() => setBusy(false)); }, 2000);
    return () => clearTimeout(t);
  }, [lines.length, c?.id]);   // eslint-disable-line

  const events = state.agentEvents.filter(e => e.subjectId === conversationId && (e.kind === "agent.step" || e.kind === "agent.tool" || e.kind === "agent.done")).slice(0, 12);
  const [nbaBusy, setNbaBusy] = useState(false);
  if (!c || !cust) return <div className="card" style={{ flex: 1 }} />;
  const closed = c.state === "Closed";
  const nba = c.nba;
  const selfService = [
    `Opened Strada Pay (${c.channel})`,
    c.verified ? `Strada Pay assistant: identity verified (${c.verifyMethod ?? "OTP"})` : "Identity not yet verified",
    ...(c.handledByAssistant ? ["Strada Pay assistant: checked payment status"] : []),
    ...(kase ? [`Strada Pay assistant: created case ${kase.number}`] : []),
  ];
  const custCases = state.cases.filter(k => k.customerId === cust.id).sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());
  const sentimentNote = c.sentiment;

  return (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="cmdbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <button className="cmd" onClick={() => { api.conv.patch(c.id, { notes }).then(() => dispatch({ type: "toast", text: "Conversation saved", kind: "success" })); }} disabled={closed}><Save20Regular /> Save</button>
        <button className="cmd" onClick={() => api.conv.lines(c.id).then(ls => dispatch({ type: "setTranscript", conversationId: c.id, lines: ls }))}><ArrowClockwise20Regular /> Refresh</button>
        <span className="sep" />
        <span className="cmd" style={{ cursor: "default" }}><LockClosed16Regular /> Queue: <b>{q?.name ?? "—"}</b></span>
        <span className="cmd" style={{ cursor: "default" }}><LockClosed16Regular /> Start time: <b>{fmtDateTime(c.startedAt)}</b></span>
        <span className="spacer" />
        <button className="cmd outline">Related <ChevronDown16Regular /></button>
      </div>
      <div className="formbody">
        <div className="rhead">
          <div className="title"><span>{cust.name}</span><span className={"pill " + (c.state === "Active" ? "blue" : c.state === "Closed" ? "green" : "")}>{c.state}</span></div>
          <div className="sub"><b>{closed ? "Closed Conversation" : "Active Conversation"}</b> · Conversation <ChevronDown16Regular /></div>
        </div>

        {(monitor || c.state === "Active") && !closed && (
          <div className="sec">
            <h3>Next best action</h3>
            <div className={"nba" + (nba?.intervene ? " alert" : "")}>
              <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Next Best Action Agent
                {nba && <span className={"pill " + (nba.risk === "High" ? "red" : nba.risk === "Medium" ? "amber" : "green")}>{nba.risk} risk</span>}
                {nba && <span className="pill">{nba.stage}</span>}
                <span className="sp" />
                <Tooltip content="Re-evaluate now" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }} disabled={nbaBusy} onClick={() => { setNbaBusy(true); api.conv.nba(c.id).catch(() => {}).finally(() => setNbaBusy(false)); }}><ArrowClockwise16Regular /></button></Tooltip>
              </div>
              {nba ? <>
                <div className="act">{nba.nextBestAction}</div>
                <div className="why">{nba.rationale}</div>
                {nba.intervene && <div className="warn">Take-over recommended{nba.interveneReason ? ` — ${nba.interveneReason}` : ""}{nba.suggestedOpening ? <div className="open">Opening line: “{nba.suggestedOpening}”</div> : null}</div>}
                <div className="meta">Intent: {nba.intent} · Sentiment: {nba.sentiment ?? c.sentiment}{c.nbaAt ? ` · evaluated ${fmtTime(c.nbaAt)}` : ""}</div>
              </> : <div className="why">{nbaBusy ? "Evaluating the conversation…" : "Evaluates after the employee's next turn."}</div>}
            </div>
            {monitor && (
              <div className="ecard" style={{ marginTop: 12 }}>
                <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)", fontSize: 16 }} /> Agent activity (live)</div>
                {events.length ? <ul className="feed">{events.map((e, i) => <li key={i}><span className="t">{fmtTime(e.at)}</span><b>{e.agent}</b> {e.kind === "agent.tool" ? <>called <code>{e.tool}</code></> : e.kind === "agent.done" ? "finished" : <>{e.step}{e.detail ? ` — ${e.detail}` : ""}</>}</li>)}</ul> : <div style={{ fontSize: 13, color: "#616161" }}>Waiting for the assistant's next step.</div>}
              </div>
            )}
          </div>
        )}
        <div className="sec">
          <h3>Customer</h3>
          <div className="ecard">
            <div className="h"><Person16Regular /> Customer Details</div>
            <Row label="Name"><Val><span className="chip" onClick={() => dispatch({ type: "openTab", tab: { id: "ct-" + cust.id, kind: "contact", contactId: cust.id } })}><Person16Regular /> {cust.name}</span></Val></Row>
            <Row label="Employee ID"><Val>{cust.employeeId}</Val></Row>
            <Row label="Email"><Val>{cust.email}</Val></Row>
            <Row label="Account"><Val><span className="chip" onClick={() => acct && dispatch({ type: "openTab", tab: { id: "ac-" + acct.id, kind: "account", accountId: acct.id } })}><Building16Regular /> {acct?.name}</span></Val></Row>
            <Row label="Pay group"><Val>{cust.payGroup}</Val></Row>
            <Row label="Work state"><Val>{cust.state}</Val></Row>
          </div>
        </div>

        <div className="sec">
          <h3>Conversation summary</h3>
          <div className="ecard">
            <div className="h">Conversation details</div>
            <div className="cdgrid">
              <span>Engagement channel</span><b>{c.channel === "voice" ? "Voice" : "Chat"}</b>
              <span>Waiting time</span><b>{mmss(c.waitingSeconds)}</b>
              <span>Skills</span><b>Payroll – {q?.name ?? "Pay Distribution"}</b>
              <span>Queue</span><b>{q?.name ?? "—"}</b>
              <span>Start time</span><b>{fmtDateTime(c.startedAt)}</b>
              <span>Transferred by</span><b>{c.transferredBy ?? "—"}</b>
            </div>
            <div className="tabs" style={{ marginTop: 10 }}>
              {(["Pre-chat survey", "Self service", "Visitor details", "Additional details"] as const).map(t => <span key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</span>)}
            </div>
            <div className="tabbody">
              {tab === "Pre-chat survey" && <div className="cdgrid"><span>Identity</span><b>{c.verified ? `Verified (${c.verifyMethod ?? "OTP"})` : "Not verified"}</b><span>Reason</span><b>{c.intent ?? kase?.intent ?? "—"}</b><span>Handover reason</span><b>{c.transferReason || "—"}</b></div>}
              {tab === "Self service" && <ul className="plain">{selfService.map(s => <li key={s}>{s}</li>)}</ul>}
              {tab === "Visitor details" && <div className="cdgrid"><span>Authenticated</span><b>{c.verified ? "Yes" : "No"}</b><span>Phone</span><b>{cust.id === "c4" ? "+1 (614) ••• 9876" : "on file"}</b><span>Language</span><b>English</b><span>Sentiment</span><b>{sentimentNote}</b></div>}
              {tab === "Additional details" && <div className="cdgrid"><span>Pay group</span><b>{cust.payGroup}</b><span>Pay date</span><b>{fmtDate(new Date())}</b><span>Linked case</span><b>{kase?.number ?? "—"}</b><span>ElevenLabs conversation</span><b>{c.externalId ?? "—"}</b></div>}
            </div>
          </div>
          <div className="cpcard" style={{ marginTop: 12 }}>
            <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Conversation summary <span className="sp" /><button className="iconbtn" onClick={() => setSumOpen(!sumOpen)}>{sumOpen ? <ChevronUp20Regular /> : <ChevronDown20Regular />}</button></div>
            {sumOpen && <>
              <p style={{ opacity: busy ? .5 : 1 }}>{c.summary || (busy ? "Summarizing the conversation…" : "The summary appears once the conversation has a few lines.")}</p>
              <div className="ft">
                <Button size="small" appearance="primary" icon={<Copy16Regular />} onClick={() => { navigator.clipboard?.writeText(c.summary); dispatch({ type: "toast", text: "Copied to clipboard" }); }}>Copy</Button>
                <Tooltip content="Regenerate" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => { setBusy(true); api.conv.summary(c.id).finally(() => setBusy(false)); }}><ArrowClockwise16Regular /></button></Tooltip>
                <span style={{ marginLeft: 6 }}>AI-generated content may be incorrect. Make sure it's accurate and appropriate before using it.</span>
              </div>
            </>}
          </div>
        </div>

        <div className="sec">
          <h3>Case</h3>
          <div className="ecard">
            <div className="h"><Wrench16Regular /> Case Details</div>
            {kase ? <>
              <Row label="Case Number"><Val><span className="chip" onClick={() => dispatch({ type: "openCase", caseId: kase.id, inSession: "current" })}><Wrench16Regular /> {kase.number}</span>{kase.aiCreated && <Tooltip content="Created by the Case Management Agent" relationship="description"><Sparkle20Filled style={{ color: "var(--copilot)", fontSize: 16 }} /></Tooltip>}</Val></Row>
              <Row label="Title"><Val>{kase.title}</Val></Row>
              <Row label="Priority"><Val><span style={{ width: 10, height: 10, borderRadius: 2, background: kase.priority === "High" ? "#c4314b" : kase.priority === "Normal" ? "#0f6cbd" : "#8a8a8a" }} />{kase.priority}</Val></Row>
              <Row label="Status"><Val><span className={"pill" + (kase.status === "Resolved" ? " green" : "")}>{kase.status}</span></Val></Row>
              <Row label="Owner"><Val>{kase.owner}</Val></Row>
            </> : <div style={{ padding: "6px 0" }}><Button size="small" onClick={() => dispatch({ type: "toast", text: "Use New case in the Inbox to link a case" })}>Add Case</Button></div>}
          </div>
        </div>

        <div className="sec">
          <h3>Disposition code</h3>
          <Row label="Category"><Val><Sel value={category} options={Object.keys(CATEGORIES)} onChange={setCategory} /></Val></Row>
          <Row label="Search codes"><Val><Sel value={c.dispositionCode ?? ""} placeholder="Select a disposition code" options={CATEGORIES[category]} onChange={v => api.conv.patch(c.id, { dispositionCode: v || null })} /></Val></Row>
          <Row label="Notes" top><Val><textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => api.conv.patch(c.id, { notes })} rows={3} disabled={closed} style={{ border: 0, background: "transparent", width: "100%", font: "inherit", resize: "vertical", padding: "6px 0" }} placeholder="Representative notes" /></Val></Row>
        </div>

        <Subgrid title="Recent cases" columns={["Case Number", "Title", "Priority", "Status", "Created On"]}
          rows={custCases.slice(0, 5).map(k => [<a key="n" onClick={() => dispatch({ type: "openCase", caseId: k.id, inSession: "current" })}>{k.number}</a>, k.title, <span key="p" style={{ color: k.priority === "High" ? "#c4314b" : "inherit" }}>{k.priority}</span>, <span key="s" className={"pill" + (k.status === "Resolved" ? " green" : "")}>{k.status}</span>, fmtDate(k.createdOn)])} />

        <div className="sec" style={{ paddingBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><span>Linked records:</span><Sel value={linked} options={["Case", "Contact", "Account"]} onChange={v => setLinked(v as any)} /></div>
        </div>
        {linked === "Case" && kase ? <Timeline c={kase} /> : <div className="sec" style={{ color: "#616161", fontSize: 14 }}>{linked === "Case" ? "No case is linked to this conversation yet." : `Timeline for the ${linked.toLowerCase()} is not available in this prototype.`}</div>}
        {!closed && lines.length > 0 && <div className="sec" style={{ fontSize: 13, color: "#616161" }}>Last activity {fmtTime(lines[lines.length - 1].at)}</div>}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { Button, Textarea } from "@fluentui/react-components";
import { ArrowLeft20Regular, ArrowReply20Regular, ArrowForward20Regular, Send20Regular, Share20Regular, ChevronDown16Regular, Sparkle20Filled } from "@fluentui/react-icons";
import { useStore, nextId } from "../store";
import { contacts } from "../data";
import { fmtDateTime } from "../util";

export default function EmailView({ activityId }: { activityId: string }) {
  const { state, dispatch } = useStore();
  const a = state.activities.find(x => x.id === activityId)!;
  const c = state.cases.find(x => x.id === a.caseId)!;
  const cust = contacts.find(x => x.id === c.customerId)!;
  const [reply, setReply] = useState(state.copilotDraft?.activityId === a.id ? state.copilotDraft.text : "");
  const draft = state.copilotDraft?.activityId === a.id ? state.copilotDraft.text : null;
  const body = draft && !reply ? draft : reply;
  const send = () => {
    dispatch({ type: "addActivity", activity: { id: nextId("t"), caseId: c.id, type: "email", direction: "out", from: "Priya Natarajan", subject: "RE: " + a.subject.replace(/^RE: /, ""), body, at: new Date(), modifiedAt: new Date() } });
    dispatch({ type: "updateCase", caseId: c.id, patch: { firstResponseSent: true } });
    dispatch({ type: "setDraft", draft: null });
    dispatch({ type: "toast", text: "Email sent", kind: "success" });
    dispatch({ type: "closeTab", tabId: "em-" + a.id });
  };
  return (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="cmdbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <button className="cmd" disabled><ArrowLeft20Regular /></button><span className="sep" />
        <button className="cmd" onClick={() => dispatch({ type: "setPane", pane: "copilot" })}><ArrowReply20Regular /> Reply</button><button className="cmd"><ArrowForward20Regular /> Forward</button>
        <span className="spacer" /><button className="cmd outline"><Share20Regular /> Share <ChevronDown16Regular /></button>
      </div>
      <div className="formbody">
        <div className="rhead">
          <div className="title"><span>{a.subject}</span></div>
          <div className="sub"><b>Email</b> · Regarding <span className="link" onClick={() => dispatch({ type: "openCase", caseId: c.id, inSession: "current" })}>{c.number}</span></div>
          <div className="kv">
            <span className="l">From</span><span className="v">{a.from} {a.direction === "in" ? `<${cust.email}>` : "<payroll.support@strada.example>"}</span>
            <span className="l">To</span><span className="v">{a.direction === "in" ? "Strada Payroll Support" : cust.name}</span>
            <span className="l">Received</span><span className="v">{fmtDateTime(a.at)}</span>
          </div>
        </div>
        <div className="sec" style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", borderBottom: "1px solid var(--line)" }}>{a.body}</div>
        <div className="sec">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>Reply {draft && <span className="pill" style={{ background: "#f3f2fb", color: "#3b3f9e", display: "inline-flex", gap: 4 }}><Sparkle20Filled style={{ fontSize: 14 }} /> Copilot draft inserted</span>}</h3>
          <Textarea style={{ width: "100%" }} rows={9} value={body} onChange={(_, v) => setReply(v.value)} placeholder="Write a reply, or use Copilot to draft one" />
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}><Button appearance="primary" icon={<Send20Regular />} disabled={!body.trim()} onClick={send}>Send</Button><Button icon={<Sparkle20Filled />} onClick={() => dispatch({ type: "setPane", pane: "copilot" })}>Draft with Copilot</Button></div>
        </div>
      </div>
    </div>
  );
}

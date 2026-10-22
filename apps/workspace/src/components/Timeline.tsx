import React, { useState } from "react";
import { Input, Tooltip } from "@fluentui/react-components";
import { Add20Regular, Bookmark20Regular, Filter20Regular, ArrowMaximizeVertical20Regular, ArrowClockwise20Regular, MoreVertical20Regular, Search20Regular, Edit20Regular, Attach20Regular, ChevronDown20Regular, ChevronUp20Regular, ChevronDown16Regular, Mail20Regular, Chat20Regular, Call20Regular, CalendarLtr20Regular, TaskListSquareLtr20Regular, Note20Regular, Bot20Regular, ArrowReply20Regular, Open20Regular, PersonArrowRight20Regular, Checkmark20Regular, Delete20Regular, Sparkle20Filled } from "@fluentui/react-icons";
import { useStore, nextId } from "../store";
import type { Activity, Case } from "../model";
import { avatarColor, fmtDateTime, initials } from "../util";

const ICON: Record<Activity["type"], React.FC> = { email: Mail20Regular, chat: Chat20Regular, call: Call20Regular, appointment: CalendarLtr20Regular, task: TaskListSquareLtr20Regular, note: Note20Regular, autopost: Bot20Regular };
const LABEL: Record<Activity["type"], string> = { email: "Email from", chat: "Live chat from", call: "Phone Call from", appointment: "Appointment from", task: "Task from", note: "Note from", autopost: "Auto-post by" };

export default function Timeline({ c }: { c: Case }) {
  const { state, dispatch } = useStore();
  const [hl, setHl] = useState(true);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const items = state.activities.filter(a => a.caseId === c.id && (!q || (a.subject + " " + (a.body ?? "")).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  const addNote = () => {
    if (!note.trim()) return;
    dispatch({ type: "addActivity", activity: { id: nextId("t"), caseId: c.id, type: "note", from: "Priya Natarajan", subject: note.trim().slice(0, 60), body: note.trim(), at: new Date(), modifiedAt: new Date() } });
    setNote("");
  };
  return (
    <div className="sec tl">
      <div className="hd">
        <span className="t">Timeline</span>
        <button className="iconbtn" title="Create a timeline record"><Add20Regular /></button>
        <button className="iconbtn"><Bookmark20Regular /></button>
        <button className="iconbtn"><Filter20Regular /></button>
        <button className="iconbtn"><ArrowMaximizeVertical20Regular /></button>
        <button className="iconbtn"><ArrowClockwise20Regular /></button>
        <button className="iconbtn"><MoreVertical20Regular /></button>
      </div>
      <div className="search"><Input contentBefore={<Search20Regular />} placeholder="Search timeline" value={q} onChange={(_, v) => setQ(v.value)} style={{ width: "100%" }} appearance="filled-lighter" /></div>
      <div className="note">
        <Edit20Regular />
        <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && addNote()} placeholder="Enter a note..." style={{ flex: 1, border: 0, outline: 0, fontSize: 15, background: "transparent", fontFamily: "inherit" }} />
        <Attach20Regular />
      </div>
      <div>
        <div className="hl" onClick={() => setHl(!hl)}>
          <Sparkle20Filled style={{ color: "var(--copilot)" }} /> <span style={{ flex: 1 }}>Highlights</span> {hl ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
        </div>
        {hl && <ul style={{ margin: "0 0 10px", paddingLeft: 28, fontSize: 14, lineHeight: 1.5 }}>{c.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
      </div>
      <div className="grp"><ChevronDown16Regular /> Recent</div>
      {items.map(a => <Entry key={a.id} a={a} />)}
      {!items.length && <div className="mini" style={{ padding: 20, textAlign: "center" }}>No records found.</div>}
    </div>
  );
}

function Entry({ a }: { a: Activity }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const Icon = ICON[a.type];
  const ai = a.aiGenerated;
  const pill = a.status === "Overdue" ? <span className="pill red">Overdue</span> : a.status === "Closed" ? <span className="pill grey">Closed</span> : a.status === "Completed" ? <span className="pill green">Completed</span> : a.status === "Open" ? <span className="pill">Open</span> : null;
  const canComplete = (a.type === "task" || a.type === "appointment") && a.status !== "Completed";
  return (
    <div className="te">
      <span className="av" style={{ background: ai ? "var(--copilot)" : avatarColor(a.from) }}>{ai ? <Sparkle20Filled /> : initials(a.from)}</span>
      <div className="box">
        <div className="mod">Modified on: {fmtDateTime(a.modifiedAt)}</div>
        <div className="t1">
          <Icon />
          <span><span className="lab">{LABEL[a.type]}:</span> <span className="who">{a.from}</span> {pill}</span>
          <span className="acts">
            {a.type === "email" && <Tooltip content="Reply" relationship="label"><button className="iconbtn" onClick={() => dispatch({ type: "setPane", pane: "copilot" })}><ArrowReply20Regular /></button></Tooltip>}
            {a.type === "email" && <Tooltip content="Open" relationship="label"><button className="iconbtn" onClick={() => dispatch({ type: "openTab", tab: { id: "em-" + a.id, kind: "email", activityId: a.id } })}><Open20Regular /></button></Tooltip>}
            {(a.type === "task" || a.type === "appointment" || a.type === "call" || a.type === "chat") && <Tooltip content="Assign" relationship="label"><button className="iconbtn"><PersonArrowRight20Regular /></button></Tooltip>}
            {canComplete && <Tooltip content="Mark complete" relationship="label"><button className="iconbtn" onClick={() => { dispatch({ type: "updateActivity", id: a.id, patch: { status: "Completed" } }); dispatch({ type: "toast", text: `${a.type === "task" ? "Task" : "Appointment"} completed` }); }}><Checkmark20Regular /></button></Tooltip>}
            {a.type !== "email" && a.type !== "autopost" && <Tooltip content="Open" relationship="label"><button className="iconbtn"><Open20Regular /></button></Tooltip>}
            {a.type !== "autopost" && <Tooltip content="Edit" relationship="label"><button className="iconbtn"><Edit20Regular /></button></Tooltip>}
            {a.type !== "autopost" && <Tooltip content="Delete" relationship="label"><button className="iconbtn"><Delete20Regular /></button></Tooltip>}
          </span>
        </div>
        <div className="t2">{a.subject}</div>
        <div className="t3">{a.type === "appointment" || a.type === "task" ? (a.due ? fmtDateTime(a.due) : fmtDateTime(a.at)) : fmtDateTime(a.at)}</div>
        {(a.body || a.transcript) && (
          <>
            {open && a.body && <div className="body">{a.body}</div>}
            {open && a.transcript && (
              <div className="chat">
                {a.transcript.map((m, i) => <div key={i} className={"m " + (m.who.includes("assistant") || m.who.includes("Strada") ? "me" : "them")}><div className="w">{m.who} · {m.at}</div>{m.text}</div>)}
              </div>
            )}
            <div className="more" onClick={() => setOpen(!open)}>{a.transcript ? (open ? "Hide transcript" : "Transcript") : (open ? "View less" : "View more")} {open ? <ChevronUp20Regular /> : <ChevronDown20Regular />}</div>
          </>
        )}
      </div>
    </div>
  );
}

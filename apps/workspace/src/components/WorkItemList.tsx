import React, { useState } from "react";
import { Tooltip } from "@fluentui/react-components";
import { Search20Regular, ArrowClockwise20Regular, Filter20Regular, ChevronDown16Regular, ChevronRight16Regular, Wrench16Regular, Open16Regular, EyeOff16Regular, TextBulletListLtr20Regular, Call16Regular, Chat16Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { contacts, queues } from "../data";
import { api } from "../api";
import { mmss } from "./Form";
import { fmtTime, isThisMonth, isToday, shortWhen } from "../util";

export default function WorkItemList() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({ Conversations: true, Today: true, "This month": true, Older: true, "Closed work items": false });
  const live = state.conversations.filter(c => c.state === "Active" || c.state === "Wrap-up");
  const closedCv = state.conversations.filter(c => c.state === "Closed" && c.closedAt && (c.handledByAssistant || c.id === "cv1")).sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0)).slice(0, 10);
  const openCv = async (id: string) => {
    const cv = state.conversations.find(c => c.id === id); if (!cv) return;
    try { const lines = await api.conv.lines(id); dispatch({ type: "setTranscript", conversationId: id, lines }); } catch {}
    dispatch({ type: "openConversation", conversationId: id, title: contacts.find(x => x.id === cv.customerId)?.name ?? "Conversation" });
  };
  const cvItem = (c: typeof live[number]) => {
    const cust = contacts.find(x => x.id === c.customerId); const q = queues.find(x => x.id === c.queueId);
    const dur = c.acceptedAt ? Math.floor(((c.endedAt ?? c.closedAt ?? new Date()).getTime() - c.acceptedAt.getTime()) / 1000) : 0;
    return (
      <div key={c.id} className="item" onClick={() => openCv(c.id)}>
        <span className="ic" style={{ background: c.channel === "voice" ? "#0f6cbd" : "#0e7a5f" }}>{c.channel === "voice" ? <Call16Regular /> : <Chat16Regular />}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="t1">{cust?.name ?? "Customer"}</div>
          <div className="t2">{c.channel === "voice" ? "Voice" : "Chat"} · {q?.name ?? "Pay Distribution"}</div>
          <div className="t2">{c.state}{c.state === "Closed" ? ` · ${mmss(dur)} · ${c.closedAt ? fmtTime(c.closedAt) : ""}` : c.acceptedAt ? ` · ${fmtTime(c.acceptedAt)}` : ""}</div>
        </div>
      </div>
    );
  };
  const mine = state.cases.filter(c => c.status !== "Resolved" && c.owner === "Priya Natarajan").sort((a, b) => b.modifiedOn.getTime() - a.modifiedOn.getTime());
  const groups: [string, typeof mine][] = [
    ["Today", mine.filter(c => isToday(c.modifiedOn))],
    ["This month", mine.filter(c => !isToday(c.modifiedOn) && isThisMonth(c.modifiedOn))],
    ["Older", mine.filter(c => !isThisMonth(c.modifiedOn))],
  ];
  const selected = state.inboxSelectedCaseId;
  return (
    <div className="card wi">
      <div className="hd">
        <TextBulletListLtr20Regular />
        <span className="title">My work items</span>
        <button aria-label="Search"><Search20Regular /></button>
        <button aria-label="Refresh"><ArrowClockwise20Regular /></button>
        <button aria-label="Filter"><Filter20Regular /></button>
      </div>
      <div className="list">
        {live.length > 0 && (
          <div>
            <div className="grp" onClick={() => setOpen({ ...open, Conversations: !open.Conversations })}>{open.Conversations ? <ChevronDown16Regular /> : <ChevronRight16Regular />}<span>Conversations</span><span className="n">{live.length}</span></div>
            {open.Conversations && live.map(cvItem)}
          </div>
        )}
        {groups.filter(([, items]) => items.length).map(([name, items]) => (
          <div key={name}>
            <div className="grp" onClick={() => setOpen({ ...open, [name]: !open[name] })}>
              {open[name] ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
              <span>{name}</span><span className="n">{items.length}</span>
            </div>
            {open[name] && items.map(c => {
              const cust = contacts.find(x => x.id === c.customerId)!;
              return (
                <Tooltip key={c.id} content={c.title} relationship="description" positioning="after">
                  <div className={"item" + (selected === c.id && state.activeSessionId === "inbox" ? " sel" : "")} onClick={() => dispatch({ type: "selectInbox", caseId: c.id })}>
                    <span className="ic"><Wrench16Regular /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="t1">{c.title}</div>
                      <div className="t2">{c.number}</div>
                      <div className="t2">Customer: {cust.name}</div>
                      <div className="t2">Active · {c.priority} · {isToday(c.modifiedOn) ? fmtTime(c.modifiedOn) : shortWhen(c.modifiedOn)}</div>
                    </div>
                    <div className="hov">
                      <button className="iconbtn" style={{ width: 26, height: 26 }} title="Open in new session" onClick={e => { e.stopPropagation(); dispatch({ type: "openCase", caseId: c.id, inSession: "new" }); }}><Open16Regular /></button>
                      <button className="iconbtn" style={{ width: 26, height: 26 }} title="Hide"><EyeOff16Regular /></button>
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        ))}
        {closedCv.length > 0 && (
          <div>
            <div className="grp" onClick={() => setOpen({ ...open, "Closed work items": !open["Closed work items"] })}>{open["Closed work items"] ? <ChevronDown16Regular /> : <ChevronRight16Regular />}<span>Closed work items</span><span className="n">{closedCv.length}</span></div>
            {open["Closed work items"] && closedCv.map(cvItem)}
          </div>
        )}
      </div>
      <div className="ft"><span>{mine.length + live.length} items</span><span>Last updated at {fmtTime(new Date())}</span></div>
    </div>
  );
}

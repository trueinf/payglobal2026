import React, { useEffect, useRef, useState } from "react";
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Tooltip, Textarea } from "@fluentui/react-components";
import { MicOff20Regular, Pause20Regular, PeopleCall20Regular, ArrowForward20Regular, Dialpad20Regular, CallEnd20Filled, Note20Regular, Record20Regular, RecordStop20Regular, Settings20Regular, Warning20Regular, BookOpen20Regular, Link20Regular, MoreHorizontal20Regular, EmojiSad20Regular, EmojiMeh20Regular, EmojiSmileSlight20Regular, Send20Regular, Sparkle16Filled, Chat20Regular, Call20Regular } from "@fluentui/react-icons";
import { useStore, type Conversation } from "../store";
import { api } from "../api";
import { accounts, contacts, queues } from "../data";
import { fmtTime, initials, avatarColor } from "../util";
import { mmss } from "./Form";

const NEG = /(didn't|did not|not paid|missing|wrong|angry|frustrat|unacceptable|ridiculous|still waiting|again|upset|short)/i;
const POS = /(thank|great|perfect|appreciate|sorted|awesome|good)/i;

/** Left column for a conversation session (replaces the work-item list), mirroring the documented Communication panel. */
export default function CommunicationPanel({ conversationId, monitor = false }: { conversationId: string; monitor?: boolean }) {
  const { state, dispatch } = useStore();
  const c = state.conversations.find(x => x.id === conversationId);
  const lines = state.transcript[conversationId] ?? [];
  const cust = contacts.find(x => x.id === c?.customerId);
  const acct = accounts.find(a => a.id === cust?.accountId);
  const [now, setNow] = useState(Date.now());
  const [mute, setMute] = useState(false); const [hold, setHold] = useState(false);
  const [showT, setShowT] = useState(() => { try { return localStorage.getItem("cp.transcript") !== "hidden"; } catch { return true; } });
  const [dlg, setDlg] = useState<"consult" | "transfer" | "dialpad" | null>(null);
  const [text, setText] = useState(""); const [suggesting, setSuggesting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines.length]);
  useEffect(() => { try { localStorage.setItem("cp.transcript", showT ? "shown" : "hidden"); } catch {} }, [showT]);
  if (!c || !cust) return <div className="card wi" />;

  const active = c.state === "Active" && !monitor;
  const handler = c.state === "Assistant" ? "handled by Strada Pay assistant" : c.state === "Open" ? "waiting in queue" : `handled by ${c.assignedTo ?? "representative"}`;
  const takeover = async () => { try { await api.conv.takeover(c.id); const lines = await api.conv.lines(c.id); dispatch({ type: "setTranscript", conversationId: c.id, lines }); dispatch({ type: "closeSession", id: state.activeSessionId }); dispatch({ type: "openConversation", conversationId: c.id, title: cust.name }); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } };
  const custLines = lines.filter(l => l.who === "Customer");
  const lastCust = custLines[custLines.length - 1]?.text ?? "";
  const sentiment = POS.test(lastCust) ? "Positive" : NEG.test(lastCust) ? "Slightly negative" : "Neutral";
  const SentIcon = sentiment === "Positive" ? EmojiSmileSlight20Regular : sentiment === "Neutral" ? EmojiMeh20Regular : EmojiSad20Regular;
  const elapsed = c.acceptedAt ? Math.floor(((c.endedAt?.getTime() ?? now) - c.acceptedAt.getTime()) / 1000) : 0;

  const send = async () => {
    const t = text.trim(); if (!t) return; setText("");
    try { await api.conv.line(c.id, "Representative", t); } catch (e: any) { dispatch({ type: "toast", text: e.message }); }
  };
  const suggest = async () => {
    setSuggesting(true);
    try { const r = await api.conv.suggest(c.id); setText(r.text); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setSuggesting(false); }
  };
  const end = async () => {
    try { await api.conv.end(c.id); dispatch({ type: "toast", text: "Conversation ended · wrap-up" }); } catch (e: any) { dispatch({ type: "toast", text: e.message }); }
  };
  const transferTo = async (qid: string) => {
    setDlg(null);
    try { await api.conv.close(c.id); await api.conv.patch(c.id, { notes: `Transferred to ${queues.find(q => q.id === qid)?.name}` }); dispatch({ type: "closeSession", id: state.activeSessionId }); dispatch({ type: "toast", text: "Conversation transferred to the queue" }); }
    catch (e: any) { dispatch({ type: "toast", text: e.message }); }
  };
  const ctl = (label: string, Icon: React.FC, onClick?: () => void, on?: boolean, danger?: boolean) => (
    <Tooltip content={label} relationship="label" key={label}><button className={"cctl" + (on ? " on" : "") + (danger ? " danger" : "")} disabled={!active && !danger} onClick={onClick}><Icon /></button></Tooltip>
  );

  return (
    <div className="card wi cpanel">
      <div className="cph">
        <span className="av" style={{ background: avatarColor(cust.name) }}>{initials(cust.name)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="t1">{cust.name}</div>
          <div className="t2">{acct?.name} · {cust.employeeId}</div>
        </div>
        <div className="t2" style={{ textAlign: "right" }}>
          <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: c.state === "Wrap-up" ? "#616161" : hold ? "#c4314b" : "inherit" }}>{mmss(elapsed)}</div>
          <Tooltip content={`Sentiment: ${sentiment}`} relationship="label"><span><SentIcon /></span></Tooltip>
        </div>
      </div>
      <div className="cstate">{c.channel === "voice" ? <Call20Regular /> : <Chat20Regular />} {c.channel === "voice" ? "Voice" : "Chat"} · {c.state === "Assistant" ? "Active" : c.state}{hold && active ? " · On hold" : ""}{c.verified ? " · Identity verified" : ""}</div>
      {monitor && (
        <div className="monitorbar">
          <span>Monitoring · {handler}</span>
          {(c.state === "Assistant" || c.state === "Open") && <Button size="small" appearance="primary" onClick={takeover}>Take over</Button>}
        </div>
      )}
      {monitor ? null : c.channel === "voice" ? (
        <div className="cctls">
          {ctl(mute ? "Unmute" : "Mute", MicOff20Regular, () => setMute(!mute), mute)}
          {ctl(hold ? "Resume" : "Hold", Pause20Regular, () => setHold(!hold), hold)}
          {ctl("Consult", PeopleCall20Regular, () => setDlg("consult"))}
          {ctl("Transfer", ArrowForward20Regular, () => setDlg("transfer"))}
          {ctl("Dialpad", Dialpad20Regular, () => setDlg("dialpad"))}
          {active && ctl("End", CallEnd20Filled, end, false, true)}
          <span className="sp" />
          {ctl("More", MoreHorizontal20Regular)}
        </div>
      ) : (
        <div className="cctls">
          {ctl("Consult", PeopleCall20Regular, () => setDlg("consult"))}
          {ctl("Transfer", ArrowForward20Regular, () => setDlg("transfer"))}
          {active && ctl("End", CallEnd20Filled, end, false, true)}
          <span className="sp" />
          {ctl("More", MoreHorizontal20Regular)}
        </div>
      )}
      {!monitor && <div className="cctls second">
        {ctl("Take notes", Note20Regular, () => dispatch({ type: "toast", text: "Notes open in the Active Conversation form" }))}
        {ctl(c.recording ? "Pause recording and transcription" : "Start recording and transcript", c.recording ? RecordStop20Regular : Record20Regular, () => api.conv.patch(c.id, { recording: !c.recording }), c.recording)}
        {ctl("Device settings", Settings20Regular)}
        {ctl("Mark spam", Warning20Regular)}
        {ctl("Knowledge Articles", BookOpen20Regular, () => dispatch({ type: "setPane", pane: "knowledge" }))}
        {ctl("Link to conversation", Link20Regular, () => { navigator.clipboard?.writeText(location.href + "#" + c.id); dispatch({ type: "toast", text: "Link copied" }); })}
      </div>}

      <div className="thd">
        <span className="t">Transcript</span>
        {c.recording && <span className="rec"><span className="dot" />Recording · Transcription on</span>}
        <button className="link" onClick={() => setShowT(!showT)}>{showT ? "Hide Transcript" : "Show Transcript"}</button>
      </div>
      {showT && (
        <div className="transcript">
          {lines.map(l => l.who === "System" ? <div key={l.id} className="sys">{l.text}</div> : (
            <div key={l.id} className={"tl-msg " + (l.who === "Customer" ? "cust" : "rep")}>
              <div className="who">{l.who === "Customer" ? cust.name : l.who === "Representative" ? (c.assignedTo ?? "Representative") : l.who === "Assistant" || l.who === "Voice agent" ? "Strada Pay assistant" : l.who} · {fmtTime(l.at)}</div>
              <div className="bub">{l.text}</div>
            </div>
          ))}
          {!lines.length && <div className="sys">No transcript yet.</div>}
          <div ref={endRef} />
        </div>
      )}
      {!monitor && <div className="cinput">
        <Textarea value={text} onChange={(_, v) => setText(v.value)} rows={3} resize="none" placeholder={active ? (c.channel === "voice" ? "What you say to the customer (spoken to them through Strada Pay)" : "Type a reply to the customer") : c.state === "Wrap-up" ? "Conversation ended" : "Waiting"} disabled={!active} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="cbtns">
          <Button size="small" icon={<Sparkle16Filled style={{ color: "var(--copilot)" }} />} disabled={!active || suggesting} onClick={suggest}>{suggesting ? "Thinking…" : "Suggest a response"}</Button>
          <span className="sp" />
          <Button size="small" appearance="primary" icon={<Send20Regular />} disabled={!active || !text.trim()} onClick={send}>Send</Button>
        </div>
      </div>}

      <Dialog open={dlg === "consult" || dlg === "transfer"} onOpenChange={(_, d) => !d.open && setDlg(null)}>
        <DialogSurface><DialogBody>
          <DialogTitle>{dlg === "consult" ? "Consult" : "Transfer"}</DialogTitle>
          <DialogContent>
            <div style={{ fontSize: 13, color: "#616161", marginBottom: 8 }}>{dlg === "consult" ? "Representatives" : "Queues"}</div>
            {dlg === "consult" ? ["Marcus Bell · Pay Distribution", "Sofia Alvarez · Tax", "Daniel Osei · Garnishments"].map(n => <div key={n} className="pick" onClick={() => { setDlg(null); dispatch({ type: "toast", text: `Consult request sent to ${n.split(" ·")[0]}` }); }}>{n}</div>)
              : queues.map(q => <div key={q.id} className="pick" onClick={() => transferTo(q.id)}>{q.name}</div>)}
          </DialogContent>
          <DialogActions><Button onClick={() => setDlg(null)}>Cancel</Button></DialogActions>
        </DialogBody></DialogSurface>
      </Dialog>
      <Dialog open={dlg === "dialpad"} onOpenChange={(_, d) => !d.open && setDlg(null)}>
        <DialogSurface style={{ maxWidth: 260 }}><DialogBody>
          <DialogTitle>Dialpad</DialogTitle>
          <DialogContent><div className="dialpad">{["1","2","3","4","5","6","7","8","9","*","0","#"].map(k => <button key={k}>{k}</button>)}</div></DialogContent>
          <DialogActions><Button onClick={() => setDlg(null)}>Close</Button></DialogActions>
        </DialogBody></DialogSurface>
      </Dialog>
    </div>
  );
}

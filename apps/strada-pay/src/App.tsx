import React, { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { api, connect, type AlertRow, type Employee, type Line, type SessionStart } from "./api";
import { playUrl, speakFallback, usePushToTalk, useSessionFeed } from "./session";

type View = { kind: "signin" } | { kind: "home"; me: Employee } | { kind: "chat"; me: Employee; s: SessionStart } | { kind: "call"; me: Employee; s: SessionStart };

export default function App() {
  const [view, setView] = useState<View>({ kind: "signin" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const begin = async (me: Employee, channel: "chat" | "voice") => {
    setBusy(true); setErr(null);
    try { const s = await api.start(me.id, channel); setView({ kind: channel === "chat" ? "chat" : "call", me, s }); }
    catch (e: any) { setErr(`Cannot reach the Strada runtime (${e.message}). Start it with make runtime.`); }
    finally { setBusy(false); }
  };
  return (
    <div className="shell">
      <header className="top">
        <div className="logo"><span className="mark" />Strada Pay</div>
        {view.kind !== "signin" && <button className="link" onClick={() => setView({ kind: "signin" })}>Sign out</button>}
      </header>
      {err && <div className="err">{err}</div>}
      {view.kind === "signin" && <SignIn onPick={me => setView({ kind: "home", me })} />}
      {view.kind === "home" && <Home me={view.me} busy={busy} onChat={() => begin(view.me, "chat")} onCall={() => begin(view.me, "voice")} />}
      {view.kind === "chat" && <Chat me={view.me} s={view.s} onDone={() => setView({ kind: "home", me: view.me })} />}
      {view.kind === "call" && <ConversationProvider><Call me={view.me} s={view.s} onDone={() => setView({ kind: "home", me: view.me })} /></ConversationProvider>}
    </div>
  );
}

function SignIn({ onPick }: { onPick: (e: Employee) => void }) {
  const [list, setList] = useState<Employee[]>([]); const [e, setE] = useState<string | null>(null);
  useEffect(() => { api.employees().then(setList).catch(x => setE(x.message)); }, []);
  return (
    <main className="card narrow">
      <h1>Sign in</h1>
      <p className="muted">Employee self-service for payroll run by Strada. Pick who you are for this demo.</p>
      {e && <div className="err">Runtime unreachable: {e}</div>}
      <div className="people">
        {list.map(p => (
          <button key={p.id} className="person" onClick={() => onPick(p)}>
            <span className="av">{initials(p.name)}</span>
            <span><b>{p.name}</b><br /><small>{p.accountName} · {p.employeeId}</small></span>
          </button>
        ))}
      </div>
    </main>
  );
}

function Home({ me, busy, onChat, onCall }: { me: Employee; busy: boolean; onChat: () => void; onCall: () => void }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => api.alerts(me.id).then(a => alive && setAlerts(a)).catch(() => {});
    load();
    const stop = connect((kind, data) => { if (kind === "alert.created" && data.contactId === me.id) load(); });
    return () => { alive = false; stop(); };
  }, [me.id]);
  const markRead = (a: AlertRow) => { if (!a.readAt) { api.readAlert(a.id).catch(() => {}); setAlerts(x => x.map(y => y.id === a.id ? { ...y, readAt: new Date().toISOString() } : y)); } };
  return (
    <main className="grid">
      {alerts.length > 0 && (
        <section className="card notices">
          <div className="eyebrow">Notifications</div>
          {alerts.map(a => (
            <div key={a.id} className={"notice" + (a.readAt ? "" : " unread")} onClick={() => markRead(a)}>
              <div className="nt"><b>{a.title ?? KIND[a.kind] ?? "Update"}</b><span>{new Date(a.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
              <div>{a.message}</div>
              {a.caseNumber && <div className="muted small">Case {a.caseNumber}</div>}
            </div>
          ))}
        </section>
      )}
      <section className="card">
        <div className="eyebrow">Welcome back</div>
        <h1>{me.name.split(" ")[0]}</h1>
        <div className="kv"><span>Employer</span><b>{me.accountName}</b></div>
        <div className="kv"><span>Employee ID</span><b>{me.employeeId}</b></div>
        <div className="kv"><span>Pay group</span><b>{me.payGroup}</b></div>
        <div className="kv"><span>Work state</span><b>{me.state}</b></div>
      </section>
      <section className="card accent">
        <div className="eyebrow">Need help with your pay?</div>
        <h2>Strada Pay assistant</h2>
        <p>Check a payment, understand your payslip, update your bank details or open a case. If it needs a person, you'll be handed to a payroll specialist with everything already in front of them.</p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={onChat}>Chat with the assistant</button>
          <button className="btn" disabled={busy} onClick={onCall}>Call Strada Payroll Support</button>
        </div>
      </section>
    </main>
  );
}

// ---------------- chat ----------------
function Chat({ me, s, onDone }: { me: Employee; s: SessionStart; onDone: () => void }) {
  const cid = s.conversation.id;
  const feed = useSessionFeed(cid, { conversation: s.conversation });
  const [text, setText] = useState(""); const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [feed.lines.length, thinking]);
  const state = feed.conversation?.state ?? "Assistant";
  const send = async () => {
    const t = text.trim(); if (!t) return; setText("");
    if (state === "Assistant") setThinking(true);
    try { await api.message(cid, t); } catch (e: any) { feed.addLocal({ id: Date.now(), conversationId: cid, who: "System", text: `Could not send: ${e.message}`, at: "" }); }
    finally { setThinking(false); }
  };
  const leave = async () => { try { await api.end(cid); } catch {} onDone(); };
  return (
    <main className="card chat">
      <div className="chathd">
        <div><b>Strada Pay assistant</b><div className="muted small">{statusText(state, feed.repName)}</div></div>
        <button className="link" onClick={leave}>{state === "Closed" ? "Back" : "End chat"}</button>
      </div>
      <div className="msgs">
        {feed.lines.map(l => <Bubble key={l.id} l={l} />)}
        {thinking && <div className="bubble agent typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>
      {state !== "Closed" && (
        <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder={state === "Assistant" ? "Type your message" : "Message the representative"} autoFocus />
          <button className="btn primary" type="submit" disabled={!text.trim()}>Send</button>
        </form>
      )}
    </main>
  );
}

// ---------------- voice ----------------
function Call({ me, s, onDone }: { me: Employee; s: SessionStart; onDone: () => void }) {
  const cid = s.conversation.id;
  const [phase, setPhase] = useState<"idle" | "assistant" | "transferring" | "holding" | "representative" | "ended">("idle");
  const [captions, setCaptions] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const transferred = useRef(false); const endTimer = useRef<any>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // representative audio (ElevenLabs TTS from the runtime; browser voice if TTS is not configured)
  const feed = useSessionFeed(cid, { conversation: s.conversation }, a => { queue.current = queue.current.then(() => a.url ? playUrl(a.url) : speakFallback(a.text)); });
  const state = feed.conversation?.state;

  const conv = useConversation({
    clientTools: Object.fromEntries(["verify_identity", "get_payment_status", "explain_payslip", "update_bank_details", "create_case", "transfer_to_representative"].map(name => [name, async (params: any) => {
      const out = await api.tool(cid, name, params);
      if (name === "transfer_to_representative" && out.transferred) { transferred.current = true; setPhase("transferring"); endTimer.current = setTimeout(() => conv.endSession(), 9000); }
      return JSON.stringify(out);
    }])),
    onMessage: (m: any) => {
      const role = m.role ?? (m.source === "ai" ? "agent" : "user");
      api.line(cid, role === "user" ? "user" : "agent", m.message, safeId()).catch(() => {});
      if (role === "agent" && transferred.current) { clearTimeout(endTimer.current); endTimer.current = setTimeout(() => conv.endSession(), 2500 + Math.min(6000, m.message.length * 60)); }
    },
    onConnect: () => setPhase("assistant"),
    onDisconnect: () => { if (!transferred.current) { api.end(cid, "employee hung up").catch(() => {}); setPhase("ended"); } },
    onError: (e: any) => setNote(`Voice error: ${typeof e === "string" ? e : e?.message ?? "unknown"}`),
  });
  const safeId = () => { try { return conv.getId(); } catch { return undefined; } };
  useEffect(() => {
    if (!state) return;
    if ((state === "Open" || state === "Active") && phase === "assistant" && !transferred.current) {   // taken over from the workspace
      transferred.current = true; clearTimeout(endTimer.current); try { conv.endSession(); } catch {}
    }
    if (state === "Open" && (phase === "transferring" || phase === "assistant")) setPhase("holding");
    if (state === "Active") setPhase("representative");
    if (state === "Wrap-up" || state === "Closed") setPhase("ended");
  }, [state, phase]);   // eslint-disable-line

  const dial = async () => {
    setNote(null);
    if (!s.voice?.configured) { setNote("The voice agent isn't configured yet — run scripts/elevenlabs_agent.py and restart the runtime. You can still try the chat."); return; }
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setNote("Microphone permission is needed for a call."); return; }
    const dyn = { employee_name: me.name, employer: me.accountName, pay_group: me.payGroup, work_state: me.state, today: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), conversation_id: cid };
    if (s.voice.signedUrl) conv.startSession({ signedUrl: s.voice.signedUrl, connectionType: "websocket", dynamicVariables: dyn } as any);
    else conv.startSession({ agentId: s.voice.agentId!, connectionType: "websocket", dynamicVariables: dyn } as any);
  };
  const hangUp = async () => {
    try { conv.endSession(); } catch {}
    try { await api.end(cid, "employee hung up"); } catch {}
    setPhase("ended");
  };
  const ptt = usePushToTalk(cid, s.capabilities.stt, () => {});
  useEffect(() => () => { try { conv.endSession(); } catch {} }, []);   // eslint-disable-line

  const status = {
    idle: "Ready to call", assistant: conv.isSpeaking ? "Assistant speaking…" : "Listening…", transferring: "Transferring you with context…",
    holding: "On hold — waiting for a payroll specialist", representative: `Connected with ${feed.repName}`, ended: "Call ended",
  }[phase];
  return (
    <main className="card call">
      <div className="chathd">
        <div><b>Strada Payroll Support</b><div className="muted small">{status}</div></div>
        <label className="small"><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} /> Captions</label>
      </div>
      <div className={"orb " + phase + (conv.isSpeaking ? " speaking" : "") + (ptt.talking ? " talking" : "")} />
      {note && <div className="note">{note}</div>}
      {captions && <div className="captions">{feed.lines.slice(-6).map(l => <div key={l.id} className={"cap " + who(l.who)}><span>{l.who}</span>{l.text}</div>)}</div>}
      <div className="row center">
        {phase === "idle" && <button className="btn primary big" onClick={dial}>Call</button>}
        {phase === "assistant" && <button className="btn" onClick={() => conv.setMuted(!conv.isMuted)}>{conv.isMuted ? "Unmute" : "Mute"}</button>}
        {phase === "representative" && (
          <button className={"btn big " + (ptt.talking ? "danger" : "primary")} onMouseDown={ptt.start} onMouseUp={ptt.stop} onMouseLeave={ptt.talking ? ptt.stop : undefined} onTouchStart={ptt.start} onTouchEnd={ptt.stop}>
            {ptt.talking ? "Release to send" : "Hold to talk"}
          </button>
        )}
        {phase !== "idle" && phase !== "ended" && <button className="btn danger" onClick={hangUp}>End call</button>}
        {phase === "ended" && <button className="btn" onClick={onDone}>Back</button>}
      </div>
      {phase === "representative" && !s.capabilities.stt && <div className="muted small center">Speech-to-text isn't configured; your browser's speech recognition is used instead.</div>}
    </main>
  );
}

const KIND: Record<string, string> = { ach_return: "Your deposit was returned", timesheet_reminder: "Timesheets need approval", status_update: "Update on your case", payslip_ready: "Your payslip is ready", w2_ready: "Your W-2 is ready" };

// ---------------- bits ----------------
function Bubble({ l }: { l: Line }) {
  const w = who(l.who);
  if (w === "system") return <div className="sys">{l.text}</div>;
  return <div className={"bubble " + w}><div className="from">{l.who === "Customer" ? "You" : l.who}</div>{l.text.split("\n").map((t, i) => <p key={i}>{t}</p>)}</div>;
}
function who(w: string): "me" | "agent" | "rep" | "system" { return w === "Customer" ? "me" : w === "System" ? "system" : w === "Representative" ? "rep" : "agent"; }
function initials(n: string) { return n.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase(); }
function statusText(state: string, rep: string) {
  return { Assistant: "Online · verified answers from your payroll records", Open: "Transferred · waiting for a payroll specialist", Active: `Connected with ${rep}`, "Wrap-up": "The representative is wrapping up", Closed: "Conversation closed" }[state] ?? state;
}

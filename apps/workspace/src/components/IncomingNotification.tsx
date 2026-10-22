import React, { useEffect, useState } from "react";
import { Button } from "@fluentui/react-components";
import { Call20Filled, Chat20Filled } from "@fluentui/react-icons";
import { useStore, type Conversation } from "../store";
import { api } from "../api";
import { accounts, contacts, queues } from "../data";
import { mmss } from "./Form";

/** Incoming work-item notification: shown bottom-right while a conversation is Open (in queue), on any screen. */
export default function IncomingNotification() {
  const { state, dispatch } = useStore();
  const [rejected, setRejected] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const open = state.conversations.filter(c => c.state === "Open" && !(rejected[c.id] && rejected[c.id] > now)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 3);
  if (!open.length) return null;
  return <div className="incoming-stack">{open.map(c => <Card key={c.id} c={c} now={now} onReject={() => setRejected({ ...rejected, [c.id]: Date.now() + 5000 })} />)}</div>;
}

function Card({ c, now, onReject }: { c: Conversation; now: number; onReject: () => void }) {
  const { dispatch } = useStore();
  const cust = contacts.find(x => x.id === c.customerId);
  const acct = accounts.find(a => a.id === cust?.accountId);
  const q = queues.find(x => x.id === c.queueId);
  const wait = Math.floor((now - c.startedAt.getTime()) / 1000);
  const accept = async () => {
    try {
      await api.conv.accept(c.id);
      const lines = await api.conv.lines(c.id);
      dispatch({ type: "setTranscript", conversationId: c.id, lines });
      dispatch({ type: "openConversation", conversationId: c.id, title: cust?.name ?? "Conversation" });
      dispatch({ type: "setPane", pane: "copilot" });
    } catch (e: any) { dispatch({ type: "toast", text: e.message }); }
  };
  return (
    <div className="incoming" style={{ position: "static" }}>
      <div className="ih">{c.channel === "voice" ? <Call20Filled /> : <Chat20Filled />}<span>{c.channel === "voice" ? "Incoming call" : "Incoming chat"}</span><span className="timer">{mmss(wait)}</span></div>
      <div className="name">{cust?.name ?? "Unknown customer"}</div>
      <div className="l">{acct?.name}</div>
      <div className="l">{q?.name ?? "Pay Distribution"}</div>
      <div className="l">Transferred by: {c.transferredBy ?? "Copilot voice agent"}{c.transferReason ? ` · ${c.transferReason}` : ""}</div>
      {c.caseId && <div className="l">Case already created by the assistant</div>}
      <div className="btns">
        <Button appearance="primary" onClick={accept}>Accept</Button>
        <Button onClick={onReject}>Reject</Button>
      </div>
    </div>
  );
}

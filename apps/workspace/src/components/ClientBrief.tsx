import React, { useState } from "react";
import { Button } from "@fluentui/react-components";
import { Sparkle20Filled, Copy16Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { api } from "../api";
import { fmtDateTime } from "../util";

/** The Client Insight Agent's period brief for one account. */
export default function ClientBrief({ accountId, title = true }: { accountId: string; title?: boolean }) {
  const { state, dispatch } = useStore();
  const ins = state.insights.find(i => i.accountId === accountId);
  const [busy, setBusy] = useState(false);
  const gen = async () => { setBusy(true); try { await api.insight(accountId); dispatch({ type: "toast", text: "Client brief written", kind: "success" }); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setBusy(false); } };
  const b = ins?.brief;
  return (
    <div className="sec">
      {title && <h3>Client brief</h3>}
      <div className="nba">
        <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Client Insight Agent {b && <span className="pill">{b.period.since} → {b.period.until}</span>}<span className="sp" /><Button size="small" appearance={b ? "secondary" : "primary"} disabled={busy} onClick={gen}>{busy ? "Writing…" : b ? "Refresh brief" : "Write the brief"}</Button></div>
        {b ? <>
          <div className="act">{b.headline}</div>
          <div className="cdgrid" style={{ marginTop: 8 }}>
            <span>Contacts</span><b>{b.stats.cases} cases · {b.stats.open} open · {b.stats.resolved} resolved</b>
            <span>Prevented</span><b>{b.prevented}</b>
            <span>Drivers</span><b>{b.drivers.map(d => `${d.intent} (${d.count})`).join(" · ")}</b>
            {b.incidents?.length ? <><span>Incidents</span><b>{b.incidents.map(i => `${i.number}: ${i.root_cause}`).join(" · ")}</b></> : null}
            {b.stats.day7 && (b.stats.day7.settled || b.stats.day7.reopened) ? <><span>Day-7</span><b>{b.stats.day7.settled} settled · {b.stats.day7.reopened} reopened</b></> : null}
          </div>
          {b.open_items.length ? <><div className="why" style={{ marginTop: 8 }}><b>Still open</b></div><ul className="plan" style={{ listStyle: "disc" }}>{b.open_items.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
          <div className="why" style={{ marginTop: 8 }}><b>Recommendations</b></div>
          <ol className="plan">{b.recommendations.map((r, i) => <li key={i}><b>{r.action}</b> — {r.why} <span style={{ color: "#424242" }}>(removes: {r.removes})</span></li>)}</ol>
          <div className="reply"><div className="rl">Message to the payroll lead</div><div className="rt">{b.client_message}</div><Button size="small" icon={<Copy16Regular />} onClick={() => { navigator.clipboard?.writeText(b.client_message); dispatch({ type: "toast", text: "Copied" }); }}>Copy</Button></div>
          <div className="meta">Written {fmtDateTime(new Date(b.at))}</div>
        </> : <div className="why">No brief for this period yet. The agent reads the account's cases, alerts, incidents and conversations and writes the lead's brief with recommendations.</div>}
      </div>
    </div>
  );
}

export function IntentsPanel() {
  const { state, dispatch } = useStore();
  const r = state.intents;
  const [busy, setBusy] = useState(false);
  const gen = async () => { setBusy(true); try { await api.discoverIntents(); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setBusy(false); } };
  return (
    <div className="card grid">
      <div className="hd"><span className="t">Customer intents <span className="mini">· Customer Intent Agent</span></span><Button size="small" appearance={r ? "secondary" : "primary"} disabled={busy} onClick={gen}>{busy ? "Discovering…" : r ? "Refresh" : "Discover intents"}</Button></div>
      {r ? <>
        <div style={{ padding: "4px 12px 8px", fontSize: 14 }}>{r.summary}</div>
        <table className="dg">
          <thead><tr><th>Intent</th><th>Contacts</th><th>Trend</th><th>Script</th><th>Article</th><th>Example</th></tr></thead>
          <tbody>{r.intents.map((i, k) => <tr key={k}><td>{i.intent}{i.proposed ? <span className="pill amber" style={{ marginLeft: 6 }}>Proposed</span> : null}</td><td>{i.count}</td><td>{i.trend}</td><td>{i.has_script ? "✓" : <span style={{ color: "#c4314b" }}>missing</span>}</td><td>{i.has_article ? "✓" : <span style={{ color: "#c4314b" }}>missing</span>}</td><td style={{ maxWidth: 420, whiteSpace: "normal" }}>{i.example}</td></tr>)}</tbody>
        </table>
        {r.gaps.length ? <div style={{ padding: "8px 12px", fontSize: 13 }}><b>Gaps:</b> {r.gaps.join(" · ")}</div> : null}
      </> : <div style={{ padding: 20, color: "#424242" }}>Not run yet for this period.</div>}
    </div>
  );
}

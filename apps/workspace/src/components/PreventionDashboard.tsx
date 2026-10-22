import React, { useMemo } from "react";
import { Checkbox } from "@fluentui/react-components";
import { ArrowClockwise20Regular, MoreVertical20Regular, ChevronDown16Regular, Sparkle20Filled } from "@fluentui/react-icons";
import { useStore } from "../store";
import { accounts, contacts, queues } from "../data";
import { fmtDateTime, fmtTime, isToday } from "../util";
import { IntentsPanel } from "./ClientBrief";

/** Payroll Prevention Dashboard — what the event-driven agents did before anyone called:
 *  Sentinel alerts, incidents with their root cause, and Day-7 verifications. */
export default function PreventionDashboard() {
  const { state, dispatch } = useStore();
  const alerts = state.alerts;
  const proactive = state.cases.filter(c => c.createdBy === "Pay Event Sentinel");
  const incidents = state.cases.filter(c => c.incident).sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());
  const verified = state.cases.filter(c => c.verification || c.remedy).sort((a, b) => (b.verifiedAt ?? b.modifiedOn).getTime() - (a.verifiedAt ?? a.modifiedOn).getTime());
  const kpi = useMemo(() => ({
    alerts: alerts.filter(a => isToday(a.sentAt)).length,
    proactive: proactive.filter(c => c.status !== "Resolved").length,
    incidents: incidents.filter(c => c.status !== "Resolved").length,
    settled: verified.filter(c => c.verification?.outcome === "settled").length,
    reopened: verified.filter(c => c.verification?.outcome === "reopened").length,
  }), [alerts, proactive, incidents, verified]);
  const name = (id?: string | null) => contacts.find(c => c.id === id)?.name ?? "—";
  const acct = (id?: string | null) => accounts.find(a => a.id === id)?.name ?? "—";
  const open = (caseId?: string | null) => caseId && dispatch({ type: "openCase", caseId });
  const caseNo = (id?: string | null) => state.cases.find(c => c.id === id)?.number;

  return (
    <div className="scroll">
      <div className="kpis">
        <Kpi label="Employees told before they called" value={kpi.alerts} sub="alerts today" />
        <Kpi label="Cases opened proactively" value={kpi.proactive} sub="open now" />
        <Kpi label="Incidents" value={kpi.incidents} sub="open, root cause identified" />
        <Kpi label="Day-7 verified" value={kpi.settled} sub={`${kpi.reopened} reopened`} />
      </div>

      <div className="card grid">
        <div className="hd"><span className="t">Pay events handled <ChevronDown16Regular /></span><button className="cmd" onClick={() => api_refresh(dispatch)}><ArrowClockwise20Regular /> Refresh</button><button className="cmd"><MoreVertical20Regular /></button></div>
        <table className="dg">
          <thead><tr><th style={{ width: 36 }}><Checkbox /></th><th>Sent</th><th>To</th><th>Account</th><th>Event</th><th>Message</th><th>Case</th><th>By</th></tr></thead>
          <tbody>
            {alerts.slice(0, 25).map(a => (
              <tr key={a.id}>
                <td><Checkbox /></td>
                <td>{isToday(a.sentAt) ? fmtTime(a.sentAt) : fmtDateTime(a.sentAt)}</td>
                <td>{name(a.contactId)}</td>
                <td>{acct(a.accountId)}</td>
                <td>{KIND[a.kind] ?? a.kind}<div className="mini">{a.channel}</div></td>
                <td style={{ maxWidth: 520, whiteSpace: "normal" }}>{a.message}</td>
                <td>{a.relatedCaseId ? <a onClick={() => open(a.relatedCaseId)}>{caseNo(a.relatedCaseId) ?? "open"}</a> : "—"}</td>
                <td><span className="agentchip"><Sparkle20Filled /> {a.agent ?? "—"}</span></td>
              </tr>
            ))}
            {!alerts.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "#616161" }}>No pay events yet.</td></tr>}
          </tbody>
        </table>
        <div className="pg"><span>Rows: 1 - {Math.min(alerts.length, 25)} of {alerts.length}</span></div>
      </div>

      <div className="card grid">
        <div className="hd"><span className="t">Incidents <ChevronDown16Regular /></span><button className="cmd"><MoreVertical20Regular /></button></div>
        <table className="dg">
          <thead><tr><th style={{ width: 36 }}><Checkbox /></th><th>Incident</th><th>Account · pay group</th><th>Cases</th><th>Likely cause</th><th>Confidence</th><th>Client notified</th><th>Status</th></tr></thead>
          <tbody>
            {incidents.map(c => (
              <tr key={c.id}>
                <td><Checkbox /></td>
                <td><a onClick={() => open(c.id)}>{c.number}</a><div className="mini">{c.title}</div></td>
                <td>{acct(c.accountId)} · {c.incident!.pay_group}</td>
                <td>{c.incident!.affected.length}</td>
                <td style={{ maxWidth: 480, whiteSpace: "normal" }}>{c.incident!.root_cause}</td>
                <td><span className={"pill " + (c.incident!.confidence === "High" ? "green" : c.incident!.confidence === "Medium" ? "amber" : "red")}>{c.incident!.confidence}</span></td>
                <td>{c.incident!.client_notified_at ? `${name(c.customerId)} · ${fmtTime(new Date(c.incident!.client_notified_at))}` : "—"}</td>
                <td>{c.status}</td>
              </tr>
            ))}
            {!incidents.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "#616161" }}>No incidents.</td></tr>}
          </tbody>
        </table>
        <div className="pg"><span>Rows: 1 - {incidents.length} of {incidents.length}</span></div>
      </div>

      <div className="card grid">
        <div className="hd"><span className="t">Client briefs <span className="mini">· Client Insight Agent</span></span></div>
        <table className="dg">
          <thead><tr><th>Account</th><th>Headline</th><th>Top recommendation</th><th>Written</th><th></th></tr></thead>
          <tbody>
            {accounts.map(a => { const ins = state.insights.find(i => i.accountId === a.id); return (
              <tr key={a.id}>
                <td><a onClick={() => dispatch({ type: "openTab", tab: { id: "ac-" + a.id, kind: "account", accountId: a.id } })}>{a.name}</a></td>
                <td style={{ maxWidth: 480, whiteSpace: "normal" }}>{ins?.brief.headline ?? "—"}</td>
                <td style={{ maxWidth: 420, whiteSpace: "normal" }}>{ins?.brief.recommendations[0]?.action ?? "—"}</td>
                <td>{ins ? fmtDateTime(new Date(ins.brief.at)) : "—"}</td>
                <td><a onClick={() => api_brief(dispatch, a.id)}>{ins ? "Refresh" : "Write"}</a></td>
              </tr>); })}
          </tbody>
        </table>
      </div>

      <IntentsPanel />

      <div className="card grid">
        <div className="hd"><span className="t">Day-7 verifications <ChevronDown16Regular /></span><button className="cmd"><MoreVertical20Regular /></button></div>
        <table className="dg">
          <thead><tr><th style={{ width: 36 }}><Checkbox /></th><th>Case</th><th>Customer</th><th>Remedy</th><th>Expected settlement</th><th>Outcome</th><th>Detail</th><th>Queue</th></tr></thead>
          <tbody>
            {verified.map(c => (
              <tr key={c.id}>
                <td><Checkbox /></td>
                <td><a onClick={() => open(c.id)}>{c.number}</a></td>
                <td>{name(c.customerId)}</td>
                <td>{c.remedy?.type?.replace("_", " ") ?? "—"}{c.remedy?.reference ? <div className="mini">{c.remedy.reference}</div> : null}</td>
                <td>{c.remedy?.expected_settlement ?? "—"}</td>
                <td>{c.verification ? <span className={"pill " + (c.verification.outcome === "settled" ? "green" : c.verification.outcome === "on_track" ? "blue" : "red")}>{OUTCOME[c.verification.outcome]}</span> : <span className="pill">Scheduled</span>}</td>
                <td style={{ maxWidth: 460, whiteSpace: "normal" }}>{c.verification?.detail ?? "Check runs 7 days after resolution."}</td>
                <td>{queues.find(q => q.id === c.queueId)?.name}</td>
              </tr>
            ))}
            {!verified.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "#616161" }}>No resolved bank-return cases awaiting verification.</td></tr>}
          </tbody>
        </table>
        <div className="pg"><span>Rows: 1 - {verified.length} of {verified.length}</span></div>
      </div>
    </div>
  );
}

const KIND: Record<string, string> = { ach_return: "Bank return", timesheet_reminder: "Timesheet cut-off", status_update: "Status update", payslip_ready: "Payslip ready", w2_ready: "W-2 ready", address_check: "Address check" };
const OUTCOME: Record<string, string> = { settled: "Settled", on_track: "On track", reopened: "Reopened" };

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return <div className="card kpi"><div className="v">{value}</div><div className="l">{label}</div><div className="s">{sub}</div></div>;
}
async function api_brief(dispatch: any, accountId: string) {
  const { api } = await import("../api");
  dispatch({ type: "toast", text: "Client Insight Agent is writing the brief…" });
  api.insight(accountId).catch((e: any) => dispatch({ type: "toast", text: e.message }));
}
async function api_refresh(dispatch: any) {
  const { api } = await import("../api");
  const rows = await api.alerts(); for (const a of rows) dispatch({ type: "upsertAlert", a });
}

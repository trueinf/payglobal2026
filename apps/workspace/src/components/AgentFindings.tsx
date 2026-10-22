import React, { useState } from "react";
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Input, Textarea, Tooltip } from "@fluentui/react-components";
import { Sparkle20Filled, Checkmark16Regular, Dismiss16Regular, ArrowClockwise16Regular, Send16Regular } from "@fluentui/react-icons";
import { useStore, type Referral } from "../store";
import { api } from "../api";
import type { Case } from "../model";
import { fmtDateTime, fmtTime } from "../util";

const LABELS: Record<string, string> = { reissue: "Re-issue payment", live_check: "Live check", correction: "Pay correction", off_cycle: "Off-cycle payment", w2c: "W-2c (corrected W-2)", garnishment_dispute: "Garnishment dispute" };
const ITEM: Record<string, string> = { pay_date: "Pay date", amount: "Amount", return_code: "Return code", bank_corrected: "Bank details corrected by the employee", delivery_site: "Delivery address", reason: "Reason", client_approval: "Client approval", year: "Tax year", box: "W-2 box", order_ref: "Order reference", deduction_history: "Deduction history", employee_statement: "Employee statement" };

/** What the case-side agents found: variance explanation, state & tax rules, and the Strada Assist referral package. */
export default function AgentFindings({ c }: { c: Case }) {
  const { state, dispatch } = useStore();
  const v = c.findings?.variance; const r = c.findings?.rules;
  const refs = state.referrals.filter(x => x.caseId === c.id);
  const [busy, setBusy] = useState<string | null>(null);
  const rerun = async (agent: "variance" | "rules") => { setBusy(agent); try { await api.caseAgent(c.id, agent); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setBusy(null); } };
  const useReply = (text: string) => {
    const inbound = state.activities.filter(a => a.caseId === c.id && a.type === "email" && a.direction === "in").sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (inbound) { dispatch({ type: "setDraft", draft: { activityId: inbound.id, text } }); dispatch({ type: "openTab", tab: { id: "em-" + inbound.id, kind: "email", activityId: inbound.id } }); }
    else { navigator.clipboard?.writeText(text); dispatch({ type: "toast", text: "Reply copied — no inbound email on this case to reply to" }); }
  };
  if (!v && !r && !refs.length) return null;
  return (
    <>
      {v && (
        <div className="sec">
          <h3>Payslip comparison</h3>
          <div className={"nba" + (v.needs_correction ? " alert" : "")}>
            <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Payslip Variance Explainer <span className={"pill " + (v.needs_correction ? "red" : "green")}>{v.needs_correction ? "Correction needed" : "All changes expected"}</span><span className="pill">{v.previous_pay_date} → {v.pay_date}</span><span className="sp" />
              <Tooltip content="Re-run" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }} disabled={busy === "variance"} onClick={() => rerun("variance")}><ArrowClockwise16Regular /></button></Tooltip></div>
            <div className="act">{v.headline}</div>
            <table className="vt">
              <thead><tr><th>Line</th><th>Change</th><th>Cause</th><th></th></tr></thead>
              <tbody>{v.differences.map((d, i) => <tr key={i}><td>{d.line}</td><td style={{ whiteSpace: "nowrap" }}>{d.change}</td><td>{d.cause}</td><td>{d.expected ? <span className="pill green">Expected</span> : <span className="pill red">Check</span>}</td></tr>)}</tbody>
            </table>
            <div className="why" style={{ marginTop: 8 }}><b>Net:</b> ${v.previous_net.toFixed(2)} → ${v.net.toFixed(2)} ({v.net_change >= 0 ? "+" : ""}${v.net_change.toFixed(2)}) · <b>For you:</b> {v.representative_note}</div>
            <div className="reply"><div className="rl">Reply to the employee</div><div className="rt">{v.employee_explanation}</div><Button size="small" appearance="primary" onClick={() => useReply(v.employee_explanation)}>Use this reply</Button></div>
            <div className="meta">Evaluated {fmtDateTime(new Date(v.at))}</div>
          </div>
        </div>
      )}
      {r && (
        <div className="sec">
          <h3>State &amp; tax rules</h3>
          <div className="nba">
            <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> State &amp; Tax Rules Agent {r.states.map(s => <span key={s} className="pill">{s}</span>)}{r.deadline ? <span className="pill amber">Deadline {r.deadline}</span> : null}<span className="sp" />
              <Tooltip content="Re-run" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }} disabled={busy === "rules"} onClick={() => rerun("rules")}><ArrowClockwise16Regular /></button></Tooltip></div>
            <div className="act">{r.determination}</div>
            <ul className="plan" style={{ listStyle: "disc" }}>{r.rules_applied.map((x, i) => <li key={i}><b>{x.state}:</b> {x.rule} — {x.applies}</li>)}</ul>
            {r.county_tax && <div className="why"><b>County / municipal tax:</b> {r.county_tax}</div>}
            {r.forms_required?.length ? <div className="why"><b>Forms:</b> {r.forms_required.join(", ")}</div> : null}
            <div className="why" style={{ marginTop: 6 }}><b>Actions</b></div>
            <ul className="plan" style={{ listStyle: "none", paddingLeft: 0 }}>{r.actions.map((a, i) => <li key={i}><span className="pill">{a.who}</span> {a.action}</li>)}</ul>
            <div className="reply"><div className="rl">Reply</div><div className="rt">{r.employee_explanation}</div><Button size="small" appearance="primary" onClick={() => useReply(r.employee_explanation)}>Use this reply</Button></div>
            <div className="meta">Evaluated {fmtDateTime(new Date(r.at))}</div>
          </div>
        </div>
      )}
      {refs.map(ref => <ReferralCard key={ref.id} c={c} ref_={ref} />)}
    </>
  );
}

function ReferralCard({ c, ref_ }: { c: Case; ref_: Referral }) {
  const { dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [fill, setFill] = useState<Record<string, string>>({});
  const missing = ref_.checklist.filter(x => !x.satisfied);
  const submitted = ref_.status === "submitted";
  const go = async (submit: boolean) => {
    setBusy(true);
    try { await api.refer(c.id, ref_.requestType, fill, submit); setFill({}); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="sec">
      <h3>Referral to Strada Assist</h3>
      <div className={"nba" + (missing.length && !submitted ? " alert" : "")}>
        <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Complete-Case Referral Agent <span className="pill">{LABELS[ref_.requestType] ?? ref_.requestType}</span>
          <span className={"pill " + (submitted ? "green" : missing.length ? "red" : "blue")}>{submitted ? `Submitted · ${ref_.stradaReference}` : missing.length ? `${missing.length} item${missing.length > 1 ? "s" : ""} missing` : "Complete — ready to submit"}</span></div>
        <table className="vt">
          <tbody>{ref_.checklist.map(x => (
            <tr key={x.item}>
              <td style={{ width: 24 }}>{x.satisfied ? <Checkmark16Regular style={{ color: "#107c10" }} /> : <Dismiss16Regular style={{ color: "#c4314b" }} />}</td>
              <td>{ITEM[x.item] ?? x.item}</td>
              <td style={{ color: "#424242" }}>{x.satisfied ? <>{typeof x.value === "string" || typeof x.value === "number" ? String(x.value) : Array.isArray(x.value) ? `${x.value.length} entries` : "provided"} <span className="mini">· {x.source}</span></> : x.who === "representative" && !submitted
                ? (x.item === "employee_statement" || x.item === "reason" ? <Textarea size="small" rows={2} value={fill[x.item] ?? ""} onChange={(_, v) => setFill({ ...fill, [x.item]: v.value })} placeholder={`Enter the ${(ITEM[x.item] ?? x.item).toLowerCase()}`} style={{ width: "100%" }} /> : <Input size="small" value={fill[x.item] ?? ""} onChange={(_, v) => setFill({ ...fill, [x.item]: v.value })} placeholder={`Enter the ${(ITEM[x.item] ?? x.item).toLowerCase()}`} />)
                : <span style={{ color: "#c4314b" }}>Needs the {x.who}{x.item === "bank_corrected" ? " — they update it in Strada Pay; the agent re-checks" : ""}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!submitted && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button size="small" icon={<ArrowClockwise16Regular />} disabled={busy} onClick={() => go(false)}>Re-check</Button>
            <Button size="small" appearance="primary" icon={<Send16Regular />} disabled={busy || (missing.some(x => x.who !== "representative" || !(fill[x.item] ?? "").trim()))} onClick={() => go(true)}>Submit to Strada Assist</Button>
          </div>
        )}
        <div className="meta">{submitted ? `Submitted ${fmtTime(ref_.updatedAt)}${ref_.expectedBy ? ` · expected by ${ref_.expectedBy}` : ""}` : `Checked ${fmtTime(ref_.updatedAt)} · the referral is only sent when every item Strada Assist requires is in the package`}</div>
      </div>
    </div>
  );
}

export function ReferDialog({ c, onClose }: { c: Case; onClose: () => void }) {
  const { dispatch } = useStore();
  const [type, setType] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await api.refer(c.id, type || undefined, {}, false); onClose(); } catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface><DialogBody>
        <DialogTitle>Refer to Strada Assist</DialogTitle>
        <DialogContent>
          <div style={{ fontSize: 14, marginBottom: 8 }}>The Complete-Case Referral Agent collects the evidence Strada Assist requires for the request type and shows what is still missing before anything is sent.</div>
          <select value={type} onChange={e => setType(e.target.value)} style={{ width: "100%", padding: 6, font: "inherit" }}>
            <option value="">Let the agent pick from the case</option>
            {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Cancel</Button><Button appearance="primary" disabled={busy} onClick={go}>{busy ? "Preparing…" : "Prepare referral"}</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

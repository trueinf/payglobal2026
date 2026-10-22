import React, { useState } from "react";
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Dropdown, Option, Textarea, Input, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Tooltip } from "@fluentui/react-components";
import { ArrowLeft20Regular, Save20Regular, SaveArrowRight20Regular, ArrowRouting20Regular, ArrowClockwise20Regular, Add20Regular, DocumentCheckmark20Regular, MoreVertical20Regular, Share20Regular, ChevronDown16Regular, ChevronDown20Regular, ChevronUp20Regular, FormNew20Regular, Person16Regular, Building16Regular, Dismiss16Regular, Search16Regular, LockClosed16Regular, CalendarLtr16Regular, Sparkle16Filled, Sparkle20Filled, TextBold16Regular, TextItalic16Regular, TextUnderline16Regular, TextBulletListLtr16Regular, Link16Regular, ArrowUp16Regular, ArrowDown16Regular, ArrowRight16Regular, Delete20Regular, PersonArrowRight20Regular, DocumentOnePage20Regular, Attach20Regular, ThumbLike16Regular, ThumbDislike16Regular } from "@fluentui/react-icons";
import { useStore, nextId } from "../store";
import { api } from "../api";
import { accounts, contacts, queues, queueItems } from "../data";
import type { Case, CaseStatus, Priority, CaseType } from "../model";
import { fmtDate, fmtDateTime, fmtTime } from "../util";
import Timeline from "./Timeline";
import Subgrid from "./Subgrid";
import CopilotCard from "./CopilotCard";
import AgentFindings, { ReferDialog } from "./AgentFindings";

type Tab = "Summary" | "Details" | "Attachments" | "Related";

export default function CaseForm({ caseId }: { caseId: string }) {
  const { state, dispatch } = useStore();
  const c = state.cases.find(x => x.id === caseId)!;
  const cust = contacts.find(x => x.id === c.customerId)!;
  const acct = accounts.find(x => x.id === c.accountId)!;
  const [tab, setTab] = useState<Tab>("Summary");
  const [flyout, setFlyout] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [refer, setRefer] = useState(false);
  const runAgent = (agent: "variance" | "rules" | "order") => { dispatch({ type: "toast", text: agent === "variance" ? "Payslip Variance Explainer is reading the payslips…" : agent === "order" ? "Garnishment Order Reader is reading the order…" : "State & Tax Rules Agent is checking the rules…" }); api.caseAgent(c.id, agent).catch(e => dispatch({ type: "toast", text: e.message })); };
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assist, setAssist] = useState(false);
  const wide = state.pane === null;
  const suggestions = !!state.formSuggestions[c.id];

  const patch = (p: Partial<Case>) => { dispatch({ type: "updateCase", caseId: c.id, patch: p }); setDirty(true); };
  const save = (close = false) => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setDirty(false); dispatch({ type: "toast", text: "Case saved", kind: "success" }); if (close) dispatch({ type: "closeSession", id: state.activeSessionId }); }, 500);
  };
  const route = () => {
    const q = queues.find(x => x.id === c.queueId)!;
    api.route(c.id).then(() => dispatch({ type: "toast", text: `Saved and routed to ${q.name}`, kind: "success" })).catch(e => dispatch({ type: "toast", text: e.message }));
    setDirty(false);
  };
  const acceptAll = () => {
    dispatch({ type: "acceptSuggestions", caseId: c.id });
    dispatch({ type: "toast", text: "Suggestions accepted", kind: "success" });
  };
  const runAssist = () => {
    setAssist(true);
    setTimeout(() => {
      setAssist(false);
      const p: Partial<Case> = {};
      if (c.type !== "Problem" && /not|returned|twice|rejected|incident/i.test(c.title)) p.type = "Problem";
      if (!c.escalated && c.priority === "High" && c.parentId === undefined && c.id === "k2") p.escalated = true;
      if (!c.resolveBy) p.resolveBy = new Date(Date.now() + 86400000);
      dispatch({ type: "updateCase", caseId: c.id, patch: { ...p, aiUpdated: true, aiFields: Array.from(new Set([...(c.aiFields ?? []), ...Object.keys(p)])) } });
      dispatch({ type: "toast", text: Object.keys(p).length ? `Form assist filled ${Object.keys(p).length} field${Object.keys(p).length > 1 ? "s" : ""}` : "Form assist: no changes suggested" });
    }, 900);
  };
  const isPred = (f: string) => suggestions && (c.aiFields ?? []).includes(f);

  const overdue = state.activities.filter(a => a.caseId === c.id && (a.status === "Overdue" || ((a.type === "task" || a.type === "appointment") && a.status === "Open" && a.due && a.due < new Date()))).length;
  const dueToday = state.activities.filter(a => a.caseId === c.id && (a.type === "task" || a.type === "appointment") && a.status === "Open" && a.due && fmtDate(a.due) === fmtDate(new Date())).length;

  const children = state.cases.filter(x => x.parentId === c.id);
  const parent = c.parentId ? state.cases.find(x => x.id === c.parentId) : undefined;
  const linked = c.articleIds.map(id => state.articles.find(a => a.id === id)!).filter(Boolean);
  const similar = state.cases.filter(x => x.id !== c.id && x.intent === c.intent && !x.parentId && x.parentId !== c.id).slice(0, 3);
  const qItem = queueItems.find(q => q.caseId === c.id);

  const openContact = () => dispatch({ type: "openTab", tab: { id: "ct-" + cust.id, kind: "contact", contactId: cust.id } });
  const openOwner = () => dispatch({ type: "openTab", tab: { id: "owner", kind: "contact", contactId: "owner" } });
  const resolved = c.status === "Resolved";

  const fields = (
    <div className="sec" style={{ paddingTop: 4 }}>
      <Row label="Case Title" req><Val pred={isPred("title")}><input value={c.title} onChange={e => patch({ title: e.target.value })} style={inp} /></Val></Row>
      <Row label="Customer" req><Val><span className="chip" onClick={openContact}><Person16Regular /> {cust.name} <Dismiss16Regular /></span><span style={{ marginLeft: "auto" }}><Search16Regular /></span></Val></Row>
      <Row label="Subject"><Val pred={isPred("subject")}><input value={c.subject} onChange={e => patch({ subject: e.target.value })} style={inp} /></Val></Row>
      <Row label="Priority"><Val pred={isPred("priority")}><span style={{ width: 10, height: 10, borderRadius: 2, background: c.priority === "High" ? "#c4314b" : c.priority === "Normal" ? "#0f6cbd" : "#8a8a8a" }} /><Sel value={c.priority} options={["High", "Normal", "Low"]} onChange={v => patch({ priority: v as Priority })} /></Val></Row>
      <Row label="Case Status"><Val><span className={"pill" + (resolved ? " green" : "")}>{c.status}</span><span style={{ marginLeft: "auto" }}><Sel value="" options={["In Progress", "On Hold", "Waiting for Details", "Researching"]} onChange={v => patch({ status: v as CaseStatus })} /></span></Val></Row>
      <Row label="Product"><Val pred={isPred("product")}><span className="chip" style={{ textDecoration: "none" }}><Building16Regular /> {c.product} <Dismiss16Regular /></span><span style={{ marginLeft: "auto" }}><Search16Regular /></span></Val></Row>
      <Row label="Description" top>
        <div style={{ border: "1px solid var(--line2)", borderRadius: 4, overflow: "hidden" }} className={isPred("description") ? "pred" : ""}>
          <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid var(--line)", background: "#fafafa" }}>{[TextBold16Regular, TextItalic16Regular, TextUnderline16Regular, TextBulletListLtr16Regular, Link16Regular].map((I, i) => <button key={i} className="iconbtn" style={{ width: 26, height: 26 }}><I /></button>)}</div>
          <Textarea appearance="filled-lighter" resize="vertical" value={c.description} onChange={(_, v) => patch({ description: v.value })} rows={5} style={{ width: "100%", background: isPred("description") ? "#f3f2fb" : undefined }} />
        </div>
      </Row>
    </div>
  );
  const dueCard = (
    <div className="sec">
      <h3>Due and Overdue Activities</h3>
      <div className="fval" style={{ height: 44, justifyContent: "space-between", padding: "0 16px", fontSize: 15 }}><span>Activities</span>{overdue ? <span style={{ color: "var(--red)", textDecoration: "underline" }}>{overdue} overdue</span> : dueToday ? <span>{dueToday} due today</span> : <span>No activities due today</span>}</div>
    </div>
  );
  const summaryCard = <div className="sec"><CopilotCard title="Case summary" text={c.summary} /></div>;
  const incidentCard = c.incident ? (
    <div className="sec">
      <h3>Incident</h3>
      <div className="nba">
        <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Incident Clustering Agent <span className={"pill " + (c.incident.confidence === "High" ? "green" : c.incident.confidence === "Medium" ? "amber" : "red")}>{c.incident.confidence} confidence</span><span className="pill">{c.incident.pay_group} · {c.incident.code}</span></div>
        <div className="act">{c.incident.root_cause}</div>
        {c.incident.action_plan?.length ? <ol className="plan">{c.incident.action_plan.map((a, i) => <li key={i}>{a}</li>)}</ol> : null}
        {c.incident.employee_action && <div className="why">Employees: {c.incident.employee_action}</div>}
        <div className="meta">Linked cases: {c.incident.affected.map(n => { const k = state.cases.find(x => x.number === n); return k ? <a key={n} onClick={() => dispatch({ type: "openCase", caseId: k.id, inSession: "current" })} style={{ marginRight: 8 }}>{n}</a> : <span key={n} style={{ marginRight: 8 }}>{n}</span>; })}{c.incident.client_notified_at ? ` · Client lead notified ${fmtTime(new Date(c.incident.client_notified_at))}` : " · Client lead not yet notified"}</div>
      </div>
    </div>
  ) : c.verification ? (
    <div className="sec">
      <h3>Resolution verification</h3>
      <div className={"nba" + (c.verification.outcome === "reopened" ? " alert" : "")}>
        <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> Day-7 Resolution Verifier <span className={"pill " + (c.verification.outcome === "settled" ? "green" : c.verification.outcome === "on_track" ? "blue" : "red")}>{c.verification.outcome === "on_track" ? "On track" : c.verification.outcome === "settled" ? "Settled" : "Reopened"}</span></div>
        <div className="act">{c.verification.detail}</div>
        <div className="meta">Remedy: {c.remedy?.type?.replace("_", " ") ?? "—"}{c.remedy?.reference ? ` · ${c.remedy.reference}` : ""}{c.remedy?.expected_settlement ? ` · expected ${c.remedy.expected_settlement}` : ""} · checked {fmtDateTime(new Date(c.verification.checked_at))}</div>
      </div>
    </div>
  ) : null;

  return (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="cmdbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <button className="cmd" disabled><ArrowLeft20Regular /></button><span className="sep" />
        <button className="cmd" onClick={() => save()} disabled={resolved}><Save20Regular /> Save</button>
        <button className="cmd" onClick={() => save(true)}><SaveArrowRight20Regular /> Save &amp; Close</button>
        {wide && <>
          <button className="cmd" onClick={route} disabled={resolved}><ArrowRouting20Regular /> Save &amp; Route</button>
          <button className="cmd" onClick={() => dispatch({ type: "toast", text: "Refreshed" })}><ArrowClockwise20Regular /> Refresh</button>
          <button className="cmd"><Add20Regular className="g" /> New</button>
          <button className="cmd" onClick={() => setResolve(true)} disabled={resolved}><DocumentCheckmark20Regular /> Resolve Case</button>
        </>}
        <Menu>
          <MenuTrigger><button className="cmd"><MoreVertical20Regular /></button></MenuTrigger>
          <MenuPopover><MenuList>
            {!wide && <><MenuItem icon={<ArrowRouting20Regular />} onClick={route}>Save &amp; Route</MenuItem><MenuItem icon={<ArrowClockwise20Regular />}>Refresh</MenuItem><MenuItem icon={<Add20Regular />}>New</MenuItem><MenuItem icon={<DocumentCheckmark20Regular />} onClick={() => setResolve(true)} disabled={resolved}>Resolve Case</MenuItem></>}
            <MenuItem icon={<PersonArrowRight20Regular />}>Assign</MenuItem>
            <MenuItem icon={<ArrowRight16Regular />}>Add to Queue</MenuItem>
            <MenuItem icon={<DocumentOnePage20Regular />}>Create Child Case</MenuItem>
            <MenuItem icon={<Sparkle16Filled />} onClick={() => setRefer(true)} disabled={resolved}>Refer to Strada Assist</MenuItem>
            <MenuItem icon={<Sparkle16Filled />} onClick={() => runAgent("variance")} disabled={resolved}>Explain payslip variance</MenuItem>
            <MenuItem icon={<Sparkle16Filled />} onClick={() => runAgent("rules")} disabled={resolved}>Check state &amp; tax rules</MenuItem>
            <MenuItem icon={<Sparkle16Filled />} onClick={() => runAgent("order")} disabled={resolved}>Read garnishment order</MenuItem>
            <MenuItem icon={<Delete20Regular />}>Delete</MenuItem>
          </MenuList></MenuPopover>
        </Menu>
        <span className="spacer" />
        <button className="cmd outline"><Share20Regular /> Share <ChevronDown16Regular /></button>
      </div>

      <div className="formbody">
        {(c.aiCreated || c.aiUpdated) && (
          <div className="aibanner">
            <Sparkle20Filled style={{ color: "var(--copilot)" }} />
            <span>{c.aiCreated ? `${c.createdBy ?? "Case Management Agent"} ${c.createdBy === "Pay Event Sentinel" ? "opened this case from the pay-event feed" : c.createdBy === "Incident Clustering Agent" ? "opened this incident" : "created this case"}` : c.verification?.outcome === "reopened" ? "Day-7 Resolution Verifier reopened this case" : "Case Management Agent updated this case"}{c.aiFields?.length ? ` and filled ${c.aiFields.length} fields` : ""}. <a>View audit history</a></span>
            <span className="sp">
              {suggestions && <Button size="small" appearance="primary" onClick={acceptAll}>Accept suggestions</Button>}
              <Tooltip content="Helpful" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }}><ThumbLike16Regular /></button></Tooltip>
              <Tooltip content="Not helpful" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }}><ThumbDislike16Regular /></button></Tooltip>
            </span>
          </div>
        )}
        <div className="rhead">
          <div className="title"><span>{c.title}</span><span className="st">- {saving ? "Saving" : dirty ? "Unsaved" : "Saved"}</span></div>
          <div className="sub"><b>Case</b> · Case for Multisession experience <ChevronDown16Regular /></div>
          <div className="kv">
            <span className="l">Case Number</span><span className="v">{c.number}</span>
            <span className="l">Origin</span><span className="v">{c.origin}</span>
            <span className="l">Created On</span><span className="v">{fmtDateTime(c.createdOn)}</span>
            <span className="l">Owner</span><span className="v"><a onClick={openOwner}>{c.owner}</a></span>
            <button className="iconbtn chev" onClick={() => setFlyout(!flyout)}>{flyout ? <ChevronUp20Regular /> : <ChevronDown20Regular />}</button>
            {flyout && (
              <div className="flyout">
                <Row label="Case Number"><Val><LockClosed16Regular /> {c.number}</Val></Row>
                <Row label="Origin"><Val><Sel value={c.origin} options={["Email", "Phone", "Web", "Chat"]} onChange={v => patch({ origin: v as any })} /></Val></Row>
                <Row label="Created On"><Val><LockClosed16Regular /> {fmtDate(c.createdOn)} <span style={{ marginLeft: 12 }}>{fmtTime(c.createdOn)}</span></Val></Row>
                <Row label="Owner"><Val><span className="chip"><Person16Regular /> {c.owner} <Dismiss16Regular /></span><span style={{ marginLeft: "auto" }}><Search16Regular /></span></Val></Row>
              </div>
            )}
          </div>
        </div>
        <div className="ftabs">
          {(["Summary", "Details"] as Tab[]).map(t => <span key={t} className={"ftab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</span>)}
          {wide ? <>
            <span className={"ftab" + (tab === "Attachments" ? " active" : "")} onClick={() => setTab("Attachments")}>Attachments</span>
            <Menu><MenuTrigger><span className={"ftab" + (tab === "Related" ? " active" : "")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Related <ChevronDown16Regular /></span></MenuTrigger><MenuPopover><MenuList>{["Activities", "Child Cases", "Knowledge Articles", "Connections", "Audit History"].map(x => <MenuItem key={x} onClick={() => setTab("Related")}>{x}</MenuItem>)}</MenuList></MenuPopover></Menu>
          </> : <Menu><MenuTrigger><span className="ftab">···</span></MenuTrigger><MenuPopover><MenuList><MenuItem onClick={() => setTab("Attachments")}>Attachments</MenuItem><MenuItem onClick={() => setTab("Related")}>Related</MenuItem></MenuList></MenuPopover></Menu>}
          <span className="assist"><Button icon={<FormNew20Regular />} onClick={runAssist} disabled={assist}>{assist ? "Working…" : "Form assist"}</Button></span>
        </div>

        {tab === "Summary" && (wide ? (
          <>
            <div className="cols2" style={{ paddingTop: 4 }}>
              <div>{dueCard}{fields}</div>
              <div>{summaryCard}{incidentCard}</div>
            </div>
            <AgentFindings c={c} />
            <Timeline c={c} />
          </>
        ) : <>{dueCard}{fields}{summaryCard}{incidentCard}<AgentFindings c={c} /><Timeline c={c} /></>)}

        {tab === "Details" && (
          <>
            <div className="sec">
              <h3>Additional Case Details</h3>
              <Row label="Parent Case"><Val>{parent ? <span className="chip" onClick={() => dispatch({ type: "openCase", caseId: parent.id, inSession: "current" })}>{parent.number}</span> : <span>---</span>}<span style={{ marginLeft: "auto" }}><Search16Regular /></span></Val></Row>
              <Row label="Type"><Val pred={isPred("type")}><Sel value={c.type} options={["Problem", "Question", "Request"]} onChange={v => patch({ type: v as CaseType })} /></Val></Row>
              <Row label="Entitlement"><Val><span>{c.entitlement ?? "---"}</span><span style={{ marginLeft: "auto" }}><Search16Regular /></span></Val></Row>
              <Row label="Escalated"><Val pred={isPred("escalated")}><Sel value={c.escalated ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => patch({ escalated: v === "Yes", escalatedOn: v === "Yes" ? new Date() : undefined })} /></Val></Row>
              <Row label="Escalated On" lock><Val>{c.escalatedOn ? fmtDateTime(c.escalatedOn) : ""}</Val></Row>
            </div>
            <div className="sec">
              <h3>Applicable SLA</h3>
              <Row label="First Response Sent"><Val><Sel value={c.firstResponseSent ? "Yes" : "No"} options={["Yes", "No"]} onChange={v => patch({ firstResponseSent: v === "Yes" })} /></Val></Row>
              <Row label="Follow Up By"><Val><DateVal d={c.followUpBy} /></Val></Row>
              <Row label="First Response By"><Val><DateVal d={c.firstResponseBy} /></Val></Row>
              <Row label="Resolve By"><Val><DateVal d={c.resolveBy} /></Val></Row>
            </div>
            <div className="sec">
              <h3>Queue item details</h3>
              <div className="subgrid">{qItem ? <div className="row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}><span>Queue: <a>{queues.find(q => q.id === c.queueId)!.name}</a></span><span>Entered: {fmtDateTime(qItem.enteredQueue)}</span><span>Worked by: {qItem.workedBy || "—"}</span></div> : <div className="empty"><DocumentOnePage20Regular style={{ fontSize: 36 }} /><div>Add the record to a queue to load details</div></div>}</div>
            </div>
            <Subgrid title="Associated Knowledge Articles" columns={["Title", "Article number", "Status"]} rows={linked.map(a => [<a onClick={() => dispatch({ type: "openTab", tab: { id: "ka-" + a.id, kind: "article", articleId: a.id } })}>{a.title}</a>, a.id, a.status])} />
            <Subgrid title="Associated Similar Cases" columns={["Case Title", "Case Number", "Status"]} rows={similar.map(s => [<a onClick={() => dispatch({ type: "openCase", caseId: s.id, inSession: "current" })}>{s.title}</a>, s.number, s.status])} empty="No data available." />
            <Subgrid title="Child Cases" columns={["Case Title", "Customer", "Status"]} rows={children.map(s => [<a onClick={() => dispatch({ type: "openCase", caseId: s.id, inSession: "current" })}>{s.title}</a>, contacts.find(x => x.id === s.customerId)!.name, s.status])} />
            <Subgrid title="Merged Cases" rows={[]} />
          </>
        )}
        {tab === "Attachments" && <Subgrid title="Attachments" columns={["File name", "Size", "Added"]} rows={[]} actions={<button className="cmd"><Attach20Regular /> Upload</button>} empty="No attachments" />}
        {tab === "Related" && <Subgrid title="Related records" columns={["Record", "Type"]} rows={[]} />}
      </div>

      {resolve && <ResolveDialog c={c} onClose={() => setResolve(false)} />}
      {refer && <ReferDialog c={c} onClose={() => setRefer(false)} />}
    </div>
  );
}

const inp: React.CSSProperties = { border: 0, outline: 0, background: "transparent", width: "100%", fontSize: 14, fontFamily: "inherit", color: "inherit" };

function Row({ label, req, lock, top, children }: { label: string; req?: boolean; lock?: boolean; top?: boolean; children: React.ReactNode }) {
  return <div className="frow" style={top ? { alignItems: "start" } : undefined}><span className="l">{label}{req && <span className="req">*</span>}{lock && <LockClosed16Regular />}</span>{children}</div>;
}
function Val({ children, pred }: { children: React.ReactNode; pred?: boolean }) {
  return <div className={"fval" + (pred ? " pred" : "")}>{pred && <Tooltip content="Value suggested by Case Management Agent" relationship="description"><Sparkle16Filled style={{ color: "var(--copilot)" }} /></Tooltip>}{children}</div>;
}
function Sel({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, appearance: "auto", cursor: "pointer" }}>{value === "" && <option value="">Change status…</option>}{options.map(o => <option key={o}>{o}</option>)}</select>;
}
function DateVal({ d }: { d?: Date }) { return <><span style={{ color: d ? "inherit" : "#8a8a8a" }}>{d ? fmtDate(d) : "M/d/yyyy"}</span><span style={{ marginLeft: "auto" }}><CalendarLtr16Regular /></span></>; }

function ResolveDialog({ c, onClose }: { c: Case; onClose: () => void }) {
  const { dispatch, state } = useStore();
  const [type, setType] = useState("Problem Solved");
  const [res, setRes] = useState(c.id === "k8" ? "Duplicate order end-dated; 312.00 refunded on next pay" : c.id === "k1" ? "Live check issued; bank details corrected" : "");
  const [time, setTime] = useState("45");
  const go = () => {
    api.resolve(c.id, res || type, Number(time) || 0).then(() => dispatch({ type: "toast", text: `Case ${c.number} resolved`, kind: "success" })).catch(e => dispatch({ type: "toast", text: e.message }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 520 }}>
        <DialogBody>
          <DialogTitle>Resolve Case</DialogTitle>
          <DialogContent>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div className="mini">Resolution Type</div><Dropdown style={{ width: "100%" }} value={type} selectedOptions={[type]} onOptionSelect={(_, d) => setType(d.optionValue ?? type)}>{["Problem Solved", "Information Provided", "Duplicate"].map(o => <Option key={o} value={o}>{o}</Option>)}</Dropdown></div>
              <div><div className="mini">Resolution</div><Input style={{ width: "100%" }} value={res} onChange={(_, v) => setRes(v.value)} /></div>
              <div><div className="mini">Billable Time (minutes)</div><Input style={{ width: "100%" }} value={time} onChange={(_, v) => setTime(v.value)} /></div>
              <div><div className="mini">Remarks</div><Textarea style={{ width: "100%" }} rows={2} /></div>
            </div>
          </DialogContent>
          <DialogActions><Button onClick={onClose}>Cancel</Button><Button appearance="primary" onClick={go}>Resolve</Button></DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

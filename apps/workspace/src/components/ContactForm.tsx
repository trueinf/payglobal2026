import React from "react";
import { ArrowLeft20Regular, Save20Regular, SaveArrowRight20Regular, MoreVertical20Regular, Share20Regular, ChevronDown16Regular, Add20Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { accounts, contacts } from "../data";
import { fmtDateTime } from "../util";
import ClientBrief from "./ClientBrief";

export default function ContactForm({ contactId, accountId }: { contactId?: string; accountId?: string }) {
  const { state, dispatch } = useStore();
  const isOwner = contactId === "owner";
  const contact = contactId && !isOwner ? contacts.find(c => c.id === contactId) : undefined;
  const account = accountId ? accounts.find(a => a.id === accountId) : contact ? accounts.find(a => a.id === contact.accountId) : undefined;
  const name = isOwner ? "Priya Natarajan" : contact ? contact.name : account!.name;
  const related = state.cases.filter(c => contact ? c.customerId === contact.id : account ? c.accountId === account.id : c.owner === "Priya Natarajan");
  const rows: [string, React.ReactNode][] = isOwner
    ? [["Full Name", "Priya Natarajan"], ["Title", "Payroll Support Specialist, Tier 2"], ["Primary Email", "priya.natarajan@strada.example"], ["Business Unit", "Strada US Payroll Operations"], ["Queues", "Pay Distribution, Ongoing Processing, Tax & Withholding, Garnishments & Deductions"], ["Capacity profile", "Chat 3 · Voice 1 · Email 10"]]
    : contact
      ? [["Full Name", contact.name], ["Employee ID", contact.employeeId], ["Email", contact.email], ["Account", <span className="link" onClick={() => dispatch({ type: "openTab", tab: { id: "ac-" + account!.id, kind: "account", accountId: account!.id } })}>{account!.name}</span>], ["Pay group", contact.payGroup], ["Work state", contact.state], ["Identity verification", "Phone OTP · verified today"]]
      : [["Account Name", account!.name], ["Pay groups", account!.payGroups.join(", ")], ["Primary state", account!.state], ["Payroll lead", contacts.find(c => c.accountId === account!.id && c.payGroup.startsWith("Client"))?.name ?? "—"], ["Knowledge base", account!.name + " KB"], ["Service tier", "Managed payroll – Tier 2 support included"]];
  return (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="cmdbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <button className="cmd" disabled><ArrowLeft20Regular /></button><span className="sep" />
        <button className="cmd"><Save20Regular /> Save</button><button className="cmd"><SaveArrowRight20Regular /> Save &amp; Close</button><button className="cmd"><Add20Regular className="g" /> New</button><button className="cmd"><MoreVertical20Regular /></button>
        <span className="spacer" /><button className="cmd outline"><Share20Regular /> Share <ChevronDown16Regular /></button>
      </div>
      <div className="formbody">
        <div className="rhead">
          <div className="title"><span>{name}</span><span className="st">- Saved</span></div>
          <div className="sub"><b>{isOwner ? "User" : contact ? "Contact" : "Account"}</b> · {isOwner ? "User" : contact ? "Contact" : "Account"} <ChevronDown16Regular /></div>
        </div>
        <div className="ftabs"><span className="ftab active">Summary</span><span className="ftab">Details</span><span className="ftab">Cases</span></div>
        {account && !contact && !isOwner && <ClientBrief accountId={account.id} />}
        <div className="cols2">
          <div className="sec"><h3>{isOwner ? "User Info" : contact ? "Contact Information" : "Account Information"}</h3>
            {rows.map(([l, v]) => <div key={l} className="frow"><span className="l">{l}</span><div className="fval">{v}</div></div>)}
          </div>
          <div className="sec"><h3>{isOwner ? "My cases" : "Recent cases"}</h3>
            <div className="subgrid">
              {related.map(c => <div key={c.id} className="row" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}><a onClick={() => dispatch({ type: "openCase", caseId: c.id, inSession: "current" })}>{c.title}</a><span>{c.number}</span><span>{c.status}</span></div>)}
              {!related.length && <div className="empty">No data available</div>}
              <div className="pg"><span>1 - {related.length} of {related.length}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

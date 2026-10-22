import React, { useState } from "react";
import { Input, Checkbox } from "@fluentui/react-components";
import { ArrowLeft20Regular, Grid20Regular, ChevronDown16Regular, MoreVertical20Regular, Share20Regular, TableSettings20Regular, Filter20Regular, Search20Regular, ArrowSort20Regular, ChevronDoubleLeft20Regular, ChevronLeft20Regular, ChevronRight20Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { avatarColor, initials } from "../util";

export default function CaseListTab() {
  const { state, dispatch } = useStore();
  const [kw, setKw] = useState("");
  const rows = state.cases.filter(c => c.status !== "Resolved" && c.owner === "Priya Natarajan").filter(c => !kw || c.title.toLowerCase().includes(kw.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="card cl" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="cmdbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <button className="cmd" disabled><ArrowLeft20Regular /></button><span className="sep" />
        <button className="cmd"><Grid20Regular /> Show As <ChevronDown16Regular /></button><button className="cmd"><MoreVertical20Regular /></button>
        <span className="spacer" /><button className="cmd outline"><Share20Regular /> Share <ChevronDown16Regular /></button>
      </div>
      <div className="hd"><span className="v">My Active Cases <ChevronDown16Regular /></span><span style={{ flex: 1 }} /><button className="iconbtn"><TableSettings20Regular /></button><button className="iconbtn"><Filter20Regular /></button><Input contentBefore={<Search20Regular />} placeholder="Filter by keyword" value={kw} onChange={(_, v) => setKw(v.value)} style={{ width: 260 }} /></div>
      <div className="sel"><Checkbox label="Select all" /><span style={{ flex: 1 }} /><ArrowSort20Regular /></div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {rows.map(c => (
          <div key={c.id} className="row" onClick={() => dispatch({ type: "openCase", caseId: c.id, inSession: "current" })}>
            <span className="av" style={{ background: avatarColor(c.title) }}>{initials(c.title)}</span>
            <div><div className="t1">{c.title}</div><div className="t2">{c.number}</div><div className="t2">{c.priority}</div></div>
            <span className="sp"><MoreVertical20Regular /></span>
          </div>
        ))}
      </div>
      <div className="subgrid pg" style={{ border: 0, borderTop: "1px solid var(--line)" }}><span>1 - {rows.length} of {rows.length}</span><span className="sp"><ChevronDoubleLeft20Regular /><ChevronLeft20Regular /><span>Page 1</span><ChevronRight20Regular /></span></div>
    </div>
  );
}

import React from "react";
import { Checkbox } from "@fluentui/react-components";
import { MoreVertical20Regular, ArrowSort20Regular, ChevronDoubleLeft20Regular, ChevronLeft20Regular, ChevronRight20Regular, Document24Regular } from "@fluentui/react-icons";

export default function Subgrid({ title, columns, rows, empty = "No data available", actions }: { title: string; columns?: string[]; rows: React.ReactNode[][]; empty?: string; actions?: React.ReactNode }) {
  const cols = columns?.length ?? 1;
  return (
    <div className="sec">
      <h3>{title}</h3>
      <div className="subgrid">
        <div className="hd">{actions}<span className="sp" /><button className="iconbtn"><MoreVertical20Regular /></button></div>
        <div className="hd"><Checkbox label="Select all" /><span className="sp" /><button className="iconbtn"><ArrowSort20Regular /></button></div>
        {columns && rows.length > 0 && <div className="row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, fontWeight: 600 }}>{columns.map(c => <span key={c}>{c}</span>)}</div>}
        {rows.length === 0 ? <div className="empty"><Document24Regular style={{ fontSize: 40 }} /><div>{empty}</div></div> : rows.map((r, i) => <div key={i} className="row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{r.map((cell, j) => <span key={j}>{cell}</span>)}</div>)}
        <div className="pg"><span>{rows.length ? `1 - ${rows.length} of ${rows.length}` : "0 - 0 of 0"}</span><span className="sp"><ChevronDoubleLeft20Regular /><ChevronLeft20Regular /><span>Page 1</span><ChevronRight20Regular /></span></div>
      </div>
    </div>
  );
}

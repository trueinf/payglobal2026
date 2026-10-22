import React from "react";
import { Tooltip } from "@fluentui/react-components";
import { LockClosed16Regular, Sparkle16Filled } from "@fluentui/react-icons";

export const inp: React.CSSProperties = { border: 0, outline: 0, background: "transparent", width: "100%", fontSize: 14, fontFamily: "inherit", color: "inherit" };

export function Row({ label, req, lock, top, children }: { label: string; req?: boolean; lock?: boolean; top?: boolean; children: React.ReactNode }) {
  return <div className="frow" style={top ? { alignItems: "start" } : undefined}><span className="l">{label}{req && <span className="req">*</span>}{lock && <LockClosed16Regular />}</span>{children}</div>;
}
export function Val({ children, pred }: { children: React.ReactNode; pred?: boolean }) {
  return <div className={"fval" + (pred ? " pred" : "")}>{pred && <Tooltip content="Value suggested by Case Management Agent" relationship="description"><Sparkle16Filled style={{ color: "var(--copilot)" }} /></Tooltip>}{children}</div>;
}
export function Sel({ value, options, onChange, placeholder }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, appearance: "auto", cursor: "pointer" }}>{(value === "" || placeholder) && <option value="">{placeholder ?? "---"}</option>}{options.map(o => <option key={o}>{o}</option>)}</select>;
}
export const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60).toString().padStart(2, "0")}:${(Math.max(0, sec) % 60).toString().padStart(2, "0")}`;

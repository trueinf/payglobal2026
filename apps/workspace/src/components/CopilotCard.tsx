import React, { useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import { ChevronUp20Regular, ChevronDown20Regular, Copy16Regular, ArrowClockwise16Regular, ThumbLike16Regular, ThumbDislike16Regular, Sparkle20Filled } from "@fluentui/react-icons";
import { useStore } from "../store";

export default function CopilotCard({ title, text }: { title: string; text: string }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const regen = () => { setBusy(true); setTimeout(() => { setBusy(false); dispatch({ type: "toast", text: "Summary refreshed" }); }, 900); };
  return (
    <div className="cpcard">
      <div className="h"><Sparkle20Filled style={{ color: "var(--copilot)" }} /> {title} <span className="sp" /><button className="iconbtn" onClick={() => setOpen(!open)}>{open ? <ChevronUp20Regular /> : <ChevronDown20Regular />}</button></div>
      {open && (
        <>
          <p style={{ opacity: busy ? .4 : 1 }}>{text}</p>
          <div className="ft">
            <Button size="small" appearance="primary" icon={<Copy16Regular />} onClick={() => { navigator.clipboard?.writeText(text); dispatch({ type: "toast", text: "Copied to clipboard" }); }}>Copy</Button>
            <Tooltip content="Regenerate" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }} onClick={regen}><ArrowClockwise16Regular /></button></Tooltip>
            <Tooltip content="Helpful" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }}><ThumbLike16Regular /></button></Tooltip>
            <Tooltip content="Not helpful" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }}><ThumbDislike16Regular /></button></Tooltip>
            <span style={{ marginLeft: 6 }}>AI-generated content may be incorrect. Make sure it's accurate and appropriate before using it. <span className="link" style={{ color: "#616161" }}>See terms</span></span>
          </div>
        </>
      )}
    </div>
  );
}

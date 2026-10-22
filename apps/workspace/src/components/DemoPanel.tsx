import React, { useEffect, useState } from "react";
import { Button } from "@fluentui/react-components";
import { Dismiss16Regular, Play16Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { api } from "../api";

/** Presenter's panel (Ctrl/Cmd+Shift+D): fires the external feeds the agents react to, and moves the demo clock. Not part of the product UI. */
export default function DemoPanel({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const [list, setList] = useState<{ id: string; label: string }[]>([]);
  const [clock, setClock] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.scenarios().then(d => { setList(d.scenarios); setClock(d.clock.now); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const fire = async (id: string) => {
    setBusy(id);
    try { await api.scenario(id); await load(); dispatch({ type: "toast", text: "Scenario started — watch the agents", kind: "info" }); }
    catch (e: any) { dispatch({ type: "toast", text: e.message }); } finally { setBusy(null); }
  };
  const reset = async () => { setBusy("reset"); try { await api.reset(); await load(); } finally { setBusy(null); } };
  return (
    <div className="demopanel">
      <div className="h"><span>Demo feeds</span><span className="clock">{clock ? new Date(clock).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span><button className="iconbtn" style={{ width: 24, height: 24 }} onClick={onClose}><Dismiss16Regular /></button></div>
      {list.map(s => <button key={s.id} className="scen" disabled={!!busy} onClick={() => fire(s.id)}><Play16Regular /> {s.label}</button>)}
      <div className="ft"><Button size="small" disabled={!!busy} onClick={reset}>Reset the day</Button><span>Ctrl/Cmd+Shift+D hides this</span></div>
    </div>
  );
}

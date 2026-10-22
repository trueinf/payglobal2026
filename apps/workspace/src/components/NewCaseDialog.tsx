import React, { useState } from "react";
import { Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions, Button, Input, Dropdown, Option, Textarea, Label } from "@fluentui/react-components";
import { useStore } from "../store";
import { api } from "../api";
import { contacts, queues } from "../data";
import type { Origin, Priority } from "../model";

export default function NewCaseDialog({ onClose, contactId }: { onClose: () => void; contactId?: string }) {
  const { dispatch } = useStore();
  const [title, setTitle] = useState("");
  const [cust, setCust] = useState(contactId ?? "");
  const [priority, setPriority] = useState<Priority>("Normal");
  const [origin, setOrigin] = useState<Origin>("Phone");
  const [queue, setQueue] = useState("q2");
  const [desc, setDesc] = useState("");
  const ok = title.trim() && cust;
  const save = () => {
    api.createCase({ title: title.trim(), customerId: cust, priority, origin, queueId: queue, description: desc })
      .then(rec => { dispatch({ type: "upsertCase", c: rec } as any); dispatch({ type: "toast", text: `Case ${rec.number} created`, kind: "success" }); dispatch({ type: "openCase", caseId: rec.id }); })
      .catch(e => dispatch({ type: "toast", text: e.message }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 560 }}>
        <DialogBody>
          <DialogTitle>New Case</DialogTitle>
          <DialogContent>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><Label required>Case Title</Label><Input style={{ width: "100%" }} value={title} onChange={(_, v) => setTitle(v.value)} /></div>
              <div><Label required>Customer</Label><Dropdown style={{ width: "100%" }} value={contacts.find(x => x.id === cust)?.name ?? ""} selectedOptions={[cust]} onOptionSelect={(_, d) => setCust(d.optionValue ?? "")}>{contacts.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}</Dropdown></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><Label>Priority</Label><Dropdown style={{ width: "100%" }} value={priority} selectedOptions={[priority]} onOptionSelect={(_, d) => setPriority(d.optionValue as Priority)}>{["High", "Normal", "Low"].map(p => <Option key={p} value={p}>{p}</Option>)}</Dropdown></div>
                <div><Label>Origin</Label><Dropdown style={{ width: "100%" }} value={origin} selectedOptions={[origin]} onOptionSelect={(_, d) => setOrigin(d.optionValue as Origin)}>{["Phone", "Email", "Web", "Chat"].map(p => <Option key={p} value={p}>{p}</Option>)}</Dropdown></div>
              </div>
              <div><Label>Queue</Label><Dropdown style={{ width: "100%" }} value={queues.find(q => q.id === queue)!.name} selectedOptions={[queue]} onOptionSelect={(_, d) => setQueue(d.optionValue ?? "q2")}>{queues.map(q => <Option key={q.id} value={q.id}>{q.name}</Option>)}</Dropdown></div>
              <div><Label>Description</Label><Textarea style={{ width: "100%" }} rows={3} value={desc} onChange={(_, v) => setDesc(v.value)} /></div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" disabled={!ok} onClick={save}>Save</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

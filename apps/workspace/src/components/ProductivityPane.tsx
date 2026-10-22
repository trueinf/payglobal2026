import React, { useMemo, useState } from "react";
import { Button, Input, Textarea, Dropdown, Option, Tooltip } from "@fluentui/react-components";
import { Sparkle20Filled, Sparkle48Filled, Checkmark16Regular, Info16Regular, Send20Regular, Copy16Regular, ThumbLike16Regular, ThumbDislike16Regular, ChevronDown20Regular, ChevronRight20Regular, TextT20Regular, Play20Regular, Filter20Regular, ArrowSort20Regular, Search20Regular, Dismiss16Regular, Link20Regular, MoreHorizontal20Regular, ThumbLike16Regular as Like, Eye16Regular, Open16Regular, Checkmark20Regular } from "@fluentui/react-icons";
import { activeSession, useStore, nextId } from "../store";
import { api } from "../api";
import { accounts, contacts, scripts, queues } from "../data";
import type { Case, KnowledgeArticle } from "../model";
import { fmtDate } from "../util";

function useCurrentCase(): Case | null {
  const { state } = useStore();
  const s = activeSession(state);
  const t = s.tabs.find(x => x.id === s.activeTabId);
  if (!t) return null;
  if (t.kind === "case") return state.cases.find(c => c.id === t.caseId) ?? null;
  if (t.kind === "email") { const a = state.activities.find(x => x.id === t.activityId); return state.cases.find(c => c.id === a?.caseId) ?? null; }
  if (t.kind === "article") return null;
  // fall back to anchor
  const anchor = s.tabs[0];
  return anchor?.kind === "case" ? state.cases.find(c => c.id === anchor.caseId) ?? null : null;
}

export default function ProductivityPane() {
  const { state } = useStore();
  const c = useCurrentCase();
  if (state.pane === "copilot") return <CopilotPane c={c} />;
  if (state.pane === "scripts") return <ScriptsPane c={c} />;
  return <KnowledgePane c={c} />;
}

/* ---------------- Copilot ---------------- */
const RESPONSE_TYPES = ["Suggest a call", "Request more information", "Empathize", "Resolve the customer's problem", "Confirm next steps"];

function draftEmail(c: Case, kind: string, custom: string, articles: KnowledgeArticle[]) {
  const cust = contacts.find(x => x.id === c.customerId)!;
  const first = cust.name.split(" ")[0];
  const ka = c.articleIds.map(id => articles.find(a => a.id === id)!).filter(Boolean)[0];
  const sign = "\n\nKind regards,\nPriya Natarajan\nStrada Payroll Support";
  if (custom.trim()) return `Hi ${first},\n\n${custom.trim()}\n\n${c.highlights[0]}${ka ? `\n\nFor reference: ${ka.title} (${ka.id}).` : ""}${sign}`;
  switch (kind) {
    case "Suggest a call": return `Hi ${first},\n\nThank you for contacting Strada Payroll Support about "${c.title.toLowerCase()}". I'd like to walk you through the resolution on a short call so we can confirm the details together. Could you let me know a 15-minute window today or tomorrow that suits you?\n\n${c.highlights[0]}${sign}`;
    case "Request more information": return `Hi ${first},\n\nThank you for reaching out about "${c.title.toLowerCase()}". To progress this I need one or two more details:\n\n• The pay date(s) affected\n• A screenshot or the figures from your pay statement\n• Any reference number you were given\n\nOnce I have these I'll update you within one business day.${sign}`;
    case "Empathize": return `Hi ${first},\n\nI'm sorry for the trouble this has caused – I understand how unsettling it is when pay doesn't arrive as expected. I'm personally handling your case ${c.number} and will keep you updated at each step.\n\n${c.highlights[0]}${sign}`;
    case "Confirm next steps": return `Hi ${first},\n\nQuick update on case ${c.number}:\n\n${c.highlights.map(h => "• " + h).join("\n")}\n\nI'll confirm once the final step is complete.${sign}`;
    default: return `Hi ${first},\n\nFollowing up on case ${c.number}. ${c.summary.split(". ").slice(-2).join(". ")}\n\n${ka ? `The steps are also documented here: ${ka.title}.` : ""}${sign}`;
  }
}

function answer(q: string, c: Case | null, articles: KnowledgeArticle[]): { text: string; cites: string[] } {
  const ql = q.toLowerCase();
  const words = ql.split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const score = (a: KnowledgeArticle) => words.reduce((s, w) => s + ((a.title + " " + a.snippet + " " + a.body.join(" ")).toLowerCase().includes(w) ? 1 : 0), 0);
  const ranked = articles.filter(a => a.status === "Published").map(a => ({ a, s: score(a) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 2);
  if (/summar/.test(ql) && c) return { text: c.summary, cites: [c.number] };
  if (/(next step|what should i do|how do i resolve)/.test(ql) && c) return { text: `Based on the case and the linked knowledge: ${c.highlights.slice(-2).join(" ")}`, cites: c.articleIds };
  if (ranked.length) {
    const top = ranked[0].a;
    return { text: `${top.snippet} Key steps: ${top.body.slice(0, 3).join(" ")}`, cites: ranked.map(r => r.a.id) };
  }
  return { text: "I couldn't find this in the knowledge base. Try rephrasing, or ask about bank returns, W-2 reissue, state withholding, garnishments or final pay rules.", cites: [] };
}

function CopilotPane({ c }: { c: Case | null }) {
  const { state, dispatch } = useStore();
  const s = activeSession(state);
  const t = s.tabs.find(x => x.id === s.activeTabId);
  const emailOpen = t?.kind === "email" ? state.activities.find(a => a.id === t.activityId) : undefined;
  const inbound = c ? state.activities.filter(a => a.caseId === c.id && a.type === "email" && a.direction === "in").sort((a, b) => b.at.getTime() - a.at.getTime())[0] : undefined;
  const target = emailOpen ?? inbound;
  const [kind, setKind] = useState(RESPONSE_TYPES[3]);
  const [custom, setCustom] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const chat = state.copilotChat;
  const conv = t?.kind === "conversation" ? state.conversations.find(x => x.id === t.conversationId) : (s.conversationId ? state.conversations.find(x => x.id === s.conversationId) : undefined);
  const [convBusy, setConvBusy] = useState(false);
  const askConv = async (question: string) => {
    if (!conv) return;
    dispatch({ type: "chat", msg: { role: "user", text: question } }); setConvBusy(true);
    try {
      const ql = question.toLowerCase();
      if (/summar/.test(ql)) { const r = await api.conv.summary(conv.id); dispatch({ type: "chat", msg: { role: "assistant", text: r.text, cites: conv.caseId ? [state.cases.find(k => k.id === conv.caseId)?.number ?? ""].filter(Boolean) : [] } }); }
      else if (/say next|what should i say|reply|respond/.test(ql)) { const r = await api.conv.suggest(conv.id); dispatch({ type: "chat", msg: { role: "assistant", text: r.text } }); }
      else { const a = answer(question, c, state.articles); dispatch({ type: "chat", msg: { role: "assistant", text: a.text, cites: a.cites } }); }
    } catch (e: any) { dispatch({ type: "chat", msg: { role: "assistant", text: `Copilot could not answer: ${e.message}` } }); }
    finally { setConvBusy(false); }
  };

  const gen = () => { setBusy(true); setTimeout(() => { setDraft(draftEmail(c!, kind, custom, state.articles)); setBusy(false); }, 900); };
  const use = () => {
    if (!target || !draft) return;
    dispatch({ type: "setDraft", draft: { activityId: target.id, text: draft } });
    dispatch({ type: "openTab", tab: { id: "em-" + target.id, kind: "email", activityId: target.id } });
    dispatch({ type: "toast", text: "Draft inserted into the email reply" });
  };
  const ask = () => {
    if (!q.trim()) return;
    const question = q.trim(); setQ("");
    if (conv) { askConv(question); return; }
    dispatch({ type: "chat", msg: { role: "user", text: question } });
    setTimeout(() => { const a = answer(question, c, state.articles); dispatch({ type: "chat", msg: { role: "assistant", text: a.text, cites: a.cites } }); }, 700);
  };

  return (
    <>
      <div className="ph"><Sparkle20Filled style={{ color: "var(--copilot)", fontSize: 26 }} /> Copilot</div>
      <div className="pb">
        {conv && !chat.length && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{conv.channel === "voice" ? "Live call" : "Live chat"} · {conv.state}</div>
            <div className="mini">Copilot is reading the transcript as it arrives.</div>
            <Button appearance="primary" icon={<Sparkle20Filled />} disabled={convBusy} onClick={() => askConv("Summarize conversation")}>{convBusy ? "Working…" : "Summarize conversation"}</Button>
          </div>
        )}
        {!chat.length && !target && !conv && (
          <div className="empty"><Sparkle48Filled style={{ color: "var(--copilot)" }} /><div className="h">To get started, open an email</div><div className="s">Get suggested email responses.</div></div>
        )}
        {target && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Write an email</div>
            <div className="mini">Replying to: {target.subject}</div>
            <Dropdown value={kind} selectedOptions={[kind]} onOptionSelect={(_, d) => setKind(d.optionValue ?? kind)}>{RESPONSE_TYPES.map(r => <Option key={r} value={r}>{r}</Option>)}</Dropdown>
            <Textarea placeholder="Or describe what you want to say" rows={3} value={custom} onChange={(_, v) => setCustom(v.value)} />
            <Button appearance="primary" icon={<Sparkle20Filled />} disabled={busy} onClick={gen}>{busy ? "Drafting…" : draft ? "Regenerate" : "Create draft"}</Button>
            {draft && (
              <div className="msg ai" style={{ whiteSpace: "pre-wrap" }}>{draft}
                <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                  <Button size="small" appearance="primary" onClick={use}>Use this draft</Button>
                  <Tooltip content="Copy" relationship="label"><button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => navigator.clipboard?.writeText(draft)}><Copy16Regular /></button></Tooltip>
                  <button className="iconbtn" style={{ width: 26, height: 26 }}><ThumbLike16Regular /></button><button className="iconbtn" style={{ width: 26, height: 26 }}><ThumbDislike16Regular /></button>
                </div>
              </div>
            )}
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={"msg " + (m.role === "user" ? "user" : "ai")}>
            {m.text}
            {m.cites?.length ? <div>{m.cites.map(id => <span key={id} className="cite" onClick={() => { const a = state.articles.find(x => x.id === id); if (a) dispatch({ type: "openTab", tab: { id: "ka-" + a.id, kind: "article", articleId: a.id } }); }}>{id}</span>)}</div> : null}
            {m.role === "assistant" && <div style={{ display: "flex", gap: 4, marginTop: 6 }}><button className="iconbtn" style={{ width: 24, height: 24 }}><Copy16Regular /></button><button className="iconbtn" style={{ width: 24, height: 24 }}><ThumbLike16Regular /></button><button className="iconbtn" style={{ width: 24, height: 24 }}><ThumbDislike16Regular /></button></div>}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="info"><Checkmark16Regular style={{ flexShrink: 0, marginTop: 2 }} /><span>You can select the type of response from a list or enter your own description of what you want.</span></div>
        <div className="info"><Info16Regular style={{ flexShrink: 0, marginTop: 2 }} /><span>AI-generated content can have mistakes. Make sure it's accurate and appropriate before using it. <a>Read terms</a></span></div>
      </div>
      <div className="pf">
        {(c || conv) && !chat.length && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{(conv ? ["Summarize conversation", "What should I say next?", "How do I handle an R03 return?"] : ["Summarize this case", "What are the next steps?", "How do I handle an R03 return?"]).map(p => <span key={p} className="cite" style={{ margin: 0 }} onClick={() => { setQ(p); }}>{p}</span>)}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <Input style={{ flex: 1 }} placeholder="Ask a question" value={q} onChange={(_, v) => setQ(v.value)} onKeyDown={e => e.key === "Enter" && ask()} />
          <Button appearance="primary" icon={<Send20Regular />} onClick={ask} disabled={!q.trim()} />
        </div>
        {!!chat.length && <div style={{ marginTop: 6 }}><span className="link mini" onClick={() => dispatch({ type: "clearChat" })}>New conversation</span></div>}
      </div>
    </>
  );
}

/* ---------------- Agent scripts ---------------- */
function fill(text: string, c: Case) {
  const cust = contacts.find(x => x.id === c.customerId)!;
  const acct = accounts.find(x => x.id === c.accountId)!;
  const lead = contacts.find(x => x.accountId === c.accountId && x.payGroup.startsWith("Client"))?.name ?? "payroll lead";
  const map: Record<string, string> = { customer: cust.name.split(" ")[0], account: acct.name, empId: cust.employeeId.slice(-4), payDate: fmtDate(new Date()), payGroup: cust.payGroup, clientLead: lead.split(" ")[0], count: String(Math.max(1, (c.id === "k2" ? 4 : 1))), docYear: "2025", fromState: "Illinois", toState: "Indiana", moveDate: "09/28", orderRef: "WA-CS-77821" };
  return text.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? `{${k}}`);
}

function ScriptsPane({ c }: { c: Case | null }) {
  const { state, dispatch } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const script = scripts.find(s => s.id === (sel ?? c?.scriptId)) ?? scripts[0];
  const [open, setOpen] = useState<Record<string, boolean>>({ [script.steps[0].id]: true });
  const [done, setDone] = useState<Record<string, boolean>>({});
  const run = (stepId: string, action: string) => {
    if (!c) return;
    const q = queues.find(x => x.id === c.queueId)!;
    const log = (subject: string, body: string) => dispatch({ type: "addActivity", activity: { id: nextId("t"), caseId: c.id, type: "autopost", from: "Agent script", subject, body, at: new Date(), modifiedAt: new Date() } });
    if (action === "updateCase") { dispatch({ type: "updateCase", caseId: c.id, patch: { status: c.id === "k2" ? "In Progress" : "Researching", escalated: c.id === "k2" ? true : c.escalated, escalatedOn: c.id === "k2" ? new Date() : c.escalatedOn } }); log("Case updated by macro", `Script "${script.name}" · step Update case. Status set, queue ${q.name} confirmed.`); dispatch({ type: "toast", text: "Macro ran: Update case", kind: "success" }); }
    if (action === "resolveCase") { api.resolve(c.id, `Resolved by script "${script.name}"`, 0).then(() => dispatch({ type: "toast", text: "Macro ran: Resolve case", kind: "success" })).catch(e => dispatch({ type: "toast", text: e.message })); }
    if (action === "linkArticle") { const ka = state.articles.find(a => a.status === "Published" && !c.articleIds.includes(a.id) && a.kb === "Shared rules"); if (ka) { dispatch({ type: "updateCase", caseId: c.id, patch: { articleIds: [...c.articleIds, ka.id] } }); log("Knowledge article linked", `${ka.id} ${ka.title}`); dispatch({ type: "toast", text: `Linked ${ka.id}`, kind: "success" }); } }
    if (action === "scheduleFollowUp") { const due = new Date(Date.now() + 2 * 86400000); dispatch({ type: "addActivity", activity: { id: nextId("t"), caseId: c.id, type: "task", from: "Priya Natarajan", subject: "Follow up with customer", at: new Date(), modifiedAt: new Date(), status: "Open", due } }); dispatch({ type: "updateCase", caseId: c.id, patch: { followUpBy: due } }); dispatch({ type: "toast", text: "Follow-up task created", kind: "success" }); }
    setDone({ ...done, [stepId]: true });
  };
  const send = (stepId: string, text: string) => {
    if (!c) return;
    dispatch({ type: "addActivity", activity: { id: nextId("t"), caseId: c.id, type: "note", from: "Priya Natarajan", subject: script.steps.find(s => s.id === stepId)!.name, body: text, at: new Date(), modifiedAt: new Date() } });
    dispatch({ type: "toast", text: "Added to timeline" });
    setDone({ ...done, [stepId]: true });
  };
  return (
    <>
      <div className="ph">Agent scripts</div>
      <div className="pb script">
        <Dropdown className="sel" value={script.name} selectedOptions={[script.id]} onOptionSelect={(_, d) => { setSel(d.optionValue ?? null); setDone({}); }}>{scripts.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}</Dropdown>
        {!c && <div className="mini">Open a case to run this script against it.</div>}
        {script.steps.map(st => (
          <div key={st.id} className="step">
            <div className="h" onClick={() => setOpen({ ...open, [st.id]: !open[st.id] })}>
              {open[st.id] ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
              <span style={{ textDecoration: done[st.id] ? "line-through" : undefined, color: done[st.id] ? "#616161" : undefined }}>{st.name}</span>
              <span className="ic">{done[st.id] ? <Checkmark20Regular style={{ color: "#107c10" }} /> : st.kind === "text" ? <TextT20Regular /> : <button className="iconbtn" onClick={e => { e.stopPropagation(); run(st.id, st.action!); }} disabled={!c}><Play20Regular /></button>}</span>
            </div>
            {open[st.id] && (
              <div className="b">
                {st.kind === "text" ? <>
                  <div>{c ? fill(st.text!, c) : st.text}</div>
                  <div className="acts"><Button size="small" icon={<Copy16Regular />} onClick={() => navigator.clipboard?.writeText(c ? fill(st.text!, c) : st.text!)}>Copy</Button><Button size="small" appearance="primary" disabled={!c} onClick={() => send(st.id, fill(st.text!, c!))}>Add to timeline</Button></div>
                </> : <>
                  <div className="mini">Macro: {st.action === "updateCase" ? "Update case fields and status" : st.action === "resolveCase" ? "Resolve the case with the script's resolution" : st.action === "linkArticle" ? "Link the recommended knowledge article" : "Create a follow-up task 2 business days out"}</div>
                  <div className="acts"><Button size="small" appearance="primary" icon={<Play20Regular />} disabled={!c} onClick={() => run(st.id, st.action!)}>Run</Button></div>
                </>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- Knowledge search ---------------- */
function KnowledgePane({ c }: { c: Case | null }) {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<"Search" | "My favorites">("Search");
  const [q, setQ] = useState(c?.title ?? "");
  const [touched, setTouched] = useState(false);
  const query = touched ? q : (c?.title ?? q);
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !["the", "and", "for", "not", "with", "from"].includes(w));
    const acctKb = c ? accounts.find(a => a.id === c.accountId)!.name + " KB" : "";
    return state.articles.map(a => {
      const hay = (a.title + " " + a.snippet + " " + a.body.join(" ")).toLowerCase();
      let s = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      if (c && c.articleIds.includes(a.id)) s += 5;
      if (c && a.draftFromCase === c.id) s += 6;
      if (a.kb === acctKb) s += 1;
      if (/r03|return|deposit|pay/i.test(query) && /r03|return/i.test(a.title)) s += 2;
      return { a, s };
    }).filter(x => x.s > 0 || !query.trim()).sort((x, y) => y.s - x.s).map(x => x.a);
  }, [query, state.articles, c]);
  const list = tab === "Search" ? results : state.articles.filter(a => ["KA-01041", "KA-01081", "KA-01092"].includes(a.id));
  return (
    <>
      <div className="ph">Knowledge search</div>
      <div className="pb ks" style={{ padding: "0 12px 12px" }}>
        <div className="card" style={{ padding: "4px 12px 12px" }}>
          <div className="tabs">
            {(["Search", "My favorites"] as const).map(t => <span key={t} className={"t" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</span>)}
            <span className="sp"><button className="iconbtn"><Filter20Regular /></button><button className="iconbtn"><ArrowSort20Regular /></button></span>
          </div>
          {tab === "Search" && <div style={{ marginTop: 10 }}><Input style={{ width: "100%" }} contentBefore={<Search20Regular />} contentAfter={query ? <Dismiss16Regular style={{ cursor: "pointer" }} onClick={() => { setTouched(true); setQ(""); }} /> : undefined} value={query} onChange={(_, v) => { setTouched(true); setQ(v.value); }} placeholder="Search knowledge articles" /></div>}
          <div className="meta"><span>{list.length} Results found</span><span>Sorted by Relevance</span></div>
          {list.map(a => (
            <div key={a.id} className="ka">
              <div className="t"><span className="link" style={{ textDecoration: "none", color: "inherit" }} onClick={() => dispatch({ type: "openTab", tab: { id: "ka-" + a.id, kind: "article", articleId: a.id } })}>{a.title}</span>
                <span className="sp">
                  <Tooltip content={c && c.articleIds.includes(a.id) ? "Linked to case" : "Link to case"} relationship="label"><button className="iconbtn" disabled={!c} onClick={() => { if (!c || c.articleIds.includes(a.id)) return; dispatch({ type: "updateCase", caseId: c.id, patch: { articleIds: [...c.articleIds, a.id] } }); dispatch({ type: "toast", text: `${a.id} linked to ${c.number}`, kind: "success" }); }}>{c && c.articleIds.includes(a.id) ? <Checkmark20Regular style={{ color: "#107c10" }} /> : <Link20Regular />}</button></Tooltip>
                  <button className="iconbtn"><MoreHorizontal20Regular /></button>
                </span>
              </div>
              <div className="sn">{a.snippet}</div>
              <div className="pills"><span>{a.audience}</span><span className={a.status === "In review" ? "rev" : ""}>{a.status}</span>{a.draftFromCase && <span className="rev"><Sparkle20Filled style={{ fontSize: 12 }} /> Draft from case</span>}<span>{a.kb}</span></div>
              {!a.draftFromCase && <div style={{ marginTop: 8, border: "1px solid var(--line2)", borderRadius: 4, padding: "6px 10px", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}><Info16Regular /> No other matches found in this article</div>}
              <div className="ft"><span>{a.id}</span><span className="sp"><span><Like /> {a.likes}</span><span><Eye16Regular /> {a.views}</span><span>{fmtDate(a.modified)}</span></span></div>
            </div>
          ))}
          {!list.length && <div className="mini" style={{ padding: 20, textAlign: "center" }}>No articles match. Try different keywords.</div>}
        </div>
      </div>
    </>
  );
}

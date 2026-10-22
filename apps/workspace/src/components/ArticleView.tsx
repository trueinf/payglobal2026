import React from "react";
import { Button } from "@fluentui/react-components";
import { ArrowLeft20Regular, Share20Regular, ChevronDown16Regular, Sparkle20Filled, Checkmark20Regular, Edit20Regular, Star20Regular, Link20Regular } from "@fluentui/react-icons";
import { useStore } from "../store";
import { fmtDate } from "../util";

export default function ArticleView({ articleId }: { articleId: string }) {
  const { state, dispatch } = useStore();
  const a = state.articles.find(x => x.id === articleId)!;
  const draft = a.status === "In review";
  return (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="cmdbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <button className="cmd" disabled><ArrowLeft20Regular /></button><span className="sep" />
        <button className="cmd"><Link20Regular /> Link to case</button><button className="cmd"><Star20Regular /> Add to favorites</button><button className="cmd"><Edit20Regular /> Edit</button>
        <span className="spacer" /><button className="cmd outline"><Share20Regular /> Share <ChevronDown16Regular /></button>
      </div>
      <div className="formbody">
        {draft && (
          <div className="aibanner">
            <Sparkle20Filled style={{ color: "var(--copilot)" }} />
            <span>Customer Knowledge Management Agent drafted this article from case {state.cases.find(c => c.id === a.draftFromCase)?.number}. PII scrubbed. Compliance status: Non-compliant until reviewed.</span>
            <span className="sp"><Button size="small" appearance="primary" icon={<Checkmark20Regular />} onClick={() => { dispatch({ type: "updateArticle", id: a.id, patch: { status: "Published", modified: new Date() } }); dispatch({ type: "toast", text: `${a.id} approved and published to ${a.kb}`, kind: "success" }); }}>Approve and publish</Button></span>
          </div>
        )}
        <div className="rhead">
          <div className="title"><span>{a.title}</span></div>
          <div className="sub"><b>Knowledge Article</b> · {a.id} · <span className="kb">{a.kb}</span> · {a.status} · {a.audience} · Modified {fmtDate(a.modified)}</div>
        </div>
        <div className="ftabs"><span className="ftab active">Content</span><span className="ftab">Summary</span><span className="ftab">Analytics</span></div>
        <div className="sec" style={{ maxWidth: 820, fontSize: 15, lineHeight: 1.6 }}>
          <p>{a.snippet}</p>
          <ol>{a.body.map((b, i) => <li key={i} style={{ marginBottom: 6 }}>{b}</li>)}</ol>
        </div>
      </div>
    </div>
  );
}

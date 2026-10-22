import React from "react";
import { Wrench20Regular, Person20Regular, Building20Regular, TaskListLtr20Regular, BookOpen20Regular, Mail20Regular, Dismiss16Regular, Call20Regular, Chat20Regular } from "@fluentui/react-icons";
import { activeSession, useStore, type RecordTab } from "../store";
import { accounts, contacts } from "../data";
import CaseForm from "./CaseForm";
import ContactForm from "./ContactForm";
import CaseListTab from "./CaseListTab";
import ArticleView from "./ArticleView";
import EmailView from "./EmailView";
import ActiveConversationForm from "./ActiveConversationForm";
import { truncate } from "../util";

export default function RecordSession() {
  const { state, dispatch } = useStore();
  const session = activeSession(state);
  const tab = session.tabs.find(t => t.id === session.activeTabId) ?? session.tabs[0];

  const label = (t: RecordTab) => {
    switch (t.kind) {
      case "case": return [<Wrench20Regular key="i" />, state.cases.find(c => c.id === t.caseId)?.title ?? "Case"];
      case "contact": return [<Person20Regular key="i" />, contacts.find(c => c.id === t.contactId)?.name ?? "Contact"];
      case "account": return [<Building20Regular key="i" />, accounts.find(a => a.id === t.accountId)?.name ?? "Account"];
      case "caseList": return [<TaskListLtr20Regular key="i" />, "Cases " + t.view];
      case "article": return [<BookOpen20Regular key="i" />, state.articles.find(a => a.id === t.articleId)?.title ?? "Article"];
      case "email": return [<Mail20Regular key="i" />, state.activities.find(a => a.id === t.activityId)?.subject ?? "Email"];
      case "conversation": { const cv = state.conversations.find(c => c.id === t.conversationId); return [cv?.channel === "chat" ? <Chat20Regular key="i" /> : <Call20Regular key="i" />, (contacts.find(c => c.id === cv?.customerId)?.name ?? "Conversation") + (cv?.state === "Closed" ? " (Closed)" : "")]; }
    }
  };

  if (!tab) return <div className="card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#616161" }}>Select a work item to open it here.</div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
      {session.tabs.length > 1 && (
        <div className="card rtabs">
          {session.tabs.map(t => {
            const [icon, text] = label(t) as [React.ReactNode, string];
            const active = t.id === tab.id;
            return (
              <div key={t.id} className={"rtab" + (active ? " active" : "")} onClick={() => dispatch({ type: "selectTab", tabId: t.id })} title={text}>
                {icon}<span className="t">{truncate(text, 28)}</span>
                {active && session.tabs.indexOf(t) > 0 && <span className="x" onClick={e => { e.stopPropagation(); dispatch({ type: "closeTab", tabId: t.id }); }}><Dismiss16Regular /></span>}
              </div>
            );
          })}
        </div>
      )}
      {tab.kind === "case" && <CaseForm key={tab.caseId} caseId={tab.caseId} />}
      {tab.kind === "contact" && <ContactForm contactId={tab.contactId} />}
      {tab.kind === "account" && <ContactForm accountId={tab.accountId} />}
      {tab.kind === "caseList" && <CaseListTab />}
      {tab.kind === "article" && <ArticleView articleId={tab.articleId} />}
      {tab.kind === "email" && <EmailView activityId={tab.activityId} />}
      {tab.kind === "conversation" && <ActiveConversationForm key={tab.conversationId} conversationId={tab.conversationId} monitor={!!session.monitor} />}
    </div>
  );
}

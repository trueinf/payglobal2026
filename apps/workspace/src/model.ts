export type Priority = "High" | "Normal" | "Low";
export type CaseStatus = "In Progress" | "On Hold" | "Waiting for Details" | "Researching" | "Resolved";
export type Origin = "Email" | "Phone" | "Web" | "Chat";
export type CaseType = "Problem" | "Question" | "Request";

export interface Account { id: string; name: string; payGroups: string[]; state: string; }
export interface Contact { id: string; name: string; accountId: string; employeeId: string; email: string; state: string; payGroup: string; }
export interface Queue { id: string; name: string; }

export interface Activity {
  id: string;
  caseId: string;
  type: "email" | "chat" | "call" | "appointment" | "task" | "note" | "autopost";
  direction?: "in" | "out";
  from: string;        // display name
  subject: string;
  body?: string;
  transcript?: { who: string; text: string; at: string }[];
  at: Date;            // activity time
  modifiedAt: Date;
  status?: "Open" | "Closed" | "Overdue" | "Completed";
  due?: Date;
  aiGenerated?: boolean;
}

export interface KnowledgeArticle {
  id: string;          // KA-xxxxx
  title: string;
  snippet: string;
  body: string[];
  audience: "External" | "Internal";
  status: "Published" | "Draft" | "In review";
  kb: string;          // "Shared rules" or client KB
  likes: number; views: number; modified: Date;
  draftFromCase?: string;
}

export interface ScriptStep { id: string; name: string; kind: "text" | "macro"; text?: string; action?: "updateCase" | "resolveCase" | "linkArticle" | "scheduleFollowUp"; }
export interface AgentScript { id: string; name: string; intent: string; steps: ScriptStep[]; }

export interface Case {
  id: string;
  number: string;
  title: string;
  customerId: string;      // contact
  accountId: string;
  subject: string;
  priority: Priority;
  status: CaseStatus;
  origin: Origin;
  type: CaseType;
  product: string;
  description: string;
  owner: string;
  queueId: string;
  createdOn: Date;
  modifiedOn: Date;
  entitlement?: string;
  escalated: boolean;
  escalatedOn?: Date;
  parentId?: string;
  firstResponseSent: boolean;
  followUpBy?: Date; firstResponseBy?: Date; resolveBy?: Date;
  intent: string;
  scriptId?: string;
  articleIds: string[];
  aiCreated?: boolean;      // Case Management Agent created it
  aiUpdated?: boolean;      // Case Management Agent filled/updated fields
  aiFields?: string[];      // fields predicted by the agent
  summary: string;
  highlights: string[];
  createdBy?: string;        // agent that opened the case proactively (Pay Event Sentinel, Incident Clustering Agent)
  remedy?: { type: string; reference?: string; dispatched_at?: string; expected_settlement?: string } | null;
  verifiedAt?: Date;
  verification?: { outcome: "settled" | "on_track" | "reopened"; checked_at: string; detail: string; next_check?: string } | null;
  findings?: { variance?: VarianceFinding; rules?: RulesFinding };
  incident?: { pay_group: string; code: string; affected: string[]; root_cause: string; confidence: string; action_plan?: string[]; employee_action?: string; client_notified_at?: string | null } | null;
}
export interface Alert { id: number; contactId: string | null; accountId: string | null; kind: string; channel: string; title?: string; message: string; relatedCaseId?: string | null; agent?: string; sentAt: Date; readAt?: Date | null; }

export interface VarianceFinding { at: string; pay_date: string; previous_pay_date: string; net: number; previous_net: number; net_change: number; headline: string; differences: { line: string; change: string; cause: string; expected: boolean }[]; employee_explanation: string; representative_note: string; needs_correction: boolean; correction_summary?: string; }
export interface RulesFinding { at: string; states: string[]; determination: string; rules_applied: { state: string; rule: string; applies: string }[]; forms_required?: string[]; deadline?: string; county_tax?: string; actions: { action: string; who: string; due_days?: number }[]; employee_explanation: string; status: string; }

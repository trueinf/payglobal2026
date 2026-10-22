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
}

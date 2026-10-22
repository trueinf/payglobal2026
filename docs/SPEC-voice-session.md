# Spec — Voice conversation session (inbound call, Pay Distribution)

Project: `strada-d365` (Vite + React 18 + TypeScript + Fluent UI v9). This adds the live-call surface that the current build only references. Everything below mirrors the real Dynamics 365 Copilot Service workspace behaviour as documented by Microsoft (labels quoted verbatim); items marked **[verify]** are not pinned down by the docs and must be matched to the screenshots from the trial's "Explore chat" tour before implementation — the chat and voice flows share the notification, session, Active Conversation form and wrap-up; only the controls inside the Communication panel differ.

Sources: Microsoft Learn — *Use agent dashboard and call controls in the voice channel*, *View customer information on Active Conversation form*, *Manage sessions*, *Understand conversation states* (all current as of Oct 2026).

Run `npx tsc --noEmit` and `npm run build` after each phase. One new runtime dependency allowed: none (TTS uses the browser's Web Speech API).

---

## 0. Storyline the feature must support

Tom Reilly (Meridian Health Partners, pay group BW-NUR, employee MHP-19876) calls Strada Payroll Support on pay day because his deposit of 1,744.90 did not arrive. The **Copilot voice agent answers first**, verifies him by phone OTP, finds the R03 return, explains it and offers a live check. Tom asks to speak to a person. The agent **transfers** the call with context to the Pay Distribution queue; Priya Natarajan gets the incoming-call notification, accepts, sees the transcript so far and the case the agent already created (CAS-10495), confirms the live check, ends the call, completes wrap-up, and the Case Management Agent updates the case from the conversation.

This replaces the current static "Phone Call from: Tom Reilly" timeline entry on CAS-10495 with a real conversation record.

## 1. Conversation states (model)

Implement exactly these states and transitions (from *Understand conversation states*):

| State | Meaning | Enter by |
| --- | --- | --- |
| `Open` | in queue, unassigned | call transferred by the voice agent |
| `Active` | assigned to the representative; consumes capacity | representative selects **Accept** |
| `Wrap-up` | post-conversation work before closing | representative selects **End** |
| `Closed` | complete; cannot be reopened | representative closes the session (×) from Wrap-up |

Rules: closing the session (×) while `Active` **routes the call back to the queue** (state → `Open`, notification re-appears after 5 s). Only `End` → × moves to `Closed`. `Waiting` state is chat-only; do not implement.

**Model additions** (`src/model.ts`):

```ts
export interface Conversation {
  id: string;
  channel: "voice" | "chat";
  state: "Open" | "Active" | "Wrap-up" | "Closed";
  customerId: string;            // contact
  caseId?: string;               // linked case
  queueId: string;
  startedAt: Date;               // when the voice agent answered
  waitingSeconds: number;        // time in queue before Accept
  acceptedAt?: Date; endedAt?: Date; closedAt?: Date;
  transcript: TranscriptLine[];
  sentiment: "Positive" | "Neutral" | "Negative" | "Slightly negative";
  recording: boolean;            // Start/Pause recording state
  dispositionCode?: string;
  notes: string;
}
export interface TranscriptLine { id: string; who: "Customer" | "Voice agent" | "Representative"; text: string; at: Date; }
```

Seed (`src/data.ts`): one conversation `cv1` for Tom Reilly, `state: "Open"`, `channel: "voice"`, `queueId: "q1"`, `caseId: "k5"`, `waitingSeconds: 0`, transcript pre-filled with the voice-agent portion (lines 1–8 below). The representative portion (lines 9–14) is appended live after Accept.

Transcript script (speaker · text):

1. Voice agent · "Thank you for calling Strada Payroll Support. To verify your identity I've sent a code to the mobile number on file. Please say the six digits."
2. Customer · "Four two seven one nine three."
3. Voice agent · "Thanks, Tom. How can I help today?"
4. Customer · "My pay didn't come in this morning. Everyone else on my unit got paid."
5. Voice agent · "I'm sorry about that. I can see your deposit of one thousand seven hundred forty-four dollars and ninety cents was returned by your bank with code R03, which means the bank could not locate the account. I've opened case CAS-10495 for you. I can issue a live check by courier today, or re-send the deposit once you correct your account number in Strada Pay."
6. Customer · "I'd rather talk to a person about this."
7. Voice agent · "Of course. I'm transferring you to a payroll specialist now and passing along everything we've discussed. Please hold."
8. *(system line, not spoken)* "Transferred to queue Pay Distribution with context. Waiting for a representative."
9. Representative · "Hi Tom, this is Priya from Strada Payroll Support. I can see the return on your deposit — I'm sorry about the morning you've had. Let's get this sorted."
10. Customer · "Thanks. Can I just get a check today?"
11. Representative · "Yes. A live check for 1,744.90 goes out by courier before 2 PM Eastern, to the Meridian site. You'll get a text when it's dispatched."
12. Customer · "Great. What about next time?"
13. Representative · "Three of your colleagues had the same return this morning, so this looks like a file issue on our side rather than your details. We're fixing it; you don't need to do anything. I'll follow up by email once it's confirmed."
14. Customer · "Perfect, thank you."

Representative lines are delivered one at a time when the representative clicks **Send** in the panel's suggested-response box (see 4.5), not automatically — the person demoing controls the pace.

## 2. Incoming notification **[verify layout against chat-tour screenshot]**

A card anchored bottom-right of the window (above the toasts), shown while a conversation is `Open` and the representative is on any screen.

Contents (top to bottom): channel icon (phone) + "Incoming call" · customer name **Tom Reilly** · account "Meridian Health Partners" · queue "Pay Distribution" · "Transferred by: Copilot voice agent" · wait timer counting up from `waitingSeconds` · primary button **Accept** · secondary **Reject** (admin-controlled; include it). Auto-dismiss is not documented; keep the card until acted on. Ringing: no audio.

Demo trigger: on Home, a command-bar-adjacent control is not realistic; instead add a hidden keyboard shortcut **Ctrl/Cmd + Shift + I** that sets `cv1.state = "Open"` (re-arms the notification). Document it in the README. On first page load the conversation is already `Open`, so the card appears 8 s after load on whatever screen is showing.

## 3. Accept → session

On **Accept**: state → `Active`, `acceptedAt = now`, presence dot in the top bar turns to "Busy" (red), a new **session tab** opens titled with the customer name and a phone icon (`Call20Regular`), and the session's anchor tab is the **Active Conversation** form (not the case form). Capacity: the work-item list is replaced for this session by the **Communication panel** (left column).

Session tab close (×) rules follow section 1.

## 4. Communication panel (left column, voice) **[verify layout; labels are documented]**

Width = current `.leftcol` (330 px). Sections top to bottom:

4.1 **Header**: avatar initials "TR" · **Tom Reilly** · "Meridian Health Partners · MHP-19876" · call timer `mm:ss` counting from `acceptedAt` · sentiment icon with tooltip (map `sentiment` to Fluent emoji icons: `EmojiSad`, `EmojiMeh`, `EmojiSmile`).

4.2 **Call controls** (icon buttons in a row, labels on hover, exact strings):
`Mute` · `Hold` · `Consult` · `Transfer` · `Dialpad` · `End`
Second row (overflow ⋯ menu is acceptable): `Take notes` · `Start recording and transcript` / `Pause recording and transcription` (toggle) · `Device settings` · `Mark spam` · `Knowledge Articles` · `Link to conversation`.
Behaviour: Mute/Hold toggle a visual state (Hold shows "On hold" banner in the panel and pauses the timer colour, not the timer). Consult and Transfer open a Fluent Dialog listing representatives / queues (static list; selecting a queue in Transfer sets state → `Open` on that queue and closes the session). Dialpad opens a 12-key pad (visual). **End** → section 6.

4.3 **Transcript** (the main body): header "Transcript" with a **Hide Transcript / Show Transcript** toggle (persist choice in `localStorage`, wrapped in try/catch). Lines render as chat bubbles: Customer left-aligned grey, Voice agent and Representative right-aligned blue; each line shows speaker label and time. Lines 1–7 are present on Accept; line 8 renders as a centred system divider. A "Recording · Transcription on" indicator sits under the header while `recording` is true (default true; the voice agent started it).

4.4 **Live sentiment**: recompute after each customer line (lines 4 and 6 → "Slightly negative", lines 10–14 → "Neutral" then "Positive").

4.5 **Representative input**: at the bottom, a text box pre-filled with the *next* representative line from the script and a **Send** button; Send appends the line to the transcript, speaks it through TTS, then after 1.5 s appends and speaks the customer's reply. When the script is exhausted the box is empty and free text can be sent (spoken, no reply).

4.6 **TTS**: `window.speechSynthesis`. Pick two voices (first two English voices available; fallback to default). Customer lines use voice A, Representative/Voice agent voice B. A speaker icon in the transcript header toggles audio on/off (default on; off if `speechSynthesis` is unavailable, with no error). Replaying lines 1–7 on Accept: offer a **Play transcript** button rather than auto-playing.

## 5. Active Conversation form (centre) — documented sections, in this order

Command bar: **Save** · **Refresh** · **Queue** (read-only chip "Pay Distribution") · **Start time** (read-only, `startedAt`) · **Related ▾**. Title row: "Tom Reilly" · "Active Conversation" form name · state pill (`Active` / `Wrap-up` / `Closed`).

5.1 **Customer (Contact or Account)** — enhanced card **Customer Details**: name, employee ID, email, account (link opens the account tab), pay group, work state; inline-editable fields; **Add Contact** / **Add Account** buttons shown only when no customer is linked (never, in our data).

5.2 **Conversation summary** — a **Conversation details** block with `Engagement channel: Voice`, `Waiting time: mm:ss`, `Skills: Payroll – Pay Distribution`, `Queue: Pay Distribution`, `Start time`; then tabs **Pre-chat survey** (for voice: "IVR responses": Identity = Verified (OTP), Reason = Pay not received) · **Self service** (list: "Called Strada Pay IVR", "Voice agent: checked deposit status", "Voice agent: created case CAS-10495") · **Visitor details** (`Authenticated: Yes`, Phone: +1 (614) ••• 4471, Language: English) · **Additional details** (Pay group BW-NUR, Pay date today, Return code R03).

Add a **Copilot conversation summary** card inside this section (same visual as the existing `CopilotCard`, title "Conversation summary"): one paragraph generated from the transcript so far; regenerate on each new line (debounced 2 s). Text template: "{Customer} called about {reason}. The voice agent verified identity, found {finding}, and opened {case}. {Latest representative action}."

5.3 **Case** — enhanced card **Case Details**: the linked case CAS-10495 (title, number, priority, status, owner) with inline edit; **Add Case** button when none linked. Clicking the case number opens the case as a second tab in this session (reuse `openCase` with `inSession: "current"`).

5.4 **Disposition code** — `Category` dropdown (Pay Distribution · Documents · Tax · Garnishments · Other) and `Search codes` combobox filtered by category (Pay Distribution codes: "Bank return – live check issued", "Bank return – re-deposit", "Delay – client file late", "Employee bank details incorrect"). Mandatory before the session can be closed from Wrap-up (dialog "Select a disposition code before closing" if missing).

5.5 **Recent cases** — grid of the customer's cases with colour-coded Priority and Status (reuse `Subgrid`).

5.6 **Timeline** — the existing `Timeline` component scoped by a **Linked records** dropdown (Contact · Account · Case CAS-10495); default Case.

Productivity pane (right): unchanged tools. Copilot pane, when the active tab is an Active Conversation, shows at the top a **Summarize conversation** button producing the same summary as 5.2, and the suggested-prompt chips become "Summarize conversation", "What should I say next?", "How do I handle an R03 return?".

## 6. End → Wrap-up → Closed

**End** (Communication panel): state → `Wrap-up`, `endedAt = now`, timer stops, call controls disable except **Take notes**, transcript stays visible, state pill shows `Wrap-up`, presence returns to "Available".

Immediately on Wrap-up the **Case Management Agent** runs the documented wrap-up update: a timeline **note** on CAS-10495 "Conversation summary" (aiGenerated) containing the 5.2 summary, case `aiUpdated = true`, `aiFields = ["description","status"]`, description appended with "Live check issued by courier; employee informed of BW-NUR incident." and the AI toolbar banner reads "Case Management Agent updated this case from the conversation". A toast: "Case CAS-10495 updated from conversation".

Optional **call quality survey** (documented, admin-enabled): after End show a small dialog "Rate the call quality" with 1–5 stars; for 1–4 show the predefined reasons `I couldn't hear any sound`, `Volume was low`, `The call ended unexpectedly`; Skip allowed.

Closing the session (×) in Wrap-up: require a disposition code (5.4); then state → `Closed`, `closedAt = now`, session tab closes, and the conversation appears in a new **Closed work items** group in the work-item list (collapsed by default, below the existing groups), card format: phone icon · "Tom Reilly" · "Voice · Pay Distribution" · "Closed · 00:04:12 · 2:46 PM". Clicking it reopens the Active Conversation form read-only with the full transcript (form selector shows **Closed Conversation**).

On the case CAS-10495 the existing seed activity `t14` is replaced by a **Phone Call** timeline entry generated at Closed: subject "Inbound call – Pay not received", status Closed, duration, and a **Transcript ▾** expander containing all 14 lines (reuse the chat-transcript rendering).

## 7. Home dashboard and Omnichannel dashboard

- While `Active`/`Wrap-up`, the **Omnichannel Ongoing Conversations Dashboard** grid shows one row: Customer Tom Reilly · Subject "Pay not received – R03" · Queue Pay Distribution · Channel Voice · Status; Assign/Transfer/Monitor/Copy URL become enabled when the row is selected (visual only).
- Trial home: no change.

## 8. Build order and acceptance

Phase A — model + seed + state machine + notification + Accept opens a session with Communication panel (controls visual) and transcript (no TTS).
Phase B — Active Conversation form, all six sections, Copilot conversation summary.
Phase C — representative input + TTS + sentiment; End → Wrap-up → Closed; Case Management Agent wrap-up update; Closed work items; Phone Call timeline entry with transcript.
Phase D — Omnichannel dashboard row, survey, Consult/Transfer dialogs, Dialpad.

Acceptance (run at 1600×900, Chrome):
- [ ] 8 s after load the Incoming call card appears bottom-right with Accept/Reject; Reject hides it and it returns after 5 s
- [ ] Accept opens a session tab "Tom Reilly" with Communication panel left, Active Conversation form centre, pane right; presence turns red
- [ ] Transcript shows lines 1–7 and the transfer divider; Play transcript speaks them; Hide/Show Transcript persists across reload
- [ ] Send delivers lines 9–14 in turn with spoken customer replies; sentiment icon changes after line 10
- [ ] Case Details shows CAS-10495; clicking it opens the case as a second tab; Recent cases lists Tom's cases
- [ ] End → Wrap-up: controls disabled, Case Management Agent note appears on CAS-10495 with the AI banner, toast shown
- [ ] × without a disposition code is blocked with the dialog; with a code the session closes, Closed work items shows the conversation, CAS-10495 Timeline has a Phone Call entry with a 14-line Transcript expander
- [ ] × during Active (not after End) returns the conversation to Open and the notification reappears
- [ ] `npx tsc --noEmit` clean; `npm run build` ≤ 800 KB; no console errors

## 9. Items to confirm from the chat-tour screenshots before Phase A

- Exact notification card layout, wording and button order **[verify]**
- Communication panel proportions and where the controls row sits (top vs bottom) **[verify]**
- Active Conversation form: whether the enhanced (card) or default layout is shown in the trial, and the order/labels of the cards as rendered **[verify]**
- Wrap-up visual state and whether a survey dialog appears **[verify]**
- Whether the session tab shows the customer name or the channel name **[verify]**

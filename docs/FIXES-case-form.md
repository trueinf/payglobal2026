# Fix spec — Case form, Summary tab (Copilot pane open)

Project: `strada-d365` (Vite + React 18 + TypeScript + Fluent UI v9). Reference: real D365 Copilot Service workspace case form, Oct 2026 trial.
Run `npx tsc --noEmit` and `npm run build` after each item; no new dependencies. Files: `src/components/CaseForm.tsx`, `src/components/ProductivityPane.tsx`, `src/styles.css`.

---

## 1. Dropdown fields show a single chevron, not native select arrows (required)

**Where:** `CaseForm.tsx` → `Sel` component (used by Priority, Case Status, Origin in the header flyout, Type, Escalated, First Response Sent).

**Current:** native `<select>` with `appearance: auto` renders the macOS double-arrow (⇕) at the right of the row.

**Target (real app):** the value text on the left and one `ChevronDown16Regular` at the right edge of the field box; clicking anywhere on the row opens the native option list.

Implementation:
- In `Sel`, render `<span className="selwrap">` containing the `<select>` styled `appearance: none; -webkit-appearance: none; width: 100%; padding-right: 24px;` and an absolutely positioned `<ChevronDown16Regular />` at `right: 8px`, `pointer-events: none`.
- `.selwrap { position: relative; flex: 1; display: flex; align-items: center; }` in `styles.css`.
- Keep the `select` fully functional (onChange unchanged).

**Accept:** Priority row reads `■ Low` with one ⌄ at the far right; no ⇕ glyph anywhere on Summary or Details.

## 2. Case Status row: pill + chevron only (required)

**Where:** `CaseForm.tsx` → the `Row label="Case Status"` line.

**Current:** pill `In Progress` on the left, placeholder text `Change status…` and ⇕ on the right.

**Target:** pill on the left, a single ⌄ at the right edge, nothing else. Clicking the row opens the status options (In Progress, On Hold, Waiting for Details, Researching). Remove the `value === ""` placeholder branch from `Sel` once no caller relies on it.

Implementation: make the whole `.fval` a `position: relative` container with an invisible full-size `<select>` overlay (`opacity: 0; position: absolute; inset: 0; cursor: pointer`) and render the pill + chevron underneath. Same overlay pattern may be reused for item 1 if simpler.

**Accept:** no visible text other than the pill; status changes still work and the pill updates; `Resolved` renders the green pill variant.

## 3. Description editor (required)

**Where:** `CaseForm.tsx` → Description row; `styles.css`.

- Hide the native resize handle: add `resize: none` on the `Textarea` (prop `resize="none"`) and `textarea { resize: none; }` for the fallback.
- Toolbar: match the real rich-text toolbar order and set: **Font ▾ · Size ▾ · B · I · U · ¶ (align) · bullet list · numbered list · link · ⋯**. Icons available in `@fluentui/react-icons`: `TextFont16Regular`, `TextFontSize16Regular`, `TextBold16Regular`, `TextItalic16Regular`, `TextUnderline16Regular`, `TextAlignLeft16Regular`, `TextBulletListLtr16Regular`, `TextNumberListLtr16Regular`, `Link16Regular`, `MoreHorizontal16Regular`. Buttons are visual only (no editor behaviour needed).
- Editor min-height 120 px, border `1px solid var(--line2)`, toolbar background `#fafafa` (already so).

**Accept:** no resize grip at the bottom-right of the Description box; toolbar shows the ten controls in that order.

## 4. Copilot pane prompt chips are unstyled (required)

**Where:** `ProductivityPane.tsx` → `CopilotPane`, the three suggested prompts above the "Ask a question" input ("Summarize this case", "What are the next steps?", "How do I handle an R03 return?").

**Current:** they render as plain text because the `.cite` style is scoped to `.pane .msg .cite` in `styles.css`.

**Target:** pill chips — `border: 1px solid var(--line2); border-radius: 12px; padding: 2px 10px; font-size: 13px; color: var(--blue); background: #fff; cursor: pointer; white-space: nowrap;` wrapping onto two lines if needed, 6 px gap. Clicking a chip fills the input (existing behaviour) **and submits** it, so the demo is one click.

Implementation: add `.pane .chip-prompt { … }` to `styles.css`, use that class in the footer, and call `ask()` after `setQ(p)` (pass the text directly to avoid the state lag: refactor `ask(text?: string)`).

**Accept:** three outlined chips above the input; clicking one shows the question as a user bubble and the answer with citations within ~1 s.

## 5. Priority glyph (optional)

**Where:** `CaseForm.tsx` → Priority row.

The real app shows a small coloured priority icon before the value. Ours is a 10 px square. If closer fidelity is wanted, use `Flag16Filled` from `@fluentui/react-icons` coloured `#c4314b` (High), `#0f6cbd` (Normal), `#8a8a8a` (Low). Default: leave the square.

## 6. Verified as matching — do not change

Command bar (collapsed variant), header card and expand flyout, tab bar with Form assist placement, Due and Overdue Activities card, field block order and lookup chips, Case summary card, Copilot pane header, empty state and the two info rows, work-item list grouping and card lines, session tab with wrench icon and ×, right rail active indicator.

---

### Verification checklist

- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds
- [ ] Open CAS-10449 (Address change) with the pane open: Priority and Case Status rows show one ⌄ each, no placeholder text, no resize grip, ten toolbar controls
- [ ] Details tab: Type, Escalated, First Response Sent rows show one ⌄ each
- [ ] Header expand flyout: Origin row shows one ⌄
- [ ] Copilot pane: three chips; clicking "How do I handle an R03 return?" answers with KA-01041 and KA-01044 citations
- [ ] Collapse the pane: two-column Summary still renders; Save & Route / Resolve Case visible in the command bar

# Fix spec — Home dashboard (Customer Service Representative Dashboard)

Project: `strada-d365` (Vite + React 18 + TypeScript + Fluent UI v9). Single-file build via `npm run build` → `dist/index.html`.
Reference: the real Dynamics 365 Copilot Service workspace (Oct 2026 trial) screenshots; see `docs` link in the Demo Guide for the screen inventory.

All changes below are confined to the Home dashboard screen unless stated. Run `npx tsc --noEmit` and `npm run build` after each item; no new dependencies.

---

## 1. Truncate dashboard tab labels (required)

**File:** `src/components/HomeDashboard.tsx` — the `.dtab` elements in the `<div className="card dtabs">` strip.

**Current:** full labels render ("Customer Service Representative Dashboard", "Omnichannel Ongoing Conversations Dashboard").

**Target (matches the real app):** labels are clipped with an ellipsis at roughly 24 characters; full name shown as a native `title` tooltip.

- Render the label text in a `<span className="t">` inside each `.dtab`.
- Add CSS in `src/styles.css`:
  ```css
  .dtab .t { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  ```
- Set `title={fullLabel}` on each `.dtab`.
- "Trial home" is short and stays untruncated; it has no icon (already the case).

**Accept:** at 1600 px width the strip reads `Trial home | 📊 Customer Service Represe… | 📊 Omnichannel Ongoing Co…`; hovering shows the full name.

## 2. Tighten grid row height so the second grid is visible on load (required)

**File:** `src/styles.css`, selectors `table.dg th`, `table.dg td`, and the `.grid .hd` header.

**Current:** rows are ~52 px; at 900 px viewport height the "Rows: 1 - N of N" pager and the "Cases Available to Work On" header sit below the fold.

**Target:** rows ~40 px (real app). Change `table.dg td` and `table.dg th` padding from `10px 12px` to `6px 12px`; keep font-size 14 px. Reduce `.az span` padding from `6px 0` to `4px 0`.

**Accept:** at 1600×900 with 11 active cases, the A–Z bar, the "Rows: 1 - 11 of 11" pager and the header row of "Cases Available to Work On" are all visible without scrolling. The case form's subgrids (`.subgrid .row`) are unaffected.

## 3. Pager text format (required)

**File:** `src/components/HomeDashboard.tsx`, the `<div className="pg">` under each grid.

**Target:** every dashboard grid uses exactly `Rows: 1 - {n} of {n}` on the left and `⏮ ← Page 1 →` on the right (already true for the first two grids; the third grid "My Open Activities" has no pager icons — add them so all three match).

## 4. Case title disambiguation (optional — decide before applying)

Four cases share the title "Pay not received – direct deposit returned (R03)". This is realistic for agent-created cases and supports the incident storyline. If the demo owner prefers distinct titles:

**File:** `src/data.ts`, cases `k1`, `k3`, `k4`, `k5`.

Append the employee's surname: `Pay not received – direct deposit returned (R03) – Whitfield` (Ortega, Brown, Reilly). Nothing else references the title string, so no other change is needed. The Demo Guide steps that name the case still match by prefix.

Default: **do not apply** unless told.

## 5. Presenter persona (optional — decide before applying)

The representative is "Priya Natarajan", avatar `PN`, owner of all cases.

To present as a different person, change in one place: `src/data.ts` → `export const OWNER = "Priya Natarajan"` and the avatar initials in `src/App.tsx` (`<span className="avatar">PN</span>` — derive from `OWNER` with `initials()` from `src/util.ts` instead of hard-coding). `src/store.tsx` and several components compare `c.owner === "Priya Natarajan"` literally — replace those literals with the `owner` export from `src/store.tsx` so the rename is a single edit. Also update the signature lines in `src/components/ProductivityPane.tsx` (`draftEmail`) and the hard-coded `"Priya Natarajan"` strings in `src/components/Timeline.tsx`, `CaseForm.tsx`, `EmailView.tsx`, `NewCaseDialog.tsx`, `ContactForm.tsx`, `HomeDashboard.tsx`, `CaseListTab.tsx`, `WorkItemList.tsx`.

Default: **keep Priya** unless told.

## 6. Out of scope for this spec

- The red "issue setting up presence" banner in the trial is a trial-tenant error; do not replicate.
- The real grid's horizontal scrollbar (Created On clipped) — ours fits the column; leave as is.
- Omnichannel and Trial home tabs — reviewed separately.

---

### Verification checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds; `dist/index.html` under 700 KB
- [ ] Home at 1600×900: tab labels truncated, three grids with the second grid's header visible, pagers identical
- [ ] Case form, Inbox and productivity pane unchanged (open CAS-10492 and confirm Summary two-column layout with the pane collapsed)

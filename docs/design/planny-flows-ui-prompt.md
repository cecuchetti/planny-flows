# UI Design Prompt — Planny Flows

> Paste everything below into the UI generator. It describes the product as a user experiences it, the screens, the interactions, the visual language, the content and the states. It is written to be self-contained: no prior context about the application is needed.

---

## 1. Your task

Design the complete interface for **Planny Flows**, a modern web application that works as a single workbench for an individual professional. The product combines three things in one shell:

1. A **Jira proxy**: tickets assigned to the user, pulled from one or two real Jira (Atlassian) instances, shown on a Kanban board, with the ability to log time, comment, close and update them.
2. A **local Kanban board** for quick, lightweight issues that live only inside this app.
3. An optional **personal loans manager** ("Préstamos") for tracking money lent to people: borrowers, loans, payments, balances and printable receipts.

The visual result should feel like a calm, professional, slightly premium productivity tool — closer to Linear, Notion and modern Asana than to classic enterprise Jira. Dense with information but never cramped; violet/indigo accents; soft pastel status colors; generous white cards floating over a very subtle pink-to-lavender page gradient. It must look designed by one team: one type scale, one spacing rhythm, one component set, one palette.

Deliver a **desktop-first design (1440 px)** with a matching **mobile layout**, plus a **UI kit / design-system page** showing the tokens and reusable components used across the screens. The interface language is **English** by default, with a working **EN / ES** switch; the loans module is written in **Spanish (Argentine "voseo")** and keeps that voice.

Do not invent product areas beyond what is described here. Do not add a marketing landing page, a pricing page, an onboarding wizard or a login screen — the user is signed in automatically as a guest when the app opens.

---

## 2. Product context (for tone and content)

**Who uses it.** One person — a consultant, developer or operator — who works across an internal and an external Jira instance and also lends money privately. They live in this app all day. They want to see their assigned tickets, move work forward, log hours, clean up their mailbox, and keep a private ledger, without switching tools.

**Mental model.** A single "project shell" with a left navigation rail, a secondary sidebar, a dark page header and a white content card. Everything else — the board, quick actions, settings, loans, people, receipts — is a view inside that shell.

**What the user cares about.**
- "What is assigned to me right now, and what state is it in?"
- "How many hours did I log today / this week?"
- "Did my changes go through, and did Jira sync?"
- "Who owes me, how much is left, and can I hand them a proper receipt?"

**Tone of the UI.** Professional, quiet, precise. Short labels in sentence case, no exclamation marks, and confirmation toasts phrased as a plain statement ("Time entry saved."). Spanish copy in loans uses informal voseo ("Elegí una persona", "No pudimos cargar… Intentá de nuevo") — the receipt itself switches to a formal legal register ("Pagado a", "Valor: (en letras)", "Firma de recibido").

---

## 3. Visual foundations

### 3.1 Color

Use these tokens as the single source of truth:

| Token | Value | Use |
|---|---|---|
| Primary | `#3b6cf0` | Primary buttons, links, focus rings, selected states |
| Violet accent | `#7c3aed` | Brand accent, loans, receipt header, hover borders |
| Success | `#16a34a` | Success toast, completed states |
| Danger | `#dc2626` | Destructive actions, errors |
| Warning | `#d97706` | Warnings, pending states |
| Text darkest | `#111827` | Titles, primary text |
| Text dark | `#374151` | Body text |
| Text medium | `#6b7280` | Secondary text, meta labels |
| Text light | `#9ca3af` | Placeholders, issue keys, overline labels |
| Border lightest | `#e5e7eb` | Card borders, dividers |
| Border light | `#d1d5db` | Inputs, outlined controls |
| Card surface | `#ffffff` | Cards, panels, modal surfaces |
| App surface | `#f0f2f5` | Secondary sidebar |
| App page background | Linear gradient `135°`, `#fce7f3` → `#ede9fe` | The whole app canvas, fixed attachment |
| Header gradient | Linear gradient `135°`, `#1c1f2e` → `#2d2060` | Page top bar and mobile drawer header |
| Receipt band | `#7c3aed` | The printed receipt's title band |

Pastel status palette — always a soft tinted background with a darker saturated text of the same family, never a solid fill:

- Backlog: bg `#f3f4f6`, text `#374151`
- Selected for development: bg `#ede9fe`, text `#6d28d9`
- In progress: bg `#dbeafe`, text `#1d4ed8`
- Done: bg `#dcfce7`, text `#15803d`
- Success notice: bg `#dcfce7`, text `#166534`, border `#86efac`
- Warning notice: bg `#fef3c7`, text `#92400e`, border `#fcd34d`
- Error notice: bg `#fef2f2`, text `#991b1b`, border `#fecaca`
- Violet chip: bg `#ede9fe`, text `#6d28d9`

Priority strip colors on cards: Highest `#ef4444` (red), High `#f97316` (orange), Medium `#eab308` (yellow), Low `#14b8a6` (teal), Lowest `#94a3b8` (slate).

Jira statuses use their own pastel pairs so real workflow names read correctly: Open `#dbeafe/#1e40af`, Code review `#ede9fe/#6d28d9`, Pending QA `#ffedd5/#c2410c`, Dev in progress `#dcfce7/#15803d`, Pending deployment `#cffafe/#0e7490`, Clarification needed `#fef9c3/#854d0e`, Closed `#f3f4f6/#4b5563`, plus types: Bug `#fee2e2/#b91c1c`, Task `#dbeafe/#1e40af`, Story `#dcfce7/#166534`, Epic `#ede9fe/#6d28d9`, Improvement `#fce7f3/#9d174d`, New feature `#f3e8ff/#7e22ce`, Sub-task `#f3f4f6/#4b5563`.

### 3.2 Typography

- Primary family: **Circular Std** (Book / Medium / Bold / Black); acceptable substitute: **Inter**.
- Page title: 22–24 px, bold, near-black.
- Section title: 16 px, bold.
- Body: 15 px, regular, line-height 1.5.
- Body small: 14 px.
- Caption / meta: 13 px.
- Overline: 11 px, uppercase, letter-spacing 0.08em, medium — used for "PRINCIPAL" and "MÁS" sidebar section labels and form section titles.
- Issue keys and configuration keys: 11–13 px, medium, letter-spacing 0.01em, and for settings keys a monospace stack (`ui-monospace, SFMono-Regular, Menlo`).
- Titles never exceed two lines in cards; truncate with an ellipsis.

### 3.3 Shape, spacing, elevation

- Radius: 6 px (small chips, key badges), 10 px (buttons, inputs, cards, nav items), 16 px (main content card, modals, receipt), 999 px (pills, avatars, counters).
- Base spacing unit: 4 px. Recurring rhythm: 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48.
- Page background: pink → lavender gradient visible around a single large white card. The card has a 16 px radius and a soft shadow: `0 10px 25px -5px rgba(0,0,0,0.08), 0 4px 10px -5px rgba(0,0,0,0.04)`.
- Card hover: border turns violet (`#c4b5fd`) and the shadow warms to `0 4px 16px rgba(109,40,217,0.10)`, lifting 1 px.
- Modal overlay: `rgba(15,23,42,0.35)`, centered modals with 50 px padding on desktop.
- Subtle motion only: 120–200 ms ease transitions for hover, drag, drawer, toast; respect `prefers-reduced-motion`.

### 3.4 Iconography and imagery

- Navigation uses **emoji inside colored rounded squares** (32 × 32, radius 8, colored background, subtle inner highlight and shadow): 👥 People (violet `#7c3aed`), 📋 Kanban Board (blue `#2563eb`), 💸 Loans (violet `#7c3aed`), 🔧 Quick actions (green `#059669`), ⚙️ Settings (slate `#475569`). Disabled entries use gray `#94a3b8` at 38% opacity.
- Inside the product, control icons are **thin line icons** (search, plus, help, close, chevron-down, arrow-down, trash, reports, calendar, page, stopwatch, task, link, bug, github, feedback, alert).
- Avatars: circular, 20–38 px, images from Jira when available, otherwise a colored initial fallback.
- No illustrations except: a soft "no search results" empty-state illustration, the bug icon on the error page, and a scanned handwritten signature image on the receipt.

---

## 4. Application shell

### 4.1 Desktop layout

The app fills the viewport. From left to right:

1. **Icon rail (fixed, 64 px wide, white, 1 px right border, subtle shadow).**
   - Logo at the top (small brand mark).
   - "Search issues" item (search icon).
   - "Create Issue" item (plus icon).
   - Bottom: language switch (`EN` / `ES` as small outlined pills, active one blue-tinted), and an "About" item (help icon).
   - **Hover behavior:** the rail expands to 200 px, revealing uppercase 13 px labels next to each icon; the language pills slide into view; shadow deepens. This is the only navigation on the far left.

2. **Main canvas.** Padded 24 px around a single white content card (radius 16, soft shadow, min-height `calc(100vh - 72px)`). The pink/lavender gradient shows in the padding.

3. **Page top bar (inside the card, full width).** Dark gradient (`#1c1f2e → #2d2060`), 14 px vertical padding, 24 px horizontal:
   - A 38 px rounded-square "project avatar" tile with a pin emoji, on a pink→violet gradient with a violet glow.
   - Project name in white, bold, 15 px, single line.
   - Project category beneath it in 50% white, 13 px ("Software", "Marketing", "Business").
   - On tablet/mobile, a 3-line hamburger button sits at the far left of this bar.

4. **Body row:** secondary sidebar + main content.

5. **Secondary sidebar (268 px, `#f0f2f5`, right border `#dde1ec`, scrollable).**
   - Section label "PRINCIPAL" in 11 px uppercase, light gray. (The two section labels stay Spanish in the current app; keep them as a fixed design detail.)
   - Items (32 px emoji tile + 15 px medium label, 11 px/14 px padding, radius 10):
     - 👥 People — `/project/loans/borrowers` (only when the loans module is enabled)
     - 📋 Kanban Board
     - 💸 Loans (only when enabled)
   - Divider.
   - Section label "MÁS".
   - Items: 🔧 Quick actions; then three **disabled** placeholder rows at 38% opacity: 🔍 "Issues and filters", 📄 "Pages", 📊 "Reports"; then ⚙️ "Settings".
   - Active item: light gray-blue background (`#eaecf4`), same text color, icon tinted indigo. Hover: `#eef0f5`.

6. **Main content area.** Scrolls independently; 24 px top, 32 px right, 48 px bottom, 40 px left padding. This is where each view renders, and it always starts with a page header (title + optional subtitle) except on the board, which starts with breadcrumbs.

### 4.2 Mobile / tablet (≤ 768 px)

- Icon rail is hidden. The shell becomes full-bleed: no outer padding, no card radius.
- The dark top bar remains (56 px tall) with the hamburger, project tile, name and category.
- The sidebar becomes a **280 px slide-in drawer** from the left with a dark gradient header ("☰ Menu"), the nav sections, and at the bottom a centered EN / ES switch. A dimmed backdrop closes it.
- The main content padding drops to 16 px.
- Board columns become 280 px wide and scroll horizontally; the board's own header buttons may wrap or collapse to icons.
- The issue view becomes a full-screen sheet; its two columns stack (title/description/comments first, metadata second).

### 4.3 First run and authentication

There is no login screen. Opening the app shows a centered spinner ("loading") for a moment while a guest session is created silently, then lands on the board. If the session already exists, the app goes straight in.

---

## 5. Global components and behaviors

- **Buttons.** 34 px tall, radius 10, 14 px medium text; variants:
  - `primary`: solid `#3b6cf0` with white text.
  - `danger`: solid red for destructive submits (e.g. "Close issue").
  - `secondary`: light gray fill.
  - `empty` / outlined: white fill, 1 px `#e5e7eb` border, dark text — the default for secondary actions and toolbar buttons.
  - Disabled: 60% opacity. Busy: inline spinner replaces/augments the label ("Syncing…", "Saving…", "Testing…").
  - Icon-only close buttons in modals: 25 px glyph, top-right.
- **Toasts.** Fixed top-right (30 px from right, 50 px from top), 300 px wide, dark-green/red/dark surface with white text, title line plus optional message, close icon, click to dismiss. Used for every save/error confirmation. Examples: "Changes have been saved successfully.", "Issue has been created.", "Time entry saved.", "Préstamo registrado.", "No pudimos cargar las personas. Intentá de nuevo."
- **Page loader.** Centered animated spinner in the content area, with a soft background, used whenever a full page's data is loading.
- **Page error.** Full-page soft forest-photo background with a centered white panel: bug icon, "There's been a glitch…", explanatory paragraph, link to a help center. Used for unknown routes and failed page loads.
- **Modals.** Two families:
  - Centered modal (default): white, 16 px radius, overlay 35% blue-black, width per screen (460–1040 px), scrollable body, close icon.
  - **Aside modal**: anchored to the right edge, full viewport height, 600 px wide, shadow on the left, close button outside the panel — used for the issue search.
- **Optimistic updates.** Dragging an issue, changing a field or deleting updates the board immediately; errors roll back and show a red toast.
- **Search / select / date fields.** Shared controls: debounced search input with search icon and inline spinner; multi-select with removable avatar chips; single select with a dropdown; a calendar date picker; a separate free-text time field ("4:30 PM" default, parsed leniently).
- **Accordions.** White card sections with a bold 16 px title, an optional 14 px subtitle, a chevron, a warning-tinted count badge when there are unsaved changes, and their content revealed beneath. Used on Settings.
- **Confirmation dialogs.** Small centered modal: title, one-sentence consequence, Cancel + confirm (red for destructive, primary for neutral). Used for deleting issues/comments/loans/people, closing/reopening loans, reversing payments.
- **Internationalization.** EN / ES switch in the rail and mobile drawer. All labels, empty states and toasts are translated; loans remain Spanish in both modes. Dates are localized ("Mon 3 Nov", "3 Nov 2026", conversational "Created at 3 Nov 2026, 14:05").
- **Keyboard / accessibility.** Visible focus ring (2 px `#3b6cf0`, offset 2), Escape closes modals, autofocus in search contexts, ARIA labels on icon-only controls, `aria-invalid` and described-by on invalid fields, reduced-motion support.

---

## 6. Screen: Kanban Board

The operational home. It mixes synced Jira issues and local issues on one board.

### 6.1 Page header and controls

- Breadcrumb, 13 px light gray: **Projects / {project name} / Kanban board**. Project name is "All Projects" when several projects are merged.
- Row below: "Kanban board" as a 15 px bold heading on the left; on the right:
  - **Sync now** outlined button with a down-arrow icon. While syncing, spinner + "Syncing…" and disabled.
  - **Github Repo** outlined button with the GitHub icon, opens a new tab. Secondary/quiet styling.
- **Project filter block** (only when projects exist):
  - Label "Filter by Project", 13 px medium gray.
  - A multi-select, max-width 400 px, placeholder "Select projects…", options prefixed with a source icon: 🔗 for Jira-sourced projects, 📌 for local ones.
  - Under it: "Showing 2 of 5 projects" in 13 px; when not all are selected, a blue text link "Show all".
  - If the user deselects everything: no columns; centered message "Select at least one project" with 48 px padding.
- **Filter bar**:
  - Search input (icon left) with placeholder "Search issues by summary, description…".
  - A row of circular user avatars; clicking toggles that person as a filter (active state = violet ring).
  - Toggle buttons: "Only My Issues" and "Recently Updated" (active = blue-tinted background + blue text).
  - When any filter is active, a text link "Clear all" appears at the end.

### 6.2 Columns

- Four columns, in this order by default: **Backlog**, **Selected for development**, **In progress**, **Done**.
- Columns are 25% width (310 px fixed on smaller screens), transparent backgrounds, 6 px horizontal gaps, horizontally scrollable with a thin custom scrollbar.
- Column header: 15 px bold dark text + a small pill counter (20 px, gray bg, 13 px). When filters hide items, the counter reads "2 of 7".
- The entire column header is a drag handle: columns can be reordered horizontally, and the new order persists per browser.
- Cards stack vertically with 10 px gaps; the column has a large min-height so empty columns still read as drop targets.
- Drop feedback: subtle highlight on the hovered column, placeholder gap where the card will land.

### 6.3 Issue cards

White card, radius 10, 1 px `#e5e7eb` border, soft shadow, compact padding (11 × 13 px). Anatomy, top to bottom:

1. **4 px accent strip** at the top-left, only 40% of the card width, color = priority (red/orange/yellow/teal/slate).
2. **Issue key** in 13 px light gray, medium — e.g. `VIS-2`, `OPS-142`, or `PRJ-31` for local issues.
3. **Title** in 14 px near-black, max two lines, ellipsis.
4. **Badge row**: 1–2 pills, 13 px medium, pastel background + saturated text:
   - Board issues: status ("Backlog", "In progress", "Done") and type ("Task", "Bug", "Story").
   - Jira issues: the real Jira status (e.g. "Code review", "Pending deployment", "Clarification needed") and the real type ("Bug", "New feature", "Improvement"), tinted by the mapped board status so the column reads consistently.
5. **Bottom row**: overlapping assignee avatars (22 px, −4 px overlap, 2 px white ring), right-aligned or left, up to 3.

Interaction: whole card is a link to the issue; hover lifts 1 px and warms the border to violet; while dragging the card tilts 1.5°, lifts 2 px, and casts a strong shadow. Dragging between columns changes status; dragging within a column reorders. Jira cards are placed before local cards within a column, newest first.

**Empty column:** the header and count remain, with blank space beneath. No illustration.

---

## 7. Screen: Issue detail (modal)

A large centered modal, **1040 px wide**, white, 16 px radius, with its own scrolling body. It opens from a card or a reference and is reachable at `/project/board/issues/{id}`.

### 7.1 Top action bar

Left: a **type/key button** showing the issue type icon and the key (`Task-31`, `VIS-2`) in an outlined pill; it opens a dropdown to change the type.

Right, in order:
- "Give feedback" text button with feedback icon.
- "Copy link" outlined icon button.
- "Delete" (only for local issues) — destructive confirmation.
- For Jira issues only: a primary **"Log Time"** button with a stopwatch icon, and a text link "View in Jira ↗".
- Close (×) icon.

### 7.2 Read-only Jira banner

For synced Jira issues, immediately under the action bar, a full-width violet notice strip: link icon, "Read-only — Jira issue", and the external key (`VIS-2`) right-aligned. It tells the user the content is mirrored from Jira and cannot be edited here (except time logging).

### 7.3 Body — two columns

**Left column, 65%:**

- **Title** as an editable large heading (22 px, medium). Click to edit inline; Enter saves, Escape cancels.
- **Description**: rendered rich text; click to open an inline editor with Save / Cancel. Empty state "Add a description…" in light gray.
- **Comments**:
  - Section heading "Comments" in 11 px uppercase.
  - A composer at the top: avatar + multi-line textarea with placeholder "Add a comment…", a subtle tip about markdown, and a "Save" button that appears when typing.
  - Comments newest first: avatar, author name (bold 14 px), relative or conversational timestamp, formatted body, and hover-revealed "Edit" / "Delete" actions. Editing opens an inline editor with Save / Cancel. Delete asks for confirmation ("Are you sure you want to delete this comment?" / "Once you delete, it's gone for good.").

**Right column, 35%** (separated by spacing, labels uppercase 11 px above each control):

- **Status**: an outlined select showing a colored dot/word; options Backlog, Selected for development, In progress, Done.
- **Assignees**: multi-select with removable avatar + name rows; placeholder "Unassigned".
- **Reporter**: single select with avatar + name.
- **Priority**: select with the priority icon and label (Highest / High / Medium / Low / Lowest).
- **Estimate / tracking widget**: a light gray rounded panel containing a stopwatch icon, a horizontal progress bar, and two lines: "6h logged" and "2h remaining" (or "8h estimated", or "No time logged").
- **Dates**: "Created at 3 Nov 2026, 14:05" and "Updated at 6 Nov 2026, 09:12" in 13 px light gray.

### 7.4 Log Time panel (Jira issues)

When "Log Time" is clicked, a panel appears in the right column (or as a 460 px modal from the board): title "Log Work", issue key badge, issue summary.

Fields:
- "Hours Logged *" — text input, placeholder "ej. 2h, 1h 30m, 2.5", hint "Use format: 2h or 2 h (h = hour), e.g. 2.5h or 1h 30m". Validation messages in red: required, invalid format, must be greater than zero.
- "Date and Time *" — calendar date + a separate time field defaulting to "4:30 PM"; both required, invalid time message.
- "Description" — optional single-line/free text, max 5000 chars, placeholder "Optional description".
- Actions: a red **"Close issue"** button on the left, when the current workflow allows closing (shown only for in-progress/pending-deployment issues); right-aligned *Cancel* (outlined) and *Save* (primary, busy state "Saving…").
- On success: green toast "Time entry saved."; the issue refreshes.

---

## 8. Screen: Create Issue (modal)

Centered modal, **800 px** wide, no visible close icon — Cancel is the escape. A single form with generous vertical rhythm:

- Heading "Create issue" (bold, 16 px).
- **Issue Type** select: Task / Bug / Story, each option with its colored type icon.
- Divider.
- **Short Summary** — single-line input; tip under the label: "Concisely summarize the issue in one or two sentences."
- **Description** — rich-text editor with placeholder "Describe the issue in as much detail as you'd like."
- **Reporter** — select of project users with avatar rows; defaults to the current user.
- **Assignees** — multi-select of project users with avatar chips.
- **Priority** — select with the five priority icons and labels; defaults to Medium.
- Footer: primary "Create Issue" (busy state) and outlined "Cancel".
- On success: green toast "Issue has been successfully created.", close, board refreshes.

---

## 9. Screen: Search issues (aside modal)

A 600 px panel sliding from the right, full viewport height, white, shadow to the left, with the × outside the panel at top-right.

- Large search input at the top, autofocused, search icon on the right, inline spinner while querying, placeholder "Search issues by summary, description…".
- **Empty query:** section label "Recent Issues", then up to 10 rows: type icon (25 px), title (14 px), and a small `type-id` line (e.g. "bug-42") in light gray. Rows are links; hover tints the row.
- **With query and results:** "Matching Issues", same rows.
- **No results:** centered illustration, "We couldn't find anything matching your search" (bold 16 px), and "Try again with a different term." (13 px gray).
- Clicking a row opens the issue detail modal.

---

## 10. Screen: Quick actions

A page of large action cards, one click away from recurring chores. Title "Quick actions" (24 px bold) with no subtitle, then a responsive grid (`repeat(auto-fill, minmax(280px, 1fr))`, 20 px gaps, 24 px top margin).

Each card is a white tile (radius 8, 2 px `#d1d5db` border, 20 px padding, left-aligned):
- 40 px icon tile, radius 8, colored: red for Outlook, violet for report/log hours, green for calendar, gray for archive.
- Title (16 px bold).
- Subtitle (13 px gray, 1.4 line-height).
- Optional status pill under the subtitle (hours logged today, or a fetch error).
- Hover: border turns primary blue, blue-tinted shadow. Disabled while another action is running.

Cards:

1. **Clean MS Outlook** — trash icon on red. Subtitle "Trigger the Outlook cleaner service to clean your mailbox."
   - Click runs in the background: an immediate toast "Outlook clean is running in the background. You will be notified when it finishes.", card shows a busy state, polling up to ~90 s. Success toast "Outlook clean completed successfully."; failure "Outlook clean failed after 5 attempts: {message}".
2. **Log Hours to Tempo** — reports icon on violet. Subtitle "Log hours to Tempo for ticket VIS-2".
   - Shows a pill when hours already exist today: "{n} hours logged" (green when the day is complete, amber otherwise); a spinner while loading; a red "Could not load hours" pill on failure.
   - Opens the **Tempo Export** modal: 480 px, violet gradient header with a key badge `VIS-2`, title "Tempo Export", summary "Export time entries for internal Jira instance to Tempo".
     - **Duration** — placeholder "e.g. 2h, 2 h, 2.5h, 1h 30m", hint under it.
     - **Date and Time** — date + time; defaults to today 4:30 PM; changing the date refetches that day's hours.
     - **Description** — optional, placeholder "Optional description".
     - **Warning banner** when the day already has ≥ 8 hours: "8 hours have already been logged for this date. Are you sure you want to continue?" (amber, ⚠️).
     - Footer: Cancel + primary **Confirm** (busy "Registering…"). Success toast "Tempo export completed successfully.", then the card's hours refresh.
3. **View Tempo Hours (VIS-2)** — calendar icon on green. Subtitle "View and confirm Tempo hours for VIS-2 this week".
   - Opens a **700 px** weekly modal: header with key badge `VIS-2`, title "Tempo Hours (VIS-2)", subtitle "Tempo hours logged for VIS-2 this week".
   - Seven day cards Mon → Sun in a 7-column grid: weekday abbreviation, large day number (20 px), numeric input (step 0.5, 0–24). Today's card is highlighted; future days are disabled/dimmed; past days with 0 hours are tinted as incomplete.
   - Each card shows a small status pill: ✓ Complete (8+ h, green), ⏱ In progress (>0, amber), ? Incomplete (0, red/gray).
   - Inputs save on blur or Enter with a per-day spinner and a green toast "Hours updated successfully.".
   - Total row at the bottom: "Week total" and the sum in bold ("32.5h"), with a green ✓ when ≥ 40 h.
   - Footer: only a "Close" outlined button.
4. **Archive old items** — page icon on gray. Subtitle "Archive old issues and comments (placeholder)." Clicking shows a neutral toast "This action is not implemented yet." and must not look broken — muted "coming soon" treatment is acceptable.

---

## 11. Screen: Settings

Two areas on one page: the project's own details, then the application configuration.

- Page header: "Settings" (24 px bold) + subtitle "Project details and the runtime configuration the application uses." (14 px gray, max 720 px).
- **Project details accordion** (open by default): title "Project details", subtitle "Name, URL and category shown on the board." Fields: Name, URL, Description (rich text), Project Category (Software / Marketing / Business). Primary "Save changes" at the bottom-left; success toast.
- **Runtime configuration** — visible only to administrators. Intro: "Runtime configuration" and the explanatory line "Values stored here take precedence over the environment. Clearing one returns it to the environment, and then to its default."
  - If no master key is configured, an amber left-bordered notice: "No MASTER_KEY is configured, so secrets cannot be stored. Set it in the environment before saving any credential."
  - One accordion per group, in this order: **Database, Jira, Integrations, Quick actions, Sync, Authentication, Bootstrap** (Bootstrap carries environment-only values such as the admin email and master key).
  - Each group may show a warning notice at the top: "Saved. These take effect after a restart: {keys}".
  - Each setting is a two-column row (240 px meta + flexible control), separated by hairlines:
    - Label (14 px medium near-black), the dotted key in 11 px monospace light gray (e.g. `sync.interval_minutes`), optional help text (12 px gray).
    - Badges: source — "Set here" (green), "From environment" (blue), "Default" (gray), "Not set" (amber); plus "Needs restart" (amber) and "Secret" (amber).
    - Control: text input, number input, select, or password. Secrets never echo a value: placeholder "Stored — type to replace" or "Not set".
    - When a value is saved but awaiting restart: "Pending after restart: {value}" in 12 px gray under the control.
    - Database group only: a small blue text link "Test connection" under the input, busy label "Testing…", and a result strip: green "Connection succeeded in {n} ms." or a red monospace error detail.
  - Each accordion's footer: primary "Save changes" (disabled if nothing changed) + gray hint "No changes to save". Unsaved edits are counted in the accordion header as a small amber badge ("2 unsaved changes"). Saving one section never discards edits in another.
  - Values that come from the environment or from code defaults are shown with their source badge rather than hidden; editing them here turns them into "Set here" values on save.

---

## 12. Screen: Loans ("Préstamos") — optional module

A private lending ledger inside the same shell, with the same sidebar and content width. All copy is Spanish (voseo).

### 12.1 Landing page

- Page header: **"Préstamos"** (title) and subtitle **"Préstamos, personas y pagos, dentro del mismo tablero."**
- Then, stacked: the **Resumen** section, then the **Préstamos** list.

**Resumen (read-only portfolio summary).**

- Section card title "Resumen".
- If empty: "Todavía no hay datos. Cargá el primer préstamo."
- One card per currency (never combined), in a responsive grid (min 300 px):
  - Currency chip at the top ("USD", "ARS").
  - Metric rows, label left in gray / value right in bold: **Prestado**, **Cobrado**, **Pendiente**, **Condonado**, **Tasa de recuperación** (percent), **Promedio pendiente**, **Cobrado del mes**, **Activos**, **Cerrados**.
  - Amounts formatted with currency symbol and two decimals.
- Subtitle "A punto de completarse" + list of clickable text rows: "Ana Gómez · Nº 0007 · Quedan $12.500,00". Each opens that loan.
- Subtitle "Actividad reciente" + list: "03/11/2026 · Ana Gómez · Nº 0007 · $8.000,00". Each opens the loan.
- Empty states per list in muted gray.

**Préstamos list.**

- Title "Préstamos".
- Actions row: primary **"Nuevo préstamo"** and outlined **"Generar Recibo"**.
- **Activos (n)** heading; a grid of loan cards (min 300 px) for active loans, each:
  - Header: "Nº 0007" (13 px light gray) + amount bold + currency chip.
  - Meta rows, two per line, label gray / value dark: Persona, Fecha, Saldo pendiente (bold), Concepto, Prestamista, Ciudad, Cuota.
  - Actions: **Editar**, **Cerrar**, **Eliminar**.
- **Cerrados (n)** heading, collapsed by default with a **Mostrar** button (label toggles to **Ocultar**). Closed cards add "Cerrado el dd/mm/aaaa" and "Condonación $…", and their actions are **Editar**, **Reabrir**, **Eliminar**.
- Confirmations:
  - Cerrar: "¿Cerrar préstamo?" + "Se condonará el saldo pendiente de {amount}. El préstamo quedará cerrado." (or "No hay saldo pendiente por condonar…").
  - Reabrir: "¿Reabrir préstamo?" + "El préstamo volverá a estar activo y se limpiará la condonación."
  - Eliminar: "¿Eliminar préstamo?" + "Se elimina el préstamo y sus pagos asociados. No se puede deshacer."
- Toasts: "Préstamo cerrado.", "Préstamo reabierto.", "Préstamo eliminado.", "Préstamo registrado.", "Préstamo actualizado."

### 12.2 New / edit loan

A page (not a modal) with a white section card, max 720 px.

- Title "Nuevo Préstamo" or "Editar Préstamo".
- In edit mode, a status line: "Estado: Activo / Cerrado", and when closed "Condonación: $…".
- Closed loan notice (muted): "Este préstamo está cerrado. Reabrilo para editar el monto, el pago adelantado o la moneda."
- Fields:
  - **Persona** — a searchable picker whose dropdown has its own search box ("Buscá una persona") and avatar + name options. Once chosen, the field collapses to "Persona seleccionada: Ana Gómez" with a **"Cambiar persona"** button. When a search finds nobody, it offers **"Crear persona"**, revealing Nombre + Apellido inline and a "Guardar persona" button. Required; error "Elegí una persona para continuar."
  - **Monto** (number, 2 decimals, required).
  - **Moneda** — USD / ARS (or configured list). Disabled with an explanation when the loan already has an advance or payments: "No podés cambiar la moneda: el préstamo ya tiene pago adelantado o pagos registrados."
  - **Fecha** — date picker, defaults to today.
  - **Concepto** (required), **Prestamista** (required), **Ciudad** (defaults to "Córdoba").
  - **Pago adelantado** (number, optional) and **Valor de la cuota** (number, optional, hint "Opcional").
  - Derived line: "Saldo pendiente: $…" updating live; "—" when the amount is empty.
  - Primary "Guardar préstamo" / "Guardar cambios" (busy "Guardando…"). No Cancel; navigation is via the sidebar.
- **Pagos section** (edit mode only, separate card):
  - Title "Pagos".
  - Capture row: "Monto del pago" number input + primary **"Registrar pago"** (busy "Registrando…"). Hidden for closed loans.
  - Summary line: "Total cobrado: $…".
  - "Historial de pagos" rows: date (gray), amount, a "Revertido" chip when reversed, and actions **Ver Recibo**, **Revertir** / **Deshacer**.
  - Empty: "Todavía no hay pagos registrados."; loading: "Cargando pagos…"; error with "Reintentar".
  - Reversal confirmation: "¿Revertir el pago?" + "El pago queda registrado como revertido y deja de contar para el saldo. Podés deshacer la reversión."
  - Reversed rows stay visible; they are never deleted.

### 12.3 People ("Personas")

- Title "Personas".
- Search input, full width, placeholder "Buscá por nombre o apellido".
- Inline create/edit form card:
  - Fields in a row wrap: Nombre, Apellido (both required), Email, Teléfono, Domicilio, DNI / documento. Then Notas as a textarea.
  - Primary button "Agregar persona" (in edit mode label "Editar"), plus "Cancelar" when editing.
  - Validation message "Este campo es obligatorio." under missing name fields.
- Directory grid of person cards:
  - Name bold + a violet chip "Préstamos: 3".
  - Email and phone lines.
  - Actions Editar / Eliminar with confirmation "¿Eliminar persona?" / "Esta acción no se puede deshacer."
- States: empty "Todavía no hay personas cargadas."; no search matches "No encontramos coincidencias."; error with "Reintentar".

### 12.4 Generate receipt ("Generar Recibo")

- Title "Generar Recibo".
- A loan select, placeholder "Elegí un préstamo activo", options like "Nº 0007 · Ana Gómez · $150.000,00 · $42.000,00".
- Amount field "Monto a cobrar", prefilled with `min(cuota, saldo)`, editable.
- Primary "Registrar pago y generar recibo" (busy "Registrando…").
- On success, the receipt renders below; if the payment closes the loan, the toast says "Pago registrado: el préstamo quedó cerrado." and the selector resets, but the receipt remains on screen.
- Errors: "Elegí un préstamo para continuar.", "Ingresá un monto válido.", "No hay préstamos activos para cobrar."

### 12.5 The receipt ("Recibo de pago")

This is deliberately the one formal, printable artifact — a paper-like document, not an app card.

- Max width 800 px, white, 2 px light gray border, 16 px radius on screen, subtle shadow; on print it becomes a full-page sheet with all app chrome hidden.
- **Purple title band** (`#7c3aed`), centered white 26 px bold: "Recibo de pago".
- A bordered grid (1.5 px `#e5e7eb` lines, dark ink `#22223b`):
  - Row 1: Ciudad (15%), Día (10%), Mes (10%), Año (10%), No. (25%) with the loan number, and a currency cell (30%) with the amount.
  - Row 2: "Pagado a" (lender), spanning four columns.
  - Row 3: "Concepto:" with the loan concept.
  - Row 4: "Valor: (en letras)" with the amount written out in Spanish words.
  - Row 5: "Pagado por" (borrower name), "Aprobado" (blank), and "Firma de recibido:" with a handwritten signature image.
- Beneath the grid: "Monto total prestado: $…" and "Saldo pendiente: $…".
- "Historial de pagos:" — a bulleted list, one line per payment ("03/11/2026 - $8.000,00"), the advance payment labelled "Pago cuotas anteriores", with a small red "Revertido" tag where applicable.
- If the receipt belongs to a reversed payment, a prominent red banner above the grid: "Esta cobranza fue revertida. Este recibo no constituye un comprobante de pago."
- Actions outside the paper (never captured in the export): **Imprimir** (outlined) and **Descargar PNG** (primary, busy "Generando…"), file named `recibo-0007.png`.

### 12.6 Lo que no existe

Do not design interest calculations, amortization schedules, dashboards with charts, multi-user sharing, or bank integrations. The ledger is deliberately simple: principal, advance, installment, payments, balance, write-off.

---

## 13. Required states and edge cases

Design every screen with these states visible in the kit:

- **Loading:** full-page loader for pages; inline spinners in search inputs, buttons and per-day/per-section saves.
- **Empty:** board column empty, zero projects selected ("Select at least one project"), no recent issues, no search results (illustrated), no loans ("Todavía no hay préstamos. Cargá el primero."), no people, no payments, no summary data, no active loans for a receipt.
- **Error:** page-level error panel, section-level error with "Reintentar", field-level errors, toast-only failures (network, Jira, invalid transition). Errors are never silent; a section that fails must not destroy the rest of the page.
- **Read-only:** Jira issues in the board detail — banner, non-editable content, only Log Time and View in Jira available; closed loans — locked amount/currency/advance with a reason.
- **Busy / optimistic:** dragging, syncing, saving, exporting PNG, testing a database connection.
- **Long content:** two-line card titles, truncated project names, wrapped comments, long error details in monospace that wrap.
- **Partial selection:** "Showing 2 of 5 projects" + "Show all".
- **Filtered counts:** "2 of 7" in column headers.
- **No results / unknown route:** the glitch page rather than a blank shell.

---

## 14. Responsive behavior (summary)

- **≥ 1280 px:** rail + 268 px sidebar + board columns + two-column issue modal.
- **1024–1279 px:** same structure, tighter content padding; board columns scroll horizontally.
- **768–1023 px:** rail collapses per the existing hover behavior; board columns fixed 310 px; settings rows may stack.
- **≤ 768 px:** no rail, hamburger drawer, full-width content, stacked issue detail, 7-day week grid becomes a 2–3 column grid, loan cards single column, receipt scales to viewport width while keeping its table structure, dialogs become near-full-screen sheets.

---

## 15. Content examples (use realistic data)

- Projects: "VIS — Internal Platform" (🔗), "OPS — Operations" (🔗), "Personal" (📌), "Marketing" (📌).
- Board issues: `VIS-214` "Tempo export duplicates entries when the worklog date is edited" (Bug, Code review, High); `OPS-88` "Rotate the mailbox cleaner API key" (Task, Pending deployment, Medium); `PRJ-31` "Draft the Q4 planning notes" (Story, Backlog, Low).
- People: Ana Gómez, Martín Pérez, Lucía Fernández, Diego Sosa.
- Loans: Nº 0007, Ana Gómez, $150.000,00 ARS, concept "Préstamo personal", lender "Ezequiel C.", city "Córdoba", installment $25.000,00, pending $42.000,00.
- Users: "Ezequiel C.", "Ana Gómez", "Martín Pérez".
- Time: 6h logged / 2h remaining; week total 32.5h; today 6.5h.

---

## 16. Deliverables and quality bar

Produce:

1. A **design-system page**: color tokens, type scale, spacing, radii, shadows, buttons (all variants and states), inputs, selects, date pickers, badges, avatars, cards, counters, toasts, modals, accordions, empty and error states, icon usage.
2. **Desktop screens (1440 px):** Kanban Board, Issue detail, Create Issue, Search issues (aside), Quick actions, Tempo Export modal, Weekly hours modal, Settings (project + runtime config expanded), Loans summary + list, Loan form + payments, People, Generate receipt + rendered receipt, Log Time panel.
3. **Mobile screen (390 px):** the board with the drawer open, and the issue detail stacked.
4. **Component library view** showing every component in default, hover, focus, active, disabled and error states.

Quality bar:
- One coherent visual system across Jira work, quick actions and loans — the loans module must not look like a different app.
- Desktop density: information-rich, comfortable at 1440 px, no oversized hero elements.
- Real hierarchy through type weight and pastel color, not through borders everywhere.
- Every interactive element has a clear hover/focus state, and every destructive action a confirmation.
- No invented navigation, no extra product areas, no login/marketing screens.
- Show the UI in English, with the loans screens in Spanish, and include the EN/ES switch in the shell.

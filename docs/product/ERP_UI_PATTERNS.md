# ERP UI patterns

Shared building blocks for ERP module pages (`apps/erp`). Use them instead of hand-rolled layouts so every
module feels the same: spacious cards, 40px controls on inline rows, and one way to show records, approvals,
reports and settings. Everything is built on shadcn (`src/components/shadcn`), `kx` and `ui`.

## Workspace tabs (shell)

`src/components/tabs` and `src/lib/tabs.ts`. These are already part of the shell, so pages get them for free.

- An ordinary link replaces the current tab. **Ctrl/Cmd+click**, **middle-click** or the **right-click menu**
  (in the sidebar and in tables) opens a new in-app tab. Pages with their own links get this automatically.
- Each tab stays mounted in a hidden React `<Activity>` with the router context it had when you left it.
  Switching back restores scroll, URL filters and unsaved form input. Do not store page state in globals
  keyed by URL; local component state is enough.
- Keyboard: Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+W, and Ctrl+T (opens ⌘K and the chosen page opens in a new tab).
  Browsers keep some of these shortcuts for themselves; they work in the installed app/PWA.
- You can have up to 10 tabs. Tabs can be pinned, reordered by dragging, and closed with "close others".
  The open tabs are saved per user in `localStorage` (`kx.tabs.v1:<email>`).
- Split view: drag a tab to the right edge, or use "Open side by side". It needs a screen at least 1280px
  wide. Clicking a pane makes that pane the active one. On phones the strip becomes a single switcher.
- Tables: give `DataTable` a `rowHref={(r) => …}` so rows open on click and offer "Open in new tab".

## FormRow / InlineField (alignment)

`import { FormRow, FormRowActions, InlineField } from '@/components/ui'`

Use these whenever inputs and buttons sit on one row. On such a row, inputs, selects and buttons are all
**40px** tall, whatever the density setting. Buttons, links, checkboxes and text that are direct children
(or inside `FormRowActions`) line up with the **control**, not with the label. Helper or error text under
a field does not move them.

```tsx
<InlineField actions={<Button type="submit">Look up</Button>}>
  <TextField label="Code on the label" … />
</InlineField>

<FormRow>
  <FormField label="New PIN"><TextInput … helperText="4–8 digits" /></FormField>
  <FormField label="Confirm PIN"><TextInput … /></FormField>
  <Button>Set PIN</Button>
</FormRow>

<FormRow component="form" method="get">…filters…<FormRowActions><Button type="submit">Apply</Button></FormRowActions></FormRow>
<FormRow labelled={false}>…search box and buttons, no visible labels…</FormRow>
```

Other alignment rules:

- **Card header actions** are vertically centred on the title (`Card action`).
- **Page actions** go in `PageHeader actions`, right-aligned and wrapping.
- **Dialog footers** use `DialogActions` (right-aligned, 8px gap, 16px bottom padding).
- **Table action columns** use `align: 'right'` and `csv: false`.

## RecordPage

`import { RecordPage } from '@/components/templates'`. Use it for one record: a student, invoice, purchase
order, leave request and so on.

- Header: title, a status pill (`status={{ label, tone }}`), subtitle, `primary` and `secondary` actions.
- Key facts strip (`facts`): four to six label/value pairs.
- Tabs: **Overview**, then each `related` list (with counts), then **Documents** (a `RecordDocument[]` or
  your own node), then **Activity** (`ActivityItem[]`, the audit history). If you leave out `documents`
  or `activity`, that tab is hidden.
- `aside`: an approval or workflow panel. It sits beside the tabs at 1280px and wider, and above them on
  smaller screens.

```tsx
<RecordPage
  title="PO-2026-0142" status={{ label: 'Awaiting approval', tone: 'warning' }}
  facts={[{ label: 'Vendor', value: 'Sri Labs' }, { label: 'Amount', value: '₹1,24,000' }]}
  primary={<Button>Issue</Button>} secondary={<Button variant="outline">Edit</Button>}
  overview={<LinesTable … />} related={[{ value: 'grn', label: 'Goods received', count: 2, content: … }]}
  documents={files} activity={audit}
  aside={<ApprovalPanel steps={steps} canDecide={me.isApprover} onDecide={decide} onDecided={notify} history={audit} />}
/>
```

## WorkflowStepper + ApprovalPanel

`import { WorkflowStepper, ApprovalPanel } from '@/components/templates'`

- `WorkflowStepper steps` shows each step as `done | current | upcoming | rejected | skipped`, with who
  acted, when, and the note. It is horizontal from 768px and vertical on phones.
- `ApprovalPanel` shows the stepper, a decision box when `canDecide` is true, and the history
  (`ActivityItem[]`).
  - Rejecting needs a comment.
  - `onDecide(decision, comment)` runs the server action. It returns an error string, or nothing on success.
  - `onDecided` is the **notifications hook**. It runs only after a successful decision, so use it to notify
    the requester, refresh counts or call `router.refresh()`.
  - `extra` holds fields the approver must fill in first, such as the amount sanctioned.

## ReportPage

`import { ReportPage } from '@/components/templates'`

- Filters are plain labelled fields with `name` and `defaultValue` read from `searchParams`. They are
  rendered in a GET `FormRow`, so **the URL is the report's state**: it can be shared, bookmarked, and
  restored by tabs.
- The preview is a `DataTable` (search, sort, pagination and CSV export are built in).
- Export options:
  - **Print** uses `window.print()`; the filters card is hidden when printing.
  - **PDF** and **Excel** come from the API: `exports={{ pdf: '/api/download?kind=…', xlsx: '…' }}`.
    The current query string is appended to these links.
- **Saved reports** (presets) are named query strings, saved per person in `localStorage`
  (`kx.report-presets:<reportId>`), with at most 12. If presets need to be shared with others, store them
  through the API instead and keep the same shape (`{ name, query }`).

## ModuleSettingsPage

`import { ModuleSettingsPage, NumberingSeriesField } from '@/components/templates'`

- Sections are `{ id, kind?: 'rules' | 'numbering' | 'templates' | 'defaults', title?, description?, content }`.
  On wide screens a sticky index of the sections is shown.
- `onSave`, `saving` and `dirty` drive the single **Save changes** button.
- `NumberingSeriesField` edits prefix, next number, digits and suffix, with a live preview.
  - The preview comes from `formatSeries`, e.g. `RCPT/{FY}/` with 5 digits gives `RCPT/2026-27/00042`.
  - `{FY}` is the Indian financial year (April to March). `{YY}` and `{YYYY}` are the calendar year.

## Checklist for a new module page

1. Pick the template: a record → RecordPage, a list → DataTable with `rowHref`, a report → ReportPage, a
   module's configuration → ModuleSettingsPage.
2. Put inline input and button rows in `FormRow`/`InlineField`. Never hand-tune `mt-[…]` on buttons.
3. Keep filters in the URL, so that tabs, presets and sharing work.
4. Add strings to the area dictionary in English, Hindi and Kannada. `i18n.test.ts` checks this.

# KINETIX design system

**Principles:**

- The layout follows the Teachmint X board, which teachers already know.
- The look follows Google's own apps: Material 3, Google Sans, calm surfaces, one accent colour.

Code: `packages/kinetix_ui` (themes, tokens, shared widgets) is used by the Board and every mobile app.

## Foundations

| Token | Value | Notes |
|---|---|---|
| Typeface | **Google Sans** (OFL), bundled | Static 400/500/700 cut from the variable font, subset to Latin + symbols incl. ₹ |
| Indic fallback | Noto Sans Devanagari, Noto Sans Kannada (OFL), bundled | Hindi and Kannada render offline without system fonts |
| Colour | Deep blue `#1D4ED8` (`KxColor.accent`, dark `KxColorDark.accent`), marigold `#8F5B00` for AI only, success `#15803D`, warning `#B45309`, danger `#B3261E`; white cards on a cool-grey ground `#F3F6FB` | Defined once in `packages/kinetix_ui/lib/src/tokens.dart`, mirrored in `apps/erp/src/theme/tokens.css` and `scheme.ts`. Chalkboard green is only a board theme. Components: `apps/erp/src/components/ui`. Screenshots: `docs/design/erp/` |
| Shape | M3 scale: 4 / 8 / 12 / 16 / 28 | Cards 16, dialogs and popovers 28 |
| Spacing | 4-pt grid: `Kx.s4 … Kx.s48` | |
| Touch targets | 48 px on phones, 56 px on the board | People stand at the board with a pen |
| Fixed semantic colours | Live `#E8710A`, Record `#D93025`, Success `#15803D`, Warning `#B45309` | Do not follow the theme |

### Themes

- `KinetixTheme.light()` / `.dark()` for the mobile apps (follow the system setting).
- `KinetixTheme.boardChrome()` for the **board's toolbars, popovers, dialogs and panels**. It is
  the dark scheme of the same seed: dark chrome on a bright canvas reads clearly from the back
  of a classroom, as on Teachmint. The canvas itself stays light (or chalkboard).

## Board layout (mapped from the Teachmint X reference)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [AS Anita Sharma · BCom Sem 3 A · Corporate Accounting]  [Go live]  [12 students]│  ← status strip
│                                               [☁ Sun 4 Oct · 12:18]  [End class] │
│                                                                                  │
│                              canvas (multi-touch)                  ┃ side panel  │
│                                                                    ┃ (AI, Books, │
│                         ┌── popover (Write / Shapes / Tools) ──┐   ┃ Quiz, Home- │
│                         └──────────────────────────────────────┘   ┃ work, Split)│
│ ┌Switch·Profile·Save┐ ┌Record Theme Write Erase Select Shapes Tools Undo Redo │ AI Books Quiz Homework┐ ┌Hide ‹ 1/3 › Switch┐ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Teachmint X element | KINETIX equivalent |
|---|---|
| Top-left "Classroom ID", "Go Live", "N students in your classroom · Add" | Class chip (teacher · class · period), Go live chip, attendance chip |
| Top-right cast, screenshot, date/time | Sync status and clock pill; End class button |
| Bottom-left Switch · Profile (initials) · Save | Same. The profile menu has sign-in, new page, import, your whiteboards, settings |
| Bottom-centre labelled toolbar: Record, Theme, Write, Erase, Select, Shapes, Tools, Undo, Redo, then EduAI, Books, Quick Quiz, Homework | Same order, with "AI" for EduAI; the AI group uses coloured tiles |
| Bottom-right Hide · Previous 1/1 Next · Switch | Same. "Next" on the last page becomes **New page** |
| Pen popover (pen type, tips, colours) | **Write** popover: Pen/Highlighter segmented button, 10 colours, 4 thicknesses |
| Shapes popover with 2D/3D tabs, Show lengths, Show angles | Same: 13 2D shapes, labels in cm on a 1 cm grid, angles to 0.1°. 3D is coming |
| EduAI side panel (Ask me anything, Smart tools, Browse, Other tools) with a handle rail (⠿ ⌂ ✕) | **KINETIX AI** panel; rail with resize handle, swap side, close |
| "Teacher Device Registration" dialog (phone keypad + QR) | **Sign in** dialog: steps + rotating 6-digit code + QR. No PIN is typed on the shared screen |
| Utilities drawer (countdown, eye protection, calculator, touch lock…) | **Tools** popover grid (timer, random pick, attendance, split screen, eye comfort; others marked *Soon*) |

### Behaviour rules

- **Labels on toolbar buttons**, as on Teachmint. Below 1500 px of board width (720p tablets,
  or a panel open) the toolbar becomes **compact** (icons only, tooltips keep the names) so
  nothing overflows.
- Tapping the active tool again opens its options (Write, Erase).
- **Nothing is silently dead.** Unbuilt features carry a *Soon* badge and explain themselves when
  tapped.
- **Messages appear above the toolbar**, never over it (`showBoardMessage`), so they don't catch
  the teacher's next tap.
- Everything works at 1280×720 and 1920×1080; tests check both sizes for overflow.

## Mobile apps (Teacher, Student, Parent)

The three phone apps use the same tokens as the ERP and the board, and one set of Home building
blocks from `packages/kinetix_ui` (`home_widgets.dart`): `KxHomeHeader`, `KxCard`, `KxStatTile`
and `KxTileGrid`, `KxActionTile` and `KxActionGrid`, `KxProgressBar`, `KxFeedRow`, `KxIconBox`.
Tone (`KxTone`) picks the tonal container and its on-colour in light and dark, so a screen never
chooses a colour by hand. Marigold (`KxTone.spark`) is for AI only (the Teacher's AI Assistant)
and the learning streak flame.

| App | Bottom navigation | Home |
|---|---|---|
| Teacher | Home, Classes, Students, More | Greeting; today's classes with **Start class**; quick actions (attendance, assignment, quiz, smartboard, study material, AI assistant); leave requests to approve for heads (one tap) |
| Student | Home, My Learning, Exams, More | Next class; tiles (attendance, pending assignments, upcoming exam, learning streak); continue learning; what is due; notifications from the bell |
| Parent | Home, Updates, Fees, More | Child switcher card; Overview / Academics / Fees / Attendance; tiles (attendance, internal marks, assignments, overall progress in one plain word); recent updates |

Rules the screens follow:

- Every tap target is at least 48 dp; the whole card is the target when it opens something.
- Cards are white on the cool-grey ground with a hairline border (the `Card` theme does this too,
  so older screens match).
- The Home headline stops growing at 1.3x text scale, so it never pushes the content off a small
  phone; everything else follows the setting. Layout tests run at 360x640 and 2x text in English,
  Hindi and Kannada.
- Every list has a loading, an empty and an error state (`KxLoading`, `KxEmptyState`,
  `ErrorBanner` with Retry).
- The Parent app is plainer: bigger type (`KxHomeHeader(big: true)`), one word for how things are
  going, and the child switcher is a card, not chips.

Screenshots (light and dark) are in `docs/design/mobile/`. Regenerate them with
`KINETIX_SCREENSHOTS=1 flutter test --update-goldens test/home_test.dart` in `apps/teacher`
(`test/screenshots_test.dart` in the Student and Parent apps). Without the variable those tests
are skipped, so the normal run never compares pixels.

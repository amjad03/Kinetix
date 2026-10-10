# KINETIX Board vs Teachmint Parity Matrix

Sources: `Kinetix_Complete_Visual_Feature_Requirements_Developer_Reference` (docx, 32 numbered items + global rules A-L) and the Teachmint Panel Full Tutorial video (43 min; keyframes show the panel launcher with Teachmint / Screen Share / Google / Meet / Play Store, the in-class toolbar along the bottom, "Adding page to whiteboard" toast on PPT/PDF import, a PDF/PPT opened beside the whiteboard, the EduAI smart-tools grid with Quick Quiz, Google, Wikipedia, Simulations, Periodic Table, Dictionary, Books, and a Teachmint QR on shared pages). Where the video was too low-res to read menu text, Teachmint behaviour is taken from the doc and marked (doc).

Status legend: Built / Partial (gap) / Missing / Broken (user-reported defect). Statuses come from a grep-level code scan of `apps/board` and `packages/kinetix_*`; Built means code exists, not that it was device-verified. Paths are relative to repo root; `B` = `apps/board/lib/features/board`, `A` = `apps/board/lib/features`, `INK` = `packages/kinetix_ink/lib/src`.

## 1. Canvas and pages
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Add page rule | Add (+) on last page; Kinetix doc: only allowed if current page has content, blank page blocks Add (doc C) | Partial: add exists; blank-page block unverified | B/layout/page_overview.dart, B/phone_chrome.dart |
| Add page speed / stale content | New page appears instantly, blank | Broken: add-page slow; previous page content lingers on new page | INK/whiteboard_controller.dart, B/layout/page_overview.dart |
| Prev / Next / page indicator "1/1" | Bottom-right group: Hide, Prev, n/N, Next, Switch (doc B) | Built | B/layout/board_chrome.dart, B/layout/toolbar_layout.dart |
| Page overview / thumbnails | Grid of pages, reorder, delete | Built | B/layout/page_overview.dart |
| Switch toolbar side | Quick group (Switch, Guest/Profile, Share, WhatsApp, End Class) flips to the opposite side | Partial: verify quick group contents and mirrored nav | B/layout/toolbar_layout.dart, B/layout/board_chrome.dart |
| Hide / restore UI | Hide collapses all tool UI, small restore button stays | Partial: verify restore handle | B/layout/board_chrome.dart |
| Screen Freeze | Canvas frozen non-interactive, small Close bottom-left | Built (touch lock) ; verify Close bottom-left | B/touch_lock.dart |
| Pinch zoom (2 finger, global) | Pinch zoom/pan anywhere on canvas, no stray ink | Built; verify no accidental ink in multitouch mode | INK/ink_canvas.dart, INK/pen/gestures.dart |
| Two-finger tap = undo | Two-finger tap undoes last action | Partial: exists on main board, absent on split second board (see 9) | INK/pen/gestures.dart |
| Undo / redo | Toolbar buttons | Built | INK/whiteboard_controller.dart |
| Version history / autosave | Whiteboards saved in "Your Whiteboards" | Built | B/version_history.dart, A/profiles/profile_boards.dart |
| Clear all | In eraser settings with confirm | Built | B/layout/pen_popover.dart |

## 2. Pens and configuration
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Pen module: Solid, Highlighter, Two Side, Text AI, Shape AI | 5-way pen popover (doc 12) | Built | B/layout/pen_modes.dart, B/layout/pen_popover.dart |
| Solid pen size and colour | Size slider, colour swatches | Built | B/layout/pen_popover.dart |
| Single / Multi Touch toggle | Multi: several students write simultaneously, low latency | Partial: toggle exists; multitouch accuracy on mobile/tab/IFP unverified | A/../core/board_controller.dart, B/layout/pen_popover.dart |
| Highlighter | Size, opacity, colour, smooth, palm-compatible | Built | B/layout/pen_popover.dart, INK/ink_canvas.dart |
| Two Side pen: Front tip / Back tip | Front: Write; Back: Write / Erase / Select / Highlight; independent | Partial: modes exist; front/back independence and immediate switch unverified | B/layout/pen_modes.dart, B/layout/pen_popover.dart |
| Palm rejection / palm eraser (global) | Palm-only touch erases with no tool selected | Partial | B/touch_lock.dart, apps/board/lib/core/board_controller.dart |
| Pen configuration: generic IFP touch (size-based pen / finger / palm classification) | Touch contact size decides pen vs finger vs palm; calibratable thresholds | Missing: no touch-size classifier or config UI | apps/board/lib/core/board_controller.dart |
| Active stylus: pressure, eraser end, barrel buttons | Pressure width, eraser tip erases, buttons map to actions | Missing / Partial: pressure refs only, no button/eraser-end mapping UI | apps/board/lib/core/board_controller.dart, B/touch_lock.dart |
| Dual-pen colour panels | Two pens, each with own colour panel, for two writers | Missing | B/layout/pen_popover.dart |
| Eraser size, stroke/area | Size slider | Built | B/layout/pen_popover.dart |
| Pen colour palette consistency | Same palette everywhere | Broken: icon/colour inconsistencies across toolbar and panels | B/layout/board_chrome.dart, B/layout/tools_drawer.dart |

## 3. Shapes, 3D and objects
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Shape AI (rough to clean) | Recognises drawn shapes, keeps proportions/placement | Built | INK/pen/shape_fit.dart, B/layout/pen_modes.dart |
| 2D shape library (lines, polygons) | Lined/filled, Show Lengths / Show Angles toggles | Built | INK/shape_edit.dart, INK/tools/geo_tool.dart |
| 2D shape colour change | Select shape, palette, only that object changes | Built; verify isolation | B/selection_actions.dart |
| Selected object contextual controls | Edit, colour, actions, move/resize | Built | B/selection_actions.dart |
| 2D/3D switch, lined and filled 3D library | 3D panel, rotate any angle, lengths/angles | Built | packages/kinetix_3d/lib/src/solid_explorer.dart, A/search/solids3d.dart |
| Cube face colour change in 2D and 3D | Tap a face, pick colour, only that face | Broken: model_viewer has faceColors but not reachable in 2D cube nor in board 3D flow; no UI | packages/kinetix_3d/lib/src/model_viewer.dart, packages/kinetix_3d/lib/src/solid_explorer.dart, INK/shape_edit.dart |
| 3D responsiveness | No lag while rotating | Partial: verify on IFP | packages/kinetix_3d/lib/src/renderer.dart |
| Text AI (handwriting to text) | Languages: English, Hindi, Kannada, Arabic, Marathi, Gujarati, Tamil, Punjabi, Telugu, Bangla, Odia, Malayalam, Nepali; fonts Default, Kalam, more | Partial: engines exist (ML Kit / Windows); full 13-language and font library unverified | apps/board/lib/core/handwriting/*.dart, INK/pen/handwriting.dart |
| Flowchart AI | Start block suggests next step | Built | INK/flow_chart.dart, INK/tools/flow_overlay.dart |

## 4. Geometry tools
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Ruler, protractor, set squares, compass | Draggable, rotatable overlays | Built | INK/tools/geo_overlay.dart, INK/geometry_tools.dart |
| Stacked tools: reach the bottom one | Tools overlap; user can select/move any | Broken: bottom tool of a stack hard to reach | INK/tools/geo_overlay.dart, INK/tools/geo_tool.dart |
| Calibration | Screen size/DPI calibration so ruler is true scale | Broken: dialog exists but incomplete | A/canvas_tools/canvas_tools.dart, INK/tools/geo_tool.dart |
| Graph tool / graph templates | Plot expressions, templates | Built | INK/tools/graph_editor.dart, A/canvas_tools/graph_templates_panel.dart |

## 5. Teaching tools
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Timer / stopwatch | Floating timer, presets, alarm | Built | A/toolkit/toolkit_layer.dart, A/toolkit/toolkit_controller.dart |
| Buzzer | Quick-answer buzzer, first press wins, teacher resets | Built: students buzz from the Student App, order reaches the board live, teacher locks and resets | A/classroom_plus/buzzer.dart |
| Seat plan / arrangement | Class seating on board, drag students | Broken: lacks rows/layouts (U-shape, pairs, groups, custom rows) | A/classroom/classroom_tools.dart |
| Exit ticket | Teacher sets question, students answer at end | Broken: incomplete flow | A/assessment/assessment.dart, A/class_check/class_check.dart |
| Graphic organiser | Venn, KWL, T-chart, mind map, cycle, fishbone etc. | Broken: 7 templates only; incomplete (editing, more types) | A/teaching_aids/teaching_aids.dart |
| Dictionary | Look up word with meaning, pronunciation, examples, language | Broken: weak | A/language_kit/language_data.dart, B/profile_extras.dart |
| Key dates | Historical date lookup | Broken: 35 entries; needs full history | B/kit/subject_data.dart, B/kit/kit_panel.dart |
| Immersive reader | Read-aloud, highlight, text size, spacing | Broken: needs voice select, speed, settings | A/reader/read_aloud.dart |
| Live caption | Speech to on-board captions | Broken: weak accuracy/UX | A/captions/live_captions.dart |
| Voice commands | Spoken next page, timer etc. | Broken: not working | A/classroom_plus/voice_commands.dart, A/ai/voice_input.dart |
| Calculator | Scientific calculator window | Broken: CSS/layout on mobile, tab, IFP | B/calculator.dart, A/board/kit/college/calculator_dialog.dart |
| Spotlight | Dim canvas, reveal circle | Built | A/toolkit/toolkit_layer.dart |
| Multi-user zone | Split board into zones, each user own pen, simultaneous | Broken: must support true multitouch on mobile/tab/IFP | A/classroom_plus/zones.dart |
| Periodic table | Interactive, info panel, highlight selected | Partial: verify against reference style | A/board/kit/subject_tools.dart |
| Break reminder, diagnostics, recording notice | n/a (Kinetix extras) | Built | A/classroom_plus/*.dart |

## 6. AI
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Kinetix AI smart tools grid | Summary, Quick Quiz, Lecture, Homework, Google, Wikipedia, Simulations, Periodic Table, Dictionary, Books, Graph, Calculator | Built (grid); dictionary weak | A/ai/ai_panel.dart, A/ai/smart_panels.dart |
| Quiz setup | Participants/teams, count, difficulty, type, timer, Start | Built | A/ai/quiz_setup.dart, A/ai/quiz_panel.dart |
| Quiz source: topic / Scan the Board (all pages or selected) | Both modes | Built | A/ai/quiz_setup.dart |
| Quiz explanation, Add to Board, exam importance | AI explains answer | Partial | A/ai/quiz_panel.dart |
| Homework AI | Formats, marks, diagrams | Partial | A/ai/homework_panel.dart |
| AI answer accuracy | Grounded, class/board aware | Broken: inaccurate answers | A/ai/ai_controller.dart, services/api |
| Context-aware (board, selection) | Reads board | Built | A/ai/read_board_panel.dart |

## 7. Insert, split-screen, PDF/PPT
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Insert menu: PDF, Images, Videos, PPT, Clipboard, Geometry, Table, Flowchart | Popover | Built | B/insert_popover.dart, A/insert/insert_entries.dart |
| PDF import | Opens in split screen first; "Add to board" per page or all ("Adding page to whiteboard" toast) | Partial: imports to board directly; split-first with Add to board missing | A/insert/document_import.dart |
| PPT import | Opens split; add all pages or pick pages; animations/transitions/media | Partial: renders slides; add-all/pick pages and animation fidelity missing | A/insert/presentation_pane.dart, A/insert/pptx_render.dart |
| Intelligent split side | Opens on empty side, draggable divider | Partial | B/panel/split_panel.dart |
| Second board in split screen | Full board: AI pen, two-finger tap undo, same gestures | Broken: lacks AI pen, two-finger-tap undo etc. | B/panel/split_panel.dart, B/panel/panel_host.dart |
| Books / NCERT | Library, search, upload | Built | A/books/books_panel.dart |
| Screen share | Portrait and landscape, auto-rotate | Partial | A/cast/cast_panel.dart, core/cast/cast_controller.dart |
| Classroom Apps grid | Study Material, Live Class, Homework, Lessons, Attendance, Class Prep, Students, Tests, Recordings, Books; Other Tools: Calculator, Spotlight | Built | B/classroom_apps.dart |
| Theme templates (15 listed) | Black, Grid, Horizontal, English, 2/3 Columns, Isometric, Graph, Hindi, Dotted, Checks, Music, Basketball, Football, World Map | Partial: verify all 15 plus spelling | INK/board_background.dart, B/layout/backgrounds_popover.dart |
| Theme background colours | Palette, per page | Built | B/layout/backgrounds_popover.dart |
| Theme Custom (JPG/PNG up to 10 MB, logo/watermark) | Upload tab | Built | B/layout/custom_theme_tab.dart |

## 8. Profile, classrooms, share
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Profile menu: New, Import, Your Whiteboards, Your Classrooms, Configurations, Schedule a Training, What's New, Exit | Sidebar | Built | B/profile_menu.dart |
| Profile Import PDF | Opens split screen first, with "add to board" | Missing (see PDF row) | B/profile_menu.dart, A/insert/document_import.dart |
| Profile Import PPT | Add all or pick pages | Missing | A/insert/presentation_pane.dart |
| Your Classrooms | Classes taken per section/standard | Built: classroom_profile_ui.dart lists every class taught (section, standard, subject, sessions, last taken) from GET /v1/classroom/classrooms with Open class | B/classroom_profile_ui.dart, API classroom-profile |
| Schedule a Training | Training flow with QR | Built: pick a slot, topic, stored via API, status shown on the board; ERP /trainings lists and answers | B/classroom_profile_ui.dart, E/trainings | B/profile_menu.dart |
| What's New | Release feed | Built | B/profile_extras.dart |
| Guest mode | Basic teaching without login | Built | A/signin/sign_in_dialog.dart |
| Share whiteboard | Email, WhatsApp, QR | Built: WhatsApp opens, else the Android share sheet with the PDF; QR beside the buttons | B/share_whiteboard.dart |
| WhatsApp share sheet | Pages, PDF, message, send to number/groups | Built: Android share sheet carries the PDF and notes link | B/share_whiteboard.dart, core/api_client.dart |
| End class | Quick-group End Class, saves recording and summary | Built: notes, publish to students, session closed, summary with WhatsApp share | B/layout/board_chrome.dart, A/profiles/profiles_controller.dart |
| Settings / configurations | Board settings sheet | Built | B/profile_menu.dart |

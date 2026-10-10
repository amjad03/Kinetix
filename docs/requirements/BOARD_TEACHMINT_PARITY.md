# KINETIX Board vs Teachmint Parity Matrix

Sources: `Kinetix_Complete_Visual_Feature_Requirements_Developer_Reference` (docx, 32 numbered items + global rules A-L) and the Teachmint Panel Full Tutorial video (43 min; keyframes show the panel launcher with Teachmint / Screen Share / Google / Meet / Play Store, the in-class toolbar along the bottom, "Adding page to whiteboard" toast on PPT/PDF import, a PDF/PPT opened beside the whiteboard, the EduAI smart-tools grid with Quick Quiz, Google, Wikipedia, Simulations, Periodic Table, Dictionary, Books, and a Teachmint QR on shared pages). Where the video was too low-res to read menu text, Teachmint behaviour is taken from the doc and marked (doc).

Status legend: Built / Partial (gap) / Missing / Broken (user-reported defect). Statuses come from a grep-level code scan of `apps/board` and `packages/kinetix_*`; Built means code exists, not that it was device-verified. Paths are relative to repo root; `B` = `apps/board/lib/features/board`, `A` = `apps/board/lib/features`, `INK` = `packages/kinetix_ink/lib/src`.

## 1. Canvas and pages
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Add page rule | Add (+) on last page; Kinetix doc: only allowed if current page has content, blank page blocks Add (doc C) | Built: blank page blocks Add (canAddPage); test pages_paper_test "Add Page needs something on the open page" | B/layout/page_overview.dart, B/phone_chrome.dart |
| Add page speed / stale content | New page appears instantly, blank | Built: root cause was addPage/goToPage not bumping the finished-layer repaint notifier, so the old page lingered; fixed in whiteboard_controller.dart; test input_config_test "adding a page repaints the finished layer" | INK/whiteboard_controller.dart, B/layout/page_overview.dart |
| Prev / Next / page indicator "1/1" | Bottom-right group: Hide, Prev, n/N, Next, Switch (doc B) | Built | B/layout/board_chrome.dart, B/layout/toolbar_layout.dart |
| Page overview / thumbnails | Grid of pages, reorder, delete | Built | B/layout/page_overview.dart |
| Switch toolbar side | Quick group (Switch, Guest/Profile, Share, WhatsApp, End Class) flips to the opposite side | Partial: verify quick group contents and mirrored nav | B/layout/toolbar_layout.dart, B/layout/board_chrome.dart |
| Hide / restore UI | Hide collapses all tool UI, small restore button stays | Partial: verify restore handle | B/layout/board_chrome.dart |
| Screen Freeze | Canvas frozen non-interactive, small Close bottom-left | Built (touch lock) ; verify Close bottom-left | B/touch_lock.dart |
| Pinch zoom (2 finger, global) | Pinch zoom/pan anywhere on canvas, no stray ink | Built; verify no accidental ink in multitouch mode | INK/ink_canvas.dart, INK/pen/gestures.dart |
| Two-finger tap = undo | Two-finger tap undoes last action | Built on main and split second board (same WhiteboardCanvas); tools_test second-board, whiteboard_canvas_test "two fingers undo" | INK/pen/gestures.dart |
| Undo / redo | Toolbar buttons | Built | INK/whiteboard_controller.dart |
| Version history / autosave | Whiteboards saved in "Your Whiteboards" | Built | B/version_history.dart, A/profiles/profile_boards.dart |
| Clear all | In eraser settings with confirm | Built | B/layout/pen_popover.dart |

## 2. Pens and configuration
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Pen module: Solid, Highlighter, Two Side, Text AI, Shape AI | 5-way pen popover (doc 12) | Built | B/layout/pen_modes.dart, B/layout/pen_popover.dart |
| Solid pen size and colour | Size slider, colour swatches | Built | B/layout/pen_popover.dart |
| Single / Multi Touch toggle | Multi: several students write simultaneously, low latency | Built: phone no longer excluded (multiWriter = panel/IFP, Multi Touch on, or zones active); per-pointer writing tested in whiteboard_canvas_test "on a panel every finger writes its own line" | A/../core/board_controller.dart, B/layout/pen_popover.dart |
| Highlighter | Size, opacity, colour, smooth, palm-compatible | Built | B/layout/pen_popover.dart, INK/ink_canvas.dart |
| Two Side pen: Front tip / Back tip | Front: Write; Back: Write / Erase / Select / Highlight; independent | Partial: modes exist; front/back independence and immediate switch unverified | B/layout/pen_modes.dart, B/layout/pen_popover.dart |
| Palm rejection / palm eraser (global) | Palm-only touch erases with no tool selected | Built: InputConfig.classify (manual limits or auto-learn) drives palm erase; input_config_test + whiteboard_canvas_test palm tests | B/touch_lock.dart, apps/board/lib/core/board_controller.dart |
| Pen configuration: generic IFP touch (size-based pen / finger / palm classification) | Touch contact size decides pen vs finger vs palm; calibratable thresholds | Built: pen_config_screen.dart Touch size tab (pen/finger/palm limits, auto-learn, learn-from-touches wizard); pen_config_test | apps/board/lib/core/board_controller.dart |
| Active stylus: pressure, eraser end, barrel buttons | Pressure width, eraser tip erases, buttons map to actions | Built: Active stylus tab (pressure, eraser end, two barrel buttons mapped to erase/highlight/select/undo); input_config_test "barrel button" | apps/board/lib/core/board_controller.dart, B/touch_lock.dart |
| Dual-pen colour panels | Two pens, each with own colour panel, for two writers | Built: Two pens tab (per pointer order or tip size colours) applied in WhiteboardCanvas; input_config_test "two pens write in their own colours" | B/layout/pen_popover.dart |
| Eraser size, stroke/area | Size slider | Built | B/layout/pen_popover.dart |
| Pen colour palette consistency | Same palette everywhere | Broken: icon/colour inconsistencies across toolbar and panels | B/layout/board_chrome.dart, B/layout/tools_drawer.dart |

## 3. Shapes, 3D and objects
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Shape AI (rough to clean) | Recognises drawn shapes, keeps proportions/placement | Built | INK/pen/shape_fit.dart, B/layout/pen_modes.dart |
| 2D shape library (lines, polygons) | Lined/filled, Show Lengths / Show Angles toggles | Built | INK/shape_edit.dart, INK/tools/geo_tool.dart |
| 2D shape colour change | Select shape, palette, only that object changes | Built: tests/geo_stack_faces_test.dart proves only the chosen side/face (PolygonElement.sideColors, INK/tools/shape_face.dart, "Colour a side or face" in the selection bar) changes | B/selection_actions.dart |
| Selected object contextual controls | Edit, colour, actions, move/resize | Built | B/selection_actions.dart |
| 2D/3D switch, lined and filled 3D library | 3D panel, rotate any angle, lengths/angles | Built | packages/kinetix_3d/lib/src/solid_explorer.dart, A/search/solids3d.dart |
| Cube face colour change in 2D and 3D | Tap a face, pick colour, only that face | Built: tap any face of any solid in the 3D view (or, on the board, press Face colour in the selection bar, or tap a face of the selected solid) to open a custom colour picker (hue/saturation/brightness, hex, palette, recent colours, reset face). A solid put on the board stays live 3D: one finger turns it, two fingers resize it, the move dot moves it, and turn, size and face colours are saved with the page (link preset v:yaw,pitch\|fc:...) with a fresh picture for viewers; en/hi/kn (kinetix_3d/test/face_colors_persist_test.dart, board/test/live_solids_test.dart) | packages/kinetix_3d/lib/src/face_colour_picker.dart, A/board/live_solids.dart, A/board/selection_actions.dart, INK/whiteboard_canvas.dart |
| 3D responsiveness | No lag while rotating | Partial: verify on IFP (renderer unchanged; not measurable here) | packages/kinetix_3d/lib/src/renderer.dart |
| Text AI (handwriting to text) | Languages: English, Hindi, Kannada, Arabic, Marathi, Gujarati, Tamil, Punjabi, Telugu, Bangla, Odia, Malayalam, Nepali; fonts Default, Kalam, more | Partial: engines exist (ML Kit / Windows); full 13-language and font library unverified | apps/board/lib/core/handwriting/*.dart, INK/pen/handwriting.dart |
| Flowchart AI | Start block suggests next step | Built | INK/flow_chart.dart, INK/tools/flow_overlay.dart |

## 4. Geometry tools
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Ruler, protractor, set squares, compass | Draggable, rotatable overlays | Built: each tool has a grip dot (move) and a turn dot; the body is locked, so a pen written along a ruler or set-square edge snaps to a perfectly straight line and the tool never moves. Compass drawn as two legs, hinge, needle point and pencil lead: drag the pencil along the leg to set the radius, swing it round the needle to draw an arc (partial arcs allowed), or tap Circle for the full circle (INK/test/geo_handles_test.dart) | INK/tools/geo_overlay.dart, INK/geometry_tools.dart |
| Stacked tools: reach the bottom one | Tools overlap; user can select/move any | Built: touch raises a tool, long-press (held still) sends it back, stack chip lists all tools, set-square cut-out and empty area pass touches through, only the top tool shows buttons, tools shrink to fit phones (geo_stack_faces_test.dart) | INK/tools/geo_overlay.dart, INK/tools/geo_tool.dart |
| Calibration | Screen size/DPI calibration so ruler is true scale | Built: calibration by screen diagonal (phone/tablet/IFP), 8.56 cm bank card, ruler marks and +/- fine nudge, saved per device; warns when zoom makes scales not true size (geo_stack_faces_test.dart) | A/canvas_tools/canvas_tools.dart, INK/tools/geo_tool.dart | Touch-offset calibration: 5-target, per device (apps/board/lib/features/board/pen_config/).
| Graph tool / graph templates | Plot expressions, templates | Built | INK/tools/graph_editor.dart, A/canvas_tools/graph_templates_panel.dart |

## 5. Teaching tools
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Timer / stopwatch | Floating timer, presets, alarm | Built | A/toolkit/toolkit_layer.dart, A/toolkit/toolkit_controller.dart |
| Buzzer | Quick-answer buzzer, first press wins, teacher resets | Built: students buzz from the Student App, order reaches the board live, teacher locks and resets | A/classroom_plus/buzzer.dart |
| Seat plan / arrangement | Class seating on board, drag students | Built: rows, pairs, groups of 4, U shape, custom (move desks); rows x columns; drag to swap; gender and height per student; auto-arrange random / boys-girls mixed / height / A-Z; kept per class; put on board; save/print as picture | A/classroom/seating.dart |
| Exit ticket | Teacher sets question, students answer at end | Built: write MCQ / number / word questions (or suggest), run one by one, live bars, answers from Student App or answer cards, results on board, saved to ERP (API exit_tickets, migration 0122) | A/exit_ticket/exit_ticket.dart, services/api/src/exit-tickets |
| Graphic organiser | Venn, KWL, T-chart, mind map, cycle, fishbone etc. | Built: 16 templates (Venn 2/3, KWL, T-chart, mind map, cycle, fishbone, flow, timeline, tree, SWOT, Frayer, 5W+H, compare, causes to effect, pyramid); edit labels and number of parts, then add to board | A/teaching_aids/organisers.dart | Mind map is now its own radial tool (see Mind map row).
| Dictionary | Look up word with meaning, pronunciation, examples, language | Built: offline WordNet-derived list (about 9,000 words, meanings, examples, synonyms), Hindi and Kannada for the commonest, on-device TTS pronunciation, tap a synonym | A/language_kit/dictionary_data.dart, assets/dictionary | Fixed: the drawer Dictionary tile opened the picture word wall instead of this dictionary; it now opens the language kit dictionary (bundle read, load failure with Retry, words to try). Test: test/dictionary_bundle_test.dart (real asset bundle).
| Key dates | Historical date lookup | Built: about 5,000 dated events (world and India history, science, Karnataka) from 3000 BCE to today; search, region/subject/era filters, On this day, draw a timeline | B/kit/key_dates_data.dart, assets/history |
| Subject and class contextual board | Tools, insert menus, sims, templates, 3D models, key dates and dictionary adapt to the class | Built: one registry (subject x grade band to tool ids, insert entries, sims, models, key dates focus) in B/context/class_context.dart; class and subject from the timetable or session with a manual switcher chip on the top bar (B/context/context_switcher.dart); tools drawer, Insert menu and simulation picker show only the relevant ones, rest behind "Show all tools"; search always covers every tool. Test: test/class_context_test.dart | B/context/*.dart |
| Mind map | Radial map: central topic, branches, sub-branches | Built: separate from the flowchart; auto radial layout, colour per branch, fold, add branch or sibling, rename, drag (a branch takes its sub-branches), Put on board as topic blocks and curved branches. Test: test/mind_map_test.dart | A/mindmap/*.dart |
| Logic gates | Interactive gates, switches, LEDs, wires | Built: AND, OR, NOT, NAND, NOR, XOR, XNOR, buffer; input switches and clock; LEDs; wire by dragging pin to pin (no loops); live propagation; truth table view and truth table to board. Test: test/logic_gates_test.dart | A/logic_gates/*.dart |
| Immersive reader | Read-aloud, highlight, text size, spacing | Built: on-device voice picker, language, speed, pitch, font, size, letter/word/line spacing, line focus, syllables, 8 colour themes, word highlight | A/reader/read_aloud.dart, reader_settings.dart |
| Live caption | Speech to on-board captions | Built: on-device continuous recognition that restarts after sentences and silence, en/hi/kn switch without stopping, font size, top/bottom, background, save VTT or text | A/captions/live_captions.dart |
| Voice commands | Spoken next page, timer etc. | Built: on-device, keeps listening; next/previous page and slide, new page, timer, pick student, attendance, undo/redo, pen colour, pen/eraser/highlighter, open a tool by name, stop listening; command list and per-command feedback (en/hi/kn) | A/classroom_plus/voice_commands.dart |
| Calculator | Scientific calculator window | Built: basic and scientific (trig in degrees or radians, logs, powers, factorial), lays out for phone, tablet and IFP panel widths | B/calculator.dart |
| Spotlight | Dim canvas, reveal circle | Built | A/toolkit/toolkit_layer.dart |
| Multi-user zone | Split board into zones, each user own pen, simultaneous | Built: zones force multiWriter on phone, tablet and IFP, each pointer takes its zone pen; zones_test + board_screen wiring | A/classroom_plus/zones.dart |
| Periodic table | Interactive, info panel, highlight selected | Partial: verify against reference style | A/board/kit/subject_tools.dart |
| Break reminder, diagnostics, recording notice | n/a (Kinetix extras) | Built | A/classroom_plus/*.dart |

## 6. AI
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Kinetix AI smart tools grid | Summary, Quick Quiz, Lecture, Homework, Google, Wikipedia, Simulations, Periodic Table, Dictionary, Books, Graph, Calculator | Built (grid); dictionary fixed (see Dictionary row) | A/ai/ai_panel.dart, A/ai/smart_panels.dart |
| Quiz setup | Participants/teams, count, difficulty, type, timer, Start | Built | A/ai/quiz_setup.dart, A/ai/quiz_panel.dart |
| Quiz source: topic / Scan the Board (all pages or selected) | Both modes | Built | A/ai/quiz_setup.dart |
| Quiz explanation, Add to Board, exam importance | AI explains answer | Built | A/ai/quiz_panel.dart |
| Homework AI | Formats, marks, diagrams | Built | A/ai/homework_panel.dart |
| AI answer accuracy | Grounded, class/board aware | Built: prompt v2 (class, step-by-step, uncertainty, language), Unicode maths clean-up, 40-question eval set | A/ai/ai_controller.dart, services/api |
| Context-aware (board, selection) | Reads board | Built | A/ai/read_board_panel.dart |

## 7. Insert, split-screen, PDF/PPT
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Insert menu: PDF, Images, Videos, PPT, Clipboard, Geometry, Table, Flowchart | Popover | Built | B/insert_popover.dart, A/insert/insert_entries.dart |
| Second board in split screen | Full board: AI pen, two-finger tap undo, same gestures | Built: second board is a WhiteboardController + WhiteboardCanvas + AiPenOverlay that mirrors the one toolbar (mirrorToolsFrom); tools_test, input_config_test "second board follows" | B/panel/split_panel.dart, B/panel/panel_host.dart |
| PDF import | Opens in split screen first; "Add to board" per page or all ("Adding page to whiteboard" toast) | Built: opens in split pane; Add to board per page, selected pages or all | A/insert/document_import.dart |
| PPT import | Opens split; add all pages or pick pages; animations/transitions/media | Built: opens in split; add all or pick pages | A/insert/presentation_pane.dart, A/insert/pptx_render.dart |
| Intelligent split side | Opens on empty side, draggable divider | Built | B/panel/split_panel.dart |
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
| Profile Import PDF | Opens split screen first, with "add to board" | Built: profile Import uses importDocument → presentation split pane (add page, ticked pages, add all) | B/profile_menu.dart, A/insert/document_import.dart |
| Profile Import PPT | Add all or pick pages | Built: same split pane; add all or pick slides | A/insert/presentation_pane.dart |
| Your Classrooms | Classes taken per section/standard | Built: classroom_profile_ui.dart lists every class taught (section, standard, subject, sessions, last taken) from GET /v1/classroom/classrooms with Open class | B/classroom_profile_ui.dart, API classroom-profile |
| Schedule a Training | Training flow with QR | Built: pick a slot, topic, stored via API, status shown on the board; ERP /trainings lists and answers | B/classroom_profile_ui.dart, E/trainings | B/profile_menu.dart |
| What's New | Release feed | Built | B/profile_extras.dart |
| Guest mode | Basic teaching without login | Built | A/signin/sign_in_dialog.dart |
| Share whiteboard | Email, WhatsApp, QR | Built: WhatsApp opens, else the Android share sheet with the PDF; QR beside the buttons | B/share_whiteboard.dart |
| WhatsApp share sheet | Pages, PDF, message, send to number/groups | Built: Android share sheet carries the PDF and notes link | B/share_whiteboard.dart, core/api_client.dart |
| End class | Quick-group End Class, saves recording and summary | Built: notes, publish to students, session closed, summary with WhatsApp share | B/layout/board_chrome.dart, A/profiles/profiles_controller.dart |
| Settings / configurations | Board settings sheet | Built | B/profile_menu.dart |

## 9. Simulations hub
| Feature | Teachmint behaviour | KINETIX status | Files |
|---|---|---|---|
| Simulations hub | Not in Teachmint's board | Built: own panel (tools drawer, Simulations hub); about 40 sims by subject and class with Offline/Online badges and filters; 15 PhET sims and Blockly bundled and served offline; online: OSP, MW Next-Gen, LabXchange, ChemCollective, GeoGebra (non-commercial note), Polypad, CircuitJS, CircuitVerse, Wokwi, Mol*, EconGraphs, Pavlovia, TimelineJS, LearningApps, JupyterLite; native: Stroop, reaction time, memory span, macro money model, map lab (flutter_map), map quiz, key-dates timeline, LanguageTool check. Metadata (subject, gradeMin, gradeMax, tags, offline) for subject-context filtering | A/sim_hub/, assets/simhub/, docs/licensing/SIMULATIONS.md |
| Pin a sim to a page | n/a | Built: pin per board page, reopen from the panel | A/sim_hub/sim_server.dart (SimPins) |
| Sim picture to board | n/a | Built: Add to board with source and licence line (PhET sims via their own screenshot generator; other web pages may be blank on Android) | A/sim_hub/sim_hub_panel.dart |


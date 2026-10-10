import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show Model3dAnnotationStore, Model3dMirror, Model3dScope, Model3dSnapshot, SolidKind;
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_labs/kinetix_labs.dart' show LabReport, LabSpeech;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../cast/cast_panel.dart';
import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../core/recording/lesson_capture.dart';
import '../../demo/demo.dart';
import '../../l10n/l10n.dart';
import '../ai/ai_controller.dart';
import '../ai/ai_panel.dart';
import '../ai/homework_panel.dart';
import '../ai/quiz_panel.dart';
import '../books/books_panel.dart';
import '../class_check/class_check.dart';
import '../plan/plan_timer.dart';
import '../profiles/profile_boards.dart';
import '../profiles/profiles_ui.dart';
import '../projector/projector_controller.dart';
import '../projector/projector_ui.dart';
import '../concept_videos/concept_videos.dart';
import '../insert/insert_entries.dart';
import '../plan/todays_plan_panel.dart';
import '../recording/recording_ui.dart';
import '../help/help_sheet.dart';
import '../help/practice.dart';
import '../help/tour.dart';
import '../insert/document_import.dart';
import '../insert/insert_actions.dart';
import '../reader/read_aloud.dart';
import '../remote/board_remote.dart';
import '../remote/board_toolkit.dart';
import '../signin/sign_in_dialog.dart';
import '../phet/phet_panel.dart';
import '../phet/phet_strings.dart';
import '../sims/sims.dart';
import '../toolkit/toolkit_controller.dart';
import '../toolkit/remote_toolkit.dart';
import '../toolkit/toolkit_layer.dart';
import '../search/board_search.dart';
import '../search/solids3d.dart' show Solid3dDialog;
import 'ai_pen_ui.dart';
import 'animations_hook.dart';
import '../canvas_tools/canvas_tools.dart';
import 'chrome.dart';
import 'classroom_tools.dart';
import 'editors.dart';
import 'insert_popover.dart';
import 'kit/college/sheet_editor.dart';
import 'kit/kit_panel.dart';
import 'kit/subject_tools.dart';
import 'kit/subjects.dart';
import 'layout/backgrounds_popover.dart';
import 'layout/board_chrome.dart';
import 'layout/layout_strings.dart';
import 'ai_pen_models.dart';
import 'layout/page_overview.dart';
import 'layout/toolbar_layout.dart';
import 'layout/pen_popover.dart';
import 'layout/tools_drawer.dart';
import 'layout/ui_strings.dart';
import 'live_stream.dart';
import 'panel/badges_panel.dart';
import 'panel/panel_host.dart';
import 'panel/split_panel.dart';
import 'panel/videos_tab.dart';
import 'phone_chrome.dart';
import 'popovers.dart';
import 'profile_menu.dart';
import 'selection_actions.dart';
import 'side_panel.dart';
import 'whiteboard_dialogs.dart';
import '../../demo/demo_class_switcher.dart' show DemoClassSwitcher;
import '../../demo/demo_classes.dart' show DemoClass;
import '../classroom_plus/break_reminder.dart';
import '../classroom_plus/recording_notice.dart';
import '../classroom_plus/voice_commands.dart';
import 'layout/tool_palette.dart';
import '../classroom_plus/zones.dart';
import '../extras/board_extras.dart';
import '../extras/extras_hooks.dart';
import 'board_shot.dart';
import 'calculator.dart';
import '../insert/presentation_pane.dart';
import '../safe_web/safe_web.dart';
import 'layout/pen_modes.dart';
import 'classroom_apps.dart';
import 'classroom_profile_strings.dart';
import 'classroom_profile_ui.dart';
import 'profile_extras.dart';
import 'sb_strings.dart';
import 'share_whiteboard.dart';
import 'touch_lock.dart';
import 'version_history.dart';

/// The teaching screen, as in the approved wireframes (docs/design/board-wireframes.html): the
/// endless whiteboard ([WhiteboardController]) with
///
/// * the class bar at the top left (class and subject, Go live, attendance, time left) and
///   search, the clock and the profile at the top right;
/// * one floating main toolbar, bottom centre (Pen · Highlighter · Eraser · Select · Shapes │
///   Undo · Redo │ Tools · Add │ KINETIX AI), which the teacher can drag to the left or right
///   edge, or fold away;
/// * the menu and Record at the bottom left, the pages at the bottom right;
/// * the split panel (AI, 3D, Labs, Videos, Books, Kit, Animations) on the right, which also
///   takes every dialog and window, so the board stays visible and writable beside it.
///
/// On a phone the toolbar is a bottom bar with ⋯, the pages float above it and the panel is a
/// sheet over the lower half. For LKG to Class 5 the toolbar grows big labelled buttons, board
/// text is in Andika and the kit has class stars.
class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key, required this.board});

  final BoardController board;

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  late final WhiteboardController _wb = WhiteboardController(palmMode: widget.board.touchProfile.palmMode);
  final _images = BoardImages();
  final _canvasKey = GlobalKey<WhiteboardCanvasState>();
  final _secondInk = InkController();

  /// The second board (split screen): a full whiteboard that follows the main board's tools.
  late final WhiteboardController _secondWb = WhiteboardController(palmMode: widget.board.touchProfile.palmMode);
  late final AiPenController _secondPen = AiPenController(_secondWb, handwriting: widget.board.handwriting);
  late final AiController _ai;

  /// The AI pen: shapes, maths and words from what the teacher writes.
  late final AiPenController _pen;

  /// The model or lab view in the split pane, for a picture of it.
  final _splitKey = GlobalKey();

  /// The Sims tab (PhET, lib/features/phet): the sim open in it, for "Add to board".
  final _phet = PhetPanelController();

  /// Today's plan step timer: keeps running while other panels are open or the panel is closed.
  late final PlanTimer _planTimer;
  BoardPopover? _popover;
  PanelKind? _panel;

  /// The panel's share of the width beside the board (30–60 %), across all of it, and a
  /// phone's sheet's share of the height.
  double? _panelFraction;
  bool _panelFull = false;
  double _sheetFraction = 0.5;

  /// The pen and the laser write on the panel too.
  bool _writeOnPanel = false;

  /// The panel's own navigator: dialogs open in the panel (lib/features/board/panel).
  final _panelNav = GlobalKey<NavigatorState>();
  int _hosted = 0;

  /// A page of the panel that is not a tab (graph templates and other tools' content).
  ({String title, IconData icon, WidgetBuilder builder})? _page;
  SplitContent? _splitContent;
  String? _splitItem;
  String? _splitPreset;
  KitTab? _kitTab;

  /// The last three colours and thicknesses, and the pen type the Pen button goes back to.
  final _penMemory = PenMemory();
  BoardTool _lastPen = BoardTool.pen;

  /// Notes written on 3D models in the panel's 3D tab, kept with the board when it is saved
  /// (by model id) and put back when it is opened.
  Model3dAnnotationStore _modelNotes = Model3dAnnotationStore();

  /// While the toolbar is being dragged to an edge: how far it has moved.
  Offset? _toolbarDrag;
  BoardBackground? _lastPaper;

  /// The class toolkit: timer, stopwatch, name picker, dice, spinner, noise meter, shade and
  /// spotlight (lib/features/toolkit).
  late final ToolkitController _kit = ToolkitController(roster: () => board.pickable, demo: Demo.enabled)
    ..onTimeUp = () => mounted ? showBoardMessage(context, context.l10n.timesUp) : null;
  bool _signInOpen = false;
  Size _canvasSize = const Size(1920, 1080);
  String? _boardTitle;
  String? _lastSessionId;
  bool? _lastPrimary;

  /// The lesson being recorded, and the teacher who is recording it.
  LessonCapture? _capture;
  SessionContext? _captureTeacher;
  bool _captureStarting = false;

  /// "Ask the class" (features/class_check) and the phone remote (features/remote).
  late final ClassCheck _classCheck = ClassCheck(board);
  late final BoardRemote _remote;
  late final ToolkitRemote _remoteToolkit = ToolkitRemote(kit: _kit, wb: _wb, onChanged: () => _remote.sendState());

  /// Streams the board while school leaders or the class watch it live.
  late final LiveStream _live = LiveStream(board: _wb, send: (events) => board.sendLiveFrame(events));

  BoardController get board => widget.board;
  BoardBackground get _background => _wb.background;
  bool get _primary => board.primaryMode;
  SubjectStyle get _style => styleOf(board.session?.subjectName);

  @override
  void initState() {
    super.initState();
    board.addListener(_onBoardChanged);
    unawaited(loadCustomBoardFont(board));
    presentationHost = _showPresentation;
    _phet.addListener(_onPhetChanged);
    board.onLiveSnapshotRequest = _startLive;
    board.classAudio.onUnavailable = _classAudioUnavailable;
    // Someone asked to cast, or a screen was approved: the Cast tab opens for the teacher.
    board.cast.onAttention = () {
      if (mounted && _panel != PanelKind.cast) _show(PanelKind.cast);
    };
    _ai = AiController(board)
      ..captureBoard = _captureForAi
      ..readPages = _readPagesForAi
      ..addTextToBoard = _addTextToBoard
      ..runTool = ((id) {
        for (final t in _drawerTools(context.l10n)) {
          if (t.id == id) return t.onTap();
        }
      })
      ..openSearch = ((engine) {
        SafeBrowserPanel.nextEngine = engine;
        _show(PanelKind.web);
      })
      ..addQuestionToBoard = ((q) => _addTextToBoard(
        [q.question, for (final (k, o) in q.options.indexed) '${String.fromCharCode(65 + k)}. $o', if (q.answerText != null) '____'].join('\n'),
      ))
      ..pageCount = (() => _wb.pageCount)
      ..openSplit = _openSplit
      ..openBooks = (() => _openPanel(PanelKind.books));
    _lastSessionId = board.session?.sessionId;
    // Projector mode and shared-board profiles (features/projector, features/profiles).
    board.projector.attach(ProjectorSource(board: _wb, background: () => _background, canvas: () => _canvasSize, captureSplit: _captureLabForProjector));
    board.profiles.onSwitch = (from, to) => switchProfileBoard(_wb, _canvasSize, _profileBoards, from, to);
    _planTimer = PlanTimer(board);
    _pen = AiPenController(_wb, handwriting: board.handwriting)
      ..onNotice = _aiPenNotice
      ..onLetterSize = (px) => board.saveLetterSize(board.session?.teacherId, px);
    _applyClass();
    // A demo board fetches the English and shape models by itself when it is online.
    if (Demo.enabled) unawaited(autoDownloadDemoModels(board.handwriting, onReady: _pen.modelsChanged));
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_firstRunTour()));
    unawaited(_loadLetterSize());
    _remote = BoardRemote(board: board, wb: _wb, toolkit: _toolkit(), hooks: _remoteHooks());
    _wb.addListener(_onWbChanged);
    _wb.addListener(_mirrorSecond);
    _zones.addListener(_onZonesChanged);
    _mirrorSecond();
    PanelHost.active = _pushInPanel;
    // The classroom extras (lib/features/extras) and the demo class switcher.
    initBoardExtras();
    DemoClassSwitcher.attach(board, _onDemoClass);
    // A board that starts in the dark or chalkboard theme starts on that theme's paper.
    _followTheme();
  }

  /// The Pen button goes back to the last pen type; a page with other paper tells the live
  /// view and the projector.
  void _onWbChanged() {
    final t = _wb.tool;
    if (t == BoardTool.pen || t == BoardTool.laser) _lastPen = t;
    // The first time the AI pen is picked: offer its handwriting and shape models.
    if (t == BoardTool.aiPen && !_aiPenOffered) {
      _aiPenOffered = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        if (await offerAiPenModels(context, board.handwriting, board.textAiLanguage)) _pen.modelsChanged();
      });
    }
    final paper = _wb.background;
    if (paper != _lastPaper) {
      _lastPaper = paper;
      _live.background = paper;
      board.projector.background = paper;
    }
  }

  /// The toolkit as the phone remote drives it: the timer, the name picker and imported slides.
  BoardToolkit _toolkit() => _remoteToolkit;

  RemoteHooks _remoteHooks() => RemoteHooks(
    recording: () => _capture != null,
    startRecording: _toggleRecording,
    stopRecording: _stopRecording,
    showPhoto: (bytes) => unawaited(_addPhoto(bytes)),
    onAttached: () {
      if (mounted) showBoardMessage(context, context.l10n.remoteConnected);
    },
  );

  /// A photo from the teacher's phone, on the page.
  Future<void> _addPhoto(Uint8List bytes) async {
    try {
      final image = await decodeImageFromList(bytes);
      final w = math.min(720.0, image.width.toDouble());
      final h = w * image.height / math.max(1, image.width);
      image.dispose();
      _wb.insert([ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, w, h), bytes: bytes)]);
    } catch (_) {
      if (mounted) showBoardMessage(context, context.l10n.remotePhotoFailed);
    }
  }

  /// "Put results on board": the question's bar chart as a picture on the page.
  void _addPollResults(Uint8List png) {
    final size = _pngSize(png);
    _wb.insert([ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, size.width, size.height), bytes: png)]);
  }

  /// What the classroom extras may open and use (lib/features/extras).
  late final ExtrasHooks _extras = ExtrasHooks(
    board: board,
    wb: _wb,
    openPage: _openPage,
    openSplit: (c, id) => _openSplit(c, id),
    openPhet: _openPhet,
    openAnimations: (topic) => topic == null
        ? _show(PanelKind.animations)
        : _openPage(LayoutStrings.of(context).tabAnimations, Icons.animation, (c) => animationsPanel(c, wb: _wb, subject: board.session?.subjectName, topic: topic)),
    openKit: _openKit,
    openVideos: () => _show(PanelKind.videos),
    openPlan: () => _show(PanelKind.plan),
    openCamera: () => _show(PanelKind.camera),
    openWeb: () => _show(PanelKind.web),
    askClass: _classCheck.start,
    zones: _zones,
    voiceCommand: _runVoiceCommand,
  );

  /// Multi-user zones (lib/features/classroom_plus/zones.dart).
  late final BoardZones _zones = BoardZones(_wb);

  /// Does a spoken command (lib/features/classroom_plus/voice_commands.dart).
  bool _runVoiceCommand(VoiceCommand c) {
    final kit = _toolkit();
    switch (c.action) {
      case VoiceAction.nextPage:
        _wb.hasNext ? _wb.next() : _wb.addPage();
      case VoiceAction.previousPage:
        if (!_wb.hasPrevious) return false;
        _wb.previous();
      case VoiceAction.newPage:
        // Like Add Page: only after something is on this page.
        if (!_wb.canAddPage) return false;
        _wb.addPage();
      case VoiceAction.nextSlide:
        return kit.nextSlide();
      case VoiceAction.previousSlide:
        return kit.previousSlide();
      case VoiceAction.startTimer:
        kit.startTimer(c.duration ?? const Duration(minutes: 1));
      case VoiceAction.stopTimer:
        kit.stopTimer();
      case VoiceAction.pickStudent:
        kit.pickStudent();
      case VoiceAction.attendance:
        WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _attendance() : null);
      case VoiceAction.undo:
        if (!_wb.canUndo) return false;
        _wb.undo();
      case VoiceAction.redo:
        if (!_wb.canRedo) return false;
        _wb.redo();
      case VoiceAction.penColor:
        final color = voiceColors[c.color]?.$1;
        if (color == null) return false;
        _wb.penColor = color;
        _wb.tool = BoardTool.pen;
      case VoiceAction.usePen:
        _wb.tool = BoardTool.pen;
      case VoiceAction.useEraser:
        _wb.tool = BoardTool.eraser;
      case VoiceAction.useHighlighter:
        _wb.tool = BoardTool.highlighter;
      case VoiceAction.openTool:
        final tool = _drawerTools(context.l10n).where((t) => t.id == c.tool).firstOrNull;
        if (tool == null) return false;
        // After the dialog's frame, so the tool opens over the board and not the dialog.
        WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? tool.onTap() : null);
      case VoiceAction.stopListening:
        break;
    }
    return true;
  }

  /// A demo class was opened (the DEMO chip's timetable): a clean page on its paper, and its
  /// panel with the plan and the resources picked for it (primary classes start an activity).
  void _onDemoClass(DemoClass c) {
    if (!mounted) return;
    if (!_wb.isBlank) _wb.addPage();
    _wb.background = _themed(_style.paper);
    openDemoClassPanel(context, _extras);
  }

  @override
  void dispose() {
    _zones.dispose();
    if (presentationHost == _showPresentation) presentationHost = null;
    _ppt?.dispose();
    DemoClassSwitcher.detach(board);
    _wb.removeListener(_onWbChanged);
    if (PanelHost.active == _pushInPanel) PanelHost.active = null;
    board.removeListener(_onBoardChanged);
    _phet
      ..removeListener(_onPhetChanged)
      ..dispose();
    board.projector.attach(null);
    board.profiles.onSwitch = null;
    if (board.onLiveSnapshotRequest == _startLive) board.onLiveSnapshotRequest = null;
    if (board.classAudio.onUnavailable == _classAudioUnavailable) board.classAudio.onUnavailable = null;
    board.cast.onAttention = null;
    _live.stop();
    _remote.dispose();
    _remoteToolkit.dispose();
    _practice?.dispose();
    _classCheck.dispose();
    _capture?.dispose();
    _wb.removeListener(_mirrorSecond);
    _zones.removeListener(_onZonesChanged);
    _secondPen.dispose();
    _secondWb.dispose();
    _pen.dispose();
    _wb.dispose();
    _images.dispose();
    _modelNotes.dispose();
    _secondInk.dispose();
    _ai.dispose();
    _penMemory.dispose();
    _planTimer.dispose();
    _kit.dispose();
    super.dispose();
  }

  /// The page (or what is selected) as a PNG for KINETIX AI: what the class sees, not the whole
  /// endless board.
  Future<String> _captureForAi() async {
    final selected = _wb.selectedElements;
    final elements = selected.isNotEmpty ? selected : _wb.elements;
    final area = selected.isNotEmpty ? contentBounds(selected).inflate(24) : (_wb.visibleArea ?? Offset.zero & _canvasSize);
    return base64Encode(await renderPagePng(elements, _background, _canvasSize, area: area));
  }

  /// Scan Board (Quiz AI, Summary AI): the writing on [pages] (every page when empty) read by
  /// KINETIX AI, page by page. Typed text on the board is taken as it is.
  Future<String> _readPagesForAi(List<int> pages) async {
    final api = board.api;
    if (api == null) return '';
    final all = _wb.pages;
    final picked = pages.isEmpty ? [for (var i = 0; i < all.length; i++) i] : pages.where((i) => i >= 0 && i < all.length).toList();
    final out = StringBuffer();
    for (final i in picked) {
      final page = all[i];
      if (page.elements.isEmpty) continue;
      final typed = [for (final e in page.elements) if (e is TextElement) e.text];
      final png = await renderPagePng(page.elements, page.background, _canvasSize);
      final read = await api.readBoard(base64Encode(png), _ai.language);
      out.writeln('Page ${i + 1}:');
      if (typed.isNotEmpty) out.writeln(typed.join('\n'));
      out.writeln(read.result.text);
      if (read.result.math.isNotEmpty) out.writeln(read.result.math.join('\n'));
    }
    return out.toString();
  }

  /// Touch lock (Tools): the board takes no touches until the lock is held.
  bool _touchLocked = false;

  /// Hide (spec §10): every tool hidden, the canvas and a restore button left.
  bool _uiHidden = false;

  /// Screen Freeze (spec §61): nothing on the board can change until Close.
  bool _frozen = false;

  /// The open presentation beside the writing (PPT, spec §28).
  Presentation? _ppt;

  void _showPresentation(Presentation p) {
    _ppt?.dispose();
    setState(() => _ppt = p..addListener(() => setState(() {})));
  }

  void _closePresentation() {
    _ppt?.dispose();
    setState(() => _ppt = null);
  }

  /// Switch: the quick group and the page navigation trade sides (kept per teacher).
  bool get _barsSwapped => board.sbPref('barsSwapped') == 'true';
  void _switchSides() => board.setSbPref('barsSwapped', _barsSwapped ? null : 'true');

  /// Screenshot (Tools): what the board shows now, as a PNG.
  Future<Uint8List> _captureScreen() =>
      renderPagePng(_wb.elements, _background, _canvasSize, area: _wb.visibleArea ?? Offset.zero & _canvasSize, maxWidth: 2400);

  /// The calculator (Tools); its sum and answer go on the board as text.
  Future<void> _calculator() async {
    final text = await BoardCalculator.show(context);
    if (text == null || !mounted) return;
    const ink = WhiteboardController.inkBlack;
    _wb.insert([TextElement(id: newElementId(), position: Offset.zero, text: text, color: ink, fontSize: 40, size: measureBoardText(text, 40))]);
  }

  /// Opens a 3D model or lab (or their picker, with no id) next to the whiteboard.
  void _openSplit(SplitContent content, [String? id, String? preset]) => setState(() {
    _popHosted();
    _popover = null;
    _panel = PanelKind.split;
    _splitContent = content;
    _splitItem = id;
    _splitPreset = preset;
  });

  /// Class audio could not start (no microphone, permission, the microphone busy) or stopped.
  void _classAudioUnavailable(String reason) {
    if (!mounted) return;
    final l = context.l10n;
    showBoardMessage(context, reason == 'offline' ? l.cloudUnreachableCheckOnline : l.classAudioUnavailable(voiceReason(l, reason)));
  }

  void _startLive() => _live.start(background: _background, canvas: _canvasSize);

  /// The board's look for the class open now: Andika and the subject's paper.
  void _applyClass() {
    final primary = _primary;
    if (primary != _lastPrimary) {
      _lastPrimary = primary;
      _wb.font = primary ? BoardFont.andika : BoardFont.inter;
      if (primary) _wb.textSize = 40;
    }
    _syncPen();
  }

  /// The second board follows the one toolbar: tool, pen, colours, stylus tips, input setup and
  /// the AI pen's settings.
  void _mirrorSecond() {
    _secondWb.mirrorToolsFrom(_wb);
    _secondWb.inputConfig = widget.board.inputConfig;
    _secondPen
      ..mode = _pen.mode
      ..language = _pen.language
      ..textFont = _pen.textFont
      ..snapShapes = _pen.snapShapes
      ..convertShapes = _pen.convertShapes
      ..convertMaths = _pen.convertMaths
      ..convertText = _pen.convertText;
  }

  void _onZonesChanged() {
    if (mounted) setState(() {});
  }

  /// The AI pen's settings from Board settings. Primary boards have no AI pen (tidying shapes
  /// stays, as an option of the pen).
  void _syncPen() {
    if (_pen.mode != board.aiPenMode) _pen.mode = board.aiPenMode;
    _pen
      ..language = board.textAiLanguage
      ..textFont = board.textAiFont
      ..snapShapes = board.snapShapes
      ..convertShapes = board.aiPenConvert.contains('shapes')
      ..convertMaths = board.aiPenConvert.contains('maths')
      ..convertText = board.aiPenConvert.contains('text');
    applyStylusTips(_wb, board);
    _wb.inputConfig = board.inputConfig;
    _wb.measureNewShapes = board.measureShapes;
    if (_wb.measureUnit != board.measureUnit) _wb.measureUnit = board.measureUnit;
    if (_primary && (_wb.tool == BoardTool.aiPen || _wb.tool == BoardTool.laser)) _wb.tool = BoardTool.pen;
  }

  /// The handwriting size the AI pen learnt for this teacher.
  Future<void> _loadLetterSize() async {
    final px = await board.letterSize(board.session?.teacherId);
    if (mounted) _pen.letterPx = px ?? 46;
  }

  /// Whether the AI pen's models were offered in this session (once per device, see
  /// [offerAiPenModels]).
  bool _aiPenOffered = false;

  void _aiPenNotice(AiPenNotice n) {
    if (mounted) showBoardMessage(context, aiPenNoticeText(context.l10n, n, board.aiPenLanguage));
  }

  /// Opens the maths solver on an equation from the board.
  void _solveMath(MathElement e) {
    _ai.solve(_pen.solverText(e));
    setState(() {
      _popover = null;
      _panel = PanelKind.ai;
    });
  }

  /// Converts the selected ink with the AI pen.
  Future<void> _convertSelection() async {
    final strokes = _wb.selectedElements.whereType<Stroke>().toList();
    _wb.clearSelection();
    await _pen.convertStrokes(strokes);
  }

  void _onBoardChanged() {
    _followTheme();
    if (board.liveViewers == 0 && _live.isStreaming) _live.stop();
    _applyClass();
    final id = board.session?.sessionId;
    if (id == _lastSessionId) return;
    _lastSessionId = id;
    unawaited(_loadLetterSize());
    if (_signInOpen && id != null) Navigator.of(context).pop();
    // A new class on a clean board starts on its subject's paper.
    if (id != null && _wb.isBlank) _wb.background = _themed(_style.paper);
    // The period ended (or the teacher signed out elsewhere) mid-recording: keep what was
    // recorded; it uploads when this teacher next signs in.
    if (id == null && _capture != null) unawaited(_stopRecording());
    final s = board.session;
    // The teacher's language may differ from the board's: the new strings arrive with the
    // next frame, so the message is shown then.
    unawaited(
      WidgetsBinding.instance.endOfFrame.then((_) {
        if (!mounted) return;
        final l = context.l10n;
        showBoardMessage(context, s == null ? l.signedOutGuest : '${l.welcomeTeacher(s.teacherName.split(' ').first)} ${s.classLabel ?? ''}'.trim());
      }),
    );
  }

  void _toggle(BoardPopover p) => setState(() => _popover = _popover == p ? null : p);

  /// The toolbar's Pen, Highlighter, Eraser and Select: a second tap on the tool in use opens
  /// its options (the pen popover, the eraser's).
  void _onToolButton(BoardTool t) {
    final now = _wb.tool;
    switch (t) {
      case BoardTool.aiPen when now == BoardTool.aiPen:
      case BoardTool.pen when now == BoardTool.pen || now == BoardTool.laser:
      case BoardTool.highlighter when now == BoardTool.highlighter:
        _toggle(BoardPopover.pen);
        return;
      case BoardTool.eraser when now == BoardTool.eraser:
        _toggle(BoardPopover.erase);
        return;
      case BoardTool.pen:
        _wb.tool = _primary && _lastPen != BoardTool.pen ? BoardTool.pen : _lastPen;
      default:
        _wb.tool = t;
    }
    setState(() => _popover = null);
  }

  void _openPanel(PanelKind k) => setState(() {
    _popHosted();
    _popover = null;
    _booksTopic = null;
    _panel = _panel == k ? null : k;
  });

  /// Opens the AI panel at one of its tools.
  void _openAi(AiView v) {
    _ai.open(v);
    setState(() {
      _popover = null;
      _panel = PanelKind.ai;
    });
  }

  void _openKit([KitTab? tab]) => setState(() {
    _popover = null;
    _kitTab = tab;
    _panel = PanelKind.kit;
  });

  /// The topic Books opens at, when it is opened from Today's plan.
  String? _booksTopic;

  void _openTopic(String topicId) => setState(() {
    _booksTopic = topicId;
    _panel = PanelKind.books;
  });

  /// Sign in: "Who is teaching?" first when teachers have PINs on this board (features/profiles).
  Future<void> _signIn() async {
    if (board.api == null) {
      showBoardMessage(context, context.l10n.signInNeedsEnrolment);
      return;
    }
    await showSignInChoice(context, board, _signInWithTeacherApp);
  }

  // Each teacher's own whiteboard when they switch with a PIN, and the lab for the projector.
  final ProfileBoardStore _profileBoards = FileProfileBoardStore();
  Future<Uint8List?> _captureLabForProjector() async =>
      _panel == PanelKind.split && _splitContent == SplitContent.lab ? captureBoundaryPng(_splitKey) : null;

  Future<void> _signInWithTeacherApp() async {
    final api = board.api;
    if (api == null || !mounted) return;
    setState(() => _signInOpen = true);
    await showDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: SignInDialog(api: api, boardName: board.deviceName, onTapSignIn: board.openSession),
      ),
    );
    if (mounted) setState(() => _signInOpen = false);
  }

  /// The App theme the board's paper follows (light, dark or chalkboard; never system).
  BoardTheme _theme = BoardTheme.light;

  BoardTheme get _resolvedTheme => board.theme.resolve(WidgetsBinding.instance.platformDispatcher.platformBrightness);

  /// The board follows the App theme: the pages on the old theme's paper (white, the dark
  /// board or the chalkboard) take the new theme's; a page with a template or a colour keeps
  /// it. Ink keeps its colour and is drawn for contrast ([inkColorFor]).
  void _followTheme() {
    final t = _resolvedTheme;
    if (t == _theme) return;
    final from = themePaper(_theme), to = themePaper(t);
    _theme = t;
    final was = _background;
    _wb.replaceBackground(from, to);
    if (_background != was) _setBackground(_background);
  }

  /// [paper] as this theme shows it: plain paper is the dark board in the dark theme.
  BoardBackground _themed(BoardBackground paper) => themePapers.contains(paper) ? themePaper(_theme) : paper;

  void _setBackground(BoardBackground b) {
    _wb.background = b;
    _capture?.background = b;
    _live.background = b;
    board.projector.background = b;
    setState(() {});
  }

  // --- Writing on the board --------------------------------------------------------------------

  Future<String?> _editMath(String? latex) =>
      showPanelDialog<String>(context: context, builder: (_) => MathEditorDialog(initial: latex));

  Future<String?> _editNote(String? text, NoteKind kind) =>
      showPanelDialog<String>(context: context, builder: (_) => NoteEditorDialog(initial: text, kind: kind));

  /// An equation, written in the editor and put in view.
  Future<void> _newEquation() async {
    final tex = await _editMath(null);
    if (tex != null && tex.isNotEmpty) {
      const fs = 40.0;
      _wb.insert([MathElement(id: newElementId(), position: Offset.zero, latex: tex, color: _wb.penColor, fontSize: fs, size: estimateMathSize(tex, fs))]);
    }
  }

  SubjectToolRunner get _subjectTools =>
      SubjectToolRunner(context: context, wb: _wb, style: _style, primary: _primary, board: board, onOpenKit: (tab) => _openKit(tab));

  /// Edits a selected equation, note, text or spreadsheet.
  Future<void> _editElement(BoardElement e) async {
    switch (e) {
      case MathElement():
        final tex = await _editMath(e.latex);
        if (tex == null) return;
        tex.isEmpty ? _wb.removeIds({e.id}) : _wb.replace(e.copyWith(latex: tex, size: estimateMathSize(tex, e.fontSize)));
      case NoteElement():
        final text = await _editNote(e.text, e.kind);
        if (text == null) return;
        text.trim().isEmpty ? _wb.removeIds({e.id}) : _wb.replace(e.copyWith(text: text));
      case TextElement():
        _wb.clearSelection();
        _canvasKey.currentState?.startText(e.position, existing: e);
      case SheetElement():
        final s = await editSheet(context, e);
        if (s != null) _wb.replace(s);
      default:
        break;
    }
  }

  /// Reads what is selected with KINETIX AI.
  void _readSelectionWithAi() {
    if (!_ai.canUseAi) {
      showBoardMessage(context, context.l10n.aiAskNeedsSignIn);
      return;
    }
    // Select & Ask (spec §39): typed text goes as it is; ink is read when an action is picked.
    _ai.selectedContent = [
      for (final e in _wb.selectedElements)
        if (e is TextElement) e.text,
    ].join('\n');
    _ai.selectAsk.clear();
    _openAi(AiView.selectAsk);
  }

  /// Puts a picture of the 3D model or lab in the split pane on the board, linked to it, so a
  /// tap on the picture opens it again.
  Future<void> _snapshotSplit() async {
    final boundary = _splitKey.currentContext?.findRenderObject();
    final kind = _splitContent, id = _splitItem;
    if (boundary is! RenderRepaintBoundary || id == null || (kind != SplitContent.model3d && kind != SplitContent.lab)) return;
    try {
      Uint8List bytes;
      Size size;
      // A bench lab gives its report (aim, the experiment, readings, graph and result);
      // the hand-built simulations are pictured as they are.
      final report = kind == SplitContent.lab ? LabReport.findIn(_splitKey.currentContext!) : null;
      if (report != null) {
        bytes = await report.toPng();
        size = _pngSize(bytes);
      } else {
        final ratio = math.min(1.0, 1280 / math.max(1, boundary.size.width));
        final image = await boundary.toImage(pixelRatio: ratio);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        size = Size(image.width.toDouble(), image.height.toDouble());
        image.dispose();
        if (data == null) return;
        bytes = Uint8List.view(data.buffer);
      }
      if (!mounted) return;
      final w = math.min(560.0, size.width);
      _wb.insert([
        ImageElement(
          id: newElementId(),
          rect: Rect.fromLTWH(0, 0, w, w * size.height / math.max(1, size.width)),
          bytes: bytes,
          link: EmbedLink(kind: kind == SplitContent.lab ? EmbedLink.lab : EmbedLink.model3d, id: id, preset: _splitPreset),
        ),
      ]);
      showBoardMessage(context, context.l10n.snapshotAdded);
    } catch (e) {
      debugPrint('Snapshot failed: $e');
    }
  }

  /// A "Put on board" picture from the 3D viewer: the picture, linked to its model, and the
  /// model's credit under it where it has one.
  void _addModelSnapshot(Model3dSnapshot s) {
    final decoded = _pngSize(s.png);
    final w = math.min(560.0, decoded.width);
    final h = w * decoded.height / math.max(1, decoded.width);
    const ink = WhiteboardController.inkBlack;
    _wb.insert([
      ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, w, h), bytes: s.png, link: EmbedLink(kind: EmbedLink.model3d, id: s.modelId, preset: s.preset)),
      if (s.credit.isNotEmpty)
        TextElement(id: newElementId(), position: Offset(0, h + 6), text: s.credit, color: ink, fontSize: 14, size: measureBoardText(s.credit, 14)),
    ]);
    if (mounted) showBoardMessage(context, context.l10n.snapshotAdded);
  }

  /// A narrated 3D scene's caption, read with the board's voices as its steps go by.
  void _readSceneCaption(String text, String lang) => unawaited(speakOnce(text));

  /// The 3D models' notes of a board just opened (or none, for a fresh one).
  void _setModelNotes(Map<String, dynamic> json) {
    final old = _modelNotes;
    setState(() => _modelNotes = Model3dAnnotationStore.fromJson(json));
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
  }

  /// A PNG's size from its header (640 × 480 when it cannot be read).
  static Size _pngSize(Uint8List png) {
    if (png.length < 24) return const Size(640, 480);
    final d = ByteData.sublistView(png);
    final w = d.getUint32(16), h = d.getUint32(20);
    return w == 0 || h == 0 ? const Size(640, 480) : Size(w.toDouble(), h.toDouble());
  }

  void _openLink(EmbedLink link) {
    // A solid put on the board opens in the solid explorer again, with its painted faces.
    final solid = SolidKind.values.where((k) => k.id == link.id).firstOrNull;
    if (link.kind == EmbedLink.model3d && solid != null) {
      unawaited(Solid3dDialog.open(context, solid, faceColors: link.preset));
      return;
    }
    switch (link.kind) {
      case EmbedLink.lab:
        _openSplit(SplitContent.lab, link.id, link.preset);
      case EmbedLink.model3d:
        _openSplit(SplitContent.model3d, link.id, link.preset);
    }
  }

  // --- Lesson recording ----------------------------------------------------------------------

  Future<void> _toggleRecording() async {
    setState(() => _popover = null);
    if (_capture != null) return _stopRecording();
    final s = board.session;
    if (s == null) {
      showBoardMessage(context, context.l10n.recordNeedsSignIn);
      return;
    }
    if (_captureStarting) return;
    _captureStarting = true;
    try {
      // The institution's policy, and the notice the first time in each class.
      if (!await RecordingPolicy.confirm(context, s.sessionId) || !mounted) return;
      final capture = await board.recordings.newCapture(id: board.newId(), board: _wb, background: _background, canvas: _canvasSize);
      final noSound = await capture.start();
      if (!mounted || board.session?.sessionId != s.sessionId) {
        await capture.stop();
        capture.dispose();
        await board.recordings.discard(capture.id);
        return;
      }
      setState(() {
        _capture = capture;
        _captureTeacher = s;
      });
      final l = context.l10n;
      showBoardMessage(context, noSound == null ? l.recordingStarted : l.recordingNoSound(voiceReason(l, noSound)));
    } catch (e) {
      if (mounted) showBoardMessage(context, context.l10n.couldNotStartRecording('$e'));
    } finally {
      _captureStarting = false;
    }
  }

  /// Stops recording and asks the teacher to save (and share) or discard it.
  Future<void> _stopRecording() async {
    final capture = _capture;
    final teacher = _captureTeacher;
    if (capture == null || teacher == null) return;
    setState(() {
      _capture = null;
      _captureTeacher = null;
    });
    final lesson = await capture.stop();
    capture.dispose();
    final initialTitle = mounted
        ? defaultRecordingTitle(teacher.subjectName, lesson.startedAt, fallback: context.l10n.defaultLessonName, locale: context.dateLocale)
        : defaultRecordingTitle(teacher.subjectName, lesson.startedAt);
    ({String title, bool share})? choice = (title: initialTitle, share: false);
    if (mounted) {
      choice = await showPanelDialog<({String title, bool share})>(
        context: context,
        barrierDismissible: false,
        builder: (_) => BoardChromeTheme(
          child: SaveRecordingDialog(
            initialTitle: initialTitle,
            classLabel: teacher.sectionName,
            duration: Duration(milliseconds: lesson.durationMs),
            hasAudio: lesson.hasAudio,
          ),
        ),
      );
    }
    if (choice == null) {
      await board.recordings.discard(lesson.id);
      if (mounted) showBoardMessage(context, context.l10n.recordingDiscarded);
      return;
    }
    try {
      await board.recordings.save(lesson, title: choice.title, share: choice.share, teacher: teacher);
      if (mounted) {
        showBoardMessage(
          context,
          board.session?.teacherId == teacher.teacherId ? context.l10n.recordingSavedUploading : context.l10n.recordingSavedLater(teacher.teacherName.split(' ').first),
        );
      }
    } catch (e) {
      if (mounted) showBoardMessage(context, context.l10n.couldNotSaveRecording('$e'));
    }
  }

  void _openRecordings() {
    showPanelDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: RecordingsDialog(recordings: board.recordings, signedInTeacherId: board.session?.teacherId),
      ),
    );
  }

  // --- Saving --------------------------------------------------------------------------------

  /// The board as it stands, ready to save.
  SavedBoard _snapshot() {
    _canvasKey.currentState?.commitText();
    return _wb.toSaved(_canvasSize).withModel3dNotes(_modelNotes.toJson());
  }

  Future<void> _save() async {
    setState(() => _popover = null);
    if (!board.isSignedIn) {
      showBoardMessage(context, context.l10n.saveNeedsSignIn);
      return;
    }
    if (_wb.isBlank) {
      showBoardMessage(context, context.l10n.nothingToSave);
      return;
    }
    final choice = await showPanelDialog<({String title, bool share})>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: SaveBoardDialog(initialTitle: _boardTitle ?? _defaultTitle(), classLabel: board.session?.sectionName),
      ),
    );
    if (choice == null || !mounted) return;
    await _saveAs(choice.title, share: choice.share);
  }

  String _defaultTitle() => board.defaultBoardTitle(DateTime.now(), fallback: context.l10n.defaultBoardName, locale: context.dateLocale);

  Future<bool> _saveAs(String title, {required bool share}) async {
    try {
      final saved = await board.saveBoard(_snapshot(), title: title, share: share);
      _boardTitle = title;
      if (mounted) {
        final l = context.l10n;
        showBoardMessage(context, saved.shared ? l.savedAndShared(saved.sectionName ?? l.theClass) : l.savedToWhiteboards);
      }
      return true;
    } catch (e) {
      if (mounted) showBoardMessage(context, context.l10n.couldNotSaveBoard('$e'));
      return false;
    }
  }

  void _openWhiteboards() {
    final api = board.api;
    if (!board.isSignedIn || api == null) {
      showBoardMessage(context, context.l10n.whiteboardsNeedSignIn);
      return;
    }
    showPanelDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: WhiteboardsDialog(
          api: api,
          onOpen: (summary) async {
            if (!_wb.isBlank) {
              final replace = await showPanelDialog<bool>(
                context: context,
                builder: (context) => BoardChromeTheme(
                  child: AlertDialog(
                    scrollable: true,
                    icon: const Icon(Icons.warning_amber_rounded),
                    title: Text(context.l10n.replaceBoardTitle),
                    content: Text(context.l10n.replaceBoardBody),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.l10n.cancel)),
                      FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(context.l10n.open)),
                    ],
                  ),
                ),
              );
              if (replace != true) return;
            }
            try {
              final saved = await api.whiteboard(summary.id);
              _wb.load(saved);
              // White paper and the dark board are the theme's: shown as this theme has it.
              for (final p in const [BoardBackground.plain, BoardBackground.night]) {
                if (_theme != BoardTheme.chalkboard) _wb.replaceBackground(p, themePaper(_theme));
              }
              _setModelNotes(saved.model3dNotes);
              board.whiteboardId = summary.id;
              setState(() => _boardTitle = summary.title);
              _capture?.background = saved.background;
              _live.background = saved.background;
              if (mounted) showBoardMessage(context, context.l10n.openedBoard(summary.title));
            } catch (e) {
              if (mounted) showBoardMessage(context, context.l10n.couldNotOpenBoard('$e'));
            }
          },
        ),
      ),
    );
  }

  Future<void> _endClass() async {
    final hasInk = !_wb.isBlank;
    var notes = '';
    var publish = board.session?.sectionName != null;
    final canShare = board.session?.sectionName != null;
    var save = hasInk;
    var share = hasInk && canShare;
    final ok = await showPanelDialog<bool>(
      context: context,
      builder: (context) => BoardChromeTheme(
        child: StatefulBuilder(
          builder: (context, setDialog) => AlertDialog(
            scrollable: true,
            icon: const Icon(Icons.logout),
            title: Text(context.l10n.endClassTitle),
            content: SizedBox(
              width: 480,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n.endClassBody),
                  if (_capture != null) ...[
                    const SizedBox(height: Kx.s12),
                    Text(context.l10n.endClassRecordingNote, key: const Key('end-recording-note')),
                  ],
                  const SizedBox(height: Kx.s12),
                  TextField(
                    key: const Key('end-notes'),
                    minLines: 2,
                    maxLines: 4,
                    onChanged: (v) => setDialog(() => notes = v),
                    decoration: InputDecoration(labelText: classroomStrings(context).t('endNotes'), hintText: classroomStrings(context).t('endNotesHint'), border: const OutlineInputBorder()),
                  ),
                  if (notes.trim().isNotEmpty && canShare)
                    SwitchListTile(
                      key: const Key('end-publish'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(classroomStrings(context).t('endPublish')),
                      value: publish,
                      onChanged: (v) => setDialog(() => publish = v),
                    ),
                  if (hasInk) ...[
                    const SizedBox(height: Kx.s12),
                    SwitchListTile(
                      key: const Key('end-save'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(context.l10n.saveThisBoard),
                      value: save,
                      onChanged: (v) => setDialog(() {
                        save = v;
                        if (!v) share = false;
                      }),
                    ),
                    SwitchListTile(
                      key: const Key('end-share'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(context.l10n.shareWithStudentsParents),
                      subtitle: Text(canShare ? board.session!.sectionName! : context.l10n.noClassTimetabled),
                      value: share,
                      onChanged: save && canShare ? (v) => setDialog(() => share = v) : null,
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.l10n.keepTeaching)),
              FilledButton(key: const Key('confirm-end'), onPressed: () => Navigator.pop(context, true), child: Text(context.l10n.endClass)),
            ],
          ),
        ),
      ),
    );
    if (ok != true) return;
    if (_capture != null) await _stopRecording();
    // If saving fails the class stays open, so nothing on the board is lost.
    if (save && !await _saveAs(_boardTitle ?? _defaultTitle(), share: share)) return;
    final teacher = board.session;
    bool waiting() => board.recordings.items.any((r) => r.teacherId == teacher?.teacherId && !r.uploaded && !r.failed);
    if (waiting() && mounted) showBoardMessage(context, context.l10n.uploadingBeforeSignOut);
    // The PDF of the board is made before it is cleared, for the share sheet.
    Uint8List? pdfBytes;
    if (hasInk && notes.trim().isNotEmpty) {
      try {
        final branding = await boardBranding(board, title: _boardTitle ?? _defaultTitle());
        pdfBytes = await boardPdf(_wb, _canvasSize, branding: branding);
        branding.logo?.dispose();
      } catch (_) {
        pdfBytes = null;
      }
    }
    final ended = await board.endClass(notes: notes.trim(), publish: publish && notes.trim().isNotEmpty);
    if (waiting() && mounted) {
      final name = teacher!.teacherName.split(' ').first;
      // Instead of the plain "Signed out" message, which is shown at the end of the frame
      // (see _onBoardChanged).
      await WidgetsBinding.instance.endOfFrame;
      if (mounted) {
        ScaffoldMessenger.of(context).clearSnackBars();
        showBoardMessage(context, context.l10n.signedOutRecordingPending(name));
      }
    }
    _wb.load(SavedBoard(background: themePaper(_theme), canvas: Size.zero, pages: const []));
    _setModelNotes(const {});
    final title = _boardTitle ?? _defaultTitle();
    _boardTitle = null;
    // The summary, with the share sheet (WhatsApp) for the notes link and the board PDF.
    if (ended != null && ended['notesSaved'] == true && mounted) {
      final bytes = pdfBytes;
      await showEndSummary(context, board, ended, pdf: bytes == null ? null : () async => bytes, pdfName: 'KINETIX $title.pdf');
    }
  }

  void _attendance() {
    if (board.roster.isEmpty) {
      showBoardMessage(context, context.l10n.attendanceNeedsClass);
      return;
    }
    showPanelDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: AttendanceDialog(roster: board.roster, initial: board.attendance, onSubmit: board.markAttendance),
      ),
    );
  }

  // --- Simulations -------------------------------------------------------------------------

  /// The simulation in the split panel.
  ActiveSim? _sim;

  Future<void> _openSim([SimKind? kind]) async {
    setState(() => _popover = null);
    final k = kind ?? await showPanelDialog<SimKind>(context: context, builder: (_) => const SimPickerDialog());
    if (k == null || !mounted) return;
    _sim = ActiveSim.of(k);
    _show(PanelKind.sim);
  }

  // --- Help, the tour and practice (lib/features/help) ----------------------------------------

  PracticeTracker? _practice;

  /// The board as it was before practice, put back when practice ends.
  SavedBoard? _beforePractice;

  /// The first time this board opens, the tour starts by itself.
  Future<void> _firstRunTour() async {
    if (!BoardTour.autoStart || await BoardTour.seen() || !mounted) return;
    await BoardTour.markSeen();
    if (mounted) await _startTour();
  }

  Future<void> _startTour() async {
    setState(() => _popover = null);
    if (board.toolbarCollapsed) board.setToolbarCollapsed(false);
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    final l = context.l10n;
    final steps = [for (final s in boardTourSteps(l)) _onScreen(s)];
    final done = await BoardTour.show(context, steps, finishLabel: _practice == null ? l.tourPractise : null);
    if (done && mounted && _practice == null) _startPractice();
  }

  /// On a phone most controls are in the More sheet: a step about one points at More.
  CoachStep _onScreen(CoachStep s) {
    final target = s.target;
    if (target == null || !context.isPhone || screenRectOf(context, target) != null) return s;
    return CoachStep(target: const Key('phone-more'), icon: s.icon, title: s.title, body: s.body);
  }

  void _openHelp() {
    final phone = context.isPhone;
    // The controls on screen now (the profile button is under the menu that opened help).
    final onScreen = {
      const Key('profile-button'),
      for (final (_, topics) in helpTopics(context.l10n))
        for (final t in topics)
          if (t.target != null && screenRectOf(context, t.target!) != null) t.target!,
    };
    setState(() => _popover = null);
    unawaited(
      HelpSheet.show(
        context,
        // On a phone, "Show me" points at More for what is in the More sheet.
        canShow: (k) => phone || onScreen.contains(k),
        onShowMe: (t) => unawaited(_showMe(t.target!, t.icon, t.title, t.steps.join(' '))),
        onTour: () => unawaited(_startTour()),
        onPractice: _practice == null ? _startPractice : null,
      ),
    );
  }

  /// Points at one control on the board.
  Future<void> _showMe(Key target, IconData icon, String title, String body) async {
    if (board.toolbarCollapsed) board.setToolbarCollapsed(false);
    await WidgetsBinding.instance.endOfFrame;
    if (mounted) await BoardTour.show(context, [_onScreen(CoachStep(target: target, icon: icon, title: title, body: body))]);
  }

  /// A practice page with a checklist; the board comes back as it was afterwards.
  void _startPractice() {
    final l = context.l10n;
    _beforePractice = _wb.toSaved(_canvasSize);
    _wb.load(SavedBoard(background: _background, canvas: _canvasSize, pages: [practicePage(l, dark: _background.isDark)]));
    setState(() {
      _popover = null;
      _practice = PracticeTracker(wb: _wb, kit: _kit);
    });
  }

  void _endPractice() {
    final before = _beforePractice;
    setState(() {
      _practice = null;
      _beforePractice = null;
    });
    for (final t in ToolkitItem.values) {
      _kit.close(t);
    }
    if (before != null) _wb.load(before);
    showBoardMessage(context, context.l10n.practiceEnded);
  }

  // --- Read aloud ----------------------------------------------------------------------------

  /// The immersive reader on [paragraphs].
  void _read(String title, List<String> paragraphs) {
    setState(() => _popover = null);
    unawaited(ImmersiveReader.open(context, title: title, paragraphs: paragraphs));
  }

  /// Reads a lab's step, aim or result once.
  Future<void> _speak(String text) async {
    final missing = await speakOnce(text);
    if (missing != null && mounted) showBoardMessage(context, context.l10n.readerNoVoice(voiceLanguageName(context.l10n, missing)));
  }

  /// Reads what is selected, else the whole page.
  void _readPage() {
    final selected = _wb.selectedElements;
    _read(context.l10n.readerPageTitle(_wb.pageIndex + 1), readableElements(selected.isNotEmpty ? selected : _wb.elements));
  }

  void _showKit(ToolkitItem t) {
    setState(() => _popover = null);
    _kit.show(t);
  }

  /// Runs a tool and closes the drawer.
  VoidCallback _run(VoidCallback f) => () {
    setState(() => _popover = null);
    f();
  };

  /// Opens the subject kit at [tab] (a tab of another subject's kit too).
  void _kitAt(KitTab tab) => _openKit(tab);

  /// Where a tool's menu opens: a third of the way down, left of the middle.
  Rect get _menuAnchor {
    final size = MediaQuery.sizeOf(context);
    return Rect.fromLTWH(size.width / 3, size.height / 3, 0, 48);
  }

  /// The tools drawer (screen 4): every smart tool, grouped. Tools that sit on the board float
  /// on it; tools with content open in the split panel.
  List<DrawerTool> _drawerTools(AppLocalizations l) {
    final s = LayoutStrings(Localizations.localeOf(context).languageCode);
    final runner = _subjectTools;
    const geo = ToolPalette.geometry, maths = ToolPalette.maths, sci = ToolPalette.science, com = ToolPalette.commerce, cs = ToolPalette.cs, cls = ToolPalette.classroom;
    void subject(SubjectTool t) => unawaited(runner.run(t, _menuAnchor));
    return [
      // Geometry
      DrawerTool('ruler', Icons.straighten, l.toolRuler, [ToolGroup.geometry, ToolGroup.maths], geo, _run(() => CanvasTools.openRuler(context, _wb))),
      DrawerTool('protractor', Icons.architecture, l.toolProtractor, [ToolGroup.geometry, ToolGroup.maths], geo, _run(() => CanvasTools.openProtractor(context, _wb))),
      DrawerTool('protractor-360', Icons.radio_button_checked, ToolStrings.of(context).t('protractor360'), [ToolGroup.geometry], geo, _run(() => CanvasTools.openProtractor360(context, _wb))),
      DrawerTool('set-square-45', Icons.change_history, s.setSquare45, [ToolGroup.geometry], geo, _run(() => CanvasTools.openSetSquare45(context, _wb))),
      DrawerTool('set-square-3060', Icons.signal_cellular_0_bar, s.setSquare3060, [ToolGroup.geometry], geo, _run(() => CanvasTools.openSetSquare3060(context, _wb))),
      DrawerTool('compass', Icons.radio_button_unchecked, l.toolCompass, [ToolGroup.geometry, ToolGroup.maths], geo, _run(() => CanvasTools.openCompass(context, _wb))),
      DrawerTool(
        'graphs',
        Icons.show_chart,
        s.graphTemplates,
        [ToolGroup.maths, ToolGroup.geometry, ToolGroup.science, ToolGroup.commerce],
        maths,
        _run(() => _openPage(s.graphTemplates, Icons.show_chart, (_) => CanvasTools.graphTemplatesPanel(controller: _wb, subject: board.session?.subjectName))),
      ),
      DrawerTool(
        'flowchart',
        Icons.account_tree_outlined,
        s.flowchart,
        [ToolGroup.cs, ToolGroup.geometry],
        cs,
        _run(() => unawaited(CanvasTools.insertFlowchart(context, _wb))),
      ),
      DrawerTool('calibrate', Icons.straighten_outlined, ToolStrings.of(context).t('calibrate'), [ToolGroup.geometry], geo, _run(() => unawaited(CanvasTools.calibrate(context)))),
      // Maths
      DrawerTool('calculator', Icons.calculate_outlined, l.toolCalculator, [ToolGroup.maths, ToolGroup.commerce, ToolGroup.science], maths, _run(() => unawaited(_calculator()))),
      DrawerTool('equation', Icons.functions, l.stEquation, [ToolGroup.maths, ToolGroup.science], maths, _run(() => unawaited(_newEquation()))),
      DrawerTool('graph-plotter', Icons.ssid_chart, l.stGraph, [ToolGroup.maths], maths, _run(() => subject(SubjectTool.graph))),
      DrawerTool('number-line', Icons.linear_scale, l.subjectToolName(SubjectTool.numberLine), [ToolGroup.maths], maths, _run(() => subject(SubjectTool.numberLine))),
      DrawerTool('formulas', Icons.calculate, l.kitTabName(KitTab.formulas), [ToolGroup.maths, ToolGroup.science, ToolGroup.commerce], maths, _run(() => _kitAt(KitTab.formulas))),
      DrawerTool('stats', Icons.bar_chart, l.kitTabName(KitTab.stats), [ToolGroup.maths, ToolGroup.commerce], maths, _run(() => _kitAt(KitTab.stats))),
      // Science
      DrawerTool('periodic-table', Icons.grid_on, l.kitTabName(KitTab.periodic), [ToolGroup.science], sci, _run(() => _kitAt(KitTab.periodic))),
      DrawerTool('physics-formulas', Icons.bolt_outlined, l.kitTabName(KitTab.physics), [ToolGroup.science], sci, _run(() => _kitAt(KitTab.physics))),
      DrawerTool('constants', Icons.pin_outlined, l.kitTabName(KitTab.constants), [ToolGroup.science], sci, _run(() => _kitAt(KitTab.constants))),
      DrawerTool('sims', Icons.science, l.simTitle, [ToolGroup.science, ToolGroup.maths], sci, _run(() => unawaited(_openSim()))),
      DrawerTool('phet', Icons.science, PhetStrings(s.lang).title, [ToolGroup.science, ToolGroup.maths], sci, _run(() => _show(PanelKind.phet))),
      DrawerTool('labs', Icons.biotech_outlined, LayoutStrings.of(context).tabLabs, [ToolGroup.science], sci, _run(() => _openSplit(SplitContent.lab))),
      DrawerTool('models3d', Icons.view_in_ar_outlined, l.splitModel3d, [ToolGroup.science, ToolGroup.geometry], sci, _run(() => _openSplit(SplitContent.model3d))),
      DrawerTool('circuit', Icons.electrical_services, l.subjectToolName(SubjectTool.circuit), [ToolGroup.science], sci, _run(() => subject(SubjectTool.circuit))),
      DrawerTool('atom', Icons.blur_circular, l.subjectToolName(SubjectTool.atom), [ToolGroup.science], sci, _run(() => subject(SubjectTool.atom))),
      DrawerTool('chem-equation', Icons.science_outlined, l.subjectToolName(SubjectTool.chemEquation), [ToolGroup.science], sci, _run(() => subject(SubjectTool.chemEquation))),
      // Commerce
      DrawerTool('spreadsheet', Icons.table_chart_outlined, s.spreadsheet, [ToolGroup.commerce, ToolGroup.maths], com, _run(() => subject(SubjectTool.sheet))),
      DrawerTool('accounts', Icons.account_balance_outlined, l.kitTabName(KitTab.accounts), [ToolGroup.commerce], com, _run(() => _kitAt(KitTab.accounts))),
      DrawerTool('finance', Icons.savings_outlined, l.kitTabName(KitTab.finance), [ToolGroup.commerce], com, _run(() => _kitAt(KitTab.finance))),
      // CS
      DrawerTool('code-lab', Icons.terminal, s.codeLab, [ToolGroup.cs], cs, _run(() => subject(SubjectTool.codeLab))),
      DrawerTool('code', Icons.code, l.subjectToolName(SubjectTool.code), [ToolGroup.cs], cs, _run(() => subject(SubjectTool.code))),
      DrawerTool('algorithms', Icons.sort, l.kitTabName(KitTab.algorithms), [ToolGroup.cs], cs, _run(() => _kitAt(KitTab.algorithms))),
      DrawerTool('cs-labs', Icons.memory, l.kitTabName(KitTab.csLabs), [ToolGroup.cs], cs, _run(() => _kitAt(KitTab.csLabs))),
      DrawerTool('logic', Icons.developer_board, l.kitTabName(KitTab.logic), [ToolGroup.cs], cs, _run(() => _kitAt(KitTab.logic))),
      DrawerTool('binary', Icons.looks_one_outlined, l.kitTabName(KitTab.binary), [ToolGroup.cs, ToolGroup.maths], cs, _run(() => _kitAt(KitTab.binary))),
      // Class
      for (final t in ToolkitItem.values) DrawerTool('toolkit-${t.name}', toolkitIcon(t), toolkitName(l, t), [ToolGroup.classroom], toolkitColor(t), () => _showKit(t)),
      DrawerTool('badges', Icons.emoji_events_outlined, s.badges, [ToolGroup.classroom], cls, _run(() => _show(PanelKind.badges))),
      DrawerTool('quick-quiz', Icons.quiz_outlined, s.quickQuiz, [ToolGroup.classroom], cls, _run(() => _show(PanelKind.quiz))),
      DrawerTool('ask-class', Icons.how_to_vote_outlined, l.toolAskClass, [ToolGroup.classroom], cls, _run(() => unawaited(_classCheck.ask(context)))),
      DrawerTool('attendance', Icons.how_to_reg_outlined, l.toolAttendance, [ToolGroup.classroom], cls, _run(_attendance)),
      DrawerTool('todays-plan', Icons.event_note_outlined, l.toolTodaysPlan, [ToolGroup.classroom], cls, _run(() => _show(PanelKind.plan))),
      DrawerTool('concept-videos', Icons.smart_display_outlined, l.toolConceptVideos, [ToolGroup.classroom, ToolGroup.science], cls, _run(() => _show(PanelKind.videos))),
      DrawerTool('dictionary', Icons.menu_book_outlined, s.dictionary, [ToolGroup.classroom], cls, _run(() => _kitAt(KitTab.words))),
      DrawerTool('timeline', Icons.timeline, l.kitTabName(KitTab.dates), [ToolGroup.classroom], cls, _run(() => _kitAt(KitTab.dates))),
      DrawerTool('read-aloud', Icons.record_voice_over_outlined, l.readerTitle, [ToolGroup.classroom], cls, _run(_readPage)),
      DrawerTool('second-board', Icons.vertical_split_outlined, s.secondBoard, [ToolGroup.classroom], cls, _run(() => _openSplit(SplitContent.whiteboard))),
      DrawerTool('laser', Icons.flare, l.toolLaser, [ToolGroup.classroom], cls, _run(() => _wb.tool = BoardTool.laser)),
      if (!_primary) DrawerTool('move', Icons.pan_tool_outlined, l.toolMove, [ToolGroup.classroom], cls, _run(() => _wb.tool = BoardTool.hand)),
      DrawerTool('eye-comfort', Icons.visibility_outlined, l.toolEyeComfort, [ToolGroup.classroom], cls, () => setState(() => _popover = BoardPopover.eyeComfort)),
      DrawerTool('screenshot', Icons.photo_camera_outlined, l.toolScreenshot, [ToolGroup.classroom], cls, _run(() => unawaited(BoardShot.take(context, _captureScreen)))),
      DrawerTool('touch-lock', Icons.lock_outline, l.toolTouchLock, [ToolGroup.classroom], cls, _run(() => setState(() => _touchLocked = true))),
      ...extraDrawerTools(context, _extras, run: (f) => _run(f)()),
    ];
  }

  /// The drawer's groups, the period's subject first.
  List<ToolGroup> get _groupOrder {
    final first = switch (_style.subject) {
      Subject.maths || Subject.statistics => [ToolGroup.maths, ToolGroup.geometry],
      Subject.physics || Subject.chemistry || Subject.biology || Subject.science || Subject.evs || Subject.geography => [ToolGroup.science, ToolGroup.maths],
      Subject.commerce || Subject.management || Subject.law => [ToolGroup.commerce, ToolGroup.maths],
      Subject.computer => [ToolGroup.cs, ToolGroup.maths],
      Subject.english || Subject.languages => [ToolGroup.language, ToolGroup.classroom],
      _ => [ToolGroup.classroom],
    };
    if (_primary) first.insertAll(0, [ToolGroup.primary, ToolGroup.language].where((g) => !first.contains(g)));
    return [...first, ...ToolGroup.values.where((g) => !first.contains(g))];
  }

  /// Tools that lead their group for the period's subject.
  List<String> get _preferredTools => switch (_style.subject) {
    Subject.commerce || Subject.management || Subject.law => const ['spreadsheet', 'formulas', 'accounts'],
    Subject.maths || Subject.statistics => const ['graphs', 'calculator', 'formulas'],
    Subject.physics => const ['physics-formulas', 'sims', 'labs'],
    Subject.chemistry => const ['periodic-table', 'chem-equation', 'labs'],
    Subject.biology => const ['models3d', 'labs'],
    Subject.computer => const ['code-lab', 'flowchart', 'algorithms'],
    _ => const [],
  };

  /// Search everything (lib/features/search): the top bar, the phone's More sheet, Ctrl+K.
  void _openSearch() {
    setState(() => _popover = null);
    unawaited(
      openBoardSearch(
        context,
        board: board,
        wb: _wb,
        tools: (l) => [
          ToolEntry(Icons.edit_outlined, l.pen, _style.accent, () => _onToolButton(BoardTool.pen)),
          ToolEntry(Icons.border_color_outlined, l.highlighter, _style.accent, () => _onToolButton(BoardTool.highlighter)),
          ToolEntry(Icons.auto_fix_normal, l.toolErase, _style.accent, () => _onToolButton(BoardTool.eraser)),
          ToolEntry(Icons.title, l.toolText, _style.accent, () => _onToolButton(BoardTool.text)),
          ToolEntry(Icons.interests_outlined, l.toolShapes, _style.accent, () => setState(() => _popover = BoardPopover.shapes)),
          ToolEntry(Icons.texture, l.toolTheme, _style.accent, () => setState(() => _popover = BoardPopover.background)),
          ToolEntry(Icons.photo_library_outlined, l.libTitle, _style.accent, () => unawaited(insertLibraryPicture(context, _wb, subject: board.session?.subjectName))),
          for (final t in _drawerTools(l)) ToolEntry(t.icon, t.label, t.color, t.onTap),
        ],
        kitTabs: kitTabsFor(_style, primary: _primary),
        subject: _style.subject,
        accent: _style.accent,
        onKit: _openKit,
        onSplit: _openSplit,
        onSim: (k) => unawaited(_openSim(k)),
        onTopic: _openTopic,
        onBooks: () => _show(PanelKind.books),
      ),
    );
  }

  // --- Keyboard ------------------------------------------------------------------------------

  /// Keyboard shortcuts, as on the KINETIX prototype: tool letters, Ctrl+Z/Y/C/X/V/D/A/G,
  /// Delete, arrows to nudge, page keys, + − 0 to zoom, Esc. Not while typing.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final typing = FocusManager.instance.primaryFocus?.context?.findAncestorWidgetOfExactType<EditableText>() != null;
    if (typing) return KeyEventResult.ignored;
    final keys = HardwareKeyboard.instance;
    final ctrl = keys.isControlPressed || keys.isMetaPressed;
    final shift = keys.isShiftPressed;
    final k = event.logicalKey;
    bool done(VoidCallback f) {
      f();
      return true;
    }

    final handled = switch (k) {
      LogicalKeyboardKey.keyZ when ctrl => done(shift ? _wb.redo : _wb.undo),
      LogicalKeyboardKey.keyY when ctrl => done(_wb.redo),
      LogicalKeyboardKey.keyC when ctrl => done(_wb.copySelection),
      LogicalKeyboardKey.keyX when ctrl => done(_wb.cutSelection),
      LogicalKeyboardKey.keyV when ctrl => done(_wb.paste),
      LogicalKeyboardKey.keyD when ctrl => done(_wb.duplicateSelection),
      LogicalKeyboardKey.keyA when ctrl => done(_wb.selectAll),
      LogicalKeyboardKey.keyG when ctrl => done(shift ? _wb.ungroupSelection : _wb.groupSelection),
      LogicalKeyboardKey.keyS when ctrl => done(() => unawaited(_save())),
      LogicalKeyboardKey.keyK when ctrl => done(_openSearch),
      LogicalKeyboardKey.slash when shift => done(_openHelp),
      LogicalKeyboardKey.delete || LogicalKeyboardKey.backspace => done(_wb.deleteSelection),
      LogicalKeyboardKey.escape => done(() {
        setState(() => _popover = null);
        _wb.clearSelection();
      }),
      LogicalKeyboardKey.pageDown => done(_wb.hasNext ? _wb.next : _wb.addPage),
      LogicalKeyboardKey.pageUp => done(_wb.previous),
      LogicalKeyboardKey.equal || LogicalKeyboardKey.add || LogicalKeyboardKey.numpadAdd => done(() => _wb.zoomBy(1.25)),
      LogicalKeyboardKey.minus || LogicalKeyboardKey.numpadSubtract => done(() => _wb.zoomBy(1 / 1.25)),
      LogicalKeyboardKey.digit0 || LogicalKeyboardKey.numpad0 => done(_wb.resetZoom),
      LogicalKeyboardKey.keyF when !ctrl => done(_wb.fitContent),
      LogicalKeyboardKey.arrowLeft || LogicalKeyboardKey.arrowRight || LogicalKeyboardKey.arrowUp || LogicalKeyboardKey.arrowDown
          when _wb.selection.isNotEmpty =>
        done(() {
          final step = shift ? 10.0 : 1.0;
          final d = switch (k) {
            LogicalKeyboardKey.arrowLeft => Offset(-step, 0),
            LogicalKeyboardKey.arrowRight => Offset(step, 0),
            LogicalKeyboardKey.arrowUp => Offset(0, -step),
            _ => Offset(0, step),
          };
          _wb.transformSelection((e) => e.translated(d));
        }),
      _ when !ctrl => switch (k) {
        LogicalKeyboardKey.keyV => done(() => _wb.tool = BoardTool.select),
        LogicalKeyboardKey.keyH when !_primary => done(() => _wb.tool = BoardTool.hand),
        LogicalKeyboardKey.keyP => done(() => _wb.tool = BoardTool.pen),
        LogicalKeyboardKey.keyI => done(() => _wb.tool = BoardTool.highlighter),
        LogicalKeyboardKey.keyW when !_primary => done(() => _wb.tool = BoardTool.aiPen),
        LogicalKeyboardKey.keyE => done(() => _wb.tool = BoardTool.eraser),
        LogicalKeyboardKey.keyT => done(() => _wb.tool = BoardTool.text),
        LogicalKeyboardKey.keyS => done(() => _wb.tool = BoardTool.shape),
        LogicalKeyboardKey.keyM => done(() => _wb.tool = BoardTool.math),
        LogicalKeyboardKey.keyN => done(() => _wb.tool = BoardTool.note),
        LogicalKeyboardKey.keyL when !_primary => done(() => _wb.tool = BoardTool.laser),
        LogicalKeyboardKey.keyC => done(() => _wb.tool = BoardTool.compass),
        LogicalKeyboardKey.keyR => done(_wb.toggleRuler),
        LogicalKeyboardKey.keyA when !_primary => done(() => _openPanel(PanelKind.ai)),
        _ => false,
      },
      _ => false,
    };
    return handled ? KeyEventResult.handled : KeyEventResult.ignored;
  }

  // --- The split panel ------------------------------------------------------------------------

  /// Shows [builder]'s dialog in the panel (PanelHost): the panel opens for it if it was closed,
  /// and closes again when the dialog is done.
  Future<T?> _pushInPanel<T>(WidgetBuilder builder) async {
    // A phone has no room for a dialog beside the board: it covers the screen, as before.
    if (context.isPhone) {
      setState(() => _popover = null);
      return showDialog<T>(context: context, builder: (context) => BoardChromeTheme(child: builder(context)));
    }
    setState(() {
      _popover = null;
      _panel ??= PanelKind.host;
    });
    if (_panelNav.currentState == null) await WidgetsBinding.instance.endOfFrame;
    final nav = _panelNav.currentState;
    if (nav == null || !mounted) return null;
    _hosted++;
    try {
      return await nav.push<T>(PanelDialogRoute<T>(builder: (context) => BoardChromeTheme(child: builder(context))));
    } finally {
      _hosted--;
      if (mounted && _hosted == 0 && _panel == PanelKind.host) setState(() => _panel = null);
    }
  }

  /// Puts away any dialog showing in the panel.
  void _popHosted() => _panelNav.currentState?.popUntil((r) => r.isFirst);

  void _closePanel() {
    _popHosted();
    _secondInk.clear();
    setState(() {
      _panel = null;
      _panelFull = false;
      _writeOnPanel = false;
      _sheetFraction = 0.5;
    });
  }

  /// Opens the panel at [k] (a tab or a page), whatever is showing now.
  void _show(PanelKind k) {
    _popHosted();
    setState(() {
      _popover = null;
      _booksTopic = null;
      _panel = k;
    });
  }

  /// A tool's content in the panel (graph templates and the like).
  void _openPage(String title, IconData icon, WidgetBuilder builder) {
    _page = (title: title, icon: icon, builder: builder);
    _show(PanelKind.page);
  }

  PanelTab? get _panelTab => switch (_panel) {
    PanelKind.ai || PanelKind.quiz || PanelKind.homework => PanelTab.ai,
    PanelKind.split => switch (_splitContent) {
      SplitContent.model3d => PanelTab.model3d,
      SplitContent.lab => PanelTab.labs,
      _ => null,
    },
    PanelKind.videos => PanelTab.videos,
    PanelKind.books => PanelTab.books,
    PanelKind.kit => PanelTab.kit,
    PanelKind.animations => PanelTab.animations,
    PanelKind.phet => PanelTab.sims,
    PanelKind.camera => PanelTab.camera,
    PanelKind.web => PanelTab.web,
    PanelKind.cast => PanelTab.cast,
    _ => null,
  };

  void _openTab(PanelTab t) {
    _popHosted();
    switch (t) {
      case PanelTab.ai:
        _openAi(AiView.home);
      case PanelTab.model3d:
        _openSplit(SplitContent.model3d);
      case PanelTab.labs:
        _openSplit(SplitContent.lab);
      case PanelTab.videos:
        _show(PanelKind.videos);
      case PanelTab.books:
        _show(PanelKind.books);
      case PanelTab.kit:
        _kitTab = null;
        _show(PanelKind.kit);
      case PanelTab.animations:
        _show(PanelKind.animations);
      case PanelTab.sims:
        _show(PanelKind.phet);
      case PanelTab.camera:
        _show(PanelKind.camera);
      case PanelTab.web:
        _show(PanelKind.web);
      case PanelTab.cast:
        _show(PanelKind.cast);
    }
  }

  void _onPhetChanged() {
    if (mounted) setState(() {});
  }

  /// Opens a PhET sim in the Sims tab (a topic's "Related PhET sims").
  void _openPhet(String id) {
    _phet.open(id);
    _show(PanelKind.phet);
  }

  /// "Add to board" in the panel's header, where what is showing has one.
  VoidCallback? get _addToBoard => _panel == PanelKind.phet
      ? (_phet.showing ? () => unawaited(addPhetShotToBoard(context, _wb, _phet, dark: _background.isDark)) : null)
      : _panel == PanelKind.split && _splitItem != null && (_splitContent == SplitContent.lab || _splitContent == SplitContent.model3d)
      ? () => unawaited(_snapshotSplit())
      : null;

  void _addVideoNote(ConceptVideo v) {
    _wb.insert([videoNote(v)]);
    showBoardMessage(context, LayoutStrings.of(context).videoNoteAdded);
  }

  Widget _panelContent() => switch (_panel!) {
    PanelKind.ai => AiPanel(ai: _ai),
    PanelKind.books => BooksPanel(
      key: ValueKey(_booksTopic),
      board: board,
      ai: _ai,
      onOpenPanel: _show,
      onOpenResource: _openSplit,
      onOpenPhet: _openPhet,
      initialTopicId: _booksTopic,
    ),
    PanelKind.plan => TodaysPlanPanel(board: board, timer: _planTimer, onOpenTopic: _openTopic),
    PanelKind.quiz => QuizPanel(ai: _ai),
    PanelKind.homework => HomeworkPanel(ai: _ai),
    PanelKind.kit => SubjectKitPanel(
      key: ValueKey('kit-${_style.subject.name}-$_kitTab'),
      board: board,
      wb: _wb,
      style: _style,
      primary: _primary,
      initialTab: _kitTab,
      onAi: _openAi,
      onPanel: _show,
      onSplit: _openSplit,
    ),
    PanelKind.split => SplitPanel(
      content: _splitContent,
      onContent: (c) => setState(() {
        _splitContent = c;
        _splitItem = _splitPreset = null;
      }),
      itemId: _splitItem,
      preset: _splitPreset,
      onItem: (id, preset) => setState(() {
        _splitItem = id;
        _splitPreset = preset;
      }),
      secondBoard: _secondBoard(),
      snapshotKey: _splitKey,
      onSnapshot: _snapshotSplit,
    ),
    PanelKind.videos => ConceptVideosTab(board: board, onAddNote: _addVideoNote),
    PanelKind.animations => animationsPanel(context, wb: _wb, subject: board.session?.subjectName),
    PanelKind.badges => BadgesPanel(board: board),
    PanelKind.phet => PhetPanel(downloads: phetDownloadsFor(board), controller: _phet, subject: board.session?.subjectName),
    PanelKind.sim => SimWindow(
      sim: _sim ?? ActiveSim.of(SimKind.values.first),
      onChanged: (s) => setState(() => _sim = s),
      onClose: _closePanel,
      onDrag: (_) {},
    ),
    PanelKind.page => _page == null ? const SizedBox.shrink() : PanelPage(icon: _page!.icon, title: _page!.title, child: Builder(builder: _page!.builder)),
    PanelKind.host => const SizedBox.shrink(),
    PanelKind.camera => docCameraPanel(_wb),
    PanelKind.web => safeBrowserPanel(_extras),
    PanelKind.cast => CastPanel(cast: board.cast, wb: _wb),
  };

  /// The second whiteboard in the split pane: the main board's canvas widget and AI pen overlay
  /// on a second controller, so gestures (two-finger undo, pinch, multi-touch) all work.
  Widget _secondBoard() => Stack(
    children: [
      Positioned.fill(
        child: WhiteboardCanvas(
          key: const Key('second-board'),
          controller: _secondWb,
          images: _images,
          inputMode: board.inputMode,
          multiWriter: _multiWriter(false),
          fingerTaps: board.fingerTaps,
          labels: _canvasLabels(context.l10n),
        ),
      ),
      Positioned.fill(
        child: BoardChromeTheme(
          child: AiPenOverlay(wb: _secondWb, pen: _secondPen, onSolve: _solveMath, onMessage: (m) => showBoardMessage(context, m)),
        ),
      ),
    ],
  );

  /// Every finger writes its own line: on panels and IR frames, when the teacher switched
  /// Multi Touch on (also on phones), and always while multi-user zones are running.
  bool _multiWriter(bool phone) => (board.multiWriter && !phone) || board.multiTouch == true || _zones.active;

  /// The panel's body: its content, with dialogs pushed over it in the panel's own navigator.
  Widget _panelBody() => _PanelContent(
    content: ReadAloudScope(
      read: _read,
      child: LabSpeech(speak: _speak, child: _panelContent()),
    ),
    child: Navigator(
      key: _panelNav,
      onGenerateRoute: (_) => PageRouteBuilder<void>(pageBuilder: (context, _, _) => const _PanelBase()),
    ),
  );

  Widget _panelFrame(PanelMode mode, double height) => BoardChromeTheme(
    child: SplitPanelFrame(
      tab: _panelTab,
      onTab: _openTab,
      mode: mode,
      onFull: () => setState(() => _panelFull = !_panelFull),
      onClose: _closePanel,
      onAddToBoard: _addToBoard,
      writeOnPanel: _writeOnPanel,
      onWriteOnPanel: () => setState(() => _writeOnPanel = !_writeOnPanel),
      inkLayer: PanelInkLayer(ink: _secondInk, wb: _wb),
      onSheetDrag: (dy) => setState(() => _sheetFraction = (_sheetFraction - dy / height).clamp(0.12, 1.0)),
      onSheetDragEnd: () {
        // Down past a quarter closes it; up past four fifths fills the screen.
        if (_sheetFraction < 0.25) {
          _closePanel();
        } else if (_sheetFraction > 0.8) {
          setState(() => _sheetFraction = 1);
        }
      },
      child: mode == PanelMode.sheet ? SafeArea(top: false, child: _panelBody()) : _panelBody(),
    ),
  );

  // --- Layout --------------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    InkLabels.answerCover = l.answerCover;
    return Model3dScope(
      onSnapshot: _addModelSnapshot,
      annotations: _modelNotes,
      mirror: Model3dMirror(wanted: () => board.projector.wantsPictures, send: board.projector.send3d),
      readAloud: _readSceneCaption,
      child: PanelHost(
        push: _pushInPanel,
        child: Focus(
          autofocus: true,
          onKeyEvent: _onKey,
          child: Scaffold(
            body: ListenableBuilder(
              listenable: board,
              builder: (context, _) => Stack(
                children: [
                  Positioned.fill(child: LayoutBuilder(builder: (context, size) => _layout(context, size))),
                  // Touch lock (Tools): over everything, the board and its panels, until held.
                  if (_frozen)
                    Positioned.fill(
                      child: BoardChromeTheme(
                        child: ScreenFreezeOverlay(onClose: () => setState(() => _frozen = false), closeLabel: SbStrings.of(context)('unfreeze'), frozenLabel: SbStrings.of(context)('frozen')),
                      ),
                    ),
                  if (_touchLocked) Positioned.fill(child: BoardChromeTheme(child: TouchLockOverlay(onUnlock: () => setState(() => _touchLocked = false)))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _layout(BuildContext context, BoxConstraints size) {
    final phone = context.isPhone;
    final w = size.maxWidth, h = size.maxHeight;
    final open = _panel != null;
    // A phone held upright gets the panel as a sheet over the lower part of the board; on its
    // side (and on panels and tablets) the panel sits beside the board.
    final sheet = phone && h >= w;
    final full = open && !sheet && _panelFull;
    // Half the width on a phone on its side, 42 % on a panel, until the teacher drags it.
    final fraction = _panelFraction ?? (phone ? 0.5 : panelDefault);
    final panelW = !open || sheet ? 0.0 : (full ? w : w * fraction);
    const dividerW = panelDividerWidth;
    final besideW = !open || sheet ? 0.0 : (full ? 0.0 : panelW + dividerW);
    final sheetH = open && sheet ? h * _sheetFraction : 0.0;
    return Stack(
      children: [
        // The board keeps its place in the tree when the panel opens and closes.
        Positioned(
          key: const ValueKey('board-area'),
          left: 0,
          top: 0,
          bottom: 0,
          // Across the whole panel the board keeps its size under it.
          width: !open || sheet ? w : w - (w * fraction + dividerW),
          child: LayoutBuilder(
            builder: (context, area) {
              _canvasSize = area.biggest;
              _capture?.fitCanvas(_canvasSize);
              return _boardArea(context, compact: phone || area.maxWidth < 1280, short: phone || area.maxHeight < 820, sheetCover: sheetH);
            },
          ),
        ),
        if (open && !sheet && !full)
          Positioned(left: w - besideW, top: 0, bottom: 0, width: dividerW, child: BoardChromeTheme(
              child: PanelDivider(
                // A little past the ends while dragging, kept to 30–60 % and snapped when let go.
                onDrag: (dx) => setState(() => _panelFraction = ((_panelFraction ?? fraction) - dx / w).clamp(panelMin - 0.05, panelMax + 0.05)),
                onDragEnd: () => setState(() => _panelFraction = snapPanelFraction(_panelFraction ?? fraction)),
              ),
            ),
          ),
        if (open && !sheet) Positioned(right: 0, top: 0, bottom: 0, width: panelW, child: _panelFrame(full ? PanelMode.full : PanelMode.side, h)),
        if (open && sheet) Positioned(left: 0, right: 0, bottom: 0, height: sheetH, child: _panelFrame(PanelMode.sheet, h)),
      ],
    );
  }

  WhiteboardCanvasLabels _canvasLabels(AppLocalizations l) =>
      WhiteboardCanvasLabels(typeHint: l.typeHint, hideRuler: l.hideRuler, hideProtractor: l.hideProtractor, turn: l.turn);

  /// The toolbar sits above the corners (a narrow board, or one beside the panel).
  bool _toolbarRaised = false;

  /// The toolbar's size across its dock (height at the bottom, width at an edge).
  double get _toolbarDepth => _primary ? 92 : 76;

  Widget _boardArea(BuildContext context, {required bool compact, required bool short, required double sheetCover}) {
    final l = context.l10n;
    final primary = _primary;
    final phone = context.isPhone;
    // A phone is held in the hand, never leant on, and one person writes on it: no palm
    // rejection (Android reports a thumb as big as a palm) and two fingers always move the board.
    _wb.palmMode = phone || !board.palmRejection ? PalmMode.off : board.touchProfile.palmMode;
    final safe = phone ? MediaQuery.paddingOf(context) : EdgeInsets.zero;
    final dock = phone ? ToolbarDock.bottom : board.toolbarDock;
    final collapsed = board.toolbarCollapsed;
    final edge = !phone && dock != ToolbarDock.bottom ? _toolbarDepth + 12 : 0.0;
    // The bar, and the page controls floating above it.
    final phoneBottom = safe.bottom + 52 + 2 * Kx.s8 + 48;
    // The board keeps clear of the toolbars (start view, fit, placement).
    _wb.safeInsets = phone
        ? EdgeInsets.fromLTRB(safe.left, safe.top + 56, safe.right, math.max(sheetCover, phoneBottom))
        : EdgeInsets.fromLTRB(dock == ToolbarDock.left ? edge : 0, 64, dock == ToolbarDock.right ? edge : 0, math.max(sheetCover, 84 + (dock == ToolbarDock.bottom && !collapsed ? 8 : 0)));
    return Stack(
      children: [
        Positioned.fill(
          child: WhiteboardCanvas(
            key: _canvasKey,
            controller: _wb,
            images: _images,
            inputMode: board.inputMode,
            multiWriter: _multiWriter(phone),
            fingerTaps: board.fingerTaps,
            editMath: _editMath,
            editNote: _editNote,
            labels: _canvasLabels(l),
            selectionActions: (context, box) => SelectionActions(
              wb: _wb,
              box: box,
              onOpenLink: _openLink,
              onEdit: _editElement,
              onAskAi: _readSelectionWithAi,
              onSolve: _solveMath,
              onConvertInk: primary ? null : () => unawaited(_convertSelection()),
              onReadings: (e) => _pen.conversions.containsKey(e.id) ? () => _pen.inspecting.value = e.id : null,
              onReadAloud: readableElements(_wb.selectedElements).isEmpty ? null : _readPage,
              onMeasureUnit: board.setMeasureUnit,
            ),
          ),
        ),
        // The AI pen's Convert button and its readings of what it converted.
        Positioned.fill(
          child: BoardChromeTheme(
            child: AiPenOverlay(wb: _wb, pen: _pen, onSolve: _solveMath, onMessage: (m) => showBoardMessage(context, m)),
          ),
        ),
        // The class toolkit: its cards, the screen shade and the spotlight (under the toolbars).
        Positioned.fill(
          child: ToolkitLayer(kit: _kit, insets: _wb.safeInsets, onAnswer: board.session == null ? null : board.recordAnswer),
        ),
        // Multi-user zones: a pen bar per zone, lines between zones.
        Positioned.fill(child: BoardChromeTheme(child: BoardZonesLayer(zones: _zones))),
        // The 20-20-20 break reminder (Eye comfort → Break reminders).
        Positioned(
          top: 72,
          left: Kx.s16,
          right: Kx.s16,
          child: Center(
            child: BoardChromeTheme(
              child: BreakReminderBanner(activity: _wb, enabled: () => board.eyeComfort.breakReminder),
            ),
          ),
        ),
        if (_practice != null)
          Positioned(
            left: phone ? Kx.s8 + safe.left : null,
            right: phone ? Kx.s8 + safe.right : Kx.s16,
            bottom: phone ? phoneBottom : 100 + Kx.boardTarget + 16,
            child: BoardChromeTheme(
              child: PracticePanel(
                tracker: _practice!,
                onFinish: _endPractice,
                onShowMe: (t) {
                  final (text, icon, key) = practiceText(context.l10n, t);
                  unawaited(_showMe(key, icon, text, ''));
                },
              ),
            ),
          ),
        if (_ppt case final ppt?)
          Positioned(
            key: const Key('presentation'),
            top: ppt.edgeToEdge ? 0 : 64,
            bottom: ppt.edgeToEdge ? 0 : 96,
            left: ppt.edgeToEdge || ppt.left ? 0 : null,
            right: ppt.edgeToEdge || !ppt.left ? 0 : null,
            width: ppt.edgeToEdge ? null : _canvasSize.width * ppt.fraction,
            child: BoardChromeTheme(
              child: PresentationPane(
                p: ppt,
                wb: _wb,
                width: _canvasSize.width,
                onClose: _closePresentation,
                labels: PresentationLabels(
                  previous: SbStrings.of(context)('pptPrev'),
                  next: SbStrings.of(context)('pptNext'),
                  addPage: SbStrings.of(context)('pptAddPage'),
                  addAll: SbStrings.of(context)('pptAddAll'),
                  edgeToEdge: SbStrings.of(context)('pptEdge'),
                  present: SbStrings.of(context)('pptPresent'),
                  close: SbStrings.of(context)('pptClose'),
                  noPresenter: SbStrings.of(context)('pptNoPresenter'),
                  added: (n) => SbStrings.of(context)('pptAdded', {'n': n}),
                  addSelected: (n) => SbStrings.of(context)('pptAddSelected', {'n': n}),
                ),
              ),
            ),
          ),
        Positioned.fill(child: ClassCheckOverlay(check: _classCheck, onPutOnBoard: _addPollResults, insets: _wb.safeInsets)),
        Positioned.fill(child: RemotePointer(remote: _remote)),
        if (phone)
          ..._phoneChrome(context, safe)
        else if (_uiHidden)
          Positioned(
            left: Kx.s12,
            bottom: Kx.s12,
            child: BoardChromeTheme(
              child: ChromeSurface(
                child: ToolButton(key: const Key('restore-ui'), icon: Icons.visibility_outlined, label: SbStrings.of(context)('restore'), onTap: () => setState(() => _uiHidden = false)),
              ),
            ),
          )
        else
          ..._panelChrome(context, compact: compact, short: short, dock: dock, collapsed: collapsed),
        if (_popover != null)
          Positioned.fill(
            child: GestureDetector(
              key: const Key('popover-barrier'),
              behavior: HitTestBehavior.opaque,
              onTap: () => setState(() => _popover = null),
            ),
          ),
        if (_popover != null) _popoverLayer(context, phone: phone, safe: safe, dock: dock, collapsed: collapsed),
      ],
    );
  }

  Widget? _recordingIndicator() =>
      _capture == null ? null : RecordingIndicator(capture: _capture!, onPause: _capture!.pause, onResume: _capture!.resume, onStop: _stopRecording);

  MainToolbar _toolbar(ToolbarDock dock, bool collapsed) => MainToolbar(
    wb: _wb,
    memory: _penMemory,
    dock: dock,
    collapsed: collapsed,
    items: () => _layoutItems(phone: false),
    onMore: () => _openMore(const [], phone: false),
    onEdit: () => unawaited(_editToolbar()),
    onCollapse: (v) {
      setState(() => _popover = null);
      board.setToolbarCollapsed(v);
    },
    onDragStart: (d) => setState(() {
      _toolbarDrag = Offset.zero;
      _toolbarGrab = d.globalPosition;
    }),
    onDragUpdate: (d) => setState(() {
      _toolbarDrag = (_toolbarDrag ?? Offset.zero) + d.delta;
      _toolbarGrab = d.globalPosition;
    }),
    onDragEnd: (d) {
      final box = context.findRenderObject() as RenderBox?;
      final size = box?.size ?? const Size(1920, 1080);
      final at = box == null || _toolbarGrab == null ? null : box.globalToLocal(_toolbarGrab!);
      setState(() {
        _toolbarDrag = null;
        _toolbarGrab = null;
      });
      if (at != null) board.setToolbarDock(toolbarDockAt(at, size));
    },
  );

  /// Where the grip was while the toolbar is dragged (it snaps to the nearest edge when let go).
  Offset? _toolbarGrab;

  /// Every tool the toolbar can carry, by id, in the board's order: what Edit toolbar offers and
  /// what ⋯ shows when it is not on the bar.
  Map<String, BarItem> _catalog() {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    final ts = ToolbarStrings.of(context);
    final tool = _wb.tool;
    final chromePaper = context.colors.brightness == Brightness.dark ? BoardBackground.night : BoardBackground.plain;
    BarItem kit(ToolkitItem t) => BarItem(Key('tbar-${t.name}'), toolkitIcon(t), toolkitName(l, t), _run(() => _showKit(t)), selected: _kit.isOpen(t));
    return {
      'pen': BarItem(
        const Key('tool-pen'),
        penIcon(_wb),
        tool == BoardTool.laser ? l.toolLaser : l.pen,
        () => _onToolButton(BoardTool.pen),
        selected: tool == BoardTool.pen || tool == BoardTool.laser || (_popover == BoardPopover.pen && tool != BoardTool.aiPen),
        color: tool == BoardTool.pen ? inkColorFor(_wb.penColor.withValues(alpha: 1), chromePaper) : null,
      ),
      if (!_primary)
        'ai-pen': BarItem(
          const Key('tool-ai-pen'),
          aiPenIcon,
          l.aiPen,
          () => _onToolButton(BoardTool.aiPen),
          selected: tool == BoardTool.aiPen,
          color: tool == BoardTool.aiPen ? null : aiPenColor(context),
        ),
      // The laser: a tap points, a second tap goes back to the pen.
      if (!_primary)
        'laser': BarItem(
          const Key('tool-laser'),
          Icons.flare,
          l.toolLaser,
          _run(() => _wb.tool = tool == BoardTool.laser ? BoardTool.pen : BoardTool.laser),
          selected: tool == BoardTool.laser,
          color: tool == BoardTool.laser ? null : const Color(0xFFD93025),
        ),
      'highlighter': BarItem(const Key('tool-highlighter'), Icons.border_color_outlined, l.highlighter, () => _onToolButton(BoardTool.highlighter), selected: tool == BoardTool.highlighter),
      'eraser': BarItem(const Key('tool-erase'), Icons.auto_fix_normal, s.eraser, () => _onToolButton(BoardTool.eraser), selected: tool == BoardTool.eraser || _popover == BoardPopover.erase),
      'select': BarItem(const Key('tool-select'), Icons.highlight_alt, l.toolSelect, () => _onToolButton(BoardTool.select), selected: tool == BoardTool.select),
      'shapes': BarItem(const Key('tool-shapes'), Icons.category_outlined, l.toolShapes, () => _toggle(BoardPopover.shapes), selected: tool == BoardTool.shape || _popover == BoardPopover.shapes),
      'text': BarItem(const Key('tbar-text'), Icons.title, l.toolText, _run(() => _wb.tool = BoardTool.text), selected: tool == BoardTool.text),
      if (!_primary) 'move': BarItem(const Key('tbar-move'), Icons.pan_tool_outlined, l.toolMove, _run(() => _wb.tool = BoardTool.hand), selected: tool == BoardTool.hand),
      'undo': BarItem(const Key('undo'), Icons.undo, l.toolUndo, _wb.undo, enabled: _wb.canUndo),
      'redo': BarItem(const Key('redo'), Icons.redo, l.toolRedo, _wb.redo, enabled: _wb.canRedo),
      'add-page': BarItem(const Key('tbar-add-page'), Icons.note_add_outlined, s.addPage, _run(_wb.addPage)),
      'clear': BarItem(const Key('tbar-clear'), Icons.layers_clear_outlined, l.clearPage, _run(() => unawaited(confirmClearBoard(context, _wb))), enabled: _wb.canClearAllPages),
      'tools': BarItem(const Key('tool-tools'), Icons.grid_view_rounded, l.toolTools, () => _toggle(BoardPopover.tools), selected: _popover == BoardPopover.tools),
      'insert': BarItem(
        const Key('tool-insert'),
        Icons.add_box_outlined,
        s.add,
        () => _toggle(BoardPopover.insert),
        selected: _popover == BoardPopover.insert || tool == BoardTool.note || tool == BoardTool.math,
      ),
      'ruler': BarItem(const Key('tbar-ruler'), Icons.straighten, l.toolRuler, _run(() => CanvasTools.openRuler(context, _wb))),
      'protractor': BarItem(const Key('tbar-protractor'), Icons.architecture, l.toolProtractor, _run(() => CanvasTools.openProtractor(context, _wb))),
      'calculator': BarItem(const Key('tbar-calculator'), Icons.calculate_outlined, l.toolCalculator, _run(() => unawaited(_calculator()))),
      'timer': kit(ToolkitItem.timer),
      'stopwatch': kit(ToolkitItem.stopwatch),
      'picker': kit(ToolkitItem.picker),
      'spotlight': kit(ToolkitItem.spotlight),
      'apps': BarItem(const Key('tbar-apps'), Icons.apps, SbStrings.of(context)('apps'), _run(_openClassroomApps)),
      'screenshot': BarItem(const Key('tbar-screenshot'), Icons.photo_camera_outlined, l.toolScreenshot, _run(() => unawaited(BoardShot.take(context, _captureScreen)))),
      'models3d': BarItem(const Key('tbar-models3d'), Icons.view_in_ar_outlined, l.splitModel3d, _run(() => _openSplit(SplitContent.model3d))),
      'labs': BarItem(const Key('tbar-labs'), Icons.biotech_outlined, s.tabLabs, _run(() => _openSplit(SplitContent.lab))),
      'sims': BarItem(const Key('tbar-sims'), Icons.science, l.simTitle, _run(() => unawaited(_openSim()))),
      'animations': BarItem(const Key('tbar-animations'), Icons.animation, s.tabAnimations, _run(() => _show(PanelKind.animations))),
      'ai': BarItem(
        const Key('panel-ai'),
        Icons.auto_awesome,
        s.kinetixAi,
        () => _panel == PanelKind.ai ? _closePanel() : _openAi(AiView.home),
        selected: _panelTab == PanelTab.ai,
        color: const Color(0xFF835400),
        accent: const Color(0xFF835400),
      ),
      'search': BarItem(const Key('tbar-search'), Icons.search, ts.search, _run(_openSearch)),
      'record': BarItem(const Key('tbar-record'), _capture == null ? Icons.fiber_manual_record_outlined : Icons.stop_circle_outlined, ts.record, _run(() => unawaited(_toggleRecording())), selected: _capture != null),
      'eye-comfort': BarItem(const Key('tbar-eye-comfort'), Icons.visibility_outlined, l.toolEyeComfort, () => setState(() => _popover = BoardPopover.eyeComfort)),
      // Every tile of Tools too (the document camera, safe web, captions, seating, groups, the
      // magnifier, notes, exit tickets, the language kit, organisers, clocks, the scoreboard ...),
      // so any of them can sit on the bar.
      for (final t in _drawerTools(l))
        if (!_drawerOnCatalog.contains(t.id)) 'drawer:${t.id}': BarItem(Key('tbar-drawer-${t.id}'), t.icon, t.label, t.onTap),
    };
  }

  /// Tools tiles the catalogue already has under its own id (and calibrating, a one-off set-up
  /// that stays in Tools).
  static const _drawerOnCatalog = {'calibrate', 'ruler', 'protractor', 'calculator', 'sims', 'labs', 'models3d', 'laser', 'move', 'eye-comfort', 'screenshot', 'toolkit-timer', 'toolkit-stopwatch', 'toolkit-picker', 'toolkit-spotlight'};

  /// The ids on the bar for a phone or a panel: the teacher's own, or the default.
  List<String> _layoutIds({required bool phone, Map<String, BarItem>? catalog}) => ToolbarLayouts.clean(
    phone ? board.toolbarPhone : board.toolbarPanel,
    (catalog ?? _catalog()).keys,
    max: ToolbarLayouts.maxFor(phone: phone),
    fallback: ToolbarLayouts.defaults(phone: phone, primary: _primary),
  );

  /// The tools on the bar, in order.
  List<(String, BarItem)> _layoutItems({required bool phone}) {
    final cat = _catalog();
    return [for (final id in _layoutIds(phone: phone, catalog: cat)) (id, cat[id]!)];
  }

  /// Edit toolbar (a long press on the toolbar, or Menu → Customise toolbar): the tools on the
  /// bar of this device (a phone's or a panel's), in and out and in order, the dock, and Reset.
  Future<void> _editToolbar() async {
    final phone = context.isPhone;
    setState(() => _popover = null);
    final cat = _catalog();
    final defaults = ToolbarLayouts.defaults(phone: phone, primary: _primary);
    await showPanelDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: ToolbarEditor(
          catalog: cat,
          ids: _layoutIds(phone: phone, catalog: cat),
          max: ToolbarLayouts.maxFor(phone: phone),
          defaults: defaults,
          onChanged: (ids) => board.setToolbarTools(phone: phone, ids: listEquals(ids, defaults) ? null : ids),
          dock: phone ? null : board.toolbarDock,
          onDock: phone ? null : board.setToolbarDock,
        ),
      ),
    );
  }

  /// The chrome on an interactive panel, a tablet or a desktop.
  /// The page overview is open: the toolbars at the bottom make way for its sheet.
  bool get _bottomChromeHidden => _popover == BoardPopover.pages;

  List<Widget> _panelChrome(BuildContext context, {required bool compact, required bool short, required ToolbarDock dock, required bool collapsed}) {
    // The board's own width: narrower beside the split panel.
    final width = _canvasSize.width;
    final recording = _recordingIndicator();
    Widget themed(Widget child) => BoardChromeTheme(child: ToolbarDensity(compact: compact && !_primary, big: _primary, child: child));
    final drag = _toolbarDrag ?? Offset.zero;
    final toolbar = Transform.translate(offset: drag, child: themed(_toolbar(dock, collapsed)));
    // The corners' room at the bottom: the toolbar sits between them when it fits, else above.
    final swapped = _barsSwapped;
    final menuRoom = recording == null ? 190.0 : 470.0, pageRoom = compact ? 330.0 : 400.0;
    final leftRoom = swapped ? pageRoom : menuRoom, rightRoom = swapped ? menuRoom : pageRoom;
    final quick = QuickGroup(
      onSwitch: _switchSides,
      profileLabel: board.session?.teacherName.split(' ').first ?? SbStrings.of(context)('guest'),
      signedIn: board.isSignedIn,
      onProfile: () => _toggle(BoardPopover.profile),
      onShare: () => unawaited(_shareWhiteboard()),
      onWhatsApp: () => unawaited(_shareWhiteboard()),
      onEndClass: () => unawaited(_endClass()),
    );
    final toolbarW = collapsed ? 240.0 : (_primary ? 1040.0 : (compact ? 840.0 : 1040.0));
    _toolbarRaised = width - leftRoom - rightRoom < toolbarW;
    return [
      Positioned(
        left: Kx.s12,
        top: Kx.s8,
        right: 380,
        child: BoardChromeTheme(
          child: Align(
            alignment: Alignment.centerLeft,
            child: ClassBar(board: board, onSignIn: _signIn, onSwitchClass: _signIn, onAttendance: _attendance),
          ),
        ),
      ),
      Positioned(
        right: Kx.s12,
        top: Kx.s8,
        child: BoardChromeTheme(
          child: TopRightBar(board: board, onSearch: _openSearch, onProfile: () => _toggle(BoardPopover.profile), profileOpen: _popover == BoardPopover.profile),
        ),
      ),
      if (!_bottomChromeHidden) ...[
        Positioned(
          left: swapped ? null : Kx.s12,
          right: swapped ? Kx.s12 : null,
          bottom: Kx.s12,
          child: themed(MenuRecordBar(onMenu: () => _toggle(BoardPopover.menu), menuOpen: _popover == BoardPopover.menu, onRecord: _toggleRecording, recording: recording, quick: quick)),
        ),
        Positioned(
          right: swapped ? null : Kx.s12,
          left: swapped ? Kx.s12 : null,
          bottom: Kx.s12,
          child: themed(
            PageBar(
              wb: _wb,
              onOverview: () => _toggle(BoardPopover.pages),
              overviewOpen: _popover == BoardPopover.pages,
              onHide: () => setState(() {
                _popover = null;
                _uiHidden = true;
              }),
              onSwitch: _switchSides,
            ),
          ),
        ),
        if (dock == ToolbarDock.bottom)
          if (!_toolbarRaised)
            Positioned(left: leftRoom, right: rightRoom, bottom: Kx.s12, child: Center(child: FittedBox(fit: BoxFit.scaleDown, child: toolbar)))
          else
            Positioned(left: Kx.s12, right: Kx.s12, bottom: Kx.s12 + 76 + Kx.s8, child: Center(child: FittedBox(fit: BoxFit.scaleDown, child: toolbar)))
        else
          Positioned(
            left: dock == ToolbarDock.left ? Kx.s12 : null,
            right: dock == ToolbarDock.right ? Kx.s12 : null,
            top: 64,
            // Above the small bar over each corner (quick group, Hide/Switch).
            bottom: 96 + Kx.boardTarget + 16,
            child: Align(
              alignment: dock == ToolbarDock.left ? Alignment.centerLeft : Alignment.centerRight,
              child: FittedBox(fit: BoxFit.scaleDown, child: toolbar),
            ),
          ),
      ],
    ];
  }

  /// The phone bar's tools in the teacher's order (⋯ holds what does not fit and the rest).
  List<BarItem> _barItems() => [for (final (_, i) in _layoutItems(phone: true)) i];

  /// ⋯: the bar's tools that did not fit, every other tool, the background and the pages, and
  /// Customise toolbar.
  void _openMore(List<BarItem> rest, {bool phone = true}) {
    final s = LayoutStrings.of(context);
    final cat = _catalog();
    final onBar = _layoutIds(phone: phone, catalog: cat).toSet();
    final others = [
      for (final e in cat.entries)
        if (!onBar.contains(e.key)) e.value,
    ];
    rest = [...rest, ...others];
    setState(() => _popover = null);
    unawaited(
      BoardMoreSheet.show(
        context,
        groups: [
          (s.more, [
            for (final i in rest) MoreItem(i.key, i.icon, i.label, i.onTap, selected: i.selected, enabled: i.enabled, color: i.color),
            MoreItem(const Key('tool-theme'), Icons.texture, s.background, () => _toggle(BoardPopover.background)),
            MoreItem(const Key('more-pages'), Icons.grid_view, s.pageOverview, () => _toggle(BoardPopover.pages)),
            MoreItem(const Key('more-customise-toolbar'), Icons.tune, ToolbarStrings.of(context).customise, () => unawaited(_editToolbar())),
          ]),
        ],
      ),
    );
  }

  /// The chrome on a phone: the class and ⋮ at the top, the pages floating bottom right and
  /// the toolbar as a bottom bar.
  List<Widget> _phoneChrome(BuildContext context, EdgeInsets safe) {
    final bottom = safe.bottom + Kx.s8;
    final recording = _recordingIndicator();
    return [
      Positioned(
        left: Kx.s8 + safe.left,
        right: Kx.s8 + safe.right,
        top: safe.top + Kx.s4,
        child: BoardChromeTheme(
          child: Row(
            children: [
              Expanded(child: ClassBar(board: board, onSignIn: _signIn, onSwitchClass: _signIn, onAttendance: _attendance, phone: true)),
              const SizedBox(width: Kx.s4),
              TopRightBar(board: board, onSearch: _openSearch, onProfile: () => _toggle(BoardPopover.profile), phone: true, onMenu: () => _toggle(BoardPopover.menu)),
            ],
          ),
        ),
      ),
      if (!_bottomChromeHidden)
        Positioned(
          right: Kx.s8 + safe.right,
          bottom: bottom + 52 + Kx.s8,
          child: BoardChromeTheme(child: PageBar(wb: _wb, compact: true, onOverview: () => _toggle(BoardPopover.pages), overviewOpen: _popover == BoardPopover.pages)),
        ),
      if (recording != null)
        Positioned(left: Kx.s8 + safe.left, top: safe.top + 56, child: BoardChromeTheme(child: FittedBox(child: recording))),
      if (!_bottomChromeHidden)
        Positioned(
          left: Kx.s8 + safe.left,
          right: Kx.s8 + safe.right,
          bottom: bottom,
          child: BoardChromeTheme(child: Center(child: PhoneBar(wb: _wb, items: _barItems, onMore: _openMore, onEdit: () => unawaited(_editToolbar())))),
        ),
    ];
  }

  /// The menu (bottom left; ⋮ on a phone, with the class's controls).
  List<(Key, IconData, String, VoidCallback, bool)> _menuItems({required bool phone}) {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    final signedIn = board.session != null;
    return [
      if (phone) ...[
        if (signedIn) (const Key('attendance-chip'), Icons.groups_outlined, l.toolAttendance, _attendance, true),
        if (signedIn) (const Key('go-live'), Icons.sensors, board.classLive ? l.stopLiveTooltip : l.goLive, () => unawaited(toggleClassLive(context, board)), true),
        (const Key('record'), _capture != null ? Icons.stop_circle_outlined : Icons.fiber_manual_record, _capture != null ? l.toolStop : l.toolRecord, () => unawaited(_toggleRecording()), true),
        (const Key('profile-button'), Icons.person_outline, board.session?.teacherName.split(' ').first ?? l.guest, () => setState(() => _popover = BoardPopover.profile), true),
      ],
      (const Key('menu-open'), Icons.folder_open_outlined, l.open, _openWhiteboards, true),
      (const Key('save-board'), Icons.save_outlined, l.save, () => unawaited(_save()), true),
      (const Key('menu-share'), Icons.share_outlined, s.share, () => unawaited(_shareWhiteboard()), true),
      (const Key('menu-apps'), Icons.apps, SbStrings.of(context)('apps'), _openClassroomApps, true),
      (const Key('menu-freeze'), Icons.ac_unit, SbStrings.of(context)('freeze'), () => setState(() => _frozen = true), true),
      (const Key('menu-versions'), Icons.history, SbStrings.of(context)('versions'), () => unawaited(_versions()), board.isSignedIn && board.whiteboardId.isNotEmpty),
      (const Key('menu-import'), Icons.upload_file_outlined, l.importFiles, () => unawaited(importDocument(context, _wb)), true),
      (const Key('tool-theme'), Icons.texture, s.background, () => setState(() => _popover = BoardPopover.background), true),
      (const Key('menu-eye-comfort'), Icons.visibility_outlined, l.toolEyeComfort, () => setState(() => _popover = BoardPopover.eyeComfort), true),
      (const Key('menu-settings'), Icons.settings_outlined, l.boardSettings, _openSettings, true),
      (
        const Key('menu-preview'),
        board.panelPreview ? Icons.close_fullscreen : Icons.aspect_ratio,
        board.panelPreview ? UiStrings.of(context).exitPreview : UiStrings.of(context).previewPanel,
        () => board.setPanelPreview(!board.panelPreview),
        true,
      ),
      (const Key('menu-customise-toolbar'), Icons.tune, ToolbarStrings.of(context).customise, () => unawaited(_editToolbar()), true),
      (const Key('clear-board'), Icons.layers_clear_outlined, l.clearPage, () => unawaited(confirmClearBoard(context, _wb)), _wb.canClearAllPages),
      (const Key('menu-clear-all'), Icons.delete_sweep_outlined, l.clearAllPages, () => unawaited(confirmClearBoard(context, _wb, scope: ClearScope.all)), _wb.canClearAllPages),
      if (signedIn)
        (const Key('end-class'), Icons.logout, s.signOut, () => unawaited(_endClass()), true)
      else if (board.isEnrolled)
        (const Key('menu-sign-in'), Icons.qr_code_2, l.signInWithTeacherApp, () => unawaited(_signIn()), true),
    ];
  }

  void _openSettings() {
    setState(() => _popover = null);
    unawaited(showBoardSettings(context, board));
  }

  /// Share: saves the board and shares it with the class.
  /// Insert's eight categories (spec §24), each running the board's own tool for it.
  List<InsertExtra> _insertCategories(BuildContext context) {
    final s = SbStrings.of(context);
    void tool(String id) {
      for (final t in _drawerTools(context.l10n)) {
        if (t.id == id) return t.onTap();
      }
    }

    return [
      InsertExtra(key: const Key('insert-cat-pdf'), icon: Icons.picture_as_pdf_outlined, title: s('catPdf'), hint: '', onTap: () => unawaited(importDocument(context, _wb))),
      InsertExtra(key: const Key('insert-cat-images'), icon: Icons.image_outlined, title: s('catImages'), hint: '', onTap: () => unawaited(insertDevicePicture(context, _wb))),
      InsertExtra(key: const Key('insert-cat-videos'), icon: Icons.smart_display_outlined, title: s('catVideos'), hint: '', onTap: () => tool('concept-videos')),
      InsertExtra(key: const Key('insert-cat-ppt'), icon: Icons.slideshow_outlined, title: s('catPpt'), hint: '', onTap: () => unawaited(importDocument(context, _wb))),
      InsertExtra(key: const Key('insert-cat-clipboard'), icon: Icons.content_paste, title: s('catClipboard'), hint: '', onTap: () => unawaited(_pasteClipboard())),
      InsertExtra(key: const Key('insert-cat-geometry'), icon: Icons.architecture, title: s('catGeometry'), hint: '', onTap: () => _toggle(BoardPopover.shapes)),
      InsertExtra(key: const Key('insert-cat-table'), icon: Icons.table_chart_outlined, title: s('catTable'), hint: '', onTap: () => tool('spreadsheet')),
      InsertExtra(key: const Key('insert-cat-flowchart'), icon: Icons.account_tree_outlined, title: s('catFlowchart'), hint: '', onTap: () => unawaited(CanvasTools.insertFlowchart(context, _wb))),
    ];
  }

  /// Clipboard (spec §29): the board's own copied objects, else text copied in any app as a
  /// text box in the middle of the view.
  Future<void> _pasteClipboard() async {
    if (_wb.canPaste) {
      _wb.paste();
      return;
    }
    final text = (await Clipboard.getData(Clipboard.kTextPlain))?.text?.trim() ?? '';
    if (!mounted) return;
    if (text.isEmpty) {
      showBoardMessage(context, SbStrings.of(context)('clipboardEmpty'));
      return;
    }
    _addTextToBoard(text);
  }

  /// Text (clipboard, AI output, a quiz question) as a text box in the middle of the view.
  void _addTextToBoard(String text) {
    const size = 32.0;
    final view = _wb.visibleArea ?? Offset.zero & _canvasSize;
    final box = measureBoardText(text, size, font: _wb.font);
    final at = view.center - Offset(box.width / 2, box.height / 2);
    _wb.insert([TextElement(id: newElementId(), position: at, text: text, color: _wb.penColor, fontSize: size, size: box, font: _wb.font)]);
  }

  /// Classroom Apps (spec §33), each opening the board's own feature.
  void _openClassroomApps() {
    final s = SbStrings.of(context);
    unawaited(showClassroomApps(
      context,
      apps: [
        ('study-material', Icons.library_books_outlined, s('appStudyMaterial'), _openSearch),
        ('live-class', Icons.sensors, s('appLiveClass'), () => unawaited(toggleClassLive(context, board))),
        ('homework', Icons.assignment_outlined, s('appHomework'), () => _openAi(AiView.homework)),
        ('lessons', Icons.event_note_outlined, s('appLessons'), () => _runDrawerTool('todays-plan')),
        ('attendance', Icons.how_to_reg_outlined, s('appAttendance'), _attendance),
        ('class-prep', Icons.co_present_outlined, s('appClassPrep'), () => _openAi(AiView.lessonPlan)),
        ('students', Icons.groups_outlined, s('appStudents'), () => _runDrawerTool('ask-class')),
        ('tests', Icons.quiz_outlined, s('appTests'), () => _openAi(AiView.quiz)),
        ('recordings', Icons.video_library_outlined, s('appRecordings'), _openRecordings),
        ('books', Icons.menu_book_outlined, s('appBooks'), () => _openPanel(PanelKind.books)),
      ],
      others: [
        ('calculator', Icons.calculate_outlined, s('appCalculator'), () => unawaited(_calculator())),
        ('spotlight', Icons.highlight, s('appSpotlight'), () => _showKit(ToolkitItem.spotlight)),
      ],
    ));
  }

  void _runDrawerTool(String id) {
    for (final t in _drawerTools(context.l10n)) {
      if (t.id == id) return t.onTap();
    }
  }

  /// Profile → New: a fresh whiteboard (offering to save this one first).
  Future<void> _newWhiteboard() async {
    if (!_wb.isBlank) {
      final s = SbStrings.of(context);
      final choice = await showPanelDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          key: const Key('new-board-dialog'),
          content: Text(s('newBoardSave')),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(s('cancel'))),
            TextButton(key: const Key('new-board-discard'), onPressed: () => Navigator.of(ctx).pop('discard'), child: Text(s('discardAndNew'))),
            if (board.isSignedIn) FilledButton(key: const Key('new-board-save'), onPressed: () => Navigator.of(ctx).pop('save'), child: Text(s('saveAndNew'))),
          ],
        ),
      );
      if (choice == null || !mounted) return;
      if (choice == 'save' && !await _saveAs(_boardTitle ?? _defaultTitle(), share: false)) return;
    }
    _wb.load(SavedBoard(background: _background, canvas: _canvasSize, pages: const [[]]));
    board.whiteboardId = board.newId();
    _boardTitle = null;
  }

  /// Share whiteboard: WhatsApp, Email, QR and other apps (share_whiteboard.dart).
  Future<void> _shareWhiteboard() async {
    if (_wb.isBlank) {
      showBoardMessage(context, context.l10n.nothingToSave);
      return;
    }
    final title = _boardTitle ?? _defaultTitle();
    await showShareWhiteboard(context, board: board, wb: _wb, canvas: _canvasSize, title: title, ensureSaved: () => _saveAs(title, share: false));
  }

  /// Version history: earlier saves of this board, newest first; restoring keeps the current one.
  Future<void> _versions() async {
    final picked = await showVersionHistory(context, board);
    if (picked == null || !mounted) return;
    _wb.load(picked.$1);
    showBoardMessage(context, SbStrings.of(context)('restored', {'d': picked.$2}));
  }

  Widget _popoverLayer(BuildContext context, {required bool phone, required EdgeInsets safe, required ToolbarDock dock, required bool collapsed}) {
    final l = context.l10n;
    final screen = MediaQuery.sizeOf(context);
    void close() => setState(() => _popover = null);
    final Widget card = switch (_popover!) {
      BoardPopover.pen => PenPopover(wb: _wb, board: board, memory: _penMemory, primary: _primary),
      BoardPopover.erase => ErasePopover(
        wb: _wb,
        onSlideClear: () {
          close();
          _wb.clearPage();
          showBoardMessage(context, l.clearedPage, action: (l.toolUndo, _wb.undo));
        },
        onClear: () {
          close();
          unawaited(confirmClearBoard(context, _wb, scope: ClearScope.page));
        },
      ),
      BoardPopover.background => BackgroundsPopover(wb: _wb, onChanged: _setBackground, board: board),
      BoardPopover.shapes => ShapesPopover(wb: _wb, primary: _primary, onPicked: () {}, onOpenModel: (id) => _openSplit(SplitContent.model3d, id)),
      BoardPopover.tools => ToolsDrawer(
        tools: _drawerTools(l),
        order: _groupOrder,
        preferred: _preferredTools,
        width: 680,
        maxHeight: math.max(160, screen.height - (phone ? 300 : 360)),
      ),
      BoardPopover.insert => InsertPopover(
        wb: _wb,
        primary: _primary,
        onClose: close,
        onEquation: () => unawaited(_newEquation()),
        onGraph: () => unawaited(_subjectTools.run(SubjectTool.graph, Rect.zero)),
        onModel3d: () => _openSplit(SplitContent.model3d),
        onLab: () => _openSplit(SplitContent.lab),
        categories: _insertCategories(context),
        extras: [
          InsertExtra(key: const Key('insert-text'), icon: Icons.title, title: l.toolText, hint: l.tapToPlace, onTap: () => _wb.tool = BoardTool.text),
          ...insertExtras(context, wb: _wb, subject: board.session?.subjectName, onSimulation: () => unawaited(_openSim())),
          InsertExtra(
            key: const Key('insert-background'),
            icon: Icons.texture,
            title: LayoutStrings.of(context).background,
            hint: LayoutStrings.of(context).templates,
            onTap: () => WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _popover = BoardPopover.background);
            }),
          ),
        ],
      ),
      BoardPopover.eyeComfort => EyeComfortPopover(
        settings: board.eyeComfort,
        onChanged: board.setEyeComfort,
        chalkboard: _background == BoardBackground.chalkboard,
        onChalkboard: (v) => _setBackground(v ? BoardBackground.chalkboard : (_theme == BoardTheme.dark ? BoardBackground.night : BoardBackground.plain)),
      ),
      BoardPopover.profile => ProfileMenu(
        board: board,
        onSignIn: _signIn,
        onNewPage: _wb.addPage,
        onWhiteboards: _openWhiteboards,
        onRecordings: _openRecordings,
        onImport: () => unawaited(importDocument(context, _wb)),
        onHelp: _openHelp,
        onTour: () => unawaited(_startTour()),
        onSettings: _openSettings,
        onClose: close,
        onNewBoard: () => unawaited(_newWhiteboard()),
        onClassrooms: () => unawaited(showClassroomsDialog(context, board)),
        onTraining: () => unawaited(showTrainingDialog(context, board, onTour: () => unawaited(_startTour()), onPractice: _startPractice)),
        onWhatsNew: () => unawaited(showWhatsNewDialog(context, board)),
        onExit: () => unawaited(_endClass()),
      ),
      BoardPopover.menu => BoardMenu(items: _menuItems(phone: phone), onClose: close),
      BoardPopover.pages => PageOverview(
        wb: _wb,
        canvas: _canvasSize,
        onClose: close,
        onClear: (scope) {
          close();
          unawaited(confirmClearBoard(context, _wb, scope: scope));
        },
      ),
    };
    final themed = BoardChromeTheme(child: card);
    // The page overview is a sheet at the bottom of the board, the toolbars put away under it.
    if (_popover == BoardPopover.pages) {
      return Positioned(
        left: phone ? Kx.s8 + safe.left : Kx.s16,
        right: phone ? Kx.s8 + safe.right : Kx.s16,
        top: phone ? safe.top + 56 : 72,
        bottom: phone ? safe.bottom + Kx.s8 : Kx.s16,
        child: Align(alignment: Alignment.bottomCenter, child: themed),
      );
    }
    if (phone) {
      // A small sheet above the bar, across the phone.
      return Positioned(
        left: Kx.s8 + safe.left,
        right: Kx.s8 + safe.right,
        top: safe.top + 56,
        bottom: safe.bottom + 52 + 2 * Kx.s8,
        child: Align(
          alignment: _popover == BoardPopover.menu || _popover == BoardPopover.profile ? Alignment.topRight : Alignment.bottomCenter,
          child: PopoverScroll(reverse: _popover != BoardPopover.menu && _popover != BoardPopover.profile, child: themed),
        ),
      );
    }
    // Beside the control that opened it.
    switch (_popover!) {
      case BoardPopover.menu || BoardPopover.background || BoardPopover.eyeComfort:
        return Positioned(left: Kx.s12, right: Kx.s12, top: 64, bottom: 96, child: Align(alignment: Alignment.bottomLeft, child: PopoverScroll(reverse: true, child: themed)));
      case BoardPopover.profile:
        return Positioned(left: Kx.s12, right: Kx.s12, top: 64, bottom: Kx.s12, child: Align(alignment: Alignment.topRight, child: PopoverScroll(child: themed)));
      default:
        final side = _toolbarDepth + Kx.s12 + Kx.s8;
        return switch (dock) {
          ToolbarDock.left => Positioned(left: side, right: Kx.s12, top: 64, bottom: 12, child: Align(alignment: Alignment.centerLeft, child: PopoverScroll(child: themed))),
          ToolbarDock.right => Positioned(left: Kx.s12, right: side, top: 64, bottom: 12, child: Align(alignment: Alignment.centerRight, child: PopoverScroll(child: themed))),
          ToolbarDock.bottom => Positioned(
            left: Kx.s12,
            right: Kx.s12,
            top: 64,
            // Above the toolbar, wherever it sits (between the corners or raised above them).
            bottom: Kx.s12 + _toolbarDepth + Kx.s8 + (_toolbarRaised ? 76 + Kx.s8 : 0),
            child: Align(alignment: Alignment.bottomCenter, child: PopoverScroll(reverse: true, child: themed)),
          ),
        };
    }
  }
}

/// The panel's content, for the panel navigator's first page (dialogs open over it).
class _PanelContent extends InheritedWidget {
  const _PanelContent({required this.content, required super.child});

  final Widget content;

  @override
  bool updateShouldNotify(_PanelContent old) => true;
}

class _PanelBase extends StatelessWidget {
  const _PanelBase();

  @override
  Widget build(BuildContext context) => context.dependOnInheritedWidgetOfExactType<_PanelContent>()?.content ?? const SizedBox.shrink();
}

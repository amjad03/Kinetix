import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show Model3dMirror, Model3dScope, Model3dSnapshot;
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_labs/kinetix_labs.dart' show LabReport, LabSpeech;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';
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
import '../concept_videos/concept_video_suggestions.dart';
import '../kiosk/kiosk_ui.dart';
import '../plan/plan_timer.dart';
import '../profiles/profile_boards.dart';
import '../profiles/profiles_ui.dart';
import '../projector/projector_controller.dart';
import '../projector/projector_ui.dart';
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
import '../sims/sims.dart';
import '../toolkit/toolkit_controller.dart';
import '../toolkit/remote_toolkit.dart';
import '../toolkit/toolkit_layer.dart';
import 'ai_pen_ui.dart';
import 'chrome.dart';
import 'classroom_tools.dart';
import 'editors.dart';
import 'insert_popover.dart';
import 'kit/kit_panel.dart';
import 'kit/subject_tools.dart';
import 'kit/subjects.dart';
import 'live_stream.dart';
import 'popovers.dart';
import 'profile_menu.dart';
import 'rails.dart';
import 'selection_actions.dart';
import 'side_panel.dart';
import 'whiteboard_dialogs.dart';

enum _Popover { write, aiPen, erase, theme, shapes, tools, eyeComfort, profile, insert }

enum ToolbarAlign { left, center, right }

/// The teaching screen: the endless whiteboard ([WhiteboardController]) with its tools in one of
/// two layouts (Board settings → Layout):
///
/// * rails (the default): drawing and subject tools on a rail at the left, KINETIX AI and the
///   subject kit on a rail at the right, undo, pages and zoom at the bottom (docs/DESIGN);
/// * the bottom toolbar: one labelled toolbar along the bottom, as on Teachmint boards.
///
/// Both share the status strip on top, the side panels and every action. For LKG to Class 5
/// (or the Simple board) the rails grow big labelled buttons, board text is in Andika and the
/// kit has class stars.
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
  late final AiController _ai;

  /// The AI pen: shapes, maths and words from what the teacher writes.
  late final AiPenController _pen;

  /// The model or lab view in the split pane, for a picture of it.
  final _splitKey = GlobalKey();

  /// Today's plan step timer: keeps running while other panels are open or the panel is closed.
  late final PlanTimer _planTimer;
  _Popover? _popover;
  PanelKind? _panel;
  bool _panelOnLeft = false;
  double _panelFraction = 0.45;
  SplitContent? _splitContent;
  String? _splitItem;
  String? _splitPreset;
  KitTab? _kitTab;
  ToolbarAlign _align = ToolbarAlign.center;
  bool _hidden = false;
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
  bool get _rails => board.layout == BoardLayout.rails;
  SubjectStyle get _style => styleOf(board.session?.subjectName);

  @override
  void initState() {
    super.initState();
    board.addListener(_onBoardChanged);
    board.onLiveSnapshotRequest = _startLive;
    board.classAudio.onUnavailable = _classAudioUnavailable;
    _ai = AiController(board)
      ..captureBoard = _captureForAi
      ..openSplit = _openSplit;
    _lastSessionId = board.session?.sessionId;
    // Projector mode and shared-board profiles (features/projector, features/profiles).
    board.projector.attach(ProjectorSource(board: _wb, background: () => _background, canvas: () => _canvasSize, captureSplit: _captureLabForProjector));
    board.profiles.onSwitch = (from, to) => switchProfileBoard(_wb, _canvasSize, _profileBoards, from, to);
    _planTimer = PlanTimer(board);
    _pen = AiPenController(_wb, handwriting: board.handwriting)
      ..onNotice = _aiPenNotice
      ..onLetterSize = (px) => board.saveLetterSize(board.session?.teacherId, px);
    _applyClass();
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_firstRunTour()));
    unawaited(_loadLetterSize());
    _remote = BoardRemote(board: board, wb: _wb, toolkit: _toolkit(), hooks: _remoteHooks());
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

  @override
  void dispose() {
    board.removeListener(_onBoardChanged);
    board.projector.attach(null);
    board.profiles.onSwitch = null;
    if (board.onLiveSnapshotRequest == _startLive) board.onLiveSnapshotRequest = null;
    if (board.classAudio.onUnavailable == _classAudioUnavailable) board.classAudio.onUnavailable = null;
    _live.stop();
    _remote.dispose();
    _remoteToolkit.dispose();
    _practice?.dispose();
    _classCheck.dispose();
    _capture?.dispose();
    _pen.dispose();
    _wb.dispose();
    _images.dispose();
    _secondInk.dispose();
    _ai.dispose();
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

  /// Opens a 3D model or lab (or their picker, with no id) next to the whiteboard.
  void _openSplit(SplitContent content, [String? id, String? preset]) => setState(() {
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

  /// The AI pen's settings from Board settings. Primary boards have no AI pen (tidying shapes
  /// stays, as an option of the pen).
  void _syncPen() {
    if (_pen.mode != board.aiPenMode) _pen.mode = board.aiPenMode;
    _pen
      ..language = board.aiPenLanguage.name
      ..snapShapes = board.snapShapes;
    if (_primary && _wb.tool == BoardTool.aiPen) _wb.tool = BoardTool.pen;
  }

  /// The handwriting size the AI pen learnt for this teacher.
  Future<void> _loadLetterSize() async {
    final px = await board.letterSize(board.session?.teacherId);
    if (mounted) _pen.letterPx = px ?? 46;
  }

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
    _wb.palmMode = board.touchProfile.palmMode;
    if (board.liveViewers == 0 && _live.isStreaming) _live.stop();
    _applyClass();
    final id = board.session?.sessionId;
    if (id == _lastSessionId) return;
    _lastSessionId = id;
    unawaited(_loadLetterSize());
    if (_signInOpen && id != null) Navigator.of(context).pop();
    // A new class on a clean board starts on its subject's paper.
    if (id != null && _wb.isBlank) _wb.background = _style.paper;
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

  void _toggle(_Popover p) => setState(() => _popover = _popover == p ? null : p);

  void _selectTool(BoardTool t, _Popover? popover) {
    final wasSelected = _wb.tool == t;
    _wb.tool = t;
    // A second tap on the active tool opens its options, like Google's drawing tools.
    setState(() => _popover = (wasSelected && popover != null && _popover != popover) ? popover : null);
  }

  void _openPanel(PanelKind k) => setState(() {
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
      showComingSoon(context, context.l10n.signInUnregistered);
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
        child: SignInDialog(api: api, boardName: board.deviceName),
      ),
    );
    if (mounted) setState(() => _signInOpen = false);
  }

  void _setBackground(BoardBackground b) {
    _wb.background = b;
    _capture?.background = b;
    _live.background = b;
    board.projector.background = b;
    setState(() {});
  }

  // --- Writing on the board --------------------------------------------------------------------

  Future<String?> _editMath(String? latex) =>
      showDialog<String>(context: context, builder: (_) => BoardChromeTheme(child: MathEditorDialog(initial: latex)));

  Future<String?> _editNote(String? text, NoteKind kind) =>
      showDialog<String>(context: context, builder: (_) => BoardChromeTheme(child: NoteEditorDialog(initial: text, kind: kind)));

  /// An equation, written in the editor and put in view.
  Future<void> _newEquation() async {
    final tex = await _editMath(null);
    if (tex != null && tex.isNotEmpty) {
      const fs = 40.0;
      _wb.insert([MathElement(id: newElementId(), position: Offset.zero, latex: tex, color: _wb.penColor, fontSize: fs, size: estimateMathSize(tex, fs))]);
    }
  }

  SubjectToolRunner get _subjectTools =>
      SubjectToolRunner(context: context, wb: _wb, style: _style, primary: _primary, onOpenKit: (tab) => _openKit(tab));

  /// Edits a selected equation, note or text.
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
    _openAi(AiView.readBoard);
    unawaited(_ai.readBoard());
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
    final ink = _background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    _wb.insert([
      ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, w, h), bytes: s.png, link: EmbedLink(kind: EmbedLink.model3d, id: s.modelId)),
      if (s.credit.isNotEmpty)
        TextElement(id: newElementId(), position: Offset(0, h + 6), text: s.credit, color: ink, fontSize: 14, size: measureBoardText(s.credit, 14)),
    ]);
    if (mounted) showBoardMessage(context, context.l10n.snapshotAdded);
  }

  /// A PNG's size from its header (640 × 480 when it cannot be read).
  static Size _pngSize(Uint8List png) {
    if (png.length < 24) return const Size(640, 480);
    final d = ByteData.sublistView(png);
    final w = d.getUint32(16), h = d.getUint32(20);
    return w == 0 || h == 0 ? const Size(640, 480) : Size(w.toDouble(), h.toDouble());
  }

  void _openLink(EmbedLink link) => switch (link.kind) {
    EmbedLink.lab => _openSplit(SplitContent.lab, link.id, link.preset),
    EmbedLink.model3d => _openSplit(SplitContent.model3d, link.id, link.preset),
    _ => null,
  };

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
      choice = await showDialog<({String title, bool share})>(
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
    showDialog<void>(
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
    return _wb.toSaved(_canvasSize);
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
    final choice = await showDialog<({String title, bool share})>(
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
    showDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: WhiteboardsDialog(
          api: api,
          onOpen: (summary) async {
            if (!_wb.isBlank) {
              final replace = await showDialog<bool>(
                context: context,
                builder: (context) => BoardChromeTheme(
                  child: AlertDialog(
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
    final canShare = board.session?.sectionName != null;
    var save = hasInk;
    var share = hasInk && canShare;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => BoardChromeTheme(
        child: StatefulBuilder(
          builder: (context, setDialog) => AlertDialog(
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
    await board.endClass();
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
    _wb.load(const SavedBoard(background: BoardBackground.plain, canvas: Size.zero, pages: []));
    _boardTitle = null;
  }

  void _attendance() {
    if (board.roster.isEmpty) {
      showComingSoon(context, context.l10n.attendanceWithoutClass);
      return;
    }
    showDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: AttendanceDialog(roster: board.roster, initial: board.attendance, onSubmit: board.markAttendance),
      ),
    );
  }

  // --- Simulations -------------------------------------------------------------------------

  ActiveSim? _sim;

  /// The simulation window's offset from the top right of the board.
  Offset _simPos = const Offset(96, 72);

  Future<void> _openSim([SimKind? kind]) async {
    setState(() => _popover = null);
    final k = kind ?? await showDialog<SimKind>(context: context, builder: (_) => const BoardChromeTheme(child: SimPickerDialog()));
    if (k != null && mounted) setState(() => _sim = ActiveSim.of(k));
  }

  Widget _simWindow() => LayoutBuilder(
    builder: (context, c) {
      final w = math.min(600.0, c.maxWidth - 32), h = math.min(580.0, c.maxHeight - 96);
      final right = _simPos.dx.clamp(8.0, math.max(8.0, c.maxWidth - w - 8)).toDouble();
      final top = _simPos.dy.clamp(8.0, math.max(8.0, c.maxHeight - h - 8)).toDouble();
      return Stack(
        children: [
          Positioned(
            right: right,
            top: top,
            width: w,
            height: h,
            child: SimWindow(
              sim: _sim!,
              onChanged: (s) => setState(() => _sim = s),
              onClose: () => setState(() => _sim = null),
              onDrag: (d) => setState(() => _simPos = Offset(right - d.dx, top + d.dy)),
            ),
          ),
        ],
      );
    },
  );

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
    setState(() {
      _popover = null;
      _hidden = false;
    });
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    final l = context.l10n;
    final done = await BoardTour.show(context, boardTourSteps(l), finishLabel: _practice == null ? l.tourPractise : null);
    if (done && mounted && _practice == null) _startPractice();
  }

  void _openHelp() {
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
        canShow: onScreen.contains,
        onShowMe: (t) => unawaited(_showMe(t.target!, t.icon, t.title, t.steps.join(' '))),
        onTour: () => unawaited(_startTour()),
        onPractice: _practice == null ? _startPractice : null,
      ),
    );
  }

  /// Points at one control on the board.
  Future<void> _showMe(Key target, IconData icon, String title, String body) async {
    setState(() => _hidden = false);
    await WidgetsBinding.instance.endOfFrame;
    if (mounted) await BoardTour.show(context, [CoachStep(target: target, icon: icon, title: title, body: body)]);
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

  List<ToolEntry> _tools(AppLocalizations l) => [
    ToolEntry(Icons.event_note_outlined, l.toolTodaysPlan, const Color(0xFF81C995), () => _openPanel(PanelKind.plan)),
    ToolEntry(Icons.smart_display_outlined, l.toolConceptVideos, const Color(0xFFF28B82), () {
      setState(() => _popover = null);
      ConceptVideosDialog.open(context, board);
    }),
    for (final t in ToolkitItem.values) ToolEntry(toolkitIcon(t), toolkitName(l, t), toolkitColor(t), () => _showKit(t)),
    ToolEntry(Icons.science, l.simTitle, const Color(0xFFC58AF9), () => unawaited(_openSim())),
    ToolEntry(Icons.record_voice_over_outlined, l.readerTitle, const Color(0xFF81C995), _readPage),
    ToolEntry(Icons.how_to_vote_outlined, l.toolAskClass, const Color(0xFF8AB4F8), () {
      setState(() => _popover = null);
      unawaited(_classCheck.ask(context));
    }),
    ToolEntry(Icons.how_to_reg_outlined, l.toolAttendance, const Color(0xFF81C995), () {
      setState(() => _popover = null);
      _attendance();
    }),
    ToolEntry(Icons.vertical_split_outlined, l.toolSplitScreen, const Color(0xFFC58AF9), () => _openPanel(PanelKind.split)),
    ToolEntry(Icons.visibility_outlined, l.toolEyeComfort, const Color(0xFFFCAD70), () => setState(() => _popover = _Popover.eyeComfort)),
    ToolEntry(Icons.straighten, l.toolRuler, const Color(0xFF78D9EC), () {
      setState(() => _popover = null);
      _wb.toggleRuler();
    }),
    ToolEntry(Icons.architecture, l.toolProtractor, const Color(0xFF78D9EC), () {
      setState(() => _popover = null);
      _wb.toggleProtractor();
    }),
    ToolEntry(Icons.radio_button_unchecked, l.toolCompass, const Color(0xFF78D9EC), () {
      setState(() => _popover = null);
      _wb.tool = BoardTool.compass;
    }),
    ToolEntry(Icons.flare, l.toolLaser, const Color(0xFFF28B82), () {
      setState(() => _popover = null);
      _wb.tool = BoardTool.laser;
    }),
    ToolEntry(Icons.calculate_outlined, l.toolCalculator, const Color(0xFF8AB4F8), () => showComingSoon(context, l.toolCalculator), soon: true),
    ToolEntry(Icons.photo_camera_outlined, l.toolScreenshot, const Color(0xFFF28B82), () => showComingSoon(context, l.toolScreenshot), soon: true),
    ToolEntry(Icons.lock_outline, l.toolTouchLock, const Color(0xFFDADCE0), () => showComingSoon(context, l.toolTouchLock), soon: true),
  ];

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

  // --- Layout --------------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    BoardChromeTheme.light = _rails;
    InkLabels.answerCover = l.answerCover;
    return Model3dScope(
      onSnapshot: _addModelSnapshot,
      mirror: Model3dMirror(wanted: () => board.projector.wantsPictures, send: board.projector.send3d),
      child: Focus(
      autofocus: true,
      onKeyEvent: _onKey,
      child: Scaffold(
        body: ListenableBuilder(
          listenable: board,
          builder: (context, _) => LayoutBuilder(builder: (context, size) => _layout(context, size)),
        ),
      ),
      ),
    );
  }

  Widget _layout(BuildContext context, BoxConstraints size) {
    final panelWidth = size.maxWidth * _panelFraction;
    final panel = _panel == null
        ? null
        : SizedBox(
            width: panelWidth,
            child: BoardChromeTheme(
              child: SidePanelFrame(
                onLeft: _panelOnLeft,
                onClose: () => setState(() => _panel = null),
                onSwapSide: () => setState(() => _panelOnLeft = !_panelOnLeft),
                onResize: (dx) => setState(() {
                  final f = _panelFraction + (_panelOnLeft ? dx : -dx) / size.maxWidth;
                  _panelFraction = f.clamp(0.3, 0.7);
                }),
                // Read aloud for Books and the labs' steps (lib/features/reader).
                child: ReadAloudScope(
                  read: _read,
                  child: LabSpeech(speak: _speak, child: _panelContent()),
                ),
              ),
            ),
          );

    // The panel takes full height; everything for the board lives in the board area.
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (panel != null && _panelOnLeft) panel,
        Expanded(
          child: LayoutBuilder(
            builder: (context, area) {
              _canvasSize = area.biggest;
              _capture?.fitCanvas(_canvasSize);
              return _boardArea(context, compact: area.maxWidth < 1500, short: area.maxHeight < 900);
            },
          ),
        ),
        if (panel != null && !_panelOnLeft) panel,
      ],
    );
  }

  Widget _panelContent() => switch (_panel!) {
    PanelKind.ai => AiPanel(ai: _ai),
    PanelKind.books => BooksPanel(
      key: ValueKey(_booksTopic),
      board: board,
      ai: _ai,
      onOpenPanel: (k) => setState(() => _panel = k),
      onOpenResource: _openSplit,
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
      onPanel: (k) => setState(() => _panel = k),
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
      secondInk: _secondInk,
      background: _background,
      snapshotKey: _splitKey,
      onSnapshot: _snapshotSplit,
    ),
  };

  WhiteboardCanvasLabels _canvasLabels(AppLocalizations l) =>
      WhiteboardCanvasLabels(typeHint: l.typeHint, hideRuler: l.hideRuler, hideProtractor: l.hideProtractor, turn: l.turn);

  Widget _boardArea(BuildContext context, {required bool compact, required bool short}) {
    final l = context.l10n;
    final rails = _rails;
    final primary = _primary;
    final railW = RailSizes.rail(primary: primary, compact: compact || short);
    // The board keeps clear of the floating toolbars (start view, fit, placement).
    _wb.safeInsets = _hidden ? const EdgeInsets.only(top: 64) : (rails ? EdgeInsets.fromLTRB(railW + 12, 64, railW + 12, 84) : const EdgeInsets.fromLTRB(0, 64, 0, 100));
    return Stack(
      children: [
        Positioned.fill(
          child: WhiteboardCanvas(
            key: _canvasKey,
            controller: _wb,
            images: _images,
            inputMode: board.inputMode,
            multiWriter: board.multiWriter,
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
            ),
          ),
        ),
        // The AI pen's Convert button and its readings of what it converted.
        Positioned.fill(
          child: BoardChromeTheme(
            child: AiPenOverlay(wb: _wb, pen: _pen, onSolve: _solveMath, onMessage: (m) => showBoardMessage(context, m)),
          ),
        ),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: BoardChromeTheme(
            child: _TopBar(
              board: board,
              onSignIn: _signIn,
              onEndClass: _endClass,
              onAttendance: _attendance,
              recording: _capture == null
                  ? null
                  : RecordingIndicator(capture: _capture!, onPause: _capture!.pause, onResume: _capture!.resume, onStop: _stopRecording),
            ),
          ),
        ),
        // The class toolkit: its cards, the screen shade and the spotlight (under the toolbars).
        Positioned.fill(
          child: ToolkitLayer(kit: _kit, insets: _wb.safeInsets, onAnswer: board.session == null ? null : board.recordAnswer),
        ),
        if (_sim != null) Positioned.fill(child: _simWindow()),
        if (_practice != null)
          Positioned(
            right: rails ? railW + Kx.s24 : Kx.s16,
            bottom: rails ? 84 : 100,
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
        Positioned.fill(child: ClassCheckOverlay(check: _classCheck, onPutOnBoard: _addPollResults)),
        Positioned.fill(child: RemotePointer(remote: _remote)),
        if (!_hidden && rails) ..._railsChrome(context, compact: compact || short, primary: primary),
        if (!_hidden && !rails)
          Positioned(
            left: Kx.s12,
            right: Kx.s12,
            bottom: Kx.s12,
            child: BoardChromeTheme(
              child: ToolbarDensity(compact: compact, child: _bottomChrome(compact)),
            ),
          ),
        if (_popover != null)
          Positioned.fill(
            child: GestureDetector(
              key: const Key('popover-barrier'),
              behavior: HitTestBehavior.opaque,
              onTap: () => setState(() => _popover = null),
            ),
          ),
        if (_popover != null) _popoverLayer(railW),
        if (_hidden)
          Positioned(
            right: Kx.s16,
            bottom: Kx.s16,
            child: BoardChromeTheme(
              child: FloatingActionButton.small(
                key: const Key('show-tools'),
                tooltip: l.showTools,
                onPressed: () => setState(() => _hidden = false),
                child: const Icon(Icons.expand_less),
              ),
            ),
          ),
      ],
    );
  }

  /// The rails and the pills of the rails layout.
  List<Widget> _railsChrome(BuildContext context, {required bool compact, required bool primary}) {
    final l = context.l10n;
    final style = _style;
    final runner = _subjectTools;
    final railPopover = switch (_popover) {
      _Popover.write => RailPopover.write,
      _Popover.aiPen => RailPopover.aiPen,
      _Popover.erase => RailPopover.erase,
      _Popover.shapes => RailPopover.shapes,
      _Popover.insert => RailPopover.insert,
      _Popover.tools => RailPopover.tools,
      _Popover.theme => RailPopover.theme,
      _ => null,
    };
    return [
      Positioned(
        left: Kx.s12,
        top: 64,
        bottom: 84,
        child: BoardChromeTheme(
          child: Align(
            alignment: Alignment.centerLeft,
            child: ToolRail(
              wb: _wb,
              pen: _pen,
              style: style,
              primary: primary,
              compact: compact,
              popover: railPopover,
              onPopover: (p) => _toggle(switch (p) {
                RailPopover.write => _Popover.write,
                RailPopover.aiPen => _Popover.aiPen,
                RailPopover.erase => _Popover.erase,
                RailPopover.shapes => _Popover.shapes,
                RailPopover.insert => _Popover.insert,
                RailPopover.tools => _Popover.tools,
                RailPopover.theme => _Popover.theme,
              }),
              onSubjectTool: (t, anchor) {
                setState(() => _popover = null);
                unawaited(runner.run(t, anchor));
              },
              subjectToolActive: runner.isActive,
            ),
          ),
        ),
      ),
      Positioned(
        right: Kx.s12,
        top: 64,
        bottom: 84,
        child: BoardChromeTheme(
          child: Align(
            alignment: Alignment.centerRight,
            child: AiRail(
              ai: _ai,
              style: style,
              primary: primary,
              compact: compact,
              panel: _panel,
              aiView: _ai.view,
              onAi: _openAi,
              onPanel: (k) => k == PanelKind.ai && _panel != PanelKind.ai ? _openAi(AiView.home) : _openPanel(k),
            ),
          ),
        ),
      ),
      Positioned(
        left: Kx.s12,
        right: Kx.s12,
        bottom: Kx.s12,
        child: BoardChromeTheme(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              ChromeSurface(
                radius: Kx.rFull,
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Builder(
                      builder: (context) => IconButton(
                        key: const Key('profile-button'),
                        tooltip: board.session?.teacherName ?? l.guest,
                        onPressed: () => _toggle(_Popover.profile),
                        icon: board.session == null ? const Icon(Icons.person) : KxAvatar(name: board.session!.teacherName, size: 32),
                      ),
                    ),
                    IconButton(key: const Key('save-board'), tooltip: l.save, onPressed: _save, icon: const Icon(Icons.save_outlined)),
                    IconButton(
                      key: const Key('record'),
                      tooltip: _capture != null ? l.toolStop : l.toolRecord,
                      onPressed: _toggleRecording,
                      icon: Icon(_capture != null ? Icons.stop_circle_outlined : Icons.fiber_manual_record, color: Kx.record),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(child: FittedBox(child: BoardPill(wb: _wb, primary: primary))),
              ),
              ChromeSurface(
                radius: Kx.rFull,
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                child: IconButton(
                  key: const Key('hide-tools'),
                  tooltip: l.toolHide,
                  onPressed: () => setState(() {
                    _hidden = true;
                    _popover = null;
                  }),
                  icon: const Icon(Icons.expand_more),
                ),
              ),
            ],
          ),
        ),
      ),
    ];
  }

  Widget _popoverLayer(double railW) {
    final l = context.l10n;
    final Widget card = switch (_popover!) {
      _Popover.write => WritePopover(wb: _wb, footer: SnapShapesSwitch(board: board)),
      _Popover.aiPen => AiPenPopover(board: board, pen: _pen),
      _Popover.erase => ErasePopover(wb: _wb, onCleared: () => setState(() => _popover = null)),
      _Popover.theme => ThemePopover(background: _background, onChanged: _setBackground),
      _Popover.shapes => ShapesPopover(wb: _wb, primary: _primary, onPicked: () {}),
      _Popover.tools => ToolsPopover(tools: _tools(l)),
      _Popover.insert => InsertPopover(
        wb: _wb,
        primary: _primary,
        onClose: () => setState(() => _popover = null),
        onEquation: () => unawaited(_newEquation()),
        onGraph: () => unawaited(_subjectTools.run(SubjectTool.graph, Rect.zero)),
        onModel3d: () => _openSplit(SplitContent.model3d),
        onLab: () => _openSplit(SplitContent.lab),
        extras: insertExtras(context, wb: _wb, subject: board.session?.subjectName, onSimulation: () => unawaited(_openSim())),
      ),
      _Popover.eyeComfort => EyeComfortPopover(
        settings: board.eyeComfort,
        onChanged: board.setEyeComfort,
        chalkboard: _background == BoardBackground.chalkboard,
        onChalkboard: (v) => _setBackground(v ? BoardBackground.chalkboard : BoardBackground.plain),
      ),
      _Popover.profile => ProfileMenu(
        board: board,
        onSignIn: _signIn,
        onNewPage: _wb.addPage,
        onWhiteboards: _openWhiteboards,
        onRecordings: _openRecordings,
        onImport: () => unawaited(importDocument(context, _wb)),
        onHelp: _openHelp,
        onTour: () => unawaited(_startTour()),
        onSettings: () => showDialog<void>(
          context: context,
          builder: (_) => BoardChromeTheme(child: BoardSettingsDialog(board: board)),
        ),
        onClose: () => setState(() => _popover = null),
      ),
    };
    if (_rails && _popover != _Popover.profile) {
      // Beside the left rail.
      return Positioned(
        left: Kx.s12 + railW + Kx.s8,
        top: 64,
        bottom: 84,
        right: Kx.s16,
        child: BoardChromeTheme(
          child: Align(alignment: Alignment.centerLeft, child: SingleChildScrollView(child: card)),
        ),
      );
    }
    final alignment = _popover == _Popover.profile
        ? Alignment.bottomLeft
        : switch (_align) {
            ToolbarAlign.left => Alignment.bottomLeft,
            ToolbarAlign.center => Alignment.bottomCenter,
            ToolbarAlign.right => Alignment.bottomRight,
          };
    return Positioned(
      left: Kx.s16,
      right: Kx.s16,
      bottom: _rails ? 76 : 96,
      top: 64,
      child: BoardChromeTheme(
        child: Align(
          alignment: alignment,
          child: SingleChildScrollView(reverse: true, child: card),
        ),
      ),
    );
  }

  Widget _bottomChrome(bool compact) {
    final l = context.l10n;
    final toolbar = _MainToolbar(
      wb: _wb,
      primary: _primary,
      compact: compact,
      popover: _popover,
      panel: _panel,
      onTool: _selectTool,
      onPopover: _toggle,
      onPanel: _openPanel,
      recording: _capture != null,
      onRecord: _toggleRecording,
    );
    final left = ChromeSurface(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ToolButton(
            icon: Icons.swap_horiz,
            label: l.toolSwitch,
            onTap: () => setState(() => _align = _align == ToolbarAlign.left ? ToolbarAlign.center : ToolbarAlign.left),
          ),
          ToolButton(
            key: const Key('profile-button'),
            icon: Icons.person,
            label: board.session?.teacherName.split(' ').first ?? l.guest,
            selected: _popover == _Popover.profile,
            onTap: () => _toggle(_Popover.profile),
          ),
          ToolButton(key: const Key('save-board'), icon: Icons.save_outlined, label: l.save, onTap: _save),
        ],
      ),
    );
    final right = ListenableBuilder(
      listenable: _wb,
      builder: (context, _) => ChromeSurface(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ToolButton(
              key: const Key('hide-tools'),
              icon: Icons.expand_more,
              label: l.toolHide,
              onTap: () => setState(() {
                _hidden = true;
                _popover = null;
              }),
            ),
            ToolButton(icon: Icons.chevron_left, label: l.toolPrevious, enabled: _wb.hasPrevious, onTap: _wb.previous),
            SizedBox(
              width: 52,
              // Builder: this sits inside the chrome theme, not the canvas theme of this State's context.
              child: Builder(
                builder: (context) => Text('${_wb.pageIndex + 1}/${_wb.pageCount}', key: const Key('page-indicator'), textAlign: TextAlign.center, style: context.text.titleMedium),
              ),
            ),
            ToolButton(
              key: const Key('next-page'),
              icon: _wb.hasNext ? Icons.chevron_right : Icons.add,
              label: _wb.hasNext ? l.toolNext : l.toolNewPage,
              onTap: _wb.hasNext ? _wb.next : _wb.addPage,
            ),
            ToolButton(
              icon: Icons.swap_horiz,
              label: l.toolSwitch,
              onTap: () => setState(() => _align = _align == ToolbarAlign.right ? ToolbarAlign.center : ToolbarAlign.right),
            ),
          ],
        ),
      ),
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        left,
        Expanded(
          child: Align(
            alignment: switch (_align) {
              ToolbarAlign.left => Alignment.centerLeft,
              ToolbarAlign.center => Alignment.center,
              ToolbarAlign.right => Alignment.centerRight,
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
              child: FittedBox(child: toolbar),
            ),
          ),
        ),
        right,
      ],
    );
  }
}

class _MainToolbar extends StatelessWidget {
  const _MainToolbar({
    required this.wb,
    required this.primary,
    required this.compact,
    required this.popover,
    required this.panel,
    required this.onTool,
    required this.onPopover,
    required this.onPanel,
    required this.recording,
    required this.onRecord,
  });

  final WhiteboardController wb;

  /// Primary boards have no AI pen.
  final bool primary;
  final bool compact;
  final _Popover? popover;
  final PanelKind? panel;
  final void Function(BoardTool, _Popover?) onTool;
  final ValueChanged<_Popover> onPopover;
  final ValueChanged<PanelKind> onPanel;
  final bool recording;
  final VoidCallback onRecord;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) {
        final tool = wb.tool;
        final writing = tool == BoardTool.pen || tool == BoardTool.highlighter;
        return ChromeSurface(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ToolButton(
                key: const Key('record'),
                icon: recording ? Icons.stop_circle_outlined : Icons.fiber_manual_record,
                label: recording ? l.toolStop : l.toolRecord,
                iconColor: Kx.record,
                selected: recording,
                onTap: onRecord,
              ),
              ToolButton(key: const Key('tool-theme'), icon: Icons.texture, label: l.toolTheme, selected: popover == _Popover.theme, onTap: () => onPopover(_Popover.theme)),
              ToolButton(
                key: const Key('tool-write'),
                icon: tool == BoardTool.highlighter ? Icons.border_color_outlined : Icons.edit_outlined,
                label: l.toolWrite,
                selected: writing,
                onTap: () => writing ? onPopover(_Popover.write) : onTool(BoardTool.pen, _Popover.write),
              ),
              if (!primary)
                ToolButton(
                  key: const Key('tool-ai-pen'),
                  icon: Icons.draw_outlined,
                  label: l.aiPen,
                  selected: tool == BoardTool.aiPen || popover == _Popover.aiPen,
                  onTap: () => tool == BoardTool.aiPen ? onPopover(_Popover.aiPen) : onTool(BoardTool.aiPen, _Popover.aiPen),
                ),
              ToolButton(
                key: const Key('tool-erase'),
                icon: Icons.auto_fix_normal,
                label: l.toolErase,
                selected: tool == BoardTool.eraser,
                onTap: () => tool == BoardTool.eraser ? onPopover(_Popover.erase) : onTool(BoardTool.eraser, _Popover.erase),
              ),
              ToolButton(key: const Key('tool-select'), icon: Icons.highlight_alt, label: l.toolSelect, selected: tool == BoardTool.select, onTap: () => onTool(BoardTool.select, null)),
              ToolButton(key: const Key('tool-text'), icon: Icons.title, label: l.toolText, selected: tool == BoardTool.text, onTap: () => onTool(BoardTool.text, null)),
              ToolButton(
                key: const Key('tool-shapes'),
                icon: Icons.category_outlined,
                label: l.toolShapes,
                selected: tool == BoardTool.shape || popover == _Popover.shapes,
                onTap: () => onPopover(_Popover.shapes),
              ),
              ToolButton(
                key: const Key('tool-insert'),
                icon: Icons.add_box_outlined,
                label: l.toolInsert,
                selected: popover == _Popover.insert || tool == BoardTool.note || tool == BoardTool.math || tool == BoardTool.laser,
                onTap: () => onPopover(_Popover.insert),
              ),
              ToolButton(key: const Key('tool-tools'), icon: Icons.work_outline, label: l.toolTools, selected: popover == _Popover.tools, onTap: () => onPopover(_Popover.tools)),
              ToolButton(key: const Key('undo'), icon: Icons.undo, label: l.toolUndo, enabled: wb.canUndo, onTap: wb.undo),
              ToolButton(key: const Key('redo'), icon: Icons.redo, label: l.toolRedo, enabled: wb.canRedo, onTap: wb.redo),
              const ToolbarDivider(),
              ToolButton(
                key: const Key('panel-ai'),
                icon: Icons.auto_awesome,
                label: l.toolAi,
                accent: const Color(0xFF835400),
                selected: panel == PanelKind.ai,
                onTap: () => onPanel(PanelKind.ai),
              ),
              ToolButton(
                key: const Key('panel-books'),
                icon: Icons.menu_book,
                label: l.toolBooks,
                accent: const Color(0xFF1A73E8),
                selected: panel == PanelKind.books,
                onTap: () => onPanel(PanelKind.books),
              ),
              ToolButton(
                key: const Key('panel-quiz'),
                icon: Icons.quiz,
                label: l.toolQuiz,
                accent: const Color(0xFF188038),
                selected: panel == PanelKind.quiz,
                onTap: () => onPanel(PanelKind.quiz),
              ),
              ToolButton(
                key: const Key('panel-homework'),
                icon: Icons.assignment,
                label: l.toolHomework,
                accent: const Color(0xFFD93025),
                selected: panel == PanelKind.homework,
                onTap: () => onPanel(PanelKind.homework),
              ),
              ToolButton(
                key: const Key('panel-kit'),
                icon: Icons.backpack_outlined,
                label: l.kitShort,
                accent: const Color(0xFF006545),
                selected: panel == PanelKind.kit,
                onTap: () => onPanel(PanelKind.kit),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// The status strip across the top of the board.
class _TopBar extends StatefulWidget {
  const _TopBar({required this.board, required this.onSignIn, required this.onEndClass, required this.onAttendance, this.recording});

  final BoardController board;
  final VoidCallback onSignIn;
  final VoidCallback onEndClass;
  final VoidCallback onAttendance;

  /// The recording indicator, while a lesson is being recorded.
  final Widget? recording;

  @override
  State<_TopBar> createState() => _TopBarState();
}

class _TopBarState extends State<_TopBar> {
  late final Timer _clock = Timer.periodic(const Duration(seconds: 20), (_) => setState(() {}));

  Future<void> _toggleLive(BuildContext context) async {
    // Live classes need KINETIX Cloud (docs/product/demo-builds.md).
    if (Demo.enabled) {
      showBoardMessage(context, context.l10n.notInDemo);
      return;
    }
    final board = widget.board;
    final on = !board.classLive;
    try {
      await board.setClassLive(on);
      if (context.mounted) {
        showBoardMessage(context, on ? context.l10n.liveStarted : context.l10n.liveEnded);
      }
    } on ApiException catch (e) {
      if (context.mounted) showBoardMessage(context, apiErrorText(context.l10n, e));
    } catch (_) {
      if (context.mounted) showBoardMessage(context, context.l10n.cloudUnreachableCheckOnline);
    }
  }

  Future<void> _toggleAudio(BuildContext context) async {
    if (Demo.enabled) {
      showBoardMessage(context, context.l10n.notInDemo);
      return;
    }
    final audio = widget.board.classAudio;
    if (audio.enabled) {
      await audio.turnOff();
      if (context.mounted) showBoardMessage(context, context.l10n.classAudioStopped);
    } else if (await audio.turnOn() && context.mounted) {
      showBoardMessage(context, context.l10n.classAudioStarted);
    }
  }

  @override
  void dispose() {
    _clock.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final board = widget.board;
    final s = board.session;
    final marked = board.attendance.length;
    final l = context.l10n;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, 0),
      child: Row(
        children: [
          // Chips scroll rather than overflow when a side panel narrows the board.
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  if (s == null)
                    ActionChip(
                      key: const Key('sign-in-chip'),
                      avatar: Icon(board.isEnrolled ? Icons.qr_code_2 : Icons.edit_outlined, size: 18),
                      label: Text(board.isEnrolled ? l.guestSignIn : l.practiceBoard),
                      onPressed: board.isEnrolled ? widget.onSignIn : null,
                    )
                  else ...[
                    Chip(
                      key: const Key('class-chip'),
                      avatar: KxAvatar(name: s.teacherName, size: 24),
                      label: Text([s.teacherName, s.classLabel, s.periodLabel].whereType<String>().join('  ·  ')),
                    ),
                    if (board.liveLeaders > 0 && board.liveIndicator) ...[
                      const SizedBox(width: Kx.s8),
                      Tooltip(
                        message: l.beingViewedTooltip,
                        child: Chip(
                          key: const Key('being-viewed'),
                          avatar: const Icon(Icons.visibility_outlined, size: 18),
                          label: Text(l.beingViewed(board.liveLeaders)),
                        ),
                      ),
                    ],
                    const SizedBox(width: Kx.s8),
                    ActionChip(
                      key: const Key('go-live'),
                      avatar: Icon(board.classLive ? Icons.stop_circle_outlined : Icons.sensors, size: 18, color: Kx.live),
                      label: Text(
                        !board.classLive
                            ? l.goLive
                            : board.liveStudents == 0
                            ? l.liveWaiting
                            : l.liveStudents(board.liveStudents),
                      ),
                      tooltip: board.classLive ? l.stopLiveTooltip : l.goLiveTooltip,
                      onPressed: () => _toggleLive(context),
                    ),
                    const SizedBox(width: Kx.s8),
                    ActionChip(
                      key: const Key('class-audio'),
                      avatar: Icon(board.classAudio.enabled ? Icons.mic : Icons.mic_off_outlined, size: 18),
                      label: Text(board.classAudio.enabled ? l.classAudioOn : l.classAudio),
                      tooltip: board.classAudio.enabled ? l.classAudioTurnOffTooltip : l.classAudioTurnOnTooltip,
                      onPressed: () => _toggleAudio(context),
                    ),
                    const SizedBox(width: Kx.s8),
                    ActionChip(
                      key: const Key('attendance-chip'),
                      avatar: const Icon(Icons.groups_outlined, size: 18),
                      label: Text(
                        board.roster.isEmpty
                            ? l.noClassList
                            : marked == 0
                            ? l.takeAttendance(board.roster.length)
                            : l.presentOfTotal(board.pickable.length, board.roster.length),
                      ),
                      onPressed: widget.onAttendance,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: Kx.s8),
          if (Demo.enabled) ...[const DemoChip(), const SizedBox(width: Kx.s8)],
          // Privacy: whenever the microphone is going out to the class, the teacher sees it.
          // Kept outside the scrolling chips so it can never scroll out of view.
          if (board.classAudio.sending) ...[
            Tooltip(
              message: l.micOnTooltip,
              child: Chip(
                key: const Key('mic-on'),
                backgroundColor: Kx.record,
                side: BorderSide.none,
                avatar: const Icon(Icons.mic, size: 18, color: Colors.white),
                label: Text(l.micOn, style: context.text.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(width: Kx.s8),
          ],
          if (widget.recording != null) ...[widget.recording!, const SizedBox(width: Kx.s8)],
          // Holding the clock for 3 seconds is IT's way out of kiosk mode (docs/hardware/kiosk-mode.md).
          KioskExitGesture(
            key: const Key('kiosk-exit-gesture'),
            kiosk: board.kiosk,
            child: ChromeSurface(
              radius: Kx.rSm,
              padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (board.pendingOps > 0)
                    Padding(
                      padding: const EdgeInsets.only(right: Kx.s8),
                      child: Tooltip(
                        message: l.pendingSync(board.pendingOps),
                        child: Icon(Icons.cloud_upload_outlined, color: c.onSurface, size: 20),
                      ),
                    ),
                  if (board.isEnrolled)
                    Tooltip(
                      message: board.online ? l.connectedCloud : l.offlineSaved,
                      child: Icon(board.online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, color: c.onSurface, size: 20),
                    ),
                  const SizedBox(width: Kx.s12),
                  Text(_clockText(context, DateTime.now()), style: context.text.labelLarge?.copyWith(color: c.onSurface)),
                ],
              ),
            ),
          ),
          if (s != null) ...[
            const SizedBox(width: Kx.s12),
            FilledButton.tonalIcon(
              key: const Key('end-class'),
              style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
              onPressed: widget.onEndClass,
              icon: const Icon(Icons.logout, size: 18),
              label: Text(l.endClass),
            ),
          ],
        ],
      ),
    );
  }
}

/// "Sun 4 Oct · 12:18 pm": day and month in the board's language; the time with am/pm as
/// classrooms write it (intl's Kannada data abbreviates pm to a bare "p").
String _clockText(BuildContext context, DateTime now) =>
    '${DateFormat('EEE d MMM', context.dateLocale).format(now)} · ${DateFormat('h:mm a', dateLocaleFor(const Locale('en'))).format(now)}';


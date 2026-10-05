import 'dart:convert';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../core/recording/lesson_capture.dart';
import '../recording/recording_ui.dart';

import 'package:kinetix_ink/kinetix_ink.dart';

import '../ai/ai_controller.dart';
import '../ai/ai_panel.dart';
import '../ai/homework_panel.dart';
import '../ai/quiz_panel.dart';
import '../signin/sign_in_dialog.dart';
import '../../core/api_client.dart';
import '../../demo/demo.dart';
import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'classroom_tools.dart';
import 'popovers.dart';
import 'profile_menu.dart';
import '../books/books_panel.dart';
import '../plan/plan_timer.dart';
import '../plan/todays_plan_panel.dart';
import 'live_stream.dart';
import 'side_panel.dart';
import 'whiteboard_dialogs.dart';

enum _Popover { write, erase, theme, shapes, tools, eyeComfort, profile }

enum ToolbarAlign { left, center, right }

/// The teaching screen, laid out like the Teachmint X board (status strip on top, labelled
/// floating toolbar at the bottom, profile on the left, pages on the right, panels on the side)
/// and styled with Material 3.
class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key, required this.board});

  final BoardController board;

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  late final BoardPages _pages = BoardPages(palmMode: widget.board.touchProfile.palmMode);
  final _secondInk = InkController();
  late final AiController _ai;

  /// Today's plan step timer: keeps running while other panels are open or the panel is closed.
  late final PlanTimer _planTimer;
  BoardBackground _background = BoardBackground.plain;
  _Popover? _popover;
  PanelKind? _panel;
  bool _panelOnLeft = false;
  double _panelFraction = 0.45;
  SplitContent? _splitContent;
  String? _splitItem;
  String? _splitPreset;
  ToolbarAlign _align = ToolbarAlign.center;
  bool _hidden = false;
  bool _timer = false;
  Offset _timerPos = const Offset(40, 80);
  bool _signInOpen = false;
  Size _canvasSize = const Size(1920, 1080);
  String? _boardTitle;
  String? _lastSessionId;

  /// The lesson being recorded, and the teacher who is recording it.
  LessonCapture? _capture;
  SessionContext? _captureTeacher;
  bool _captureStarting = false;

  /// Streams the board while school leaders watch it live.
  late final LiveStream _live = LiveStream(pages: _pages, send: (events) => board.sendLiveFrame(events));

  BoardController get board => widget.board;
  InkController get ink => _pages.current;

  @override
  void initState() {
    super.initState();
    board.addListener(_onBoardChanged);
    board.onLiveSnapshotRequest = _startLive;
    board.classAudio.onUnavailable = _classAudioUnavailable;
    _ai = AiController(board)
      ..captureBoard = (() async => base64Encode(await renderPagePng(ink.strokes, _background, _canvasSize)))
      ..openSplit = _openSplit;
    _lastSessionId = board.session?.sessionId;
    _planTimer = PlanTimer(board);
  }

  @override
  void dispose() {
    board.removeListener(_onBoardChanged);
    if (board.onLiveSnapshotRequest == _startLive) board.onLiveSnapshotRequest = null;
    if (board.classAudio.onUnavailable == _classAudioUnavailable) board.classAudio.onUnavailable = null;
    _live.stop();
    _capture?.dispose();
    _pages.dispose();
    _secondInk.dispose();
    _ai.dispose();
    _planTimer.dispose();
    super.dispose();
  }

  /// Opens a 3D model or lab (or their picker, with no id) next to the whiteboard.
  void _openSplit(SplitContent content, [String? id, String? preset]) => setState(() {
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

  void _onBoardChanged() {
    _pages.palmMode = board.touchProfile.palmMode;
    if (board.liveViewers == 0 && _live.isStreaming) _live.stop();
    final id = board.session?.sessionId;
    if (id == _lastSessionId) return;
    _lastSessionId = id;
    if (_signInOpen && id != null) Navigator.of(context).pop();
    // The period ended (or the teacher signed out elsewhere) mid-recording: keep what was
    // recorded; it uploads when this teacher next signs in.
    if (id == null && _capture != null) unawaited(_stopRecording());
    final s = board.session;
    // The teacher's language may differ from the board's: the new strings arrive with the
    // next frame, so the message is shown then.
    unawaited(WidgetsBinding.instance.endOfFrame.then((_) {
      if (!mounted) return;
      final l = context.l10n;
      showBoardMessage(context, s == null ? l.signedOutGuest : '${l.welcomeTeacher(s.teacherName.split(' ').first)} ${s.classLabel ?? ''}'.trim());
    }));
  }

  void _toggle(_Popover p) => setState(() => _popover = _popover == p ? null : p);

  void _selectTool(InkTool t, _Popover? popover) {
    final wasSelected = ink.style.tool == t;
    ink.style = ink.style.copyWith(tool: t);
    // A second tap on the active tool opens its options, like Google's drawing tools.
    setState(() => _popover = (wasSelected && popover != null && _popover != popover) ? popover : null);
  }

  void _openPanel(PanelKind k) => setState(() {
    _popover = null;
    _booksTopic = null;
    _panel = _panel == k ? null : k;
  });

  /// The topic Books opens at, when it is opened from Today's plan.
  String? _booksTopic;

  void _openTopic(String topicId) => setState(() {
    _booksTopic = topicId;
    _panel = PanelKind.books;
  });

  Future<void> _signIn() async {
    final api = board.api;
    if (api == null) {
      showComingSoon(context, context.l10n.signInUnregistered);
      return;
    }
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
    setState(() => _background = b);
    _capture?.background = b;
    _live.background = b;
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
      final capture = await board.recordings.newCapture(id: board.newId(), pages: _pages, background: _background, canvas: _canvasSize);
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
          board.session?.teacherId == teacher.teacherId
              ? context.l10n.recordingSavedUploading
              : context.l10n.recordingSavedLater(teacher.teacherName.split(' ').first),
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

  /// The board as it stands, ready to save.
  SavedBoard _snapshot() => SavedBoard(background: _background, canvas: _canvasSize, pages: _pages.allStrokes);

  Future<void> _save() async {
    setState(() => _popover = null);
    if (!board.isSignedIn) {
      showBoardMessage(context, context.l10n.saveNeedsSignIn);
      return;
    }
    if (_pages.isBlank) {
      showBoardMessage(context, context.l10n.nothingToSave);
      return;
    }
    final choice = await showDialog<({String title, bool share})>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: SaveBoardDialog(
          initialTitle: _boardTitle ?? _defaultTitle(),
          classLabel: board.session?.sectionName,
        ),
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
            if (!_pages.isBlank) {
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
              _pages.load(saved.pages);
              board.whiteboardId = summary.id;
              setState(() {
                _background = saved.background;
                _boardTitle = summary.title;
              });
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
    final hasInk = !_pages.isBlank;
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
    _pages.load([]);
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

  void _randomPick() {
    setState(() => _popover = null);
    showDialog<void>(
      context: context,
      builder: (_) => BoardChromeTheme(
        child: RandomPickerDialog(pick: board.pickStudent, onAnswer: board.recordAnswer, classSize: board.pickable.length),
      ),
    );
  }

  List<ToolEntry> _tools(AppLocalizations l) => [
    ToolEntry(Icons.event_note_outlined, l.toolTodaysPlan, const Color(0xFF81C995), () => _openPanel(PanelKind.plan)),
    ToolEntry(
      Icons.timer_outlined,
      l.toolTimer,
      const Color(0xFF8AB4F8),
      () => setState(() {
        _timer = true;
        _popover = null;
      }),
    ),
    ToolEntry(Icons.casino_outlined, l.toolRandomPick, const Color(0xFFFDD663), _randomPick),
    ToolEntry(Icons.how_to_reg_outlined, l.toolAttendance, const Color(0xFF81C995), () {
      setState(() => _popover = null);
      _attendance();
    }),
    ToolEntry(Icons.vertical_split_outlined, l.toolSplitScreen, const Color(0xFFC58AF9), () => _openPanel(PanelKind.split)),
    ToolEntry(Icons.visibility_outlined, l.toolEyeComfort, const Color(0xFFFCAD70), () => setState(() => _popover = _Popover.eyeComfort)),
    ToolEntry(Icons.straighten, l.toolRuler, const Color(0xFF78D9EC), () => showComingSoon(context, l.toolRuler), soon: true),
    ToolEntry(Icons.architecture, l.toolProtractor, const Color(0xFF78D9EC), () => showComingSoon(context, l.toolProtractor), soon: true),
    ToolEntry(Icons.calculate_outlined, l.toolCalculator, const Color(0xFF8AB4F8), () => showComingSoon(context, l.toolCalculator), soon: true),
    ToolEntry(Icons.highlight_outlined, l.toolSpotlight, const Color(0xFFFDD663), () => showComingSoon(context, l.toolSpotlight), soon: true),
    ToolEntry(Icons.vignette_outlined, l.toolScreenShade, const Color(0xFFDADCE0), () => showComingSoon(context, l.toolScreenShade), soon: true),
    ToolEntry(Icons.photo_camera_outlined, l.toolScreenshot, const Color(0xFFF28B82), () => showComingSoon(context, l.toolScreenshot), soon: true),
    ToolEntry(Icons.lock_outline, l.toolTouchLock, const Color(0xFFDADCE0), () => showComingSoon(context, l.toolTouchLock), soon: true),
  ];

  @override
  Widget build(BuildContext context) {
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyZ, control: true): () => ink.undo(),
        const SingleActivator(LogicalKeyboardKey.keyY, control: true): () => ink.redo(),
        const SingleActivator(LogicalKeyboardKey.delete): () => ink.deleteSelection(),
        const SingleActivator(LogicalKeyboardKey.escape): () => setState(() => _popover = null),
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          body: ListenableBuilder(
            listenable: Listenable.merge([board, _pages]),
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
                child: _panelContent(),
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
              return _boardArea(context, compact: area.maxWidth < 1500);
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
    ),
  };

  Widget _boardArea(BuildContext context, {required bool compact}) {
    return Stack(
      children: [
        Positioned.fill(
          child: InkCanvas(key: ValueKey(_pages.index), controller: ink, background: _background),
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
        _SelectionActions(ink: ink),
        if (_timer)
          Positioned(
            left: _timerPos.dx,
            top: _timerPos.dy,
            child: GestureDetector(
              onPanUpdate: (d) => setState(() => _timerPos += d.delta),
              child: BoardChromeTheme(child: CountdownCard(onClose: () => setState(() => _timer = false))),
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
        if (_popover != null) _popoverLayer(),
        if (!_hidden)
          Positioned(
            left: Kx.s12,
            right: Kx.s12,
            bottom: Kx.s12,
            child: BoardChromeTheme(
              child: ToolbarDensity(compact: compact, child: _bottomChrome(compact)),
            ),
          ),
        if (_hidden)
          Positioned(
            right: Kx.s16,
            bottom: Kx.s16,
            child: BoardChromeTheme(
              child: FloatingActionButton.small(
                key: const Key('show-tools'),
                tooltip: context.l10n.showTools,
                onPressed: () => setState(() => _hidden = false),
                child: const Icon(Icons.expand_less),
              ),
            ),
          ),
      ],
    );
  }

  Widget _popoverLayer() {
    final Widget card = switch (_popover!) {
      _Popover.write => WritePopover(ink: ink, background: _background),
      _Popover.erase => ErasePopover(ink: ink, onCleared: () => setState(() => _popover = null)),
      _Popover.theme => ThemePopover(background: _background, onChanged: _setBackground),
      _Popover.shapes => ShapesPopover(ink: ink, onPicked: () {}),
      _Popover.tools => ToolsPopover(tools: _tools(context.l10n)),
      _Popover.eyeComfort => EyeComfortPopover(
        settings: board.eyeComfort,
        onChanged: board.setEyeComfort,
        chalkboard: _background == BoardBackground.chalkboard,
        onChalkboard: (v) => _setBackground(v ? BoardBackground.chalkboard : BoardBackground.plain),
      ),
      _Popover.profile => ProfileMenu(
        board: board,
        onSignIn: _signIn,
        onNewPage: _pages.addPage,
        onWhiteboards: _openWhiteboards,
        onRecordings: _openRecordings,
        onSettings: () => showDialog<void>(
          context: context,
          builder: (_) => BoardChromeTheme(child: BoardSettingsDialog(board: board)),
        ),
        onClose: () => setState(() => _popover = null),
      ),
    };
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
      bottom: 96,
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
      ink: ink,
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
    final right = ChromeSurface(
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
          ToolButton(icon: Icons.chevron_left, label: l.toolPrevious, enabled: _pages.hasPrevious, onTap: _pages.previous),
          SizedBox(
            width: 52,
            // Builder: this sits inside the chrome theme, not the canvas theme of this State's context.
            child: Builder(
              builder: (context) => Text(
                '${_pages.index + 1}/${_pages.count}',
                key: const Key('page-indicator'),
                textAlign: TextAlign.center,
                style: context.text.titleMedium,
              ),
            ),
          ),
          ToolButton(
            key: const Key('next-page'),
            icon: _pages.hasNext ? Icons.chevron_right : Icons.add,
            label: _pages.hasNext ? l.toolNext : l.toolNewPage,
            onTap: _pages.hasNext ? _pages.next : _pages.addPage,
          ),
          ToolButton(
            icon: Icons.swap_horiz,
            label: l.toolSwitch,
            onTap: () => setState(() => _align = _align == ToolbarAlign.right ? ToolbarAlign.center : ToolbarAlign.right),
          ),
        ],
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
    required this.ink,
    required this.compact,
    required this.popover,
    required this.panel,
    required this.onTool,
    required this.onPopover,
    required this.onPanel,
    required this.recording,
    required this.onRecord,
  });

  final InkController ink;
  final bool compact;
  final _Popover? popover;
  final PanelKind? panel;
  final void Function(InkTool, _Popover?) onTool;
  final ValueChanged<_Popover> onPopover;
  final ValueChanged<PanelKind> onPanel;
  final bool recording;
  final VoidCallback onRecord;

  @override
  Widget build(BuildContext context) {
    final tool = ink.style.tool;
    final l = context.l10n;
    return ListenableBuilder(
      listenable: ink,
      builder: (context, _) => ChromeSurface(
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
              icon: tool == InkTool.highlighter ? Icons.border_color_outlined : Icons.edit_outlined,
              label: l.toolWrite,
              selected: tool == InkTool.pen || tool == InkTool.highlighter,
              onTap: () {
                if (tool == InkTool.pen || tool == InkTool.highlighter) {
                  onPopover(_Popover.write);
                } else {
                  onTool(InkTool.pen, _Popover.write);
                }
              },
            ),
            ToolButton(
              key: const Key('tool-erase'),
              icon: Icons.auto_fix_normal,
              label: l.toolErase,
              selected: tool == InkTool.eraser,
              onTap: () => tool == InkTool.eraser ? onPopover(_Popover.erase) : onTool(InkTool.eraser, _Popover.erase),
            ),
            ToolButton(
              key: const Key('tool-select'),
              icon: Icons.highlight_alt,
              label: l.toolSelect,
              selected: tool == InkTool.select,
              onTap: () => onTool(InkTool.select, null),
            ),
            ToolButton(
              key: const Key('tool-shapes'),
              icon: Icons.category_outlined,
              label: l.toolShapes,
              selected: tool == InkTool.shape || popover == _Popover.shapes,
              onTap: () => onPopover(_Popover.shapes),
            ),
            ToolButton(
              key: const Key('tool-tools'),
              icon: Icons.work_outline,
              label: l.toolTools,
              selected: popover == _Popover.tools,
              onTap: () => onPopover(_Popover.tools),
            ),
            ToolButton(key: const Key('undo'), icon: Icons.undo, label: l.toolUndo, enabled: ink.canUndo, onTap: ink.undo),
            ToolButton(key: const Key('redo'), icon: Icons.redo, label: l.toolRedo, enabled: ink.canRedo, onTap: ink.redo),
            const ToolbarDivider(),
            ToolButton(
              key: const Key('panel-ai'),
              icon: Icons.auto_awesome,
              label: l.toolAi,
              accent: const Color(0xFF8E44EC),
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
          ],
        ),
      ),
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
          ChromeSurface(
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

/// Floating "Delete" action above a selection.
class _SelectionActions extends StatelessWidget {
  const _SelectionActions({required this.ink});

  final InkController ink;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ink,
      builder: (context, _) {
        final b = ink.selectionBounds;
        if (b == null || ink.marquee != null) return const SizedBox.shrink();
        return Positioned(
          left: b.center.dx - 70,
          top: (b.top - 64).clamp(60.0, double.infinity),
          child: BoardChromeTheme(
            child: ChromeSurface(
              radius: Kx.rXl,
              padding: const EdgeInsets.all(4),
              child: TextButton.icon(
                key: const Key('delete-selection'),
                onPressed: ink.deleteSelection,
                icon: const Icon(Icons.delete_outline),
                label: Text(context.l10n.deleteSelection(ink.selection.length)),
              ),
            ),
          ),
        );
      },
    );
  }
}

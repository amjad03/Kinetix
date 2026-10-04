import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../ink/board_background.dart';
import '../ink/ink_canvas.dart';
import '../ink/ink_controller.dart';
import '../ink/ink_models.dart';
import '../signin/sign_in_dialog.dart';
import 'chrome.dart';
import 'classroom_tools.dart';
import 'popovers.dart';
import 'profile_menu.dart';
import 'side_panel.dart';

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
  BoardBackground _background = BoardBackground.plain;
  _Popover? _popover;
  PanelKind? _panel;
  bool _panelOnLeft = false;
  double _panelFraction = 0.45;
  SplitContent? _splitContent;
  ToolbarAlign _align = ToolbarAlign.center;
  bool _hidden = false;
  bool _timer = false;
  Offset _timerPos = const Offset(40, 80);
  bool _signInOpen = false;
  String? _lastSessionId;

  BoardController get board => widget.board;
  InkController get ink => _pages.current;

  @override
  void initState() {
    super.initState();
    board.addListener(_onBoardChanged);
    _lastSessionId = board.session?.sessionId;
  }

  @override
  void dispose() {
    board.removeListener(_onBoardChanged);
    _pages.dispose();
    _secondInk.dispose();
    super.dispose();
  }

  void _onBoardChanged() {
    _pages.palmMode = board.touchProfile.palmMode;
    final id = board.session?.sessionId;
    if (id == _lastSessionId) return;
    _lastSessionId = id;
    if (_signInOpen && id != null) Navigator.of(context).pop();
    final s = board.session;
    showBoardMessage(
      context,
      s == null ? 'Signed out. The board is in guest mode.' : 'Welcome, ${s.teacherName.split(' ').first}. ${s.classLabel ?? ''}',
    );
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
    _panel = _panel == k ? null : k;
  });

  Future<void> _signIn() async {
    final api = board.api;
    if (api == null) {
      showComingSoon(context, 'Sign-in on an unregistered board');
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

  Future<void> _endClass() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => BoardChromeTheme(
        child: AlertDialog(
          icon: const Icon(Icons.logout),
          title: const Text('End class?'),
          content: const Text('You will be signed out of this board. Attendance and answers recorded in class are kept.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep teaching')),
            FilledButton(key: const Key('confirm-end'), onPressed: () => Navigator.pop(context, true), child: const Text('End class')),
          ],
        ),
      ),
    );
    if (ok == true) await board.endClass();
  }

  void _attendance() {
    if (board.roster.isEmpty) {
      showComingSoon(context, 'Attendance without a timetabled class');
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

  List<ToolEntry> get _tools => [
    ToolEntry(
      Icons.timer_outlined,
      'Timer',
      const Color(0xFF8AB4F8),
      () => setState(() {
        _timer = true;
        _popover = null;
      }),
    ),
    ToolEntry(Icons.casino_outlined, 'Random pick', const Color(0xFFFDD663), _randomPick),
    ToolEntry(Icons.how_to_reg_outlined, 'Attendance', const Color(0xFF81C995), () {
      setState(() => _popover = null);
      _attendance();
    }),
    ToolEntry(Icons.vertical_split_outlined, 'Split screen', const Color(0xFFC58AF9), () => _openPanel(PanelKind.split)),
    ToolEntry(Icons.visibility_outlined, 'Eye comfort', const Color(0xFFFCAD70), () => setState(() => _popover = _Popover.eyeComfort)),
    ToolEntry(Icons.straighten, 'Ruler', const Color(0xFF78D9EC), () => showComingSoon(context, 'Ruler'), soon: true),
    ToolEntry(Icons.architecture, 'Protractor', const Color(0xFF78D9EC), () => showComingSoon(context, 'Protractor'), soon: true),
    ToolEntry(Icons.calculate_outlined, 'Calculator', const Color(0xFF8AB4F8), () => showComingSoon(context, 'Calculator'), soon: true),
    ToolEntry(Icons.highlight_outlined, 'Spotlight', const Color(0xFFFDD663), () => showComingSoon(context, 'Spotlight'), soon: true),
    ToolEntry(Icons.vignette_outlined, 'Screen shade', const Color(0xFFDADCE0), () => showComingSoon(context, 'Screen shade'), soon: true),
    ToolEntry(Icons.photo_camera_outlined, 'Screenshot', const Color(0xFFF28B82), () => showComingSoon(context, 'Screenshot'), soon: true),
    ToolEntry(Icons.lock_outline, 'Touch lock', const Color(0xFFDADCE0), () => showComingSoon(context, 'Touch lock'), soon: true),
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
          child: LayoutBuilder(builder: (context, area) => _boardArea(context, compact: area.maxWidth < 1500)),
        ),
        if (panel != null && !_panelOnLeft) panel,
      ],
    );
  }

  Widget _panelContent() => switch (_panel!) {
    PanelKind.ai => AiPanel(classLabel: board.session?.classLabel),
    PanelKind.books => const PlannedPanel(
      icon: Icons.menu_book_outlined,
      title: 'Books',
      accent: Color(0xFF8AB4F8),
      message: 'Textbooks and course material for CBSE/NCERT, ICSE, Karnataka State Board and Bangalore University are coming in an upcoming build.',
    ),
    PanelKind.quiz => const PlannedPanel(
      icon: Icons.quiz_outlined,
      title: 'Quick quiz',
      accent: Color(0xFF81C995),
      message: 'Ask the class a question and collect answers from phones or printed answer cards. Coming in an upcoming build.',
    ),
    PanelKind.homework => const PlannedPanel(
      icon: Icons.assignment_outlined,
      title: 'Homework',
      accent: Color(0xFFF28B82),
      message: 'Give homework from the board and it appears in the Student and Parent apps. Teachers can already assign homework from the Teacher app.',
    ),
    PanelKind.split => SplitPanel(
      content: _splitContent,
      onContent: (c) => setState(() => _splitContent = c),
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
            child: _TopBar(board: board, onSignIn: _signIn, onEndClass: _endClass, onAttendance: _attendance),
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
                tooltip: 'Show tools',
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
      _Popover.theme => ThemePopover(background: _background, onChanged: (b) => setState(() => _background = b)),
      _Popover.shapes => ShapesPopover(ink: ink, onPicked: () {}),
      _Popover.tools => ToolsPopover(tools: _tools),
      _Popover.eyeComfort => EyeComfortPopover(
        settings: board.eyeComfort,
        onChanged: board.setEyeComfort,
        chalkboard: _background == BoardBackground.chalkboard,
        onChalkboard: (v) => setState(() => _background = v ? BoardBackground.chalkboard : BoardBackground.plain),
      ),
      _Popover.profile => ProfileMenu(
        board: board,
        onSignIn: _signIn,
        onNewPage: _pages.addPage,
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
    final toolbar = _MainToolbar(
      ink: ink,
      compact: compact,
      popover: _popover,
      panel: _panel,
      onTool: _selectTool,
      onPopover: _toggle,
      onPanel: _openPanel,
    );
    final left = ChromeSurface(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ToolButton(
            icon: Icons.swap_horiz,
            label: 'Switch',
            onTap: () => setState(() => _align = _align == ToolbarAlign.left ? ToolbarAlign.center : ToolbarAlign.left),
          ),
          ToolButton(
            key: const Key('profile-button'),
            icon: Icons.person,
            label: board.session?.teacherName.split(' ').first ?? 'Guest',
            selected: _popover == _Popover.profile,
            onTap: () => _toggle(_Popover.profile),
          ),
          if (!compact)
            ToolButton(
              icon: Icons.save_outlined,
              label: 'Save',
              onTap: () => showComingSoon(context, 'Saving whiteboards to the cloud'),
              badge: 'Soon',
            ),
        ],
      ),
    );
    final right = ChromeSurface(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ToolButton(
            icon: Icons.expand_more,
            label: 'Hide',
            onTap: () => setState(() {
              _hidden = true;
              _popover = null;
            }),
          ),
          ToolButton(icon: Icons.chevron_left, label: 'Previous', enabled: _pages.hasPrevious, onTap: _pages.previous),
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
            label: _pages.hasNext ? 'Next' : 'New page',
            onTap: _pages.hasNext ? _pages.next : _pages.addPage,
          ),
          ToolButton(
            icon: Icons.swap_horiz,
            label: 'Switch',
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
  });

  final InkController ink;
  final bool compact;
  final _Popover? popover;
  final PanelKind? panel;
  final void Function(InkTool, _Popover?) onTool;
  final ValueChanged<_Popover> onPopover;
  final ValueChanged<PanelKind> onPanel;

  @override
  Widget build(BuildContext context) {
    final tool = ink.style.tool;
    return ListenableBuilder(
      listenable: ink,
      builder: (context, _) => ChromeSurface(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ToolButton(
              icon: Icons.fiber_manual_record,
              label: 'Record',
              iconColor: Kx.record,
              badge: 'Soon',
              onTap: () => showComingSoon(context, 'Lesson recording'),
            ),
            ToolButton(icon: Icons.texture, label: 'Theme', selected: popover == _Popover.theme, onTap: () => onPopover(_Popover.theme)),
            ToolButton(
              key: const Key('tool-write'),
              icon: tool == InkTool.highlighter ? Icons.border_color_outlined : Icons.edit_outlined,
              label: 'Write',
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
              label: 'Erase',
              selected: tool == InkTool.eraser,
              onTap: () => tool == InkTool.eraser ? onPopover(_Popover.erase) : onTool(InkTool.eraser, _Popover.erase),
            ),
            ToolButton(
              key: const Key('tool-select'),
              icon: Icons.highlight_alt,
              label: 'Select',
              selected: tool == InkTool.select,
              onTap: () => onTool(InkTool.select, null),
            ),
            ToolButton(
              key: const Key('tool-shapes'),
              icon: Icons.category_outlined,
              label: 'Shapes',
              selected: tool == InkTool.shape || popover == _Popover.shapes,
              onTap: () => onPopover(_Popover.shapes),
            ),
            ToolButton(
              key: const Key('tool-tools'),
              icon: Icons.work_outline,
              label: 'Tools',
              selected: popover == _Popover.tools,
              onTap: () => onPopover(_Popover.tools),
            ),
            ToolButton(key: const Key('undo'), icon: Icons.undo, label: 'Undo', enabled: ink.canUndo, onTap: ink.undo),
            ToolButton(key: const Key('redo'), icon: Icons.redo, label: 'Redo', enabled: ink.canRedo, onTap: ink.redo),
            const ToolbarDivider(),
            ToolButton(
              key: const Key('panel-ai'),
              icon: Icons.auto_awesome,
              label: 'AI',
              accent: const Color(0xFF8E44EC),
              selected: panel == PanelKind.ai,
              onTap: () => onPanel(PanelKind.ai),
            ),
            ToolButton(
              icon: Icons.menu_book,
              label: 'Books',
              accent: const Color(0xFF1A73E8),
              selected: panel == PanelKind.books,
              onTap: () => onPanel(PanelKind.books),
            ),
            ToolButton(
              icon: Icons.quiz,
              label: 'Quiz',
              accent: const Color(0xFF188038),
              selected: panel == PanelKind.quiz,
              onTap: () => onPanel(PanelKind.quiz),
            ),
            ToolButton(
              icon: Icons.assignment,
              label: 'Homework',
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
  const _TopBar({required this.board, required this.onSignIn, required this.onEndClass, required this.onAttendance});

  final BoardController board;
  final VoidCallback onSignIn;
  final VoidCallback onEndClass;
  final VoidCallback onAttendance;

  @override
  State<_TopBar> createState() => _TopBarState();
}

class _TopBarState extends State<_TopBar> {
  late final Timer _clock = Timer.periodic(const Duration(seconds: 20), (_) => setState(() {}));

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
                      label: Text(board.isEnrolled ? 'Guest · Sign in' : 'Practice board'),
                      onPressed: board.isEnrolled ? widget.onSignIn : null,
                    )
                  else ...[
                    Chip(
                      key: const Key('class-chip'),
                      avatar: KxAvatar(name: s.teacherName, size: 24),
                      label: Text([s.teacherName, s.classLabel, s.periodLabel].whereType<String>().join('  ·  ')),
                    ),
                    const SizedBox(width: Kx.s8),
                    ActionChip(
                      avatar: const Icon(Icons.sensors, size: 18, color: Kx.live),
                      label: const Text('Go live'),
                      onPressed: () => showComingSoon(context, 'Live class'),
                    ),
                    const SizedBox(width: Kx.s8),
                    ActionChip(
                      key: const Key('attendance-chip'),
                      avatar: const Icon(Icons.groups_outlined, size: 18),
                      label: Text(
                        board.roster.isEmpty
                            ? 'No class list'
                            : marked == 0
                            ? '${board.roster.length} students · Take attendance'
                            : '${board.pickable.length}/${board.roster.length} present',
                      ),
                      onPressed: widget.onAttendance,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: Kx.s8),
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
                      message: '${board.pendingOps} changes waiting to sync',
                      child: Icon(Icons.cloud_upload_outlined, color: c.onSurface, size: 20),
                    ),
                  ),
                if (board.isEnrolled)
                  Tooltip(
                    message: board.online ? 'Connected to KINETIX Cloud' : 'Offline. Everything is saved and will sync.',
                    child: Icon(board.online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, color: c.onSurface, size: 20),
                  ),
                const SizedBox(width: Kx.s12),
                Text(DateFormat('EEE d MMM · h:mm a').format(DateTime.now()), style: context.text.labelLarge?.copyWith(color: c.onSurface)),
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
              label: const Text('End class'),
            ),
          ],
        ],
      ),
    );
  }
}

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
                label: Text('Delete ${ink.selection.length}'),
              ),
            ),
          ),
        );
      },
    );
  }
}

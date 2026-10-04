import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../comfort/eye_comfort.dart';
import '../ink/board_background.dart';
import '../ink/ink_canvas.dart';
import '../ink/ink_controller.dart';
import '../ink/ink_models.dart';
import 'pane_content.dart';
import 'split_layout.dart';

const _palette = [
  Color(0xFF1B1B1F), // black / chalk white on dark boards
  Color(0xFFD32F2F),
  Color(0xFF1976D2),
  Color(0xFF2E7D32),
  Color(0xFFF9A825),
  Color(0xFF7B1FA2),
];

/// The teaching surface: whiteboard (optionally split with another pane) and the toolbar.
class WorkspaceScreen extends StatefulWidget {
  const WorkspaceScreen({
    super.key,
    required this.session,
    required this.eyeComfort,
    required this.onEyeComfortChanged,
    required this.onEndClass,
  });

  final SessionContext session;
  final EyeComfortSettings eyeComfort;
  final ValueChanged<EyeComfortSettings> onEyeComfortChanged;
  final VoidCallback onEndClass;

  @override
  State<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends State<WorkspaceScreen> {
  final _ink = InkController();
  final _secondaryInk = InkController();
  BoardBackground _background = BoardBackground.plain;
  SplitMode _split = SplitMode.single;
  bool _boardOnLeft = true;
  PaneContent _secondary = PaneContent.document;

  @override
  void dispose() {
    _ink.dispose();
    _secondaryInk.dispose();
    super.dispose();
  }

  void _setTool(InkTool tool) => _ink.style = _ink.style.copyWith(tool: tool);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _SessionBar(session: widget.session, onEndClass: widget.onEndClass),
        Expanded(
          child: SplitLayout(
            mode: _split,
            primaryOnLeft: _boardOnLeft,
            primary: InkCanvas(controller: _ink, background: _background),
            secondary: _secondary == PaneContent.whiteboard
                ? InkCanvas(controller: _secondaryInk, background: _background)
                : PlaceholderPane(content: _secondary),
          ),
        ),
        ListenableBuilder(listenable: _ink, builder: (context, _) => _toolbar(context)),
      ]),
    );
  }

  Widget _toolbar(BuildContext context) {
    final style = _ink.style;
    Widget tool(InkTool t, IconData icon, String tip) => IconButton.filledTonal(
          tooltip: tip,
          isSelected: style.tool == t,
          onPressed: () => _setTool(t),
          icon: Icon(icon),
        );
    return Material(
      color: const Color(0xFF1E1F24),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(children: [
            tool(InkTool.pen, Icons.edit, 'Pen'),
            const SizedBox(width: 6),
            tool(InkTool.highlighter, Icons.highlight, 'Highlighter'),
            const SizedBox(width: 6),
            tool(InkTool.eraser, Icons.auto_fix_normal, 'Eraser'),
            const SizedBox(width: 16),
            for (final c in _palette)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: InkResponse(
                  onTap: () => _ink.style = style.copyWith(color: c, tool: style.tool == InkTool.eraser ? InkTool.pen : style.tool),
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: inkColorFor(c, _background),
                      shape: BoxShape.circle,
                      border: Border.all(color: style.color == c ? Colors.white : Colors.white24, width: style.color == c ? 3 : 1),
                    ),
                  ),
                ),
              ),
            const SizedBox(width: 12),
            SizedBox(
              width: 140,
              child: Slider(min: 2, max: 24, value: style.width, onChanged: (v) => _ink.style = style.copyWith(width: v)),
            ),
            IconButton(tooltip: 'Undo', onPressed: _ink.canUndo ? _ink.undo : null, icon: const Icon(Icons.undo, color: Colors.white)),
            IconButton(tooltip: 'Redo', onPressed: _ink.canRedo ? _ink.redo : null, icon: const Icon(Icons.redo, color: Colors.white)),
            IconButton(tooltip: 'Clear page', onPressed: _ink.clear, icon: const Icon(Icons.delete_sweep_outlined, color: Colors.white)),
            const _Gap(),
            PopupMenuButton<BoardBackground>(
              tooltip: 'Background',
              icon: const Icon(Icons.grid_on, color: Colors.white),
              onSelected: (b) => setState(() => _background = b),
              itemBuilder: (_) => [for (final b in BoardBackground.values) CheckedPopupMenuItem(value: b, checked: b == _background, child: Text(b.label))],
            ),
            PopupMenuButton<SplitMode>(
              key: const Key('split-menu'),
              tooltip: 'Split screen',
              icon: const Icon(Icons.vertical_split_outlined, color: Colors.white),
              onSelected: (m) => setState(() => _split = m),
              itemBuilder: (_) => [for (final m in SplitMode.values) CheckedPopupMenuItem(value: m, checked: m == _split, child: Text(m.label))],
            ),
            if (_split != SplitMode.single) ...[
              IconButton(
                key: const Key('swap-sides'),
                tooltip: 'Swap sides',
                onPressed: () => setState(() => _boardOnLeft = !_boardOnLeft),
                icon: const Icon(Icons.swap_horiz, color: Colors.white),
              ),
              PopupMenuButton<PaneContent>(
                tooltip: 'Other side shows',
                icon: Icon(_secondary.icon, color: Colors.white),
                onSelected: (c) => setState(() => _secondary = c),
                itemBuilder: (_) => [for (final c in PaneContent.values) CheckedPopupMenuItem(value: c, checked: c == _secondary, child: Text(c.label))],
              ),
            ],
            const _Gap(),
            IconButton(
              key: const Key('eye-comfort'),
              tooltip: 'Eye comfort',
              onPressed: () => _showEyeComfort(context),
              icon: Icon(widget.eyeComfort.enabled ? Icons.visibility : Icons.visibility_outlined, color: widget.eyeComfort.enabled ? const Color(0xFFFFC107) : Colors.white),
            ),
          ]),
        ),
      ),
    );
  }

  void _showEyeComfort(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        var s = widget.eyeComfort;
        return StatefulBuilder(builder: (context, setSheet) {
          void update(EyeComfortSettings next) {
            setSheet(() => s = next);
            widget.onEyeComfortChanged(next);
          }

          // Scrolls on short screens (tablets in landscape, 720p projectors).
          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              SwitchListTile(title: const Text('Eye protection'), subtitle: const Text('Warmer colours and gentle dimming'), value: s.enabled, onChanged: (v) => update(s.copyWith(enabled: v))),
              SwitchListTile(
                title: const Text('Adjust automatically through the day'),
                value: s.auto,
                onChanged: s.enabled ? (v) => update(s.copyWith(auto: v)) : null,
              ),
              ListTile(
                title: const Text('Warmth'),
                subtitle: Slider(value: s.warmth, onChanged: s.enabled && !s.auto ? (v) => update(s.copyWith(warmth: v)) : null),
              ),
              ListTile(
                title: const Text('Dimming'),
                subtitle: Slider(value: s.dim, onChanged: s.enabled && !s.auto ? (v) => update(s.copyWith(dim: v)) : null),
              ),
              SwitchListTile(title: const Text('High contrast'), subtitle: const Text('For faded projectors'), value: s.highContrast, onChanged: (v) => update(s.copyWith(highContrast: v))),
              SwitchListTile(
                title: const Text('Chalkboard (dark board)'),
                subtitle: const Text('Less glare from the projector'),
                value: _background == BoardBackground.chalkboard,
                onChanged: (v) {
                  setState(() => _background = v ? BoardBackground.chalkboard : BoardBackground.plain);
                  setSheet(() {});
                },
              ),
            ]),
          );
        });
      },
    );
  }
}

class _Gap extends StatelessWidget {
  const _Gap();
  @override
  Widget build(BuildContext context) => const SizedBox(height: 28, child: VerticalDivider(color: Colors.white24, width: 24));
}

class _SessionBar extends StatelessWidget {
  const _SessionBar({required this.session, required this.onEndClass});

  final SessionContext session;
  final VoidCallback onEndClass;

  @override
  Widget build(BuildContext context) {
    final details = [session.sectionName, session.subjectName, session.periodLabel].whereType<String>().join(' · ');
    return Material(
      color: const Color(0xFF101418),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(children: [
            const Text('KINETIX', style: TextStyle(color: Color(0xFF7CC4FF), letterSpacing: 4, fontWeight: FontWeight.w700)),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                details.isEmpty ? session.teacherName : '${session.teacherName}  —  $details',
                style: const TextStyle(color: Colors.white, fontSize: 16),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            FilledButton.tonalIcon(
              key: const Key('end-class'),
              onPressed: onEndClass,
              icon: const Icon(Icons.logout),
              label: Text(session.isPractice ? 'Close' : 'End class'),
            ),
          ]),
        ),
      ),
    );
  }
}

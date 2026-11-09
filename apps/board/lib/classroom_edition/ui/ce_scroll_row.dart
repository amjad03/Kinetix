import 'package:flutter/material.dart';

import '../l10n/ce_strings.dart';

/// A row that scrolls sideways and shows that it does: the edge fades where more is hidden, and
/// a big arrow there scrolls by most of a screen (Classroom edition: the side panel's tabs, so
/// "K…" is never cut off without a hint, and a teacher who does not think to swipe can tap).
class CeScrollRow extends StatefulWidget {
  const CeScrollRow({super.key, required this.children, this.scrollKey, this.background, this.arrowSize = 64});

  final List<Widget> children;

  /// The key of the scroll view itself (tests find the tabs by it).
  final Key? scrollKey;

  /// The colour under the row, for the fade (default: the theme's surface).
  final Color? background;
  final double arrowSize;

  @override
  State<CeScrollRow> createState() => _CeScrollRowState();
}

class _CeScrollRowState extends State<CeScrollRow> {
  final _scroll = ScrollController();
  bool _before = false, _after = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_update);
    WidgetsBinding.instance.addPostFrameCallback((_) => _update());
  }

  @override
  void didUpdateWidget(CeScrollRow old) {
    super.didUpdateWidget(old);
    WidgetsBinding.instance.addPostFrameCallback((_) => _update());
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _update() {
    if (!mounted || !_scroll.hasClients) return;
    final p = _scroll.position;
    final before = p.pixels > 1, after = p.pixels < p.maxScrollExtent - 1;
    if (before != _before || after != _after) {
      setState(() {
        _before = before;
        _after = after;
      });
    }
  }

  void _by(double sign) {
    final p = _scroll.position;
    final to = (p.pixels + sign * p.viewportDimension * 0.7).clamp(0.0, p.maxScrollExtent);
    _scroll.animateTo(to, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.background ?? Theme.of(context).colorScheme.surface;
    Widget edge({required bool start}) => IgnorePointer(
      child: Container(
        width: 56,
        decoration: BoxDecoration(gradient: LinearGradient(begin: start ? Alignment.centerLeft : Alignment.centerRight, end: start ? Alignment.centerRight : Alignment.centerLeft, colors: [bg, bg.withValues(alpha: 0)])),
      ),
    );
    Widget arrow({required bool start}) => Material(
      color: bg,
      shape: const CircleBorder(),
      elevation: 2,
      child: IconButton(
        key: Key(start ? 'ce-scroll-back' : 'ce-scroll-more'),
        style: const ButtonStyle(side: WidgetStatePropertyAll(BorderSide.none), shape: WidgetStatePropertyAll(CircleBorder())),
        tooltip: start ? context.ce('Scroll back') : context.ce('More'),
        constraints: BoxConstraints.tightFor(width: widget.arrowSize, height: widget.arrowSize),
        onPressed: () => _by(start ? -1 : 1),
        icon: Icon(start ? Icons.chevron_left_rounded : Icons.chevron_right_rounded, size: 30),
      ),
    );
    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (_) {
        _update();
        return false;
      },
      child: Stack(
        alignment: Alignment.center,
        children: [
          SingleChildScrollView(key: widget.scrollKey, controller: _scroll, scrollDirection: Axis.horizontal, child: Row(children: widget.children)),
          if (_before) Positioned(left: 0, top: 0, bottom: 0, child: edge(start: true)),
          if (_after) Positioned(right: 0, top: 0, bottom: 0, child: edge(start: false)),
          if (_before) Positioned(left: 0, child: arrow(start: true)),
          if (_after) Positioned(right: 0, child: arrow(start: false)),
        ],
      ),
    );
  }
}

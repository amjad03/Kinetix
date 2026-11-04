import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../l10n/l10n.dart';

/// Between classes: the institution, room and time, the period on now and next, and the notices sent to boards
/// (`GET /v1/devices/me/idle`, emergency notices first). Refreshes every [refresh]; a touch wakes the board.
class BoardScreensaver extends StatefulWidget {
  const BoardScreensaver({super.key, required this.load, required this.onWake, this.refresh = const Duration(minutes: 1)});

  final Future<Map<String, dynamic>> Function() load;
  final VoidCallback onWake;

  /// Null: load once (tests).
  final Duration? refresh;

  @override
  State<BoardScreensaver> createState() => _BoardScreensaverState();
}

class _BoardScreensaverState extends State<BoardScreensaver> {
  Map<String, dynamic>? _feed;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.refresh != null) _timer = Timer.periodic(widget.refresh!, (_) => _load());
  }

  Future<void> _load() async {
    try {
      final f = await widget.load();
      if (mounted) setState(() => _feed = f);
    } catch (_) {
      // Offline: keep the last feed on screen.
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = _feed;
    final current = f?['current'] as Map?;
    final next = f?['next'] as Map?;
    final notices = [for (final n in (f?['notices'] as List? ?? const [])) (n as Map).cast<String, dynamic>()];
    const fg = Colors.white;
    final t = Theme.of(context).textTheme;
    Widget period(String label, Map p) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text('$label · ${p['startsAt']}–${p['endsAt']} · ${p['subject']} · ${p['section']}', style: t.titleLarge?.copyWith(color: fg)),
    );
    return Semantics(
      button: true,
      label: f == null ? null : '${f['institution']} ${f['room']}',
      child: GestureDetector(
        key: const Key('screensaver'),
        behavior: HitTestBehavior.opaque,
        onTap: widget.onWake,
        child: ColoredBox(
          color: const Color(0xFF0E2A20),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: f == null
                  ? const SizedBox.expand()
                  : LayoutBuilder(
                      builder: (context, box) => SingleChildScrollView(
                        child: ConstrainedBox(
                          constraints: BoxConstraints(minHeight: box.maxHeight),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${f['time'] ?? ''}', style: t.displayLarge?.copyWith(color: fg)),
                              Text('${f['institution']} · ${f['room']}', style: t.headlineSmall?.copyWith(color: fg.withValues(alpha: 0.8))),
                              if (current != null) period(l.boardScreensaverNow, current) else Padding(padding: const EdgeInsets.only(top: 12), child: Text(l.boardScreensaverFree, style: t.titleLarge?.copyWith(color: fg))),
                              if (next != null) period(l.boardScreensaverNext, next),
                              if (notices.isNotEmpty) ...[
                                const SizedBox(height: 32),
                                Text(l.boardScreensaverNotices, style: t.titleMedium?.copyWith(color: fg.withValues(alpha: 0.8))),
                                for (final n in notices)
                                  Card(
                                    key: Key('notice-${n['id'] ?? n['title']}'),
                                    color: n['emergency'] == true || n['priority'] == 'emergency' ? Colors.red.shade800 : Colors.white.withValues(alpha: 0.1),
                                    child: ListTile(
                                      title: Text('${n['title']}', style: t.titleLarge?.copyWith(color: fg)),
                                      subtitle: (n['body'] ?? '') == '' ? null : Text('${n['body']}', style: const TextStyle(color: fg)),
                                    ),
                                  ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The open class's self-mark code, full screen for the class to scan with the Student App
/// (`POST /v1/classroom/attendance-qr`). It changes every `ttlSeconds`, so a photo sent to a friend at home is stale.
class BoardAttendanceCodeScreen extends StatefulWidget {
  const BoardAttendanceCodeScreen({super.key, required this.load, this.autoRefresh = true});

  final Future<Map<String, dynamic>> Function() load;

  /// False: load once (tests).
  final bool autoRefresh;

  @override
  State<BoardAttendanceCodeScreen> createState() => _BoardAttendanceCodeScreenState();
}

class _BoardAttendanceCodeScreenState extends State<BoardAttendanceCodeScreen> {
  Map<String, dynamic>? _code;
  bool _none = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _timer?.cancel();
    try {
      final c = await widget.load();
      if (!mounted) return;
      setState(() {
        _code = c;
        _none = false;
      });
      final ttl = (c['ttlSeconds'] as num?)?.toInt() ?? 30;
      if (widget.autoRefresh) _timer = Timer(Duration(seconds: ttl > 6 ? ttl - 5 : ttl), _load);
    } catch (_) {
      if (mounted) setState(() => _none = true);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = _code;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.boardAttendanceCodeTitle),
        leading: IconButton(icon: const Icon(Icons.close), tooltip: l.boardClose, onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: SafeArea(
        child: Center(
          child: _none
              ? Text(l.boardAttendanceCodeNone, key: const Key('no-class'), style: t.headlineSmall, textAlign: TextAlign.center)
              : c == null
              ? const CircularProgressIndicator()
              : LayoutBuilder(
                  builder: (context, box) {
                    final side = (box.biggest.shortestSide * 0.6).clamp(120.0, 600.0);
                    return SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${c['subject']} · ${c['section']}', style: t.headlineSmall, textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          ColoredBox(
                            color: Colors.white,
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: QrImageView(key: const Key('attendance-qr'), data: '${c['code']}', size: side, semanticsLabel: l.boardAttendanceCodeTitle),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text('${c['code']}', key: const Key('attendance-digits'), style: t.displayMedium?.copyWith(letterSpacing: 8, fontFeatures: const [FontFeature.tabularFigures()])),
                          const SizedBox(height: 8),
                          Text(l.boardAttendanceCodeHint, textAlign: TextAlign.center),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

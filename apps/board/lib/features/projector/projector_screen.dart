import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The projector screen's side of projector mode (projector_controller.dart): what the class
/// sees on the second display. It runs in its own Flutter engine, started by the platform with
/// [projectorMain], and gets the board's messages on the `kinetix/projector_feed` channel.
///
/// Messages are JSON:
///
/// | message | meaning |
/// |---|---|
/// | `{"t": "ev", "e": [...]}` | board events (kinetix_ink's lesson format), applied as they come |
/// | `{"t": "img", "k": "m3d" or "split", "d": base64 or null}` | the 3D model (JPEG) or the lab (PNG) open next to the board; null when closed |
/// | `{"t": "blank", "on": bool}` | a blank screen while the teacher prepares |
class ProjectorFeed extends ChangeNotifier {
  final player = LessonPlayer.live();

  /// The 3D model's latest picture, and the lab's.
  Uint8List? model3d;
  Uint8List? lab;
  bool blank = false;

  /// Got the board's first snapshot.
  bool get started => _started;
  bool _started = false;

  void apply(String raw) {
    final Map<String, dynamic> m;
    try {
      m = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    switch (m['t']) {
      case 'ev':
        final events = (m['e'] as List<dynamic>? ?? const []).cast<List<dynamic>>();
        player.applyLive(events);
        if (events.any((e) => e.length > 1 && e[1] == 'L')) _started = true;
      case 'img':
        final d = m['d'] as String?;
        final bytes = d == null ? null : base64Decode(d);
        if (m['k'] == 'm3d') {
          model3d = bytes;
        } else {
          lab = bytes;
        }
      case 'blank':
        blank = m['on'] as bool? ?? false;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    player.dispose();
    super.dispose();
  }
}

/// What the class sees: the board as the teacher's screen shows it (the same part of the
/// endless board, no tools or panels), with the 3D model or lab beside it when one is open.
class ProjectorView extends StatelessWidget {
  const ProjectorView({super.key, required this.feed});

  final ProjectorFeed feed;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: feed,
      builder: (context, _) {
        if (feed.blank) return const ColoredBox(key: Key('projector-blank'), color: Colors.black, child: SizedBox.expand());
        if (!feed.started) return const _Waiting();
        final side = feed.model3d ?? feed.lab;
        final board = LessonView(key: const Key('projector-board'), player: feed.player);
        if (side == null) return board;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: board),
            Expanded(
              child: ColoredBox(
                color: Colors.white,
                child: Image.memory(side, key: Key(feed.model3d != null ? 'projector-3d' : 'projector-lab'), fit: BoxFit.contain, gaplessPlayback: true),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Waiting extends StatelessWidget {
  const _Waiting();

  @override
  Widget build(BuildContext context) => const ColoredBox(
    key: Key('projector-waiting'),
    color: Colors.white,
    child: Center(
      child: Text('KINETIX', style: TextStyle(fontSize: 64, fontWeight: FontWeight.w700, letterSpacing: 8, color: Color(0xFF1B1F24))),
    ),
  );
}

/// The projector engine's app: [ProjectorView] fed from the `kinetix/projector_feed` channel.
/// It tells the board when it is ready, so the board sends a full snapshot.
class ProjectorApp extends StatefulWidget {
  const ProjectorApp({super.key, this.channel = const MethodChannel('kinetix/projector_feed')});

  final MethodChannel channel;

  @override
  State<ProjectorApp> createState() => _ProjectorAppState();
}

class _ProjectorAppState extends State<ProjectorApp> {
  final _feed = ProjectorFeed();

  @override
  void initState() {
    super.initState();
    widget.channel.setMethodCallHandler((call) async {
      if (call.method == 'frame' && call.arguments is String) _feed.apply(call.arguments as String);
      return null;
    });
    unawaited(widget.channel.invokeMethod<void>('ready').catchError((Object e) => debugPrint('Board not told: $e')));
  }

  @override
  void dispose() {
    widget.channel.setMethodCallHandler(null);
    _feed.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'KINETIX Projector',
    home: Scaffold(backgroundColor: Colors.white, body: ProjectorView(feed: _feed)),
  );
}

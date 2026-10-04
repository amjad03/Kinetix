import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../core/study.dart';
import '../../core/live.dart' show LiveErrors;
import 'live_controller.dart';

/// The teacher's board, live, full screen. Fits any screen (turn the phone sideways for a bigger
/// board), shows the page the teacher is on, and plays the teacher's class audio when the teacher
/// has the board's mic on (with a mute button); otherwise it says plainly there is no sound.
/// Survives a dropped connection and explains when the class stops.
class LiveClassScreen extends StatefulWidget {
  const LiveClassScreen({super.key, required this.study, required this.live});

  final StudyController study;
  final LiveClass live;

  static Future<void> open(BuildContext context, StudyController study, LiveClass live) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => LiveClassScreen(study: study, live: live),
      ),
    );
    // Back on Today: is the class still live?
    study.loadLive();
  }

  @override
  State<LiveClassScreen> createState() => _LiveClassScreenState();
}

class _LiveClassScreenState extends State<LiveClassScreen> {
  late final controller = LiveClassController(
    connector: widget.study.liveConnector,
    baseUrl: widget.study.api.baseUrl,
    token: widget.study.api.token ?? '',
    live: widget.live,
  )..start();

  /// The top and bottom bars; a tap on the board hides them for a clear view.
  bool _chrome = true;

  @override
  void initState() {
    super.initState();
    // The whole screen for the board; sideways works too.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    controller.dispose();
    super.dispose();
  }

  static const _surround = Color(0xFF1B1C1F);
  static const _onSurround = Colors.white;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: KinetixTheme.dark(),
      child: Scaffold(
        backgroundColor: _surround,
        body: ListenableBuilder(
          listenable: Listenable.merge([controller, controller.player]),
          builder: (context, _) {
            final phase = controller.phase;
            final showBoard = phase == LivePhase.live || phase == LivePhase.reconnecting || controller.player.strokes.isNotEmpty;
            final chrome = _chrome || phase != LivePhase.live;
            return Stack(
              children: [
                Positioned.fill(
                  child: GestureDetector(
                    key: const Key('liveBoard'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _chrome = !_chrome),
                    child: SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(Kx.s8),
                        child: Center(
                          child: AnimatedOpacity(
                            opacity: showBoard ? 1 : 0.15,
                            duration: const Duration(milliseconds: 200),
                            child: ClipRRect(
                              borderRadius: Kx.radiusSm,
                              child: LessonView(player: controller.player),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (chrome) ...[
                  Positioned(top: 0, left: 0, right: 0, child: _TopBar(controller: controller)),
                  Positioned(bottom: 0, left: 0, right: 0, child: _BottomBar(controller: controller)),
                ],
                if (phase == LivePhase.reconnecting)
                  const Positioned(
                    top: 72,
                    left: Kx.s16,
                    right: Kx.s16,
                    child: SafeArea(child: Center(child: _Reconnecting())),
                  ),
                if (phase == LivePhase.connecting || phase == LivePhase.joining)
                  Center(
                    child: Column(
                      key: const Key('liveJoining'),
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(color: _onSurround),
                        const SizedBox(height: Kx.s16),
                        Text(
                          phase == LivePhase.connecting ? context.l10n.joiningClass : context.l10n.waitingForBoard,
                          style: context.text.titleMedium?.copyWith(color: _onSurround),
                        ),
                      ],
                    ),
                  ),
                // Clear of the top and bottom bars, so Leave stays reachable when the card is tall
                // (small phones, larger text, longer words).
                if (phase == LivePhase.ended || phase == LivePhase.failed)
                  Positioned.fill(
                    child: SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: Kx.target + Kx.s8),
                        child: Center(child: _EndedCard(controller: controller)),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.controller});

  final LiveClassController controller;

  @override
  Widget build(BuildContext context) {
    final live = controller.phase == LivePhase.live || controller.phase == LivePhase.reconnecting;
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xCC000000), Color(0x00000000)]),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s4, Kx.s16, Kx.s16),
          child: Row(
            children: [
              IconButton(
                key: const Key('leaveLive'),
                tooltip: context.l10n.leave,
                color: Colors.white,
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const BackButtonIcon(),
              ),
              const SizedBox(width: Kx.s4),
              if (live) ...[const LivePill(), const SizedBox(width: Kx.s12)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      controller.subject ?? context.l10n.liveClass,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleMedium?.copyWith(color: Colors.white),
                    ),
                    Text(
                      controller.teacher,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(color: Colors.white70),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.controller});

  final LiveClassController controller;

  @override
  Widget build(BuildContext context) {
    final p = controller.player;
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Color(0xCC000000), Color(0x00000000)]),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s12),
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              ..._audio(context),
              if (controller.phase == LivePhase.live || controller.phase == LivePhase.reconnecting)
                _DarkChip(icon: Icons.description_outlined, label: context.l10n.pageOf(p.pageIndex + 1, p.pageCount), key: const Key('livePage')),
            ],
          ),
        ),
      ),
    );
  }

  /// The teacher's mic: a mute button and "mic is on" while the class can be heard; quiet
  /// notes otherwise.
  List<Widget> _audio(BuildContext context) {
    final l = context.l10n;
    if (!controller.audioAllowed) {
      return [_DarkChip(icon: Icons.volume_off_outlined, label: l.boardOnlyNoSound, key: const Key('liveNoSound'))];
    }
    if (!controller.audioOn || controller.phase == LivePhase.ended || controller.phase == LivePhase.failed) {
      return [_DarkChip(icon: Icons.mic_off_outlined, label: l.teacherMicOff, key: const Key('liveMicOff'))];
    }
    final muted = controller.muted;
    return [
      Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Material(
            color: const Color(0x99000000),
            shape: const CircleBorder(),
            child: IconButton(
              key: const Key('liveMute'),
              tooltip: muted ? l.unmuteClass : l.muteClass,
              color: Colors.white,
              onPressed: controller.toggleMute,
              icon: Icon(muted ? Icons.volume_off : Icons.volume_up),
            ),
          ),
          const SizedBox(width: Kx.s8),
          Flexible(
            child: _DarkChip(icon: Icons.mic, label: l.teacherMicOn, key: const Key('liveMicOn')),
          ),
        ],
      ),
    ];
  }
}

class _DarkChip extends StatelessWidget {
  const _DarkChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: 6),
    decoration: BoxDecoration(color: const Color(0x99000000), borderRadius: Kx.radiusXl),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: Colors.white70),
        const SizedBox(width: Kx.s8),
        Flexible(
          child: Text(label, style: context.text.labelLarge?.copyWith(color: Colors.white)),
        ),
      ],
    ),
  );
}

/// "● LIVE" in the fixed live colour.
class LivePill extends StatelessWidget {
  const LivePill({super.key});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 3),
    decoration: BoxDecoration(color: Kx.live, borderRadius: Kx.radiusSm),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          context.l10n.liveBadge,
          style: context.text.labelMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 0.8),
        ),
      ],
    ),
  );
}

class _Reconnecting extends StatelessWidget {
  const _Reconnecting();

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('liveReconnecting'),
    padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
    decoration: BoxDecoration(color: const Color(0xE6000000), borderRadius: Kx.radiusXl),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
        const SizedBox(width: Kx.s12),
        Flexible(
          child: Text(context.l10n.reconnecting, style: context.text.bodyMedium?.copyWith(color: Colors.white)),
        ),
      ],
    ),
  );
}

class _EndedCard extends StatelessWidget {
  const _EndedCard({required this.controller});

  final LiveClassController controller;

  /// (icon, title, message, can try again)
  static (IconData, String, String, bool) describe(AppLocalizations l, LiveClassController c) {
    if (c.phase == LivePhase.failed) {
      return (Icons.error_outline, l.couldNotJoin, c.error == null ? l.tryInAMoment : liveErrorText(l, c.error!), true);
    }
    return switch (c.endedReason) {
      'live_off' => (Icons.cast_connected_outlined, l.liveOffTitle, l.liveOffBody(l.today), false),
      'offline' => (Icons.wifi_off_outlined, l.boardOfflineTitle, l.boardOfflineBody, true),
      _ => (Icons.check_circle_outline, l.classEndedTitle, l.classEndedBody(l.today), false),
    };
  }

  /// The app's own live-class problems in the app's language; anything the server said, as sent.
  static String liveErrorText(AppLocalizations l, String message) => switch (message) {
    LiveErrors.signInAgain => l.liveSignInAgain,
    LiveErrors.notConnected => l.liveNotConnected,
    LiveErrors.timeout => l.liveTimeout,
    LiveErrors.couldNotJoin => l.liveCouldNotJoin,
    _ => message,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (icon, title, message, canRetry) = describe(context.l10n, controller);
    return SingleChildScrollView(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Card(
          key: const Key('liveEnded'),
          margin: const EdgeInsets.all(Kx.s24),
          child: Padding(
            padding: const EdgeInsets.all(Kx.s24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 40, color: c.primary),
                const SizedBox(height: Kx.s12),
                Text(title, textAlign: TextAlign.center, style: context.text.titleLarge),
                const SizedBox(height: Kx.s8),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                ),
                const SizedBox(height: Kx.s24),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: Kx.s8,
                  runSpacing: Kx.s8,
                  children: [
                    if (canRetry) FilledButton(key: const Key('liveRetry'), onPressed: controller.retry, child: Text(context.l10n.tryAgain)),
                    OutlinedButton(onPressed: () => Navigator.of(context).maybePop(), child: Text(context.l10n.backToToday(context.l10n.today))),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Today's "Live now" banner: the class is being taught live; tap to watch the board.
class LiveNowBanner extends StatelessWidget {
  const LiveNowBanner({super.key, required this.live, required this.onWatch});

  final LiveClass live;
  final VoidCallback onWatch;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      key: const Key('liveBanner'),
      color: c.inverseSurface,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onWatch,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(color: Kx.live, shape: BoxShape.circle),
                child: const Icon(Icons.cast_for_education, color: Colors.white),
              ),
              const SizedBox(width: Kx.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const LivePill(),
                    const SizedBox(height: Kx.s4),
                    Text(
                      context.l10n.liveNow(live.subject ?? context.l10n.classFallback),
                      style: context.text.titleMedium?.copyWith(color: c.onInverseSurface, fontWeight: FontWeight.w500),
                    ),
                    Text(
                      context.l10n.teacherTeaching(live.teacher),
                      style: context.text.bodyMedium?.copyWith(color: c.onInverseSurface.withValues(alpha: 0.8)),
                    ),
                    const SizedBox(height: Kx.s12),
                    FilledButton.icon(
                      key: const Key('watchLive'),
                      style: FilledButton.styleFrom(backgroundColor: Kx.live, foregroundColor: Colors.white),
                      onPressed: onWatch,
                      icon: const Icon(Icons.play_arrow_rounded),
                      label: Text(context.l10n.watch),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

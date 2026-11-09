import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../l10n/ce_strings.dart';
import '../ui/ce_style.dart';

/// What the board says about starting up (android/…/BoardStartup.kt).
class StartupStatus {
  const StartupStatus({this.openOnBoot = false, this.needsOverlay = false, this.canOverlay = true, this.isHome = false, this.homeEntry = false});

  factory StartupStatus.fromMap(Map<Object?, Object?> m) => StartupStatus(
    openOnBoot: m['openOnBoot'] == true,
    needsOverlay: m['needsOverlay'] == true,
    canOverlay: m['canOverlay'] != false,
    isHome: m['isHome'] == true,
    homeEntry: m['homeEntry'] == true,
  );

  /// "Open Zynetix when the board starts" is on.
  final bool openOnBoot;

  /// Android 10 and later: an app may open itself after a restart only with "Display over other apps".
  final bool needsOverlay;
  final bool canOverlay;

  /// Zynetix is the board's home app.
  final bool isHome;

  /// Zynetix offers itself as a home app.
  final bool homeEntry;

  /// Whether the switch can work as things are.
  bool get bootWorks => isHome || !needsOverlay || canOverlay;
}

/// The `zynetix/startup` channel; tests use [FakeBoardStartup].
abstract class BoardStartup {
  static BoardStartup instance = AndroidBoardStartup();

  /// Null where there is no such thing (not Android).
  Future<StartupStatus?> status();
  Future<void> setOpenOnBoot(bool on);
  Future<void> openOverlaySettings();
  Future<void> homeApp(bool on);
}

class AndroidBoardStartup extends BoardStartup {
  AndroidBoardStartup({MethodChannel? channel}) : _channel = channel ?? const MethodChannel('zynetix/startup');
  final MethodChannel _channel;
  bool get _android => !kIsWeb && Platform.isAndroid;

  @override
  Future<StartupStatus?> status() async {
    if (!_android) return null;
    final m = await _channel.invokeMapMethod<Object?, Object?>('status');
    return m == null ? null : StartupStatus.fromMap(m);
  }

  @override
  Future<void> setOpenOnBoot(bool on) => _channel.invokeMethod<void>('setOpenOnBoot', {'on': on});
  @override
  Future<void> openOverlaySettings() => _channel.invokeMethod<void>('openOverlaySettings');
  @override
  Future<void> homeApp(bool on) => _channel.invokeMethod<void>('homeApp', {'on': on});
}

class FakeBoardStartup extends BoardStartup {
  FakeBoardStartup([this.state = const StartupStatus(needsOverlay: true, canOverlay: false)]);
  StartupStatus? state;
  final calls = <String>[];

  @override
  Future<StartupStatus?> status() async => state;
  @override
  Future<void> setOpenOnBoot(bool on) async {
    calls.add('openOnBoot:$on');
    final s = state!;
    state = StartupStatus(openOnBoot: on, needsOverlay: s.needsOverlay, canOverlay: s.canOverlay, isHome: s.isHome, homeEntry: s.homeEntry);
  }

  @override
  Future<void> openOverlaySettings() async => calls.add('overlay');
  @override
  Future<void> homeApp(bool on) async => calls.add('home:$on');
}

/// Settings → This board → When the board starts: "Open Zynetix when the board starts" (no
/// device owner needed) and "Make Zynetix the home app". docs/hardware/kiosk-mode.md has the
/// limits of panels.
class StartupSection extends StatefulWidget {
  const StartupSection({super.key, this.startup});
  final BoardStartup? startup;

  @override
  State<StartupSection> createState() => _StartupSectionState();
}

class _StartupSectionState extends State<StartupSection> with WidgetsBindingObserver {
  BoardStartup get startup => widget.startup ?? BoardStartup.instance;
  StartupStatus? _status;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from Android's settings: read again (the teacher may have allowed it there).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    StartupStatus? s;
    try {
      s = await startup.status();
    } catch (_) {}
    if (mounted) {
      setState(() {
        _status = s;
        _loaded = true;
      });
    }
  }

  Future<void> _setOpenOnBoot(bool on) async {
    await startup.setOpenOnBoot(on);
    await _refresh();
    final s = _status;
    if (on && s != null && !s.bootWorks && mounted) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          key: const Key('ce-boot-overlay'),
          title: Text(ctx.ce('One more permission'), style: ceHeading(22)),
          content: Text(
            ctx.ce('Android 10 and later let an app open by itself after a restart only when it may “Display over other apps”. Turn it on for Zynetix Classroom on the next screen, then come back.'),
            style: ceText(16),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.ce('Not now'))),
            FilledButton(key: const Key('ce-boot-overlay-open'), style: ceBigButton(), onPressed: () => Navigator.of(ctx).pop(true), child: Text(ctx.ce('Open the setting'))),
          ],
        ),
      );
      if (go == true) await startup.openOverlaySettings();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(context.ce('When the board starts'), style: ceHeading(20)),
        const SizedBox(height: Kx.s8),
        if (_loaded && s == null)
          Text(context.ce('Only on Android boards.'), style: ceText(16))
        else ...[
          SwitchListTile(
            key: const Key('ce-open-on-boot'),
            contentPadding: EdgeInsets.zero,
            value: s?.openOnBoot ?? false,
            onChanged: s == null ? null : (v) => unawaited(_setOpenOnBoot(v)),
            title: Text(context.ce('Open Zynetix when the board starts'), style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
            subtitle: Text(context.ce('After a restart or a power cut the board opens Zynetix Classroom by itself. No kiosk mode or device owner needed.'), style: ceText(15)),
          ),
          if (s != null && s.openOnBoot && !s.bootWorks) ...[
            const SizedBox(height: Kx.s8),
            Row(
              children: [
                const Icon(Icons.warning_amber_outlined, color: CeC.warning),
                const SizedBox(width: Kx.s8),
                Expanded(child: Text(context.ce('Android needs “Display over other apps” for this, or Zynetix as the home app.'), key: const Key('ce-boot-needs-overlay'), style: ceText(15, c: CeC.warningText))),
                const SizedBox(width: Kx.s8),
                OutlinedButton(style: ceSoftButton(), onPressed: () => unawaited(startup.openOverlaySettings()), child: Text(context.ce('Open the setting'))),
              ],
            ),
          ],
          const SizedBox(height: Kx.s16),
          Text(
            s?.isHome == true
                ? context.ce('Zynetix is this board’s home app: the Home button and every start open it.')
                : context.ce('Make Zynetix the home app and the Home button and every start open it, on any panel. Choose the panel’s own launcher there again to undo it.'),
            key: const Key('ce-home-line'),
            style: ceText(15),
          ),
          const SizedBox(height: Kx.s12),
          Wrap(
            spacing: Kx.s12,
            runSpacing: Kx.s12,
            children: [
              OutlinedButton.icon(
                key: const Key('ce-make-home'),
                style: ceSoftButton(),
                onPressed: s == null ? null : () => unawaited(startup.homeApp(true)),
                icon: const Icon(Icons.home_outlined),
                label: Text(context.ce('Make Zynetix the home app')),
              ),
              if (s?.homeEntry == true)
                TextButton(key: const Key('ce-unmake-home'), onPressed: () => unawaited(startup.homeApp(false).then((_) => _refresh())), child: Text(context.ce('Stop offering Zynetix as a home app'))),
            ],
          ),
          const SizedBox(height: Kx.s8),
          Text(context.ce('Some panels stop apps from starting by themselves (an “auto-start” or “boot manager” setting): allow Zynetix Classroom there too.'), style: ceText(14)),
        ],
      ],
    );
  }
}

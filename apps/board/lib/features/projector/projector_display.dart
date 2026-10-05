import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// A second screen the board can show the class on: a projector or TV on HDMI, USB-C or
/// wireless display, or a Windows PC's second monitor.
@immutable
class ExternalDisplay {
  const ExternalDisplay({required this.id, required this.name, this.width = 0, this.height = 0});

  factory ExternalDisplay.fromMap(Map<Object?, Object?> m) => ExternalDisplay(
    id: '${m['id']}',
    name: m['name'] as String? ?? '',
    width: (m['width'] as num?)?.toInt() ?? 0,
    height: (m['height'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final int width;
  final int height;

  @override
  bool operator ==(Object other) => other is ExternalDisplay && other.id == id && other.name == name;

  @override
  int get hashCode => Object.hash(id, name);
}

/// The platform side of projector mode: finds second displays, opens the projector screen on
/// one (a second Flutter engine running [projectorMain]) and carries messages to it.
///
/// * Android: an Android `Presentation` on the external display (MainActivity's `Projector.kt`).
/// * Windows: a borderless window covering the second monitor (runner/projector_window.cpp).
///
/// Both answer the `kinetix/projector` channel; the projector engine listens on
/// `kinetix/projector_feed` (projector_screen.dart). Tests use a fake.
abstract class ProjectorDisplay {
  /// Second displays attached now.
  Future<List<ExternalDisplay>> displays();

  /// Fires when a display is attached or removed.
  Stream<void> get changes;

  /// Opens the projector screen on [d]. False when the platform refused.
  Future<bool> show(ExternalDisplay d);

  Future<void> hide();

  /// A JSON message for the projector screen (see ProjectorFeed).
  Future<void> send(String message);

  /// Fires when the projector screen has started (or restarted) and needs everything.
  Stream<void> get ready;
}

/// [ProjectorDisplay] over the `kinetix/projector` method channel.
class MethodChannelProjectorDisplay implements ProjectorDisplay {
  MethodChannelProjectorDisplay([MethodChannel? channel]) : _channel = channel ?? const MethodChannel('kinetix/projector');

  final MethodChannel _channel;
  late final _changes = StreamController<void>.broadcast(onListen: _listen);
  late final _ready = StreamController<void>.broadcast(onListen: _listen);
  bool _listening = false;

  /// The platform's calls: a display attached or removed, the projector screen started.
  void _listen() {
    if (_listening) return;
    _listening = true;
    try {
      _channel.setMethodCallHandler((call) async {
        switch (call.method) {
          case 'displaysChanged':
            _changes.add(null);
          case 'ready':
            _ready.add(null);
        }
        return null;
      });
    } catch (e) {
      // No engine binding (a unit test): nothing will call.
      debugPrint('Projector channel not listened to: $e');
    }
  }

  @override
  Future<List<ExternalDisplay>> displays() async {
    try {
      final list = await _channel.invokeListMethod<Object?>('displays') ?? const [];
      return [for (final d in list) ExternalDisplay.fromMap(d as Map<Object?, Object?>)];
    } on MissingPluginException {
      return const []; // Linux, tests: no projector support
    } catch (e) {
      debugPrint('Displays not listed: $e');
      return const [];
    }
  }

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Stream<void> get ready => _ready.stream;

  @override
  Future<bool> show(ExternalDisplay d) async {
    try {
      return await _channel.invokeMethod<bool>('show', {'id': d.id}) ?? false;
    } on MissingPluginException {
      return false;
    } catch (e) {
      debugPrint('Projector not shown: $e');
      return false;
    }
  }

  @override
  Future<void> hide() async {
    try {
      await _channel.invokeMethod<void>('hide');
    } on MissingPluginException {
      // nothing to hide
    } catch (e) {
      debugPrint('Projector not hidden: $e');
    }
  }

  @override
  Future<void> send(String message) async {
    try {
      await _channel.invokeMethod<void>('send', message);
    } on MissingPluginException {
      // no projector
    } catch (e) {
      debugPrint('Projector frame dropped: $e');
    }
  }
}

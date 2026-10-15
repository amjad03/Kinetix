import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/core/cast/cast_controller.dart';
import 'package:zynetix_board/core/cast/cast_receiver.dart';

// The sender of a teacher's own screen sends its offer the moment it is approved, which can
// reach the board before WebRTC has finished starting. Those messages must be replayed, in order.

class SlowReceiver implements CastReceiver {
  final gate = Completer<void>();
  final handled = <String>[];
  void Function(Map<String, dynamic>)? send;

  @override
  Future<void> start(List<Map<String, dynamic>> iceServers, {required void Function(Map<String, dynamic>) sendSignal, required void Function(bool live) onLive}) async {
    send = sendSignal;
    await gate.future;
  }

  @override
  Future<void> handleSignal(Map<String, dynamic> data) async {
    handled.add(data['type'] as String);
    if (data['type'] == 'offer') send?.call({'type': 'answer', 'sdp': 'a'});
  }

  @override
  Widget view() => const SizedBox();
  @override
  Future<Uint8List?> snapshot() async => null;
  @override
  final ValueNotifier<Size?> frameSize = ValueNotifier(null);
  @override
  Future<void> close() async {}
}

void main() {
  test('an offer and candidates that arrive while WebRTC starts are answered once it is ready', () async {
    final sent = <Object>[];
    final r = SlowReceiver();
    final cast = CastController(emit: (e, d) => sent.add(d), request: (e, d) async => {'ok': true}, receiverFactory: () => r);
    final ice = cast.onIce({'castId': 'c1', 'name': 'Meena', 'role': 'teacher', 'iceServers': []});
    await cast.onSignal({'castId': 'c1', 'data': {'type': 'offer', 'sdp': 'v=0'}});
    await cast.onSignal({'castId': 'c1', 'data': {'type': 'candidate', 'candidate': 'x'}});
    expect(r.handled, isEmpty);
    r.gate.complete();
    await ice;
    expect(r.handled, ['offer', 'candidate']);
    expect(sent.single, {'castId': 'c1', 'data': {'type': 'answer', 'sdp': 'a'}});
    await cast.onSignal({'castId': 'c1', 'data': {'type': 'candidate', 'candidate': 'y'}});
    expect(r.handled, ['offer', 'candidate', 'candidate']);
  });

  test('an offer that overtakes cast.ice is kept for the cast it belongs to', () async {
    final r = SlowReceiver()..gate.complete();
    final cast = CastController(emit: (e, d) {}, request: (e, d) async => {'ok': true}, receiverFactory: () => r);
    await cast.onSignal({'castId': 'c2', 'data': {'type': 'offer', 'sdp': 'v=0'}});
    await cast.onIce({'castId': 'c2', 'name': 'Meena', 'role': 'teacher', 'iceServers': []});
    expect(r.handled, ['offer']);
    expect(cast.tile('c2')!.ready, isTrue);
  });

  test('signals for a cast that ended before it started are forgotten', () async {
    final cast = CastController(emit: (e, d) {}, request: (e, d) async => {'ok': true}, receiverFactory: () => SlowReceiver()..gate.complete());
    await cast.onSignal({'castId': 'gone', 'data': {'type': 'offer', 'sdp': 'v=0'}});
    cast.onEnded({'castId': 'gone'});
    await cast.onIce({'castId': 'gone', 'name': 'x', 'role': 'student', 'iceServers': []});
    expect(cast.tile('gone')!.ready, isTrue);
    expect((cast.tile('gone')!.receiver as SlowReceiver).handled, isEmpty);
  });
}

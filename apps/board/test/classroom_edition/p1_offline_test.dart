import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/features/sim_hub/native/map_sims.dart';

/// The Classroom edition fetches nothing from the internet (P1 item 15), and its docs name its
/// own package id.
void main() {
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  Future<void> pumpMap(WidgetTester tester) async {
    tester.view
      ..physicalSize = const Size(1600, 900)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: MapLab())));
    await tester.pump();
  }

  testWidgets('the map lab loads no internet tiles in the Classroom edition', (tester) async {
    Edition.classroom = true;
    await pumpMap(tester);
    expect(find.byType(TileLayer), findsNothing);
    expect(find.byKey(const Key('map-offline')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the KINETIX Board still shows its map tiles (the check works)', (tester) async {
    Edition.classroom = false;
    await pumpMap(tester);
    expect(find.byType(TileLayer), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  test('kiosk docs and the manifests name in.zynetix.classroom for the Classroom edition', () {
    final kiosk = File('../../docs/hardware/kiosk-mode.md').readAsStringSync();
    expect(kiosk, contains('in.zynetix.classroom/app.kinetix.board.KioskAdminReceiver'));
    expect(File('android/app/src/main/AndroidManifest.xml').readAsStringSync(), contains('in.zynetix.classroom/app.kinetix.board.KioskAdminReceiver'));
    expect(File('android/app/src/classroom/AndroidManifest.xml').readAsStringSync(), contains('in.zynetix.classroom'));
  });
}

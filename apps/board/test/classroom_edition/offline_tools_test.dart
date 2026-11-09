import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mlkit_digital_ink_recognition/google_mlkit_digital_ink_recognition.dart' as mlkit;
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/core/handwriting/mlkit_handwriting.dart';
import 'package:kinetix_board/features/board/panel/split_panel.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show HandwritingModelState;

import '../support/board_fonts.dart';
import 'ce_support.dart';

class _Models extends mlkit.DigitalInkRecognizerModelManager {
  int downloads = 0;
  @override
  Future<bool> isModelDownloaded(String model) async => false;
  @override
  Future<bool> downloadModel(String model, {bool isWifiRequired = true}) async {
    downloads++;
    return true;
  }
}

/// The Classroom edition has no camera and no online tools: no Camera, Videos (YouTube), Web or
/// Cast tab or tool, no 3D or handwriting downloads, and its Android build asks for no camera,
/// microphone or speech recognition.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    ModelCatalogue.downloads = true;
    MlKitHandwriting.downloadsAllowed = () => true;
  });

  test('the panel hides Camera, Videos, Web and Cast in the Classroom edition only', () {
    const online = [PanelTab.videos, PanelTab.camera, PanelTab.web, PanelTab.cast];
    Edition.classroom = false;
    expect(Edition.onlineTools, isTrue);
    expect([for (final t in online) t.shown], everyElement(isTrue));
    Edition.classroom = true;
    expect(Edition.onlineTools, isFalse);
    expect([for (final t in online) t.shown], everyElement(isFalse));
    expect(PanelTab.model3d.shown && PanelTab.sims.shown && PanelTab.labs.shown, isTrue, reason: 'the offline tabs stay');
  });

  test('no 3D downloads: only bundled models (and ones downloaded before) are listed', () {
    final all = ModelCatalogue.entries;
    expect(all.where((e) => e.remote != null), isNotEmpty);
    ModelCatalogue.downloads = false;
    final offline = ModelCatalogue.entries;
    expect(offline.where((e) => e.remote != null), isEmpty);
    expect(offline.length, all.where((e) => e.remote == null).length);
  });

  test('handwriting models: never downloaded in the Classroom edition, and never tried offline', () async {
    final models = _Models();
    final hw = MlKitHandwriting(manager: models);
    MlKitHandwriting.downloadsAllowed = () => false;
    expect(await hw.modelStateOf('en-US'), HandwritingModelState.unsupported, reason: 'shown as not available, not as a download');
    expect(await hw.downloadModel('en-US'), isFalse);
    expect(models.downloads, 0);

    MlKitHandwriting.downloadsAllowed = () => true;
    final keep = MlKitHandwriting.online;
    addTearDown(() => MlKitHandwriting.online = keep);
    MlKitHandwriting.online = () async => false;
    expect(await hw.modelStateOf('en-US'), HandwritingModelState.needsDownload);
    expect(await hw.downloadModel('en-US'), isFalse);
    expect(hw.lastDownloadOffline, isTrue);
    expect(models.downloads, 0, reason: 'offline: not started, so no error from ML Kit');
    MlKitHandwriting.online = () async => true;
    expect(await hw.downloadModel('en-US'), isTrue);
    expect(models.downloads, 1);
  });

  test('Android: the Classroom build removes the camera, microphone and speech recognition', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    expect(gradle, contains('if (classroomEdition) {\n            variant.sources.manifests.addStaticManifestFile(layout.projectDirectory.file("src/classroom/AndroidManifest.xml")'));
    final overlay = File('android/app/src/classroom/AndroidManifest.xml').readAsStringSync().replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '');
    for (final removed in ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.hardware.camera', 'android.hardware.camera.any']) {
      expect(overlay, contains('android:name="$removed" tools:node="remove"'), reason: removed);
    }
    expect(overlay, contains('<intent tools:node="remove">\n            <action android:name="android.speech.RecognitionService"/>'));
    // Read aloud (Lessons) uses the board's own text-to-speech voices, offline: kept.
    expect(overlay, isNot(contains('TTS_SERVICE')));
    final main = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(main, contains('android.permission.CAMERA'), reason: 'the KINETIX Board keeps its camera');
  });

  testWidgets('a local class has no Camera, Videos, Web or Cast anywhere on the board', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    await tapKey(tester, 'ce-lessons');
    for (final t in ['videos', 'camera', 'web', 'cast']) {
      expect(find.byKey(Key('panel-tab-$t')), findsNothing, reason: t);
    }
    expect(find.byKey(const Key('panel-tab-model3d')), findsOneWidget);
    await tapKey(tester, 'ce-show-all');
    await tapKey(tester, 'tool-tools');
    if (find.byKey(const Key('drawer-show-all')).evaluate().isNotEmpty) await tapKey(tester, 'drawer-show-all');
    expect(find.byKey(const Key('drawer-ruler')).evaluate().isNotEmpty || find.byKey(const Key('drawer-laser')).evaluate().isNotEmpty, isTrue, reason: 'the drawer is open');
    for (final id in ['doc-camera', 'safe-web', 'concept-videos', 'insert-camera']) {
      expect(find.byKey(Key('drawer-$id')), findsNothing, reason: id);
    }
    await closeBoard(tester, board);
  });
}

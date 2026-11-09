// Zynetix Classroom's Android set-up: SDK levels, Android backup, and the permissions it asks
// for (the APK itself is checked with `aapt2 dump permissions` at release, README.md).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

final _usesPermission = RegExp(r'<uses-permission\s+android:name="android\.permission\.([A-Z_]+)"([^>]*)>');

Map<String, String> _permissions(String manifest) => {for (final m in _usesPermission.allMatches(manifest)) m.group(1)!: m.group(2)!};

void main() {
  final gradle = File('android/app/build.gradle.kts').readAsStringSync();
  final main = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
  final classroom = File('android/app/src/classroom/AndroidManifest.xml').readAsStringSync();

  test('Android 9 (API 28) at least, and a pinned target', () {
    expect(gradle, contains('minSdk = if (classroomEdition) 28 else flutter.minSdkVersion'));
    expect(gradle, contains('targetSdk = if (classroomEdition) 36 else flutter.targetSdkVersion'));
  });

  test('no Android cloud backup: the settings hold the school PIN hash', () {
    expect(classroom, contains('android:allowBackup="false"'));
    expect(classroom, contains('android:dataExtractionRules="@xml/classroom_data_extraction_rules"'));
    final rules = File('android/app/src/main/res/xml/classroom_data_extraction_rules.xml').readAsStringSync();
    final cloud = rules.substring(rules.indexOf('<cloud-backup>'), rules.indexOf('</cloud-backup>'));
    for (final domain in ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect(cloud, contains('<exclude domain="$domain" path="."/>'), reason: domain);
    }
    final transfer = rules.substring(rules.indexOf('<device-transfer>'), rules.indexOf('</device-transfer>'));
    expect(transfer, contains('FlutterSecureStorage.xml'), reason: 'keystore-bound, useless on another board');
    // The KINETIX Board keeps Android's defaults.
    expect(main, isNot(contains('allowBackup')));
  });

  test('the permissions: only what the edition uses', () {
    final board = _permissions(main);
    final added = _permissions(classroom);
    final removed = {for (final e in added.entries) if (e.value.contains('tools:node="remove"')) e.key};
    final asked = {...board.keys, ...added.keys}.difference(removed);
    expect(removed, {'CAMERA', 'RECORD_AUDIO'});
    expect(asked, {
      'INTERNET', // updates, and concept videos when online
      'RECEIVE_BOOT_COMPLETED', // kiosk mode and "Open Zynetix when the board starts"
      'WRITE_EXTERNAL_STORAGE', // Documents/Zynetix on Android 9 only (maxSdkVersion 28)
      'REQUEST_INSTALL_PACKAGES', // Check for update / Install from USB
      'SYSTEM_ALERT_WINDOW', // opening after a restart on Android 10+
    });
    expect(board['WRITE_EXTERNAL_STORAGE'], contains('android:maxSdkVersion="28"'));
    // The plugins that would bring camera, microphone and network-heavy code are not in the APK.
    for (final p in ['camera_android_camerax', 'flutter_webrtc', 'speech_to_text', 'google_mlkit_digital_ink_recognition', 'google_mlkit_commons']) {
      expect(gradle, contains('"$p"'), reason: p);
    }
  });
}

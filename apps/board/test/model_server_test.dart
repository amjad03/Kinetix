import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_3d/zynetix_3d.dart' show RemoteModels;
import 'package:zynetix_board/features/board/model_server.dart';
import 'package:zynetix_board/features/board/profile_menu.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// 3D models download from this board's own server, then the institution's (the API's board
/// config), then the ZYNETIX API's /assets/models, then GitHub.
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    ModelServer.reset();
  });
  tearDown(ModelServer.reset);

  test('the board server is used first by default, the institution and the board setting come before it', () async {
    final board = await enrolledBoard();
    await ModelServer.attach(board);
    expect(RemoteModels.servers, ['http://test/assets/models']);
    final m = RemoteModels.byId('saturn_v')!;
    expect(m.urls, ['http://test/assets/models/saturn_v.glb', m.url]);
    expect(m.url, startsWith(RemoteModels.defaultBase), reason: 'GitHub stays the last resort');

    ModelServer.applyConfig({'modelsBase': 'http://10.0.0.5/models/'});
    expect(RemoteModels.servers, ['http://10.0.0.5/models', 'http://test/assets/models']);
    expect(await ModelServer.setOwn(' https://lab.school.in/3d '), isTrue);
    expect(RemoteModels.servers, ['https://lab.school.in/3d', 'http://10.0.0.5/models', 'http://test/assets/models']);

    // Not an address: refused, nothing changes. Empty: back to the defaults.
    expect(await ModelServer.setOwn('models on the pen drive'), isFalse);
    expect(RemoteModels.servers.first, 'https://lab.school.in/3d');
    expect(await ModelServer.setOwn(''), isTrue);
    ModelServer.applyConfig({'modelsBase': null});
    expect(RemoteModels.servers, ['http://test/assets/models']);
  });

  test('the settings survive a restart (offline too)', () async {
    final board = await enrolledBoard();
    await ModelServer.attach(board);
    ModelServer.applyConfig({'modelsBase': 'http://10.0.0.5/models'});
    await ModelServer.setOwn('https://lab.school.in/3d');
    await Future<void>.delayed(Duration.zero);
    ModelServer.reset();
    await ModelServer.attach(board);
    expect(RemoteModels.servers, ['https://lab.school.in/3d', 'http://10.0.0.5/models', 'http://test/assets/models']);
  });

  testWidgets('Board settings: type a school server, save, see the order the board tries', (tester) async {
    screenSize(tester, const Size(1280, 1600));
    final board = await enrolledBoard();
    await tester.runAsync(() => ModelServer.attach(board));
    await tester.pumpWidget(localized('en', Scaffold(body: BoardSettingsDialog(board: board, initialQuery: '3D model'))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('model-server')), findsOneWidget);
    expect(find.text('1. ZYNETIX server: http://test/assets/models'), findsOneWidget);
    expect(find.text('2. GitHub (always last): https://github.com/amjad03/Kinetix'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('model-server-field')), 'ftp://wrong');
    await tester.tap(find.byKey(const Key('model-server-save')));
    await tester.pumpAndSettle();
    expect(find.text('Enter an address that starts with http:// or https://'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('model-server-field')), 'http://10.0.0.9/models');
    await tester.tap(find.byKey(const Key('model-server-save')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('model-server-note')), findsOneWidget);
    expect(find.text('1. This board: http://10.0.0.9/models'), findsOneWidget);
    expect(RemoteModels.servers.first, 'http://10.0.0.9/models');
    expect((await SharedPreferences.getInstance()).getString('zynetix.models.base'), 'http://10.0.0.9/models');

    await tester.tap(find.byKey(const Key('model-server-clear')));
    await tester.pumpAndSettle();
    expect(RemoteModels.servers, ['http://test/assets/models']);
  });

  testWidgets('the section is in Hindi and Kannada', (tester) async {
    screenSize(tester, const Size(1280, 1600));
    final board = await enrolledBoard();
    await tester.runAsync(() => ModelServer.attach(board));
    for (final (lang, title) in [('hi', '3D मॉडल डाउनलोड'), ('kn', '3D ಮಾದರಿ ಡೌನ್‌ಲೋಡ್‌ಗಳು')]) {
      await tester.pumpWidget(localized(lang, Scaffold(body: BoardSettingsDialog(key: ValueKey(lang), board: board, initialQuery: '3D'))));
      await tester.pumpAndSettle();
      expect(find.text(title), findsOneWidget, reason: lang);
    }
  });
}

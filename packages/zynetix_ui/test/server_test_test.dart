import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

void main() {
  test('validates http(s) addresses', () {
    expect(isValidServerUrl('http://192.168.1.5:4000'), isTrue);
    expect(isValidServerUrl(' https://api.zynetix.in/ '), isTrue);
    expect(isValidServerUrl('ftp://x'), isFalse);
    expect(isValidServerUrl('api.zynetix.in'), isFalse);
    expect(isValidServerUrl(''), isFalse);
    expect(normalizeServerUrl(' https://a.in// '), 'https://a.in');
  });

  test('testServerConnection hits /health', () async {
    Uri? seen;
    final ok = MockClient((r) async {
      seen = r.url;
      return http.Response('ok', 200);
    });
    expect(await testServerConnection('http://h:4000/', client: ok), isTrue);
    expect(seen.toString(), 'http://h:4000/health');
    expect(await testServerConnection('http://h', client: MockClient((_) async => http.Response('', 503))), isFalse);
    expect(await testServerConnection('http://h', client: MockClient((_) async => throw Exception('down'))), isFalse);
    expect(await testServerConnection('nope', client: ok), isFalse);
  });

  testWidgets('button shows the result', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TestConnectionButton(
          url: () => 'http://h',
          label: 'Test',
          okText: 'OK!',
          failText: 'Fail!',
          client: MockClient((_) async => http.Response('ok', 200)),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('testConnection')));
    await tester.pumpAndSettle();
    expect(find.text('OK!'), findsOneWidget);
  });
}

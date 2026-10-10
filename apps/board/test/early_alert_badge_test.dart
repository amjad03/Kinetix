import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';

void main() {
  test('a student has no early alert until the server flags one', () {
    final s = Student.fromJson({'id': 's1', 'rollNo': '12', 'fullName': 'Asha'});
    expect(s.alert, isNull);
    s.alert = 'high';
    expect(s.alert, 'high');
  });
}

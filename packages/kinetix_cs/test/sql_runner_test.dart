import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

void main() {
  test('queries print a table from the sample database', () {
    final (out, status) = runSql('SELECT name, city FROM students WHERE roll_no < 103 ORDER BY roll_no;', database: 'students');
    expect(status, RunStatus.ok);
    expect(out.$1, contains('| name        | city      |'));
    expect(out.$1, contains('| Ananya Rao  | Bengaluru |'));
    expect(out.$1, contains('2 rows in set'));
  });

  test('every sample database loads and answers a classic question', () {
    expect(runSql('SELECT COUNT(*) AS n FROM students;', database: 'students').$1.$1, contains('| 10 |'));
    expect(runSql('SELECT dname, MAX(salary) AS top FROM emp JOIN dept USING (dept_no) GROUP BY dname ORDER BY top DESC LIMIT 1;', database: 'employees').$1.$1, contains('Accounts'));
    expect(
      runSql("SELECT m.name FROM issues i JOIN members m USING (member_id) WHERE returned_on IS NULL AND due_on < '2026-10-01' ORDER BY m.name;", database: 'library').$1.$1,
      allOf(contains('Ananya Rao'), contains('Priya Nair'), isNot(contains('Kiran'))),
    );
  });

  test('scripts that create, insert and change run statement by statement', () {
    final (out, status) = runSql('''
CREATE TABLE t (id INTEGER, name TEXT); -- a table
INSERT INTO t VALUES (1, 'a;b'), (2, NULL);
UPDATE t SET name = 'x' WHERE id = 2;
DELETE FROM t WHERE id = 99;
SELECT * FROM t;
''');
    expect(status, RunStatus.ok);
    expect(out.$1, contains('Created.'));
    expect(out.$1, contains('2 rows inserted.'));
    expect(out.$1, contains('1 row updated.'));
    expect(out.$1, contains('0 rows deleted.'));
    expect(out.$1, contains('| 1  | a;b  |'));
  });

  test('an error says which statement failed and keeps what came before', () {
    final (out, status) = runSql('SELECT 1 AS one;\nSELECT * FROM nowhere;', database: 'students');
    expect(status, RunStatus.runtimeError);
    expect(out.$1, contains('| 1   |'));
    expect(out.$2, allOf(contains('SELECT * FROM nowhere'), contains('no such table')));
  });

  test('each run starts from a fresh copy', () {
    runSql('DELETE FROM students;', database: 'students');
    expect(runSql('SELECT COUNT(*) AS n FROM students;', database: 'students').$1.$1, contains('| 10 |'));
  });

  test('splitting minds quotes, comments and triggers', () {
    expect(splitSql("SELECT ';'; -- x;\n/* y; */ SELECT 2;;"), ["SELECT ';'", '-- x;\n/* y; */ SELECT 2']);
    final trig = splitSql('CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE b SET n = n + 1; END; SELECT 1;');
    expect(trig, hasLength(2));
    expect(trig.first, endsWith('END'));
  });

  test('SqlRunner runs in an isolate and stops runaway queries', () async {
    final r = SqlRunner(timeLimit: const Duration(milliseconds: 600));
    final ok = await r.run(const RunRequest(CodeLanguage.sql, 'SELECT 6 * 7 AS answer;'));
    expect(ok.status, RunStatus.ok);
    expect(ok.stdout, contains('42'));
    final forever = await r.run(const RunRequest(CodeLanguage.sql, 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c;'));
    expect(forever.status, RunStatus.timeout);
    final pending = r.run(const RunRequest(CodeLanguage.sql, 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c;'));
    await Future<void>.delayed(const Duration(milliseconds: 100));
    r.stop();
    expect((await pending).status, RunStatus.stopped);
  });
}

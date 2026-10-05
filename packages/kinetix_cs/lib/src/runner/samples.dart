import 'protocol.dart';

/// A sample program for the class: its name (a CsStrings key), the code, and input to try it
/// with. SQL samples name their sample database.
class Sample {
  const Sample(this.key, this.language, this.code, {this.stdin = '', this.database});

  final String key;
  final CodeLanguage language;
  final String code;
  final String stdin;
  final String? database;
}

List<Sample> samplesFor(CodeLanguage l) => samples.where((s) => s.language == l).toList();

const samples = <Sample>[
  // --- Python ---
  Sample('sampleHello', CodeLanguage.python, 'name = input("Your name: ")\nprint("Namaskara,", name + "!")\n', stdin: 'Asha\n'),
  Sample('sampleFactorial', CodeLanguage.python, '''def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

n = int(input())
print(f"{n}! = {factorial(n)}")
''', stdin: '6\n'),
  Sample('samplePrimes', CodeLanguage.python, '''n = int(input())
primes = [p for p in range(2, n + 1) if all(p % d for d in range(2, int(p ** 0.5) + 1))]
print(primes)
''', stdin: '50\n'),
  Sample('sampleBubble', CodeLanguage.python, '''a = [64, 34, 25, 12, 22, 11, 90]
n = len(a)
for i in range(n - 1):
    for j in range(n - 1 - i):
        if a[j] > a[j + 1]:
            a[j], a[j + 1] = a[j + 1], a[j]
    print("Pass", i + 1, a)
'''),
  Sample('sampleMarks', CodeLanguage.python, '''marks = {}
n = int(input())
for _ in range(n):
    name, m = input().split()
    marks[name] = int(m)
for name, m in sorted(marks.items(), key=lambda x: -x[1]):
    grade = "A" if m >= 80 else "B" if m >= 60 else "C"
    print(f"{name:<8}{m:>4}  {grade}")
print("Average:", sum(marks.values()) / n)
''', stdin: '4\nAnanya 88\nRahul 64\nFathima 95\nKiran 72\n'),
  // --- JavaScript ---
  Sample('sampleHello', CodeLanguage.javascript, 'const name = prompt();\nconsole.log(`Namaskara, \${name}!`);\n', stdin: 'Asha\n'),
  Sample('sampleFibonacci', CodeLanguage.javascript, '''const n = Number(prompt());
const fib = [0, 1];
for (let i = 2; i < n; i++) fib.push(fib[i - 1] + fib[i - 2]);
console.log(fib.slice(0, n).join(', '));
''', stdin: '12\n'),
  Sample('sampleObjects', CodeLanguage.javascript, '''const students = [
  { name: 'Ananya', marks: 88 },
  { name: 'Rahul', marks: 64 },
  { name: 'Fathima', marks: 95 },
];
const toppers = students.filter((s) => s.marks >= 80).map((s) => s.name);
console.log('Toppers:', toppers);
console.log('Average:', students.reduce((t, s) => t + s.marks, 0) / students.length);
'''),
  // --- SQL ---
  Sample('sampleSelect', CodeLanguage.sql, '''-- Students of BCA, by roll number
SELECT roll_no, name, semester, city
FROM students
WHERE course = 'BCA'
ORDER BY roll_no;
''', database: 'students'),
  Sample('sampleJoin', CodeLanguage.sql, '''-- Average marks per subject, highest first
SELECT subject, ROUND(AVG(marks), 1) AS average, COUNT(*) AS students
FROM marks
GROUP BY subject
HAVING COUNT(*) >= 2
ORDER BY average DESC;
''', database: 'students'),
  Sample('sampleEmployees', CodeLanguage.sql, '''-- Each employee with their manager and department
SELECT e.ename AS employee, m.ename AS manager, d.dname, e.salary
FROM emp e
LEFT JOIN emp m ON e.manager = m.emp_no
JOIN dept d ON e.dept_no = d.dept_no
ORDER BY d.dname, e.salary DESC;
''', database: 'employees'),
  Sample('sampleLibrary', CodeLanguage.sql, '''-- Books not yet returned
SELECT b.title, m.name, i.due_on
FROM issues i
JOIN books b ON b.book_id = i.book_id
JOIN members m ON m.member_id = i.member_id
WHERE i.returned_on IS NULL
ORDER BY i.due_on;
''', database: 'library'),
  Sample('sampleCreate', CodeLanguage.sql, '''CREATE TABLE courses (code TEXT PRIMARY KEY, title TEXT, credits INTEGER);
INSERT INTO courses VALUES ('BCA301', 'Data Structures', 4), ('BCA302', 'DBMS', 4), ('BCA303', 'Java', 3);
UPDATE courses SET credits = 5 WHERE code = 'BCA301';
SELECT * FROM courses;
'''),
  // --- C ---
  Sample('sampleHello', CodeLanguage.c, '''#include <stdio.h>

int main(void) {
    char name[50];
    scanf("%49s", name);
    printf("Namaskara, %s!\\n", name);
    return 0;
}
''', stdin: 'Asha\n'),
  Sample('sampleFactorial', CodeLanguage.c, '''#include <stdio.h>

long factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d! = %ld\\n", n, factorial(n));
    return 0;
}
''', stdin: '10\n'),
  Sample('sampleBubble', CodeLanguage.c, '''#include <stdio.h>

int main(void) {
    int a[] = {64, 34, 25, 12, 22, 11, 90}, n = 7;
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }
    for (int i = 0; i < n; i++) printf("%d ", a[i]);
    printf("\\n");
    return 0;
}
'''),
  Sample('samplePointers', CodeLanguage.c, '''#include <stdio.h>

void swap(int *a, int *b) {
    int t = *a; *a = *b; *b = t;
}

int main(void) {
    int x = 5, y = 9;
    swap(&x, &y);
    printf("x = %d, y = %d\\n", x, y);
    return 0;
}
'''),
  // --- C++ ---
  Sample('sampleHello', CodeLanguage.cpp, '''#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    cin >> name;
    cout << "Namaskara, " << name << "!" << endl;
    return 0;
}
''', stdin: 'Asha\n'),
  Sample('sampleClass', CodeLanguage.cpp, '''#include <iostream>
using namespace std;

class Rectangle {
    double w, h;
public:
    Rectangle(double w, double h) : w(w), h(h) {}
    double area() const { return w * h; }
};

int main() {
    Rectangle r(4, 2.5);
    cout << "Area = " << r.area() << endl;
    return 0;
}
'''),
  Sample('sampleStack', CodeLanguage.cpp, '''#include <iostream>
#include <stack>
using namespace std;

int main() {
    stack<int> s;
    for (int i = 1; i <= 4; i++) s.push(i * 10);
    while (!s.empty()) { cout << s.top() << " "; s.pop(); }
    cout << endl;
    return 0;
}
'''),
  // --- Java ---
  Sample('sampleHello', CodeLanguage.java, '''import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        String name = in.next();
        System.out.println("Namaskara, " + name + "!");
    }
}
''', stdin: 'Asha\n'),
  Sample('sampleClass', CodeLanguage.java, '''public class Main {
    static abstract class Shape {
        abstract double area();
    }

    static class Circle extends Shape {
        double r;
        Circle(double r) { this.r = r; }
        double area() { return Math.PI * r * r; }
    }

    public static void main(String[] args) {
        Shape s = new Circle(2);
        System.out.printf("Area = %.2f%n", s.area());
    }
}
'''),
  Sample('sampleFactorial', CodeLanguage.java, '''import java.util.Scanner;

public class Main {
    static long factorial(int n) {
        return n <= 1 ? 1 : n * factorial(n - 1);
    }

    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        System.out.println(n + "! = " + factorial(n));
    }
}
''', stdin: '10\n'),
];

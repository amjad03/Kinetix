import 'protocol.dart';
import 'samples_cs.dart';

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

/// The samples for [l]: the curriculum [subject]'s own first (subjectSamples), then the rest.
List<Sample> samplesFor(CodeLanguage l, {String? subject}) => [
  ...?subjectSamples[subject]?.where((s) => s.language == l),
  ...samples.where((s) => s.language == l),
];

/// The language the code lab opens in for a curriculum subject (the board's class picker,
/// apps/board/lib/features/curriculum: `be-cse/dbms` → `dbms`), or null.
CodeLanguage? languageForSubject(String? subject) => subjectSamples[subject]?.first.language;

/// Sample programs for curriculum subjects (CurriculumSubject ids), offered first.
const subjectSamples = <String, List<Sample>>{
  // School "Computer" (classes 1–10): first programs in Python.
  'computer': [_tables, _evenOdd],
  'computer-science': [_stackList, _tables, _groupBy, csKeysSql, csBfsPython],
  'python': [_strings, _stackList],
  'c-programming': [_arraySum, _linkedList, csStackArrayC],
  'data-structures': [_linkedList, csStackArrayC, csCircularQueueC, csBstC, _arraySum, csBfsPython],
  'oop-java': [csInheritanceJava, csInterfaceJava, csExceptionJava],
  'theory-of-computation': [csDfaPython],
  'aiml-data-structures': [_stackList, csBfsPython, _linkedList, csBstC],
  'algorithms': [_binarySearch, csDijkstraPython, csBfsPython],
  'operating-systems': [_fcfs, csRoundRobinC, csPagingPython],
  'dbms': [_groupBy, _subquery, csKeysSql],
  'computer-networks': [_subnet, csCrcC],
  'machine-learning': [_regression],
  'deep-learning': [_perceptron],
  'microcontrollers': [_bits],
  'digital-electronics': [_bits],
  'dsp': [_movingAverage],
};

const _tables = Sample('sampleTables', CodeLanguage.python, '''n = int(input("Which table? "))
for i in range(1, 11):
    print(n, "x", i, "=", n * i)
''', stdin: '7\n');

const _evenOdd = Sample('sampleEvenOdd', CodeLanguage.python, '''for n in range(1, 11):
    if n % 2 == 0:
        print(n, "is even")
    else:
        print(n, "is odd")
''');

const _stackList = Sample('sampleStackList', CodeLanguage.python, '''stack = []
for item in ["maths", "physics", "chemistry"]:
    stack.append(item)
    print("push", item, "->", stack)
while stack:
    print("pop", stack.pop(), "->", stack)
''');

const _strings = Sample('sampleStrings', CodeLanguage.python, '''word = input().strip()
print("Letters:", len(word))
print("Reversed:", word[::-1])
print("Palindrome?", word.lower() == word.lower()[::-1])
print("Vowels:", sum(1 for c in word.lower() if c in "aeiou"))
''', stdin: 'Malayalam\n');

const _arraySum = Sample('sampleArraySum', CodeLanguage.c, '''#include <stdio.h>

int main(void) {
    int n, a[100], sum = 0, max;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    max = a[0];
    for (int i = 0; i < n; i++) {
        sum += a[i];
        if (a[i] > max) max = a[i];
    }
    printf("Sum = %d\\nAverage = %.2f\\nLargest = %d\\n", sum, (float)sum / n, max);
    return 0;
}
''', stdin: '5\n12 45 7 30 22\n');

const _linkedList = Sample('sampleLinkedList', CodeLanguage.c, '''#include <stdio.h>
#include <stdlib.h>

struct node {
    int data;
    struct node *next;
};

struct node *push(struct node *head, int x) {
    struct node *n = malloc(sizeof *n);
    n->data = x;
    n->next = head;
    return n;
}

int main(void) {
    struct node *head = NULL;
    for (int i = 1; i <= 5; i++) head = push(head, i * 10);
    for (struct node *p = head; p != NULL; p = p->next) printf("%d -> ", p->data);
    printf("NULL\\n");
    while (head) {
        struct node *next = head->next;
        free(head);
        head = next;
    }
    return 0;
}
''');

const _binarySearch = Sample('sampleBinarySearch', CodeLanguage.cpp, '''#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> a = {3, 8, 15, 23, 42, 57, 68, 91};
    int key;
    cin >> key;
    int lo = 0, hi = a.size() - 1, steps = 0;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        steps++;
        cout << "Look at a[" << mid << "] = " << a[mid] << endl;
        if (a[mid] == key) { cout << "Found in " << steps << " steps" << endl; return 0; }
        if (a[mid] < key) lo = mid + 1; else hi = mid - 1;
    }
    cout << "Not found" << endl;
    return 0;
}
''', stdin: '57\n');

const _fcfs = Sample('sampleFcfs', CodeLanguage.c, '''#include <stdio.h>

int main(void) {
    int n, burst[20], wait = 0, total = 0;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &burst[i]);
    printf("Process  Burst  Waiting  Turnaround\\n");
    for (int i = 0; i < n; i++) {
        printf("P%-7d %-6d %-8d %d\\n", i + 1, burst[i], wait, wait + burst[i]);
        total += wait;
        wait += burst[i];
    }
    printf("Average waiting time = %.2f\\n", (float)total / n);
    return 0;
}
''', stdin: '4\n5 3 8 6\n');

const _groupBy = Sample('sampleGroupBy', CodeLanguage.sql, '''-- Each student's total and average marks, toppers first
SELECT s.name, COUNT(*) AS papers, SUM(m.marks) AS total, ROUND(AVG(m.marks), 1) AS average
FROM students s
JOIN marks m ON m.roll_no = s.roll_no
GROUP BY s.roll_no
ORDER BY average DESC;
''', database: 'students');

const _subquery = Sample('sampleSubquery', CodeLanguage.sql, '''-- Students who scored above the class average in DBMS
SELECT s.name, m.marks
FROM marks m
JOIN students s ON s.roll_no = m.roll_no
WHERE m.subject = 'DBMS'
  AND m.marks > (SELECT AVG(marks) FROM marks WHERE subject = 'DBMS')
ORDER BY m.marks DESC;
''', database: 'students');

const _subnet = Sample('sampleSubnet', CodeLanguage.python, '''ip, prefix = input().split("/")
prefix = int(prefix)
parts = [int(p) for p in ip.split(".")]
address = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
mask = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF
def dotted(x):
    return ".".join(str((x >> s) & 255) for s in (24, 16, 8, 0))
network = address & mask
broadcast = network | (~mask & 0xFFFFFFFF)
print("Mask:     ", dotted(mask))
print("Network:  ", dotted(network))
print("Broadcast:", dotted(broadcast))
print("Hosts:    ", max(2 ** (32 - prefix) - 2, 0))
''', stdin: '192.168.10.77/26\n');

const _regression = Sample('sampleRegression', CodeLanguage.python, '''# Hours studied and marks: fit marks = a + b * hours (least squares)
hours = [1, 2, 3, 4, 5, 6, 7, 8]
marks = [35, 42, 50, 55, 63, 70, 74, 85]
n = len(hours)
mx, my = sum(hours) / n, sum(marks) / n
b = sum((x - mx) * (y - my) for x, y in zip(hours, marks)) / sum((x - mx) ** 2 for x in hours)
a = my - b * mx
print(f"marks = {a:.2f} + {b:.2f} x hours")
for h in [2.5, 9]:
    print(f"{h} hours -> about {a + b * h:.0f} marks")
''');

const _perceptron = Sample('samplePerceptron', CodeLanguage.python, '''# A perceptron learns AND
data = [((0, 0), 0), ((0, 1), 0), ((1, 0), 0), ((1, 1), 1)]
w, bias, rate = [0.0, 0.0], 0.0, 0.1
for epoch in range(10):
    errors = 0
    for (x1, x2), target in data:
        out = 1 if w[0] * x1 + w[1] * x2 + bias > 0 else 0
        err = target - out
        w[0] += rate * err * x1
        w[1] += rate * err * x2
        bias += rate * err
        errors += abs(err)
    print("epoch", epoch + 1, "errors", errors, "weights", [round(v, 2) for v in w], "bias", round(bias, 2))
    if errors == 0:
        break
''');

const _bits = Sample('sampleBits', CodeLanguage.c, '''#include <stdio.h>

void binary(unsigned char x) {
    for (int i = 7; i >= 0; i--) putchar(x & (1 << i) ? '1' : '0');
}

int main(void) {
    unsigned char port = 0;
    port |= 1 << 3;   /* set bit 3: LED on */
    printf("Set bit 3:    "); binary(port); printf("\\n");
    port |= 1 << 0;   /* set bit 0 */
    printf("Set bit 0:    "); binary(port); printf("\\n");
    port ^= 1 << 3;   /* toggle bit 3 */
    printf("Toggle bit 3: "); binary(port); printf("\\n");
    port &= ~(1 << 0); /* clear bit 0 */
    printf("Clear bit 0:  "); binary(port); printf("\\n");
    return 0;
}
''');

const _movingAverage = Sample('sampleMovingAverage', CodeLanguage.python, '''# A 3-point moving average smooths a noisy signal
signal = [2, 9, 3, 8, 4, 10, 5, 11, 6]
smooth = [round(sum(signal[i - 2:i + 1]) / 3, 2) for i in range(2, len(signal))]
print("signal:", signal)
print("smooth:", smooth)
for v in smooth:
    print(f"{v:6.2f} " + "#" * int(v))
''');

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

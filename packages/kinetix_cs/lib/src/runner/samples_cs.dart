import 'protocol.dart';
import 'samples.dart' show Sample;

// Sample programs for the B.E. Computer Science / Information Science papers: data structures
// in C, OOP in Java, DBMS in SQL, operating systems and networks in C and Python, algorithms and
// automata in Python. Each is short enough to read on the board and runs as it is.

const csStackArrayC = Sample('sampleStackArray', CodeLanguage.c, '''#include <stdio.h>
#define MAX 5

int stack[MAX], top = -1;

void push(int x) {
    if (top == MAX - 1) { printf("Overflow: %d\\n", x); return; }
    stack[++top] = x;
    printf("push %d\\n", x);
}

int pop(void) {
    if (top == -1) { printf("Underflow\\n"); return -1; }
    return stack[top--];
}

int main(void) {
    for (int i = 1; i <= 6; i++) push(i * 10);
    while (top >= 0) printf("pop %d\\n", pop());
    pop();
    return 0;
}
''');

const csCircularQueueC = Sample('sampleCircularQueue', CodeLanguage.c, '''#include <stdio.h>
#define N 4

int q[N], front = 0, rear = -1, count = 0;

void enqueue(int x) {
    if (count == N) { printf("Queue full: %d\\n", x); return; }
    rear = (rear + 1) % N;
    q[rear] = x;
    count++;
    printf("enqueue %d at %d\\n", x, rear);
}

int dequeue(void) {
    if (count == 0) { printf("Queue empty\\n"); return -1; }
    int x = q[front];
    front = (front + 1) % N;
    count--;
    return x;
}

int main(void) {
    enqueue(1); enqueue(2); enqueue(3);
    printf("dequeue %d\\n", dequeue());
    enqueue(4); enqueue(5); enqueue(6);
    while (count > 0) printf("dequeue %d\\n", dequeue());
    return 0;
}
''');

const csBstC = Sample('sampleBstC', CodeLanguage.c, '''#include <stdio.h>
#include <stdlib.h>

struct node { int key; struct node *left, *right; };

struct node *insert(struct node *t, int key) {
    if (t == NULL) {
        t = malloc(sizeof *t);
        t->key = key;
        t->left = t->right = NULL;
    } else if (key < t->key) t->left = insert(t->left, key);
    else if (key > t->key) t->right = insert(t->right, key);
    return t;
}

void inorder(struct node *t)   { if (t) { inorder(t->left); printf("%d ", t->key); inorder(t->right); } }
void preorder(struct node *t)  { if (t) { printf("%d ", t->key); preorder(t->left); preorder(t->right); } }
void postorder(struct node *t) { if (t) { postorder(t->left); postorder(t->right); printf("%d ", t->key); } }

int main(void) {
    int keys[] = {50, 30, 70, 20, 40, 60, 80};
    struct node *root = NULL;
    for (int i = 0; i < 7; i++) root = insert(root, keys[i]);
    printf("In-order:   "); inorder(root);   printf("\\n");
    printf("Pre-order:  "); preorder(root);  printf("\\n");
    printf("Post-order: "); postorder(root); printf("\\n");
    return 0;
}
''');

const csBfsPython = Sample('sampleBfs', CodeLanguage.python, '''from collections import deque

graph = {
    "A": ["B", "C"],
    "B": ["A", "D", "E"],
    "C": ["A", "F"],
    "D": ["B"],
    "E": ["B", "F"],
    "F": ["C", "E"],
}

def bfs(start):
    seen, order, queue = {start}, [], deque([start])
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in graph[u]:
            if v not in seen:
                seen.add(v)
                queue.append(v)
    return order

def dfs(u, seen=None):
    seen = seen if seen is not None else []
    seen.append(u)
    for v in graph[u]:
        if v not in seen:
            dfs(v, seen)
    return seen

print("BFS:", " -> ".join(bfs("A")))
print("DFS:", " -> ".join(dfs("A")))
''');

const csDijkstraPython = Sample('sampleDijkstra', CodeLanguage.python, '''import heapq

edges = [("A", "B", 4), ("A", "C", 2), ("B", "C", 1), ("B", "D", 5),
         ("C", "D", 8), ("C", "E", 10), ("D", "E", 2), ("D", "F", 6), ("E", "F", 2)]
graph = {}
for u, v, w in edges:
    graph.setdefault(u, []).append((v, w))
    graph.setdefault(v, []).append((u, w))

dist = {v: float("inf") for v in graph}
dist["A"] = 0
heap = [(0, "A")]
while heap:
    d, u = heapq.heappop(heap)
    if d > dist[u]:
        continue
    for v, w in graph[u]:
        if d + w < dist[v]:
            dist[v] = d + w
            heapq.heappush(heap, (dist[v], v))

for v in sorted(dist):
    print(v, dist[v])
''');

const csInheritanceJava = Sample('sampleInheritance', CodeLanguage.java, '''public class Main {
    static class Account {
        protected final String number;
        protected double balance;
        Account(String number, double balance) { this.number = number; this.balance = balance; }
        void deposit(double amount) { balance += amount; }
        boolean withdraw(double amount) {
            if (amount > balance) return false;
            balance -= amount;
            return true;
        }
        double interest() { return 0; }
        public String toString() { return getClass().getSimpleName() + " " + number + ": Rs " + balance; }
    }

    static class Savings extends Account {
        Savings(String number, double balance) { super(number, balance); }
        @Override double interest() { return balance * 0.04; }
    }

    static class Current extends Account {
        private final double overdraft;
        Current(String number, double balance, double overdraft) { super(number, balance); this.overdraft = overdraft; }
        @Override boolean withdraw(double amount) {
            if (amount > balance + overdraft) return false;
            balance -= amount;
            return true;
        }
    }

    public static void main(String[] args) {
        Account[] accounts = { new Savings("SB-101", 5000), new Current("CA-201", 2000, 1000) };
        for (Account a : accounts) {
            a.deposit(500);
            System.out.println(a + ", withdraw 2800: " + a.withdraw(2800) + ", interest " + a.interest());
        }
    }
}
''');

const csInterfaceJava = Sample('sampleInterface', CodeLanguage.java, '''import java.util.ArrayList;
import java.util.List;

public class Main {
    interface Shape {
        double area();
        default String describe() { return getClass().getSimpleName() + " area " + String.format("%.2f", area()); }
    }

    record Circle(double r) implements Shape { public double area() { return Math.PI * r * r; } }
    record Rectangle(double w, double h) implements Shape { public double area() { return w * h; } }

    public static void main(String[] args) {
        List<Shape> shapes = new ArrayList<>(List.of(new Circle(1.5), new Rectangle(3, 4), new Circle(0.5)));
        shapes.sort((a, b) -> Double.compare(a.area(), b.area()));
        for (Shape s : shapes) System.out.println(s.describe());
    }
}
''');

const csExceptionJava = Sample('sampleException', CodeLanguage.java, '''import java.util.Scanner;

public class Main {
    static class InsufficientFundsException extends Exception {
        InsufficientFundsException(double need) { super("Short by Rs " + need); }
    }

    static double balance = 1000;

    static void withdraw(double amount) throws InsufficientFundsException {
        if (amount > balance) throw new InsufficientFundsException(amount - balance);
        balance -= amount;
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        while (in.hasNextDouble()) {
            double amount = in.nextDouble();
            try {
                withdraw(amount);
                System.out.println("Withdrew " + amount + ", left " + balance);
            } catch (InsufficientFundsException e) {
                System.out.println("Refused: " + e.getMessage());
            } finally {
                System.out.println("-- done");
            }
        }
    }
}
''', stdin: '300\n900\n500\n');

const csKeysSql = Sample('sampleKeys', CodeLanguage.sql, '''-- Tables with primary and foreign keys, then a join
CREATE TABLE department (dept_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE student (
  usn TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dept_id INTEGER REFERENCES department(dept_id)
);
CREATE TABLE course (code TEXT PRIMARY KEY, title TEXT, credits INTEGER CHECK (credits > 0));
CREATE TABLE enrols (
  usn TEXT REFERENCES student(usn),
  code TEXT REFERENCES course(code),
  grade TEXT,
  PRIMARY KEY (usn, code)
);
INSERT INTO department VALUES (1, 'CSE'), (2, 'ISE');
INSERT INTO student VALUES ('1KX21CS001', 'Asha', 1), ('1KX21IS002', 'Ravi', 2), ('1KX21CS003', 'Meena', 1);
INSERT INTO course VALUES ('CS41', 'DBMS', 4), ('CS42', 'Operating Systems', 4);
INSERT INTO enrols VALUES ('1KX21CS001', 'CS41', 'A'), ('1KX21CS001', 'CS42', 'B'), ('1KX21IS002', 'CS41', 'S');
SELECT s.name, d.name AS dept, c.title, e.grade
FROM enrols e
JOIN student s ON s.usn = e.usn
JOIN department d ON d.dept_id = s.dept_id
JOIN course c ON c.code = e.code
ORDER BY s.name;
''');

const csRoundRobinC = Sample('sampleRoundRobin', CodeLanguage.c, '''#include <stdio.h>

int main(void) {
    int n = 4, quantum = 2;
    int burst[] = {5, 3, 1, 4}, left[4], finish[4];
    for (int i = 0; i < n; i++) left[i] = burst[i];
    int time = 0, done = 0;
    printf("Gantt: ");
    while (done < n) {
        for (int i = 0; i < n; i++) {
            if (left[i] == 0) continue;
            int run = left[i] < quantum ? left[i] : quantum;
            printf("| P%d %d-%d ", i + 1, time, time + run);
            time += run;
            left[i] -= run;
            if (left[i] == 0) { finish[i] = time; done++; }
        }
    }
    printf("|\\n");
    double wait = 0, tat = 0;
    for (int i = 0; i < n; i++) {
        printf("P%d: turnaround %d, waiting %d\\n", i + 1, finish[i], finish[i] - burst[i]);
        tat += finish[i];
        wait += finish[i] - burst[i];
    }
    printf("Average waiting %.2f, turnaround %.2f\\n", wait / n, tat / n);
    return 0;
}
''');

const csPagingPython = Sample('samplePaging', CodeLanguage.python, '''refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2]
frames = 3

def fifo(refs, n):
    mem, faults = [], 0
    for p in refs:
        if p not in mem:
            faults += 1
            if len(mem) == n:
                mem.pop(0)
            mem.append(p)
    return faults

def lru(refs, n):
    mem, faults = [], 0
    for p in refs:
        if p in mem:
            mem.remove(p)
        else:
            faults += 1
            if len(mem) == n:
                mem.pop(0)
        mem.append(p)
    return faults

print("FIFO page faults:", fifo(refs, frames))
print("LRU page faults: ", lru(refs, frames))
''');

const csCrcC = Sample('sampleCrc', CodeLanguage.c, '''#include <stdio.h>
#include <string.h>

/* CRC by long division in modulo-2: data 1101011011, generator x^4 + x + 1 (10011). */
int main(void) {
    char data[] = "1101011011", gen[] = "10011";
    int n = strlen(data), g = strlen(gen);
    char work[64];
    strcpy(work, data);
    for (int i = 0; i < g - 1; i++) work[n + i] = '0';
    work[n + g - 1] = '\\0';
    for (int i = 0; i < n; i++) {
        if (work[i] == '1')
            for (int j = 0; j < g; j++) work[i + j] = work[i + j] == gen[j] ? '0' : '1';
    }
    printf("CRC bits:   %s\\n", work + n);
    printf("Sent frame: %s%s\\n", data, work + n);
    return 0;
}
''');

const csDfaPython = Sample('sampleDfa', CodeLanguage.python, '''# A DFA over {0, 1} that accepts strings ending in "01"
delta = {
    ("q0", "0"): "q1", ("q0", "1"): "q0",
    ("q1", "0"): "q1", ("q1", "1"): "q2",
    ("q2", "0"): "q1", ("q2", "1"): "q0",
}
start, accept = "q0", {"q2"}

for word in ["1101", "0110", "01", "111"]:
    state, path = start, [start]
    for ch in word:
        state = delta[(state, ch)]
        path.append(state)
    print(word.ljust(6), " -> ".join(path), "ACCEPT" if state in accept else "reject")
''');

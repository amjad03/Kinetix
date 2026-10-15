/// The sample databases for SQL classes, as SQL scripts. Each run starts from a fresh copy, so
/// a class can DELETE freely. Names are of the kind a Bengaluru college sees.
library;

const sampleDatabases = <String, String>{
  'students': _students,
  'employees': _employees,
  'library': _library,
};

const _students = '''
CREATE TABLE departments (dept_id INTEGER PRIMARY KEY, name TEXT NOT NULL, hod TEXT);
INSERT INTO departments VALUES
  (1, 'Computer Applications', 'Dr. Shashikala R'),
  (2, 'Commerce', 'Prof. Manjunath K'),
  (3, 'Science', 'Dr. Ayesha Siddiqui');

CREATE TABLE students (
  roll_no INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  course TEXT NOT NULL,
  semester INTEGER,
  city TEXT,
  dept_id INTEGER REFERENCES departments(dept_id)
);
INSERT INTO students VALUES
  (101, 'Ananya Rao', 'BCA', 3, 'Bengaluru', 1),
  (102, 'Rahul Gowda', 'BCA', 3, 'Mysuru', 1),
  (103, 'Fathima Banu', 'BCA', 5, 'Bengaluru', 1),
  (104, 'Kiran Kumar', 'MCA', 1, 'Tumakuru', 1),
  (105, 'Priya Nair', 'MCA', 3, 'Bengaluru', 1),
  (106, 'Arjun Shetty', 'BCom', 3, 'Mangaluru', 2),
  (107, 'Deepika Hegde', 'BCom', 1, 'Hubballi', 2),
  (108, 'Mohammed Irfan', 'BSc', 5, 'Bengaluru', 3),
  (109, 'Sneha Patil', 'BSc', 3, 'Belagavi', 3),
  (110, 'Vikram Reddy', 'BCA', 1, 'Kolar', 1);

CREATE TABLE marks (
  roll_no INTEGER REFERENCES students(roll_no),
  subject TEXT,
  marks INTEGER CHECK (marks BETWEEN 0 AND 100),
  PRIMARY KEY (roll_no, subject)
);
INSERT INTO marks VALUES
  (101, 'DBMS', 88), (101, 'Java', 92), (101, 'Maths', 75),
  (102, 'DBMS', 64), (102, 'Java', 58), (102, 'Maths', 81),
  (103, 'DBMS', 95), (103, 'Java', 89), (103, 'Maths', 91),
  (104, 'DBMS', 72), (104, 'Java', 67),
  (105, 'DBMS', 49), (105, 'Java', 77),
  (106, 'Accounts', 83), (106, 'Maths', 69),
  (107, 'Accounts', 91), (107, 'Maths', 56),
  (108, 'Physics', 78), (108, 'Maths', 85),
  (109, 'Physics', 66), (109, 'Maths', 72),
  (110, 'DBMS', 38), (110, 'Java', 55), (110, 'Maths', 61);
''';

const _employees = '''
CREATE TABLE dept (dept_no INTEGER PRIMARY KEY, dname TEXT NOT NULL, location TEXT);
INSERT INTO dept VALUES
  (10, 'Accounts', 'Bengaluru'),
  (20, 'Research', 'Mysuru'),
  (30, 'Sales', 'Mangaluru'),
  (40, 'Operations', 'Hubballi');

CREATE TABLE emp (
  emp_no INTEGER PRIMARY KEY,
  ename TEXT NOT NULL,
  job TEXT,
  manager INTEGER REFERENCES emp(emp_no),
  hire_date TEXT,
  salary INTEGER,
  commission INTEGER,
  dept_no INTEGER REFERENCES dept(dept_no)
);
INSERT INTO emp VALUES
  (7839, 'Lakshmi', 'PRESIDENT', NULL, '2015-11-17', 250000, NULL, 10),
  (7698, 'Suresh', 'MANAGER', 7839, '2016-05-01', 142500, NULL, 30),
  (7782, 'Kavya', 'MANAGER', 7839, '2016-06-09', 122500, NULL, 10),
  (7566, 'Naveen', 'MANAGER', 7839, '2016-04-02', 148750, NULL, 20),
  (7788, 'Sameer', 'ANALYST', 7566, '2019-12-09', 75000, NULL, 20),
  (7902, 'Divya', 'ANALYST', 7566, '2017-12-03', 75000, NULL, 20),
  (7369, 'Ravi', 'CLERK', 7902, '2017-12-17', 20000, NULL, 20),
  (7499, 'Anita', 'SALESMAN', 7698, '2018-02-20', 40000, 7500, 30),
  (7521, 'Harish', 'SALESMAN', 7698, '2018-02-22', 31250, 12500, 30),
  (7654, 'Meena', 'SALESMAN', 7698, '2018-09-28', 31250, 35000, 30),
  (7844, 'Gopal', 'SALESMAN', 7698, '2018-09-08', 37500, 0, 30),
  (7876, 'Shruti', 'CLERK', 7788, '2020-01-12', 27500, NULL, 20),
  (7900, 'Imran', 'CLERK', 7698, '2017-12-03', 23750, NULL, 30),
  (7934, 'Rekha', 'CLERK', 7782, '2018-01-23', 32500, NULL, 10);
''';

const _library = '''
CREATE TABLE books (
  book_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  subject TEXT,
  year INTEGER,
  copies INTEGER DEFAULT 1
);
INSERT INTO books VALUES
  (1, 'Let Us C', 'Yashavant Kanetkar', 'Programming', 2016, 8),
  (2, 'Database System Concepts', 'Silberschatz, Korth, Sudarshan', 'DBMS', 2019, 5),
  (3, 'Operating System Concepts', 'Silberschatz, Galvin, Gagne', 'OS', 2018, 4),
  (4, 'Computer Networks', 'Andrew S. Tanenbaum', 'Networks', 2010, 3),
  (5, 'Introduction to Algorithms', 'Cormen, Leiserson, Rivest, Stein', 'Algorithms', 2009, 2),
  (6, 'Java: The Complete Reference', 'Herbert Schildt', 'Programming', 2021, 6),
  (7, 'Python Crash Course', 'Eric Matthes', 'Programming', 2019, 4),
  (8, 'Discrete Mathematics', 'Kenneth Rosen', 'Maths', 2018, 3),
  (9, 'Data Structures Using C', 'Reema Thareja', 'Data Structures', 2014, 7),
  (10, 'Software Engineering', 'Roger Pressman', 'SE', 2014, 2);

CREATE TABLE members (member_id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT CHECK (kind IN ('student', 'staff')), joined TEXT);
INSERT INTO members VALUES
  (1, 'Ananya Rao', 'student', '2025-08-01'),
  (2, 'Rahul Gowda', 'student', '2025-08-01'),
  (3, 'Priya Nair', 'student', '2024-08-05'),
  (4, 'Dr. Shashikala R', 'staff', '2012-06-15'),
  (5, 'Kiran Kumar', 'student', '2026-08-03');

CREATE TABLE issues (
  issue_id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(book_id),
  member_id INTEGER REFERENCES members(member_id),
  issued_on TEXT,
  due_on TEXT,
  returned_on TEXT
);
INSERT INTO issues VALUES
  (1, 1, 1, '2026-09-01', '2026-09-15', '2026-09-12'),
  (2, 2, 1, '2026-09-10', '2026-09-24', NULL),
  (3, 5, 3, '2026-08-20', '2026-09-03', NULL),
  (4, 7, 2, '2026-09-18', '2026-10-02', NULL),
  (5, 3, 4, '2026-07-01', '2026-08-01', '2026-07-28'),
  (6, 9, 5, '2026-09-25', '2026-10-09', NULL),
  (7, 6, 2, '2026-08-11', '2026-08-25', '2026-08-30');
''';

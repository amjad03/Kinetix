import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';

// Ready diagrams for the computer science kit, filled in as the textbooks draw them: a library
// system and a bank (UML class, use-case, sequence, activity, state), a student database, a bank
// and a library (ER), relational schemas with keys, and automata. Panel words are in English, as
// in the textbooks; the teacher edits the text to change them.

enum CsDiagramSample {
  libraryClasses,
  bankClasses,
  libraryUseCase,
  atmSequence,
  atmActivity,
  bookStates,
  studentEr,
  bankEr,
  libraryEr,
  studentSchema,
  librarySchema,
  dfaEnds01,
  dfaEvenZeros,
  nfaContains01,
}

/// Which samples belong to which kind of diagram (the kit lists them under it).
CsDiagramType sampleType(CsDiagramSample s) => switch (s) {
  CsDiagramSample.libraryClasses || CsDiagramSample.bankClasses => CsDiagramType.classes,
  CsDiagramSample.libraryUseCase => CsDiagramType.useCase,
  CsDiagramSample.atmSequence => CsDiagramType.sequence,
  CsDiagramSample.atmActivity => CsDiagramType.activity,
  CsDiagramSample.bookStates => CsDiagramType.state,
  CsDiagramSample.studentEr || CsDiagramSample.bankEr || CsDiagramSample.libraryEr => CsDiagramType.er,
  CsDiagramSample.studentSchema || CsDiagramSample.librarySchema => CsDiagramType.schema,
  CsDiagramSample.dfaEnds01 || CsDiagramSample.dfaEvenZeros || CsDiagramSample.nfaContains01 => CsDiagramType.automaton,
};

/// A diagram panel laid out at its natural size.
KitElement csDiagramPanel(CsDiagram d, Color accent) => KitElement.sized(kind: KitKind.csDiagram, data: d.toJson(), color: accent);

bool isCsDiagramKit(KitKind k) => k == KitKind.csDiagram;

CsDiagram sampleDiagram(CsDiagramSample s) => switch (s) {
  CsDiagramSample.libraryClasses => CsDiagram(type: CsDiagramType.classes, title: 'Library management system', spec: '''
class Library
  - name: String
  + addBook(b: Book): void
  + search(title: String): Book[]
class Book
  - isbn: String
  - title: String
  - author: String
  + isAvailable(): boolean
class BookCopy
  - copyNo: int
  - status: Status
abstract class Person
  - name: String
  - phone: String
class Member
  - memberId: int
  + borrow(c: BookCopy): Loan
class Librarian
  - staffId: int
  + issue(c: BookCopy, m: Member): Loan
class Loan
  - issueDate: Date
  - dueDate: Date
  + fine(): double
Library "1" o-- "*" Book : holds
Book "1" *-- "1..*" BookCopy : has
Member --|> Person
Librarian --|> Person
Member "1" -- "0..5" Loan : takes
Loan "*" --> "1" BookCopy : of
'''),
  CsDiagramSample.bankClasses => CsDiagram(type: CsDiagramType.classes, title: 'Banking system', spec: '''
class Bank
  - ifsc: String
  + openAccount(c: Customer): Account
class Customer
  - customerId: int
  - name: String
  - pan: String
abstract class Account
  - number: String
  - balance: double
  + deposit(amt: double): void
  + withdraw(amt: double): boolean
class SavingsAccount
  - rate: double
  + addInterest(): void
class CurrentAccount
  - overdraft: double
interface Transferable
  + transfer(to: Account, amt: double): boolean
class Transaction
  - id: long
  - amount: double
  - time: DateTime
Bank "1" *-- "*" Account : keeps
Customer "1..*" -- "1..*" Account : owns
SavingsAccount --|> Account
CurrentAccount --|> Account
Account ..|> Transferable
Account "1" -- "*" Transaction : records
'''),
  CsDiagramSample.libraryUseCase => CsDiagram(type: CsDiagramType.useCase, title: 'Library: use cases', spec: '''
system Library system
actor Member
actor Librarian
usecase Search catalogue
usecase Borrow book
usecase Return book
usecase Pay fine
usecase Log in
usecase Add book
Member -- Search catalogue
Member -- Borrow book
Member -- Return book
Return book ..> Pay fine : «extend»
Borrow book ..> Log in : «include»
Librarian -- Add book
Librarian -- Borrow book
'''),
  CsDiagramSample.atmSequence => CsDiagram(type: CsDiagramType.sequence, title: 'ATM cash withdrawal', spec: '''
actor Customer
participant :ATM
participant :BankServer
participant :Account
Customer -> :ATM : insert card, enter PIN
:ATM -> :BankServer : verify(card, PIN)
:BankServer ..> :ATM : PIN ok
Customer -> :ATM : withdraw(2000)
:ATM -> :BankServer : debit(2000)
:BankServer -> :Account : withdraw(2000)
:Account ..> :BankServer : new balance
:BankServer ..> :ATM : approved
:ATM -> :ATM : count notes
:ATM ..> Customer : cash, card, receipt
'''),
  CsDiagramSample.atmActivity => CsDiagram(type: CsDiagramType.activity, title: 'ATM: withdraw cash', spec: '''
start
action Insert card
action Enter PIN
decision PIN valid?
action Enter amount
decision Balance enough?
action Dispense cash
action Show error
end
[*] -> Insert card
Insert card -> Enter PIN
Enter PIN -> PIN valid?
PIN valid? -> Enter amount : yes
PIN valid? -> Show error : no
Enter amount -> Balance enough?
Balance enough? -> Dispense cash : yes
Balance enough? -> Show error : no
Dispense cash -> [*]
Show error -> [*]
'''),
  CsDiagramSample.bookStates => CsDiagram(type: CsDiagramType.state, title: 'A library book copy', spec: '''
state Available
state Reserved
state Issued
state Overdue
state Lost
[*] -> Available : catalogued
Available -> Reserved : reserve
Reserved -> Issued : collect
Available -> Issued : issue
Issued -> Available : return
Issued -> Overdue : due date passes
Overdue -> Available : return, pay fine
Overdue -> Lost : 60 days
Lost -> [*]
'''),
  CsDiagramSample.studentEr => CsDiagram(type: CsDiagramType.er, title: 'Student database (ER)', spec: '''
entity Student
  *usn
  name
  {phone}
  dob
  /age
entity Department
  *dept_id
  dname
entity Course
  *code
  title
  credits
weak entity Guardian
  ~gname
  relation
relationship Belongs to
relationship Enrols
  grade
identifying Has
Student -- Belongs to : N
Belongs to == Department : 1
Student -- Enrols : M
Enrols -- Course : N
Student == Has : 1
Has == Guardian : N
'''),
  CsDiagramSample.bankEr => CsDiagram(type: CsDiagramType.er, title: 'Bank (ER)', spec: '''
entity Customer
  *cust_id
  name
  {phone}
  dob
  /age
entity Account
  *acc_no
  balance
  type
entity Branch
  *branch_id
  city
entity Loan
  *loan_no
  amount
weak entity Payment
  ~pay_no
  pay_date
  amount
relationship Holds
relationship At
relationship Borrows
identifying Repaid by
Customer -- Holds : M
Holds -- Account : N
Account -- At : N
At == Branch : 1
Customer -- Borrows : M
Borrows -- Loan : N
Loan == Repaid by : 1
Repaid by == Payment : N
'''),
  CsDiagramSample.libraryEr => CsDiagram(type: CsDiagramType.er, title: 'Library (ER)', spec: '''
entity Book
  *isbn
  title
  {author}
  year
entity Member
  *member_id
  name
  address
entity Publisher
  *pub_id
  pname
relationship Borrows
  issue_date
  due_date
relationship Publishes
Member -- Borrows : M
Borrows -- Book : N
Publisher -- Publishes : 1
Publishes == Book : N
'''),
  CsDiagramSample.studentSchema => CsDiagram(type: CsDiagramType.schema, title: 'Student database (relational schema)', spec: '''
table department
  *dept_id INTEGER
  dname TEXT
table student
  *usn TEXT
  name TEXT
  dob DATE
  dept_id INTEGER -> department.dept_id
table course
  *code TEXT
  title TEXT
  credits INTEGER
table enrols
  *usn TEXT -> student.usn
  *code TEXT -> course.code
  grade TEXT
'''),
  CsDiagramSample.librarySchema => CsDiagram(type: CsDiagramType.schema, title: 'Library (relational schema)', spec: '''
table publisher
  *pub_id INTEGER
  pname TEXT
table book
  *isbn TEXT
  title TEXT
  year INTEGER
  pub_id INTEGER -> publisher.pub_id
table member
  *member_id INTEGER
  name TEXT
table borrows
  *member_id INTEGER -> member.member_id
  *isbn TEXT -> book.isbn
  *issue_date DATE
  due_date DATE
'''),
  CsDiagramSample.dfaEnds01 => CsDiagram(type: CsDiagramType.automaton, title: 'DFA: strings ending in 01', input: '1101', spec: '''
start q0
accept q2
q0 -> q1 : 0
q0 -> q0 : 1
q1 -> q1 : 0
q1 -> q2 : 1
q2 -> q1 : 0
q2 -> q0 : 1
'''),
  CsDiagramSample.dfaEvenZeros => CsDiagram(type: CsDiagramType.automaton, title: 'DFA: an even number of 0s', input: '1001', spec: '''
start even
accept even
even -> odd : 0
odd -> even : 0
even -> even : 1
odd -> odd : 1
'''),
  CsDiagramSample.nfaContains01 => CsDiagram(type: CsDiagramType.automaton, title: 'NFA: strings containing 01', input: '1101', spec: '''
start p
accept r
p -> p : 0, 1
p -> q : 0
q -> r : 1
r -> r : 0, 1
'''),
};

/// A small starting diagram of each kind.
CsDiagram blankDiagram(CsDiagramType t) => CsDiagram(
  type: t,
  title: '',
  spec: switch (t) {
    CsDiagramType.classes => 'class Student\n  - usn: String\n  + register(): void\nclass Course\n  - code: String\nStudent "*" -- "*" Course : takes\n',
    CsDiagramType.useCase => 'system My system\nactor User\nusecase Log in\nUser -- Log in\n',
    CsDiagramType.sequence => 'actor User\nparticipant :System\nUser -> :System : request\n:System ..> User : reply\n',
    CsDiagramType.activity => 'start\naction First step\nend\n[*] -> First step\nFirst step -> [*]\n',
    CsDiagramType.state => 'state Idle\nstate Busy\n[*] -> Idle\nIdle -> Busy : start\nBusy -> Idle : done\n',
    CsDiagramType.er => 'entity Student\n  *usn\n  name\nentity Course\n  *code\nrelationship Takes\nStudent -- Takes : M\nTakes -- Course : N\n',
    CsDiagramType.schema => 'table student\n  *usn TEXT\n  name TEXT\n',
    CsDiagramType.automaton => 'start q0\naccept q1\nq0 -> q1 : a\nq1 -> q1 : a, b\n',
  },
);

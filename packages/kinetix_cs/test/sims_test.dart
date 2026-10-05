import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

void main() {
  group('number systems', () {
    test('parse and convert between bases, with working', () {
      expect(parseInBase('0b1011', 2), 11);
      expect(parseInBase('1111 0000', 2), 240);
      expect(parseInBase('0x1F', 16), 31);
      expect(parseInBase('17', 8), 15);
      expect(parseInBase('12', 2), isNull);
      expect(divisionSteps(13, 2), [(13, 6, 1), (6, 3, 0), (3, 1, 1), (1, 0, 1)]);
      expect(divisionSteps(0, 2), [(0, 0, 0)]);
      expect(placeValues('101', 2), '1×2^2 + 0×2^1 + 1×2^0');
    });

    test("two's complement and bitwise operations", () {
      expect(twosComplement(-5, 8), '11111011');
      expect(twosComplement(127, 8), '01111111');
      expect(twosComplement(128, 8), isNull);
      expect(twosComplement(-128, 8), '10000000');
      expect(fromTwosComplement('11111011'), -5);
      expect(nibbles('101101'), '0010 1101');
      expect(bitOp(BitOp.and, 12, 10), 8);
      expect(bitOp(BitOp.or, 12, 10), 14);
      expect(bitOp(BitOp.xor, 12, 10), 6);
      expect(bitOp(BitOp.not, 12, 0), 243);
      expect(bitOp(BitOp.shl, 200, 1), 144);
      expect(bitOp(BitOp.shr, 200, 2), 50);
    });
  });

  group('logic', () {
    test('truth tables use the lab gates, every notation', () {
      final xor = BoolExpr.parse('A XOR B');
      expect([for (final r in xor.truthTable()) r.$2], [false, true, true, false]);
      for (final s in ["A'B + AB'", '(!A & B) | (A & ~B)', 'NOT A AND B OR A AND NOT B', 'A ^ B', 'A ⊕ B']) {
        expect(BoolExpr.parse(s).minterms, [1, 2], reason: s);
      }
      expect(BoolExpr.parse('A NAND B').minterms, [0, 1, 2]);
      expect(BoolExpr.parse('A NOR B').minterms, [0]);
      expect(BoolExpr.parse('A XNOR B').minterms, [0, 3]);
      expect(BoolExpr.parse('AB + C').variables, ['A', 'B', 'C']);
      expect(BoolExpr.parse('AB + C').minterms, [1, 3, 5, 6, 7]);
      expect(BoolExpr.parse('A + 1').minterms, [0, 1]);
      expect(BoolExpr.parse('A XOR B').sumOfProducts, "A'B + AB'");
      expect(() => BoolExpr.parse('A +'), throwsFormatException);
      expect(() => BoolExpr.parse('(A'), throwsFormatException);
    });
  });

  group('networking', () {
    test('encapsulation wraps the data layer by layer', () {
      final e = encapsulate('Hi');
      expect(e.first.$1.number, 7);
      expect(e.last.$2, ['MAC', 'IP', 'TCP', 'Hi', 'FCS']);
      expect(e[3].$2, ['TCP', 'Hi']);
    });

    test('TCP sequence and acknowledgement numbers', () {
      final c = tcpConversation(clientIsn: 1000, serverIsn: 5000, dataBytes: 100);
      expect(c.take(3).map((s) => s.toString()), ['C→S SYN seq=1000', 'S→C SYN, ACK seq=5000 ack=1001', 'C→S ACK seq=1001 ack=5001']);
      expect(c[3].toString(), 'C→S PSH, ACK seq=1001 ack=5001 len=100');
      expect(c[4].ack, 1101);
      expect(c.last.toString(), 'C→S ACK seq=1102 ack=5002');
      expect(c.last.state, 'TIME-WAIT');
      expect(tcpConversation(), hasLength(7));
    });

    test('subnet calculator', () {
      final s = Subnet.parse('192.168.10.77/26')!;
      expect(ipv4(s.network), '192.168.10.64');
      expect(ipv4(s.mask), '255.255.255.192');
      expect(ipv4(s.wildcard), '0.0.0.63');
      expect(ipv4(s.broadcast), '192.168.10.127');
      expect(ipv4(s.firstHost), '192.168.10.65');
      expect(ipv4(s.lastHost), '192.168.10.126');
      expect(s.hosts, 62);
      expect(s.ipClass, 'C');
      expect(s.isPrivate, isTrue);
      expect(Subnet.parse('10.1.2.3 255.0.0.0')!.prefix, 8);
      expect(Subnet.parse('8.8.8.8/24')!.isPrivate, isFalse);
      expect(Subnet.parse('10.0.0.1/33'), isNull);
      expect(Subnet.parse('300.0.0.1/8'), isNull);
      expect(Subnet.parse('10.0.0.1 255.0.255.0'), isNull);
      expect(Subnet.parse('10.0.0.1/31')!.hosts, 2);
      expect(ipv4Bits(s.mask), '11111111.11111111.11111111.11000000');
      expect(Subnet.parse('192.168.1.0/24')!.split(3).map((x) => '$x'), ['192.168.1.0/26', '192.168.1.64/26', '192.168.1.128/26', '192.168.1.192/26']);
      expect(Subnet.parse('192.168.1.0/29')!.split(4), isEmpty);
    });
  });

  group('CPU scheduling', () {
    const procs = [Proc('P1', 0, 8, priority: 3), Proc('P2', 1, 4, priority: 1), Proc('P3', 2, 9, priority: 4), Proc('P4', 3, 5, priority: 2)];

    test('FCFS', () {
      final s = schedule(procs, Sched.fcfs);
      expect(s.gantt, const [Slice('P1', 0, 8), Slice('P2', 8, 12), Slice('P3', 12, 21), Slice('P4', 21, 26)]);
      expect(s.avgWaiting, (0 + 7 + 10 + 18) / 4);
    });

    test('SJF (non-pre-emptive) and SRTF', () {
      expect(schedule(procs, Sched.sjf).gantt.map((x) => x.id), ['P1', 'P2', 'P4', 'P3']);
      final srtf = schedule(procs, Sched.srtf);
      expect(srtf.gantt, const [Slice('P1', 0, 1), Slice('P2', 1, 5), Slice('P4', 5, 10), Slice('P1', 10, 17), Slice('P3', 17, 26)]);
      expect(srtf.avgWaiting, 6.5);
    });

    test('priority, both kinds', () {
      expect(schedule(procs, Sched.priority).gantt.map((x) => x.id), ['P1', 'P2', 'P4', 'P3']);
      expect(schedule(procs, Sched.priorityPreemptive).gantt, const [Slice('P1', 0, 1), Slice('P2', 1, 5), Slice('P4', 5, 10), Slice('P1', 10, 17), Slice('P3', 17, 26)]);
    });

    test('round robin, new arrivals queue before the pre-empted process', () {
      final s = schedule(const [Proc('P1', 0, 5), Proc('P2', 1, 3), Proc('P3', 2, 1), Proc('P4', 3, 2), Proc('P5', 4, 3)], Sched.roundRobin, quantum: 2);
      expect(s.gantt.map((x) => '$x').join(' '), 'P1[0-2] P2[2-4] P3[4-5] P1[5-7] P4[7-9] P5[9-11] P2[11-12] P1[12-13] P5[13-14]');
      final p1 = s.results.first;
      expect((p1.completion, p1.turnaround, p1.waiting, p1.response), (13, 13, 8, 0));
    });

    test('idle CPU between arrivals', () {
      final s = schedule(const [Proc('A', 2, 2), Proc('B', 10, 1)], Sched.fcfs);
      expect(s.gantt, const [Slice(null, 0, 2), Slice('A', 2, 4), Slice(null, 4, 10), Slice('B', 10, 11)]);
      expect(schedule(const [Proc('A', 3, 2)], Sched.roundRobin).gantt.first, const Slice(null, 0, 3));
    });
  });

  group('page replacement', () {
    const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
    int faults(PageAlgo a, int frames, [List<int> r = refs]) => pageReplacement(r, frames, a).where((s) => !s.hit).length;

    test('the textbook string with 3 frames', () {
      expect(faults(PageAlgo.fifo, 3), 15);
      expect(faults(PageAlgo.lru, 3), 12);
      expect(faults(PageAlgo.optimal, 3), 9);
    });

    test("Belady's anomaly under FIFO", () {
      const b = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
      expect(faults(PageAlgo.fifo, 3, b), 9);
      expect(faults(PageAlgo.fifo, 4, b), 10);
    });

    test('victims and frames are reported', () {
      final s = pageReplacement([1, 2, 3, 1], 2, PageAlgo.lru);
      expect(s[2].victim, 1);
      expect(s[2].frames, [3, 2]);
      expect(s[3].victim, 2);
    });
  });

  group("banker's algorithm", () {
    const alloc = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]];
    const max = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]];
    const avail = [3, 3, 2];

    test('the textbook safe sequence', () {
      final r = banker(allocation: alloc, max: max, available: avail);
      expect(r.safe, isTrue);
      expect(r.need[0], [7, 4, 3]);
      expect(r.sequence, [1, 3, 4, 0, 2]);
      expect(r.steps.last.workAfter, [10, 5, 7]);
    });

    test('requests', () {
      expect(bankerRequest(allocation: alloc, max: max, available: avail, process: 1, request: [1, 0, 2]), isNull);
      expect(bankerRequest(allocation: alloc, max: max, available: avail, process: 4, request: [5, 0, 0]), 'bankerExceedsNeed');
      expect(bankerRequest(allocation: alloc, max: max, available: avail, process: 4, request: [3, 3, 1]), 'bankerUnsafe');
      expect(bankerRequest(allocation: alloc, max: max, available: avail, process: 0, request: [4, 0, 0]), 'bankerMustWait');
      expect(bankerRequest(allocation: alloc, max: max, available: [2, 3, 0], process: 0, request: [0, 2, 0]), 'bankerUnsafe');
    });

    test('an unsafe state', () {
      final r = banker(allocation: const [[1, 0], [0, 1]], max: const [[2, 1], [1, 2]], available: const [0, 0]);
      expect(r.safe, isFalse);
      expect(r.sequence, isEmpty);
    });
  });

  group('normalisation', () {
    test('closure, keys and normal forms', () {
      final fds = parseFds('A->B, B->C');
      expect(show(closure({'A'}, fds)), 'ABC');
      expect(candidateKeys({'A', 'B', 'C'}, fds).map(show), ['A']);
      final (nf, v) = normalForm({'A', 'B', 'C'}, fds);
      expect(nf, NormalForm.second);
      expect(v.single.fd.toString(), 'B → C');
    });

    test('partial dependencies break 2NF; prime-attribute dependencies only BCNF', () {
      expect(normalForm(attrsOf('ABC'), parseFds('AB->C, A->D')).$1, NormalForm.first);
      final r = attrsOf('ABC');
      final fds = parseFds('AB->C; C->B');
      expect(candidateKeys(r, fds).map(show).toList(), ['AB', 'AC']);
      expect(normalForm(r, fds).$1, NormalForm.third);
      expect(normalForm(r, parseFds('A->BC')).$1, NormalForm.bcnf);
    });

    test('words as attributes', () {
      final fds = parseFds('roll -> name, course; course -> fee');
      final r = {'roll', 'name', 'course', 'fee'};
      expect(candidateKeys(r, fds).map(show), ['roll']);
      expect(normalForm(r, fds).$1, NormalForm.second);
      expect(decompose3nf(r, fds).map(show).toSet(), {'course, name, roll', 'course, fee'});
    });

    test('minimal cover', () {
      final g = minimalCover(parseFds('A->BC, B->C, AB->D'));
      expect(g.map((f) => '$f').toSet(), {'A → B', 'B → C', 'A → D'});
    });

    test('3NF synthesis and BCNF decomposition are lossless covers of R', () {
      final r = attrsOf('ABCDE');
      final fds = parseFds('A->B, B->C, CD->E');
      final three = decompose3nf(r, fds);
      expect(three.map(show).toSet(), {'AB', 'BC', 'CDE', 'AD'});
      final bcnf = decomposeBcnf(r, fds);
      expect({for (final s in bcnf) ...s}, r);
      for (final s in bcnf) {
        final local = [for (final f in fds) if (s.containsAll(f.lhs) && s.containsAll(f.rhs)) f];
        expect(normalForm(s, local).$1, NormalForm.bcnf, reason: show(s));
      }
      expect(decomposeBcnf(attrsOf('ABC'), parseFds('AB->C; C->B')).map(show).toSet(), {'BC', 'AC'});
    });
  });
}

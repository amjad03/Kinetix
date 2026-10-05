import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/board/kit/college/finance.dart';
import 'package:kinetix_board/features/board/kit/college/pert.dart';
import 'package:kinetix_board/features/board/kit/college/stats.dart';

void main() {
  group('commerce calculators (textbook values)', () {
    test('depreciation: SLM and WDV', () {
      final slm = depreciationSlm(cost: 100000, scrap: 10000, life: 5);
      expect(slm.answer, contains('₹18,000.00'));
      expect(slm.table!.last, ['5', '28000', '18000', '10000']);
      final wdv = depreciationWdv(cost: 100000, rate: 10, years: 3);
      expect([for (final r in wdv.table!.skip(1)) r[2]], ['10000', '9000', '8100']);
      expect(wdv.answer, contains('₹72,900.00'));
      expect(wdvRateFor(cost: 100000, scrap: 10000, life: 5), closeTo(36.904, 1e-3));
    });

    test('simple and compound interest, EMI', () {
      expect(simpleInterest(principal: 10000, rate: 10, years: 2).answer, contains('₹12,000.00'));
      expect(compoundInterest(principal: 10000, rate: 10, years: 2).answer, contains('₹2,100.00'));
      expect(compoundInterest(principal: 10000, rate: 12, years: 1, perYear: 4).answer, contains('₹1,255.09'));
      expect(emiOf(1000000, 10, 240), closeTo(9650.22, 0.005));
      expect(emi(principal: 1000000, rate: 10, months: 240).answer, contains('₹9,650.22'));
    });

    test('GST: CGST + SGST within a state, IGST between states, tax-inclusive', () {
      final intra = gst(amount: 1000, rate: 18, interState: false);
      expect(intra.steps, contains('Intra-state supply: CGST @ 9% = ₹90.00'));
      expect(intra.answer, contains('₹1,180.00'));
      expect(gst(amount: 1000, rate: 18, interState: true).steps.last, contains('IGST @ 18% = ₹180.00'));
      expect(gst(amount: 1180, rate: 18, interState: false, inclusive: true).steps.first, contains('₹1,000.00'));
    });

    test('NPV, IRR and payback', () {
      expect(npvOf(10, 1000, [500, 400, 300, 100]), closeTo(78.82, 0.01));
      expect(irrOf(1000, [500, 400, 300, 100]), closeTo(14.489, 0.001));
      expect(irrOf(100, [110]), closeTo(10, 1e-6));
      expect(paybackOf(100000, [30000, 40000, 50000]), closeTo(2.6, 1e-9));
      expect(paybackOf(100, [10, 10]), isNull);
      final w = npv(outlay: 1000, flows: [500, 400, 300, 100], rate: 10);
      expect(w.answer, 'NPV = ₹78.82');
      expect(w.steps, contains('IRR (NPV = 0) = 14.49%'));
    });

    test('break-even reuses the lab model', () {
      final w = breakEven(fixedCost: 60000, variableCost: 30, price: 50, units: 5000);
      expect(w.answer, 'BEP = 3000 units = ₹1,50,000.00');
      expect(w.steps.any((s) => s.contains('Margin of safety') && s.contains('₹1,00,000.00') && s.contains('40%')), isTrue);
      expect(breakEven(fixedCost: 1, variableCost: 5, price: 5, units: 1).answer, startsWith('No break-even'));
    });

    test('ratios', () {
      final w = ratios(const RatioInputs(currentAssets: 200000, currentLiabilities: 100000, inventory: 50000, prepaid: 10000, netProfit: 50000, revenue: 500000));
      expect(w.steps, contains('Current ratio = Current assets ÷ Current liabilities = 200000 ÷ 100000 = 2:1'));
      expect(w.steps.any((s) => s.startsWith('Quick ratio') && s.endsWith('= 1.4:1')), isTrue);
      expect(w.steps.any((s) => s.startsWith('Net profit ratio') && s.endsWith('= 10%')), isTrue);
    });
  });

  group('statistics (textbook values)', () {
    test('descriptive measures', () {
      final d = Descriptive([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(d.mean, 5);
      expect(d.median, 4.5);
      expect(d.modes, [4]);
      expect(d.sd, 2);
      expect(d.sampleSd, closeTo(2.13809, 1e-5));
      expect(d.q1, 4);
      expect(d.q3, 6.5);
      expect(d.histogram(4).counts, [1, 5, 1, 1]);
      expect(parseNumbers('2, 4\n4;4 5\t5 x 7'), [2, 4, 4, 4, 5, 5, 7]);
    });

    test('distributions and their tables', () {
      expect(normalCdf(1.96), closeTo(0.975, 1e-4));
      expect(normalInv(0.975), closeTo(1.959964, 1e-6));
      expect(normalInv(0.01), closeTo(-2.326348, 1e-6));
      expect(binomialPmf(10, 0.5, 5), closeTo(0.246094, 1e-6));
      expect(poissonPmf(2, 0), closeTo(0.135335, 1e-6));
      expect(tInv(0.975, 10), closeTo(2.228, 1e-3));
      expect(tInv(0.95, 20), closeTo(1.725, 1e-3));
      expect(chiSquareInv(0.95, 5), closeTo(11.070, 1e-3));
      expect(chiSquareInv(0.95, 1), closeTo(3.841, 1e-3));
      expect(fInv(0.95, 2, 6), closeTo(5.143, 1e-3));
      expect(fInv(0.95, 3, 20), closeTo(3.098, 1e-3));
      expect(tPdf(0, 1), closeTo(1 / 3.141592653589793, 1e-9));
      expect(chiSquarePdf(2, 2), closeTo(0.5 * 0.36787944, 1e-8));
    });

    test('correlation and regression', () {
      final r = Regression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
      expect(r.r, closeTo(0.774597, 1e-6));
      expect(r.b, closeTo(0.6, 1e-12));
      expect(r.a, closeTo(2.2, 1e-12));
      expect(r.working.answer, 'y = 2.2 + 0.6x, r = 0.7746');
    });

    test('tests of hypotheses', () {
      final z = zTest(mean: 52, mu0: 50, sd: 10, n: 100);
      expect(z.statistic, closeTo(2, 1e-12));
      expect(z.p, closeTo(0.0455, 1e-4));
      expect(z.reject, isTrue);
      final t1 = tTestOne(data: [10, 12, 9, 11, 13, 8, 10, 12], mu0: 10);
      expect(t1.statistic, closeTo(1.049109, 1e-6));
      expect(t1.critical, closeTo(2.365, 1e-3));
      expect(t1.reject, isFalse);
      final t2 = tTestTwo(a: [10, 12, 9, 11, 13], b: [8, 9, 7, 10, 6]);
      expect(t2.statistic, closeTo(3, 1e-9));
      expect(t2.critical, closeTo(2.306, 1e-3));
      expect(t2.reject, isTrue);
      final gof = chiSquareTest(observed: [[50, 30, 20]], expected: [40, 40, 20]);
      expect(gof.statistic, closeTo(5, 1e-12));
      expect(gof.critical, closeTo(5.991, 1e-3));
      expect(gof.reject, isFalse);
      final ct = chiSquareTest(observed: [[20, 30], [30, 20]]);
      expect(ct.statistic, closeTo(4, 1e-12));
      expect(ct.reject, isTrue);
      final f = anova([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(f.statistic, closeTo(27, 1e-9));
      expect(f.working.table![1], ['Between groups', '54', '2', '27', '27']);
      expect(f.reject, isTrue);
    });

    test('index numbers and moving averages', () {
      // p0, q0, p1, q1
      final rows = [[10.0, 4.0, 12.0, 6.0], [8.0, 6.0, 10.0, 5.0]];
      final i = priceIndices(rows);
      expect(i.laspeyres, closeTo((12 * 4 + 10 * 6) / (10 * 4 + 8 * 6) * 100, 1e-9));
      expect(i.paasche, closeTo((12 * 6 + 10 * 5) / (10 * 6 + 8 * 5) * 100, 1e-9));
      expect(i.fisher, closeTo(122.363, 1e-3));
      expect(movingAverage([1, 2, 3, 4, 5], 3), [null, 2, 3, 4, null]);
      expect(movingAverage([1, 2, 3, 4, 5, 6], 4), [null, null, 3, 4, null, null]);
    });
  });

  group('PERT / CPM', () {
    List<Activity> net(String s) => [for (final l in s.split('\n')) Activity.parse(l)!];

    test('finds the critical path and the slack', () {
      final s = Schedule.of(net('A 3\nB 4\nC 2 A\nD 5 A\nE 1 B,C\nF 4 D,E'))!;
      expect(s.duration, 12);
      expect(s.criticalPath, ['A', 'D', 'F']);
      expect(s.items['B']!.slack, 3);
      expect(s.items['C']!.slack, 2);
      expect(s.items['E']!.ls, 7);
      expect(s.table.first, ['Activity', 'Time', 'ES', 'EF', 'LS', 'LF', 'Slack']);
    });

    test('three time estimates, names, and broken networks', () {
      final a = Activity.parse('B: Design 2,4,6 A')!;
      expect(a.name, 'Design');
      expect(a.expected, 4);
      expect(a.variance, closeTo(4 / 9, 1e-12));
      final s = Schedule.of(net('A 1,2,9\nB 2,4,6 A'))!;
      expect(s.duration, closeTo(7, 1e-12));
      expect(s.variance, closeTo(16 / 9 + 4 / 9, 1e-12));
      expect(Schedule.of(net('A 1 B\nB 1 A')), isNull);
      expect(Schedule.of(net('A 1 Z')), isNull);
    });
  });
}

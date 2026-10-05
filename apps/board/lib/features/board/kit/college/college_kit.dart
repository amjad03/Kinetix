import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../builders.dart' show timeline;
import '../subjects.dart';
import 'calculator_dialog.dart';
import 'college_builders.dart';
import 'finance.dart';
import 'law_reader.dart';
import 'pert.dart';
import 'sheet_editor.dart';
import 'stats.dart';

/// The college tabs of the subject kit: accounts formats, commerce calculators, management
/// frameworks, law, and statistics. Everything goes on the board as ordinary elements (sheets,
/// notes, shapes, text), so it can be edited, moved and saved, and works offline.
class CollegeKitTab extends StatelessWidget {
  const CollegeKitTab({super.key, required this.tab, required this.wb, required this.accent, required this.ink, this.onOpenLab});

  final KitTab tab;
  final WhiteboardController wb;
  final Color accent, ink;

  /// Opens the virtual labs (the break-even lab lives there).
  final VoidCallback? onOpenLab;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget item(String key, IconData icon, String label, VoidCallback onTap) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('college-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: const Icon(Icons.add), onTap: onTap),
    );
    void put(List<BoardElement> els) => wb.insert(els);
    Future<void> calc(CalcSpec spec) async {
      final els = await showCalculator(context, spec, ink: ink, accent: accent);
      if (els != null && els.isNotEmpty) put(els);
    }

    final children = switch (tab) {
      KitTab.accounts => [
        section(l.accFormats),
        for (final (t, label) in [
          (AccountsTemplate.journal, l.accJournal),
          (AccountsTemplate.ledger, l.accLedger),
          (AccountsTemplate.trialBalance, l.accTrialBalance),
          (AccountsTemplate.finalAccounts, l.accFinalAccounts),
          (AccountsTemplate.balanceSheet, l.accBalanceSheet),
          (AccountsTemplate.cashBook, l.accCashBook),
          (AccountsTemplate.bankReconciliation, l.accBrs),
        ])
          item(t.name, Icons.table_chart_outlined, label, () => put(accountsTemplate(t, ink, accent))),
        item('sheet', Icons.grid_on, l.accBlankSheet, () async {
          final s = await editSheet(context, blankSheet(accent));
          if (s != null) put([s]);
        }),
      ],
      KitTab.finance => [
        for (final (key, icon, label, spec) in financeCalculators(l, onOpenLab: onOpenLab)) item(key, icon, label, () => calc(spec)),
      ],
      KitTab.management => [
        section(l.mgStrategy),
        for (final (f, label) in [
          (Frame.swot, l.mgSwot),
          (Frame.pestle, l.mgPestle),
          (Frame.porter, l.mgPorter),
          (Frame.bcg, l.mgBcg),
          (Frame.ansoff, l.mgAnsoff),
          (Frame.valueChain, l.mgValueChain),
          (Frame.mckinsey7s, l.mg7s),
        ])
          item(f.name, Icons.dashboard_outlined, label, () => put(frame(f, ink, accent))),
        section(l.mgMarketing),
        for (final (f, label) in [(Frame.maslow, l.mgMaslow), (Frame.marketingMix4p, l.mg4p), (Frame.marketingMix7p, l.mg7p)])
          item(f.name, Icons.dashboard_outlined, label, () => put(frame(f, ink, accent))),
        section(l.mgProjects),
        item('gantt', Icons.view_timeline_outlined, l.mgGantt, () => calc(projectSpec(l, gantt: true))),
        item('pert', Icons.account_tree_outlined, l.mgPert, () => calc(projectSpec(l, gantt: false))),
        for (final (f, label) in [(Frame.decisionTree, l.mgDecisionTree), (Frame.fishbone, l.mgFishbone), (Frame.mindMap, l.mgMindMap), (Frame.caseStudy, l.mgCaseStudy)])
          item(f.name, Icons.dashboard_outlined, label, () => put(frame(f, ink, accent))),
      ],
      KitTab.law => [
        Padding(
          padding: const EdgeInsets.only(top: Kx.s8),
          child: FilledButton.tonalIcon(
            key: const Key('college-reader'),
            onPressed: () => openLawReader(context, wb, accent),
            icon: const Icon(Icons.menu_book_outlined),
            label: Text(l.lawReader),
          ),
        ),
        section(l.lawFrames),
        for (final (f, label) in [(Frame.caseBrief, l.lawCaseBrief), (Frame.irac, l.lawIrac), (Frame.argumentMap, l.lawArgumentMap)])
          item(f.name, Icons.gavel_outlined, label, () => put(frame(f, ink, accent))),
        item('timeline', Icons.timeline, l.lawTimeline, () => calc(lawTimelineSpec(l))),
      ],
      KitTab.stats => [for (final (key, icon, label, spec) in statsCalculators(l)) item(key, icon, label, () => calc(spec))],
      _ => const <Widget>[],
    };
    return ListView(padding: const EdgeInsets.all(Kx.s12), children: children);
  }
}

// --- Calculator specs -----------------------------------------------------------------------

typedef CalcEntry = (String key, IconData icon, String label, CalcSpec spec);

List<double> _list(CalcInput i, String k) {
  final v = parseNumbers(i.text[k] ?? '');
  if (v.isEmpty) throw FormatException(k);
  return v;
}

List<CalcEntry> financeCalculators(AppLocalizations l, {VoidCallback? onOpenLab}) => [
  (
    'depreciation',
    Icons.trending_down,
    l.calcDepreciation,
    CalcSpec(
      title: l.calcDepreciation,
      choices: [('slm', l.methodSlm), ('wdv', l.methodWdv)],
      fields: [
        CalcField('cost', l.fCost, initial: '100000'),
        CalcField('scrap', l.fScrap, initial: '10000', only: const {'slm'}),
        CalcField('life', l.fLife, initial: '5', only: const {'slm'}),
        CalcField('rate', l.fRate, initial: '10', only: const {'wdv'}),
        CalcField('years', l.fYears, initial: '3', only: const {'wdv'}),
      ],
      compute: (i) => CalcOutput(
        i.choice == 'slm'
            ? depreciationSlm(cost: i.num('cost'), scrap: i.opt('scrap') ?? 0, life: _positive(i.num('life')))
            : depreciationWdv(cost: i.num('cost'), rate: i.num('rate'), years: i.whole('years')),
      ),
    ),
  ),
  (
    'ratios',
    Icons.percent,
    l.calcRatios,
    CalcSpec(
      title: l.calcRatios,
      fields: [
        CalcField('ca', l.fCurrentAssets, initial: '200000'),
        CalcField('cl', l.fCurrentLiabilities, initial: '100000'),
        CalcField('inv', l.fInventory, initial: '50000'),
        CalcField('pre', l.fPrepaid),
        CalcField('debt', l.fDebt),
        CalcField('eq', l.fEquity),
        CalcField('rev', l.fRevenue),
        CalcField('gp', l.fGrossProfit),
        CalcField('np', l.fNetProfit),
        CalcField('cogs', l.fCogs),
        CalcField('ai', l.fAvgInventory),
        CalcField('rec', l.fReceivables),
        CalcField('ebit', l.fEbit),
        CalcField('int', l.fInterest),
        CalcField('ta', l.fTotalAssets),
      ],
      compute: (i) => CalcOutput(
        ratios(
          RatioInputs(
            currentAssets: i.opt('ca'),
            currentLiabilities: i.opt('cl'),
            inventory: i.opt('inv'),
            prepaid: i.opt('pre'),
            debt: i.opt('debt'),
            equity: i.opt('eq'),
            revenue: i.opt('rev'),
            grossProfit: i.opt('gp'),
            netProfit: i.opt('np'),
            cogs: i.opt('cogs'),
            averageInventory: i.opt('ai'),
            receivables: i.opt('rec'),
            ebit: i.opt('ebit'),
            interest: i.opt('int'),
            totalAssets: i.opt('ta'),
          ),
        ),
      ),
    ),
  ),
  (
    'npv',
    Icons.savings_outlined,
    l.calcNpv,
    CalcSpec(
      title: l.calcNpv,
      fields: [
        CalcField('outlay', l.fOutlay, initial: '1000'),
        CalcField('flows', l.fCashFlows, initial: '500 400 300 100', lines: 2),
        CalcField('rate', l.fDiscountRate, initial: '10'),
      ],
      compute: (i) => CalcOutput(npv(outlay: _positive(i.num('outlay')), flows: _list(i, 'flows'), rate: i.num('rate'))),
    ),
  ),
  (
    'breakEven',
    Icons.balance,
    l.calcBreakEven,
    CalcSpec(
      title: l.calcBreakEven,
      fields: [
        CalcField('fc', l.fFixedCost, initial: '60000'),
        CalcField('vc', l.fVariableCost, initial: '30'),
        CalcField('sp', l.fPrice, initial: '50'),
        CalcField('units', l.fUnits, initial: '5000'),
      ],
      compute: (i) => CalcOutput(breakEven(fixedCost: i.num('fc'), variableCost: i.num('vc'), price: _positive(i.num('sp')), units: i.num('units'))),
      extraAction: onOpenLab == null ? null : (l.calcOpenLab, onOpenLab),
    ),
  ),
  (
    'gst',
    Icons.receipt_long_outlined,
    l.calcGst,
    CalcSpec(
      title: l.calcGst,
      fields: [CalcField('amount', l.fAmount, initial: '1000'), CalcField('rate', l.fGstRate, initial: '18')],
      toggles: [('inter', l.fInterState, false), ('incl', l.fInclusive, false)],
      compute: (i) => CalcOutput(gst(amount: i.num('amount'), rate: i.num('rate'), interState: i.on['inter']!, inclusive: i.on['incl']!)),
    ),
  ),
  (
    'interest',
    Icons.account_balance_outlined,
    l.calcInterest,
    CalcSpec(
      title: l.calcInterest,
      choices: [('si', l.interestSimple), ('ci', l.interestCompound)],
      fields: [
        CalcField('p', l.fPrincipal, initial: '10000'),
        CalcField('r', l.fRate, initial: '10'),
        CalcField('t', l.fYears, initial: '2'),
        CalcField('m', l.fCompounding, initial: '1', only: const {'ci'}),
      ],
      compute: (i) => CalcOutput(
        i.choice == 'si'
            ? simpleInterest(principal: i.num('p'), rate: i.num('r'), years: i.num('t'))
            : compoundInterest(principal: i.num('p'), rate: i.num('r'), years: i.num('t'), perYear: math.max(1, i.whole('m'))),
      ),
    ),
  ),
  (
    'emi',
    Icons.calendar_month_outlined,
    l.calcEmi,
    CalcSpec(
      title: l.calcEmi,
      fields: [CalcField('p', l.fPrincipal, initial: '1000000'), CalcField('r', l.fRate, initial: '10'), CalcField('n', l.fMonths, initial: '240')],
      compute: (i) => CalcOutput(emi(principal: i.num('p'), rate: i.num('r'), months: math.max(1, i.whole('n')))),
    ),
  ),
];

double _positive(double v) => v > 0 ? v : throw const FormatException('must be positive');

/// Gantt chart or PERT network from typed activities.
CalcSpec projectSpec(AppLocalizations l, {required bool gantt}) => CalcSpec(
  title: gantt ? l.mgGantt : l.mgPert,
  fields: [CalcField('acts', l.pertActivities, initial: 'A 3\nB 4\nC 2 A\nD 5 A\nE 1 B,C\nF 4 D,E', lines: 6, hint: l.pertHint)],
  compute: (i) {
    final acts = [
      for (final line in (i.text['acts'] ?? '').split('\n'))
        if (line.trim().isNotEmpty) Activity.parse(line) ?? (throw FormatException(line)),
    ];
    final s = acts.isEmpty ? null : Schedule.of(acts);
    if (s == null) throw FormatException(l.pertInvalid);
    final w = Working('Forward and backward pass', [
      'ES = latest EF of the activities before it; EF = ES + t',
      'LF = earliest LS of the activities after it; LS = LF − t; slack = LS − ES',
      if (acts.any((a) => a.isPert)) 'PERT time t = (o + 4m + p) ÷ 6; σ² = ((p − o) ÷ 6)²',
    ], 'Critical path: ${s.criticalPath.join(' → ')}, duration ${n2(s.duration)}', table: s.table);
    return CalcOutput(w, charts: [(ink, accent) => gantt ? ganttChart(s, ink, accent) : pertNetwork(s, ink, accent)]);
  },
);

/// Dated events along a line.
CalcSpec lawTimelineSpec(AppLocalizations l) => CalcSpec(
  title: l.lawTimeline,
  fields: [CalcField('ev', l.lawTimeline, initial: '1 Apr 2024 — Contract signed\n15 Jun 2024 — Goods delivered late\n2 Jul 2024 — Notice sent', lines: 5, hint: l.lawTimelineHint)],
  compute: (i) {
    final events = [
      for (final line in (i.text['ev'] ?? '').split('\n'))
        if (line.trim().isNotEmpty) _event(line.trim()),
    ];
    if (events.isEmpty) throw const FormatException('no events');
    return CalcOutput(null, charts: [(ink, accent) => timeline(events, ink, accent)]);
  },
);

(String, String) _event(String line) {
  final m = RegExp(r'^(.*?)\s*(?:—|–|-|:|\t)\s+(.*)$').firstMatch(line) ?? RegExp(r'^(.*?)\s*(?:—|–|:|\t)\s*(.*)$').firstMatch(line);
  return m == null ? (line, '') : (m[1]!.trim(), m[2]!.trim());
}

List<CalcEntry> statsCalculators(AppLocalizations l) => [
  (
    'descriptive',
    Icons.analytics_outlined,
    l.stDescriptive,
    CalcSpec(
      title: l.stDescriptive,
      fields: [CalcField('data', l.stData, initial: '2 4 4 4 5 5 7 9', lines: 3, hint: l.stDataHint)],
      toggles: [('box', l.stBoxPlot, true), ('hist', l.stHistogram, false)],
      compute: (i) {
        final d = Descriptive(_list(i, 'data'));
        return CalcOutput(d.working, charts: [
          if (i.on['box']!) (ink, accent) => boxPlot(d, ink, accent),
          if (i.on['hist']!) (ink, accent) => histogramChart(d, ink, accent),
        ]);
      },
    ),
  ),
  ('distributions', Icons.area_chart_outlined, l.stDistributions, _distributionSpec(l)),
  (
    'regression',
    Icons.scatter_plot_outlined,
    l.stRegression,
    CalcSpec(
      title: l.stRegression,
      fields: [CalcField('pairs', l.stData, initial: '1, 2\n2, 4\n3, 5\n4, 4\n5, 5', lines: 5, hint: l.stPairsHint)],
      toggles: [('chart', l.stDrawChart, true)],
      compute: (i) {
        final rows = parseRows(i.text['pairs'] ?? '').where((r) => r.length >= 2).toList();
        if (rows.length < 2) throw const FormatException('pairs');
        final r = Regression([for (final p in rows) p[0]], [for (final p in rows) p[1]]);
        if (!r.r.isFinite) throw const FormatException('constant');
        return CalcOutput(r.working, charts: [if (i.on['chart']!) (ink, accent) => scatterChart(r, ink, accent)]);
      },
    ),
  ),
  ('tests', Icons.rule, l.stTests, _testSpec(l)),
  (
    'index',
    Icons.price_change_outlined,
    l.stIndex,
    CalcSpec(
      title: l.stIndex,
      fields: [CalcField('rows', l.stData, initial: '10, 4, 12, 6\n8, 6, 10, 5', lines: 4, hint: l.stIndexHint)],
      compute: (i) {
        final rows = parseRows(i.text['rows'] ?? '').where((r) => r.length >= 4).toList();
        if (rows.isEmpty) throw const FormatException('rows');
        return CalcOutput(indexNumbers(rows));
      },
    ),
  ),
  (
    'movingAverage',
    Icons.stacked_line_chart,
    l.stMovingAverage,
    CalcSpec(
      title: l.stMovingAverage,
      fields: [
        CalcField('y', l.stData, initial: '12 15 14 18 20 19 23 25 24 28', lines: 3, hint: l.stSeriesHint),
        CalcField('k', l.stPeriod, initial: '3'),
      ],
      toggles: [('chart', l.stDrawChart, true)],
      compute: (i) {
        final y = _list(i, 'y');
        final k = i.whole('k');
        if (k < 2 || k > y.length) throw const FormatException('period');
        final ma = movingAverage(y, k);
        return CalcOutput(movingAverageWorking(y, k), charts: [if (i.on['chart']!) (ink, accent) => seriesChart(y, ma, k, ink, accent)]);
      },
    ),
  ),
];

CalcSpec _distributionSpec(AppLocalizations l) => CalcSpec(
  title: l.stDistributions,
  choices: [('normal', l.stNormal), ('binomial', l.stBinomial), ('poisson', l.stPoisson), ('t', l.stT), ('chi', l.stChiSquare)],
  fields: [
    CalcField('mu', l.stMean, initial: '0', only: const {'normal'}),
    CalcField('sd', l.stSd, initial: '1', only: const {'normal'}),
    CalcField('n', l.stTrials, initial: '10', only: const {'binomial'}),
    CalcField('p', l.stProbability, initial: '0.5', only: const {'binomial'}),
    CalcField('lambda', l.stLambda, initial: '2', only: const {'poisson'}),
    CalcField('df', l.stDf, initial: '10', only: const {'t', 'chi'}),
    CalcField('a', l.stFrom, initial: '-1.96', only: const {'normal', 't'}),
    CalcField('b', l.stTo, initial: '1.96', only: const {'normal', 't'}),
    CalcField('ka', l.stFrom, initial: '0', only: const {'binomial', 'poisson', 'chi'}),
    CalcField('kb', l.stTo, initial: '5', only: const {'binomial', 'poisson', 'chi'}),
  ],
  compute: (i) {
    String p4(double v) => v.toStringAsFixed(4);
    switch (i.choice) {
      case 'normal':
        final mu = i.num('mu'), sd = _positive(i.num('sd')), a = i.opt('a') ?? -1e13, b = i.opt('b') ?? 1e13;
        final z1 = (a - mu) / sd, z2 = (b - mu) / sd, pr = normalCdf(b, mu, sd) - normalCdf(a, mu, sd);
        return CalcOutput(
          Working('Normal distribution', [
            'z = (x − μ) ÷ σ',
            'z₁ = (${n2(a)} − ${n2(mu)}) ÷ ${n2(sd)} = ${n2(z1)},  z₂ = (${n2(b)} − ${n2(mu)}) ÷ ${n2(sd)} = ${n2(z2)}',
            'P = Φ(z₂) − Φ(z₁) = ${p4(normalCdf(z2))} − ${p4(normalCdf(z1))}',
          ], 'P(${n2(a)} ≤ X ≤ ${n2(b)}) = ${p4(pr)}'),
          charts: [(ink, accent) => distributionChart(Dist.normal, p1: mu, p2: sd, a: a, b: b, ink: ink, accent: accent)],
        );
      case 'binomial' || 'poisson':
        final bin = i.choice == 'binomial';
        final n = bin ? i.whole('n') : 0, p = bin ? i.num('p') : 0.0, lambda = bin ? 0.0 : _positive(i.num('lambda'));
        if (bin && (n < 1 || n > 200 || p < 0 || p > 1)) throw const FormatException('n, p');
        final ka = math.max(0, i.whole('ka')), kb = math.min(bin ? n : 1000, i.whole('kb'));
        var pr = 0.0;
        for (var k = ka; k <= kb; k++) {
          pr += bin ? binomialPmf(n, p, k) : poissonPmf(lambda, k);
        }
        return CalcOutput(
          Working(bin ? 'Binomial distribution' : 'Poisson distribution', [
            bin ? 'P(X = k) = ⁿCₖ pᵏ qⁿ⁻ᵏ, n = $n, p = ${n2(p)}, q = ${n2(1 - p)}' : 'P(X = k) = e^(−λ) λᵏ ÷ k!, λ = ${n2(lambda)}',
            'Mean = ${bin ? n2(n * p) : n2(lambda)}, variance = ${bin ? n2(n * p * (1 - p)) : n2(lambda)}',
            for (var k = ka; k <= math.min(kb, ka + 7); k++) 'P(X = $k) = ${p4(bin ? binomialPmf(n, p, k) : poissonPmf(lambda, k))}',
          ], 'P($ka ≤ X ≤ $kb) = ${p4(pr)}'),
          charts: [(ink, accent) => distributionChart(bin ? Dist.binomial : Dist.poisson, p1: bin ? n.toDouble() : lambda, p2: p, a: ka.toDouble(), b: kb.toDouble(), ink: ink, accent: accent)],
        );
      case 't':
        final df = _positive(i.num('df')), a = i.opt('a') ?? -1e13, b = i.opt('b') ?? 1e13;
        final pr = tCdf(b, df) - tCdf(a, df);
        return CalcOutput(
          Working('t distribution (df = ${df.round()})', [
            'P = F(${n2(b)}) − F(${n2(a)}) = ${p4(tCdf(b, df))} − ${p4(tCdf(a, df))}',
            'Two-tailed 5% critical value: ±${n2(tInv(0.975, df))}',
          ], 'P(${n2(a)} ≤ t ≤ ${n2(b)}) = ${p4(pr)}'),
          charts: [(ink, accent) => distributionChart(Dist.t, p1: df, a: a, b: b, ink: ink, accent: accent)],
        );
      default:
        final df = _positive(i.num('df')), a = math.max(0.0, i.opt('ka') ?? 0), b = i.opt('kb') ?? 1e13;
        final pr = chiSquareCdf(b, df) - chiSquareCdf(a, df);
        return CalcOutput(
          Working('Chi-square distribution (df = ${df.round()})', [
            'P = F(${n2(b)}) − F(${n2(a)}) = ${p4(chiSquareCdf(b, df))} − ${p4(chiSquareCdf(a, df))}',
            '5% critical value: ${n2(chiSquareInv(0.95, df))}',
          ], 'P(${n2(a)} ≤ χ² ≤ ${n2(b)}) = ${p4(pr)}'),
          charts: [(ink, accent) => distributionChart(Dist.chiSquare, p1: df, a: a, b: b, ink: ink, accent: accent)],
        );
    }
  },
);

CalcSpec _testSpec(AppLocalizations l) => CalcSpec(
  title: l.stTests,
  choices: [('z', l.stZTest), ('t1', l.stTTest1), ('t2', l.stTTest2), ('chi', l.stChiTest), ('anova', l.stAnova)],
  fields: [
    CalcField('mean', l.stSampleMean, initial: '52', only: const {'z'}),
    CalcField('sd', l.stSd, initial: '10', only: const {'z'}),
    CalcField('n', l.stSampleSize, initial: '100', only: const {'z'}),
    CalcField('data', l.stData, initial: '10 12 9 11 13 8 10 12', lines: 2, hint: l.stDataHint, only: const {'t1'}),
    CalcField('mu0', l.stMu0, initial: '50', only: const {'z', 't1'}),
    CalcField('a', l.stSample1, initial: '10 12 9 11 13', lines: 2, only: const {'t2'}),
    CalcField('b', l.stSample2, initial: '8 9 7 10 6', lines: 2, only: const {'t2'}),
    CalcField('obs', l.stData, initial: '20 30\n30 20', lines: 3, hint: l.stObservedHint, only: const {'chi'}),
    CalcField('exp', l.stExpectedHint, only: const {'chi'}),
    CalcField('groups', l.stData, initial: '1 2 3\n4 5 6\n7 8 9', lines: 4, hint: l.stGroupsHint, only: const {'anova'}),
    CalcField('alpha', l.stAlpha, initial: '0.05'),
  ],
  compute: (i) {
    final alpha = i.num('alpha');
    if (alpha <= 0 || alpha >= 1) throw const FormatException('alpha');
    final r = switch (i.choice) {
      'z' => zTest(mean: i.num('mean'), mu0: i.num('mu0'), sd: _positive(i.num('sd')), n: math.max(1, i.whole('n')), alpha: alpha),
      't1' => tTestOne(data: _atLeast(_list(i, 'data'), 2), mu0: i.num('mu0'), alpha: alpha),
      't2' => tTestTwo(a: _atLeast(_list(i, 'a'), 2), b: _atLeast(_list(i, 'b'), 2), alpha: alpha),
      'chi' => chiSquareTest(
        observed: parseRows(i.text['obs'] ?? '').isEmpty ? throw const FormatException('obs') : parseRows(i.text['obs']!),
        expected: parseNumbers(i.text['exp'] ?? '').isEmpty ? null : parseNumbers(i.text['exp']!),
        alpha: alpha,
      ),
      _ => anova(parseRows(i.text['groups'] ?? '').length < 2 ? throw const FormatException('groups') : parseRows(i.text['groups']!), alpha: alpha),
    };
    if (!r.statistic.isFinite) throw const FormatException('statistic');
    return CalcOutput(r.working);
  },
);

List<double> _atLeast(List<double> v, int n) => v.length >= n ? v : throw const FormatException('too few');

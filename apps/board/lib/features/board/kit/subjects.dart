import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../../core/models.dart';
import '../../../l10n/l10n.dart';
import '../../ai/ai_controller.dart';

/// Subjects taught from LKG to Class 12 and in college (B.Com, BBA, MBA, LLB, BSc). The class's subject reshapes the
/// board: its accent colour, its paper, the subject tools on the left rail, the order of the AI
/// tools on the right, and the tabs of its kit (ported from the KINETIX prototype).
enum Subject { maths, physics, chemistry, biology, science, evs, geography, history, civics, commerce, management, law, statistics, english, languages, computer, art, general }

/// The subject's own tools on the left rail.
enum SubjectTool { equation, graph, geometry, numberLine, circuit, atom, chemEquation, timeline, flowchart, code, fourLine, wordCard, grammar, sheet, reader, codeLab }

/// Tabs of the subject kit on the right. "This lesson" always comes first.
enum KitTab { lesson, formulas, physics, constants, periodic, ions, dates, words, logic, binary, stars, accounts, finance, management, law, stats, algorithms, csLabs, diagrams }

/// How a subject looks and what it brings.
class SubjectStyle {
  const SubjectStyle({
    required this.subject,
    required this.icon,
    required this.accent,
    required this.paper,
    required this.tools,
    required this.aiFirst,
    required this.tabs,
  });

  final Subject subject;
  final IconData icon;

  /// Material tone 40: readable on white, white text on it.
  final Color accent;
  final BoardBackground paper;
  final List<SubjectTool> tools;

  /// The AI tools this subject uses most, first.
  final List<AiView> aiFirst;
  final List<KitTab> tabs;

  /// A light tint of [accent] for chips and selected states.
  Color get container => Color.alphaBlend(accent.withValues(alpha: 0.12), Colors.white);
}

const subjectStyles = <Subject, SubjectStyle>{
  Subject.maths: SubjectStyle(
    subject: Subject.maths,
    icon: Icons.calculate_outlined,
    accent: Color(0xFF0057C2),
    paper: BoardBackground.grid,
    tools: [SubjectTool.equation, SubjectTool.graph, SubjectTool.geometry, SubjectTool.numberLine],
    aiFirst: [AiView.math, AiView.quiz, AiView.homework],
    tabs: [KitTab.formulas],
  ),
  Subject.physics: SubjectStyle(
    subject: Subject.physics,
    icon: Icons.bolt,
    accent: Color(0xFF613ED2),
    paper: BoardBackground.grid,
    tools: [SubjectTool.equation, SubjectTool.circuit, SubjectTool.graph, SubjectTool.geometry],
    aiFirst: [AiView.math, AiView.quiz, AiView.readBoard],
    tabs: [KitTab.physics, KitTab.constants],
  ),
  Subject.chemistry: SubjectStyle(
    subject: Subject.chemistry,
    icon: Icons.science_outlined,
    accent: Color(0xFF006B58),
    paper: BoardBackground.plain,
    tools: [SubjectTool.chemEquation, SubjectTool.atom],
    aiFirst: [AiView.quiz, AiView.readBoard, AiView.homework],
    tabs: [KitTab.periodic, KitTab.ions],
  ),
  Subject.biology: SubjectStyle(
    subject: Subject.biology,
    icon: Icons.biotech_outlined,
    accent: Color(0xFF006E20),
    paper: BoardBackground.plain,
    tools: [SubjectTool.flowchart],
    aiFirst: [AiView.quiz, AiView.lessonPlan, AiView.homework],
    tabs: [],
  ),
  Subject.science: SubjectStyle(
    subject: Subject.science,
    icon: Icons.biotech_outlined,
    accent: Color(0xFF006C52),
    paper: BoardBackground.plain,
    tools: [SubjectTool.equation, SubjectTool.circuit, SubjectTool.atom],
    aiFirst: [AiView.quiz, AiView.homework, AiView.readBoard],
    tabs: [KitTab.periodic, KitTab.physics],
  ),
  Subject.evs: SubjectStyle(
    subject: Subject.evs,
    icon: Icons.eco_outlined,
    accent: Color(0xFF366B00),
    paper: BoardBackground.plain,
    tools: [SubjectTool.wordCard],
    aiFirst: [AiView.quiz, AiView.homework],
    tabs: [KitTab.words],
  ),
  Subject.geography: SubjectStyle(
    subject: Subject.geography,
    icon: Icons.public,
    accent: Color(0xFF006782),
    paper: BoardBackground.plain,
    tools: [SubjectTool.graph, SubjectTool.timeline],
    aiFirst: [AiView.quiz, AiView.lessonPlan],
    tabs: [KitTab.dates],
  ),
  Subject.history: SubjectStyle(
    subject: Subject.history,
    icon: Icons.account_balance_outlined,
    accent: Color(0xFF875300),
    paper: BoardBackground.plain,
    tools: [SubjectTool.timeline],
    aiFirst: [AiView.quiz, AiView.lessonPlan, AiView.homework],
    tabs: [KitTab.dates],
  ),
  Subject.civics: SubjectStyle(
    subject: Subject.civics,
    icon: Icons.gavel_outlined,
    accent: Color(0xFF99411F),
    paper: BoardBackground.plain,
    tools: [SubjectTool.timeline, SubjectTool.flowchart],
    aiFirst: [AiView.quiz, AiView.lessonPlan, AiView.homework],
    tabs: [KitTab.dates],
  ),
  Subject.commerce: SubjectStyle(
    subject: Subject.commerce,
    icon: Icons.account_balance_wallet_outlined,
    accent: Color(0xFF7A4F00),
    paper: BoardBackground.ruled,
    tools: [SubjectTool.sheet, SubjectTool.equation, SubjectTool.graph, SubjectTool.flowchart],
    aiFirst: [AiView.quiz, AiView.homework, AiView.math],
    tabs: [KitTab.accounts, KitTab.finance, KitTab.stats, KitTab.formulas],
  ),
  Subject.management: SubjectStyle(
    subject: Subject.management,
    icon: Icons.insights_outlined,
    accent: Color(0xFF7D3A8C),
    paper: BoardBackground.plain,
    tools: [SubjectTool.sheet, SubjectTool.flowchart, SubjectTool.graph],
    aiFirst: [AiView.quiz, AiView.lessonPlan, AiView.homework],
    tabs: [KitTab.management, KitTab.finance, KitTab.stats],
  ),
  Subject.law: SubjectStyle(
    subject: Subject.law,
    icon: Icons.balance_outlined,
    accent: Color(0xFF8C2F2F),
    paper: BoardBackground.ruled,
    tools: [SubjectTool.reader, SubjectTool.timeline, SubjectTool.flowchart],
    aiFirst: [AiView.quiz, AiView.lessonPlan, AiView.homework],
    tabs: [KitTab.law, KitTab.dates],
  ),
  Subject.statistics: SubjectStyle(
    subject: Subject.statistics,
    icon: Icons.query_stats,
    accent: Color(0xFF3F5AA8),
    paper: BoardBackground.grid,
    tools: [SubjectTool.sheet, SubjectTool.graph, SubjectTool.equation],
    aiFirst: [AiView.math, AiView.quiz, AiView.homework],
    tabs: [KitTab.stats, KitTab.formulas],
  ),
  Subject.english: SubjectStyle(
    subject: Subject.english,
    icon: Icons.menu_book_outlined,
    accent: Color(0xFFA52D5C),
    paper: BoardBackground.ruled,
    tools: [SubjectTool.fourLine, SubjectTool.wordCard, SubjectTool.grammar],
    aiFirst: [AiView.quiz, AiView.homework, AiView.readBoard],
    tabs: [KitTab.words],
  ),
  Subject.languages: SubjectStyle(
    subject: Subject.languages,
    icon: Icons.translate,
    accent: Color(0xFF9B4500),
    paper: BoardBackground.ruled,
    tools: [SubjectTool.fourLine, SubjectTool.wordCard],
    aiFirst: [AiView.quiz, AiView.homework],
    tabs: [KitTab.words],
  ),
  Subject.computer: SubjectStyle(
    subject: Subject.computer,
    icon: Icons.terminal,
    accent: Color(0xFF006879),
    paper: BoardBackground.dots,
    tools: [SubjectTool.codeLab, SubjectTool.code, SubjectTool.flowchart],
    aiFirst: [AiView.quiz, AiView.homework, AiView.readBoard],
    // The CS kit (kit/cs, packages/kinetix_cs), then the quick logic and binary tables.
    tabs: [KitTab.algorithms, KitTab.csLabs, KitTab.diagrams, KitTab.logic, KitTab.binary],
  ),
  Subject.art: SubjectStyle(
    subject: Subject.art,
    icon: Icons.palette_outlined,
    accent: Color(0xFFAD2C4E),
    paper: BoardBackground.plain,
    tools: [SubjectTool.geometry],
    aiFirst: [AiView.lessonPlan, AiView.quiz],
    tabs: [],
  ),
  Subject.general: SubjectStyle(
    subject: Subject.general,
    icon: Icons.school_outlined,
    accent: Color(0xFF7E5700),
    paper: BoardBackground.plain,
    tools: [SubjectTool.equation, SubjectTool.wordCard],
    aiFirst: [AiView.quiz, AiView.homework, AiView.lessonPlan],
    tabs: [],
  ),
};

const _aliases = <String, Subject>{
  // College subjects first: "Business Statistics", "Business Law", "Biostatistics".
  'statistic': Subject.statistics,
  'econometric': Subject.statistics,
  'quantitative': Subject.statistics,
  'law': Subject.law,
  'legal': Subject.law,
  'jurisprudence': Subject.law,
  'constitution': Subject.law,
  'tort': Subject.law,
  'math': Subject.maths,
  'physics': Subject.physics,
  'chemistry': Subject.chemistry,
  'biology': Subject.biology,
  // Before "science": Social, Political, Environmental and Computer Science are other subjects.
  'social': Subject.history,
  'political': Subject.civics,
  'environmental': Subject.evs,
  'computer': Subject.computer,
  // BCA/MCA papers named without "computer".
  'data structure': Subject.computer,
  'algorithm': Subject.computer,
  'database': Subject.computer,
  'dbms': Subject.computer,
  'operating system': Subject.computer,
  'software': Subject.computer,
  'java': Subject.computer,
  'python': Subject.computer,
  'science': Subject.science,
  'evs': Subject.evs,
  'geography': Subject.geography,
  'history': Subject.history,
  'civics': Subject.civics,
  'economics': Subject.commerce,
  'account': Subject.commerce,
  'commerce': Subject.commerce,
  // Accounts and finance before management: "Management Accounting", "Financial Management".
  'financ': Subject.commerce,
  'tax': Subject.commerce,
  'audit': Subject.commerce,
  'costing': Subject.commerce,
  'management': Subject.management,
  'marketing': Subject.management,
  'human resource': Subject.management,
  'organisational': Subject.management,
  'organizational': Subject.management,
  'strateg': Subject.management,
  'entrepreneur': Subject.management,
  'operations research': Subject.management,
  'business': Subject.commerce,
  'english': Subject.english,
  'hindi': Subject.languages,
  'kannada': Subject.languages,
  'sanskrit': Subject.languages,
  'urdu': Subject.languages,
  'tamil': Subject.languages,
  'telugu': Subject.languages,
  'language': Subject.languages,
  'informatics': Subject.computer,
  'coding': Subject.computer,
  'programming': Subject.computer,
  // Last, so "BCA Mathematics" stays maths.
  'bca': Subject.computer,
  'mca': Subject.computer,
  'art': Subject.art,
  'drawing': Subject.art,
};

/// The subject for a timetable subject name ("Corporate Accounting", "Mathematics").
Subject subjectOf(String? name) {
  final n = (name ?? '').toLowerCase();
  for (final e in _aliases.entries) {
    if (n.contains(e.key)) return e.value;
  }
  return Subject.general;
}

SubjectStyle styleOf(String? subjectName) => subjectStyles[subjectOf(subjectName)]!;

/// The kit's tabs for a subject: "This lesson", the subject's own, and class stars for the
/// little ones.
List<KitTab> kitTabsFor(SubjectStyle s, {required bool primary}) => [KitTab.lesson, ...s.tabs, if (primary) KitTab.stars];

/// [kitTabsFor] with [requested] added straight after "This lesson" when the subject does not
/// carry it, so every tool tile opens its own tab whatever the period's subject is.
List<KitTab> kitTabsWith(SubjectStyle s, {required bool primary, KitTab? requested}) {
  final tabs = kitTabsFor(s, primary: primary);
  if (requested == null || tabs.contains(requested)) return tabs;
  return [tabs.first, requested, ...tabs.skip(1)];
}

/// The AI tools in this subject's order (the AI panel's tools, favourites first).
List<AiView> aiOrderFor(SubjectStyle s, {required bool primary}) {
  const all = [AiView.quiz, AiView.homework, AiView.lessonPlan, AiView.math, AiView.readBoard];
  final order = [...s.aiFirst, ...all.where((v) => !s.aiFirst.contains(v))];
  // Keep it simple for little ones.
  return primary ? order.where((v) => v == AiView.quiz || v == AiView.homework || v == AiView.math).toList() : order;
}

/// True for LKG to Class 5: the board then uses its primary layout (big labelled tools,
/// Andika, class stars). Read from the class's grade when the server sends it, else from its
/// name ("Class 3 B", "Grade 2", "UKG A").
bool isPrimaryClass(SessionContext? s) {
  if (s == null) return false;
  if (s.programLevel != null && s.programLevel != 'k12') return false;
  final name = s.sectionName ?? '';
  if (RegExp(r'\b(LKG|UKG|nursery|pre-?primary|KG)\b', caseSensitive: false).hasMatch(name)) return true;
  // Schools that number the pre-primary years store them as 0 and below.
  final term = s.classTerm ?? int.tryParse(RegExp(r'(?:class|grade|std\.?|standard)\s*(\d{1,2})', caseSensitive: false).firstMatch(name)?[1] ?? '');
  return term != null && term <= 5;
}

extension SubjectNames on AppLocalizations {
  String subjectName(Subject s) => switch (s) {
    Subject.maths => subjectMaths,
    Subject.physics => subjectPhysics,
    Subject.chemistry => subjectChemistry,
    Subject.biology => subjectBiology,
    Subject.science => subjectScience,
    Subject.evs => subjectEvs,
    Subject.geography => subjectGeography,
    Subject.history => subjectHistory,
    Subject.civics => subjectCivics,
    Subject.commerce => subjectCommerce,
    Subject.management => subjectManagement,
    Subject.law => subjectLaw,
    Subject.statistics => subjectStatistics,
    Subject.english => subjectEnglish,
    Subject.languages => subjectLanguages,
    Subject.computer => subjectComputer,
    Subject.art => subjectArt,
    Subject.general => subjectGeneral,
  };

  String subjectToolName(SubjectTool t) => switch (t) {
    SubjectTool.equation => stEquation,
    SubjectTool.graph => stGraph,
    SubjectTool.geometry => stGeometry,
    SubjectTool.numberLine => stNumberLine,
    SubjectTool.circuit => stCircuits,
    SubjectTool.atom => stAtoms,
    SubjectTool.chemEquation => stChemEquation,
    SubjectTool.timeline => stTimeline,
    SubjectTool.flowchart => stFlowchart,
    SubjectTool.code => stCode,
    SubjectTool.fourLine => stFourLine,
    SubjectTool.wordCard => stWordCard,
    SubjectTool.grammar => stGrammar,
    SubjectTool.sheet => stSheet,
    SubjectTool.reader => stReader,
    SubjectTool.codeLab => stCodeLab,
  };

  String kitTabName(KitTab t) => switch (t) {
    KitTab.lesson => kitThisLesson,
    KitTab.formulas || KitTab.physics => kitFormulas,
    KitTab.constants => kitConstants,
    KitTab.periodic => kitPeriodic,
    KitTab.ions => kitIons,
    KitTab.dates => kitDates,
    KitTab.words => kitWords,
    KitTab.logic => kitLogic,
    KitTab.binary => kitBinary,
    KitTab.stars => kitStars,
    KitTab.accounts => kitAccounts,
    KitTab.finance => kitFinance,
    KitTab.management => kitManagement,
    KitTab.law => kitLaw,
    KitTab.stats => kitStats,
    KitTab.algorithms => kitAlgorithms,
    KitTab.csLabs => kitCsLabs,
    KitTab.diagrams => kitDiagrams,
  };
}

extension SubjectToolIcon on SubjectTool {
  IconData get icon => switch (this) {
    SubjectTool.equation => Icons.functions,
    SubjectTool.graph => Icons.show_chart,
    SubjectTool.geometry => Icons.architecture,
    SubjectTool.numberLine => Icons.linear_scale,
    SubjectTool.circuit => Icons.electrical_services,
    SubjectTool.atom => Icons.bubble_chart_outlined,
    SubjectTool.chemEquation => Icons.science_outlined,
    SubjectTool.timeline => Icons.timeline,
    SubjectTool.flowchart => Icons.account_tree_outlined,
    SubjectTool.code => Icons.code,
    SubjectTool.fourLine => Icons.format_line_spacing,
    SubjectTool.wordCard => Icons.style_outlined,
    SubjectTool.grammar => Icons.spellcheck,
    SubjectTool.sheet => Icons.table_chart_outlined,
    SubjectTool.reader => Icons.menu_book_outlined,
    SubjectTool.codeLab => Icons.play_circle_outline,
  };
}

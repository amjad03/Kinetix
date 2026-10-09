import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart' show AiLanguage;
import '../../demo/demo.dart' show Demo;
import '../../demo/demo_class_switcher.dart';
import '../../l10n/feature_strings.dart';
import '../assessment/assessment.dart';
import '../board/layout/tools_drawer.dart';
import '../captions/live_captions.dart';
import '../classroom/classroom_tools.dart';
import '../classroom_plus/buzzer.dart';
import '../classroom_plus/diagnostics.dart';
import '../classroom_plus/plus_strings.dart';
import '../classroom_plus/recording_notice.dart';
import '../classroom_plus/voice_commands.dart';
import '../classroom_plus/zones.dart';
import '../profiles/profiles_ui.dart' show PinPad;
import '../doc_camera/doc_camera.dart';
import '../language_kit/language_kit.dart';
import '../primary/primary_panel.dart';
import '../safe_web/safe_web.dart';
import '../teaching_aids/teaching_aids.dart';
import 'extras_hooks.dart';

FeatureStrings extrasStrings(String lang) => FeatureStrings(lang, extrasStringTable);

/// The tools drawer's words for the classroom extras.
const extrasStringTable = <String, Map<String, String>>{
  'en': {
    'groupPrimary': 'Primary',
    'groupLanguage': 'Language',
    'demoClasses': 'Demo classes',
    'thisClass': 'This class',
    'primary': 'Primary activities',
    'tracing': 'Letter tracing',
    'numbers': 'Numbers and counting',
    'shapes': 'Shapes and colours',
    'matching': 'Matching game',
    'rhymes': 'Rhymes',
    'stars': 'Star wall',
    'docCamera': 'Document camera',
    'safeWeb': 'Safe browser',
    'captions': 'Live captions',
    'seating': 'Seating chart',
    'groups': 'Group maker',
    'magnifier': 'Magnifier',
    'notes': "Teacher's notes",
    'exitTicket': 'Exit ticket',
    'worksheet': 'Worksheet',
    'languageKit': 'Language kit',
    'phonics': 'Phonics charts',
    'grammar': 'Grammar tables',
    'vocab': 'Vocabulary cards',
    'organisers': 'Graphic organisers',
    'clock': 'Teaching clock',
    'scoreboard': 'Scoreboard',
    'exam': 'Exam clock',
    'tabCamera': 'Camera',
    'tabWeb': 'Web',
  },
  'hi': {
    'groupPrimary': 'प्राथमिक',
    'groupLanguage': 'भाषा',
    'demoClasses': 'डेमो कक्षाएँ',
    'thisClass': 'यह कक्षा',
    'primary': 'प्राथमिक गतिविधियाँ',
    'tracing': 'अक्षर अनुरेखण',
    'numbers': 'संख्याएँ और गिनती',
    'shapes': 'आकार और रंग',
    'matching': 'मिलान खेल',
    'rhymes': 'कविताएँ',
    'stars': 'स्टार दीवार',
    'docCamera': 'डॉक्यूमेंट कैमरा',
    'safeWeb': 'सुरक्षित ब्राउज़र',
    'captions': 'लाइव कैप्शन',
    'seating': 'बैठक व्यवस्था',
    'groups': 'समूह बनाएँ',
    'magnifier': 'आवर्धक',
    'notes': 'शिक्षक के नोट्स',
    'exitTicket': 'एग्ज़िट टिकट',
    'worksheet': 'वर्कशीट',
    'languageKit': 'भाषा किट',
    'phonics': 'ध्वनि चार्ट',
    'grammar': 'व्याकरण तालिकाएँ',
    'vocab': 'शब्द कार्ड',
    'organisers': 'ग्राफ़िक ऑर्गनाइज़र',
    'clock': 'शिक्षण घड़ी',
    'scoreboard': 'स्कोरबोर्ड',
    'exam': 'परीक्षा घड़ी',
    'tabCamera': 'कैमरा',
    'tabWeb': 'वेब',
  },
  'kn': {
    'groupPrimary': 'ಪ್ರಾಥಮಿಕ',
    'groupLanguage': 'ಭಾಷೆ',
    'demoClasses': 'ಡೆಮೊ ತರಗತಿಗಳು',
    'thisClass': 'ಈ ತರಗತಿ',
    'primary': 'ಪ್ರಾಥಮಿಕ ಚಟುವಟಿಕೆಗಳು',
    'tracing': 'ಅಕ್ಷರ ತಿದ್ದುವುದು',
    'numbers': 'ಸಂಖ್ಯೆ ಮತ್ತು ಎಣಿಕೆ',
    'shapes': 'ಆಕಾರ ಮತ್ತು ಬಣ್ಣ',
    'matching': 'ಹೊಂದಿಸುವ ಆಟ',
    'rhymes': 'ಶಿಶುಗೀತೆಗಳು',
    'stars': 'ನಕ್ಷತ್ರ ಗೋಡೆ',
    'docCamera': 'ಡಾಕ್ಯುಮೆಂಟ್ ಕ್ಯಾಮೆರಾ',
    'safeWeb': 'ಸುರಕ್ಷಿತ ಬ್ರೌಸರ್',
    'captions': 'ಲೈವ್ ಶೀರ್ಷಿಕೆಗಳು',
    'seating': 'ಆಸನ ವ್ಯವಸ್ಥೆ',
    'groups': 'ಗುಂಪು ತಯಾರಕ',
    'magnifier': 'ಭೂತಗನ್ನಡಿ',
    'notes': 'ಶಿಕ್ಷಕರ ಟಿಪ್ಪಣಿಗಳು',
    'exitTicket': 'ಎಕ್ಸಿಟ್ ಟಿಕೆಟ್',
    'worksheet': 'ವರ್ಕ್‌ಶೀಟ್',
    'languageKit': 'ಭಾಷಾ ಕಿಟ್',
    'phonics': 'ಧ್ವನಿ ಚಾರ್ಟ್‌ಗಳು',
    'grammar': 'ವ್ಯಾಕರಣ ಕೋಷ್ಟಕಗಳು',
    'vocab': 'ಪದ ಕಾರ್ಡ್‌ಗಳು',
    'organisers': 'ಗ್ರಾಫಿಕ್ ಆರ್ಗನೈಸರ್‌ಗಳು',
    'clock': 'ಕಲಿಕೆಯ ಗಡಿಯಾರ',
    'scoreboard': 'ಸ್ಕೋರ್‌ಬೋರ್ಡ್',
    'exam': 'ಪರೀಕ್ಷಾ ಗಡಿಯಾರ',
    'tabCamera': 'ಕ್ಯಾಮೆರಾ',
    'tabWeb': 'ವೆಬ್',
  },
};

/// Starts what the extras need once per board: the institution's allowed sites from the board
/// config.
void initBoardExtras() {
  if (_init) return;
  _init = true;
  unawaited(SafeWebPolicy.load());
  BoardController.configListeners.add((config) => unawaited(SafeWebPolicy.applyConfig(config['safeWeb'])));
  BoardController.configListeners.add(PinPad.applyConfig);
  BoardController.configListeners.add(RecordingPolicy.applyConfig);
}

bool _init = false;

/// Opens the demo class's "This class" panel.
void openDemoClassPanel(BuildContext context, ExtrasHooks h) {
  final c = DemoClassSwitcher.current;
  if (c == null) return;
  final s = extrasStrings(boardLang(context));
  h.openPage(s['thisClass'], Icons.school_outlined, (ctx) => DemoClassPanel(
    key: ValueKey(c.id),
    hooks: h,
    demoClass: c,
    onPrimary: c.primaryActivity == null ? null : () => openPrimary(ctx, h, PrimaryActivity.tracing),
    onSwitch: () => DemoClassSwitcher.open(ctx, h.board),
  ));
}

void openPrimary(BuildContext context, ExtrasHooks h, PrimaryActivity a) {
  final s = extrasStrings(boardLang(context));
  h.openPage(s['primary'], primaryActivityIcon(a), (_) => PrimaryActivitiesPanel(key: ValueKey(a), board: h.board, wb: h.wb, initial: a));
}

/// The document camera and the safe browser, for the split panel's Camera and Web tabs.
Widget docCameraPanel(WhiteboardController wb) => DocCameraPanel(wb: wb);
Widget safeBrowserPanel(ExtrasHooks h) => SafeBrowserPanel(wb: h.wb, board: h.board);

/// The extras' tiles in the tools drawer.
List<DrawerTool> extraDrawerTools(BuildContext context, ExtrasHooks h, {required void Function(VoidCallback) run}) {
  final s = extrasStrings(boardLang(context));
  const prim = Color(0xFFFDD663), lang = Color(0xFFA8DAB5), cls = Color(0xFFF28B82), media = Color(0xFF8AB4F8), assess = Color(0xFFD7AEFB);
  VoidCallback page(String key, IconData icon, WidgetBuilder b) => () => run(() => h.openPage(s[key], icon, b));
  final p = plusStrings(context);
  VoidCallback plusPage(String key, IconData icon, WidgetBuilder b) => () => run(() => h.openPage(p[key], icon, b));
  return [
    if (Demo.enabled) ...[
      DrawerTool('demo-classes', Icons.swap_horiz, s['demoClasses'], const [ToolGroup.classroom], cls, () => run(() => unawaited(DemoClassSwitcher.open(context, h.board)))),
      DrawerTool('this-class', Icons.school_outlined, s['thisClass'], const [ToolGroup.classroom], cls, () => run(() => openDemoClassPanel(context, h))),
    ],
    // Primary (LKG to Class 5)
    for (final (id, key, a) in const [
      ('tracing', 'tracing', PrimaryActivity.tracing),
      ('counting', 'numbers', PrimaryActivity.numbers),
      ('shapes-colours', 'shapes', PrimaryActivity.shapes),
      ('matching-game', 'matching', PrimaryActivity.matching),
      ('rhymes', 'rhymes', PrimaryActivity.rhymes),
      ('star-wall', 'stars', PrimaryActivity.stars),
    ])
      DrawerTool(id, primaryActivityIcon(a), s[key], const [ToolGroup.primary], prim, () => run(() => openPrimary(context, h, a))),
    DrawerTool('teaching-clock', Icons.schedule, s['clock'], const [ToolGroup.primary, ToolGroup.maths], prim, page('clock', Icons.schedule, (_) => const TeachingClockPanel())),
    // Language
    for (final (id, key, t, icon) in const [
      ('language-kit', 'languageKit', LanguageTab.dictionary, Icons.translate),
      ('phonics', 'phonics', LanguageTab.phonics, Icons.record_voice_over_outlined),
      ('grammar-tables', 'grammar', LanguageTab.grammar, Icons.spellcheck),
      ('vocab-cards', 'vocab', LanguageTab.cards, Icons.style_outlined),
    ])
      DrawerTool(id, icon, s[key], const [ToolGroup.language, ToolGroup.classroom], lang, page(key, icon, (_) => LanguageKitPanel(key: ValueKey(t), board: h.board, wb: h.wb, initial: t))),
    // Classroom
    DrawerTool('doc-camera', Icons.document_scanner_outlined, s['docCamera'], const [ToolGroup.classroom, ToolGroup.science], media, () => run(h.openCamera)),
    DrawerTool('safe-web', Icons.travel_explore, s['safeWeb'], const [ToolGroup.classroom], media, () => run(h.openWeb)),
    DrawerTool('live-captions', Icons.closed_caption_outlined, s['captions'], const [ToolGroup.classroom, ToolGroup.language], media, () => run(() => unawaited(LiveCaptions.toggle(context)))),
    DrawerTool('magnifier', Icons.zoom_in, s['magnifier'], const [ToolGroup.classroom], cls, () => run(() => BoardMagnifier.toggle(context))),
    DrawerTool('seating-chart', Icons.event_seat_outlined, s['seating'], const [ToolGroup.classroom], cls, page('seating', Icons.event_seat_outlined, (_) => SeatingChartPanel(board: h.board))),
    DrawerTool('group-maker', Icons.diversity_3_outlined, s['groups'], const [ToolGroup.classroom], cls, page('groups', Icons.diversity_3_outlined, (_) => GroupMakerPanel(board: h.board, wb: h.wb))),
    DrawerTool('teacher-notes', Icons.sticky_note_2_outlined, s['notes'], const [ToolGroup.classroom], cls, page('notes', Icons.sticky_note_2_outlined, (_) => TeacherNotesPanel(board: h.board))),
    DrawerTool('scoreboard', Icons.scoreboard_outlined, s['scoreboard'], const [ToolGroup.classroom], cls, page('scoreboard', Icons.scoreboard_outlined, (_) => const ScoreboardPanel())),
    DrawerTool('buzzer', Icons.campaign_outlined, p['buzzer'], const [ToolGroup.classroom], cls, plusPage('buzzer', Icons.campaign_outlined, (_) => const BuzzerPanel())),
    if (h.zones case final zones?) DrawerTool('zones', Icons.view_week_outlined, p['zones'], const [ToolGroup.classroom], cls, () => run(() => unawaited(pickZones(context, zones)))),
    if (h.voiceCommand case final voice?)
      DrawerTool(
        'voice-commands',
        Icons.keyboard_voice_outlined,
        p['voiceCommands'],
        const [ToolGroup.classroom],
        media,
        () => run(() => unawaited(VoiceCommandDialog.open(context, language: AiLanguage.fromCode(boardLang(context)), run: voice))),
      ),
    DrawerTool('diagnostics', Icons.monitor_heart_outlined, p['diagnostics'], const [ToolGroup.classroom], media, plusPage('diagnostics', Icons.monitor_heart_outlined, (_) => DiagnosticsPanel(board: h.board))),
    DrawerTool('exam-clock', Icons.timer_outlined, s['exam'], const [ToolGroup.classroom], cls, page('exam', Icons.timer_outlined, (_) => const ExamClockPanel())),
    DrawerTool('organisers', Icons.hub_outlined, s['organisers'], const [ToolGroup.classroom, ToolGroup.commerce, ToolGroup.language], cls, page('organisers', Icons.hub_outlined, (_) => OrganisersPanel(wb: h.wb))),
    // Assessment
    DrawerTool('exit-ticket', Icons.logout, s['exitTicket'], const [ToolGroup.classroom], assess, page('exitTicket', Icons.logout, (_) => AssessmentPanel(board: h.board, wb: h.wb, askClass: h.askClass))),
    DrawerTool(
      'worksheet',
      Icons.assignment_outlined,
      s['worksheet'],
      const [ToolGroup.classroom],
      assess,
      page('worksheet', Icons.assignment_outlined, (_) => AssessmentPanel(board: h.board, wb: h.wb, askClass: h.askClass, kind: AssessmentKind.worksheet)),
    ),
  ];
}

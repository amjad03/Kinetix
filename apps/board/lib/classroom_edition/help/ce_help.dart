import 'dart:async';

import 'package:flutter/material.dart';

import '../backup/backup_page.dart' show CeFiles;
import '../l10n/ce_strings.dart';
import '../local/classroom_store.dart';
import '../ui/ce_style.dart';
import 'quick_start_pdf.dart';

/// What a help step's picture shows: a control drawn from widgets, as it looks on the board.
enum HelpPic { button, card, toolbar, menu, rollGrid, pill, panel }

/// One step of a how-to: what to do, and a small picture of the control.
@immutable
class HelpStep {
  const HelpStep(this.text, this.pic, {this.label = '', this.icon = Icons.touch_app_outlined});

  /// English; shown through the string table.
  final String text;
  final HelpPic pic;
  final String label;
  final IconData icon;
}

/// One how-to.
@immutable
class HelpTopic {
  const HelpTopic(this.id, this.title, this.icon, this.colour, this.steps);

  final String id;
  final String title;
  final IconData icon;
  final Color colour;
  final List<HelpStep> steps;
}

/// The how-tos (English keys; [helpTopics] gives them in the board's language).
List<HelpTopic> get helpTopics => [
  HelpTopic('teach', ceTr('Teach a class'), Icons.play_circle_outline, CeC.mint, [
    HelpStep(ceTr('On the start screen, tap Start my class. The period on now opens on the board.'), HelpPic.button, label: ceTr('Start my class'), icon: Icons.play_arrow_rounded),
    HelpStep(ceTr('Someone else teaching? Tap Choose who’s teaching, then your own card.'), HelpPic.card, label: ceTr('Who’s teaching now?')),
    HelpStep(ceTr('Write with the Pen. Undo takes back the last thing; nothing can break.'), HelpPic.toolbar, label: ceTr('Pen'), icon: Icons.edit),
    HelpStep(ceTr('When the bell rings, open the Menu at the bottom left and tap End class.'), HelpPic.menu, label: ceTr('End class'), icon: Icons.logout),
  ]),
  HelpTopic('lessons', ceTr('Lessons'), Icons.auto_stories_outlined, CeC.lavender, [
    HelpStep(ceTr('Tap Lessons on the toolbar. Pick 1st or 2nd PUC, then a chapter.'), HelpPic.toolbar, label: ceTr('Lessons'), icon: Icons.auto_stories_outlined),
    HelpStep(ceTr('Tap a lesson. Each step shows a picture and what to say.'), HelpPic.panel, label: ceTr('Step {n} of {total}', {'n': 1, 'total': 8})),
    HelpStep(ceTr('Tap Next for each step. Continue picks up where you stopped last class.'), HelpPic.button, label: ceTr('Next'), icon: Icons.arrow_forward),
  ]),
  HelpTopic('board', ceTr('Put on board'), Icons.co_present_outlined, CeC.blue, [
    HelpStep(ceTr('In a lesson, tap Put on board: the step goes on the board as a picture.'), HelpPic.button, label: ceTr('Put on board'), icon: Icons.co_present_outlined),
    HelpStep(ceTr('Write on it, move it or rub it out like anything else on the board.'), HelpPic.toolbar, label: ceTr('Undo'), icon: Icons.undo),
    HelpStep(ceTr('Page full? Tap Add page at the bottom right. Previous and Next go between pages.'), HelpPic.pill, label: ceTr('Add a page'), icon: Icons.add),
  ]),
  HelpTopic('quiz', ceTr('Class quiz'), Icons.fact_check_outlined, CeC.peach, [
    HelpStep(ceTr('Tap Class tools, then Class quiz. Pick the chapter and tap Start the quiz.'), HelpPic.toolbar, label: ceTr('Class tools'), icon: Icons.school_outlined),
    HelpStep(ceTr('Read the question out. The class answers aloud or on paper; no phones.'), HelpPic.panel, label: ceTr('Question {n} of {total}', {'n': 1, 'total': 5})),
    HelpStep(ceTr('Tap each roll number: once for right (tick), twice for wrong (cross).'), HelpPic.rollGrid),
    HelpStep(ceTr('Tap Next question. Marks are kept by roll number for the mastery map.'), HelpPic.button, label: ceTr('Next question'), icon: Icons.arrow_forward),
  ]),
  HelpTopic('mock', ceTr('Mock test'), Icons.assignment_outlined, CeC.butter, [
    HelpStep(ceTr('Class tools → Mock test. Pick the chapters; the paper follows the PUC pattern.'), HelpPic.panel, label: ceTr('Mock test')),
    HelpStep(ceTr('Check the paper, then Print copies or Export PDF.'), HelpPic.button, label: ceTr('Print'), icon: Icons.print_outlined),
    HelpStep(ceTr('After the test, tap Enter marks and type each roll number’s marks.'), HelpPic.pill, label: ceTr('After the test'), icon: Icons.edit_note),
  ]),
  HelpTopic('save', ceTr('Save and open boards'), Icons.save_outlined, CeC.mint, [
    HelpStep(ceTr('Menu → Save: the board is kept on this board, named class · subject · date.'), HelpPic.menu, label: ceTr('Save'), icon: Icons.save_outlined),
    HelpStep(ceTr('Menu → Open: your boards for this class, newest first. Tap one to open it.'), HelpPic.menu, label: ceTr('Open a board'), icon: Icons.folder_open_outlined),
    HelpStep(ceTr('The board also keeps itself every few minutes, so a power cut loses little.'), HelpPic.pill, label: ceTr('Works offline · saved on this board'), icon: Icons.cloud_off_outlined),
  ]),
  HelpTopic('backup', ceTr('Backup'), Icons.backup_outlined, CeC.blue, [
    HelpStep(ceTr('Settings → Backup & restore → Back up now.'), HelpPic.button, label: ceTr('Back up now'), icon: Icons.backup_outlined),
    HelpStep(ceTr('Copy to a USB drive to keep a copy off the board.'), HelpPic.button, label: ceTr('Copy to a USB drive…'), icon: Icons.usb),
    HelpStep(ceTr('The board also backs itself up each day it is used, and keeps 14 days.'), HelpPic.pill, label: ceTr('Daily backup'), icon: Icons.event_repeat_outlined),
  ]),
  HelpTopic('timetable', ceTr('Timetable'), Icons.event_note_outlined, CeC.lavender, [
    HelpStep(ceTr('Settings → Timetable. Set the bell times once.'), HelpPic.pill, label: ceTr('Bell times'), icon: Icons.notifications_active_outlined),
    HelpStep(ceTr('Add a period: pick the day, a bell, the class and the teacher. No typing times.'), HelpPic.button, label: ceTr('Add a period'), icon: Icons.add),
    HelpStep(ceTr('Copy this day to… fills the other days in one go. A clash is marked in orange.'), HelpPic.pill, label: ceTr('Copy this day to…'), icon: Icons.copy_all_outlined),
  ]),
  HelpTopic('pin', ceTr('School PIN'), Icons.pin_outlined, CeC.pink, [
    HelpStep(ceTr('Settings ask for the school PIN. Teaching never does.'), HelpPic.pill, label: ceTr('School PIN'), icon: Icons.lock_outline),
    HelpStep(ceTr('Change it in Settings → College and PIN. Keep the recovery code safe.'), HelpPic.button, label: ceTr('Change PIN'), icon: Icons.pin_outlined),
    HelpStep(ceTr('Forgot it? On the PIN pad tap Forgot the PIN? and type the recovery code.'), HelpPic.pill, label: ceTr('Forgot the PIN?'), icon: Icons.help_outline),
  ]),
];

/// Opens Help (the start screen, Settings and the board's menu).
Future<void> openCeHelp(BuildContext context, {ClassroomStore? store, String? topic}) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CeHelpPage(store: store, initialTopic: topic)));

/// Help (P1 item 25): short step-by-step how-tos with pictures of the controls, in the board's
/// language, and a one-page quick-start sheet to print.
class CeHelpPage extends StatefulWidget {
  const CeHelpPage({super.key, this.store, this.initialTopic});

  final ClassroomStore? store;
  final String? initialTopic;

  @override
  State<CeHelpPage> createState() => _CeHelpPageState();
}

class _CeHelpPageState extends State<CeHelpPage> {
  late String _topic = widget.initialTopic ?? 'teach';
  bool _printing = false;

  Future<void> _print() async {
    setState(() => _printing = true);
    try {
      final pdf = await quickStartPdf(lang: CeLang.code, college: widget.store?.college ?? '');
      await CeFiles.print(pdf, ceTr('Zynetix Classroom quick start'));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.ce('Could not print: {error}', {'error': e}))));
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    context.ceDependOnLanguage();
    final topics = helpTopics;
    final t = topics.firstWhere((x) => x.id == _topic, orElse: () => topics.first);
    return Theme(
      data: ceTheme(context),
      child: Scaffold(
        key: const Key('ce-help'),
        backgroundColor: CeC.page,
        appBar: AppBar(
          backgroundColor: CeC.page,
          toolbarHeight: 84,
          title: Text(context.ce('Help'), style: ceHeading(28)),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 24),
              child: FilledButton.icon(
                key: const Key('ce-help-print'),
                style: ceBigButton(),
                onPressed: _printing ? null : () => unawaited(_print()),
                icon: const Icon(Icons.print_outlined),
                label: Text(context.ce('Print the quick-start sheet')),
              ),
            ),
          ],
        ),
        body: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 360,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 8, 12, 24),
                children: [
                  for (final x in topics)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Semantics(
                        button: true,
                        selected: x.id == t.id,
                        child: Material(
                          color: x.id == t.id ? CeC.navy : Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          child: InkWell(
                            key: Key('ce-help-topic-${x.id}'),
                            borderRadius: BorderRadius.circular(18),
                            onTap: () => setState(() => _topic = x.id),
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(minHeight: ceTarget + 8),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                child: Row(
                                  children: [
                                    ceIconDot(x.icon, bg: x.colour, size: 44),
                                    const SizedBox(width: 14),
                                    Expanded(child: Text(x.title, style: ceText(19, w: FontWeight.w600, c: x.id == t.id ? Colors.white : CeC.navy))),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                key: Key('ce-help-steps-${t.id}'),
                padding: const EdgeInsets.fromLTRB(12, 8, 32, 32),
                children: [
                  Text(t.title, style: ceHeading(34)),
                  const SizedBox(height: 18),
                  for (final (i, s) in t.steps.indexed)
                    Container(
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.all(20),
                      decoration: ceCard(r: 22, shadow: false),
                      child: Row(
                        children: [
                          CircleAvatar(radius: 24, backgroundColor: CeC.navy, child: Text('${i + 1}', style: ceText(20, w: FontWeight.w700, c: Colors.white))),
                          const SizedBox(width: 20),
                          Expanded(child: Text(s.text, style: ceText(21, c: CeC.body, height: 1.4))),
                          const SizedBox(width: 20),
                          ExcludeSemantics(child: SizedBox(width: 300, height: 120, child: HelpPicture(step: s, colour: t.colour))),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A help step's picture: the control drawn from widgets (no image files), as on the board.
class HelpPicture extends StatelessWidget {
  const HelpPicture({super.key, required this.step, required this.colour});

  final HelpStep step;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    final s = step;
    Widget frame(Widget child) => Container(
      decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(18)),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(12),
      child: FittedBox(fit: BoxFit.scaleDown, child: child),
    );
    Widget finger() => const Padding(padding: EdgeInsets.only(left: 6, top: 18), child: Icon(Icons.touch_app, size: 34, color: CeC.navy));
    return switch (s.pic) {
      HelpPic.button => frame(
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
              decoration: const ShapeDecoration(color: CeC.accent, shape: StadiumBorder()),
              child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(s.icon, color: Colors.white), const SizedBox(width: 8), Text(s.label, style: ceText(18, w: FontWeight.w600, c: Colors.white))]),
            ),
            finger(),
          ],
        ),
      ),
      HelpPic.pill => frame(
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          decoration: const ShapeDecoration(color: Colors.white, shape: StadiumBorder(side: BorderSide(color: CeC.line, width: 1.5))),
          child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(s.icon, color: CeC.navy), const SizedBox(width: 8), Text(s.label, style: ceText(17, w: FontWeight.w600, c: CeC.navy))]),
        ),
      ),
      HelpPic.toolbar => frame(
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final icon in const [Icons.edit, Icons.palette_outlined, Icons.undo, Icons.auto_stories_outlined, Icons.school_outlined])
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: icon == s.icon ? CeC.lavender : Colors.transparent, borderRadius: BorderRadius.circular(12), border: icon == s.icon ? Border.all(color: CeC.navy, width: 2) : null),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, color: CeC.navy), if (icon == s.icon) Text(s.label, style: ceText(12, w: FontWeight.w700, c: CeC.navy))]),
                ),
            ],
          ),
        ),
      ),
      HelpPic.menu => frame(
        Container(
          width: 220,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final w in [0.6, 1.0, 0.5])
                w == 1.0
                    ? Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(color: CeC.lavender, borderRadius: BorderRadius.circular(10)),
                        child: Row(children: [Icon(s.icon, size: 20, color: CeC.navy), const SizedBox(width: 8), Flexible(child: Text(s.label, overflow: TextOverflow.ellipsis, style: ceText(15, w: FontWeight.w700, c: CeC.navy)))]),
                      )
                    : Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                        child: FractionallySizedBox(widthFactor: w, alignment: Alignment.centerLeft, child: Container(height: 8, decoration: BoxDecoration(color: CeC.line, borderRadius: BorderRadius.circular(4)))),
                      ),
            ],
          ),
        ),
      ),
      HelpPic.card => frame(
        Container(
          width: 240,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: CeC.peach, borderRadius: BorderRadius.circular(16), border: Border.all(color: CeC.accent, width: 3)),
          child: Row(
            children: [
              const CircleAvatar(radius: 20, backgroundColor: Colors.white, child: Icon(Icons.person, color: CeC.navy)),
              const SizedBox(width: 10),
              Expanded(child: Text(s.label, maxLines: 2, style: ceText(14, w: FontWeight.w700, c: CeC.navy))),
              const Icon(Icons.check_circle, color: CeC.accent),
            ],
          ),
        ),
      ),
      HelpPic.rollGrid => frame(
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final (n, m) in [(1, 1), (2, 2), (3, 0), (4, 1), (5, 1), (6, 2)])
              Container(
                width: 70,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: m == 1 ? CeC.mint : (m == 2 ? CeC.pink : Colors.white),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: m == 1 ? CeC.green : (m == 2 ? CeC.wrong : CeC.line), width: m == 0 ? 1.5 : 3),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('0$n', style: ceText(15, w: FontWeight.w700, c: CeC.navy)),
                    if (m == 1) const Icon(Icons.check_circle, size: 18, color: CeC.green),
                    if (m == 2) const Icon(Icons.cancel_presentation, size: 18, color: CeC.wrong),
                  ],
                ),
              ),
          ],
        ),
      ),
      HelpPic.panel => frame(
        Container(
          width: 240,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(s.label, style: ceText(13, w: FontWeight.w700, c: CeC.accent)),
              const SizedBox(height: 6),
              Container(height: 40, decoration: BoxDecoration(color: CeC.blue, borderRadius: BorderRadius.circular(8)), child: const Center(child: Icon(Icons.image_outlined, color: CeC.navy))),
              const SizedBox(height: 6),
              Container(height: 6, width: 160, decoration: BoxDecoration(color: CeC.line, borderRadius: BorderRadius.circular(3))),
            ],
          ),
        ),
      ),
    };
  }
}

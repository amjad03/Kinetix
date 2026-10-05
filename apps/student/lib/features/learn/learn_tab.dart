import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import 'ask_controller.dart';
import 'ask_view.dart';
import 'code_lab_view.dart';
import 'labs_view.dart';
import '../privacy/privacy.dart';
import 'syllabus_view.dart';
import 'topic_screen.dart';

/// Self-paced learning: ask KINETIX AI a doubt, browse and search the syllabus library, do a
/// virtual lab, or practise programming in the code lab.
class LearnTab extends StatefulWidget {
  const LearnTab({super.key, required this.state, required this.study});

  final AppState state;
  final StudyController study;

  @override
  State<LearnTab> createState() => LearnTabState();
}

class LearnTabState extends State<LearnTab> with SingleTickerProviderStateMixin {
  late final tabs = TabController(length: 4, vsync: this);
  late final ask = AskController(
    api: widget.study.api,
    sectionId: widget.study.student.sectionId,
    language: widget.state.aiLanguage,
    onLanguageChanged: widget.state.setAiLanguage,
    onOpenPrivacy: (context) => PrivacyScreen.open(context, widget.study.api, widget.study.student.id),
  );

  @override
  void initState() {
    super.initState();
    // The subjects feed the "Subject" chips and the syllabus list.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.study.subjects == null) widget.study.loadSubjects();
    });
  }

  @override
  void dispose() {
    tabs.dispose();
    ask.dispose();
    super.dispose();
  }

  /// Switches to "Ask a doubt" (from Today's shortcut).
  void showAsk() => tabs.animateTo(0);

  /// Switches to the virtual labs.
  void showLabs() => tabs.animateTo(2);

  /// Opens a syllabus topic (from Today's "Coming up in class").
  void openTopic(String topicId) => TopicScreen.open(context, widget.study.api, topicId, controller: ask);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.navLearn),
        bottom: TabBar(
          controller: tabs,
          tabs: [
            Tab(key: const Key('tabAsk'), icon: const Icon(Icons.auto_awesome_outlined), text: context.l10n.askADoubt),
            Tab(key: const Key('tabSyllabus'), icon: const Icon(Icons.menu_book_outlined), text: context.l10n.syllabus),
            Tab(key: const Key('tabLabs'), icon: const Icon(Icons.science_outlined), text: context.l10n.labs),
            Tab(key: const Key('tabCodeLab'), icon: const Icon(Icons.terminal), text: context.l10n.codeLab),
          ],
        ),
      ),
      body: TabBarView(
        controller: tabs,
        children: [
          ListenableBuilder(
            listenable: widget.study,
            builder: (context, _) => AskView(controller: ask, subjects: widget.study.subjects),
          ),
          SyllabusView(study: widget.study, ask: ask),
          LabsView(student: widget.study.student),
          CodeLabView(api: widget.study.api),
        ],
      ),
    );
  }
}

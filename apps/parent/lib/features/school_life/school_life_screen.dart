import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/conduct.dart';
import '../../core/files.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import 'conduct_screens.dart';
import 'diary_screen.dart';
import 'early_years_screen.dart';
import 'event_passes_screen.dart';
import 'events_screen.dart';
import 'health_screen.dart';
import 'passport_screen.dart';
import 'ptm_screen.dart';
import 'surveys_screen.dart';
import 'campus_extras_screens.dart';

/// One place for a child's school life: diary, meetings, early years, health, outcome passport,
/// surveys and campus events.
class SchoolLifeScreen extends StatelessWidget {
  const SchoolLifeScreen({super.key, required this.api, required this.child, this.openFile = openWithSystem, this.visibility = const ParentVisibility()});

  final ParentApi api;

  /// What the school shows parents; the tiles of switched-off sections are left out.
  final ParentVisibility visibility;
  final Child child;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, ParentApi api, Child child, {ParentVisibility visibility = const ParentVisibility()}) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SchoolLifeScreen(api: api, child: child, visibility: visibility)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    void go(Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    Widget tile(String key, IconData icon, String title, String subtitle, Widget Function() screen) => ListTile(
      key: Key(key),
      minTileHeight: 64,
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => go(screen()),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l.schoolLifeTitle(child.firstName))),
      body: ListView(
        children: [
          if (visibility.allows('diary')) tile('lifeDiary', Icons.menu_book_outlined, l.lifeDiary, l.lifeDiarySub, () => DiaryScreen(api: api, child: child)),
          if (visibility.allows('activities')) tile('lifeActivities', Icons.emoji_events_outlined, l.lifeActivities, l.lifeActivitiesSub, () => ActivitiesScreen(api: api, child: child)),
          if (visibility.allows('behaviour')) tile('lifeBehaviour', Icons.volunteer_activism_outlined, l.lifeBehaviour, l.lifeBehaviourSub, () => BehaviourScreen(api: api, child: child)),
          tile('lifePtm', Icons.event_available_outlined, l.lifePtm, l.lifePtmSub, () => PtmScreen(api: api, child: child)),
          tile('lifeEarly', Icons.child_care_outlined, l.lifeEarly, l.lifeEarlySub, () => EarlyYearsScreen(api: api, child: child, openFile: openFile)),
          if (visibility.allows('health')) tile('lifeHealth', Icons.health_and_safety_outlined, l.lifeHealth, l.lifeHealthSub, () => HealthScreen(api: api, child: child)),
          tile('lifePassport', Icons.workspace_premium_outlined, l.lifePassport, l.lifePassportSub, () => PassportScreen(api: api, child: child, openFile: openFile)),
          tile('lifeSurveys', Icons.poll_outlined, l.lifeSurveys, l.lifeSurveysSub, () => SurveysScreen(api: api)),
          tile('lifePasses', Icons.qr_code_2_outlined, l.lifePasses, l.lifePassesSub, () => EventPassesScreen(api: api, child: child)),
          tile('lifeRateMeal', Icons.star_outline_rounded, l.mealRateTitle, l.mealRateSub, () => RateMealScreen(api: api)),
          tile('lifeRepairs', Icons.build_outlined, l.repairTitle, l.repairSub, () => RepairRequestsScreen(api: api)),
          tile('lifeEvents', Icons.celebration_outlined, l.lifeEvents, l.lifeEventsSub, () => EventsScreen(api: api, child: child)),
        ],
      ),
    );
  }
}

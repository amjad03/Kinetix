import 'package:zynetix_ui/zynetix_ui.dart';

import '../l10n/app_localizations.dart';

/// This build's version, checked against the server's minimum at start and sent with crash reports.
/// Release builds pass `--dart-define=ZYNETIX_APP_VERSION=<pubspec version>` (docs/product/mobile-apps.md).
const kAppVersion = String.fromEnvironment('ZYNETIX_APP_VERSION', defaultValue: '0.1.0');

/// The app name the server knows (`app_releases.app`, crash reports).
const kAppName = 'teacher';

/// The notification kinds this app's people receive, in the order Profile → Notifications lists them.
const kNotificationKinds = ['absence', 'message', 'leave', 'payslip', 'task', 'announcement', 'broadcast', 'calendar', 'grievance', 'survey', 'welfare', 'transport', 'live'];

/// The shared mobile screens' words, from this app's arb files.
KxMobileStrings mobileStrings(AppLocalizations l) => KxMobileStrings(
  updateRequiredTitle: l.mobileUpdateRequiredTitle,
  updateRequiredBody: l.mobileUpdateRequiredBody,
  updateAvailable: l.mobileUpdateAvailable,
  update: l.mobileUpdate,
  later: l.mobileLater,
  offlineBanner: l.mobileOffline,
  notificationSettings: l.mobileNotificationSettings,
  notificationSettingsHint: l.mobileNotificationSettingsHint,
  quietHours: l.mobileQuietHours,
  quietHoursHint: l.mobileQuietHoursHint,
  quietFrom: l.mobileQuietFrom,
  quietTo: l.mobileQuietTo,
  save: l.mobileSave,
  saved: l.mobileSaved,
  loadFailed: l.mobileLoadFailed,
  retry: l.mobileRetry,
  pendingWrites: l.mobilePendingWrites,
  kindLabel: (k) => switch (k) {
    'absence' => l.mobileKind_absence,
    'homework' => l.mobileKind_homework,
    'broadcast' => l.mobileKind_broadcast,
    'board_shared' => l.mobileKind_board_shared,
    'recording' => l.mobileKind_recording,
    'fee' => l.mobileKind_fee,
    'library' => l.mobileKind_library,
    'marks' => l.mobileKind_marks,
    'message' => l.mobileKind_message,
    'live' => l.mobileKind_live,
    'calendar' => l.mobileKind_calendar,
    'badge' => l.mobileKind_badge,
    'transport' => l.mobileKind_transport,
    'hostel' => l.mobileKind_hostel,
    'leave' => l.mobileKind_leave,
    'payslip' => l.mobileKind_payslip,
    'certificate' => l.mobileKind_certificate,
    'placement' => l.mobileKind_placement,
    'grievance' => l.mobileKind_grievance,
    'welfare' => l.mobileKind_welfare,
    'survey' => l.mobileKind_survey,
    'task' => l.mobileKind_task,
    'announcement' => l.mobileKind_announcement,
    _ => k,
  },
);

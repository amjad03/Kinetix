import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_kn.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en'), Locale('hi'), Locale('kn')];

  /// App name (keep in English).
  ///
  /// In en, this message translates to:
  /// **'KINETIX Teacher'**
  String get appTitle;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// Button / tooltip.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get send;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get share;

  /// Button that closes a screen or sheet.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// Button in an error banner (glossary: Try again).
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// Button: removes a remark.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get remove;

  /// Tooltip: clears the search box.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// Screen title and avatar tooltip.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profile;

  /// Dialog title when leaving with unsaved marks.
  ///
  /// In en, this message translates to:
  /// **'Discard changes?'**
  String get discardTitle;

  /// Dialog body.
  ///
  /// In en, this message translates to:
  /// **'You have marks that are not saved yet.'**
  String get discardMarksBody;

  /// Dialog button: stay on the screen.
  ///
  /// In en, this message translates to:
  /// **'Keep editing'**
  String get keepEditing;

  /// Dialog button: leave without saving.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get discard;

  /// Relative day.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// Relative day.
  ///
  /// In en, this message translates to:
  /// **'Tomorrow'**
  String get tomorrow;

  /// Relative day (Hindi uses कल for both; context makes it clear).
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get yesterday;

  /// Greeting on Today before 12:00. name is the first name.
  ///
  /// In en, this message translates to:
  /// **'Good morning, {name}'**
  String greetingMorning(String name);

  /// Greeting 12:00–17:00.
  ///
  /// In en, this message translates to:
  /// **'Good afternoon, {name}'**
  String greetingAfternoon(String name);

  /// Greeting after 17:00.
  ///
  /// In en, this message translates to:
  /// **'Good evening, {name}'**
  String greetingEvening(String name);

  /// Bottom navigation tab.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get navToday;

  /// Bottom navigation tab and screen title.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get navHomework;

  /// Bottom navigation tab and screen title.
  ///
  /// In en, this message translates to:
  /// **'Marks'**
  String get navMarks;

  /// Bottom navigation tab and screen title.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get navMessages;

  /// Bottom navigation tab and screen title (short: tab is narrow).
  ///
  /// In en, this message translates to:
  /// **'Recordings'**
  String get navRecordings;

  /// Floating button and form title.
  ///
  /// In en, this message translates to:
  /// **'Assign homework'**
  String get assignHomework;

  /// Floating button and form title: a new test or assignment.
  ///
  /// In en, this message translates to:
  /// **'New assessment'**
  String get newAssessment;

  /// Floating button and screen title.
  ///
  /// In en, this message translates to:
  /// **'New message'**
  String get newMessage;

  /// Sign-in screen heading.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInTitle;

  /// Sign-in button.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInButton;

  /// Under the sign-in heading.
  ///
  /// In en, this message translates to:
  /// **'Use the account your institution gave you'**
  String get signInSubtitle;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Institution code'**
  String get institutionCode;

  /// Field hint; keep the example code in English.
  ///
  /// In en, this message translates to:
  /// **'e.g. demo-college'**
  String get institutionCodeHint;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Email or phone'**
  String get emailOrPhone;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get showPassword;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get hidePassword;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get serverAddress;

  /// Button showing the API host.
  ///
  /// In en, this message translates to:
  /// **'Server: {address}'**
  String serverLabel(String address);

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter your institution code'**
  String get enterInstitutionCode;

  /// Validation: only a-z, 0-9 and - are allowed.
  ///
  /// In en, this message translates to:
  /// **'Use letters, numbers and hyphens only'**
  String get institutionCodeChars;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter your email or phone number'**
  String get enterEmailOrPhone;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address'**
  String get invalidEmail;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email or 10-digit phone number'**
  String get invalidEmailOrPhone;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter your password'**
  String get enterPassword;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter a server address like https://api.kinetix.in'**
  String get invalidServer;

  /// Sign-in error.
  ///
  /// In en, this message translates to:
  /// **'This app is for teachers. Your account does not have a teaching role.'**
  String get errorNotTeacher;

  /// Network error.
  ///
  /// In en, this message translates to:
  /// **'Can\'t reach KINETIX. Check your internet connection and the server address.'**
  String get errorOffline;

  /// Network error.
  ///
  /// In en, this message translates to:
  /// **'The server is taking too long to respond. Try again.'**
  String get errorTimeout;

  /// HTTP 403.
  ///
  /// In en, this message translates to:
  /// **'You don\'t have access to this.'**
  String get errorForbidden;

  /// HTTP 404.
  ///
  /// In en, this message translates to:
  /// **'Not found.'**
  String get errorNotFound;

  /// HTTP 429.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Wait a minute and try again.'**
  String get errorTooManyAttempts;

  /// Any other HTTP error; status is the HTTP code.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong ({status}). Try again.'**
  String errorGeneric(int status);

  /// Server: invalid or expired token.
  ///
  /// In en, this message translates to:
  /// **'Your sign-in has expired. Sign in again.'**
  String get errorSessionExpired;

  /// Server: sign-in failed.
  ///
  /// In en, this message translates to:
  /// **'Wrong institution, login or password'**
  String get errorWrongLogin;

  /// Server: pairing code rejected.
  ///
  /// In en, this message translates to:
  /// **'This code is invalid or has expired. Use the new code on the board.'**
  String get errorCodeExpired;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'Your account is not active'**
  String get errorAccountInactive;

  /// Server: pairing with another campus board.
  ///
  /// In en, this message translates to:
  /// **'You are not a teacher at the campus this board belongs to'**
  String get errorOtherCampus;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'Not a KINETIX pairing QR code'**
  String get errorNotPairingQr;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'Attendance cannot be taken for a future date'**
  String get errorFutureAttendance;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'You do not teach this class'**
  String get errorNotYourClass;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'That subject is not taught in this class'**
  String get errorSubjectNotInClass;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'The due date has already passed'**
  String get errorDueDatePassed;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'Enter marks before publishing'**
  String get errorEnterMarksFirst;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'Some students are not in this class'**
  String get errorStudentsNotInClass;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'The recording is still uploading'**
  String get errorRecordingUploading;

  /// Server.
  ///
  /// In en, this message translates to:
  /// **'This recording was not made with a class, so there is no one to share it with'**
  String get errorRecordingNoClass;

  /// Player error for a missing recording.
  ///
  /// In en, this message translates to:
  /// **'This recording is not available yet. It may still be uploading from the board.'**
  String get recordingNotAvailable;

  /// Card title and screen title.
  ///
  /// In en, this message translates to:
  /// **'Connect to board'**
  String get connectToBoard;

  /// Card body.
  ///
  /// In en, this message translates to:
  /// **'Scan the QR code on the classroom board to start teaching'**
  String get connectToBoardBody;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Connect'**
  String get connect;

  /// Card label above the board name.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get connected;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'End class'**
  String get endClass;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'End class?'**
  String get endClassTitle;

  /// Dialog body; board is a board name like "Room 204 Board".
  ///
  /// In en, this message translates to:
  /// **'{board} will sign you out and return to its pairing screen.'**
  String endClassBody(String board);

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Class ended on {board}'**
  String classEnded(String board);

  /// Empty state; weekday is a full localised weekday name.
  ///
  /// In en, this message translates to:
  /// **'No classes on {weekday}'**
  String noClassesOn(String weekday);

  /// Button; day is "Tomorrow" or a short date.
  ///
  /// In en, this message translates to:
  /// **'Show {day}'**
  String showDay(String day);

  /// Section heading.
  ///
  /// In en, this message translates to:
  /// **'Today\'s classes'**
  String get todaysClasses;

  /// Section heading for a day this week; weekday is a full localised weekday name.
  ///
  /// In en, this message translates to:
  /// **'{weekday}\'s classes'**
  String weekdayClasses(String weekday);

  /// Section heading for a day further away; date is a short date.
  ///
  /// In en, this message translates to:
  /// **'Classes on {date}'**
  String classesOn(String date);

  /// Shown above the next teaching day.
  ///
  /// In en, this message translates to:
  /// **'No classes today'**
  String get noClassesToday;

  /// Number of periods in the day.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 period} other{{count} periods}}'**
  String periodCount(int count);

  /// Button once attendance is done.
  ///
  /// In en, this message translates to:
  /// **'Attendance taken'**
  String get attendanceTaken;

  /// Shown on future periods.
  ///
  /// In en, this message translates to:
  /// **'Attendance opens on the day'**
  String get attendanceOpensOnDay;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Take attendance'**
  String get takeAttendance;

  /// Badge on the current period.
  ///
  /// In en, this message translates to:
  /// **'Now'**
  String get now;

  /// Button on the current period.
  ///
  /// In en, this message translates to:
  /// **'Teach on board'**
  String get teachOnBoard;

  /// Screen title.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get attendance;

  /// Attendance status.
  ///
  /// In en, this message translates to:
  /// **'Present'**
  String get statusPresent;

  /// Attendance status, also the Absent chip in marks entry.
  ///
  /// In en, this message translates to:
  /// **'Absent'**
  String get statusAbsent;

  /// Attendance status.
  ///
  /// In en, this message translates to:
  /// **'Late'**
  String get statusLate;

  /// Attendance status: absent with permission (on leave).
  ///
  /// In en, this message translates to:
  /// **'Excused'**
  String get statusExcused;

  /// Summary part.
  ///
  /// In en, this message translates to:
  /// **'{count} present'**
  String countPresent(int count);

  /// Summary part.
  ///
  /// In en, this message translates to:
  /// **'{count} absent'**
  String countAbsent(int count);

  /// Summary part.
  ///
  /// In en, this message translates to:
  /// **'{count} late'**
  String countLate(int count);

  /// Summary part.
  ///
  /// In en, this message translates to:
  /// **'{count} excused'**
  String countExcused(int count);

  /// Snackbar; summary like "10 present · 2 absent".
  ///
  /// In en, this message translates to:
  /// **'Attendance saved · {summary}'**
  String attendanceSaved(String summary);

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Attendance updated · {summary}'**
  String attendanceUpdated(String summary);

  /// App bar button.
  ///
  /// In en, this message translates to:
  /// **'Mark all present'**
  String get markAllPresent;

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'No students in this class yet'**
  String get noStudentsInClass;

  /// Help text.
  ///
  /// In en, this message translates to:
  /// **'Already taken. Changes replace the earlier marks.'**
  String get attendanceAlreadyTaken;

  /// Help text.
  ///
  /// In en, this message translates to:
  /// **'Everyone starts present. Tap to mark absent, long-press for late.'**
  String get attendanceHelp;

  /// Button: resubmit attendance.
  ///
  /// In en, this message translates to:
  /// **'Update'**
  String get update;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get submit;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter all 6 digits shown on the board'**
  String get enterAllDigits;

  /// Heading.
  ///
  /// In en, this message translates to:
  /// **'Enter the code on the board'**
  String get enterCodeTitle;

  /// Help text.
  ///
  /// In en, this message translates to:
  /// **'It is the 6-digit number under the QR code. A new code appears every 2 minutes.'**
  String get enterCodeBody;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Scan QR code instead'**
  String get scanInstead;

  /// Heading.
  ///
  /// In en, this message translates to:
  /// **'You\'re connected'**
  String get youreConnected;

  /// Free session.
  ///
  /// In en, this message translates to:
  /// **'{board} is ready for you'**
  String boardReady(String board);

  /// Timetabled class.
  ///
  /// In en, this message translates to:
  /// **'{board} is showing your class'**
  String boardShowingClass(String board);

  /// Row label.
  ///
  /// In en, this message translates to:
  /// **'Board'**
  String get labelBoard;

  /// Row and field label: a group of students.
  ///
  /// In en, this message translates to:
  /// **'Class'**
  String get labelClass;

  /// Row and field label.
  ///
  /// In en, this message translates to:
  /// **'Subject'**
  String get labelSubject;

  /// Row label.
  ///
  /// In en, this message translates to:
  /// **'Period'**
  String get labelPeriod;

  /// A board session with no timetabled class.
  ///
  /// In en, this message translates to:
  /// **'Free session'**
  String get freeSession;

  /// Explains a free session.
  ///
  /// In en, this message translates to:
  /// **'You have no timetabled class right now, so the board opens without a class list. It signs you out after 2 hours.'**
  String get freeSessionBody;

  /// Scanner error.
  ///
  /// In en, this message translates to:
  /// **'That isn\'t a KINETIX board code. Scan the QR code on the board\'s screen.'**
  String get qrNotOurs;

  /// Scanner title.
  ///
  /// In en, this message translates to:
  /// **'Scan board QR code'**
  String get scanTitle;

  /// Tooltip: camera flashlight.
  ///
  /// In en, this message translates to:
  /// **'Torch'**
  String get torch;

  /// Scanner error.
  ///
  /// In en, this message translates to:
  /// **'Allow camera access in Settings to scan, or enter the code instead.'**
  String get cameraDenied;

  /// Scanner error.
  ///
  /// In en, this message translates to:
  /// **'The camera is not available. Enter the code instead.'**
  String get cameraUnavailable;

  /// Scanner hint.
  ///
  /// In en, this message translates to:
  /// **'Point your camera at the QR code on the board'**
  String get pointCamera;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Enter code instead'**
  String get enterCodeInstead;

  /// Field label and date picker title.
  ///
  /// In en, this message translates to:
  /// **'Due date'**
  String get dueDate;

  /// App bar button: assigns the homework.
  ///
  /// In en, this message translates to:
  /// **'Assign'**
  String get assign;

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'You have no classes in your timetable yet'**
  String get noClassesInTimetable;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Choose a subject'**
  String get chooseSubject;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get titleLabel;

  /// Field hint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Exercise 4.2, questions 1–5'**
  String get homeworkTitleHint;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Give the homework a title'**
  String get homeworkTitleRequired;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Instructions (optional)'**
  String get instructionsOptional;

  /// Snackbar; className like "BCom Sem 3 A".
  ///
  /// In en, this message translates to:
  /// **'Homework assigned to {className}'**
  String homeworkAssigned(String className);

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'No homework yet.\nAssign work to a class and it will show up here.'**
  String get noHomework;

  /// Short label on a homework card.
  ///
  /// In en, this message translates to:
  /// **'Due today'**
  String get dueToday;

  /// Short label on a homework card.
  ///
  /// In en, this message translates to:
  /// **'Due tomorrow'**
  String get dueTomorrow;

  /// Short label; date like "Tue, 6 Oct".
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String dueOn(String date);

  /// Short label on an overdue homework card.
  ///
  /// In en, this message translates to:
  /// **'Was due yesterday'**
  String get wasDueYesterday;

  /// Short label on an overdue homework card.
  ///
  /// In en, this message translates to:
  /// **'Was due {date}'**
  String wasDueOn(String date);

  /// Field label and date picker title: the date of the test.
  ///
  /// In en, this message translates to:
  /// **'Held on'**
  String get heldOn;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Enter the maximum marks'**
  String get enterMaxMarks;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Must be more than 0'**
  String get maxMustBePositive;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'At most 1000'**
  String get maxAtMost1000;

  /// App bar button.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get create;

  /// Field hint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Unit test 2: Redemption of shares'**
  String get assessmentTitleHint;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Give it a title'**
  String get assessmentTitleRequired;

  /// Label above test / assignment / exam chips.
  ///
  /// In en, this message translates to:
  /// **'Kind'**
  String get kind;

  /// Field label: maximum marks.
  ///
  /// In en, this message translates to:
  /// **'Out of'**
  String get outOf;

  /// Help text.
  ///
  /// In en, this message translates to:
  /// **'Marks stay private until you publish them. Then students and their families see their own marks and the class average.'**
  String get marksPrivateNote;

  /// Assessment kind (distinct from Exam).
  ///
  /// In en, this message translates to:
  /// **'Test'**
  String get kindTest;

  /// Assessment kind.
  ///
  /// In en, this message translates to:
  /// **'Assignment'**
  String get kindAssignment;

  /// Assessment kind: internal assessment.
  ///
  /// In en, this message translates to:
  /// **'Internal'**
  String get kindInternal;

  /// Assessment kind.
  ///
  /// In en, this message translates to:
  /// **'Exam'**
  String get kindExam;

  /// Assessment kind.
  ///
  /// In en, this message translates to:
  /// **'Practical'**
  String get kindPractical;

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'No tests or assignments for {className} yet.\nAdd one, enter marks and publish them to families.'**
  String noAssessments(String className);

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Published'**
  String get published;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get draft;

  /// Label before the average.
  ///
  /// In en, this message translates to:
  /// **'Class average'**
  String get classAverage;

  /// Card line; max is the maximum marks.
  ///
  /// In en, this message translates to:
  /// **'No marks yet · out of {max}'**
  String noMarksYet(String max);

  /// Card line.
  ///
  /// In en, this message translates to:
  /// **'{entered} of {total} entered'**
  String enteredOf(int entered, int total);

  /// Card line.
  ///
  /// In en, this message translates to:
  /// **'{entered} entered'**
  String enteredCount(int entered);

  /// Field error (very short).
  ///
  /// In en, this message translates to:
  /// **'Not a number'**
  String get notANumber;

  /// Field error (very short).
  ///
  /// In en, this message translates to:
  /// **'Max {max}'**
  String maxN(String max);

  /// Snackbar when saving with errors.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{One mark needs fixing} other{{count} marks need fixing}}'**
  String marksNeedFixing(int count);

  /// Bottom bar summary.
  ///
  /// In en, this message translates to:
  /// **'{marked} of {total} marked'**
  String markedOf(int marked, int total);

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Marks saved'**
  String get marksSaved;

  /// Snackbar part after "Marks saved".
  ///
  /// In en, this message translates to:
  /// **'class average {average} / {max}'**
  String savedClassAverage(String average, String max);

  /// Snackbar part.
  ///
  /// In en, this message translates to:
  /// **'families see the update'**
  String get familiesSeeUpdate;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Publish marks?'**
  String get publishTitle;

  /// Dialog body.
  ///
  /// In en, this message translates to:
  /// **'Students and families of the class will be notified and can see their own marks with the class average and highest.'**
  String get publishBody;

  /// Dialog warning.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 student has no marks yet.} other{{count} students have no marks yet.}}'**
  String publishBlank(int count);

  /// Dialog note.
  ///
  /// In en, this message translates to:
  /// **'You can still correct marks after publishing.'**
  String get publishCanCorrect;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get publish;

  /// Snackbar; title is the test title.
  ///
  /// In en, this message translates to:
  /// **'{title} published · families notified'**
  String publishedNotified(String title);

  /// Stat label (narrow column).
  ///
  /// In en, this message translates to:
  /// **'Average'**
  String get statAverage;

  /// Stat label (narrow column).
  ///
  /// In en, this message translates to:
  /// **'Highest'**
  String get statHighest;

  /// Stat label (narrow column).
  ///
  /// In en, this message translates to:
  /// **'Lowest'**
  String get statLowest;

  /// Stat label (narrow column): students with marks.
  ///
  /// In en, this message translates to:
  /// **'Marked'**
  String get statMarked;

  /// Help text.
  ///
  /// In en, this message translates to:
  /// **'Type marks out of {max}. Next on the keypad moves to the next student.'**
  String typeMarksHint(String max);

  /// Column heading.
  ///
  /// In en, this message translates to:
  /// **'Student'**
  String get columnStudent;

  /// Column heading.
  ///
  /// In en, this message translates to:
  /// **'Out of {max}'**
  String outOfN(String max);

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Edit remark'**
  String get editRemark;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Add remark'**
  String get addRemark;

  /// Hint in the marks box of an absent student (2–4 characters).
  ///
  /// In en, this message translates to:
  /// **'AB'**
  String get absentShort;

  /// Bottom bar hint.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{One mark is more than {max}} other{{count} marks are more than {max}}}'**
  String marksOverMax(int count, String max);

  /// Bottom bar hint.
  ///
  /// In en, this message translates to:
  /// **'Not saved yet'**
  String get notSavedYet;

  /// Bottom bar hint.
  ///
  /// In en, this message translates to:
  /// **'Published · families can see these marks'**
  String get publishedFamiliesSee;

  /// Bottom bar hint.
  ///
  /// In en, this message translates to:
  /// **'Type marks, then Save'**
  String get typeMarksThenSave;

  /// Bottom bar hint.
  ///
  /// In en, this message translates to:
  /// **'Saved · only you can see these marks'**
  String get savedOnlyYou;

  /// Sheet title.
  ///
  /// In en, this message translates to:
  /// **'Remark for {name}'**
  String remarkFor(String name);

  /// Sheet note.
  ///
  /// In en, this message translates to:
  /// **'Families see it with the marks.'**
  String get remarkFamiliesSee;

  /// Field hint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Neat working; revise journal entries'**
  String get remarkHint;

  /// Empty inbox.
  ///
  /// In en, this message translates to:
  /// **'No messages yet.\nWrite to a student’s parent with New message, or wait for families to write to you.'**
  String get noMessages;

  /// Thread preview with no messages.
  ///
  /// In en, this message translates to:
  /// **'No messages yet'**
  String get noMessagesPreview;

  /// Under a parent’s name in a thread.
  ///
  /// In en, this message translates to:
  /// **'Parent of {student} · {className}'**
  String aboutParent(String student, String className);

  /// Under an adult student’s name in a thread.
  ///
  /// In en, this message translates to:
  /// **'Student · {className}'**
  String aboutStudent(String className);

  /// Top of a chat.
  ///
  /// In en, this message translates to:
  /// **'Pull down for earlier messages'**
  String get pullForEarlier;

  /// Start of a chat.
  ///
  /// In en, this message translates to:
  /// **'Messages about {student} with {family}'**
  String chatTop(String student, String family);

  /// Message status.
  ///
  /// In en, this message translates to:
  /// **'Not sent · tap to retry'**
  String get notSentRetry;

  /// Message status.
  ///
  /// In en, this message translates to:
  /// **'Sending…'**
  String get sending;

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Message copied'**
  String get messageCopied;

  /// Composer hint.
  ///
  /// In en, this message translates to:
  /// **'Message {name}'**
  String messageHint(String name);

  /// Sheet title.
  ///
  /// In en, this message translates to:
  /// **'Write to {student}’s family'**
  String writeToFamily(String student);

  /// Sheet note.
  ///
  /// In en, this message translates to:
  /// **'The thread is between you and the person you choose. School leaders can review it.'**
  String get threadPrivacy;

  /// Guardian relation.
  ///
  /// In en, this message translates to:
  /// **'Father'**
  String get relationFather;

  /// Guardian relation.
  ///
  /// In en, this message translates to:
  /// **'Mother'**
  String get relationMother;

  /// Guardian relation.
  ///
  /// In en, this message translates to:
  /// **'Guardian'**
  String get relationGuardian;

  /// Guardian relation when none is recorded.
  ///
  /// In en, this message translates to:
  /// **'Parent'**
  String get relationParent;

  /// Search hint.
  ///
  /// In en, this message translates to:
  /// **'Search by name or roll number'**
  String get searchStudents;

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'No students in the classes you teach yet'**
  String get noStudentsTaught;

  /// Empty search.
  ///
  /// In en, this message translates to:
  /// **'No student matches “{query}”'**
  String noStudentMatches(String query);

  /// Student without a guardian.
  ///
  /// In en, this message translates to:
  /// **'No parent or guardian on record'**
  String get noGuardianOnRecord;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Share with the class?'**
  String get shareTitle;

  /// Dialog body.
  ///
  /// In en, this message translates to:
  /// **'Students of {className} and their families can watch \"{title}\" in their apps. Families of students who were absent get a notification.'**
  String shareBody(String className, String title);

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Shared with {className}'**
  String sharedWith(String className);

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'No recordings yet.\nTap Record on the board during class. The lesson shows up here once the board uploads it.'**
  String get noRecordings;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Uploading'**
  String get uploading;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Shared with class'**
  String get sharedWithClass;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'No class'**
  String get noClass;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Not shared'**
  String get notShared;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Preparing transcript'**
  String get preparingTranscript;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'Transcript ready'**
  String get transcriptReady;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'No transcript'**
  String get noTranscript;

  /// Badge.
  ///
  /// In en, this message translates to:
  /// **'No sound'**
  String get noSound;

  /// Card line.
  ///
  /// In en, this message translates to:
  /// **'Not linked to a class'**
  String get notLinkedToClass;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Play'**
  String get play;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Share with class'**
  String get shareWithClass;

  /// Recording length.
  ///
  /// In en, this message translates to:
  /// **'Under a minute'**
  String get durationUnderMinute;

  /// Recording length.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min'**
  String durationMinutes(int minutes);

  /// Recording length.
  ///
  /// In en, this message translates to:
  /// **'{hours} h'**
  String durationHours(int hours);

  /// Recording length.
  ///
  /// In en, this message translates to:
  /// **'{hours} h {minutes} min'**
  String durationHoursMinutes(int hours, int minutes);

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Sign out?'**
  String get signOutTitle;

  /// Dialog body.
  ///
  /// In en, this message translates to:
  /// **'You will need your password to sign in again.'**
  String get signOutBody;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// Snackbar; feature is one of the titles below.
  ///
  /// In en, this message translates to:
  /// **'{feature} is coming in a later update'**
  String comingLater(String feature);

  /// Section heading.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get account;

  /// Row label.
  ///
  /// In en, this message translates to:
  /// **'Institution'**
  String get institution;

  /// Row label and dialog title.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// Row label.
  ///
  /// In en, this message translates to:
  /// **'Server'**
  String get server;

  /// Section heading.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get comingSoon;

  /// Feature.
  ///
  /// In en, this message translates to:
  /// **'Announcements'**
  String get announcements;

  /// Feature description.
  ///
  /// In en, this message translates to:
  /// **'Send notices to your classes'**
  String get announcementsBody;

  /// Feature.
  ///
  /// In en, this message translates to:
  /// **'Student doubts'**
  String get studentDoubts;

  /// Feature description.
  ///
  /// In en, this message translates to:
  /// **'Answer questions from students'**
  String get studentDoubtsBody;

  /// Feature.
  ///
  /// In en, this message translates to:
  /// **'MCQ tests'**
  String get mcqTests;

  /// Feature description.
  ///
  /// In en, this message translates to:
  /// **'Online tests that sync to board quizzes'**
  String get mcqTestsBody;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get roleAdmin;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Principal'**
  String get rolePrincipal;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Head of department'**
  String get roleHod;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Teacher'**
  String get roleTeacher;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Student'**
  String get roleStudent;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Parent'**
  String get roleParent;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Librarian'**
  String get roleLibrarian;

  /// Role.
  ///
  /// In en, this message translates to:
  /// **'Accountant'**
  String get roleAccountant;

  /// Snackbar when saving the language to the server failed.
  ///
  /// In en, this message translates to:
  /// **'Language changed on this phone. It will be saved to your account next time you are online.'**
  String get languageSaveFailed;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'hi', 'kn'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'kn':
      return AppLocalizationsKn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}

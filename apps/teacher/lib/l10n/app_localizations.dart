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

  /// Today/timetable card on a holiday; title from the academic calendar.
  ///
  /// In en, this message translates to:
  /// **'Holiday: {title}. No classes.'**
  String holidayNoClasses(String title);

  /// Profile section with Calendar and Syllabus progress.
  ///
  /// In en, this message translates to:
  /// **'Teaching'**
  String get teaching;

  /// Academic calendar screen title and Profile entry.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get calendar;

  /// Profile → Calendar subtitle.
  ///
  /// In en, this message translates to:
  /// **'Holidays, exams and events'**
  String get calendarBody;

  /// Calendar entry kind.
  ///
  /// In en, this message translates to:
  /// **'Holiday'**
  String get calendarHoliday;

  /// Calendar entry kind.
  ///
  /// In en, this message translates to:
  /// **'Exam'**
  String get calendarExam;

  /// Calendar entry kind.
  ///
  /// In en, this message translates to:
  /// **'Event'**
  String get calendarEvent;

  /// Calendar empty state.
  ///
  /// In en, this message translates to:
  /// **'Nothing on the calendar for the next six months.'**
  String get calendarEmpty;

  /// Calendar entry for some programs only; programs are names like 'BCom, BBA'.
  ///
  /// In en, this message translates to:
  /// **'For {programs}'**
  String calendarFor(String programs);

  /// Syllabus screen title; button on a class card.
  ///
  /// In en, this message translates to:
  /// **'Syllabus'**
  String get syllabus;

  /// Profile entry and the class list for syllabus coverage.
  ///
  /// In en, this message translates to:
  /// **'Syllabus progress'**
  String get syllabusProgress;

  /// Profile → Syllabus progress subtitle.
  ///
  /// In en, this message translates to:
  /// **'Mark topics as taught for each class'**
  String get syllabusProgressBody;

  /// Syllabus screen when the subject has no course. Keep 'KINETIX ERP → Syllabus' in English.
  ///
  /// In en, this message translates to:
  /// **'This subject isn\'t linked to a syllabus yet. Your admin can link it in KINETIX ERP → Syllabus.'**
  String get syllabusUnlinked;

  /// Syllabus progress.
  ///
  /// In en, this message translates to:
  /// **'{covered} of {total} topics taught'**
  String topicsTaught(int covered, int total);

  /// Next to a chapter: topics taught of all its topics (digits only).
  ///
  /// In en, this message translates to:
  /// **'{covered}/{total}'**
  String chapterTaught(int covered, int total);

  /// Under a taught topic; date like 'Sat, 3 Oct'.
  ///
  /// In en, this message translates to:
  /// **'Taught {date}'**
  String taughtOn(String date);

  /// Under a taught topic: when and by which teacher.
  ///
  /// In en, this message translates to:
  /// **'Taught {date} · {name}'**
  String taughtOnBy(String date, String name);

  /// Date picker title and button tooltip for marking a topic as taught on an earlier day.
  ///
  /// In en, this message translates to:
  /// **'Taught on which day?'**
  String get taughtOnWhichDay;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Videos for this topic'**
  String get topicVideosTooltip;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Videos for this class'**
  String get topicVideosTitle;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'YouTube link'**
  String get topicVideoLink;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Paste a link. The title comes from YouTube. Only this class sees it until the principal approves sharing it.'**
  String get topicVideoLinkHelp;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Add video'**
  String get topicVideoAdd;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Video added for this class'**
  String get topicVideoAdded;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t add that video. Check the link and try again.'**
  String get topicVideoNotAdded;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t added videos to this topic yet.'**
  String get topicVideoNone;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Ask to share with everyone'**
  String get topicVideoShare;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Sent to the principal for approval'**
  String get topicVideoShareSent;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'This class only'**
  String get topicVideoStatusNone;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Waiting for approval'**
  String get topicVideoStatusPending;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Shared with everyone'**
  String get topicVideoStatusApproved;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get topicVideoStatusRejected;

  /// Teacher videos on a syllabus topic.
  ///
  /// In en, this message translates to:
  /// **'Remove video'**
  String get topicVideoRemove;

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Marked as taught'**
  String get topicMarked;

  /// Snackbar after unticking a topic.
  ///
  /// In en, this message translates to:
  /// **'Marked as not taught'**
  String get topicUnmarked;

  /// Syllabus progress with no classes.
  ///
  /// In en, this message translates to:
  /// **'You don\'t teach any classes yet.'**
  String get noClassesAssigned;

  /// Homework detail: the class's handed-in work.
  ///
  /// In en, this message translates to:
  /// **'Submissions'**
  String get submissions;

  /// Homework submission status: waiting to be checked.
  ///
  /// In en, this message translates to:
  /// **'Handed in'**
  String get statusHandedIn;

  /// Homework submission status.
  ///
  /// In en, this message translates to:
  /// **'Checked'**
  String get statusChecked;

  /// Homework submission status: sent back to be redone.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get statusReturned;

  /// Homework submission status.
  ///
  /// In en, this message translates to:
  /// **'Not handed in'**
  String get statusNotHandedIn;

  /// When a student handed in; when like 'Sun, 4 Oct · 10:02 AM'.
  ///
  /// In en, this message translates to:
  /// **'Handed in {when}'**
  String handedInAt(String when);

  /// Submission: the student's written answer.
  ///
  /// In en, this message translates to:
  /// **'Answer'**
  String get answer;

  /// Submission: attached photos and PDFs.
  ///
  /// In en, this message translates to:
  /// **'Photos and files'**
  String get photosAndFiles;

  /// Submission file row.
  ///
  /// In en, this message translates to:
  /// **'Open PDF'**
  String get openPdf;

  /// Snackbar when no app could open a submitted file.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open this file. Install an app that opens PDFs.'**
  String get couldNotOpenFile;

  /// Label above the review remark field.
  ///
  /// In en, this message translates to:
  /// **'Remark (optional)'**
  String get remarkOptional;

  /// Hint in the review remark field.
  ///
  /// In en, this message translates to:
  /// **'e.g. Good work, or what to redo'**
  String get reviewRemarkHint;

  /// Button: send the homework back to be redone.
  ///
  /// In en, this message translates to:
  /// **'Return to redo'**
  String get returnWork;

  /// Button: the homework has been checked.
  ///
  /// In en, this message translates to:
  /// **'Mark as checked'**
  String get checkWork;

  /// Under the review buttons.
  ///
  /// In en, this message translates to:
  /// **'The student and their family are told, with your remark.'**
  String get reviewNotifies;

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s homework marked as checked'**
  String workChecked(String name);

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s homework returned to redo'**
  String workReturned(String name);

  /// Photo viewer title.
  ///
  /// In en, this message translates to:
  /// **'Photo {index} of {count}'**
  String photoOf(int index, int count);

  /// Error (SUBMISSION_MISSING).
  ///
  /// In en, this message translates to:
  /// **'Nothing has been handed in yet'**
  String get errorNothingHandedIn;

  /// Error (TOPIC_NOT_IN_SYLLABUS).
  ///
  /// In en, this message translates to:
  /// **'That topic is not in this subject\'s syllabus'**
  String get errorTopicNotInSyllabus;

  /// Error (COVERAGE_FUTURE_DATE).
  ///
  /// In en, this message translates to:
  /// **'A topic cannot be marked as taught in the future'**
  String get errorFutureCoverage;

  /// Error (VALIDATION): the server rejected the form's fields.
  ///
  /// In en, this message translates to:
  /// **'Some details are not right. Check them and try again.'**
  String get errorValidation;

  /// Title: a class's syllabus spread over the weeks of the term.
  ///
  /// In en, this message translates to:
  /// **'Year plan'**
  String get yearPlan;

  /// Empty state on the year plan screen.
  ///
  /// In en, this message translates to:
  /// **'No year plan yet. KINETIX can spread this subject\'s syllabus over the weeks of the term, using your timetable and skipping holidays and exams. You can move topics afterwards.'**
  String get yearPlanNone;

  /// Button and dialog title: generate the year plan.
  ///
  /// In en, this message translates to:
  /// **'Make a year plan'**
  String get makeYearPlan;

  /// Dialog button: generate the plan with these dates.
  ///
  /// In en, this message translates to:
  /// **'Make plan'**
  String get makePlan;

  /// Menu item: generate the year plan again.
  ///
  /// In en, this message translates to:
  /// **'Remake plan'**
  String get remakeYearPlan;

  /// Confirmation dialog title.
  ///
  /// In en, this message translates to:
  /// **'Remake the year plan?'**
  String get remakeYearPlanTitle;

  /// Confirmation dialog body for remaking the year plan.
  ///
  /// In en, this message translates to:
  /// **'All weeks will be planned again from the dates you choose, and topics you moved go back. Topics already taught stay taught.'**
  String get remakeYearPlanBody;

  /// Button: confirm remaking the plan.
  ///
  /// In en, this message translates to:
  /// **'Remake'**
  String get remake;

  /// Note in the make-plan dialog about the default dates.
  ///
  /// In en, this message translates to:
  /// **'Unless you change them, the plan covers 16 weeks from today, up to the end of the academic year.'**
  String get planDatesNote;

  /// Year plan start date.
  ///
  /// In en, this message translates to:
  /// **'Starts on'**
  String get planStartsOn;

  /// Year plan end date.
  ///
  /// In en, this message translates to:
  /// **'Ends on'**
  String get planEndsOn;

  /// Snackbar after generating.
  ///
  /// In en, this message translates to:
  /// **'Year plan made'**
  String get yearPlanMade;

  /// Snackbar after moving a topic.
  ///
  /// In en, this message translates to:
  /// **'Plan updated'**
  String get yearPlanUpdated;

  /// Year plan status.
  ///
  /// In en, this message translates to:
  /// **'Not started'**
  String get planNotStarted;

  /// Year plan status.
  ///
  /// In en, this message translates to:
  /// **'On track'**
  String get planOnTrack;

  /// Year plan status.
  ///
  /// In en, this message translates to:
  /// **'Ahead of plan'**
  String get planAhead;

  /// Year plan status: topics planned for earlier weeks not taught yet.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Behind by 1 topic} other{Behind by {count} topics}}'**
  String planBehindBy(int count);

  /// Week heading; date is the Monday, e.g. "Mon, 5 Oct".
  ///
  /// In en, this message translates to:
  /// **'Week of {date}'**
  String weekOf(String date);

  /// Pill on the current week.
  ///
  /// In en, this message translates to:
  /// **'This week'**
  String get thisWeek;

  /// Periods planned for a topic.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 period} other{{count} periods}}'**
  String periodsCount(int count);

  /// Marker: topic planned for an earlier week, not taught yet.
  ///
  /// In en, this message translates to:
  /// **'Late'**
  String get planLate;

  /// Tooltip on a year plan topic.
  ///
  /// In en, this message translates to:
  /// **'Change week or periods'**
  String get changeWeek;

  /// Label: week picker.
  ///
  /// In en, this message translates to:
  /// **'Week'**
  String get planWeek;

  /// Label: periods for a topic.
  ///
  /// In en, this message translates to:
  /// **'Periods'**
  String get planPeriods;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Fewer periods'**
  String get fewerPeriods;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'More periods'**
  String get morePeriods;

  /// Button on a period card: open its lesson plan (none saved yet).
  ///
  /// In en, this message translates to:
  /// **'Plan'**
  String get planLesson;

  /// Button on a period card: a lesson plan is saved.
  ///
  /// In en, this message translates to:
  /// **'Planned'**
  String get lessonPlanned;

  /// Title of the lesson plan editor.
  ///
  /// In en, this message translates to:
  /// **'Lesson plan'**
  String get lessonPlan;

  /// Section: syllabus topics of the lesson.
  ///
  /// In en, this message translates to:
  /// **'Topics'**
  String get lessonTopics;

  /// When the lesson has no topics.
  ///
  /// In en, this message translates to:
  /// **'No topics chosen'**
  String get noTopicsChosen;

  /// Button and sheet title: pick syllabus topics.
  ///
  /// In en, this message translates to:
  /// **'Choose topics'**
  String get chooseTopics;

  /// Topic picker: suggested from the year plan.
  ///
  /// In en, this message translates to:
  /// **'In the year plan for this week'**
  String get suggestedThisWeek;

  /// Section of a lesson plan.
  ///
  /// In en, this message translates to:
  /// **'Objectives'**
  String get lessonObjectives;

  /// Hint in an objective field.
  ///
  /// In en, this message translates to:
  /// **'Students will be able to…'**
  String get objectiveHint;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Add objective'**
  String get addObjective;

  /// Section of a lesson plan: timed steps.
  ///
  /// In en, this message translates to:
  /// **'Steps'**
  String get lessonSteps;

  /// Hint in a step activity field.
  ///
  /// In en, this message translates to:
  /// **'What happens in this step'**
  String get stepHint;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Add step'**
  String get addStep;

  /// Label of a step's minutes field (very short).
  ///
  /// In en, this message translates to:
  /// **'Min'**
  String get minutesShortLabel;

  /// Steps total vs the period length.
  ///
  /// In en, this message translates to:
  /// **'{planned} of {length} min'**
  String stepsTotal(int planned, int length);

  /// Steps add up to more than the period.
  ///
  /// In en, this message translates to:
  /// **'{planned} min, period is {length}'**
  String stepsOver(int planned, int length);

  /// Menu item: reorder a step.
  ///
  /// In en, this message translates to:
  /// **'Move up'**
  String get moveUp;

  /// Menu item: reorder a step.
  ///
  /// In en, this message translates to:
  /// **'Move down'**
  String get moveDown;

  /// Tooltip on a menu button.
  ///
  /// In en, this message translates to:
  /// **'More options'**
  String get moreOptions;

  /// Section of a lesson plan.
  ///
  /// In en, this message translates to:
  /// **'Materials'**
  String get lessonMaterials;

  /// Hint in a material field.
  ///
  /// In en, this message translates to:
  /// **'e.g. chart paper, textbook p. 42'**
  String get materialHint;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Add material'**
  String get addMaterial;

  /// Section: how the teacher checks what students learnt.
  ///
  /// In en, this message translates to:
  /// **'Check understanding'**
  String get lessonCheck;

  /// Hint.
  ///
  /// In en, this message translates to:
  /// **'How you will check what students learnt'**
  String get lessonCheckHint;

  /// Section of a lesson plan.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get lessonHomework;

  /// Hint: homework is optional.
  ///
  /// In en, this message translates to:
  /// **'Optional'**
  String get lessonHomeworkHint;

  /// Button: KINETIX AI writes a first draft.
  ///
  /// In en, this message translates to:
  /// **'Draft with KINETIX AI'**
  String get draftWithAi;

  /// While drafting.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is drafting…'**
  String get drafting;

  /// Confirmation dialog title.
  ///
  /// In en, this message translates to:
  /// **'Replace with a KINETIX AI draft?'**
  String get replaceWithDraftTitle;

  /// Confirmation dialog body.
  ///
  /// In en, this message translates to:
  /// **'The topics, objectives, steps, materials and check in this plan will be replaced. Your homework is kept.'**
  String get replaceWithDraftBody;

  /// Button: confirm replacing with the draft.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get replace;

  /// Label on a plan written by KINETIX AI.
  ///
  /// In en, this message translates to:
  /// **'AI draft — check before use'**
  String get aiDraftLabel;

  /// Shown when the draft is a placeholder (meta.preview).
  ///
  /// In en, this message translates to:
  /// **'Preview: a sample draft, because the KINETIX AI server is not connected.'**
  String get aiPreviewNote;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Save plan'**
  String get savePlan;

  /// Snackbar.
  ///
  /// In en, this message translates to:
  /// **'Lesson plan saved'**
  String get lessonPlanSaved;

  /// The head of department or principal reviewed the plan.
  ///
  /// In en, this message translates to:
  /// **'Reviewed on {date}'**
  String reviewedOn(String date);

  /// Title of the review remark card.
  ///
  /// In en, this message translates to:
  /// **'Remark from your head of department'**
  String get reviewRemark;

  /// Discard dialog body.
  ///
  /// In en, this message translates to:
  /// **'Your lesson plan has changes that are not saved yet.'**
  String get discardPlanBody;

  /// Error: year plan for a subject with no syllabus.
  ///
  /// In en, this message translates to:
  /// **'This subject has no syllabus yet. Ask your administrator to link it to a course.'**
  String get errorPlanNoSyllabus;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'This subject has no periods in the timetable for this class.'**
  String get errorPlanNoPeriods;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'There are no teaching days between these dates.'**
  String get errorPlanNoTeachingDays;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'The end date must be after the start date.'**
  String get errorPlanEndsBeforeStart;

  /// Error: saving a lesson plan for a day the period is not on.
  ///
  /// In en, this message translates to:
  /// **'This class is not on that day.'**
  String get errorPeriodNotOnDay;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'Your institution has used today\'s KINETIX AI allowance. It resets tomorrow.'**
  String get errorAiAllowance;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is not reachable right now. Try again in a minute.'**
  String get errorAiUnavailable;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI could not write a usable draft. Try again.'**
  String get errorAiUnusable;

  /// The lesson plan's reviewer (head of department or principal) and the date.
  ///
  /// In en, this message translates to:
  /// **'Reviewed by {name} on {date}'**
  String reviewedByOn(String name, String date);

  /// Button: switch to signing in with a code sent by SMS.
  ///
  /// In en, this message translates to:
  /// **'Sign in with phone'**
  String get signInWithPhone;

  /// Button: switch back to email or phone and password.
  ///
  /// In en, this message translates to:
  /// **'Sign in with password'**
  String get signInWithPassword;

  /// Under the sign-in heading, phone sign-in.
  ///
  /// In en, this message translates to:
  /// **'We\'ll text a 6-digit code to your registered mobile number'**
  String get phoneSignInSubtitle;

  /// Field label (after the +91 prefix).
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get mobileNumber;

  /// Validation: empty mobile number.
  ///
  /// In en, this message translates to:
  /// **'Enter your mobile number'**
  String get enterMobileNumber;

  /// Validation: not a 10-digit Indian mobile number.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid 10-digit mobile number'**
  String get invalidMobileNumber;

  /// Button: text a sign-in code to the number.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get sendCode;

  /// Above the code field.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code sent to {phone}'**
  String otpSentTo(String phone);

  /// Field label: the code from the SMS.
  ///
  /// In en, this message translates to:
  /// **'Sign-in code'**
  String get otpCode;

  /// Validation: code missing or too short.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get enterOtp;

  /// Disabled button with a countdown, e.g. 0:25.
  ///
  /// In en, this message translates to:
  /// **'Resend code in {time}'**
  String resendCodeIn(String time);

  /// Button: text a new code.
  ///
  /// In en, this message translates to:
  /// **'Resend code'**
  String get resendCode;

  /// Snackbar after resending.
  ///
  /// In en, this message translates to:
  /// **'New code sent'**
  String get codeResent;

  /// Button: back to the mobile number.
  ///
  /// In en, this message translates to:
  /// **'Change number'**
  String get changeNumber;

  /// Server: OTP_INVALID.
  ///
  /// In en, this message translates to:
  /// **'That code is wrong or has expired. Check the SMS or send a new code.'**
  String get errorOtpInvalid;

  /// Marks demo builds in the app bar.
  ///
  /// In en, this message translates to:
  /// **'DEMO'**
  String get demoChip;

  /// Title of the banner on the sign-in screen of demo builds.
  ///
  /// In en, this message translates to:
  /// **'Demo mode'**
  String get demoBannerTitle;

  /// Body of the demo banner.
  ///
  /// In en, this message translates to:
  /// **'Sample data from KINETIX Demo College. Nothing is sent to a server, and your changes last until the app is closed.'**
  String get demoBannerBody;

  /// One-tap demo sign-in button.
  ///
  /// In en, this message translates to:
  /// **'Sign in as {name}'**
  String demoSignInAs(String name);

  /// Hint under the phone sign-in in demo builds.
  ///
  /// In en, this message translates to:
  /// **'Demo: any number works; the code is 123456.'**
  String get demoOtpHint;

  /// Shown for features that need a real server (live video, audio, playback).
  ///
  /// In en, this message translates to:
  /// **'Not available in the demo.'**
  String get notInDemo;

  /// Pill: the teacher keeps this recording past the end of its term.
  ///
  /// In en, this message translates to:
  /// **'Kept'**
  String get recordingKept;

  /// Pill: the day the recording is deleted (end of term plus grace).
  ///
  /// In en, this message translates to:
  /// **'Deleted on {date}'**
  String recordingDeletedOn(String date);

  /// Button: keep the recording after its term ends.
  ///
  /// In en, this message translates to:
  /// **'Keep'**
  String get keepRecording;

  /// Button: let a kept recording be deleted with its term.
  ///
  /// In en, this message translates to:
  /// **'Don\'t keep'**
  String get dontKeepRecording;

  /// Tooltip of the Keep button.
  ///
  /// In en, this message translates to:
  /// **'Kept recordings are not deleted when the term ends'**
  String get keepRecordingTooltip;

  /// Button: use this phone to control the classroom board.
  ///
  /// In en, this message translates to:
  /// **'Phone remote'**
  String get phoneRemote;

  /// No description provided for @remoteTitle.
  ///
  /// In en, this message translates to:
  /// **'Remote · {board}'**
  String remoteTitle(String board);

  /// No description provided for @remoteEnded.
  ///
  /// In en, this message translates to:
  /// **'The class on this board has ended.'**
  String get remoteEnded;

  /// No description provided for @remotePhotoSent.
  ///
  /// In en, this message translates to:
  /// **'Photo is on the board.'**
  String get remotePhotoSent;

  /// No description provided for @remotePhotoFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not send the photo. Try again.'**
  String get remotePhotoFailed;

  /// No description provided for @remotePages.
  ///
  /// In en, this message translates to:
  /// **'Board pages'**
  String get remotePages;

  /// No description provided for @remotePrevious.
  ///
  /// In en, this message translates to:
  /// **'Previous'**
  String get remotePrevious;

  /// No description provided for @remoteNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get remoteNext;

  /// No description provided for @remotePageOf.
  ///
  /// In en, this message translates to:
  /// **'Page {page} of {pages}'**
  String remotePageOf(int page, int pages);

  /// No description provided for @remoteSlides.
  ///
  /// In en, this message translates to:
  /// **'Slides and PDF'**
  String get remoteSlides;

  /// No description provided for @remoteNoSlides.
  ///
  /// In en, this message translates to:
  /// **'Open slides or a PDF on the board to turn them from here.'**
  String get remoteNoSlides;

  /// No description provided for @remoteSlideOf.
  ///
  /// In en, this message translates to:
  /// **'Slide {slide} of {slides}'**
  String remoteSlideOf(int slide, int slides);

  /// No description provided for @remotePointer.
  ///
  /// In en, this message translates to:
  /// **'Pointer'**
  String get remotePointer;

  /// No description provided for @remotePointerHint.
  ///
  /// In en, this message translates to:
  /// **'Slide your finger here to point on the board'**
  String get remotePointerHint;

  /// No description provided for @remoteClassroom.
  ///
  /// In en, this message translates to:
  /// **'Classroom tools'**
  String get remoteClassroom;

  /// No description provided for @remoteTimerMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min timer'**
  String remoteTimerMinutes(int minutes);

  /// No description provided for @remoteTimerStop.
  ///
  /// In en, this message translates to:
  /// **'Stop timer'**
  String get remoteTimerStop;

  /// No description provided for @remotePickStudent.
  ///
  /// In en, this message translates to:
  /// **'Pick a student'**
  String get remotePickStudent;

  /// No description provided for @remoteShowPhoto.
  ///
  /// In en, this message translates to:
  /// **'Show a photo'**
  String get remoteShowPhoto;

  /// No description provided for @remoteStartRecording.
  ///
  /// In en, this message translates to:
  /// **'Record lesson'**
  String get remoteStartRecording;

  /// No description provided for @remoteStopRecording.
  ///
  /// In en, this message translates to:
  /// **'Stop recording'**
  String get remoteStopRecording;

  /// No description provided for @answerCards.
  ///
  /// In en, this message translates to:
  /// **'Answer cards'**
  String get answerCards;

  /// No description provided for @answerCardsMenuBody.
  ///
  /// In en, this message translates to:
  /// **'Print cards so students without phones can answer on the board'**
  String get answerCardsMenuBody;

  /// No description provided for @answerCardsBody.
  ///
  /// In en, this message translates to:
  /// **'Each student gets one card, numbered by roll number. In \"Ask the class\" on the board they hold it up with their answer on top, and the board reads the whole class from one photo.'**
  String get answerCardsBody;

  /// Printed on each card. Kept in English in Hindi and Kannada until the PDF bundles Devanagari and Kannada shaping.
  ///
  /// In en, this message translates to:
  /// **'Hold the card with your answer at the top. Keep your fingers off the black pattern.'**
  String get answerCardsPrintHint;

  /// No description provided for @answerCardsReady.
  ///
  /// In en, this message translates to:
  /// **'{count} cards for {className} are ready to print.'**
  String answerCardsReady(int count, String className);

  /// No description provided for @answerCardsFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not make the cards. Try again.'**
  String get answerCardsFailed;

  /// No description provided for @print.
  ///
  /// In en, this message translates to:
  /// **'Print'**
  String get print;

  /// No description provided for @filterMissing.
  ///
  /// In en, this message translates to:
  /// **'Missing'**
  String get filterMissing;

  /// No description provided for @remindMissing.
  ///
  /// In en, this message translates to:
  /// **'Remind the {count}'**
  String remindMissing(int count);

  /// No description provided for @remindTitle.
  ///
  /// In en, this message translates to:
  /// **'Remind {count} students?'**
  String remindTitle(int count);

  /// No description provided for @remindBody.
  ///
  /// In en, this message translates to:
  /// **'They and their families get a notification that this homework is not handed in yet.'**
  String get remindBody;

  /// No description provided for @remind.
  ///
  /// In en, this message translates to:
  /// **'Remind'**
  String get remind;

  /// No description provided for @reminded.
  ///
  /// In en, this message translates to:
  /// **'Reminded {count} students and their families'**
  String reminded(int count);

  /// No description provided for @noneInFilter.
  ///
  /// In en, this message translates to:
  /// **'No students here'**
  String get noneInFilter;

  /// No description provided for @classAndSubject.
  ///
  /// In en, this message translates to:
  /// **'Class and subject'**
  String get classAndSubject;

  /// No description provided for @classRoster.
  ///
  /// In en, this message translates to:
  /// **'Class roster'**
  String get classRoster;

  /// No description provided for @classRosterBody.
  ///
  /// In en, this message translates to:
  /// **'Your students; award badges'**
  String get classRosterBody;

  /// No description provided for @chooseClass.
  ///
  /// In en, this message translates to:
  /// **'Choose a class'**
  String get chooseClass;

  /// No description provided for @driverMode.
  ///
  /// In en, this message translates to:
  /// **'Driver mode'**
  String get driverMode;

  /// No description provided for @driverModeBody.
  ///
  /// In en, this message translates to:
  /// **'Start a bus trip and share the bus location'**
  String get driverModeBody;

  /// No description provided for @driverNoRoutes.
  ///
  /// In en, this message translates to:
  /// **'No route is assigned to you yet. Ask the transport office.'**
  String get driverNoRoutes;

  /// No description provided for @driverRoute.
  ///
  /// In en, this message translates to:
  /// **'Route'**
  String get driverRoute;

  /// No description provided for @driverDirection.
  ///
  /// In en, this message translates to:
  /// **'Direction'**
  String get driverDirection;

  /// No description provided for @driverPickup.
  ///
  /// In en, this message translates to:
  /// **'Pickup (to school)'**
  String get driverPickup;

  /// No description provided for @driverDrop.
  ///
  /// In en, this message translates to:
  /// **'Drop (home)'**
  String get driverDrop;

  /// No description provided for @driverStart.
  ///
  /// In en, this message translates to:
  /// **'Start trip'**
  String get driverStart;

  /// No description provided for @driverEnd.
  ///
  /// In en, this message translates to:
  /// **'End trip'**
  String get driverEnd;

  /// No description provided for @driverRunning.
  ///
  /// In en, this message translates to:
  /// **'Trip running'**
  String get driverRunning;

  /// No description provided for @driverTripEnded.
  ///
  /// In en, this message translates to:
  /// **'Trip ended'**
  String get driverTripEnded;

  /// No description provided for @driverNextStops.
  ///
  /// In en, this message translates to:
  /// **'Next stops'**
  String get driverNextStops;

  /// No description provided for @driverNoMoreStops.
  ///
  /// In en, this message translates to:
  /// **'No more stops'**
  String get driverNoMoreStops;

  /// No description provided for @driverLastSent.
  ///
  /// In en, this message translates to:
  /// **'Location sent at {time}'**
  String driverLastSent(Object time);

  /// No description provided for @driverWaitingGps.
  ///
  /// In en, this message translates to:
  /// **'Waiting for GPS...'**
  String get driverWaitingGps;

  /// No description provided for @driverLocationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission is needed to share the bus location. Allow it in Settings.'**
  String get driverLocationDenied;

  /// No description provided for @driverLocationOff.
  ///
  /// In en, this message translates to:
  /// **'Turn on the phone location (GPS) to start the trip.'**
  String get driverLocationOff;

  /// No description provided for @driverSendFailing.
  ///
  /// In en, this message translates to:
  /// **'Cannot reach the server. Still trying...'**
  String get driverSendFailing;

  /// No description provided for @driverKeepOpen.
  ///
  /// In en, this message translates to:
  /// **'Keep this screen open while the bus is moving.'**
  String get driverKeepOpen;

  /// No description provided for @driverVehicle.
  ///
  /// In en, this message translates to:
  /// **'Bus {regNo}'**
  String driverVehicle(Object regNo);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Work'**
  String get workSection;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get leaveTitle;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Balances, apply and approvals'**
  String get leaveBody;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Check-in'**
  String get checkInTitle;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Mark your day and see your month'**
  String get checkInBody;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Payslips'**
  String get payslipsTitle;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Your monthly salary slips'**
  String get payslipsBody;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'My leave'**
  String get leaveMine;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'To approve'**
  String get leaveApprovals;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Balances'**
  String get leaveBalances;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Apply for leave'**
  String get leaveApply;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Leave type'**
  String get leaveType;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get leaveFrom;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get leaveTo;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Half day'**
  String get leaveHalfDay;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Reason (optional)'**
  String get leaveReason;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get leaveSubmit;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Working days: {days}'**
  String leaveDaysCount(String days);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'{days} left'**
  String leaveAvailable(String days);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'{days} days'**
  String leaveDaysLabel(String days);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'No leave requests yet.'**
  String get leaveNone;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Nothing is waiting for your decision.'**
  String get leaveNoApprovals;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Cancel request'**
  String get leaveCancelAction;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get leaveApprove;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get leaveReject;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Note (optional)'**
  String get leaveDecisionNote;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get leaveStatusPending;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get leaveStatusApproved;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get leaveStatusRejected;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get leaveStatusCancelled;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Check in'**
  String get checkInButton;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Check out'**
  String get checkOutButton;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Checked in at {time}'**
  String checkedInAt(String time);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Checked out at {time}'**
  String checkedOutAt(String time);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'You have not checked in today.'**
  String get notCheckedIn;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get attendanceMonth;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Present'**
  String get attStatusPresent;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Absent'**
  String get attStatusAbsent;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Half day'**
  String get attStatusHalfDay;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'On leave'**
  String get attStatusOnLeave;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Net pay'**
  String get payslipNet;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Gross'**
  String get payslipGross;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get payslipEarnings;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Deductions'**
  String get payslipDeductions;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Paid days {paid}, loss of pay {lop}'**
  String payslipDays(String paid, String lop);

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'Open PDF'**
  String get payslipOpenPdf;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'No payslips yet. They appear when payroll is finalised.'**
  String get payslipsEmpty;

  /// HR screens (leave, check-in, payslips).
  ///
  /// In en, this message translates to:
  /// **'HR manager'**
  String get roleHr;

  /// Bottom navigation tab.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// Bottom navigation tab: the timetable.
  ///
  /// In en, this message translates to:
  /// **'Classes'**
  String get navClasses;

  /// Bottom navigation tab: the class roster.
  ///
  /// In en, this message translates to:
  /// **'Students'**
  String get navStudents;

  /// Bottom navigation tab: everything else.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get navMore;

  /// Line under the greeting on Home.
  ///
  /// In en, this message translates to:
  /// **'Let\'s make today a great day!'**
  String get homeSubtitle;

  /// Link to the full list.
  ///
  /// In en, this message translates to:
  /// **'View all'**
  String get viewAll;

  /// Button on a period: connects the board.
  ///
  /// In en, this message translates to:
  /// **'Start class'**
  String get startClass;

  /// Section title on Home.
  ///
  /// In en, this message translates to:
  /// **'Quick actions'**
  String get quickActions;

  /// Quick action.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get qaAttendance;

  /// Quick action.
  ///
  /// In en, this message translates to:
  /// **'Assignment'**
  String get qaAssignment;

  /// Quick action: a new assessment.
  ///
  /// In en, this message translates to:
  /// **'Quiz'**
  String get qaQuiz;

  /// Quick action: connect to the board.
  ///
  /// In en, this message translates to:
  /// **'Smartboard'**
  String get qaSmartboard;

  /// Quick action: the syllabus and its videos.
  ///
  /// In en, this message translates to:
  /// **'Study material'**
  String get qaStudyMaterial;

  /// Quick action: AI lesson plan.
  ///
  /// In en, this message translates to:
  /// **'AI Assistant'**
  String get qaAiAssistant;

  /// Section title on Home: leave requests waiting.
  ///
  /// In en, this message translates to:
  /// **'Pending approvals'**
  String get pendingApprovals;

  /// Empty state for pending approvals.
  ///
  /// In en, this message translates to:
  /// **'Nothing waiting for you.'**
  String get allCaughtUp;

  /// Title of the sheet that picks a period.
  ///
  /// In en, this message translates to:
  /// **'Choose a class'**
  String get pickAClass;

  /// Under a leave request's name on Home.
  ///
  /// In en, this message translates to:
  /// **'{type}: {days} day(s)'**
  String leaveRequestLine(String type, String days);

  /// No description provided for @workToolsSection.
  ///
  /// In en, this message translates to:
  /// **'Staff tools'**
  String get workToolsSection;

  /// No description provided for @tasksTitle.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get tasksTitle;

  /// No description provided for @tasksBody.
  ///
  /// In en, this message translates to:
  /// **'What is assigned to you and what you asked of others'**
  String get tasksBody;

  /// No description provided for @requestsTitle.
  ///
  /// In en, this message translates to:
  /// **'Requests and approvals'**
  String get requestsTitle;

  /// No description provided for @requestsBody.
  ///
  /// In en, this message translates to:
  /// **'Start a request, track it and decide what waits for you'**
  String get requestsBody;

  /// No description provided for @subsTitle.
  ///
  /// In en, this message translates to:
  /// **'Substitutions'**
  String get subsTitle;

  /// No description provided for @subsBody.
  ///
  /// In en, this message translates to:
  /// **'Periods you cover for colleagues'**
  String get subsBody;

  /// No description provided for @dutiesTitle.
  ///
  /// In en, this message translates to:
  /// **'Invigilation duties'**
  String get dutiesTitle;

  /// No description provided for @dutiesBody.
  ///
  /// In en, this message translates to:
  /// **'Your exam hall duties'**
  String get dutiesBody;

  /// No description provided for @evalTitle.
  ///
  /// In en, this message translates to:
  /// **'Evaluation desk'**
  String get evalTitle;

  /// No description provided for @evalBody.
  ///
  /// In en, this message translates to:
  /// **'Value the answer scripts allocated to you'**
  String get evalBody;

  /// No description provided for @mentoringTitle.
  ///
  /// In en, this message translates to:
  /// **'Mentoring'**
  String get mentoringTitle;

  /// No description provided for @mentoringBody.
  ///
  /// In en, this message translates to:
  /// **'Your mentees, sessions and plans'**
  String get mentoringBody;

  /// No description provided for @courseRosterTitle.
  ///
  /// In en, this message translates to:
  /// **'Course rosters'**
  String get courseRosterTitle;

  /// No description provided for @courseRosterBody.
  ///
  /// In en, this message translates to:
  /// **'Who registered for the courses you teach'**
  String get courseRosterBody;

  /// No description provided for @surveysTitle.
  ///
  /// In en, this message translates to:
  /// **'Surveys'**
  String get surveysTitle;

  /// No description provided for @surveysBody.
  ///
  /// In en, this message translates to:
  /// **'Surveys waiting for your answers'**
  String get surveysBody;

  /// No description provided for @clubsTitle.
  ///
  /// In en, this message translates to:
  /// **'Clubs I coordinate'**
  String get clubsTitle;

  /// No description provided for @clubsBody.
  ///
  /// In en, this message translates to:
  /// **'Members and points of your clubs'**
  String get clubsBody;

  /// No description provided for @tasksMineTab.
  ///
  /// In en, this message translates to:
  /// **'Assigned to me'**
  String get tasksMineTab;

  /// No description provided for @tasksByMeTab.
  ///
  /// In en, this message translates to:
  /// **'Assigned by me'**
  String get tasksByMeTab;

  /// No description provided for @tasksEmpty.
  ///
  /// In en, this message translates to:
  /// **'No open tasks.'**
  String get tasksEmpty;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'From {name}'**
  String taskFrom(String name);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'To {name}'**
  String taskTo(String name);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Due {when}'**
  String taskDue(String when);

  /// No description provided for @taskOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get taskOverdue;

  /// No description provided for @taskStatusOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get taskStatusOpen;

  /// No description provided for @taskStatusInProgress.
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get taskStatusInProgress;

  /// No description provided for @taskStatusDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get taskStatusDone;

  /// No description provided for @taskStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get taskStatusCancelled;

  /// No description provided for @taskStart.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get taskStart;

  /// No description provided for @taskMarkDone.
  ///
  /// In en, this message translates to:
  /// **'Mark done'**
  String get taskMarkDone;

  /// No description provided for @taskCancelAction.
  ///
  /// In en, this message translates to:
  /// **'Cancel task'**
  String get taskCancelAction;

  /// No description provided for @taskPriorityHigh.
  ///
  /// In en, this message translates to:
  /// **'High priority'**
  String get taskPriorityHigh;

  /// No description provided for @taskPriorityUrgent.
  ///
  /// In en, this message translates to:
  /// **'Urgent'**
  String get taskPriorityUrgent;

  /// No description provided for @requestsInboxTab.
  ///
  /// In en, this message translates to:
  /// **'Waiting for me'**
  String get requestsInboxTab;

  /// No description provided for @requestsMineTab.
  ///
  /// In en, this message translates to:
  /// **'My requests'**
  String get requestsMineTab;

  /// No description provided for @requestsStart.
  ///
  /// In en, this message translates to:
  /// **'New request'**
  String get requestsStart;

  /// No description provided for @requestsInboxEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing is waiting for your decision.'**
  String get requestsInboxEmpty;

  /// No description provided for @requestsMineEmpty.
  ///
  /// In en, this message translates to:
  /// **'You have not made any requests.'**
  String get requestsMineEmpty;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Step {n} of {total} · {name}'**
  String requestStep(String n, String total, String name);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'By {name}'**
  String requestBy(String name);

  /// No description provided for @reqStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get reqStatusPending;

  /// No description provided for @reqStatusApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get reqStatusApproved;

  /// No description provided for @reqStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get reqStatusRejected;

  /// No description provided for @reqStatusReturned.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get reqStatusReturned;

  /// No description provided for @reqStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get reqStatusCancelled;

  /// No description provided for @requestApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get requestApprove;

  /// No description provided for @requestReject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get requestReject;

  /// No description provided for @requestReturn.
  ///
  /// In en, this message translates to:
  /// **'Return for changes'**
  String get requestReturn;

  /// No description provided for @requestComment.
  ///
  /// In en, this message translates to:
  /// **'Comment (optional)'**
  String get requestComment;

  /// No description provided for @requestWithdraw.
  ///
  /// In en, this message translates to:
  /// **'Withdraw request'**
  String get requestWithdraw;

  /// No description provided for @requestHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get requestHistory;

  /// No description provided for @requestAmountLabel.
  ///
  /// In en, this message translates to:
  /// **'Amount (₹)'**
  String get requestAmountLabel;

  /// No description provided for @requestTitleLabel.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get requestTitleLabel;

  /// No description provided for @requestKindLabel.
  ///
  /// In en, this message translates to:
  /// **'Kind of request'**
  String get requestKindLabel;

  /// No description provided for @requestSubmit.
  ///
  /// In en, this message translates to:
  /// **'Send request'**
  String get requestSubmit;

  /// No description provided for @requestNoRoutes.
  ///
  /// In en, this message translates to:
  /// **'No request types have been set up yet.'**
  String get requestNoRoutes;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Fill in {field}'**
  String requestFieldNeeded(String field);

  /// No description provided for @requestActionSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Submitted'**
  String get requestActionSubmitted;

  /// No description provided for @requestActionResubmitted.
  ///
  /// In en, this message translates to:
  /// **'Sent again'**
  String get requestActionResubmitted;

  /// No description provided for @subsEmpty.
  ///
  /// In en, this message translates to:
  /// **'You are not covering any periods in the next two weeks.'**
  String get subsEmpty;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Covering for {name}'**
  String subsFor(String name);

  /// No description provided for @dutiesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No invigilation duties assigned to you.'**
  String get dutiesEmpty;

  /// No description provided for @dutyRoleChief.
  ///
  /// In en, this message translates to:
  /// **'Chief invigilator'**
  String get dutyRoleChief;

  /// No description provided for @dutyRoleInvigilator.
  ///
  /// In en, this message translates to:
  /// **'Invigilator'**
  String get dutyRoleInvigilator;

  /// No description provided for @evalEmpty.
  ///
  /// In en, this message translates to:
  /// **'No scripts are allocated to you.'**
  String get evalEmpty;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Script {no}'**
  String evalScript(String no);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Valuation {n}'**
  String evalRound(String n);

  /// No description provided for @evalStatusTodo.
  ///
  /// In en, this message translates to:
  /// **'To do'**
  String get evalStatusTodo;

  /// No description provided for @evalStatusSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Submitted'**
  String get evalStatusSubmitted;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Total {total}'**
  String evalTotal(String total);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Question {no} (out of {max})'**
  String evalQuestionLabel(String no, String max);

  /// No description provided for @evalMarksLabel.
  ///
  /// In en, this message translates to:
  /// **'Marks'**
  String get evalMarksLabel;

  /// No description provided for @evalCommentLabel.
  ///
  /// In en, this message translates to:
  /// **'Comment'**
  String get evalCommentLabel;

  /// No description provided for @evalSave.
  ///
  /// In en, this message translates to:
  /// **'Save marks'**
  String get evalSave;

  /// No description provided for @evalSavedMsg.
  ///
  /// In en, this message translates to:
  /// **'Marks saved'**
  String get evalSavedMsg;

  /// No description provided for @evalSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit valuation'**
  String get evalSubmit;

  /// No description provided for @evalSubmitConfirm.
  ///
  /// In en, this message translates to:
  /// **'Submit this valuation? You cannot change the marks afterwards.'**
  String get evalSubmitConfirm;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Valuation submitted. Total {total}.'**
  String evalSubmittedMsg(String total);

  /// No description provided for @evalThirdNeeded.
  ///
  /// In en, this message translates to:
  /// **'The two valuations differ a lot, so a third valuation will be arranged.'**
  String get evalThirdNeeded;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'At most {max}'**
  String evalOverMax(String max);

  /// No description provided for @evalMissing.
  ///
  /// In en, this message translates to:
  /// **'Enter marks for every question (0 where nothing was written).'**
  String get evalMissing;

  /// No description provided for @evalLockedMsg.
  ///
  /// In en, this message translates to:
  /// **'This valuation is submitted and cannot be changed.'**
  String get evalLockedMsg;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Page {n} of {total}'**
  String evalPageLabel(String n, String total);

  /// No description provided for @evalNoPages.
  ///
  /// In en, this message translates to:
  /// **'This script has no pages.'**
  String get evalNoPages;

  /// No description provided for @menteesEmpty.
  ///
  /// In en, this message translates to:
  /// **'You have no mentees.'**
  String get menteesEmpty;

  /// No description provided for @riskHigh.
  ///
  /// In en, this message translates to:
  /// **'High risk'**
  String get riskHigh;

  /// No description provided for @riskMedium.
  ///
  /// In en, this message translates to:
  /// **'Medium risk'**
  String get riskMedium;

  /// No description provided for @riskLow.
  ///
  /// In en, this message translates to:
  /// **'Low risk'**
  String get riskLow;

  /// No description provided for @riskNone.
  ///
  /// In en, this message translates to:
  /// **'On track'**
  String get riskNone;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Attendance {pct}%'**
  String menteeAttendance(String pct);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{n} failed tests'**
  String menteeFailing(String n);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{n} overdue fees'**
  String menteeFees(String n);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{n} open cases'**
  String menteeCases(String n);

  /// No description provided for @mentorLogSession.
  ///
  /// In en, this message translates to:
  /// **'Log session'**
  String get mentorLogSession;

  /// No description provided for @mentorSessions.
  ///
  /// In en, this message translates to:
  /// **'Sessions'**
  String get mentorSessions;

  /// No description provided for @mentorPlans.
  ///
  /// In en, this message translates to:
  /// **'Intervention plans'**
  String get mentorPlans;

  /// No description provided for @sessionModeInPerson.
  ///
  /// In en, this message translates to:
  /// **'In person'**
  String get sessionModeInPerson;

  /// No description provided for @sessionModePhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get sessionModePhone;

  /// No description provided for @sessionModeOnline.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get sessionModeOnline;

  /// No description provided for @sessionModeLabel.
  ///
  /// In en, this message translates to:
  /// **'How you met'**
  String get sessionModeLabel;

  /// No description provided for @sessionSummary.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get sessionSummary;

  /// No description provided for @sessionNotes.
  ///
  /// In en, this message translates to:
  /// **'Private notes (only you, the head of department and the counsellor see these)'**
  String get sessionNotes;

  /// No description provided for @sessionFollowUp.
  ///
  /// In en, this message translates to:
  /// **'Follow up on'**
  String get sessionFollowUp;

  /// No description provided for @sessionSave.
  ///
  /// In en, this message translates to:
  /// **'Save session'**
  String get sessionSave;

  /// No description provided for @sessionsNone.
  ///
  /// In en, this message translates to:
  /// **'No sessions yet.'**
  String get sessionsNone;

  /// No description provided for @plansNone.
  ///
  /// In en, this message translates to:
  /// **'No plans yet.'**
  String get plansNone;

  /// No description provided for @planNew.
  ///
  /// In en, this message translates to:
  /// **'New plan'**
  String get planNew;

  /// No description provided for @planGoal.
  ///
  /// In en, this message translates to:
  /// **'Goal'**
  String get planGoal;

  /// No description provided for @planActionsLabel.
  ///
  /// In en, this message translates to:
  /// **'Actions (one per line)'**
  String get planActionsLabel;

  /// No description provided for @planReviewLabel.
  ///
  /// In en, this message translates to:
  /// **'Review on'**
  String get planReviewLabel;

  /// No description provided for @planCreate.
  ///
  /// In en, this message translates to:
  /// **'Create plan'**
  String get planCreate;

  /// No description provided for @planClose.
  ///
  /// In en, this message translates to:
  /// **'Close plan'**
  String get planClose;

  /// No description provided for @planOutcome.
  ///
  /// In en, this message translates to:
  /// **'Outcome'**
  String get planOutcome;

  /// No description provided for @planRatingImproved.
  ///
  /// In en, this message translates to:
  /// **'Improved'**
  String get planRatingImproved;

  /// No description provided for @planRatingNoChange.
  ///
  /// In en, this message translates to:
  /// **'No change'**
  String get planRatingNoChange;

  /// No description provided for @planRatingWorsened.
  ///
  /// In en, this message translates to:
  /// **'Worsened'**
  String get planRatingWorsened;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Review on {date}'**
  String planReviewOn(String date);

  /// No description provided for @planClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get planClosed;

  /// No description provided for @rosterTermLabel.
  ///
  /// In en, this message translates to:
  /// **'Term'**
  String get rosterTermLabel;

  /// No description provided for @rosterNoTerms.
  ///
  /// In en, this message translates to:
  /// **'No terms found.'**
  String get rosterNoTerms;

  /// No description provided for @rosterNoOfferings.
  ///
  /// In en, this message translates to:
  /// **'You are not the faculty of any course in this term.'**
  String get rosterNoOfferings;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{reg} registered, {wait} on the waitlist'**
  String rosterCounts(String reg, String wait);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Waitlist {pos}'**
  String rosterWaitlist(String pos);

  /// No description provided for @rosterEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nobody has registered yet.'**
  String get rosterEmpty;

  /// No description provided for @surveysEmpty.
  ///
  /// In en, this message translates to:
  /// **'No surveys are waiting for you.'**
  String get surveysEmpty;

  /// No description provided for @surveyAnonymous.
  ///
  /// In en, this message translates to:
  /// **'Anonymous'**
  String get surveyAnonymous;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'Closes {when}'**
  String surveyClosesOn(String when);

  /// No description provided for @surveyAnswered.
  ///
  /// In en, this message translates to:
  /// **'Answered'**
  String get surveyAnswered;

  /// No description provided for @surveySubmit.
  ///
  /// In en, this message translates to:
  /// **'Send answers'**
  String get surveySubmit;

  /// No description provided for @surveyThanks.
  ///
  /// In en, this message translates to:
  /// **'Thank you, your answers were sent.'**
  String get surveyThanks;

  /// No description provided for @surveyRequired.
  ///
  /// In en, this message translates to:
  /// **'Answer every required question.'**
  String get surveyRequired;

  /// No description provided for @surveyAnswerHint.
  ///
  /// In en, this message translates to:
  /// **'Your answer'**
  String get surveyAnswerHint;

  /// No description provided for @clubsEmpty.
  ///
  /// In en, this message translates to:
  /// **'You do not coordinate any clubs.'**
  String get clubsEmpty;

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{n} members'**
  String clubMembersCount(String n);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{n} requests waiting'**
  String clubPendingCount(String n);

  /// Staff work screens.
  ///
  /// In en, this message translates to:
  /// **'{n} points'**
  String clubPoints(String n);

  /// No description provided for @clubNoMembers.
  ///
  /// In en, this message translates to:
  /// **'No members yet.'**
  String get clubNoMembers;

  /// No description provided for @insightsTitle.
  ///
  /// In en, this message translates to:
  /// **'Student insights'**
  String get insightsTitle;

  /// No description provided for @insightsBody.
  ///
  /// In en, this message translates to:
  /// **'Attendance, marks and risk flags for a class'**
  String get insightsBody;

  /// No description provided for @insightsAttendance.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get insightsAttendance;

  /// No description provided for @insightsMarks.
  ///
  /// In en, this message translates to:
  /// **'Marks average'**
  String get insightsMarks;

  /// No description provided for @insightsFlagged.
  ///
  /// In en, this message translates to:
  /// **'Need attention'**
  String get insightsFlagged;

  /// No description provided for @insightsAttendanceValue.
  ///
  /// In en, this message translates to:
  /// **'Attendance {value}'**
  String insightsAttendanceValue(String value);

  /// No description provided for @insightsMarksValue.
  ///
  /// In en, this message translates to:
  /// **'Marks {value}'**
  String insightsMarksValue(String value);

  /// No description provided for @copilotTitle.
  ///
  /// In en, this message translates to:
  /// **'AI copilot'**
  String get copilotTitle;

  /// No description provided for @copilotBody.
  ///
  /// In en, this message translates to:
  /// **'Draft explanations, quizzes, homework and lesson plans'**
  String get copilotBody;

  /// No description provided for @copilotExplain.
  ///
  /// In en, this message translates to:
  /// **'Explain'**
  String get copilotExplain;

  /// No description provided for @copilotQuiz.
  ///
  /// In en, this message translates to:
  /// **'Quiz'**
  String get copilotQuiz;

  /// No description provided for @copilotHomework.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get copilotHomework;

  /// No description provided for @copilotLessonPlan.
  ///
  /// In en, this message translates to:
  /// **'Lesson plan'**
  String get copilotLessonPlan;

  /// No description provided for @copilotQuestionLabel.
  ///
  /// In en, this message translates to:
  /// **'What do you want explained?'**
  String get copilotQuestionLabel;

  /// No description provided for @copilotTopicLabel.
  ///
  /// In en, this message translates to:
  /// **'Topic'**
  String get copilotTopicLabel;

  /// No description provided for @copilotHowMany.
  ///
  /// In en, this message translates to:
  /// **'Questions: {n}'**
  String copilotHowMany(int n);

  /// No description provided for @copilotMinutes.
  ///
  /// In en, this message translates to:
  /// **'Minutes: {n}'**
  String copilotMinutes(int n);

  /// No description provided for @copilotGenerate.
  ///
  /// In en, this message translates to:
  /// **'Generate draft'**
  String get copilotGenerate;

  /// No description provided for @copilotDraftNote.
  ///
  /// In en, this message translates to:
  /// **'AI draft. Check it before you use it; nothing is sent to students from here.'**
  String get copilotDraftNote;

  /// No description provided for @copilotSampleDraft.
  ///
  /// In en, this message translates to:
  /// **'Sample only: no AI model is connected to this school\'s server yet. Check everything before use.'**
  String get copilotSampleDraft;

  /// No description provided for @copilotKeyPoints.
  ///
  /// In en, this message translates to:
  /// **'Key points'**
  String get copilotKeyPoints;

  /// No description provided for @copilotFollowUps.
  ///
  /// In en, this message translates to:
  /// **'Students may ask next'**
  String get copilotFollowUps;

  /// No description provided for @copilotQuestions.
  ///
  /// In en, this message translates to:
  /// **'Questions'**
  String get copilotQuestions;

  /// No description provided for @copilotObjectives.
  ///
  /// In en, this message translates to:
  /// **'Objectives'**
  String get copilotObjectives;

  /// No description provided for @copilotSteps.
  ///
  /// In en, this message translates to:
  /// **'Steps'**
  String get copilotSteps;

  /// No description provided for @copilotMaterials.
  ///
  /// In en, this message translates to:
  /// **'Materials'**
  String get copilotMaterials;

  /// No description provided for @copilotAssessment.
  ///
  /// In en, this message translates to:
  /// **'Assessment'**
  String get copilotAssessment;

  /// No description provided for @copilotCopy.
  ///
  /// In en, this message translates to:
  /// **'Copy draft'**
  String get copilotCopy;

  /// No description provided for @copilotCopied.
  ///
  /// In en, this message translates to:
  /// **'Draft copied.'**
  String get copilotCopied;
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

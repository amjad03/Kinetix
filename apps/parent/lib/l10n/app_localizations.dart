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

  /// No description provided for @today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// No description provided for @tomorrow.
  ///
  /// In en, this message translates to:
  /// **'Tomorrow'**
  String get tomorrow;

  /// No description provided for @yesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get yesterday;

  /// No description provided for @dueToday.
  ///
  /// In en, this message translates to:
  /// **'Due today'**
  String get dueToday;

  /// No description provided for @dueTomorrow.
  ///
  /// In en, this message translates to:
  /// **'Due tomorrow'**
  String get dueTomorrow;

  /// No description provided for @dueOn.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String dueOn(Object date);

  /// No description provided for @wasDue.
  ///
  /// In en, this message translates to:
  /// **'Was due {date}'**
  String wasDue(Object date);

  /// No description provided for @overdueBy.
  ///
  /// In en, this message translates to:
  /// **'Overdue by {days, plural, =1{1 day} other{{days} days}}'**
  String overdueBy(int days);

  /// No description provided for @bookDueToday.
  ///
  /// In en, this message translates to:
  /// **'Due today'**
  String get bookDueToday;

  /// No description provided for @bookDueTomorrow.
  ///
  /// In en, this message translates to:
  /// **'Due tomorrow'**
  String get bookDueTomorrow;

  /// No description provided for @bookDueOn.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String bookDueOn(Object date);

  /// No description provided for @greetingMorning.
  ///
  /// In en, this message translates to:
  /// **'Good morning'**
  String get greetingMorning;

  /// No description provided for @greetingAfternoon.
  ///
  /// In en, this message translates to:
  /// **'Good afternoon'**
  String get greetingAfternoon;

  /// No description provided for @greetingEvening.
  ///
  /// In en, this message translates to:
  /// **'Good evening'**
  String get greetingEvening;

  /// No description provided for @greetingName.
  ///
  /// In en, this message translates to:
  /// **'{greeting}, {name}'**
  String greetingName(Object greeting, Object name);

  /// No description provided for @dateTime.
  ///
  /// In en, this message translates to:
  /// **'{date}, {time}'**
  String dateTime(Object date, Object time);

  /// No description provided for @listSeparator.
  ///
  /// In en, this message translates to:
  /// **', '**
  String get listSeparator;

  /// No description provided for @listAnd.
  ///
  /// In en, this message translates to:
  /// **'{items} and {last}'**
  String listAnd(Object items, Object last);

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @soon.
  ///
  /// In en, this message translates to:
  /// **'Soon'**
  String get soon;

  /// No description provided for @comingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get comingSoon;

  /// No description provided for @comingLater.
  ///
  /// In en, this message translates to:
  /// **'{feature} is coming in a later update'**
  String comingLater(Object feature);

  /// No description provided for @statusPresent.
  ///
  /// In en, this message translates to:
  /// **'Present'**
  String get statusPresent;

  /// No description provided for @statusAbsent.
  ///
  /// In en, this message translates to:
  /// **'Absent'**
  String get statusAbsent;

  /// No description provided for @statusLate.
  ///
  /// In en, this message translates to:
  /// **'Late'**
  String get statusLate;

  /// No description provided for @statusExcused.
  ///
  /// In en, this message translates to:
  /// **'Excused'**
  String get statusExcused;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @send.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get send;

  /// No description provided for @share.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get share;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @done.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// No description provided for @seeAll.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get seeAll;

  /// No description provided for @pages.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 page} other{{count} pages}}'**
  String pages(int count);

  /// No description provided for @lastDays.
  ///
  /// In en, this message translates to:
  /// **'Last {days} days'**
  String lastDays(Object days);

  /// No description provided for @rollNo.
  ///
  /// In en, this message translates to:
  /// **'Roll no. {rollNo}'**
  String rollNo(Object rollNo);

  /// No description provided for @errTimeout.
  ///
  /// In en, this message translates to:
  /// **'The server is taking too long to respond. Try again.'**
  String get errTimeout;

  /// No description provided for @errUnreachable.
  ///
  /// In en, this message translates to:
  /// **'Can\'t reach KINETIX. Check your internet connection and the server address.'**
  String get errUnreachable;

  /// No description provided for @errForbidden.
  ///
  /// In en, this message translates to:
  /// **'You don\'t have access to this.'**
  String get errForbidden;

  /// No description provided for @errNotFound.
  ///
  /// In en, this message translates to:
  /// **'Not found.'**
  String get errNotFound;

  /// No description provided for @errTooMany.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Wait a minute and try again.'**
  String get errTooMany;

  /// No description provided for @errGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong ({status}). Try again.'**
  String errGeneric(Object status);

  /// No description provided for @errWrongLogin.
  ///
  /// In en, this message translates to:
  /// **'Wrong institution, login or password'**
  String get errWrongLogin;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// No description provided for @signOutQuestion.
  ///
  /// In en, this message translates to:
  /// **'Sign out?'**
  String get signOutQuestion;

  /// No description provided for @signOutBody.
  ///
  /// In en, this message translates to:
  /// **'You will need your password to sign in again.'**
  String get signOutBody;

  /// No description provided for @institutionCode.
  ///
  /// In en, this message translates to:
  /// **'Institution code'**
  String get institutionCode;

  /// No description provided for @institutionCodeHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. demo-college'**
  String get institutionCodeHint;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @showPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get hidePassword;

  /// No description provided for @serverAddress.
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get serverAddress;

  /// No description provided for @serverLabel.
  ///
  /// In en, this message translates to:
  /// **'Server: {server}'**
  String serverLabel(Object server);

  /// No description provided for @enterInstitutionCode.
  ///
  /// In en, this message translates to:
  /// **'Enter your institution code'**
  String get enterInstitutionCode;

  /// No description provided for @institutionCodeChars.
  ///
  /// In en, this message translates to:
  /// **'Use letters, numbers and hyphens only'**
  String get institutionCodeChars;

  /// No description provided for @enterValidEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address'**
  String get enterValidEmail;

  /// No description provided for @enterValidPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter a 10-digit phone number or a valid email'**
  String get enterValidPhone;

  /// No description provided for @enterPassword.
  ///
  /// In en, this message translates to:
  /// **'Enter your password'**
  String get enterPassword;

  /// No description provided for @enterServer.
  ///
  /// In en, this message translates to:
  /// **'Enter a server address like https://api.kinetix.in'**
  String get enterServer;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @languageHelp.
  ///
  /// In en, this message translates to:
  /// **'Used for the app and for updates sent to you'**
  String get languageHelp;

  /// No description provided for @chooseLanguage.
  ///
  /// In en, this message translates to:
  /// **'Choose language'**
  String get chooseLanguage;

  /// No description provided for @profile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profile;

  /// No description provided for @account.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get account;

  /// No description provided for @server.
  ///
  /// In en, this message translates to:
  /// **'Server'**
  String get server;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navMessages.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get navMessages;

  /// No description provided for @navUpdates.
  ///
  /// In en, this message translates to:
  /// **'Updates'**
  String get navUpdates;

  /// No description provided for @navProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// No description provided for @attendance.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get attendance;

  /// No description provided for @homework.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get homework;

  /// No description provided for @sectionLastDays.
  ///
  /// In en, this message translates to:
  /// **'{section} · last {days} days'**
  String sectionLastDays(Object section, Object days);

  /// No description provided for @allClasses.
  ///
  /// In en, this message translates to:
  /// **'All classes'**
  String get allClasses;

  /// No description provided for @absentOrLate.
  ///
  /// In en, this message translates to:
  /// **'Absent or late'**
  String get absentOrLate;

  /// No description provided for @noAttendanceTaken.
  ///
  /// In en, this message translates to:
  /// **'No attendance has been taken in the last {days} days.'**
  String noAttendanceTaken(Object days);

  /// No description provided for @attendedAll.
  ///
  /// In en, this message translates to:
  /// **'Attended all'**
  String get attendedAll;

  /// No description provided for @attendedNofM.
  ///
  /// In en, this message translates to:
  /// **'Attended {attended} of {total}'**
  String attendedNofM(Object attended, Object total);

  /// No description provided for @wholeDay.
  ///
  /// In en, this message translates to:
  /// **'Whole day'**
  String get wholeDay;

  /// No description provided for @instructions.
  ///
  /// In en, this message translates to:
  /// **'Instructions'**
  String get instructions;

  /// No description provided for @noInstructions.
  ///
  /// In en, this message translates to:
  /// **'No instructions were added.'**
  String get noInstructions;

  /// No description provided for @factDue.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get factDue;

  /// No description provided for @setBy.
  ///
  /// In en, this message translates to:
  /// **'Set by'**
  String get setBy;

  /// No description provided for @givenOn.
  ///
  /// In en, this message translates to:
  /// **'Given on'**
  String get givenOn;

  /// No description provided for @library.
  ///
  /// In en, this message translates to:
  /// **'Library'**
  String get library;

  /// No description provided for @nOut.
  ///
  /// In en, this message translates to:
  /// **'{count} out'**
  String nOut(Object count);

  /// No description provided for @seeLibraryHistory.
  ///
  /// In en, this message translates to:
  /// **'See library history'**
  String get seeLibraryHistory;

  /// No description provided for @booksOverdue.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 book overdue. Please return it to the library.} other{{count} books overdue. Please return them to the library.}}'**
  String booksOverdue(int count);

  /// No description provided for @andMore.
  ///
  /// In en, this message translates to:
  /// **'and {count} more'**
  String andMore(Object count);

  /// No description provided for @finesForLate.
  ///
  /// In en, this message translates to:
  /// **'Fines for late returns: {amount}'**
  String finesForLate(Object amount);

  /// No description provided for @finesPayAtDesk.
  ///
  /// In en, this message translates to:
  /// **'Fines for late returns: {amount}. Pay at the library desk.'**
  String finesPayAtDesk(Object amount);

  /// No description provided for @borrowedOn.
  ///
  /// In en, this message translates to:
  /// **'Borrowed {date}'**
  String borrowedOn(Object date);

  /// No description provided for @returnedOn.
  ///
  /// In en, this message translates to:
  /// **'returned {date}'**
  String returnedOn(Object date);

  /// No description provided for @fineAmount.
  ///
  /// In en, this message translates to:
  /// **'fine {amount}'**
  String fineAmount(Object amount);

  /// No description provided for @returnedLate.
  ///
  /// In en, this message translates to:
  /// **'late'**
  String get returnedLate;

  /// No description provided for @fineSoFar.
  ///
  /// In en, this message translates to:
  /// **'{amount} fine so far'**
  String fineSoFar(Object amount);

  /// No description provided for @booksOutHeading.
  ///
  /// In en, this message translates to:
  /// **'Books out ({count})'**
  String booksOutHeading(Object count);

  /// No description provided for @noBooksOut.
  ///
  /// In en, this message translates to:
  /// **'No books out right now.'**
  String get noBooksOut;

  /// No description provided for @fineRule.
  ///
  /// In en, this message translates to:
  /// **'The library charges a fine for each day a book is returned late.'**
  String get fineRule;

  /// No description provided for @returnedHeading.
  ///
  /// In en, this message translates to:
  /// **'Returned ({count})'**
  String returnedHeading(Object count);

  /// No description provided for @returnedEmpty.
  ///
  /// In en, this message translates to:
  /// **'Returned books will be listed here.'**
  String get returnedEmpty;

  /// No description provided for @libraryBooks.
  ///
  /// In en, this message translates to:
  /// **'Library books'**
  String get libraryBooks;

  /// No description provided for @results.
  ///
  /// In en, this message translates to:
  /// **'Results'**
  String get results;

  /// No description provided for @aboveAverage.
  ///
  /// In en, this message translates to:
  /// **'Above class average'**
  String get aboveAverage;

  /// No description provided for @atAverage.
  ///
  /// In en, this message translates to:
  /// **'At class average'**
  String get atAverage;

  /// No description provided for @belowAverage.
  ///
  /// In en, this message translates to:
  /// **'Below class average'**
  String get belowAverage;

  /// No description provided for @notEntered.
  ///
  /// In en, this message translates to:
  /// **'Not entered'**
  String get notEntered;

  /// No description provided for @publishedMarks.
  ///
  /// In en, this message translates to:
  /// **'Published marks'**
  String get publishedMarks;

  /// No description provided for @seeAllResults.
  ///
  /// In en, this message translates to:
  /// **'See all results'**
  String get seeAllResults;

  /// No description provided for @bySubject.
  ///
  /// In en, this message translates to:
  /// **'By subject'**
  String get bySubject;

  /// No description provided for @classAverageValue.
  ///
  /// In en, this message translates to:
  /// **'Class average {value}'**
  String classAverageValue(Object value);

  /// No description provided for @marksExplainer.
  ///
  /// In en, this message translates to:
  /// **'Marks scored out of the total, across published assessments.'**
  String get marksExplainer;

  /// No description provided for @assessments.
  ///
  /// In en, this message translates to:
  /// **'Assessments'**
  String get assessments;

  /// No description provided for @classAverage.
  ///
  /// In en, this message translates to:
  /// **'Class average'**
  String get classAverage;

  /// No description provided for @highestInClass.
  ///
  /// In en, this message translates to:
  /// **'Highest in class'**
  String get highestInClass;

  /// No description provided for @outOf.
  ///
  /// In en, this message translates to:
  /// **'out of {max}'**
  String outOf(Object max);

  /// No description provided for @teachersRemark.
  ///
  /// In en, this message translates to:
  /// **'Teacher\'s remark'**
  String get teachersRemark;

  /// No description provided for @kindTest.
  ///
  /// In en, this message translates to:
  /// **'Test'**
  String get kindTest;

  /// No description provided for @kindAssignment.
  ///
  /// In en, this message translates to:
  /// **'Assignment'**
  String get kindAssignment;

  /// No description provided for @kindInternal.
  ///
  /// In en, this message translates to:
  /// **'Internal assessment'**
  String get kindInternal;

  /// No description provided for @kindExam.
  ///
  /// In en, this message translates to:
  /// **'Exam'**
  String get kindExam;

  /// No description provided for @kindPractical.
  ///
  /// In en, this message translates to:
  /// **'Practical'**
  String get kindPractical;

  /// No description provided for @lessonRecordings.
  ///
  /// In en, this message translates to:
  /// **'Lesson recordings'**
  String get lessonRecordings;

  /// No description provided for @nMissed.
  ///
  /// In en, this message translates to:
  /// **'{count} missed'**
  String nMissed(Object count);

  /// No description provided for @seeAllRecordings.
  ///
  /// In en, this message translates to:
  /// **'See all {count} recordings'**
  String seeAllRecordings(Object count);

  /// No description provided for @recordingNotShared.
  ///
  /// In en, this message translates to:
  /// **'This recording is no longer shared with the class.'**
  String get recordingNotShared;

  /// No description provided for @classBoard.
  ///
  /// In en, this message translates to:
  /// **'Class board'**
  String get classBoard;

  /// No description provided for @previousPage.
  ///
  /// In en, this message translates to:
  /// **'Previous page'**
  String get previousPage;

  /// No description provided for @nextPage.
  ///
  /// In en, this message translates to:
  /// **'Next page'**
  String get nextPage;

  /// No description provided for @pageOf.
  ///
  /// In en, this message translates to:
  /// **'Page {page} of {total}'**
  String pageOf(Object page, Object total);

  /// No description provided for @zoomOut.
  ///
  /// In en, this message translates to:
  /// **'Double-tap to zoom out'**
  String get zoomOut;

  /// No description provided for @zoomSideways.
  ///
  /// In en, this message translates to:
  /// **'Pinch to zoom, or turn your phone sideways'**
  String get zoomSideways;

  /// No description provided for @zoomHint.
  ///
  /// In en, this message translates to:
  /// **'Pinch or double-tap to zoom'**
  String get zoomHint;

  /// No description provided for @fees.
  ///
  /// In en, this message translates to:
  /// **'Fees'**
  String get fees;

  /// No description provided for @allFeesPaid.
  ///
  /// In en, this message translates to:
  /// **'All fees paid'**
  String get allFeesPaid;

  /// No description provided for @lastPaid.
  ///
  /// In en, this message translates to:
  /// **'Last paid {amount}'**
  String lastPaid(Object amount);

  /// No description provided for @dueSuffix.
  ///
  /// In en, this message translates to:
  /// **'due'**
  String get dueSuffix;

  /// No description provided for @feesToPay.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 fee to pay} other{{count} fees to pay}}'**
  String feesToPay(int count);

  /// No description provided for @nOverdue.
  ///
  /// In en, this message translates to:
  /// **'{count} overdue'**
  String nOverdue(Object count);

  /// No description provided for @viewFees.
  ///
  /// In en, this message translates to:
  /// **'View fees'**
  String get viewFees;

  /// No description provided for @viewFeesReceipts.
  ///
  /// In en, this message translates to:
  /// **'View fees and receipts'**
  String get viewFeesReceipts;

  /// No description provided for @payAtCounter.
  ///
  /// In en, this message translates to:
  /// **'Please pay at the fees counter.'**
  String get payAtCounter;

  /// No description provided for @ok.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @feesNothingDue.
  ///
  /// In en, this message translates to:
  /// **'Nothing due'**
  String get feesNothingDue;

  /// No description provided for @totalDue.
  ///
  /// In en, this message translates to:
  /// **'Total due'**
  String get totalDue;

  /// No description provided for @toPay.
  ///
  /// In en, this message translates to:
  /// **'To pay'**
  String get toPay;

  /// No description provided for @paidHeader.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paidHeader;

  /// No description provided for @paidLine.
  ///
  /// In en, this message translates to:
  /// **'{amount} · was due {date}'**
  String paidLine(Object amount, Object date);

  /// No description provided for @paidPill.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paidPill;

  /// No description provided for @paymentsReceipts.
  ///
  /// In en, this message translates to:
  /// **'Payments and receipts'**
  String get paymentsReceipts;

  /// No description provided for @feeLabel.
  ///
  /// In en, this message translates to:
  /// **'Fee'**
  String get feeLabel;

  /// No description provided for @overdueWasDue.
  ///
  /// In en, this message translates to:
  /// **'Overdue · was due {date}'**
  String overdueWasDue(Object date);

  /// No description provided for @paidOfLeft.
  ///
  /// In en, this message translates to:
  /// **'{paid} of {total} paid · {left} left'**
  String paidOfLeft(Object paid, Object total, Object left);

  /// No description provided for @receiptNotFound.
  ///
  /// In en, this message translates to:
  /// **'This receipt was not found.'**
  String get receiptNotFound;

  /// No description provided for @receiptCopied.
  ///
  /// In en, this message translates to:
  /// **'Receipt copied. Paste it into a message or email.'**
  String get receiptCopied;

  /// No description provided for @receipt.
  ///
  /// In en, this message translates to:
  /// **'Receipt'**
  String get receipt;

  /// No description provided for @copyReceipt.
  ///
  /// In en, this message translates to:
  /// **'Copy receipt'**
  String get copyReceipt;

  /// No description provided for @feeReceipt.
  ///
  /// In en, this message translates to:
  /// **'Fee receipt'**
  String get feeReceipt;

  /// No description provided for @receiptNoLabel.
  ///
  /// In en, this message translates to:
  /// **'Receipt no.'**
  String get receiptNoLabel;

  /// No description provided for @dateLabel.
  ///
  /// In en, this message translates to:
  /// **'Date'**
  String get dateLabel;

  /// No description provided for @studentLabel.
  ///
  /// In en, this message translates to:
  /// **'Student'**
  String get studentLabel;

  /// No description provided for @classLabel.
  ///
  /// In en, this message translates to:
  /// **'Class'**
  String get classLabel;

  /// No description provided for @paidBy.
  ///
  /// In en, this message translates to:
  /// **'Paid by'**
  String get paidBy;

  /// No description provided for @reference.
  ///
  /// In en, this message translates to:
  /// **'Reference'**
  String get reference;

  /// No description provided for @amountPaid.
  ///
  /// In en, this message translates to:
  /// **'Amount paid'**
  String get amountPaid;

  /// No description provided for @balanceLeft.
  ///
  /// In en, this message translates to:
  /// **'Balance left'**
  String get balanceLeft;

  /// No description provided for @nilFullyPaid.
  ///
  /// In en, this message translates to:
  /// **'Nil · fully paid'**
  String get nilFullyPaid;

  /// No description provided for @demoNoMoneyMoved.
  ///
  /// In en, this message translates to:
  /// **'Demo payment: no money moved.'**
  String get demoNoMoneyMoved;

  /// No description provided for @demoNoMoney.
  ///
  /// In en, this message translates to:
  /// **'Demo payment: no money moves'**
  String get demoNoMoney;

  /// No description provided for @methodOnline.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get methodOnline;

  /// No description provided for @methodCash.
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get methodCash;

  /// No description provided for @methodCheque.
  ///
  /// In en, this message translates to:
  /// **'Cheque'**
  String get methodCheque;

  /// No description provided for @methodBankTransfer.
  ///
  /// In en, this message translates to:
  /// **'Bank transfer'**
  String get methodBankTransfer;

  /// No description provided for @methodPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get methodPayment;

  /// No description provided for @newMessage.
  ///
  /// In en, this message translates to:
  /// **'New message'**
  String get newMessage;

  /// No description provided for @aboutName.
  ///
  /// In en, this message translates to:
  /// **'About {name}'**
  String aboutName(Object name);

  /// No description provided for @noMessagesYet.
  ///
  /// In en, this message translates to:
  /// **'No messages yet'**
  String get noMessagesYet;

  /// No description provided for @couldNotSend.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t send: {reason}'**
  String couldNotSend(Object reason);

  /// No description provided for @message.
  ///
  /// In en, this message translates to:
  /// **'Message'**
  String get message;

  /// No description provided for @pullForEarlier.
  ///
  /// In en, this message translates to:
  /// **'Pull down for earlier messages'**
  String get pullForEarlier;

  /// No description provided for @teachersReply.
  ///
  /// In en, this message translates to:
  /// **'Teachers reply when they can, usually during college hours.'**
  String get teachersReply;

  /// No description provided for @messageCopied.
  ///
  /// In en, this message translates to:
  /// **'Message copied'**
  String get messageCopied;

  /// No description provided for @teacher.
  ///
  /// In en, this message translates to:
  /// **'Teacher'**
  String get teacher;

  /// No description provided for @markAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get markAllRead;

  /// No description provided for @earlier.
  ///
  /// In en, this message translates to:
  /// **'Earlier'**
  String get earlier;

  /// No description provided for @fromCollege.
  ///
  /// In en, this message translates to:
  /// **'Message from the college'**
  String get fromCollege;

  /// No description provided for @update.
  ///
  /// In en, this message translates to:
  /// **'Update'**
  String get update;

  /// No description provided for @attendanceGood.
  ///
  /// In en, this message translates to:
  /// **'Good attendance. Keep it up.'**
  String get attendanceGood;

  /// No description provided for @seeAttendanceHistory.
  ///
  /// In en, this message translates to:
  /// **'See attendance history'**
  String get seeAttendanceHistory;

  /// No description provided for @attendedOf.
  ///
  /// In en, this message translates to:
  /// **'Attended {attended} of {count, plural, =1{1 class} other{{count} classes}}'**
  String attendedOf(Object attended, int count);

  /// No description provided for @excusedNote.
  ///
  /// In en, this message translates to:
  /// **'{count} excused (counted as attended)'**
  String excusedNote(Object count);

  /// No description provided for @recentAbsences.
  ///
  /// In en, this message translates to:
  /// **'Recent absences'**
  String get recentAbsences;

  /// No description provided for @dueCount.
  ///
  /// In en, this message translates to:
  /// **'{count} due'**
  String dueCount(Object count);

  /// No description provided for @pastHomework.
  ///
  /// In en, this message translates to:
  /// **'Past homework ({count})'**
  String pastHomework(Object count);

  /// No description provided for @classBoards.
  ///
  /// In en, this message translates to:
  /// **'Class boards'**
  String get classBoards;

  /// No description provided for @todaysBoard.
  ///
  /// In en, this message translates to:
  /// **'Today\'s board: {subject}'**
  String todaysBoard(Object subject);

  /// No description provided for @resultsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Published marks and class averages'**
  String get resultsSubtitle;

  /// No description provided for @librarySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Books borrowed, due dates and fines'**
  String get librarySubtitle;

  /// No description provided for @college.
  ///
  /// In en, this message translates to:
  /// **'College'**
  String get college;

  /// No description provided for @resultsLibraryHeader.
  ///
  /// In en, this message translates to:
  /// **'Results & library'**
  String get resultsLibraryHeader;

  /// No description provided for @feesAndReceipts.
  ///
  /// In en, this message translates to:
  /// **'Fees and receipts'**
  String get feesAndReceipts;

  /// No description provided for @tryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get tryAgain;

  /// No description provided for @signInHint.
  ///
  /// In en, this message translates to:
  /// **'Use the phone number or email you gave your child\'s college'**
  String get signInHint;

  /// No description provided for @errNotGuardian.
  ///
  /// In en, this message translates to:
  /// **'This app is for parents and guardians. Ask your institution to link your account to your child.'**
  String get errNotGuardian;

  /// No description provided for @errTeacherAccount.
  ///
  /// In en, this message translates to:
  /// **'This app is for parents and guardians. Teachers can use the KINETIX Teacher app.'**
  String get errTeacherAccount;

  /// No description provided for @homeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Here\'s how {name} is doing'**
  String homeSubtitle(Object name);

  /// No description provided for @noChildrenLinked.
  ///
  /// In en, this message translates to:
  /// **'No children are linked to your account yet.\nAsk your child\'s college to add you as their parent.'**
  String get noChildrenLinked;

  /// No description provided for @attendanceFewMissed.
  ///
  /// In en, this message translates to:
  /// **'Missed a few classes recently.'**
  String get attendanceFewMissed;

  /// No description provided for @attendanceBelow75.
  ///
  /// In en, this message translates to:
  /// **'Below 75%. Colleges usually need 75% to sit exams.'**
  String get attendanceBelow75;

  /// No description provided for @noAttendanceFor.
  ///
  /// In en, this message translates to:
  /// **'No attendance has been taken for {name} in the last {days} days.'**
  String noAttendanceFor(Object name, Object days);

  /// No description provided for @nothingDue.
  ///
  /// In en, this message translates to:
  /// **'Nothing due right now. New homework from teachers will show here.'**
  String get nothingDue;

  /// No description provided for @inClass.
  ///
  /// In en, this message translates to:
  /// **'In class'**
  String get inClass;

  /// No description provided for @inClassIntro.
  ///
  /// In en, this message translates to:
  /// **'Answers when the teacher picked {name} to answer a question in class.'**
  String inClassIntro(Object name);

  /// No description provided for @notPickedYet.
  ///
  /// In en, this message translates to:
  /// **'{name} was not picked to answer in class yet.'**
  String notPickedYet(Object name);

  /// No description provided for @legendCorrect.
  ///
  /// In en, this message translates to:
  /// **'Correct'**
  String get legendCorrect;

  /// No description provided for @legendPartly.
  ///
  /// In en, this message translates to:
  /// **'Partly correct'**
  String get legendPartly;

  /// No description provided for @legendNotCorrect.
  ///
  /// In en, this message translates to:
  /// **'Not correct'**
  String get legendNotCorrect;

  /// No description provided for @legendNoAnswer.
  ///
  /// In en, this message translates to:
  /// **'No answer'**
  String get legendNoAnswer;

  /// No description provided for @askedNoAnswer.
  ///
  /// In en, this message translates to:
  /// **'Was asked {count, plural, =1{1 question} other{{count} questions}} in {subject} but did not answer.'**
  String askedNoAnswer(int count, Object subject);

  /// No description provided for @answeredOneCorrectly.
  ///
  /// In en, this message translates to:
  /// **'Answered 1 question in {subject} correctly.'**
  String answeredOneCorrectly(Object subject);

  /// No description provided for @answeredAllCorrect.
  ///
  /// In en, this message translates to:
  /// **'Answered {count} questions in {subject}, all correct.'**
  String answeredAllCorrect(Object count, Object subject);

  /// No description provided for @answeredDetail.
  ///
  /// In en, this message translates to:
  /// **'Answered {count, plural, =1{1 question} other{{count} questions}} in {subject}, {detail}.'**
  String answeredDetail(int count, Object subject, Object detail);

  /// No description provided for @nCorrect.
  ///
  /// In en, this message translates to:
  /// **'{count} correct'**
  String nCorrect(Object count);

  /// No description provided for @nPartly.
  ///
  /// In en, this message translates to:
  /// **'{count} partly correct'**
  String nPartly(Object count);

  /// No description provided for @nNotCorrect.
  ///
  /// In en, this message translates to:
  /// **'{count} not correct'**
  String nNotCorrect(Object count);

  /// No description provided for @didNotAnswer.
  ///
  /// In en, this message translates to:
  /// **'Did not answer {count}.'**
  String didNotAnswer(Object count);

  /// No description provided for @boardsEmpty.
  ///
  /// In en, this message translates to:
  /// **'When a teacher shares the class board after a lesson, it appears here so {name} can revise.'**
  String boardsEmpty(Object name);

  /// No description provided for @childAttendance.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s attendance'**
  String childAttendance(Object name);

  /// No description provided for @notMissedAny.
  ///
  /// In en, this message translates to:
  /// **'{name} has not missed a class in the last {days} days.'**
  String notMissedAny(Object name, Object days);

  /// No description provided for @homeworkFor.
  ///
  /// In en, this message translates to:
  /// **'For'**
  String get homeworkFor;

  /// No description provided for @yourChild.
  ///
  /// In en, this message translates to:
  /// **'Your child'**
  String get yourChild;

  /// No description provided for @yourChildren.
  ///
  /// In en, this message translates to:
  /// **'Your children'**
  String get yourChildren;

  /// No description provided for @shownOnHome.
  ///
  /// In en, this message translates to:
  /// **'Shown on Home'**
  String get shownOnHome;

  /// No description provided for @noChildrenYet.
  ///
  /// In en, this message translates to:
  /// **'No children are linked yet. Ask your child\'s college.'**
  String get noChildrenYet;

  /// No description provided for @feesReceiptsHeader.
  ///
  /// In en, this message translates to:
  /// **'Fees & receipts'**
  String get feesReceiptsHeader;

  /// No description provided for @childFees.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s fees'**
  String childFees(Object name);

  /// No description provided for @feesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Dues, payments and receipts'**
  String get feesSubtitle;

  /// No description provided for @childResults.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s results'**
  String childResults(Object name);

  /// No description provided for @childLibraryBooks.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s library books'**
  String childLibraryBooks(Object name);

  /// No description provided for @noBooksBorrowed.
  ///
  /// In en, this message translates to:
  /// **'No library books borrowed. Books {name} borrows from the college library show here with their due dates.'**
  String noBooksBorrowed(Object name);

  /// No description provided for @noBooksOutNow.
  ///
  /// In en, this message translates to:
  /// **'{name} has no library books out right now.'**
  String noBooksOutNow(Object name);

  /// No description provided for @childLibrary.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s library'**
  String childLibrary(Object name);

  /// No description provided for @markedAbsentFor.
  ///
  /// In en, this message translates to:
  /// **'{name} was marked absent for this {kind}.'**
  String markedAbsentFor(Object name, Object kind);

  /// No description provided for @noMarksCard.
  ///
  /// In en, this message translates to:
  /// **'No marks published yet. When {name}\'s teachers publish test or exam marks, they show here with the class average.'**
  String noMarksCard(Object name);

  /// No description provided for @noMarksScreen.
  ///
  /// In en, this message translates to:
  /// **'No marks published yet.\nWhen {name}\'s teachers publish marks, they show here.'**
  String noMarksScreen(Object name);

  /// No description provided for @recordingsEmpty.
  ///
  /// In en, this message translates to:
  /// **'When a teacher records a lesson on the board and shares it, it appears here so {name} can watch it again.'**
  String recordingsEmpty(Object name);

  /// No description provided for @missedThisClass.
  ///
  /// In en, this message translates to:
  /// **'Missed this class'**
  String get missedThisClass;

  /// No description provided for @childLessons.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s lessons'**
  String childLessons(Object name);

  /// No description provided for @noRecordingsShared.
  ///
  /// In en, this message translates to:
  /// **'No lesson recordings have been shared with the class yet.'**
  String get noRecordingsShared;

  /// No description provided for @boardNotShared.
  ///
  /// In en, this message translates to:
  /// **'This board is no longer shared with the class.'**
  String get boardNotShared;

  /// No description provided for @noFeesIssued.
  ///
  /// In en, this message translates to:
  /// **'No fees have been issued for {name} yet.'**
  String noFeesIssued(Object name);

  /// No description provided for @noFeesIssuedLong.
  ///
  /// In en, this message translates to:
  /// **'No fees have been issued for {name} yet.\nNew fees from the college will show here.'**
  String noFeesIssuedLong(Object name);

  /// No description provided for @pay.
  ///
  /// In en, this message translates to:
  /// **'Pay'**
  String get pay;

  /// No description provided for @payNow.
  ///
  /// In en, this message translates to:
  /// **'Pay now'**
  String get payNow;

  /// No description provided for @startingPayment.
  ///
  /// In en, this message translates to:
  /// **'Starting payment…'**
  String get startingPayment;

  /// No description provided for @confirmingPayment.
  ///
  /// In en, this message translates to:
  /// **'Confirming payment…'**
  String get confirmingPayment;

  /// No description provided for @paymentCancelled.
  ///
  /// In en, this message translates to:
  /// **'Payment cancelled. Nothing was paid.'**
  String get paymentCancelled;

  /// No description provided for @paymentFailedTitle.
  ///
  /// In en, this message translates to:
  /// **'Payment didn\'t go through'**
  String get paymentFailedTitle;

  /// No description provided for @finishInWallet.
  ///
  /// In en, this message translates to:
  /// **'Finish paying in {wallet}'**
  String finishInWallet(Object wallet);

  /// No description provided for @walletBody.
  ///
  /// In en, this message translates to:
  /// **'When {wallet} confirms the payment, the fee updates here and the receipt arrives in Updates.'**
  String walletBody(Object wallet);

  /// No description provided for @yourWalletApp.
  ///
  /// In en, this message translates to:
  /// **'your wallet app'**
  String get yourWalletApp;

  /// No description provided for @couldNotConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t confirm this payment'**
  String get couldNotConfirmTitle;

  /// No description provided for @couldNotConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'{reason} If money left your account, the college will get the confirmation from the payment gateway and this fee will update shortly. Otherwise, try again.'**
  String couldNotConfirmBody(Object reason);

  /// No description provided for @onlineNotAvailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Online payment is not available'**
  String get onlineNotAvailableTitle;

  /// No description provided for @enterAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount'**
  String get enterAmount;

  /// No description provided for @enterAmountRupees.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount in rupees, like 2500 or 2500.50'**
  String get enterAmountRupees;

  /// No description provided for @smallestPayment.
  ///
  /// In en, this message translates to:
  /// **'The smallest payment is ₹1'**
  String get smallestPayment;

  /// No description provided for @moreThanDue.
  ///
  /// In en, this message translates to:
  /// **'That is more than the {amount} due'**
  String moreThanDue(Object amount);

  /// No description provided for @payTitle.
  ///
  /// In en, this message translates to:
  /// **'Pay {title}'**
  String payTitle(Object title);

  /// No description provided for @amountDue.
  ///
  /// In en, this message translates to:
  /// **'{amount} due'**
  String amountDue(Object amount);

  /// No description provided for @fullAmount.
  ///
  /// In en, this message translates to:
  /// **'Full {amount}'**
  String fullAmount(Object amount);

  /// No description provided for @partAmount.
  ///
  /// In en, this message translates to:
  /// **'Part amount'**
  String get partAmount;

  /// No description provided for @amount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get amount;

  /// No description provided for @amountRange.
  ///
  /// In en, this message translates to:
  /// **'Between ₹1 and {amount}'**
  String amountRange(Object amount);

  /// No description provided for @payAmount.
  ///
  /// In en, this message translates to:
  /// **'Pay {amount}'**
  String payAmount(Object amount);

  /// No description provided for @paymentNotSetUp.
  ///
  /// In en, this message translates to:
  /// **'Online payment isn\'t set up by the college yet. Please pay at the fees counter.'**
  String get paymentNotSetUp;

  /// No description provided for @paymentPhonesOnly.
  ///
  /// In en, this message translates to:
  /// **'Online payment works in the KINETIX Parent app on Android phones and iPhones. On this device, please pay at the fees counter.'**
  String get paymentPhonesOnly;

  /// No description provided for @demoPayment.
  ///
  /// In en, this message translates to:
  /// **'Demo payment'**
  String get demoPayment;

  /// No description provided for @demoTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get demoTo;

  /// No description provided for @demoFor.
  ///
  /// In en, this message translates to:
  /// **'For'**
  String get demoFor;

  /// No description provided for @demoOrder.
  ///
  /// In en, this message translates to:
  /// **'Order'**
  String get demoOrder;

  /// No description provided for @demoPayAmount.
  ///
  /// In en, this message translates to:
  /// **'Pay {amount} (demo)'**
  String demoPayAmount(Object amount);

  /// No description provided for @failNoConfirmation.
  ///
  /// In en, this message translates to:
  /// **'The payment app did not return a confirmation. If money left your account, the fee will update shortly.'**
  String get failNoConfirmation;

  /// No description provided for @failCouldNotOpen.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open the payment screen. Try again.'**
  String get failCouldNotOpen;

  /// No description provided for @failNetwork.
  ///
  /// In en, this message translates to:
  /// **'No internet connection. Check it and try again.'**
  String get failNetwork;

  /// No description provided for @failGeneric.
  ///
  /// In en, this message translates to:
  /// **'The payment did not go through. Try again.'**
  String get failGeneric;

  /// No description provided for @paymentSuccessful.
  ///
  /// In en, this message translates to:
  /// **'Payment successful'**
  String get paymentSuccessful;

  /// No description provided for @paidFor.
  ///
  /// In en, this message translates to:
  /// **'{amount} paid for {name}'**
  String paidFor(Object amount, Object name);

  /// No description provided for @writeToAbout.
  ///
  /// In en, this message translates to:
  /// **'Write to {teacher} about {name}.'**
  String writeToAbout(Object teacher, Object name);

  /// No description provided for @noMessagesOneChild.
  ///
  /// In en, this message translates to:
  /// **'No messages yet.\nWrite to {name}\'s teachers about homework, absences or progress.'**
  String noMessagesOneChild(Object name);

  /// No description provided for @noMessagesChildren.
  ///
  /// In en, this message translates to:
  /// **'No messages yet.\nWrite to your children\'s teachers about homework, absences or progress.'**
  String get noMessagesChildren;

  /// No description provided for @noChildrenLinkedShort.
  ///
  /// In en, this message translates to:
  /// **'No children are linked to your account yet.\nAsk your child\'s college.'**
  String get noChildrenLinkedShort;

  /// No description provided for @aboutHeader.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get aboutHeader;

  /// No description provided for @childTeachers.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s teachers'**
  String childTeachers(Object name);

  /// No description provided for @noTeachersOnTimetable.
  ///
  /// In en, this message translates to:
  /// **'No teachers are on {name}\'s timetable yet.'**
  String noTeachersOnTimetable(Object name);

  /// No description provided for @noUpdates.
  ///
  /// In en, this message translates to:
  /// **'No updates yet.\nAbsences, homework and messages from the college will appear here.'**
  String get noUpdates;

  /// No description provided for @phoneOrEmail.
  ///
  /// In en, this message translates to:
  /// **'Phone or email'**
  String get phoneOrEmail;

  /// No description provided for @enterPhoneOrEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter your phone number or email'**
  String get enterPhoneOrEmail;

  /// No description provided for @errAccountInactive.
  ///
  /// In en, this message translates to:
  /// **'Your account is not active. Ask your institution\'s office.'**
  String get errAccountInactive;

  /// No description provided for @errSignInAgain.
  ///
  /// In en, this message translates to:
  /// **'Your sign-in has expired. Please sign in again.'**
  String get errSignInAgain;

  /// No description provided for @errTooLarge.
  ///
  /// In en, this message translates to:
  /// **'A file is too big. Each photo or PDF can be up to 8 MB.'**
  String get errTooLarge;

  /// No description provided for @errConflict.
  ///
  /// In en, this message translates to:
  /// **'This was changed in the meantime. Refresh and try again.'**
  String get errConflict;

  /// No description provided for @errSubjectNotInClass.
  ///
  /// In en, this message translates to:
  /// **'That subject is not taught in this class.'**
  String get errSubjectNotInClass;

  /// No description provided for @errSubmissionEmpty.
  ///
  /// In en, this message translates to:
  /// **'Write an answer or add a photo.'**
  String get errSubmissionEmpty;

  /// No description provided for @errSubmissionChecked.
  ///
  /// In en, this message translates to:
  /// **'This homework has already been checked.'**
  String get errSubmissionChecked;

  /// No description provided for @errSubmissionStudentOnly.
  ///
  /// In en, this message translates to:
  /// **'This student hands in their own homework from their own login.'**
  String get errSubmissionStudentOnly;

  /// No description provided for @calendar.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get calendar;

  /// No description provided for @calendarSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Holidays, exams and events'**
  String get calendarSubtitle;

  /// No description provided for @upcoming.
  ///
  /// In en, this message translates to:
  /// **'Coming up'**
  String get upcoming;

  /// No description provided for @seeCalendar.
  ///
  /// In en, this message translates to:
  /// **'See the full calendar'**
  String get seeCalendar;

  /// No description provided for @calendarEmpty.
  ///
  /// In en, this message translates to:
  /// **'No holidays, exams or events in the coming months.'**
  String get calendarEmpty;

  /// No description provided for @kindHoliday.
  ///
  /// In en, this message translates to:
  /// **'Holiday'**
  String get kindHoliday;

  /// No description provided for @kindExams.
  ///
  /// In en, this message translates to:
  /// **'Exams'**
  String get kindExams;

  /// No description provided for @kindEvent.
  ///
  /// In en, this message translates to:
  /// **'Event'**
  String get kindEvent;

  /// No description provided for @inDays.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{In 1 day} other{In {count} days}}'**
  String inDays(int count);

  /// No description provided for @forPrograms.
  ///
  /// In en, this message translates to:
  /// **'For {programs}'**
  String forPrograms(String programs);

  /// No description provided for @holidayToday.
  ///
  /// In en, this message translates to:
  /// **'Holiday today: {title}'**
  String holidayToday(String title);

  /// No description provided for @holidayTomorrow.
  ///
  /// In en, this message translates to:
  /// **'Holiday tomorrow: {title}'**
  String holidayTomorrow(String title);

  /// No description provided for @noClasses.
  ///
  /// In en, this message translates to:
  /// **'No classes.'**
  String get noClasses;

  /// No description provided for @noClassesUntil.
  ///
  /// In en, this message translates to:
  /// **'No classes until {date}.'**
  String noClassesUntil(String date);

  /// No description provided for @notHandedIn.
  ///
  /// In en, this message translates to:
  /// **'Not handed in yet'**
  String get notHandedIn;

  /// No description provided for @statusHandedIn.
  ///
  /// In en, this message translates to:
  /// **'Handed in'**
  String get statusHandedIn;

  /// No description provided for @statusChecked.
  ///
  /// In en, this message translates to:
  /// **'Checked'**
  String get statusChecked;

  /// No description provided for @statusReturned.
  ///
  /// In en, this message translates to:
  /// **'Returned to redo'**
  String get statusReturned;

  /// No description provided for @handedInAt.
  ///
  /// In en, this message translates to:
  /// **'Handed in {when}'**
  String handedInAt(String when);

  /// No description provided for @checkedByOn.
  ///
  /// In en, this message translates to:
  /// **'Checked by {name} on {date}'**
  String checkedByOn(String name, String date);

  /// No description provided for @returnedByOn.
  ///
  /// In en, this message translates to:
  /// **'Returned by {name} on {date}'**
  String returnedByOn(String name, String date);

  /// No description provided for @teacherRemark.
  ///
  /// In en, this message translates to:
  /// **'Teacher\'s remark'**
  String get teacherRemark;

  /// No description provided for @answerLabel.
  ///
  /// In en, this message translates to:
  /// **'Answer'**
  String get answerLabel;

  /// No description provided for @answerHint.
  ///
  /// In en, this message translates to:
  /// **'Type the answer here, or add photos of the work'**
  String get answerHint;

  /// No description provided for @handIn.
  ///
  /// In en, this message translates to:
  /// **'Hand in'**
  String get handIn;

  /// No description provided for @handInAgain.
  ///
  /// In en, this message translates to:
  /// **'Hand in again'**
  String get handInAgain;

  /// No description provided for @handInTitle.
  ///
  /// In en, this message translates to:
  /// **'Hand in homework'**
  String get handInTitle;

  /// No description provided for @handedInDone.
  ///
  /// In en, this message translates to:
  /// **'Handed in.'**
  String get handedInDone;

  /// No description provided for @couldNotAddFile.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t add that file. Try again.'**
  String get couldNotAddFile;

  /// No description provided for @fileTooBig.
  ///
  /// In en, this message translates to:
  /// **'{name} is too big (8 MB at most).'**
  String fileTooBig(String name);

  /// No description provided for @filesCount.
  ///
  /// In en, this message translates to:
  /// **'Photos and PDFs: {count} of {max}'**
  String filesCount(int count, int max);

  /// No description provided for @removeFile.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get removeFile;

  /// No description provided for @takePhoto.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get takePhoto;

  /// No description provided for @choosePhotos.
  ///
  /// In en, this message translates to:
  /// **'Choose photos'**
  String get choosePhotos;

  /// No description provided for @addPdf.
  ///
  /// In en, this message translates to:
  /// **'Add a PDF'**
  String get addPdf;

  /// No description provided for @filesHint.
  ///
  /// In en, this message translates to:
  /// **'Up to 5 photos or PDFs, 8 MB each. Photos are made smaller before they are sent.'**
  String get filesHint;

  /// No description provided for @uploading.
  ///
  /// In en, this message translates to:
  /// **'Sending… {percent}'**
  String uploading(String percent);

  /// No description provided for @photoNotLoaded.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load this photo.'**
  String get photoNotLoaded;

  /// No description provided for @topicsTaught.
  ///
  /// In en, this message translates to:
  /// **'{covered} of {total} topics taught'**
  String topicsTaught(int covered, int total);

  /// No description provided for @taught.
  ///
  /// In en, this message translates to:
  /// **'Taught'**
  String get taught;

  /// No description provided for @taughtOn.
  ///
  /// In en, this message translates to:
  /// **'Taught on {date}'**
  String taughtOn(String date);

  /// No description provided for @privacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get privacy;

  /// No description provided for @privacySubtitle.
  ///
  /// In en, this message translates to:
  /// **'What KINETIX may do with the student\'s information'**
  String get privacySubtitle;

  /// No description provided for @notNow.
  ///
  /// In en, this message translates to:
  /// **'Not now'**
  String get notNow;

  /// No description provided for @ifYouSayNo.
  ///
  /// In en, this message translates to:
  /// **'If you say no: {text}'**
  String ifYouSayNo(String text);

  /// No description provided for @changeAnyTime.
  ///
  /// In en, this message translates to:
  /// **'You can change these choices at any time in Profile → Privacy. A change does not affect what was done before it.'**
  String get changeAnyTime;

  /// No description provided for @readFullNotice.
  ///
  /// In en, this message translates to:
  /// **'Read the full notice'**
  String get readFullNotice;

  /// No description provided for @allowAll.
  ///
  /// In en, this message translates to:
  /// **'Allow all'**
  String get allowAll;

  /// No description provided for @saveChoices.
  ///
  /// In en, this message translates to:
  /// **'Save my choices'**
  String get saveChoices;

  /// No description provided for @notDecided.
  ///
  /// In en, this message translates to:
  /// **'Not decided yet'**
  String get notDecided;

  /// No description provided for @decidedBy.
  ///
  /// In en, this message translates to:
  /// **'{choice} by {name} on {date}'**
  String decidedBy(String choice, String name, String date);

  /// No description provided for @allowed.
  ///
  /// In en, this message translates to:
  /// **'Allowed'**
  String get allowed;

  /// No description provided for @notAllowed.
  ///
  /// In en, this message translates to:
  /// **'Not allowed'**
  String get notAllowed;

  /// No description provided for @choicesSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved.'**
  String get choicesSaved;

  /// No description provided for @privacyNotice.
  ///
  /// In en, this message translates to:
  /// **'Privacy notice'**
  String get privacyNotice;

  /// No description provided for @noticeVersion.
  ///
  /// In en, this message translates to:
  /// **'Version {version}'**
  String noticeVersion(String version);

  /// No description provided for @noticeWhoDecides.
  ///
  /// In en, this message translates to:
  /// **'Who decides'**
  String get noticeWhoDecides;

  /// No description provided for @noticeSchool.
  ///
  /// In en, this message translates to:
  /// **'School (students under 18): the parent or guardian decides for the child.'**
  String get noticeSchool;

  /// No description provided for @noticeCollege.
  ///
  /// In en, this message translates to:
  /// **'College or university: students decide for themselves. A guardian decides only for a student who has no KINETIX login of their own.'**
  String get noticeCollege;

  /// No description provided for @noticeWhatWeAsk.
  ///
  /// In en, this message translates to:
  /// **'What we ask about'**
  String get noticeWhatWeAsk;

  /// No description provided for @noticeWhereKept.
  ///
  /// In en, this message translates to:
  /// **'Where data is kept'**
  String get noticeWhereKept;

  /// No description provided for @noticeDataInIndia.
  ///
  /// In en, this message translates to:
  /// **'All data and all AI processing stay in India. Data is kept while the student is at the institution, and then for as long as the institution\'s records policy requires.'**
  String get noticeDataInIndia;

  /// No description provided for @noticeQuestions.
  ///
  /// In en, this message translates to:
  /// **'Questions and requests'**
  String get noticeQuestions;

  /// No description provided for @noticeContact.
  ///
  /// In en, this message translates to:
  /// **'The institution\'s grievance officer answers questions and requests to see, correct or erase data. Ask the institution\'s office how to reach them.'**
  String get noticeContact;

  /// No description provided for @grievanceOfficer.
  ///
  /// In en, this message translates to:
  /// **'Grievance officer'**
  String get grievanceOfficer;

  /// No description provided for @noticeContactOfficer.
  ///
  /// In en, this message translates to:
  /// **'The institution\'s grievance officer answers questions and requests to see, correct or erase data. You can reach them here:'**
  String get noticeContactOfficer;

  /// No description provided for @contactEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get contactEmail;

  /// No description provided for @contactPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get contactPhone;

  /// No description provided for @purposeDataTitle.
  ///
  /// In en, this message translates to:
  /// **'Records and updates'**
  String get purposeDataTitle;

  /// No description provided for @purposeDataBody.
  ///
  /// In en, this message translates to:
  /// **'Keeping the student\'s attendance, homework, marks, fees and library records so the institution can run classes and keep you informed.'**
  String get purposeDataBody;

  /// No description provided for @purposeDataNo.
  ///
  /// In en, this message translates to:
  /// **'the institution still keeps the records it must by law; you will not get updates in the app.'**
  String get purposeDataNo;

  /// No description provided for @purposeAiTitle.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI'**
  String get purposeAiTitle;

  /// No description provided for @purposeAiBody.
  ///
  /// In en, this message translates to:
  /// **'The student asking KINETIX AI for help with doubts. Questions are processed on servers in India and are not used to train AI models.'**
  String get purposeAiBody;

  /// No description provided for @purposeAiNo.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is turned off for the student. Everything else works.'**
  String get purposeAiNo;

  /// No description provided for @purposeRecordingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Class recordings and live classes'**
  String get purposeRecordingsTitle;

  /// No description provided for @purposeRecordingsBody.
  ///
  /// In en, this message translates to:
  /// **'The student\'s voice or image appearing in lesson recordings and live classes shared with the class.'**
  String get purposeRecordingsBody;

  /// No description provided for @purposeRecordingsNo.
  ///
  /// In en, this message translates to:
  /// **'teachers are asked not to record the student; recordings already shared stay with the class.'**
  String get purposeRecordingsNo;

  /// No description provided for @purposePhotosTitle.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get purposePhotosTitle;

  /// No description provided for @purposePhotosBody.
  ///
  /// In en, this message translates to:
  /// **'Photos of the student (for example on homework or in class activities) shared with the class.'**
  String get purposePhotosBody;

  /// No description provided for @purposePhotosNo.
  ///
  /// In en, this message translates to:
  /// **'photos of the student are not shared with the class.'**
  String get purposePhotosNo;

  /// No description provided for @errConsentGuardianDecides.
  ///
  /// In en, this message translates to:
  /// **'You can\'t change these choices for this student.'**
  String get errConsentGuardianDecides;

  /// No description provided for @childWork.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s work'**
  String childWork(String name);

  /// No description provided for @returnedNote.
  ///
  /// In en, this message translates to:
  /// **'The teacher has asked for this to be done again. Read the remark, then hand it in again.'**
  String get returnedNote;

  /// No description provided for @handInFor.
  ///
  /// In en, this message translates to:
  /// **'Hand in for {name}'**
  String handInFor(String name);

  /// No description provided for @handInForNote.
  ///
  /// In en, this message translates to:
  /// **'Hand in here for a child who doesn\'t have their own KINETIX login.'**
  String get handInForNote;

  /// No description provided for @consentTitleFor.
  ///
  /// In en, this message translates to:
  /// **'Privacy choices for {name}'**
  String consentTitleFor(String name);

  /// No description provided for @consentIntroFor.
  ///
  /// In en, this message translates to:
  /// **'Choose what KINETIX may do with {name}\'s information. Nothing is switched on until you choose.'**
  String consentIntroFor(String name);

  /// No description provided for @privacyIntroFor.
  ///
  /// In en, this message translates to:
  /// **'What KINETIX may do with {name}\'s information. Turn a switch off to withdraw your consent.'**
  String privacyIntroFor(String name);

  /// No description provided for @privacyIntroReadOnlyFor.
  ///
  /// In en, this message translates to:
  /// **'What KINETIX may do with {name}\'s information, and who decided.'**
  String privacyIntroReadOnlyFor(String name);

  /// No description provided for @managedByStudent.
  ///
  /// In en, this message translates to:
  /// **'{name} manages this. At a college, students with their own KINETIX login make these choices themselves.'**
  String managedByStudent(String name);

  /// No description provided for @childPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy: {name}'**
  String childPrivacy(String name);

  /// No description provided for @syllabusProgress.
  ///
  /// In en, this message translates to:
  /// **'Syllabus progress'**
  String get syllabusProgress;

  /// No description provided for @childSyllabusProgress.
  ///
  /// In en, this message translates to:
  /// **'Syllabus progress: {name}'**
  String childSyllabusProgress(String name);

  /// No description provided for @syllabusProgressSubtitle.
  ///
  /// In en, this message translates to:
  /// **'What the class has been taught in each subject'**
  String get syllabusProgressSubtitle;

  /// No description provided for @syllabusSubjectsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Subjects appear here once teachers set homework in them.'**
  String get syllabusSubjectsEmpty;

  /// No description provided for @syllabusNotLinked.
  ///
  /// In en, this message translates to:
  /// **'The syllabus for {subject} isn\'t in KINETIX yet.'**
  String syllabusNotLinked(String subject);

  /// No description provided for @chaptersTopics.
  ///
  /// In en, this message translates to:
  /// **'{chapters, plural, =1{1 chapter} other{{chapters} chapters}}'**
  String chaptersTopics(int chapters);

  /// No description provided for @noTopicsInChapter.
  ///
  /// In en, this message translates to:
  /// **'No topics yet'**
  String get noTopicsInChapter;

  /// No description provided for @thisWeekInClass.
  ///
  /// In en, this message translates to:
  /// **'This week in class'**
  String get thisWeekInClass;

  /// No description provided for @nextWeekInClass.
  ///
  /// In en, this message translates to:
  /// **'Next week'**
  String get nextWeekInClass;

  /// No description provided for @nothingPlannedThisWeek.
  ///
  /// In en, this message translates to:
  /// **'Nothing new is planned for this week.'**
  String get nothingPlannedThisWeek;

  /// No description provided for @planOnSchedule.
  ///
  /// In en, this message translates to:
  /// **'Class is on schedule'**
  String get planOnSchedule;

  /// No description provided for @planAhead.
  ///
  /// In en, this message translates to:
  /// **'Class is ahead of the plan'**
  String get planAhead;

  /// No description provided for @planBehind.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Class is 1 topic behind the plan} other{Class is {count} topics behind the plan}}'**
  String planBehind(int count);

  /// No description provided for @planIntro.
  ///
  /// In en, this message translates to:
  /// **'Topics the teacher plans to teach.'**
  String get planIntro;

  /// No description provided for @phoneNumber.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get phoneNumber;

  /// No description provided for @enterPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter your mobile number'**
  String get enterPhone;

  /// No description provided for @enterValidMobile.
  ///
  /// In en, this message translates to:
  /// **'Enter a 10-digit mobile number'**
  String get enterValidMobile;

  /// No description provided for @sendCode.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get sendCode;

  /// No description provided for @otpSentTo.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code sent to {phone}'**
  String otpSentTo(String phone);

  /// No description provided for @otpCode.
  ///
  /// In en, this message translates to:
  /// **'6-digit code'**
  String get otpCode;

  /// No description provided for @enterOtp.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get enterOtp;

  /// No description provided for @resendCode.
  ///
  /// In en, this message translates to:
  /// **'Resend code'**
  String get resendCode;

  /// A countdown such as 0:25 until another code may be asked for.
  ///
  /// In en, this message translates to:
  /// **'Resend code in {time}'**
  String resendIn(String time);

  /// No description provided for @changeNumber.
  ///
  /// In en, this message translates to:
  /// **'Change number'**
  String get changeNumber;

  /// No description provided for @usePassword.
  ///
  /// In en, this message translates to:
  /// **'Use a password instead'**
  String get usePassword;

  /// No description provided for @usePhoneCode.
  ///
  /// In en, this message translates to:
  /// **'Get a code on your phone instead'**
  String get usePhoneCode;

  /// No description provided for @errOtpInvalid.
  ///
  /// In en, this message translates to:
  /// **'That code is wrong or has expired. Check the SMS or ask for a new code.'**
  String get errOtpInvalid;

  /// No description provided for @errOtpTooMany.
  ///
  /// In en, this message translates to:
  /// **'Too many codes asked for. Wait a few minutes and try again.'**
  String get errOtpTooMany;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Get updates on this phone?'**
  String get notificationsTitle;

  /// No description provided for @notificationsAllow.
  ///
  /// In en, this message translates to:
  /// **'Turn on'**
  String get notificationsAllow;

  /// No description provided for @otpHint.
  ///
  /// In en, this message translates to:
  /// **'We\'ll text a code to the phone number you gave your child\'s college'**
  String get otpHint;

  /// No description provided for @notificationsBody.
  ///
  /// In en, this message translates to:
  /// **'We\'ll tell you about attendance, homework, results, fees and messages from your child\'s college. You can change this any time in your phone\'s settings.'**
  String get notificationsBody;

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

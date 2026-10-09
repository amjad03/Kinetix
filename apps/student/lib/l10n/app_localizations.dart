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

  /// No description provided for @yourAttendance.
  ///
  /// In en, this message translates to:
  /// **'Your attendance'**
  String get yourAttendance;

  /// No description provided for @notMissedAny.
  ///
  /// In en, this message translates to:
  /// **'You have not missed a class in the last {days} days. Well done!'**
  String notMissedAny(Object days);

  /// No description provided for @homeworkHandIn.
  ///
  /// In en, this message translates to:
  /// **'Hand it in the way your teacher asked. Stuck? Ask KINETIX AI in the {learn} tab.'**
  String homeworkHandIn(Object learn);

  /// No description provided for @noBooksBorrowed.
  ///
  /// In en, this message translates to:
  /// **'No library books borrowed. Books you borrow from the college library show here with their due dates.'**
  String get noBooksBorrowed;

  /// No description provided for @noBooksOutNow.
  ///
  /// In en, this message translates to:
  /// **'You have no library books out right now.'**
  String get noBooksOutNow;

  /// No description provided for @markedAbsentFor.
  ///
  /// In en, this message translates to:
  /// **'You were marked absent for this {kind}.'**
  String markedAbsentFor(Object kind);

  /// No description provided for @noMarksCard.
  ///
  /// In en, this message translates to:
  /// **'No marks published yet. When your teachers publish test or exam marks, they show here with the class average.'**
  String get noMarksCard;

  /// No description provided for @noMarksScreen.
  ///
  /// In en, this message translates to:
  /// **'No marks published yet.\nWhen your teachers publish marks, they show here.'**
  String get noMarksScreen;

  /// No description provided for @you.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get you;

  /// No description provided for @recordingsEmpty.
  ///
  /// In en, this message translates to:
  /// **'When a teacher records a lesson on the board and shares it, you can watch it again here.'**
  String get recordingsEmpty;

  /// No description provided for @missedThisClass.
  ///
  /// In en, this message translates to:
  /// **'You missed this class'**
  String get missedThisClass;

  /// No description provided for @noRecordingsShared.
  ///
  /// In en, this message translates to:
  /// **'No lesson recordings have been shared with your class yet.'**
  String get noRecordingsShared;

  /// No description provided for @recordingNotSharedYours.
  ///
  /// In en, this message translates to:
  /// **'This recording is no longer shared with your class.'**
  String get recordingNotSharedYours;

  /// No description provided for @boardNotShared.
  ///
  /// In en, this message translates to:
  /// **'This board is no longer shared with your class.'**
  String get boardNotShared;

  /// No description provided for @writeToAbout.
  ///
  /// In en, this message translates to:
  /// **'Write to {teacher} about a class, homework or a doubt.'**
  String writeToAbout(Object teacher);

  /// No description provided for @noMessagesStudent.
  ///
  /// In en, this message translates to:
  /// **'No messages yet.\nWrite to your teachers about a class, homework or a doubt.'**
  String get noMessagesStudent;

  /// No description provided for @noTeachersOnTimetable.
  ///
  /// In en, this message translates to:
  /// **'No teachers are on your timetable yet.'**
  String get noTeachersOnTimetable;

  /// No description provided for @yourTeachers.
  ///
  /// In en, this message translates to:
  /// **'Your teachers · {className}'**
  String yourTeachers(Object className);

  /// No description provided for @nUnread.
  ///
  /// In en, this message translates to:
  /// **'{count} unread'**
  String nUnread(Object count);

  /// No description provided for @writeToTeacher.
  ///
  /// In en, this message translates to:
  /// **'Write to a teacher'**
  String get writeToTeacher;

  /// No description provided for @openMessages.
  ///
  /// In en, this message translates to:
  /// **'Open messages'**
  String get openMessages;

  /// No description provided for @askYourTeachers.
  ///
  /// In en, this message translates to:
  /// **'Ask your teachers about a class, homework or a doubt.'**
  String get askYourTeachers;

  /// No description provided for @noUpdates.
  ///
  /// In en, this message translates to:
  /// **'You\'re all caught up.\nNew homework, shared boards, lesson recordings and messages from your college will appear here.'**
  String get noUpdates;

  /// No description provided for @noLongerLive.
  ///
  /// In en, this message translates to:
  /// **'This class is no longer live.'**
  String get noLongerLive;

  /// No description provided for @otherClassLive.
  ///
  /// In en, this message translates to:
  /// **'That class has ended. Another class is live now on {today}.'**
  String otherClassLive(Object today);

  /// No description provided for @liveClass.
  ///
  /// In en, this message translates to:
  /// **'Live class'**
  String get liveClass;

  /// No description provided for @signInHint.
  ///
  /// In en, this message translates to:
  /// **'Use the email or phone number your college gave you'**
  String get signInHint;

  /// No description provided for @emailOrPhone.
  ///
  /// In en, this message translates to:
  /// **'Email or phone'**
  String get emailOrPhone;

  /// No description provided for @enterEmailOrPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter your email or phone number'**
  String get enterEmailOrPhone;

  /// No description provided for @navLearn.
  ///
  /// In en, this message translates to:
  /// **'Learn'**
  String get navLearn;

  /// No description provided for @attendanceFewMissed.
  ///
  /// In en, this message translates to:
  /// **'You missed a few classes recently.'**
  String get attendanceFewMissed;

  /// No description provided for @attendanceBelow75.
  ///
  /// In en, this message translates to:
  /// **'Below 75%. Colleges usually need 75% for you to sit exams.'**
  String get attendanceBelow75;

  /// No description provided for @noAttendanceForYou.
  ///
  /// In en, this message translates to:
  /// **'No attendance has been taken for you in the last {days} days.'**
  String noAttendanceForYou(Object days);

  /// No description provided for @nothingDue.
  ///
  /// In en, this message translates to:
  /// **'Nothing due right now. New homework from your teachers will show here.'**
  String get nothingDue;

  /// No description provided for @stuckTitle.
  ///
  /// In en, this message translates to:
  /// **'Stuck on something?'**
  String get stuckTitle;

  /// No description provided for @stuckBody.
  ///
  /// In en, this message translates to:
  /// **'Ask KINETIX AI to explain it, in English, हिन्दी or ಕನ್ನಡ.'**
  String get stuckBody;

  /// No description provided for @boardsEmpty.
  ///
  /// In en, this message translates to:
  /// **'When a teacher shares the class board after a lesson, it appears here so you can revise.'**
  String get boardsEmpty;

  /// No description provided for @feesNote.
  ///
  /// In en, this message translates to:
  /// **'Fees are paid by your parent or guardian in the KINETIX Parent app, or at the college fees counter. Here you can see what is due and open your receipts.'**
  String get feesNote;

  /// No description provided for @invoicePaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get invoicePaid;

  /// No description provided for @invoiceCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get invoiceCancelled;

  /// No description provided for @invoiceOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get invoiceOverdue;

  /// No description provided for @invoicePartPaid.
  ///
  /// In en, this message translates to:
  /// **'Part paid'**
  String get invoicePartPaid;

  /// No description provided for @invoiceDue.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get invoiceDue;

  /// No description provided for @payments.
  ///
  /// In en, this message translates to:
  /// **'Payments'**
  String get payments;

  /// No description provided for @noFeesIssued.
  ///
  /// In en, this message translates to:
  /// **'No fees have been issued to you.'**
  String get noFeesIssued;

  /// No description provided for @noPayments.
  ///
  /// In en, this message translates to:
  /// **'No payments yet. Receipts appear here once a payment goes through.'**
  String get noPayments;

  /// No description provided for @allPaid.
  ///
  /// In en, this message translates to:
  /// **'All paid'**
  String get allPaid;

  /// No description provided for @feesOverdueNext.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 fee overdue} other{{count} fees overdue}} · next: {title}'**
  String feesOverdueNext(int count, Object title);

  /// No description provided for @nextFeeDue.
  ///
  /// In en, this message translates to:
  /// **'Next: {title}, due {date}'**
  String nextFeeDue(Object title, Object date);

  /// No description provided for @amountPaidShort.
  ///
  /// In en, this message translates to:
  /// **'{amount} paid'**
  String amountPaidShort(Object amount);

  /// No description provided for @dueOnShort.
  ///
  /// In en, this message translates to:
  /// **'due {date}'**
  String dueOnShort(Object date);

  /// No description provided for @paidOn.
  ///
  /// In en, this message translates to:
  /// **'Paid on'**
  String get paidOn;

  /// No description provided for @rollNoLabel.
  ///
  /// In en, this message translates to:
  /// **'Roll no.'**
  String get rollNoLabel;

  /// No description provided for @forLabel.
  ///
  /// In en, this message translates to:
  /// **'For'**
  String get forLabel;

  /// No description provided for @method.
  ///
  /// In en, this message translates to:
  /// **'Method'**
  String get method;

  /// No description provided for @feeAmount.
  ///
  /// In en, this message translates to:
  /// **'Fee amount'**
  String get feeAmount;

  /// No description provided for @balance.
  ///
  /// In en, this message translates to:
  /// **'Balance'**
  String get balance;

  /// No description provided for @nil.
  ///
  /// In en, this message translates to:
  /// **'Nil'**
  String get nil;

  /// No description provided for @keepReceipt.
  ///
  /// In en, this message translates to:
  /// **'Keep this for your records. Show it at the fees counter if anyone asks for proof of payment.'**
  String get keepReceipt;

  /// No description provided for @yourClass.
  ///
  /// In en, this message translates to:
  /// **'Your class'**
  String get yourClass;

  /// No description provided for @program.
  ///
  /// In en, this message translates to:
  /// **'Program'**
  String get program;

  /// No description provided for @attendanceHistory.
  ///
  /// In en, this message translates to:
  /// **'Attendance history'**
  String get attendanceHistory;

  /// No description provided for @writeToYourTeachers.
  ///
  /// In en, this message translates to:
  /// **'Write to your teachers'**
  String get writeToYourTeachers;

  /// No description provided for @aiAnswersIn.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI answers in'**
  String get aiAnswersIn;

  /// No description provided for @answersIn.
  ///
  /// In en, this message translates to:
  /// **'Answers in'**
  String get answersIn;

  /// No description provided for @timetable.
  ///
  /// In en, this message translates to:
  /// **'Timetable'**
  String get timetable;

  /// No description provided for @timetableSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your classes for the week'**
  String get timetableSubtitle;

  /// No description provided for @everyClass30.
  ///
  /// In en, this message translates to:
  /// **'Every class in the last 30 days'**
  String get everyClass30;

  /// No description provided for @noAttendanceDays.
  ///
  /// In en, this message translates to:
  /// **'No attendance taken in the last {days} days'**
  String noAttendanceDays(Object days);

  /// No description provided for @attendedPercent.
  ///
  /// In en, this message translates to:
  /// **'{percent} attended in the last {days} days'**
  String attendedPercent(Object percent, Object days);

  /// No description provided for @noMarksYet.
  ///
  /// In en, this message translates to:
  /// **'No marks published yet'**
  String get noMarksYet;

  /// No description provided for @assessmentsPublished.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 assessment published} other{{count} assessments published}}'**
  String assessmentsPublished(int count);

  /// No description provided for @noBooksOutShort.
  ///
  /// In en, this message translates to:
  /// **'No books out'**
  String get noBooksOutShort;

  /// No description provided for @booksOut.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 book out} other{{count} books out}}'**
  String booksOut(int count);

  /// No description provided for @feesCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 fee} other{{count} fees}}'**
  String feesCount(int count);

  /// No description provided for @receiptsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 receipt} other{{count} receipts}}'**
  String receiptsCount(int count);

  /// No description provided for @askADoubt.
  ///
  /// In en, this message translates to:
  /// **'Ask a doubt'**
  String get askADoubt;

  /// No description provided for @syllabus.
  ///
  /// In en, this message translates to:
  /// **'Syllabus'**
  String get syllabus;

  /// No description provided for @codeLab.
  ///
  /// In en, this message translates to:
  /// **'Code lab'**
  String get codeLab;

  /// No description provided for @labs.
  ///
  /// In en, this message translates to:
  /// **'Labs'**
  String get labs;

  /// No description provided for @earlierQuestions.
  ///
  /// In en, this message translates to:
  /// **'Earlier questions'**
  String get earlierQuestions;

  /// No description provided for @askIntro.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI explains it step by step, following your syllabus.'**
  String get askIntro;

  /// No description provided for @aboutTopic.
  ///
  /// In en, this message translates to:
  /// **'About: {topic}'**
  String aboutTopic(Object topic);

  /// No description provided for @askAboutAnything.
  ///
  /// In en, this message translates to:
  /// **'Ask about anything'**
  String get askAboutAnything;

  /// No description provided for @questionHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. What is forfeiture of shares?'**
  String get questionHint;

  /// No description provided for @answerIn.
  ///
  /// In en, this message translates to:
  /// **'Answer in'**
  String get answerIn;

  /// No description provided for @subject.
  ///
  /// In en, this message translates to:
  /// **'Subject'**
  String get subject;

  /// No description provided for @anySubject.
  ///
  /// In en, this message translates to:
  /// **'Any'**
  String get anySubject;

  /// No description provided for @ask.
  ///
  /// In en, this message translates to:
  /// **'Ask'**
  String get ask;

  /// No description provided for @youAsked.
  ///
  /// In en, this message translates to:
  /// **'You asked'**
  String get youAsked;

  /// No description provided for @aiThinking.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is thinking…'**
  String get aiThinking;

  /// No description provided for @keyPoints.
  ///
  /// In en, this message translates to:
  /// **'Key points'**
  String get keyPoints;

  /// No description provided for @basedOn.
  ///
  /// In en, this message translates to:
  /// **'Based on'**
  String get basedOn;

  /// No description provided for @openTopicNotes.
  ///
  /// In en, this message translates to:
  /// **'Open the topic notes'**
  String get openTopicNotes;

  /// No description provided for @askNext.
  ///
  /// In en, this message translates to:
  /// **'Ask next'**
  String get askNext;

  /// No description provided for @previewAnswer.
  ///
  /// In en, this message translates to:
  /// **'Preview answer'**
  String get previewAnswer;

  /// No description provided for @previewNote.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI isn\'t connected at your college yet, so this is a sample, not a real explanation.'**
  String get previewNote;

  /// No description provided for @aiCantAnswer.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI can\'t answer that'**
  String get aiCantAnswer;

  /// No description provided for @aiRephrase.
  ///
  /// In en, this message translates to:
  /// **'Try rephrasing it as a question about your studies.'**
  String get aiRephrase;

  /// No description provided for @aiAllowanceUsed.
  ///
  /// In en, this message translates to:
  /// **'Today\'s KINETIX AI allowance is used up'**
  String get aiAllowanceUsed;

  /// No description provided for @aiAllowanceBody.
  ///
  /// In en, this message translates to:
  /// **'Your college has used today’s allowance. It resets tomorrow.'**
  String get aiAllowanceBody;

  /// No description provided for @aiUnreachable.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is not reachable'**
  String get aiUnreachable;

  /// No description provided for @aiUnreachableBody.
  ///
  /// In en, this message translates to:
  /// **'It is not reachable right now. Try again in a minute.'**
  String get aiUnreachableBody;

  /// No description provided for @noConnection.
  ///
  /// In en, this message translates to:
  /// **'No connection'**
  String get noConnection;

  /// No description provided for @somethingWrong.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get somethingWrong;

  /// No description provided for @topicNotInLibrary.
  ///
  /// In en, this message translates to:
  /// **'This topic is no longer in the library.'**
  String get topicNotInLibrary;

  /// No description provided for @topic.
  ///
  /// In en, this message translates to:
  /// **'Topic'**
  String get topic;

  /// No description provided for @askAboutThis.
  ///
  /// In en, this message translates to:
  /// **'Ask KINETIX AI about this'**
  String get askAboutThis;

  /// No description provided for @notes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get notes;

  /// No description provided for @outcomes.
  ///
  /// In en, this message translates to:
  /// **'After this topic you should be able to'**
  String get outcomes;

  /// No description provided for @noNotes.
  ///
  /// In en, this message translates to:
  /// **'No notes have been added for this topic yet.'**
  String get noNotes;

  /// No description provided for @notReviewed.
  ///
  /// In en, this message translates to:
  /// **'These notes have not been reviewed by the curriculum team yet. Your textbook and teacher come first.'**
  String get notReviewed;

  /// No description provided for @askKinetixAi.
  ///
  /// In en, this message translates to:
  /// **'Ask KINETIX AI'**
  String get askKinetixAi;

  /// No description provided for @searchTopicsHint.
  ///
  /// In en, this message translates to:
  /// **'Search topics, e.g. goodwill'**
  String get searchTopicsHint;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @noTopicsMatch.
  ///
  /// In en, this message translates to:
  /// **'No topics match “{query}”. Try a shorter word, or ask KINETIX AI.'**
  String noTopicsMatch(Object query);

  /// No description provided for @topicsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 topic} other{{count} topics}}'**
  String topicsCount(int count);

  /// No description provided for @chaptersCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 chapter} other{{count} chapters}}'**
  String chaptersCount(int count);

  /// No description provided for @yourSubjects.
  ///
  /// In en, this message translates to:
  /// **'Your subjects'**
  String get yourSubjects;

  /// No description provided for @subjectsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Your subjects appear here once your teachers set homework. Meanwhile, search for any topic above.'**
  String get subjectsEmpty;

  /// No description provided for @syllabusMissing.
  ///
  /// In en, this message translates to:
  /// **'The syllabus for {subject} isn\'t in the KINETIX library yet.\nSearch for a topic, or ask KINETIX AI.'**
  String syllabusMissing(Object subject);

  /// No description provided for @noTopicsYet.
  ///
  /// In en, this message translates to:
  /// **'No topics yet.'**
  String get noTopicsYet;

  /// No description provided for @joiningClass.
  ///
  /// In en, this message translates to:
  /// **'Joining the class…'**
  String get joiningClass;

  /// No description provided for @waitingForBoard.
  ///
  /// In en, this message translates to:
  /// **'Waiting for the board…'**
  String get waitingForBoard;

  /// No description provided for @leave.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get leave;

  /// No description provided for @liveBadge.
  ///
  /// In en, this message translates to:
  /// **'LIVE'**
  String get liveBadge;

  /// No description provided for @reconnecting.
  ///
  /// In en, this message translates to:
  /// **'Connection lost. Reconnecting…'**
  String get reconnecting;

  /// No description provided for @couldNotJoin.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t join the class'**
  String get couldNotJoin;

  /// No description provided for @tryInAMoment.
  ///
  /// In en, this message translates to:
  /// **'Try again in a moment.'**
  String get tryInAMoment;

  /// No description provided for @liveOffTitle.
  ///
  /// In en, this message translates to:
  /// **'Your teacher stopped the live class'**
  String get liveOffTitle;

  /// No description provided for @liveOffBody.
  ///
  /// In en, this message translates to:
  /// **'The board is no longer being shared. If your teacher shares a recording of the lesson, it will appear on {today}.'**
  String liveOffBody(Object today);

  /// No description provided for @boardOfflineTitle.
  ///
  /// In en, this message translates to:
  /// **'The board went offline'**
  String get boardOfflineTitle;

  /// No description provided for @boardOfflineBody.
  ///
  /// In en, this message translates to:
  /// **'The classroom board lost its connection. Stay here: the board comes back on its own when it reconnects.'**
  String get boardOfflineBody;

  /// No description provided for @classEndedTitle.
  ///
  /// In en, this message translates to:
  /// **'The class has ended'**
  String get classEndedTitle;

  /// No description provided for @classEndedBody.
  ///
  /// In en, this message translates to:
  /// **'Thanks for joining. If your teacher shares a recording of the lesson, it will appear on {today}.'**
  String classEndedBody(Object today);

  /// No description provided for @backToToday.
  ///
  /// In en, this message translates to:
  /// **'Back to {today}'**
  String backToToday(Object today);

  /// No description provided for @liveNow.
  ///
  /// In en, this message translates to:
  /// **'Live now: {subject}'**
  String liveNow(Object subject);

  /// No description provided for @classFallback.
  ///
  /// In en, this message translates to:
  /// **'class'**
  String get classFallback;

  /// No description provided for @teacherTeaching.
  ///
  /// In en, this message translates to:
  /// **'{teacher} is teaching. Watch the board.'**
  String teacherTeaching(Object teacher);

  /// No description provided for @watch.
  ///
  /// In en, this message translates to:
  /// **'Watch'**
  String get watch;

  /// No description provided for @liveSignInAgain.
  ///
  /// In en, this message translates to:
  /// **'Sign in again to watch the class.'**
  String get liveSignInAgain;

  /// No description provided for @liveNotConnected.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get liveNotConnected;

  /// No description provided for @liveTimeout.
  ///
  /// In en, this message translates to:
  /// **'The class is taking too long to answer. Try again.'**
  String get liveTimeout;

  /// No description provided for @liveCouldNotJoin.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t join the class.'**
  String get liveCouldNotJoin;

  /// No description provided for @undergraduate.
  ///
  /// In en, this message translates to:
  /// **'Undergraduate'**
  String get undergraduate;

  /// No description provided for @postgraduate.
  ///
  /// In en, this message translates to:
  /// **'Postgraduate'**
  String get postgraduate;

  /// No description provided for @boardOnlyNoSound.
  ///
  /// In en, this message translates to:
  /// **'Board only: no sound'**
  String get boardOnlyNoSound;

  /// No description provided for @teacherMicOn.
  ///
  /// In en, this message translates to:
  /// **'Teacher\'s mic is on'**
  String get teacherMicOn;

  /// No description provided for @teacherMicOff.
  ///
  /// In en, this message translates to:
  /// **'Teacher\'s mic is off'**
  String get teacherMicOff;

  /// No description provided for @muteClass.
  ///
  /// In en, this message translates to:
  /// **'Mute the class'**
  String get muteClass;

  /// No description provided for @unmuteClass.
  ///
  /// In en, this message translates to:
  /// **'Unmute the class'**
  String get unmuteClass;

  /// No description provided for @errNotStudent.
  ///
  /// In en, this message translates to:
  /// **'This app is for students. Ask your college office to set up your student login.'**
  String get errNotStudent;

  /// No description provided for @errGuardianAccount.
  ///
  /// In en, this message translates to:
  /// **'This app is for students. Parents and guardians can use the KINETIX Parent app.'**
  String get errGuardianAccount;

  /// No description provided for @errTeacherAccount.
  ///
  /// In en, this message translates to:
  /// **'This app is for students. Teachers can use the KINETIX Teacher app.'**
  String get errTeacherAccount;

  /// No description provided for @errNotLinked.
  ///
  /// In en, this message translates to:
  /// **'Your login is not linked to a student record yet. Ask your college office to link it.'**
  String get errNotLinked;

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
  /// **'In a school, your parent or guardian makes these choices.'**
  String get errConsentGuardianDecides;

  /// No description provided for @aiConsentWithdrawnTitle.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is turned off'**
  String get aiConsentWithdrawnTitle;

  /// No description provided for @aiConsentWithdrawnBody.
  ///
  /// In en, this message translates to:
  /// **'Consent for KINETIX AI was withdrawn, so it is off for you. Everything else works. You can see who decided, or change it, in Profile → Privacy.'**
  String get aiConsentWithdrawnBody;

  /// No description provided for @openPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Open Privacy'**
  String get openPrivacy;

  /// No description provided for @errLiveNotAllowed.
  ///
  /// In en, this message translates to:
  /// **'Only school leaders and students can watch classes.'**
  String get errLiveNotAllowed;

  /// No description provided for @errLiveViewOff.
  ///
  /// In en, this message translates to:
  /// **'Live view is turned off for your institution.'**
  String get errLiveViewOff;

  /// No description provided for @errLiveNotStarted.
  ///
  /// In en, this message translates to:
  /// **'Your teacher has not started a live class.'**
  String get errLiveNotStarted;

  /// No description provided for @errLiveUnknownBoard.
  ///
  /// In en, this message translates to:
  /// **'This classroom board isn\'t recognised. Ask your teacher which class to watch.'**
  String get errLiveUnknownBoard;

  /// No description provided for @errLiveNoClass.
  ///
  /// In en, this message translates to:
  /// **'No class is being taught on this board right now.'**
  String get errLiveNoClass;

  /// No description provided for @errLiveNotYourClass.
  ///
  /// In en, this message translates to:
  /// **'This is not your class.'**
  String get errLiveNotYourClass;

  /// No description provided for @yourWork.
  ///
  /// In en, this message translates to:
  /// **'Your work'**
  String get yourWork;

  /// No description provided for @returnedNote.
  ///
  /// In en, this message translates to:
  /// **'Your teacher has asked you to do this again. Read the remark, then hand it in again.'**
  String get returnedNote;

  /// No description provided for @consentTitle.
  ///
  /// In en, this message translates to:
  /// **'Your privacy choices'**
  String get consentTitle;

  /// No description provided for @consentIntro.
  ///
  /// In en, this message translates to:
  /// **'Choose what KINETIX may do with your information. Nothing is switched on until you choose.'**
  String get consentIntro;

  /// No description provided for @privacyIntro.
  ///
  /// In en, this message translates to:
  /// **'What KINETIX may do with your information. Turn a switch off to withdraw your consent.'**
  String get privacyIntro;

  /// No description provided for @privacyIntroReadOnly.
  ///
  /// In en, this message translates to:
  /// **'What KINETIX may do with your information, and who decided.'**
  String get privacyIntroReadOnly;

  /// No description provided for @managedByParent.
  ///
  /// In en, this message translates to:
  /// **'Your parent manages this. In a school, your parent or guardian makes these choices in the KINETIX Parent app.'**
  String get managedByParent;

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

  /// No description provided for @comingUpInClass.
  ///
  /// In en, this message translates to:
  /// **'Coming up in class'**
  String get comingUpInClass;

  /// No description provided for @readAhead.
  ///
  /// In en, this message translates to:
  /// **'Topics planned for class. Read ahead if you like.'**
  String get readAhead;

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
  /// **'We\'ll text a code to the phone number your college has for you'**
  String get otpHint;

  /// No description provided for @notificationsBody.
  ///
  /// In en, this message translates to:
  /// **'We\'ll tell you about new homework, results, live classes and messages from your college. You can change this any time in your phone\'s settings.'**
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

  /// A shared recording: the last day it can be watched.
  ///
  /// In en, this message translates to:
  /// **'Available until {date}'**
  String recordingAvailableUntil(String date);

  /// No description provided for @conceptVideos.
  ///
  /// In en, this message translates to:
  /// **'Concept videos'**
  String get conceptVideos;

  /// No description provided for @conceptVideosHint.
  ///
  /// In en, this message translates to:
  /// **'Watch before class to preview, and after class to revise.'**
  String get conceptVideosHint;

  /// No description provided for @conceptVideosFromYouTube.
  ///
  /// In en, this message translates to:
  /// **'Plays from YouTube'**
  String get conceptVideosFromYouTube;

  /// No description provided for @conceptVideoSourcePlatform.
  ///
  /// In en, this message translates to:
  /// **'KINETIX'**
  String get conceptVideoSourcePlatform;

  /// No description provided for @conceptVideoSourceInstitution.
  ///
  /// In en, this message translates to:
  /// **'School'**
  String get conceptVideoSourceInstitution;

  /// No description provided for @conceptVideoSourceTeacher.
  ///
  /// In en, this message translates to:
  /// **'Teacher'**
  String get conceptVideoSourceTeacher;

  /// No description provided for @conceptVideosUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Videos can\'t play here. Use the Student App on your phone.'**
  String get conceptVideosUnsupported;

  /// No description provided for @conceptVideoPlay.
  ///
  /// In en, this message translates to:
  /// **'Play {title}'**
  String conceptVideoPlay(String title);

  /// No description provided for @liveQuestion.
  ///
  /// In en, this message translates to:
  /// **'Live question'**
  String get liveQuestion;

  /// No description provided for @liveQuestionTapToAnswer.
  ///
  /// In en, this message translates to:
  /// **'Tap to answer'**
  String get liveQuestionTapToAnswer;

  /// No description provided for @liveQuestionYourAnswer.
  ///
  /// In en, this message translates to:
  /// **'Your answer: {answer} (you can change it)'**
  String liveQuestionYourAnswer(String answer);

  /// No description provided for @liveQuestionYourNumber.
  ///
  /// In en, this message translates to:
  /// **'Your answer'**
  String get liveQuestionYourNumber;

  /// No description provided for @liveQuestionSend.
  ///
  /// In en, this message translates to:
  /// **'Send answer'**
  String get liveQuestionSend;

  /// No description provided for @liveQuestionNotNumber.
  ///
  /// In en, this message translates to:
  /// **'Type a number, like 2.5'**
  String get liveQuestionNotNumber;

  /// No description provided for @liveQuestionYourWords.
  ///
  /// In en, this message translates to:
  /// **'Your answer (one to three words)'**
  String get liveQuestionYourWords;

  /// No description provided for @liveQuestionNotWords.
  ///
  /// In en, this message translates to:
  /// **'Type one to three words'**
  String get liveQuestionNotWords;

  /// No description provided for @liveQuestionClosed.
  ///
  /// In en, this message translates to:
  /// **'Your teacher has ended this question.'**
  String get liveQuestionClosed;

  /// No description provided for @careersTitle.
  ///
  /// In en, this message translates to:
  /// **'Careers'**
  String get careersTitle;

  /// No description provided for @careersSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Campus drives, offers and internships'**
  String get careersSubtitle;

  /// No description provided for @careersAcademics.
  ///
  /// In en, this message translates to:
  /// **'CGPA {cgpa} · {backlogs, plural, =0{no backlogs} =1{1 backlog} other{{backlogs} backlogs}}'**
  String careersAcademics(Object cgpa, int backlogs);

  /// No description provided for @careersNoResult.
  ///
  /// In en, this message translates to:
  /// **'No published result yet'**
  String get careersNoResult;

  /// No description provided for @careersDrives.
  ///
  /// In en, this message translates to:
  /// **'Drives'**
  String get careersDrives;

  /// No description provided for @careersNoDrives.
  ///
  /// In en, this message translates to:
  /// **'No drives are open right now.'**
  String get careersNoDrives;

  /// No description provided for @careersOffers.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get careersOffers;

  /// No description provided for @careersInternships.
  ///
  /// In en, this message translates to:
  /// **'Internships'**
  String get careersInternships;

  /// No description provided for @careersPlaced.
  ///
  /// In en, this message translates to:
  /// **'An offer has been accepted. Congratulations!'**
  String get careersPlaced;

  /// No description provided for @careersRegister.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get careersRegister;

  /// No description provided for @careersWithdraw.
  ///
  /// In en, this message translates to:
  /// **'Withdraw'**
  String get careersWithdraw;

  /// No description provided for @careersAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get careersAccept;

  /// No description provided for @careersDecline.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get careersDecline;

  /// No description provided for @careersViewOnly.
  ///
  /// In en, this message translates to:
  /// **'You can follow drives and offers here. Only your child can register or answer an offer.'**
  String get careersViewOnly;

  /// No description provided for @careersPackage.
  ///
  /// In en, this message translates to:
  /// **'{ctc} lakh a year'**
  String careersPackage(Object ctc);

  /// No description provided for @careersMinCgpa.
  ///
  /// In en, this message translates to:
  /// **'Minimum CGPA {cgpa}'**
  String careersMinCgpa(Object cgpa);

  /// No description provided for @careersRegisteredNote.
  ///
  /// In en, this message translates to:
  /// **'You are registered for {drive}'**
  String careersRegisteredNote(Object drive);

  /// No description provided for @careersReg_registered.
  ///
  /// In en, this message translates to:
  /// **'Registered'**
  String get careersReg_registered;

  /// No description provided for @careersReg_shortlisted.
  ///
  /// In en, this message translates to:
  /// **'Shortlisted'**
  String get careersReg_shortlisted;

  /// No description provided for @careersReg_rejected.
  ///
  /// In en, this message translates to:
  /// **'Not selected'**
  String get careersReg_rejected;

  /// No description provided for @careersReg_selected.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get careersReg_selected;

  /// No description provided for @careersReg_withdrawn.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get careersReg_withdrawn;

  /// No description provided for @careersOffer_offered.
  ///
  /// In en, this message translates to:
  /// **'Waiting for an answer'**
  String get careersOffer_offered;

  /// No description provided for @careersOffer_accepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get careersOffer_accepted;

  /// No description provided for @careersOffer_declined.
  ///
  /// In en, this message translates to:
  /// **'Declined'**
  String get careersOffer_declined;

  /// No description provided for @careersOffer_withdrawn.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn by the company'**
  String get careersOffer_withdrawn;

  /// No description provided for @careersOffer_expired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get careersOffer_expired;

  /// No description provided for @careersReason_not_open.
  ///
  /// In en, this message translates to:
  /// **'Not open for registration'**
  String get careersReason_not_open;

  /// No description provided for @careersReason_deadline_passed.
  ///
  /// In en, this message translates to:
  /// **'Registration has closed'**
  String get careersReason_deadline_passed;

  /// No description provided for @careersReason_no_results.
  ///
  /// In en, this message translates to:
  /// **'No published result yet'**
  String get careersReason_no_results;

  /// No description provided for @careersReason_cgpa_below.
  ///
  /// In en, this message translates to:
  /// **'CGPA is below the minimum'**
  String get careersReason_cgpa_below;

  /// No description provided for @careersReason_backlogs_exceeded.
  ///
  /// In en, this message translates to:
  /// **'Too many backlogs'**
  String get careersReason_backlogs_exceeded;

  /// No description provided for @careersReason_program_not_eligible.
  ///
  /// In en, this message translates to:
  /// **'Not open to your programme'**
  String get careersReason_program_not_eligible;

  /// No description provided for @grievancesTitle.
  ///
  /// In en, this message translates to:
  /// **'Grievances'**
  String get grievancesTitle;

  /// No description provided for @grievancesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Raise a concern and follow it to a resolution'**
  String get grievancesSubtitle;

  /// No description provided for @grievanceNone.
  ///
  /// In en, this message translates to:
  /// **'No grievances raised yet.'**
  String get grievanceNone;

  /// No description provided for @grievanceRaise.
  ///
  /// In en, this message translates to:
  /// **'Raise a grievance'**
  String get grievanceRaise;

  /// No description provided for @grievanceCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get grievanceCategory;

  /// No description provided for @grievanceSubject.
  ///
  /// In en, this message translates to:
  /// **'Subject'**
  String get grievanceSubject;

  /// No description provided for @grievanceDescription.
  ///
  /// In en, this message translates to:
  /// **'What happened?'**
  String get grievanceDescription;

  /// No description provided for @grievanceAnonymous.
  ///
  /// In en, this message translates to:
  /// **'Hide my name from the staff'**
  String get grievanceAnonymous;

  /// No description provided for @grievanceAnonymousHint.
  ///
  /// In en, this message translates to:
  /// **'The team will not see who raised it. You can still follow it here.'**
  String get grievanceAnonymousHint;

  /// No description provided for @grievanceConfidentialHint.
  ///
  /// In en, this message translates to:
  /// **'Ragging and harassment go to a confidential committee. Nobody else can read them.'**
  String get grievanceConfidentialHint;

  /// No description provided for @grievanceSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get grievanceSubmit;

  /// No description provided for @grievanceRecorded.
  ///
  /// In en, this message translates to:
  /// **'Your grievance was recorded as {ticketNo}'**
  String grievanceRecorded(Object ticketNo);

  /// No description provided for @grievanceDue.
  ///
  /// In en, this message translates to:
  /// **'Reply due {date}'**
  String grievanceDue(Object date);

  /// No description provided for @grievanceResolution.
  ///
  /// In en, this message translates to:
  /// **'Resolution'**
  String get grievanceResolution;

  /// No description provided for @grievanceRate.
  ///
  /// In en, this message translates to:
  /// **'How satisfied are you with the resolution?'**
  String get grievanceRate;

  /// No description provided for @grievanceRated.
  ///
  /// In en, this message translates to:
  /// **'Thank you for rating'**
  String get grievanceRated;

  /// No description provided for @grievanceAnonymousTag.
  ///
  /// In en, this message translates to:
  /// **'Anonymous'**
  String get grievanceAnonymousTag;

  /// No description provided for @grievanceCat_academic.
  ///
  /// In en, this message translates to:
  /// **'Academic'**
  String get grievanceCat_academic;

  /// No description provided for @grievanceCat_exam.
  ///
  /// In en, this message translates to:
  /// **'Examination'**
  String get grievanceCat_exam;

  /// No description provided for @grievanceCat_fees.
  ///
  /// In en, this message translates to:
  /// **'Fees'**
  String get grievanceCat_fees;

  /// No description provided for @grievanceCat_hostel.
  ///
  /// In en, this message translates to:
  /// **'Hostel'**
  String get grievanceCat_hostel;

  /// No description provided for @grievanceCat_transport.
  ///
  /// In en, this message translates to:
  /// **'Transport'**
  String get grievanceCat_transport;

  /// No description provided for @grievanceCat_infrastructure.
  ///
  /// In en, this message translates to:
  /// **'Infrastructure'**
  String get grievanceCat_infrastructure;

  /// No description provided for @grievanceCat_staff_conduct.
  ///
  /// In en, this message translates to:
  /// **'Staff conduct'**
  String get grievanceCat_staff_conduct;

  /// No description provided for @grievanceCat_ragging.
  ///
  /// In en, this message translates to:
  /// **'Ragging'**
  String get grievanceCat_ragging;

  /// No description provided for @grievanceCat_harassment.
  ///
  /// In en, this message translates to:
  /// **'Harassment'**
  String get grievanceCat_harassment;

  /// No description provided for @grievanceCat_other.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get grievanceCat_other;

  /// No description provided for @grievanceStatus_open.
  ///
  /// In en, this message translates to:
  /// **'Received'**
  String get grievanceStatus_open;

  /// No description provided for @grievanceStatus_assigned.
  ///
  /// In en, this message translates to:
  /// **'With a team member'**
  String get grievanceStatus_assigned;

  /// No description provided for @grievanceStatus_in_progress.
  ///
  /// In en, this message translates to:
  /// **'Being looked into'**
  String get grievanceStatus_in_progress;

  /// No description provided for @grievanceStatus_escalated.
  ///
  /// In en, this message translates to:
  /// **'Sent to a senior'**
  String get grievanceStatus_escalated;

  /// No description provided for @grievanceStatus_resolved.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get grievanceStatus_resolved;

  /// No description provided for @grievanceStatus_closed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get grievanceStatus_closed;

  /// No description provided for @grievanceStatus_reopened.
  ///
  /// In en, this message translates to:
  /// **'Reopened'**
  String get grievanceStatus_reopened;

  /// Title of the exams screen and its bottom tab.
  ///
  /// In en, this message translates to:
  /// **'Exams'**
  String get examsTitle;

  /// Section: the papers of an exam session, by date.
  ///
  /// In en, this message translates to:
  /// **'Timetable'**
  String get examTimetable;

  /// Section: published term results.
  ///
  /// In en, this message translates to:
  /// **'Results'**
  String get examResultsTitle;

  /// Empty state of the timetable.
  ///
  /// In en, this message translates to:
  /// **'No exams are scheduled yet. They appear here once the college publishes the timetable.'**
  String get noExamsScheduled;

  /// Empty state of the results.
  ///
  /// In en, this message translates to:
  /// **'No results published yet.'**
  String get noExamResults;

  /// The dates an exam session runs.
  ///
  /// In en, this message translates to:
  /// **'{from} – {to}'**
  String examDates(String from, String to);

  /// A paper's start and end time.
  ///
  /// In en, this message translates to:
  /// **'{start} – {end}'**
  String examPaperTime(String start, String end);

  /// Where the student sits.
  ///
  /// In en, this message translates to:
  /// **'{room} · Seat {seat}'**
  String examSeat(String room, int seat);

  /// A paper's maximum marks.
  ///
  /// In en, this message translates to:
  /// **'{n} marks'**
  String examMaxMarks(int n);

  /// The ticket that lets a student into the exam hall.
  ///
  /// In en, this message translates to:
  /// **'Hall ticket'**
  String get hallTicket;

  /// Button: open the hall ticket PDF.
  ///
  /// In en, this message translates to:
  /// **'Download hall ticket'**
  String get hallTicketDownload;

  /// The college is withholding the hall ticket.
  ///
  /// In en, this message translates to:
  /// **'Hall ticket withheld: {reason}'**
  String hallTicketWithheld(String reason);

  /// Withheld without a reason.
  ///
  /// In en, this message translates to:
  /// **'Hall ticket withheld. Contact the examination office.'**
  String get hallTicketWithheldNoReason;

  /// No hall ticket yet.
  ///
  /// In en, this message translates to:
  /// **'Hall ticket not issued yet.'**
  String get hallTicketNotIssued;

  /// Shown when no app can open a downloaded PDF.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open this file. Install an app that opens PDFs.'**
  String get fileOpenFailed;

  /// Semester grade point average.
  ///
  /// In en, this message translates to:
  /// **'SGPA'**
  String get sgpaLabel;

  /// Cumulative grade point average.
  ///
  /// In en, this message translates to:
  /// **'CGPA'**
  String get cgpaLabel;

  /// Headline of the results.
  ///
  /// In en, this message translates to:
  /// **'CGPA {value}'**
  String cgpaLine(String value);

  /// A term's result.
  ///
  /// In en, this message translates to:
  /// **'SGPA {value}'**
  String sgpaLine(String value);

  /// Outcome of a term.
  ///
  /// In en, this message translates to:
  /// **'Passed'**
  String get resultPass;

  /// Outcome of a term when a paper is not cleared.
  ///
  /// In en, this message translates to:
  /// **'Not cleared'**
  String get resultFail;

  /// One subject's result.
  ///
  /// In en, this message translates to:
  /// **'{percent}% · Grade {grade}'**
  String resultLine(String percent, String grade);

  /// Button on a result line.
  ///
  /// In en, this message translates to:
  /// **'Request revaluation'**
  String get revaluationRequest;

  /// Prompt in the revaluation dialog.
  ///
  /// In en, this message translates to:
  /// **'Why should this paper be re-checked?'**
  String get revaluationWhy;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Write a few words (at least 3 letters).'**
  String get revaluationNeedReason;

  /// Snackbar after requesting.
  ///
  /// In en, this message translates to:
  /// **'Request sent. The examination office will decide.'**
  String get revaluationSent;

  /// Status of a request.
  ///
  /// In en, this message translates to:
  /// **'Revaluation requested'**
  String get revaluationRequested;

  /// Status of a request.
  ///
  /// In en, this message translates to:
  /// **'Revaluation accepted'**
  String get revaluationAccepted;

  /// Status of a request.
  ///
  /// In en, this message translates to:
  /// **'Revaluation declined'**
  String get revaluationRejected;

  /// Status of a request.
  ///
  /// In en, this message translates to:
  /// **'Revaluation done'**
  String get revaluationCompleted;

  /// Label for a session that has finished.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get examDone;

  /// Bottom navigation tab: ask, syllabus, labs and code.
  ///
  /// In en, this message translates to:
  /// **'My Learning'**
  String get navMyLearning;

  /// Bottom navigation tab.
  ///
  /// In en, this message translates to:
  /// **'Exams'**
  String get navExams;

  /// Bottom navigation tab: profile and everything else.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get navMore;

  /// Line under the greeting on Home.
  ///
  /// In en, this message translates to:
  /// **'Keep learning, keep growing!'**
  String get homeSubtitle;

  /// Tooltip of the bell on Home.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTooltip;

  /// Card on Home.
  ///
  /// In en, this message translates to:
  /// **'Next class'**
  String get nextClass;

  /// Next class card with nothing to show.
  ///
  /// In en, this message translates to:
  /// **'No class coming up right now.'**
  String get nextClassNone;

  /// Next class card while a class is live.
  ///
  /// In en, this message translates to:
  /// **'{subject} is live now'**
  String nextClassLive(String subject);

  /// Next class card: the next topic in the plan.
  ///
  /// In en, this message translates to:
  /// **'Coming up in {subject}'**
  String nextClassTopic(String subject);

  /// Button on the next class card when it is live.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get watchLive;

  /// Button on the next class card.
  ///
  /// In en, this message translates to:
  /// **'View'**
  String get viewAction;

  /// Home tile label.
  ///
  /// In en, this message translates to:
  /// **'Assignments'**
  String get tilePendingAssignments;

  /// Home tile value.
  ///
  /// In en, this message translates to:
  /// **'{n} pending'**
  String tilePendingValue(int n);

  /// Home tile value when nothing is pending.
  ///
  /// In en, this message translates to:
  /// **'All done'**
  String get tileAllDone;

  /// Home tile label.
  ///
  /// In en, this message translates to:
  /// **'Upcoming exam'**
  String get tileUpcomingExam;

  /// Home tile value: days to the next paper.
  ///
  /// In en, this message translates to:
  /// **'In {n} days'**
  String tileExamDays(int n);

  /// Home tile value: an exam today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get tileExamToday;

  /// Home tile value: no exam scheduled.
  ///
  /// In en, this message translates to:
  /// **'None yet'**
  String get tileExamNone;

  /// Home tile label: days in a row the student opened the app.
  ///
  /// In en, this message translates to:
  /// **'Learning streak'**
  String get tileStreak;

  /// Home tile value.
  ///
  /// In en, this message translates to:
  /// **'{n, plural, =1{1 day} other{{n} days}}'**
  String tileStreakDays(int n);

  /// Section on Home.
  ///
  /// In en, this message translates to:
  /// **'Continue learning'**
  String get continueLearning;

  /// Continue learning card with no plan yet.
  ///
  /// In en, this message translates to:
  /// **'Ask KINETIX AI a doubt or open a topic from My Learning.'**
  String get continueLearningEmpty;

  /// Under the progress bar of Continue learning.
  ///
  /// In en, this message translates to:
  /// **'{taught} of {total} topics taught'**
  String continueProgress(int taught, int total);

  /// Heading in More for leave, bus, hostel and certificates.
  ///
  /// In en, this message translates to:
  /// **'Campus'**
  String get moreSchoolLife;

  /// Title of the form and the entry in More.
  ///
  /// In en, this message translates to:
  /// **'Apply for leave'**
  String get leaveApplyTitle;

  /// Title of the leave screen.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get leaveScreenTitle;

  /// First day of leave.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get leaveFromLabel;

  /// Last day of leave.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get leaveToLabel;

  /// Why the student needs leave.
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get leaveReasonLabel;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Write a few words (at least 3 letters).'**
  String get leaveReasonRequired;

  /// Submit button.
  ///
  /// In en, this message translates to:
  /// **'Send request'**
  String get leaveSend;

  /// After sending.
  ///
  /// In en, this message translates to:
  /// **'Request sent to your class teacher.'**
  String get leaveSentSnack;

  /// Empty state.
  ///
  /// In en, this message translates to:
  /// **'No leave applications yet.'**
  String get leaveNone;

  /// Leave status.
  ///
  /// In en, this message translates to:
  /// **'Waiting'**
  String get leaveStatusPending;

  /// Leave status.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get leaveStatusApproved;

  /// Leave status.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get leaveStatusRejected;

  /// Leave status.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get leaveStatusCancelled;

  /// Button on a waiting request.
  ///
  /// In en, this message translates to:
  /// **'Withdraw'**
  String get leaveWithdraw;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'The last day cannot be before the first day.'**
  String get leaveToBeforeFrom;

  /// Title and entry in More.
  ///
  /// In en, this message translates to:
  /// **'My bus'**
  String get busTitle;

  /// Not assigned.
  ///
  /// In en, this message translates to:
  /// **'You do not have a bus seat. Ask the transport office.'**
  String get busNone;

  /// Label.
  ///
  /// In en, this message translates to:
  /// **'Route'**
  String get busRoute;

  /// Label.
  ///
  /// In en, this message translates to:
  /// **'Your stop'**
  String get busYourStop;

  /// Label: pickup time.
  ///
  /// In en, this message translates to:
  /// **'Pickup'**
  String get busPickup;

  /// Label.
  ///
  /// In en, this message translates to:
  /// **'Vehicle'**
  String get busVehicle;

  /// Heading.
  ///
  /// In en, this message translates to:
  /// **'Stops'**
  String get busStopsHeading;

  /// Live ETA.
  ///
  /// In en, this message translates to:
  /// **'Arrives at your stop in about {n} min'**
  String busEta(int n);

  /// Live.
  ///
  /// In en, this message translates to:
  /// **'The bus has passed your stop'**
  String get busPassed;

  /// Live.
  ///
  /// In en, this message translates to:
  /// **'{n, plural, =0{At your stop} =1{1 stop away} other{{n} stops away}}'**
  String busStopsAway(int n);

  /// No live trip.
  ///
  /// In en, this message translates to:
  /// **'The bus is not on the road right now.'**
  String get busNotRunning;

  /// Title and entry in More.
  ///
  /// In en, this message translates to:
  /// **'Hostel gate pass'**
  String get gatePassTitle;

  /// Not a resident.
  ///
  /// In en, this message translates to:
  /// **'You are not in the hostel. Gate passes are for hostel residents.'**
  String get gatePassNotResident;

  /// Where the student lives.
  ///
  /// In en, this message translates to:
  /// **'{block} · Room {room}'**
  String gatePassRoom(String block, String room);

  /// Button and form title.
  ///
  /// In en, this message translates to:
  /// **'Request a gate pass'**
  String get gatePassRequest;

  /// Field.
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get gatePassReason;

  /// Field.
  ///
  /// In en, this message translates to:
  /// **'Where are you going?'**
  String get gatePassDestination;

  /// Field.
  ///
  /// In en, this message translates to:
  /// **'Back by'**
  String get gatePassBackBy;

  /// Submit.
  ///
  /// In en, this message translates to:
  /// **'Send to warden'**
  String get gatePassSend;

  /// After sending.
  ///
  /// In en, this message translates to:
  /// **'Request sent to the warden.'**
  String get gatePassSent;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Choose a return time in the future.'**
  String get gatePassBackFuture;

  /// Empty.
  ///
  /// In en, this message translates to:
  /// **'No gate passes yet.'**
  String get gatePassNone;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Waiting for the warden'**
  String get gatePassRequested;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get gatePassIssued;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Out of hostel'**
  String get gatePassOut;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get gatePassReturned;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get gatePassRejected;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get gatePassCancelled;

  /// Under a pass.
  ///
  /// In en, this message translates to:
  /// **'Back by {when}'**
  String gatePassBackLine(String when);

  /// Title and entry in More.
  ///
  /// In en, this message translates to:
  /// **'Certificates'**
  String get certificatesTitle;

  /// Button and form title.
  ///
  /// In en, this message translates to:
  /// **'Request a certificate'**
  String get certificateRequestAction;

  /// Picker label.
  ///
  /// In en, this message translates to:
  /// **'Which certificate?'**
  String get certificateChoose;

  /// Field.
  ///
  /// In en, this message translates to:
  /// **'What is it for? (optional)'**
  String get certificatePurpose;

  /// Validation.
  ///
  /// In en, this message translates to:
  /// **'Fill in this field.'**
  String get certificateRequiredField;

  /// After requesting.
  ///
  /// In en, this message translates to:
  /// **'Request sent to the office.'**
  String get certificateSent;

  /// Empty.
  ///
  /// In en, this message translates to:
  /// **'No certificates yet.'**
  String get certificateNone;

  /// No templates.
  ///
  /// In en, this message translates to:
  /// **'The college has no certificates open for request.'**
  String get certificateNoTemplates;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Waiting for the office'**
  String get certificateRequested;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Approved, being prepared'**
  String get certificateApproved;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get certificateRejected;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Ready to download'**
  String get certificateIssued;

  /// Status.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn by the college'**
  String get certificateRevoked;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Download PDF'**
  String get certificateDownload;

  /// Serial number of an issued certificate.
  ///
  /// In en, this message translates to:
  /// **'No. {serial}'**
  String certificateSerial(String serial);

  /// coursesNone
  ///
  /// In en, this message translates to:
  /// **'No courses yet. They appear here when your teachers publish them.'**
  String get coursesNone;

  /// courseModulesCount
  ///
  /// In en, this message translates to:
  /// **'{count} modules'**
  String courseModulesCount(int count);

  /// courseGradeTitle
  ///
  /// In en, this message translates to:
  /// **'Grade so far'**
  String get courseGradeTitle;

  /// courseNoGrade
  ///
  /// In en, this message translates to:
  /// **'Nothing has been graded yet.'**
  String get courseNoGrade;

  /// courseAnnouncements
  ///
  /// In en, this message translates to:
  /// **'Announcements'**
  String get courseAnnouncements;

  /// courseNoModules
  ///
  /// In en, this message translates to:
  /// **'No modules yet.'**
  String get courseNoModules;

  /// coursesTab
  ///
  /// In en, this message translates to:
  /// **'Courses'**
  String get coursesTab;

  /// scholarshipTitle
  ///
  /// In en, this message translates to:
  /// **'Scholarships'**
  String get scholarshipTitle;

  /// scholarshipNone
  ///
  /// In en, this message translates to:
  /// **'No scholarships are open right now.'**
  String get scholarshipNone;

  /// scholarshipPercentOff
  ///
  /// In en, this message translates to:
  /// **'{count}% off your fees'**
  String scholarshipPercentOff(int count);

  /// scholarshipAmountOff
  ///
  /// In en, this message translates to:
  /// **'{amount} off your fees'**
  String scholarshipAmountOff(String amount);

  /// scholarshipMinMarks
  ///
  /// In en, this message translates to:
  /// **'Needs at least {count}% in published marks'**
  String scholarshipMinMarks(int count);

  /// scholarshipMaxIncome
  ///
  /// In en, this message translates to:
  /// **'Family income up to {amount}'**
  String scholarshipMaxIncome(String amount);

  /// scholarshipApply
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get scholarshipApply;

  /// scholarshipMine
  ///
  /// In en, this message translates to:
  /// **'My applications'**
  String get scholarshipMine;

  /// scholarshipAwarded
  ///
  /// In en, this message translates to:
  /// **'{amount} taken off your fees'**
  String scholarshipAwarded(String amount);

  /// scholarshipIncomeLabel
  ///
  /// In en, this message translates to:
  /// **'Yearly family income (₹)'**
  String get scholarshipIncomeLabel;

  /// scholarshipIncomeRequired
  ///
  /// In en, this message translates to:
  /// **'Enter the family income as a number.'**
  String get scholarshipIncomeRequired;

  /// scholarshipNoteLabel
  ///
  /// In en, this message translates to:
  /// **'Anything the college should know (optional)'**
  String get scholarshipNoteLabel;

  /// scholarshipSend
  ///
  /// In en, this message translates to:
  /// **'Send application'**
  String get scholarshipSend;

  /// scholarshipSentSnack
  ///
  /// In en, this message translates to:
  /// **'Application sent to the accounts office.'**
  String get scholarshipSentSnack;

  /// No description provided for @walletTitle.
  ///
  /// In en, this message translates to:
  /// **'Hostel and canteen'**
  String get walletTitle;

  /// No description provided for @walletHostel.
  ///
  /// In en, this message translates to:
  /// **'Hostel'**
  String get walletHostel;

  /// No description provided for @walletBedLine.
  ///
  /// In en, this message translates to:
  /// **'{block}, room {room}, bed {bed}'**
  String walletBedLine(Object block, Object room, Object bed);

  /// No description provided for @walletNotInHostel.
  ///
  /// In en, this message translates to:
  /// **'You are not in the hostel'**
  String get walletNotInHostel;

  /// No description provided for @walletNights.
  ///
  /// In en, this message translates to:
  /// **'Night roll call'**
  String get walletNights;

  /// No description provided for @walletNoNights.
  ///
  /// In en, this message translates to:
  /// **'No roll calls yet'**
  String get walletNoNights;

  /// No description provided for @walletPresent.
  ///
  /// In en, this message translates to:
  /// **'Present'**
  String get walletPresent;

  /// No description provided for @walletAbsent.
  ///
  /// In en, this message translates to:
  /// **'Absent'**
  String get walletAbsent;

  /// No description provided for @walletLeave.
  ///
  /// In en, this message translates to:
  /// **'On leave'**
  String get walletLeave;

  /// No description provided for @walletCanteen.
  ///
  /// In en, this message translates to:
  /// **'Canteen wallet'**
  String get walletCanteen;

  /// No description provided for @walletBalance.
  ///
  /// In en, this message translates to:
  /// **'Balance'**
  String get walletBalance;

  /// No description provided for @walletAddMoney.
  ///
  /// In en, this message translates to:
  /// **'Add money'**
  String get walletAddMoney;

  /// No description provided for @walletAdded.
  ///
  /// In en, this message translates to:
  /// **'{amount} added to your wallet'**
  String walletAdded(Object amount);

  /// No description provided for @walletMeals.
  ///
  /// In en, this message translates to:
  /// **'Recent meals'**
  String get walletMeals;

  /// No description provided for @walletNoMeals.
  ///
  /// In en, this message translates to:
  /// **'No meals yet'**
  String get walletNoMeals;

  /// No description provided for @walletBreakfast.
  ///
  /// In en, this message translates to:
  /// **'Breakfast'**
  String get walletBreakfast;

  /// No description provided for @walletLunch.
  ///
  /// In en, this message translates to:
  /// **'Lunch'**
  String get walletLunch;

  /// No description provided for @walletSnacks.
  ///
  /// In en, this message translates to:
  /// **'Snacks'**
  String get walletSnacks;

  /// No description provided for @walletDinner.
  ///
  /// In en, this message translates to:
  /// **'Dinner'**
  String get walletDinner;

  /// No description provided for @walletEnterAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount'**
  String get walletEnterAmount;

  /// No description provided for @walletEnterRupees.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount in rupees'**
  String get walletEnterRupees;

  /// No description provided for @walletMinAmount.
  ///
  /// In en, this message translates to:
  /// **'The smallest top-up is ₹1'**
  String get walletMinAmount;

  /// No description provided for @walletStarting.
  ///
  /// In en, this message translates to:
  /// **'Starting payment…'**
  String get walletStarting;

  /// No description provided for @walletConfirming.
  ///
  /// In en, this message translates to:
  /// **'Confirming payment…'**
  String get walletConfirming;

  /// No description provided for @walletCancelled.
  ///
  /// In en, this message translates to:
  /// **'Payment cancelled'**
  String get walletCancelled;

  /// No description provided for @walletFailedTitle.
  ///
  /// In en, this message translates to:
  /// **'Payment did not go through'**
  String get walletFailedTitle;

  /// No description provided for @walletCouldNotConfirm.
  ///
  /// In en, this message translates to:
  /// **'Could not confirm the payment'**
  String get walletCouldNotConfirm;

  /// No description provided for @walletNotSetUp.
  ///
  /// In en, this message translates to:
  /// **'Online payment is not set up yet. Add money at the canteen counter.'**
  String get walletNotSetUp;

  /// No description provided for @walletPhonesOnly.
  ///
  /// In en, this message translates to:
  /// **'Online payment works on Android phones and iPhones.'**
  String get walletPhonesOnly;

  /// No description provided for @walletFailNoConfirm.
  ///
  /// In en, this message translates to:
  /// **'The payment app did not return a confirmation. If money left your account, the wallet will update shortly.'**
  String get walletFailNoConfirm;

  /// No description provided for @walletFailOpen.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open the payment screen. Try again.'**
  String get walletFailOpen;

  /// No description provided for @walletFailNetwork.
  ///
  /// In en, this message translates to:
  /// **'No internet connection. Check it and try again.'**
  String get walletFailNetwork;

  /// No description provided for @walletFailGeneric.
  ///
  /// In en, this message translates to:
  /// **'The payment did not go through. Try again.'**
  String get walletFailGeneric;

  /// No description provided for @walletFinishIn.
  ///
  /// In en, this message translates to:
  /// **'Finish in {app}'**
  String walletFinishIn(Object app);

  /// No description provided for @walletInWalletBody.
  ///
  /// In en, this message translates to:
  /// **'Complete the payment in that app. The wallet updates when it goes through.'**
  String get walletInWalletBody;

  /// No description provided for @walletDemo.
  ///
  /// In en, this message translates to:
  /// **'Demo payment'**
  String get walletDemo;

  /// No description provided for @walletDemoNoMoney.
  ///
  /// In en, this message translates to:
  /// **'Demo payment: no money moves'**
  String get walletDemoNoMoney;

  /// No description provided for @walletDemoPay.
  ///
  /// In en, this message translates to:
  /// **'Pay {amount}'**
  String walletDemoPay(Object amount);

  /// No description provided for @walletAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get walletAmount;

  /// No description provided for @courseRegTitle.
  ///
  /// In en, this message translates to:
  /// **'Course registration'**
  String get courseRegTitle;

  /// No description provided for @courseRegCredits.
  ///
  /// In en, this message translates to:
  /// **'Credits: {registered} of {max} (at least {min})'**
  String courseRegCredits(String registered, String max, String min);

  /// No description provided for @courseRegAddDropUntil.
  ///
  /// In en, this message translates to:
  /// **'You can add or drop until {when}.'**
  String courseRegAddDropUntil(String when);

  /// No description provided for @courseRegClosed.
  ///
  /// In en, this message translates to:
  /// **'Registration is not open for you right now.'**
  String get courseRegClosed;

  /// No description provided for @courseRegNoTerm.
  ///
  /// In en, this message translates to:
  /// **'There is no term to register in yet.'**
  String get courseRegNoTerm;

  /// No description provided for @courseRegNoOfferings.
  ///
  /// In en, this message translates to:
  /// **'No courses are offered this term yet.'**
  String get courseRegNoOfferings;

  /// No description provided for @courseRegMine.
  ///
  /// In en, this message translates to:
  /// **'My registrations'**
  String get courseRegMine;

  /// No description provided for @courseRegAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available courses'**
  String get courseRegAvailable;

  /// No description provided for @courseRegRegister.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get courseRegRegister;

  /// No description provided for @courseRegDrop.
  ///
  /// In en, this message translates to:
  /// **'Drop'**
  String get courseRegDrop;

  /// No description provided for @courseRegDropTitle.
  ///
  /// In en, this message translates to:
  /// **'Drop {name}?'**
  String courseRegDropTitle(String name);

  /// No description provided for @courseRegRegisteredNow.
  ///
  /// In en, this message translates to:
  /// **'You are registered.'**
  String get courseRegRegisteredNow;

  /// No description provided for @courseRegDropped.
  ///
  /// In en, this message translates to:
  /// **'The course is dropped.'**
  String get courseRegDropped;

  /// No description provided for @courseRegCore.
  ///
  /// In en, this message translates to:
  /// **'Core'**
  String get courseRegCore;

  /// No description provided for @courseRegElective.
  ///
  /// In en, this message translates to:
  /// **'Elective'**
  String get courseRegElective;

  /// No description provided for @courseRegCreditsOf.
  ///
  /// In en, this message translates to:
  /// **'{n} credits'**
  String courseRegCreditsOf(String n);

  /// No description provided for @courseRegSeatsLeft.
  ///
  /// In en, this message translates to:
  /// **'{n} seats left'**
  String courseRegSeatsLeft(String n);

  /// No description provided for @courseRegFull.
  ///
  /// In en, this message translates to:
  /// **'Full'**
  String get courseRegFull;

  /// No description provided for @courseRegRegisteredPill.
  ///
  /// In en, this message translates to:
  /// **'Registered'**
  String get courseRegRegisteredPill;

  /// No description provided for @courseRegWaitlisted.
  ///
  /// In en, this message translates to:
  /// **'Waitlisted'**
  String get courseRegWaitlisted;

  /// No description provided for @courseRegNotAllotted.
  ///
  /// In en, this message translates to:
  /// **'Not allotted'**
  String get courseRegNotAllotted;

  /// No description provided for @courseRegRanked.
  ///
  /// In en, this message translates to:
  /// **'Preference {rank}'**
  String courseRegRanked(String rank);

  /// No description provided for @courseRegApprovalPending.
  ///
  /// In en, this message translates to:
  /// **'Waiting for approval'**
  String get courseRegApprovalPending;

  /// No description provided for @courseRegApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get courseRegApproved;

  /// No description provided for @courseRegRejected.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get courseRegRejected;

  /// No description provided for @courseRegRank.
  ///
  /// In en, this message translates to:
  /// **'Rank electives'**
  String get courseRegRank;

  /// No description provided for @courseRegRankHelp.
  ///
  /// In en, this message translates to:
  /// **'Tick the electives you want and drag them into order, most wanted first. Seats in full courses go by this order.'**
  String get courseRegRankHelp;

  /// No description provided for @courseRegRankSave.
  ///
  /// In en, this message translates to:
  /// **'Save order'**
  String get courseRegRankSave;

  /// No description provided for @courseRegRankSaved.
  ///
  /// In en, this message translates to:
  /// **'Your preferences are saved.'**
  String get courseRegRankSaved;

  /// No description provided for @courseRegRankNone.
  ///
  /// In en, this message translates to:
  /// **'There are no electives to rank.'**
  String get courseRegRankNone;

  /// No description provided for @passportTitle.
  ///
  /// In en, this message translates to:
  /// **'Outcome passport'**
  String get passportTitle;

  /// No description provided for @passportVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified by the institution'**
  String get passportVerified;

  /// No description provided for @passportNotVerified.
  ///
  /// In en, this message translates to:
  /// **'Not yet verified by the institution'**
  String get passportNotVerified;

  /// No description provided for @passportSkills.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get passportSkills;

  /// No description provided for @passportNoSkills.
  ///
  /// In en, this message translates to:
  /// **'No skills recorded yet.'**
  String get passportNoSkills;

  /// No description provided for @passportLevel.
  ///
  /// In en, this message translates to:
  /// **'Level {n} of 5'**
  String passportLevel(String n);

  /// No description provided for @passportNoEvidence.
  ///
  /// In en, this message translates to:
  /// **'No evidence yet'**
  String get passportNoEvidence;

  /// No description provided for @passportCertificates.
  ///
  /// In en, this message translates to:
  /// **'Certificates'**
  String get passportCertificates;

  /// No description provided for @passportActivities.
  ///
  /// In en, this message translates to:
  /// **'Clubs and events'**
  String get passportActivities;

  /// No description provided for @passportDownload.
  ///
  /// In en, this message translates to:
  /// **'Download PDF'**
  String get passportDownload;

  /// No description provided for @surveysTitle.
  ///
  /// In en, this message translates to:
  /// **'Surveys'**
  String get surveysTitle;

  /// No description provided for @surveysNone.
  ///
  /// In en, this message translates to:
  /// **'No surveys are waiting for you.'**
  String get surveysNone;

  /// No description provided for @surveyAnonymous.
  ///
  /// In en, this message translates to:
  /// **'Your answers are anonymous.'**
  String get surveyAnonymous;

  /// No description provided for @surveySubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get surveySubmit;

  /// No description provided for @surveySent.
  ///
  /// In en, this message translates to:
  /// **'Thank you. Your answers are sent.'**
  String get surveySent;

  /// No description provided for @surveyRequired.
  ///
  /// In en, this message translates to:
  /// **'Please answer the questions marked required.'**
  String get surveyRequired;

  /// No description provided for @surveyOptional.
  ///
  /// In en, this message translates to:
  /// **'Optional'**
  String get surveyOptional;

  /// No description provided for @surveyClosesOn.
  ///
  /// In en, this message translates to:
  /// **'Closes {when}'**
  String surveyClosesOn(String when);

  /// No description provided for @surveyAnswerHint.
  ///
  /// In en, this message translates to:
  /// **'Your answer'**
  String get surveyAnswerHint;

  /// No description provided for @campusLifeTitle.
  ///
  /// In en, this message translates to:
  /// **'Clubs and events'**
  String get campusLifeTitle;

  /// No description provided for @campusTabClubs.
  ///
  /// In en, this message translates to:
  /// **'Clubs'**
  String get campusTabClubs;

  /// No description provided for @campusTabEvents.
  ///
  /// In en, this message translates to:
  /// **'Events'**
  String get campusTabEvents;

  /// No description provided for @campusTabPasses.
  ///
  /// In en, this message translates to:
  /// **'My passes'**
  String get campusTabPasses;

  /// No description provided for @clubJoin.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get clubJoin;

  /// No description provided for @clubLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get clubLeave;

  /// No description provided for @clubRequested.
  ///
  /// In en, this message translates to:
  /// **'Waiting for approval'**
  String get clubRequested;

  /// No description provided for @clubMember.
  ///
  /// In en, this message translates to:
  /// **'Member'**
  String get clubMember;

  /// No description provided for @clubPoints.
  ///
  /// In en, this message translates to:
  /// **'{n} points'**
  String clubPoints(String n);

  /// No description provided for @clubsNone.
  ///
  /// In en, this message translates to:
  /// **'There are no clubs yet.'**
  String get clubsNone;

  /// No description provided for @clubJoinSent.
  ///
  /// In en, this message translates to:
  /// **'Request sent. A coordinator will approve it.'**
  String get clubJoinSent;

  /// No description provided for @eventsNone.
  ///
  /// In en, this message translates to:
  /// **'No events are open for registration.'**
  String get eventsNone;

  /// No description provided for @eventRegister.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get eventRegister;

  /// No description provided for @eventJoinWaitlist.
  ///
  /// In en, this message translates to:
  /// **'Join waitlist'**
  String get eventJoinWaitlist;

  /// No description provided for @eventCancelRegistration.
  ///
  /// In en, this message translates to:
  /// **'Cancel registration'**
  String get eventCancelRegistration;

  /// No description provided for @eventRegisteredPill.
  ///
  /// In en, this message translates to:
  /// **'You are registered'**
  String get eventRegisteredPill;

  /// No description provided for @eventWaitlistedPill.
  ///
  /// In en, this message translates to:
  /// **'On the waitlist'**
  String get eventWaitlistedPill;

  /// No description provided for @eventSeatsLeft.
  ///
  /// In en, this message translates to:
  /// **'{n} seats left'**
  String eventSeatsLeft(String n);

  /// No description provided for @eventFee.
  ///
  /// In en, this message translates to:
  /// **'Fee {amount}'**
  String eventFee(String amount);

  /// No description provided for @eventFree.
  ///
  /// In en, this message translates to:
  /// **'Free'**
  String get eventFree;

  /// No description provided for @passNone.
  ///
  /// In en, this message translates to:
  /// **'You have not registered for any event.'**
  String get passNone;

  /// No description provided for @passShowAtDoor.
  ///
  /// In en, this message translates to:
  /// **'Show this code at the door'**
  String get passShowAtDoor;

  /// No description provided for @passCheckedIn.
  ///
  /// In en, this message translates to:
  /// **'Checked in'**
  String get passCheckedIn;

  /// No description provided for @passFeedback.
  ///
  /// In en, this message translates to:
  /// **'Give feedback'**
  String get passFeedback;

  /// No description provided for @passFeedbackDone.
  ///
  /// In en, this message translates to:
  /// **'Feedback sent'**
  String get passFeedbackDone;

  /// No description provided for @passFeedbackTitle.
  ///
  /// In en, this message translates to:
  /// **'How was it?'**
  String get passFeedbackTitle;

  /// No description provided for @passFeedbackComment.
  ///
  /// In en, this message translates to:
  /// **'Comment (optional)'**
  String get passFeedbackComment;

  /// No description provided for @passFeedbackSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get passFeedbackSend;

  /// No description provided for @passFeedbackThanks.
  ///
  /// In en, this message translates to:
  /// **'Thank you for your feedback.'**
  String get passFeedbackThanks;

  /// No description provided for @classNotesTitle.
  ///
  /// In en, this message translates to:
  /// **'Class notes & recaps'**
  String get classNotesTitle;

  /// No description provided for @classNotesRecaps.
  ///
  /// In en, this message translates to:
  /// **'Lesson recaps'**
  String get classNotesRecaps;

  /// No description provided for @classNotesBoards.
  ///
  /// In en, this message translates to:
  /// **'Whiteboards'**
  String get classNotesBoards;

  /// No description provided for @classNotesEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing has been shared with your class yet.'**
  String get classNotesEmpty;

  /// No description provided for @classNotesNoRecap.
  ///
  /// In en, this message translates to:
  /// **'The recap for this lesson is not ready yet.'**
  String get classNotesNoRecap;

  /// No description provided for @classNotesKeyPoints.
  ///
  /// In en, this message translates to:
  /// **'Key points'**
  String get classNotesKeyPoints;

  /// No description provided for @classNotesWatch.
  ///
  /// In en, this message translates to:
  /// **'Watch the lesson'**
  String get classNotesWatch;

  /// No description provided for @attendanceEnterCode.
  ///
  /// In en, this message translates to:
  /// **'Mark yourself present'**
  String get attendanceEnterCode;

  /// No description provided for @attendanceCodeHint.
  ///
  /// In en, this message translates to:
  /// **'Code on the teacher\'s screen'**
  String get attendanceCodeHint;

  /// No description provided for @attendanceCodeSubmit.
  ///
  /// In en, this message translates to:
  /// **'Mark me present'**
  String get attendanceCodeSubmit;

  /// No description provided for @attendanceMarkedPresent.
  ///
  /// In en, this message translates to:
  /// **'You are marked present.'**
  String get attendanceMarkedPresent;

  /// No description provided for @attendanceAlreadyMarked.
  ///
  /// In en, this message translates to:
  /// **'Your attendance for this period was already recorded.'**
  String get attendanceAlreadyMarked;

  /// No description provided for @dpdpTitle.
  ///
  /// In en, this message translates to:
  /// **'My data rights'**
  String get dpdpTitle;

  /// No description provided for @dpdpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Download, correct or erase your data'**
  String get dpdpSubtitle;

  /// No description provided for @dpdpOfficerTitle.
  ///
  /// In en, this message translates to:
  /// **'Grievance officer'**
  String get dpdpOfficerTitle;

  /// No description provided for @dpdpOfficerNone.
  ///
  /// In en, this message translates to:
  /// **'No grievance officer is named yet. Write to the school office.'**
  String get dpdpOfficerNone;

  /// No description provided for @dpdpExportTitle.
  ///
  /// In en, this message translates to:
  /// **'Download my data'**
  String get dpdpExportTitle;

  /// No description provided for @dpdpExportBody.
  ///
  /// In en, this message translates to:
  /// **'See everything the school holds about you.'**
  String get dpdpExportBody;

  /// No description provided for @dpdpExportAction.
  ///
  /// In en, this message translates to:
  /// **'Show summary'**
  String get dpdpExportAction;

  /// No description provided for @dpdpExportPdf.
  ///
  /// In en, this message translates to:
  /// **'Open as PDF'**
  String get dpdpExportPdf;

  /// No description provided for @dpdpRecords.
  ///
  /// In en, this message translates to:
  /// **'records'**
  String get dpdpRecords;

  /// No description provided for @dpdpCorrectTitle.
  ///
  /// In en, this message translates to:
  /// **'Correct my details'**
  String get dpdpCorrectTitle;

  /// No description provided for @dpdpField.
  ///
  /// In en, this message translates to:
  /// **'Detail to correct'**
  String get dpdpField;

  /// No description provided for @dpdpFieldName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get dpdpFieldName;

  /// No description provided for @dpdpFieldEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get dpdpFieldEmail;

  /// No description provided for @dpdpFieldPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get dpdpFieldPhone;

  /// No description provided for @dpdpNewValue.
  ///
  /// In en, this message translates to:
  /// **'Correct value'**
  String get dpdpNewValue;

  /// No description provided for @dpdpCorrectSend.
  ///
  /// In en, this message translates to:
  /// **'Send correction request'**
  String get dpdpCorrectSend;

  /// No description provided for @dpdpNeedValue.
  ///
  /// In en, this message translates to:
  /// **'Enter the correct value.'**
  String get dpdpNeedValue;

  /// No description provided for @dpdpEraseTitle.
  ///
  /// In en, this message translates to:
  /// **'Ask for erasure'**
  String get dpdpEraseTitle;

  /// No description provided for @dpdpEraseBody.
  ///
  /// In en, this message translates to:
  /// **'The school must keep some records by law. We tell you what can and cannot be erased.'**
  String get dpdpEraseBody;

  /// No description provided for @dpdpEraseDetails.
  ///
  /// In en, this message translates to:
  /// **'Why do you want this? (optional)'**
  String get dpdpEraseDetails;

  /// No description provided for @dpdpEraseSend.
  ///
  /// In en, this message translates to:
  /// **'Request erasure'**
  String get dpdpEraseSend;

  /// No description provided for @dpdpEraseConfirm.
  ///
  /// In en, this message translates to:
  /// **'Ask the school to erase your data? Records it must keep by law will stay.'**
  String get dpdpEraseConfirm;

  /// No description provided for @dpdpRequestSent.
  ///
  /// In en, this message translates to:
  /// **'Request sent. The grievance officer replies within 30 days.'**
  String get dpdpRequestSent;

  /// No description provided for @dpdpRetentionNotice.
  ///
  /// In en, this message translates to:
  /// **'These records must be kept by law:'**
  String get dpdpRetentionNotice;

  /// No description provided for @dpdpRequestsTitle.
  ///
  /// In en, this message translates to:
  /// **'My requests'**
  String get dpdpRequestsTitle;

  /// No description provided for @dpdpRequestsNone.
  ///
  /// In en, this message translates to:
  /// **'No requests yet.'**
  String get dpdpRequestsNone;

  /// No description provided for @dpdpKindCorrection.
  ///
  /// In en, this message translates to:
  /// **'Correction'**
  String get dpdpKindCorrection;

  /// No description provided for @dpdpKindErasure.
  ///
  /// In en, this message translates to:
  /// **'Erasure'**
  String get dpdpKindErasure;

  /// No description provided for @dpdpStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get dpdpStatusPending;

  /// No description provided for @dpdpStatusDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get dpdpStatusDone;

  /// No description provided for @dpdpStatusDeclined.
  ///
  /// In en, this message translates to:
  /// **'Declined'**
  String get dpdpStatusDeclined;

  /// No description provided for @dpdpStatusBlocked.
  ///
  /// In en, this message translates to:
  /// **'Kept by law'**
  String get dpdpStatusBlocked;

  /// No description provided for @houseTitle.
  ///
  /// In en, this message translates to:
  /// **'My house'**
  String get houseTitle;

  /// No description provided for @houseSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your house points and the leaderboard'**
  String get houseSubtitle;

  /// No description provided for @houseNone.
  ///
  /// In en, this message translates to:
  /// **'You have not been placed in a house yet.'**
  String get houseNone;

  /// No description provided for @houseRank.
  ///
  /// In en, this message translates to:
  /// **'Rank'**
  String get houseRank;

  /// No description provided for @housePointsLabel.
  ///
  /// In en, this message translates to:
  /// **'points'**
  String get housePointsLabel;

  /// No description provided for @houseMyPoints.
  ///
  /// In en, this message translates to:
  /// **'My points'**
  String get houseMyPoints;

  /// No description provided for @houseCaptain.
  ///
  /// In en, this message translates to:
  /// **'Captain'**
  String get houseCaptain;

  /// No description provided for @houseRecent.
  ///
  /// In en, this message translates to:
  /// **'Recent points'**
  String get houseRecent;

  /// No description provided for @houseLeaderboard.
  ///
  /// In en, this message translates to:
  /// **'Leaderboard'**
  String get houseLeaderboard;

  /// No description provided for @houseMembers.
  ///
  /// In en, this message translates to:
  /// **'members'**
  String get houseMembers;

  /// No description provided for @houseCatGeneral.
  ///
  /// In en, this message translates to:
  /// **'General'**
  String get houseCatGeneral;

  /// No description provided for @houseCatAcademics.
  ///
  /// In en, this message translates to:
  /// **'Academics'**
  String get houseCatAcademics;

  /// No description provided for @houseCatSports.
  ///
  /// In en, this message translates to:
  /// **'Sports'**
  String get houseCatSports;

  /// No description provided for @houseCatArts.
  ///
  /// In en, this message translates to:
  /// **'Arts'**
  String get houseCatArts;

  /// No description provided for @houseCatDiscipline.
  ///
  /// In en, this message translates to:
  /// **'Discipline'**
  String get houseCatDiscipline;

  /// No description provided for @houseCatService.
  ///
  /// In en, this message translates to:
  /// **'Service'**
  String get houseCatService;

  /// No description provided for @peerTitle.
  ///
  /// In en, this message translates to:
  /// **'Peer review'**
  String get peerTitle;

  /// No description provided for @peerOpen.
  ///
  /// In en, this message translates to:
  /// **'Review classmates\' work'**
  String get peerOpen;

  /// No description provided for @peerToReview.
  ///
  /// In en, this message translates to:
  /// **'To review'**
  String get peerToReview;

  /// No description provided for @peerMyFeedback.
  ///
  /// In en, this message translates to:
  /// **'My feedback'**
  String get peerMyFeedback;

  /// No description provided for @peerNone.
  ///
  /// In en, this message translates to:
  /// **'No work has been given to you to review yet.'**
  String get peerNone;

  /// No description provided for @peerAnonymous.
  ///
  /// In en, this message translates to:
  /// **'Names are hidden: you do not know who wrote the work, and they do not know who reviewed it.'**
  String get peerAnonymous;

  /// No description provided for @peerWork.
  ///
  /// In en, this message translates to:
  /// **'Work'**
  String get peerWork;

  /// No description provided for @peerNoText.
  ///
  /// In en, this message translates to:
  /// **'(a photo or file only)'**
  String get peerNoText;

  /// No description provided for @peerFiles.
  ///
  /// In en, this message translates to:
  /// **'Photos and files'**
  String get peerFiles;

  /// No description provided for @peerClarity.
  ///
  /// In en, this message translates to:
  /// **'Clarity'**
  String get peerClarity;

  /// No description provided for @peerAccuracy.
  ///
  /// In en, this message translates to:
  /// **'Accuracy'**
  String get peerAccuracy;

  /// No description provided for @peerEffort.
  ///
  /// In en, this message translates to:
  /// **'Effort'**
  String get peerEffort;

  /// No description provided for @peerComment.
  ///
  /// In en, this message translates to:
  /// **'Your comment'**
  String get peerComment;

  /// No description provided for @peerSave.
  ///
  /// In en, this message translates to:
  /// **'Save review'**
  String get peerSave;

  /// No description provided for @peerSaved.
  ///
  /// In en, this message translates to:
  /// **'Review saved.'**
  String get peerSaved;

  /// No description provided for @peerNeedAll.
  ///
  /// In en, this message translates to:
  /// **'Give a score for each and write a comment.'**
  String get peerNeedAll;

  /// No description provided for @peerAverage.
  ///
  /// In en, this message translates to:
  /// **'Average score (out of 15)'**
  String get peerAverage;

  /// No description provided for @peerPending.
  ///
  /// In en, this message translates to:
  /// **'Reviews still to come'**
  String get peerPending;

  /// No description provided for @peerNoFeedback.
  ///
  /// In en, this message translates to:
  /// **'No classmate has reviewed your work yet.'**
  String get peerNoFeedback;
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

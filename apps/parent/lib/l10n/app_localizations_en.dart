// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get today => 'Today';

  @override
  String get tomorrow => 'Tomorrow';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get dueToday => 'Due today';

  @override
  String get dueTomorrow => 'Due tomorrow';

  @override
  String dueOn(Object date) {
    return 'Due $date';
  }

  @override
  String wasDue(Object date) {
    return 'Was due $date';
  }

  @override
  String overdueBy(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days days', one: '1 day');
    return 'Overdue by $_temp0';
  }

  @override
  String get bookDueToday => 'Due today';

  @override
  String get bookDueTomorrow => 'Due tomorrow';

  @override
  String bookDueOn(Object date) {
    return 'Due $date';
  }

  @override
  String get greetingMorning => 'Good morning';

  @override
  String get greetingAfternoon => 'Good afternoon';

  @override
  String get greetingEvening => 'Good evening';

  @override
  String greetingName(Object greeting, Object name) {
    return '$greeting, $name';
  }

  @override
  String dateTime(Object date, Object time) {
    return '$date, $time';
  }

  @override
  String get listSeparator => ', ';

  @override
  String listAnd(Object items, Object last) {
    return '$items and $last';
  }

  @override
  String get retry => 'Retry';

  @override
  String get soon => 'Soon';

  @override
  String get comingSoon => 'Coming soon';

  @override
  String comingLater(Object feature) {
    return '$feature is coming in a later update';
  }

  @override
  String get statusPresent => 'Present';

  @override
  String get statusAbsent => 'Absent';

  @override
  String get statusLate => 'Late';

  @override
  String get statusExcused => 'Excused';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get send => 'Send';

  @override
  String get share => 'Share';

  @override
  String get close => 'Close';

  @override
  String get done => 'Done';

  @override
  String get seeAll => 'See all';

  @override
  String pages(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count pages', one: '1 page');
    return '$_temp0';
  }

  @override
  String lastDays(Object days) {
    return 'Last $days days';
  }

  @override
  String rollNo(Object rollNo) {
    return 'Roll no. $rollNo';
  }

  @override
  String get errTimeout => 'The server is taking too long to respond. Try again.';

  @override
  String get errUnreachable => 'Can\'t reach KINETIX. Check your internet connection and the server address.';

  @override
  String get errForbidden => 'You don\'t have access to this.';

  @override
  String get errNotFound => 'Not found.';

  @override
  String get errTooMany => 'Too many attempts. Wait a minute and try again.';

  @override
  String errGeneric(Object status) {
    return 'Something went wrong ($status). Try again.';
  }

  @override
  String get errWrongLogin => 'Wrong institution, login or password';

  @override
  String get signIn => 'Sign in';

  @override
  String get signOut => 'Sign out';

  @override
  String get signOutQuestion => 'Sign out?';

  @override
  String get signOutBody => 'You will need your password to sign in again.';

  @override
  String get institutionCode => 'Institution code';

  @override
  String get institutionCodeHint => 'e.g. demo-college';

  @override
  String get password => 'Password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get serverAddress => 'Server address';

  @override
  String serverLabel(Object server) {
    return 'Server: $server';
  }

  @override
  String get enterInstitutionCode => 'Enter your institution code';

  @override
  String get institutionCodeChars => 'Use letters, numbers and hyphens only';

  @override
  String get enterValidEmail => 'Enter a valid email address';

  @override
  String get enterValidPhone => 'Enter a 10-digit phone number or a valid email';

  @override
  String get enterPassword => 'Enter your password';

  @override
  String get enterServer => 'Enter a server address like https://api.kinetix.in';

  @override
  String get language => 'Language';

  @override
  String get languageHelp => 'Used for the app and for updates sent to you';

  @override
  String get chooseLanguage => 'Choose language';

  @override
  String get profile => 'Profile';

  @override
  String get account => 'Account';

  @override
  String get server => 'Server';

  @override
  String get settings => 'Settings';

  @override
  String get navHome => 'Home';

  @override
  String get navMessages => 'Messages';

  @override
  String get navUpdates => 'Updates';

  @override
  String get navProfile => 'Profile';

  @override
  String get attendance => 'Attendance';

  @override
  String get homework => 'Homework';

  @override
  String sectionLastDays(Object section, Object days) {
    return '$section · last $days days';
  }

  @override
  String get allClasses => 'All classes';

  @override
  String get absentOrLate => 'Absent or late';

  @override
  String noAttendanceTaken(Object days) {
    return 'No attendance has been taken in the last $days days.';
  }

  @override
  String get attendedAll => 'Attended all';

  @override
  String attendedNofM(Object attended, Object total) {
    return 'Attended $attended of $total';
  }

  @override
  String get wholeDay => 'Whole day';

  @override
  String get instructions => 'Instructions';

  @override
  String get noInstructions => 'No instructions were added.';

  @override
  String get factDue => 'Due';

  @override
  String get setBy => 'Set by';

  @override
  String get givenOn => 'Given on';

  @override
  String get library => 'Library';

  @override
  String nOut(Object count) {
    return '$count out';
  }

  @override
  String get seeLibraryHistory => 'See library history';

  @override
  String booksOverdue(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count books overdue. Please return them to the library.',
      one: '1 book overdue. Please return it to the library.',
    );
    return '$_temp0';
  }

  @override
  String andMore(Object count) {
    return 'and $count more';
  }

  @override
  String finesForLate(Object amount) {
    return 'Fines for late returns: $amount';
  }

  @override
  String finesPayAtDesk(Object amount) {
    return 'Fines for late returns: $amount. Pay at the library desk.';
  }

  @override
  String borrowedOn(Object date) {
    return 'Borrowed $date';
  }

  @override
  String returnedOn(Object date) {
    return 'returned $date';
  }

  @override
  String fineAmount(Object amount) {
    return 'fine $amount';
  }

  @override
  String get returnedLate => 'late';

  @override
  String fineSoFar(Object amount) {
    return '$amount fine so far';
  }

  @override
  String booksOutHeading(Object count) {
    return 'Books out ($count)';
  }

  @override
  String get noBooksOut => 'No books out right now.';

  @override
  String get fineRule => 'The library charges a fine for each day a book is returned late.';

  @override
  String returnedHeading(Object count) {
    return 'Returned ($count)';
  }

  @override
  String get returnedEmpty => 'Returned books will be listed here.';

  @override
  String get libraryBooks => 'Library books';

  @override
  String get results => 'Results';

  @override
  String get aboveAverage => 'Above class average';

  @override
  String get atAverage => 'At class average';

  @override
  String get belowAverage => 'Below class average';

  @override
  String get notEntered => 'Not entered';

  @override
  String get publishedMarks => 'Published marks';

  @override
  String get seeAllResults => 'See all results';

  @override
  String get bySubject => 'By subject';

  @override
  String classAverageValue(Object value) {
    return 'Class average $value';
  }

  @override
  String get marksExplainer => 'Marks scored out of the total, across published assessments.';

  @override
  String get assessments => 'Assessments';

  @override
  String get classAverage => 'Class average';

  @override
  String get highestInClass => 'Highest in class';

  @override
  String outOf(Object max) {
    return 'out of $max';
  }

  @override
  String get teachersRemark => 'Teacher\'s remark';

  @override
  String get kindTest => 'Test';

  @override
  String get kindAssignment => 'Assignment';

  @override
  String get kindInternal => 'Internal assessment';

  @override
  String get kindExam => 'Exam';

  @override
  String get kindPractical => 'Practical';

  @override
  String get lessonRecordings => 'Lesson recordings';

  @override
  String nMissed(Object count) {
    return '$count missed';
  }

  @override
  String seeAllRecordings(Object count) {
    return 'See all $count recordings';
  }

  @override
  String get recordingNotShared => 'This recording is no longer shared with the class.';

  @override
  String get classBoard => 'Class board';

  @override
  String get previousPage => 'Previous page';

  @override
  String get nextPage => 'Next page';

  @override
  String pageOf(Object page, Object total) {
    return 'Page $page of $total';
  }

  @override
  String get zoomOut => 'Double-tap to zoom out';

  @override
  String get zoomSideways => 'Pinch to zoom, or turn your phone sideways';

  @override
  String get zoomHint => 'Pinch or double-tap to zoom';

  @override
  String get fees => 'Fees';

  @override
  String get allFeesPaid => 'All fees paid';

  @override
  String lastPaid(Object amount) {
    return 'Last paid $amount';
  }

  @override
  String get dueSuffix => 'due';

  @override
  String feesToPay(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count fees to pay', one: '1 fee to pay');
    return '$_temp0';
  }

  @override
  String nOverdue(Object count) {
    return '$count overdue';
  }

  @override
  String get viewFees => 'View fees';

  @override
  String get viewFeesReceipts => 'View fees and receipts';

  @override
  String get payAtCounter => 'Please pay at the fees counter.';

  @override
  String get ok => 'OK';

  @override
  String get feesNothingDue => 'Nothing due';

  @override
  String get totalDue => 'Total due';

  @override
  String get toPay => 'To pay';

  @override
  String get paidHeader => 'Paid';

  @override
  String paidLine(Object amount, Object date) {
    return '$amount · was due $date';
  }

  @override
  String get paidPill => 'Paid';

  @override
  String get paymentsReceipts => 'Payments and receipts';

  @override
  String get feeLabel => 'Fee';

  @override
  String overdueWasDue(Object date) {
    return 'Overdue · was due $date';
  }

  @override
  String paidOfLeft(Object paid, Object total, Object left) {
    return '$paid of $total paid · $left left';
  }

  @override
  String get receiptNotFound => 'This receipt was not found.';

  @override
  String get receiptCopied => 'Receipt copied. Paste it into a message or email.';

  @override
  String get receipt => 'Receipt';

  @override
  String get copyReceipt => 'Copy receipt';

  @override
  String get feeReceipt => 'Fee receipt';

  @override
  String get receiptNoLabel => 'Receipt no.';

  @override
  String get dateLabel => 'Date';

  @override
  String get studentLabel => 'Student';

  @override
  String get classLabel => 'Class';

  @override
  String get paidBy => 'Paid by';

  @override
  String get reference => 'Reference';

  @override
  String get amountPaid => 'Amount paid';

  @override
  String get balanceLeft => 'Balance left';

  @override
  String get nilFullyPaid => 'Nil · fully paid';

  @override
  String get demoNoMoneyMoved => 'Demo payment: no money moved.';

  @override
  String get demoNoMoney => 'Demo payment: no money moves';

  @override
  String get methodOnline => 'Online';

  @override
  String get methodCash => 'Cash';

  @override
  String get methodCheque => 'Cheque';

  @override
  String get methodBankTransfer => 'Bank transfer';

  @override
  String get methodPayment => 'Payment';

  @override
  String get newMessage => 'New message';

  @override
  String aboutName(Object name) {
    return 'About $name';
  }

  @override
  String get noMessagesYet => 'No messages yet';

  @override
  String couldNotSend(Object reason) {
    return 'Couldn\'t send: $reason';
  }

  @override
  String get message => 'Message';

  @override
  String get pullForEarlier => 'Pull down for earlier messages';

  @override
  String get teachersReply => 'Teachers reply when they can, usually during college hours.';

  @override
  String get messageCopied => 'Message copied';

  @override
  String get teacher => 'Teacher';

  @override
  String get markAllRead => 'Mark all as read';

  @override
  String get earlier => 'Earlier';

  @override
  String get fromCollege => 'Message from the college';

  @override
  String get update => 'Update';

  @override
  String get attendanceGood => 'Good attendance. Keep it up.';

  @override
  String get seeAttendanceHistory => 'See attendance history';

  @override
  String attendedOf(Object attended, int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count classes', one: '1 class');
    return 'Attended $attended of $_temp0';
  }

  @override
  String excusedNote(Object count) {
    return '$count excused (counted as attended)';
  }

  @override
  String get recentAbsences => 'Recent absences';

  @override
  String dueCount(Object count) {
    return '$count due';
  }

  @override
  String pastHomework(Object count) {
    return 'Past homework ($count)';
  }

  @override
  String get classBoards => 'Class boards';

  @override
  String todaysBoard(Object subject) {
    return 'Today\'s board: $subject';
  }

  @override
  String get resultsSubtitle => 'Published marks and class averages';

  @override
  String get librarySubtitle => 'Books borrowed, due dates and fines';

  @override
  String get college => 'College';

  @override
  String get resultsLibraryHeader => 'Results & library';

  @override
  String get feesAndReceipts => 'Fees and receipts';

  @override
  String get tryAgain => 'Try again';

  @override
  String get signInHint => 'Use the phone number or email you gave your child\'s college';

  @override
  String get errNotGuardian => 'This app is for parents and guardians. Ask your institution to link your account to your child.';

  @override
  String get errTeacherAccount => 'This app is for parents and guardians. Teachers can use the KINETIX Teacher app.';

  @override
  String homeSubtitle(Object name) {
    return 'Here\'s how $name is doing';
  }

  @override
  String get noChildrenLinked => 'No children are linked to your account yet.\nAsk your child\'s college to add you as their parent.';

  @override
  String get attendanceFewMissed => 'Missed a few classes recently.';

  @override
  String get attendanceBelow75 => 'Below 75%. Colleges usually need 75% to sit exams.';

  @override
  String noAttendanceFor(Object name, Object days) {
    return 'No attendance has been taken for $name in the last $days days.';
  }

  @override
  String get nothingDue => 'Nothing due right now. New homework from teachers will show here.';

  @override
  String get inClass => 'In class';

  @override
  String inClassIntro(Object name) {
    return 'Answers when the teacher picked $name to answer a question in class.';
  }

  @override
  String notPickedYet(Object name) {
    return '$name was not picked to answer in class yet.';
  }

  @override
  String get legendCorrect => 'Correct';

  @override
  String get legendPartly => 'Partly correct';

  @override
  String get legendNotCorrect => 'Not correct';

  @override
  String get legendNoAnswer => 'No answer';

  @override
  String askedNoAnswer(int count, Object subject) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count questions', one: '1 question');
    return 'Was asked $_temp0 in $subject but did not answer.';
  }

  @override
  String answeredOneCorrectly(Object subject) {
    return 'Answered 1 question in $subject correctly.';
  }

  @override
  String answeredAllCorrect(Object count, Object subject) {
    return 'Answered $count questions in $subject, all correct.';
  }

  @override
  String answeredDetail(int count, Object subject, Object detail) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count questions', one: '1 question');
    return 'Answered $_temp0 in $subject, $detail.';
  }

  @override
  String nCorrect(Object count) {
    return '$count correct';
  }

  @override
  String nPartly(Object count) {
    return '$count partly correct';
  }

  @override
  String nNotCorrect(Object count) {
    return '$count not correct';
  }

  @override
  String didNotAnswer(Object count) {
    return 'Did not answer $count.';
  }

  @override
  String boardsEmpty(Object name) {
    return 'When a teacher shares the class board after a lesson, it appears here so $name can revise.';
  }

  @override
  String childAttendance(Object name) {
    return '$name\'s attendance';
  }

  @override
  String notMissedAny(Object name, Object days) {
    return '$name has not missed a class in the last $days days.';
  }

  @override
  String get homeworkFor => 'For';

  @override
  String get yourChild => 'Your child';

  @override
  String get yourChildren => 'Your children';

  @override
  String get shownOnHome => 'Shown on Home';

  @override
  String get noChildrenYet => 'No children are linked yet. Ask your child\'s college.';

  @override
  String get feesReceiptsHeader => 'Fees & receipts';

  @override
  String childFees(Object name) {
    return '$name\'s fees';
  }

  @override
  String get feesSubtitle => 'Dues, payments and receipts';

  @override
  String childResults(Object name) {
    return '$name\'s results';
  }

  @override
  String childLibraryBooks(Object name) {
    return '$name\'s library books';
  }

  @override
  String noBooksBorrowed(Object name) {
    return 'No library books borrowed. Books $name borrows from the college library show here with their due dates.';
  }

  @override
  String noBooksOutNow(Object name) {
    return '$name has no library books out right now.';
  }

  @override
  String childLibrary(Object name) {
    return '$name\'s library';
  }

  @override
  String markedAbsentFor(Object name, Object kind) {
    return '$name was marked absent for this $kind.';
  }

  @override
  String noMarksCard(Object name) {
    return 'No marks published yet. When $name\'s teachers publish test or exam marks, they show here with the class average.';
  }

  @override
  String noMarksScreen(Object name) {
    return 'No marks published yet.\nWhen $name\'s teachers publish marks, they show here.';
  }

  @override
  String recordingsEmpty(Object name) {
    return 'When a teacher records a lesson on the board and shares it, it appears here so $name can watch it again.';
  }

  @override
  String get missedThisClass => 'Missed this class';

  @override
  String childLessons(Object name) {
    return '$name\'s lessons';
  }

  @override
  String get noRecordingsShared => 'No lesson recordings have been shared with the class yet.';

  @override
  String get boardNotShared => 'This board is no longer shared with the class.';

  @override
  String noFeesIssued(Object name) {
    return 'No fees have been issued for $name yet.';
  }

  @override
  String noFeesIssuedLong(Object name) {
    return 'No fees have been issued for $name yet.\nNew fees from the college will show here.';
  }

  @override
  String get pay => 'Pay';

  @override
  String get payNow => 'Pay now';

  @override
  String get startingPayment => 'Starting payment…';

  @override
  String get confirmingPayment => 'Confirming payment…';

  @override
  String get paymentCancelled => 'Payment cancelled. Nothing was paid.';

  @override
  String get paymentFailedTitle => 'Payment didn\'t go through';

  @override
  String finishInWallet(Object wallet) {
    return 'Finish paying in $wallet';
  }

  @override
  String walletBody(Object wallet) {
    return 'When $wallet confirms the payment, the fee updates here and the receipt arrives in Updates.';
  }

  @override
  String get yourWalletApp => 'your wallet app';

  @override
  String get couldNotConfirmTitle => 'We couldn\'t confirm this payment';

  @override
  String couldNotConfirmBody(Object reason) {
    return '$reason If money left your account, the college will get the confirmation from the payment gateway and this fee will update shortly. Otherwise, try again.';
  }

  @override
  String get onlineNotAvailableTitle => 'Online payment is not available';

  @override
  String get enterAmount => 'Enter an amount';

  @override
  String get enterAmountRupees => 'Enter an amount in rupees, like 2500 or 2500.50';

  @override
  String get smallestPayment => 'The smallest payment is ₹1';

  @override
  String moreThanDue(Object amount) {
    return 'That is more than the $amount due';
  }

  @override
  String payTitle(Object title) {
    return 'Pay $title';
  }

  @override
  String amountDue(Object amount) {
    return '$amount due';
  }

  @override
  String fullAmount(Object amount) {
    return 'Full $amount';
  }

  @override
  String get partAmount => 'Part amount';

  @override
  String get amount => 'Amount';

  @override
  String amountRange(Object amount) {
    return 'Between ₹1 and $amount';
  }

  @override
  String payAmount(Object amount) {
    return 'Pay $amount';
  }

  @override
  String get paymentNotSetUp => 'Online payment isn\'t set up by the college yet. Please pay at the fees counter.';

  @override
  String get paymentPhonesOnly =>
      'Online payment works in the KINETIX Parent app on Android phones and iPhones. On this device, please pay at the fees counter.';

  @override
  String get demoPayment => 'Demo payment';

  @override
  String get demoTo => 'To';

  @override
  String get demoFor => 'For';

  @override
  String get demoOrder => 'Order';

  @override
  String demoPayAmount(Object amount) {
    return 'Pay $amount (demo)';
  }

  @override
  String get failNoConfirmation =>
      'The payment app did not return a confirmation. If money left your account, the fee will update shortly.';

  @override
  String get failCouldNotOpen => 'Couldn\'t open the payment screen. Try again.';

  @override
  String get failNetwork => 'No internet connection. Check it and try again.';

  @override
  String get failGeneric => 'The payment did not go through. Try again.';

  @override
  String get paymentSuccessful => 'Payment successful';

  @override
  String paidFor(Object amount, Object name) {
    return '$amount paid for $name';
  }

  @override
  String writeToAbout(Object teacher, Object name) {
    return 'Write to $teacher about $name.';
  }

  @override
  String noMessagesOneChild(Object name) {
    return 'No messages yet.\nWrite to $name\'s teachers about homework, absences or progress.';
  }

  @override
  String get noMessagesChildren => 'No messages yet.\nWrite to your children\'s teachers about homework, absences or progress.';

  @override
  String get noChildrenLinkedShort => 'No children are linked to your account yet.\nAsk your child\'s college.';

  @override
  String get aboutHeader => 'About';

  @override
  String childTeachers(Object name) {
    return '$name\'s teachers';
  }

  @override
  String noTeachersOnTimetable(Object name) {
    return 'No teachers are on $name\'s timetable yet.';
  }

  @override
  String get noUpdates => 'No updates yet.\nAbsences, homework and messages from the college will appear here.';

  @override
  String get phoneOrEmail => 'Phone or email';

  @override
  String get enterPhoneOrEmail => 'Enter your phone number or email';

  @override
  String get errAccountInactive => 'Your account is not active. Ask your institution\'s office.';

  @override
  String get errSignInAgain => 'Your sign-in has expired. Please sign in again.';

  @override
  String get errTooLarge => 'A file is too big. Each photo or PDF can be up to 8 MB.';

  @override
  String get errConflict => 'This was changed in the meantime. Refresh and try again.';

  @override
  String get errSubjectNotInClass => 'That subject is not taught in this class.';

  @override
  String get errSubmissionEmpty => 'Write an answer or add a photo.';

  @override
  String get errSubmissionChecked => 'This homework has already been checked.';

  @override
  String get errSubmissionStudentOnly => 'This student hands in their own homework from their own login.';

  @override
  String get calendar => 'Calendar';

  @override
  String get calendarSubtitle => 'Holidays, exams and events';

  @override
  String get upcoming => 'Coming up';

  @override
  String get seeCalendar => 'See the full calendar';

  @override
  String get calendarEmpty => 'No holidays, exams or events in the coming months.';

  @override
  String get kindHoliday => 'Holiday';

  @override
  String get kindExams => 'Exams';

  @override
  String get kindEvent => 'Event';

  @override
  String inDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'In $count days', one: 'In 1 day');
    return '$_temp0';
  }

  @override
  String forPrograms(String programs) {
    return 'For $programs';
  }

  @override
  String holidayToday(String title) {
    return 'Holiday today: $title';
  }

  @override
  String holidayTomorrow(String title) {
    return 'Holiday tomorrow: $title';
  }

  @override
  String get noClasses => 'No classes.';

  @override
  String noClassesUntil(String date) {
    return 'No classes until $date.';
  }

  @override
  String get notHandedIn => 'Not handed in yet';

  @override
  String get statusHandedIn => 'Handed in';

  @override
  String get statusChecked => 'Checked';

  @override
  String get statusReturned => 'Returned to redo';

  @override
  String handedInAt(String when) {
    return 'Handed in $when';
  }

  @override
  String checkedByOn(String name, String date) {
    return 'Checked by $name on $date';
  }

  @override
  String returnedByOn(String name, String date) {
    return 'Returned by $name on $date';
  }

  @override
  String get teacherRemark => 'Teacher\'s remark';

  @override
  String get answerLabel => 'Answer';

  @override
  String get answerHint => 'Type the answer here, or add photos of the work';

  @override
  String get handIn => 'Hand in';

  @override
  String get handInAgain => 'Hand in again';

  @override
  String get handInTitle => 'Hand in homework';

  @override
  String get handedInDone => 'Handed in.';

  @override
  String get couldNotAddFile => 'Couldn\'t add that file. Try again.';

  @override
  String fileTooBig(String name) {
    return '$name is too big (8 MB at most).';
  }

  @override
  String filesCount(int count, int max) {
    return 'Photos and PDFs: $count of $max';
  }

  @override
  String get removeFile => 'Remove';

  @override
  String get takePhoto => 'Take a photo';

  @override
  String get choosePhotos => 'Choose photos';

  @override
  String get addPdf => 'Add a PDF';

  @override
  String get filesHint => 'Up to 5 photos or PDFs, 8 MB each. Photos are made smaller before they are sent.';

  @override
  String uploading(String percent) {
    return 'Sending… $percent';
  }

  @override
  String get photoNotLoaded => 'Couldn\'t load this photo.';

  @override
  String topicsTaught(int covered, int total) {
    return '$covered of $total topics taught';
  }

  @override
  String get taught => 'Taught';

  @override
  String taughtOn(String date) {
    return 'Taught on $date';
  }

  @override
  String get privacy => 'Privacy';

  @override
  String get privacySubtitle => 'What KINETIX may do with the student\'s information';

  @override
  String get notNow => 'Not now';

  @override
  String ifYouSayNo(String text) {
    return 'If you say no: $text';
  }

  @override
  String get changeAnyTime =>
      'You can change these choices at any time in Profile → Privacy. A change does not affect what was done before it.';

  @override
  String get readFullNotice => 'Read the full notice';

  @override
  String get allowAll => 'Allow all';

  @override
  String get saveChoices => 'Save my choices';

  @override
  String get notDecided => 'Not decided yet';

  @override
  String decidedBy(String choice, String name, String date) {
    return '$choice by $name on $date';
  }

  @override
  String get allowed => 'Allowed';

  @override
  String get notAllowed => 'Not allowed';

  @override
  String get choicesSaved => 'Saved.';

  @override
  String get privacyNotice => 'Privacy notice';

  @override
  String noticeVersion(String version) {
    return 'Version $version';
  }

  @override
  String get noticeWhoDecides => 'Who decides';

  @override
  String get noticeSchool => 'School (students under 18): the parent or guardian decides for the child.';

  @override
  String get noticeCollege =>
      'College or university: students decide for themselves. A guardian decides only for a student who has no KINETIX login of their own.';

  @override
  String get noticeWhatWeAsk => 'What we ask about';

  @override
  String get noticeWhereKept => 'Where data is kept';

  @override
  String get noticeDataInIndia =>
      'All data and all AI processing stay in India. Data is kept while the student is at the institution, and then for as long as the institution\'s records policy requires.';

  @override
  String get noticeQuestions => 'Questions and requests';

  @override
  String get noticeContact =>
      'The institution\'s grievance officer answers questions and requests to see, correct or erase data. Ask the institution\'s office how to reach them.';

  @override
  String get grievanceOfficer => 'Grievance officer';

  @override
  String get noticeContactOfficer =>
      'The institution\'s grievance officer answers questions and requests to see, correct or erase data. You can reach them here:';

  @override
  String get contactEmail => 'Email';

  @override
  String get contactPhone => 'Phone';

  @override
  String get purposeDataTitle => 'Records and updates';

  @override
  String get purposeDataBody =>
      'Keeping the student\'s attendance, homework, marks, fees and library records so the institution can run classes and keep you informed.';

  @override
  String get purposeDataNo => 'the institution still keeps the records it must by law; you will not get updates in the app.';

  @override
  String get purposeAiTitle => 'KINETIX AI';

  @override
  String get purposeAiBody =>
      'The student asking KINETIX AI for help with doubts. Questions are processed on servers in India and are not used to train AI models.';

  @override
  String get purposeAiNo => 'KINETIX AI is turned off for the student. Everything else works.';

  @override
  String get purposeRecordingsTitle => 'Class recordings and live classes';

  @override
  String get purposeRecordingsBody =>
      'The student\'s voice or image appearing in lesson recordings and live classes shared with the class.';

  @override
  String get purposeRecordingsNo => 'teachers are asked not to record the student; recordings already shared stay with the class.';

  @override
  String get purposePhotosTitle => 'Photos';

  @override
  String get purposePhotosBody => 'Photos of the student (for example on homework or in class activities) shared with the class.';

  @override
  String get purposePhotosNo => 'photos of the student are not shared with the class.';

  @override
  String get errConsentGuardianDecides => 'You can\'t change these choices for this student.';

  @override
  String childWork(String name) {
    return '$name\'s work';
  }

  @override
  String get returnedNote => 'The teacher has asked for this to be done again. Read the remark, then hand it in again.';

  @override
  String handInFor(String name) {
    return 'Hand in for $name';
  }

  @override
  String get handInForNote => 'Hand in here for a child who doesn\'t have their own KINETIX login.';

  @override
  String consentTitleFor(String name) {
    return 'Privacy choices for $name';
  }

  @override
  String consentIntroFor(String name) {
    return 'Choose what KINETIX may do with $name\'s information. Nothing is switched on until you choose.';
  }

  @override
  String privacyIntroFor(String name) {
    return 'What KINETIX may do with $name\'s information. Turn a switch off to withdraw your consent.';
  }

  @override
  String privacyIntroReadOnlyFor(String name) {
    return 'What KINETIX may do with $name\'s information, and who decided.';
  }

  @override
  String managedByStudent(String name) {
    return '$name manages this. At a college, students with their own KINETIX login make these choices themselves.';
  }

  @override
  String childPrivacy(String name) {
    return 'Privacy: $name';
  }

  @override
  String get syllabusProgress => 'Syllabus progress';

  @override
  String childSyllabusProgress(String name) {
    return 'Syllabus progress: $name';
  }

  @override
  String get syllabusProgressSubtitle => 'What the class has been taught in each subject';

  @override
  String get syllabusSubjectsEmpty => 'Subjects appear here once teachers set homework in them.';

  @override
  String syllabusNotLinked(String subject) {
    return 'The syllabus for $subject isn\'t in KINETIX yet.';
  }

  @override
  String chaptersTopics(int chapters) {
    String _temp0 = intl.Intl.pluralLogic(chapters, locale: localeName, other: '$chapters chapters', one: '1 chapter');
    return '$_temp0';
  }

  @override
  String get noTopicsInChapter => 'No topics yet';

  @override
  String get thisWeekInClass => 'This week in class';

  @override
  String get nextWeekInClass => 'Next week';

  @override
  String get nothingPlannedThisWeek => 'Nothing new is planned for this week.';

  @override
  String get planOnSchedule => 'Class is on schedule';

  @override
  String get planAhead => 'Class is ahead of the plan';

  @override
  String planBehind(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Class is $count topics behind the plan',
      one: 'Class is 1 topic behind the plan',
    );
    return '$_temp0';
  }

  @override
  String get planIntro => 'Topics the teacher plans to teach.';

  @override
  String get phoneNumber => 'Mobile number';

  @override
  String get enterPhone => 'Enter your mobile number';

  @override
  String get enterValidMobile => 'Enter a 10-digit mobile number';

  @override
  String get sendCode => 'Send code';

  @override
  String otpSentTo(String phone) {
    return 'Enter the 6-digit code sent to $phone';
  }

  @override
  String get otpCode => '6-digit code';

  @override
  String get enterOtp => 'Enter the 6-digit code';

  @override
  String get resendCode => 'Resend code';

  @override
  String resendIn(String time) {
    return 'Resend code in $time';
  }

  @override
  String get changeNumber => 'Change number';

  @override
  String get usePassword => 'Use a password instead';

  @override
  String get usePhoneCode => 'Get a code on your phone instead';

  @override
  String get errOtpInvalid => 'That code is wrong or has expired. Check the SMS or ask for a new code.';

  @override
  String get errOtpTooMany => 'Too many codes asked for. Wait a few minutes and try again.';

  @override
  String get notificationsTitle => 'Get updates on this phone?';

  @override
  String get notificationsAllow => 'Turn on';

  @override
  String get otpHint => 'We\'ll text a code to the phone number you gave your child\'s college';

  @override
  String get notificationsBody =>
      'We\'ll tell you about attendance, homework, results, fees and messages from your child\'s college. You can change this any time in your phone\'s settings.';

  @override
  String get demoChip => 'DEMO';

  @override
  String get demoBannerTitle => 'Demo mode';

  @override
  String get demoBannerBody =>
      'Sample data from KINETIX Demo College. Nothing is sent to a server, and your changes last until the app is closed.';

  @override
  String demoSignInAs(String name) {
    return 'Sign in as $name';
  }

  @override
  String get demoOtpHint => 'Demo: any number works; the code is 123456.';

  @override
  String get notInDemo => 'Not available in the demo.';

  @override
  String recordingAvailableUntil(String date) {
    return 'Available until $date';
  }

  @override
  String get bus => 'Bus';

  @override
  String get busSubtitle => 'Route, stop and where the bus is now';

  @override
  String busTitle(Object name) {
    return '$name\'s bus';
  }

  @override
  String busNoBus(Object name) {
    return '$name does not use the school bus.';
  }

  @override
  String get busRoute => 'Route';

  @override
  String get busYourStop => 'Stop';

  @override
  String get busPickupTime => 'Pickup time';

  @override
  String get busVehicle => 'Vehicle';

  @override
  String get busNotRunning => 'No bus running right now. The live map appears when the driver starts the trip.';

  @override
  String busArrivingIn(int minutes) {
    String _temp0 = intl.Intl.pluralLogic(minutes, locale: localeName, other: 'Arriving in $minutes min', one: 'Arriving in 1 min');
    return '$_temp0';
  }

  @override
  String busStopsAway(int count, Object name) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count stops away',
      one: '1 stop away',
      zero: 'Next stop is $name',
    );
    return '$_temp0';
  }

  @override
  String get busPassed => 'The bus has passed this stop.';

  @override
  String get busStops => 'Stops';

  @override
  String get busLive => 'Live';

  @override
  String get careersTitle => 'Careers';

  @override
  String get careersSubtitle => 'Campus drives, offers and internships';

  @override
  String careersAcademics(Object cgpa, int backlogs) {
    String _temp0 = intl.Intl.pluralLogic(backlogs, locale: localeName, other: '$backlogs backlogs', one: '1 backlog', zero: 'no backlogs');
    return 'CGPA $cgpa · $_temp0';
  }

  @override
  String get careersNoResult => 'No published result yet';

  @override
  String get careersDrives => 'Drives';

  @override
  String get careersNoDrives => 'No drives are open right now.';

  @override
  String get careersOffers => 'Offers';

  @override
  String get careersInternships => 'Internships';

  @override
  String get careersPlaced => 'An offer has been accepted. Congratulations!';

  @override
  String get careersRegister => 'Register';

  @override
  String get careersWithdraw => 'Withdraw';

  @override
  String get careersAccept => 'Accept';

  @override
  String get careersDecline => 'Decline';

  @override
  String get careersViewOnly => 'You can follow drives and offers here. Only your child can register or answer an offer.';

  @override
  String careersPackage(Object ctc) {
    return '$ctc lakh a year';
  }

  @override
  String careersMinCgpa(Object cgpa) {
    return 'Minimum CGPA $cgpa';
  }

  @override
  String careersRegisteredNote(Object drive) {
    return 'You are registered for $drive';
  }

  @override
  String get careersReg_registered => 'Registered';

  @override
  String get careersReg_shortlisted => 'Shortlisted';

  @override
  String get careersReg_rejected => 'Not selected';

  @override
  String get careersReg_selected => 'Selected';

  @override
  String get careersReg_withdrawn => 'Withdrawn';

  @override
  String get careersOffer_offered => 'Waiting for an answer';

  @override
  String get careersOffer_accepted => 'Accepted';

  @override
  String get careersOffer_declined => 'Declined';

  @override
  String get careersOffer_withdrawn => 'Withdrawn by the company';

  @override
  String get careersOffer_expired => 'Expired';

  @override
  String get careersReason_not_open => 'Not open for registration';

  @override
  String get careersReason_deadline_passed => 'Registration has closed';

  @override
  String get careersReason_no_results => 'No published result yet';

  @override
  String get careersReason_cgpa_below => 'CGPA is below the minimum';

  @override
  String get careersReason_backlogs_exceeded => 'Too many backlogs';

  @override
  String get careersReason_program_not_eligible => 'Not open to your programme';

  @override
  String get grievancesTitle => 'Grievances';

  @override
  String get grievancesSubtitle => 'Raise a concern and follow it to a resolution';

  @override
  String get grievanceNone => 'No grievances raised yet.';

  @override
  String get grievanceRaise => 'Raise a grievance';

  @override
  String get grievanceCategory => 'Category';

  @override
  String get grievanceSubject => 'Subject';

  @override
  String get grievanceDescription => 'What happened?';

  @override
  String get grievanceAnonymous => 'Hide my name from the staff';

  @override
  String get grievanceAnonymousHint => 'The team will not see who raised it. You can still follow it here.';

  @override
  String get grievanceConfidentialHint => 'Ragging and harassment go to a confidential committee. Nobody else can read them.';

  @override
  String get grievanceSubmit => 'Submit';

  @override
  String grievanceRecorded(Object ticketNo) {
    return 'Your grievance was recorded as $ticketNo';
  }

  @override
  String grievanceDue(Object date) {
    return 'Reply due $date';
  }

  @override
  String get grievanceResolution => 'Resolution';

  @override
  String get grievanceRate => 'How satisfied are you with the resolution?';

  @override
  String get grievanceRated => 'Thank you for rating';

  @override
  String get grievanceAnonymousTag => 'Anonymous';

  @override
  String get grievanceCat_academic => 'Academic';

  @override
  String get grievanceCat_exam => 'Examination';

  @override
  String get grievanceCat_fees => 'Fees';

  @override
  String get grievanceCat_hostel => 'Hostel';

  @override
  String get grievanceCat_transport => 'Transport';

  @override
  String get grievanceCat_infrastructure => 'Infrastructure';

  @override
  String get grievanceCat_staff_conduct => 'Staff conduct';

  @override
  String get grievanceCat_ragging => 'Ragging';

  @override
  String get grievanceCat_harassment => 'Harassment';

  @override
  String get grievanceCat_other => 'Other';

  @override
  String get grievanceStatus_open => 'Received';

  @override
  String get grievanceStatus_assigned => 'With a team member';

  @override
  String get grievanceStatus_in_progress => 'Being looked into';

  @override
  String get grievanceStatus_escalated => 'Sent to a senior';

  @override
  String get grievanceStatus_resolved => 'Resolved';

  @override
  String get grievanceStatus_closed => 'Closed';

  @override
  String get grievanceStatus_reopened => 'Reopened';

  @override
  String childCareers(Object name) {
    return '$name\'s careers';
  }

  @override
  String childGrievances(Object name) {
    return '$name\'s grievances';
  }

  @override
  String get examsTitle => 'Exams';

  @override
  String get examTimetable => 'Timetable';

  @override
  String get examResultsTitle => 'Results';

  @override
  String get noExamsScheduled => 'No exams are scheduled yet. They appear here once the college publishes the timetable.';

  @override
  String get noExamResults => 'No results published yet.';

  @override
  String examDates(String from, String to) {
    return '$from – $to';
  }

  @override
  String examPaperTime(String start, String end) {
    return '$start – $end';
  }

  @override
  String examSeat(String room, int seat) {
    return '$room · Seat $seat';
  }

  @override
  String examMaxMarks(int n) {
    return '$n marks';
  }

  @override
  String get hallTicket => 'Hall ticket';

  @override
  String get hallTicketDownload => 'Download hall ticket';

  @override
  String hallTicketWithheld(String reason) {
    return 'Hall ticket withheld: $reason';
  }

  @override
  String get hallTicketWithheldNoReason => 'Hall ticket withheld. Contact the examination office.';

  @override
  String get hallTicketNotIssued => 'Hall ticket not issued yet.';

  @override
  String get fileOpenFailed => 'Couldn\'t open this file. Install an app that opens PDFs.';

  @override
  String get sgpaLabel => 'SGPA';

  @override
  String get cgpaLabel => 'CGPA';

  @override
  String cgpaLine(String value) {
    return 'CGPA $value';
  }

  @override
  String sgpaLine(String value) {
    return 'SGPA $value';
  }

  @override
  String get resultPass => 'Passed';

  @override
  String get resultFail => 'Not cleared';

  @override
  String resultLine(String percent, String grade) {
    return '$percent% · Grade $grade';
  }

  @override
  String get revaluationRequest => 'Request revaluation';

  @override
  String get revaluationWhy => 'Why should this paper be re-checked?';

  @override
  String get revaluationNeedReason => 'Write a few words (at least 3 letters).';

  @override
  String get revaluationSent => 'Request sent. The examination office will decide.';

  @override
  String get revaluationRequested => 'Revaluation requested';

  @override
  String get revaluationAccepted => 'Revaluation accepted';

  @override
  String get revaluationRejected => 'Revaluation declined';

  @override
  String get revaluationCompleted => 'Revaluation done';

  @override
  String get examDone => 'Done';

  @override
  String get navFees => 'Fees';

  @override
  String get navMore => 'More';

  @override
  String get homeTabOverview => 'Overview';

  @override
  String get homeTabAcademics => 'Academics';

  @override
  String get homeTabFees => 'Fees';

  @override
  String get homeTabAttendance => 'Attendance';

  @override
  String get chooseChild => 'Choose a child';

  @override
  String get switchChildHint => 'Tap to switch child';

  @override
  String get tileInternalMarks => 'Internal marks';

  @override
  String get tileAssignments => 'Assignments';

  @override
  String tilePendingValue(int n) {
    return '$n pending';
  }

  @override
  String get tileAllDone => 'All done';

  @override
  String get tileOverall => 'Overall progress';

  @override
  String get progressExcellent => 'Excellent';

  @override
  String get progressGood => 'Good';

  @override
  String get progressFair => 'Fair';

  @override
  String get progressNeedsAttention => 'Needs attention';

  @override
  String get progressNoData => 'Not enough yet';

  @override
  String get recentUpdates => 'Recent updates';

  @override
  String examsForChild(String name) {
    return '$name\'s exams';
  }

  @override
  String get examsSubtitle => 'Timetable, hall ticket and results';

  @override
  String get moreFamily => 'Family';
}

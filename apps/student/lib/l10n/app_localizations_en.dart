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
  String get yourAttendance => 'Your attendance';

  @override
  String notMissedAny(Object days) {
    return 'You have not missed a class in the last $days days. Well done!';
  }

  @override
  String homeworkHandIn(Object learn) {
    return 'Hand it in the way your teacher asked. Stuck? Ask KINETIX AI in the $learn tab.';
  }

  @override
  String get noBooksBorrowed => 'No library books borrowed. Books you borrow from the college library show here with their due dates.';

  @override
  String get noBooksOutNow => 'You have no library books out right now.';

  @override
  String markedAbsentFor(Object kind) {
    return 'You were marked absent for this $kind.';
  }

  @override
  String get noMarksCard => 'No marks published yet. When your teachers publish test or exam marks, they show here with the class average.';

  @override
  String get noMarksScreen => 'No marks published yet.\nWhen your teachers publish marks, they show here.';

  @override
  String get you => 'You';

  @override
  String get recordingsEmpty => 'When a teacher records a lesson on the board and shares it, you can watch it again here.';

  @override
  String get missedThisClass => 'You missed this class';

  @override
  String get noRecordingsShared => 'No lesson recordings have been shared with your class yet.';

  @override
  String get recordingNotSharedYours => 'This recording is no longer shared with your class.';

  @override
  String get boardNotShared => 'This board is no longer shared with your class.';

  @override
  String writeToAbout(Object teacher) {
    return 'Write to $teacher about a class, homework or a doubt.';
  }

  @override
  String get noMessagesStudent => 'No messages yet.\nWrite to your teachers about a class, homework or a doubt.';

  @override
  String get noTeachersOnTimetable => 'No teachers are on your timetable yet.';

  @override
  String yourTeachers(Object className) {
    return 'Your teachers · $className';
  }

  @override
  String nUnread(Object count) {
    return '$count unread';
  }

  @override
  String get writeToTeacher => 'Write to a teacher';

  @override
  String get openMessages => 'Open messages';

  @override
  String get askYourTeachers => 'Ask your teachers about a class, homework or a doubt.';

  @override
  String get noUpdates =>
      'You\'re all caught up.\nNew homework, shared boards, lesson recordings and messages from your college will appear here.';

  @override
  String get noLongerLive => 'This class is no longer live.';

  @override
  String otherClassLive(Object today) {
    return 'That class has ended. Another class is live now on $today.';
  }

  @override
  String get liveClass => 'Live class';

  @override
  String get signInHint => 'Use the email or phone number your college gave you';

  @override
  String get emailOrPhone => 'Email or phone';

  @override
  String get enterEmailOrPhone => 'Enter your email or phone number';

  @override
  String get navLearn => 'Learn';

  @override
  String get attendanceFewMissed => 'You missed a few classes recently.';

  @override
  String get attendanceBelow75 => 'Below 75%. Colleges usually need 75% for you to sit exams.';

  @override
  String noAttendanceForYou(Object days) {
    return 'No attendance has been taken for you in the last $days days.';
  }

  @override
  String get nothingDue => 'Nothing due right now. New homework from your teachers will show here.';

  @override
  String get stuckTitle => 'Stuck on something?';

  @override
  String get stuckBody => 'Ask KINETIX AI to explain it, in English, हिन्दी or ಕನ್ನಡ.';

  @override
  String get boardsEmpty => 'When a teacher shares the class board after a lesson, it appears here so you can revise.';

  @override
  String get feesNote =>
      'Fees are paid by your parent or guardian in the KINETIX Parent app, or at the college fees counter. Here you can see what is due and open your receipts.';

  @override
  String get invoicePaid => 'Paid';

  @override
  String get invoiceCancelled => 'Cancelled';

  @override
  String get invoiceOverdue => 'Overdue';

  @override
  String get invoicePartPaid => 'Part paid';

  @override
  String get invoiceDue => 'Due';

  @override
  String get payments => 'Payments';

  @override
  String get noFeesIssued => 'No fees have been issued to you.';

  @override
  String get noPayments => 'No payments yet. Receipts appear here once a payment goes through.';

  @override
  String get allPaid => 'All paid';

  @override
  String feesOverdueNext(int count, Object title) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count fees overdue', one: '1 fee overdue');
    return '$_temp0 · next: $title';
  }

  @override
  String nextFeeDue(Object title, Object date) {
    return 'Next: $title, due $date';
  }

  @override
  String amountPaidShort(Object amount) {
    return '$amount paid';
  }

  @override
  String dueOnShort(Object date) {
    return 'due $date';
  }

  @override
  String get paidOn => 'Paid on';

  @override
  String get rollNoLabel => 'Roll no.';

  @override
  String get forLabel => 'For';

  @override
  String get method => 'Method';

  @override
  String get feeAmount => 'Fee amount';

  @override
  String get balance => 'Balance';

  @override
  String get nil => 'Nil';

  @override
  String get keepReceipt => 'Keep this for your records. Show it at the fees counter if anyone asks for proof of payment.';

  @override
  String get yourClass => 'Your class';

  @override
  String get program => 'Program';

  @override
  String get attendanceHistory => 'Attendance history';

  @override
  String get writeToYourTeachers => 'Write to your teachers';

  @override
  String get aiAnswersIn => 'KINETIX AI answers in';

  @override
  String get answersIn => 'Answers in';

  @override
  String get timetable => 'Timetable';

  @override
  String get timetableSubtitle => 'Your classes for the week';

  @override
  String get everyClass30 => 'Every class in the last 30 days';

  @override
  String noAttendanceDays(Object days) {
    return 'No attendance taken in the last $days days';
  }

  @override
  String attendedPercent(Object percent, Object days) {
    return '$percent attended in the last $days days';
  }

  @override
  String get noMarksYet => 'No marks published yet';

  @override
  String assessmentsPublished(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count assessments published', one: '1 assessment published');
    return '$_temp0';
  }

  @override
  String get noBooksOutShort => 'No books out';

  @override
  String booksOut(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count books out', one: '1 book out');
    return '$_temp0';
  }

  @override
  String feesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count fees', one: '1 fee');
    return '$_temp0';
  }

  @override
  String receiptsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count receipts', one: '1 receipt');
    return '$_temp0';
  }

  @override
  String get askADoubt => 'Ask a doubt';

  @override
  String get syllabus => 'Syllabus';

  @override
  String get codeLab => 'Code lab';

  @override
  String get labs => 'Labs';

  @override
  String get earlierQuestions => 'Earlier questions';

  @override
  String get askIntro => 'KINETIX AI explains it step by step, following your syllabus.';

  @override
  String aboutTopic(Object topic) {
    return 'About: $topic';
  }

  @override
  String get askAboutAnything => 'Ask about anything';

  @override
  String get questionHint => 'e.g. What is forfeiture of shares?';

  @override
  String get answerIn => 'Answer in';

  @override
  String get subject => 'Subject';

  @override
  String get anySubject => 'Any';

  @override
  String get ask => 'Ask';

  @override
  String get youAsked => 'You asked';

  @override
  String get aiThinking => 'KINETIX AI is thinking…';

  @override
  String get keyPoints => 'Key points';

  @override
  String get basedOn => 'Based on';

  @override
  String get openTopicNotes => 'Open the topic notes';

  @override
  String get askNext => 'Ask next';

  @override
  String get previewAnswer => 'Preview answer';

  @override
  String get previewNote => 'KINETIX AI isn\'t connected at your college yet, so this is a sample, not a real explanation.';

  @override
  String get aiCantAnswer => 'KINETIX AI can\'t answer that';

  @override
  String get aiRephrase => 'Try rephrasing it as a question about your studies.';

  @override
  String get aiAllowanceUsed => 'Today\'s KINETIX AI allowance is used up';

  @override
  String get aiAllowanceBody => 'Your college has used today’s allowance. It resets tomorrow.';

  @override
  String get aiUnreachable => 'KINETIX AI is not reachable';

  @override
  String get aiUnreachableBody => 'It is not reachable right now. Try again in a minute.';

  @override
  String get noConnection => 'No connection';

  @override
  String get somethingWrong => 'Something went wrong';

  @override
  String get topicNotInLibrary => 'This topic is no longer in the library.';

  @override
  String get topic => 'Topic';

  @override
  String get askAboutThis => 'Ask KINETIX AI about this';

  @override
  String get notes => 'Notes';

  @override
  String get outcomes => 'After this topic you should be able to';

  @override
  String get noNotes => 'No notes have been added for this topic yet.';

  @override
  String get notReviewed => 'These notes have not been reviewed by the curriculum team yet. Your textbook and teacher come first.';

  @override
  String get askKinetixAi => 'Ask KINETIX AI';

  @override
  String get searchTopicsHint => 'Search topics, e.g. goodwill';

  @override
  String get clear => 'Clear';

  @override
  String noTopicsMatch(Object query) {
    return 'No topics match “$query”. Try a shorter word, or ask KINETIX AI.';
  }

  @override
  String topicsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count topics', one: '1 topic');
    return '$_temp0';
  }

  @override
  String chaptersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count chapters', one: '1 chapter');
    return '$_temp0';
  }

  @override
  String get yourSubjects => 'Your subjects';

  @override
  String get subjectsEmpty => 'Your subjects appear here once your teachers set homework. Meanwhile, search for any topic above.';

  @override
  String syllabusMissing(Object subject) {
    return 'The syllabus for $subject isn\'t in the KINETIX library yet.\nSearch for a topic, or ask KINETIX AI.';
  }

  @override
  String get noTopicsYet => 'No topics yet.';

  @override
  String get joiningClass => 'Joining the class…';

  @override
  String get waitingForBoard => 'Waiting for the board…';

  @override
  String get leave => 'Leave';

  @override
  String get liveBadge => 'LIVE';

  @override
  String get reconnecting => 'Connection lost. Reconnecting…';

  @override
  String get couldNotJoin => 'Couldn\'t join the class';

  @override
  String get tryInAMoment => 'Try again in a moment.';

  @override
  String get liveOffTitle => 'Your teacher stopped the live class';

  @override
  String liveOffBody(Object today) {
    return 'The board is no longer being shared. If your teacher shares a recording of the lesson, it will appear on $today.';
  }

  @override
  String get boardOfflineTitle => 'The board went offline';

  @override
  String get boardOfflineBody => 'The classroom board lost its connection. Stay here: the board comes back on its own when it reconnects.';

  @override
  String get classEndedTitle => 'The class has ended';

  @override
  String classEndedBody(Object today) {
    return 'Thanks for joining. If your teacher shares a recording of the lesson, it will appear on $today.';
  }

  @override
  String backToToday(Object today) {
    return 'Back to $today';
  }

  @override
  String liveNow(Object subject) {
    return 'Live now: $subject';
  }

  @override
  String get classFallback => 'class';

  @override
  String teacherTeaching(Object teacher) {
    return '$teacher is teaching. Watch the board.';
  }

  @override
  String get watch => 'Watch';

  @override
  String get liveSignInAgain => 'Sign in again to watch the class.';

  @override
  String get liveNotConnected => 'Not connected';

  @override
  String get liveTimeout => 'The class is taking too long to answer. Try again.';

  @override
  String get liveCouldNotJoin => 'Couldn\'t join the class.';

  @override
  String get undergraduate => 'Undergraduate';

  @override
  String get postgraduate => 'Postgraduate';

  @override
  String get boardOnlyNoSound => 'Board only: no sound';

  @override
  String get teacherMicOn => 'Teacher\'s mic is on';

  @override
  String get teacherMicOff => 'Teacher\'s mic is off';

  @override
  String get muteClass => 'Mute the class';

  @override
  String get unmuteClass => 'Unmute the class';

  @override
  String get errNotStudent => 'This app is for students. Ask your college office to set up your student login.';

  @override
  String get errGuardianAccount => 'This app is for students. Parents and guardians can use the KINETIX Parent app.';

  @override
  String get errTeacherAccount => 'This app is for students. Teachers can use the KINETIX Teacher app.';

  @override
  String get errNotLinked => 'Your login is not linked to a student record yet. Ask your college office to link it.';

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
  String get errConsentGuardianDecides => 'In a school, your parent or guardian makes these choices.';

  @override
  String get aiConsentWithdrawnTitle => 'KINETIX AI is turned off';

  @override
  String get aiConsentWithdrawnBody =>
      'Consent for KINETIX AI was withdrawn, so it is off for you. Everything else works. You can see who decided, or change it, in Profile → Privacy.';

  @override
  String get openPrivacy => 'Open Privacy';

  @override
  String get errLiveNotAllowed => 'Only school leaders and students can watch classes.';

  @override
  String get errLiveViewOff => 'Live view is turned off for your institution.';

  @override
  String get errLiveNotStarted => 'Your teacher has not started a live class.';

  @override
  String get errLiveUnknownBoard => 'This classroom board isn\'t recognised. Ask your teacher which class to watch.';

  @override
  String get errLiveNoClass => 'No class is being taught on this board right now.';

  @override
  String get errLiveNotYourClass => 'This is not your class.';

  @override
  String get yourWork => 'Your work';

  @override
  String get returnedNote => 'Your teacher has asked you to do this again. Read the remark, then hand it in again.';

  @override
  String get consentTitle => 'Your privacy choices';

  @override
  String get consentIntro => 'Choose what KINETIX may do with your information. Nothing is switched on until you choose.';

  @override
  String get privacyIntro => 'What KINETIX may do with your information. Turn a switch off to withdraw your consent.';

  @override
  String get privacyIntroReadOnly => 'What KINETIX may do with your information, and who decided.';

  @override
  String get managedByParent =>
      'Your parent manages this. In a school, your parent or guardian makes these choices in the KINETIX Parent app.';

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
  String get comingUpInClass => 'Coming up in class';

  @override
  String get readAhead => 'Topics planned for class. Read ahead if you like.';

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
  String get otpHint => 'We\'ll text a code to the phone number your college has for you';

  @override
  String get notificationsBody =>
      'We\'ll tell you about new homework, results, live classes and messages from your college. You can change this any time in your phone\'s settings.';

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
  String get conceptVideos => 'Concept videos';

  @override
  String get conceptVideosHint => 'Watch before class to preview, and after class to revise.';

  @override
  String get conceptVideosFromYouTube => 'Plays from YouTube';

  @override
  String get conceptVideoSourcePlatform => 'KINETIX';

  @override
  String get conceptVideoSourceInstitution => 'School';

  @override
  String get conceptVideoSourceTeacher => 'Teacher';

  @override
  String get conceptVideosUnsupported => 'Videos can\'t play here. Use the Student App on your phone.';

  @override
  String conceptVideoPlay(String title) {
    return 'Play $title';
  }

  @override
  String get liveQuestion => 'Live question';

  @override
  String get liveQuestionTapToAnswer => 'Tap to answer';

  @override
  String liveQuestionYourAnswer(String answer) {
    return 'Your answer: $answer (you can change it)';
  }

  @override
  String get liveQuestionYourNumber => 'Your answer';

  @override
  String get liveQuestionSend => 'Send answer';

  @override
  String get liveQuestionNotNumber => 'Type a number, like 2.5';

  @override
  String get liveQuestionClosed => 'Your teacher has ended this question.';

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
  String get navMyLearning => 'My Learning';

  @override
  String get navExams => 'Exams';

  @override
  String get navMore => 'More';

  @override
  String get homeSubtitle => 'Keep learning, keep growing!';

  @override
  String get notificationsTooltip => 'Notifications';

  @override
  String get nextClass => 'Next class';

  @override
  String get nextClassNone => 'No class coming up right now.';

  @override
  String nextClassLive(String subject) {
    return '$subject is live now';
  }

  @override
  String nextClassTopic(String subject) {
    return 'Coming up in $subject';
  }

  @override
  String get watchLive => 'Join';

  @override
  String get viewAction => 'View';

  @override
  String get tilePendingAssignments => 'Assignments';

  @override
  String tilePendingValue(int n) {
    return '$n pending';
  }

  @override
  String get tileAllDone => 'All done';

  @override
  String get tileUpcomingExam => 'Upcoming exam';

  @override
  String tileExamDays(int n) {
    return 'In $n days';
  }

  @override
  String get tileExamToday => 'Today';

  @override
  String get tileExamNone => 'None yet';

  @override
  String get tileStreak => 'Learning streak';

  @override
  String tileStreakDays(int n) {
    String _temp0 = intl.Intl.pluralLogic(n, locale: localeName, other: '$n days', one: '1 day');
    return '$_temp0';
  }

  @override
  String get continueLearning => 'Continue learning';

  @override
  String get continueLearningEmpty => 'Ask KINETIX AI a doubt or open a topic from My Learning.';

  @override
  String continueProgress(int taught, int total) {
    return '$taught of $total topics taught';
  }

  @override
  String get moreSchoolLife => 'Campus';

  @override
  String get leaveApplyTitle => 'Apply for leave';

  @override
  String get leaveScreenTitle => 'Leave';

  @override
  String get leaveFromLabel => 'From';

  @override
  String get leaveToLabel => 'To';

  @override
  String get leaveReasonLabel => 'Reason';

  @override
  String get leaveReasonRequired => 'Write a few words (at least 3 letters).';

  @override
  String get leaveSend => 'Send request';

  @override
  String get leaveSentSnack => 'Request sent to your class teacher.';

  @override
  String get leaveNone => 'No leave applications yet.';

  @override
  String get leaveStatusPending => 'Waiting';

  @override
  String get leaveStatusApproved => 'Approved';

  @override
  String get leaveStatusRejected => 'Not approved';

  @override
  String get leaveStatusCancelled => 'Withdrawn';

  @override
  String get leaveWithdraw => 'Withdraw';

  @override
  String get leaveToBeforeFrom => 'The last day cannot be before the first day.';

  @override
  String get busTitle => 'My bus';

  @override
  String get busNone => 'You do not have a bus seat. Ask the transport office.';

  @override
  String get busRoute => 'Route';

  @override
  String get busYourStop => 'Your stop';

  @override
  String get busPickup => 'Pickup';

  @override
  String get busVehicle => 'Vehicle';

  @override
  String get busStopsHeading => 'Stops';

  @override
  String busEta(int n) {
    return 'Arrives at your stop in about $n min';
  }

  @override
  String get busPassed => 'The bus has passed your stop';

  @override
  String busStopsAway(int n) {
    String _temp0 = intl.Intl.pluralLogic(n, locale: localeName, other: '$n stops away', one: '1 stop away', zero: 'At your stop');
    return '$_temp0';
  }

  @override
  String get busNotRunning => 'The bus is not on the road right now.';

  @override
  String get gatePassTitle => 'Hostel gate pass';

  @override
  String get gatePassNotResident => 'You are not in the hostel. Gate passes are for hostel residents.';

  @override
  String gatePassRoom(String block, String room) {
    return '$block · Room $room';
  }

  @override
  String get gatePassRequest => 'Request a gate pass';

  @override
  String get gatePassReason => 'Reason';

  @override
  String get gatePassDestination => 'Where are you going?';

  @override
  String get gatePassBackBy => 'Back by';

  @override
  String get gatePassSend => 'Send to warden';

  @override
  String get gatePassSent => 'Request sent to the warden.';

  @override
  String get gatePassBackFuture => 'Choose a return time in the future.';

  @override
  String get gatePassNone => 'No gate passes yet.';

  @override
  String get gatePassRequested => 'Waiting for the warden';

  @override
  String get gatePassIssued => 'Approved';

  @override
  String get gatePassOut => 'Out of hostel';

  @override
  String get gatePassReturned => 'Returned';

  @override
  String get gatePassRejected => 'Not approved';

  @override
  String get gatePassCancelled => 'Cancelled';

  @override
  String gatePassBackLine(String when) {
    return 'Back by $when';
  }

  @override
  String get certificatesTitle => 'Certificates';

  @override
  String get certificateRequestAction => 'Request a certificate';

  @override
  String get certificateChoose => 'Which certificate?';

  @override
  String get certificatePurpose => 'What is it for? (optional)';

  @override
  String get certificateRequiredField => 'Fill in this field.';

  @override
  String get certificateSent => 'Request sent to the office.';

  @override
  String get certificateNone => 'No certificates yet.';

  @override
  String get certificateNoTemplates => 'The college has no certificates open for request.';

  @override
  String get certificateRequested => 'Waiting for the office';

  @override
  String get certificateApproved => 'Approved, being prepared';

  @override
  String get certificateRejected => 'Not approved';

  @override
  String get certificateIssued => 'Ready to download';

  @override
  String get certificateRevoked => 'Withdrawn by the college';

  @override
  String get certificateDownload => 'Download PDF';

  @override
  String certificateSerial(String serial) {
    return 'No. $serial';
  }

  @override
  String get coursesNone => 'No courses yet. They appear here when your teachers publish them.';

  @override
  String courseModulesCount(int count) {
    return '$count modules';
  }

  @override
  String get courseGradeTitle => 'Grade so far';

  @override
  String get courseNoGrade => 'Nothing has been graded yet.';

  @override
  String get courseAnnouncements => 'Announcements';

  @override
  String get courseNoModules => 'No modules yet.';

  @override
  String get coursesTab => 'Courses';

  @override
  String get scholarshipTitle => 'Scholarships';

  @override
  String get scholarshipNone => 'No scholarships are open right now.';

  @override
  String scholarshipPercentOff(int count) {
    return '$count% off your fees';
  }

  @override
  String scholarshipAmountOff(String amount) {
    return '$amount off your fees';
  }

  @override
  String scholarshipMinMarks(int count) {
    return 'Needs at least $count% in published marks';
  }

  @override
  String scholarshipMaxIncome(String amount) {
    return 'Family income up to $amount';
  }

  @override
  String get scholarshipApply => 'Apply';

  @override
  String get scholarshipMine => 'My applications';

  @override
  String scholarshipAwarded(String amount) {
    return '$amount taken off your fees';
  }

  @override
  String get scholarshipIncomeLabel => 'Yearly family income (₹)';

  @override
  String get scholarshipIncomeRequired => 'Enter the family income as a number.';

  @override
  String get scholarshipNoteLabel => 'Anything the college should know (optional)';

  @override
  String get scholarshipSend => 'Send application';

  @override
  String get scholarshipSentSnack => 'Application sent to the accounts office.';

  @override
  String get walletTitle => 'Hostel and canteen';

  @override
  String get walletHostel => 'Hostel';

  @override
  String walletBedLine(Object block, Object room, Object bed) {
    return '$block, room $room, bed $bed';
  }

  @override
  String get walletNotInHostel => 'You are not in the hostel';

  @override
  String get walletNights => 'Night roll call';

  @override
  String get walletNoNights => 'No roll calls yet';

  @override
  String get walletPresent => 'Present';

  @override
  String get walletAbsent => 'Absent';

  @override
  String get walletLeave => 'On leave';

  @override
  String get walletCanteen => 'Canteen wallet';

  @override
  String get walletBalance => 'Balance';

  @override
  String get walletAddMoney => 'Add money';

  @override
  String walletAdded(Object amount) {
    return '$amount added to your wallet';
  }

  @override
  String get walletMeals => 'Recent meals';

  @override
  String get walletNoMeals => 'No meals yet';

  @override
  String get walletBreakfast => 'Breakfast';

  @override
  String get walletLunch => 'Lunch';

  @override
  String get walletSnacks => 'Snacks';

  @override
  String get walletDinner => 'Dinner';

  @override
  String get walletEnterAmount => 'Enter an amount';

  @override
  String get walletEnterRupees => 'Enter an amount in rupees';

  @override
  String get walletMinAmount => 'The smallest top-up is ₹1';

  @override
  String get walletStarting => 'Starting payment…';

  @override
  String get walletConfirming => 'Confirming payment…';

  @override
  String get walletCancelled => 'Payment cancelled';

  @override
  String get walletFailedTitle => 'Payment did not go through';

  @override
  String get walletCouldNotConfirm => 'Could not confirm the payment';

  @override
  String get walletNotSetUp => 'Online payment is not set up yet. Add money at the canteen counter.';

  @override
  String get walletPhonesOnly => 'Online payment works on Android phones and iPhones.';

  @override
  String get walletFailNoConfirm =>
      'The payment app did not return a confirmation. If money left your account, the wallet will update shortly.';

  @override
  String get walletFailOpen => 'Couldn\'t open the payment screen. Try again.';

  @override
  String get walletFailNetwork => 'No internet connection. Check it and try again.';

  @override
  String get walletFailGeneric => 'The payment did not go through. Try again.';

  @override
  String walletFinishIn(Object app) {
    return 'Finish in $app';
  }

  @override
  String get walletInWalletBody => 'Complete the payment in that app. The wallet updates when it goes through.';

  @override
  String get walletDemo => 'Demo payment';

  @override
  String get walletDemoNoMoney => 'Demo payment: no money moves';

  @override
  String walletDemoPay(Object amount) {
    return 'Pay $amount';
  }

  @override
  String get walletAmount => 'Amount';
}

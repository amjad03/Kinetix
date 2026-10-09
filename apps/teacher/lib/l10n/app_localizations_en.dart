// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'KINETIX Teacher';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get send => 'Send';

  @override
  String get share => 'Share';

  @override
  String get done => 'Done';

  @override
  String get retry => 'Retry';

  @override
  String get remove => 'Remove';

  @override
  String get clear => 'Clear';

  @override
  String get profile => 'Profile';

  @override
  String get discardTitle => 'Discard changes?';

  @override
  String get discardMarksBody => 'You have marks that are not saved yet.';

  @override
  String get keepEditing => 'Keep editing';

  @override
  String get discard => 'Discard';

  @override
  String get today => 'Today';

  @override
  String get tomorrow => 'Tomorrow';

  @override
  String get yesterday => 'Yesterday';

  @override
  String greetingMorning(String name) {
    return 'Good morning, $name';
  }

  @override
  String greetingAfternoon(String name) {
    return 'Good afternoon, $name';
  }

  @override
  String greetingEvening(String name) {
    return 'Good evening, $name';
  }

  @override
  String get navToday => 'Today';

  @override
  String get navHomework => 'Homework';

  @override
  String get navMarks => 'Marks';

  @override
  String get navMessages => 'Messages';

  @override
  String get navRecordings => 'Recordings';

  @override
  String get assignHomework => 'Assign homework';

  @override
  String get newAssessment => 'New assessment';

  @override
  String get newMessage => 'New message';

  @override
  String get signInTitle => 'Sign in';

  @override
  String get signInButton => 'Sign in';

  @override
  String get signInSubtitle => 'Use the account your institution gave you';

  @override
  String get institutionCode => 'Institution code';

  @override
  String get institutionCodeHint => 'e.g. demo-college';

  @override
  String get emailOrPhone => 'Email or phone';

  @override
  String get password => 'Password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get serverAddress => 'Server address';

  @override
  String serverLabel(String address) {
    return 'Server: $address';
  }

  @override
  String get enterInstitutionCode => 'Enter your institution code';

  @override
  String get institutionCodeChars => 'Use letters, numbers and hyphens only';

  @override
  String get enterEmailOrPhone => 'Enter your email or phone number';

  @override
  String get invalidEmail => 'Enter a valid email address';

  @override
  String get invalidEmailOrPhone => 'Enter a valid email or 10-digit phone number';

  @override
  String get enterPassword => 'Enter your password';

  @override
  String get invalidServer => 'Enter a server address like https://api.kinetix.in';

  @override
  String get errorNotTeacher => 'This app is for teachers. Your account does not have a teaching role.';

  @override
  String get errorOffline => 'Can\'t reach KINETIX. Check your internet connection and the server address.';

  @override
  String get errorTimeout => 'The server is taking too long to respond. Try again.';

  @override
  String get errorForbidden => 'You don\'t have access to this.';

  @override
  String get errorNotFound => 'Not found.';

  @override
  String get errorTooManyAttempts => 'Too many attempts. Wait a minute and try again.';

  @override
  String errorGeneric(int status) {
    return 'Something went wrong ($status). Try again.';
  }

  @override
  String get errorSessionExpired => 'Your sign-in has expired. Sign in again.';

  @override
  String get errorWrongLogin => 'Wrong institution, login or password';

  @override
  String get errorCodeExpired => 'This code is invalid or has expired. Use the new code on the board.';

  @override
  String get errorAccountInactive => 'Your account is not active';

  @override
  String get errorOtherCampus => 'You are not a teacher at the campus this board belongs to';

  @override
  String get errorNotPairingQr => 'Not a KINETIX pairing QR code';

  @override
  String get errorFutureAttendance => 'Attendance cannot be taken for a future date';

  @override
  String get errorNotYourClass => 'You do not teach this class';

  @override
  String get errorSubjectNotInClass => 'That subject is not taught in this class';

  @override
  String get errorDueDatePassed => 'The due date has already passed';

  @override
  String get errorEnterMarksFirst => 'Enter marks before publishing';

  @override
  String get errorStudentsNotInClass => 'Some students are not in this class';

  @override
  String get errorRecordingUploading => 'The recording is still uploading';

  @override
  String get errorRecordingNoClass => 'This recording was not made with a class, so there is no one to share it with';

  @override
  String get recordingNotAvailable => 'This recording is not available yet. It may still be uploading from the board.';

  @override
  String get connectToBoard => 'Connect to board';

  @override
  String get connectToBoardBody => 'Scan the QR code on the classroom board to start teaching';

  @override
  String get connect => 'Connect';

  @override
  String get connected => 'Connected';

  @override
  String get endClass => 'End class';

  @override
  String get endClassTitle => 'End class?';

  @override
  String endClassBody(String board) {
    return '$board will sign you out and return to its pairing screen.';
  }

  @override
  String classEnded(String board) {
    return 'Class ended on $board';
  }

  @override
  String noClassesOn(String weekday) {
    return 'No classes on $weekday';
  }

  @override
  String showDay(String day) {
    return 'Show $day';
  }

  @override
  String get todaysClasses => 'Today\'s classes';

  @override
  String weekdayClasses(String weekday) {
    return '$weekday\'s classes';
  }

  @override
  String classesOn(String date) {
    return 'Classes on $date';
  }

  @override
  String get noClassesToday => 'No classes today';

  @override
  String periodCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count periods', one: '1 period');
    return '$_temp0';
  }

  @override
  String get attendanceTaken => 'Attendance taken';

  @override
  String get attendanceOpensOnDay => 'Attendance opens on the day';

  @override
  String get takeAttendance => 'Take attendance';

  @override
  String get now => 'Now';

  @override
  String get teachOnBoard => 'Teach on board';

  @override
  String get attendance => 'Attendance';

  @override
  String get statusPresent => 'Present';

  @override
  String get statusAbsent => 'Absent';

  @override
  String get statusLate => 'Late';

  @override
  String get statusExcused => 'Excused';

  @override
  String countPresent(int count) {
    return '$count present';
  }

  @override
  String countAbsent(int count) {
    return '$count absent';
  }

  @override
  String countLate(int count) {
    return '$count late';
  }

  @override
  String countExcused(int count) {
    return '$count excused';
  }

  @override
  String attendanceSaved(String summary) {
    return 'Attendance saved · $summary';
  }

  @override
  String attendanceUpdated(String summary) {
    return 'Attendance updated · $summary';
  }

  @override
  String get markAllPresent => 'Mark all present';

  @override
  String get noStudentsInClass => 'No students in this class yet';

  @override
  String get attendanceAlreadyTaken => 'Already taken. Changes replace the earlier marks.';

  @override
  String get attendanceHelp => 'Everyone starts present. Tap to mark absent, long-press for late.';

  @override
  String get update => 'Update';

  @override
  String get submit => 'Submit';

  @override
  String get enterAllDigits => 'Enter all 6 digits shown on the board';

  @override
  String get enterCodeTitle => 'Enter the code on the board';

  @override
  String get enterCodeBody => 'It is the 6-digit number under the QR code. A new code appears every 2 minutes.';

  @override
  String get scanInstead => 'Scan QR code instead';

  @override
  String get youreConnected => 'You\'re connected';

  @override
  String boardReady(String board) {
    return '$board is ready for you';
  }

  @override
  String boardShowingClass(String board) {
    return '$board is showing your class';
  }

  @override
  String get labelBoard => 'Board';

  @override
  String get labelClass => 'Class';

  @override
  String get labelSubject => 'Subject';

  @override
  String get labelPeriod => 'Period';

  @override
  String get freeSession => 'Free session';

  @override
  String get freeSessionBody =>
      'You have no timetabled class right now, so the board opens without a class list. It signs you out after 2 hours.';

  @override
  String get qrNotOurs => 'That isn\'t a KINETIX board code. Scan the QR code on the board\'s screen.';

  @override
  String get scanTitle => 'Scan board QR code';

  @override
  String get torch => 'Torch';

  @override
  String get cameraDenied => 'Allow camera access in Settings to scan, or enter the code instead.';

  @override
  String get cameraUnavailable => 'The camera is not available. Enter the code instead.';

  @override
  String get pointCamera => 'Point your camera at the QR code on the board';

  @override
  String get enterCodeInstead => 'Enter code instead';

  @override
  String get dueDate => 'Due date';

  @override
  String get assign => 'Assign';

  @override
  String get noClassesInTimetable => 'You have no classes in your timetable yet';

  @override
  String get chooseSubject => 'Choose a subject';

  @override
  String get titleLabel => 'Title';

  @override
  String get homeworkTitleHint => 'e.g. Exercise 4.2, questions 1–5';

  @override
  String get homeworkTitleRequired => 'Give the homework a title';

  @override
  String get instructionsOptional => 'Instructions (optional)';

  @override
  String homeworkAssigned(String className) {
    return 'Homework assigned to $className';
  }

  @override
  String get noHomework => 'No homework yet.\nAssign work to a class and it will show up here.';

  @override
  String get dueToday => 'Due today';

  @override
  String get dueTomorrow => 'Due tomorrow';

  @override
  String dueOn(String date) {
    return 'Due $date';
  }

  @override
  String get wasDueYesterday => 'Was due yesterday';

  @override
  String wasDueOn(String date) {
    return 'Was due $date';
  }

  @override
  String get heldOn => 'Held on';

  @override
  String get enterMaxMarks => 'Enter the maximum marks';

  @override
  String get maxMustBePositive => 'Must be more than 0';

  @override
  String get maxAtMost1000 => 'At most 1000';

  @override
  String get create => 'Create';

  @override
  String get assessmentTitleHint => 'e.g. Unit test 2: Redemption of shares';

  @override
  String get assessmentTitleRequired => 'Give it a title';

  @override
  String get kind => 'Kind';

  @override
  String get outOf => 'Out of';

  @override
  String get marksPrivateNote =>
      'Marks stay private until you publish them. Then students and their families see their own marks and the class average.';

  @override
  String get kindTest => 'Test';

  @override
  String get kindAssignment => 'Assignment';

  @override
  String get kindInternal => 'Internal';

  @override
  String get kindExam => 'Exam';

  @override
  String get kindPractical => 'Practical';

  @override
  String noAssessments(String className) {
    return 'No tests or assignments for $className yet.\nAdd one, enter marks and publish them to families.';
  }

  @override
  String get published => 'Published';

  @override
  String get draft => 'Draft';

  @override
  String get classAverage => 'Class average';

  @override
  String noMarksYet(String max) {
    return 'No marks yet · out of $max';
  }

  @override
  String enteredOf(int entered, int total) {
    return '$entered of $total entered';
  }

  @override
  String enteredCount(int entered) {
    return '$entered entered';
  }

  @override
  String get notANumber => 'Not a number';

  @override
  String maxN(String max) {
    return 'Max $max';
  }

  @override
  String marksNeedFixing(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count marks need fixing', one: 'One mark needs fixing');
    return '$_temp0';
  }

  @override
  String markedOf(int marked, int total) {
    return '$marked of $total marked';
  }

  @override
  String get marksSaved => 'Marks saved';

  @override
  String savedClassAverage(String average, String max) {
    return 'class average $average / $max';
  }

  @override
  String get familiesSeeUpdate => 'families see the update';

  @override
  String get publishTitle => 'Publish marks?';

  @override
  String get publishBody =>
      'Students and families of the class will be notified and can see their own marks with the class average and highest.';

  @override
  String publishBlank(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count students have no marks yet.',
      one: '1 student has no marks yet.',
    );
    return '$_temp0';
  }

  @override
  String get publishCanCorrect => 'You can still correct marks after publishing.';

  @override
  String get publish => 'Publish';

  @override
  String publishedNotified(String title) {
    return '$title published · families notified';
  }

  @override
  String get statAverage => 'Average';

  @override
  String get statHighest => 'Highest';

  @override
  String get statLowest => 'Lowest';

  @override
  String get statMarked => 'Marked';

  @override
  String typeMarksHint(String max) {
    return 'Type marks out of $max. Next on the keypad moves to the next student.';
  }

  @override
  String get columnStudent => 'Student';

  @override
  String outOfN(String max) {
    return 'Out of $max';
  }

  @override
  String get editRemark => 'Edit remark';

  @override
  String get addRemark => 'Add remark';

  @override
  String get absentShort => 'AB';

  @override
  String marksOverMax(int count, String max) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count marks are more than $max',
      one: 'One mark is more than $max',
    );
    return '$_temp0';
  }

  @override
  String get notSavedYet => 'Not saved yet';

  @override
  String get publishedFamiliesSee => 'Published · families can see these marks';

  @override
  String get typeMarksThenSave => 'Type marks, then Save';

  @override
  String get savedOnlyYou => 'Saved · only you can see these marks';

  @override
  String remarkFor(String name) {
    return 'Remark for $name';
  }

  @override
  String get remarkFamiliesSee => 'Families see it with the marks.';

  @override
  String get remarkHint => 'e.g. Neat working; revise journal entries';

  @override
  String get noMessages => 'No messages yet.\nWrite to a student’s parent with New message, or wait for families to write to you.';

  @override
  String get noMessagesPreview => 'No messages yet';

  @override
  String aboutParent(String student, String className) {
    return 'Parent of $student · $className';
  }

  @override
  String aboutStudent(String className) {
    return 'Student · $className';
  }

  @override
  String get pullForEarlier => 'Pull down for earlier messages';

  @override
  String chatTop(String student, String family) {
    return 'Messages about $student with $family';
  }

  @override
  String get notSentRetry => 'Not sent · tap to retry';

  @override
  String get sending => 'Sending…';

  @override
  String get messageCopied => 'Message copied';

  @override
  String messageHint(String name) {
    return 'Message $name';
  }

  @override
  String writeToFamily(String student) {
    return 'Write to $student’s family';
  }

  @override
  String get threadPrivacy => 'The thread is between you and the person you choose. School leaders can review it.';

  @override
  String get relationFather => 'Father';

  @override
  String get relationMother => 'Mother';

  @override
  String get relationGuardian => 'Guardian';

  @override
  String get relationParent => 'Parent';

  @override
  String get searchStudents => 'Search by name or roll number';

  @override
  String get noStudentsTaught => 'No students in the classes you teach yet';

  @override
  String noStudentMatches(String query) {
    return 'No student matches “$query”';
  }

  @override
  String get noGuardianOnRecord => 'No parent or guardian on record';

  @override
  String get shareTitle => 'Share with the class?';

  @override
  String shareBody(String className, String title) {
    return 'Students of $className and their families can watch \"$title\" in their apps. Families of students who were absent get a notification.';
  }

  @override
  String sharedWith(String className) {
    return 'Shared with $className';
  }

  @override
  String get noRecordings =>
      'No recordings yet.\nTap Record on the board during class. The lesson shows up here once the board uploads it.';

  @override
  String get uploading => 'Uploading';

  @override
  String get sharedWithClass => 'Shared with class';

  @override
  String get noClass => 'No class';

  @override
  String get notShared => 'Not shared';

  @override
  String get preparingTranscript => 'Preparing transcript';

  @override
  String get transcriptReady => 'Transcript ready';

  @override
  String get noTranscript => 'No transcript';

  @override
  String get noSound => 'No sound';

  @override
  String get notLinkedToClass => 'Not linked to a class';

  @override
  String get play => 'Play';

  @override
  String get shareWithClass => 'Share with class';

  @override
  String get durationUnderMinute => 'Under a minute';

  @override
  String durationMinutes(int minutes) {
    return '$minutes min';
  }

  @override
  String durationHours(int hours) {
    return '$hours h';
  }

  @override
  String durationHoursMinutes(int hours, int minutes) {
    return '$hours h $minutes min';
  }

  @override
  String get signOutTitle => 'Sign out?';

  @override
  String get signOutBody => 'You will need your password to sign in again.';

  @override
  String get signOut => 'Sign out';

  @override
  String comingLater(String feature) {
    return '$feature is coming in a later update';
  }

  @override
  String get account => 'Account';

  @override
  String get institution => 'Institution';

  @override
  String get language => 'Language';

  @override
  String get server => 'Server';

  @override
  String get comingSoon => 'Coming soon';

  @override
  String get announcements => 'Announcements';

  @override
  String get announcementsBody => 'Send notices to your classes';

  @override
  String get studentDoubts => 'Student doubts';

  @override
  String get studentDoubtsBody => 'Answer questions from students';

  @override
  String get mcqTests => 'MCQ tests';

  @override
  String get mcqTestsBody => 'Online tests that sync to board quizzes';

  @override
  String get roleAdmin => 'Admin';

  @override
  String get rolePrincipal => 'Principal';

  @override
  String get roleHod => 'Head of department';

  @override
  String get roleTeacher => 'Teacher';

  @override
  String get roleStudent => 'Student';

  @override
  String get roleParent => 'Parent';

  @override
  String get roleLibrarian => 'Librarian';

  @override
  String get roleAccountant => 'Accountant';

  @override
  String get languageSaveFailed => 'Language changed on this phone. It will be saved to your account next time you are online.';

  @override
  String holidayNoClasses(String title) {
    return 'Holiday: $title. No classes.';
  }

  @override
  String get teaching => 'Teaching';

  @override
  String get calendar => 'Calendar';

  @override
  String get calendarBody => 'Holidays, exams and events';

  @override
  String get calendarHoliday => 'Holiday';

  @override
  String get calendarExam => 'Exam';

  @override
  String get calendarEvent => 'Event';

  @override
  String get calendarEmpty => 'Nothing on the calendar for the next six months.';

  @override
  String calendarFor(String programs) {
    return 'For $programs';
  }

  @override
  String get syllabus => 'Syllabus';

  @override
  String get syllabusProgress => 'Syllabus progress';

  @override
  String get syllabusProgressBody => 'Mark topics as taught for each class';

  @override
  String get syllabusUnlinked => 'This subject isn\'t linked to a syllabus yet. Your admin can link it in KINETIX ERP → Syllabus.';

  @override
  String topicsTaught(int covered, int total) {
    return '$covered of $total topics taught';
  }

  @override
  String chapterTaught(int covered, int total) {
    return '$covered/$total';
  }

  @override
  String taughtOn(String date) {
    return 'Taught $date';
  }

  @override
  String taughtOnBy(String date, String name) {
    return 'Taught $date · $name';
  }

  @override
  String get taughtOnWhichDay => 'Taught on which day?';

  @override
  String get topicVideosTooltip => 'Videos for this topic';

  @override
  String get topicVideosTitle => 'Videos for this class';

  @override
  String get topicVideoLink => 'YouTube link';

  @override
  String get topicVideoLinkHelp =>
      'Paste a link. The title comes from YouTube. Only this class sees it until the principal approves sharing it.';

  @override
  String get topicVideoAdd => 'Add video';

  @override
  String get topicVideoAdded => 'Video added for this class';

  @override
  String get topicVideoNotAdded => 'Couldn\'t add that video. Check the link and try again.';

  @override
  String get topicVideoNone => 'You haven\'t added videos to this topic yet.';

  @override
  String get topicVideoShare => 'Ask to share with everyone';

  @override
  String get topicVideoShareSent => 'Sent to the principal for approval';

  @override
  String get topicVideoStatusNone => 'This class only';

  @override
  String get topicVideoStatusPending => 'Waiting for approval';

  @override
  String get topicVideoStatusApproved => 'Shared with everyone';

  @override
  String get topicVideoStatusRejected => 'Not approved';

  @override
  String get topicVideoRemove => 'Remove video';

  @override
  String get topicMarked => 'Marked as taught';

  @override
  String get topicUnmarked => 'Marked as not taught';

  @override
  String get noClassesAssigned => 'You don\'t teach any classes yet.';

  @override
  String get submissions => 'Submissions';

  @override
  String get statusHandedIn => 'Handed in';

  @override
  String get statusChecked => 'Checked';

  @override
  String get statusReturned => 'Returned';

  @override
  String get statusNotHandedIn => 'Not handed in';

  @override
  String handedInAt(String when) {
    return 'Handed in $when';
  }

  @override
  String get answer => 'Answer';

  @override
  String get photosAndFiles => 'Photos and files';

  @override
  String get openPdf => 'Open PDF';

  @override
  String get couldNotOpenFile => 'Couldn\'t open this file. Install an app that opens PDFs.';

  @override
  String get remarkOptional => 'Remark (optional)';

  @override
  String get reviewRemarkHint => 'e.g. Good work, or what to redo';

  @override
  String get returnWork => 'Return to redo';

  @override
  String get checkWork => 'Mark as checked';

  @override
  String get reviewNotifies => 'The student and their family are told, with your remark.';

  @override
  String workChecked(String name) {
    return '$name\'s homework marked as checked';
  }

  @override
  String workReturned(String name) {
    return '$name\'s homework returned to redo';
  }

  @override
  String photoOf(int index, int count) {
    return 'Photo $index of $count';
  }

  @override
  String get errorNothingHandedIn => 'Nothing has been handed in yet';

  @override
  String get errorTopicNotInSyllabus => 'That topic is not in this subject\'s syllabus';

  @override
  String get errorFutureCoverage => 'A topic cannot be marked as taught in the future';

  @override
  String get errorValidation => 'Some details are not right. Check them and try again.';

  @override
  String get yearPlan => 'Year plan';

  @override
  String get yearPlanNone =>
      'No year plan yet. KINETIX can spread this subject\'s syllabus over the weeks of the term, using your timetable and skipping holidays and exams. You can move topics afterwards.';

  @override
  String get makeYearPlan => 'Make a year plan';

  @override
  String get makePlan => 'Make plan';

  @override
  String get remakeYearPlan => 'Remake plan';

  @override
  String get remakeYearPlanTitle => 'Remake the year plan?';

  @override
  String get remakeYearPlanBody =>
      'All weeks will be planned again from the dates you choose, and topics you moved go back. Topics already taught stay taught.';

  @override
  String get remake => 'Remake';

  @override
  String get planDatesNote => 'Unless you change them, the plan covers 16 weeks from today, up to the end of the academic year.';

  @override
  String get planStartsOn => 'Starts on';

  @override
  String get planEndsOn => 'Ends on';

  @override
  String get yearPlanMade => 'Year plan made';

  @override
  String get yearPlanUpdated => 'Plan updated';

  @override
  String get planNotStarted => 'Not started';

  @override
  String get planOnTrack => 'On track';

  @override
  String get planAhead => 'Ahead of plan';

  @override
  String planBehindBy(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Behind by $count topics', one: 'Behind by 1 topic');
    return '$_temp0';
  }

  @override
  String weekOf(String date) {
    return 'Week of $date';
  }

  @override
  String get thisWeek => 'This week';

  @override
  String periodsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count periods', one: '1 period');
    return '$_temp0';
  }

  @override
  String get planLate => 'Late';

  @override
  String get changeWeek => 'Change week or periods';

  @override
  String get planWeek => 'Week';

  @override
  String get planPeriods => 'Periods';

  @override
  String get fewerPeriods => 'Fewer periods';

  @override
  String get morePeriods => 'More periods';

  @override
  String get planLesson => 'Plan';

  @override
  String get lessonPlanned => 'Planned';

  @override
  String get lessonPlan => 'Lesson plan';

  @override
  String get lessonTopics => 'Topics';

  @override
  String get noTopicsChosen => 'No topics chosen';

  @override
  String get chooseTopics => 'Choose topics';

  @override
  String get suggestedThisWeek => 'In the year plan for this week';

  @override
  String get lessonObjectives => 'Objectives';

  @override
  String get objectiveHint => 'Students will be able to…';

  @override
  String get addObjective => 'Add objective';

  @override
  String get lessonSteps => 'Steps';

  @override
  String get stepHint => 'What happens in this step';

  @override
  String get addStep => 'Add step';

  @override
  String get minutesShortLabel => 'Min';

  @override
  String stepsTotal(int planned, int length) {
    return '$planned of $length min';
  }

  @override
  String stepsOver(int planned, int length) {
    return '$planned min, period is $length';
  }

  @override
  String get moveUp => 'Move up';

  @override
  String get moveDown => 'Move down';

  @override
  String get moreOptions => 'More options';

  @override
  String get lessonMaterials => 'Materials';

  @override
  String get materialHint => 'e.g. chart paper, textbook p. 42';

  @override
  String get addMaterial => 'Add material';

  @override
  String get lessonCheck => 'Check understanding';

  @override
  String get lessonCheckHint => 'How you will check what students learnt';

  @override
  String get lessonHomework => 'Homework';

  @override
  String get lessonHomeworkHint => 'Optional';

  @override
  String get draftWithAi => 'Draft with KINETIX AI';

  @override
  String get drafting => 'KINETIX AI is drafting…';

  @override
  String get replaceWithDraftTitle => 'Replace with a KINETIX AI draft?';

  @override
  String get replaceWithDraftBody =>
      'The topics, objectives, steps, materials and check in this plan will be replaced. Your homework is kept.';

  @override
  String get replace => 'Replace';

  @override
  String get aiDraftLabel => 'AI draft — check before use';

  @override
  String get aiPreviewNote => 'Preview: a sample draft, because the KINETIX AI server is not connected.';

  @override
  String get savePlan => 'Save plan';

  @override
  String get lessonPlanSaved => 'Lesson plan saved';

  @override
  String reviewedOn(String date) {
    return 'Reviewed on $date';
  }

  @override
  String get reviewRemark => 'Remark from your head of department';

  @override
  String get discardPlanBody => 'Your lesson plan has changes that are not saved yet.';

  @override
  String get errorPlanNoSyllabus => 'This subject has no syllabus yet. Ask your administrator to link it to a course.';

  @override
  String get errorPlanNoPeriods => 'This subject has no periods in the timetable for this class.';

  @override
  String get errorPlanNoTeachingDays => 'There are no teaching days between these dates.';

  @override
  String get errorPlanEndsBeforeStart => 'The end date must be after the start date.';

  @override
  String get errorPeriodNotOnDay => 'This class is not on that day.';

  @override
  String get errorAiAllowance => 'Your institution has used today\'s KINETIX AI allowance. It resets tomorrow.';

  @override
  String get errorAiUnavailable => 'KINETIX AI is not reachable right now. Try again in a minute.';

  @override
  String get errorAiUnusable => 'KINETIX AI could not write a usable draft. Try again.';

  @override
  String reviewedByOn(String name, String date) {
    return 'Reviewed by $name on $date';
  }

  @override
  String get signInWithPhone => 'Sign in with phone';

  @override
  String get signInWithPassword => 'Sign in with password';

  @override
  String get phoneSignInSubtitle => 'We\'ll text a 6-digit code to your registered mobile number';

  @override
  String get mobileNumber => 'Mobile number';

  @override
  String get enterMobileNumber => 'Enter your mobile number';

  @override
  String get invalidMobileNumber => 'Enter a valid 10-digit mobile number';

  @override
  String get sendCode => 'Send code';

  @override
  String otpSentTo(String phone) {
    return 'Enter the 6-digit code sent to $phone';
  }

  @override
  String get otpCode => 'Sign-in code';

  @override
  String get enterOtp => 'Enter the 6-digit code';

  @override
  String resendCodeIn(String time) {
    return 'Resend code in $time';
  }

  @override
  String get resendCode => 'Resend code';

  @override
  String get codeResent => 'New code sent';

  @override
  String get changeNumber => 'Change number';

  @override
  String get errorOtpInvalid => 'That code is wrong or has expired. Check the SMS or send a new code.';

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
  String get recordingKept => 'Kept';

  @override
  String recordingDeletedOn(String date) {
    return 'Deleted on $date';
  }

  @override
  String get keepRecording => 'Keep';

  @override
  String get dontKeepRecording => 'Don\'t keep';

  @override
  String get keepRecordingTooltip => 'Kept recordings are not deleted when the term ends';

  @override
  String get phoneRemote => 'Phone remote';

  @override
  String remoteTitle(String board) {
    return 'Remote · $board';
  }

  @override
  String get remoteEnded => 'The class on this board has ended.';

  @override
  String get remotePhotoSent => 'Photo is on the board.';

  @override
  String get remotePhotoFailed => 'Could not send the photo. Try again.';

  @override
  String get remotePages => 'Board pages';

  @override
  String get remotePrevious => 'Previous';

  @override
  String get remoteNext => 'Next';

  @override
  String remotePageOf(int page, int pages) {
    return 'Page $page of $pages';
  }

  @override
  String get remoteSlides => 'Slides and PDF';

  @override
  String get remoteNoSlides => 'Open slides or a PDF on the board to turn them from here.';

  @override
  String remoteSlideOf(int slide, int slides) {
    return 'Slide $slide of $slides';
  }

  @override
  String get remotePointer => 'Pointer';

  @override
  String get remotePointerHint => 'Slide your finger here to point on the board';

  @override
  String get remoteClassroom => 'Classroom tools';

  @override
  String remoteTimerMinutes(int minutes) {
    return '$minutes min timer';
  }

  @override
  String get remoteTimerStop => 'Stop timer';

  @override
  String get remotePickStudent => 'Pick a student';

  @override
  String get remoteShowPhoto => 'Show a photo';

  @override
  String get remoteStartRecording => 'Record lesson';

  @override
  String get remoteStopRecording => 'Stop recording';

  @override
  String get answerCards => 'Answer cards';

  @override
  String get answerCardsMenuBody => 'Print cards so students without phones can answer on the board';

  @override
  String get answerCardsBody =>
      'Each student gets one card, numbered by roll number. In \"Ask the class\" on the board they hold it up with their answer on top, and the board reads the whole class from one photo.';

  @override
  String get answerCardsPrintHint => 'Hold the card with your answer at the top. Keep your fingers off the black pattern.';

  @override
  String answerCardsReady(int count, String className) {
    return '$count cards for $className are ready to print.';
  }

  @override
  String get answerCardsFailed => 'Could not make the cards. Try again.';

  @override
  String get print => 'Print';

  @override
  String get filterMissing => 'Missing';

  @override
  String remindMissing(int count) {
    return 'Remind the $count';
  }

  @override
  String remindTitle(int count) {
    return 'Remind $count students?';
  }

  @override
  String get remindBody => 'They and their families get a notification that this homework is not handed in yet.';

  @override
  String get remind => 'Remind';

  @override
  String reminded(int count) {
    return 'Reminded $count students and their families';
  }

  @override
  String get noneInFilter => 'No students here';

  @override
  String get classAndSubject => 'Class and subject';

  @override
  String get classRoster => 'Class roster';

  @override
  String get classRosterBody => 'Your students; award badges';

  @override
  String get chooseClass => 'Choose a class';

  @override
  String get driverMode => 'Driver mode';

  @override
  String get driverModeBody => 'Start a bus trip and share the bus location';

  @override
  String get driverNoRoutes => 'No route is assigned to you yet. Ask the transport office.';

  @override
  String get driverRoute => 'Route';

  @override
  String get driverDirection => 'Direction';

  @override
  String get driverPickup => 'Pickup (to school)';

  @override
  String get driverDrop => 'Drop (home)';

  @override
  String get driverStart => 'Start trip';

  @override
  String get driverEnd => 'End trip';

  @override
  String get driverRunning => 'Trip running';

  @override
  String get driverTripEnded => 'Trip ended';

  @override
  String get driverNextStops => 'Next stops';

  @override
  String get driverNoMoreStops => 'No more stops';

  @override
  String driverLastSent(Object time) {
    return 'Location sent at $time';
  }

  @override
  String get driverWaitingGps => 'Waiting for GPS...';

  @override
  String get driverLocationDenied => 'Location permission is needed to share the bus location. Allow it in Settings.';

  @override
  String get driverLocationOff => 'Turn on the phone location (GPS) to start the trip.';

  @override
  String get driverSendFailing => 'Cannot reach the server. Still trying...';

  @override
  String get driverKeepOpen => 'Keep this screen open while the bus is moving.';

  @override
  String driverVehicle(Object regNo) {
    return 'Bus $regNo';
  }

  @override
  String get workSection => 'Work';

  @override
  String get leaveTitle => 'Leave';

  @override
  String get leaveBody => 'Balances, apply and approvals';

  @override
  String get checkInTitle => 'Check-in';

  @override
  String get checkInBody => 'Mark your day and see your month';

  @override
  String get payslipsTitle => 'Payslips';

  @override
  String get payslipsBody => 'Your monthly salary slips';

  @override
  String get leaveMine => 'My leave';

  @override
  String get leaveApprovals => 'To approve';

  @override
  String get leaveBalances => 'Balances';

  @override
  String get leaveApply => 'Apply for leave';

  @override
  String get leaveType => 'Leave type';

  @override
  String get leaveFrom => 'From';

  @override
  String get leaveTo => 'To';

  @override
  String get leaveHalfDay => 'Half day';

  @override
  String get leaveReason => 'Reason (optional)';

  @override
  String get leaveSubmit => 'Submit';

  @override
  String leaveDaysCount(String days) {
    return 'Working days: $days';
  }

  @override
  String leaveAvailable(String days) {
    return '$days left';
  }

  @override
  String leaveDaysLabel(String days) {
    return '$days days';
  }

  @override
  String get leaveNone => 'No leave requests yet.';

  @override
  String get leaveNoApprovals => 'Nothing is waiting for your decision.';

  @override
  String get leaveCancelAction => 'Cancel request';

  @override
  String get leaveApprove => 'Approve';

  @override
  String get leaveReject => 'Reject';

  @override
  String get leaveDecisionNote => 'Note (optional)';

  @override
  String get leaveStatusPending => 'Pending';

  @override
  String get leaveStatusApproved => 'Approved';

  @override
  String get leaveStatusRejected => 'Rejected';

  @override
  String get leaveStatusCancelled => 'Cancelled';

  @override
  String get checkInButton => 'Check in';

  @override
  String get checkOutButton => 'Check out';

  @override
  String checkedInAt(String time) {
    return 'Checked in at $time';
  }

  @override
  String checkedOutAt(String time) {
    return 'Checked out at $time';
  }

  @override
  String get notCheckedIn => 'You have not checked in today.';

  @override
  String get attendanceMonth => 'This month';

  @override
  String get attStatusPresent => 'Present';

  @override
  String get attStatusAbsent => 'Absent';

  @override
  String get attStatusHalfDay => 'Half day';

  @override
  String get attStatusOnLeave => 'On leave';

  @override
  String get payslipNet => 'Net pay';

  @override
  String get payslipGross => 'Gross';

  @override
  String get payslipEarnings => 'Earnings';

  @override
  String get payslipDeductions => 'Deductions';

  @override
  String payslipDays(String paid, String lop) {
    return 'Paid days $paid, loss of pay $lop';
  }

  @override
  String get payslipOpenPdf => 'Open PDF';

  @override
  String get payslipsEmpty => 'No payslips yet. They appear when payroll is finalised.';

  @override
  String get roleHr => 'HR manager';

  @override
  String get navHome => 'Home';

  @override
  String get navClasses => 'Classes';

  @override
  String get navStudents => 'Students';

  @override
  String get navMore => 'More';

  @override
  String get homeSubtitle => 'Let\'s make today a great day!';

  @override
  String get viewAll => 'View all';

  @override
  String get startClass => 'Start class';

  @override
  String get quickActions => 'Quick actions';

  @override
  String get qaAttendance => 'Attendance';

  @override
  String get qaAssignment => 'Assignment';

  @override
  String get qaQuiz => 'Quiz';

  @override
  String get qaSmartboard => 'Smartboard';

  @override
  String get qaStudyMaterial => 'Study material';

  @override
  String get qaAiAssistant => 'AI Assistant';

  @override
  String get pendingApprovals => 'Pending approvals';

  @override
  String get allCaughtUp => 'Nothing waiting for you.';

  @override
  String get pickAClass => 'Choose a class';

  @override
  String leaveRequestLine(String type, String days) {
    return '$type: $days day(s)';
  }

  @override
  String get workToolsSection => 'Staff tools';

  @override
  String get tasksTitle => 'Tasks';

  @override
  String get tasksBody => 'What is assigned to you and what you asked of others';

  @override
  String get requestsTitle => 'Requests and approvals';

  @override
  String get requestsBody => 'Start a request, track it and decide what waits for you';

  @override
  String get subsTitle => 'Substitutions';

  @override
  String get subsBody => 'Periods you cover for colleagues';

  @override
  String get dutiesTitle => 'Invigilation duties';

  @override
  String get dutiesBody => 'Your exam hall duties';

  @override
  String get evalTitle => 'Evaluation desk';

  @override
  String get evalBody => 'Value the answer scripts allocated to you';

  @override
  String get mentoringTitle => 'Mentoring';

  @override
  String get mentoringBody => 'Your mentees, sessions and plans';

  @override
  String get courseRosterTitle => 'Course rosters';

  @override
  String get courseRosterBody => 'Who registered for the courses you teach';

  @override
  String get surveysTitle => 'Surveys';

  @override
  String get surveysBody => 'Surveys waiting for your answers';

  @override
  String get clubsTitle => 'Clubs I coordinate';

  @override
  String get clubsBody => 'Members and points of your clubs';

  @override
  String get tasksMineTab => 'Assigned to me';

  @override
  String get tasksByMeTab => 'Assigned by me';

  @override
  String get tasksEmpty => 'No open tasks.';

  @override
  String taskFrom(String name) {
    return 'From $name';
  }

  @override
  String taskTo(String name) {
    return 'To $name';
  }

  @override
  String taskDue(String when) {
    return 'Due $when';
  }

  @override
  String get taskOverdue => 'Overdue';

  @override
  String get taskStatusOpen => 'Open';

  @override
  String get taskStatusInProgress => 'In progress';

  @override
  String get taskStatusDone => 'Done';

  @override
  String get taskStatusCancelled => 'Cancelled';

  @override
  String get taskStart => 'Start';

  @override
  String get taskMarkDone => 'Mark done';

  @override
  String get taskCancelAction => 'Cancel task';

  @override
  String get taskPriorityHigh => 'High priority';

  @override
  String get taskPriorityUrgent => 'Urgent';

  @override
  String get requestsInboxTab => 'Waiting for me';

  @override
  String get requestsMineTab => 'My requests';

  @override
  String get requestsStart => 'New request';

  @override
  String get requestsInboxEmpty => 'Nothing is waiting for your decision.';

  @override
  String get requestsMineEmpty => 'You have not made any requests.';

  @override
  String requestStep(String n, String total, String name) {
    return 'Step $n of $total · $name';
  }

  @override
  String requestBy(String name) {
    return 'By $name';
  }

  @override
  String get reqStatusPending => 'Pending';

  @override
  String get reqStatusApproved => 'Approved';

  @override
  String get reqStatusRejected => 'Rejected';

  @override
  String get reqStatusReturned => 'Returned';

  @override
  String get reqStatusCancelled => 'Withdrawn';

  @override
  String get requestApprove => 'Approve';

  @override
  String get requestReject => 'Reject';

  @override
  String get requestReturn => 'Return for changes';

  @override
  String get requestComment => 'Comment (optional)';

  @override
  String get requestWithdraw => 'Withdraw request';

  @override
  String get requestHistory => 'History';

  @override
  String get requestAmountLabel => 'Amount (₹)';

  @override
  String get requestTitleLabel => 'Title';

  @override
  String get requestKindLabel => 'Kind of request';

  @override
  String get requestSubmit => 'Send request';

  @override
  String get requestNoRoutes => 'No request types have been set up yet.';

  @override
  String requestFieldNeeded(String field) {
    return 'Fill in $field';
  }

  @override
  String get requestActionSubmitted => 'Submitted';

  @override
  String get requestActionResubmitted => 'Sent again';

  @override
  String get subsEmpty => 'You are not covering any periods in the next two weeks.';

  @override
  String subsFor(String name) {
    return 'Covering for $name';
  }

  @override
  String get dutiesEmpty => 'No invigilation duties assigned to you.';

  @override
  String get dutyRoleChief => 'Chief invigilator';

  @override
  String get dutyRoleInvigilator => 'Invigilator';

  @override
  String get evalEmpty => 'No scripts are allocated to you.';

  @override
  String evalScript(String no) {
    return 'Script $no';
  }

  @override
  String evalRound(String n) {
    return 'Valuation $n';
  }

  @override
  String get evalStatusTodo => 'To do';

  @override
  String get evalStatusSubmitted => 'Submitted';

  @override
  String evalTotal(String total) {
    return 'Total $total';
  }

  @override
  String evalQuestionLabel(String no, String max) {
    return 'Question $no (out of $max)';
  }

  @override
  String get evalMarksLabel => 'Marks';

  @override
  String get evalCommentLabel => 'Comment';

  @override
  String get evalSave => 'Save marks';

  @override
  String get evalSavedMsg => 'Marks saved';

  @override
  String get evalSubmit => 'Submit valuation';

  @override
  String get evalSubmitConfirm => 'Submit this valuation? You cannot change the marks afterwards.';

  @override
  String evalSubmittedMsg(String total) {
    return 'Valuation submitted. Total $total.';
  }

  @override
  String get evalThirdNeeded => 'The two valuations differ a lot, so a third valuation will be arranged.';

  @override
  String evalOverMax(String max) {
    return 'At most $max';
  }

  @override
  String get evalMissing => 'Enter marks for every question (0 where nothing was written).';

  @override
  String get evalLockedMsg => 'This valuation is submitted and cannot be changed.';

  @override
  String evalPageLabel(String n, String total) {
    return 'Page $n of $total';
  }

  @override
  String get evalNoPages => 'This script has no pages.';

  @override
  String get menteesEmpty => 'You have no mentees.';

  @override
  String get riskHigh => 'High risk';

  @override
  String get riskMedium => 'Medium risk';

  @override
  String get riskLow => 'Low risk';

  @override
  String get riskNone => 'On track';

  @override
  String menteeAttendance(String pct) {
    return 'Attendance $pct%';
  }

  @override
  String menteeFailing(String n) {
    return '$n failed tests';
  }

  @override
  String menteeFees(String n) {
    return '$n overdue fees';
  }

  @override
  String menteeCases(String n) {
    return '$n open cases';
  }

  @override
  String get mentorLogSession => 'Log session';

  @override
  String get mentorSessions => 'Sessions';

  @override
  String get mentorPlans => 'Intervention plans';

  @override
  String get sessionModeInPerson => 'In person';

  @override
  String get sessionModePhone => 'Phone';

  @override
  String get sessionModeOnline => 'Online';

  @override
  String get sessionModeLabel => 'How you met';

  @override
  String get sessionSummary => 'Summary';

  @override
  String get sessionNotes => 'Private notes (only you, the head of department and the counsellor see these)';

  @override
  String get sessionFollowUp => 'Follow up on';

  @override
  String get sessionSave => 'Save session';

  @override
  String get sessionsNone => 'No sessions yet.';

  @override
  String get plansNone => 'No plans yet.';

  @override
  String get planNew => 'New plan';

  @override
  String get planGoal => 'Goal';

  @override
  String get planActionsLabel => 'Actions (one per line)';

  @override
  String get planReviewLabel => 'Review on';

  @override
  String get planCreate => 'Create plan';

  @override
  String get planClose => 'Close plan';

  @override
  String get planOutcome => 'Outcome';

  @override
  String get planRatingImproved => 'Improved';

  @override
  String get planRatingNoChange => 'No change';

  @override
  String get planRatingWorsened => 'Worsened';

  @override
  String planReviewOn(String date) {
    return 'Review on $date';
  }

  @override
  String get planClosed => 'Closed';

  @override
  String get rosterTermLabel => 'Term';

  @override
  String get rosterNoTerms => 'No terms found.';

  @override
  String get rosterNoOfferings => 'You are not the faculty of any course in this term.';

  @override
  String rosterCounts(String reg, String wait) {
    return '$reg registered, $wait on the waitlist';
  }

  @override
  String rosterWaitlist(String pos) {
    return 'Waitlist $pos';
  }

  @override
  String get rosterEmpty => 'Nobody has registered yet.';

  @override
  String get surveysEmpty => 'No surveys are waiting for you.';

  @override
  String get surveyAnonymous => 'Anonymous';

  @override
  String surveyClosesOn(String when) {
    return 'Closes $when';
  }

  @override
  String get surveyAnswered => 'Answered';

  @override
  String get surveySubmit => 'Send answers';

  @override
  String get surveyThanks => 'Thank you, your answers were sent.';

  @override
  String get surveyRequired => 'Answer every required question.';

  @override
  String get surveyAnswerHint => 'Your answer';

  @override
  String get clubsEmpty => 'You do not coordinate any clubs.';

  @override
  String clubMembersCount(String n) {
    return '$n members';
  }

  @override
  String clubPendingCount(String n) {
    return '$n requests waiting';
  }

  @override
  String clubPoints(String n) {
    return '$n points';
  }

  @override
  String get clubNoMembers => 'No members yet.';

  @override
  String get insightsTitle => 'Student insights';

  @override
  String get insightsBody => 'Attendance, marks and risk flags for a class';

  @override
  String get insightsAttendance => 'Attendance';

  @override
  String get insightsMarks => 'Marks average';

  @override
  String get insightsFlagged => 'Need attention';

  @override
  String insightsAttendanceValue(String value) {
    return 'Attendance $value';
  }

  @override
  String insightsMarksValue(String value) {
    return 'Marks $value';
  }

  @override
  String get copilotTitle => 'AI copilot';

  @override
  String get copilotBody => 'Draft explanations, quizzes, homework and lesson plans';

  @override
  String get copilotExplain => 'Explain';

  @override
  String get copilotQuiz => 'Quiz';

  @override
  String get copilotHomework => 'Homework';

  @override
  String get copilotLessonPlan => 'Lesson plan';

  @override
  String get copilotQuestionLabel => 'What do you want explained?';

  @override
  String get copilotTopicLabel => 'Topic';

  @override
  String copilotHowMany(int n) {
    return 'Questions: $n';
  }

  @override
  String copilotMinutes(int n) {
    return 'Minutes: $n';
  }

  @override
  String get copilotGenerate => 'Generate draft';

  @override
  String get copilotDraftNote => 'AI draft. Check it before you use it; nothing is sent to students from here.';

  @override
  String get copilotSampleDraft => 'Sample only: no AI model is connected to this school\'s server yet. Check everything before use.';

  @override
  String get copilotKeyPoints => 'Key points';

  @override
  String get copilotFollowUps => 'Students may ask next';

  @override
  String get copilotQuestions => 'Questions';

  @override
  String get copilotObjectives => 'Objectives';

  @override
  String get copilotSteps => 'Steps';

  @override
  String get copilotMaterials => 'Materials';

  @override
  String get copilotAssessment => 'Assessment';

  @override
  String get copilotCopy => 'Copy draft';

  @override
  String get copilotCopied => 'Draft copied.';

  @override
  String get evalToolTick => 'Tick';

  @override
  String get evalToolCross => 'Cross';

  @override
  String get evalToolComment => 'Comment';

  @override
  String get evalMarksOnPage => 'Marks on script';

  @override
  String get evalEarlierNote => 'Faint marks are from earlier valuations.';

  @override
  String get evalCommentPrompt => 'Comment on this spot';

  @override
  String get evalAddMark => 'Add';

  @override
  String get appraisalTitle => 'Self-appraisal';

  @override
  String get appraisalBody => 'Fill in and submit your yearly self-appraisal';

  @override
  String get appraisalNoCycle => 'No appraisal cycle is open right now.';

  @override
  String get appraisalCycle => 'Cycle';

  @override
  String get appraisalMax => 'max';

  @override
  String get appraisalScore => 'Score';

  @override
  String get appraisalEvidence => 'Evidence';

  @override
  String appraisalOverMax(String max) {
    return 'Score must be between 0 and $max';
  }

  @override
  String get appraisalNeedScore => 'Enter at least one score.';

  @override
  String get appraisalSubmitted => 'Appraisal submitted for review.';

  @override
  String get appraisalSaved => 'Draft saved.';

  @override
  String get appraisalLocked => 'Your appraisal is submitted and can no longer be changed.';

  @override
  String get appraisalSelfPercent => 'Self score';

  @override
  String get appraisalSaveDraft => 'Save draft';

  @override
  String get appraisalSubmit => 'Submit appraisal';

  @override
  String get housesTitle => 'Houses';

  @override
  String get housesBody => 'Leaderboard and house points';

  @override
  String get housesEmpty => 'No houses are set up yet.';

  @override
  String get housesMembers => 'members';

  @override
  String get houseStudent => 'Student (optional)';

  @override
  String get houseWholeHouse => 'Whole house';

  @override
  String get housePoints => 'Points (minus to deduct)';

  @override
  String get houseCategory => 'Category';

  @override
  String get houseReason => 'Reason';

  @override
  String get houseAward => 'Award points';

  @override
  String get housePointsRange => 'Enter points from -100 to 100, not zero.';

  @override
  String get houseReasonNeeded => 'Give a reason of at least 3 characters.';

  @override
  String get housePointsSaved => 'Points recorded.';

  @override
  String get houseCatGeneral => 'General';

  @override
  String get houseCatAcademics => 'Academics';

  @override
  String get houseCatSports => 'Sports';

  @override
  String get houseCatArts => 'Arts';

  @override
  String get houseCatDiscipline => 'Discipline';

  @override
  String get houseCatService => 'Service';

  @override
  String get curriculumTitle => 'Curriculum';

  @override
  String get curriculumBody => 'Active syllabus, units and course outcomes';

  @override
  String get curriculumEmpty => 'No active curriculum yet.';

  @override
  String get curriculumNoSubjects => 'This version has no subjects.';

  @override
  String get curriculumUnits => 'Units';

  @override
  String get curriculumOutcomes => 'Course outcomes';
}

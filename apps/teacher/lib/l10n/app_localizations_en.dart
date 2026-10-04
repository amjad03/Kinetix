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
}

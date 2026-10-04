// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'KINETIX Board';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get share => 'Share';

  @override
  String get close => 'Close';

  @override
  String get done => 'Done';

  @override
  String get ok => 'OK';

  @override
  String get open => 'Open';

  @override
  String get discard => 'Discard';

  @override
  String get keep => 'Keep';

  @override
  String get tryAgain => 'Try again';

  @override
  String get retry => 'Retry';

  @override
  String get back => 'Back';

  @override
  String get clear => 'Clear';

  @override
  String get regenerate => 'Regenerate';

  @override
  String get titleLabel => 'Title';

  @override
  String get topicLabel => 'Topic';

  @override
  String get soon => 'Soon';

  @override
  String comingSoonFeature(String feature) {
    return '$feature is coming in an upcoming build.';
  }

  @override
  String get guest => 'Guest';

  @override
  String get practiceBoard => 'Practice board';

  @override
  String get noClassTimetabled => 'No class is timetabled now';

  @override
  String goesTo(String section) {
    return 'Goes to $section';
  }

  @override
  String minutesShort(int minutes) {
    return '$minutes min';
  }

  @override
  String get today => 'Today';

  @override
  String get tomorrow => 'Tomorrow';

  @override
  String requestFailed(int status) {
    return 'Request failed ($status)';
  }

  @override
  String get cloudUnreachable => 'Could not reach KINETIX Cloud';

  @override
  String get toolRecord => 'Record';

  @override
  String get toolStop => 'Stop';

  @override
  String get toolTheme => 'Theme';

  @override
  String get toolWrite => 'Write';

  @override
  String get toolErase => 'Erase';

  @override
  String get toolSelect => 'Select';

  @override
  String get toolShapes => 'Shapes';

  @override
  String get toolTools => 'Tools';

  @override
  String get toolUndo => 'Undo';

  @override
  String get toolRedo => 'Redo';

  @override
  String get toolAi => 'AI';

  @override
  String get toolBooks => 'Books';

  @override
  String get toolQuiz => 'Quiz';

  @override
  String get toolHomework => 'Homework';

  @override
  String get toolSwitch => 'Switch';

  @override
  String get toolHide => 'Hide';

  @override
  String get toolPrevious => 'Previous';

  @override
  String get toolNext => 'Next';

  @override
  String get toolNewPage => 'New page';

  @override
  String get showTools => 'Show tools';

  @override
  String deleteSelection(int count) {
    return 'Delete $count';
  }

  @override
  String get guestSignIn => 'Guest · Sign in';

  @override
  String beingViewed(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Being viewed · $count',
      one: 'Being viewed',
    );
    return '$_temp0';
  }

  @override
  String get beingViewedTooltip =>
      'A school leader is watching this class live. Viewing is recorded in the audit log.';

  @override
  String get goLive => 'Go live';

  @override
  String get liveWaiting => 'Live · waiting for students';

  @override
  String liveStudents(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Live · $count students',
      one: 'Live · 1 student',
    );
    return '$_temp0';
  }

  @override
  String get stopLiveTooltip => 'Stop the live class';

  @override
  String get goLiveTooltip =>
      'Let students of this class watch the board in the Student app';

  @override
  String get liveStarted =>
      'Live: students of this class can watch the board in the Student app. Sound is not included yet.';

  @override
  String get liveEnded => 'The live class has ended.';

  @override
  String get cloudUnreachableCheckOnline =>
      'Could not reach KINETIX Cloud. Check the board is online.';

  @override
  String get noClassList => 'No class list';

  @override
  String takeAttendance(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count students · Take attendance',
      one: '1 student · Take attendance',
    );
    return '$_temp0';
  }

  @override
  String presentOfTotal(int present, int total) {
    return '$present/$total present';
  }

  @override
  String pendingSync(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count changes waiting to sync',
      one: '1 change waiting to sync',
    );
    return '$_temp0';
  }

  @override
  String get connectedCloud => 'Connected to KINETIX Cloud';

  @override
  String get offlineSaved => 'Offline. Everything is saved and will sync.';

  @override
  String get endClass => 'End class';

  @override
  String get signedOutGuest => 'Signed out. The board is in guest mode.';

  @override
  String welcomeTeacher(String name) {
    return 'Welcome, $name.';
  }

  @override
  String get signInUnregistered => 'Sign-in on an unregistered board';

  @override
  String get recordNeedsSignIn =>
      'Sign in with the Teacher app to record lessons. The teacher must connect to this board first.';

  @override
  String get recordingStarted => 'Recording the board and your voice.';

  @override
  String recordingNoSound(String reason) {
    return 'Recording the board without sound: $reason';
  }

  @override
  String get voiceNoMicrophone => 'no microphone found';

  @override
  String get voicePermissionDenied => 'the microphone permission was denied';

  @override
  String get voiceUnsupported => 'this board cannot record sound';

  @override
  String get voiceNotStarted => 'the microphone could not be started';

  @override
  String couldNotStartRecording(String error) {
    return 'Could not start recording: $error';
  }

  @override
  String get recordingDiscarded => 'Recording discarded.';

  @override
  String get recordingSavedUploading =>
      'Recording saved. It is uploading to KINETIX Cloud.';

  @override
  String recordingSavedLater(String name) {
    return 'Recording saved on this board. It uploads when $name next signs in.';
  }

  @override
  String couldNotSaveRecording(String error) {
    return 'Could not save the recording: $error';
  }

  @override
  String get saveNeedsSignIn =>
      'Sign in with the Teacher app to save boards to the cloud.';

  @override
  String get nothingToSave => 'There is nothing on the board to save yet.';

  @override
  String savedAndShared(String section) {
    return 'Saved and shared with $section.';
  }

  @override
  String get savedToWhiteboards => 'Saved to Your whiteboards.';

  @override
  String couldNotSaveBoard(String error) {
    return 'Could not save the board: $error';
  }

  @override
  String get whiteboardsNeedSignIn =>
      'Sign in with the Teacher app to see your saved boards.';

  @override
  String get replaceBoardTitle => 'Replace the board?';

  @override
  String get replaceBoardBody =>
      'What is on the board now will be lost unless you save it first.';

  @override
  String openedBoard(String title) {
    return 'Opened \"$title\". Saving again updates it.';
  }

  @override
  String couldNotOpenBoard(String error) {
    return 'Could not open the board: $error';
  }

  @override
  String get endClassTitle => 'End class?';

  @override
  String get endClassBody =>
      'You will be signed out of this board. Attendance and answers recorded in class are kept.';

  @override
  String get endClassRecordingNote =>
      'The lesson recording stops, and you can save and share it first.';

  @override
  String get saveThisBoard => 'Save this board';

  @override
  String get shareWithStudentsParents => 'Share with students and parents';

  @override
  String get keepTeaching => 'Keep teaching';

  @override
  String get uploadingBeforeSignOut =>
      'Uploading the lesson recording before signing out…';

  @override
  String signedOutRecordingPending(String name) {
    return 'Signed out. The lesson recording is saved on this board and uploads when $name next signs in.';
  }

  @override
  String get attendanceWithoutClass => 'Attendance without a timetabled class';

  @override
  String get defaultBoardName => 'Board';

  @override
  String get defaultLessonName => 'Lesson';

  @override
  String get toolTimer => 'Timer';

  @override
  String get toolRandomPick => 'Random pick';

  @override
  String get toolAttendance => 'Attendance';

  @override
  String get toolSplitScreen => 'Split screen';

  @override
  String get toolEyeComfort => 'Eye comfort';

  @override
  String get toolRuler => 'Ruler';

  @override
  String get toolProtractor => 'Protractor';

  @override
  String get toolCalculator => 'Calculator';

  @override
  String get toolSpotlight => 'Spotlight';

  @override
  String get toolScreenShade => 'Screen shade';

  @override
  String get toolScreenshot => 'Screenshot';

  @override
  String get toolTouchLock => 'Touch lock';

  @override
  String get pen => 'Pen';

  @override
  String get highlighter => 'Highlighter';

  @override
  String get colour => 'Colour';

  @override
  String get thickness => 'Thickness';

  @override
  String get eraserSize => 'Eraser size';

  @override
  String get sizeSmall => 'Small';

  @override
  String get sizeMedium => 'Medium';

  @override
  String get sizeLarge => 'Large';

  @override
  String get eraseTip =>
      'Tip: on an interactive panel, rub with your palm to erase.';

  @override
  String get clearPage => 'Clear page';

  @override
  String get boardTheme => 'Board theme';

  @override
  String get bgPlain => 'Plain';

  @override
  String get bgRuled => 'Ruled';

  @override
  String get bgGrid => 'Grid (1 cm)';

  @override
  String get bgDots => 'Dots';

  @override
  String get bgChalkboard => 'Chalkboard';

  @override
  String get shapes3dSoon =>
      'Rotatable 3D solids (cube, cylinder, cone, sphere) are coming soon.';

  @override
  String get shapeLine => 'Line';

  @override
  String get shapeArrow => 'Arrow';

  @override
  String get shapeDoubleArrow => 'Double arrow';

  @override
  String get shapeCircle => 'Circle';

  @override
  String get shapeEllipse => 'Ellipse';

  @override
  String get shapeTriangle => 'Triangle';

  @override
  String get shapeRightTriangle => 'Right triangle';

  @override
  String get shapeRectangle => 'Rectangle';

  @override
  String get shapeParallelogram => 'Parallelogram';

  @override
  String get shapeTrapezium => 'Trapezium';

  @override
  String get shapeRhombus => 'Rhombus';

  @override
  String get shapePentagon => 'Pentagon';

  @override
  String get shapeHexagon => 'Hexagon';

  @override
  String get showLengths => 'Show lengths';

  @override
  String get showLengthsHint => 'Sides in cm, matching the 1 cm grid';

  @override
  String get showAngles => 'Show angles';

  @override
  String get eyeProtection => 'Eye protection';

  @override
  String get eyeProtectionHint =>
      'Warmer colours, less blue light, gentle dimming';

  @override
  String get adjustSchoolDay => 'Adjust through the school day';

  @override
  String get warmth => 'Warmth';

  @override
  String get dimming => 'Dimming';

  @override
  String get highContrast => 'High contrast';

  @override
  String get highContrastHint => 'For faded projectors';

  @override
  String get chalkboardHint => 'Dark board, less glare';

  @override
  String get dragToResize => 'Drag to resize';

  @override
  String get moveToOtherSide => 'Move to the other side';

  @override
  String get splitWhiteboard => 'Whiteboard';

  @override
  String get splitDocument => 'PDF / PPT';

  @override
  String get splitVideo => 'Video';

  @override
  String get splitWeb => 'Web page';

  @override
  String get splitModel3d => '3D model';

  @override
  String get splitLab => 'Virtual lab';

  @override
  String viewerComingSoon(String viewer) {
    return 'The $viewer viewer is coming in an upcoming build.';
  }

  @override
  String get splitChoose => 'Choose what to show next to the whiteboard.';

  @override
  String get chooseSomethingElse => 'Choose something else';

  @override
  String get signInWithTeacherApp => 'Sign in with Teacher app';

  @override
  String get importFiles => 'Import PDF, PPT or image';

  @override
  String get yourWhiteboards => 'Your whiteboards';

  @override
  String get recordings => 'Recordings';

  @override
  String recordingsToUpload(int count) {
    return '$count to upload';
  }

  @override
  String get screenProjection => 'Screen projection';

  @override
  String get boardSettings => 'Board settings';

  @override
  String get guidedTour => 'Guided tour & practice';

  @override
  String get language => 'Language';

  @override
  String get languageHint =>
      'Buttons and messages on this board. A teacher who signs in sees the board in their own language until they sign out.';

  @override
  String get touchScreen => 'Touch screen';

  @override
  String get touchScreenHint =>
      'Choose the hardware this board runs on. It decides what a palm or a large touch does.';

  @override
  String get touchTablet => 'Tablet';

  @override
  String get touchTabletHint => 'A hand resting on the screen is ignored';

  @override
  String get touchPanel => 'Interactive panel';

  @override
  String get touchPanelHint => 'A palm or fist erases, like a duster';

  @override
  String get touchIrFrame => 'IR touch frame';

  @override
  String get touchIrFrameHint =>
      'Every touch writes. IR frames cannot tell a palm from a finger';

  @override
  String get timesUp => 'Time\'s up';

  @override
  String get closeTimer => 'Close timer';

  @override
  String get reset => 'Reset';

  @override
  String get pause => 'Pause';

  @override
  String get restart => 'Restart';

  @override
  String get start => 'Start';

  @override
  String get randomPickNoClass =>
      'Sign in from the Teacher app during a timetabled class to pick from its students.';

  @override
  String rollNo(String rollNo) {
    return 'Roll no. $rollNo';
  }

  @override
  String answerSavedTo(String outcome, String name) {
    return '$outcome · saved to $name\'s profile';
  }

  @override
  String get answerCorrect => 'Correct';

  @override
  String get answerPartlyCorrect => 'Partly correct';

  @override
  String get answerPartly => 'Partly';

  @override
  String get answerNotCorrect => 'Not correct';

  @override
  String get answerSkipped => 'Skipped';

  @override
  String get answerSkip => 'Skip';

  @override
  String get pickAgain => 'Pick again';

  @override
  String attendanceSummary(int present, int absent, int late) {
    return '$present present · $absent absent · $late late   —   tap a student to change';
  }

  @override
  String get present => 'Present';

  @override
  String get absent => 'Absent';

  @override
  String get late => 'Late';

  @override
  String get saveAttendance => 'Save attendance';

  @override
  String get saveBoard => 'Save board';

  @override
  String get shareWithClass => 'Share with the class';

  @override
  String get shareNeedsClass =>
      'Available when the board is used in a timetabled class';

  @override
  String shareBoardHint(String section) {
    return 'Students and parents of $section can open it in their apps';
  }

  @override
  String couldNotLoadBoards(String error) {
    return 'Could not load your boards.\n$error';
  }

  @override
  String get noBoardsYet =>
      'Boards you save appear here. Use Save, or save when you end the class.';

  @override
  String pageCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pages',
      one: '1 page',
    );
    return '$_temp0';
  }

  @override
  String get shared => 'Shared';

  @override
  String get recPaused => 'Paused';

  @override
  String get recLive => 'REC';

  @override
  String get recNoSoundTooltip => 'Recording without sound';

  @override
  String get recResume => 'Resume recording';

  @override
  String get recPause => 'Pause recording';

  @override
  String get recStop => 'Stop recording';

  @override
  String get recDiscardTitle => 'Discard this recording?';

  @override
  String recDiscardBody(String duration) {
    return '$duration of the lesson will be deleted from the board.';
  }

  @override
  String get recSaveTitle => 'Save lesson recording';

  @override
  String get recBoardAndVoice => 'board and voice';

  @override
  String get recBoardOnly => 'board only, no sound';

  @override
  String recShareHint(String section) {
    return 'Students and parents of $section can watch it after it uploads';
  }

  @override
  String get recUploadNote =>
      'It uploads to KINETIX Cloud in the background. Absent students are told it is there.';

  @override
  String sharedWith(String section) {
    return 'Shared with $section.';
  }

  @override
  String get theClass => 'the class';

  @override
  String couldNotShare(String error) {
    return 'Could not share: $error';
  }

  @override
  String couldNotLoadRecordings(String error) {
    return 'Could not load your recordings.\n$error';
  }

  @override
  String get noRecordingsYet =>
      'Lessons you record appear here. Tap Record on the toolbar to start.';

  @override
  String get recNoSound => 'no sound';

  @override
  String get recWaiting => 'Waiting to upload';

  @override
  String recUploadsWhen(String name) {
    return 'Uploads when $name signs in';
  }

  @override
  String recUploading(int percent) {
    return 'Uploading $percent%';
  }

  @override
  String get recUploaded => 'Uploaded';

  @override
  String get recUploadFailed => 'Upload failed';

  @override
  String recUploadedLaterClass(String section) {
    return 'Uploaded in a later class. Share it from here if it is for $section.';
  }

  @override
  String get thisClass => 'this class';

  @override
  String broadcastFrom(String name) {
    return 'From $name';
  }

  @override
  String get acknowledge => 'Acknowledge';

  @override
  String signInTo(String board) {
    return 'Sign in to $board';
  }

  @override
  String get thisBoard => 'this board';

  @override
  String get signInUsePhone => 'Use the KINETIX Teacher app on your phone.';

  @override
  String get signInStep1 => 'Open the KINETIX Teacher app';

  @override
  String get signInStep2 => 'Tap Connect to board';

  @override
  String get signInStep3 => 'Scan the QR code, or type this code';

  @override
  String newCodeIn(int seconds) {
    return 'New code in $seconds s';
  }

  @override
  String get cannotReachCloudRetrying =>
      'Cannot reach KINETIX Cloud. Retrying…';

  @override
  String get signInCodeNote =>
      'The code changes every 2 minutes and works once. No password is typed on the board.';

  @override
  String get enrollTitle => 'Set up this board';

  @override
  String get enrollHint =>
      'In KINETIX ERP, open Devices → Add board, then enter the code shown there.';

  @override
  String get enrollCode => 'Enrolment code';

  @override
  String get enrollServer => 'Server';

  @override
  String get enrollRegistering => 'Registering…';

  @override
  String get enrollRegister => 'Register board';

  @override
  String get enrollSkip => 'Skip for now and use the practice board';

  @override
  String get aiAskNeedsSignIn =>
      'Sign in with the Teacher app to ask KINETIX AI.';

  @override
  String aiToolSoon(String tool) {
    return 'KINETIX AI $tool';
  }

  @override
  String get aiAskHint => 'Ask anything about a topic';

  @override
  String aiAskHintClass(String classLabel) {
    return 'Ask anything about $classLabel';
  }

  @override
  String get aiSpeak => 'Speak';

  @override
  String get aiVoiceQuestions => 'Voice questions';

  @override
  String get aiAsk => 'Ask';

  @override
  String get aiDisclaimer =>
      'Answers follow your syllabus. Check before sharing with the class.';

  @override
  String get aiPreparing => 'KINETIX AI is preparing an explanation…';

  @override
  String get aiGroupTeach => 'Teach';

  @override
  String get aiGroupMathsScience => 'Maths & science';

  @override
  String get aiGroupLookUp => 'Look up';

  @override
  String get aiSummary => 'Summary';

  @override
  String get aiQuickQuiz => 'Quick quiz';

  @override
  String get aiLessonPlan => 'Lesson plan';

  @override
  String get aiMathSolver => 'Math solver';

  @override
  String get aiGraph => 'Graph';

  @override
  String get ai3dModels => '3D models';

  @override
  String get aiSimulations => 'Simulations';

  @override
  String get aiTextbook => 'Textbook';

  @override
  String get aiWikipedia => 'Wikipedia';

  @override
  String get aiDictionary => 'Dictionary';

  @override
  String get aiReadBoard => 'Read board';

  @override
  String get aiAskAgain => 'Ask again for a new answer';

  @override
  String aiBasedOnSyllabus(String sources) {
    return 'Based on your syllabus: $sources';
  }

  @override
  String get aiKeyPoints => 'Key points';

  @override
  String get aiAskNext => 'Ask next';

  @override
  String get aiPreviewLabel =>
      'Preview — connect the KINETIX AI server for real answers';

  @override
  String get aiPreview => 'Preview';

  @override
  String get aiLanguageTooltip => 'Language for KINETIX AI';

  @override
  String get aiSignInNotice =>
      'KINETIX AI needs a teacher signed in and the board online. Sign in with the Teacher app from the profile button. The maths solver works without signing in.';

  @override
  String get difficultyEasy => 'Easy';

  @override
  String get difficultyMedium => 'Medium';

  @override
  String get difficultyHard => 'Hard';

  @override
  String dueOn(String date) {
    return 'Due $date';
  }

  @override
  String get dueDate => 'Due date';

  @override
  String get aiErrSignInAgain =>
      'Sign in again with the Teacher app to use KINETIX AI.';

  @override
  String get aiErrRefused =>
      'KINETIX AI can’t help with that request. Try rephrasing it for the classroom.';

  @override
  String get aiErrQuota =>
      'Your institution has used today’s KINETIX AI allowance. It resets tomorrow.';

  @override
  String get aiErrUnusable =>
      'KINETIX AI could not produce a usable answer. Try again or rephrase.';

  @override
  String get aiErrUnreachable =>
      'KINETIX AI is not reachable right now. Try again in a minute.';

  @override
  String get aiErrCheckInput => 'Check what you typed and try again.';

  @override
  String aiErrGeneric(int status) {
    return 'Something went wrong ($status). Try again.';
  }

  @override
  String get aiErrTimeout =>
      'KINETIX AI is taking too long. Try again in a minute.';

  @override
  String get aiErrOffline =>
      'The board is offline. Connect to the internet to use KINETIX AI. The maths solver works offline.';

  @override
  String aiExplainTopic(String topic) {
    return 'Explain $topic';
  }

  @override
  String aiExplainFromBoard(String text) {
    return 'Explain this from the board: $text';
  }

  @override
  String get quizNeedsSignIn =>
      'Sign in with the Teacher app to make a quiz with KINETIX AI.';

  @override
  String get quizTypeTopic => 'Type a topic for the quiz first.';

  @override
  String get quizTopicHint =>
      'e.g. Photosynthesis, Fractions, Company accounts';

  @override
  String get questionsLabel => 'Questions';

  @override
  String get quizMake => 'Make quiz';

  @override
  String get quizMakeNew => 'Make a new quiz';

  @override
  String writingQuestions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Writing $count questions…',
      one: 'Writing 1 question…',
    );
    return '$_temp0';
  }

  @override
  String quizHeader(int count, String topic) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count questions · $topic',
      one: '1 question · $topic',
    );
    return '$_temp0';
  }

  @override
  String get quizDraftNote =>
      'Draft — check the questions and answers before you present them.';

  @override
  String get quizPresent => 'Present';

  @override
  String get sendAsHomework => 'Send as homework';

  @override
  String quizAnswerExplanation(String letter, String explanation) {
    return 'Answer $letter. $explanation';
  }

  @override
  String questionOf(int number, int total) {
    return 'Question $number of $total';
  }

  @override
  String get hideAnswer => 'Hide answer';

  @override
  String get revealAnswer => 'Reveal answer';

  @override
  String get finish => 'Finish';

  @override
  String quizTitle(String topic) {
    return 'Quiz: $topic';
  }

  @override
  String get quizHomeworkIntro =>
      'Answer these multiple-choice questions. Write the letter of the correct option.';

  @override
  String get homeworkNeedsSignIn =>
      'Sign in with the Teacher app to make homework with KINETIX AI.';

  @override
  String get homeworkTypeTopic => 'Type a topic for the homework first.';

  @override
  String get homeworkTopicHint => 'e.g. Linear equations, Journal entries';

  @override
  String get homeworkMake => 'Make homework';

  @override
  String get homeworkWriteOwn => 'Write my own';

  @override
  String get homeworkEditNote =>
      'You can edit everything before it goes to the class. Students and parents see it in their apps.';

  @override
  String get homeworkNeedsTitle => 'Give the homework a title.';

  @override
  String get homeworkTooLong =>
      'This homework is too long to send. Remove a few questions.';

  @override
  String get quizTooLongForHomework =>
      'This quiz is too long to send as homework. Make one with fewer questions.';

  @override
  String homeworkSent(String section) {
    return 'Homework sent to $section. Students and parents are notified.';
  }

  @override
  String get homeworkErrSignIn =>
      'Sign in again with the Teacher app to give homework.';

  @override
  String homeworkErrStatus(int status) {
    return 'Could not send the homework ($status). Try again.';
  }

  @override
  String get homeworkErrOffline =>
      'The board is offline. Connect to the internet to send homework.';

  @override
  String get questionHint => 'Question';

  @override
  String marks(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count marks',
      one: '1 mark',
    );
    return '$_temp0';
  }

  @override
  String get removeQuestion => 'Remove question';

  @override
  String get instructionsLabel => 'Instructions';

  @override
  String totalMarks(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Total $count marks',
      one: 'Total 1 mark',
    );
    return '$_temp0';
  }

  @override
  String get addQuestion => 'Add question';

  @override
  String get sendToClass => 'Send to class';

  @override
  String homeworkTitleTopic(String topic) {
    return 'Homework: $topic';
  }

  @override
  String get homeworkDefaultInstructions =>
      'Answer all questions in your notebook. Show your working.';

  @override
  String homeworkTotalLine(String marks) {
    return 'Total: $marks';
  }

  @override
  String get lessonNeedsSignIn =>
      'Sign in with the Teacher app to plan a lesson with KINETIX AI.';

  @override
  String get lessonTypeTopic => 'Type a topic for the lesson first.';

  @override
  String get lessonTopicHint => 'e.g. The water cycle';

  @override
  String get lessonLength => 'Length';

  @override
  String get lessonPlanButton => 'Plan lesson';

  @override
  String get lessonPlanAgain => 'Plan again';

  @override
  String get lessonPlanning => 'Planning the lesson…';

  @override
  String get lessonObjectives => 'Objectives';

  @override
  String lessonSteps(int minutes) {
    return 'Steps · $minutes min';
  }

  @override
  String get lessonMaterials => 'Materials';

  @override
  String get lessonCheck => 'Check understanding';

  @override
  String get readNeedsSignIn =>
      'Sign in with the Teacher app to read the board with KINETIX AI.';

  @override
  String get readIntro =>
      'Turns the handwriting on this page into text you can copy, check or ask about. Write clearly; one page at a time.';

  @override
  String get readThisPage => 'Read this page';

  @override
  String get readAgain => 'Read again';

  @override
  String get readingBoard => 'Reading the board…';

  @override
  String get readNoWriting => 'No writing found on this page.';

  @override
  String get readMathsFound => 'Maths found';

  @override
  String get copied => 'Copied';

  @override
  String get copyText => 'Copy text';

  @override
  String get askAiAboutThis => 'Ask KINETIX AI about this';

  @override
  String get booksTopic => 'Topic';

  @override
  String get booksSignIn =>
      'Books show the syllabus of the class being taught. Sign in with the Teacher app to open it.';

  @override
  String get booksOpening => 'Opening the syllabus…';

  @override
  String get booksCouldNotOpen =>
      'Could not open the syllabus. Check the board is online.';

  @override
  String get booksUnlinked =>
      'This subject isn\'t linked to a syllabus yet. Your admin can link it in KINETIX ERP → Syllabus.';

  @override
  String get booksDraft =>
      'Draft content: check against your textbook before teaching from it.';

  @override
  String get booksDraftShort => 'Draft content: check against your textbook.';

  @override
  String get booksAddedByInstitution => 'Added by your institution';

  @override
  String get booksNotesSoon => 'Notes coming soon';

  @override
  String booksTopicCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count topics',
      one: '1 topic',
    );
    return '$_temp0';
  }

  @override
  String get booksOpeningTopic => 'Opening the topic…';

  @override
  String get booksCouldNotOpenTopic => 'Could not open this topic.';

  @override
  String get booksExplain => 'Explain with KINETIX AI';

  @override
  String get booksQuiz => 'Quick quiz on this';

  @override
  String get booksOnTheBoard => 'On the board';

  @override
  String get booksKeyFacts => 'Key facts';

  @override
  String get booksOutcomes => 'By the end, students can';

  @override
  String get mathHint => 'Type a sum or an equation';

  @override
  String get mathOffline =>
      'Solved on this board. Works offline, no sign-in needed.';

  @override
  String get mathTryThese => 'Try one of these';

  @override
  String get mathAbout =>
      'Works out sums with BODMAS, fractions, powers and roots, sin/cos/tan in degrees, log, and solves linear and quadratic equations step by step.';

  @override
  String get mathSolve => 'Solve';

  @override
  String get mathWorking => 'Working';

  @override
  String get mathKeySquared => 'Squared';

  @override
  String get mathKeyPower => 'Power';

  @override
  String get mathKeySquareRoot => 'Square root';

  @override
  String get mathKeyPi => 'Pi';

  @override
  String get mathKeyFraction => 'Fraction';

  @override
  String get mathKeyOpenBracket => 'Open bracket';

  @override
  String get mathKeyCloseBracket => 'Close bracket';

  @override
  String get mathKeyTimes => 'Times';

  @override
  String get mathKeyDivide => 'Divide';

  @override
  String get mathKeyMinus => 'Minus';

  @override
  String get mathKeyPlus => 'Plus';

  @override
  String get mathKeyEquals => 'Equals';

  @override
  String get mathKeyDelete => 'Delete';

  @override
  String get mathKindArithmetic => 'Arithmetic';

  @override
  String get mathKindSimplify => 'Simplify';

  @override
  String get mathKindCheck => 'Check';

  @override
  String get mathKindLinear => 'Linear equation';

  @override
  String get mathKindQuadratic => 'Quadratic equation';

  @override
  String get mathTrue => 'True';

  @override
  String get mathFalse => 'False';

  @override
  String get mathEveryNumber => 'Every number is a solution';

  @override
  String get mathNoSolution => 'No solution';

  @override
  String mathRepeatedRoot(String answer) {
    return '$answer (repeated root)';
  }

  @override
  String mathNoRealRoots(String roots) {
    return 'No real roots: $roots';
  }

  @override
  String get mathOr => 'or';

  @override
  String get mathAnd => 'and';

  @override
  String mathForEvery(String equation, String variable) {
    return '$equation for every $variable';
  }

  @override
  String mathIsFalse(String equation) {
    return '$equation is false';
  }

  @override
  String get mathStepWorkOutRest => 'Work out the rest';

  @override
  String get mathStepBrackets => 'Brackets first';

  @override
  String get mathStepPowers => 'Powers and roots';

  @override
  String get mathStepDivideMultiply => 'Divide and multiply, left to right';

  @override
  String get mathStepAddSubtract => 'Add and subtract, left to right';

  @override
  String get mathStepStartExpression => 'Start with the expression';

  @override
  String get mathStepStartStatement => 'Start with the statement';

  @override
  String get mathStepLeftSide => 'Work out the left side';

  @override
  String get mathStepRightSide => 'Work out the right side';

  @override
  String get mathStepStatementTrue =>
      'Both sides are equal, so the statement is true';

  @override
  String get mathStepStatementFalse =>
      'The sides are different, so the statement is false';

  @override
  String get mathStepExpand => 'Expand the brackets and collect like terms';

  @override
  String mathStepToFind(String variable, String equation) {
    return 'To find $variable, write an equation, e.g. $equation';
  }

  @override
  String get mathStepWriteEquation => 'Write the equation';

  @override
  String get mathStepExpandEachSide =>
      'Expand the brackets and collect like terms on each side';

  @override
  String mathStepSquaresCancel(String term, String square) {
    return 'Subtract $term from both sides; the $square terms cancel';
  }

  @override
  String get mathStepAlwaysEqual => 'Both sides are always equal';

  @override
  String get mathStepNeverEqual => 'The two sides can never be equal';

  @override
  String mathStepAddBoth(String term) {
    return 'Add $term to both sides';
  }

  @override
  String mathStepSubtractBoth(String term) {
    return 'Subtract $term from both sides';
  }

  @override
  String mathStepMultiplyBoth(String number) {
    return 'Multiply both sides by $number';
  }

  @override
  String mathStepDivideBoth(String number) {
    return 'Divide both sides by $number';
  }

  @override
  String mathStepCheck(String value) {
    return 'Check: put $value back into the equation';
  }

  @override
  String get mathStepBringLeft =>
      'Bring every term to the left side and simplify';

  @override
  String mathStepClearFractions(String number) {
    return 'Multiply both sides by $number to clear the fractions';
  }

  @override
  String mathStepMakePositive(String number, String square) {
    return 'Multiply both sides by $number so the $square term is positive';
  }

  @override
  String mathStepCompare(String form) {
    return 'Compare with $form';
  }

  @override
  String mathStepDiscriminant(String formula) {
    return 'Find the discriminant $formula';
  }

  @override
  String get mathStepEqualRoots => 'D = 0, so the two roots are equal';

  @override
  String mathStepUse(String formula) {
    return 'Use $formula';
  }

  @override
  String get mathStepComplexRoots =>
      'D < 0, so there are no real roots. The roots are complex numbers';

  @override
  String get mathStepTwoRealRoots =>
      'D > 0, so there are two different real roots';

  @override
  String mathStepQuadraticFormula(String formula) {
    return 'Use the quadratic formula $formula';
  }

  @override
  String get mathStepTwoRoots => 'Work out the two roots';

  @override
  String get mathStepSimplifyRoot => 'Simplify the square root';

  @override
  String mathStepDivideTopBottom(String number) {
    return 'Divide the top and bottom by $number';
  }

  @override
  String get mathStepSoRoots => 'So the roots are';

  @override
  String get mathStepInDecimals => 'In decimals';

  @override
  String get mathStepWorkOutRoots => 'Work out the roots';

  @override
  String get mathStepFactorised => 'Factorised form';

  @override
  String get mathErrZeroPowerZero => '0⁰ is not defined.';

  @override
  String get mathErrDivisionByZero => 'Division by zero is not defined.';

  @override
  String get mathErrNegativeFractionalPower =>
      'A negative number to a fractional power is not a real number.';

  @override
  String get mathErrNegativeRoot =>
      'The square root of a negative number is not a real number.';

  @override
  String mathErrNotDefined(String expression) {
    return '$expression is not defined.';
  }

  @override
  String mathErrPositiveOnly(String function) {
    return '$function is only defined for positive numbers.';
  }

  @override
  String mathErrUnknownFunction(String function) {
    return 'Unknown function $function.';
  }

  @override
  String mathErrNoValue(String name) {
    return '“$name” has no value.';
  }

  @override
  String get mathErrTooLarge => 'The answer is too large or not defined.';

  @override
  String mathErrNotANumber(String text) {
    return '“$text” is not a number.';
  }

  @override
  String mathErrDontUnderstandUse(String text) {
    return 'I don’t understand “$text”. Use numbers, x, + − × ÷ ^, brackets, √, sin, cos, tan, log.';
  }

  @override
  String get mathErrEmpty => 'Type a sum or an equation, like 3x + 5 = 20.';

  @override
  String get mathErrAfterEquals => 'Write something after “=”.';

  @override
  String get mathErrOneEquals => 'Use only one “=” sign.';

  @override
  String get mathErrUnmatchedClose => 'There is a “)” without a matching “(”.';

  @override
  String mathErrDontUnderstandHere(String text) {
    return 'I don’t understand “$text” here.';
  }

  @override
  String get mathErrEndsEarly =>
      'The expression ends too early. Is something missing?';

  @override
  String get mathErrOperatorBetween =>
      'Put an operator (+ − × ÷) between the numbers.';

  @override
  String get mathErrPowerAfterCaret => 'Write the power after “^”.';

  @override
  String get mathErrEmptyBrackets =>
      'There is nothing inside the brackets “()”.';

  @override
  String get mathErrBracketNotClosed => 'A bracket is not closed. Add “)”.';

  @override
  String mathErrNumberAfter(String function) {
    return 'Write a number after $function.';
  }

  @override
  String get mathErrBeforeEquals => 'Write something before “=”.';

  @override
  String mathErrMissingBefore(String text) {
    return 'Something is missing before “$text”.';
  }

  @override
  String get mathErrBothSides => 'Write something on both sides of “=”.';

  @override
  String mathErrUnknownInside(String function) {
    return 'The unknown inside $function is not supported yet.';
  }

  @override
  String get mathErrUnknownDenominator =>
      'The unknown in a denominator is not supported yet.';

  @override
  String get mathErrUnknownPower =>
      'The unknown in a power is not supported yet.';

  @override
  String get mathErrWholePowers =>
      'Powers of the unknown must be whole numbers like x² or x³.';

  @override
  String mathErrManyUnknowns(String list) {
    return 'This has more than one unknown ($list). Use one unknown, like x.';
  }

  @override
  String mathErrHighPowers(String power) {
    return 'Equations with $power or higher powers are not supported yet. Try a linear or quadratic equation.';
  }
}

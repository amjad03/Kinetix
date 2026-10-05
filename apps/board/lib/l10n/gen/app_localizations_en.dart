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
  String minutesShort(int n) {
    return '$n min';
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
      'Live: students of this class can watch the board in the Student app. Turn on Class audio to let them hear you.';

  @override
  String get liveEnded => 'The live class has ended.';

  @override
  String get classAudio => 'Class audio';

  @override
  String get classAudioOn => 'Class audio on';

  @override
  String get classAudioTurnOnTooltip =>
      'Let students in the live class hear you through the board\'s microphone';

  @override
  String get classAudioTurnOffTooltip => 'Turn off class audio';

  @override
  String get micOn => 'Mic on';

  @override
  String get micOnTooltip =>
      'The board\'s microphone is on: students in the live class can hear the classroom';

  @override
  String get classAudioStarted =>
      'Class audio is on. Students in the live class can hear you; \"Mic on\" shows while they are listening.';

  @override
  String get classAudioStopped => 'Class audio is off.';

  @override
  String classAudioUnavailable(String reason) {
    return 'Class audio isn\'t available: $reason';
  }

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
  String get tkStopwatch => 'Stopwatch';

  @override
  String get tkDice => 'Dice';

  @override
  String get tkSpinner => 'Spinner';

  @override
  String get tkNoiseMeter => 'Noise meter';

  @override
  String get tkDragCard => 'Drag to move';

  @override
  String get tkPlusMinute => '+1 min';

  @override
  String get tkLap => 'Lap';

  @override
  String tkLapN(int number, String time) {
    return 'Lap $number: $time';
  }

  @override
  String get tkPick => 'Pick';

  @override
  String get tkReady => 'Ready?';

  @override
  String tkPickedOf(int picked, int total) {
    return '$picked of $total picked';
  }

  @override
  String get tkNoRepeat => 'Don\'t repeat until everyone is picked';

  @override
  String get tkStartOver => 'Start the round again';

  @override
  String get tkDemoClass => 'Demo class';

  @override
  String get tkRoll => 'Roll';

  @override
  String tkDiceCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count dice',
      one: '1 die',
    );
    return '$_temp0';
  }

  @override
  String tkTotal(int total) {
    return 'Total: $total';
  }

  @override
  String get tkSpin => 'Spin';

  @override
  String get tkSpinnerOptions => 'Spinner options';

  @override
  String get tkSpinnerHint => 'One option on each line';

  @override
  String tkGroup(String letter) {
    return 'Group $letter';
  }

  @override
  String get tkTooLoud => 'Too loud!';

  @override
  String get tkCalm => 'Nice and calm';

  @override
  String get tkLimit => 'Limit';

  @override
  String get tkNoisePermission =>
      'Allow the microphone to use the noise meter.';

  @override
  String get tkNoiseNoMic => 'This board has no microphone.';

  @override
  String get tkNoiseUnavailable =>
      'The noise meter cannot use the microphone now. Turn off class audio or recording and try again.';

  @override
  String get tkNoiseLocal =>
      'Only the sound level is measured, on this board. Nothing is recorded.';

  @override
  String get tkDragToReveal => 'Drag to reveal';

  @override
  String get tkRevealAll => 'Reveal all';

  @override
  String get tkRemoveShade => 'Remove shade';

  @override
  String get tkEndSpotlight => 'End spotlight';

  @override
  String get tkSpotlightSize => 'Spotlight size';

  @override
  String get simTitle => 'Simulations';

  @override
  String get simHint =>
      'Pendulum, projectile, graphs, fractions, waves, Pythagoras';

  @override
  String get simOthers => 'Other simulations';

  @override
  String get simPendulum => 'Simple pendulum';

  @override
  String get simProjectile => 'Projectile motion';

  @override
  String get simGrapher => 'Function grapher';

  @override
  String get simFractions => 'Fraction bars';

  @override
  String get simWave => 'Waves';

  @override
  String get simPythagoras => 'Pythagoras theorem';

  @override
  String get simLength => 'Length';

  @override
  String get simGravity => 'Gravity';

  @override
  String get simStartAngle => 'Start angle';

  @override
  String get simSpeed => 'Speed';

  @override
  String get simAngle => 'Angle';

  @override
  String get simAmplitude => 'Amplitude';

  @override
  String get simFrequency => 'Frequency';

  @override
  String get simWavelength => 'Wavelength';

  @override
  String simRange(String metres) {
    return 'Range $metres m';
  }

  @override
  String simMaxHeight(String metres) {
    return 'Max height $metres m';
  }

  @override
  String simFlightTime(String seconds) {
    return 'Time $seconds s';
  }

  @override
  String simTop(int number) {
    return 'Top $number';
  }

  @override
  String simBottom(int number) {
    return 'Bottom $number';
  }

  @override
  String simSide(String name) {
    return 'Side $name';
  }

  @override
  String get simBadExpression => 'Cannot read that expression';

  @override
  String get simDraw => 'Draw';

  @override
  String get readAloud => 'Read aloud';

  @override
  String get readerTitle => 'Immersive reader';

  @override
  String readerPageTitle(int number) {
    return 'Page $number';
  }

  @override
  String get readerNothing =>
      'There is no typed text on this page to read. Type text, add a note or convert handwriting with the AI pen.';

  @override
  String readerNoVoice(String language) {
    return 'This board has no $language voice. Add one in the device’s text-to-speech settings (Windows: Settings → Time & language → Speech).';
  }

  @override
  String get readerPrevious => 'Previous paragraph';

  @override
  String get readerNext => 'Next paragraph';

  @override
  String get readerPaper => 'Paper';

  @override
  String get readerCream => 'Cream';

  @override
  String get readerContrast => 'High contrast';

  @override
  String get readerBlue => 'Blue tint';

  @override
  String get readerLineFocus => 'Line focus';

  @override
  String get readerSlower => 'Slower';

  @override
  String get readerHint => 'The page’s text, large, read aloud word by word';

  @override
  String get insertPicture => 'Picture';

  @override
  String get insertPictureHintGallery => 'From the gallery';

  @override
  String get insertPictureHintFiles => 'From this board’s files';

  @override
  String get insertPhoto => 'Take a photo';

  @override
  String get insertPhotoHint => 'With this board’s camera';

  @override
  String get pictureCouldNotOpen => 'Could not open that picture.';

  @override
  String get libTitle => 'Picture library';

  @override
  String get libHint => 'Diagrams, maps and stickers, free to use';

  @override
  String get libSearch => 'Search pictures (heart, map of India, volcano…)';

  @override
  String get libAll => 'All';

  @override
  String get libBiology => 'Biology';

  @override
  String get libChemistry => 'Chemistry';

  @override
  String get libPhysics => 'Physics';

  @override
  String get libMaths => 'Maths';

  @override
  String get libGeography => 'Geography';

  @override
  String get libHistory => 'History';

  @override
  String get libEnglish => 'Languages';

  @override
  String get libComputers => 'Computers';

  @override
  String get libEvs => 'EVS and primary';

  @override
  String get libStickers => 'Stickers';

  @override
  String get libNothingFound => 'No picture matches. Try another word.';

  @override
  String get libCredits =>
      'Pictures from Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA) and Microsoft Fluent Emoji (MIT). Tap ⓘ for a picture’s author and licence; the credit goes on the board with it.';

  @override
  String get importTitle => 'PDF or PowerPoint';

  @override
  String get importHint =>
      'Each page or slide becomes a board page to write on';

  @override
  String importingFile(String name) {
    return 'Opening $name';
  }

  @override
  String get importReading => 'Reading the file…';

  @override
  String importPageOf(int done, int total) {
    return 'Page $done of $total';
  }

  @override
  String importedPages(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Added $count pages after this one',
      one: 'Added 1 page after this one',
    );
    return '$_temp0';
  }

  @override
  String get importOldPpt =>
      'This is an old PowerPoint file (.ppt). Save it as .pptx or PDF in PowerPoint, then open it here.';

  @override
  String get importNotSupported =>
      'The board opens PDF and PowerPoint (.pptx) files.';

  @override
  String get importPdfFailed =>
      'Could not open this PDF. It may be damaged or protected with a password.';

  @override
  String get importPptxFailed =>
      'Could not open this PowerPoint. Save it as PDF in PowerPoint and open the PDF instead.';

  @override
  String tourStepOf(int step, int total) {
    return '$step of $total';
  }

  @override
  String get tourSkip => 'Skip';

  @override
  String get tourNext => 'Next';

  @override
  String get tourGotIt => 'Got it';

  @override
  String get tourWelcomeTitle => 'Welcome to your board';

  @override
  String get tourWelcomeBody =>
      'A one-minute look at the buttons you will use in every class.';

  @override
  String get tourPenTitle => 'Write and draw';

  @override
  String get tourPenBody =>
      'Write with a finger or the stylus. Tap the pen again for colours and thickness. Tap with two fingers to undo, three to redo.';

  @override
  String get tourEraseTitle => 'Rub out';

  @override
  String get tourEraseBody =>
      'Rub over the ink. Undo is at the bottom of the board.';

  @override
  String get tourInsertTitle => 'Add to the board';

  @override
  String get tourInsertBody =>
      'Equations, notes, pictures, the picture library, a PDF or PowerPoint, 3D models, labs and simulations.';

  @override
  String get tourToolsTitle => 'Class tools';

  @override
  String get tourToolsBody =>
      'Timer, stopwatch, name picker, dice, spinner, noise meter, screen shade, spotlight and the immersive reader.';

  @override
  String get tourAiTitle => 'KINETIX AI';

  @override
  String get tourAiBody =>
      'Ask about the lesson, make a quiz or homework, or solve a sum written on the board.';

  @override
  String get tourBooksTitle => 'Books';

  @override
  String get tourBooksBody =>
      'Your syllabus: each topic’s lesson, key facts and questions, read aloud if you like.';

  @override
  String get tourPagesTitle => 'Pages';

  @override
  String get tourPagesBody =>
      'Go to the next page; on the last page this adds a new one.';

  @override
  String get tourRecordTitle => 'Record the lesson';

  @override
  String get tourRecordBody =>
      'Records the board and your voice, for students to watch again.';

  @override
  String get tourHelpTitle => 'Help is always here';

  @override
  String get tourHelpBody =>
      'Open this menu for Help, this tour again, and a five-minute practice. Press ? on a keyboard too.';

  @override
  String get tourPractise => 'Practise now';

  @override
  String get helpTitle => 'Help';

  @override
  String get helpSubtitle =>
      'Short answers, and the button shown on the board.';

  @override
  String get helpShowAround => 'Show me around';

  @override
  String get helpPractise => 'Practise in 5 minutes';

  @override
  String get helpSearch => 'How do I…';

  @override
  String get helpNothing =>
      'Nothing found. Try another word, or Show me around.';

  @override
  String get helpShowMe => 'Show me';

  @override
  String get helpGroupWriting => 'Writing on the board';

  @override
  String get helpGroupContent => 'Pages and content';

  @override
  String get helpGroupClass => 'Teaching tools';

  @override
  String get helpGroupAi => 'KINETIX AI and Books';

  @override
  String get helpGroupSettings => 'Settings';

  @override
  String get helpWriteTitle => 'Write and draw';

  @override
  String get helpWrite1 =>
      'Tap the pen on the left and write with a finger or the stylus.';

  @override
  String get helpWrite2 => 'Two fingers move and zoom the board.';

  @override
  String get helpEraseTitle => 'Rub out or undo';

  @override
  String get helpErase1 =>
      'Tap the eraser and rub over the ink. Tap it again to clear the page.';

  @override
  String get helpErase2 => 'Made a mistake? Tap Undo at the bottom.';

  @override
  String get helpShapesTitle => 'Shapes';

  @override
  String get helpShapes1 => 'Tap Shapes, pick one and drag on the board.';

  @override
  String get helpShapes2 => 'Select it to resize, turn, colour or copy it.';

  @override
  String get helpTextTitle => 'Type text';

  @override
  String get helpText1 => 'Tap T, then tap the board where the text should go.';

  @override
  String get helpPagesTitle => 'Turn and add pages';

  @override
  String get helpPages1 =>
      'The arrows at the bottom turn pages; on the last page, + adds one.';

  @override
  String get helpPages2 =>
      'Save the board from the bottom left to keep it and share it with the class.';

  @override
  String get helpPictureTitle => 'Add a picture';

  @override
  String get helpPicture1 =>
      'Tap + (Add), then Picture for one from this board, or Picture library.';

  @override
  String get helpPicture2 => 'Library pictures carry their credit under them.';

  @override
  String get helpImportTitle => 'Open a PDF or PowerPoint';

  @override
  String get helpImport1 =>
      'Tap + (Add), then PDF or PowerPoint, and pick the file.';

  @override
  String get helpImport2 =>
      'Each page or slide becomes a board page you can write over; it works without the internet.';

  @override
  String get helpSimsTitle => 'Simulations';

  @override
  String get helpSims1 => 'Tap + (Add) or Tools, then Simulations.';

  @override
  String get helpSims2 =>
      'Move the sliders and the class sees the pendulum, the projectile or the wave change.';

  @override
  String get helpToolkitTitle => 'Timer, name picker and dice';

  @override
  String get helpToolkit1 =>
      'Tap Tools and pick one; it floats over the board.';

  @override
  String get helpToolkit2 => 'Drag it by its name to move it out of the way.';

  @override
  String get helpShadeTitle => 'Screen shade and spotlight';

  @override
  String get helpShade1 =>
      'The shade covers the board; drag its handle down to reveal it line by line.';

  @override
  String get helpShade2 =>
      'The spotlight darkens all but a circle you drag around.';

  @override
  String get helpReadTitle => 'Read aloud';

  @override
  String get helpRead1 =>
      'Select text and tap Read aloud, or Tools → Immersive reader for the page.';

  @override
  String get helpRead2 =>
      'Books and the labs read lessons and steps aloud too, in English, Hindi or Kannada where the board has the voice.';

  @override
  String get helpRecordTitle => 'Record a lesson';

  @override
  String get helpRecord1 =>
      'Tap the red button to record the board and your voice.';

  @override
  String get helpRecord2 => 'Tap it again to stop and save.';

  @override
  String get helpAiTitle => 'Ask KINETIX AI';

  @override
  String get helpAi1 =>
      'Tap the AI buttons on the right: ask, quiz, homework, the maths solver.';

  @override
  String get helpAi2 =>
      'Select something on the board and tap Read with AI to ask about it.';

  @override
  String get helpBooksTitle => 'Lessons from Books';

  @override
  String get helpBooks1 => 'Tap Books on the right and open a topic.';

  @override
  String get helpBooks2 =>
      'Read aloud opens the lesson large, read word by word.';

  @override
  String get helpSettingsTitle => 'Language, layout and touch';

  @override
  String get helpSettings1 =>
      'Open the menu at the bottom left, then Board settings.';

  @override
  String get practiceTitle => 'Practice board';

  @override
  String get practiceNotSaved => 'Nothing here is kept. Try everything.';

  @override
  String practiceCount(int done, int total) {
    return 'Practice: $done of $total done';
  }

  @override
  String get practiceReady => 'You\'re ready!';

  @override
  String get practiceDoneBody =>
      'You have done everything a class needs. Help is in the menu at the bottom left.';

  @override
  String get practiceShowList => 'Show the list';

  @override
  String get practiceHideList => 'Hide the list';

  @override
  String get practiceFinish => 'Finish practice';

  @override
  String get practiceEnd => 'End practice';

  @override
  String get practiceWrite => 'Write something with the pen';

  @override
  String get practiceErase => 'Rub it out, or tap Undo';

  @override
  String get practiceShape => 'Draw a shape';

  @override
  String get practicePage => 'Go to a new page';

  @override
  String get practicePicture => 'Add a picture from the picture library';

  @override
  String get practiceTimer => 'Start a timer from Tools';

  @override
  String get practiceEnded => 'Practice over: your board is back as it was.';

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
  String booksTaughtCount(int covered, int total) {
    return '$covered of $total topics taught';
  }

  @override
  String booksChapterTaught(int covered, int total) {
    return '$covered/$total taught';
  }

  @override
  String booksTaughtOn(String date) {
    return 'Taught on $date';
  }

  @override
  String get booksMarkTaught => 'Mark as taught';

  @override
  String get booksUndoTaught => 'Undo';

  @override
  String get booksMarked => 'Marked as taught';

  @override
  String get booksUnmarked => 'No longer marked as taught';

  @override
  String get booksMarkFailed => 'Could not save. Check the board is online.';

  @override
  String get booksHook => 'Start with';

  @override
  String get booksTerms => 'Words to learn';

  @override
  String get booksExample => 'Worked example';

  @override
  String get booksActivity => 'Class activity';

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

  @override
  String get toolTodaysPlan => 'Today\'s plan';

  @override
  String get planSignIn =>
      'Today\'s plan shows the lesson plan for the class being taught. Sign in with the Teacher app to open it.';

  @override
  String get planOpening => 'Opening the plan…';

  @override
  String get planCouldNotOpen =>
      'Could not open the lesson plan. Check the board is online.';

  @override
  String get planNoClass =>
      'No timetabled class is open on the board, so there is no lesson plan to show.';

  @override
  String get planNone =>
      'No lesson plan for this period. Plan it in the Teacher app.';

  @override
  String get planAiDrafted => 'Drafted with KINETIX AI';

  @override
  String get planTopics => 'Topics';

  @override
  String get planOpenInBooks => 'Open in Books';

  @override
  String planStepsOf(int planned, int length) {
    return 'Steps · $planned of $length min';
  }

  @override
  String get planStartTimer => 'Start step timer';

  @override
  String get planResumeTimer => 'Resume';

  @override
  String get planNextStep => 'Next step';

  @override
  String get planAllStepsDone => 'All steps done';

  @override
  String get planHomework => 'Homework';

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
  String get demoBoardBody =>
      'This board is in a demo class with sample data. Nothing is sent to a server.';

  @override
  String get kioskTitle => 'Kiosk mode';

  @override
  String get kioskSettingsHint =>
      'Keeps students in KINETIX Board and opens it again after a power cut. Your institution turns it on and sets the IT PIN in KINETIX ERP → Settings.';

  @override
  String get kioskStatusLocked => 'On: this device is locked to KINETIX Board.';

  @override
  String get kioskStatusPinned =>
      'On: screen pinning. For a full lock, make KINETIX Board the device owner (see the kiosk guide).';

  @override
  String get kioskStatusOff => 'Off';

  @override
  String kioskStatusPaused(String time) {
    return 'Paused by IT until $time';
  }

  @override
  String get kioskStatusUnsupported =>
      'Not available on this device. On Windows, use Assigned Access (see the kiosk guide).';

  @override
  String get kioskDemoHint =>
      'Demo builds never lock this device. Try screen pinning to see what kiosk mode is like: press and hold the clock for 3 seconds to leave.';

  @override
  String get kioskTry => 'Try kiosk (screen pinning)';

  @override
  String get kioskStopTrial => 'Stop kiosk trial';

  @override
  String get kioskExitTitle => 'Leave kiosk mode';

  @override
  String get kioskEnterPin =>
      'For IT staff: enter the IT PIN set in KINETIX ERP.';

  @override
  String get kioskPinLabel => 'IT PIN';

  @override
  String get kioskUnlock => 'Unlock';

  @override
  String kioskWrongPin(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Wrong PIN. $count attempts left.',
      one: 'Wrong PIN. 1 attempt left.',
    );
    return '$_temp0';
  }

  @override
  String kioskLockedOut(String time) {
    return 'Too many wrong PINs. Try again after $time.';
  }

  @override
  String get kioskNoPin =>
      'No IT PIN has been set for this institution yet. Set one in KINETIX ERP → Settings → Board kiosk mode; the board picks it up when it is next online. Until then, kiosk mode can only be removed as the kiosk guide describes.';

  @override
  String get kioskLeave => 'Leave kiosk for 10 minutes';

  @override
  String get kioskLeaveHint =>
      'The board locks again by itself after 10 minutes, or when it restarts.';

  @override
  String get kioskOpenSettings => 'Open Android settings';

  @override
  String kioskPausedBody(String time) {
    return 'Kiosk mode is paused until $time.';
  }

  @override
  String get kioskLockNow => 'Lock again now';

  @override
  String get kioskDemoBody =>
      'This is a demo build: kiosk mode is off and no PIN is needed.';

  @override
  String get toolConceptVideos => 'Concept videos';

  @override
  String get conceptVideosTitle => 'Concept videos';

  @override
  String get conceptVideosForPeriod => 'Concept videos for this period';

  @override
  String conceptVideosNext(String time) {
    return 'Next period at $time';
  }

  @override
  String get conceptVideosSkip => 'Skip';

  @override
  String get conceptVideosNone => 'No concept videos for this topic yet.';

  @override
  String get conceptVideosNoPeriod =>
      'No class on this board now or later today.';

  @override
  String get conceptVideosSignIn =>
      'Sign in to see concept videos for your class.';

  @override
  String get conceptVideosCouldNotLoad => 'Couldn\'t load the concept videos.';

  @override
  String get conceptVideosUnsupported =>
      'Videos can\'t play on this device. Use the board\'s Android or Windows app.';

  @override
  String get conceptVideosFromYouTube => 'Plays from YouTube';

  @override
  String get conceptVideosSourceLessonPlan => 'From today\'s lesson plan';

  @override
  String get conceptVideosSourceYearPlan => 'From the year plan';

  @override
  String get conceptVideosSourceSyllabus => 'Next topic in the syllabus';

  @override
  String conceptVideosPlay(String title) {
    return 'Play $title';
  }

  @override
  String get answerCover => 'Tap to show the answer';

  @override
  String get answerHint => 'The answer, kept covered until you show it';

  @override
  String get bgFourLine => 'Four-line';

  @override
  String get bringToFront => 'Bring to front';

  @override
  String get sendToBack => 'Send to back';

  @override
  String get circuitAmmeter => 'Ammeter';

  @override
  String get circuitBattery => 'Battery';

  @override
  String get circuitBulb => 'Bulb';

  @override
  String get circuitCell => 'Cell';

  @override
  String get circuitEarth => 'Earth';

  @override
  String get circuitLed => 'LED';

  @override
  String get circuitResistor => 'Resistor';

  @override
  String get circuitSwitchClosed => 'Switch (closed)';

  @override
  String get circuitSwitchOpen => 'Switch (open)';

  @override
  String get circuitVoltmeter => 'Voltmeter';

  @override
  String get circuitWire => 'Wire';

  @override
  String get copy => 'Copy';

  @override
  String get paste => 'Paste';

  @override
  String get duplicate => 'Duplicate';

  @override
  String get delete => 'Delete';

  @override
  String get edit => 'Edit';

  @override
  String get group => 'Group';

  @override
  String get ungroup => 'Ungroup';

  @override
  String get fill => 'Fill';

  @override
  String get noFill => 'No fill';

  @override
  String get fillShapes => 'Fill shapes';

  @override
  String get equationLatex => 'Equation (LaTeX)';

  @override
  String get equationPreview => 'Type below, or tap a sign';

  @override
  String get putOnBoard => 'Put on the board';

  @override
  String get flowDecision => 'Decision';

  @override
  String get flowInputOutput => 'Input / output';

  @override
  String get flowProcess => 'Process';

  @override
  String get flowStartEnd => 'Start / end';

  @override
  String get graphCannotRead => 'This function cannot be read';

  @override
  String get graphFunction => 'Function';

  @override
  String get graphHint => 'For example 2x^2 - 3, sin(x), sqrt(x)';

  @override
  String get graphXRange => 'x from − to +';

  @override
  String get graphYRange => 'y from − to +';

  @override
  String get hideProtractor => 'Hide protractor';

  @override
  String get hideRuler => 'Hide ruler';

  @override
  String get turn => 'Turn';

  @override
  String get typeHint => 'Type…';

  @override
  String get inputTitle => 'Writing with';

  @override
  String get inputHint =>
      'Pen: only the pen writes and fingers move the board. Auto: fingers write until a pen is used.';

  @override
  String get inputAuto => 'Auto';

  @override
  String get inputPen => 'Pen';

  @override
  String get inputFinger => 'Finger';

  @override
  String get insertAnswerHint => 'Covered until you tap it in class';

  @override
  String get insertEquationHint => 'Fractions, roots and powers, typeset';

  @override
  String get insertModelHint =>
      'Opens beside the board; put a picture of it on the board';

  @override
  String get tapToPlace => 'Tap the board to place it';

  @override
  String get laserHint => 'Points without drawing';

  @override
  String get kitAddWord => 'Add a word';

  @override
  String get kitAiForLesson => 'KINETIX AI for this lesson';

  @override
  String get kitAll => 'All';

  @override
  String get kitAtomBall => 'Atom ball';

  @override
  String get kitBinary => 'Binary';

  @override
  String get kitBohrModel => 'Bohr model';

  @override
  String get kitDecimal => 'Decimal number';

  @override
  String kitDrawTimeline(int count) {
    return 'Draw timeline ($count)';
  }

  @override
  String get kitElementCard => 'Element card';

  @override
  String get kitIndia => 'India';

  @override
  String get kitWorld => 'World';

  @override
  String get kitMore => 'In this kit';

  @override
  String get kitMoreHint =>
      'The tabs above hold this subject’s material. Tap anything to put it on the board.';

  @override
  String get kitPickEvents => 'Pick events for a timeline';

  @override
  String get kitSearchFormulas => 'Search formulas';

  @override
  String get kitSeeAndDo => 'See and do';

  @override
  String get kitShort => 'Kit';

  @override
  String get kitStarGive => 'Give a star';

  @override
  String get kitStarRemove => 'Take a star back';

  @override
  String kitStarOfTheDay(String name) {
    return 'Star of the day: $name';
  }

  @override
  String get kitStarsNoClass =>
      'Sign in with a timetabled class to give its children stars.';

  @override
  String get kitWordsHint =>
      'Words you write on the board appear here. Tap one for a big word card.';

  @override
  String get kitThisLesson => 'This lesson';

  @override
  String get kitFormulas => 'Formulas';

  @override
  String get kitConstants => 'Constants';

  @override
  String get kitPeriodic => 'Periodic table';

  @override
  String get kitIons => 'Ions';

  @override
  String get kitDates => 'Key dates';

  @override
  String get kitWords => 'Word wall';

  @override
  String get kitLogic => 'Logic gates';

  @override
  String get kitStars => 'Class stars';

  @override
  String kitValency(int valency) {
    return 'Valency $valency';
  }

  @override
  String get kitPeriodicHint =>
      'Tap an element for its card, Bohr model or atom ball.';

  @override
  String get kitLogicHint => 'Tap to write the truth table on the board.';

  @override
  String subjectKit(String subject) {
    return '$subject kit';
  }

  @override
  String get layoutTitle => 'Layout';

  @override
  String get layoutHint =>
      'Rails put the tools at the sides of the board; the toolbar puts them along the bottom.';

  @override
  String get layoutRails => 'Rails';

  @override
  String get layoutBottomBar => 'Bottom toolbar';

  @override
  String get simpleBoardTitle => 'Simple board';

  @override
  String get simpleBoardHint =>
      'Big tools with their names, Andika letters and class stars, for LKG to Class 5. Auto turns it on for those classes.';

  @override
  String get simpleBoardAuto => 'Auto';

  @override
  String get simpleBoardOn => 'On';

  @override
  String get simpleBoardOff => 'Off';

  @override
  String get noteAnswer => 'Covered answer';

  @override
  String get noteSticky => 'Sticky note';

  @override
  String get numberFrom => 'From';

  @override
  String get numberTo => 'To';

  @override
  String get numberStep => 'Step';

  @override
  String get openLab => 'Open the lab';

  @override
  String get openModel => 'Open the 3D model';

  @override
  String get readWithAi => 'Read with AI';

  @override
  String get snapshotAdded =>
      'Picture put on the board. Tap it to open it again.';

  @override
  String get snapshotToBoard => 'Put on board';

  @override
  String get stChemEquation => 'Chemical equation';

  @override
  String get stCode => 'Code block';

  @override
  String get stEquation => 'Equation';

  @override
  String get stGraph => 'Graph';

  @override
  String get stNumberLine => 'Number line';

  @override
  String get stWordCard => 'Word card';

  @override
  String get stGeometry => 'Geometry';

  @override
  String get stCircuits => 'Circuits';

  @override
  String get stAtoms => 'Atoms';

  @override
  String get stTimeline => 'Timeline';

  @override
  String get stFlowchart => 'Flowchart';

  @override
  String get stFourLine => 'Four-line paper';

  @override
  String get stGrammar => 'Grammar colours';

  @override
  String get subjectMaths => 'Maths';

  @override
  String get subjectPhysics => 'Physics';

  @override
  String get subjectChemistry => 'Chemistry';

  @override
  String get subjectBiology => 'Biology';

  @override
  String get subjectScience => 'Science';

  @override
  String get subjectEvs => 'EVS';

  @override
  String get subjectGeography => 'Geography';

  @override
  String get subjectHistory => 'History';

  @override
  String get subjectCivics => 'Civics';

  @override
  String get subjectCommerce => 'Commerce';

  @override
  String get subjectEnglish => 'English';

  @override
  String get subjectLanguages => 'Languages';

  @override
  String get subjectComputer => 'Computer science';

  @override
  String get subjectArt => 'Art';

  @override
  String get subjectGeneral => 'Class';

  @override
  String get toolCompass => 'Compass';

  @override
  String get toolInsert => 'Add';

  @override
  String get toolLaser => 'Laser pointer';

  @override
  String get toolMove => 'Move the board';

  @override
  String get toolText => 'Text';

  @override
  String get zoomFit => 'Show everything';

  @override
  String get zoomIn => 'Zoom in';

  @override
  String get zoomOut => 'Zoom out';

  @override
  String get zoomReset => 'Back to 100%';

  @override
  String get aiPen => 'AI pen';

  @override
  String get aiPenTitle =>
      'AI pen: shapes, maths and words from your handwriting';

  @override
  String get aiPenModeAuto => 'After a pause';

  @override
  String get aiPenModeAutoHint =>
      'Write as usual; about a second after you stop, it is converted.';

  @override
  String get aiPenModeLive => 'Word by word';

  @override
  String get aiPenModeLiveHint =>
      'Each word is converted as you start the next one.';

  @override
  String get aiPenModeTap => 'When I tap Convert';

  @override
  String get aiPenModeTapHint => 'Ink stays as written until you tap Convert.';

  @override
  String get aiPenConvert => 'Convert';

  @override
  String get aiPenWordsLanguage => 'Words are read in';

  @override
  String get aiPenTapHint =>
      'Tap something the AI pen converted to see other readings or get your ink back. Scribble over ink to rub it out.';

  @override
  String get aiPenSnapShapes => 'Tidy shapes as I draw';

  @override
  String get aiPenSnapShapesHint =>
      'Rough circles, lines, arrows and polygons drawn with the pen become clean shapes.';

  @override
  String get aiPenDidYouMean => 'Did you mean…';

  @override
  String get aiPenTypeIt => 'Or type it';

  @override
  String get aiPenItsShape => 'It\'s a shape';

  @override
  String get aiPenItsWriting => 'It\'s writing';

  @override
  String get aiPenBackToInk => 'Back to my ink';

  @override
  String get aiPenKeepShape => 'Keep the shape';

  @override
  String get aiPenNoShape => 'No clean shape fits that ink.';

  @override
  String get aiPenReadings => 'Other readings';

  @override
  String get aiPenConvertInk => 'Convert with AI pen';

  @override
  String get aiPenWordsStayInk =>
      'Shapes and maths convert on this board. Words stay as ink: this board has no handwriting reader.';

  @override
  String aiPenModelNeeded(String language) {
    return 'Words stay as ink until the $language handwriting model is downloaded (Board settings → AI pen).';
  }

  @override
  String aiPenLanguageUnsupported(String language) {
    return 'This board cannot read $language handwriting. Words stay as ink; shapes and maths still convert.';
  }

  @override
  String get aiPenNothingToConvert =>
      'Nothing to convert: select handwriting or drawings first.';

  @override
  String get aiPenSettingsTitle => 'AI pen';

  @override
  String get aiPenSettingsHint =>
      'Handwriting is read on this board: nothing you write leaves it. Shapes and maths work in every language with no download.';

  @override
  String get aiPenEngineMlkit =>
      'Words are read by Google ML Kit on this panel. Each language\'s model downloads once (about 20 MB); after that it works offline.';

  @override
  String get aiPenEngineWindows =>
      'Words are read by the Windows handwriting recogniser. To add a language, add its handwriting in Windows Settings → Time & language.';

  @override
  String get aiPenEngineNone =>
      'This board has no handwriting reader: words stay as ink.';

  @override
  String get aiPenModelReady => 'Ready';

  @override
  String get aiPenModelDownload => 'Download';

  @override
  String get aiPenModelDownloading => 'Downloading…';

  @override
  String get aiPenModelUnsupported => 'Not available on this board';

  @override
  String get aiPenDownloadFailed =>
      'Could not download the handwriting model. Connect to the internet once and try again.';

  @override
  String get aiOfflineLabel =>
      'Offline sample — from the board\'s own notes (in English), because KINETIX AI cannot be reached';

  @override
  String get profilesTitle => 'Who is teaching?';

  @override
  String get profilesHint =>
      'Teachers who have signed in on this board. Tap your name and enter your PIN.';

  @override
  String get profilesSignInFull => 'Sign in with the Teacher app';

  @override
  String get profilesLocked => 'Locked';

  @override
  String get profilesNoPin => 'No PIN yet';

  @override
  String pinEnterFor(String name) {
    return 'Enter $name\'s PIN';
  }

  @override
  String pinWrong(int n) {
    return 'Wrong PIN. Tries left: $n';
  }

  @override
  String get pinWrongNoCount => 'Wrong PIN. Try again.';

  @override
  String get pinLockedOut =>
      'Too many wrong PINs. Sign in with the Teacher app, or ask your administrator to reset your PIN.';

  @override
  String get pinNoPin =>
      'No PIN is set for you on this board. Sign in with the Teacher app, then set a PIN.';

  @override
  String get pinNeedsNetwork =>
      'This board is offline and has no class open for you. Connect to the internet, or sign in with the Teacher app.';

  @override
  String get pinSetTitle => 'Set a PIN for this board';

  @override
  String get pinSetHint =>
      '4 to 6 digits. Next time, tap your name on this board and enter your PIN instead of using the Teacher app.';

  @override
  String get pinConfirm => 'Enter the PIN again';

  @override
  String get pinMismatch => 'The two PINs are different. Try again.';

  @override
  String get pinWeak => 'Choose a PIN that is harder to guess.';

  @override
  String get pinSaved =>
      'PIN saved. Use it to switch to your profile on this board.';

  @override
  String get pinSetAction => 'Set PIN';

  @override
  String get pinChangeAction => 'Change PIN';

  @override
  String get pinBanner =>
      'Set a PIN to switch to your profile on this board without your phone.';

  @override
  String get notNow => 'Not now';

  @override
  String get lockTitle => 'Board locked';

  @override
  String lockHint(String name) {
    return '$name\'s class is still open. Enter the PIN to carry on.';
  }

  @override
  String get switchTeacher => 'Switch teacher';

  @override
  String get lockBoard => 'Lock board';

  @override
  String get signOut => 'Sign out';

  @override
  String get idleLockTitle => 'Lock when idle';

  @override
  String get idleLockHint =>
      'For teachers with a PIN, the board locks after this many minutes without a touch. It signs out when the period ends.';

  @override
  String get idleOff => 'Off';

  @override
  String get projectorTitle => 'Projector';

  @override
  String get projectorHint =>
      'Show the board to the class on a second screen (a projector or TV), without your tools and panels. 3D models and labs show beside it.';

  @override
  String get projectorEnabled => 'Use a second screen';

  @override
  String get projectorAuto => 'Start when a screen is connected';

  @override
  String get projectorNone => 'No second screen connected';

  @override
  String projectorShowingOn(String name) {
    return 'Showing on $name';
  }

  @override
  String get projectorShow => 'Show on second screen';

  @override
  String get projectorStop => 'Stop showing';

  @override
  String get projectorBlank => 'Blank the class screen';

  @override
  String get toolAskClass => 'Ask the class';

  @override
  String get askClassHint =>
      'Students answer in the Student App, or hold up their answer card with the answer on top. No phones needed.';

  @override
  String get askQuestionLabel => 'Question (optional)';

  @override
  String get askAnswersLabel => 'Answers';

  @override
  String get askTrueFalse => 'True / False';

  @override
  String get askNumber => 'Number';

  @override
  String get askRightAnswer => 'Right answer (optional)';

  @override
  String get askNumberHint => 'For example 2.5';

  @override
  String get askNumberNoCards =>
      'Number answers come from the Student App only (answer cards show A to D).';

  @override
  String get askStart => 'Ask';

  @override
  String get pollTrue => 'True';

  @override
  String get pollFalse => 'False';

  @override
  String get pollDefaultQuestion => 'Class check';

  @override
  String get pollNoCards =>
      'No answer cards found in the photo. Ask the class to hold them up flat, then try again.';

  @override
  String pollCardsRead(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count cards read.',
      one: '1 card read.',
    );
    return '$_temp0';
  }

  @override
  String pollUnknownCards(String cards) {
    return 'Cards $cards are not in this class.';
  }

  @override
  String get pollScanFailed => 'Could not read the photo. Try again.';

  @override
  String pollAnswered(int count, int total) {
    return '$count of $total answered';
  }

  @override
  String get pollEnded => 'Question ended';

  @override
  String get pollLiveInApp => 'Live in the Student App';

  @override
  String get pollNotSaved => 'Answer cards only; not saved (no class is open).';

  @override
  String get pollScanCards => 'Scan answer cards';

  @override
  String get pollShowAnswer => 'Show answer';

  @override
  String get pollEnd => 'End question';

  @override
  String get pollPutOnBoard => 'Put results on board';

  @override
  String get pollNoAnswersYet => 'No answers yet.';

  @override
  String get remoteConnected => 'Phone remote connected.';

  @override
  String get remotePhotoFailed => 'Could not show the photo from the phone.';

  @override
  String get subjectManagement => 'Management';

  @override
  String get subjectLaw => 'Law';

  @override
  String get subjectStatistics => 'Statistics';

  @override
  String get kitAccounts => 'Accounts';

  @override
  String get kitFinance => 'Calculators';

  @override
  String get kitManagement => 'Frameworks';

  @override
  String get kitLaw => 'Law';

  @override
  String get kitAlgorithms => 'Algorithms';

  @override
  String get kitCsLabs => 'CS labs';

  @override
  String get kitDiagrams => 'Diagrams';

  @override
  String get stCodeLab => 'Code lab';

  @override
  String get kitStats => 'Statistics';

  @override
  String get stSheet => 'Spreadsheet';

  @override
  String get stReader => 'Act and case reader';

  @override
  String get accFormats => 'Formats';

  @override
  String get accJournal => 'Journal';

  @override
  String get accLedger => 'Ledger (T-account)';

  @override
  String get accTrialBalance => 'Trial balance';

  @override
  String get accFinalAccounts => 'Trading and profit & loss account';

  @override
  String get accBalanceSheet => 'Balance sheet (Schedule III)';

  @override
  String get accCashBook => 'Cash book';

  @override
  String get accBrs => 'Bank reconciliation statement';

  @override
  String get accBlankSheet => 'Blank spreadsheet';

  @override
  String get calcDepreciation => 'Depreciation (SLM / WDV)';

  @override
  String get calcRatios => 'Accounting ratios';

  @override
  String get calcNpv => 'NPV, IRR and payback';

  @override
  String get calcBreakEven => 'Break-even point';

  @override
  String get calcGst => 'GST (CGST / SGST / IGST)';

  @override
  String get calcInterest => 'Simple and compound interest';

  @override
  String get calcEmi => 'EMI';

  @override
  String get calcWorkOut => 'Work it out';

  @override
  String get calcPutOnBoard => 'Put on the board';

  @override
  String get calcCheckInputs => 'Check the numbers';

  @override
  String get calcOpenLab => 'Open the break-even lab';

  @override
  String get methodSlm => 'Straight line';

  @override
  String get methodWdv => 'Written-down value';

  @override
  String get interestSimple => 'Simple';

  @override
  String get interestCompound => 'Compound';

  @override
  String get fCost => 'Cost (₹)';

  @override
  String get fScrap => 'Scrap value (₹)';

  @override
  String get fLife => 'Useful life (years)';

  @override
  String get fRate => 'Rate (% a year)';

  @override
  String get fYears => 'Years';

  @override
  String get fMonths => 'Months';

  @override
  String get fPrincipal => 'Principal (₹)';

  @override
  String get fAmount => 'Amount (₹)';

  @override
  String get fGstRate => 'GST rate (%)';

  @override
  String get fInterState => 'Inter-state supply (IGST)';

  @override
  String get fInclusive => 'Amount includes GST';

  @override
  String get fOutlay => 'Initial outlay (₹)';

  @override
  String get fCashFlows => 'Cash inflows, year by year (₹)';

  @override
  String get fDiscountRate => 'Cost of capital (%)';

  @override
  String get fFixedCost => 'Fixed cost (₹)';

  @override
  String get fVariableCost => 'Variable cost a unit (₹)';

  @override
  String get fPrice => 'Selling price a unit (₹)';

  @override
  String get fUnits => 'Units sold';

  @override
  String get fCompounding => 'Times compounded a year';

  @override
  String get fCurrentAssets => 'Current assets';

  @override
  String get fCurrentLiabilities => 'Current liabilities';

  @override
  String get fInventory => 'Inventory';

  @override
  String get fPrepaid => 'Prepaid expenses';

  @override
  String get fDebt => 'Long-term debt';

  @override
  String get fEquity => 'Shareholders’ funds';

  @override
  String get fRevenue => 'Revenue from operations';

  @override
  String get fGrossProfit => 'Gross profit';

  @override
  String get fNetProfit => 'Net profit';

  @override
  String get fCogs => 'Cost of revenue from operations';

  @override
  String get fAvgInventory => 'Average inventory';

  @override
  String get fReceivables => 'Trade receivables';

  @override
  String get fEbit => 'Profit before interest and tax';

  @override
  String get fInterest => 'Interest';

  @override
  String get fTotalAssets => 'Total assets';

  @override
  String get mgSwot => 'SWOT analysis';

  @override
  String get mgPestle => 'PESTLE analysis';

  @override
  String get mgPorter => 'Porter’s five forces';

  @override
  String get mgBcg => 'BCG matrix';

  @override
  String get mgAnsoff => 'Ansoff matrix';

  @override
  String get mgValueChain => 'Value chain';

  @override
  String get mg7s => 'McKinsey 7S';

  @override
  String get mgMaslow => 'Maslow’s hierarchy of needs';

  @override
  String get mg4p => 'Marketing mix (4 Ps)';

  @override
  String get mg7p => 'Marketing mix (7 Ps)';

  @override
  String get mgGantt => 'Gantt chart';

  @override
  String get mgPert => 'PERT / CPM (critical path)';

  @override
  String get mgDecisionTree => 'Decision tree';

  @override
  String get mgFishbone => 'Fishbone diagram';

  @override
  String get mgMindMap => 'Mind map';

  @override
  String get mgCaseStudy => 'Case study frame';

  @override
  String get mgStrategy => 'Strategy';

  @override
  String get mgMarketing => 'Marketing and people';

  @override
  String get mgProjects => 'Projects and decisions';

  @override
  String get pertActivities => 'Activities';

  @override
  String get pertHint =>
      'One activity a line: its letter, its time (or optimistic, likely, pessimistic), then the activities before it. For example: C 2 A';

  @override
  String get pertInvalid =>
      'Check the activities: one needs an activity that is not listed, or they go round in a loop.';

  @override
  String get lawReader => 'Read an act or a judgment';

  @override
  String get lawPaste => 'Paste text';

  @override
  String get lawImportPdf => 'Import a PDF';

  @override
  String get lawEditText => 'Edit the text';

  @override
  String get lawRead => 'Read';

  @override
  String get lawAddNote => 'Add a note';

  @override
  String get lawSendToBoard => 'Put highlights on the board';

  @override
  String get lawSamples => 'Sample sections';

  @override
  String get lawReaderEmpty =>
      'Paste the text of an act or a judgment, or import a PDF. Then tap a paragraph to highlight it.';

  @override
  String get lawNoText =>
      'No text found in this PDF. It may be a scanned copy.';

  @override
  String get lawNothingHighlighted => 'Highlight a paragraph first';

  @override
  String get lawCaseBrief => 'Case brief';

  @override
  String get lawIrac => 'IRAC frame';

  @override
  String get lawTimeline => 'Timeline of events';

  @override
  String get lawTimelineHint =>
      'One event a line: the date, then what happened';

  @override
  String get lawArgumentMap => 'Argument map';

  @override
  String get lawFrames => 'Frames';

  @override
  String get stData => 'Data';

  @override
  String get stDataHint => 'Numbers, separated by spaces, commas or new lines';

  @override
  String get stDescriptive => 'Descriptive statistics';

  @override
  String get stBoxPlot => 'Box plot';

  @override
  String get stHistogram => 'Histogram';

  @override
  String get stDistributions => 'Probability distributions';

  @override
  String get stNormal => 'Normal';

  @override
  String get stBinomial => 'Binomial';

  @override
  String get stPoisson => 'Poisson';

  @override
  String get stT => 't';

  @override
  String get stChiSquare => 'Chi-square';

  @override
  String get stMean => 'Mean (μ)';

  @override
  String get stSd => 'Standard deviation (σ)';

  @override
  String get stTrials => 'Trials (n)';

  @override
  String get stProbability => 'Probability of success (p)';

  @override
  String get stLambda => 'Mean (λ)';

  @override
  String get stDf => 'Degrees of freedom';

  @override
  String get stFrom => 'From';

  @override
  String get stTo => 'To';

  @override
  String get stRegression => 'Correlation and regression';

  @override
  String get stPairsHint => 'One pair a line: x, y';

  @override
  String get stTests => 'Tests of hypotheses';

  @override
  String get stZTest => 'z test (one mean)';

  @override
  String get stTTest1 => 't test (one mean)';

  @override
  String get stTTest2 => 't test (two means)';

  @override
  String get stChiTest => 'Chi-square test';

  @override
  String get stAnova => 'One-way ANOVA';

  @override
  String get stSampleMean => 'Sample mean (x̄)';

  @override
  String get stSampleSize => 'Sample size (n)';

  @override
  String get stMu0 => 'Hypothesised mean (μ₀)';

  @override
  String get stAlpha => 'Level of significance (α)';

  @override
  String get stSample1 => 'Sample 1';

  @override
  String get stSample2 => 'Sample 2';

  @override
  String get stObservedHint =>
      'Observed frequencies, one row a line (one row tests goodness of fit)';

  @override
  String get stExpectedHint => 'Expected frequencies (leave blank for equal)';

  @override
  String get stGroupsHint => 'One group a line';

  @override
  String get stIndex => 'Index numbers';

  @override
  String get stIndexHint => 'One item a line: p₀, q₀, p₁, q₁';

  @override
  String get stMovingAverage => 'Moving average';

  @override
  String get stPeriod => 'Period';

  @override
  String get stSeriesHint => 'Values in time order';

  @override
  String get stDrawChart => 'Draw the chart too';

  @override
  String get sheetTitle => 'Spreadsheet';

  @override
  String get sheetCellHint =>
      'A number, words, or a formula such as =SUM(B2:B6)';

  @override
  String get sheetAddRow => 'Add a row';

  @override
  String get sheetAddColumn => 'Add a column';

  @override
  String get sheetRemoveRow => 'Remove the last row';

  @override
  String get sheetRemoveColumn => 'Remove the last column';

  @override
  String get sheetHeading => 'First row is a heading';

  @override
  String get sheetFormat => 'Column format';

  @override
  String get fmtGeneral => 'General';

  @override
  String get fmtNumber => '1,23,456.00';

  @override
  String get fmtInr => '₹ (Indian)';

  @override
  String get fmtLakh => '₹ lakh';

  @override
  String get fmtCrore => '₹ crore';

  @override
  String get fmtPercent => 'Percent';

  @override
  String get sheetChart => 'Chart';

  @override
  String get chartNone => 'No chart';

  @override
  String get chartBar => 'Bars';

  @override
  String get chartLine => 'Line';

  @override
  String get chartPie => 'Pie';

  @override
  String get sheetLabels => 'Labels (e.g. A2:A6)';

  @override
  String get sheetValues => 'Values (e.g. B2:B6)';

  @override
  String get fingerTapsTitle => 'Finger taps';

  @override
  String get fingerTapsHint =>
      'Tap the board with two fingers to undo, with three fingers to redo.';

  @override
  String get helpErase3 =>
      'Or tap the board with two fingers to undo; three fingers redo.';

  @override
  String get toolMore => 'More';
}

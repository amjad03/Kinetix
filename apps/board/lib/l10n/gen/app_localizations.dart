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
/// import 'gen/app_localizations.dart';
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
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

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
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
    Locale('kn'),
  ];

  /// Product name; stays in English.
  ///
  /// In en, this message translates to:
  /// **'KINETIX Board'**
  String get appTitle;

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

  /// No description provided for @ok.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @open.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get open;

  /// No description provided for @discard.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get discard;

  /// No description provided for @keep.
  ///
  /// In en, this message translates to:
  /// **'Keep'**
  String get keep;

  /// No description provided for @tryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get tryAgain;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @back.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get back;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @regenerate.
  ///
  /// In en, this message translates to:
  /// **'Regenerate'**
  String get regenerate;

  /// No description provided for @titleLabel.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get titleLabel;

  /// A topic of a chapter (glossary: Chapter / Topic).
  ///
  /// In en, this message translates to:
  /// **'Topic'**
  String get topicLabel;

  /// Small badge on features that are not built yet.
  ///
  /// In en, this message translates to:
  /// **'Soon'**
  String get soon;

  /// No description provided for @comingSoonFeature.
  ///
  /// In en, this message translates to:
  /// **'{feature} is coming in an upcoming build.'**
  String comingSoonFeature(String feature);

  /// No description provided for @guest.
  ///
  /// In en, this message translates to:
  /// **'Guest'**
  String get guest;

  /// No description provided for @practiceBoard.
  ///
  /// In en, this message translates to:
  /// **'Practice board'**
  String get practiceBoard;

  /// No description provided for @noClassTimetabled.
  ///
  /// In en, this message translates to:
  /// **'No class is timetabled now'**
  String get noClassTimetabled;

  /// No description provided for @goesTo.
  ///
  /// In en, this message translates to:
  /// **'Goes to {section}'**
  String goesTo(String section);

  /// No description provided for @minutesShort.
  ///
  /// In en, this message translates to:
  /// **'{n} min'**
  String minutesShort(int n);

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

  /// No description provided for @requestFailed.
  ///
  /// In en, this message translates to:
  /// **'Request failed ({status})'**
  String requestFailed(int status);

  /// No description provided for @cloudUnreachable.
  ///
  /// In en, this message translates to:
  /// **'Could not reach KINETIX Cloud'**
  String get cloudUnreachable;

  /// No description provided for @toolRecord.
  ///
  /// In en, this message translates to:
  /// **'Record'**
  String get toolRecord;

  /// No description provided for @toolStop.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get toolStop;

  /// No description provided for @toolTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get toolTheme;

  /// No description provided for @toolWrite.
  ///
  /// In en, this message translates to:
  /// **'Write'**
  String get toolWrite;

  /// No description provided for @toolErase.
  ///
  /// In en, this message translates to:
  /// **'Erase'**
  String get toolErase;

  /// No description provided for @toolSelect.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get toolSelect;

  /// No description provided for @toolShapes.
  ///
  /// In en, this message translates to:
  /// **'Shapes'**
  String get toolShapes;

  /// No description provided for @toolTools.
  ///
  /// In en, this message translates to:
  /// **'Tools'**
  String get toolTools;

  /// Short toolbar label. Hindi/Kannada use the English loan word; review.
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get toolUndo;

  /// Short toolbar label. Hindi/Kannada use the English loan word; review.
  ///
  /// In en, this message translates to:
  /// **'Redo'**
  String get toolRedo;

  /// No description provided for @toolAi.
  ///
  /// In en, this message translates to:
  /// **'AI'**
  String get toolAi;

  /// No description provided for @toolBooks.
  ///
  /// In en, this message translates to:
  /// **'Books'**
  String get toolBooks;

  /// No description provided for @toolQuiz.
  ///
  /// In en, this message translates to:
  /// **'Quiz'**
  String get toolQuiz;

  /// No description provided for @toolHomework.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get toolHomework;

  /// Moves the toolbar to the other side.
  ///
  /// In en, this message translates to:
  /// **'Switch'**
  String get toolSwitch;

  /// No description provided for @toolHide.
  ///
  /// In en, this message translates to:
  /// **'Hide'**
  String get toolHide;

  /// No description provided for @toolPrevious.
  ///
  /// In en, this message translates to:
  /// **'Previous'**
  String get toolPrevious;

  /// No description provided for @toolNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get toolNext;

  /// No description provided for @toolNewPage.
  ///
  /// In en, this message translates to:
  /// **'New page'**
  String get toolNewPage;

  /// No description provided for @showTools.
  ///
  /// In en, this message translates to:
  /// **'Show tools'**
  String get showTools;

  /// No description provided for @deleteSelection.
  ///
  /// In en, this message translates to:
  /// **'Delete {count}'**
  String deleteSelection(int count);

  /// No description provided for @guestSignIn.
  ///
  /// In en, this message translates to:
  /// **'Guest · Sign in'**
  String get guestSignIn;

  /// No description provided for @beingViewed.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Being viewed} other{Being viewed · {count}}}'**
  String beingViewed(int count);

  /// No description provided for @beingViewedTooltip.
  ///
  /// In en, this message translates to:
  /// **'A school leader is watching this class live. Viewing is recorded in the audit log.'**
  String get beingViewedTooltip;

  /// No description provided for @goLive.
  ///
  /// In en, this message translates to:
  /// **'Go live'**
  String get goLive;

  /// No description provided for @liveWaiting.
  ///
  /// In en, this message translates to:
  /// **'Live · waiting for students'**
  String get liveWaiting;

  /// No description provided for @liveStudents.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Live · 1 student} other{Live · {count} students}}'**
  String liveStudents(int count);

  /// No description provided for @stopLiveTooltip.
  ///
  /// In en, this message translates to:
  /// **'Stop the live class'**
  String get stopLiveTooltip;

  /// No description provided for @goLiveTooltip.
  ///
  /// In en, this message translates to:
  /// **'Let students of this class watch the board in the Student app'**
  String get goLiveTooltip;

  /// No description provided for @liveStarted.
  ///
  /// In en, this message translates to:
  /// **'Live: students of this class can watch the board in the Student app. Turn on Class audio to let them hear you.'**
  String get liveStarted;

  /// No description provided for @liveEnded.
  ///
  /// In en, this message translates to:
  /// **'The live class has ended.'**
  String get liveEnded;

  /// No description provided for @classAudio.
  ///
  /// In en, this message translates to:
  /// **'Class audio'**
  String get classAudio;

  /// No description provided for @classAudioOn.
  ///
  /// In en, this message translates to:
  /// **'Class audio on'**
  String get classAudioOn;

  /// No description provided for @classAudioTurnOnTooltip.
  ///
  /// In en, this message translates to:
  /// **'Let students in the live class hear you through the board\'s microphone'**
  String get classAudioTurnOnTooltip;

  /// No description provided for @classAudioTurnOffTooltip.
  ///
  /// In en, this message translates to:
  /// **'Turn off class audio'**
  String get classAudioTurnOffTooltip;

  /// No description provided for @micOn.
  ///
  /// In en, this message translates to:
  /// **'Mic on'**
  String get micOn;

  /// No description provided for @micOnTooltip.
  ///
  /// In en, this message translates to:
  /// **'The board\'s microphone is on: students in the live class can hear the classroom'**
  String get micOnTooltip;

  /// No description provided for @classAudioStarted.
  ///
  /// In en, this message translates to:
  /// **'Class audio is on. Students in the live class can hear you; \"Mic on\" shows while they are listening.'**
  String get classAudioStarted;

  /// No description provided for @classAudioStopped.
  ///
  /// In en, this message translates to:
  /// **'Class audio is off.'**
  String get classAudioStopped;

  /// Why the microphone could not be used for class audio; reason is voiceNoMicrophone etc.
  ///
  /// In en, this message translates to:
  /// **'Class audio isn\'t available: {reason}'**
  String classAudioUnavailable(String reason);

  /// No description provided for @cloudUnreachableCheckOnline.
  ///
  /// In en, this message translates to:
  /// **'Could not reach KINETIX Cloud. Check the board is online.'**
  String get cloudUnreachableCheckOnline;

  /// No description provided for @noClassList.
  ///
  /// In en, this message translates to:
  /// **'No class list'**
  String get noClassList;

  /// No description provided for @takeAttendance.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 student · Take attendance} other{{count} students · Take attendance}}'**
  String takeAttendance(int count);

  /// No description provided for @presentOfTotal.
  ///
  /// In en, this message translates to:
  /// **'{present}/{total} present'**
  String presentOfTotal(int present, int total);

  /// No description provided for @pendingSync.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 change waiting to sync} other{{count} changes waiting to sync}}'**
  String pendingSync(int count);

  /// No description provided for @connectedCloud.
  ///
  /// In en, this message translates to:
  /// **'Connected to KINETIX Cloud'**
  String get connectedCloud;

  /// No description provided for @offlineSaved.
  ///
  /// In en, this message translates to:
  /// **'Offline. Everything is saved and will sync.'**
  String get offlineSaved;

  /// No description provided for @endClass.
  ///
  /// In en, this message translates to:
  /// **'End class'**
  String get endClass;

  /// No description provided for @signedOutGuest.
  ///
  /// In en, this message translates to:
  /// **'Signed out. The board is in guest mode.'**
  String get signedOutGuest;

  /// No description provided for @welcomeTeacher.
  ///
  /// In en, this message translates to:
  /// **'Welcome, {name}.'**
  String welcomeTeacher(String name);

  /// No description provided for @signInUnregistered.
  ///
  /// In en, this message translates to:
  /// **'Sign-in on an unregistered board'**
  String get signInUnregistered;

  /// No description provided for @recordNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to record lessons. The teacher must connect to this board first.'**
  String get recordNeedsSignIn;

  /// No description provided for @recordingStarted.
  ///
  /// In en, this message translates to:
  /// **'Recording the board and your voice.'**
  String get recordingStarted;

  /// No description provided for @recordingNoSound.
  ///
  /// In en, this message translates to:
  /// **'Recording the board without sound: {reason}'**
  String recordingNoSound(String reason);

  /// No description provided for @voiceNoMicrophone.
  ///
  /// In en, this message translates to:
  /// **'no microphone found'**
  String get voiceNoMicrophone;

  /// No description provided for @voicePermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'the microphone permission was denied'**
  String get voicePermissionDenied;

  /// No description provided for @voiceUnsupported.
  ///
  /// In en, this message translates to:
  /// **'this board cannot record sound'**
  String get voiceUnsupported;

  /// No description provided for @voiceNotStarted.
  ///
  /// In en, this message translates to:
  /// **'the microphone could not be started'**
  String get voiceNotStarted;

  /// No description provided for @couldNotStartRecording.
  ///
  /// In en, this message translates to:
  /// **'Could not start recording: {error}'**
  String couldNotStartRecording(String error);

  /// No description provided for @recordingDiscarded.
  ///
  /// In en, this message translates to:
  /// **'Recording discarded.'**
  String get recordingDiscarded;

  /// No description provided for @recordingSavedUploading.
  ///
  /// In en, this message translates to:
  /// **'Recording saved. It is uploading to KINETIX Cloud.'**
  String get recordingSavedUploading;

  /// No description provided for @recordingSavedLater.
  ///
  /// In en, this message translates to:
  /// **'Recording saved on this board. It uploads when {name} next signs in.'**
  String recordingSavedLater(String name);

  /// No description provided for @couldNotSaveRecording.
  ///
  /// In en, this message translates to:
  /// **'Could not save the recording: {error}'**
  String couldNotSaveRecording(String error);

  /// No description provided for @saveNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to save boards to the cloud.'**
  String get saveNeedsSignIn;

  /// No description provided for @nothingToSave.
  ///
  /// In en, this message translates to:
  /// **'There is nothing on the board to save yet.'**
  String get nothingToSave;

  /// No description provided for @savedAndShared.
  ///
  /// In en, this message translates to:
  /// **'Saved and shared with {section}.'**
  String savedAndShared(String section);

  /// No description provided for @savedToWhiteboards.
  ///
  /// In en, this message translates to:
  /// **'Saved to Your whiteboards.'**
  String get savedToWhiteboards;

  /// No description provided for @couldNotSaveBoard.
  ///
  /// In en, this message translates to:
  /// **'Could not save the board: {error}'**
  String couldNotSaveBoard(String error);

  /// No description provided for @whiteboardsNeedSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to see your saved boards.'**
  String get whiteboardsNeedSignIn;

  /// No description provided for @replaceBoardTitle.
  ///
  /// In en, this message translates to:
  /// **'Replace the board?'**
  String get replaceBoardTitle;

  /// No description provided for @replaceBoardBody.
  ///
  /// In en, this message translates to:
  /// **'What is on the board now will be lost unless you save it first.'**
  String get replaceBoardBody;

  /// No description provided for @openedBoard.
  ///
  /// In en, this message translates to:
  /// **'Opened \"{title}\". Saving again updates it.'**
  String openedBoard(String title);

  /// No description provided for @couldNotOpenBoard.
  ///
  /// In en, this message translates to:
  /// **'Could not open the board: {error}'**
  String couldNotOpenBoard(String error);

  /// No description provided for @endClassTitle.
  ///
  /// In en, this message translates to:
  /// **'End class?'**
  String get endClassTitle;

  /// No description provided for @endClassBody.
  ///
  /// In en, this message translates to:
  /// **'You will be signed out of this board. Attendance and answers recorded in class are kept.'**
  String get endClassBody;

  /// No description provided for @endClassRecordingNote.
  ///
  /// In en, this message translates to:
  /// **'The lesson recording stops, and you can save and share it first.'**
  String get endClassRecordingNote;

  /// No description provided for @saveThisBoard.
  ///
  /// In en, this message translates to:
  /// **'Save this board'**
  String get saveThisBoard;

  /// No description provided for @shareWithStudentsParents.
  ///
  /// In en, this message translates to:
  /// **'Share with students and parents'**
  String get shareWithStudentsParents;

  /// No description provided for @keepTeaching.
  ///
  /// In en, this message translates to:
  /// **'Keep teaching'**
  String get keepTeaching;

  /// No description provided for @uploadingBeforeSignOut.
  ///
  /// In en, this message translates to:
  /// **'Uploading the lesson recording before signing out…'**
  String get uploadingBeforeSignOut;

  /// No description provided for @signedOutRecordingPending.
  ///
  /// In en, this message translates to:
  /// **'Signed out. The lesson recording is saved on this board and uploads when {name} next signs in.'**
  String signedOutRecordingPending(String name);

  /// No description provided for @attendanceWithoutClass.
  ///
  /// In en, this message translates to:
  /// **'Attendance without a timetabled class'**
  String get attendanceWithoutClass;

  /// Default title of a saved board with no subject: "Board · 4 Oct".
  ///
  /// In en, this message translates to:
  /// **'Board'**
  String get defaultBoardName;

  /// Default title of a recording with no subject: "Lesson · 5 Oct".
  ///
  /// In en, this message translates to:
  /// **'Lesson'**
  String get defaultLessonName;

  /// No description provided for @toolTimer.
  ///
  /// In en, this message translates to:
  /// **'Timer'**
  String get toolTimer;

  /// No description provided for @toolRandomPick.
  ///
  /// In en, this message translates to:
  /// **'Random pick'**
  String get toolRandomPick;

  /// No description provided for @toolAttendance.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get toolAttendance;

  /// No description provided for @toolSplitScreen.
  ///
  /// In en, this message translates to:
  /// **'Split screen'**
  String get toolSplitScreen;

  /// No description provided for @toolEyeComfort.
  ///
  /// In en, this message translates to:
  /// **'Eye comfort'**
  String get toolEyeComfort;

  /// No description provided for @toolRuler.
  ///
  /// In en, this message translates to:
  /// **'Ruler'**
  String get toolRuler;

  /// No description provided for @toolProtractor.
  ///
  /// In en, this message translates to:
  /// **'Protractor'**
  String get toolProtractor;

  /// No description provided for @toolCalculator.
  ///
  /// In en, this message translates to:
  /// **'Calculator'**
  String get toolCalculator;

  /// No description provided for @toolSpotlight.
  ///
  /// In en, this message translates to:
  /// **'Spotlight'**
  String get toolSpotlight;

  /// No description provided for @toolScreenShade.
  ///
  /// In en, this message translates to:
  /// **'Screen shade'**
  String get toolScreenShade;

  /// No description provided for @toolScreenshot.
  ///
  /// In en, this message translates to:
  /// **'Screenshot'**
  String get toolScreenshot;

  /// No description provided for @toolTouchLock.
  ///
  /// In en, this message translates to:
  /// **'Touch lock'**
  String get toolTouchLock;

  /// No description provided for @tkStopwatch.
  ///
  /// In en, this message translates to:
  /// **'Stopwatch'**
  String get tkStopwatch;

  /// No description provided for @tkDice.
  ///
  /// In en, this message translates to:
  /// **'Dice'**
  String get tkDice;

  /// No description provided for @tkSpinner.
  ///
  /// In en, this message translates to:
  /// **'Spinner'**
  String get tkSpinner;

  /// No description provided for @tkNoiseMeter.
  ///
  /// In en, this message translates to:
  /// **'Noise meter'**
  String get tkNoiseMeter;

  /// No description provided for @tkDragCard.
  ///
  /// In en, this message translates to:
  /// **'Drag to move'**
  String get tkDragCard;

  /// No description provided for @tkPlusMinute.
  ///
  /// In en, this message translates to:
  /// **'+1 min'**
  String get tkPlusMinute;

  /// Stopwatch: record the time now and keep running.
  ///
  /// In en, this message translates to:
  /// **'Lap'**
  String get tkLap;

  /// No description provided for @tkLapN.
  ///
  /// In en, this message translates to:
  /// **'Lap {number}: {time}'**
  String tkLapN(int number, String time);

  /// No description provided for @tkPick.
  ///
  /// In en, this message translates to:
  /// **'Pick'**
  String get tkPick;

  /// No description provided for @tkReady.
  ///
  /// In en, this message translates to:
  /// **'Ready?'**
  String get tkReady;

  /// No description provided for @tkPickedOf.
  ///
  /// In en, this message translates to:
  /// **'{picked} of {total} picked'**
  String tkPickedOf(int picked, int total);

  /// No description provided for @tkNoRepeat.
  ///
  /// In en, this message translates to:
  /// **'Don\'t repeat until everyone is picked'**
  String get tkNoRepeat;

  /// No description provided for @tkStartOver.
  ///
  /// In en, this message translates to:
  /// **'Start the round again'**
  String get tkStartOver;

  /// No description provided for @tkDemoClass.
  ///
  /// In en, this message translates to:
  /// **'Demo class'**
  String get tkDemoClass;

  /// Roll the dice.
  ///
  /// In en, this message translates to:
  /// **'Roll'**
  String get tkRoll;

  /// No description provided for @tkDiceCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 die} other{{count} dice}}'**
  String tkDiceCount(int count);

  /// No description provided for @tkTotal.
  ///
  /// In en, this message translates to:
  /// **'Total: {total}'**
  String tkTotal(int total);

  /// No description provided for @tkSpin.
  ///
  /// In en, this message translates to:
  /// **'Spin'**
  String get tkSpin;

  /// No description provided for @tkSpinnerOptions.
  ///
  /// In en, this message translates to:
  /// **'Spinner options'**
  String get tkSpinnerOptions;

  /// No description provided for @tkSpinnerHint.
  ///
  /// In en, this message translates to:
  /// **'One option on each line'**
  String get tkSpinnerHint;

  /// No description provided for @tkGroup.
  ///
  /// In en, this message translates to:
  /// **'Group {letter}'**
  String tkGroup(String letter);

  /// No description provided for @tkTooLoud.
  ///
  /// In en, this message translates to:
  /// **'Too loud!'**
  String get tkTooLoud;

  /// No description provided for @tkCalm.
  ///
  /// In en, this message translates to:
  /// **'Nice and calm'**
  String get tkCalm;

  /// No description provided for @tkLimit.
  ///
  /// In en, this message translates to:
  /// **'Limit'**
  String get tkLimit;

  /// No description provided for @tkNoisePermission.
  ///
  /// In en, this message translates to:
  /// **'Allow the microphone to use the noise meter.'**
  String get tkNoisePermission;

  /// No description provided for @tkNoiseNoMic.
  ///
  /// In en, this message translates to:
  /// **'This board has no microphone.'**
  String get tkNoiseNoMic;

  /// No description provided for @tkNoiseUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The noise meter cannot use the microphone now. Turn off class audio or recording and try again.'**
  String get tkNoiseUnavailable;

  /// No description provided for @tkNoiseLocal.
  ///
  /// In en, this message translates to:
  /// **'Only the sound level is measured, on this board. Nothing is recorded.'**
  String get tkNoiseLocal;

  /// No description provided for @tkDragToReveal.
  ///
  /// In en, this message translates to:
  /// **'Drag to reveal'**
  String get tkDragToReveal;

  /// No description provided for @tkRevealAll.
  ///
  /// In en, this message translates to:
  /// **'Reveal all'**
  String get tkRevealAll;

  /// No description provided for @tkRemoveShade.
  ///
  /// In en, this message translates to:
  /// **'Remove shade'**
  String get tkRemoveShade;

  /// No description provided for @tkEndSpotlight.
  ///
  /// In en, this message translates to:
  /// **'End spotlight'**
  String get tkEndSpotlight;

  /// No description provided for @tkSpotlightSize.
  ///
  /// In en, this message translates to:
  /// **'Spotlight size'**
  String get tkSpotlightSize;

  /// No description provided for @simTitle.
  ///
  /// In en, this message translates to:
  /// **'Simulations'**
  String get simTitle;

  /// No description provided for @simHint.
  ///
  /// In en, this message translates to:
  /// **'Pendulum, projectile, graphs, fractions, waves, Pythagoras'**
  String get simHint;

  /// No description provided for @simOthers.
  ///
  /// In en, this message translates to:
  /// **'Other simulations'**
  String get simOthers;

  /// No description provided for @simPendulum.
  ///
  /// In en, this message translates to:
  /// **'Simple pendulum'**
  String get simPendulum;

  /// No description provided for @simProjectile.
  ///
  /// In en, this message translates to:
  /// **'Projectile motion'**
  String get simProjectile;

  /// No description provided for @simGrapher.
  ///
  /// In en, this message translates to:
  /// **'Function grapher'**
  String get simGrapher;

  /// No description provided for @simFractions.
  ///
  /// In en, this message translates to:
  /// **'Fraction bars'**
  String get simFractions;

  /// No description provided for @simWave.
  ///
  /// In en, this message translates to:
  /// **'Waves'**
  String get simWave;

  /// No description provided for @simPythagoras.
  ///
  /// In en, this message translates to:
  /// **'Pythagoras theorem'**
  String get simPythagoras;

  /// No description provided for @simLength.
  ///
  /// In en, this message translates to:
  /// **'Length'**
  String get simLength;

  /// No description provided for @simGravity.
  ///
  /// In en, this message translates to:
  /// **'Gravity'**
  String get simGravity;

  /// No description provided for @simStartAngle.
  ///
  /// In en, this message translates to:
  /// **'Start angle'**
  String get simStartAngle;

  /// No description provided for @simSpeed.
  ///
  /// In en, this message translates to:
  /// **'Speed'**
  String get simSpeed;

  /// No description provided for @simAngle.
  ///
  /// In en, this message translates to:
  /// **'Angle'**
  String get simAngle;

  /// No description provided for @simAmplitude.
  ///
  /// In en, this message translates to:
  /// **'Amplitude'**
  String get simAmplitude;

  /// No description provided for @simFrequency.
  ///
  /// In en, this message translates to:
  /// **'Frequency'**
  String get simFrequency;

  /// No description provided for @simWavelength.
  ///
  /// In en, this message translates to:
  /// **'Wavelength'**
  String get simWavelength;

  /// No description provided for @simRange.
  ///
  /// In en, this message translates to:
  /// **'Range {metres} m'**
  String simRange(String metres);

  /// No description provided for @simMaxHeight.
  ///
  /// In en, this message translates to:
  /// **'Max height {metres} m'**
  String simMaxHeight(String metres);

  /// No description provided for @simFlightTime.
  ///
  /// In en, this message translates to:
  /// **'Time {seconds} s'**
  String simFlightTime(String seconds);

  /// Numerator of fraction 1 or 2 in the fraction bars.
  ///
  /// In en, this message translates to:
  /// **'Top {number}'**
  String simTop(int number);

  /// Denominator of fraction 1 or 2.
  ///
  /// In en, this message translates to:
  /// **'Bottom {number}'**
  String simBottom(int number);

  /// No description provided for @simSide.
  ///
  /// In en, this message translates to:
  /// **'Side {name}'**
  String simSide(String name);

  /// No description provided for @simBadExpression.
  ///
  /// In en, this message translates to:
  /// **'Cannot read that expression'**
  String get simBadExpression;

  /// No description provided for @simDraw.
  ///
  /// In en, this message translates to:
  /// **'Draw'**
  String get simDraw;

  /// No description provided for @readAloud.
  ///
  /// In en, this message translates to:
  /// **'Read aloud'**
  String get readAloud;

  /// The full-screen reader that reads the page aloud and marks each word.
  ///
  /// In en, this message translates to:
  /// **'Immersive reader'**
  String get readerTitle;

  /// No description provided for @readerPageTitle.
  ///
  /// In en, this message translates to:
  /// **'Page {number}'**
  String readerPageTitle(int number);

  /// No description provided for @readerNothing.
  ///
  /// In en, this message translates to:
  /// **'There is no typed text on this page to read. Type text, add a note or convert handwriting with the AI pen.'**
  String get readerNothing;

  /// No description provided for @readerNoVoice.
  ///
  /// In en, this message translates to:
  /// **'This board has no {language} voice. Add one in the device’s text-to-speech settings (Windows: Settings → Time & language → Speech).'**
  String readerNoVoice(String language);

  /// No description provided for @readerPrevious.
  ///
  /// In en, this message translates to:
  /// **'Previous paragraph'**
  String get readerPrevious;

  /// No description provided for @readerNext.
  ///
  /// In en, this message translates to:
  /// **'Next paragraph'**
  String get readerNext;

  /// No description provided for @readerPaper.
  ///
  /// In en, this message translates to:
  /// **'Paper'**
  String get readerPaper;

  /// No description provided for @readerCream.
  ///
  /// In en, this message translates to:
  /// **'Cream'**
  String get readerCream;

  /// No description provided for @readerContrast.
  ///
  /// In en, this message translates to:
  /// **'High contrast'**
  String get readerContrast;

  /// No description provided for @readerBlue.
  ///
  /// In en, this message translates to:
  /// **'Blue tint'**
  String get readerBlue;

  /// No description provided for @readerLineFocus.
  ///
  /// In en, this message translates to:
  /// **'Line focus'**
  String get readerLineFocus;

  /// No description provided for @readerSlower.
  ///
  /// In en, this message translates to:
  /// **'Slower'**
  String get readerSlower;

  /// No description provided for @readerHint.
  ///
  /// In en, this message translates to:
  /// **'The page’s text, large, read aloud word by word'**
  String get readerHint;

  /// No description provided for @insertPicture.
  ///
  /// In en, this message translates to:
  /// **'Picture'**
  String get insertPicture;

  /// No description provided for @insertPictureHintGallery.
  ///
  /// In en, this message translates to:
  /// **'From the gallery'**
  String get insertPictureHintGallery;

  /// No description provided for @insertPictureHintFiles.
  ///
  /// In en, this message translates to:
  /// **'From this board’s files'**
  String get insertPictureHintFiles;

  /// No description provided for @insertPhoto.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get insertPhoto;

  /// No description provided for @insertPhotoHint.
  ///
  /// In en, this message translates to:
  /// **'With this board’s camera'**
  String get insertPhotoHint;

  /// No description provided for @pictureCouldNotOpen.
  ///
  /// In en, this message translates to:
  /// **'Could not open that picture.'**
  String get pictureCouldNotOpen;

  /// No description provided for @libTitle.
  ///
  /// In en, this message translates to:
  /// **'Picture library'**
  String get libTitle;

  /// No description provided for @libHint.
  ///
  /// In en, this message translates to:
  /// **'Diagrams, maps and stickers, free to use'**
  String get libHint;

  /// No description provided for @libSearch.
  ///
  /// In en, this message translates to:
  /// **'Search pictures (heart, map of India, volcano…)'**
  String get libSearch;

  /// No description provided for @libAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get libAll;

  /// No description provided for @libBiology.
  ///
  /// In en, this message translates to:
  /// **'Biology'**
  String get libBiology;

  /// No description provided for @libChemistry.
  ///
  /// In en, this message translates to:
  /// **'Chemistry'**
  String get libChemistry;

  /// No description provided for @libPhysics.
  ///
  /// In en, this message translates to:
  /// **'Physics'**
  String get libPhysics;

  /// No description provided for @libMaths.
  ///
  /// In en, this message translates to:
  /// **'Maths'**
  String get libMaths;

  /// No description provided for @libGeography.
  ///
  /// In en, this message translates to:
  /// **'Geography'**
  String get libGeography;

  /// No description provided for @libHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get libHistory;

  /// No description provided for @libEnglish.
  ///
  /// In en, this message translates to:
  /// **'Languages'**
  String get libEnglish;

  /// No description provided for @libComputers.
  ///
  /// In en, this message translates to:
  /// **'Computers'**
  String get libComputers;

  /// No description provided for @libEvs.
  ///
  /// In en, this message translates to:
  /// **'EVS and primary'**
  String get libEvs;

  /// No description provided for @libStickers.
  ///
  /// In en, this message translates to:
  /// **'Stickers'**
  String get libStickers;

  /// No description provided for @libNothingFound.
  ///
  /// In en, this message translates to:
  /// **'No picture matches. Try another word.'**
  String get libNothingFound;

  /// No description provided for @libCredits.
  ///
  /// In en, this message translates to:
  /// **'Pictures from Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA) and Microsoft Fluent Emoji (MIT). Tap ⓘ for a picture’s author and licence; the credit goes on the board with it.'**
  String get libCredits;

  /// No description provided for @importTitle.
  ///
  /// In en, this message translates to:
  /// **'PDF or PowerPoint'**
  String get importTitle;

  /// No description provided for @importHint.
  ///
  /// In en, this message translates to:
  /// **'Each page or slide becomes a board page to write on'**
  String get importHint;

  /// No description provided for @importingFile.
  ///
  /// In en, this message translates to:
  /// **'Opening {name}'**
  String importingFile(String name);

  /// No description provided for @importReading.
  ///
  /// In en, this message translates to:
  /// **'Reading the file…'**
  String get importReading;

  /// No description provided for @importPageOf.
  ///
  /// In en, this message translates to:
  /// **'Page {done} of {total}'**
  String importPageOf(int done, int total);

  /// No description provided for @importedPages.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Added 1 page after this one} other{Added {count} pages after this one}}'**
  String importedPages(int count);

  /// No description provided for @importOldPpt.
  ///
  /// In en, this message translates to:
  /// **'This is an old PowerPoint file (.ppt). Save it as .pptx or PDF in PowerPoint, then open it here.'**
  String get importOldPpt;

  /// No description provided for @importNotSupported.
  ///
  /// In en, this message translates to:
  /// **'The board opens PDF and PowerPoint (.pptx) files.'**
  String get importNotSupported;

  /// No description provided for @importPdfFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open this PDF. It may be damaged or protected with a password.'**
  String get importPdfFailed;

  /// No description provided for @importPptxFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open this PowerPoint. Save it as PDF in PowerPoint and open the PDF instead.'**
  String get importPptxFailed;

  /// No description provided for @tourStepOf.
  ///
  /// In en, this message translates to:
  /// **'{step} of {total}'**
  String tourStepOf(int step, int total);

  /// No description provided for @tourSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get tourSkip;

  /// No description provided for @tourNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get tourNext;

  /// No description provided for @tourGotIt.
  ///
  /// In en, this message translates to:
  /// **'Got it'**
  String get tourGotIt;

  /// No description provided for @tourWelcomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to your board'**
  String get tourWelcomeTitle;

  /// No description provided for @tourWelcomeBody.
  ///
  /// In en, this message translates to:
  /// **'A one-minute look at the buttons you will use in every class.'**
  String get tourWelcomeBody;

  /// No description provided for @tourPenTitle.
  ///
  /// In en, this message translates to:
  /// **'Write and draw'**
  String get tourPenTitle;

  /// No description provided for @tourPenBody.
  ///
  /// In en, this message translates to:
  /// **'Write with a finger or the stylus. Tap the pen again for colours and thickness. Tap with two fingers to undo, three to redo.'**
  String get tourPenBody;

  /// No description provided for @tourEraseTitle.
  ///
  /// In en, this message translates to:
  /// **'Rub out'**
  String get tourEraseTitle;

  /// No description provided for @tourEraseBody.
  ///
  /// In en, this message translates to:
  /// **'Rub over the ink. Undo is at the bottom of the board.'**
  String get tourEraseBody;

  /// No description provided for @tourInsertTitle.
  ///
  /// In en, this message translates to:
  /// **'Add to the board'**
  String get tourInsertTitle;

  /// No description provided for @tourInsertBody.
  ///
  /// In en, this message translates to:
  /// **'Equations, notes, pictures, the picture library, a PDF or PowerPoint, 3D models, labs and simulations.'**
  String get tourInsertBody;

  /// No description provided for @tourToolsTitle.
  ///
  /// In en, this message translates to:
  /// **'Class tools'**
  String get tourToolsTitle;

  /// No description provided for @tourToolsBody.
  ///
  /// In en, this message translates to:
  /// **'Timer, stopwatch, name picker, dice, spinner, noise meter, screen shade, spotlight and the immersive reader.'**
  String get tourToolsBody;

  /// No description provided for @tourAiTitle.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI'**
  String get tourAiTitle;

  /// No description provided for @tourAiBody.
  ///
  /// In en, this message translates to:
  /// **'Ask about the lesson, make a quiz or homework, or solve a sum written on the board.'**
  String get tourAiBody;

  /// No description provided for @tourBooksTitle.
  ///
  /// In en, this message translates to:
  /// **'Books'**
  String get tourBooksTitle;

  /// No description provided for @tourBooksBody.
  ///
  /// In en, this message translates to:
  /// **'Your syllabus: each topic’s lesson, key facts and questions, read aloud if you like.'**
  String get tourBooksBody;

  /// No description provided for @tourPagesTitle.
  ///
  /// In en, this message translates to:
  /// **'Pages'**
  String get tourPagesTitle;

  /// No description provided for @tourPagesBody.
  ///
  /// In en, this message translates to:
  /// **'Go to the next page; on the last page this adds a new one.'**
  String get tourPagesBody;

  /// No description provided for @tourRecordTitle.
  ///
  /// In en, this message translates to:
  /// **'Record the lesson'**
  String get tourRecordTitle;

  /// No description provided for @tourRecordBody.
  ///
  /// In en, this message translates to:
  /// **'Records the board and your voice, for students to watch again.'**
  String get tourRecordBody;

  /// No description provided for @tourHelpTitle.
  ///
  /// In en, this message translates to:
  /// **'Help is always here'**
  String get tourHelpTitle;

  /// No description provided for @tourHelpBody.
  ///
  /// In en, this message translates to:
  /// **'Open this menu for Help, this tour again, and a five-minute practice. Press ? on a keyboard too.'**
  String get tourHelpBody;

  /// No description provided for @tourPractise.
  ///
  /// In en, this message translates to:
  /// **'Practise now'**
  String get tourPractise;

  /// No description provided for @helpTitle.
  ///
  /// In en, this message translates to:
  /// **'Help'**
  String get helpTitle;

  /// No description provided for @helpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Short answers, and the button shown on the board.'**
  String get helpSubtitle;

  /// No description provided for @helpShowAround.
  ///
  /// In en, this message translates to:
  /// **'Show me around'**
  String get helpShowAround;

  /// No description provided for @helpPractise.
  ///
  /// In en, this message translates to:
  /// **'Practise in 5 minutes'**
  String get helpPractise;

  /// No description provided for @helpSearch.
  ///
  /// In en, this message translates to:
  /// **'How do I…'**
  String get helpSearch;

  /// No description provided for @helpNothing.
  ///
  /// In en, this message translates to:
  /// **'Nothing found. Try another word, or Show me around.'**
  String get helpNothing;

  /// No description provided for @helpShowMe.
  ///
  /// In en, this message translates to:
  /// **'Show me'**
  String get helpShowMe;

  /// No description provided for @helpGroupWriting.
  ///
  /// In en, this message translates to:
  /// **'Writing on the board'**
  String get helpGroupWriting;

  /// No description provided for @helpGroupContent.
  ///
  /// In en, this message translates to:
  /// **'Pages and content'**
  String get helpGroupContent;

  /// No description provided for @helpGroupClass.
  ///
  /// In en, this message translates to:
  /// **'Teaching tools'**
  String get helpGroupClass;

  /// No description provided for @helpGroupAi.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI and Books'**
  String get helpGroupAi;

  /// No description provided for @helpGroupSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get helpGroupSettings;

  /// No description provided for @helpWriteTitle.
  ///
  /// In en, this message translates to:
  /// **'Write and draw'**
  String get helpWriteTitle;

  /// No description provided for @helpWrite1.
  ///
  /// In en, this message translates to:
  /// **'Tap the pen on the left and write with a finger or the stylus.'**
  String get helpWrite1;

  /// No description provided for @helpWrite2.
  ///
  /// In en, this message translates to:
  /// **'Two fingers move and zoom the board.'**
  String get helpWrite2;

  /// No description provided for @helpEraseTitle.
  ///
  /// In en, this message translates to:
  /// **'Rub out or undo'**
  String get helpEraseTitle;

  /// No description provided for @helpErase1.
  ///
  /// In en, this message translates to:
  /// **'Tap the eraser and rub over the ink. Tap it again to clear the page.'**
  String get helpErase1;

  /// No description provided for @helpErase2.
  ///
  /// In en, this message translates to:
  /// **'Made a mistake? Tap Undo at the bottom.'**
  String get helpErase2;

  /// No description provided for @helpShapesTitle.
  ///
  /// In en, this message translates to:
  /// **'Shapes'**
  String get helpShapesTitle;

  /// No description provided for @helpShapes1.
  ///
  /// In en, this message translates to:
  /// **'Tap Shapes, pick one and drag on the board.'**
  String get helpShapes1;

  /// No description provided for @helpShapes2.
  ///
  /// In en, this message translates to:
  /// **'Select it to resize, turn, colour or copy it.'**
  String get helpShapes2;

  /// No description provided for @helpTextTitle.
  ///
  /// In en, this message translates to:
  /// **'Type text'**
  String get helpTextTitle;

  /// No description provided for @helpText1.
  ///
  /// In en, this message translates to:
  /// **'Tap T, then tap the board where the text should go.'**
  String get helpText1;

  /// No description provided for @helpPagesTitle.
  ///
  /// In en, this message translates to:
  /// **'Turn and add pages'**
  String get helpPagesTitle;

  /// No description provided for @helpPages1.
  ///
  /// In en, this message translates to:
  /// **'The arrows at the bottom turn pages; on the last page, + adds one.'**
  String get helpPages1;

  /// No description provided for @helpPages2.
  ///
  /// In en, this message translates to:
  /// **'Save the board from the bottom left to keep it and share it with the class.'**
  String get helpPages2;

  /// No description provided for @helpPictureTitle.
  ///
  /// In en, this message translates to:
  /// **'Add a picture'**
  String get helpPictureTitle;

  /// No description provided for @helpPicture1.
  ///
  /// In en, this message translates to:
  /// **'Tap + (Add), then Picture for one from this board, or Picture library.'**
  String get helpPicture1;

  /// No description provided for @helpPicture2.
  ///
  /// In en, this message translates to:
  /// **'Library pictures carry their credit under them.'**
  String get helpPicture2;

  /// No description provided for @helpImportTitle.
  ///
  /// In en, this message translates to:
  /// **'Open a PDF or PowerPoint'**
  String get helpImportTitle;

  /// No description provided for @helpImport1.
  ///
  /// In en, this message translates to:
  /// **'Tap + (Add), then PDF or PowerPoint, and pick the file.'**
  String get helpImport1;

  /// No description provided for @helpImport2.
  ///
  /// In en, this message translates to:
  /// **'Each page or slide becomes a board page you can write over; it works without the internet.'**
  String get helpImport2;

  /// No description provided for @helpSimsTitle.
  ///
  /// In en, this message translates to:
  /// **'Simulations'**
  String get helpSimsTitle;

  /// No description provided for @helpSims1.
  ///
  /// In en, this message translates to:
  /// **'Tap + (Add) or Tools, then Simulations.'**
  String get helpSims1;

  /// No description provided for @helpSims2.
  ///
  /// In en, this message translates to:
  /// **'Move the sliders and the class sees the pendulum, the projectile or the wave change.'**
  String get helpSims2;

  /// No description provided for @helpToolkitTitle.
  ///
  /// In en, this message translates to:
  /// **'Timer, name picker and dice'**
  String get helpToolkitTitle;

  /// No description provided for @helpToolkit1.
  ///
  /// In en, this message translates to:
  /// **'Tap Tools and pick one; it floats over the board.'**
  String get helpToolkit1;

  /// No description provided for @helpToolkit2.
  ///
  /// In en, this message translates to:
  /// **'Drag it by its name to move it out of the way.'**
  String get helpToolkit2;

  /// No description provided for @helpShadeTitle.
  ///
  /// In en, this message translates to:
  /// **'Screen shade and spotlight'**
  String get helpShadeTitle;

  /// No description provided for @helpShade1.
  ///
  /// In en, this message translates to:
  /// **'The shade covers the board; drag its handle down to reveal it line by line.'**
  String get helpShade1;

  /// No description provided for @helpShade2.
  ///
  /// In en, this message translates to:
  /// **'The spotlight darkens all but a circle you drag around.'**
  String get helpShade2;

  /// No description provided for @helpReadTitle.
  ///
  /// In en, this message translates to:
  /// **'Read aloud'**
  String get helpReadTitle;

  /// No description provided for @helpRead1.
  ///
  /// In en, this message translates to:
  /// **'Select text and tap Read aloud, or Tools → Immersive reader for the page.'**
  String get helpRead1;

  /// No description provided for @helpRead2.
  ///
  /// In en, this message translates to:
  /// **'Books and the labs read lessons and steps aloud too, in English, Hindi or Kannada where the board has the voice.'**
  String get helpRead2;

  /// No description provided for @helpRecordTitle.
  ///
  /// In en, this message translates to:
  /// **'Record a lesson'**
  String get helpRecordTitle;

  /// No description provided for @helpRecord1.
  ///
  /// In en, this message translates to:
  /// **'Tap the red button to record the board and your voice.'**
  String get helpRecord1;

  /// No description provided for @helpRecord2.
  ///
  /// In en, this message translates to:
  /// **'Tap it again to stop and save.'**
  String get helpRecord2;

  /// No description provided for @helpAiTitle.
  ///
  /// In en, this message translates to:
  /// **'Ask KINETIX AI'**
  String get helpAiTitle;

  /// No description provided for @helpAi1.
  ///
  /// In en, this message translates to:
  /// **'Tap the AI buttons on the right: ask, quiz, homework, the maths solver.'**
  String get helpAi1;

  /// No description provided for @helpAi2.
  ///
  /// In en, this message translates to:
  /// **'Select something on the board and tap Read with AI to ask about it.'**
  String get helpAi2;

  /// No description provided for @helpBooksTitle.
  ///
  /// In en, this message translates to:
  /// **'Lessons from Books'**
  String get helpBooksTitle;

  /// No description provided for @helpBooks1.
  ///
  /// In en, this message translates to:
  /// **'Tap Books on the right and open a topic.'**
  String get helpBooks1;

  /// No description provided for @helpBooks2.
  ///
  /// In en, this message translates to:
  /// **'Read aloud opens the lesson large, read word by word.'**
  String get helpBooks2;

  /// No description provided for @helpSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Language, layout and touch'**
  String get helpSettingsTitle;

  /// No description provided for @helpSettings1.
  ///
  /// In en, this message translates to:
  /// **'Open the menu at the bottom left, then Board settings.'**
  String get helpSettings1;

  /// No description provided for @practiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Practice board'**
  String get practiceTitle;

  /// No description provided for @practiceNotSaved.
  ///
  /// In en, this message translates to:
  /// **'Nothing here is kept. Try everything.'**
  String get practiceNotSaved;

  /// No description provided for @practiceCount.
  ///
  /// In en, this message translates to:
  /// **'Practice: {done} of {total} done'**
  String practiceCount(int done, int total);

  /// No description provided for @practiceReady.
  ///
  /// In en, this message translates to:
  /// **'You\'re ready!'**
  String get practiceReady;

  /// No description provided for @practiceDoneBody.
  ///
  /// In en, this message translates to:
  /// **'You have done everything a class needs. Help is in the menu at the bottom left.'**
  String get practiceDoneBody;

  /// No description provided for @practiceShowList.
  ///
  /// In en, this message translates to:
  /// **'Show the list'**
  String get practiceShowList;

  /// No description provided for @practiceHideList.
  ///
  /// In en, this message translates to:
  /// **'Hide the list'**
  String get practiceHideList;

  /// No description provided for @practiceFinish.
  ///
  /// In en, this message translates to:
  /// **'Finish practice'**
  String get practiceFinish;

  /// No description provided for @practiceEnd.
  ///
  /// In en, this message translates to:
  /// **'End practice'**
  String get practiceEnd;

  /// No description provided for @practiceWrite.
  ///
  /// In en, this message translates to:
  /// **'Write something with the pen'**
  String get practiceWrite;

  /// No description provided for @practiceErase.
  ///
  /// In en, this message translates to:
  /// **'Rub it out, or tap Undo'**
  String get practiceErase;

  /// No description provided for @practiceShape.
  ///
  /// In en, this message translates to:
  /// **'Draw a shape'**
  String get practiceShape;

  /// No description provided for @practicePage.
  ///
  /// In en, this message translates to:
  /// **'Go to a new page'**
  String get practicePage;

  /// No description provided for @practicePicture.
  ///
  /// In en, this message translates to:
  /// **'Add a picture from the picture library'**
  String get practicePicture;

  /// No description provided for @practiceTimer.
  ///
  /// In en, this message translates to:
  /// **'Start a timer from Tools'**
  String get practiceTimer;

  /// No description provided for @practiceEnded.
  ///
  /// In en, this message translates to:
  /// **'Practice over: your board is back as it was.'**
  String get practiceEnded;

  /// No description provided for @pen.
  ///
  /// In en, this message translates to:
  /// **'Pen'**
  String get pen;

  /// No description provided for @highlighter.
  ///
  /// In en, this message translates to:
  /// **'Highlighter'**
  String get highlighter;

  /// No description provided for @colour.
  ///
  /// In en, this message translates to:
  /// **'Colour'**
  String get colour;

  /// No description provided for @thickness.
  ///
  /// In en, this message translates to:
  /// **'Thickness'**
  String get thickness;

  /// No description provided for @eraserSize.
  ///
  /// In en, this message translates to:
  /// **'Eraser size'**
  String get eraserSize;

  /// No description provided for @sizeSmall.
  ///
  /// In en, this message translates to:
  /// **'Small'**
  String get sizeSmall;

  /// No description provided for @sizeMedium.
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get sizeMedium;

  /// No description provided for @sizeLarge.
  ///
  /// In en, this message translates to:
  /// **'Large'**
  String get sizeLarge;

  /// No description provided for @eraseTip.
  ///
  /// In en, this message translates to:
  /// **'Tip: on an interactive panel, rub with your palm to erase.'**
  String get eraseTip;

  /// No description provided for @clearPage.
  ///
  /// In en, this message translates to:
  /// **'Clear page'**
  String get clearPage;

  /// No description provided for @boardTheme.
  ///
  /// In en, this message translates to:
  /// **'Board theme'**
  String get boardTheme;

  /// No description provided for @bgPlain.
  ///
  /// In en, this message translates to:
  /// **'Plain'**
  String get bgPlain;

  /// No description provided for @bgRuled.
  ///
  /// In en, this message translates to:
  /// **'Ruled'**
  String get bgRuled;

  /// No description provided for @bgGrid.
  ///
  /// In en, this message translates to:
  /// **'Grid (1 cm)'**
  String get bgGrid;

  /// No description provided for @bgDots.
  ///
  /// In en, this message translates to:
  /// **'Dots'**
  String get bgDots;

  /// No description provided for @bgChalkboard.
  ///
  /// In en, this message translates to:
  /// **'Chalkboard'**
  String get bgChalkboard;

  /// No description provided for @shapes3dSoon.
  ///
  /// In en, this message translates to:
  /// **'Rotatable 3D solids (cube, cylinder, cone, sphere) are coming soon.'**
  String get shapes3dSoon;

  /// No description provided for @shapeLine.
  ///
  /// In en, this message translates to:
  /// **'Line'**
  String get shapeLine;

  /// No description provided for @shapeArrow.
  ///
  /// In en, this message translates to:
  /// **'Arrow'**
  String get shapeArrow;

  /// No description provided for @shapeDoubleArrow.
  ///
  /// In en, this message translates to:
  /// **'Double arrow'**
  String get shapeDoubleArrow;

  /// No description provided for @shapeCircle.
  ///
  /// In en, this message translates to:
  /// **'Circle'**
  String get shapeCircle;

  /// No description provided for @shapeEllipse.
  ///
  /// In en, this message translates to:
  /// **'Ellipse'**
  String get shapeEllipse;

  /// No description provided for @shapeTriangle.
  ///
  /// In en, this message translates to:
  /// **'Triangle'**
  String get shapeTriangle;

  /// No description provided for @shapeRightTriangle.
  ///
  /// In en, this message translates to:
  /// **'Right triangle'**
  String get shapeRightTriangle;

  /// No description provided for @shapeRectangle.
  ///
  /// In en, this message translates to:
  /// **'Rectangle'**
  String get shapeRectangle;

  /// No description provided for @shapeParallelogram.
  ///
  /// In en, this message translates to:
  /// **'Parallelogram'**
  String get shapeParallelogram;

  /// No description provided for @shapeTrapezium.
  ///
  /// In en, this message translates to:
  /// **'Trapezium'**
  String get shapeTrapezium;

  /// No description provided for @shapeRhombus.
  ///
  /// In en, this message translates to:
  /// **'Rhombus'**
  String get shapeRhombus;

  /// No description provided for @shapePentagon.
  ///
  /// In en, this message translates to:
  /// **'Pentagon'**
  String get shapePentagon;

  /// No description provided for @shapeHexagon.
  ///
  /// In en, this message translates to:
  /// **'Hexagon'**
  String get shapeHexagon;

  /// No description provided for @showLengths.
  ///
  /// In en, this message translates to:
  /// **'Show lengths'**
  String get showLengths;

  /// No description provided for @showLengthsHint.
  ///
  /// In en, this message translates to:
  /// **'Sides in cm, matching the 1 cm grid'**
  String get showLengthsHint;

  /// No description provided for @showAngles.
  ///
  /// In en, this message translates to:
  /// **'Show angles'**
  String get showAngles;

  /// No description provided for @eyeProtection.
  ///
  /// In en, this message translates to:
  /// **'Eye protection'**
  String get eyeProtection;

  /// No description provided for @eyeProtectionHint.
  ///
  /// In en, this message translates to:
  /// **'Warmer colours, less blue light, gentle dimming'**
  String get eyeProtectionHint;

  /// No description provided for @adjustSchoolDay.
  ///
  /// In en, this message translates to:
  /// **'Adjust through the school day'**
  String get adjustSchoolDay;

  /// No description provided for @warmth.
  ///
  /// In en, this message translates to:
  /// **'Warmth'**
  String get warmth;

  /// No description provided for @dimming.
  ///
  /// In en, this message translates to:
  /// **'Dimming'**
  String get dimming;

  /// No description provided for @highContrast.
  ///
  /// In en, this message translates to:
  /// **'High contrast'**
  String get highContrast;

  /// No description provided for @highContrastHint.
  ///
  /// In en, this message translates to:
  /// **'For faded projectors'**
  String get highContrastHint;

  /// No description provided for @chalkboardHint.
  ///
  /// In en, this message translates to:
  /// **'Dark board, less glare'**
  String get chalkboardHint;

  /// No description provided for @dragToResize.
  ///
  /// In en, this message translates to:
  /// **'Drag to resize'**
  String get dragToResize;

  /// No description provided for @moveToOtherSide.
  ///
  /// In en, this message translates to:
  /// **'Move to the other side'**
  String get moveToOtherSide;

  /// No description provided for @splitWhiteboard.
  ///
  /// In en, this message translates to:
  /// **'Whiteboard'**
  String get splitWhiteboard;

  /// No description provided for @splitDocument.
  ///
  /// In en, this message translates to:
  /// **'PDF / PPT'**
  String get splitDocument;

  /// No description provided for @splitVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get splitVideo;

  /// No description provided for @splitWeb.
  ///
  /// In en, this message translates to:
  /// **'Web page'**
  String get splitWeb;

  /// No description provided for @splitModel3d.
  ///
  /// In en, this message translates to:
  /// **'3D model'**
  String get splitModel3d;

  /// No description provided for @splitLab.
  ///
  /// In en, this message translates to:
  /// **'Virtual lab'**
  String get splitLab;

  /// No description provided for @viewerComingSoon.
  ///
  /// In en, this message translates to:
  /// **'The {viewer} viewer is coming in an upcoming build.'**
  String viewerComingSoon(String viewer);

  /// No description provided for @splitChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose what to show next to the whiteboard.'**
  String get splitChoose;

  /// No description provided for @chooseSomethingElse.
  ///
  /// In en, this message translates to:
  /// **'Choose something else'**
  String get chooseSomethingElse;

  /// No description provided for @signInWithTeacherApp.
  ///
  /// In en, this message translates to:
  /// **'Sign in with Teacher app'**
  String get signInWithTeacherApp;

  /// No description provided for @importFiles.
  ///
  /// In en, this message translates to:
  /// **'Import PDF, PPT or image'**
  String get importFiles;

  /// No description provided for @yourWhiteboards.
  ///
  /// In en, this message translates to:
  /// **'Your whiteboards'**
  String get yourWhiteboards;

  /// No description provided for @recordings.
  ///
  /// In en, this message translates to:
  /// **'Recordings'**
  String get recordings;

  /// No description provided for @recordingsToUpload.
  ///
  /// In en, this message translates to:
  /// **'{count} to upload'**
  String recordingsToUpload(int count);

  /// No description provided for @screenProjection.
  ///
  /// In en, this message translates to:
  /// **'Screen projection'**
  String get screenProjection;

  /// No description provided for @boardSettings.
  ///
  /// In en, this message translates to:
  /// **'Board settings'**
  String get boardSettings;

  /// No description provided for @guidedTour.
  ///
  /// In en, this message translates to:
  /// **'Guided tour & practice'**
  String get guidedTour;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @languageHint.
  ///
  /// In en, this message translates to:
  /// **'Buttons and messages on this board. A teacher who signs in sees the board in their own language until they sign out.'**
  String get languageHint;

  /// No description provided for @touchScreen.
  ///
  /// In en, this message translates to:
  /// **'Touch screen'**
  String get touchScreen;

  /// No description provided for @touchScreenHint.
  ///
  /// In en, this message translates to:
  /// **'Choose the hardware this board runs on. It decides what a palm or a large touch does.'**
  String get touchScreenHint;

  /// No description provided for @touchTablet.
  ///
  /// In en, this message translates to:
  /// **'Tablet'**
  String get touchTablet;

  /// No description provided for @touchTabletHint.
  ///
  /// In en, this message translates to:
  /// **'A hand resting on the screen is ignored'**
  String get touchTabletHint;

  /// No description provided for @touchPanel.
  ///
  /// In en, this message translates to:
  /// **'Interactive panel'**
  String get touchPanel;

  /// No description provided for @touchPanelHint.
  ///
  /// In en, this message translates to:
  /// **'A palm or fist erases, like a duster'**
  String get touchPanelHint;

  /// No description provided for @touchIrFrame.
  ///
  /// In en, this message translates to:
  /// **'IR touch frame'**
  String get touchIrFrame;

  /// No description provided for @touchIrFrameHint.
  ///
  /// In en, this message translates to:
  /// **'Every touch writes. IR frames cannot tell a palm from a finger'**
  String get touchIrFrameHint;

  /// No description provided for @timesUp.
  ///
  /// In en, this message translates to:
  /// **'Time\'s up'**
  String get timesUp;

  /// No description provided for @closeTimer.
  ///
  /// In en, this message translates to:
  /// **'Close timer'**
  String get closeTimer;

  /// No description provided for @reset.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get reset;

  /// No description provided for @pause.
  ///
  /// In en, this message translates to:
  /// **'Pause'**
  String get pause;

  /// No description provided for @restart.
  ///
  /// In en, this message translates to:
  /// **'Restart'**
  String get restart;

  /// No description provided for @start.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get start;

  /// No description provided for @randomPickNoClass.
  ///
  /// In en, this message translates to:
  /// **'Sign in from the Teacher app during a timetabled class to pick from its students.'**
  String get randomPickNoClass;

  /// No description provided for @rollNo.
  ///
  /// In en, this message translates to:
  /// **'Roll no. {rollNo}'**
  String rollNo(String rollNo);

  /// No description provided for @answerSavedTo.
  ///
  /// In en, this message translates to:
  /// **'{outcome} · saved to {name}\'s profile'**
  String answerSavedTo(String outcome, String name);

  /// No description provided for @answerCorrect.
  ///
  /// In en, this message translates to:
  /// **'Correct'**
  String get answerCorrect;

  /// No description provided for @answerPartlyCorrect.
  ///
  /// In en, this message translates to:
  /// **'Partly correct'**
  String get answerPartlyCorrect;

  /// No description provided for @answerPartly.
  ///
  /// In en, this message translates to:
  /// **'Partly'**
  String get answerPartly;

  /// No description provided for @answerNotCorrect.
  ///
  /// In en, this message translates to:
  /// **'Not correct'**
  String get answerNotCorrect;

  /// No description provided for @answerSkipped.
  ///
  /// In en, this message translates to:
  /// **'Skipped'**
  String get answerSkipped;

  /// No description provided for @answerSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get answerSkip;

  /// No description provided for @pickAgain.
  ///
  /// In en, this message translates to:
  /// **'Pick again'**
  String get pickAgain;

  /// No description provided for @attendanceSummary.
  ///
  /// In en, this message translates to:
  /// **'{present} present · {absent} absent · {late} late   —   tap a student to change'**
  String attendanceSummary(int present, int absent, int late);

  /// No description provided for @present.
  ///
  /// In en, this message translates to:
  /// **'Present'**
  String get present;

  /// No description provided for @absent.
  ///
  /// In en, this message translates to:
  /// **'Absent'**
  String get absent;

  /// No description provided for @late.
  ///
  /// In en, this message translates to:
  /// **'Late'**
  String get late;

  /// No description provided for @saveAttendance.
  ///
  /// In en, this message translates to:
  /// **'Save attendance'**
  String get saveAttendance;

  /// No description provided for @saveBoard.
  ///
  /// In en, this message translates to:
  /// **'Save board'**
  String get saveBoard;

  /// No description provided for @shareWithClass.
  ///
  /// In en, this message translates to:
  /// **'Share with the class'**
  String get shareWithClass;

  /// No description provided for @shareNeedsClass.
  ///
  /// In en, this message translates to:
  /// **'Available when the board is used in a timetabled class'**
  String get shareNeedsClass;

  /// No description provided for @shareBoardHint.
  ///
  /// In en, this message translates to:
  /// **'Students and parents of {section} can open it in their apps'**
  String shareBoardHint(String section);

  /// No description provided for @couldNotLoadBoards.
  ///
  /// In en, this message translates to:
  /// **'Could not load your boards.\n{error}'**
  String couldNotLoadBoards(String error);

  /// No description provided for @noBoardsYet.
  ///
  /// In en, this message translates to:
  /// **'Boards you save appear here. Use Save, or save when you end the class.'**
  String get noBoardsYet;

  /// No description provided for @pageCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 page} other{{count} pages}}'**
  String pageCount(int count);

  /// No description provided for @shared.
  ///
  /// In en, this message translates to:
  /// **'Shared'**
  String get shared;

  /// No description provided for @recPaused.
  ///
  /// In en, this message translates to:
  /// **'Paused'**
  String get recPaused;

  /// Recording indicator; kept as the familiar camera label.
  ///
  /// In en, this message translates to:
  /// **'REC'**
  String get recLive;

  /// No description provided for @recNoSoundTooltip.
  ///
  /// In en, this message translates to:
  /// **'Recording without sound'**
  String get recNoSoundTooltip;

  /// No description provided for @recResume.
  ///
  /// In en, this message translates to:
  /// **'Resume recording'**
  String get recResume;

  /// No description provided for @recPause.
  ///
  /// In en, this message translates to:
  /// **'Pause recording'**
  String get recPause;

  /// No description provided for @recStop.
  ///
  /// In en, this message translates to:
  /// **'Stop recording'**
  String get recStop;

  /// No description provided for @recDiscardTitle.
  ///
  /// In en, this message translates to:
  /// **'Discard this recording?'**
  String get recDiscardTitle;

  /// No description provided for @recDiscardBody.
  ///
  /// In en, this message translates to:
  /// **'{duration} of the lesson will be deleted from the board.'**
  String recDiscardBody(String duration);

  /// No description provided for @recSaveTitle.
  ///
  /// In en, this message translates to:
  /// **'Save lesson recording'**
  String get recSaveTitle;

  /// No description provided for @recBoardAndVoice.
  ///
  /// In en, this message translates to:
  /// **'board and voice'**
  String get recBoardAndVoice;

  /// No description provided for @recBoardOnly.
  ///
  /// In en, this message translates to:
  /// **'board only, no sound'**
  String get recBoardOnly;

  /// No description provided for @recShareHint.
  ///
  /// In en, this message translates to:
  /// **'Students and parents of {section} can watch it after it uploads'**
  String recShareHint(String section);

  /// No description provided for @recUploadNote.
  ///
  /// In en, this message translates to:
  /// **'It uploads to KINETIX Cloud in the background. Absent students are told it is there.'**
  String get recUploadNote;

  /// No description provided for @sharedWith.
  ///
  /// In en, this message translates to:
  /// **'Shared with {section}.'**
  String sharedWith(String section);

  /// Used when a class has no name: "Shared with the class."
  ///
  /// In en, this message translates to:
  /// **'the class'**
  String get theClass;

  /// No description provided for @couldNotShare.
  ///
  /// In en, this message translates to:
  /// **'Could not share: {error}'**
  String couldNotShare(String error);

  /// No description provided for @couldNotLoadRecordings.
  ///
  /// In en, this message translates to:
  /// **'Could not load your recordings.\n{error}'**
  String couldNotLoadRecordings(String error);

  /// No description provided for @noRecordingsYet.
  ///
  /// In en, this message translates to:
  /// **'Lessons you record appear here. Tap Record on the toolbar to start.'**
  String get noRecordingsYet;

  /// No description provided for @recNoSound.
  ///
  /// In en, this message translates to:
  /// **'no sound'**
  String get recNoSound;

  /// No description provided for @recWaiting.
  ///
  /// In en, this message translates to:
  /// **'Waiting to upload'**
  String get recWaiting;

  /// No description provided for @recUploadsWhen.
  ///
  /// In en, this message translates to:
  /// **'Uploads when {name} signs in'**
  String recUploadsWhen(String name);

  /// No description provided for @recUploading.
  ///
  /// In en, this message translates to:
  /// **'Uploading {percent}%'**
  String recUploading(int percent);

  /// No description provided for @recUploaded.
  ///
  /// In en, this message translates to:
  /// **'Uploaded'**
  String get recUploaded;

  /// No description provided for @recUploadFailed.
  ///
  /// In en, this message translates to:
  /// **'Upload failed'**
  String get recUploadFailed;

  /// No description provided for @recUploadedLaterClass.
  ///
  /// In en, this message translates to:
  /// **'Uploaded in a later class. Share it from here if it is for {section}.'**
  String recUploadedLaterClass(String section);

  /// No description provided for @thisClass.
  ///
  /// In en, this message translates to:
  /// **'this class'**
  String get thisClass;

  /// No description provided for @broadcastFrom.
  ///
  /// In en, this message translates to:
  /// **'From {name}'**
  String broadcastFrom(String name);

  /// Teacher confirms an emergency message.
  ///
  /// In en, this message translates to:
  /// **'Acknowledge'**
  String get acknowledge;

  /// No description provided for @signInTo.
  ///
  /// In en, this message translates to:
  /// **'Sign in to {board}'**
  String signInTo(String board);

  /// No description provided for @thisBoard.
  ///
  /// In en, this message translates to:
  /// **'this board'**
  String get thisBoard;

  /// No description provided for @signInUsePhone.
  ///
  /// In en, this message translates to:
  /// **'Use the KINETIX Teacher app on your phone.'**
  String get signInUsePhone;

  /// No description provided for @signInStep1.
  ///
  /// In en, this message translates to:
  /// **'Open the KINETIX Teacher app'**
  String get signInStep1;

  /// Button name in the Teacher App; keep it the same as the Teacher App shows it.
  ///
  /// In en, this message translates to:
  /// **'Tap Connect to board'**
  String get signInStep2;

  /// No description provided for @signInStep3.
  ///
  /// In en, this message translates to:
  /// **'Scan the QR code, or type this code'**
  String get signInStep3;

  /// No description provided for @newCodeIn.
  ///
  /// In en, this message translates to:
  /// **'New code in {seconds} s'**
  String newCodeIn(int seconds);

  /// No description provided for @cannotReachCloudRetrying.
  ///
  /// In en, this message translates to:
  /// **'Cannot reach KINETIX Cloud. Retrying…'**
  String get cannotReachCloudRetrying;

  /// No description provided for @signInCodeNote.
  ///
  /// In en, this message translates to:
  /// **'The code changes every 2 minutes and works once. No password is typed on the board.'**
  String get signInCodeNote;

  /// No description provided for @enrollTitle.
  ///
  /// In en, this message translates to:
  /// **'Set up this board'**
  String get enrollTitle;

  /// Devices and Add board are ERP menu names; keep them as the ERP shows them.
  ///
  /// In en, this message translates to:
  /// **'In KINETIX ERP, open Devices → Add board, then enter the code shown there.'**
  String get enrollHint;

  /// No description provided for @enrollCode.
  ///
  /// In en, this message translates to:
  /// **'Enrolment code'**
  String get enrollCode;

  /// No description provided for @enrollServer.
  ///
  /// In en, this message translates to:
  /// **'Server'**
  String get enrollServer;

  /// No description provided for @enrollRegistering.
  ///
  /// In en, this message translates to:
  /// **'Registering…'**
  String get enrollRegistering;

  /// No description provided for @enrollRegister.
  ///
  /// In en, this message translates to:
  /// **'Register board'**
  String get enrollRegister;

  /// No description provided for @enrollSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip for now and use the practice board'**
  String get enrollSkip;

  /// No description provided for @aiAskNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to ask KINETIX AI.'**
  String get aiAskNeedsSignIn;

  /// No description provided for @aiToolSoon.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI {tool}'**
  String aiToolSoon(String tool);

  /// No description provided for @aiAskHint.
  ///
  /// In en, this message translates to:
  /// **'Ask anything about a topic'**
  String get aiAskHint;

  /// No description provided for @aiAskHintClass.
  ///
  /// In en, this message translates to:
  /// **'Ask anything about {classLabel}'**
  String aiAskHintClass(String classLabel);

  /// No description provided for @aiSpeak.
  ///
  /// In en, this message translates to:
  /// **'Speak'**
  String get aiSpeak;

  /// No description provided for @aiVoiceQuestions.
  ///
  /// In en, this message translates to:
  /// **'Voice questions'**
  String get aiVoiceQuestions;

  /// No description provided for @aiAsk.
  ///
  /// In en, this message translates to:
  /// **'Ask'**
  String get aiAsk;

  /// No description provided for @aiDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'Answers follow your syllabus. Check before sharing with the class.'**
  String get aiDisclaimer;

  /// No description provided for @aiPreparing.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is preparing an explanation…'**
  String get aiPreparing;

  /// No description provided for @aiGroupTeach.
  ///
  /// In en, this message translates to:
  /// **'Teach'**
  String get aiGroupTeach;

  /// No description provided for @aiGroupMathsScience.
  ///
  /// In en, this message translates to:
  /// **'Maths & science'**
  String get aiGroupMathsScience;

  /// No description provided for @aiGroupLookUp.
  ///
  /// In en, this message translates to:
  /// **'Look up'**
  String get aiGroupLookUp;

  /// No description provided for @aiSummary.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get aiSummary;

  /// No description provided for @aiQuickQuiz.
  ///
  /// In en, this message translates to:
  /// **'Quick quiz'**
  String get aiQuickQuiz;

  /// No description provided for @aiLessonPlan.
  ///
  /// In en, this message translates to:
  /// **'Lesson plan'**
  String get aiLessonPlan;

  /// No description provided for @aiMathSolver.
  ///
  /// In en, this message translates to:
  /// **'Math solver'**
  String get aiMathSolver;

  /// No description provided for @aiGraph.
  ///
  /// In en, this message translates to:
  /// **'Graph'**
  String get aiGraph;

  /// No description provided for @ai3dModels.
  ///
  /// In en, this message translates to:
  /// **'3D models'**
  String get ai3dModels;

  /// No description provided for @aiSimulations.
  ///
  /// In en, this message translates to:
  /// **'Simulations'**
  String get aiSimulations;

  /// No description provided for @aiTextbook.
  ///
  /// In en, this message translates to:
  /// **'Textbook'**
  String get aiTextbook;

  /// No description provided for @aiWikipedia.
  ///
  /// In en, this message translates to:
  /// **'Wikipedia'**
  String get aiWikipedia;

  /// No description provided for @aiDictionary.
  ///
  /// In en, this message translates to:
  /// **'Dictionary'**
  String get aiDictionary;

  /// No description provided for @aiReadBoard.
  ///
  /// In en, this message translates to:
  /// **'Read board'**
  String get aiReadBoard;

  /// No description provided for @aiAskAgain.
  ///
  /// In en, this message translates to:
  /// **'Ask again for a new answer'**
  String get aiAskAgain;

  /// No description provided for @aiBasedOnSyllabus.
  ///
  /// In en, this message translates to:
  /// **'Based on your syllabus: {sources}'**
  String aiBasedOnSyllabus(String sources);

  /// No description provided for @aiKeyPoints.
  ///
  /// In en, this message translates to:
  /// **'Key points'**
  String get aiKeyPoints;

  /// No description provided for @aiAskNext.
  ///
  /// In en, this message translates to:
  /// **'Ask next'**
  String get aiAskNext;

  /// No description provided for @aiPreviewLabel.
  ///
  /// In en, this message translates to:
  /// **'Preview — connect the KINETIX AI server for real answers'**
  String get aiPreviewLabel;

  /// No description provided for @aiPreview.
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get aiPreview;

  /// No description provided for @aiLanguageTooltip.
  ///
  /// In en, this message translates to:
  /// **'Language for KINETIX AI'**
  String get aiLanguageTooltip;

  /// No description provided for @aiSignInNotice.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI needs a teacher signed in and the board online. Sign in with the Teacher app from the profile button. The maths solver works without signing in.'**
  String get aiSignInNotice;

  /// No description provided for @difficultyEasy.
  ///
  /// In en, this message translates to:
  /// **'Easy'**
  String get difficultyEasy;

  /// No description provided for @difficultyMedium.
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get difficultyMedium;

  /// No description provided for @difficultyHard.
  ///
  /// In en, this message translates to:
  /// **'Hard'**
  String get difficultyHard;

  /// No description provided for @dueOn.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String dueOn(String date);

  /// No description provided for @dueDate.
  ///
  /// In en, this message translates to:
  /// **'Due date'**
  String get dueDate;

  /// No description provided for @aiErrSignInAgain.
  ///
  /// In en, this message translates to:
  /// **'Sign in again with the Teacher app to use KINETIX AI.'**
  String get aiErrSignInAgain;

  /// No description provided for @aiErrRefused.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI can’t help with that request. Try rephrasing it for the classroom.'**
  String get aiErrRefused;

  /// No description provided for @aiErrQuota.
  ///
  /// In en, this message translates to:
  /// **'Your institution has used today’s KINETIX AI allowance. It resets tomorrow.'**
  String get aiErrQuota;

  /// No description provided for @aiErrUnusable.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI could not produce a usable answer. Try again or rephrase.'**
  String get aiErrUnusable;

  /// No description provided for @aiErrUnreachable.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is not reachable right now. Try again in a minute.'**
  String get aiErrUnreachable;

  /// No description provided for @aiErrCheckInput.
  ///
  /// In en, this message translates to:
  /// **'Check what you typed and try again.'**
  String get aiErrCheckInput;

  /// No description provided for @aiErrGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong ({status}). Try again.'**
  String aiErrGeneric(int status);

  /// No description provided for @aiErrTimeout.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI is taking too long. Try again in a minute.'**
  String get aiErrTimeout;

  /// No description provided for @aiErrOffline.
  ///
  /// In en, this message translates to:
  /// **'The board is offline. Connect to the internet to use KINETIX AI. The maths solver works offline.'**
  String get aiErrOffline;

  /// Question sent to KINETIX AI, in the AI language.
  ///
  /// In en, this message translates to:
  /// **'Explain {topic}'**
  String aiExplainTopic(String topic);

  /// Question sent to KINETIX AI, in the AI language.
  ///
  /// In en, this message translates to:
  /// **'Explain this from the board: {text}'**
  String aiExplainFromBoard(String text);

  /// No description provided for @quizNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to make a quiz with KINETIX AI.'**
  String get quizNeedsSignIn;

  /// No description provided for @quizTypeTopic.
  ///
  /// In en, this message translates to:
  /// **'Type a topic for the quiz first.'**
  String get quizTypeTopic;

  /// No description provided for @quizTopicHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Photosynthesis, Fractions, Company accounts'**
  String get quizTopicHint;

  /// No description provided for @questionsLabel.
  ///
  /// In en, this message translates to:
  /// **'Questions'**
  String get questionsLabel;

  /// No description provided for @quizMake.
  ///
  /// In en, this message translates to:
  /// **'Make quiz'**
  String get quizMake;

  /// No description provided for @quizMakeNew.
  ///
  /// In en, this message translates to:
  /// **'Make a new quiz'**
  String get quizMakeNew;

  /// No description provided for @writingQuestions.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Writing 1 question…} other{Writing {count} questions…}}'**
  String writingQuestions(int count);

  /// No description provided for @quizHeader.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 question · {topic}} other{{count} questions · {topic}}}'**
  String quizHeader(int count, String topic);

  /// No description provided for @quizDraftNote.
  ///
  /// In en, this message translates to:
  /// **'Draft — check the questions and answers before you present them.'**
  String get quizDraftNote;

  /// Show the quiz full screen to the class (verb).
  ///
  /// In en, this message translates to:
  /// **'Present'**
  String get quizPresent;

  /// No description provided for @sendAsHomework.
  ///
  /// In en, this message translates to:
  /// **'Send as homework'**
  String get sendAsHomework;

  /// No description provided for @quizAnswerExplanation.
  ///
  /// In en, this message translates to:
  /// **'Answer {letter}. {explanation}'**
  String quizAnswerExplanation(String letter, String explanation);

  /// No description provided for @questionOf.
  ///
  /// In en, this message translates to:
  /// **'Question {number} of {total}'**
  String questionOf(int number, int total);

  /// No description provided for @hideAnswer.
  ///
  /// In en, this message translates to:
  /// **'Hide answer'**
  String get hideAnswer;

  /// No description provided for @revealAnswer.
  ///
  /// In en, this message translates to:
  /// **'Reveal answer'**
  String get revealAnswer;

  /// No description provided for @finish.
  ///
  /// In en, this message translates to:
  /// **'Finish'**
  String get finish;

  /// Homework title, in the AI language.
  ///
  /// In en, this message translates to:
  /// **'Quiz: {topic}'**
  String quizTitle(String topic);

  /// Homework text sent to students, in the AI language.
  ///
  /// In en, this message translates to:
  /// **'Answer these multiple-choice questions. Write the letter of the correct option.'**
  String get quizHomeworkIntro;

  /// No description provided for @homeworkNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to make homework with KINETIX AI.'**
  String get homeworkNeedsSignIn;

  /// No description provided for @homeworkTypeTopic.
  ///
  /// In en, this message translates to:
  /// **'Type a topic for the homework first.'**
  String get homeworkTypeTopic;

  /// No description provided for @homeworkTopicHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Linear equations, Journal entries'**
  String get homeworkTopicHint;

  /// No description provided for @homeworkMake.
  ///
  /// In en, this message translates to:
  /// **'Make homework'**
  String get homeworkMake;

  /// No description provided for @homeworkWriteOwn.
  ///
  /// In en, this message translates to:
  /// **'Write my own'**
  String get homeworkWriteOwn;

  /// No description provided for @homeworkEditNote.
  ///
  /// In en, this message translates to:
  /// **'You can edit everything before it goes to the class. Students and parents see it in their apps.'**
  String get homeworkEditNote;

  /// No description provided for @homeworkNeedsTitle.
  ///
  /// In en, this message translates to:
  /// **'Give the homework a title.'**
  String get homeworkNeedsTitle;

  /// No description provided for @homeworkTooLong.
  ///
  /// In en, this message translates to:
  /// **'This homework is too long to send. Remove a few questions.'**
  String get homeworkTooLong;

  /// No description provided for @quizTooLongForHomework.
  ///
  /// In en, this message translates to:
  /// **'This quiz is too long to send as homework. Make one with fewer questions.'**
  String get quizTooLongForHomework;

  /// No description provided for @homeworkSent.
  ///
  /// In en, this message translates to:
  /// **'Homework sent to {section}. Students and parents are notified.'**
  String homeworkSent(String section);

  /// No description provided for @homeworkErrSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in again with the Teacher app to give homework.'**
  String get homeworkErrSignIn;

  /// No description provided for @homeworkErrStatus.
  ///
  /// In en, this message translates to:
  /// **'Could not send the homework ({status}). Try again.'**
  String homeworkErrStatus(int status);

  /// No description provided for @homeworkErrOffline.
  ///
  /// In en, this message translates to:
  /// **'The board is offline. Connect to the internet to send homework.'**
  String get homeworkErrOffline;

  /// No description provided for @questionHint.
  ///
  /// In en, this message translates to:
  /// **'Question'**
  String get questionHint;

  /// No description provided for @marks.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 mark} other{{count} marks}}'**
  String marks(int count);

  /// No description provided for @removeQuestion.
  ///
  /// In en, this message translates to:
  /// **'Remove question'**
  String get removeQuestion;

  /// No description provided for @instructionsLabel.
  ///
  /// In en, this message translates to:
  /// **'Instructions'**
  String get instructionsLabel;

  /// No description provided for @totalMarks.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Total 1 mark} other{Total {count} marks}}'**
  String totalMarks(int count);

  /// No description provided for @addQuestion.
  ///
  /// In en, this message translates to:
  /// **'Add question'**
  String get addQuestion;

  /// No description provided for @sendToClass.
  ///
  /// In en, this message translates to:
  /// **'Send to class'**
  String get sendToClass;

  /// Default homework title, in the AI language.
  ///
  /// In en, this message translates to:
  /// **'Homework: {topic}'**
  String homeworkTitleTopic(String topic);

  /// Homework text sent to students, in the AI language.
  ///
  /// In en, this message translates to:
  /// **'Answer all questions in your notebook. Show your working.'**
  String get homeworkDefaultInstructions;

  /// Last line of homework text; marks is the "N marks" string.
  ///
  /// In en, this message translates to:
  /// **'Total: {marks}'**
  String homeworkTotalLine(String marks);

  /// No description provided for @lessonNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to plan a lesson with KINETIX AI.'**
  String get lessonNeedsSignIn;

  /// No description provided for @lessonTypeTopic.
  ///
  /// In en, this message translates to:
  /// **'Type a topic for the lesson first.'**
  String get lessonTypeTopic;

  /// No description provided for @lessonTopicHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. The water cycle'**
  String get lessonTopicHint;

  /// No description provided for @lessonLength.
  ///
  /// In en, this message translates to:
  /// **'Length'**
  String get lessonLength;

  /// No description provided for @lessonPlanButton.
  ///
  /// In en, this message translates to:
  /// **'Plan lesson'**
  String get lessonPlanButton;

  /// No description provided for @lessonPlanAgain.
  ///
  /// In en, this message translates to:
  /// **'Plan again'**
  String get lessonPlanAgain;

  /// No description provided for @lessonPlanning.
  ///
  /// In en, this message translates to:
  /// **'Planning the lesson…'**
  String get lessonPlanning;

  /// No description provided for @lessonObjectives.
  ///
  /// In en, this message translates to:
  /// **'Objectives'**
  String get lessonObjectives;

  /// No description provided for @lessonSteps.
  ///
  /// In en, this message translates to:
  /// **'Steps · {minutes} min'**
  String lessonSteps(int minutes);

  /// No description provided for @lessonMaterials.
  ///
  /// In en, this message translates to:
  /// **'Materials'**
  String get lessonMaterials;

  /// No description provided for @lessonCheck.
  ///
  /// In en, this message translates to:
  /// **'Check understanding'**
  String get lessonCheck;

  /// No description provided for @readNeedsSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app to read the board with KINETIX AI.'**
  String get readNeedsSignIn;

  /// No description provided for @readIntro.
  ///
  /// In en, this message translates to:
  /// **'Turns the handwriting on this page into text you can copy, check or ask about. Write clearly; one page at a time.'**
  String get readIntro;

  /// No description provided for @readThisPage.
  ///
  /// In en, this message translates to:
  /// **'Read this page'**
  String get readThisPage;

  /// No description provided for @readAgain.
  ///
  /// In en, this message translates to:
  /// **'Read again'**
  String get readAgain;

  /// No description provided for @readingBoard.
  ///
  /// In en, this message translates to:
  /// **'Reading the board…'**
  String get readingBoard;

  /// No description provided for @readNoWriting.
  ///
  /// In en, this message translates to:
  /// **'No writing found on this page.'**
  String get readNoWriting;

  /// No description provided for @readMathsFound.
  ///
  /// In en, this message translates to:
  /// **'Maths found'**
  String get readMathsFound;

  /// No description provided for @copied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get copied;

  /// No description provided for @copyText.
  ///
  /// In en, this message translates to:
  /// **'Copy text'**
  String get copyText;

  /// No description provided for @askAiAboutThis.
  ///
  /// In en, this message translates to:
  /// **'Ask KINETIX AI about this'**
  String get askAiAboutThis;

  /// No description provided for @booksTopic.
  ///
  /// In en, this message translates to:
  /// **'Topic'**
  String get booksTopic;

  /// No description provided for @booksSignIn.
  ///
  /// In en, this message translates to:
  /// **'Books show the syllabus of the class being taught. Sign in with the Teacher app to open it.'**
  String get booksSignIn;

  /// No description provided for @booksOpening.
  ///
  /// In en, this message translates to:
  /// **'Opening the syllabus…'**
  String get booksOpening;

  /// No description provided for @booksCouldNotOpen.
  ///
  /// In en, this message translates to:
  /// **'Could not open the syllabus. Check the board is online.'**
  String get booksCouldNotOpen;

  /// No description provided for @booksUnlinked.
  ///
  /// In en, this message translates to:
  /// **'This subject isn\'t linked to a syllabus yet. Your admin can link it in KINETIX ERP → Syllabus.'**
  String get booksUnlinked;

  /// No description provided for @booksDraft.
  ///
  /// In en, this message translates to:
  /// **'Draft content: check against your textbook before teaching from it.'**
  String get booksDraft;

  /// No description provided for @booksDraftShort.
  ///
  /// In en, this message translates to:
  /// **'Draft content: check against your textbook.'**
  String get booksDraftShort;

  /// No description provided for @booksAddedByInstitution.
  ///
  /// In en, this message translates to:
  /// **'Added by your institution'**
  String get booksAddedByInstitution;

  /// No description provided for @booksNotesSoon.
  ///
  /// In en, this message translates to:
  /// **'Notes coming soon'**
  String get booksNotesSoon;

  /// No description provided for @booksTopicCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 topic} other{{count} topics}}'**
  String booksTopicCount(int count);

  /// No description provided for @booksOpeningTopic.
  ///
  /// In en, this message translates to:
  /// **'Opening the topic…'**
  String get booksOpeningTopic;

  /// No description provided for @booksCouldNotOpenTopic.
  ///
  /// In en, this message translates to:
  /// **'Could not open this topic.'**
  String get booksCouldNotOpenTopic;

  /// No description provided for @booksExplain.
  ///
  /// In en, this message translates to:
  /// **'Explain with KINETIX AI'**
  String get booksExplain;

  /// No description provided for @booksQuiz.
  ///
  /// In en, this message translates to:
  /// **'Quick quiz on this'**
  String get booksQuiz;

  /// No description provided for @booksOnTheBoard.
  ///
  /// In en, this message translates to:
  /// **'On the board'**
  String get booksOnTheBoard;

  /// No description provided for @booksKeyFacts.
  ///
  /// In en, this message translates to:
  /// **'Key facts'**
  String get booksKeyFacts;

  /// No description provided for @booksOutcomes.
  ///
  /// In en, this message translates to:
  /// **'By the end, students can'**
  String get booksOutcomes;

  /// Syllabus progress of the open class.
  ///
  /// In en, this message translates to:
  /// **'{covered} of {total} topics taught'**
  String booksTaughtCount(int covered, int total);

  /// Under a chapter: topics taught.
  ///
  /// In en, this message translates to:
  /// **'{covered}/{total} taught'**
  String booksChapterTaught(int covered, int total);

  /// Under a taught topic; date like '3 Oct'.
  ///
  /// In en, this message translates to:
  /// **'Taught on {date}'**
  String booksTaughtOn(String date);

  /// No description provided for @booksMarkTaught.
  ///
  /// In en, this message translates to:
  /// **'Mark as taught'**
  String get booksMarkTaught;

  /// No description provided for @booksUndoTaught.
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get booksUndoTaught;

  /// No description provided for @booksMarked.
  ///
  /// In en, this message translates to:
  /// **'Marked as taught'**
  String get booksMarked;

  /// No description provided for @booksUnmarked.
  ///
  /// In en, this message translates to:
  /// **'No longer marked as taught'**
  String get booksUnmarked;

  /// No description provided for @booksMarkFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not save. Check the board is online.'**
  String get booksMarkFailed;

  /// No description provided for @booksHook.
  ///
  /// In en, this message translates to:
  /// **'Start with'**
  String get booksHook;

  /// No description provided for @booksTerms.
  ///
  /// In en, this message translates to:
  /// **'Words to learn'**
  String get booksTerms;

  /// No description provided for @booksExample.
  ///
  /// In en, this message translates to:
  /// **'Worked example'**
  String get booksExample;

  /// No description provided for @booksActivity.
  ///
  /// In en, this message translates to:
  /// **'Class activity'**
  String get booksActivity;

  /// No description provided for @mathHint.
  ///
  /// In en, this message translates to:
  /// **'Type a sum or an equation'**
  String get mathHint;

  /// No description provided for @mathOffline.
  ///
  /// In en, this message translates to:
  /// **'Solved on this board. Works offline, no sign-in needed.'**
  String get mathOffline;

  /// No description provided for @mathTryThese.
  ///
  /// In en, this message translates to:
  /// **'Try one of these'**
  String get mathTryThese;

  /// No description provided for @mathAbout.
  ///
  /// In en, this message translates to:
  /// **'Works out sums with BODMAS, fractions, powers and roots, sin/cos/tan in degrees, log, and solves linear and quadratic equations step by step.'**
  String get mathAbout;

  /// No description provided for @mathSolve.
  ///
  /// In en, this message translates to:
  /// **'Solve'**
  String get mathSolve;

  /// No description provided for @mathWorking.
  ///
  /// In en, this message translates to:
  /// **'Working'**
  String get mathWorking;

  /// No description provided for @mathKeySquared.
  ///
  /// In en, this message translates to:
  /// **'Squared'**
  String get mathKeySquared;

  /// No description provided for @mathKeyPower.
  ///
  /// In en, this message translates to:
  /// **'Power'**
  String get mathKeyPower;

  /// No description provided for @mathKeySquareRoot.
  ///
  /// In en, this message translates to:
  /// **'Square root'**
  String get mathKeySquareRoot;

  /// No description provided for @mathKeyPi.
  ///
  /// In en, this message translates to:
  /// **'Pi'**
  String get mathKeyPi;

  /// No description provided for @mathKeyFraction.
  ///
  /// In en, this message translates to:
  /// **'Fraction'**
  String get mathKeyFraction;

  /// No description provided for @mathKeyOpenBracket.
  ///
  /// In en, this message translates to:
  /// **'Open bracket'**
  String get mathKeyOpenBracket;

  /// No description provided for @mathKeyCloseBracket.
  ///
  /// In en, this message translates to:
  /// **'Close bracket'**
  String get mathKeyCloseBracket;

  /// No description provided for @mathKeyTimes.
  ///
  /// In en, this message translates to:
  /// **'Times'**
  String get mathKeyTimes;

  /// No description provided for @mathKeyDivide.
  ///
  /// In en, this message translates to:
  /// **'Divide'**
  String get mathKeyDivide;

  /// No description provided for @mathKeyMinus.
  ///
  /// In en, this message translates to:
  /// **'Minus'**
  String get mathKeyMinus;

  /// No description provided for @mathKeyPlus.
  ///
  /// In en, this message translates to:
  /// **'Plus'**
  String get mathKeyPlus;

  /// No description provided for @mathKeyEquals.
  ///
  /// In en, this message translates to:
  /// **'Equals'**
  String get mathKeyEquals;

  /// No description provided for @mathKeyDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get mathKeyDelete;

  /// No description provided for @mathKindArithmetic.
  ///
  /// In en, this message translates to:
  /// **'Arithmetic'**
  String get mathKindArithmetic;

  /// No description provided for @mathKindSimplify.
  ///
  /// In en, this message translates to:
  /// **'Simplify'**
  String get mathKindSimplify;

  /// No description provided for @mathKindCheck.
  ///
  /// In en, this message translates to:
  /// **'Check'**
  String get mathKindCheck;

  /// No description provided for @mathKindLinear.
  ///
  /// In en, this message translates to:
  /// **'Linear equation'**
  String get mathKindLinear;

  /// No description provided for @mathKindQuadratic.
  ///
  /// In en, this message translates to:
  /// **'Quadratic equation'**
  String get mathKindQuadratic;

  /// No description provided for @mathTrue.
  ///
  /// In en, this message translates to:
  /// **'True'**
  String get mathTrue;

  /// No description provided for @mathFalse.
  ///
  /// In en, this message translates to:
  /// **'False'**
  String get mathFalse;

  /// No description provided for @mathEveryNumber.
  ///
  /// In en, this message translates to:
  /// **'Every number is a solution'**
  String get mathEveryNumber;

  /// No description provided for @mathNoSolution.
  ///
  /// In en, this message translates to:
  /// **'No solution'**
  String get mathNoSolution;

  /// No description provided for @mathRepeatedRoot.
  ///
  /// In en, this message translates to:
  /// **'{answer} (repeated root)'**
  String mathRepeatedRoot(String answer);

  /// No description provided for @mathNoRealRoots.
  ///
  /// In en, this message translates to:
  /// **'No real roots: {roots}'**
  String mathNoRealRoots(String roots);

  /// No description provided for @mathOr.
  ///
  /// In en, this message translates to:
  /// **'or'**
  String get mathOr;

  /// No description provided for @mathAnd.
  ///
  /// In en, this message translates to:
  /// **'and'**
  String get mathAnd;

  /// No description provided for @mathForEvery.
  ///
  /// In en, this message translates to:
  /// **'{equation} for every {variable}'**
  String mathForEvery(String equation, String variable);

  /// No description provided for @mathIsFalse.
  ///
  /// In en, this message translates to:
  /// **'{equation} is false'**
  String mathIsFalse(String equation);

  /// No description provided for @mathStepWorkOutRest.
  ///
  /// In en, this message translates to:
  /// **'Work out the rest'**
  String get mathStepWorkOutRest;

  /// No description provided for @mathStepBrackets.
  ///
  /// In en, this message translates to:
  /// **'Brackets first'**
  String get mathStepBrackets;

  /// No description provided for @mathStepPowers.
  ///
  /// In en, this message translates to:
  /// **'Powers and roots'**
  String get mathStepPowers;

  /// No description provided for @mathStepDivideMultiply.
  ///
  /// In en, this message translates to:
  /// **'Divide and multiply, left to right'**
  String get mathStepDivideMultiply;

  /// No description provided for @mathStepAddSubtract.
  ///
  /// In en, this message translates to:
  /// **'Add and subtract, left to right'**
  String get mathStepAddSubtract;

  /// No description provided for @mathStepStartExpression.
  ///
  /// In en, this message translates to:
  /// **'Start with the expression'**
  String get mathStepStartExpression;

  /// No description provided for @mathStepStartStatement.
  ///
  /// In en, this message translates to:
  /// **'Start with the statement'**
  String get mathStepStartStatement;

  /// No description provided for @mathStepLeftSide.
  ///
  /// In en, this message translates to:
  /// **'Work out the left side'**
  String get mathStepLeftSide;

  /// No description provided for @mathStepRightSide.
  ///
  /// In en, this message translates to:
  /// **'Work out the right side'**
  String get mathStepRightSide;

  /// No description provided for @mathStepStatementTrue.
  ///
  /// In en, this message translates to:
  /// **'Both sides are equal, so the statement is true'**
  String get mathStepStatementTrue;

  /// No description provided for @mathStepStatementFalse.
  ///
  /// In en, this message translates to:
  /// **'The sides are different, so the statement is false'**
  String get mathStepStatementFalse;

  /// No description provided for @mathStepExpand.
  ///
  /// In en, this message translates to:
  /// **'Expand the brackets and collect like terms'**
  String get mathStepExpand;

  /// No description provided for @mathStepToFind.
  ///
  /// In en, this message translates to:
  /// **'To find {variable}, write an equation, e.g. {equation}'**
  String mathStepToFind(String variable, String equation);

  /// No description provided for @mathStepWriteEquation.
  ///
  /// In en, this message translates to:
  /// **'Write the equation'**
  String get mathStepWriteEquation;

  /// No description provided for @mathStepExpandEachSide.
  ///
  /// In en, this message translates to:
  /// **'Expand the brackets and collect like terms on each side'**
  String get mathStepExpandEachSide;

  /// No description provided for @mathStepSquaresCancel.
  ///
  /// In en, this message translates to:
  /// **'Subtract {term} from both sides; the {square} terms cancel'**
  String mathStepSquaresCancel(String term, String square);

  /// No description provided for @mathStepAlwaysEqual.
  ///
  /// In en, this message translates to:
  /// **'Both sides are always equal'**
  String get mathStepAlwaysEqual;

  /// No description provided for @mathStepNeverEqual.
  ///
  /// In en, this message translates to:
  /// **'The two sides can never be equal'**
  String get mathStepNeverEqual;

  /// No description provided for @mathStepAddBoth.
  ///
  /// In en, this message translates to:
  /// **'Add {term} to both sides'**
  String mathStepAddBoth(String term);

  /// No description provided for @mathStepSubtractBoth.
  ///
  /// In en, this message translates to:
  /// **'Subtract {term} from both sides'**
  String mathStepSubtractBoth(String term);

  /// No description provided for @mathStepMultiplyBoth.
  ///
  /// In en, this message translates to:
  /// **'Multiply both sides by {number}'**
  String mathStepMultiplyBoth(String number);

  /// No description provided for @mathStepDivideBoth.
  ///
  /// In en, this message translates to:
  /// **'Divide both sides by {number}'**
  String mathStepDivideBoth(String number);

  /// No description provided for @mathStepCheck.
  ///
  /// In en, this message translates to:
  /// **'Check: put {value} back into the equation'**
  String mathStepCheck(String value);

  /// No description provided for @mathStepBringLeft.
  ///
  /// In en, this message translates to:
  /// **'Bring every term to the left side and simplify'**
  String get mathStepBringLeft;

  /// No description provided for @mathStepClearFractions.
  ///
  /// In en, this message translates to:
  /// **'Multiply both sides by {number} to clear the fractions'**
  String mathStepClearFractions(String number);

  /// No description provided for @mathStepMakePositive.
  ///
  /// In en, this message translates to:
  /// **'Multiply both sides by {number} so the {square} term is positive'**
  String mathStepMakePositive(String number, String square);

  /// No description provided for @mathStepCompare.
  ///
  /// In en, this message translates to:
  /// **'Compare with {form}'**
  String mathStepCompare(String form);

  /// No description provided for @mathStepDiscriminant.
  ///
  /// In en, this message translates to:
  /// **'Find the discriminant {formula}'**
  String mathStepDiscriminant(String formula);

  /// No description provided for @mathStepEqualRoots.
  ///
  /// In en, this message translates to:
  /// **'D = 0, so the two roots are equal'**
  String get mathStepEqualRoots;

  /// No description provided for @mathStepUse.
  ///
  /// In en, this message translates to:
  /// **'Use {formula}'**
  String mathStepUse(String formula);

  /// No description provided for @mathStepComplexRoots.
  ///
  /// In en, this message translates to:
  /// **'D < 0, so there are no real roots. The roots are complex numbers'**
  String get mathStepComplexRoots;

  /// No description provided for @mathStepTwoRealRoots.
  ///
  /// In en, this message translates to:
  /// **'D > 0, so there are two different real roots'**
  String get mathStepTwoRealRoots;

  /// No description provided for @mathStepQuadraticFormula.
  ///
  /// In en, this message translates to:
  /// **'Use the quadratic formula {formula}'**
  String mathStepQuadraticFormula(String formula);

  /// No description provided for @mathStepTwoRoots.
  ///
  /// In en, this message translates to:
  /// **'Work out the two roots'**
  String get mathStepTwoRoots;

  /// No description provided for @mathStepSimplifyRoot.
  ///
  /// In en, this message translates to:
  /// **'Simplify the square root'**
  String get mathStepSimplifyRoot;

  /// No description provided for @mathStepDivideTopBottom.
  ///
  /// In en, this message translates to:
  /// **'Divide the top and bottom by {number}'**
  String mathStepDivideTopBottom(String number);

  /// No description provided for @mathStepSoRoots.
  ///
  /// In en, this message translates to:
  /// **'So the roots are'**
  String get mathStepSoRoots;

  /// No description provided for @mathStepInDecimals.
  ///
  /// In en, this message translates to:
  /// **'In decimals'**
  String get mathStepInDecimals;

  /// No description provided for @mathStepWorkOutRoots.
  ///
  /// In en, this message translates to:
  /// **'Work out the roots'**
  String get mathStepWorkOutRoots;

  /// No description provided for @mathStepFactorised.
  ///
  /// In en, this message translates to:
  /// **'Factorised form'**
  String get mathStepFactorised;

  /// No description provided for @mathErrZeroPowerZero.
  ///
  /// In en, this message translates to:
  /// **'0⁰ is not defined.'**
  String get mathErrZeroPowerZero;

  /// No description provided for @mathErrDivisionByZero.
  ///
  /// In en, this message translates to:
  /// **'Division by zero is not defined.'**
  String get mathErrDivisionByZero;

  /// No description provided for @mathErrNegativeFractionalPower.
  ///
  /// In en, this message translates to:
  /// **'A negative number to a fractional power is not a real number.'**
  String get mathErrNegativeFractionalPower;

  /// No description provided for @mathErrNegativeRoot.
  ///
  /// In en, this message translates to:
  /// **'The square root of a negative number is not a real number.'**
  String get mathErrNegativeRoot;

  /// No description provided for @mathErrNotDefined.
  ///
  /// In en, this message translates to:
  /// **'{expression} is not defined.'**
  String mathErrNotDefined(String expression);

  /// No description provided for @mathErrPositiveOnly.
  ///
  /// In en, this message translates to:
  /// **'{function} is only defined for positive numbers.'**
  String mathErrPositiveOnly(String function);

  /// No description provided for @mathErrUnknownFunction.
  ///
  /// In en, this message translates to:
  /// **'Unknown function {function}.'**
  String mathErrUnknownFunction(String function);

  /// No description provided for @mathErrNoValue.
  ///
  /// In en, this message translates to:
  /// **'“{name}” has no value.'**
  String mathErrNoValue(String name);

  /// No description provided for @mathErrTooLarge.
  ///
  /// In en, this message translates to:
  /// **'The answer is too large or not defined.'**
  String get mathErrTooLarge;

  /// No description provided for @mathErrNotANumber.
  ///
  /// In en, this message translates to:
  /// **'“{text}” is not a number.'**
  String mathErrNotANumber(String text);

  /// No description provided for @mathErrDontUnderstandUse.
  ///
  /// In en, this message translates to:
  /// **'I don’t understand “{text}”. Use numbers, x, + − × ÷ ^, brackets, √, sin, cos, tan, log.'**
  String mathErrDontUnderstandUse(String text);

  /// No description provided for @mathErrEmpty.
  ///
  /// In en, this message translates to:
  /// **'Type a sum or an equation, like 3x + 5 = 20.'**
  String get mathErrEmpty;

  /// No description provided for @mathErrAfterEquals.
  ///
  /// In en, this message translates to:
  /// **'Write something after “=”.'**
  String get mathErrAfterEquals;

  /// No description provided for @mathErrOneEquals.
  ///
  /// In en, this message translates to:
  /// **'Use only one “=” sign.'**
  String get mathErrOneEquals;

  /// No description provided for @mathErrUnmatchedClose.
  ///
  /// In en, this message translates to:
  /// **'There is a “)” without a matching “(”.'**
  String get mathErrUnmatchedClose;

  /// No description provided for @mathErrDontUnderstandHere.
  ///
  /// In en, this message translates to:
  /// **'I don’t understand “{text}” here.'**
  String mathErrDontUnderstandHere(String text);

  /// No description provided for @mathErrEndsEarly.
  ///
  /// In en, this message translates to:
  /// **'The expression ends too early. Is something missing?'**
  String get mathErrEndsEarly;

  /// No description provided for @mathErrOperatorBetween.
  ///
  /// In en, this message translates to:
  /// **'Put an operator (+ − × ÷) between the numbers.'**
  String get mathErrOperatorBetween;

  /// No description provided for @mathErrPowerAfterCaret.
  ///
  /// In en, this message translates to:
  /// **'Write the power after “^”.'**
  String get mathErrPowerAfterCaret;

  /// No description provided for @mathErrEmptyBrackets.
  ///
  /// In en, this message translates to:
  /// **'There is nothing inside the brackets “()”.'**
  String get mathErrEmptyBrackets;

  /// No description provided for @mathErrBracketNotClosed.
  ///
  /// In en, this message translates to:
  /// **'A bracket is not closed. Add “)”.'**
  String get mathErrBracketNotClosed;

  /// No description provided for @mathErrNumberAfter.
  ///
  /// In en, this message translates to:
  /// **'Write a number after {function}.'**
  String mathErrNumberAfter(String function);

  /// No description provided for @mathErrBeforeEquals.
  ///
  /// In en, this message translates to:
  /// **'Write something before “=”.'**
  String get mathErrBeforeEquals;

  /// No description provided for @mathErrMissingBefore.
  ///
  /// In en, this message translates to:
  /// **'Something is missing before “{text}”.'**
  String mathErrMissingBefore(String text);

  /// No description provided for @mathErrBothSides.
  ///
  /// In en, this message translates to:
  /// **'Write something on both sides of “=”.'**
  String get mathErrBothSides;

  /// No description provided for @mathErrUnknownInside.
  ///
  /// In en, this message translates to:
  /// **'The unknown inside {function} is not supported yet.'**
  String mathErrUnknownInside(String function);

  /// No description provided for @mathErrUnknownDenominator.
  ///
  /// In en, this message translates to:
  /// **'The unknown in a denominator is not supported yet.'**
  String get mathErrUnknownDenominator;

  /// No description provided for @mathErrUnknownPower.
  ///
  /// In en, this message translates to:
  /// **'The unknown in a power is not supported yet.'**
  String get mathErrUnknownPower;

  /// No description provided for @mathErrWholePowers.
  ///
  /// In en, this message translates to:
  /// **'Powers of the unknown must be whole numbers like x² or x³.'**
  String get mathErrWholePowers;

  /// No description provided for @mathErrManyUnknowns.
  ///
  /// In en, this message translates to:
  /// **'This has more than one unknown ({list}). Use one unknown, like x.'**
  String mathErrManyUnknowns(String list);

  /// No description provided for @mathErrHighPowers.
  ///
  /// In en, this message translates to:
  /// **'Equations with {power} or higher powers are not supported yet. Try a linear or quadratic equation.'**
  String mathErrHighPowers(String power);

  /// Classroom tool and panel title: the lesson plan for the open period.
  ///
  /// In en, this message translates to:
  /// **'Today\'s plan'**
  String get toolTodaysPlan;

  /// Guest board.
  ///
  /// In en, this message translates to:
  /// **'Today\'s plan shows the lesson plan for the class being taught. Sign in with the Teacher app to open it.'**
  String get planSignIn;

  /// Loading.
  ///
  /// In en, this message translates to:
  /// **'Opening the plan…'**
  String get planOpening;

  /// Error.
  ///
  /// In en, this message translates to:
  /// **'Could not open the lesson plan. Check the board is online.'**
  String get planCouldNotOpen;

  /// Free session (no class).
  ///
  /// In en, this message translates to:
  /// **'No timetabled class is open on the board, so there is no lesson plan to show.'**
  String get planNoClass;

  /// No plan saved for the period.
  ///
  /// In en, this message translates to:
  /// **'No lesson plan for this period. Plan it in the Teacher app.'**
  String get planNone;

  /// The plan began as a KINETIX AI draft.
  ///
  /// In en, this message translates to:
  /// **'Drafted with KINETIX AI'**
  String get planAiDrafted;

  /// Section: the lesson's syllabus topics.
  ///
  /// In en, this message translates to:
  /// **'Topics'**
  String get planTopics;

  /// Tooltip on a topic chip.
  ///
  /// In en, this message translates to:
  /// **'Open in Books'**
  String get planOpenInBooks;

  /// Steps heading: planned minutes vs the period length.
  ///
  /// In en, this message translates to:
  /// **'Steps · {planned} of {length} min'**
  String planStepsOf(int planned, int length);

  /// Button: start timing the steps.
  ///
  /// In en, this message translates to:
  /// **'Start step timer'**
  String get planStartTimer;

  /// Button: resume the step timer.
  ///
  /// In en, this message translates to:
  /// **'Resume'**
  String get planResumeTimer;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Next step'**
  String get planNextStep;

  /// After the last step.
  ///
  /// In en, this message translates to:
  /// **'All steps done'**
  String get planAllStepsDone;

  /// Section.
  ///
  /// In en, this message translates to:
  /// **'Homework'**
  String get planHomework;

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

  /// Board demo notice.
  ///
  /// In en, this message translates to:
  /// **'This board is in a demo class with sample data. Nothing is sent to a server.'**
  String get demoBoardBody;

  /// Board kiosk mode (docs/hardware/kiosk-mode.md): the device locked to the board app.
  ///
  /// In en, this message translates to:
  /// **'Kiosk mode'**
  String get kioskTitle;

  /// No description provided for @kioskSettingsHint.
  ///
  /// In en, this message translates to:
  /// **'Keeps students in KINETIX Board and opens it again after a power cut. Your institution turns it on and sets the IT PIN in KINETIX ERP → Settings.'**
  String get kioskSettingsHint;

  /// No description provided for @kioskStatusLocked.
  ///
  /// In en, this message translates to:
  /// **'On: this device is locked to KINETIX Board.'**
  String get kioskStatusLocked;

  /// No description provided for @kioskStatusPinned.
  ///
  /// In en, this message translates to:
  /// **'On: screen pinning. For a full lock, make KINETIX Board the device owner (see the kiosk guide).'**
  String get kioskStatusPinned;

  /// No description provided for @kioskStatusOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get kioskStatusOff;

  /// No description provided for @kioskStatusPaused.
  ///
  /// In en, this message translates to:
  /// **'Paused by IT until {time}'**
  String kioskStatusPaused(String time);

  /// No description provided for @kioskStatusUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Not available on this device. On Windows, use Assigned Access (see the kiosk guide).'**
  String get kioskStatusUnsupported;

  /// No description provided for @kioskDemoHint.
  ///
  /// In en, this message translates to:
  /// **'Demo builds never lock this device. Try screen pinning to see what kiosk mode is like: press and hold the clock for 3 seconds to leave.'**
  String get kioskDemoHint;

  /// No description provided for @kioskTry.
  ///
  /// In en, this message translates to:
  /// **'Try kiosk (screen pinning)'**
  String get kioskTry;

  /// No description provided for @kioskStopTrial.
  ///
  /// In en, this message translates to:
  /// **'Stop kiosk trial'**
  String get kioskStopTrial;

  /// No description provided for @kioskExitTitle.
  ///
  /// In en, this message translates to:
  /// **'Leave kiosk mode'**
  String get kioskExitTitle;

  /// No description provided for @kioskEnterPin.
  ///
  /// In en, this message translates to:
  /// **'For IT staff: enter the IT PIN set in KINETIX ERP.'**
  String get kioskEnterPin;

  /// No description provided for @kioskPinLabel.
  ///
  /// In en, this message translates to:
  /// **'IT PIN'**
  String get kioskPinLabel;

  /// No description provided for @kioskUnlock.
  ///
  /// In en, this message translates to:
  /// **'Unlock'**
  String get kioskUnlock;

  /// No description provided for @kioskWrongPin.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Wrong PIN. 1 attempt left.} other{Wrong PIN. {count} attempts left.}}'**
  String kioskWrongPin(int count);

  /// No description provided for @kioskLockedOut.
  ///
  /// In en, this message translates to:
  /// **'Too many wrong PINs. Try again after {time}.'**
  String kioskLockedOut(String time);

  /// No description provided for @kioskNoPin.
  ///
  /// In en, this message translates to:
  /// **'No IT PIN has been set for this institution yet. Set one in KINETIX ERP → Settings → Board kiosk mode; the board picks it up when it is next online. Until then, kiosk mode can only be removed as the kiosk guide describes.'**
  String get kioskNoPin;

  /// No description provided for @kioskLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave kiosk for 10 minutes'**
  String get kioskLeave;

  /// No description provided for @kioskLeaveHint.
  ///
  /// In en, this message translates to:
  /// **'The board locks again by itself after 10 minutes, or when it restarts.'**
  String get kioskLeaveHint;

  /// No description provided for @kioskOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open Android settings'**
  String get kioskOpenSettings;

  /// No description provided for @kioskPausedBody.
  ///
  /// In en, this message translates to:
  /// **'Kiosk mode is paused until {time}.'**
  String kioskPausedBody(String time);

  /// No description provided for @kioskLockNow.
  ///
  /// In en, this message translates to:
  /// **'Lock again now'**
  String get kioskLockNow;

  /// No description provided for @kioskDemoBody.
  ///
  /// In en, this message translates to:
  /// **'This is a demo build: kiosk mode is off and no PIN is needed.'**
  String get kioskDemoBody;

  /// No description provided for @toolConceptVideos.
  ///
  /// In en, this message translates to:
  /// **'Concept videos'**
  String get toolConceptVideos;

  /// No description provided for @conceptVideosTitle.
  ///
  /// In en, this message translates to:
  /// **'Concept videos'**
  String get conceptVideosTitle;

  /// No description provided for @conceptVideosForPeriod.
  ///
  /// In en, this message translates to:
  /// **'Concept videos for this period'**
  String get conceptVideosForPeriod;

  /// No description provided for @conceptVideosNext.
  ///
  /// In en, this message translates to:
  /// **'Next period at {time}'**
  String conceptVideosNext(String time);

  /// No description provided for @conceptVideosSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get conceptVideosSkip;

  /// No description provided for @conceptVideosNone.
  ///
  /// In en, this message translates to:
  /// **'No concept videos for this topic yet.'**
  String get conceptVideosNone;

  /// No description provided for @conceptVideosNoPeriod.
  ///
  /// In en, this message translates to:
  /// **'No class on this board now or later today.'**
  String get conceptVideosNoPeriod;

  /// No description provided for @conceptVideosSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in to see concept videos for your class.'**
  String get conceptVideosSignIn;

  /// No description provided for @conceptVideosCouldNotLoad.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load the concept videos.'**
  String get conceptVideosCouldNotLoad;

  /// No description provided for @conceptVideosUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Videos can\'t play on this device. Use the board\'s Android or Windows app.'**
  String get conceptVideosUnsupported;

  /// No description provided for @conceptVideosFromYouTube.
  ///
  /// In en, this message translates to:
  /// **'Plays from YouTube'**
  String get conceptVideosFromYouTube;

  /// No description provided for @conceptVideosSourceLessonPlan.
  ///
  /// In en, this message translates to:
  /// **'From today\'s lesson plan'**
  String get conceptVideosSourceLessonPlan;

  /// No description provided for @conceptVideosSourceYearPlan.
  ///
  /// In en, this message translates to:
  /// **'From the year plan'**
  String get conceptVideosSourceYearPlan;

  /// No description provided for @conceptVideosSourceSyllabus.
  ///
  /// In en, this message translates to:
  /// **'Next topic in the syllabus'**
  String get conceptVideosSourceSyllabus;

  /// No description provided for @conceptVideosPlay.
  ///
  /// In en, this message translates to:
  /// **'Play {title}'**
  String conceptVideosPlay(String title);

  /// No description provided for @answerCover.
  ///
  /// In en, this message translates to:
  /// **'Tap to show the answer'**
  String get answerCover;

  /// No description provided for @answerHint.
  ///
  /// In en, this message translates to:
  /// **'The answer, kept covered until you show it'**
  String get answerHint;

  /// No description provided for @bgFourLine.
  ///
  /// In en, this message translates to:
  /// **'Four-line'**
  String get bgFourLine;

  /// No description provided for @bringToFront.
  ///
  /// In en, this message translates to:
  /// **'Bring to front'**
  String get bringToFront;

  /// No description provided for @sendToBack.
  ///
  /// In en, this message translates to:
  /// **'Send to back'**
  String get sendToBack;

  /// No description provided for @circuitAmmeter.
  ///
  /// In en, this message translates to:
  /// **'Ammeter'**
  String get circuitAmmeter;

  /// No description provided for @circuitBattery.
  ///
  /// In en, this message translates to:
  /// **'Battery'**
  String get circuitBattery;

  /// No description provided for @circuitBulb.
  ///
  /// In en, this message translates to:
  /// **'Bulb'**
  String get circuitBulb;

  /// No description provided for @circuitCell.
  ///
  /// In en, this message translates to:
  /// **'Cell'**
  String get circuitCell;

  /// No description provided for @circuitEarth.
  ///
  /// In en, this message translates to:
  /// **'Earth'**
  String get circuitEarth;

  /// No description provided for @circuitLed.
  ///
  /// In en, this message translates to:
  /// **'LED'**
  String get circuitLed;

  /// No description provided for @circuitResistor.
  ///
  /// In en, this message translates to:
  /// **'Resistor'**
  String get circuitResistor;

  /// No description provided for @circuitSwitchClosed.
  ///
  /// In en, this message translates to:
  /// **'Switch (closed)'**
  String get circuitSwitchClosed;

  /// No description provided for @circuitSwitchOpen.
  ///
  /// In en, this message translates to:
  /// **'Switch (open)'**
  String get circuitSwitchOpen;

  /// No description provided for @circuitVoltmeter.
  ///
  /// In en, this message translates to:
  /// **'Voltmeter'**
  String get circuitVoltmeter;

  /// No description provided for @circuitWire.
  ///
  /// In en, this message translates to:
  /// **'Wire'**
  String get circuitWire;

  /// No description provided for @copy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get copy;

  /// No description provided for @paste.
  ///
  /// In en, this message translates to:
  /// **'Paste'**
  String get paste;

  /// No description provided for @duplicate.
  ///
  /// In en, this message translates to:
  /// **'Duplicate'**
  String get duplicate;

  /// No description provided for @delete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// No description provided for @edit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get edit;

  /// No description provided for @group.
  ///
  /// In en, this message translates to:
  /// **'Group'**
  String get group;

  /// No description provided for @ungroup.
  ///
  /// In en, this message translates to:
  /// **'Ungroup'**
  String get ungroup;

  /// No description provided for @fill.
  ///
  /// In en, this message translates to:
  /// **'Fill'**
  String get fill;

  /// No description provided for @noFill.
  ///
  /// In en, this message translates to:
  /// **'No fill'**
  String get noFill;

  /// No description provided for @fillShapes.
  ///
  /// In en, this message translates to:
  /// **'Fill shapes'**
  String get fillShapes;

  /// No description provided for @equationLatex.
  ///
  /// In en, this message translates to:
  /// **'Equation (LaTeX)'**
  String get equationLatex;

  /// No description provided for @equationPreview.
  ///
  /// In en, this message translates to:
  /// **'Type below, or tap a sign'**
  String get equationPreview;

  /// No description provided for @putOnBoard.
  ///
  /// In en, this message translates to:
  /// **'Put on the board'**
  String get putOnBoard;

  /// No description provided for @flowDecision.
  ///
  /// In en, this message translates to:
  /// **'Decision'**
  String get flowDecision;

  /// No description provided for @flowInputOutput.
  ///
  /// In en, this message translates to:
  /// **'Input / output'**
  String get flowInputOutput;

  /// No description provided for @flowProcess.
  ///
  /// In en, this message translates to:
  /// **'Process'**
  String get flowProcess;

  /// No description provided for @flowStartEnd.
  ///
  /// In en, this message translates to:
  /// **'Start / end'**
  String get flowStartEnd;

  /// No description provided for @graphCannotRead.
  ///
  /// In en, this message translates to:
  /// **'This function cannot be read'**
  String get graphCannotRead;

  /// No description provided for @graphFunction.
  ///
  /// In en, this message translates to:
  /// **'Function'**
  String get graphFunction;

  /// No description provided for @graphHint.
  ///
  /// In en, this message translates to:
  /// **'For example 2x^2 - 3, sin(x), sqrt(x)'**
  String get graphHint;

  /// No description provided for @graphXRange.
  ///
  /// In en, this message translates to:
  /// **'x from − to +'**
  String get graphXRange;

  /// No description provided for @graphYRange.
  ///
  /// In en, this message translates to:
  /// **'y from − to +'**
  String get graphYRange;

  /// No description provided for @hideProtractor.
  ///
  /// In en, this message translates to:
  /// **'Hide protractor'**
  String get hideProtractor;

  /// No description provided for @hideRuler.
  ///
  /// In en, this message translates to:
  /// **'Hide ruler'**
  String get hideRuler;

  /// No description provided for @turn.
  ///
  /// In en, this message translates to:
  /// **'Turn'**
  String get turn;

  /// No description provided for @typeHint.
  ///
  /// In en, this message translates to:
  /// **'Type…'**
  String get typeHint;

  /// No description provided for @inputTitle.
  ///
  /// In en, this message translates to:
  /// **'Writing with'**
  String get inputTitle;

  /// No description provided for @inputHint.
  ///
  /// In en, this message translates to:
  /// **'Pen: only the pen writes and fingers move the board. Auto: fingers write until a pen is used.'**
  String get inputHint;

  /// No description provided for @inputAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get inputAuto;

  /// No description provided for @inputPen.
  ///
  /// In en, this message translates to:
  /// **'Pen'**
  String get inputPen;

  /// No description provided for @inputFinger.
  ///
  /// In en, this message translates to:
  /// **'Finger'**
  String get inputFinger;

  /// No description provided for @insertAnswerHint.
  ///
  /// In en, this message translates to:
  /// **'Covered until you tap it in class'**
  String get insertAnswerHint;

  /// No description provided for @insertEquationHint.
  ///
  /// In en, this message translates to:
  /// **'Fractions, roots and powers, typeset'**
  String get insertEquationHint;

  /// No description provided for @insertModelHint.
  ///
  /// In en, this message translates to:
  /// **'Opens beside the board; put a picture of it on the board'**
  String get insertModelHint;

  /// No description provided for @tapToPlace.
  ///
  /// In en, this message translates to:
  /// **'Tap the board to place it'**
  String get tapToPlace;

  /// No description provided for @laserHint.
  ///
  /// In en, this message translates to:
  /// **'Points without drawing'**
  String get laserHint;

  /// No description provided for @kitAddWord.
  ///
  /// In en, this message translates to:
  /// **'Add a word'**
  String get kitAddWord;

  /// No description provided for @kitAiForLesson.
  ///
  /// In en, this message translates to:
  /// **'KINETIX AI for this lesson'**
  String get kitAiForLesson;

  /// No description provided for @kitAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get kitAll;

  /// No description provided for @kitAtomBall.
  ///
  /// In en, this message translates to:
  /// **'Atom ball'**
  String get kitAtomBall;

  /// No description provided for @kitBinary.
  ///
  /// In en, this message translates to:
  /// **'Binary'**
  String get kitBinary;

  /// No description provided for @kitBohrModel.
  ///
  /// In en, this message translates to:
  /// **'Bohr model'**
  String get kitBohrModel;

  /// No description provided for @kitDecimal.
  ///
  /// In en, this message translates to:
  /// **'Decimal number'**
  String get kitDecimal;

  /// No description provided for @kitDrawTimeline.
  ///
  /// In en, this message translates to:
  /// **'Draw timeline ({count})'**
  String kitDrawTimeline(int count);

  /// No description provided for @kitElementCard.
  ///
  /// In en, this message translates to:
  /// **'Element card'**
  String get kitElementCard;

  /// No description provided for @kitIndia.
  ///
  /// In en, this message translates to:
  /// **'India'**
  String get kitIndia;

  /// No description provided for @kitWorld.
  ///
  /// In en, this message translates to:
  /// **'World'**
  String get kitWorld;

  /// No description provided for @kitMore.
  ///
  /// In en, this message translates to:
  /// **'In this kit'**
  String get kitMore;

  /// No description provided for @kitMoreHint.
  ///
  /// In en, this message translates to:
  /// **'The tabs above hold this subject’s material. Tap anything to put it on the board.'**
  String get kitMoreHint;

  /// No description provided for @kitPickEvents.
  ///
  /// In en, this message translates to:
  /// **'Pick events for a timeline'**
  String get kitPickEvents;

  /// No description provided for @kitSearchFormulas.
  ///
  /// In en, this message translates to:
  /// **'Search formulas'**
  String get kitSearchFormulas;

  /// No description provided for @kitSeeAndDo.
  ///
  /// In en, this message translates to:
  /// **'See and do'**
  String get kitSeeAndDo;

  /// No description provided for @kitShort.
  ///
  /// In en, this message translates to:
  /// **'Kit'**
  String get kitShort;

  /// No description provided for @kitStarGive.
  ///
  /// In en, this message translates to:
  /// **'Give a star'**
  String get kitStarGive;

  /// No description provided for @kitStarRemove.
  ///
  /// In en, this message translates to:
  /// **'Take a star back'**
  String get kitStarRemove;

  /// No description provided for @kitStarOfTheDay.
  ///
  /// In en, this message translates to:
  /// **'Star of the day: {name}'**
  String kitStarOfTheDay(String name);

  /// No description provided for @kitStarsNoClass.
  ///
  /// In en, this message translates to:
  /// **'Sign in with a timetabled class to give its children stars.'**
  String get kitStarsNoClass;

  /// No description provided for @kitWordsHint.
  ///
  /// In en, this message translates to:
  /// **'Words you write on the board appear here. Tap one for a big word card.'**
  String get kitWordsHint;

  /// No description provided for @kitThisLesson.
  ///
  /// In en, this message translates to:
  /// **'This lesson'**
  String get kitThisLesson;

  /// No description provided for @kitFormulas.
  ///
  /// In en, this message translates to:
  /// **'Formulas'**
  String get kitFormulas;

  /// No description provided for @kitConstants.
  ///
  /// In en, this message translates to:
  /// **'Constants'**
  String get kitConstants;

  /// No description provided for @kitPeriodic.
  ///
  /// In en, this message translates to:
  /// **'Periodic table'**
  String get kitPeriodic;

  /// No description provided for @kitIons.
  ///
  /// In en, this message translates to:
  /// **'Ions'**
  String get kitIons;

  /// No description provided for @kitDates.
  ///
  /// In en, this message translates to:
  /// **'Key dates'**
  String get kitDates;

  /// No description provided for @kitWords.
  ///
  /// In en, this message translates to:
  /// **'Word wall'**
  String get kitWords;

  /// No description provided for @kitLogic.
  ///
  /// In en, this message translates to:
  /// **'Logic gates'**
  String get kitLogic;

  /// No description provided for @kitStars.
  ///
  /// In en, this message translates to:
  /// **'Class stars'**
  String get kitStars;

  /// No description provided for @kitValency.
  ///
  /// In en, this message translates to:
  /// **'Valency {valency}'**
  String kitValency(int valency);

  /// No description provided for @kitPeriodicHint.
  ///
  /// In en, this message translates to:
  /// **'Tap an element for its card, Bohr model or atom ball.'**
  String get kitPeriodicHint;

  /// No description provided for @kitLogicHint.
  ///
  /// In en, this message translates to:
  /// **'Tap to write the truth table on the board.'**
  String get kitLogicHint;

  /// No description provided for @subjectKit.
  ///
  /// In en, this message translates to:
  /// **'{subject} kit'**
  String subjectKit(String subject);

  /// No description provided for @layoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Layout'**
  String get layoutTitle;

  /// No description provided for @layoutHint.
  ///
  /// In en, this message translates to:
  /// **'Rails put the tools at the sides of the board; the toolbar puts them along the bottom.'**
  String get layoutHint;

  /// No description provided for @layoutRails.
  ///
  /// In en, this message translates to:
  /// **'Rails'**
  String get layoutRails;

  /// No description provided for @layoutBottomBar.
  ///
  /// In en, this message translates to:
  /// **'Bottom toolbar'**
  String get layoutBottomBar;

  /// No description provided for @simpleBoardTitle.
  ///
  /// In en, this message translates to:
  /// **'Simple board'**
  String get simpleBoardTitle;

  /// No description provided for @simpleBoardHint.
  ///
  /// In en, this message translates to:
  /// **'Big tools with their names, Andika letters and class stars, for LKG to Class 5. Auto turns it on for those classes.'**
  String get simpleBoardHint;

  /// No description provided for @simpleBoardAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get simpleBoardAuto;

  /// No description provided for @simpleBoardOn.
  ///
  /// In en, this message translates to:
  /// **'On'**
  String get simpleBoardOn;

  /// No description provided for @simpleBoardOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get simpleBoardOff;

  /// No description provided for @noteAnswer.
  ///
  /// In en, this message translates to:
  /// **'Covered answer'**
  String get noteAnswer;

  /// No description provided for @noteSticky.
  ///
  /// In en, this message translates to:
  /// **'Sticky note'**
  String get noteSticky;

  /// No description provided for @numberFrom.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get numberFrom;

  /// No description provided for @numberTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get numberTo;

  /// No description provided for @numberStep.
  ///
  /// In en, this message translates to:
  /// **'Step'**
  String get numberStep;

  /// No description provided for @openLab.
  ///
  /// In en, this message translates to:
  /// **'Open the lab'**
  String get openLab;

  /// No description provided for @openModel.
  ///
  /// In en, this message translates to:
  /// **'Open the 3D model'**
  String get openModel;

  /// No description provided for @readWithAi.
  ///
  /// In en, this message translates to:
  /// **'Read with AI'**
  String get readWithAi;

  /// No description provided for @snapshotAdded.
  ///
  /// In en, this message translates to:
  /// **'Picture put on the board. Tap it to open it again.'**
  String get snapshotAdded;

  /// No description provided for @snapshotToBoard.
  ///
  /// In en, this message translates to:
  /// **'Put on board'**
  String get snapshotToBoard;

  /// No description provided for @stChemEquation.
  ///
  /// In en, this message translates to:
  /// **'Chemical equation'**
  String get stChemEquation;

  /// No description provided for @stCode.
  ///
  /// In en, this message translates to:
  /// **'Code block'**
  String get stCode;

  /// No description provided for @stEquation.
  ///
  /// In en, this message translates to:
  /// **'Equation'**
  String get stEquation;

  /// No description provided for @stGraph.
  ///
  /// In en, this message translates to:
  /// **'Graph'**
  String get stGraph;

  /// No description provided for @stNumberLine.
  ///
  /// In en, this message translates to:
  /// **'Number line'**
  String get stNumberLine;

  /// No description provided for @stWordCard.
  ///
  /// In en, this message translates to:
  /// **'Word card'**
  String get stWordCard;

  /// No description provided for @stGeometry.
  ///
  /// In en, this message translates to:
  /// **'Geometry'**
  String get stGeometry;

  /// No description provided for @stCircuits.
  ///
  /// In en, this message translates to:
  /// **'Circuits'**
  String get stCircuits;

  /// No description provided for @stAtoms.
  ///
  /// In en, this message translates to:
  /// **'Atoms'**
  String get stAtoms;

  /// No description provided for @stTimeline.
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get stTimeline;

  /// No description provided for @stFlowchart.
  ///
  /// In en, this message translates to:
  /// **'Flowchart'**
  String get stFlowchart;

  /// No description provided for @stFourLine.
  ///
  /// In en, this message translates to:
  /// **'Four-line paper'**
  String get stFourLine;

  /// No description provided for @stGrammar.
  ///
  /// In en, this message translates to:
  /// **'Grammar colours'**
  String get stGrammar;

  /// No description provided for @subjectMaths.
  ///
  /// In en, this message translates to:
  /// **'Maths'**
  String get subjectMaths;

  /// No description provided for @subjectPhysics.
  ///
  /// In en, this message translates to:
  /// **'Physics'**
  String get subjectPhysics;

  /// No description provided for @subjectChemistry.
  ///
  /// In en, this message translates to:
  /// **'Chemistry'**
  String get subjectChemistry;

  /// No description provided for @subjectBiology.
  ///
  /// In en, this message translates to:
  /// **'Biology'**
  String get subjectBiology;

  /// No description provided for @subjectScience.
  ///
  /// In en, this message translates to:
  /// **'Science'**
  String get subjectScience;

  /// No description provided for @subjectEvs.
  ///
  /// In en, this message translates to:
  /// **'EVS'**
  String get subjectEvs;

  /// No description provided for @subjectGeography.
  ///
  /// In en, this message translates to:
  /// **'Geography'**
  String get subjectGeography;

  /// No description provided for @subjectHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get subjectHistory;

  /// No description provided for @subjectCivics.
  ///
  /// In en, this message translates to:
  /// **'Civics'**
  String get subjectCivics;

  /// No description provided for @subjectCommerce.
  ///
  /// In en, this message translates to:
  /// **'Commerce'**
  String get subjectCommerce;

  /// No description provided for @subjectEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get subjectEnglish;

  /// No description provided for @subjectLanguages.
  ///
  /// In en, this message translates to:
  /// **'Languages'**
  String get subjectLanguages;

  /// No description provided for @subjectComputer.
  ///
  /// In en, this message translates to:
  /// **'Computer science'**
  String get subjectComputer;

  /// No description provided for @subjectArt.
  ///
  /// In en, this message translates to:
  /// **'Art'**
  String get subjectArt;

  /// No description provided for @subjectGeneral.
  ///
  /// In en, this message translates to:
  /// **'Class'**
  String get subjectGeneral;

  /// No description provided for @toolCompass.
  ///
  /// In en, this message translates to:
  /// **'Compass'**
  String get toolCompass;

  /// No description provided for @toolInsert.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get toolInsert;

  /// No description provided for @toolLaser.
  ///
  /// In en, this message translates to:
  /// **'Laser pointer'**
  String get toolLaser;

  /// No description provided for @toolMove.
  ///
  /// In en, this message translates to:
  /// **'Move the board'**
  String get toolMove;

  /// No description provided for @toolText.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get toolText;

  /// No description provided for @zoomFit.
  ///
  /// In en, this message translates to:
  /// **'Show everything'**
  String get zoomFit;

  /// No description provided for @zoomIn.
  ///
  /// In en, this message translates to:
  /// **'Zoom in'**
  String get zoomIn;

  /// No description provided for @zoomOut.
  ///
  /// In en, this message translates to:
  /// **'Zoom out'**
  String get zoomOut;

  /// No description provided for @zoomReset.
  ///
  /// In en, this message translates to:
  /// **'Back to 100%'**
  String get zoomReset;

  /// The pen that turns rough drawings into clean shapes and handwriting into text and typeset maths.
  ///
  /// In en, this message translates to:
  /// **'AI pen'**
  String get aiPen;

  /// No description provided for @aiPenTitle.
  ///
  /// In en, this message translates to:
  /// **'AI pen: shapes, maths and words from your handwriting'**
  String get aiPenTitle;

  /// No description provided for @aiPenModeAuto.
  ///
  /// In en, this message translates to:
  /// **'After a pause'**
  String get aiPenModeAuto;

  /// No description provided for @aiPenModeAutoHint.
  ///
  /// In en, this message translates to:
  /// **'Write as usual; about a second after you stop, it is converted.'**
  String get aiPenModeAutoHint;

  /// No description provided for @aiPenModeLive.
  ///
  /// In en, this message translates to:
  /// **'Word by word'**
  String get aiPenModeLive;

  /// No description provided for @aiPenModeLiveHint.
  ///
  /// In en, this message translates to:
  /// **'Each word is converted as you start the next one.'**
  String get aiPenModeLiveHint;

  /// No description provided for @aiPenModeTap.
  ///
  /// In en, this message translates to:
  /// **'When I tap Convert'**
  String get aiPenModeTap;

  /// No description provided for @aiPenModeTapHint.
  ///
  /// In en, this message translates to:
  /// **'Ink stays as written until you tap Convert.'**
  String get aiPenModeTapHint;

  /// No description provided for @aiPenConvert.
  ///
  /// In en, this message translates to:
  /// **'Convert'**
  String get aiPenConvert;

  /// No description provided for @aiPenWordsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Words are read in'**
  String get aiPenWordsLanguage;

  /// No description provided for @aiPenTapHint.
  ///
  /// In en, this message translates to:
  /// **'Tap something the AI pen converted to see other readings or get your ink back. Scribble over ink to rub it out.'**
  String get aiPenTapHint;

  /// No description provided for @aiPenSnapShapes.
  ///
  /// In en, this message translates to:
  /// **'Tidy shapes as I draw'**
  String get aiPenSnapShapes;

  /// No description provided for @aiPenSnapShapesHint.
  ///
  /// In en, this message translates to:
  /// **'Rough circles, lines, arrows and polygons drawn with the pen become clean shapes.'**
  String get aiPenSnapShapesHint;

  /// No description provided for @aiPenDidYouMean.
  ///
  /// In en, this message translates to:
  /// **'Did you mean…'**
  String get aiPenDidYouMean;

  /// No description provided for @aiPenTypeIt.
  ///
  /// In en, this message translates to:
  /// **'Or type it'**
  String get aiPenTypeIt;

  /// No description provided for @aiPenItsShape.
  ///
  /// In en, this message translates to:
  /// **'It\'s a shape'**
  String get aiPenItsShape;

  /// No description provided for @aiPenItsWriting.
  ///
  /// In en, this message translates to:
  /// **'It\'s writing'**
  String get aiPenItsWriting;

  /// No description provided for @aiPenBackToInk.
  ///
  /// In en, this message translates to:
  /// **'Back to my ink'**
  String get aiPenBackToInk;

  /// No description provided for @aiPenKeepShape.
  ///
  /// In en, this message translates to:
  /// **'Keep the shape'**
  String get aiPenKeepShape;

  /// No description provided for @aiPenNoShape.
  ///
  /// In en, this message translates to:
  /// **'No clean shape fits that ink.'**
  String get aiPenNoShape;

  /// No description provided for @aiPenReadings.
  ///
  /// In en, this message translates to:
  /// **'Other readings'**
  String get aiPenReadings;

  /// No description provided for @aiPenConvertInk.
  ///
  /// In en, this message translates to:
  /// **'Convert with AI pen'**
  String get aiPenConvertInk;

  /// No description provided for @aiPenWordsStayInk.
  ///
  /// In en, this message translates to:
  /// **'Shapes and maths convert on this board. Words stay as ink: this board has no handwriting reader.'**
  String get aiPenWordsStayInk;

  /// No description provided for @aiPenModelNeeded.
  ///
  /// In en, this message translates to:
  /// **'Words stay as ink until the {language} handwriting model is downloaded (Board settings → AI pen).'**
  String aiPenModelNeeded(String language);

  /// No description provided for @aiPenLanguageUnsupported.
  ///
  /// In en, this message translates to:
  /// **'This board cannot read {language} handwriting. Words stay as ink; shapes and maths still convert.'**
  String aiPenLanguageUnsupported(String language);

  /// No description provided for @aiPenNothingToConvert.
  ///
  /// In en, this message translates to:
  /// **'Nothing to convert: select handwriting or drawings first.'**
  String get aiPenNothingToConvert;

  /// No description provided for @aiPenSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'AI pen'**
  String get aiPenSettingsTitle;

  /// No description provided for @aiPenSettingsHint.
  ///
  /// In en, this message translates to:
  /// **'Handwriting is read on this board: nothing you write leaves it. Shapes and maths work in every language with no download.'**
  String get aiPenSettingsHint;

  /// No description provided for @aiPenEngineMlkit.
  ///
  /// In en, this message translates to:
  /// **'Words are read by Google ML Kit on this panel. Each language\'s model downloads once (about 20 MB); after that it works offline.'**
  String get aiPenEngineMlkit;

  /// No description provided for @aiPenEngineWindows.
  ///
  /// In en, this message translates to:
  /// **'Words are read by the Windows handwriting recogniser. To add a language, add its handwriting in Windows Settings → Time & language.'**
  String get aiPenEngineWindows;

  /// No description provided for @aiPenEngineNone.
  ///
  /// In en, this message translates to:
  /// **'This board has no handwriting reader: words stay as ink.'**
  String get aiPenEngineNone;

  /// No description provided for @aiPenModelReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get aiPenModelReady;

  /// No description provided for @aiPenModelDownload.
  ///
  /// In en, this message translates to:
  /// **'Download'**
  String get aiPenModelDownload;

  /// No description provided for @aiPenModelDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading…'**
  String get aiPenModelDownloading;

  /// No description provided for @aiPenModelUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Not available on this board'**
  String get aiPenModelUnsupported;

  /// No description provided for @aiPenDownloadFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not download the handwriting model. Connect to the internet once and try again.'**
  String get aiPenDownloadFailed;

  /// No description provided for @aiOfflineLabel.
  ///
  /// In en, this message translates to:
  /// **'Offline sample — from the board\'s own notes (in English), because KINETIX AI cannot be reached'**
  String get aiOfflineLabel;

  /// No description provided for @profilesTitle.
  ///
  /// In en, this message translates to:
  /// **'Who is teaching?'**
  String get profilesTitle;

  /// No description provided for @profilesHint.
  ///
  /// In en, this message translates to:
  /// **'Teachers who have signed in on this board. Tap your name and enter your PIN.'**
  String get profilesHint;

  /// No description provided for @profilesSignInFull.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the Teacher app'**
  String get profilesSignInFull;

  /// No description provided for @profilesLocked.
  ///
  /// In en, this message translates to:
  /// **'Locked'**
  String get profilesLocked;

  /// No description provided for @profilesNoPin.
  ///
  /// In en, this message translates to:
  /// **'No PIN yet'**
  String get profilesNoPin;

  /// No description provided for @pinEnterFor.
  ///
  /// In en, this message translates to:
  /// **'Enter {name}\'s PIN'**
  String pinEnterFor(String name);

  /// No description provided for @pinWrong.
  ///
  /// In en, this message translates to:
  /// **'Wrong PIN. Tries left: {n}'**
  String pinWrong(int n);

  /// No description provided for @pinWrongNoCount.
  ///
  /// In en, this message translates to:
  /// **'Wrong PIN. Try again.'**
  String get pinWrongNoCount;

  /// No description provided for @pinLockedOut.
  ///
  /// In en, this message translates to:
  /// **'Too many wrong PINs. Sign in with the Teacher app, or ask your administrator to reset your PIN.'**
  String get pinLockedOut;

  /// No description provided for @pinNoPin.
  ///
  /// In en, this message translates to:
  /// **'No PIN is set for you on this board. Sign in with the Teacher app, then set a PIN.'**
  String get pinNoPin;

  /// No description provided for @pinNeedsNetwork.
  ///
  /// In en, this message translates to:
  /// **'This board is offline and has no class open for you. Connect to the internet, or sign in with the Teacher app.'**
  String get pinNeedsNetwork;

  /// No description provided for @pinSetTitle.
  ///
  /// In en, this message translates to:
  /// **'Set a PIN for this board'**
  String get pinSetTitle;

  /// No description provided for @pinSetHint.
  ///
  /// In en, this message translates to:
  /// **'4 to 6 digits. Next time, tap your name on this board and enter your PIN instead of using the Teacher app.'**
  String get pinSetHint;

  /// No description provided for @pinConfirm.
  ///
  /// In en, this message translates to:
  /// **'Enter the PIN again'**
  String get pinConfirm;

  /// No description provided for @pinMismatch.
  ///
  /// In en, this message translates to:
  /// **'The two PINs are different. Try again.'**
  String get pinMismatch;

  /// No description provided for @pinWeak.
  ///
  /// In en, this message translates to:
  /// **'Choose a PIN that is harder to guess.'**
  String get pinWeak;

  /// No description provided for @pinSaved.
  ///
  /// In en, this message translates to:
  /// **'PIN saved. Use it to switch to your profile on this board.'**
  String get pinSaved;

  /// No description provided for @pinSetAction.
  ///
  /// In en, this message translates to:
  /// **'Set PIN'**
  String get pinSetAction;

  /// No description provided for @pinChangeAction.
  ///
  /// In en, this message translates to:
  /// **'Change PIN'**
  String get pinChangeAction;

  /// No description provided for @pinBanner.
  ///
  /// In en, this message translates to:
  /// **'Set a PIN to switch to your profile on this board without your phone.'**
  String get pinBanner;

  /// No description provided for @notNow.
  ///
  /// In en, this message translates to:
  /// **'Not now'**
  String get notNow;

  /// No description provided for @lockTitle.
  ///
  /// In en, this message translates to:
  /// **'Board locked'**
  String get lockTitle;

  /// No description provided for @lockHint.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s class is still open. Enter the PIN to carry on.'**
  String lockHint(String name);

  /// No description provided for @switchTeacher.
  ///
  /// In en, this message translates to:
  /// **'Switch teacher'**
  String get switchTeacher;

  /// No description provided for @lockBoard.
  ///
  /// In en, this message translates to:
  /// **'Lock board'**
  String get lockBoard;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// No description provided for @idleLockTitle.
  ///
  /// In en, this message translates to:
  /// **'Lock when idle'**
  String get idleLockTitle;

  /// No description provided for @idleLockHint.
  ///
  /// In en, this message translates to:
  /// **'For teachers with a PIN, the board locks after this many minutes without a touch. It signs out when the period ends.'**
  String get idleLockHint;

  /// No description provided for @idleOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get idleOff;

  /// No description provided for @projectorTitle.
  ///
  /// In en, this message translates to:
  /// **'Projector'**
  String get projectorTitle;

  /// No description provided for @projectorHint.
  ///
  /// In en, this message translates to:
  /// **'Show the board to the class on a second screen (a projector or TV), without your tools and panels. 3D models and labs show beside it.'**
  String get projectorHint;

  /// No description provided for @projectorEnabled.
  ///
  /// In en, this message translates to:
  /// **'Use a second screen'**
  String get projectorEnabled;

  /// No description provided for @projectorAuto.
  ///
  /// In en, this message translates to:
  /// **'Start when a screen is connected'**
  String get projectorAuto;

  /// No description provided for @projectorNone.
  ///
  /// In en, this message translates to:
  /// **'No second screen connected'**
  String get projectorNone;

  /// No description provided for @projectorShowingOn.
  ///
  /// In en, this message translates to:
  /// **'Showing on {name}'**
  String projectorShowingOn(String name);

  /// No description provided for @projectorShow.
  ///
  /// In en, this message translates to:
  /// **'Show on second screen'**
  String get projectorShow;

  /// No description provided for @projectorStop.
  ///
  /// In en, this message translates to:
  /// **'Stop showing'**
  String get projectorStop;

  /// No description provided for @projectorBlank.
  ///
  /// In en, this message translates to:
  /// **'Blank the class screen'**
  String get projectorBlank;

  /// No description provided for @toolAskClass.
  ///
  /// In en, this message translates to:
  /// **'Ask the class'**
  String get toolAskClass;

  /// No description provided for @askClassHint.
  ///
  /// In en, this message translates to:
  /// **'Students answer in the Student App, or hold up their answer card with the answer on top. No phones needed.'**
  String get askClassHint;

  /// No description provided for @askQuestionLabel.
  ///
  /// In en, this message translates to:
  /// **'Question (optional)'**
  String get askQuestionLabel;

  /// No description provided for @askAnswersLabel.
  ///
  /// In en, this message translates to:
  /// **'Answers'**
  String get askAnswersLabel;

  /// No description provided for @askTrueFalse.
  ///
  /// In en, this message translates to:
  /// **'True / False'**
  String get askTrueFalse;

  /// No description provided for @askNumber.
  ///
  /// In en, this message translates to:
  /// **'Number'**
  String get askNumber;

  /// No description provided for @askRightAnswer.
  ///
  /// In en, this message translates to:
  /// **'Right answer (optional)'**
  String get askRightAnswer;

  /// No description provided for @askNumberHint.
  ///
  /// In en, this message translates to:
  /// **'For example 2.5'**
  String get askNumberHint;

  /// No description provided for @askNumberNoCards.
  ///
  /// In en, this message translates to:
  /// **'Number answers come from the Student App only (answer cards show A to D).'**
  String get askNumberNoCards;

  /// No description provided for @askStart.
  ///
  /// In en, this message translates to:
  /// **'Ask'**
  String get askStart;

  /// No description provided for @pollTrue.
  ///
  /// In en, this message translates to:
  /// **'True'**
  String get pollTrue;

  /// No description provided for @pollFalse.
  ///
  /// In en, this message translates to:
  /// **'False'**
  String get pollFalse;

  /// No description provided for @pollDefaultQuestion.
  ///
  /// In en, this message translates to:
  /// **'Class check'**
  String get pollDefaultQuestion;

  /// No description provided for @pollNoCards.
  ///
  /// In en, this message translates to:
  /// **'No answer cards found in the photo. Ask the class to hold them up flat, then try again.'**
  String get pollNoCards;

  /// No description provided for @pollCardsRead.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 card read.} other{{count} cards read.}}'**
  String pollCardsRead(int count);

  /// No description provided for @pollUnknownCards.
  ///
  /// In en, this message translates to:
  /// **'Cards {cards} are not in this class.'**
  String pollUnknownCards(String cards);

  /// No description provided for @pollScanFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not read the photo. Try again.'**
  String get pollScanFailed;

  /// No description provided for @pollAnswered.
  ///
  /// In en, this message translates to:
  /// **'{count} of {total} answered'**
  String pollAnswered(int count, int total);

  /// No description provided for @pollEnded.
  ///
  /// In en, this message translates to:
  /// **'Question ended'**
  String get pollEnded;

  /// No description provided for @pollLiveInApp.
  ///
  /// In en, this message translates to:
  /// **'Live in the Student App'**
  String get pollLiveInApp;

  /// No description provided for @pollNotSaved.
  ///
  /// In en, this message translates to:
  /// **'Answer cards only; not saved (no class is open).'**
  String get pollNotSaved;

  /// No description provided for @pollScanCards.
  ///
  /// In en, this message translates to:
  /// **'Scan answer cards'**
  String get pollScanCards;

  /// No description provided for @pollShowAnswer.
  ///
  /// In en, this message translates to:
  /// **'Show answer'**
  String get pollShowAnswer;

  /// No description provided for @pollEnd.
  ///
  /// In en, this message translates to:
  /// **'End question'**
  String get pollEnd;

  /// No description provided for @pollPutOnBoard.
  ///
  /// In en, this message translates to:
  /// **'Put results on board'**
  String get pollPutOnBoard;

  /// No description provided for @pollNoAnswersYet.
  ///
  /// In en, this message translates to:
  /// **'No answers yet.'**
  String get pollNoAnswersYet;

  /// No description provided for @remoteConnected.
  ///
  /// In en, this message translates to:
  /// **'Phone remote connected.'**
  String get remoteConnected;

  /// No description provided for @remotePhotoFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not show the photo from the phone.'**
  String get remotePhotoFailed;

  /// No description provided for @subjectManagement.
  ///
  /// In en, this message translates to:
  /// **'Management'**
  String get subjectManagement;

  /// No description provided for @subjectLaw.
  ///
  /// In en, this message translates to:
  /// **'Law'**
  String get subjectLaw;

  /// No description provided for @subjectStatistics.
  ///
  /// In en, this message translates to:
  /// **'Statistics'**
  String get subjectStatistics;

  /// No description provided for @kitAccounts.
  ///
  /// In en, this message translates to:
  /// **'Accounts'**
  String get kitAccounts;

  /// No description provided for @kitFinance.
  ///
  /// In en, this message translates to:
  /// **'Calculators'**
  String get kitFinance;

  /// No description provided for @kitManagement.
  ///
  /// In en, this message translates to:
  /// **'Frameworks'**
  String get kitManagement;

  /// No description provided for @kitLaw.
  ///
  /// In en, this message translates to:
  /// **'Law'**
  String get kitLaw;

  /// No description provided for @kitStats.
  ///
  /// In en, this message translates to:
  /// **'Statistics'**
  String get kitStats;

  /// No description provided for @stSheet.
  ///
  /// In en, this message translates to:
  /// **'Spreadsheet'**
  String get stSheet;

  /// No description provided for @stReader.
  ///
  /// In en, this message translates to:
  /// **'Act and case reader'**
  String get stReader;

  /// No description provided for @accFormats.
  ///
  /// In en, this message translates to:
  /// **'Formats'**
  String get accFormats;

  /// No description provided for @accJournal.
  ///
  /// In en, this message translates to:
  /// **'Journal'**
  String get accJournal;

  /// No description provided for @accLedger.
  ///
  /// In en, this message translates to:
  /// **'Ledger (T-account)'**
  String get accLedger;

  /// No description provided for @accTrialBalance.
  ///
  /// In en, this message translates to:
  /// **'Trial balance'**
  String get accTrialBalance;

  /// No description provided for @accFinalAccounts.
  ///
  /// In en, this message translates to:
  /// **'Trading and profit & loss account'**
  String get accFinalAccounts;

  /// No description provided for @accBalanceSheet.
  ///
  /// In en, this message translates to:
  /// **'Balance sheet (Schedule III)'**
  String get accBalanceSheet;

  /// No description provided for @accCashBook.
  ///
  /// In en, this message translates to:
  /// **'Cash book'**
  String get accCashBook;

  /// No description provided for @accBrs.
  ///
  /// In en, this message translates to:
  /// **'Bank reconciliation statement'**
  String get accBrs;

  /// No description provided for @accBlankSheet.
  ///
  /// In en, this message translates to:
  /// **'Blank spreadsheet'**
  String get accBlankSheet;

  /// No description provided for @calcDepreciation.
  ///
  /// In en, this message translates to:
  /// **'Depreciation (SLM / WDV)'**
  String get calcDepreciation;

  /// No description provided for @calcRatios.
  ///
  /// In en, this message translates to:
  /// **'Accounting ratios'**
  String get calcRatios;

  /// No description provided for @calcNpv.
  ///
  /// In en, this message translates to:
  /// **'NPV, IRR and payback'**
  String get calcNpv;

  /// No description provided for @calcBreakEven.
  ///
  /// In en, this message translates to:
  /// **'Break-even point'**
  String get calcBreakEven;

  /// No description provided for @calcGst.
  ///
  /// In en, this message translates to:
  /// **'GST (CGST / SGST / IGST)'**
  String get calcGst;

  /// No description provided for @calcInterest.
  ///
  /// In en, this message translates to:
  /// **'Simple and compound interest'**
  String get calcInterest;

  /// No description provided for @calcEmi.
  ///
  /// In en, this message translates to:
  /// **'EMI'**
  String get calcEmi;

  /// No description provided for @calcWorkOut.
  ///
  /// In en, this message translates to:
  /// **'Work it out'**
  String get calcWorkOut;

  /// No description provided for @calcPutOnBoard.
  ///
  /// In en, this message translates to:
  /// **'Put on the board'**
  String get calcPutOnBoard;

  /// No description provided for @calcCheckInputs.
  ///
  /// In en, this message translates to:
  /// **'Check the numbers'**
  String get calcCheckInputs;

  /// No description provided for @calcOpenLab.
  ///
  /// In en, this message translates to:
  /// **'Open the break-even lab'**
  String get calcOpenLab;

  /// No description provided for @methodSlm.
  ///
  /// In en, this message translates to:
  /// **'Straight line'**
  String get methodSlm;

  /// No description provided for @methodWdv.
  ///
  /// In en, this message translates to:
  /// **'Written-down value'**
  String get methodWdv;

  /// No description provided for @interestSimple.
  ///
  /// In en, this message translates to:
  /// **'Simple'**
  String get interestSimple;

  /// No description provided for @interestCompound.
  ///
  /// In en, this message translates to:
  /// **'Compound'**
  String get interestCompound;

  /// No description provided for @fCost.
  ///
  /// In en, this message translates to:
  /// **'Cost (₹)'**
  String get fCost;

  /// No description provided for @fScrap.
  ///
  /// In en, this message translates to:
  /// **'Scrap value (₹)'**
  String get fScrap;

  /// No description provided for @fLife.
  ///
  /// In en, this message translates to:
  /// **'Useful life (years)'**
  String get fLife;

  /// No description provided for @fRate.
  ///
  /// In en, this message translates to:
  /// **'Rate (% a year)'**
  String get fRate;

  /// No description provided for @fYears.
  ///
  /// In en, this message translates to:
  /// **'Years'**
  String get fYears;

  /// No description provided for @fMonths.
  ///
  /// In en, this message translates to:
  /// **'Months'**
  String get fMonths;

  /// No description provided for @fPrincipal.
  ///
  /// In en, this message translates to:
  /// **'Principal (₹)'**
  String get fPrincipal;

  /// No description provided for @fAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount (₹)'**
  String get fAmount;

  /// No description provided for @fGstRate.
  ///
  /// In en, this message translates to:
  /// **'GST rate (%)'**
  String get fGstRate;

  /// No description provided for @fInterState.
  ///
  /// In en, this message translates to:
  /// **'Inter-state supply (IGST)'**
  String get fInterState;

  /// No description provided for @fInclusive.
  ///
  /// In en, this message translates to:
  /// **'Amount includes GST'**
  String get fInclusive;

  /// No description provided for @fOutlay.
  ///
  /// In en, this message translates to:
  /// **'Initial outlay (₹)'**
  String get fOutlay;

  /// No description provided for @fCashFlows.
  ///
  /// In en, this message translates to:
  /// **'Cash inflows, year by year (₹)'**
  String get fCashFlows;

  /// No description provided for @fDiscountRate.
  ///
  /// In en, this message translates to:
  /// **'Cost of capital (%)'**
  String get fDiscountRate;

  /// No description provided for @fFixedCost.
  ///
  /// In en, this message translates to:
  /// **'Fixed cost (₹)'**
  String get fFixedCost;

  /// No description provided for @fVariableCost.
  ///
  /// In en, this message translates to:
  /// **'Variable cost a unit (₹)'**
  String get fVariableCost;

  /// No description provided for @fPrice.
  ///
  /// In en, this message translates to:
  /// **'Selling price a unit (₹)'**
  String get fPrice;

  /// No description provided for @fUnits.
  ///
  /// In en, this message translates to:
  /// **'Units sold'**
  String get fUnits;

  /// No description provided for @fCompounding.
  ///
  /// In en, this message translates to:
  /// **'Times compounded a year'**
  String get fCompounding;

  /// No description provided for @fCurrentAssets.
  ///
  /// In en, this message translates to:
  /// **'Current assets'**
  String get fCurrentAssets;

  /// No description provided for @fCurrentLiabilities.
  ///
  /// In en, this message translates to:
  /// **'Current liabilities'**
  String get fCurrentLiabilities;

  /// No description provided for @fInventory.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get fInventory;

  /// No description provided for @fPrepaid.
  ///
  /// In en, this message translates to:
  /// **'Prepaid expenses'**
  String get fPrepaid;

  /// No description provided for @fDebt.
  ///
  /// In en, this message translates to:
  /// **'Long-term debt'**
  String get fDebt;

  /// No description provided for @fEquity.
  ///
  /// In en, this message translates to:
  /// **'Shareholders’ funds'**
  String get fEquity;

  /// No description provided for @fRevenue.
  ///
  /// In en, this message translates to:
  /// **'Revenue from operations'**
  String get fRevenue;

  /// No description provided for @fGrossProfit.
  ///
  /// In en, this message translates to:
  /// **'Gross profit'**
  String get fGrossProfit;

  /// No description provided for @fNetProfit.
  ///
  /// In en, this message translates to:
  /// **'Net profit'**
  String get fNetProfit;

  /// No description provided for @fCogs.
  ///
  /// In en, this message translates to:
  /// **'Cost of revenue from operations'**
  String get fCogs;

  /// No description provided for @fAvgInventory.
  ///
  /// In en, this message translates to:
  /// **'Average inventory'**
  String get fAvgInventory;

  /// No description provided for @fReceivables.
  ///
  /// In en, this message translates to:
  /// **'Trade receivables'**
  String get fReceivables;

  /// No description provided for @fEbit.
  ///
  /// In en, this message translates to:
  /// **'Profit before interest and tax'**
  String get fEbit;

  /// No description provided for @fInterest.
  ///
  /// In en, this message translates to:
  /// **'Interest'**
  String get fInterest;

  /// No description provided for @fTotalAssets.
  ///
  /// In en, this message translates to:
  /// **'Total assets'**
  String get fTotalAssets;

  /// No description provided for @mgSwot.
  ///
  /// In en, this message translates to:
  /// **'SWOT analysis'**
  String get mgSwot;

  /// No description provided for @mgPestle.
  ///
  /// In en, this message translates to:
  /// **'PESTLE analysis'**
  String get mgPestle;

  /// No description provided for @mgPorter.
  ///
  /// In en, this message translates to:
  /// **'Porter’s five forces'**
  String get mgPorter;

  /// No description provided for @mgBcg.
  ///
  /// In en, this message translates to:
  /// **'BCG matrix'**
  String get mgBcg;

  /// No description provided for @mgAnsoff.
  ///
  /// In en, this message translates to:
  /// **'Ansoff matrix'**
  String get mgAnsoff;

  /// No description provided for @mgValueChain.
  ///
  /// In en, this message translates to:
  /// **'Value chain'**
  String get mgValueChain;

  /// No description provided for @mg7s.
  ///
  /// In en, this message translates to:
  /// **'McKinsey 7S'**
  String get mg7s;

  /// No description provided for @mgMaslow.
  ///
  /// In en, this message translates to:
  /// **'Maslow’s hierarchy of needs'**
  String get mgMaslow;

  /// No description provided for @mg4p.
  ///
  /// In en, this message translates to:
  /// **'Marketing mix (4 Ps)'**
  String get mg4p;

  /// No description provided for @mg7p.
  ///
  /// In en, this message translates to:
  /// **'Marketing mix (7 Ps)'**
  String get mg7p;

  /// No description provided for @mgGantt.
  ///
  /// In en, this message translates to:
  /// **'Gantt chart'**
  String get mgGantt;

  /// No description provided for @mgPert.
  ///
  /// In en, this message translates to:
  /// **'PERT / CPM (critical path)'**
  String get mgPert;

  /// No description provided for @mgDecisionTree.
  ///
  /// In en, this message translates to:
  /// **'Decision tree'**
  String get mgDecisionTree;

  /// No description provided for @mgFishbone.
  ///
  /// In en, this message translates to:
  /// **'Fishbone diagram'**
  String get mgFishbone;

  /// No description provided for @mgMindMap.
  ///
  /// In en, this message translates to:
  /// **'Mind map'**
  String get mgMindMap;

  /// No description provided for @mgCaseStudy.
  ///
  /// In en, this message translates to:
  /// **'Case study frame'**
  String get mgCaseStudy;

  /// No description provided for @mgStrategy.
  ///
  /// In en, this message translates to:
  /// **'Strategy'**
  String get mgStrategy;

  /// No description provided for @mgMarketing.
  ///
  /// In en, this message translates to:
  /// **'Marketing and people'**
  String get mgMarketing;

  /// No description provided for @mgProjects.
  ///
  /// In en, this message translates to:
  /// **'Projects and decisions'**
  String get mgProjects;

  /// No description provided for @pertActivities.
  ///
  /// In en, this message translates to:
  /// **'Activities'**
  String get pertActivities;

  /// No description provided for @pertHint.
  ///
  /// In en, this message translates to:
  /// **'One activity a line: its letter, its time (or optimistic, likely, pessimistic), then the activities before it. For example: C 2 A'**
  String get pertHint;

  /// No description provided for @pertInvalid.
  ///
  /// In en, this message translates to:
  /// **'Check the activities: one needs an activity that is not listed, or they go round in a loop.'**
  String get pertInvalid;

  /// No description provided for @lawReader.
  ///
  /// In en, this message translates to:
  /// **'Read an act or a judgment'**
  String get lawReader;

  /// No description provided for @lawPaste.
  ///
  /// In en, this message translates to:
  /// **'Paste text'**
  String get lawPaste;

  /// No description provided for @lawImportPdf.
  ///
  /// In en, this message translates to:
  /// **'Import a PDF'**
  String get lawImportPdf;

  /// No description provided for @lawEditText.
  ///
  /// In en, this message translates to:
  /// **'Edit the text'**
  String get lawEditText;

  /// No description provided for @lawRead.
  ///
  /// In en, this message translates to:
  /// **'Read'**
  String get lawRead;

  /// No description provided for @lawAddNote.
  ///
  /// In en, this message translates to:
  /// **'Add a note'**
  String get lawAddNote;

  /// No description provided for @lawSendToBoard.
  ///
  /// In en, this message translates to:
  /// **'Put highlights on the board'**
  String get lawSendToBoard;

  /// No description provided for @lawSamples.
  ///
  /// In en, this message translates to:
  /// **'Sample sections'**
  String get lawSamples;

  /// No description provided for @lawReaderEmpty.
  ///
  /// In en, this message translates to:
  /// **'Paste the text of an act or a judgment, or import a PDF. Then tap a paragraph to highlight it.'**
  String get lawReaderEmpty;

  /// No description provided for @lawNoText.
  ///
  /// In en, this message translates to:
  /// **'No text found in this PDF. It may be a scanned copy.'**
  String get lawNoText;

  /// No description provided for @lawNothingHighlighted.
  ///
  /// In en, this message translates to:
  /// **'Highlight a paragraph first'**
  String get lawNothingHighlighted;

  /// No description provided for @lawCaseBrief.
  ///
  /// In en, this message translates to:
  /// **'Case brief'**
  String get lawCaseBrief;

  /// No description provided for @lawIrac.
  ///
  /// In en, this message translates to:
  /// **'IRAC frame'**
  String get lawIrac;

  /// No description provided for @lawTimeline.
  ///
  /// In en, this message translates to:
  /// **'Timeline of events'**
  String get lawTimeline;

  /// No description provided for @lawTimelineHint.
  ///
  /// In en, this message translates to:
  /// **'One event a line: the date, then what happened'**
  String get lawTimelineHint;

  /// No description provided for @lawArgumentMap.
  ///
  /// In en, this message translates to:
  /// **'Argument map'**
  String get lawArgumentMap;

  /// No description provided for @lawFrames.
  ///
  /// In en, this message translates to:
  /// **'Frames'**
  String get lawFrames;

  /// No description provided for @stData.
  ///
  /// In en, this message translates to:
  /// **'Data'**
  String get stData;

  /// No description provided for @stDataHint.
  ///
  /// In en, this message translates to:
  /// **'Numbers, separated by spaces, commas or new lines'**
  String get stDataHint;

  /// No description provided for @stDescriptive.
  ///
  /// In en, this message translates to:
  /// **'Descriptive statistics'**
  String get stDescriptive;

  /// No description provided for @stBoxPlot.
  ///
  /// In en, this message translates to:
  /// **'Box plot'**
  String get stBoxPlot;

  /// No description provided for @stHistogram.
  ///
  /// In en, this message translates to:
  /// **'Histogram'**
  String get stHistogram;

  /// No description provided for @stDistributions.
  ///
  /// In en, this message translates to:
  /// **'Probability distributions'**
  String get stDistributions;

  /// No description provided for @stNormal.
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get stNormal;

  /// No description provided for @stBinomial.
  ///
  /// In en, this message translates to:
  /// **'Binomial'**
  String get stBinomial;

  /// No description provided for @stPoisson.
  ///
  /// In en, this message translates to:
  /// **'Poisson'**
  String get stPoisson;

  /// No description provided for @stT.
  ///
  /// In en, this message translates to:
  /// **'t'**
  String get stT;

  /// No description provided for @stChiSquare.
  ///
  /// In en, this message translates to:
  /// **'Chi-square'**
  String get stChiSquare;

  /// No description provided for @stMean.
  ///
  /// In en, this message translates to:
  /// **'Mean (μ)'**
  String get stMean;

  /// No description provided for @stSd.
  ///
  /// In en, this message translates to:
  /// **'Standard deviation (σ)'**
  String get stSd;

  /// No description provided for @stTrials.
  ///
  /// In en, this message translates to:
  /// **'Trials (n)'**
  String get stTrials;

  /// No description provided for @stProbability.
  ///
  /// In en, this message translates to:
  /// **'Probability of success (p)'**
  String get stProbability;

  /// No description provided for @stLambda.
  ///
  /// In en, this message translates to:
  /// **'Mean (λ)'**
  String get stLambda;

  /// No description provided for @stDf.
  ///
  /// In en, this message translates to:
  /// **'Degrees of freedom'**
  String get stDf;

  /// No description provided for @stFrom.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get stFrom;

  /// No description provided for @stTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get stTo;

  /// No description provided for @stRegression.
  ///
  /// In en, this message translates to:
  /// **'Correlation and regression'**
  String get stRegression;

  /// No description provided for @stPairsHint.
  ///
  /// In en, this message translates to:
  /// **'One pair a line: x, y'**
  String get stPairsHint;

  /// No description provided for @stTests.
  ///
  /// In en, this message translates to:
  /// **'Tests of hypotheses'**
  String get stTests;

  /// No description provided for @stZTest.
  ///
  /// In en, this message translates to:
  /// **'z test (one mean)'**
  String get stZTest;

  /// No description provided for @stTTest1.
  ///
  /// In en, this message translates to:
  /// **'t test (one mean)'**
  String get stTTest1;

  /// No description provided for @stTTest2.
  ///
  /// In en, this message translates to:
  /// **'t test (two means)'**
  String get stTTest2;

  /// No description provided for @stChiTest.
  ///
  /// In en, this message translates to:
  /// **'Chi-square test'**
  String get stChiTest;

  /// No description provided for @stAnova.
  ///
  /// In en, this message translates to:
  /// **'One-way ANOVA'**
  String get stAnova;

  /// No description provided for @stSampleMean.
  ///
  /// In en, this message translates to:
  /// **'Sample mean (x̄)'**
  String get stSampleMean;

  /// No description provided for @stSampleSize.
  ///
  /// In en, this message translates to:
  /// **'Sample size (n)'**
  String get stSampleSize;

  /// No description provided for @stMu0.
  ///
  /// In en, this message translates to:
  /// **'Hypothesised mean (μ₀)'**
  String get stMu0;

  /// No description provided for @stAlpha.
  ///
  /// In en, this message translates to:
  /// **'Level of significance (α)'**
  String get stAlpha;

  /// No description provided for @stSample1.
  ///
  /// In en, this message translates to:
  /// **'Sample 1'**
  String get stSample1;

  /// No description provided for @stSample2.
  ///
  /// In en, this message translates to:
  /// **'Sample 2'**
  String get stSample2;

  /// No description provided for @stObservedHint.
  ///
  /// In en, this message translates to:
  /// **'Observed frequencies, one row a line (one row tests goodness of fit)'**
  String get stObservedHint;

  /// No description provided for @stExpectedHint.
  ///
  /// In en, this message translates to:
  /// **'Expected frequencies (leave blank for equal)'**
  String get stExpectedHint;

  /// No description provided for @stGroupsHint.
  ///
  /// In en, this message translates to:
  /// **'One group a line'**
  String get stGroupsHint;

  /// No description provided for @stIndex.
  ///
  /// In en, this message translates to:
  /// **'Index numbers'**
  String get stIndex;

  /// No description provided for @stIndexHint.
  ///
  /// In en, this message translates to:
  /// **'One item a line: p₀, q₀, p₁, q₁'**
  String get stIndexHint;

  /// No description provided for @stMovingAverage.
  ///
  /// In en, this message translates to:
  /// **'Moving average'**
  String get stMovingAverage;

  /// No description provided for @stPeriod.
  ///
  /// In en, this message translates to:
  /// **'Period'**
  String get stPeriod;

  /// No description provided for @stSeriesHint.
  ///
  /// In en, this message translates to:
  /// **'Values in time order'**
  String get stSeriesHint;

  /// No description provided for @stDrawChart.
  ///
  /// In en, this message translates to:
  /// **'Draw the chart too'**
  String get stDrawChart;

  /// No description provided for @sheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Spreadsheet'**
  String get sheetTitle;

  /// No description provided for @sheetCellHint.
  ///
  /// In en, this message translates to:
  /// **'A number, words, or a formula such as =SUM(B2:B6)'**
  String get sheetCellHint;

  /// No description provided for @sheetAddRow.
  ///
  /// In en, this message translates to:
  /// **'Add a row'**
  String get sheetAddRow;

  /// No description provided for @sheetAddColumn.
  ///
  /// In en, this message translates to:
  /// **'Add a column'**
  String get sheetAddColumn;

  /// No description provided for @sheetRemoveRow.
  ///
  /// In en, this message translates to:
  /// **'Remove the last row'**
  String get sheetRemoveRow;

  /// No description provided for @sheetRemoveColumn.
  ///
  /// In en, this message translates to:
  /// **'Remove the last column'**
  String get sheetRemoveColumn;

  /// No description provided for @sheetHeading.
  ///
  /// In en, this message translates to:
  /// **'First row is a heading'**
  String get sheetHeading;

  /// No description provided for @sheetFormat.
  ///
  /// In en, this message translates to:
  /// **'Column format'**
  String get sheetFormat;

  /// No description provided for @fmtGeneral.
  ///
  /// In en, this message translates to:
  /// **'General'**
  String get fmtGeneral;

  /// No description provided for @fmtNumber.
  ///
  /// In en, this message translates to:
  /// **'1,23,456.00'**
  String get fmtNumber;

  /// No description provided for @fmtInr.
  ///
  /// In en, this message translates to:
  /// **'₹ (Indian)'**
  String get fmtInr;

  /// No description provided for @fmtLakh.
  ///
  /// In en, this message translates to:
  /// **'₹ lakh'**
  String get fmtLakh;

  /// No description provided for @fmtCrore.
  ///
  /// In en, this message translates to:
  /// **'₹ crore'**
  String get fmtCrore;

  /// No description provided for @fmtPercent.
  ///
  /// In en, this message translates to:
  /// **'Percent'**
  String get fmtPercent;

  /// No description provided for @sheetChart.
  ///
  /// In en, this message translates to:
  /// **'Chart'**
  String get sheetChart;

  /// No description provided for @chartNone.
  ///
  /// In en, this message translates to:
  /// **'No chart'**
  String get chartNone;

  /// No description provided for @chartBar.
  ///
  /// In en, this message translates to:
  /// **'Bars'**
  String get chartBar;

  /// No description provided for @chartLine.
  ///
  /// In en, this message translates to:
  /// **'Line'**
  String get chartLine;

  /// No description provided for @chartPie.
  ///
  /// In en, this message translates to:
  /// **'Pie'**
  String get chartPie;

  /// No description provided for @sheetLabels.
  ///
  /// In en, this message translates to:
  /// **'Labels (e.g. A2:A6)'**
  String get sheetLabels;

  /// No description provided for @sheetValues.
  ///
  /// In en, this message translates to:
  /// **'Values (e.g. B2:B6)'**
  String get sheetValues;

  /// No description provided for @fingerTapsTitle.
  ///
  /// In en, this message translates to:
  /// **'Finger taps'**
  String get fingerTapsTitle;

  /// No description provided for @fingerTapsHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the board with two fingers to undo, with three fingers to redo.'**
  String get fingerTapsHint;

  /// No description provided for @helpErase3.
  ///
  /// In en, this message translates to:
  /// **'Or tap the board with two fingers to undo; three fingers redo.'**
  String get helpErase3;

  /// No description provided for @toolMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get toolMore;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi', 'kn'].contains(locale.languageCode);

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

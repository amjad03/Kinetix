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
  /// **'{minutes} min'**
  String minutesShort(int minutes);

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

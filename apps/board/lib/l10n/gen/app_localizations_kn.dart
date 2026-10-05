// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Kannada (`kn`).
class AppLocalizationsKn extends AppLocalizations {
  AppLocalizationsKn([String locale = 'kn']) : super(locale);

  @override
  String get appTitle => 'KINETIX Board';

  @override
  String get cancel => 'ರದ್ದುಮಾಡಿ';

  @override
  String get save => 'ಉಳಿಸಿ';

  @override
  String get share => 'ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get close => 'ಮುಚ್ಚಿ';

  @override
  String get done => 'ಆಯಿತು';

  @override
  String get ok => 'ಸರಿ';

  @override
  String get open => 'ತೆರೆಯಿರಿ';

  @override
  String get discard => 'ತೆಗೆದುಹಾಕಿ';

  @override
  String get keep => 'ಇರಿಸಿ';

  @override
  String get tryAgain => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get retry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get back => 'ಹಿಂದಕ್ಕೆ';

  @override
  String get clear => 'ತೆರವುಗೊಳಿಸಿ';

  @override
  String get regenerate => 'ಮತ್ತೆ ರಚಿಸಿ';

  @override
  String get titleLabel => 'ಶೀರ್ಷಿಕೆ';

  @override
  String get topicLabel => 'ವಿಷಯ';

  @override
  String get soon => 'ಶೀಘ್ರ';

  @override
  String comingSoonFeature(String feature) {
    return '$feature ಮುಂದಿನ ಅಪ್‌ಡೇಟ್‌ನಲ್ಲಿ ಬರಲಿದೆ.';
  }

  @override
  String get guest => 'ಅತಿಥಿ';

  @override
  String get practiceBoard => 'ಅಭ್ಯಾಸ ಬೋರ್ಡ್';

  @override
  String get noClassTimetabled => 'ಈಗ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಯಾವ ತರಗತಿಯೂ ಇಲ್ಲ';

  @override
  String goesTo(String section) {
    return '$section ತರಗತಿಗೆ ಹೋಗುತ್ತದೆ';
  }

  @override
  String minutesShort(int minutes) {
    return '$minutes ನಿಮಿಷ';
  }

  @override
  String get today => 'ಇಂದು';

  @override
  String get tomorrow => 'ನಾಳೆ';

  @override
  String requestFailed(int status) {
    return 'ವಿನಂತಿ ವಿಫಲವಾಗಿದೆ ($status)';
  }

  @override
  String get cloudUnreachable => 'KINETIX Cloud ಸಂಪರ್ಕಿಸಲು ಆಗಲಿಲ್ಲ';

  @override
  String get toolRecord => 'ರೆಕಾರ್ಡ್';

  @override
  String get toolStop => 'ನಿಲ್ಲಿಸಿ';

  @override
  String get toolTheme => 'ಥೀಮ್';

  @override
  String get toolWrite => 'ಬರೆಯಿರಿ';

  @override
  String get toolErase => 'ಅಳಿಸಿ';

  @override
  String get toolSelect => 'ಆಯ್ಕೆ';

  @override
  String get toolShapes => 'ಆಕಾರಗಳು';

  @override
  String get toolTools => 'ಉಪಕರಣಗಳು';

  @override
  String get toolUndo => 'ಅನ್‌ಡು';

  @override
  String get toolRedo => 'ರೀಡು';

  @override
  String get toolAi => 'AI';

  @override
  String get toolBooks => 'ಪುಸ್ತಕಗಳು';

  @override
  String get toolQuiz => 'ರಸಪ್ರಶ್ನೆ';

  @override
  String get toolHomework => 'ಹೋಂವರ್ಕ್';

  @override
  String get toolSwitch => 'ಬದಲಿಸಿ';

  @override
  String get toolHide => 'ಮರೆಮಾಡಿ';

  @override
  String get toolPrevious => 'ಹಿಂದಿನ';

  @override
  String get toolNext => 'ಮುಂದಿನ';

  @override
  String get toolNewPage => 'ಹೊಸ ಪುಟ';

  @override
  String get showTools => 'ಉಪಕರಣಗಳನ್ನು ತೋರಿಸಿ';

  @override
  String deleteSelection(int count) {
    return '$count ಅಳಿಸಿ';
  }

  @override
  String get guestSignIn => 'ಅತಿಥಿ · ಸೈನ್ ಇನ್';

  @override
  String beingViewed(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ವೀಕ್ಷಿಸಲಾಗುತ್ತಿದೆ · $count',
      one: 'ವೀಕ್ಷಿಸಲಾಗುತ್ತಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String get beingViewedTooltip =>
      'ಶಾಲೆಯ ಮುಖ್ಯಸ್ಥರೊಬ್ಬರು ಈ ತರಗತಿಯನ್ನು ಲೈವ್ ನೋಡುತ್ತಿದ್ದಾರೆ. ವೀಕ್ಷಣೆಯು ಆಡಿಟ್ ಲಾಗ್‌ನಲ್ಲಿ ದಾಖಲಾಗುತ್ತದೆ.';

  @override
  String get goLive => 'ಲೈವ್ ಮಾಡಿ';

  @override
  String get liveWaiting => 'ಲೈವ್ · ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String liveStudents(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ಲೈವ್ · $count ವಿದ್ಯಾರ್ಥಿಗಳು',
      one: 'ಲೈವ್ · 1 ವಿದ್ಯಾರ್ಥಿ',
    );
    return '$_temp0';
  }

  @override
  String get stopLiveTooltip => 'ಲೈವ್ ತರಗತಿ ನಿಲ್ಲಿಸಿ';

  @override
  String get goLiveTooltip =>
      'ಈ ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು Student App‌ನಲ್ಲಿ ಬೋರ್ಡ್ ನೋಡಲು ಬಿಡಿ';

  @override
  String get liveStarted =>
      'ಲೈವ್: ಈ ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು Student App‌ನಲ್ಲಿ ಬೋರ್ಡ್ ನೋಡಬಹುದು. ಅವರು ನಿಮ್ಮನ್ನು ಕೇಳಲು \"ತರಗತಿ ಧ್ವನಿ\" ಆನ್ ಮಾಡಿ.';

  @override
  String get liveEnded => 'ಲೈವ್ ತರಗತಿ ಮುಗಿದಿದೆ.';

  @override
  String get classAudio => 'ತರಗತಿ ಧ್ವನಿ';

  @override
  String get classAudioOn => 'ತರಗತಿ ಧ್ವನಿ ಆನ್';

  @override
  String get classAudioTurnOnTooltip =>
      'ಲೈವ್ ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ಬೋರ್ಡ್‌ನ ಮೈಕ್ರೋಫೋನ್ ಮೂಲಕ ನಿಮ್ಮನ್ನು ಕೇಳಲಿ';

  @override
  String get classAudioTurnOffTooltip => 'ತರಗತಿ ಧ್ವನಿಯನ್ನು ಆಫ್ ಮಾಡಿ';

  @override
  String get micOn => 'ಮೈಕ್ ಆನ್';

  @override
  String get micOnTooltip =>
      'ಬೋರ್ಡ್‌ನ ಮೈಕ್ರೋಫೋನ್ ಆನ್ ಆಗಿದೆ: ಲೈವ್ ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ತರಗತಿಯನ್ನು ಕೇಳಬಹುದು';

  @override
  String get classAudioStarted =>
      'ತರಗತಿ ಧ್ವನಿ ಆನ್ ಆಗಿದೆ. ಲೈವ್ ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ನಿಮ್ಮನ್ನು ಕೇಳಬಹುದು; ಅವರು ಕೇಳುತ್ತಿರುವಾಗ \"ಮೈಕ್ ಆನ್\" ತೋರಿಸುತ್ತದೆ.';

  @override
  String get classAudioStopped => 'ತರಗತಿ ಧ್ವನಿ ಆಫ್ ಆಗಿದೆ.';

  @override
  String classAudioUnavailable(String reason) {
    return 'ತರಗತಿ ಧ್ವನಿ ಲಭ್ಯವಿಲ್ಲ: $reason';
  }

  @override
  String get cloudUnreachableCheckOnline =>
      'KINETIX Cloud ಸಂಪರ್ಕಿಸಲು ಆಗಲಿಲ್ಲ. ಬೋರ್ಡ್ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿದೆಯೇ ಎಂದು ನೋಡಿ.';

  @override
  String get noClassList => 'ತರಗತಿ ಪಟ್ಟಿ ಇಲ್ಲ';

  @override
  String takeAttendance(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿದ್ಯಾರ್ಥಿಗಳು · ಹಾಜರಾತಿ ತೆಗೆದುಕೊಳ್ಳಿ',
      one: '1 ವಿದ್ಯಾರ್ಥಿ · ಹಾಜರಾತಿ ತೆಗೆದುಕೊಳ್ಳಿ',
    );
    return '$_temp0';
  }

  @override
  String presentOfTotal(int present, int total) {
    return '$present/$total ಹಾಜರು';
  }

  @override
  String pendingSync(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಬದಲಾವಣೆಗಳು ಸಿಂಕ್ ಆಗಲು ಬಾಕಿ ಇವೆ',
      one: '1 ಬದಲಾವಣೆ ಸಿಂಕ್ ಆಗಲು ಬಾಕಿ ಇದೆ',
    );
    return '$_temp0';
  }

  @override
  String get connectedCloud => 'KINETIX Cloud‌ಗೆ ಸಂಪರ್ಕಗೊಂಡಿದೆ';

  @override
  String get offlineSaved =>
      'ಆಫ್‌ಲೈನ್. ಎಲ್ಲವನ್ನೂ ಉಳಿಸಲಾಗಿದೆ, ನಂತರ ಸಿಂಕ್ ಆಗುತ್ತದೆ.';

  @override
  String get endClass => 'ತರಗತಿ ಮುಗಿಸಿ';

  @override
  String get signedOutGuest => 'ಸೈನ್ ಔಟ್ ಆಗಿದೆ. ಬೋರ್ಡ್ ಈಗ ಅತಿಥಿ ಮೋಡ್‌ನಲ್ಲಿದೆ.';

  @override
  String welcomeTeacher(String name) {
    return 'ಸ್ವಾಗತ, $name.';
  }

  @override
  String get signInUnregistered => 'ನೋಂದಾಯಿಸದ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸೈನ್ ಇನ್';

  @override
  String get recordNeedsSignIn =>
      'ಪಾಠಗಳನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ. ಮೊದಲು ಶಿಕ್ಷಕರು ಈ ಬೋರ್ಡ್‌ಗೆ ಸಂಪರ್ಕಿಸಬೇಕು.';

  @override
  String get recordingStarted => 'ಬೋರ್ಡ್ ಮತ್ತು ನಿಮ್ಮ ಧ್ವನಿ ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದೆ.';

  @override
  String recordingNoSound(String reason) {
    return 'ಧ್ವನಿ ಇಲ್ಲದೆ ಬೋರ್ಡ್ ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದೆ: $reason';
  }

  @override
  String get voiceNoMicrophone => 'ಯಾವುದೇ ಮೈಕ್ರೋಫೋನ್ ಕಂಡುಬಂದಿಲ್ಲ';

  @override
  String get voicePermissionDenied => 'ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿ ನೀಡಲಾಗಿಲ್ಲ';

  @override
  String get voiceUnsupported => 'ಈ ಬೋರ್ಡ್ ಧ್ವನಿ ರೆಕಾರ್ಡ್ ಮಾಡಲಾರದು';

  @override
  String get voiceNotStarted => 'ಮೈಕ್ರೋಫೋನ್ ಆರಂಭಿಸಲು ಆಗಲಿಲ್ಲ';

  @override
  String couldNotStartRecording(String error) {
    return 'ರೆಕಾರ್ಡಿಂಗ್ ಆರಂಭಿಸಲು ಆಗಲಿಲ್ಲ: $error';
  }

  @override
  String get recordingDiscarded => 'ರೆಕಾರ್ಡಿಂಗ್ ತೆಗೆದುಹಾಕಲಾಗಿದೆ.';

  @override
  String get recordingSavedUploading =>
      'ರೆಕಾರ್ಡಿಂಗ್ ಉಳಿಸಲಾಗಿದೆ. ಇದು KINETIX Cloud‌ಗೆ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ.';

  @override
  String recordingSavedLater(String name) {
    return 'ರೆಕಾರ್ಡಿಂಗ್ ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ. $name ಮುಂದಿನ ಬಾರಿ ಸೈನ್ ಇನ್ ಮಾಡಿದಾಗ ಇದು ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತದೆ.';
  }

  @override
  String couldNotSaveRecording(String error) {
    return 'ರೆಕಾರ್ಡಿಂಗ್ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ: $error';
  }

  @override
  String get saveNeedsSignIn =>
      'ಬೋರ್ಡ್‌ಗಳನ್ನು ಕ್ಲೌಡ್‌ನಲ್ಲಿ ಉಳಿಸಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get nothingToSave => 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಉಳಿಸಲು ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.';

  @override
  String savedAndShared(String section) {
    return 'ಉಳಿಸಲಾಗಿದೆ ಮತ್ತು $section ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ.';
  }

  @override
  String get savedToWhiteboards =>
      '\"ನಿಮ್ಮ ವೈಟ್‌ಬೋರ್ಡ್‌ಗಳು\" ಇಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.';

  @override
  String couldNotSaveBoard(String error) {
    return 'ಬೋರ್ಡ್ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ: $error';
  }

  @override
  String get whiteboardsNeedSignIn =>
      'ನೀವು ಉಳಿಸಿದ ಬೋರ್ಡ್‌ಗಳನ್ನು ನೋಡಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get replaceBoardTitle => 'ಬೋರ್ಡ್ ಬದಲಿಸಬೇಕೇ?';

  @override
  String get replaceBoardBody =>
      'ಮೊದಲು ಉಳಿಸದಿದ್ದರೆ ಈಗ ಬೋರ್ಡ್‌ನಲ್ಲಿರುವುದು ಕಳೆದುಹೋಗುತ್ತದೆ.';

  @override
  String openedBoard(String title) {
    return '\"$title\" ತೆರೆಯಲಾಗಿದೆ. ಮತ್ತೆ ಉಳಿಸಿದರೆ ಅದೇ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ.';
  }

  @override
  String couldNotOpenBoard(String error) {
    return 'ಬೋರ್ಡ್ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ: $error';
  }

  @override
  String get endClassTitle => 'ತರಗತಿ ಮುಗಿಸಬೇಕೇ?';

  @override
  String get endClassBody =>
      'ನೀವು ಈ ಬೋರ್ಡ್‌ನಿಂದ ಸೈನ್ ಔಟ್ ಆಗುತ್ತೀರಿ. ತರಗತಿಯಲ್ಲಿ ದಾಖಲಿಸಿದ ಹಾಜರಾತಿ ಮತ್ತು ಉತ್ತರಗಳು ಉಳಿಯುತ್ತವೆ.';

  @override
  String get endClassRecordingNote =>
      'ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲುತ್ತದೆ, ಮತ್ತು ನೀವು ಮೊದಲು ಅದನ್ನು ಉಳಿಸಿ ಹಂಚಿಕೊಳ್ಳಬಹುದು.';

  @override
  String get saveThisBoard => 'ಈ ಬೋರ್ಡ್ ಉಳಿಸಿ';

  @override
  String get shareWithStudentsParents =>
      'ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get keepTeaching => 'ಪಾಠ ಮುಂದುವರಿಸಿ';

  @override
  String get uploadingBeforeSignOut =>
      'ಸೈನ್ ಔಟ್ ಮಾಡುವ ಮೊದಲು ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ…';

  @override
  String signedOutRecordingPending(String name) {
    return 'ಸೈನ್ ಔಟ್ ಆಗಿದೆ. ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಉಳಿದಿದೆ, $name ಮುಂದಿನ ಬಾರಿ ಸೈನ್ ಇನ್ ಮಾಡಿದಾಗ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತದೆ.';
  }

  @override
  String get attendanceWithoutClass => 'ವೇಳಾಪಟ್ಟಿ ಇಲ್ಲದ ತರಗತಿಯಲ್ಲಿ ಹಾಜರಾತಿ';

  @override
  String get defaultBoardName => 'ಬೋರ್ಡ್';

  @override
  String get defaultLessonName => 'ಪಾಠ';

  @override
  String get toolTimer => 'ಟೈಮರ್';

  @override
  String get toolRandomPick => 'ರ್ಯಾಂಡಮ್ ಆಯ್ಕೆ';

  @override
  String get toolAttendance => 'ಹಾಜರಾತಿ';

  @override
  String get toolSplitScreen => 'ಸ್ಪ್ಲಿಟ್ ಸ್ಕ್ರೀನ್';

  @override
  String get toolEyeComfort => 'ಕಣ್ಣಿನ ಆರಾಮ';

  @override
  String get toolRuler => 'ಸ್ಕೇಲ್';

  @override
  String get toolProtractor => 'ಕೋನಮಾಪಕ';

  @override
  String get toolCalculator => 'ಕ್ಯಾಲ್ಕುಲೇಟರ್';

  @override
  String get toolSpotlight => 'ಸ್ಪಾಟ್‌ಲೈಟ್';

  @override
  String get toolScreenShade => 'ಸ್ಕ್ರೀನ್ ಶೇಡ್';

  @override
  String get toolScreenshot => 'ಸ್ಕ್ರೀನ್‌ಶಾಟ್';

  @override
  String get toolTouchLock => 'ಟಚ್ ಲಾಕ್';

  @override
  String get pen => 'ಪೆನ್';

  @override
  String get highlighter => 'ಹೈಲೈಟರ್';

  @override
  String get colour => 'ಬಣ್ಣ';

  @override
  String get thickness => 'ದಪ್ಪ';

  @override
  String get eraserSize => 'ಎರೇಸರ್ ಗಾತ್ರ';

  @override
  String get sizeSmall => 'ಸಣ್ಣ';

  @override
  String get sizeMedium => 'ಮಧ್ಯಮ';

  @override
  String get sizeLarge => 'ದೊಡ್ಡ';

  @override
  String get eraseTip =>
      'ಸಲಹೆ: ಇಂಟರಾಕ್ಟಿವ್ ಪ್ಯಾನಲ್‌ನಲ್ಲಿ ಅಳಿಸಲು ಅಂಗೈಯಿಂದ ಉಜ್ಜಿ.';

  @override
  String get clearPage => 'ಪುಟ ತೆರವುಗೊಳಿಸಿ';

  @override
  String get boardTheme => 'ಬೋರ್ಡ್ ಥೀಮ್';

  @override
  String get bgPlain => 'ಸರಳ';

  @override
  String get bgRuled => 'ಗೆರೆಗಳು';

  @override
  String get bgGrid => 'ಗ್ರಿಡ್ (1 cm)';

  @override
  String get bgDots => 'ಚುಕ್ಕೆಗಳು';

  @override
  String get bgChalkboard => 'ಕಪ್ಪು ಹಲಗೆ';

  @override
  String get shapes3dSoon =>
      'ತಿರುಗಿಸಬಹುದಾದ 3D ಘನಾಕೃತಿಗಳು (ಘನ, ಸಿಲಿಂಡರ್, ಶಂಕು, ಗೋಳ) ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ.';

  @override
  String get shapeLine => 'ರೇಖೆ';

  @override
  String get shapeArrow => 'ಬಾಣ';

  @override
  String get shapeDoubleArrow => 'ಎರಡು ತುದಿಯ ಬಾಣ';

  @override
  String get shapeCircle => 'ವೃತ್ತ';

  @override
  String get shapeEllipse => 'ದೀರ್ಘವೃತ್ತ';

  @override
  String get shapeTriangle => 'ತ್ರಿಭುಜ';

  @override
  String get shapeRightTriangle => 'ಲಂಬಕೋನ ತ್ರಿಭುಜ';

  @override
  String get shapeRectangle => 'ಆಯತ';

  @override
  String get shapeParallelogram => 'ಸಮಾಂತರ ಚತುರ್ಭುಜ';

  @override
  String get shapeTrapezium => 'ತ್ರಾಪಿಜ್ಯ';

  @override
  String get shapeRhombus => 'ವಜ್ರಾಕೃತಿ';

  @override
  String get shapePentagon => 'ಪಂಚಭುಜ';

  @override
  String get shapeHexagon => 'ಷಡ್ಭುಜ';

  @override
  String get showLengths => 'ಉದ್ದಗಳನ್ನು ತೋರಿಸಿ';

  @override
  String get showLengthsHint => 'ಬಾಹುಗಳು cm ನಲ್ಲಿ, 1 cm ಗ್ರಿಡ್‌ಗೆ ಹೊಂದುವಂತೆ';

  @override
  String get showAngles => 'ಕೋನಗಳನ್ನು ತೋರಿಸಿ';

  @override
  String get eyeProtection => 'ಕಣ್ಣಿನ ರಕ್ಷಣೆ';

  @override
  String get eyeProtectionHint =>
      'ಬೆಚ್ಚಗಿನ ಬಣ್ಣಗಳು, ಕಡಿಮೆ ನೀಲಿ ಬೆಳಕು, ಸ್ವಲ್ಪ ಮಂದ ಹೊಳಪು';

  @override
  String get adjustSchoolDay => 'ಶಾಲಾ ದಿನದ ಸಮಯಕ್ಕೆ ತಕ್ಕಂತೆ ಹೊಂದಿಸಿ';

  @override
  String get warmth => 'ಬೆಚ್ಚನೆ';

  @override
  String get dimming => 'ಮಂದತೆ';

  @override
  String get highContrast => 'ಹೆಚ್ಚು ಕಾಂಟ್ರಾಸ್ಟ್';

  @override
  String get highContrastHint => 'ಮಸುಕಾದ ಪ್ರೊಜೆಕ್ಟರ್‌ಗಳಿಗೆ';

  @override
  String get chalkboardHint => 'ಗಾಢ ಬೋರ್ಡ್, ಕಡಿಮೆ ಪ್ರಖರತೆ';

  @override
  String get dragToResize => 'ಗಾತ್ರ ಬದಲಿಸಲು ಎಳೆಯಿರಿ';

  @override
  String get moveToOtherSide => 'ಇನ್ನೊಂದು ಬದಿಗೆ ಸರಿಸಿ';

  @override
  String get splitWhiteboard => 'ವೈಟ್‌ಬೋರ್ಡ್';

  @override
  String get splitDocument => 'PDF / PPT';

  @override
  String get splitVideo => 'ವೀಡಿಯೊ';

  @override
  String get splitWeb => 'ವೆಬ್ ಪುಟ';

  @override
  String get splitModel3d => '3D ಮಾದರಿ';

  @override
  String get splitLab => 'ವರ್ಚುವಲ್ ಲ್ಯಾಬ್';

  @override
  String viewerComingSoon(String viewer) {
    return '$viewer ವೀಕ್ಷಕ ಮುಂದಿನ ಅಪ್‌ಡೇಟ್‌ನಲ್ಲಿ ಬರಲಿದೆ.';
  }

  @override
  String get splitChoose => 'ವೈಟ್‌ಬೋರ್ಡ್ ಪಕ್ಕದಲ್ಲಿ ಏನು ತೋರಿಸಬೇಕೆಂದು ಆಯ್ಕೆಮಾಡಿ.';

  @override
  String get chooseSomethingElse => 'ಬೇರೆ ಏನಾದರೂ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get signInWithTeacherApp => 'Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್';

  @override
  String get importFiles => 'PDF, PPT ಅಥವಾ ಚಿತ್ರ ಆಮದು ಮಾಡಿ';

  @override
  String get yourWhiteboards => 'ನಿಮ್ಮ ವೈಟ್‌ಬೋರ್ಡ್‌ಗಳು';

  @override
  String get recordings => 'ರೆಕಾರ್ಡಿಂಗ್‌ಗಳು';

  @override
  String recordingsToUpload(int count) {
    return '$count ಅಪ್‌ಲೋಡ್ ಬಾಕಿ';
  }

  @override
  String get screenProjection => 'ಸ್ಕ್ರೀನ್ ಪ್ರೊಜೆಕ್ಷನ್';

  @override
  String get boardSettings => 'ಬೋರ್ಡ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು';

  @override
  String get guidedTour => 'ಮಾರ್ಗದರ್ಶಿ ಪರಿಚಯ ಮತ್ತು ಅಭ್ಯಾಸ';

  @override
  String get language => 'ಭಾಷೆ';

  @override
  String get languageHint =>
      'ಈ ಬೋರ್ಡ್‌ನ ಬಟನ್‌ಗಳು ಮತ್ತು ಸಂದೇಶಗಳ ಭಾಷೆ. ಸೈನ್ ಇನ್ ಮಾಡುವ ಶಿಕ್ಷಕರಿಗೆ ಸೈನ್ ಔಟ್ ಆಗುವವರೆಗೆ ಬೋರ್ಡ್ ಅವರ ಸ್ವಂತ ಭಾಷೆಯಲ್ಲಿ ಕಾಣುತ್ತದೆ.';

  @override
  String get touchScreen => 'ಟಚ್ ಸ್ಕ್ರೀನ್';

  @override
  String get touchScreenHint =>
      'ಈ ಬೋರ್ಡ್ ಯಾವ ಹಾರ್ಡ್‌ವೇರ್‌ನಲ್ಲಿ ಚಲಿಸುತ್ತದೆ ಎಂದು ಆಯ್ಕೆಮಾಡಿ. ಅಂಗೈ ಅಥವಾ ದೊಡ್ಡ ಸ್ಪರ್ಶ ಏನು ಮಾಡುತ್ತದೆ ಎಂಬುದನ್ನು ಇದು ನಿರ್ಧರಿಸುತ್ತದೆ.';

  @override
  String get touchTablet => 'ಟ್ಯಾಬ್ಲೆಟ್';

  @override
  String get touchTabletHint => 'ಪರದೆಯ ಮೇಲೆ ಇಟ್ಟ ಕೈಯನ್ನು ಪರಿಗಣಿಸುವುದಿಲ್ಲ';

  @override
  String get touchPanel => 'ಇಂಟರಾಕ್ಟಿವ್ ಪ್ಯಾನಲ್';

  @override
  String get touchPanelHint => 'ಅಂಗೈ ಅಥವಾ ಮುಷ್ಟಿ ಡಸ್ಟರ್‌ನಂತೆ ಅಳಿಸುತ್ತದೆ';

  @override
  String get touchIrFrame => 'IR ಟಚ್ ಫ್ರೇಮ್';

  @override
  String get touchIrFrameHint =>
      'ಪ್ರತಿ ಸ್ಪರ್ಶವೂ ಬರೆಯುತ್ತದೆ. IR ಫ್ರೇಮ್‌ಗಳು ಅಂಗೈ ಮತ್ತು ಬೆರಳಿನ ವ್ಯತ್ಯಾಸ ಗುರುತಿಸಲಾರವು';

  @override
  String get timesUp => 'ಸಮಯ ಮುಗಿಯಿತು';

  @override
  String get closeTimer => 'ಟೈಮರ್ ಮುಚ್ಚಿ';

  @override
  String get reset => 'ಮರುಹೊಂದಿಸಿ';

  @override
  String get pause => 'ವಿರಾಮ';

  @override
  String get restart => 'ಮತ್ತೆ ಆರಂಭಿಸಿ';

  @override
  String get start => 'ಆರಂಭಿಸಿ';

  @override
  String get randomPickNoClass =>
      'ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳಿಂದ ಆಯ್ಕೆ ಮಾಡಲು, ವೇಳಾಪಟ್ಟಿಯ ತರಗತಿಯ ಸಮಯದಲ್ಲಿ Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String rollNo(String rollNo) {
    return 'ರೋಲ್ ನಂ. $rollNo';
  }

  @override
  String answerSavedTo(String outcome, String name) {
    return '$outcome · $name ಅವರ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ';
  }

  @override
  String get answerCorrect => 'ಸರಿ';

  @override
  String get answerPartlyCorrect => 'ಭಾಗಶಃ ಸರಿ';

  @override
  String get answerPartly => 'ಭಾಗಶಃ';

  @override
  String get answerNotCorrect => 'ಸರಿಯಲ್ಲ';

  @override
  String get answerSkipped => 'ಬಿಡಲಾಗಿದೆ';

  @override
  String get answerSkip => 'ಬಿಡಿ';

  @override
  String get pickAgain => 'ಮತ್ತೆ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String attendanceSummary(int present, int absent, int late) {
    return '$present ಹಾಜರು · $absent ಗೈರು · $late ತಡ   —   ಬದಲಿಸಲು ವಿದ್ಯಾರ್ಥಿಯ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ';
  }

  @override
  String get present => 'ಹಾಜರು';

  @override
  String get absent => 'ಗೈರು';

  @override
  String get late => 'ತಡ';

  @override
  String get saveAttendance => 'ಹಾಜರಾತಿ ಉಳಿಸಿ';

  @override
  String get saveBoard => 'ಬೋರ್ಡ್ ಉಳಿಸಿ';

  @override
  String get shareWithClass => 'ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get shareNeedsClass => 'ವೇಳಾಪಟ್ಟಿಯ ತರಗತಿಯಲ್ಲಿ ಬೋರ್ಡ್ ಬಳಸಿದಾಗ ಲಭ್ಯ';

  @override
  String shareBoardHint(String section) {
    return '$section ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರು ಇದನ್ನು ತಮ್ಮ ಆ್ಯಪ್‌ಗಳಲ್ಲಿ ತೆರೆಯಬಹುದು';
  }

  @override
  String couldNotLoadBoards(String error) {
    return 'ನಿಮ್ಮ ಬೋರ್ಡ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ.\n$error';
  }

  @override
  String get noBoardsYet =>
      'ನೀವು ಉಳಿಸುವ ಬೋರ್ಡ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ. \"ಉಳಿಸಿ\" ಬಳಸಿ, ಅಥವಾ ತರಗತಿ ಮುಗಿಸುವಾಗ ಉಳಿಸಿ.';

  @override
  String pageCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪುಟಗಳು',
      one: '1 ಪುಟ',
    );
    return '$_temp0';
  }

  @override
  String get shared => 'ಹಂಚಲಾಗಿದೆ';

  @override
  String get recPaused => 'ವಿರಾಮದಲ್ಲಿದೆ';

  @override
  String get recLive => 'REC';

  @override
  String get recNoSoundTooltip => 'ಧ್ವನಿ ಇಲ್ಲದೆ ರೆಕಾರ್ಡಿಂಗ್';

  @override
  String get recResume => 'ರೆಕಾರ್ಡಿಂಗ್ ಮುಂದುವರಿಸಿ';

  @override
  String get recPause => 'ರೆಕಾರ್ಡಿಂಗ್‌ಗೆ ವಿರಾಮ';

  @override
  String get recStop => 'ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ';

  @override
  String get recDiscardTitle => 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ತೆಗೆದುಹಾಕಬೇಕೇ?';

  @override
  String recDiscardBody(String duration) {
    return 'ಪಾಠದ $duration ಭಾಗ ಬೋರ್ಡ್‌ನಿಂದ ಅಳಿಸಲಾಗುತ್ತದೆ.';
  }

  @override
  String get recSaveTitle => 'ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಉಳಿಸಿ';

  @override
  String get recBoardAndVoice => 'ಬೋರ್ಡ್ ಮತ್ತು ಧ್ವನಿ';

  @override
  String get recBoardOnly => 'ಬೋರ್ಡ್ ಮಾತ್ರ, ಧ್ವನಿ ಇಲ್ಲ';

  @override
  String recShareHint(String section) {
    return 'ಅಪ್‌ಲೋಡ್ ಆದ ನಂತರ $section ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರು ಇದನ್ನು ನೋಡಬಹುದು';
  }

  @override
  String get recUploadNote =>
      'ಇದು ಹಿನ್ನೆಲೆಯಲ್ಲಿ KINETIX Cloud‌ಗೆ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತದೆ. ಗೈರು ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಇದರ ಬಗ್ಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ.';

  @override
  String sharedWith(String section) {
    return '$section ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ.';
  }

  @override
  String get theClass => 'ತರಗತಿ';

  @override
  String couldNotShare(String error) {
    return 'ಹಂಚಿಕೊಳ್ಳಲು ಆಗಲಿಲ್ಲ: $error';
  }

  @override
  String couldNotLoadRecordings(String error) {
    return 'ನಿಮ್ಮ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ.\n$error';
  }

  @override
  String get noRecordingsYet =>
      'ನೀವು ರೆಕಾರ್ಡ್ ಮಾಡಿದ ಪಾಠಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ. ಆರಂಭಿಸಲು ಟೂಲ್‌ಬಾರ್‌ನಲ್ಲಿ \"ರೆಕಾರ್ಡ್\" ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String get recNoSound => 'ಧ್ವನಿ ಇಲ್ಲ';

  @override
  String get recWaiting => 'ಅಪ್‌ಲೋಡ್‌ಗೆ ಕಾಯುತ್ತಿದೆ';

  @override
  String recUploadsWhen(String name) {
    return '$name ಸೈನ್ ಇನ್ ಮಾಡಿದಾಗ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತದೆ';
  }

  @override
  String recUploading(int percent) {
    return 'ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ $percent%';
  }

  @override
  String get recUploaded => 'ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ';

  @override
  String get recUploadFailed => 'ಅಪ್‌ಲೋಡ್ ವಿಫಲವಾಗಿದೆ';

  @override
  String recUploadedLaterClass(String section) {
    return 'ನಂತರದ ತರಗತಿಯಲ್ಲಿ ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ. ಇದು $section ತರಗತಿಗಾಗಿ ಇದ್ದರೆ ಇಲ್ಲಿಂದ ಹಂಚಿಕೊಳ್ಳಿ.';
  }

  @override
  String get thisClass => 'ಈ ತರಗತಿ';

  @override
  String broadcastFrom(String name) {
    return '$name ಅವರಿಂದ';
  }

  @override
  String get acknowledge => 'ಓದಿದೆ';

  @override
  String signInTo(String board) {
    return '$board ಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ';
  }

  @override
  String get thisBoard => 'ಈ ಬೋರ್ಡ್';

  @override
  String get signInUsePhone => 'ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ KINETIX Teacher App ಬಳಸಿ.';

  @override
  String get signInStep1 => 'KINETIX Teacher App ತೆರೆಯಿರಿ';

  @override
  String get signInStep2 => '\"Connect to board\" ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get signInStep3 => 'QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ, ಅಥವಾ ಈ ಕೋಡ್ ಟೈಪ್ ಮಾಡಿ';

  @override
  String newCodeIn(int seconds) {
    return 'ಹೊಸ ಕೋಡ್ $seconds ಸೆಕೆಂಡ್‌ನಲ್ಲಿ';
  }

  @override
  String get cannotReachCloudRetrying =>
      'KINETIX Cloud ಸಂಪರ್ಕ ಆಗುತ್ತಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುತ್ತಿದೆ…';

  @override
  String get signInCodeNote =>
      'ಕೋಡ್ ಪ್ರತಿ 2 ನಿಮಿಷಕ್ಕೆ ಬದಲಾಗುತ್ತದೆ ಮತ್ತು ಒಮ್ಮೆ ಮಾತ್ರ ಕೆಲಸ ಮಾಡುತ್ತದೆ. ಬೋರ್ಡ್‌ನಲ್ಲಿ ಯಾವುದೇ ಪಾಸ್‌ವರ್ಡ್ ಟೈಪ್ ಮಾಡುವುದಿಲ್ಲ.';

  @override
  String get enrollTitle => 'ಈ ಬೋರ್ಡ್ ಸಿದ್ಧಪಡಿಸಿ';

  @override
  String get enrollHint =>
      'KINETIX ERP ನಲ್ಲಿ Devices → Add board ತೆರೆಯಿರಿ, ನಂತರ ಅಲ್ಲಿ ತೋರಿಸಿದ ಕೋಡ್ ಇಲ್ಲಿ ನಮೂದಿಸಿ.';

  @override
  String get enrollCode => 'ನೋಂದಣಿ ಕೋಡ್';

  @override
  String get enrollServer => 'ಸರ್ವರ್';

  @override
  String get enrollRegistering => 'ನೋಂದಾಯಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get enrollRegister => 'ಬೋರ್ಡ್ ನೋಂದಾಯಿಸಿ';

  @override
  String get enrollSkip => 'ಈಗ ಬಿಟ್ಟು ಅಭ್ಯಾಸ ಬೋರ್ಡ್ ಬಳಸಿ';

  @override
  String get aiAskNeedsSignIn =>
      'KINETIX AI ಅನ್ನು ಕೇಳಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String aiToolSoon(String tool) {
    return 'KINETIX AI $tool';
  }

  @override
  String get aiAskHint => 'ಯಾವುದೇ ವಿಷಯದ ಬಗ್ಗೆ ಕೇಳಿ';

  @override
  String aiAskHintClass(String classLabel) {
    return '$classLabel ಬಗ್ಗೆ ಏನಾದರೂ ಕೇಳಿ';
  }

  @override
  String get aiSpeak => 'ಮಾತನಾಡಿ';

  @override
  String get aiVoiceQuestions => 'ಧ್ವನಿಯಲ್ಲಿ ಪ್ರಶ್ನೆ ಕೇಳುವುದು';

  @override
  String get aiAsk => 'ಕೇಳಿ';

  @override
  String get aiDisclaimer =>
      'ಉತ್ತರಗಳು ನಿಮ್ಮ ಪಠ್ಯಕ್ರಮವನ್ನು ಅನುಸರಿಸುತ್ತವೆ. ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.';

  @override
  String get aiPreparing => 'KINETIX AI ವಿವರಣೆ ಸಿದ್ಧಪಡಿಸುತ್ತಿದೆ…';

  @override
  String get aiGroupTeach => 'ಬೋಧನೆ';

  @override
  String get aiGroupMathsScience => 'ಗಣಿತ ಮತ್ತು ವಿಜ್ಞಾನ';

  @override
  String get aiGroupLookUp => 'ಹುಡುಕಿ';

  @override
  String get aiSummary => 'ಸಾರಾಂಶ';

  @override
  String get aiQuickQuiz => 'ತ್ವರಿತ ರಸಪ್ರಶ್ನೆ';

  @override
  String get aiLessonPlan => 'ಪಾಠ ಯೋಜನೆ';

  @override
  String get aiMathSolver => 'ಗಣಿತ ಸಾಲ್ವರ್';

  @override
  String get aiGraph => 'ಗ್ರಾಫ್';

  @override
  String get ai3dModels => '3D ಮಾದರಿಗಳು';

  @override
  String get aiSimulations => 'ಸಿಮ್ಯುಲೇಶನ್';

  @override
  String get aiTextbook => 'ಪಠ್ಯಪುಸ್ತಕ';

  @override
  String get aiWikipedia => 'ವಿಕಿಪೀಡಿಯ';

  @override
  String get aiDictionary => 'ನಿಘಂಟು';

  @override
  String get aiReadBoard => 'ಬೋರ್ಡ್ ಓದಿ';

  @override
  String get aiAskAgain => 'ಹೊಸ ಉತ್ತರಕ್ಕಾಗಿ ಮತ್ತೆ ಕೇಳಿ';

  @override
  String aiBasedOnSyllabus(String sources) {
    return 'ನಿಮ್ಮ ಪಠ್ಯಕ್ರಮವನ್ನು ಆಧರಿಸಿದೆ: $sources';
  }

  @override
  String get aiKeyPoints => 'ಮುಖ್ಯ ಅಂಶಗಳು';

  @override
  String get aiAskNext => 'ಮುಂದೆ ಕೇಳಿ';

  @override
  String get aiPreviewLabel =>
      'ಮಾದರಿ — ನಿಜವಾದ ಉತ್ತರಗಳಿಗಾಗಿ KINETIX AI ಸರ್ವರ್ ಸಂಪರ್ಕಿಸಿ';

  @override
  String get aiPreview => 'ಮಾದರಿ';

  @override
  String get aiLanguageTooltip => 'KINETIX AI ಭಾಷೆ';

  @override
  String get aiSignInNotice =>
      'KINETIX AI ಗೆ ಶಿಕ್ಷಕರು ಸೈನ್ ಇನ್ ಆಗಿರಬೇಕು ಮತ್ತು ಬೋರ್ಡ್ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿರಬೇಕು. ಪ್ರೊಫೈಲ್ ಬಟನ್‌ನಿಂದ Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ. ಗಣಿತ ಸಾಲ್ವರ್ ಸೈನ್ ಇನ್ ಇಲ್ಲದೆಯೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String get difficultyEasy => 'ಸುಲಭ';

  @override
  String get difficultyMedium => 'ಮಧ್ಯಮ';

  @override
  String get difficultyHard => 'ಕಠಿಣ';

  @override
  String dueOn(String date) {
    return 'ಸಲ್ಲಿಸುವ ದಿನಾಂಕ: $date';
  }

  @override
  String get dueDate => 'ಸಲ್ಲಿಸುವ ದಿನಾಂಕ';

  @override
  String get aiErrSignInAgain =>
      'KINETIX AI ಬಳಸಲು Teacher App ಮೂಲಕ ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get aiErrRefused =>
      'KINETIX AI ಈ ವಿನಂತಿಗೆ ಸಹಾಯ ಮಾಡಲಾರದು. ತರಗತಿಗೆ ತಕ್ಕಂತೆ ಬೇರೆ ರೀತಿಯಲ್ಲಿ ಕೇಳಿ.';

  @override
  String get aiErrQuota =>
      'ನಿಮ್ಮ ಸಂಸ್ಥೆ ಇಂದಿನ KINETIX AI ಮಿತಿಯನ್ನು ಬಳಸಿದೆ. ಅದು ನಾಳೆ ಮತ್ತೆ ಆರಂಭವಾಗುತ್ತದೆ.';

  @override
  String get aiErrUnusable =>
      'KINETIX AI ಬಳಸಬಹುದಾದ ಉತ್ತರ ನೀಡಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಬೇರೆ ರೀತಿಯಲ್ಲಿ ಕೇಳಿ.';

  @override
  String get aiErrUnreachable =>
      'KINETIX AI ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get aiErrCheckInput =>
      'ನೀವು ಟೈಪ್ ಮಾಡಿದ್ದನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String aiErrGeneric(int status) {
    return 'ಏನೋ ತಪ್ಪಾಗಿದೆ ($status). ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get aiErrTimeout =>
      'KINETIX AI ತುಂಬಾ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದೆ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get aiErrOffline =>
      'ಬೋರ್ಡ್ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದೆ. KINETIX AI ಬಳಸಲು ಇಂಟರ್ನೆಟ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ. ಗಣಿತ ಸಾಲ್ವರ್ ಆಫ್‌ಲೈನ್‌ನಲ್ಲೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String aiExplainTopic(String topic) {
    return '$topic ವಿವರಿಸಿ';
  }

  @override
  String aiExplainFromBoard(String text) {
    return 'ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ ಇದನ್ನು ವಿವರಿಸಿ: $text';
  }

  @override
  String get quizNeedsSignIn =>
      'KINETIX AI ಮೂಲಕ ರಸಪ್ರಶ್ನೆ ಮಾಡಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get quizTypeTopic => 'ಮೊದಲು ರಸಪ್ರಶ್ನೆಯ ವಿಷಯ ಟೈಪ್ ಮಾಡಿ.';

  @override
  String get quizTopicHint =>
      'ಉದಾ. ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ, ಭಿನ್ನರಾಶಿಗಳು, ಕಂಪನಿ ಲೆಕ್ಕಗಳು';

  @override
  String get questionsLabel => 'ಪ್ರಶ್ನೆಗಳು';

  @override
  String get quizMake => 'ರಸಪ್ರಶ್ನೆ ಮಾಡಿ';

  @override
  String get quizMakeNew => 'ಹೊಸ ರಸಪ್ರಶ್ನೆ ಮಾಡಿ';

  @override
  String writingQuestions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪ್ರಶ್ನೆಗಳನ್ನು ಬರೆಯಲಾಗುತ್ತಿದೆ…',
      one: '1 ಪ್ರಶ್ನೆ ಬರೆಯಲಾಗುತ್ತಿದೆ…',
    );
    return '$_temp0';
  }

  @override
  String quizHeader(int count, String topic) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪ್ರಶ್ನೆಗಳು · $topic',
      one: '1 ಪ್ರಶ್ನೆ · $topic',
    );
    return '$_temp0';
  }

  @override
  String get quizDraftNote =>
      'ಕರಡು — ತೋರಿಸುವ ಮೊದಲು ಪ್ರಶ್ನೆಗಳು ಮತ್ತು ಉತ್ತರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.';

  @override
  String get quizPresent => 'ಪ್ರದರ್ಶಿಸಿ';

  @override
  String get sendAsHomework => 'ಹೋಂವರ್ಕ್ ಆಗಿ ಕಳುಹಿಸಿ';

  @override
  String quizAnswerExplanation(String letter, String explanation) {
    return 'ಉತ್ತರ $letter. $explanation';
  }

  @override
  String questionOf(int number, int total) {
    return 'ಪ್ರಶ್ನೆ $number / $total';
  }

  @override
  String get hideAnswer => 'ಉತ್ತರ ಮರೆಮಾಡಿ';

  @override
  String get revealAnswer => 'ಉತ್ತರ ತೋರಿಸಿ';

  @override
  String get finish => 'ಮುಗಿಸಿ';

  @override
  String quizTitle(String topic) {
    return 'ರಸಪ್ರಶ್ನೆ: $topic';
  }

  @override
  String get quizHomeworkIntro =>
      'ಈ ಬಹು ಆಯ್ಕೆಯ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ. ಸರಿಯಾದ ಆಯ್ಕೆಯ ಅಕ್ಷರವನ್ನು ಬರೆಯಿರಿ.';

  @override
  String get homeworkNeedsSignIn =>
      'KINETIX AI ಮೂಲಕ ಹೋಂವರ್ಕ್ ಮಾಡಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get homeworkTypeTopic => 'ಮೊದಲು ಹೋಂವರ್ಕ್‌ನ ವಿಷಯ ಟೈಪ್ ಮಾಡಿ.';

  @override
  String get homeworkTopicHint => 'ಉದಾ. ರೇಖಾತ್ಮಕ ಸಮೀಕರಣಗಳು, ಜರ್ನಲ್ ನಮೂದುಗಳು';

  @override
  String get homeworkMake => 'ಹೋಂವರ್ಕ್ ಮಾಡಿ';

  @override
  String get homeworkWriteOwn => 'ನಾನೇ ಬರೆಯುತ್ತೇನೆ';

  @override
  String get homeworkEditNote =>
      'ತರಗತಿಗೆ ಕಳುಹಿಸುವ ಮೊದಲು ನೀವು ಎಲ್ಲವನ್ನೂ ತಿದ್ದಬಹುದು. ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರು ಇದನ್ನು ತಮ್ಮ ಆ್ಯಪ್‌ಗಳಲ್ಲಿ ನೋಡುತ್ತಾರೆ.';

  @override
  String get homeworkNeedsTitle => 'ಹೋಂವರ್ಕ್‌ಗೆ ಶೀರ್ಷಿಕೆ ನೀಡಿ.';

  @override
  String get homeworkTooLong =>
      'ಈ ಹೋಂವರ್ಕ್ ಕಳುಹಿಸಲು ತುಂಬಾ ಉದ್ದವಿದೆ. ಕೆಲವು ಪ್ರಶ್ನೆಗಳನ್ನು ತೆಗೆದುಹಾಕಿ.';

  @override
  String get quizTooLongForHomework =>
      'ಈ ರಸಪ್ರಶ್ನೆ ಹೋಂವರ್ಕ್ ಆಗಿ ಕಳುಹಿಸಲು ತುಂಬಾ ಉದ್ದವಿದೆ. ಕಡಿಮೆ ಪ್ರಶ್ನೆಗಳಿರುವ ಒಂದನ್ನು ಮಾಡಿ.';

  @override
  String homeworkSent(String section) {
    return 'ಹೋಂವರ್ಕ್ $section ತರಗತಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ. ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ.';
  }

  @override
  String get homeworkErrSignIn =>
      'ಹೋಂವರ್ಕ್ ನೀಡಲು Teacher App ಮೂಲಕ ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String homeworkErrStatus(int status) {
    return 'ಹೋಂವರ್ಕ್ ಕಳುಹಿಸಲು ಆಗಲಿಲ್ಲ ($status). ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get homeworkErrOffline =>
      'ಬೋರ್ಡ್ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದೆ. ಹೋಂವರ್ಕ್ ಕಳುಹಿಸಲು ಇಂಟರ್ನೆಟ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ.';

  @override
  String get questionHint => 'ಪ್ರಶ್ನೆ';

  @override
  String marks(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಅಂಕಗಳು',
      one: '1 ಅಂಕ',
    );
    return '$_temp0';
  }

  @override
  String get removeQuestion => 'ಪ್ರಶ್ನೆ ತೆಗೆದುಹಾಕಿ';

  @override
  String get instructionsLabel => 'ಸೂಚನೆಗಳು';

  @override
  String totalMarks(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ಒಟ್ಟು $count ಅಂಕಗಳು',
      one: 'ಒಟ್ಟು 1 ಅಂಕ',
    );
    return '$_temp0';
  }

  @override
  String get addQuestion => 'ಪ್ರಶ್ನೆ ಸೇರಿಸಿ';

  @override
  String get sendToClass => 'ತರಗತಿಗೆ ಕಳುಹಿಸಿ';

  @override
  String homeworkTitleTopic(String topic) {
    return 'ಹೋಂವರ್ಕ್: $topic';
  }

  @override
  String get homeworkDefaultInstructions =>
      'ಎಲ್ಲ ಪ್ರಶ್ನೆಗಳಿಗೂ ನಿಮ್ಮ ನೋಟ್‌ಬುಕ್‌ನಲ್ಲಿ ಉತ್ತರಿಸಿ. ಬಿಡಿಸುವ ಹಂತಗಳನ್ನು ತೋರಿಸಿ.';

  @override
  String homeworkTotalLine(String marks) {
    return 'ಒಟ್ಟು: $marks';
  }

  @override
  String get lessonNeedsSignIn =>
      'KINETIX AI ಮೂಲಕ ಪಾಠ ಯೋಜನೆ ಮಾಡಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get lessonTypeTopic => 'ಮೊದಲು ಪಾಠದ ವಿಷಯ ಟೈಪ್ ಮಾಡಿ.';

  @override
  String get lessonTopicHint => 'ಉದಾ. ಜಲಚಕ್ರ';

  @override
  String get lessonLength => 'ಅವಧಿ';

  @override
  String get lessonPlanButton => 'ಪಾಠ ಯೋಜಿಸಿ';

  @override
  String get lessonPlanAgain => 'ಮತ್ತೆ ಯೋಜಿಸಿ';

  @override
  String get lessonPlanning => 'ಪಾಠ ಯೋಜಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get lessonObjectives => 'ಉದ್ದೇಶಗಳು';

  @override
  String lessonSteps(int minutes) {
    return 'ಹಂತಗಳು · $minutes ನಿಮಿಷ';
  }

  @override
  String get lessonMaterials => 'ಸಾಮಗ್ರಿಗಳು';

  @override
  String get lessonCheck => 'ಅರ್ಥವಾಗಿದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ';

  @override
  String get readNeedsSignIn =>
      'KINETIX AI ಮೂಲಕ ಬೋರ್ಡ್ ಓದಿಸಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get readIntro =>
      'ಈ ಪುಟದ ಕೈಬರಹವನ್ನು ನೀವು ನಕಲಿಸಬಹುದಾದ, ಪರಿಶೀಲಿಸಬಹುದಾದ ಅಥವಾ ಪ್ರಶ್ನಿಸಬಹುದಾದ ಪಠ್ಯವಾಗಿ ಬದಲಿಸುತ್ತದೆ. ಸ್ಪಷ್ಟವಾಗಿ ಬರೆಯಿರಿ; ಒಮ್ಮೆಗೆ ಒಂದು ಪುಟ.';

  @override
  String get readThisPage => 'ಈ ಪುಟ ಓದಿ';

  @override
  String get readAgain => 'ಮತ್ತೆ ಓದಿ';

  @override
  String get readingBoard => 'ಬೋರ್ಡ್ ಓದಲಾಗುತ್ತಿದೆ…';

  @override
  String get readNoWriting => 'ಈ ಪುಟದಲ್ಲಿ ಯಾವುದೇ ಬರಹ ಕಂಡುಬಂದಿಲ್ಲ.';

  @override
  String get readMathsFound => 'ಸಿಕ್ಕ ಗಣಿತ';

  @override
  String get copied => 'ನಕಲಿಸಲಾಗಿದೆ';

  @override
  String get copyText => 'ಪಠ್ಯ ನಕಲಿಸಿ';

  @override
  String get askAiAboutThis => 'ಇದರ ಬಗ್ಗೆ KINETIX AI ಅನ್ನು ಕೇಳಿ';

  @override
  String get booksTopic => 'ವಿಷಯ';

  @override
  String get booksSignIn =>
      'ಪುಸ್ತಕಗಳಲ್ಲಿ ಈಗ ನಡೆಯುತ್ತಿರುವ ತರಗತಿಯ ಪಠ್ಯಕ್ರಮ ಕಾಣುತ್ತದೆ. ಅದನ್ನು ತೆರೆಯಲು Teacher App ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get booksOpening => 'ಪಠ್ಯಕ್ರಮ ತೆರೆಯಲಾಗುತ್ತಿದೆ…';

  @override
  String get booksCouldNotOpen =>
      'ಪಠ್ಯಕ್ರಮ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ. ಬೋರ್ಡ್ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿದೆಯೇ ಎಂದು ನೋಡಿ.';

  @override
  String get booksUnlinked =>
      'ಈ ವಿಷಯವನ್ನು ಇನ್ನೂ ಯಾವುದೇ ಪಠ್ಯಕ್ರಮಕ್ಕೆ ಜೋಡಿಸಿಲ್ಲ. ನಿಮ್ಮ ಅಡ್ಮಿನ್ ಇದನ್ನು KINETIX ERP → Syllabus ನಲ್ಲಿ ಜೋಡಿಸಬಹುದು.';

  @override
  String get booksDraft =>
      'ಕರಡು ವಿಷಯ: ಇದರಿಂದ ಪಾಠ ಮಾಡುವ ಮೊದಲು ನಿಮ್ಮ ಪಠ್ಯಪುಸ್ತಕದೊಂದಿಗೆ ಹೋಲಿಸಿ ನೋಡಿ.';

  @override
  String get booksDraftShort =>
      'ಕರಡು ವಿಷಯ: ನಿಮ್ಮ ಪಠ್ಯಪುಸ್ತಕದೊಂದಿಗೆ ಹೋಲಿಸಿ ನೋಡಿ.';

  @override
  String get booksAddedByInstitution => 'ನಿಮ್ಮ ಸಂಸ್ಥೆ ಸೇರಿಸಿದೆ';

  @override
  String get booksNotesSoon => 'ಟಿಪ್ಪಣಿಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ';

  @override
  String booksTopicCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿಷಯಗಳು',
      one: '1 ವಿಷಯ',
    );
    return '$_temp0';
  }

  @override
  String get booksOpeningTopic => 'ವಿಷಯ ತೆರೆಯಲಾಗುತ್ತಿದೆ…';

  @override
  String get booksCouldNotOpenTopic => 'ಈ ವಿಷಯ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ.';

  @override
  String get booksExplain => 'KINETIX AI ಮೂಲಕ ವಿವರಿಸಿ';

  @override
  String get booksQuiz => 'ಇದರ ಮೇಲೆ ತ್ವರಿತ ರಸಪ್ರಶ್ನೆ';

  @override
  String get booksOnTheBoard => 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ತೋರಿಸಿ';

  @override
  String get booksKeyFacts => 'ಮುಖ್ಯ ಅಂಶಗಳು';

  @override
  String get booksOutcomes => 'ಕೊನೆಗೆ ವಿದ್ಯಾರ್ಥಿಗಳು ಇದನ್ನು ಮಾಡಬಲ್ಲರು';

  @override
  String booksTaughtCount(int covered, int total) {
    return '$total ರಲ್ಲಿ $covered ವಿಷಯಗಳನ್ನು ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String booksChapterTaught(int covered, int total) {
    return '$covered/$total ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String booksTaughtOn(String date) {
    return '$date ರಂದು ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String get booksMarkTaught => 'ಕಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get booksUndoTaught => 'ಅನ್‌ಡು';

  @override
  String get booksMarked => 'ಕಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ';

  @override
  String get booksUnmarked => 'ಕಲಿಸಲಾಗಿದೆ ಎಂಬ ಗುರುತು ತೆಗೆಯಲಾಗಿದೆ';

  @override
  String get booksMarkFailed => 'ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಬೋರ್ಡ್ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿದೆಯೇ ನೋಡಿ.';

  @override
  String get booksHook => 'ಹೀಗೆ ಆರಂಭಿಸಿ';

  @override
  String get booksTerms => 'ಕಲಿಯಬೇಕಾದ ಪದಗಳು';

  @override
  String get booksExample => 'ಬಿಡಿಸಿದ ಉದಾಹರಣೆ';

  @override
  String get booksActivity => 'ತರಗತಿ ಚಟುವಟಿಕೆ';

  @override
  String get mathHint => 'ಲೆಕ್ಕ ಅಥವಾ ಸಮೀಕರಣ ಟೈಪ್ ಮಾಡಿ';

  @override
  String get mathOffline =>
      'ಈ ಬೋರ್ಡ್‌ನಲ್ಲೇ ಬಿಡಿಸಲಾಗುತ್ತದೆ. ಆಫ್‌ಲೈನ್‌ನಲ್ಲೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ, ಸೈನ್ ಇನ್ ಬೇಕಿಲ್ಲ.';

  @override
  String get mathTryThese => 'ಇವುಗಳಲ್ಲಿ ಒಂದನ್ನು ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get mathAbout =>
      'BODMAS ಬಳಸಿ ಲೆಕ್ಕಗಳು, ಭಿನ್ನರಾಶಿಗಳು, ಘಾತ ಮತ್ತು ಮೂಲಗಳು, ಡಿಗ್ರಿಯಲ್ಲಿ sin/cos/tan, log ಬಿಡಿಸುತ್ತದೆ, ಮತ್ತು ರೇಖಾತ್ಮಕ ಹಾಗೂ ವರ್ಗ ಸಮೀಕರಣಗಳನ್ನು ಹಂತ ಹಂತವಾಗಿ ಬಿಡಿಸುತ್ತದೆ.';

  @override
  String get mathSolve => 'ಬಿಡಿಸಿ';

  @override
  String get mathWorking => 'ಬಿಡಿಸುವ ಹಂತಗಳು';

  @override
  String get mathKeySquared => 'ವರ್ಗ';

  @override
  String get mathKeyPower => 'ಘಾತ';

  @override
  String get mathKeySquareRoot => 'ವರ್ಗಮೂಲ';

  @override
  String get mathKeyPi => 'ಪೈ';

  @override
  String get mathKeyFraction => 'ಭಿನ್ನರಾಶಿ';

  @override
  String get mathKeyOpenBracket => 'ಆವರಣ ತೆರೆಯಿರಿ';

  @override
  String get mathKeyCloseBracket => 'ಆವರಣ ಮುಚ್ಚಿ';

  @override
  String get mathKeyTimes => 'ಗುಣಿಸು';

  @override
  String get mathKeyDivide => 'ಭಾಗಿಸು';

  @override
  String get mathKeyMinus => 'ಕಳೆ';

  @override
  String get mathKeyPlus => 'ಕೂಡು';

  @override
  String get mathKeyEquals => 'ಸಮ';

  @override
  String get mathKeyDelete => 'ಅಳಿಸಿ';

  @override
  String get mathKindArithmetic => 'ಅಂಕಗಣಿತ';

  @override
  String get mathKindSimplify => 'ಸರಳೀಕರಿಸಿ';

  @override
  String get mathKindCheck => 'ಪರಿಶೀಲನೆ';

  @override
  String get mathKindLinear => 'ರೇಖಾತ್ಮಕ ಸಮೀಕರಣ';

  @override
  String get mathKindQuadratic => 'ವರ್ಗ ಸಮೀಕರಣ';

  @override
  String get mathTrue => 'ಸತ್ಯ';

  @override
  String get mathFalse => 'ಅಸತ್ಯ';

  @override
  String get mathEveryNumber => 'ಪ್ರತಿ ಸಂಖ್ಯೆಯೂ ಪರಿಹಾರ';

  @override
  String get mathNoSolution => 'ಪರಿಹಾರ ಇಲ್ಲ';

  @override
  String mathRepeatedRoot(String answer) {
    return '$answer (ಪುನರಾವರ್ತಿತ ಮೂಲ)';
  }

  @override
  String mathNoRealRoots(String roots) {
    return 'ವಾಸ್ತವ ಮೂಲಗಳಿಲ್ಲ: $roots';
  }

  @override
  String get mathOr => 'ಅಥವಾ';

  @override
  String get mathAnd => 'ಮತ್ತು';

  @override
  String mathForEvery(String equation, String variable) {
    return 'ಪ್ರತಿ $variable ಗೆ $equation';
  }

  @override
  String mathIsFalse(String equation) {
    return '$equation ಅಸತ್ಯ';
  }

  @override
  String get mathStepWorkOutRest => 'ಉಳಿದದ್ದನ್ನು ಲೆಕ್ಕಿಸಿ';

  @override
  String get mathStepBrackets => 'ಮೊದಲು ಆವರಣ';

  @override
  String get mathStepPowers => 'ಘಾತ ಮತ್ತು ಮೂಲಗಳು';

  @override
  String get mathStepDivideMultiply => 'ಭಾಗಾಕಾರ ಮತ್ತು ಗುಣಾಕಾರ, ಎಡದಿಂದ ಬಲಕ್ಕೆ';

  @override
  String get mathStepAddSubtract => 'ಸಂಕಲನ ಮತ್ತು ವ್ಯವಕಲನ, ಎಡದಿಂದ ಬಲಕ್ಕೆ';

  @override
  String get mathStepStartExpression => 'ಸಮಾಸದಿಂದ ಆರಂಭಿಸಿ';

  @override
  String get mathStepStartStatement => 'ಹೇಳಿಕೆಯಿಂದ ಆರಂಭಿಸಿ';

  @override
  String get mathStepLeftSide => 'ಎಡಭಾಗ ಲೆಕ್ಕಿಸಿ';

  @override
  String get mathStepRightSide => 'ಬಲಭಾಗ ಲೆಕ್ಕಿಸಿ';

  @override
  String get mathStepStatementTrue =>
      'ಎರಡೂ ಭಾಗಗಳು ಸಮವಾಗಿವೆ, ಆದ್ದರಿಂದ ಹೇಳಿಕೆ ಸತ್ಯ';

  @override
  String get mathStepStatementFalse =>
      'ಎರಡೂ ಭಾಗಗಳು ಬೇರೆಯಾಗಿವೆ, ಆದ್ದರಿಂದ ಹೇಳಿಕೆ ಅಸತ್ಯ';

  @override
  String get mathStepExpand => 'ಆವರಣ ಬಿಡಿಸಿ ಸಜಾತೀಯ ಪದಗಳನ್ನು ಒಟ್ಟುಗೂಡಿಸಿ';

  @override
  String mathStepToFind(String variable, String equation) {
    return '$variable ಕಂಡುಹಿಡಿಯಲು ಸಮೀಕರಣ ಬರೆಯಿರಿ, ಉದಾ. $equation';
  }

  @override
  String get mathStepWriteEquation => 'ಸಮೀಕರಣ ಬರೆಯಿರಿ';

  @override
  String get mathStepExpandEachSide =>
      'ಆವರಣ ಬಿಡಿಸಿ ಪ್ರತಿ ಭಾಗದಲ್ಲಿ ಸಜಾತೀಯ ಪದಗಳನ್ನು ಒಟ್ಟುಗೂಡಿಸಿ';

  @override
  String mathStepSquaresCancel(String term, String square) {
    return 'ಎರಡೂ ಭಾಗಗಳಿಂದ $term ಕಳೆಯಿರಿ; $square ಪದಗಳು ರದ್ದಾಗುತ್ತವೆ';
  }

  @override
  String get mathStepAlwaysEqual => 'ಎರಡೂ ಭಾಗಗಳು ಯಾವಾಗಲೂ ಸಮ';

  @override
  String get mathStepNeverEqual => 'ಎರಡೂ ಭಾಗಗಳು ಎಂದಿಗೂ ಸಮವಾಗಲಾರವು';

  @override
  String mathStepAddBoth(String term) {
    return 'ಎರಡೂ ಭಾಗಗಳಿಗೆ $term ಕೂಡಿಸಿ';
  }

  @override
  String mathStepSubtractBoth(String term) {
    return 'ಎರಡೂ ಭಾಗಗಳಿಂದ $term ಕಳೆಯಿರಿ';
  }

  @override
  String mathStepMultiplyBoth(String number) {
    return 'ಎರಡೂ ಭಾಗಗಳನ್ನು $number ರಿಂದ ಗುಣಿಸಿ';
  }

  @override
  String mathStepDivideBoth(String number) {
    return 'ಎರಡೂ ಭಾಗಗಳನ್ನು $number ರಿಂದ ಭಾಗಿಸಿ';
  }

  @override
  String mathStepCheck(String value) {
    return 'ಪರಿಶೀಲನೆ: ಸಮೀಕರಣದಲ್ಲಿ $value ಇರಿಸಿ';
  }

  @override
  String get mathStepBringLeft => 'ಎಲ್ಲ ಪದಗಳನ್ನು ಎಡಭಾಗಕ್ಕೆ ತಂದು ಸರಳೀಕರಿಸಿ';

  @override
  String mathStepClearFractions(String number) {
    return 'ಭಿನ್ನರಾಶಿಗಳನ್ನು ತೆಗೆಯಲು ಎರಡೂ ಭಾಗಗಳನ್ನು $number ರಿಂದ ಗುಣಿಸಿ';
  }

  @override
  String mathStepMakePositive(String number, String square) {
    return '$square ಪದ ಧನಾತ್ಮಕವಾಗಲು ಎರಡೂ ಭಾಗಗಳನ್ನು $number ರಿಂದ ಗುಣಿಸಿ';
  }

  @override
  String mathStepCompare(String form) {
    return '$form ಜೊತೆ ಹೋಲಿಸಿ';
  }

  @override
  String mathStepDiscriminant(String formula) {
    return 'ಶೋಧಕ $formula ಕಂಡುಹಿಡಿಯಿರಿ';
  }

  @override
  String get mathStepEqualRoots => 'D = 0, ಆದ್ದರಿಂದ ಎರಡೂ ಮೂಲಗಳು ಸಮ';

  @override
  String mathStepUse(String formula) {
    return '$formula ಬಳಸಿ';
  }

  @override
  String get mathStepComplexRoots =>
      'D < 0, ಆದ್ದರಿಂದ ವಾಸ್ತವ ಮೂಲಗಳಿಲ್ಲ. ಮೂಲಗಳು ಸಂಕೀರ್ಣ ಸಂಖ್ಯೆಗಳು';

  @override
  String get mathStepTwoRealRoots =>
      'D > 0, ಆದ್ದರಿಂದ ಎರಡು ಬೇರೆ ಬೇರೆ ವಾಸ್ತವ ಮೂಲಗಳಿವೆ';

  @override
  String mathStepQuadraticFormula(String formula) {
    return 'ವರ್ಗ ಸೂತ್ರ $formula ಬಳಸಿ';
  }

  @override
  String get mathStepTwoRoots => 'ಎರಡೂ ಮೂಲಗಳನ್ನು ಲೆಕ್ಕಿಸಿ';

  @override
  String get mathStepSimplifyRoot => 'ವರ್ಗಮೂಲವನ್ನು ಸರಳೀಕರಿಸಿ';

  @override
  String mathStepDivideTopBottom(String number) {
    return 'ಅಂಶ ಮತ್ತು ಛೇದವನ್ನು $number ರಿಂದ ಭಾಗಿಸಿ';
  }

  @override
  String get mathStepSoRoots => 'ಆದ್ದರಿಂದ ಮೂಲಗಳು';

  @override
  String get mathStepInDecimals => 'ದಶಮಾಂಶಗಳಲ್ಲಿ';

  @override
  String get mathStepWorkOutRoots => 'ಮೂಲಗಳನ್ನು ಲೆಕ್ಕಿಸಿ';

  @override
  String get mathStepFactorised => 'ಅಪವರ್ತನ ರೂಪ';

  @override
  String get mathErrZeroPowerZero => '0⁰ ವ್ಯಾಖ್ಯಾನಿಸಲಾಗಿಲ್ಲ.';

  @override
  String get mathErrDivisionByZero => 'ಸೊನ್ನೆಯಿಂದ ಭಾಗಾಕಾರ ವ್ಯಾಖ್ಯಾನಿಸಲಾಗಿಲ್ಲ.';

  @override
  String get mathErrNegativeFractionalPower =>
      'ಋಣ ಸಂಖ್ಯೆಯ ಭಿನ್ನರಾಶಿ ಘಾತ ವಾಸ್ತವ ಸಂಖ್ಯೆಯಲ್ಲ.';

  @override
  String get mathErrNegativeRoot => 'ಋಣ ಸಂಖ್ಯೆಯ ವರ್ಗಮೂಲ ವಾಸ್ತವ ಸಂಖ್ಯೆಯಲ್ಲ.';

  @override
  String mathErrNotDefined(String expression) {
    return '$expression ವ್ಯಾಖ್ಯಾನಿಸಲಾಗಿಲ್ಲ.';
  }

  @override
  String mathErrPositiveOnly(String function) {
    return '$function ಧನ ಸಂಖ್ಯೆಗಳಿಗೆ ಮಾತ್ರ ವ್ಯಾಖ್ಯಾನಿಸಲಾಗಿದೆ.';
  }

  @override
  String mathErrUnknownFunction(String function) {
    return 'ಅಪರಿಚಿತ ಫಲನ $function.';
  }

  @override
  String mathErrNoValue(String name) {
    return '“$name” ಗೆ ಯಾವುದೇ ಮೌಲ್ಯವಿಲ್ಲ.';
  }

  @override
  String get mathErrTooLarge => 'ಉತ್ತರ ತುಂಬಾ ದೊಡ್ಡದು ಅಥವಾ ವ್ಯಾಖ್ಯಾನಿಸಲಾಗಿಲ್ಲ.';

  @override
  String mathErrNotANumber(String text) {
    return '“$text” ಸಂಖ್ಯೆಯಲ್ಲ.';
  }

  @override
  String mathErrDontUnderstandUse(String text) {
    return '“$text” ಅರ್ಥವಾಗಲಿಲ್ಲ. ಸಂಖ್ಯೆಗಳು, x, + − × ÷ ^, ಆವರಣಗಳು, √, sin, cos, tan, log ಬಳಸಿ.';
  }

  @override
  String get mathErrEmpty => 'ಲೆಕ್ಕ ಅಥವಾ ಸಮೀಕರಣ ಟೈಪ್ ಮಾಡಿ, ಉದಾ. 3x + 5 = 20.';

  @override
  String get mathErrAfterEquals => '“=” ನಂತರ ಏನಾದರೂ ಬರೆಯಿರಿ.';

  @override
  String get mathErrOneEquals => 'ಒಂದೇ “=” ಚಿಹ್ನೆ ಬಳಸಿ.';

  @override
  String get mathErrUnmatchedClose => 'ಹೊಂದುವ “(” ಇಲ್ಲದ “)” ಇದೆ.';

  @override
  String mathErrDontUnderstandHere(String text) {
    return 'ಇಲ್ಲಿ “$text” ಅರ್ಥವಾಗಲಿಲ್ಲ.';
  }

  @override
  String get mathErrEndsEarly => 'ಸಮಾಸ ಬೇಗ ಮುಗಿದಿದೆ. ಏನಾದರೂ ಬಿಟ್ಟುಹೋಗಿದೆಯೇ?';

  @override
  String get mathErrOperatorBetween =>
      'ಸಂಖ್ಯೆಗಳ ನಡುವೆ ಒಂದು ಚಿಹ್ನೆ (+ − × ÷) ಹಾಕಿ.';

  @override
  String get mathErrPowerAfterCaret => '“^” ನಂತರ ಘಾತ ಬರೆಯಿರಿ.';

  @override
  String get mathErrEmptyBrackets => 'ಆವರಣ “()” ಒಳಗೆ ಏನೂ ಇಲ್ಲ.';

  @override
  String get mathErrBracketNotClosed => 'ಒಂದು ಆವರಣ ಮುಚ್ಚಿಲ್ಲ. “)” ಸೇರಿಸಿ.';

  @override
  String mathErrNumberAfter(String function) {
    return '$function ನಂತರ ಒಂದು ಸಂಖ್ಯೆ ಬರೆಯಿರಿ.';
  }

  @override
  String get mathErrBeforeEquals => '“=” ಮೊದಲು ಏನಾದರೂ ಬರೆಯಿರಿ.';

  @override
  String mathErrMissingBefore(String text) {
    return '“$text” ಮೊದಲು ಏನೋ ಬಿಟ್ಟುಹೋಗಿದೆ.';
  }

  @override
  String get mathErrBothSides => '“=” ನ ಎರಡೂ ಕಡೆ ಏನಾದರೂ ಬರೆಯಿರಿ.';

  @override
  String mathErrUnknownInside(String function) {
    return '$function ಒಳಗೆ ಅಜ್ಞಾತ ಇನ್ನೂ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ.';
  }

  @override
  String get mathErrUnknownDenominator =>
      'ಛೇದದಲ್ಲಿ ಅಜ್ಞಾತ ಇನ್ನೂ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ.';

  @override
  String get mathErrUnknownPower => 'ಘಾತದಲ್ಲಿ ಅಜ್ಞಾತ ಇನ್ನೂ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ.';

  @override
  String get mathErrWholePowers =>
      'ಅಜ್ಞಾತದ ಘಾತ x² ಅಥವಾ x³ ನಂತೆ ಪೂರ್ಣ ಸಂಖ್ಯೆಯಾಗಿರಬೇಕು.';

  @override
  String mathErrManyUnknowns(String list) {
    return 'ಇದರಲ್ಲಿ ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಅಜ್ಞಾತಗಳಿವೆ ($list). x ನಂತೆ ಒಂದೇ ಅಜ್ಞಾತ ಬಳಸಿ.';
  }

  @override
  String mathErrHighPowers(String power) {
    return '$power ಅಥವಾ ಹೆಚ್ಚಿನ ಘಾತಗಳ ಸಮೀಕರಣಗಳು ಇನ್ನೂ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ. ರೇಖಾತ್ಮಕ ಅಥವಾ ವರ್ಗ ಸಮೀಕರಣ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get toolTodaysPlan => 'ಇಂದಿನ ಯೋಜನೆ';

  @override
  String get planSignIn =>
      'ಇಂದಿನ ಯೋಜನೆ ಈಗ ನಡೆಯುತ್ತಿರುವ ತರಗತಿಯ ಪಾಠ ಯೋಜನೆಯನ್ನು ತೋರಿಸುತ್ತದೆ. ತೆರೆಯಲು Teacher app ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get planOpening => 'ಯೋಜನೆ ತೆರೆಯುತ್ತಿದೆ…';

  @override
  String get planCouldNotOpen =>
      'ಪಾಠ ಯೋಜನೆ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಬೋರ್ಡ್ ಆನ್‌ಲೈನ್ ಇದೆಯೇ ಎಂದು ನೋಡಿ.';

  @override
  String get planNoClass =>
      'ಬೋರ್ಡ್‌ನಲ್ಲಿ ವೇಳಾಪಟ್ಟಿಯ ಯಾವುದೇ ತರಗತಿ ತೆರೆದಿಲ್ಲ, ಆದ್ದರಿಂದ ತೋರಿಸಲು ಪಾಠ ಯೋಜನೆ ಇಲ್ಲ.';

  @override
  String get planNone => 'ಈ ಅವಧಿಗೆ ಪಾಠ ಯೋಜನೆ ಇಲ್ಲ. Teacher app ನಲ್ಲಿ ಯೋಜಿಸಿ.';

  @override
  String get planAiDrafted => 'KINETIX AI ಮೂಲಕ ಕರಡು ಮಾಡಲಾಗಿದೆ';

  @override
  String get planTopics => 'ವಿಷಯಗಳು';

  @override
  String get planOpenInBooks => 'Books ನಲ್ಲಿ ತೆರೆಯಿರಿ';

  @override
  String planStepsOf(int planned, int length) {
    return 'ಹಂತಗಳು · $length ರಲ್ಲಿ $planned ನಿಮಿ';
  }

  @override
  String get planStartTimer => 'ಹಂತ ಟೈಮರ್ ಪ್ರಾರಂಭಿಸಿ';

  @override
  String get planResumeTimer => 'ಮುಂದುವರಿಸಿ';

  @override
  String get planNextStep => 'ಮುಂದಿನ ಹಂತ';

  @override
  String get planAllStepsDone => 'ಎಲ್ಲಾ ಹಂತಗಳು ಮುಗಿದಿವೆ';

  @override
  String get planHomework => 'ಹೋಂವರ್ಕ್';

  @override
  String get demoChip => 'ಡೆಮೊ';

  @override
  String get demoBannerTitle => 'ಡೆಮೊ ಮೋಡ್';

  @override
  String get demoBannerBody =>
      'KINETIX ಡೆಮೊ ಕಾಲೇಜಿನ ಮಾದರಿ ಡೇಟಾ. ಯಾವುದನ್ನೂ ಸರ್ವರ್‌ಗೆ ಕಳುಹಿಸುವುದಿಲ್ಲ, ಮತ್ತು ನಿಮ್ಮ ಬದಲಾವಣೆಗಳು ಆ್ಯಪ್ ಮುಚ್ಚುವವರೆಗೆ ಮಾತ್ರ ಇರುತ್ತವೆ.';

  @override
  String demoSignInAs(String name) {
    return '$name ಆಗಿ ಸೈನ್ ಇನ್ ಮಾಡಿ';
  }

  @override
  String get demoOtpHint => 'ಡೆಮೊ: ಯಾವುದೇ ಸಂಖ್ಯೆ ಸಾಕು; ಕೋಡ್ 123456.';

  @override
  String get notInDemo => 'ಡೆಮೊದಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ.';

  @override
  String get demoBoardBody =>
      'ಈ ಬೋರ್ಡ್ ಮಾದರಿ ಡೇಟಾ ಇರುವ ಡೆಮೊ ತರಗತಿಯಲ್ಲಿದೆ. ಯಾವುದನ್ನೂ ಸರ್ವರ್‌ಗೆ ಕಳುಹಿಸುವುದಿಲ್ಲ.';

  @override
  String get kioskTitle => 'ಕಿಯೋಸ್ಕ್ ಮೋಡ್';

  @override
  String get kioskSettingsHint =>
      'ವಿದ್ಯಾರ್ಥಿಗಳನ್ನು KINETIX Board ನಲ್ಲೇ ಇರಿಸುತ್ತದೆ ಮತ್ತು ವಿದ್ಯುತ್ ಹೋದ ನಂತರ ಅದನ್ನು ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ. ನಿಮ್ಮ ಸಂಸ್ಥೆ ಇದನ್ನು KINETIX ERP → ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಆನ್ ಮಾಡಿ IT PIN ಹೊಂದಿಸುತ್ತದೆ.';

  @override
  String get kioskStatusLocked => 'ಆನ್: ಈ ಸಾಧನ KINETIX Board ಗೆ ಲಾಕ್ ಆಗಿದೆ.';

  @override
  String get kioskStatusPinned =>
      'ಆನ್: ಸ್ಕ್ರೀನ್ ಪಿನ್ನಿಂಗ್. ಪೂರ್ಣ ಲಾಕ್‌ಗಾಗಿ KINETIX Board ಅನ್ನು ಡಿವೈಸ್ ಓನರ್ ಮಾಡಿ (ಕಿಯೋಸ್ಕ್ ಮಾರ್ಗದರ್ಶಿ ನೋಡಿ).';

  @override
  String get kioskStatusOff => 'ಆಫ್';

  @override
  String kioskStatusPaused(String time) {
    return 'IT $time ವರೆಗೆ ನಿಲ್ಲಿಸಿದೆ';
  }

  @override
  String get kioskStatusUnsupported =>
      'ಈ ಸಾಧನದಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ. Windows ನಲ್ಲಿ Assigned Access ಬಳಸಿ (ಕಿಯೋಸ್ಕ್ ಮಾರ್ಗದರ್ಶಿ ನೋಡಿ).';

  @override
  String get kioskDemoHint =>
      'ಡೆಮೊ ಬಿಲ್ಡ್‌ಗಳು ಈ ಸಾಧನವನ್ನು ಎಂದೂ ಲಾಕ್ ಮಾಡುವುದಿಲ್ಲ. ಕಿಯೋಸ್ಕ್ ಮೋಡ್ ಹೇಗಿದೆ ಎಂದು ನೋಡಲು ಸ್ಕ್ರೀನ್ ಪಿನ್ನಿಂಗ್ ಪ್ರಯತ್ನಿಸಿ: ಹೊರಬರಲು ಗಡಿಯಾರವನ್ನು 3 ಸೆಕೆಂಡ್ ಒತ್ತಿ ಹಿಡಿಯಿರಿ.';

  @override
  String get kioskTry => 'ಕಿಯೋಸ್ಕ್ ಪ್ರಯತ್ನಿಸಿ (ಸ್ಕ್ರೀನ್ ಪಿನ್ನಿಂಗ್)';

  @override
  String get kioskStopTrial => 'ಕಿಯೋಸ್ಕ್ ಪ್ರಯೋಗ ನಿಲ್ಲಿಸಿ';

  @override
  String get kioskExitTitle => 'ಕಿಯೋಸ್ಕ್ ಮೋಡ್‌ನಿಂದ ಹೊರಬನ್ನಿ';

  @override
  String get kioskEnterPin =>
      'IT ಸಿಬ್ಬಂದಿಗೆ: KINETIX ERP ನಲ್ಲಿ ಹೊಂದಿಸಿದ IT PIN ನಮೂದಿಸಿ.';

  @override
  String get kioskPinLabel => 'IT PIN';

  @override
  String get kioskUnlock => 'ಅನ್‌ಲಾಕ್ ಮಾಡಿ';

  @override
  String kioskWrongPin(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ತಪ್ಪು PIN. ಇನ್ನು $count ಪ್ರಯತ್ನಗಳು ಉಳಿದಿವೆ.',
      one: 'ತಪ್ಪು PIN. ಇನ್ನು 1 ಪ್ರಯತ್ನ ಉಳಿದಿದೆ.',
    );
    return '$_temp0';
  }

  @override
  String kioskLockedOut(String time) {
    return 'ಹಲವು ಬಾರಿ ತಪ್ಪು PIN. $time ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get kioskNoPin =>
      'ಈ ಸಂಸ್ಥೆಗೆ ಇನ್ನೂ IT PIN ಹೊಂದಿಸಿಲ್ಲ. KINETIX ERP → ಸೆಟ್ಟಿಂಗ್‌ಗಳು → ಬೋರ್ಡ್ ಕಿಯೋಸ್ಕ್ ಮೋಡ್‌ನಲ್ಲಿ ಒಂದನ್ನು ಹೊಂದಿಸಿ; ಬೋರ್ಡ್ ಮುಂದಿನ ಬಾರಿ ಆನ್‌ಲೈನ್ ಆದಾಗ ಅದನ್ನು ಪಡೆಯುತ್ತದೆ. ಅಲ್ಲಿಯವರೆಗೆ ಕಿಯೋಸ್ಕ್ ಮೋಡ್ ಅನ್ನು ಕಿಯೋಸ್ಕ್ ಮಾರ್ಗದರ್ಶಿಯಲ್ಲಿ ಹೇಳಿದಂತೆ ಮಾತ್ರ ತೆಗೆಯಬಹುದು.';

  @override
  String get kioskLeave => '10 ನಿಮಿಷ ಕಿಯೋಸ್ಕ್‌ನಿಂದ ಹೊರಬನ್ನಿ';

  @override
  String get kioskLeaveHint =>
      '10 ನಿಮಿಷಗಳ ನಂತರ, ಅಥವಾ ಮರುಪ್ರಾರಂಭವಾದಾಗ, ಬೋರ್ಡ್ ತಾನಾಗಿಯೇ ಮತ್ತೆ ಲಾಕ್ ಆಗುತ್ತದೆ.';

  @override
  String get kioskOpenSettings => 'Android ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಿರಿ';

  @override
  String kioskPausedBody(String time) {
    return 'ಕಿಯೋಸ್ಕ್ ಮೋಡ್ $time ವರೆಗೆ ನಿಂತಿದೆ.';
  }

  @override
  String get kioskLockNow => 'ಈಗಲೇ ಮತ್ತೆ ಲಾಕ್ ಮಾಡಿ';

  @override
  String get kioskDemoBody =>
      'ಇದು ಡೆಮೊ ಬಿಲ್ಡ್: ಕಿಯೋಸ್ಕ್ ಮೋಡ್ ಆಫ್ ಆಗಿದೆ ಮತ್ತು PIN ಬೇಕಿಲ್ಲ.';
}

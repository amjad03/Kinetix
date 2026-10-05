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
  String minutesShort(int n) {
    return '$n ನಿಮಿಷ';
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
  String get tkStopwatch => 'ಸ್ಟಾಪ್‌ವಾಚ್';

  @override
  String get tkDice => 'ದಾಳ';

  @override
  String get tkSpinner => 'ಚಕ್ರ';

  @override
  String get tkNoiseMeter => 'ಶಬ್ದ ಮಾಪಕ';

  @override
  String get tkDragCard => 'ಸರಿಸಲು ಎಳೆಯಿರಿ';

  @override
  String get tkPlusMinute => '+1 ನಿಮಿಷ';

  @override
  String get tkLap => 'ಲ್ಯಾಪ್';

  @override
  String tkLapN(int number, String time) {
    return 'ಲ್ಯಾಪ್ $number: $time';
  }

  @override
  String get tkPick => 'ಆರಿಸಿ';

  @override
  String get tkReady => 'ಸಿದ್ಧವೇ?';

  @override
  String tkPickedOf(int picked, int total) {
    return '$total ರಲ್ಲಿ $picked ಆಯ್ಕೆ';
  }

  @override
  String get tkNoRepeat => 'ಎಲ್ಲರ ಸರದಿ ಮುಗಿಯುವವರೆಗೆ ಮತ್ತೆ ಆರಿಸಬೇಡಿ';

  @override
  String get tkStartOver => 'ಮತ್ತೆ ಮೊದಲಿನಿಂದ';

  @override
  String get tkDemoClass => 'ಡೆಮೊ ತರಗತಿ';

  @override
  String get tkRoll => 'ಉರುಳಿಸಿ';

  @override
  String tkDiceCount(int count) {
    return '$count ದಾಳಗಳು';
  }

  @override
  String tkTotal(int total) {
    return 'ಒಟ್ಟು: $total';
  }

  @override
  String get tkSpin => 'ತಿರುಗಿಸಿ';

  @override
  String get tkSpinnerOptions => 'ಚಕ್ರದ ಆಯ್ಕೆಗಳು';

  @override
  String get tkSpinnerHint => 'ಪ್ರತಿ ಸಾಲಿನಲ್ಲಿ ಒಂದು ಆಯ್ಕೆ';

  @override
  String tkGroup(String letter) {
    return 'ಗುಂಪು $letter';
  }

  @override
  String get tkTooLoud => 'ತುಂಬಾ ಗದ್ದಲ!';

  @override
  String get tkCalm => 'ಚೆನ್ನಾಗಿದೆ, ಶಾಂತವಾಗಿದೆ';

  @override
  String get tkLimit => 'ಮಿತಿ';

  @override
  String get tkNoisePermission => 'ಶಬ್ದ ಮಾಪಕಕ್ಕೆ ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನೀಡಿ.';

  @override
  String get tkNoiseNoMic => 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಮೈಕ್ರೊಫೋನ್ ಇಲ್ಲ.';

  @override
  String get tkNoiseUnavailable =>
      'ಶಬ್ದ ಮಾಪಕ ಈಗ ಮೈಕ್ರೊಫೋನ್ ಬಳಸಲಾಗದು. ತರಗತಿ ಧ್ವನಿ ಅಥವಾ ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get tkNoiseLocal =>
      'ಧ್ವನಿಯ ಮಟ್ಟವನ್ನು ಮಾತ್ರ ಈ ಬೋರ್ಡ್‌ನಲ್ಲೇ ಅಳೆಯಲಾಗುತ್ತದೆ. ಏನನ್ನೂ ರೆಕಾರ್ಡ್ ಮಾಡುವುದಿಲ್ಲ.';

  @override
  String get tkDragToReveal => 'ತೋರಿಸಲು ಎಳೆಯಿರಿ';

  @override
  String get tkRevealAll => 'ಎಲ್ಲಾ ತೋರಿಸಿ';

  @override
  String get tkRemoveShade => 'ಶೇಡ್ ತೆಗೆಯಿರಿ';

  @override
  String get tkEndSpotlight => 'ಸ್ಪಾಟ್‌ಲೈಟ್ ನಿಲ್ಲಿಸಿ';

  @override
  String get tkSpotlightSize => 'ಸ್ಪಾಟ್‌ಲೈಟ್ ಗಾತ್ರ';

  @override
  String get simTitle => 'ಅನುಕರಣೆಗಳು';

  @override
  String get simHint => 'ಲೋಲಕ, ಪ್ರಕ್ಷೇಪಕ, ಗ್ರಾಫ್, ಭಿನ್ನರಾಶಿ, ಅಲೆಗಳು, ಪೈಥಾಗೊರಸ್';

  @override
  String get simOthers => 'ಇತರ ಅನುಕರಣೆಗಳು';

  @override
  String get simPendulum => 'ಸರಳ ಲೋಲಕ';

  @override
  String get simProjectile => 'ಪ್ರಕ್ಷೇಪಕ ಚಲನೆ';

  @override
  String get simGrapher => 'ಫಲನ ಗ್ರಾಫ್';

  @override
  String get simFractions => 'ಭಿನ್ನರಾಶಿ ಪಟ್ಟಿಗಳು';

  @override
  String get simWave => 'ಅಲೆಗಳು';

  @override
  String get simPythagoras => 'ಪೈಥಾಗೊರಸ್ ಪ್ರಮೇಯ';

  @override
  String get simLength => 'ಉದ್ದ';

  @override
  String get simGravity => 'ಗುರುತ್ವ';

  @override
  String get simStartAngle => 'ಆರಂಭಿಕ ಕೋನ';

  @override
  String get simSpeed => 'ವೇಗ';

  @override
  String get simAngle => 'ಕೋನ';

  @override
  String get simAmplitude => 'ವಿಸ್ತಾರ';

  @override
  String get simFrequency => 'ಆವರ್ತನ';

  @override
  String get simWavelength => 'ತರಂಗಾಂತರ';

  @override
  String simRange(String metres) {
    return 'ವ್ಯಾಪ್ತಿ $metres ಮೀ';
  }

  @override
  String simMaxHeight(String metres) {
    return 'ಗರಿಷ್ಠ ಎತ್ತರ $metres ಮೀ';
  }

  @override
  String simFlightTime(String seconds) {
    return 'ಸಮಯ $seconds ಸೆ.';
  }

  @override
  String simTop(int number) {
    return 'ಮೇಲೆ $number';
  }

  @override
  String simBottom(int number) {
    return 'ಕೆಳಗೆ $number';
  }

  @override
  String simSide(String name) {
    return 'ಬಾಹು $name';
  }

  @override
  String get simBadExpression => 'ಆ ಅಭಿವ್ಯಕ್ತಿಯನ್ನು ಓದಲಾಗುತ್ತಿಲ್ಲ';

  @override
  String get simDraw => 'ಬಿಡಿಸಿ';

  @override
  String get readAloud => 'ಗಟ್ಟಿಯಾಗಿ ಓದಿ';

  @override
  String get readerTitle => 'ಇಮರ್ಸಿವ್ ರೀಡರ್';

  @override
  String readerPageTitle(int number) {
    return 'ಪುಟ $number';
  }

  @override
  String get readerNothing =>
      'ಈ ಪುಟದಲ್ಲಿ ಓದಲು ಟೈಪ್ ಮಾಡಿದ ಪಠ್ಯ ಇಲ್ಲ. ಪಠ್ಯ ಟೈಪ್ ಮಾಡಿ, ಟಿಪ್ಪಣಿ ಸೇರಿಸಿ ಅಥವಾ AI ಪೆನ್‌ನಿಂದ ಕೈಬರಹ ಬದಲಿಸಿ.';

  @override
  String readerNoVoice(String language) {
    return 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ $language ಧ್ವನಿ ಇಲ್ಲ. ಸಾಧನದ ಪಠ್ಯದಿಂದ ಧ್ವನಿ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಸೇರಿಸಿ (Windows: Settings → Time & language → Speech).';
  }

  @override
  String get readerPrevious => 'ಹಿಂದಿನ ಪ್ಯಾರಾ';

  @override
  String get readerNext => 'ಮುಂದಿನ ಪ್ಯಾರಾ';

  @override
  String get readerPaper => 'ಕಾಗದ';

  @override
  String get readerCream => 'ಕ್ರೀಮ್';

  @override
  String get readerContrast => 'ಹೆಚ್ಚು ಕಾಂಟ್ರಾಸ್ಟ್';

  @override
  String get readerBlue => 'ತಿಳಿ ನೀಲಿ';

  @override
  String get readerLineFocus => 'ಸಾಲಿನ ಮೇಲೆ ಗಮನ';

  @override
  String get readerSlower => 'ನಿಧಾನ';

  @override
  String get readerHint => 'ಪುಟದ ಪಠ್ಯ, ದೊಡ್ಡದಾಗಿ, ಪದ ಪದವಾಗಿ ಗಟ್ಟಿಯಾಗಿ';

  @override
  String get insertPicture => 'ಚಿತ್ರ';

  @override
  String get insertPictureHintGallery => 'ಗ್ಯಾಲರಿಯಿಂದ';

  @override
  String get insertPictureHintFiles => 'ಈ ಬೋರ್ಡ್‌ನ ಫೈಲ್‌ಗಳಿಂದ';

  @override
  String get insertPhoto => 'ಫೋಟೋ ತೆಗೆಯಿರಿ';

  @override
  String get insertPhotoHint => 'ಈ ಬೋರ್ಡ್‌ನ ಕ್ಯಾಮೆರಾದಿಂದ';

  @override
  String get pictureCouldNotOpen => 'ಆ ಚಿತ್ರವನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.';

  @override
  String get libTitle => 'ಚಿತ್ರ ಸಂಗ್ರಹ';

  @override
  String get libHint =>
      'ರೇಖಾಚಿತ್ರಗಳು, ನಕ್ಷೆಗಳು ಮತ್ತು ಸ್ಟಿಕ್ಕರ್‌ಗಳು, ಉಚಿತ ಬಳಕೆಗೆ';

  @override
  String get libSearch => 'ಚಿತ್ರ ಹುಡುಕಿ (ಹೃದಯ, ಭಾರತದ ನಕ್ಷೆ, ಜ್ವಾಲಾಮುಖಿ…)';

  @override
  String get libAll => 'ಎಲ್ಲಾ';

  @override
  String get libBiology => 'ಜೀವಶಾಸ್ತ್ರ';

  @override
  String get libChemistry => 'ರಸಾಯನಶಾಸ್ತ್ರ';

  @override
  String get libPhysics => 'ಭೌತಶಾಸ್ತ್ರ';

  @override
  String get libMaths => 'ಗಣಿತ';

  @override
  String get libGeography => 'ಭೂಗೋಳ';

  @override
  String get libHistory => 'ಇತಿಹಾಸ';

  @override
  String get libEnglish => 'ಭಾಷೆಗಳು';

  @override
  String get libComputers => 'ಕಂಪ್ಯೂಟರ್';

  @override
  String get libEvs => 'ಪರಿಸರ ಅಧ್ಯಯನ ಮತ್ತು ಪ್ರಾಥಮಿಕ';

  @override
  String get libStickers => 'ಸ್ಟಿಕ್ಕರ್‌ಗಳು';

  @override
  String get libNothingFound => 'ಯಾವುದೇ ಚಿತ್ರ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಪದ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get libCredits =>
      'ಚಿತ್ರಗಳು ವಿಕಿಮೀಡಿಯಾ ಕಾಮನ್ಸ್ (ಸಾರ್ವಜನಿಕ ಡೊಮೇನ್, CC0, CC BY, CC BY-SA) ಮತ್ತು Microsoft Fluent Emoji (MIT) ಇಂದ. ಚಿತ್ರದ ಲೇಖಕ ಮತ್ತು ಪರವಾನಗಿಗಾಗಿ ⓘ ಒತ್ತಿ; ಶ್ರೇಯ ಚಿತ್ರದೊಂದಿಗೆ ಬೋರ್ಡ್‌ಗೆ ಹೋಗುತ್ತದೆ.';

  @override
  String get importTitle => 'PDF ಅಥವಾ PowerPoint';

  @override
  String get importHint =>
      'ಪ್ರತಿ ಪುಟ ಅಥವಾ ಸ್ಲೈಡ್ ಬರೆಯಲು ಒಂದು ಬೋರ್ಡ್ ಪುಟವಾಗುತ್ತದೆ';

  @override
  String importingFile(String name) {
    return '$name ತೆರೆಯಲಾಗುತ್ತಿದೆ';
  }

  @override
  String get importReading => 'ಫೈಲ್ ಓದಲಾಗುತ್ತಿದೆ…';

  @override
  String importPageOf(int done, int total) {
    return 'ಪುಟ $done / $total';
  }

  @override
  String importedPages(int count) {
    return 'ಈ ಪುಟದ ನಂತರ $count ಪುಟಗಳನ್ನು ಸೇರಿಸಲಾಗಿದೆ';
  }

  @override
  String get importOldPpt =>
      'ಇದು ಹಳೆಯ PowerPoint ಫೈಲ್ (.ppt). ಅದನ್ನು PowerPoint‌ನಲ್ಲಿ .pptx ಅಥವಾ PDF ಆಗಿ ಉಳಿಸಿ, ನಂತರ ಇಲ್ಲಿ ತೆರೆಯಿರಿ.';

  @override
  String get importNotSupported =>
      'ಬೋರ್ಡ್ PDF ಮತ್ತು PowerPoint (.pptx) ಫೈಲ್‌ಗಳನ್ನು ತೆರೆಯುತ್ತದೆ.';

  @override
  String get importPdfFailed =>
      'ಈ PDF ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಅದು ಹಾಳಾಗಿರಬಹುದು ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್‌ನಿಂದ ರಕ್ಷಿತವಾಗಿರಬಹುದು.';

  @override
  String get importPptxFailed =>
      'ಈ PowerPoint ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಅದನ್ನು PowerPoint‌ನಲ್ಲಿ PDF ಆಗಿ ಉಳಿಸಿ, ಆ PDF ತೆರೆಯಿರಿ.';

  @override
  String tourStepOf(int step, int total) {
    return '$total ರಲ್ಲಿ $step';
  }

  @override
  String get tourSkip => 'ಬಿಟ್ಟುಬಿಡಿ';

  @override
  String get tourNext => 'ಮುಂದೆ';

  @override
  String get tourGotIt => 'ಅರ್ಥವಾಯಿತು';

  @override
  String get tourWelcomeTitle => 'ನಿಮ್ಮ ಬೋರ್ಡ್‌ಗೆ ಸ್ವಾಗತ';

  @override
  String get tourWelcomeBody =>
      'ಪ್ರತಿ ತರಗತಿಯಲ್ಲಿ ಬಳಸುವ ಬಟನ್‌ಗಳ ಒಂದು ನಿಮಿಷದ ಪರಿಚಯ.';

  @override
  String get tourPenTitle => 'ಬರೆಯಿರಿ ಮತ್ತು ಬಿಡಿಸಿ';

  @override
  String get tourPenBody =>
      'ಬೆರಳು ಅಥವಾ ಸ್ಟೈಲಸ್‌ನಿಂದ ಬರೆಯಿರಿ. ಬಣ್ಣ ಮತ್ತು ದಪ್ಪಕ್ಕಾಗಿ ಪೆನ್ ಅನ್ನು ಮತ್ತೆ ಒತ್ತಿ. ಎರಡು ಬೆರಳುಗಳಿಂದ ಟ್ಯಾಪ್ ಮಾಡಿದರೆ ಅನ್‌ಡು, ಮೂರರಿಂದ ರೀಡು.';

  @override
  String get tourEraseTitle => 'ಅಳಿಸಿ';

  @override
  String get tourEraseBody => 'ಶಾಯಿಯ ಮೇಲೆ ಉಜ್ಜಿ. ಅನ್‌ಡು ಬೋರ್ಡ್‌ನ ಕೆಳಗಿದೆ.';

  @override
  String get tourInsertTitle => 'ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಿ';

  @override
  String get tourInsertBody =>
      'ಸಮೀಕರಣಗಳು, ಟಿಪ್ಪಣಿಗಳು, ಚಿತ್ರಗಳು, ಚಿತ್ರ ಸಂಗ್ರಹ, PDF ಅಥವಾ PowerPoint, 3D ಮಾದರಿಗಳು, ಲ್ಯಾಬ್‌ಗಳು ಮತ್ತು ಅನುಕರಣೆಗಳು.';

  @override
  String get tourToolsTitle => 'ತರಗತಿ ಉಪಕರಣಗಳು';

  @override
  String get tourToolsBody =>
      'ಟೈಮರ್, ಸ್ಟಾಪ್‌ವಾಚ್, ಹೆಸರು ಆಯ್ಕೆ, ದಾಳ, ಚಕ್ರ, ಶಬ್ದ ಮಾಪಕ, ಸ್ಕ್ರೀನ್ ಶೇಡ್, ಸ್ಪಾಟ್‌ಲೈಟ್ ಮತ್ತು ಇಮರ್ಸಿವ್ ರೀಡರ್.';

  @override
  String get tourAiTitle => 'KINETIX AI';

  @override
  String get tourAiBody =>
      'ಪಾಠದ ಬಗ್ಗೆ ಕೇಳಿ, ರಸಪ್ರಶ್ನೆ ಅಥವಾ ಮನೆಗೆಲಸ ಮಾಡಿ, ಅಥವಾ ಬೋರ್ಡ್ ಮೇಲೆ ಬರೆದ ಲೆಕ್ಕ ಬಿಡಿಸಿ.';

  @override
  String get tourBooksTitle => 'ಪುಸ್ತಕಗಳು';

  @override
  String get tourBooksBody =>
      'ನಿಮ್ಮ ಪಠ್ಯಕ್ರಮ: ಪ್ರತಿ ವಿಷಯದ ಪಾಠ, ಮುಖ್ಯ ಅಂಶಗಳು ಮತ್ತು ಪ್ರಶ್ನೆಗಳು, ಬೇಕಿದ್ದರೆ ಗಟ್ಟಿಯಾಗಿ ಓದಿ.';

  @override
  String get tourPagesTitle => 'ಪುಟಗಳು';

  @override
  String get tourPagesBody =>
      'ಮುಂದಿನ ಪುಟಕ್ಕೆ ಹೋಗಿ; ಕೊನೆಯ ಪುಟದಲ್ಲಿ ಇದು ಹೊಸ ಪುಟ ಸೇರಿಸುತ್ತದೆ.';

  @override
  String get tourRecordTitle => 'ಪಾಠವನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಿ';

  @override
  String get tourRecordBody =>
      'ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತೆ ನೋಡಲು ಬೋರ್ಡ್ ಮತ್ತು ನಿಮ್ಮ ಧ್ವನಿಯನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡುತ್ತದೆ.';

  @override
  String get tourHelpTitle => 'ಸಹಾಯ ಯಾವಾಗಲೂ ಇಲ್ಲಿದೆ';

  @override
  String get tourHelpBody =>
      'ಸಹಾಯ, ಈ ಪರಿಚಯ ಮತ್ತೆ ಮತ್ತು ಐದು ನಿಮಿಷದ ಅಭ್ಯಾಸಕ್ಕಾಗಿ ಈ ಮೆನು ತೆರೆಯಿರಿ. ಕೀಬೋರ್ಡ್‌ನಲ್ಲಿ ? ಒತ್ತಬಹುದು.';

  @override
  String get tourPractise => 'ಈಗ ಅಭ್ಯಾಸ ಮಾಡಿ';

  @override
  String get helpTitle => 'ಸಹಾಯ';

  @override
  String get helpSubtitle => 'ಚಿಕ್ಕ ಉತ್ತರಗಳು, ಮತ್ತು ಬೋರ್ಡ್ ಮೇಲೆ ಬಟನ್ ತೋರಿಸಿ.';

  @override
  String get helpShowAround => 'ನನಗೆ ಸುತ್ತಿ ತೋರಿಸಿ';

  @override
  String get helpPractise => '5 ನಿಮಿಷದಲ್ಲಿ ಅಭ್ಯಾಸ ಮಾಡಿ';

  @override
  String get helpSearch => 'ನಾನು ಹೇಗೆ…';

  @override
  String get helpNothing =>
      'ಏನೂ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಪದ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ನನಗೆ ಸುತ್ತಿ ತೋರಿಸಿ.';

  @override
  String get helpShowMe => 'ನನಗೆ ತೋರಿಸಿ';

  @override
  String get helpGroupWriting => 'ಬೋರ್ಡ್ ಮೇಲೆ ಬರೆಯುವುದು';

  @override
  String get helpGroupContent => 'ಪುಟಗಳು ಮತ್ತು ವಿಷಯ';

  @override
  String get helpGroupClass => 'ಬೋಧನಾ ಉಪಕರಣಗಳು';

  @override
  String get helpGroupAi => 'KINETIX AI ಮತ್ತು ಪುಸ್ತಕಗಳು';

  @override
  String get helpGroupSettings => 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು';

  @override
  String get helpWriteTitle => 'ಬರೆಯಿರಿ ಮತ್ತು ಬಿಡಿಸಿ';

  @override
  String get helpWrite1 =>
      'ಎಡಭಾಗದ ಪೆನ್ ಒತ್ತಿ, ಬೆರಳು ಅಥವಾ ಸ್ಟೈಲಸ್‌ನಿಂದ ಬರೆಯಿರಿ.';

  @override
  String get helpWrite2 => 'ಎರಡು ಬೆರಳುಗಳಿಂದ ಬೋರ್ಡ್ ಸರಿಸಿ ಮತ್ತು ಜೂಮ್ ಮಾಡಿ.';

  @override
  String get helpEraseTitle => 'ಅಳಿಸಿ ಅಥವಾ ಅನ್‌ಡು ಮಾಡಿ';

  @override
  String get helpErase1 =>
      'ಎರೇಸರ್ ಒತ್ತಿ ಶಾಯಿಯ ಮೇಲೆ ಉಜ್ಜಿ. ಪುಟ ತೆರವುಗೊಳಿಸಲು ಮತ್ತೆ ಒತ್ತಿ.';

  @override
  String get helpErase2 => 'ತಪ್ಪಾಯಿತೇ? ಕೆಳಗೆ ಅನ್‌ಡು ಒತ್ತಿ.';

  @override
  String get helpShapesTitle => 'ಆಕೃತಿಗಳು';

  @override
  String get helpShapes1 =>
      'ಆಕೃತಿಗಳು ಒತ್ತಿ, ಒಂದನ್ನು ಆರಿಸಿ ಬೋರ್ಡ್ ಮೇಲೆ ಎಳೆಯಿರಿ.';

  @override
  String get helpShapes2 =>
      'ಗಾತ್ರ ಬದಲಿಸಲು, ತಿರುಗಿಸಲು, ಬಣ್ಣ ಹಚ್ಚಲು ಅಥವಾ ನಕಲಿಸಲು ಅದನ್ನು ಆರಿಸಿ.';

  @override
  String get helpTextTitle => 'ಪಠ್ಯ ಟೈಪ್ ಮಾಡಿ';

  @override
  String get helpText1 => 'T ಒತ್ತಿ, ನಂತರ ಪಠ್ಯ ಬೇಕಾದಲ್ಲಿ ಬೋರ್ಡ್ ಮೇಲೆ ಒತ್ತಿ.';

  @override
  String get helpPagesTitle => 'ಪುಟ ತಿರುಗಿಸಿ ಮತ್ತು ಸೇರಿಸಿ';

  @override
  String get helpPages1 =>
      'ಕೆಳಗಿನ ಬಾಣಗಳು ಪುಟ ತಿರುಗಿಸುತ್ತವೆ; ಕೊನೆಯ ಪುಟದಲ್ಲಿ + ಹೊಸದನ್ನು ಸೇರಿಸುತ್ತದೆ.';

  @override
  String get helpPages2 =>
      'ಬೋರ್ಡ್ ಉಳಿಸಲು ಮತ್ತು ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಲು ಕೆಳಗಿನ ಎಡಭಾಗದಿಂದ ಉಳಿಸಿ.';

  @override
  String get helpPictureTitle => 'ಚಿತ್ರ ಸೇರಿಸಿ';

  @override
  String get helpPicture1 =>
      '+ (ಸೇರಿಸಿ) ಒತ್ತಿ, ನಂತರ ಈ ಬೋರ್ಡ್‌ನಿಂದ ಚಿತ್ರಕ್ಕಾಗಿ ಚಿತ್ರ, ಅಥವಾ ಚಿತ್ರ ಸಂಗ್ರಹ.';

  @override
  String get helpPicture2 => 'ಸಂಗ್ರಹದ ಚಿತ್ರಗಳ ಕೆಳಗೆ ಅವುಗಳ ಶ್ರೇಯ ಇರುತ್ತದೆ.';

  @override
  String get helpImportTitle => 'PDF ಅಥವಾ PowerPoint ತೆರೆಯಿರಿ';

  @override
  String get helpImport1 =>
      '+ (ಸೇರಿಸಿ) ಒತ್ತಿ, ನಂತರ PDF ಅಥವಾ PowerPoint, ಮತ್ತು ಫೈಲ್ ಆರಿಸಿ.';

  @override
  String get helpImport2 =>
      'ಪ್ರತಿ ಪುಟ ಅಥವಾ ಸ್ಲೈಡ್ ಮೇಲೆ ಬರೆಯಬಹುದಾದ ಬೋರ್ಡ್ ಪುಟವಾಗುತ್ತದೆ; ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆಯೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String get helpSimsTitle => 'ಅನುಕರಣೆಗಳು';

  @override
  String get helpSims1 => '+ (ಸೇರಿಸಿ) ಅಥವಾ ಉಪಕರಣಗಳು ಒತ್ತಿ, ನಂತರ ಅನುಕರಣೆಗಳು.';

  @override
  String get helpSims2 =>
      'ಸ್ಲೈಡರ್ ಸರಿಸಿ, ತರಗತಿ ಲೋಲಕ, ಪ್ರಕ್ಷೇಪಕ ಅಥವಾ ಅಲೆ ಬದಲಾಗುವುದನ್ನು ನೋಡುತ್ತದೆ.';

  @override
  String get helpToolkitTitle => 'ಟೈಮರ್, ಹೆಸರು ಆಯ್ಕೆ ಮತ್ತು ದಾಳ';

  @override
  String get helpToolkit1 =>
      'ಉಪಕರಣಗಳು ಒತ್ತಿ ಒಂದನ್ನು ಆರಿಸಿ; ಅದು ಬೋರ್ಡ್ ಮೇಲೆ ತೇಲುತ್ತದೆ.';

  @override
  String get helpToolkit2 => 'ಅದನ್ನು ಸರಿಸಲು ಅದರ ಹೆಸರಿನಿಂದ ಎಳೆಯಿರಿ.';

  @override
  String get helpShadeTitle => 'ಸ್ಕ್ರೀನ್ ಶೇಡ್ ಮತ್ತು ಸ್ಪಾಟ್‌ಲೈಟ್';

  @override
  String get helpShade1 =>
      'ಶೇಡ್ ಬೋರ್ಡ್ ಮುಚ್ಚುತ್ತದೆ; ಸಾಲು ಸಾಲಾಗಿ ತೋರಿಸಲು ಅದರ ಹಿಡಿಕೆಯನ್ನು ಕೆಳಗೆ ಎಳೆಯಿರಿ.';

  @override
  String get helpShade2 =>
      'ಸ್ಪಾಟ್‌ಲೈಟ್ ನೀವು ಎಳೆಯುವ ವೃತ್ತ ಬಿಟ್ಟು ಉಳಿದೆಲ್ಲವನ್ನೂ ಕತ್ತಲಾಗಿಸುತ್ತದೆ.';

  @override
  String get helpReadTitle => 'ಗಟ್ಟಿಯಾಗಿ ಓದಿ';

  @override
  String get helpRead1 =>
      'ಪಠ್ಯ ಆರಿಸಿ ಗಟ್ಟಿಯಾಗಿ ಓದಿ ಒತ್ತಿ, ಅಥವಾ ಪುಟಕ್ಕಾಗಿ ಉಪಕರಣಗಳು → ಇಮರ್ಸಿವ್ ರೀಡರ್.';

  @override
  String get helpRead2 =>
      'ಪುಸ್ತಕಗಳು ಮತ್ತು ಲ್ಯಾಬ್‌ಗಳೂ ಪಾಠ ಮತ್ತು ಹಂತಗಳನ್ನು ಓದುತ್ತವೆ, ಬೋರ್ಡ್‌ನಲ್ಲಿ ಧ್ವನಿ ಇದ್ದರೆ ಇಂಗ್ಲಿಷ್, ಹಿಂದಿ ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ.';

  @override
  String get helpRecordTitle => 'ಪಾಠ ರೆಕಾರ್ಡ್ ಮಾಡಿ';

  @override
  String get helpRecord1 =>
      'ಬೋರ್ಡ್ ಮತ್ತು ನಿಮ್ಮ ಧ್ವನಿ ರೆಕಾರ್ಡ್ ಮಾಡಲು ಕೆಂಪು ಬಟನ್ ಒತ್ತಿ.';

  @override
  String get helpRecord2 => 'ನಿಲ್ಲಿಸಿ ಉಳಿಸಲು ಮತ್ತೆ ಒತ್ತಿ.';

  @override
  String get helpAiTitle => 'KINETIX AI ಅನ್ನು ಕೇಳಿ';

  @override
  String get helpAi1 =>
      'ಬಲಭಾಗದ AI ಬಟನ್‌ಗಳನ್ನು ಒತ್ತಿ: ಕೇಳಿ, ರಸಪ್ರಶ್ನೆ, ಮನೆಗೆಲಸ, ಗಣಿತ ಪರಿಹಾರಕ.';

  @override
  String get helpAi2 =>
      'ಬೋರ್ಡ್ ಮೇಲೆ ಏನನ್ನಾದರೂ ಆರಿಸಿ, ಅದರ ಬಗ್ಗೆ ಕೇಳಲು AI ಯಿಂದ ಓದಿ ಒತ್ತಿ.';

  @override
  String get helpBooksTitle => 'ಪುಸ್ತಕಗಳಿಂದ ಪಾಠಗಳು';

  @override
  String get helpBooks1 => 'ಬಲಭಾಗದಲ್ಲಿ ಪುಸ್ತಕಗಳು ಒತ್ತಿ ಒಂದು ವಿಷಯ ತೆರೆಯಿರಿ.';

  @override
  String get helpBooks2 =>
      'ಗಟ್ಟಿಯಾಗಿ ಓದಿ ಪಾಠವನ್ನು ದೊಡ್ಡದಾಗಿ ತೆರೆದು ಪದ ಪದವಾಗಿ ಓದುತ್ತದೆ.';

  @override
  String get helpSettingsTitle => 'ಭಾಷೆ, ವಿನ್ಯಾಸ ಮತ್ತು ಸ್ಪರ್ಶ';

  @override
  String get helpSettings1 =>
      'ಕೆಳಗಿನ ಎಡಭಾಗದ ಮೆನು ತೆರೆಯಿರಿ, ನಂತರ ಬೋರ್ಡ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು.';

  @override
  String get practiceTitle => 'ಅಭ್ಯಾಸ ಬೋರ್ಡ್';

  @override
  String get practiceNotSaved =>
      'ಇಲ್ಲಿ ಏನನ್ನೂ ಉಳಿಸುವುದಿಲ್ಲ. ಎಲ್ಲವನ್ನೂ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String practiceCount(int done, int total) {
    return 'ಅಭ್ಯಾಸ: $total ರಲ್ಲಿ $done ಮುಗಿದಿದೆ';
  }

  @override
  String get practiceReady => 'ನೀವು ಸಿದ್ಧರಿದ್ದೀರಿ!';

  @override
  String get practiceDoneBody =>
      'ತರಗತಿಗೆ ಬೇಕಾದ ಎಲ್ಲವನ್ನೂ ನೀವು ಮಾಡಿದ್ದೀರಿ. ಸಹಾಯ ಕೆಳಗಿನ ಎಡಭಾಗದ ಮೆನುವಿನಲ್ಲಿದೆ.';

  @override
  String get practiceShowList => 'ಪಟ್ಟಿ ತೋರಿಸಿ';

  @override
  String get practiceHideList => 'ಪಟ್ಟಿ ಮರೆಮಾಡಿ';

  @override
  String get practiceFinish => 'ಅಭ್ಯಾಸ ಮುಗಿಸಿ';

  @override
  String get practiceEnd => 'ಅಭ್ಯಾಸ ನಿಲ್ಲಿಸಿ';

  @override
  String get practiceWrite => 'ಪೆನ್‌ನಿಂದ ಏನಾದರೂ ಬರೆಯಿರಿ';

  @override
  String get practiceErase => 'ಅದನ್ನು ಅಳಿಸಿ, ಅಥವಾ ಅನ್‌ಡು ಒತ್ತಿ';

  @override
  String get practiceShape => 'ಒಂದು ಆಕೃತಿ ಬಿಡಿಸಿ';

  @override
  String get practicePage => 'ಹೊಸ ಪುಟಕ್ಕೆ ಹೋಗಿ';

  @override
  String get practicePicture => 'ಚಿತ್ರ ಸಂಗ್ರಹದಿಂದ ಒಂದು ಚಿತ್ರ ಸೇರಿಸಿ';

  @override
  String get practiceTimer => 'ಉಪಕರಣಗಳಿಂದ ಟೈಮರ್ ಪ್ರಾರಂಭಿಸಿ';

  @override
  String get practiceEnded => 'ಅಭ್ಯಾಸ ಮುಗಿಯಿತು: ನಿಮ್ಮ ಬೋರ್ಡ್ ಮೊದಲಿನಂತಿದೆ.';

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

  @override
  String get toolConceptVideos => 'ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳು';

  @override
  String get conceptVideosTitle => 'ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳು';

  @override
  String get conceptVideosForPeriod => 'ಈ ಪೀರಿಯಡ್‌ನ ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳು';

  @override
  String conceptVideosNext(String time) {
    return 'ಮುಂದಿನ ಪೀರಿಯಡ್ $time ಕ್ಕೆ';
  }

  @override
  String get conceptVideosSkip => 'ಬಿಟ್ಟುಬಿಡಿ';

  @override
  String get conceptVideosNone => 'ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳಿಲ್ಲ.';

  @override
  String get conceptVideosNoPeriod =>
      'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಈಗ ಅಥವಾ ಇಂದು ನಂತರ ತರಗತಿ ಇಲ್ಲ.';

  @override
  String get conceptVideosSignIn =>
      'ನಿಮ್ಮ ತರಗತಿಯ ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳನ್ನು ನೋಡಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get conceptVideosCouldNotLoad =>
      'ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.';

  @override
  String get conceptVideosUnsupported =>
      'ಈ ಸಾಧನದಲ್ಲಿ ವೀಡಿಯೊಗಳು ಪ್ಲೇ ಆಗುವುದಿಲ್ಲ. ಬೋರ್ಡ್‌ನ Android ಅಥವಾ Windows ಆ್ಯಪ್ ಬಳಸಿ.';

  @override
  String get conceptVideosFromYouTube => 'ಯೂಟ್ಯೂಬ್‌ನಿಂದ ಪ್ಲೇ ಆಗುತ್ತದೆ';

  @override
  String get conceptVideosSourceLessonPlan => 'ಇಂದಿನ ಪಾಠ ಯೋಜನೆಯಿಂದ';

  @override
  String get conceptVideosSourceYearPlan => 'ವಾರ್ಷಿಕ ಯೋಜನೆಯಿಂದ';

  @override
  String get conceptVideosSourceSyllabus => 'ಪಠ್ಯಕ್ರಮದ ಮುಂದಿನ ವಿಷಯ';

  @override
  String conceptVideosPlay(String title) {
    return '$title ಪ್ಲೇ ಮಾಡಿ';
  }

  @override
  String get answerCover => 'ಉತ್ತರ ನೋಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get answerHint => 'ತೋರಿಸುವವರೆಗೆ ಮುಚ್ಚಿರುವ ಉತ್ತರ';

  @override
  String get bgFourLine => 'ನಾಲ್ಕು-ಗೆರೆ';

  @override
  String get bringToFront => 'ಮುಂದಕ್ಕೆ ತನ್ನಿ';

  @override
  String get sendToBack => 'ಹಿಂದಕ್ಕೆ ಕಳುಹಿಸಿ';

  @override
  String get circuitAmmeter => 'ಆಮ್ಮೀಟರ್';

  @override
  String get circuitBattery => 'ಬ್ಯಾಟರಿ';

  @override
  String get circuitBulb => 'ಬಲ್ಬ್';

  @override
  String get circuitCell => 'ಕೋಶ';

  @override
  String get circuitEarth => 'ಭೂಸಂಪರ್ಕ';

  @override
  String get circuitLed => 'ಎಲ್‌ಇಡಿ';

  @override
  String get circuitResistor => 'ರೋಧಕ';

  @override
  String get circuitSwitchClosed => 'ಸ್ವಿಚ್ (ಮುಚ್ಚಿದ)';

  @override
  String get circuitSwitchOpen => 'ಸ್ವಿಚ್ (ತೆರೆದ)';

  @override
  String get circuitVoltmeter => 'ವೋಲ್ಟ್‌ಮೀಟರ್';

  @override
  String get circuitWire => 'ತಂತಿ';

  @override
  String get copy => 'ನಕಲಿಸಿ';

  @override
  String get paste => 'ಅಂಟಿಸಿ';

  @override
  String get duplicate => 'ಪ್ರತಿ ಮಾಡಿ';

  @override
  String get delete => 'ಅಳಿಸಿ';

  @override
  String get edit => 'ಬದಲಿಸಿ';

  @override
  String get group => 'ಗುಂಪು ಮಾಡಿ';

  @override
  String get ungroup => 'ಗುಂಪು ಬಿಡಿಸಿ';

  @override
  String get fill => 'ಬಣ್ಣ ತುಂಬಿ';

  @override
  String get noFill => 'ಬಣ್ಣ ತೆಗೆಯಿರಿ';

  @override
  String get fillShapes => 'ಆಕೃತಿಗಳಿಗೆ ಬಣ್ಣ ತುಂಬಿ';

  @override
  String get equationLatex => 'ಸಮೀಕರಣ (LaTeX)';

  @override
  String get equationPreview => 'ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ, ಅಥವಾ ಚಿಹ್ನೆ ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get putOnBoard => 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ';

  @override
  String get flowDecision => 'ನಿರ್ಧಾರ';

  @override
  String get flowInputOutput => 'ಇನ್‌ಪುಟ್ / ಔಟ್‌ಪುಟ್';

  @override
  String get flowProcess => 'ಪ್ರಕ್ರಿಯೆ';

  @override
  String get flowStartEnd => 'ಪ್ರಾರಂಭ / ಅಂತ್ಯ';

  @override
  String get graphCannotRead => 'ಈ ಫಲನವನ್ನು ಓದಲಾಗುವುದಿಲ್ಲ';

  @override
  String get graphFunction => 'ಫಲನ';

  @override
  String get graphHint => 'ಉದಾ: 2x^2 - 3, sin(x), sqrt(x)';

  @override
  String get graphXRange => 'x, − ಇಂದ + ವರೆಗೆ';

  @override
  String get graphYRange => 'y, − ಇಂದ + ವರೆಗೆ';

  @override
  String get hideProtractor => 'ಕೋನಮಾಪಕ ಮರೆಮಾಡಿ';

  @override
  String get hideRuler => 'ಅಳತೆಪಟ್ಟಿ ಮರೆಮಾಡಿ';

  @override
  String get turn => 'ತಿರುಗಿಸಿ';

  @override
  String get typeHint => 'ಟೈಪ್ ಮಾಡಿ…';

  @override
  String get inputTitle => 'ಯಾವುದರಿಂದ ಬರೆಯುವುದು';

  @override
  String get inputHint =>
      'ಪೆನ್: ಪೆನ್ ಮಾತ್ರ ಬರೆಯುತ್ತದೆ, ಬೆರಳುಗಳು ಬೋರ್ಡ್ ಸರಿಸುತ್ತವೆ. ಸ್ವಯಂ: ಪೆನ್ ಬಳಸುವವರೆಗೆ ಬೆರಳುಗಳು ಬರೆಯುತ್ತವೆ.';

  @override
  String get inputAuto => 'ಸ್ವಯಂ';

  @override
  String get inputPen => 'ಪೆನ್';

  @override
  String get inputFinger => 'ಬೆರಳು';

  @override
  String get insertAnswerHint => 'ತರಗತಿಯಲ್ಲಿ ಟ್ಯಾಪ್ ಮಾಡುವವರೆಗೆ ಮುಚ್ಚಿರುತ್ತದೆ';

  @override
  String get insertEquationHint => 'ಭಿನ್ನರಾಶಿ, ಮೂಲ ಮತ್ತು ಘಾತ, ಮುದ್ರಣದಂತೆ';

  @override
  String get insertModelHint =>
      'ಬೋರ್ಡ್ ಪಕ್ಕ ತೆರೆಯುತ್ತದೆ; ಅದರ ಚಿತ್ರವನ್ನು ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ';

  @override
  String get tapToPlace => 'ಇಡಲು ಬೋರ್ಡ್ ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get laserHint => 'ಬರೆಯದೆ ತೋರಿಸುತ್ತದೆ';

  @override
  String get kitAddWord => 'ಪದ ಸೇರಿಸಿ';

  @override
  String get kitAiForLesson => 'ಈ ಪಾಠಕ್ಕೆ KINETIX AI';

  @override
  String get kitAll => 'ಎಲ್ಲ';

  @override
  String get kitAtomBall => 'ಪರಮಾಣು ಚೆಂಡು';

  @override
  String get kitBinary => 'ದ್ವಿಮಾನ';

  @override
  String get kitBohrModel => 'ಬೋರ್ ಮಾದರಿ';

  @override
  String get kitDecimal => 'ದಶಮಾಂಶ ಸಂಖ್ಯೆ';

  @override
  String kitDrawTimeline(int count) {
    return 'ಕಾಲರೇಖೆ ಬರೆಯಿರಿ ($count)';
  }

  @override
  String get kitElementCard => 'ಧಾತು ಕಾರ್ಡ್';

  @override
  String get kitIndia => 'ಭಾರತ';

  @override
  String get kitWorld => 'ಜಗತ್ತು';

  @override
  String get kitMore => 'ಈ ಕಿಟ್‌ನಲ್ಲಿ';

  @override
  String get kitMoreHint =>
      'ಮೇಲಿನ ಟ್ಯಾಬ್‌ಗಳಲ್ಲಿ ಈ ವಿಷಯದ ಸಾಮಗ್ರಿ ಇದೆ. ಬೋರ್ಡ್‌ಗೆ ಹಾಕಲು ಯಾವುದನ್ನಾದರೂ ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String get kitPickEvents => 'ಕಾಲರೇಖೆಗೆ ಘಟನೆಗಳನ್ನು ಆರಿಸಿ';

  @override
  String get kitSearchFormulas => 'ಸೂತ್ರಗಳನ್ನು ಹುಡುಕಿ';

  @override
  String get kitSeeAndDo => 'ನೋಡಿ ಮತ್ತು ಮಾಡಿ';

  @override
  String get kitShort => 'ಕಿಟ್';

  @override
  String get kitStarGive => 'ಒಂದು ನಕ್ಷತ್ರ ಕೊಡಿ';

  @override
  String get kitStarRemove => 'ಒಂದು ನಕ್ಷತ್ರ ಹಿಂಪಡೆಯಿರಿ';

  @override
  String kitStarOfTheDay(String name) {
    return 'ಇಂದಿನ ನಕ್ಷತ್ರ: $name';
  }

  @override
  String get kitStarsNoClass =>
      'ಮಕ್ಕಳಿಗೆ ನಕ್ಷತ್ರ ಕೊಡಲು ವೇಳಾಪಟ್ಟಿಯ ತರಗತಿಯೊಂದಿಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get kitWordsHint =>
      'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಬರೆದ ಪದಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ. ದೊಡ್ಡ ಪದ ಕಾರ್ಡ್‌ಗಾಗಿ ಒಂದನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String get kitThisLesson => 'ಈ ಪಾಠ';

  @override
  String get kitFormulas => 'ಸೂತ್ರಗಳು';

  @override
  String get kitConstants => 'ಸ್ಥಿರಾಂಕಗಳು';

  @override
  String get kitPeriodic => 'ಆವರ್ತಕ ಕೋಷ್ಟಕ';

  @override
  String get kitIons => 'ಅಯಾನುಗಳು';

  @override
  String get kitDates => 'ಮುಖ್ಯ ದಿನಾಂಕಗಳು';

  @override
  String get kitWords => 'ಪದಗೋಡೆ';

  @override
  String get kitLogic => 'ತರ್ಕ ದ್ವಾರಗಳು';

  @override
  String get kitStars => 'ತರಗತಿಯ ನಕ್ಷತ್ರಗಳು';

  @override
  String kitValency(int valency) {
    return 'ವೇಲೆನ್ಸಿ $valency';
  }

  @override
  String get kitPeriodicHint =>
      'ಕಾರ್ಡ್, ಬೋರ್ ಮಾದರಿ ಅಥವಾ ಪರಮಾಣು ಚೆಂಡಿಗೆ ಧಾತುವನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String get kitLogicHint =>
      'ಸತ್ಯ ಕೋಷ್ಟಕವನ್ನು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಬರೆಯಲು ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String subjectKit(String subject) {
    return '$subject ಕಿಟ್';
  }

  @override
  String get layoutTitle => 'ವಿನ್ಯಾಸ';

  @override
  String get layoutHint =>
      'ರೈಲುಗಳಲ್ಲಿ ಉಪಕರಣಗಳು ಬೋರ್ಡ್‌ನ ಬದಿಗಳಲ್ಲಿ; ಟೂಲ್‌ಬಾರ್‌ನಲ್ಲಿ ಕೆಳಗೆ.';

  @override
  String get layoutRails => 'ರೈಲುಗಳು';

  @override
  String get layoutBottomBar => 'ಕೆಳಗಿನ ಟೂಲ್‌ಬಾರ್';

  @override
  String get simpleBoardTitle => 'ಸರಳ ಬೋರ್ಡ್';

  @override
  String get simpleBoardHint =>
      'LKG ಯಿಂದ 5ನೇ ತರಗತಿಗೆ ಹೆಸರಿನೊಂದಿಗೆ ದೊಡ್ಡ ಉಪಕರಣಗಳು, Andika ಅಕ್ಷರ ಮತ್ತು ತರಗತಿಯ ನಕ್ಷತ್ರಗಳು. ಸ್ವಯಂ ಆ ತರಗತಿಗಳಿಗೆ ಆನ್ ಮಾಡುತ್ತದೆ.';

  @override
  String get simpleBoardAuto => 'ಸ್ವಯಂ';

  @override
  String get simpleBoardOn => 'ಆನ್';

  @override
  String get simpleBoardOff => 'ಆಫ್';

  @override
  String get noteAnswer => 'ಮುಚ್ಚಿದ ಉತ್ತರ';

  @override
  String get noteSticky => 'ಅಂಟು ಟಿಪ್ಪಣಿ';

  @override
  String get numberFrom => 'ಇಂದ';

  @override
  String get numberTo => 'ವರೆಗೆ';

  @override
  String get numberStep => 'ಹೆಜ್ಜೆ';

  @override
  String get openLab => 'ಪ್ರಯೋಗಾಲಯ ತೆರೆಯಿರಿ';

  @override
  String get openModel => '3D ಮಾದರಿ ತೆರೆಯಿರಿ';

  @override
  String get readWithAi => 'AI ಮೂಲಕ ಓದಿ';

  @override
  String get snapshotAdded =>
      'ಚಿತ್ರ ಬೋರ್ಡ್‌ಗೆ ಹಾಕಲಾಗಿದೆ. ಮತ್ತೆ ತೆರೆಯಲು ಅದನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.';

  @override
  String get snapshotToBoard => 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ';

  @override
  String get stChemEquation => 'ರಾಸಾಯನಿಕ ಸಮೀಕರಣ';

  @override
  String get stCode => 'ಕೋಡ್ ಬ್ಲಾಕ್';

  @override
  String get stEquation => 'ಸಮೀಕರಣ';

  @override
  String get stGraph => 'ಗ್ರಾಫ್';

  @override
  String get stNumberLine => 'ಸಂಖ್ಯಾ ರೇಖೆ';

  @override
  String get stWordCard => 'ಪದ ಕಾರ್ಡ್';

  @override
  String get stGeometry => 'ರೇಖಾಗಣಿತ';

  @override
  String get stCircuits => 'ಸರ್ಕ್ಯೂಟ್‌ಗಳು';

  @override
  String get stAtoms => 'ಪರಮಾಣುಗಳು';

  @override
  String get stTimeline => 'ಕಾಲರೇಖೆ';

  @override
  String get stFlowchart => 'ಹರಿವು ನಕ್ಷೆ';

  @override
  String get stFourLine => 'ನಾಲ್ಕು-ಗೆರೆ ಕಾಗದ';

  @override
  String get stGrammar => 'ವ್ಯಾಕರಣ ಬಣ್ಣಗಳು';

  @override
  String get subjectMaths => 'ಗಣಿತ';

  @override
  String get subjectPhysics => 'ಭೌತಶಾಸ್ತ್ರ';

  @override
  String get subjectChemistry => 'ರಸಾಯನಶಾಸ್ತ್ರ';

  @override
  String get subjectBiology => 'ಜೀವಶಾಸ್ತ್ರ';

  @override
  String get subjectScience => 'ವಿಜ್ಞಾನ';

  @override
  String get subjectEvs => 'ಪರಿಸರ ಅಧ್ಯಯನ';

  @override
  String get subjectGeography => 'ಭೂಗೋಳ';

  @override
  String get subjectHistory => 'ಇತಿಹಾಸ';

  @override
  String get subjectCivics => 'ಪೌರನೀತಿ';

  @override
  String get subjectCommerce => 'ವಾಣಿಜ್ಯ';

  @override
  String get subjectEnglish => 'ಇಂಗ್ಲಿಷ್';

  @override
  String get subjectLanguages => 'ಭಾಷೆಗಳು';

  @override
  String get subjectComputer => 'ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ';

  @override
  String get subjectArt => 'ಕಲೆ';

  @override
  String get subjectGeneral => 'ತರಗತಿ';

  @override
  String get toolCompass => 'ಕೈವಾರ';

  @override
  String get toolInsert => 'ಸೇರಿಸಿ';

  @override
  String get toolLaser => 'ಲೇಸರ್ ಪಾಯಿಂಟರ್';

  @override
  String get toolMove => 'ಬೋರ್ಡ್ ಸರಿಸಿ';

  @override
  String get toolText => 'ಪಠ್ಯ';

  @override
  String get zoomFit => 'ಎಲ್ಲವನ್ನೂ ತೋರಿಸಿ';

  @override
  String get zoomIn => 'ದೊಡ್ಡದು ಮಾಡಿ';

  @override
  String get zoomOut => 'ಚಿಕ್ಕದು ಮಾಡಿ';

  @override
  String get zoomReset => '100% ಗೆ ಹಿಂತಿರುಗಿ';

  @override
  String get aiPen => 'AI ಪೆನ್';

  @override
  String get aiPenTitle => 'AI ಪೆನ್: ನಿಮ್ಮ ಕೈಬರಹದಿಂದ ಆಕಾರಗಳು, ಗಣಿತ ಮತ್ತು ಪದಗಳು';

  @override
  String get aiPenModeAuto => 'ಸ್ವಲ್ಪ ನಿಲ್ಲಿಸಿದಾಗ';

  @override
  String get aiPenModeAutoHint =>
      'ಎಂದಿನಂತೆ ಬರೆಯಿರಿ; ನಿಲ್ಲಿಸಿದ ಸುಮಾರು ಒಂದು ಸೆಕೆಂಡಿನ ನಂತರ ಅದು ಬದಲಾಗುತ್ತದೆ.';

  @override
  String get aiPenModeLive => 'ಪದದಿಂದ ಪದಕ್ಕೆ';

  @override
  String get aiPenModeLiveHint =>
      'ಮುಂದಿನ ಪದ ಆರಂಭಿಸಿದ ತಕ್ಷಣ ಹಿಂದಿನ ಪದ ಬದಲಾಗುತ್ತದೆ.';

  @override
  String get aiPenModeTap => 'ನಾನು ಬದಲಿಸಿ ಒತ್ತಿದಾಗ';

  @override
  String get aiPenModeTapHint =>
      'ನೀವು ಬದಲಿಸಿ ಒತ್ತುವವರೆಗೆ ಶಾಯಿ ಬರೆದಂತೆಯೇ ಇರುತ್ತದೆ.';

  @override
  String get aiPenConvert => 'ಬದಲಿಸಿ';

  @override
  String get aiPenWordsLanguage => 'ಪದಗಳನ್ನು ಓದುವ ಭಾಷೆ';

  @override
  String get aiPenTapHint =>
      'AI ಪೆನ್ ಬದಲಿಸಿದುದರ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ: ಬೇರೆ ಓದುಗಳನ್ನು ನೋಡಿ ಅಥವಾ ನಿಮ್ಮ ಶಾಯಿಯನ್ನು ಮರಳಿ ಪಡೆಯಿರಿ. ಶಾಯಿಯನ್ನು ಅಳಿಸಲು ಅದರ ಮೇಲೆ ಗೀಚಿ.';

  @override
  String get aiPenSnapShapes => 'ಬಿಡಿಸುವಾಗ ಆಕಾರಗಳನ್ನು ಅಚ್ಚುಕಟ್ಟಾಗಿಸಿ';

  @override
  String get aiPenSnapShapesHint =>
      'ಪೆನ್‌ನಿಂದ ಬಿಡಿಸಿದ ಒರಟು ವೃತ್ತಗಳು, ರೇಖೆಗಳು, ಬಾಣಗಳು ಮತ್ತು ಬಹುಭುಜಗಳು ಅಚ್ಚುಕಟ್ಟಾದ ಆಕಾರಗಳಾಗುತ್ತವೆ.';

  @override
  String get aiPenDidYouMean => 'ನಿಮ್ಮ ಅರ್ಥ ಇದೇ…';

  @override
  String get aiPenTypeIt => 'ಅಥವಾ ಟೈಪ್ ಮಾಡಿ';

  @override
  String get aiPenItsShape => 'ಇದು ಆಕಾರ';

  @override
  String get aiPenItsWriting => 'ಇದು ಬರಹ';

  @override
  String get aiPenBackToInk => 'ನನ್ನ ಶಾಯಿ ಮರಳಿ';

  @override
  String get aiPenKeepShape => 'ಆಕಾರ ಇರಲಿ';

  @override
  String get aiPenNoShape => 'ಈ ಶಾಯಿಗೆ ಯಾವ ಅಚ್ಚುಕಟ್ಟಾದ ಆಕಾರವೂ ಹೊಂದುವುದಿಲ್ಲ.';

  @override
  String get aiPenReadings => 'ಬೇರೆ ಓದುಗಳು';

  @override
  String get aiPenConvertInk => 'AI ಪೆನ್‌ನಿಂದ ಬದಲಿಸಿ';

  @override
  String get aiPenWordsStayInk =>
      'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಆಕಾರಗಳು ಮತ್ತು ಗಣಿತ ಬದಲಾಗುತ್ತವೆ. ಪದಗಳು ಶಾಯಿಯಾಗಿಯೇ ಇರುತ್ತವೆ: ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಕೈಬರಹ ಓದುವ ಸಾಧನವಿಲ್ಲ.';

  @override
  String aiPenModelNeeded(String language) {
    return '$language ಕೈಬರಹ ಮಾದರಿ ಡೌನ್‌ಲೋಡ್ ಆಗುವವರೆಗೆ ಪದಗಳು ಶಾಯಿಯಾಗಿಯೇ ಇರುತ್ತವೆ (ಬೋರ್ಡ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು → AI ಪೆನ್).';
  }

  @override
  String aiPenLanguageUnsupported(String language) {
    return 'ಈ ಬೋರ್ಡ್ $language ಕೈಬರಹವನ್ನು ಓದಲಾರದು. ಪದಗಳು ಶಾಯಿಯಾಗಿಯೇ ಇರುತ್ತವೆ; ಆಕಾರಗಳು ಮತ್ತು ಗಣಿತ ಆದರೂ ಬದಲಾಗುತ್ತವೆ.';
  }

  @override
  String get aiPenNothingToConvert =>
      'ಬದಲಿಸಲು ಏನೂ ಇಲ್ಲ: ಮೊದಲು ಕೈಬರಹ ಅಥವಾ ಚಿತ್ರಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ.';

  @override
  String get aiPenSettingsTitle => 'AI ಪೆನ್';

  @override
  String get aiPenSettingsHint =>
      'ಕೈಬರಹವನ್ನು ಈ ಬೋರ್ಡ್‌ನಲ್ಲೇ ಓದಲಾಗುತ್ತದೆ: ನೀವು ಬರೆದುದು ಬೋರ್ಡ್‌ನಿಂದ ಹೊರಗೆ ಹೋಗುವುದಿಲ್ಲ. ಆಕಾರಗಳು ಮತ್ತು ಗಣಿತ ಎಲ್ಲ ಭಾಷೆಗಳಲ್ಲಿ ಡೌನ್‌ಲೋಡ್ ಇಲ್ಲದೆ ಕೆಲಸ ಮಾಡುತ್ತವೆ.';

  @override
  String get aiPenEngineMlkit =>
      'ಈ ಪ್ಯಾನೆಲ್‌ನಲ್ಲಿ ಪದಗಳನ್ನು Google ML Kit ಓದುತ್ತದೆ. ಪ್ರತಿ ಭಾಷೆಯ ಮಾದರಿ ಒಮ್ಮೆ ಡೌನ್‌ಲೋಡ್ ಆಗುತ್ತದೆ (ಸುಮಾರು 20 MB); ನಂತರ ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆಯೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String get aiPenEngineWindows =>
      'ಪದಗಳನ್ನು Windows ಕೈಬರಹ ಗುರುತಿಸುವಿಕೆ ಓದುತ್ತದೆ. ಭಾಷೆ ಸೇರಿಸಲು Windows Settings → Time & language ನಲ್ಲಿ ಅದರ ಕೈಬರಹ ಸೇರಿಸಿ.';

  @override
  String get aiPenEngineNone =>
      'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಕೈಬರಹ ಓದುವ ಸಾಧನವಿಲ್ಲ: ಪದಗಳು ಶಾಯಿಯಾಗಿಯೇ ಇರುತ್ತವೆ.';

  @override
  String get aiPenModelReady => 'ಸಿದ್ಧ';

  @override
  String get aiPenModelDownload => 'ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String get aiPenModelDownloading => 'ಡೌನ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ…';

  @override
  String get aiPenModelUnsupported => 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ';

  @override
  String get aiPenDownloadFailed =>
      'ಕೈಬರಹ ಮಾದರಿ ಡೌನ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಒಮ್ಮೆ ಇಂಟರ್ನೆಟ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get aiOfflineLabel =>
      'ಆಫ್‌ಲೈನ್ ಮಾದರಿ — ಬೋರ್ಡ್‌ನದೇ ಟಿಪ್ಪಣಿಗಳಿಂದ (ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ), ಏಕೆಂದರೆ KINETIX AI ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗುತ್ತಿಲ್ಲ';

  @override
  String get profilesTitle => 'ಯಾರು ಕಲಿಸುತ್ತಿದ್ದಾರೆ?';

  @override
  String get profilesHint =>
      'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸೈನ್ ಇನ್ ಮಾಡಿದ ಶಿಕ್ಷಕರು. ನಿಮ್ಮ ಹೆಸರನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ PIN ನಮೂದಿಸಿ.';

  @override
  String get profilesSignInFull => 'Teacher ಆ್ಯಪ್‌ನಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ';

  @override
  String get profilesLocked => 'ಲಾಕ್ ಆಗಿದೆ';

  @override
  String get profilesNoPin => 'ಇನ್ನೂ PIN ಇಲ್ಲ';

  @override
  String pinEnterFor(String name) {
    return '$name ಅವರ PIN ನಮೂದಿಸಿ';
  }

  @override
  String pinWrong(int n) {
    return 'ತಪ್ಪು PIN. ಉಳಿದ ಪ್ರಯತ್ನಗಳು: $n';
  }

  @override
  String get pinWrongNoCount => 'ತಪ್ಪು PIN. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get pinLockedOut =>
      'ಹಲವು ತಪ್ಪು PIN ಗಳು. Teacher ಆ್ಯಪ್‌ನಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ, ಅಥವಾ ನಿಮ್ಮ ಆಡಳಿತಗಾರರಿಂದ PIN ಮರುಹೊಂದಿಸಿಕೊಳ್ಳಿ.';

  @override
  String get pinNoPin =>
      'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮಗೆ PIN ಹೊಂದಿಸಿಲ್ಲ. Teacher ಆ್ಯಪ್‌ನಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ, ನಂತರ PIN ಹೊಂದಿಸಿ.';

  @override
  String get pinNeedsNetwork =>
      'ಈ ಬೋರ್ಡ್ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದೆ ಮತ್ತು ನಿಮ್ಮ ಯಾವುದೇ ತರಗತಿ ತೆರೆದಿಲ್ಲ. ಇಂಟರ್ನೆಟ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ, ಅಥವಾ Teacher ಆ್ಯಪ್‌ನಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get pinSetTitle => 'ಈ ಬೋರ್ಡ್‌ಗೆ PIN ಹೊಂದಿಸಿ';

  @override
  String get pinSetHint =>
      '4 ರಿಂದ 6 ಅಂಕಿಗಳು. ಮುಂದಿನ ಬಾರಿ Teacher ಆ್ಯಪ್ ಬದಲು ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಹೆಸರನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ PIN ನಮೂದಿಸಿ.';

  @override
  String get pinConfirm => 'PIN ಅನ್ನು ಮತ್ತೆ ನಮೂದಿಸಿ';

  @override
  String get pinMismatch => 'ಎರಡು PIN ಗಳು ಬೇರೆ ಬೇರೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get pinWeak => 'ಊಹಿಸಲು ಕಷ್ಟವಾದ PIN ಆಯ್ಕೆಮಾಡಿ.';

  @override
  String get pinSaved =>
      'PIN ಉಳಿಸಲಾಗಿದೆ. ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಪ್ರೊಫೈಲ್‌ಗೆ ಬದಲಾಯಿಸಲು ಇದನ್ನು ಬಳಸಿ.';

  @override
  String get pinSetAction => 'PIN ಹೊಂದಿಸಿ';

  @override
  String get pinChangeAction => 'PIN ಬದಲಿಸಿ';

  @override
  String get pinBanner =>
      'ಫೋನ್ ಇಲ್ಲದೆ ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಪ್ರೊಫೈಲ್‌ಗೆ ಬದಲಾಯಿಸಲು PIN ಹೊಂದಿಸಿ.';

  @override
  String get notNow => 'ಈಗ ಬೇಡ';

  @override
  String get lockTitle => 'ಬೋರ್ಡ್ ಲಾಕ್ ಆಗಿದೆ';

  @override
  String lockHint(String name) {
    return '$name ಅವರ ತರಗತಿ ಇನ್ನೂ ತೆರೆದಿದೆ. ಮುಂದುವರಿಸಲು PIN ನಮೂದಿಸಿ.';
  }

  @override
  String get switchTeacher => 'ಶಿಕ್ಷಕರನ್ನು ಬದಲಿಸಿ';

  @override
  String get lockBoard => 'ಬೋರ್ಡ್ ಲಾಕ್ ಮಾಡಿ';

  @override
  String get signOut => 'ಸೈನ್ ಔಟ್';

  @override
  String get idleLockTitle => 'ಬಳಕೆಯಿಲ್ಲದಾಗ ಲಾಕ್ ಮಾಡಿ';

  @override
  String get idleLockHint =>
      'PIN ಇರುವ ಶಿಕ್ಷಕರಿಗೆ, ಇಷ್ಟು ನಿಮಿಷ ಮುಟ್ಟದಿದ್ದರೆ ಬೋರ್ಡ್ ಲಾಕ್ ಆಗುತ್ತದೆ. ಪಿರಿಯಡ್ ಮುಗಿದಾಗ ಸೈನ್ ಔಟ್ ಆಗುತ್ತದೆ.';

  @override
  String get idleOff => 'ಆಫ್';

  @override
  String get projectorTitle => 'ಪ್ರೊಜೆಕ್ಟರ್';

  @override
  String get projectorHint =>
      'ಬೋರ್ಡ್ ಅನ್ನು ಎರಡನೇ ಪರದೆಯಲ್ಲಿ (ಪ್ರೊಜೆಕ್ಟರ್ ಅಥವಾ ಟಿವಿ) ತರಗತಿಗೆ ತೋರಿಸಿ, ನಿಮ್ಮ ಉಪಕರಣಗಳು ಮತ್ತು ಪ್ಯಾನೆಲ್‌ಗಳಿಲ್ಲದೆ. 3D ಮಾದರಿಗಳು ಮತ್ತು ಲ್ಯಾಬ್‌ಗಳು ಅದರ ಪಕ್ಕದಲ್ಲಿ ಕಾಣುತ್ತವೆ.';

  @override
  String get projectorEnabled => 'ಎರಡನೇ ಪರದೆ ಬಳಸಿ';

  @override
  String get projectorAuto => 'ಪರದೆ ಸಂಪರ್ಕವಾದಾಗ ಪ್ರಾರಂಭಿಸಿ';

  @override
  String get projectorNone => 'ಎರಡನೇ ಪರದೆ ಸಂಪರ್ಕವಾಗಿಲ್ಲ';

  @override
  String projectorShowingOn(String name) {
    return '$name ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ';
  }

  @override
  String get projectorShow => 'ಎರಡನೇ ಪರದೆಯಲ್ಲಿ ತೋರಿಸಿ';

  @override
  String get projectorStop => 'ತೋರಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿ';

  @override
  String get projectorBlank => 'ತರಗತಿಯ ಪರದೆಯನ್ನು ಖಾಲಿ ಮಾಡಿ';

  @override
  String get toolAskClass => 'ತರಗತಿಯನ್ನು ಕೇಳಿ';

  @override
  String get askClassHint =>
      'ವಿದ್ಯಾರ್ಥಿಗಳು ಸ್ಟೂಡೆಂಟ್ ಆ್ಯಪ್‌ನಲ್ಲಿ ಉತ್ತರಿಸಲಿ, ಅಥವಾ ಉತ್ತರ ಮೇಲಿರುವಂತೆ ಉತ್ತರ ಕಾರ್ಡ್ ಎತ್ತಿ ಹಿಡಿಯಲಿ. ಫೋನ್ ಬೇಕಿಲ್ಲ.';

  @override
  String get askQuestionLabel => 'ಪ್ರಶ್ನೆ (ಐಚ್ಛಿಕ)';

  @override
  String get askAnswersLabel => 'ಉತ್ತರಗಳು';

  @override
  String get askTrueFalse => 'ಸರಿ / ತಪ್ಪು';

  @override
  String get askNumber => 'ಸಂಖ್ಯೆ';

  @override
  String get askRightAnswer => 'ಸರಿಯಾದ ಉತ್ತರ (ಐಚ್ಛಿಕ)';

  @override
  String get askNumberHint => 'ಉದಾಹರಣೆಗೆ 2.5';

  @override
  String get askNumberNoCards =>
      'ಸಂಖ್ಯೆಯ ಉತ್ತರಗಳು ಸ್ಟೂಡೆಂಟ್ ಆ್ಯಪ್‌ನಿಂದ ಮಾತ್ರ ಬರುತ್ತವೆ (ಉತ್ತರ ಕಾರ್ಡ್‌ಗಳಲ್ಲಿ A ಇಂದ D).';

  @override
  String get askStart => 'ಕೇಳಿ';

  @override
  String get pollTrue => 'ಸರಿ';

  @override
  String get pollFalse => 'ತಪ್ಪು';

  @override
  String get pollDefaultQuestion => 'ತರಗತಿ ಪರಿಶೀಲನೆ';

  @override
  String get pollNoCards =>
      'ಫೋಟೋದಲ್ಲಿ ಉತ್ತರ ಕಾರ್ಡ್‌ಗಳು ಸಿಗಲಿಲ್ಲ. ಕಾರ್ಡ್‌ಗಳನ್ನು ನೇರವಾಗಿ ಹಿಡಿಯಲು ಹೇಳಿ, ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String pollCardsRead(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಕಾರ್ಡ್‌ಗಳನ್ನು ಓದಲಾಗಿದೆ.',
      one: '1 ಕಾರ್ಡ್ ಓದಲಾಗಿದೆ.',
    );
    return '$_temp0';
  }

  @override
  String pollUnknownCards(String cards) {
    return 'ಕಾರ್ಡ್ $cards ಈ ತರಗತಿಯವಲ್ಲ.';
  }

  @override
  String get pollScanFailed => 'ಫೋಟೋ ಓದಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String pollAnswered(int count, int total) {
    return '$total ರಲ್ಲಿ $count ಉತ್ತರಿಸಿದ್ದಾರೆ';
  }

  @override
  String get pollEnded => 'ಪ್ರಶ್ನೆ ಮುಗಿದಿದೆ';

  @override
  String get pollLiveInApp => 'ಸ್ಟೂಡೆಂಟ್ ಆ್ಯಪ್‌ನಲ್ಲಿ ಲೈವ್';

  @override
  String get pollNotSaved =>
      'ಉತ್ತರ ಕಾರ್ಡ್‌ಗಳು ಮಾತ್ರ; ಉಳಿಸಲಾಗುವುದಿಲ್ಲ (ಯಾವುದೇ ತರಗತಿ ತೆರೆದಿಲ್ಲ).';

  @override
  String get pollScanCards => 'ಉತ್ತರ ಕಾರ್ಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get pollShowAnswer => 'ಉತ್ತರ ತೋರಿಸಿ';

  @override
  String get pollEnd => 'ಪ್ರಶ್ನೆ ಮುಗಿಸಿ';

  @override
  String get pollPutOnBoard => 'ಫಲಿತಾಂಶವನ್ನು ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ';

  @override
  String get pollNoAnswersYet => 'ಇನ್ನೂ ಉತ್ತರಗಳಿಲ್ಲ.';

  @override
  String get remoteConnected => 'ಫೋನ್ ರಿಮೋಟ್ ಸಂಪರ್ಕಗೊಂಡಿದೆ.';

  @override
  String get remotePhotoFailed => 'ಫೋನ್‌ನಿಂದ ಬಂದ ಫೋಟೋ ತೋರಿಸಲಾಗಲಿಲ್ಲ.';

  @override
  String get fingerTapsTitle => 'ಬೆರಳುಗಳ ಟ್ಯಾಪ್';

  @override
  String get fingerTapsHint =>
      'ಬೋರ್ಡ್ ಮೇಲೆ ಎರಡು ಬೆರಳುಗಳಿಂದ ಟ್ಯಾಪ್ ಮಾಡಿದರೆ ಅನ್‌ಡು, ಮೂರು ಬೆರಳುಗಳಿಂದ ಟ್ಯಾಪ್ ಮಾಡಿದರೆ ರೀಡು.';

  @override
  String get helpErase3 =>
      'ಅಥವಾ ಬೋರ್ಡ್ ಮೇಲೆ ಎರಡು ಬೆರಳುಗಳಿಂದ ಟ್ಯಾಪ್ ಮಾಡಿ (ಅನ್‌ಡು); ಮೂರು ಬೆರಳುಗಳಿಂದ ರೀಡು.';
}

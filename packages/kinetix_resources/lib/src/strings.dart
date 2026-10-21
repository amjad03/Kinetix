import 'package:flutter/widgets.dart';

import 'models.dart';

/// The words of the topic resources screens, in English, Hindi and Kannada (the app's locale).
class ResourceStrings {
  const ResourceStrings(this._t);

  factory ResourceStrings.of(BuildContext context) {
    final code = Localizations.maybeLocaleOf(context)?.languageCode;
    return ResourceStrings(switch (code) {
      'hi' => _hi,
      'kn' => _kn,
      _ => _en,
    });
  }

  static const english = ResourceStrings(_en);

  final Map<String, String> _t;
  String _(String k) => _t[k] ?? _en[k]!;

  String get title => _('title');
  String get videos => _('videos');
  String get materials => _('materials');
  String get animations => _('animations');
  String get none => _('none');
  String get couldNotLoad => _('couldNotLoad');
  String get tryAgain => _('tryAgain');
  String get offline => _('offline');
  String get needsInternet => _('needsInternet');
  String get topic => _('topic');
  String get pickTopic => _('pickTopic');
  String get cannotOpen => _('cannotOpen');
  String pages(PageRange p) => _('pages').replaceAll('{p}', '$p');

  String source(ResourceSource s) => _('src.${s.name}');
  String kind(MaterialKind k) => _('kind.${k.name}');

  static const _en = {
    'title': 'Topic resources',
    'videos': 'Videos',
    'materials': 'Materials',
    'animations': 'Animations',
    'none': 'Nothing is mapped to this topic yet.',
    'couldNotLoad': 'Could not load this topic\'s resources.',
    'tryAgain': 'Try again',
    'offline': 'Offline: showing the list saved on this device. Online videos play once the internet is back.',
    'needsInternet': 'Needs internet',
    'topic': 'Topic',
    'pickTopic': 'Another topic',
    'cannotOpen': 'Could not open it.',
    'pages': 'pp. {p}',
    'src.platform': 'Zynetix',
    'src.institution': 'Institution',
    'src.teacher': 'Teacher',
    'kind.pdf': 'PDF',
    'kind.book': 'Book',
    'kind.syllabus': 'Syllabus',
    'kind.link': 'Link',
    'kind.model3d': '3D model',
    'kind.sim': 'Simulation',
  };

  static const _hi = {
    'title': 'विषय संसाधन',
    'videos': 'वीडियो',
    'materials': 'सामग्री',
    'animations': 'एनिमेशन',
    'none': 'इस विषय से अभी कुछ नहीं जुड़ा है।',
    'couldNotLoad': 'इस विषय के संसाधन लोड नहीं हो सके।',
    'tryAgain': 'फिर से कोशिश करें',
    'offline': 'ऑफ़लाइन: इस डिवाइस पर सहेजी गई सूची। ऑनलाइन वीडियो इंटरनेट आने पर चलेंगे।',
    'needsInternet': 'इंटरनेट चाहिए',
    'topic': 'विषय',
    'pickTopic': 'दूसरा विषय',
    'cannotOpen': 'खोला नहीं जा सका।',
    'pages': 'पृ. {p}',
    'src.institution': 'संस्थान',
    'src.teacher': 'शिक्षक',
    'kind.book': 'पुस्तक',
    'kind.syllabus': 'पाठ्यक्रम',
    'kind.link': 'लिंक',
    'kind.model3d': '3D मॉडल',
    'kind.sim': 'सिमुलेशन',
  };

  static const _kn = {
    'title': 'ವಿಷಯ ಸಂಪನ್ಮೂಲಗಳು',
    'videos': 'ವೀಡಿಯೊಗಳು',
    'materials': 'ಸಾಮಗ್ರಿಗಳು',
    'animations': 'ಅನಿಮೇಷನ್‌ಗಳು',
    'none': 'ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ಏನೂ ಜೋಡಿಸಿಲ್ಲ.',
    'couldNotLoad': 'ಈ ವಿಷಯದ ಸಂಪನ್ಮೂಲಗಳನ್ನು ತರಲಾಗಲಿಲ್ಲ.',
    'tryAgain': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    'offline': 'ಆಫ್‌ಲೈನ್: ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಸಿದ ಪಟ್ಟಿ. ಇಂಟರ್ನೆಟ್ ಬಂದಾಗ ಆನ್‌ಲೈನ್ ವೀಡಿಯೊಗಳು ಪ್ಲೇ ಆಗುತ್ತವೆ.',
    'needsInternet': 'ಇಂಟರ್ನೆಟ್ ಬೇಕು',
    'topic': 'ವಿಷಯ',
    'pickTopic': 'ಬೇರೆ ವಿಷಯ',
    'cannotOpen': 'ತೆರೆಯಲಾಗಲಿಲ್ಲ.',
    'pages': 'ಪು. {p}',
    'src.institution': 'ಸಂಸ್ಥೆ',
    'src.teacher': 'ಶಿಕ್ಷಕ',
    'kind.book': 'ಪುಸ್ತಕ',
    'kind.syllabus': 'ಪಠ್ಯಕ್ರಮ',
    'kind.link': 'ಲಿಂಕ್',
    'kind.model3d': '3D ಮಾದರಿ',
    'kind.sim': 'ಸಿಮ್ಯುಲೇಶನ್',
  };
}

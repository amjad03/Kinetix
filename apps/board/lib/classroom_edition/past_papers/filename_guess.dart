import 'exam_rules.dart';

/// What a PDF's file name says about it ("NEET_2023_Physics_answer_key.pdf"): the form's first
/// guess, which the teacher checks.
class PaperGuess {
  const PaperGuess({this.exam, this.year, this.subject, this.session = '', this.isKey = false});

  final Exam? exam;
  final int? year;
  final String? subject;
  final String session;

  /// The name says it is an answer key ("key", "answers", "solutions").
  final bool isKey;
}

/// The subjects the form offers.
const paperSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Botany', 'Zoology', 'English', 'Kannada', 'Computer Science', 'Electronics', 'Statistics', 'Accountancy', 'Economics', 'Business Studies'];

const _subjectWords = <String, String>{
  'physics': 'Physics',
  'phy': 'Physics',
  'chemistry': 'Chemistry',
  'chem': 'Chemistry',
  'mathematics': 'Mathematics',
  'maths': 'Mathematics',
  'math': 'Mathematics',
  'biology': 'Biology',
  'bio': 'Biology',
  'botany': 'Botany',
  'zoology': 'Zoology',
  'english': 'English',
  'kannada': 'Kannada',
  'computer': 'Computer Science',
  'cs': 'Computer Science',
  'electronics': 'Electronics',
  'statistics': 'Statistics',
  'accountancy': 'Accountancy',
  'economics': 'Economics',
  'business': 'Business Studies',
};

/// Guesses from [fileName] (with or without its folder and `.pdf`).
PaperGuess guessFromFileName(String fileName) {
  var name = fileName.split(RegExp(r'[\\/]')).last;
  name = name.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '');
  final s = ' ${name.toLowerCase().replaceAll(RegExp(r'[_\-.,()\[\]+]+'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim()} ';
  bool has(String re) => RegExp(re).hasMatch(s);

  Exam? exam;
  if (has(r' jee ?adv') || has(r' advanced ')) {
    exam = Exam.jeeAdvanced;
  } else if (has(r' jee ') || has(r' jee ?main') || has(r' jeemain')) {
    exam = Exam.jeeMain;
  } else if (has(r' neet')) {
    exam = Exam.neet;
  } else if (has(r' kcet') || has(r' cet ')) {
    exam = Exam.kcet;
  } else if (has(r' comed ?k')) {
    exam = Exam.comedk;
  } else if (has(r' cbse')) {
    exam = has(r' (xi|11|class 11|11th) ') && !has(r' (xii|12) ') ? Exam.cbse11 : Exam.cbse12;
  } else if (has(r' (ii|2|2nd|second) ?(puc|pu) ') || has(r' (2puc|iipuc|2pu) ')) {
    exam = Exam.puc2;
  } else if (has(r' (i|1|1st|first) ?(puc|pu) ') || has(r' (1puc|ipuc|1pu) ')) {
    exam = Exam.puc1;
  } else if (has(r' puc ')) {
    exam = Exam.puc2;
  }

  int? year;
  for (final m in RegExp(r'(?<!\d)(19[89]\d|20\d\d)(?!\d)').allMatches(s)) {
    year = int.parse(m.group(1)!);
  }

  String? subject;
  for (final w in s.trim().split(' ')) {
    final hit = _subjectWords[w];
    if (hit != null) {
      subject = hit;
      break;
    }
  }

  final shift = RegExp(r' (shift|session|paper|set) ?(\d|i{1,3}|[a-d]) ').firstMatch(s);
  final date = RegExp(r' (\d{1,2}) ?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* ').firstMatch(s);
  final parts = [
    if (date != null) '${date.group(1)} ${date.group(2)![0].toUpperCase()}${date.group(2)!.substring(1)}',
    if (shift != null) '${shift.group(1)![0].toUpperCase()}${shift.group(1)!.substring(1)} ${shift.group(2)!.toUpperCase()}',
  ];

  final isKey = has(r' (answer ?key|answers?|key|solutions?|ans) ');
  return PaperGuess(exam: exam, year: year, subject: subject, session: parts.join(', '), isKey: isKey);
}

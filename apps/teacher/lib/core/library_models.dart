/// The library for teachers (the API's `/v1/library/opac` and `/v1/library/me`): the catalogue with facets, my card,
/// books out with the fine so far, and my reservations. Amounts are integer paise; dates are YYYY-MM-DD.
library;

String _s(Object? v) => v == null ? '' : '$v';
int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
List<Map<String, dynamic>> _maps(Object? v) => v is List ? [for (final x in v) if (x is Map) x.cast<String, dynamic>()] : const [];

/// One value of a facet with the number of titles it would leave.
class FacetValue {
  const FacetValue({required this.value, required this.count, this.label = ''});

  factory FacetValue.fromJson(Map<String, dynamic> j) => FacetValue(value: _s(j['value']), count: _int(j['count']), label: _s(j['label']));

  final String value;
  final int count;

  /// A branch's name (its value is the branch id); other facets show the value itself.
  final String label;

  String get text => label.isEmpty ? value : label;
}

/// Copies of a title at one branch.
class ShelfCopies {
  const ShelfCopies({required this.branch, required this.available, required this.copies});

  final String branch;
  final int available;
  final int copies;
}

/// A title in the catalogue.
class LibraryTitle {
  const LibraryTitle({required this.id, required this.title, required this.author, required this.copies, required this.available, this.callNo = '', this.subject = '', this.publisher = '', this.pubYear, this.material = 'book', this.reservable = false, this.branches = const []});

  factory LibraryTitle.fromJson(Map<String, dynamic> j) => LibraryTitle(
    id: _s(j['id']),
    title: _s(j['title']),
    author: _s(j['author']),
    callNo: _s(j['callNo']),
    subject: _s(j['subject']),
    publisher: _s(j['publisher']),
    pubYear: j['pubYear'] == null ? null : _int(j['pubYear']),
    material: j['material'] == null ? 'book' : _s(j['material']),
    copies: _int(j['copies']),
    available: _int(j['available']),
    reservable: j['reservable'] == true,
    branches: [for (final b in _maps(j['branches'])) ShelfCopies(branch: _s(b['branch']), available: _int(b['available']), copies: _int(b['copies']))],
  );

  final String id;
  final String title;
  final String author;
  final String callNo;
  final String subject;
  final String publisher;
  final int? pubYear;
  final String material;
  final int copies;
  final int available;
  final bool reservable;
  final List<ShelfCopies> branches;
}

/// The facets a search can be narrowed by.
const libraryFacets = ['subject', 'language', 'decade', 'material', 'author'];

/// One page (20 titles) of a search, with the facets of everything that matched.
class LibrarySearch {
  const LibrarySearch({required this.total, required this.page, required this.titles, this.facets = const {}, this.availableNow = 0});

  factory LibrarySearch.fromJson(Map<String, dynamic> j) {
    final f = j['facets'] is Map ? (j['facets'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return LibrarySearch(
      total: _int(j['total']),
      page: _int(j['page']).clamp(1, 1000),
      titles: [for (final b in _maps(j['rows'])) LibraryTitle.fromJson(b)],
      facets: {for (final k in libraryFacets) k: [for (final v in _maps(f[k])) FacetValue.fromJson(v)]},
      availableNow: _int(f['availableNow']),
    );
  }

  final int total;
  final int page;
  final List<LibraryTitle> titles;
  final Map<String, List<FacetValue>> facets;
  final int availableNow;

  bool get hasMore => page * 20 < total;
}

/// A book I have out.
class MyLoan {
  const MyLoan({required this.id, required this.title, required this.dueOn, this.author = '', this.accessionNo = '', this.overdue = false, this.fineSoFarPaise = 0, this.canRenew = false, this.renewCount = 0});

  factory MyLoan.fromJson(Map<String, dynamic> j) => MyLoan(
    id: _s(j['id']),
    title: _s(j['title']),
    author: _s(j['author']),
    accessionNo: _s(j['accessionNo']),
    dueOn: _s(j['dueOn']),
    overdue: j['overdue'] == true,
    fineSoFarPaise: _int(j['fineSoFarPaise']),
    canRenew: j['canRenew'] == true,
    renewCount: _int(j['renewCount']),
  );

  final String id;
  final String title;
  final String author;
  final String accessionNo;
  final String dueOn;
  final bool overdue;
  final int fineSoFarPaise;
  final bool canRenew;
  final int renewCount;
}

/// A reservation of mine: `waiting` in the queue or `ready` at the desk until [expiresAt].
class MyReservation {
  const MyReservation({required this.id, required this.bookId, required this.title, required this.status, this.expiresAt});

  factory MyReservation.fromJson(Map<String, dynamic> j) => MyReservation(id: _s(j['id']), bookId: _s(j['bookId']), title: _s(j['title']), status: _s(j['status']), expiresAt: j['expiresAt'] == null ? null : DateTime.tryParse(_s(j['expiresAt'])));

  final String id;
  final String bookId;
  final String title;
  final String status;
  final DateTime? expiresAt;

  bool get ready => status == 'ready';
}

/// My library card with what I have out, the rules that apply and what I owe.
class MyLibrary {
  const MyLibrary({required this.cardNo, required this.loanDays, required this.maxBooks, this.current = const [], this.reservations = const [], this.unpaidPaise = 0, this.accruingPaise = 0});

  factory MyLibrary.fromJson(Map<String, dynamic> j) {
    final m = j['member'] is Map ? (j['member'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final r = j['rules'] is Map ? (j['rules'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return MyLibrary(
      cardNo: _s(m['cardNo']),
      loanDays: _int(r['loanDays']),
      maxBooks: _int(r['maxBooks']),
      current: [for (final l in _maps(j['current'])) MyLoan.fromJson(l)],
      reservations: [for (final x in _maps(j['reservations'])) MyReservation.fromJson(x)],
      unpaidPaise: _int(j['unpaidPaise']),
      accruingPaise: _int(j['accruingPaise']),
    );
  }

  final String cardNo;
  final int loanDays;
  final int maxBooks;
  final List<MyLoan> current;
  final List<MyReservation> reservations;
  final int unpaidPaise;
  final int accruingPaise;
}

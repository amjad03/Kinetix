import 'package:flutter/widgets.dart';

/// One more way to add something to the board, listed in the insert popover (pictures, the
/// picture library, PDF and PowerPoint, simulations).
class InsertExtra {
  const InsertExtra({required this.key, required this.icon, required this.title, required this.hint, required this.onTap});

  final Key key;
  final IconData icon;
  final String title;
  final String hint;
  final VoidCallback onTap;
}

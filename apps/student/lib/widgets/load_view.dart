import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/api.dart';
import '../l10n/l10n.dart';
import 'common.dart';

/// Loads one value and shows a spinner, the error with Retry, or the children [builder] makes from
/// it, in a pull-to-refresh list. [builder] gets the data and a `reload` callback. Use it as a screen
/// body or a tab body; [LoadScreen] wraps it in a Scaffold.
class LoadBody<T> extends StatefulWidget {
  const LoadBody({super.key, required this.load, required this.builder, this.padding = const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32)});

  final Future<T> Function() load;
  final List<Widget> Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final EdgeInsets padding;

  @override
  State<LoadBody<T>> createState() => LoadBodyState<T>();
}

class LoadBodyState<T> extends State<LoadBody<T>> {
  T? _data;
  Object? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  /// Loads again; the old data stays on screen until the new arrives.
  Future<void> reload() async {
    try {
      final d = await widget.load();
      if (mounted) {
        setState(() {
          _data = d;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return _error == null ? const KxLoading() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: reload));
    }
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: widget.padding,
        children: [if (_error != null) ErrorBanner(_error!, onRetry: reload), ...widget.builder(context, data, reload)],
      ),
    );
  }
}

/// A screen with an app bar around a [LoadBody].
class LoadScreen<T> extends StatelessWidget {
  const LoadScreen({super.key, required this.title, required this.load, required this.builder, this.actions, this.floating});

  final String title;
  final Future<T> Function() load;
  final List<Widget> Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final List<Widget>? actions;
  final Widget? floating;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title), actions: actions),
    floatingActionButton: floating,
    body: LoadBody<T>(load: load, builder: builder),
  );
}

/// A section heading inside a list.
class Heading extends StatelessWidget {
  const Heading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s8),
    child: Text(text, style: context.text.titleMedium),
  );
}

/// A grey one-line message for an empty list.
class EmptyNote extends StatelessWidget {
  const EmptyNote(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s16),
    child: Text(text, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
  );
}

/// Says [text] in a snack bar, replacing any showing.
void say(BuildContext context, String text) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(text)));

/// Runs [action]; on failure says why in a snack bar. Returns whether it worked.
Future<bool> attempt(BuildContext context, Future<void> Function() action, {String? done}) async {
  final messenger = ScaffoldMessenger.of(context);
  final fail = context.errorText;
  try {
    await action();
    if (done != null) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(done)));
    }
    return true;
  } on ApiException catch (e) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(fail(e))));
    return false;
  }
}

/// One text box in [askFields].
class FieldSpec {
  const FieldSpec(this.key, this.label, {this.multiline = false, this.keyboard, this.prefix, this.maxLength});

  /// The key of the TextField and of the entry in the result.
  final String key;
  final String label;
  final bool multiline;
  final TextInputType? keyboard;
  final String? prefix;
  final int? maxLength;
}

/// A dialog with text boxes and Cancel / [confirmLabel]. Returns the trimmed texts by field key, or
/// null when cancelled. The dialog owns its controllers, so they are disposed with it.
Future<Map<String, String>?> askFields(
  BuildContext context, {
  required String title,
  required List<FieldSpec> fields,
  required String confirmLabel,
  String confirmKey = 'confirmFields',
  String? footer,
}) => showDialog<Map<String, String>>(
  context: context,
  builder: (_) => _FieldsDialog(title: title, fields: fields, confirmLabel: confirmLabel, confirmKey: confirmKey, footer: footer),
);

class _FieldsDialog extends StatefulWidget {
  const _FieldsDialog({required this.title, required this.fields, required this.confirmLabel, required this.confirmKey, this.footer});

  final String title, confirmLabel, confirmKey;
  final List<FieldSpec> fields;
  final String? footer;

  @override
  State<_FieldsDialog> createState() => _FieldsDialogState();
}

class _FieldsDialogState extends State<_FieldsDialog> {
  late final _controllers = {for (final f in widget.fields) f.key: TextEditingController()};

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final f in widget.fields)
            TextField(
              key: Key(f.key),
              controller: _controllers[f.key],
              keyboardType: f.keyboard,
              minLines: 1,
              maxLines: f.multiline ? 4 : 1,
              maxLength: f.maxLength,
              decoration: InputDecoration(labelText: f.label, prefixText: f.prefix),
            ),
          if (widget.footer != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(widget.footer!, style: context.text.bodySmall)),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: Text(context.l10n.cancel)),
      FilledButton(key: Key(widget.confirmKey), onPressed: () => Navigator.pop(context, {for (final e in _controllers.entries) e.key: e.value.text.trim()}), child: Text(widget.confirmLabel)),
    ],
  );
}

/// "2026-09-10" or a timestamp as "10 Sep 2026" in the app's language; null as empty.
String dayText(BuildContext context, DateTime? d) => d == null ? '' : context.fmt.date(d);

/// The same for text as the server sends it ("2026-09-10"); anything else as sent.
String isoDayText(BuildContext context, String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : context.fmt.date(d);
}

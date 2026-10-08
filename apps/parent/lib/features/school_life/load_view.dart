import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../widgets/common.dart';

/// A screen scaffold that loads one value, shows a spinner, the error with Retry, or [builder]'s
/// list of children (pull to refresh reloads). [builder] gets the data and a `reload` callback.
class LoadView<T> extends StatefulWidget {
  const LoadView({super.key, required this.title, required this.load, required this.builder, this.actions});

  final String title;
  final Future<T> Function() load;
  final List<Widget> Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final List<Widget>? actions;

  @override
  State<LoadView<T>> createState() => _LoadViewState<T>();
}

class _LoadViewState<T> extends State<LoadView<T>> {
  T? _data;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
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
    return Scaffold(
      appBar: AppBar(title: Text(widget.title), actions: widget.actions),
      body: data == null
          ? (_error == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _reload)))
          : RefreshIndicator(
              onRefresh: _reload,
              child: LayoutBuilder(
                builder: (context, box) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
                  children: [if (_error != null) ErrorBanner(_error!, onRetry: _reload), ...widget.builder(context, data, _reload)],
                ),
              ),
            ),
    );
  }
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

/// Says [text] in a snack bar, replacing any showing.
void say(BuildContext context, String text) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(text)));

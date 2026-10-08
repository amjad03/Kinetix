import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/api.dart';
import '../core/l10n.dart';
import 'common.dart';

/// Loads [load] once, shows a spinner, a plain-language error with Retry, or [builder] with the data.
/// [builder] gets a `reload` to call after a change; pull-to-refresh reloads too.
class AsyncBody<T> extends StatefulWidget {
  const AsyncBody({super.key, required this.load, required this.builder, this.isEmpty, this.empty});

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  /// When it returns true for the loaded data, [empty] is shown instead of [builder].
  final bool Function(T data)? isEmpty;
  final String? empty;

  @override
  State<AsyncBody<T>> createState() => _AsyncBodyState<T>();
}

class _AsyncBodyState<T> extends State<AsyncBody<T>> {
  T? _data;
  ApiException? _error;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final d = await widget.load();
      if (mounted) {
        setState(() {
          _data = d;
          _error = null;
          _loaded = true;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null && !_loaded) {
      return ListView(padding: const EdgeInsets.all(Kx.s16), children: [ErrorBanner.api(_error!, onRetry: reload)]);
    }
    if (!_loaded) return const Center(child: CircularProgressIndicator());
    final data = _data as T;
    final body = widget.isEmpty?.call(data) == true
        ? ListView(padding: const EdgeInsets.all(Kx.s24), children: [Text(widget.empty ?? '', key: const Key('emptyState'), textAlign: TextAlign.center)])
        : widget.builder(context, data, reload);
    return RefreshIndicator(onRefresh: reload, child: body);
  }
}

/// Runs a change; on failure shows the reason in a snack bar and returns false.
Future<bool> runOrSnack(BuildContext context, Future<void> Function() change) async {
  final messenger = ScaffoldMessenger.of(context);
  final l = context.l10n;
  try {
    await change();
    return true;
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    return false;
  }
}

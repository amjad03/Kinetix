import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

String requestStatusText(AppLocalizations l, String s) => switch (s) {
  'approved' => l.reqStatusApproved,
  'rejected' => l.reqStatusRejected,
  'returned' => l.reqStatusReturned,
  'cancelled' => l.reqStatusCancelled,
  _ => l.reqStatusPending,
};

String requestActionText(AppLocalizations l, String a) => switch (a) {
  'submitted' => l.requestActionSubmitted,
  'resubmitted' => l.requestActionResubmitted,
  'approve' || 'approved' => l.reqStatusApproved,
  'reject' || 'rejected' => l.reqStatusRejected,
  'return' || 'returned' => l.reqStatusReturned,
  'cancel' || 'cancelled' => l.reqStatusCancelled,
  _ => a,
};

/// Requests waiting for my decision, my own requests, and starting a custom request.
class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> {
  // Bumped after a change so both tabs reload.
  int _round = 0;

  Future<void> _open(WorkflowRequestInfo r) async {
    await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => RequestDetailScreen(api: widget.api, id: r.id)));
    if (mounted) setState(() => _round++);
  }

  Future<void> _start() async {
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => NewRequestScreen(api: widget.api)));
    if (sent == true && mounted) setState(() => _round++);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.requestsTitle),
          bottom: TabBar(tabs: [Tab(key: const Key('tabInbox'), text: l.requestsInboxTab), Tab(key: const Key('tabMyRequests'), text: l.requestsMineTab)]),
        ),
        floatingActionButton: FloatingActionButton.extended(key: const Key('newRequest'), onPressed: _start, icon: const Icon(Icons.add), label: Text(l.requestsStart)),
        body: TabBarView(
          children: [
            _RequestList(key: ValueKey('inbox$_round'), load: widget.api.workflowInbox, empty: l.requestsInboxEmpty, onOpen: _open, showRequester: true),
            _RequestList(key: ValueKey('mine$_round'), load: widget.api.myWorkflowRequests, empty: l.requestsMineEmpty, onOpen: _open, showRequester: false),
          ],
        ),
      ),
    );
  }
}

class _RequestList extends StatelessWidget {
  const _RequestList({super.key, required this.load, required this.empty, required this.onOpen, required this.showRequester});

  final Future<List<WorkflowRequestInfo>> Function() load;
  final String empty;
  final void Function(WorkflowRequestInfo) onOpen;
  final bool showRequester;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AsyncBody<List<WorkflowRequestInfo>>(
      load: load,
      isEmpty: (rows) => rows.isEmpty,
      empty: empty,
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 88),
        children: [
          for (final r in rows)
            ListTile(
              key: Key('request-${r.id}'),
              title: Text(r.title),
              subtitle: Text(
                [
                  if (showRequester) l.requestBy(r.requesterName),
                  requestStatusText(l, r.status),
                  if (r.status == 'pending') l.requestStep('${r.stepNumber}', '${r.stepCount}', r.stepName ?? ''),
                ].join(' · '),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => onOpen(r),
            ),
        ],
      ),
    );
  }
}

/// One request with its form answers and history; the approver decides, the requester can withdraw.
class RequestDetailScreen extends StatefulWidget {
  const RequestDetailScreen({super.key, required this.api, required this.id});

  final TeacherApi api;
  final String id;

  @override
  State<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends State<RequestDetailScreen> {
  final _comment = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _decide(WorkflowRequestInfo r, String decision) async {
    final ok = await runOrSnack(context, () => widget.api.decideWorkflowRequest(r.id, decision: decision, comment: _comment.text.trim(), version: r.version));
    if (ok && mounted) Navigator.pop(context);
  }

  Future<void> _withdraw(WorkflowRequestInfo r) async {
    final ok = await runOrSnack(context, () => widget.api.cancelWorkflowRequest(r.id));
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.requestsTitle)),
      body: AsyncBody<WorkflowRequestInfo>(
        load: () => widget.api.workflowRequest(widget.id),
        builder: (context, r, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            Text(r.title, style: context.text.titleLarge),
            Text('${l.requestBy(r.requesterName)} · ${requestStatusText(l, r.status)}'),
            if (r.status == 'pending') Text(l.requestStep('${r.stepNumber}', '${r.stepCount}', r.stepName ?? '')),
            if (r.amount != null) Text('${l.requestAmountLabel}: ${numText(r.amount!)}'),
            for (final e in r.payload.entries) Text('${e.key}: ${e.value}'),
            if (r.canDecide) ...[
              const SizedBox(height: Kx.s16),
              TextField(key: const Key('decisionComment'), controller: _comment, maxLength: 1000, decoration: InputDecoration(labelText: l.requestComment)),
              Wrap(
                spacing: Kx.s8,
                children: [
                  FilledButton(key: const Key('approveRequest'), onPressed: () => _decide(r, 'approve'), child: Text(l.requestApprove)),
                  OutlinedButton(key: const Key('returnRequest'), onPressed: () => _decide(r, 'return'), child: Text(l.requestReturn)),
                  OutlinedButton(key: const Key('rejectRequest'), onPressed: () => _decide(r, 'reject'), child: Text(l.requestReject)),
                ],
              ),
            ],
            if (r.canCancel) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: TextButton(key: const Key('withdrawRequest'), onPressed: () => _withdraw(r), child: Text(l.requestWithdraw))),
            KxSectionHeader(l.requestHistory),
            for (final a in r.timeline)
              ListTile(
                dense: true,
                title: Text('${requestActionText(l, a.action)} · ${a.actorName}'),
                subtitle: a.comment.isEmpty && a.stepName == null ? null : Text([?a.stepName, if (a.comment.isNotEmpty) a.comment].join(' · ')),
              ),
          ],
        ),
      ),
    );
  }
}

/// Starts a request: pick the kind, fill the fields the route asks for, send.
class NewRequestScreen extends StatefulWidget {
  const NewRequestScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends State<NewRequestScreen> {
  List<WorkflowDefinition>? _routes;
  WorkflowDefinition? _route;
  ApiException? _loadError;
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _values = <String, TextEditingController>{};
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.api.workflowDefinitions().then((r) {
      if (!mounted) return;
      setState(() {
        _routes = r;
        if (r.isNotEmpty) _pick(r.first);
      });
    }, onError: (Object e) {
      if (mounted) setState(() => _loadError = e is ApiException ? e : null);
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    for (final c in _values.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _pick(WorkflowDefinition d) {
    _route = d;
    for (final c in _values.values) {
      c.dispose();
    }
    _values
      ..clear()
      ..addEntries([for (final f in d.fields) MapEntry(f.key, TextEditingController())]);
  }

  Future<void> _submit() async {
    final l = context.l10n;
    final route = _route!;
    final payload = <String, dynamic>{};
    for (final f in route.fields) {
      final text = _values[f.key]!.text.trim();
      if (text.isEmpty) {
        if (f.required) {
          setState(() => _error = l.requestFieldNeeded(f.label));
          return;
        }
        continue;
      }
      payload[f.key] = f.type == 'number' ? (num.tryParse(text) ?? text) : text;
    }
    if (_title.text.trim().length < 3) {
      setState(() => _error = l.requestFieldNeeded(l.requestTitleLabel));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.submitWorkflowRequest(requestType: route.requestType, title: _title.text.trim(), payload: payload, amount: double.tryParse(_amount.text.trim()));
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final routes = _routes;
    return Scaffold(
      appBar: AppBar(title: Text(l.requestsStart)),
      body: routes == null
          ? Center(child: _loadError == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner.api(_loadError!)))
          : routes.isEmpty
          ? Padding(padding: const EdgeInsets.all(Kx.s24), child: Text(l.requestNoRoutes, key: const Key('noRoutes')))
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                DropdownButtonFormField<WorkflowDefinition>(
                  key: const Key('requestKind'),
                  initialValue: _route,
                  decoration: InputDecoration(labelText: l.requestKindLabel),
                  items: [for (final d in routes) DropdownMenuItem(value: d, child: Text(d.name))],
                  onChanged: (d) => setState(() => _pick(d!)),
                ),
                if (_route!.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(_route!.description)),
                TextField(key: const Key('requestTitle'), controller: _title, maxLength: 200, decoration: InputDecoration(labelText: l.requestTitleLabel)),
                for (final f in _route!.fields)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Kx.s8),
                    child: f.type == 'select'
                        ? DropdownButtonFormField<String>(
                            key: Key('field-${f.key}'),
                            decoration: InputDecoration(labelText: f.label),
                            items: [for (final o in f.options) DropdownMenuItem(value: o, child: Text(o))],
                            onChanged: (v) => _values[f.key]!.text = v ?? '',
                          )
                        : TextField(
                            key: Key('field-${f.key}'),
                            controller: _values[f.key],
                            keyboardType: f.type == 'number' ? TextInputType.number : TextInputType.text,
                            decoration: InputDecoration(labelText: f.label, hintText: f.type == 'date' ? 'YYYY-MM-DD' : null),
                          ),
                  ),
                TextField(key: const Key('requestAmount'), controller: _amount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.requestAmountLabel)),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
                const SizedBox(height: Kx.s16),
                FilledButton(key: const Key('sendRequest'), onPressed: _busy ? null : _submit, child: Text(l.requestSubmit)),
              ],
            ),
    );
  }
}

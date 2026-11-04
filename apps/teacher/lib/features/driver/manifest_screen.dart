import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// Opens the camera and returns the first bus pass QR it sees (`KXBUS:<seat>:<student>`), or null.
typedef PassScanner = Future<String?> Function(BuildContext context);

/// The trip's students in the order of the run, for the driver, conductor or attendant: each marked on and off by
/// hand, or by scanning the bus pass. The family is told when their child gets on and off; a child left unmarked at a
/// stop the bus has passed is reported to them, and one never marked off a drop run to the office.
class ManifestScreen extends StatefulWidget {
  const ManifestScreen({super.key, required this.api, required this.tripId, this.scan = scanBusPass});

  final TeacherApi api;
  final String tripId;
  final PassScanner scan;

  static Future<void> open(BuildContext context, TeacherApi api, String tripId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ManifestScreen(api: api, tripId: tripId)));

  @override
  State<ManifestScreen> createState() => _ManifestScreenState();
}

class _ManifestScreenState extends State<ManifestScreen> {
  TripManifest? _m;
  ApiException? _error;
  final _busy = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final m = await widget.api.tripManifest(widget.tripId);
      if (mounted) {
        setState(() {
          _m = m;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _mark({String? studentId, String? code, required bool board}) async {
    final key = studentId ?? code ?? '';
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    setState(() => _busy.add(key));
    try {
      await widget.api.markBoarding(widget.tripId, studentId: studentId, code: code, board: board);
      await _load();
      if (code != null) messenger.showSnackBar(SnackBar(content: Text(l.driverMarked)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy.remove(key));
    }
  }

  Future<void> _scan() async {
    final code = await widget.scan(context);
    if (code == null || !mounted) return;
    // A pick-up marks getting on; a drop marks getting off once the student is on board.
    final m = _m;
    final drop = m?.direction == TripDirection.drop;
    final sid = code.split(':').last;
    final rider = m?.riders.where((r) => r.studentId == sid).firstOrNull;
    await _mark(code: code, board: !(drop && rider?.boardedAt != null));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final m = _m;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.driverManifest)),
      floatingActionButton: m == null ? null : FloatingActionButton.extended(key: const Key('manifestScan'), onPressed: _scan, icon: const Icon(Icons.qr_code_scanner), label: Text(l.driverScanPass)),
      body: m == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner.api(_error!, onRetry: _load)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
                children: [
                  Text(l.driverManifestCount(m.onBoard, m.boarded, m.riders.length), key: const Key('manifestCount'), style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  for (final r in m.riders)
                    ListTile(
                      key: Key('manifest-${r.studentId}'),
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(r.boardedAt != null && r.alightedAt == null ? Icons.event_seat : Icons.person_outline, color: r.boardedAt != null && r.alightedAt == null ? c.primary : c.onSurfaceVariant),
                      title: Text(r.name),
                      subtitle: Text([r.stopName, if (r.boardedAt != null) l.driverOnAt(f.time(r.boardedAt!)), if (r.alightedAt != null) l.driverOffAt(f.time(r.alightedAt!))].join(' · ')),
                      trailing: Wrap(
                        spacing: Kx.s8,
                        children: [
                          if (r.boardedAt == null)
                            FilledButton.tonal(key: Key('on-${r.studentId}'), onPressed: _busy.contains(r.studentId) ? null : () => _mark(studentId: r.studentId, board: true), child: Text(l.driverGotOn)),
                          if (r.boardedAt != null && r.alightedAt == null)
                            OutlinedButton(key: Key('off-${r.studentId}'), onPressed: _busy.contains(r.studentId) ? null : () => _mark(studentId: r.studentId, board: false), child: Text(l.driverGotOff)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

/// The phone's camera: the first bus pass QR seen.
Future<String?> scanBusPass(BuildContext context) => Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const _PassCamera()));

class _PassCamera extends StatefulWidget {
  const _PassCamera();

  @override
  State<_PassCamera> createState() => _PassCameraState();
}

class _PassCameraState extends State<_PassCamera> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode], detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.driverScanPass)),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              if (_done) return;
              for (final b in capture.barcodes) {
                final raw = b.rawValue;
                if (raw != null && raw.startsWith('KXBUS:')) {
                  _done = true;
                  Navigator.of(context).pop(raw);
                  return;
                }
              }
            },
          ),
          Positioned(
            left: Kx.s16,
            right: Kx.s16,
            bottom: Kx.s32,
            child: Text(l.driverScanHint, textAlign: TextAlign.center, style: context.text.bodyLarge?.copyWith(color: Colors.white, shadows: const [Shadow(blurRadius: 4)])),
          ),
        ],
      ),
    );
  }
}

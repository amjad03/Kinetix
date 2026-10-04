import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/l10n.dart';

/// Full-screen camera that looks for a KINETIX pairing QR code (kinetix://pair?...).
/// Only used on Android and iOS.
class QrScannerView extends StatefulWidget {
  const QrScannerView({super.key, required this.busy, required this.error, required this.onScanned, required this.onEnterCode});

  final bool busy;
  final String? error;
  final ValueChanged<String> onScanned;
  final VoidCallback onEnterCode;

  @override
  State<QrScannerView> createState() => _QrScannerViewState();
}

class _QrScannerViewState extends State<QrScannerView> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode], detectionSpeed: DetectionSpeed.noDuplicates);
  bool _notOurs = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _detect(BarcodeCapture capture) {
    if (widget.busy) return;
    for (final b in capture.barcodes) {
      final raw = b.rawValue;
      if (raw == null) continue;
      if (raw.startsWith('kinetix://pair')) {
        setState(() => _notOurs = false);
        widget.onScanned(raw);
        return;
      }
      setState(() => _notOurs = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final message = widget.error ?? (_notOurs ? l.qrNotOurs : null);
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        leading: const CloseButton(),
        title: Text(l.scanTitle),
        actions: [IconButton(tooltip: l.torch, onPressed: _controller.toggleTorch, icon: const Icon(Icons.flashlight_on_outlined))],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _detect,
            errorBuilder: (context, error) => Center(
              child: Padding(
                padding: const EdgeInsets.all(Kx.s32),
                child: Text(
                  error.errorCode == MobileScannerErrorCode.permissionDenied ? l.cameraDenied : l.cameraUnavailable,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
          // Viewfinder
          Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 3),
                borderRadius: Kx.radiusXl,
              ),
            ),
          ),
          if (widget.busy) const Center(child: CircularProgressIndicator(color: Colors.white)),
          Positioned(
            left: Kx.s24,
            right: Kx.s24,
            bottom: Kx.s32,
            child: SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: Kx.s16),
                      padding: const EdgeInsets.all(Kx.s12),
                      decoration: BoxDecoration(color: context.colors.errorContainer, borderRadius: Kx.radiusMd),
                      child: Text(message, style: TextStyle(color: context.colors.onErrorContainer)),
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.only(bottom: Kx.s16),
                      child: Text(
                        l.pointCamera,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 16),
                      ),
                    ),
                  FilledButton.tonalIcon(onPressed: widget.onEnterCode, icon: const Icon(Icons.dialpad), label: Text(l.enterCodeInstead)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

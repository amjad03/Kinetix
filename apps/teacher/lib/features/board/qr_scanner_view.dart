import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

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
  String? _notOurs;

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
        setState(() => _notOurs = null);
        widget.onScanned(raw);
        return;
      }
      setState(() => _notOurs = "That isn't a KINETIX board code. Scan the QR code on the board's screen.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final message = widget.error ?? _notOurs;
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        leading: const CloseButton(),
        title: const Text('Scan board QR code'),
        actions: [IconButton(tooltip: 'Torch', onPressed: _controller.toggleTorch, icon: const Icon(Icons.flashlight_on_outlined))],
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
                  error.errorCode == MobileScannerErrorCode.permissionDenied
                      ? 'Allow camera access in Settings to scan, or enter the code instead.'
                      : 'The camera is not available. Enter the code instead.',
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
                    const Padding(
                      padding: EdgeInsets.only(bottom: Kx.s16),
                      child: Text(
                        'Point your camera at the QR code on the board',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 16),
                      ),
                    ),
                  FilledButton.tonalIcon(
                    onPressed: widget.onEnterCode,
                    icon: const Icon(Icons.dialpad),
                    label: const Text('Enter code instead'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

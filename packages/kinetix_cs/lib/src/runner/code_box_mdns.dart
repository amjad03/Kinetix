import 'dart:async';
import 'dart:io';

import 'package:multicast_dns/multicast_dns.dart';

import 'code_box.dart';

/// Looks for school code boxes on the local network: mDNS (Bonjour/Avahi) PTR
/// `_kinetix-code._tcp.local`, then each box's SRV (host and port) and A record. The box's PC
/// announces it (docs/operations/school-code-box.md, an Avahi service file). Best effort:
/// some Wi-Fi networks block multicast, so a box can always be set by its address instead.
Future<List<Uri>> discoverCodeBoxes({Duration timeout = const Duration(seconds: 3)}) async {
  final client = MDnsClient();
  final found = <Uri>[];
  try {
    await client.start();
    final ptrs = client.lookup<PtrResourceRecord>(ResourceRecordQuery.serverPointer('${CodeBox.service}.local'), timeout: timeout);
    await for (final ptr in ptrs) {
      await for (final srv in client.lookup<SrvResourceRecord>(ResourceRecordQuery.service(ptr.domainName), timeout: timeout)) {
        var host = srv.target;
        await for (final ip in client.lookup<IPAddressResourceRecord>(ResourceRecordQuery.addressIPv4(srv.target), timeout: timeout)) {
          host = ip.address.address;
          break;
        }
        final u = Uri(scheme: 'http', host: host.endsWith('.') ? host.substring(0, host.length - 1) : host, port: srv.port);
        if (!found.contains(u)) found.add(u);
      }
    }
  } on SocketException {
    // No multicast on this network or device.
  } finally {
    client.stop();
  }
  return found;
}

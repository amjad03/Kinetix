/// Networking for class: the OSI model's encapsulation, TCP's handshakes, and IPv4 subnets.
library;

/// An OSI layer, from the top (7) down.
class OsiLayer {
  const OsiLayer(this.number, this.key, this.pdu, this.header, this.examples);

  final int number;

  /// CsStrings key for its name.
  final String key;

  /// What the data is called at this layer.
  final String pdu;

  /// What this layer adds ('' for none).
  final String header;
  final String examples;
}

const osiLayers = [
  OsiLayer(7, 'osiApplication', 'Data', '', 'HTTP, DNS, SMTP, FTP'),
  OsiLayer(6, 'osiPresentation', 'Data', '', 'TLS, JPEG, UTF-8'),
  OsiLayer(5, 'osiSession', 'Data', '', 'Sockets, RPC'),
  OsiLayer(4, 'osiTransport', 'Segment', 'TCP header (ports, seq, ack)', 'TCP, UDP'),
  OsiLayer(3, 'osiNetwork', 'Packet', 'IP header (source IP, dest IP, TTL)', 'IPv4, IPv6, ICMP'),
  OsiLayer(2, 'osiDataLink', 'Frame', 'MAC header + FCS trailer', 'Ethernet, Wi-Fi'),
  OsiLayer(1, 'osiPhysical', 'Bits', '', 'Cables, radio, fibre'),
];

/// The message as it goes down the sender's stack: each step wraps the last in a header
/// (and the data link layer's trailer).
List<(OsiLayer, List<String>)> encapsulate(String message) {
  final out = <(OsiLayer, List<String>)>[];
  var parts = [message];
  for (final l in osiLayers) {
    parts = switch (l.number) {
      4 => ['TCP', ...parts],
      3 => ['IP', ...parts],
      2 => ['MAC', ...parts, 'FCS'],
      _ => parts,
    };
    out.add((l, List.of(parts)));
  }
  return out;
}

/// One TCP segment in a conversation: who sends it, its flags, sequence and ack numbers.
class Segment {
  const Segment(this.fromClient, this.flags, this.seq, this.ack, {this.bytes = 0, this.state = ''});

  final bool fromClient;
  final String flags;
  final int seq;

  /// null when the ACK flag is not set.
  final int? ack;
  final int bytes;

  /// The sender's state after sending it.
  final String state;

  @override
  String toString() => '${fromClient ? 'C→S' : 'S→C'} $flags seq=$seq${ack == null ? '' : ' ack=$ack'}${bytes > 0 ? ' len=$bytes' : ''}';
}

/// A whole TCP conversation: three-way handshake, [dataBytes] from the client and the reply,
/// and the four-way close, with initial sequence numbers [clientIsn] and [serverIsn].
List<Segment> tcpConversation({int clientIsn = 100, int serverIsn = 300, int dataBytes = 0}) {
  var c = clientIsn, s = serverIsn;
  final out = <Segment>[
    Segment(true, 'SYN', c, null, state: 'SYN-SENT'),
    Segment(false, 'SYN, ACK', s, c + 1, state: 'SYN-RECEIVED'),
    Segment(true, 'ACK', c + 1, s + 1, state: 'ESTABLISHED'),
  ];
  c += 1;
  s += 1;
  if (dataBytes > 0) {
    out.add(Segment(true, 'PSH, ACK', c, s, bytes: dataBytes, state: 'ESTABLISHED'));
    c += dataBytes;
    out.add(Segment(false, 'ACK', s, c, state: 'ESTABLISHED'));
  }
  out
    ..add(Segment(true, 'FIN, ACK', c, s, state: 'FIN-WAIT-1'))
    ..add(Segment(false, 'ACK', s, c + 1, state: 'CLOSE-WAIT'))
    ..add(Segment(false, 'FIN, ACK', s, c + 1, state: 'LAST-ACK'))
    ..add(Segment(true, 'ACK', c + 1, s + 1, state: 'TIME-WAIT'));
  return out;
}

// --- IPv4 subnets -------------------------------------------------------------------------

int? parseIpv4(String s) {
  final p = s.trim().split('.');
  if (p.length != 4) return null;
  var v = 0;
  for (final x in p) {
    final n = int.tryParse(x);
    if (n == null || n < 0 || n > 255 || x.isEmpty) return null;
    v = (v << 8) | n;
  }
  return v;
}

String ipv4(int v) => [for (var i = 3; i >= 0; i--) (v >> (8 * i)) & 255].join('.');

String ipv4Bits(int v) => [for (var i = 3; i >= 0; i--) ((v >> (8 * i)) & 255).toRadixString(2).padLeft(8, '0')].join('.');

class Subnet {
  Subnet(int address, this.prefix) : network = address & maskOf(prefix);

  /// "192.168.10.77/26" or "192.168.10.77 255.255.255.192".
  static Subnet? parse(String s) {
    final m = RegExp(r'^\s*([\d.]+)\s*(?:/\s*(\d{1,2})|\s+([\d.]+))\s*$').firstMatch(s);
    if (m == null) return null;
    final ip = parseIpv4(m[1]!);
    if (ip == null) return null;
    int? prefix = m[2] != null ? int.parse(m[2]!) : null;
    if (m[3] != null) {
      final mask = parseIpv4(m[3]!);
      if (mask == null) return null;
      prefix = prefixOf(mask);
    }
    if (prefix == null || prefix > 32) return null;
    return Subnet(ip, prefix);
  }

  final int network;
  final int prefix;

  static int maskOf(int prefix) => prefix == 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF;

  /// The prefix length of a contiguous mask, or null.
  static int? prefixOf(int mask) {
    for (var p = 0; p <= 32; p++) {
      if (maskOf(p) == mask) return p;
    }
    return null;
  }

  int get mask => maskOf(prefix);
  int get wildcard => ~mask & 0xFFFFFFFF;
  int get broadcast => network | wildcard;

  /// Usable hosts (a /31 has two, RFC 3021; a /32 one).
  int get hosts => prefix >= 31 ? (prefix == 32 ? 1 : 2) : (1 << (32 - prefix)) - 2;
  int get firstHost => prefix >= 31 ? network : network + 1;
  int get lastHost => prefix >= 31 ? broadcast : broadcast - 1;

  /// The classful class of the network (A–E), for older textbooks.
  String get ipClass {
    final first = network >> 24;
    return first < 128 ? 'A' : first < 192 ? 'B' : first < 224 ? 'C' : first < 240 ? 'D' : 'E';
  }

  bool get isPrivate {
    bool inNet(String n, int p) => Subnet(parseIpv4(n)!, p).network == (network & maskOf(p)) && prefix >= p;
    return inNet('10.0.0.0', 8) || inNet('172.16.0.0', 12) || inNet('192.168.0.0', 16);
  }

  /// This network split into [count] equal subnets (rounded up to a power of two), or empty
  /// when it cannot be split that far.
  List<Subnet> split(int count) {
    var bits = 0;
    while ((1 << bits) < count) {
      bits++;
    }
    if (prefix + bits > 30) return const [];
    final size = 1 << (32 - prefix - bits);
    return [for (var i = 0; i < (1 << bits); i++) Subnet(network + i * size, prefix + bits)];
  }

  @override
  String toString() => '${ipv4(network)}/$prefix';
}

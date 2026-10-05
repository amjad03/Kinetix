import 'dart:math' as math;

/// KINETIX answer cards: one printed card per student, read by the tablet's
/// camera from a photo of the class, so a class with no devices can answer.
///
/// A card is a 7×7 grid: a black border and 25 cells that spell the card's
/// number. Its four edges carry A, B, C and D; the student holds the card
/// with their answer on top. The cell pattern of every card looks different
/// in each of its four turns and from every other card (at least 8 cells
/// apart), so the reader can tell which card it is and which edge is up,
/// even with up to 3 cells misread.

/// Data cells of card n (1-based): bit (row * 5 + column) is a black cell.
const cardCodes = <int>[
  0xa426b9, 0xb83f55, 0x10ee1e1, 0x1282e0f, 0x1c810e4, 0x4cc3bb, 0x1850d84, 0x17761ad, 0x27e653, 0x1212274, 
  0x1c4ac7c, 0x890acf, 0x1b89798, 0x1193ca3, 0x7f31e3, 0xf5b268, 0x148708f, 0xf9ba91, 0xd8bfce, 0x143c61c, 
  0x91db03, 0xe75b0d, 0xb95729, 0x69daec, 0x1627857, 0x182cd07, 0x6ec14f, 0x1e80489, 0x17428eb, 0x1adce05, 
  0x1df5112, 0x966e84, 0xca4f65, 0x1cbeb0a, 0x11c3ac4, 0x108b06a, 0x1d89c28, 0x18540e7, 0x16e5ec8, 0x1bd08a8, 
  0x1413c59, 0xdab049, 0x1d324b5, 0x581df9, 0xe80ebe, 0x1065e3d, 0x1bb0713, 0x922c38, 0x18a5d3, 0xa2be6e, 
  0x1e1b33d, 0x137d7c2, 0x16563db, 0x2d844c, 0x70915b, 0x145af9d, 0x107938c, 0x199aafa, 0x973693, 0x9478f5, 
  0x18b25c8, 0x5db488, 0x1551d17, 0x1a1d944, 0xe98551, 0xf8db72, 0x13164be, 0x1b67641, 0x1341569, 0x14bd564, 
  0x140df56, 0x1b16a17, 0x1a2ce90, 0x364072, 0x915c4d, 0x9b6bd3, 0x147a048, 0x1831223, 0x12e4504, 0x1088b64, 
  0x1d6662a, 0x2f669c, 0xe23f9b, 0x15fbad, 0xe7c061, 0x365c97, 0x11675bb, 0x176c203, 0x1782b48, 0x1474c8f, 
  0x1b36f2c, 0x1a44e5e, 0x8eca51, 0x15d0a02, 0x13eef09, 0x1ceec99, 0x77947e, 0x1cc949e, 0x156314f, 0xf5e792, 
];

/// Cards per class: one per roll number.
int get maxCards => cardCodes.length;

const cardGrid = 7;
const _n = 5;

/// The 25 data bits turned a quarter turn clockwise.
int turnBits(int c) {
  var out = 0;
  for (var r = 0; r < _n; r++) {
    for (var k = 0; k < _n; k++) {
      // new[r][k] = old[n-1-k][r]
      final bit = (c >> ((_n - 1 - k) * _n + r)) & 1;
      out |= bit << (r * _n + k);
    }
  }
  return out;
}

int _ones(int x) {
  var n = 0;
  while (x != 0) {
    x &= x - 1;
    n++;
  }
  return n;
}

/// Black cells of card [number] as printed (A on top): 7×7, border included.
List<List<bool>> cardCells(int number) {
  final code = cardCodes[number - 1];
  return [
    for (var r = 0; r < cardGrid; r++)
      [
        for (var k = 0; k < cardGrid; k++)
          r == 0 || k == 0 || r == cardGrid - 1 || k == cardGrid - 1 ? true : ((code >> ((r - 1) * _n + (k - 1))) & 1) == 1,
      ],
  ];
}

/// A card read from its 25 data cells as seen (row 0 at the top of the
/// photo): which card, the answer (0 = A … 3 = D), and how many cells were
/// misread.
class CardDecode {
  final int card;
  final int choice;
  final int errors;
  const CardDecode(this.card, this.choice, this.errors);
}

/// The best card for [bits], or null when nothing is within 3 cells.
CardDecode? decodeCardBits(int bits) {
  CardDecode? best;
  for (var i = 0; i < cardCodes.length; i++) {
    var c = cardCodes[i];
    for (var turns = 0; turns < 4; turns++) {
      final d = _ones(c ^ bits);
      if (d <= 3 && (best == null || d < best.errors)) {
        // Seen turned [turns] quarter turns clockwise from "A on top": the
        // edge now on top is D for one turn, C for two, B for three.
        best = CardDecode(i + 1, (4 - turns) % 4, d);
      }
      c = turnBits(c);
    }
  }
  return best;
}

/// Letters of the answers, in the card's order.
const answerLetters = ['A', 'B', 'C', 'D'];

/// Smallest distance between any two cards in any turns (for the tests).
int codebookDistance() {
  var min = 1 << 30;
  final all = <(int, int)>[];
  for (var i = 0; i < cardCodes.length; i++) {
    var c = cardCodes[i];
    for (var t = 0; t < 4; t++) {
      all.add((i, c));
      c = turnBits(c);
    }
  }
  for (var a = 0; a < all.length; a++) {
    for (var b = a + 1; b < all.length; b++) {
      min = math.min(min, _ones(all[a].$2 ^ all[b].$2));
    }
  }
  return min;
}

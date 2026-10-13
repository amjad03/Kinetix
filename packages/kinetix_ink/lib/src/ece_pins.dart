// Microcontroller pinouts for the pin diagram panel: the 8051 (AT89C51, 40-pin DIP), the
// ATmega328P of the Arduino Uno (28-pin DIP, with the Uno's D and A pin names), the ESP32
// DevKitC (38 header pins), the STM32 "Blue Pill" (STM32F103C8, 40 header pins) and the
// PIC16F877A (40-pin DIP). Typed from the public datasheets and board references as a teaching
// aid: always verify against the manufacturer's datasheet before wiring hardware.

/// What a pin is for; a pin's colour is its first type.
enum PinType { power, ground, gpio, adc, pwm, uart, spi, i2c, timer, interrupt, clock, reset, control }

String pinTypeName(PinType t) => switch (t) {
  PinType.power => 'Power',
  PinType.ground => 'Ground',
  PinType.gpio => 'GPIO',
  PinType.adc => 'ADC',
  PinType.pwm => 'PWM',
  PinType.uart => 'UART',
  PinType.spi => 'SPI',
  PinType.i2c => 'I²C',
  PinType.timer => 'Timer',
  PinType.interrupt => 'Interrupt',
  PinType.clock => 'Clock / crystal',
  PinType.reset => 'Reset',
  PinType.control => 'Control / bus',
};

/// One pin: its [number] (package pin, or header position on a dev board), short [name],
/// every [functions] it can take, and its [types] (the first sets its colour).
class McuPin {
  const McuPin(this.number, this.name, this.functions, this.types);
  final int number;
  final String name;
  final List<String> functions;
  final List<PinType> types;

  PinType get primary => types.first;

  /// Whether the pin matches [query] (its number, name, a function or a type's name, any case).
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return '$number' == q || name.toLowerCase().contains(q) || functions.any((f) => f.toLowerCase().contains(q)) || types.any((t) => pinTypeName(t).toLowerCase() == q);
  }
}

/// A chip or dev board: pins 1 to n/2 down the left, the rest up the right on a DIP (as the
/// package is numbered) or down the right on a dev board header ([dip] false).
class McuChip {
  const McuChip(this.id, this.name, this.package, this.dip, this.pins, this.note);
  final String id, name, package;
  final bool dip;
  final List<McuPin> pins;
  final String note;

  McuPin? pin(int number) => pins.where((p) => p.number == number).firstOrNull;
  int get rows => pins.length ~/ 2;
}

const _codes = {
  'P': PinType.power,
  'G': PinType.ground,
  'g': PinType.gpio,
  'a': PinType.adc,
  'w': PinType.pwm,
  'u': PinType.uart,
  's': PinType.spi,
  'i': PinType.i2c,
  't': PinType.timer,
  'n': PinType.interrupt,
  'c': PinType.clock,
  'r': PinType.reset,
  'x': PinType.control,
};

/// Reads the table below: "number|name|function, function|type codes" a line.
List<McuPin> _pins(String table) => [
  for (final line in table.trim().split('\n'))
    if (line.trim().isNotEmpty)
      () {
        final f = line.trim().split('|');
        return McuPin(int.parse(f[0]), f[1], [for (final x in f[2].split(',')) if (x.trim().isNotEmpty) x.trim()], [for (final c in f[3].split('')) _codes[c]!]);
      }(),
];

const verifyNote = 'Teaching reference: verify with the manufacturer\'s datasheet before wiring.';

final List<McuChip> mcuChips = [
  McuChip('at89c51', '8051 (AT89C51)', '40-pin DIP', true, _pins('''
1|P1.0|Port 1 bit 0|g
2|P1.1|Port 1 bit 1|g
3|P1.2|Port 1 bit 2|g
4|P1.3|Port 1 bit 3|g
5|P1.4|Port 1 bit 4|g
6|P1.5|Port 1 bit 5|g
7|P1.6|Port 1 bit 6|g
8|P1.7|Port 1 bit 7|g
9|RST|Reset (active high)|r
10|P3.0|RXD (serial in)|gu
11|P3.1|TXD (serial out)|gu
12|P3.2|INT0' (external interrupt 0)|gn
13|P3.3|INT1' (external interrupt 1)|gn
14|P3.4|T0 (timer 0 input)|gt
15|P3.5|T1 (timer 1 input)|gt
16|P3.6|WR' (external memory write)|gx
17|P3.7|RD' (external memory read)|gx
18|XTAL2|Crystal output|c
19|XTAL1|Crystal input|c
20|GND|Ground (VSS)|G
21|P2.0|A8 (address)|gx
22|P2.1|A9|gx
23|P2.2|A10|gx
24|P2.3|A11|gx
25|P2.4|A12|gx
26|P2.5|A13|gx
27|P2.6|A14|gx
28|P2.7|A15|gx
29|PSEN'|Program store enable|x
30|ALE/PROG'|Address latch enable, program pulse|x
31|EA'/VPP|External access enable, programming voltage|x
32|P0.7|AD7 (address/data)|gx
33|P0.6|AD6|gx
34|P0.5|AD5|gx
35|P0.4|AD4|gx
36|P0.3|AD3|gx
37|P0.2|AD2|gx
38|P0.1|AD1|gx
39|P0.0|AD0|gx
40|VCC|+5 V supply|P
'''), 'Port 0 is open drain: pull-up resistors are needed when it is used as I/O. $verifyNote'),
  McuChip('atmega328p', 'Arduino Uno (ATmega328P)', '28-pin DIP', true, _pins('''
1|PC6|RESET', PCINT14|r
2|PD0|D0, RXD, PCINT16|gu
3|PD1|D1, TXD, PCINT17|gu
4|PD2|D2, INT0, PCINT18|gn
5|PD3|D3 (PWM), INT1, OC2B, PCINT19|gwnt
6|PD4|D4, T0, XCK, PCINT20|gt
7|VCC|+5 V supply|P
8|GND|Ground|G
9|PB6|XTAL1, TOSC1, PCINT6|c
10|PB7|XTAL2, TOSC2, PCINT7|c
11|PD5|D5 (PWM), OC0B, T1, PCINT21|gwt
12|PD6|D6 (PWM), OC0A, AIN0, PCINT22|gwt
13|PD7|D7, AIN1, PCINT23|g
14|PB0|D8, ICP1, CLKO, PCINT0|gt
15|PB1|D9 (PWM), OC1A, PCINT1|gwt
16|PB2|D10 (PWM), SS, OC1B, PCINT2|gwst
17|PB3|D11 (PWM), MOSI, OC2A, PCINT3|gwst
18|PB4|D12, MISO, PCINT4|gs
19|PB5|D13, SCK, on-board LED, PCINT5|gs
20|AVCC|ADC supply|P
21|AREF|ADC reference|P
22|GND|Ground|G
23|PC0|A0, ADC0, PCINT8|ag
24|PC1|A1, ADC1, PCINT9|ag
25|PC2|A2, ADC2, PCINT10|ag
26|PC3|A3, ADC3, PCINT11|ag
27|PC4|A4, ADC4, SDA, PCINT12|agi
28|PC5|A5, ADC5, SCL, PCINT13|agi
'''), 'Every PCINT pin can raise a pin-change interrupt. $verifyNote'),
  McuChip('esp32-devkitc', 'ESP32 DevKitC', '38-pin dev board', false, _pins('''
1|3V3|3.3 V supply|P
2|EN|Enable / reset (high runs)|r
3|GPIO36|SENSOR_VP, ADC1_CH0, input only|an
4|GPIO39|SENSOR_VN, ADC1_CH3, input only|an
5|GPIO34|ADC1_CH6, input only|an
6|GPIO35|ADC1_CH7, input only|an
7|GPIO32|ADC1_CH4, TOUCH9, XTAL_32K_P, PWM|gawn
8|GPIO33|ADC1_CH5, TOUCH8, XTAL_32K_N, PWM|gawn
9|GPIO25|ADC2_CH8, DAC1, PWM|gawn
10|GPIO26|ADC2_CH9, DAC2, PWM|gawn
11|GPIO27|ADC2_CH7, TOUCH7, PWM|gawn
12|GPIO14|ADC2_CH6, TOUCH6, HSPI_CLK, PWM|gaswn
13|GPIO12|ADC2_CH5, TOUCH5, HSPI_MISO, strapping (keep low at boot)|gaswn
14|GND|Ground|G
15|GPIO13|ADC2_CH4, TOUCH4, HSPI_MOSI, PWM|gaswn
16|GPIO9|SD2, flash SPI: do not use|x
17|GPIO10|SD3, flash SPI: do not use|x
18|GPIO11|CMD, flash SPI: do not use|x
19|5V|5 V in (USB)|P
20|GND|Ground|G
21|GPIO23|VSPI_MOSI, PWM|gswn
22|GPIO22|I2C SCL (Arduino default), PWM|giwn
23|GPIO1|U0TXD (USB serial), PWM|un
24|GPIO3|U0RXD (USB serial), PWM|un
25|GPIO21|I2C SDA (Arduino default), PWM|giwn
26|GND|Ground|G
27|GPIO19|VSPI_MISO, PWM|gswn
28|GPIO18|VSPI_CLK, PWM|gswn
29|GPIO5|VSPI_CS, strapping, PWM|gswn
30|GPIO17|U2TXD, PWM|guwn
31|GPIO16|U2RXD, PWM|guwn
32|GPIO4|ADC2_CH0, TOUCH0, PWM|gawn
33|GPIO0|ADC2_CH1, TOUCH1, BOOT button, strapping|gawn
34|GPIO2|ADC2_CH2, TOUCH2, on-board LED (many boards), strapping|gawn
35|GPIO15|ADC2_CH3, TOUCH3, HSPI_CS, strapping|gaswn
36|GPIO8|SD1, flash SPI: do not use|x
37|GPIO7|SD0, flash SPI: do not use|x
38|GPIO6|CLK, flash SPI: do not use|x
'''), 'Header positions 1–19 down the left (antenna up), 20–38 down the right. ADC2 cannot be used while Wi-Fi is on. Any output GPIO can carry PWM (LEDC). $verifyNote'),
  McuChip('stm32-bluepill', 'STM32 Blue Pill (STM32F103C8)', '40-pin dev board', false, _pins('''
1|B12|SPI2_NSS, I2C2_SMBA, TIM1_BKIN|gs
2|B13|SPI2_SCK, TIM1_CH1N|gst
3|B14|SPI2_MISO, TIM1_CH2N|gst
4|B15|SPI2_MOSI, TIM1_CH3N|gst
5|A8|TIM1_CH1, MCO|gwtc
6|A9|USART1_TX, TIM1_CH2|guwt
7|A10|USART1_RX, TIM1_CH3|guwt
8|A11|USB D−, CAN_RX, TIM1_CH4|guwt
9|A12|USB D+, CAN_TX, TIM1_ETR|gu
10|A15|JTDI, remap: SPI1_NSS, TIM2_CH1|gsx
11|B3|JTDO / SWO, remap: SPI1_SCK, TIM2_CH2|gsx
12|B4|NJTRST, remap: SPI1_MISO, TIM3_CH1|gsx
13|B5|I2C1_SMBA, remap: SPI1_MOSI, TIM3_CH2|gis
14|B6|I2C1_SCL, TIM4_CH1, remap: USART1_TX|giwt
15|B7|I2C1_SDA, TIM4_CH2, remap: USART1_RX|giwt
16|B8|TIM4_CH3, remap: I2C1_SCL, CAN_RX|gwti
17|B9|TIM4_CH4, remap: I2C1_SDA, CAN_TX|gwti
18|5V|5 V in (USB)|P
19|GND|Ground|G
20|3V3|3.3 V|P
21|VBAT|Backup battery (RTC)|P
22|C13|On-board LED (active low), TAMPER-RTC|g
23|C14|OSC32_IN (32.768 kHz)|gc
24|C15|OSC32_OUT|gc
25|A0|ADC12_IN0, WKUP, USART2_CTS, TIM2_CH1_ETR|gawt
26|A1|ADC12_IN1, USART2_RTS, TIM2_CH2|gawt
27|A2|ADC12_IN2, USART2_TX, TIM2_CH3|gauwt
28|A3|ADC12_IN3, USART2_RX, TIM2_CH4|gauwt
29|A4|ADC12_IN4, SPI1_NSS, USART2_CK|gas
30|A5|ADC12_IN5, SPI1_SCK|gas
31|A6|ADC12_IN6, SPI1_MISO, TIM3_CH1|gaswt
32|A7|ADC12_IN7, SPI1_MOSI, TIM3_CH2|gaswt
33|B0|ADC12_IN8, TIM3_CH3|gawt
34|B1|ADC12_IN9, TIM3_CH4|gawt
35|B10|I2C2_SCL, USART3_TX|giu
36|B11|I2C2_SDA, USART3_RX|giu
37|R|NRST (reset)|r
38|3V3|3.3 V|P
39|GND|Ground|G
40|GND|Ground|G
'''), 'Header positions are for this drawing (boards differ); every GPIO can raise an external interrupt (EXTI). $verifyNote'),
  McuChip('pic16f877a', 'PIC16F877A', '40-pin DIP', true, _pins('''
1|MCLR'/VPP|Master clear (reset), programming voltage|r
2|RA0|AN0|ga
3|RA1|AN1|ga
4|RA2|AN2, VREF−, CVREF|ga
5|RA3|AN3, VREF+|ga
6|RA4|T0CKI, C1OUT (open drain)|gt
7|RA5|AN4, SS', C2OUT|gas
8|RE0|RD', AN5|gax
9|RE1|WR', AN6|gax
10|RE2|CS', AN7|gax
11|VDD|+5 V supply|P
12|VSS|Ground|G
13|OSC1/CLKI|Oscillator in|c
14|OSC2/CLKO|Oscillator out|c
15|RC0|T1OSO, T1CKI|gt
16|RC1|T1OSI, CCP2 (PWM 2)|gwt
17|RC2|CCP1 (PWM 1)|gwt
18|RC3|SCK, SCL|gsi
19|RD0|PSP0|gx
20|RD1|PSP1|gx
21|RD2|PSP2|gx
22|RD3|PSP3|gx
23|RC4|SDI, SDA|gsi
24|RC5|SDO|gs
25|RC6|TX, CK|gu
26|RC7|RX, DT|gu
27|RD4|PSP4|gx
28|RD5|PSP5|gx
29|RD6|PSP6|gx
30|RD7|PSP7|gx
31|VSS|Ground|G
32|VDD|+5 V supply|P
33|RB0|INT (external interrupt)|gn
34|RB1|Port B|g
35|RB2|Port B|g
36|RB3|PGM (low-voltage programming)|gx
37|RB4|Interrupt on change|gn
38|RB5|Interrupt on change|gn
39|RB6|PGC (ICSP clock), interrupt on change|gnx
40|RB7|PGD (ICSP data), interrupt on change|gnx
'''), verifyNote),
];

McuChip? mcuChip(String id) => mcuChips.where((c) => c.id == id).firstOrNull;

/// The pin diagram panel: a chip, the pin picked, a type to pick out and a search.
class McuPinout {
  const McuPinout({this.title = '', this.chip = 'at89c51', this.selected, this.filter, this.query = ''});

  factory McuPinout.fromJson(Map<String, Object?> j) => McuPinout(
    title: j['t'] is String ? j['t'] as String : '',
    chip: mcuChip('${j['chip']}') == null ? 'at89c51' : '${j['chip']}',
    selected: j['sel'] is num ? (j['sel'] as num).round() : null,
    filter: PinType.values.asNameMap()[j['type']],
    query: j['q'] is String ? j['q'] as String : '',
  );

  Map<String, Object?> toJson() => {'t': title, 'chip': chip, if (selected != null) 'sel': selected, if (filter != null) 'type': filter!.name, if (query.isNotEmpty) 'q': query};

  final String title, chip, query;
  final int? selected;
  final PinType? filter;

  McuChip get device => mcuChip(chip)!;
  String get heading => title.isEmpty ? device.name : title;

  McuPinout copyWith({String? title, String? chip, int? Function()? selected, PinType? Function()? filter, String? query}) => McuPinout(
    title: title ?? this.title,
    chip: chip ?? this.chip,
    selected: selected == null ? this.selected : selected(),
    filter: filter == null ? this.filter : filter(),
    query: query ?? this.query,
  );

  /// Whether [p] is picked out by the type and the search.
  bool shows(McuPin p) => (filter == null || p.types.contains(filter)) && p.matches(query);
}

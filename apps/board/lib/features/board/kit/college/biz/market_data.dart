import 'package:kinetix_ink/kinetix_ink.dart';

/// Sample market datasets bundled with the board, for teaching without a network. The figures
/// are rounded, approximate educational values compiled from public statistics (NSE, RBI,
/// MoSPI, TRAI); they are labelled as samples on every chart and are not for investment or
/// research use. Last compiled: early 2025.
class MarketDataset {
  const MarketDataset(this.id, this.title, this.kind, this.csv, {this.yLabel = ''});

  final String id, title, csv, yLabel;
  final KitChartKind kind;

  static const asOf = 'early 2025';

  /// The note every chart from a dataset carries.
  static const note = 'Sample, educational figures (approximate, rounded), as of $asOf. Not for investment or research use.';

  ChartData get chart => ChartData.fromCsv(csv, kind: kind, title: title, note: note).copyWith(yLabel: yLabel);
}

const marketDatasets = <MarketDataset>[
  MarketDataset('nifty-2024', 'NIFTY 50: month-end close, 2024', KitChartKind.line, '''
Month,NIFTY 50
Jan,21726
Feb,21983
Mar,22327
Apr,22605
May,22531
Jun,24011
Jul,24951
Aug,25236
Sep,25811
Oct,24205
Nov,24131
Dec,23645''', yLabel: 'Index points'),
  MarketDataset('nifty-years', 'NIFTY 50: year-end close', KitChartKind.line, '''
Year,NIFTY 50
2014,8283
2015,7946
2016,8186
2017,10531
2018,10863
2019,12168
2020,13982
2021,17354
2022,18105
2023,21731
2024,23645''', yLabel: 'Index points'),
  MarketDataset('inr-usd', 'Rupees per US dollar (yearly average)', KitChartKind.line, '''
Year,INR per USD
2014,61.0
2015,64.2
2016,67.2
2017,65.1
2018,68.4
2019,70.4
2020,74.1
2021,73.9
2022,78.6
2023,82.6
2024,83.7''', yLabel: '₹ per \$'),
  MarketDataset('gdp-growth', 'India: real GDP growth', KitChartKind.bar, '''
Year,GDP growth %
2014-15,7.4
2015-16,8.0
2016-17,8.3
2017-18,6.8
2018-19,6.5
2019-20,3.9
2020-21,-5.8
2021-22,9.7
2022-23,7.0
2023-24,8.2
2024-25,6.5''', yLabel: '% a year'),
  MarketDataset('cpi', 'India: CPI inflation and RBI repo rate (year end)', KitChartKind.line, '''
Year,CPI inflation %,Repo rate %
2014-15,5.9,7.50
2015-16,4.9,6.75
2016-17,4.5,6.25
2017-18,3.6,6.00
2018-19,3.4,6.25
2019-20,4.8,4.40
2020-21,6.2,4.00
2021-22,5.5,4.00
2022-23,6.7,6.50
2023-24,5.4,6.50
2024-25,4.6,6.25''', yLabel: '%'),
  MarketDataset('telecom-share', 'India: mobile subscribers by operator, 2024', KitChartKind.pie, '''
Operator,Share %
Reliance Jio,40
Bharti Airtel,33
Vodafone Idea,18
BSNL,8
Others,1'''),
  MarketDataset('gva-sectors', 'India: share of GVA by sector, 2023-24', KitChartKind.pie, '''
Sector,Share %
Services,55
Industry,27
Agriculture,18'''),
  MarketDataset('car-share', 'India: passenger-vehicle market share, 2023-24', KitChartKind.bar, '''
Maker,Share %
Maruti Suzuki,41
Hyundai,15
Tata Motors,14
Mahindra,11
Kia,6
Toyota,5
Others,8''', yLabel: '% of units sold'),
];

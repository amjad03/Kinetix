import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:archive/archive.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'layout/page_overview.dart' show pageArea;

/// A text box on a slide, in the page picture's pixels.
class PptxText {
  const PptxText(this.text, this.rect, {this.fontSize = 24, this.color = const Color(0xFF000000), this.bold = false});
  final String text;
  final Rect rect;
  final double fontSize;
  final Color color;
  final bool bold;
}

/// One board page: its picture (PNG, without the typed text) and the typed text as text boxes.
class PptxPage {
  const PptxPage(this.png, this.size, [this.texts = const []]);
  final Uint8List png;
  final Size size;
  final List<PptxText> texts;
}

/// 16:9 slides (13.333 × 7.5 in), in EMU.
const _slideW = 12192000, _slideH = 6858000;
const _emuPerPoint = 12700;
const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

String _esc(String s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
String _hex(Color c) => ((c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')).toUpperCase();

/// A PowerPoint deck: one slide per page, the page's picture fitted to the slide and its typed
/// text as editable text boxes on top. Opens in PowerPoint, Google Slides, Keynote and the board.
Uint8List buildPptx(List<PptxPage> pages, {String title = 'Zynetix board'}) {
  final files = <String, List<int>>{};
  void put(String path, String xml) => files[path] = utf8.encode(xml);
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns =
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  final n = pages.length;

  put(
    '[Content_Types].xml',
    '$decl<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="png" ContentType="image/png"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        '${[for (var i = 1; i <= n; i++) '<Override PartName="/ppt/slides/slide$i.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'].join()}'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>',
  );
  put(
    '_rels/.rels',
    '$decl<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="$rel/officeDocument" Target="ppt/presentation.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="$rel/extended-properties" Target="docProps/app.xml"/>'
        '</Relationships>',
  );
  put(
    'docProps/core.xml',
    '$decl<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        '<dc:title>${_esc(title)}</dc:title><dc:creator>Zynetix</dc:creator></cp:coreProperties>',
  );
  put(
    'docProps/app.xml',
    '$decl<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Zynetix Board</Application><Slides>$n</Slides></Properties>',
  );

  put(
    'ppt/presentation.xml',
    '$decl<p:presentation $ns saveSubsetFonts="1">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        '<p:sldIdLst>${[for (var i = 1; i <= n; i++) '<p:sldId id="${255 + i}" r:id="rId${i + 2}"/>'].join()}</p:sldIdLst>'
        '<p:sldSz cx="$_slideW" cy="$_slideH"/><p:notesSz cx="6858000" cy="9144000"/>'
        '<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-IN"/></a:defPPr></p:defaultTextStyle>'
        '</p:presentation>',
  );
  put(
    'ppt/_rels/presentation.xml.rels',
    '$decl<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="$rel/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
        '<Relationship Id="rId2" Type="$rel/theme" Target="theme/theme1.xml"/>'
        '${[for (var i = 1; i <= n; i++) '<Relationship Id="rId${i + 2}" Type="$rel/slide" Target="slides/slide$i.xml"/>'].join()}'
        '</Relationships>',
  );

  const emptyTree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>';
  put(
    'ppt/slideMasters/slideMaster1.xml',
    '$decl<p:sldMaster $ns>$emptyTree'
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
        '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
  );
  put(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    '$decl<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="$rel/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId2" Type="$rel/theme" Target="../theme/theme1.xml"/></Relationships>',
  );
  put(
    'ppt/slideLayouts/slideLayout1.xml',
    '$decl<p:sldLayout $ns type="blank" preserve="1">${emptyTree.replaceFirst('<p:cSld>', '<p:cSld name="Blank">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
  );
  put(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    '$decl<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="$rel/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
  );
  put('ppt/theme/theme1.xml', _theme);

  for (var i = 0; i < n; i++) {
    final page = pages[i];
    final w = math.max(1.0, page.size.width), h = math.max(1.0, page.size.height);
    // The picture fills the slide's width or height, centred; text boxes go where they were on the page.
    final s = math.min(_slideW / w, _slideH / h);
    final ox = ((_slideW - w * s) / 2).round(), oy = ((_slideH - h * s) / 2).round();
    final shapes = StringBuffer()
      ..write(
        '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
        '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        '<p:spPr><a:xfrm><a:off x="$ox" y="$oy"/><a:ext cx="${(w * s).round()}" cy="${(h * s).round()}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>',
      );
    for (final (j, t) in page.texts.indexed) {
      final x = ox + (t.rect.left * s).round(), y = oy + (t.rect.top * s).round();
      final cx = math.max(1, (t.rect.width * s).round()), cy = math.max(1, (t.rect.height * s).round());
      final sz = (t.fontSize * s / _emuPerPoint * 100).round().clamp(100, 400000);
      final paras = t.text
          .split('\n')
          .map(
            (line) =>
                '<a:p><a:r><a:rPr lang="en-IN" sz="$sz"${t.bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${_hex(t.color)}"/></a:solidFill></a:rPr><a:t>${_esc(line)}</a:t></a:r></a:p>',
          )
          .join();
      shapes.write(
        '<p:sp><p:nvSpPr><p:cNvPr id="${j + 3}" name="Text ${j + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
        '<p:spPr><a:xfrm><a:off x="$x" y="$y"/><a:ext cx="$cx" cy="$cy"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
        '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>$paras</p:txBody></p:sp>',
      );
    }
    put(
      'ppt/slides/slide${i + 1}.xml',
      '$decl<p:sld $ns><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
          '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>$shapes</p:spTree></p:cSld>'
          '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
    );
    put(
      'ppt/slides/_rels/slide${i + 1}.xml.rels',
      '$decl<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          '<Relationship Id="rId1" Type="$rel/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
          '<Relationship Id="rId2" Type="$rel/image" Target="../media/image${i + 1}.png"/></Relationships>',
    );
    files['ppt/media/image${i + 1}.png'] = page.png;
  }

  final archive = Archive();
  // [Content_Types].xml first, as Office expects.
  for (final path in ['[Content_Types].xml', ...files.keys.where((k) => k != '[Content_Types].xml')]) {
    final bytes = files[path]!;
    archive.addFile(ArchiveFile(path, bytes.length, bytes));
  }
  return Uint8List.fromList(ZipEncoder().encode(archive));
}

/// Every page of [wb] as a deck: the page drawn as a picture (at most 1600 px wide) without its
/// typed text, which goes on top as text boxes the teacher can edit in PowerPoint.
Future<Uint8List> boardPptx(WhiteboardController wb, Size canvas, {String title = 'Zynetix board'}) async {
  final pages = <PptxPage>[];
  for (final p in wb.pages) {
    final area = pageArea(p.elements, canvas);
    final k = area.width > 1600 ? 1600 / area.width : 1.0;
    final w = math.max(1, (area.width * k).round()), h = math.max(1, (area.height * k).round());
    final texts = <PptxText>[];
    final drawn = <BoardElement>[];
    for (final e in p.elements) {
      if (e is TextElement && e.rotation == 0 && e.text.trim().isNotEmpty) {
        texts.add(
          PptxText(e.text, Rect.fromLTWH((e.position.dx - area.left) * k, (e.position.dy - area.top) * k, e.size.width * k, e.size.height * k), fontSize: e.fontSize * k, color: e.color, bold: e.bold),
        );
      } else {
        drawn.add(e);
      }
    }
    final images = BoardImages();
    await images.preload(drawn);
    final recorder = ui.PictureRecorder();
    final c = Canvas(recorder)
      ..scale(k)
      ..translate(-area.left, -area.top);
    paintBoardBackground(c, area, p.background);
    for (final e in drawn) {
      paintElement(c, e, p.background, images: images, paintMath: true);
    }
    final image = await recorder.endRecording().toImage(w, h);
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    images.dispose();
    pages.add(PptxPage(png!.buffer.asUint8List(), Size(w.toDouble(), h.toDouble()), texts));
  }
  return buildPptx(pages, title: title);
}

const _theme =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Zynetix"><a:themeElements>'
    '<a:clrScheme name="Zynetix"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>'
    '<a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="16A34A"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="DC2626"/></a:accent4>'
    '<a:accent5><a:srgbClr val="7C3AED"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>'
    '<a:fontScheme name="Zynetix"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    '<a:fmtScheme name="Zynetix"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>'
    '</a:themeElements></a:theme>';

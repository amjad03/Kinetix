# Documents and certificates

Institution branding, the document template engine, the register of issued documents (signed,
verifiable, revocable), certificate wording templates with a request → approve → issue workflow,
ID cards, fee receipts and invoices, and a document vault per student and staff member.

Code: `services/api/src/documents/` (engine in `engine/`, system presets in `presets/`). The
layout schema is `packages/shared/src/doc-layout.ts`; sample data and the binding catalogue are
`packages/shared/src/doc-samples.ts`. ERP pages: `/documents/*` and `/settings/branding`. Sample
output: `docs/demo/samples/` (every preset of the student and staff ID card, marks card and fee
receipt, the 10-up card sheet, and a card with Hindi and Kannada text).

## Branding

Settings › Institution › Branding (`/settings/branding`, principal or administrator), stored in
`institution_branding` (one row per institution, migration 0139):

- **Images**: logo for light backgrounds (`logo`), logo for dark backgrounds (`logo_dark`),
  crest (`emblem`), official seal (`seal`), browser icon (`favicon`), and one signature per
  signatory. Uploads (PNG, JPEG, WebP or SVG up to 4 MB, base64 JSON to
  `PUT /v1/admin/branding/assets/:kind`) are normalised with sharp to PNG with transparency, at
  most 1600 px (favicon 256 px square). Signatures scanned on white have the paper made
  transparent and are trimmed. Files go to object storage
  (`tenants/<id>/branding/<kind>-<uuid>.png`); the row keeps the key, a content-hash version and
  the size.
- **Signatories**: `principal`, `registrar`, `controller` (controller of examinations),
  `finance` and `hr`, each with a name, designation and signature.
- **Palette**: `primary`, `secondary`, `tertiary`, `accent`, `ink` (text) and `paper`, as
  `#rrggbb`. The page has colour pickers with hex inputs, a live HTML preview (a certificate and
  an ID card) that follows unsaved changes, WCAG contrast checks for the pairs documents set text
  in (AA 4.5:1, large text 3:1), and a server-rendered preview of a real certificate.
- **Fonts**: heading and body, from curated families that each cover Latin, Devanagari and
  Kannada and are embedded in every PDF: Noto Serif, Noto Sans, Playfair Display, EB Garamond,
  Cinzel and Poppins. Latin comes from the family; Hindi and Kannada from Noto Serif or Noto Sans
  Devanagari and Kannada matched to it (Poppins draws Devanagari itself). The fonts and their OFL
  licences are in `services/api/assets/fonts`.
- **Tagline** (the line under the name) and **GSTIN** (printed on fee invoices).

The logo shows in the ERP sidebar header and as the browser icon, on the sign-in page (for the
institution last signed in to), on the public verification page and on every document. Apps and
email templates read the public endpoints: `GET /v1/public/branding/:slug` (name, palette, fonts,
tagline and versioned image paths; no sign-in, rate limited) and
`GET /v1/public/branding/:slug/:kind` (`logo`, `logo_dark`, `emblem`, `seal`, `favicon`; cached
a day). Signatures are never public. The ERP proxies the images at `/api/branding/:slug/:kind`.

## The document engine

Every document is a **layout** (JSON) rendered with **data** and the institution's **branding**:

```
layout (template)  +  data (student, receipt, marks…)  +  branding (palette, fonts, images, signatories)
        │                         │                                  │
        └──────────── LayoutRenderer (engine/layout-render.ts) ──────┘
                         │ draws on a Surface (engine/canvas.ts)
          ┌──────────────┴──────────────┐
     PdfSurface (print)            SvgSurface (preview) ── sharp ──▶ PNG
```

- Text is shaped with HarfBuzz (`engine/fonts.ts`): conjuncts and vowel signs for Hindi and
  Kannada, kerning and ligatures for Latin. Each character takes the face of its script; one the
  Latin face lacks (₹) falls back to Noto. Families without an italic are slanted.
- **PDF** (`engine/pdf-surface.ts`): PDF 1.7 with compressed content; TrueType fonts **subset**
  to the glyphs used (`subsetTrueType`) and embedded as Identity-H CID fonts with ToUnicode maps
  and ActualText spans, so text copies and searches correctly in every script; axial and radial
  shadings for gradients; PNG transparency as soft masks; opacity; clipping; a link on the QR.
- **SVG** (`engine/svg-surface.ts`): the same drawing with glyph outlines as paths, so the
  preview matches print with no fonts on the viewer's machine. With `animate`, the holographic
  seal gets a moving sheen (CSS). PNG is the SVG rasterised with sharp.
- **ID card sheets** (`renderCardSheets`): CR80 cards ten to an A4 sheet (2 × 5; portrait cards
  are turned a quarter), crop marks at every corner, a sheet of fronts then a sheet of backs laid
  out for long-edge duplex.
- **Barcodes**: Code 128 (`engine/barcode.ts`; set C for even-length digit strings). **QR**: the
  existing encoder (`src/common/qr.ts`).
- **Security ornaments** (`engine/ornaments.ts`, smooth cubic curves): guilloche line bands and
  rosettes, waves, crosshatch, dots, micro-text, frames (single, double, triple, ornamental with
  corner flourishes, guilloche chain band, corners), and the **holographic seal**: a scalloped
  metal rim and rings in multi-stop silver (or gold) linear and radial gradients, guilloche rings,
  engine-turned lines, a micro-text ring (`INSTITUTION • GENUINE • <serial>`), the crest in the
  centre, the serial on a plaque and an iridescent overlay.
- **Report covers**: `DocumentEngine.withCover` puts the institution's report cover in front of a
  report PDF from the older writers (`engine/merge.ts`).

`DocumentEngine` (`document-engine.service.ts`, a global Nest provider) is what generators call.
`produce(tx, actor, { docType, title, subject, source, data, keyFields, serial?, token?, photo? })`
records the document in the register, renders it with the institution's default template for its
type and returns the PDF. `produceCards` does the same for a batch of cards (one record each).
`preview` renders any layout with sample data (serial `SPECIMEN`) as SVG, PNG or PDF.

### Generators that use it

| Document | Endpoint | Type |
|---|---|---|
| Certificates (request workflow) | `GET /v1/documents/requests/:id/pdf` | bonafide and study → `bonafide_certificate`; `transfer_certificate`; `conduct_certificate`; `course_completion_certificate`; others → `generic_certificate` |
| Student and staff ID cards | `GET /v1/documents/id-cards/{students,staff,me}.pdf` | `student_id_card`, `staff_id_card` |
| Fee receipt | `GET /v1/documents/fee-receipts/:paymentId.pdf` | `fee_receipt` |
| Fee invoice (GST-ready) | `GET /v1/documents/fee-invoices/:invoiceId.pdf` | `fee_invoice` |
| Appointment letter | `GET /v1/documents/appointment-letters/:userId.pdf` | `appointment_letter` |
| Payslip | `GET /v1/payroll/payslips/:id/pdf` | `salary_slip` |
| Offer letter | `GET /v1/hr/offers/:id/pdf` | `offer_letter` |
| Hall ticket (semester exams) | `GET /v1/exam-sessions/:id/hall-tickets/:studentId/pdf` | `hall_ticket` |
| Hall ticket (entrance test) | admissions `…/hall-ticket` (staff and applicant) | `hall_ticket` |
| Marks card | `GET /v1/results/students/:id/marks-card.pdf` | `marks_card` |
| Transcript | `GET /v1/results/students/:id/transcript.pdf` | `transcript` |
| Academic documents | `GET /v1/academic-docs/requests/:id/document.pdf` | transcript and consolidated grade card → `transcript`; provisional certificate → `course_completion_certificate` |
| Club participation | `GET /v1/campus-life/clubs/:id/members/:studentId/certificate` | `generic_certificate` |
| Reports | quality hub and academics report PDFs | `report_cover` page in front |

## Layout JSON

The contract for templates and for the template editor: TypeScript types and Zod schemas in
`packages/shared/src/doc-layout.ts` (`DocLayoutSchema`, `ElementSchema`, `DocLayout`,
`DocElement`, `ElementOf<'text'>`, `DocLayoutInput` for layouts as written). The API validates
every saved or previewed layout with the schema and answers `400` with the first issues
otherwise.

```jsonc
{
  "schemaVersion": 1,
  "docType": "marks_card",                    // one of DOC_TYPES (16 types)
  "page": { "size": "A4", "orientation": "portrait", "marginMm": 12 },
  "fonts": { "heading": "playfair" },          // optional: this template's fonts instead of the institution's
  "sides": [                                   // pages; cards have "front" and "back"
    {
      "id": "page", "label": "Page", "background": "paper",
      "elements": [
        { "id": "title", "type": "text", "x": 20, "y": 58, "w": 170, "h": 9,
          "text": "{{doc.title}}",
          "style": { "font": "heading", "sizePt": 18, "weight": 700, "color": "primary", "align": "center",
                     "lineHeight": 1.1, "letterSpacingPt": 3, "transform": "uppercase" } }
      ]
    }
  ],
  "meta": { "style": "classic", "description": "…" }
}
```

**Units.** Positions and sizes (`x`, `y`, `w`, `h` and anything ending in `Mm`) are millimetres
from the top-left of the side; font sizes and line widths (anything ending in `Pt`) are points;
angles are degrees, clockwise. **Page sizes**: `A4`, `A5`, `CR80` (85.6 × 53.98 mm, the ID-1
card) or `custom` (`widthMm`, `heightMm`), each `portrait` or `landscape`; `pageSizeMm(page)`
gives the result.

**Colours** (`ColorRef`): a palette token (`primary`, `secondary`, `tertiary`, `accent`, `ink`,
`paper`, and the derived `muted` = ink at 60 %, `line` = ink at 18 %, `white`, `black`), a tint
toward paper (`primary.15` = 15 % primary over paper), a shade toward black (`primary!30` = primary
30 % darker), or a `#rrggbb` hex. Tokens follow the branding palette, so changing the palette
restyles every template; `resolveColor(ref, palette)` gives the hex. **Fills**: a colour, a
linear gradient `{ "kind": "linear", "angleDeg": 0, "stops": [{ "at": 0, "color": "primary" }, …] }`
(0° runs left to right, 90° top to bottom) or a radial gradient
`{ "kind": "radial", "cx": 0.5, "cy": 0.5, "r": 1, "stops": […] }` (fractions of the box).
**Strokes**: `{ color, widthPt, dashMm?, cap? }`. **Fonts** (`TextStyle.font`): `heading` or
`body` (the branding's, or the template's `fonts`) or a family id.

**Bindings.** Any text may hold `{{path}}`, resolved against the document's data, such as
`{{student.name}}`, `{{institution.name}}`, `{{doc.serial}}` or `{{verify.url}}`. Inside a table
column, `{{row.<key>}}` is the current item. Filters: `upper`, `lower`, `title`, `initials`,
`money` (`Rs. 12,34,567.00`, Indian grouping), `words` (`Rupees Forty-Two Thousand … Only`),
`date` (`2026-10-05` → `5 October 2026`) and `default:<text>`. Every type's bindings with sample
values are in `DOC_BINDINGS`, and `GET /v1/documents/designs/bindings/:docType` returns them with
the sample data (the institution's own name, contacts and signatories in place of the sample's). Common to all types: `institution.*` (name, legalName, tagline, address, city,
state, pincode, phone, email, website, affiliation, code, board, established, gstin),
`signatory.<role>.{name,designation}`, `doc.{title,serial,issuedOn,fingerprint,…}` and
`verify.url`.

**Common element properties**: `id` (unique on its side), `name` (for the layer list), `x`, `y`,
`w`, `h`, `rotationDeg`, `opacity`, `hidden`, `locked` (editor only), `pages` (`all`, or the
`first` or `last` page when a long table continues on more pages), `showIf` (a binding path: the
element is drawn only when it has a value) and `flowAfter` (the id of an earlier element on the
same side: this one moves up by the height that one left unused, so a summary sits right under a
table of any length). Elements are drawn in order, later ones on top.

| `type` | Draws | Main properties |
|---|---|---|
| `text` | Wrapped text | `text`, `style` (font, sizePt, weight 400/600/700, italic, color, align left/center/right/justify, lineHeight, letterSpacingPt, transform), `vAlign`, `fit: "shrink"` with `minSizePt` (smaller type comes before breaking a word), `markdown` (`**bold**`, `*italic*`), `emphasisColor`, `maxLines` (ellipsis) |
| `field` | A label and its value | `label`, `value`, `direction` row or column, `labelWidthMm`, `separator`, `labelStyle`, `valueStyle`, `rule` (a form line) |
| `fieldList` | Label-value pairs from a list (`doc.fields`) | `source`, `columns`, `rowHeightMm`, `labelWidthMm`, `separator`, the two styles, `rule` |
| `image` | A branding image, the photo or a signature | `source` (`logo`, `logo_dark`, `emblem`, `seal`, `photo`, `signature:<role>`), `fit` contain/cover/fill, `crop` rect/rounded/circle, `radiusMm`, `border`, `background`, `placeholder` (initials, silhouette or none for a missing photo) |
| `signature` | Signature image, line, name and designation of a signatory | `role`, `showImage`, `showName`, `showDesignation`, `line`, `nameStyle`, `designationStyle` |
| `qr` | QR code | `value` (default `{{verify.url}}`), `color`, `background`, `quietZone` |
| `barcode` | Code 128 | `value` (for example `{{student.rollNo}}`), `color`, `showText`, `textStyle` |
| `table` | Rows of a list | `source` (`marks.rows`, `fee.lines`, `invoice.lines`, `papers`, `pay.rows`, `transcript.rows`…), `columns` [{ header, value, width (relative), align }], `header` { style, fill, heightMm }, `body` { style, rowHeightMm, zebra }, `borders` { outer, horizontal, vertical, headerBottom }, `footer` rows of spanning cells (totals), `cellPaddingMm`, `background`, `emptyText`, `overflow` paginate or shrink |
| `shape` | Rectangle, ellipse or line | `shape`, `fill`, `stroke`, `radiusMm` (a line runs from (x, y) to (x + w, y + h)) |
| `watermark` | Rotated text or image | `text` or `image`, `angleDeg`, `style`, `repeat` none or tile, `gapMm` |
| `pattern` | A security background, clipped to the box | `pattern` guilloche/rosette/waves/microtext/crosshatch/dots, `color`, `color2`, `lineWidthPt`, `density` 1–10, `text` (micro-text), `radiusMm` |
| `frame` | A decorative border inside the box | `style` single/double/triple/ornamental/guilloche/corners, `color`, `color2`, `widthPt`, `gapMm`, `radiusMm` |
| `seal` | The holographic seal | `tone` silver or gold, `emblem` emblem/logo/none, `ringText` (default `{{institution.name \| upper}} • GENUINE • {{doc.serial}}`), `serial` |

A table with `overflow: "paginate"` continues on further pages of the same side, every other
element repeated unless marked `pages: "first"` or `"last"`; its footer rows print on the last
page only. With `"shrink"` the rows get shorter to fit.

**For the template editor**: load a template with `GET /v1/documents/designs/:id`, edit its
`layout`, preview unsaved work with `POST /v1/documents/designs/preview { layout, format, side?,
width?, subject? }` (SVG, PNG or PDF; `subject: { type: 'student' | 'staff', id }` uses a real
person's details and photo instead of the sample's), and save with
`PUT /v1/documents/designs/:id { layout, note?, name? }`, which adds a version. An invalid layout
is a `400` with `code: "LAYOUT_INVALID"` and `issues: [{ path, message }]` (up to 50; paths like
`["sides", 0, "elements", 3, "style", "sizePt"]`). Presets are read-only: duplicate one first
(`POST /v1/documents/designs { from, name }`). Keep element ids stable across saves. Elements may
carry `group` (editor only: grouped elements select and move together; the engine ignores it).

## Templates and presets

The system presets (`src/documents/presets/`, ids `preset:<docType>:<style>`) give each of the 16
document types four looks:

- **Classic**: serif type, an ornamental double border in primary and secondary with corner
  flourishes, the crest centred, a letter-spaced title over a diamond rule, a crest watermark,
  the seal between the signatures.
- **Modern**: a bold gradient band (primary into tertiary) with the light logo, an accent stripe,
  sans-serif type, tinted panels and gradient table headers, a footer band.
- **Minimal**: whitespace and hairlines, a small logo, quiet type, a small seal beside the QR.
- **Heritage**: a guilloche security background with a rosette, a guilloche chain border, a
  micro-text strip under the header, Cinzel titles, the seal top right, white panels over the
  security ground.

ID cards: Classic and Modern are portrait, Minimal and Heritage landscape; the front has the
photo (rectangle, rounded or circle crop), name, class or designation, blood group, validity and
a Code 128 barcode; the back the QR, emergency contact, address, the principal's signature and a
return address. Staff cards use the tertiary colour. Fee receipts are A5 landscape (Classic,
Modern, Minimal) or an A4 sheet with a student's copy and an office copy (Heritage). Course
completion and merit or participation certificates are A4 landscape with the name in display
type.

The institution's own templates are in `doc_templates` (copies of a preset or another template),
every saved version in `doc_template_versions` (restoring makes an old version current as a new
version), and the template each type uses in `doc_template_defaults` (a template id or a preset
id; Classic until one is chosen). Deleting a template archives it, and its type falls back to
Classic. Issued documents keep their data, so a reprint uses the current default template.

ERP: Documents › Templates (`/documents/templates?type=`) is the gallery. Types are grouped (ID
cards, examinations, fees, certificates, staff, reports); each design shows a thumbnail (rendered
with the institution's branding and sample data; cards show front and back), **Use this design**,
**Customise** (a preset is copied, named "My <style> design", and the copy opens in the editor;
the institution's own designs open directly), duplicate, rename, versions with restore and delete,
and a large animated preview (SVG with the seal's shimmer) with Open PDF. The certificate wording
templates are under Documents › Certificate text (`/documents/templates/wording`).

## The design editor

`/documents/templates/<id>/edit` (principal or administrator; a preset id shows "make a copy"
instead; phones and small tablets get a "use a larger screen" note). Code:
`apps/erp/src/components/documents/editor/` (UI) and `apps/erp/src/lib/doc-editor/` (pure logic,
tested in `model.test.ts`). The ERP imports the layout schema straight from
`packages/shared/src/doc-layout.ts`, so it validates exactly what the API accepts.

- **Canvas** (`EditorCanvas`): an SVG at true millimetre scale (100 % is real size on a 96 dpi
  screen; zoom 25 to 400 %, fit, Ctrl + wheel at the pointer, Space or middle-button drag to pan),
  rulers in mm with the cursor and selection marked, a grid, the margin (the safe area on cards),
  and for CR80 cards the 2 mm bleed and the rounded cut line. Each element is drawn by
  `lib/doc-editor/render.ts`, a port of the engine's `LayoutRenderer` (same geometry, line
  breaking, shrink-to-fit, tables, frames, guilloche, seal, QR and Code 128) that sets text in the
  same TrueType fonts the PDF embeds (`GET /v1/documents/designs/fonts/:file`, loaded with
  `@font-face` per family, with Devanagari and Kannada faces by unicode-range). Elements are drawn
  in local coordinates and cached, so a drag only moves a transform. **Print preview** posts the
  unsaved layout to `POST /v1/documents/designs/preview` (PDF of every page and side, or a PNG of
  one side) so what prints is the server's rendering.
- **Editing** (`lib/doc-editor/model.ts`, a reducer): select (click, Shift-click, marquee; a click
  on a group selects the group, a second click the element), move by drag or arrow keys (0.1 mm,
  Shift 1 mm), resize from eight handles (Shift keeps the ratio; a rotated box keeps its opposite
  corner), rotate (Shift: 15° steps), snapping to the page edges and centre, the margin, other
  elements' edges and centres and the grid, with smart guides and distance hints; z-order, lock,
  hide, group (`group` on the elements, editor only), duplicate, copy, cut, paste, delete, align
  (to the selection, or the page for one element) and distribute; undo and redo over a history of
  200 steps (a drag, a run of nudges or typing in one field is one step).
- **Add panel**: heading, text box, data field (a binding picker listing the type's bindings with
  sample values and filters), details list, photo, logo, crest, official seal, signature block or
  image, upload (replaces a branding image: logo, crest, seal or a signature), verification QR,
  barcode, a table per list binding, rectangle, rounded box, line, circle, colour band, border,
  holographic seal, guilloche, rosette and watermark. Click to add in the middle of the page, or
  drag onto the canvas.
- **Properties**: position and size in mm, rotation, opacity; per type, text with `{{bindings}}`
  (inserted at the cursor, with how it reads), font (heading, body or a family), size, weight,
  italic, colour, alignment, spacing and case, shrink to fit; colours as palette tokens with tints
  and shades or any hex; fills (colour, linear or radial gradient with stops); strokes; photo crop
  shape and placeholder; table source, columns (heading, cell binding, width, alignment, order),
  header, rows, zebra, borders and totals; seal tone, centre, ring text; `showIf`, `flowAfter`,
  `pages`; **Reset to the original design** for elements that came from the preset. With nothing
  selected: page size and orientation, margin, the side's background and the template's fonts.
- **Layers**: the side's elements top first; drag (or Alt + arrow keys) to reorder, double-click
  or F2 to rename, lock and hide. **Data**: preview with the sample or a real student or staff
  member (`GET /v1/documents/designs/subjects?kind=&q=` and `…/subjects/:type/:id`); the canvas
  and the print preview then show their details (the print preview also their photo).
- **Saving**: Save adds a version with an optional note (`PUT /v1/documents/designs/:id`); the
  layout is checked against the schema as you edit, and problems (the editor's, or the API's
  `LAYOUT_INVALID` issues with their paths) are marked on the canvas, the layer list and the
  property at fault. Versions with restore, **Use this design**, and a guard against leaving with
  unsaved changes.
- Keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+C / X / V / D, Delete, Ctrl+A, Ctrl+G /
  Ctrl+Shift+G, Ctrl+L, Ctrl+] / [ (Shift: to front / back), Ctrl+S, Ctrl+0 (fit), Ctrl+1
  (100 %), Ctrl+' (grid), + and −, Escape, and Tab to step through the elements. Strings in
  `apps/erp/src/i18n/messages/doc-editor.ts` (en, hi, kn).

## The register of issued documents

`issued_documents` (migration 0140) records every document the engine prints: type, title,
subject (type, id and name), source (what it was made from: a payment, a certificate request, a
payslip, `<session>:<student>` for a hall ticket…), the key fields the public page shows, the
data it was rendered from (`payload`), `payload_hash` (SHA-256 of the canonical JSON of the type,
title, subject, key fields and data), an **Ed25519 signature** over
`KXD1|<tenant>|<serial>|<docType>|<payloadHash>|<issuedAt ISO>` with the institution's signing key
(the key offline board pairing uses, `SigningKeys`; the public key is stored on the row, so old
documents still verify after a rotation), the serial, a random 128-bit QR token, the template and
its version, and the status: `valid`, `revoked` (with a reason) or `superseded`.

- **Serials**: a document with its own number keeps it (certificate serial, receipt, invoice,
  offer, payslip and hall ticket numbers); others get `<prefix>/<financial year>/<00001>`
  (prefixes in `DOC_TYPE_INFO`). A later revision of a numbered document is `<number>-R2`, `-R3`.
- **Idempotent**: printing the same source again with the same data returns the same record;
  with changed data the old record is superseded and a new one issued.
- **Fingerprint**: the first 12 hex digits of the hash (`7F3A-91C2-04BE`), printed beside the QR
  on every document and shown on the verification page, so a reader can match a paper copy with
  its record.
- **Revocation**: `POST /v1/documents/issued/:id/revoke { reason }` (principal or administrator).
  Revoking a certificate request or withholding a hall ticket revokes its record too. A reprint of
  a revoked or superseded record carries a large REVOKED or SUPERSEDED stamp.
- **Reissue**: `POST /v1/documents/issued/:id/reissue` gives the same data a fresh serial and QR
  (a lost copy); the old one verifies as replaced.
- `GET /v1/documents/issued?docType=&status=&q=` lists records (office roles);
  `GET /v1/documents/issued/:id/pdf` reprints one.

ERP: Documents › Issued (`/documents/issued`): search and filters, open the PDF or the
verification page, reissue, revoke with a reason.

## QR verification

Every document the engine prints carries a QR code with `VERIFY_BASE_URL/<institution slug>/<token>`
(env `VERIFY_BASE_URL`, default the ERP's `/verify` page); a certificate's record reuses the
certificate's own token. `GET /v1/public/verify/:slug/:token` needs no sign-in and is rate-limited
per address. For a record in the register it returns the status (`valid`; `revoked` with date and
reason; `superseded`), the institution with its logo and palette, the document type, title,
serial, subject, key fields, issue date, `signatureValid` (the stored data still hashes to the
signed value and the Ed25519 signature checks out; a record altered in the database shows as
failed) and the fingerprint. The ERP page shows it all under the institution's logo. Tokens are
128-bit random, so they cannot be guessed or enumerated. Certificates printed before the register
existed still verify from `certificates`.

Cards printed before the engine carry `VERIFY_BASE_URL/id/<slug>/<s|t>-<id>.<mac>` (an HMAC of
the id); `GET /v1/public/verify-id/:slug/:code` still answers for them, as does
`verify-hallticket` for the older hall ticket codes.

## Certificate wording templates

`certificate_templates`: kind (`transfer_certificate`, `bonafide`, `conduct`, `study`,
`course_completion`, `fee_receipt`, `experience`, `custom`), subject type (student or staff),
title, body text, extra fields the requester fills in, serial prefix (`TC`, `BON`, …) and
`version` (bumped on every edit; an issued certificate keeps the text it was issued with). The
first time an office user lists templates, the default set is created (one per kind). The text is
printed with the document template of the certificate's type.

Placeholders: `{{institution}}`, `{{name}}`, `{{rollNo}}`, `{{className}}`, `{{program}}`,
`{{academicYear}}`, `{{employeeCode}}`, `{{designation}}`, `{{department}}`,
`{{dateOfJoining}}`, `{{purpose}}`, `{{serialNo}}`, `{{issuedOn}}` and `{{fields.<key>}}`.
Unknown placeholders are left visible so a typo shows on the preview rather than vanishing.

## Workflow

```
requested ──approve──▶ approved ──issue──▶ issued ──revoke──▶ revoked
     └────reject────▶ rejected
```

- **Request** (`POST /v1/documents/requests`): office staff for anyone; a student or guardian
  for that student; a staff member for themselves (staff templates). Required template fields
  are checked. One open request per template and subject (409 otherwise).
- **Approve / reject**: principal or administrator (HR manager for staff certificates).
- **Issue**: office staff, on an approved request. Gives the next serial number
  `<prefix>/<financial year>/<00001>` from `certificate_counters` (row-locked, so concurrent
  issues never share a number), freezes the rendered text, and creates a random verification
  token. Issuing twice returns the same certificate.
- **Revoke** (principal or administrator, reason required): the QR then verifies as revoked.
- **Bulk issue** (`POST /v1/documents/bulk-issue {templateId, sectionId | studentIds, purpose}`):
  principal or administrator; creates, approves and issues in one transaction, skipping
  students who already hold a live certificate of that template.

Every step is audited (`certificate.*`) and the subject's family (students) or the staff member
is notified when a certificate is issued (`certificate`).

## ID cards, receipts, invoices and letters (PDF)

- `GET /v1/documents/id-cards/students.pdf?sectionId=` (office staff): the class's cards, ten
  per A4 sheet with crop marks, fronts then backs for duplex.
- `GET /v1/documents/id-cards/staff.pdf[?userIds=a,b]` (office and HR staff).
- `GET /v1/documents/id-cards/me.pdf`: the caller's own card, front and back.
- `GET /v1/documents/fee-receipts/:paymentId.pdf`: the fee receipt, for whoever may see it.
- `GET /v1/documents/fee-invoices/:invoiceId.pdf`: the tax invoice (supplier GSTIN from
  branding, SAC 999293, education services exempt), for whoever may see the fees.
- `GET /v1/documents/appointment-letters/:userId.pdf` (office staff).

## Document vault

`vault_documents`: per student or staff member; title, category (e.g. `aadhaar`, `marks_card`,
`offer_letter`), content type, size, `version` (uploading with `replacesId` supersedes the
earlier version, which stays in history), visibility (`staff` or `owner`), expiry date.
The file is the raw request body (not multipart), with details in the query string. Files go to object storage (`tenants/<id>/vault/<docId>`), at most 10 MB, PDF/JPEG/PNG only.

| Who | Student vault | Staff vault |
|---|---|---|
| principal, administrator | read, upload, archive | read, upload, archive |
| HR manager | — | read, upload, archive |
| the staff member | — | read own (`owner` visibility), upload own |
| student, guardians | read `owner`-visibility documents | — |

`GET /v1/documents/vault/expiring?days=30` lists documents expiring soon. Downloads and
archiving are audited.

## API summary

`/v1/admin/branding` (GET, PUT), `/v1/admin/branding/assets/:kind` (GET, PUT, DELETE).
`/v1/documents`: `templates`, `templates/:id`, `requests`, `requests/mine`,
`requests/:id/{approve,reject,issue,revoke}`, `requests/:id/pdf`, `bulk-issue`,
`id-cards/{students,staff,me}.pdf`, `fee-receipts/:paymentId.pdf`,
`fee-invoices/:invoiceId.pdf`, `appointment-letters/:userId.pdf`, `designs[?docType=]`,
`designs/:id`, `designs/:id/versions`, `designs/:id/versions/:version/restore`,
`designs/defaults/:docType`, `designs/:id/preview.{svg,png,pdf}?side=&page=&width=&animate=1`,
`designs/preview`, `designs/bindings/:docType`, `designs/subjects?kind=&q=`,
`designs/subjects/:type/:id`, `designs/fonts/:file`, `issued`, `issued/:id/pdf`,
`issued/:id/{revoke,reissue}`, `vault/:ownerType/:ownerId`, `vault/files/:id`, `vault/expiring`.
`/v1/public`: `verify/:slug/:token`, `verify-id/:slug/:code`, `branding/:slug`,
`branding/:slug/:kind`.

Roles: branding is changed by the principal or administrator and read by office roles; templates
are listed and previewed by office roles and changed by the principal or administrator; the
register is read by office roles, and revoking or reissuing needs the principal or administrator.
Every change is audited (`branding.*`, `doc_template.*`, `document.*`).

## Adding a document type

1. Add it to `DOC_TYPES` and `DOC_TYPE_INFO` and give it sample data in `DOC_SAMPLES`
   (`packages/shared`); its bindings follow from the sample.
2. Write its four presets in `services/api/src/documents/presets/`, using the style's chrome
   (`portraitChrome`, `landscapeCertificateChrome`, `compactChrome`) and theme (`THEMES`).
3. In the generator, call `DocumentEngine.produce` with the type, the data and the key fields.
4. Add `dt.type.<type>` to the ERP dictionary (en, hi, kn) and the type to a gallery group
   (`apps/erp/src/lib/doc-designs.ts`).

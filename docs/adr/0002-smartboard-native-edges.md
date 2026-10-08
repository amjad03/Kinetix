# ADR 0002: Smartboard spec on Flutter: where the board goes native

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The Smartboard spec (`KINETIX_SMARTBOARD_COMPLETE_PRODUCT_REQUIREMENTS_AND_AGENT_HANDOFF_V1`)
recommends a native Kotlin app. ADR 0001 keeps the board on Flutter (Android panels and
Windows from one codebase), and the product owner confirmed that on 2026-10-08. Three spec
requirements cannot be met by Flutter alone, so this ADR records where the board reaches into
the platform, and why.

## Decisions

1. **PPT with animations, transitions and embedded media (§28).** Flutter has no PowerPoint
   runtime, and converting slides to pictures loses animations (Appendix D forbids passing
   that off as PPT). The board does both:
   - it renders the deck itself (`features/insert/pptx_render.dart`) into a pane beside the
     teacher's writing, on the side the intelligent split picks, with a draggable divider,
     Add Page, Add All Pages and Edge-to-Edge (`presentation_pane.dart`);
   - **Present with animations** hands the `.pptx` to the panel's installed presenter (WPS,
     PowerPoint or the IFP maker's viewer) through `kinetix/presenter` (`Presenter.kt`:
     `ACTION_VIEW` with a `FileProvider` URI and `FLAG_ACTIVITY_LAUNCH_ADJACENT`, so it opens in
     the window beside the board where the panel supports split screen). On Windows the file
     opens in the default presentation app. With no presenter installed the board says so and
     the slides stay usable without animations.
2. **Text AI handwriting (§17).** Google ML Kit Digital Ink on Android (on the panel, offline
   once a language model is downloaded; ink never leaves the board), the Windows handwriting
   recogniser on Windows. Thirteen languages are mapped (`InkModels.text`); a language a
   device lacks shows as unavailable and its words stay as ink. Fonts: Default, Kalam
   (bundled, OFL) and a teacher's own TTF/OTF loaded at runtime.
3. **Stylus ends and palms (§12, §16, §21).** Flutter reports `PointerDeviceKind.stylus` and
   `invertedStylus` from Android and Windows pen stacks; the Two-Side tips map those to Write,
   Erase, Select or Highlight in `WhiteboardController.toolForTip`. Palm rejection and palm
   erase use the contact size Flutter reports. Panels whose firmware reports pens as touch
   fall back to the touch profiles in Board settings; this needs testing on each IFP model.
4. **Screen share orientation (§60).** `flutter_webrtc`'s screen capturer follows the
   sender's rotation; the receiver fits the frame (never stretches it) and tracks the frame
   size, so portrait/landscape changes need no reconnect.

## Consequences

- Real-hardware tests (pen tips, palm, multi-touch counts, presenter apps per IFP model)
  remain a pilot task; unit and widget tests cover the logic, not the panel firmware.
- The presenter path depends on what the institution installs on its panels; the device
  console should list it in a later release.

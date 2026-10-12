# Sync audit (v4): perceptual

**Method (`tools/perceive.py`).** For every anchor word, take the rendered frame at the first syllable of the word and again at +0.5 s. Put the pairs on contact sheets and judge each one by eye against three questions. Is the thing being named clearly visible, large and highlighted? Is the camera at rest? Does the caption show the same words? For v3, anchor times come from a whisper transcription of the final soundtrack. For v4 they come from the edit itself: each voice piece starts on its anchor word. The whisper times agree with these to a median of −47 ms.

## Result

| | Anchors | Pass | Rate |
|---|---|---|---|
| v3 (sample: sheets 1–3 and 7, 48 anchors judged) | 48 | 12 | 25 % |
| v4 (all anchors) | 142 | 139 | 97.9 % |

The old v3 audit reported 118/118. It measured the first frame where any pixel changed near the cue, not what a viewer sees when they hear the word.

## Why v3 looked out of sync (root causes)

1. **The audio was early, not the picture late.** Each beat's VO clip played whole, and the act was placed 100 ms before the anchor *estimated by tiny.en* inside the clip. Those estimates were often off by 0.3–0.8 s. At the word, the frame still showed the previous state (b11 scan, b13 backup, b15 shuffle, b18 plan, b19 books, b1a saved: all blank or unchanged at the word).
2. **The first pixel change is not the settled state.** The capture was warped so that the *first changed frame* hit the cue. Dialogs, panels and menus then animated for another 0.3–0.6 s, so at the word they were half-open (b21 pen, b2a ruler, b35 textbook, b71 attendance).
3. **The camera moved during the action.** It zoomed in from T−0.8 to T−0.15 s and out at E−0.65 s. On short beats it was still easing at the word (b34 every, b24 line).
4. **Ink lands after the word.** Strokes take 0.5–1.5 s to draw, and only the first point was cued. At "air", "glass", "arrows" and "lasso" nothing was yet visible.
5. **2×2 montages.** A tile is a quarter of the window. The active tile is dimmed, and its content changes after the highlight (b65, b77, b94, b104). At phone size it reads as four similar screenshots.
6. **The spotlight fades between acts.** Multi-act beats dipped the spotlight between anchors (b44, b54), so the named item was not highlighted at its word.

## v4 fixes

- The voice is synthesised in **pieces split at each anchor** (`tts4.py`), so every anchor onset is exact.
- Each capture act is warped so its **settled** frame (the first of three still frames, +4 frames of margin) shows 0.3 s before the word. Ink starts 0.5 s before. The result is held ≥1.5 s, and the solver adds pauses before anchors (≤0.3 s mid-sentence, ≤0.7 s at a full stop) where an action needs more time.
- The camera moves only to frame ink and only in the first 0.5 s of a beat. Small UI is lifted out as an enlarged pop-out card (up to 2.4×), and the spotlight stays on until the next act.
- Montages are one full-window shot per feature. Anchor clauses each start a caption line, and the word highlight comes from the same piece timings.

## v4 remaining failures (3 of 142)

| # | Beat | Word | What is wrong |
|---|---|---|---|
| 99 | b78 | "Make groups" | The Group maker panel is on screen, but the groups appear only ~1 s after the word. The capture taps *Make groups* after the tile's act frame. |
| 129 | b121 | "nothing is lost" | Shows attendance being saved with a "Saved offline" pill. The offline state itself is not obvious until "Changes wait" (the sync chip). |
| 141 | r1 | "every app, in sync" | The third phone (Parent) is still fading in at the word, and it is complete at +0.5 s. |

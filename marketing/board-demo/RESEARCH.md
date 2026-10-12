# What great SaaS demo videos do (research for v3)

Sources: the user's reference *SaaS Demo Video Example for Fintech Companies* (48 s; studied frame by frame, every
1.6 s and at each scene change), Stripe Connect and Superhuman launch films as described in
[moonb.io](https://www.moonb.io/blog/saas-product-demo-video) and
[bluecarrot.io](https://bluecarrot.io/blog/saas-demo-videos-effective-examples-and-best-practices/),
[Hatch Studios](https://hatchstudios.com/best-practices-for-creating-engaging-saas-product-videos/) and
[UserGuiding](https://userguiding.com/blog/product-demo-video). Feedback on v1/v2: sync was right in some places,
the depth of each feature was uneven, and a 12–15-year-old should be able to follow it.

## Ten patterns v3 applies

1. **Problem → magic → benefit.** The fintech video opens on a question in big type ("Still manually … payment
   details?"), shows the product doing the job, and closes on benefits ("Save time", "Stay …"). v3 opens with a
   15 s hook about one teacher's morning, reveals KINETIX Board, then follows **one lesson** from walking in to
   the bell, and closes with a recap and a one-line promise.
2. **One promise, one story.** Superhuman's film is built around one promise, not a feature list. v3's promise:
   *the board does the busywork, so the teacher can teach*. Every beat is tied to a moment of Kavya Menon's
   Class 10 B science lesson on refraction.
3. **Uniform beats.** Each feature is one beat: a 2–4 word kinetic title, the stylus doing it, and one plain
   sentence saying why it helps. A beat lasts 3–5 s (at least 2 s). Only the hero features (ink, the AI
   lesson builder and live polls) get a short run of beats, so no feature runs on much longer than the others.
4. **Lists become grids, not sentences.** The reference never lists several things in one shot. v3 shows minor
   features in 2-up or 4-up montages, with one tile lit as its name is spoken (at least 1.5 s each).
5. **The picture changes on the word.** The UI change lands 0–150 ms before the anchor word. The edit is
   built from word timings (faster-whisper), not by guessing, and an automated audit checks every beat
   (SYNC_AUDIT.md).
6. **Zoom has rules.** The reference shows one element large (a single "New mail" button, one form) and
   pulls back between ideas. v3 eases in on the area being used before the action, holds on the action,
   and eases back out between beats. Zoom never goes past 1.6×, and the camera never moves during the
   action.
7. **Short words on screen.** Text screens use 2–4 words in large type with word-by-word motion. Captions
   are separate and smaller, sit under the window, and highlight each word as it is spoken.
8. **Real UI, staged beautifully.** The reference puts the app in a floating, tilted window over a branded
   gradient and lifts out single cards. v3 keeps the real board app (driven by the stylus) in a floating
   window on the KINETIX navy and blue glow, with a spotlight on the active control and a callout pill.
9. **Music marks the structure.** A light pulse plays under the voice, ducked while it speaks. A soft swell
   and hit falls on each chapter card and on the logo reveal, and the bed resolves on the end card.
10. **Recap and one call to action.** The reference ends on its benefits and then the logo. v3 ends with a
    four-tile recap of the hero moments and an end card: KINETIX Board, "Every lesson, connected."

## Rules derived for the edit

- Beat length: ≥2.0 s, typically 3–5 s. Hero runs ≤8 s per beat. Montage tiles ≥1.5 s each.
- Visual onset: −150…0 ms before the anchor word (audit tolerance ±250 ms).
- Zoom: ease-in-out of about 0.6 s, finished before the action. Out between beats when the next target is
  elsewhere. Capped at 1.6×.
- Pauses in the narration: under 1 s, except under chapter cards (music hit).
- Language: short sentences a 12–15-year-old understands. Name the feature and say what it does for the
  teacher or the student.

# v4: what top launch films do, and the rules v4 adopts

v3 scored 8.5/10, but viewers felt that most beats were out of sync even though the v3 audit passed every beat.
That audit checked when pixels changed, not what a viewer sees when they hear the word (see SYNC_AUDIT.md, *Perceptual audit*).
Studied: Apple keynote product demos, Linear and Arc launch films, Stripe and Figma feature videos, Loom-style walkthroughs, and
the guides at [moonb.io](https://www.moonb.io/blog/product-launch-video), [videojeeves](https://www.videojeeves.com/blog/how-to-make-a-saas-product-demo-video/)
and [bluecarrot.io](https://bluecarrot.io/blog/saas-demo-videos-effective-examples-and-best-practices/).

## Editing rules taken from them

1. **One idea per shot.** Apple and Linear never show two new things at once. One feature fills the frame for 2–4 s, and each
   cut brings in the next one. *v4:* the 2×2 montages (in v3 a tile was a quarter of the window and looked like its neighbours)
   become sequential full-window shots, one feature each, at least 1.7 s apiece.
2. **Isolate the UI and make it big.** Launch films lift a single control or card out of the interface and scale it up over
   a dimmed background, so a viewer on a phone can read it. *v4:* small UI changes are lifted out as live pop-out cards at
   up to 2.1×, with the rest of the window dimmed.
3. **The picture leads the word.** In keynote demos the thing is already on screen when the presenter names it. People
   forgive a picture that arrives ~0.2 s early, but they notice one that arrives late. *v4:* every act is settled 0.2 s
   before the first syllable of its anchor word. The camera is still by then.
4. **The camera never moves during an action.** Pans and zooms happen between ideas, never while something changes on
   screen. *v4:* each beat has one framing, reached in the first 0.5 s, before any action.
5. **Cursor/stylus emphasis.** Choreographed pointer movement synced to UI reactions guides the eye, and the pointer
   pauses briefly before a click. *v4:* the real stylus is drawn with a tap ripple, and a click sounds on contact.
6. **Sound design is part of the sync.** Arc, Linear and Apple films put soft UI clicks, whooshes on transitions and small
   "pops" when a card appears exactly on the visual event. This makes the timing feel tight even with the sound low. *v4:*
   generated SFX are placed on frame-accurate events (taps, pen strokes, pop-outs, shot cuts, chapter cards) under a ducked bed.
7. **Text reinforces, never competes.** Big on-screen words are 2–5 words long. Captions show the words being spoken now,
   with the current word highlighted. *v4:* captions show only the piece being spoken, larger, on a dark plate.
8. **Explain the category before the product.** Consumer launch films (Apple, Arc) open with a 15–25 s explainer
   of the problem in simple pictures. *v4:* an animated opener shows a chalkboard turning into a giant tablet ("that's a
   smart board"), then the teacher's dozen jobs, then the KINETIX logo.
9. **A person to follow.** Story-driven demos follow one user through one day. *v4:* Ms Kavya (teacher) and Aarav (a
   Class 10 B student) are introduced as characters. Aarav's speech bubbles give the student's view at the live-answer,
   homework and sync moments.
10. **Before / after.** Show the old way next to the new way, with a number (Stripe, Superhuman). *v4:* three comparison
    cards (lesson planning, attendance, homework).
11. **Know where you are.** Long demos show progress. *v4:* a labelled chapter progress bar sits along the bottom.
12. **End on a fast recap, then one line.** *v4:* one hero shot per pillar (one per anchor word), then the end card.

## Pacing targets (v4)

- Each beat: ≥2 s on screen; the result of each act is held ≥1.5 s. Hero features (ink, AI lesson builder, live
  answers, 3D/labs) get 3–6 beats; minor features get one full-window shot.
- Anchor spacing inside a beat: ≥0.9 s, and ≥1.7 s for montage shots. The solver inserts pauses before an anchor (≤0.3 s inside
  a sentence, ≤0.7 s at a full stop). If an action still can't land in time, it speeds the capture up to 3×.
- Language: short clauses, and every anchor starts a clause. Each feature gets one sentence saying what it is and why it helps.

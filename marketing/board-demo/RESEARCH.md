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

# KINETIX Board product demo, v3 script

**Story:** one teacher (Ms Kavya Menon), one lesson (Class 10 B Science, refraction through a glass slab, at Soundarya Central School), from the first minute to the bell.
**Shape:** a 15 s hook (problem), the reveal, 12 short chapters, a recap and an end card. Every feature is one beat: a 2–4 word title, the stylus doing it, and one plain sentence on why it helps.
Hero features (ink, AI lesson builder, live polls) get a short run of beats. Minor features are 2-up or 2x2 montages whose tiles light up as they are named.

**How it is made:** the real board app (apps/board) runs under flutter_test with the built-in demo server. A scripted stylus drives it along Hershey-script handwriting paths, and the capture is recorded at a natural pace (`tools/capture_v3.sh`).
`tools/edit.py` builds the edit from this beat list. Word timings come from faster-whisper (`tools/words.py`), and each beat's clip is time-warped so its act lands 100 ms before the anchor word.
Captions use the same word timings. `SYNC_AUDIT.md` measures every beat. VO is Kokoro af_heart (`tools/tts.py`); music is generated with a hit on each chapter card (`tools/audio.py`).

Pipeline: `tts.py` → `words.py` → `capture_v3.sh` → `edit.py` → `audio.py` → `contact.py`.

Kinds: **act** = the board changes on the word, **hl** = spotlight/callout on the word, **tile** = montage tile lit on the word, **text/logo** = kinetic type on the stage, **phone/chip** = app screens / pills over the stage.

## Hook (15 s)

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| h1 | 8:30 am | It's eight thirty. Thirty students are waiting, and the teacher has a dozen jobs to do before she can even start. | eight → text, thirty → text, dozen → text |
| h2 |  | What if the board did the busywork, so she could just teach? | busywork → text |
| h3 |  | Meet KINETIX Board, the AI smartboard. | kinetix → logo |
| h4 | One lesson, start to finish | Let's follow Ms Kavya through one science lesson, from the first minute to the bell. | follow → act |

## Walk in and sign in

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b11 | Scan to sign in | She signs in by scanning a code with her phone. No password on a big screen. | scanning → act |
| b12 | Or type 6 digits | Or she can type the six digit code instead. | six → hl |
| b13 | Works offline | No internet? The board shows a backup code that works offline. | backup → act |
| b14 | Personal PIN | She can set her own PIN for this board, too. | pin → act |
| b15 | Shuffled keypad | When the board locks, the keys shuffle, so nobody can copy her PIN. | shuffle → act |
| b16 | Knows your class | The board already knows her class, Class 10 B science, from the timetable. | class → hl |
| b17 | Concept videos | It suggests short concept videos for today, in English, Hindi and Kannada. | videos → hl |
| b18 | Today's plan | Today's plan shows the lesson step by step, with a timer to keep pace. | plan → act |
| b19 | Books & syllabus | Books shows which chapters the class has already covered. | books → act |
| b1a | Everything one tap away | Her saved boards, recordings and training are one tap away. | saved → act |

## Teach with ink

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b21 | Pick your pen | Pick a pen, a colour and a thickness. | pen → act, colour → act, thickness → act |
| b22 | Just write | Then just write. The ink keeps up with her hand. | write → act |
| b23 | Perfect shapes | Shapes come out straight and clean. Here, a glass slab. | shapes → act |
| b24 | Lines and arrows | A line for the normal, and arrows for the light rays. | line → act, arrows → act |
| b25 | Labels by hand | She labels it by hand: air, and glass. | air → act, glass → act |
| b26 | Highlighter | The highlighter marks the title, without hiding the ink. | highlighter → act |
| b27 | Erase | A mistake? The eraser wipes it away. | eraser → act |
| b28 | Undo | And undo brings it right back. | undo → act |
| b29 | Lasso to move | Draw a lasso around anything to move it. | lasso → act, move → act |
| b2a | Geometry tools | A ruler, a protractor and a compass are built in. | ruler → act, protractor → act |

## Smart ink and maths

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b31 | AI pen | With the AI pen, her handwriting turns into neat, typed text. | neat → act |
| b32 | Shape AI | And Shape AI turns a wobbly circle into a perfect one. | perfect → act |
| b33 | Typeset equations | Equations look just like the textbook. | textbook → act |
| b34 | Math solver | The math solver shows every step, even offline. | every → act |
| b35 | Tools for every subject | The tools drawer has tools for science. For maths. And for computer science. | science → act, maths → act, computer → act |

## Pages and saving

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b41 | Add a page | Need more space? Add a page. | add → act |
| b42 | Page overview | See every page at once, and jump to any of them. | every → act |
| b43 | Backgrounds | Change the background: lines, a grid, or a chalkboard. | lines → act, grid → act, chalkboard → act |
| b44 | Share the board | Then share the whole board with students, on WhatsApp or by email. | share → act, whatsapp → hl, email → hl |

## Bring the lesson to life

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b51 | 3D models | Open a 3D model, and turn it with the stylus. | open → act, turn → act |
| b52 | Virtual labs | In the virtual lab, move the light ray and watch it bend. | lab → act, move → act |
| b53 | Simulations & videos | There are PhET simulations. Animations. Concept videos. And a science kit. | phet → tile, animations → tile, concept → tile, kit → tile |
| b54 | Add anything | From the Add menu, bring in PDFs, slides, pictures and sticky notes. | add → act, pdfs → hl, slides → hl, pictures → hl, sticky → hl |
| b55 | Web & camera | A safe web browser, and a document camera, are built in too. | browser → tile, camera → tile |

## Your AI teaching assistant

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b61 | Ask KINETIX AI | She asks KINETIX AI a question about the lesson. | asks → act |
| b62 | With sources | It answers at the class's level, and shows where it got the answer. | shows → hl |
| b63 | AI lesson builder | Short on time? The lesson builder writes a whole lesson plan in seconds. | writes → act |
| b64 | A complete plan | Goals, steps, activities, and an exit ticket. | goals → hl, steps → hl, activities → hl, exit → hl |
| b65 | More AI helpers | It can also make a quiz. Write homework. Draft lecture notes. Or read the board. | quiz → tile, homework → tile, lecture → tile, read → tile |

## The whole class answers

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b71 | Attendance | Attendance takes seconds, and goes straight to the school office. | attendance → act |
| b72 | Ask the class | Now she asks the whole class a question. | question → act |
| b73 | Answers from phones | Students answer on their phones, and the bars move live. | phones → act, live → act |
| b74 | Or answer cards | No phones? They hold up answer cards, and the camera reads them. | cards → hl |
| b75 | Reveal the answer | Then she reveals the right answer. | reveals → act |
| b76 | Word cloud | Or she asks for one word, and watches a word cloud grow. | word → act, grow → act |
| b77 | Classroom toolkit | Pick a random student. Set a timer. Keep score. Give badges. | random → tile, timer → tile, score → tile, badges → tile |
| b78 | Groups & zones | Make groups in one tap. Or split the board, so students write together. | groups → tile, split → tile |

## Homework and marking

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b81 | Homework AI | Homework AI turns today's lesson into homework. | homework → act |
| b82 | Sent to every student | One tap sends it to every student's app. | sends → act |
| b83 | Peer review & AI marks | Classmates review each other's work, and AI suggests marks for the teacher to approve. | classmates → phone, marks → phone |
| b84 | Course outcomes | Each question is tagged with a course outcome, for the college's records. | tagged → act |

## Record and share the screen

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b91 | Record the lesson | She presses record, and the board shows a consent notice first. | record → act |
| b92 | Mark the moments | She adds chapter markers, and stars the important moments. | markers → act, stars → act |
| b93 | Ready to share | Recordings come with a transcript and a summary, ready to share. | recordings → act |
| b94 | Captions, cast & more | Live captions. Casting from phones. A second display. And freeze screen. | captions → tile, casting → tile, second → tile, freeze → tile |

## Comfortable for everyone

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b101 | Eye comfort | Eye comfort makes the screen warmer and easier on the eyes. | warmer → act |
| b102 | Dark mode | Or switch the whole board to dark. | dark → act |
| b103 | Three languages | The board speaks Hindi, and Kannada, as well as English. | hindi → act, kannada → act |
| b104 | Help every learner | Voice commands. A reader that reads aloud. A screen shade. And a spotlight. | voice → tile, reader → tile, shade → tile, spotlight → tile |
| b105 | Magnifier | And a magnifier, for the tiniest details. | magnifier → act |

## Safe and managed

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b111 | Simple mode | In settings, simple mode gives big, easy buttons. | simple → act |
| b112 | Your own toolbar | Each teacher can arrange her own toolbar. | toolbar → act |
| b113 | Locked down, checked up | Touch lock keeps the board safe. And diagnostics report its health. | touch → tile, diagnostics → tile |

## Offline and in sync

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| b121 | Works offline | If the Wi-Fi drops, nothing is lost. Changes wait, and sync when it's back. | nothing → act, sync → hl |
| b122 | End the class | When the bell rings, she ends the class. | ends → act |
| b123 | Everything in sync | Attendance, homework and recordings flow to the school's system, and to the teacher, student and parent apps. | attendance → chip, homework → chip, recordings → chip, teacher → phone, student → phone, parent → phone |

## Recap and end card

| Beat | Title | Voice-over | Anchors (word → kind) |
|---|---|---|---|
| r1 |  | One board. Ink, AI, live answers, and every app in sync. | ink → tile, ai → tile, answers → tile, sync → tile |
| r2 |  | KINETIX Board. Every lesson, connected. |  |

## Simulated in the capture

- AI answers (explain, lesson plan, quiz, homework, read board) are scripted responses in the API's shape; a live board gets them from KINETIX AI.
- Student poll and word-cloud answers are realtime events fired by the script, as the Student App would send them.
- AI-pen handwriting recognition uses a scripted recognizer (ML Kit / Windows Ink do not run under flutter_test), and live-caption speech comes from a scripted voice input.
- The offline code is a seeded signed-code entry; network loss is simulated in the HTTP client. The PIN hash is returned by the test client.
- Teacher, Student and Parent app screens are real captures from marketing/promo/shots.

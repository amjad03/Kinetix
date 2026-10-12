# KINETIX Board product demo, v4 script

**For:** a 12–15-year-old. It should be clear what a smart board is, what KINETIX does, and why each feature helps.
**Story:** an animated opener explains what a smart board is, and how many jobs a teacher has to do. KINETIX takes over the busywork. After that we follow one lesson: Ms Kavya (teacher) and Aarav (a Class 10 B student), refraction through a glass slab. Aarav's speech bubbles give the student's view.
**Shape:** an opener (≈30 s), then 12 chapters, then a fast recap and the end card. Each feature is one beat that says what it is and why it helps. The hero features (ink, AI lesson builder, live answers, 3D/labs) get a short run of beats. Three before/after cards show time saved.

**Sync design:** a caret (^) marks each anchor word. Every anchor starts a clause, so the voice is synthesised in pieces split exactly at the anchors (`tools/tts4.py`). That makes each anchor's onset exact. `tools/edit4.py` time-warps the real capture so each action has *settled* 0.3 s before its word (ink is already drawing 0.5 s before), then holds the result for at least 1.5 s.
The camera only frames ink. UI changes are lifted out as enlarged pop-out cards or spotlights. Montages are one full-window shot per feature. If an action cannot land in time, the solver inserts pauses before the anchor (≤0.3 s inside a sentence, ≤0.7 s at a full stop). Sound effects (stylus clicks, pen scratch, pops, swishes, chapter whooshes) come from the same frame events.

Pipeline: `script4.py` → `tts4.py` → `capture_v3.sh` → `edit4.py --qa` (rect check, overrides in `data/rects4.json`) → `edit4.py --parallel 7` → `audio4.py` → `perceive.py <video> --beats data/beats4.json --exact` (perceptual audit).

## Opener

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| i1 | explain |  | ^This is the board in most classrooms. ^Chalk, dust, and a lot of waiting. | chalk; chalkwrite |
| i2 | explain |  | ^Now imagine it as a giant tablet. ^You can write on it, tap it, and even talk to it. ^That's a smart board. | tablet; tabwrite; smartlabel |
| i3 | explain |  | ^But teachers have a dozen jobs before class even starts. ^Attendance. ^Slides. ^A quiz. ^Homework. | jobs; j0; j1; j2; j3 |
| h3 | logo |  | ^Meet KINETIX Board. ^It does the busywork, so the teacher can just teach. | logo; tag |
| i5 | explain |  | Let's spend one science lesson in Class 10 B. ^Here's Ms Kavya, the teacher. ^And here's Aarav, a student. | kavya; aarav |
| h4 | act | One lesson, start to finish | Today's topic: ^how light bends. | Refraction of light |

## Walk in and sign in

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b11 | act | Scan to sign in | First, she signs in. ^Scan the code with the teacher app, and she's in. No password on a big screen. | Scan with the Teacher app |
| b12 | act | Or type 6 digits | Or, ^type the six-digit code instead. | 6-digit code |
| b13 | act | Works offline | No internet? ^A backup code still works offline. | Offline code |
| b14 | act | Personal PIN | Next, ^she sets her own PIN for this board. | Set a PIN |
| b15 | act | Shuffled keypad | If the board locks, ^the keys shuffle every time. So nobody can copy her PIN. | Keys move every time |
| b16 | act | Knows your class | The board already knows her class: ^Class 10 B Science, from the timetable. | From the timetable |
| b17 | act | Concept videos | Then, ^it suggests short videos for today's topic, in three languages. | English · Hindi · Kannada |
| b18 | act | Today's plan | ^Today's plan shows each step of the lesson, with a timer to keep pace. | Steps with timings |
| b19 | act | Books & syllabus | ^Books shows which chapters the class has already finished. | Syllabus progress |
| b1a | act | Everything one tap away | And ^her saved boards, recordings and training are one tap away. | Profile menu |

## Teach with ink

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b21 | act | Pick your pen | Time to teach. ^Pen first. ^Then a colour. ^And a thickness. | Pen settings; Colour; Thickness |
| b22 | act | Just write | ^Now she just writes. The ink keeps up with her hand, like real ink on paper. | act |
| b23 | act | Perfect shapes | ^Shapes come out straight and clean. Here, a glass slab. | Rectangle |
| b24 | act | Lines and arrows | ^A line for the normal. ^Arrows for the light rays. | Line; Arrow |
| b25 | act | Labels by hand | Labels, by hand: ^air, ^and glass. | act; act |
| b26 | act | Highlighter | ^The highlighter marks the title, without hiding the ink. | Highlighter |
| b27 | act | Erase | Oops, a mistake? ^The eraser wipes it away. | Eraser |
| b28 | act | Undo | ^Undo brings it right back. | Undo |
| b29 | act | Lasso to move | ^Draw a lasso around anything. ^Then move it anywhere. | Lasso; Move |
| b2a | act | Geometry tools | Need to measure? ^There's a ruler, ^a protractor, and a compass. | Geometry; Protractor |

## Smart ink and maths

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b31 | act | AI pen | Messy handwriting? ^The AI pen turns it into neat, typed text. | Handwriting to text |
| b32 | act | Shape AI | A wobbly circle? ^Shape AI makes it perfect. | Shape AI |
| b33 | act | Typeset equations | ^Equations look just like the textbook. | Snell's law |
| b34 | act | Math solver | Stuck on a sum? ^The math solver shows every step, even offline. | Every step |
| b35 | act | Tools for every subject | The tools drawer has something for every subject. ^Science. ^Maths. ^And computer science. | Science; Maths; Computer science |

## Pages and saving

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b41 | act | Add a page | Need more space? ^Add a page. | Add page |
| b42 | act | Page overview | ^Page overview shows every page at once. Tap one to jump to it. | Page overview |
| b43 | act | Backgrounds | Change the background: ^lines, ^a grid, ^or a chalkboard. | Lines; Grid; Chalkboard |
| b44 | act | Share the board | Later, ^she shares the board with the class. ^On WhatsApp, ^or by email. | Share; WhatsApp; Email |

## Bring the lesson to life

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b51 | act | 3D models | Some ideas are easier in 3D. ^She opens a 3D model, ^and turns it with the stylus. | 3D model; Turn with the stylus |
| b52 | act | Virtual labs | ^The virtual lab opens. ^She moves the light ray, and watches it bend. | Virtual lab; Drag the ray |
| b53 | grid | Simulations & videos | There's more to explore. ^PhET simulations. ^Animations that explain each idea. ^Short concept videos. ^And a science kit, with every formula. | PhET simulations; Animations; Concept videos; Science kit |
| b54 | act | Add anything | ^The Add menu brings in anything. ^PDFs. ^Slides. ^Pictures. ^And sticky notes. | Add menu; PDF; Slides; Pictures; Sticky notes |
| b55 | grid | Web & camera | ^A safe web browser, for research. ^And a document camera, to show real things. | Safe browser; Document camera |

## Your AI teaching assistant

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b61 | act | Ask KINETIX AI | Now, ^she asks KINETIX AI a question about today's lesson. | Answer in seconds |
| b62 | act | With sources | It answers in simple words. ^And it shows where the answer came from. | NCERT source |
| x61 | compare |  | ^Planning a lesson can take a whole evening. ^With the AI lesson builder, it takes seconds. | Plan a lesson by hand; AI lesson builder |
| b63 | act | AI lesson builder | Short on time? ^The lesson builder writes a whole plan. | AI lesson builder |
| b64 | act | A complete plan | ^Goals. ^Steps. ^Activities. ^And an exit ticket. | Objectives; Steps; Activities; Exit ticket |
| b65 | grid | More AI helpers | It can do more. ^Make a quick quiz. ^Write tonight's homework. ^Draft lecture notes. ^Or read what's on the board. | Quick quiz; Homework; Lecture notes; Read the board |

## The whole class answers

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| x71 | compare |  | ^Calling out forty names can take five minutes. ^With KINETIX, it takes ten seconds. | Call out 40 names; Tap who is absent |
| b71 | act | Attendance | ^She just taps who's absent, and it goes straight to the school office. | Tap who's absent |
| b72 | act | Ask the class | Now, ^she asks the whole class a question. | Live question |
| b73 | act | Answers from phones | ^Students answer on their phones, ^and the bars move live. | Answers arriving; Live results |
| b74 | act | Or answer cards | No phones? ^They hold up answer cards, and the camera reads them. | Scan answer cards |
| b75 | act | Reveal the answer | Then, ^she reveals the right answer. | Right answer |
| b76 | act | Word cloud | Or, ^she asks for one word, ^and watches a word cloud grow. | One-word answers; Word cloud |
| b77 | grid | Classroom toolkit | ^Pick a random student. ^Set a timer. ^Keep score. ^And give badges for great answers. | Random picker; Timer; Scoreboard; Badges |
| b78 | grid | Groups & zones | ^Make groups in one tap. ^Or split the board, so students can write together. | Group maker; Multi-user zones |

## Homework and marking

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| x81 | compare |  | ^Homework used to mean writing, printing, and collecting paper. ^Now, it's one tap. | Write, print, collect; Homework AI |
| b81 | act | Homework AI | ^Homework AI turns today's lesson into homework questions. | Homework AI |
| b82 | act | Sent to every student | ^One tap sends it to every student's app. | Sent |
| b83 | act | Peer review & AI marks | ^Classmates review each other's work. ^And AI suggests marks, for the teacher to approve. | student-navLearn.jpg; teacher-navClasses.jpg |
| b84 | act | Course outcomes | ^Each question is tagged with a course outcome, for the school's records. | Course outcome (OBE) |

## Record and share the screen

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b91 | act | Record the lesson | ^She presses record, and the board asks for consent first. | Consent first |
| b92 | act | Mark the moments | ^She adds chapter markers, ^and stars the important moments. | Chapter marker; Important moment |
| b93 | act | Ready to share | ^Recordings come with a transcript and a summary, ready to share. | Recordings |
| b94 | grid | Captions, cast & more | ^Live captions, so everyone can follow. ^Students can cast their phone screens. ^A second display, for the back row. ^And freeze screen pauses the picture. | Live captions; Cast from phones; Second display; Freeze screen |

## Comfortable for everyone

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b101 | act | Eye comfort | ^Eye comfort makes the screen warmer, and easier on the eyes. | Eye comfort |
| b102 | act | Dark mode | Or, ^switch the whole board to dark mode. | Dark mode |
| b103 | act | Three languages | The board speaks three languages. ^Hindi. ^Kannada. And English. | हिंदी; ಕನ್ನಡ |
| b104 | grid | Help every learner | ^Voice commands work hands free. ^A reader reads the page aloud. ^A screen shade hides what's coming next. ^And a spotlight focuses attention. | Voice commands; Immersive reader; Screen shade; Spotlight |
| b105 | act | Magnifier | And for tiny details, ^a magnifier. | Magnifier |

## Safe and managed

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b111 | act | Simple mode | In settings, ^simple mode gives big, easy buttons. | Simple mode |
| b112 | act | Your own toolbar | ^Each teacher can arrange her own toolbar. | Customise toolbar |
| b113 | grid | Locked down, checked up | ^Touch lock keeps the board safe. ^And diagnostics check its health. | Touch lock; Diagnostics |

## Offline and in sync

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| b121 | act | Works offline | If the Wi-Fi drops, ^nothing is lost. ^Changes wait, and sync when it's back. | Saved offline; Waiting to sync |
| b122 | act | End the class | When the bell rings, ^she ends the class. | End class |
| b123 | act | Everything in sync | Then everything goes where it's needed. ^Attendance, ^homework, ^and recordings go to the school. ^And to the teacher, ^student, ^and parent apps. | Attendance; Homework; Recordings; teacher-navHome.jpg; student-navHome.jpg; parent-navHome.jpg |

## Recap and end card

| Beat | Kind | Title | Voice-over (^ = anchor) | Anchor visuals |
|---|---|---|---|---|
| r1 | recap |  | One board, for the whole lesson. ^Ink that feels real. ^An AI helper. ^Live answers from every student. ^And every app, in sync. | Ink that feels real; AI lesson builder; Live answers; Every app in sync |
| r2 | endcard |  | ^KINETIX Board. Every lesson, connected. | logo |

## Simulated in the capture

- AI answers (explain, lesson plan, quiz, homework, lecture notes, read board) are scripted responses in the API's shape. A live board gets them from KINETIX AI.
- The share link (whiteboard export) is answered by the test client. The demo server has no export endpoint.
- Student poll and word-cloud answers are realtime events fired by the script, as the Student App would send them.
- AI-pen handwriting recognition uses a scripted recognizer, and live-caption speech comes from a scripted voice input.
- The offline code is a seeded signed-code entry, and network loss is simulated in the HTTP client.
- The document camera shows "No camera found": no camera is attached under flutter_test.
- Teacher, Student and Parent app screens are real captures from marketing/promo/shots.
- The opener (chalkboard → tablet, the teacher's jobs, the Kavya/Aarav characters) and the before/after cards are drawn animations, not app UI.

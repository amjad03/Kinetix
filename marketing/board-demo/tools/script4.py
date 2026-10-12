"""v4 script source -> data/beats4.json. A caret (^) marks an anchor word: the picture for that act must be
complete when the word starts. Every anchor begins a clause (after punctuation or at the start of a line),
so the voice can be synthesised in pieces split exactly at the anchors (tools/tts4.py)."""
import json, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def A(kind='act', label=None, **k):
    d = {'kind': kind}
    if label: d['label'] = label
    d.update(k)
    return d

def B(id, vo, acts, title=None, kind='act', **k):
    d = {'id': id, 'kind': kind, 'vo': vo, 'acts': acts}
    if title: d['title'] = title
    d.update(k)
    return d

T = lambda text: A('text', text=text)
S = lambda el: A('scene', el=el)
ink = lambda label=None: A('act', label, ink=True)

CH = [
 ('intro', '', [
  B('i1', "^This is the board in most classrooms. ^Chalk, dust, and a lot of waiting.", [S('chalk'), S('chalkwrite')], kind='explain'),
  B('i2', "^Now imagine it as a giant tablet. ^You can write on it, tap it, and even talk to it. ^That's a smart board.", [S('tablet'), S('tabwrite'), S('smartlabel')], kind='explain'),
  B('i3', "^But teachers have a dozen jobs before class even starts. ^Attendance. ^Slides. ^A quiz. ^Homework.", [S('jobs'), S('j0'), S('j1'), S('j2'), S('j3')], kind='explain'),
  B('h3', "^Meet KINETIX Board. ^It does the busywork, so the teacher can just teach.", [A('logo'), A('tag')], kind='logo'),
  B('i5', "Let's spend one science lesson in Class 10 B. ^Here's Ms Kavya, the teacher. ^And here's Aarav, a student.", [S('kavya'), S('aarav')], kind='explain'),
  B('h4', "Today's topic: ^how light bends.", [ink('Refraction of light')], title='One lesson, start to finish'),
 ]),
 ('c1', 'Walk in and sign in', [
  B('b11', "First, she signs in. ^Scan the code with the teacher app, and she's in. No password on a big screen.", [A('act', 'Scan with the Teacher app')], title='Scan to sign in'),
  B('b12', "Or, ^type the six-digit code instead.", [A('hl', '6-digit code')], title='Or type 6 digits'),
  B('b13', "No internet? ^A backup code still works offline.", [A('act', 'Offline code')], title='Works offline'),
  B('b14', "Next, ^she sets her own PIN for this board.", [A('act', 'Set a PIN')], title='Personal PIN'),
  B('b15', "If the board locks, ^the keys shuffle every time. So nobody can copy her PIN.", [A('act', 'Keys move every time')], title='Shuffled keypad'),
  B('b16', "The board already knows her class: ^Class 10 B Science, from the timetable.", [A('hl', 'From the timetable')], title='Knows your class'),
  B('b17', "Then, ^it suggests short videos for today's topic, in three languages.", [A('hl', 'English · Hindi · Kannada')], title='Concept videos'),
  B('b18', "^Today's plan shows each step of the lesson, with a timer to keep pace.", [A('act', 'Steps with timings')], title="Today's plan"),
  B('b19', "^Books shows which chapters the class has already finished.", [A('act', 'Syllabus progress')], title='Books & syllabus'),
  B('b1a', "And ^her saved boards, recordings and training are one tap away.", [A('act', 'Profile menu')], title='Everything one tap away'),
 ]),
 ('c2', 'Teach with ink', [
  B('b21', "Time to teach. ^Pen first. ^Then a colour. ^And a thickness.", [A('act', 'Pen settings'), A('act', 'Colour'), A('act', 'Thickness')], title='Pick your pen'),
  B('b22', "^Now she just writes. The ink keeps up with her hand, like real ink on paper.", [ink()], title='Just write'),
  B('b23', "^Shapes come out straight and clean. Here, a glass slab.", [ink('Rectangle')], title='Perfect shapes'),
  B('b24', "^A line for the normal. ^Arrows for the light rays.", [ink('Line'), ink('Arrow')], title='Lines and arrows'),
  B('b25', "Labels, by hand: ^air, ^and glass.", [ink(), ink()], title='Labels by hand'),
  B('b26', "^The highlighter marks the title, without hiding the ink.", [ink('Highlighter')], title='Highlighter'),
  B('b27', "Oops, a mistake? ^The eraser wipes it away.", [ink('Eraser')], title='Erase'),
  B('b28', "^Undo brings it right back.", [A('act', 'Undo')], title='Undo'),
  B('b29', "^Draw a lasso around anything. ^Then move it anywhere.", [ink('Lasso'), A('act', 'Move')], title='Lasso to move'),
  B('b2a', "Need to measure? ^There's a ruler. ^A protractor. And a compass.", [A('act', 'Geometry'), A('act', 'Protractor')], title='Geometry tools'),
 ]),
 ('c3', 'Smart ink and maths', [
  B('b31', "Messy handwriting? ^The AI pen turns it into neat, typed text.", [A('act', 'Handwriting to text')], title='AI pen'),
  B('b32', "A wobbly circle? ^Shape AI makes it perfect.", [A('act', 'Shape AI')], title='Shape AI'),
  B('b33', "^Equations look just like the textbook.", [A('act', "Snell's law")], title='Typeset equations'),
  B('b34', "Stuck on a sum? ^The math solver shows every step, even offline.", [A('act', 'Every step')], title='Math solver'),
  B('b35', "The tools drawer has something for every subject. ^Science. ^Maths. ^And computer science.", [A('act', 'Science'), A('act', 'Maths'), A('act', 'Computer science')], title='Tools for every subject'),
 ]),
 ('c4', 'Pages and saving', [
  B('b41', "Need more space? ^Add a page.", [A('act', 'Add page')], title='Add a page'),
  B('b42', "^Page overview shows every page at once. Tap one to jump to it.", [A('act', 'Page overview')], title='Page overview'),
  B('b43', "Change the background. ^Lines. ^A grid. ^Or a chalkboard.", [A('act', 'Lines'), A('act', 'Grid'), A('act', 'Chalkboard')], title='Backgrounds'),
  B('b44', "Later, ^she shares the board with the class. ^On WhatsApp. ^Or by email.", [A('act', 'Share'), A('hl', 'WhatsApp'), A('hl', 'Email')], title='Share the board'),
 ]),
 ('c5', 'Bring the lesson to life', [
  B('b51', "Some ideas are easier in 3D. ^She opens a 3D model, ^and turns it with the stylus.", [A('act', '3D model'), A('act', 'Turn with the stylus')], title='3D models'),
  B('b52', "^The virtual lab opens. ^She moves the light ray, and watches it bend.", [A('act', 'Virtual lab'), A('act', 'Drag the ray')], title='Virtual labs'),
  B('b53', "There's more to explore. ^PhET simulations. ^Animations that explain each idea. ^Short concept videos. ^And a science kit, with every formula.", [A('tile', 'PhET simulations'), A('tile', 'Animations'), A('tile', 'Concept videos'), A('tile', 'Science kit')], title='Simulations & videos', kind='grid'),
  B('b54', "^The Add menu brings in anything. ^PDFs. ^Slides. ^Pictures. ^And sticky notes.", [A('act', 'Add menu'), A('hl', 'PDF'), A('hl', 'Slides'), A('hl', 'Pictures'), A('hl', 'Sticky notes')], title='Add anything'),
  B('b55', "^A safe web browser, for research. ^And a document camera, to show real things.", [A('tile', 'Safe browser'), A('tile', 'Document camera')], title='Web & camera', kind='grid'),
 ]),
 ('c6', 'Your AI teaching assistant', [
  B('b61', "Now, ^she asks KINETIX AI a question about today's lesson.", [A('act', 'Answer in seconds')], title='Ask KINETIX AI'),
  B('b62', "It answers in simple words. ^And it shows where the answer came from.", [A('hl', 'NCERT source')], title='With sources'),
  B('x61', "^Planning a lesson can take a whole evening. ^With the AI lesson builder, it takes seconds.", [A('cmp', side=0, text='Plan a lesson by hand', sub='a whole evening'), A('cmp', side=1, text='AI lesson builder', sub='seconds')], kind='compare'),
  B('b63', "Short on time? ^The lesson builder writes a whole plan.", [A('act', 'AI lesson builder')], title='AI lesson builder'),
  B('b64', "^Goals. ^Steps. ^Activities. ^And an exit ticket.", [A('hl', 'Objectives'), A('hl', 'Steps'), A('hl', 'Activities'), A('hl', 'Exit ticket')], title='A complete plan'),
  B('b65', "It can do more. ^Make a quick quiz. ^Write tonight's homework. ^Draft lecture notes. ^Or read what's on the board.", [A('tile', 'Quick quiz'), A('tile', 'Homework'), A('tile', 'Lecture notes'), A('tile', 'Read the board')], title='More AI helpers', kind='grid'),
 ]),
 ('c7', 'The whole class answers', [
  B('x71', "^Calling out forty names can take five minutes. ^With KINETIX, it takes ten seconds.", [A('cmp', side=0, text='Call out 40 names', sub='5 minutes'), A('cmp', side=1, text='Tap who is absent', sub='10 seconds')], kind='compare'),
  B('b71', "^She just taps who's absent, and it goes straight to the school office.", [A('act', "Tap who's absent")], title='Attendance'),
  B('b72', "Now, ^she asks the whole class a question.", [A('act', 'Live question')], title='Ask the class'),
  B('b73', "^Students answer on their phones, ^and the bars move live.", [A('act', 'Answers arriving'), A('act', 'Live results')], title='Answers from phones', bubble={'at': 1, 'text': 'I picked B, from my phone!'}),
  B('b74', "No phones? ^They hold up answer cards, and the camera reads them.", [A('hl', 'Scan answer cards')], title='Or answer cards'),
  B('b75', "Then, ^she reveals the right answer.", [A('act', 'Right answer')], title='Reveal the answer'),
  B('b76', "Or, ^she asks for one word, ^and watches a word cloud grow.", [A('act', 'One-word answers'), A('act', 'Word cloud')], title='Word cloud', bubble={'at': 1, 'text': 'My word is up there!'}),
  B('b77', "^Pick a random student. ^Set a timer. ^Keep score. ^And give badges for great answers.", [A('tile', 'Random picker'), A('tile', 'Timer'), A('tile', 'Scoreboard'), A('tile', 'Badges')], title='Classroom toolkit', kind='grid', bubble={'at': 0, 'text': 'Please not me…'}),
  B('b78', "^Make groups in one tap. ^Or split the board, so students can write together.", [A('tile', 'Group maker'), A('tile', 'Multi-user zones')], title='Groups & zones', kind='grid'),
 ]),
 ('c8', 'Homework and marking', [
  B('x81', "^Homework used to mean writing, printing, and collecting paper. ^Now, it's one tap.", [A('cmp', side=0, text='Write, print, collect', sub='paper everywhere'), A('cmp', side=1, text='Homework AI', sub='one tap')], kind='compare'),
  B('b81', "^Homework AI turns today's lesson into homework questions.", [A('act', 'Homework AI')], title='Homework AI'),
  B('b82', "^One tap sends it to every student's app.", [A('act', 'Sent')], title='Sent to every student', bubble={'at': 0, 'text': "It's already on my phone."}),
  B('b83', "^Classmates review each other's work. ^And AI suggests marks, for the teacher to approve.", [A('phone', img='student-navLearn.jpg'), A('phone', img='teacher-navClasses.jpg')], title='Peer review & AI marks'),
  B('b84', "^Each question is tagged with a course outcome, for the school's records.", [A('act', 'Course outcome (OBE)')], title='Course outcomes'),
 ]),
 ('c9', 'Record and share the screen', [
  B('b91', "^She presses record, and the board asks for consent first.", [A('act', 'Consent first')], title='Record the lesson'),
  B('b92', "^She adds chapter markers, ^and stars the important moments.", [A('act', 'Chapter marker'), A('act', 'Important moment')], title='Mark the moments'),
  B('b93', "^Recordings come with a transcript and a summary, ready to share.", [A('act', 'Recordings')], title='Ready to share'),
  B('b94', "^Live captions, so everyone can follow. ^Students can cast their phone screens. ^A second display, for the back row. ^And freeze screen pauses the picture.", [A('tile', 'Live captions'), A('tile', 'Cast from phones'), A('tile', 'Second display'), A('tile', 'Freeze screen')], title='Captions, cast & more', kind='grid'),
 ]),
 ('c10', 'Comfortable for everyone', [
  B('b101', "^Eye comfort makes the screen warmer, and easier on the eyes.", [A('act', 'Eye comfort')], title='Eye comfort'),
  B('b102', "Or, ^switch the whole board to dark mode.", [A('act', 'Dark mode')], title='Dark mode'),
  B('b103', "The board speaks three languages. ^Hindi. ^Kannada. And English.", [A('act', 'हिंदी'), A('act', 'ಕನ್ನಡ')], title='Three languages'),
  B('b104', "^Voice commands work hands free. ^A reader reads the page aloud. ^A screen shade hides what's coming next. ^And a spotlight focuses attention.", [A('tile', 'Voice commands'), A('tile', 'Immersive reader'), A('tile', 'Screen shade'), A('tile', 'Spotlight')], title='Help every learner', kind='grid'),
  B('b105', "And for tiny details, ^a magnifier.", [A('act', 'Magnifier')], title='Magnifier'),
 ]),
 ('c11', 'Safe and managed', [
  B('b111', "In settings, ^simple mode gives big, easy buttons.", [A('act', 'Simple mode')], title='Simple mode'),
  B('b112', "^Each teacher can arrange her own toolbar.", [A('act', 'Customise toolbar')], title='Your own toolbar'),
  B('b113', "^Touch lock keeps the board safe. ^And diagnostics check its health.", [A('tile', 'Touch lock'), A('tile', 'Diagnostics')], title='Locked down, checked up', kind='grid'),
 ]),
 ('c12', 'Offline and in sync', [
  B('b121', "If the Wi-Fi drops, ^nothing is lost. ^Changes wait, and sync when it's back.", [A('act', 'Saved offline'), A('hl', 'Waiting to sync')], title='Works offline'),
  B('b122', "When the bell rings, ^she ends the class.", [A('act', 'End class')], title='End the class'),
  B('b123', "Then everything goes where it's needed. ^Attendance, ^homework, ^and recordings go to the school. ^And to the teacher, ^student, ^and parent apps.",
    [A('chip', text='Attendance'), A('chip', text='Homework'), A('chip', text='Recordings'), A('phone', img='teacher-navHome.jpg'), A('phone', img='student-navHome.jpg'), A('phone', img='parent-navHome.jpg')],
    title='Everything in sync', bubble={'at': 5, 'text': 'Mum can see my homework too.'}),
 ]),
 ('end', '', [
  B('r1', "One board, for the whole lesson. ^Ink that feels real. ^An AI helper. ^Live answers from every student. ^And every app, in sync.",
    [A('mont', 'Ink that feels real', src='b26'), A('mont', 'AI lesson builder', src='b64'), A('mont', 'Live answers', src='b75'), A('mont', 'Every app in sync', src='b121')], kind='recap'),
  B('r2', "^KINETIX Board. Every lesson, connected.", [A('logo')], kind='endcard'),
 ]),
]

out = {'chapters': [{'id': i, 'title': t, 'beats': bs} for i, t, bs in CH]}
for c in out['chapters']:
    for b in c['beats']:
        n = b['vo'].count('^')
        assert n == len(b['acts']), (b['id'], n, len(b['acts']))
json.dump(out, open(os.path.join(HERE, 'data', 'beats4.json'), 'w'), indent=1, ensure_ascii=False)
print('beats', sum(len(c['beats']) for c in out['chapters']), 'anchors', sum(len(b['acts']) for c in out['chapters'] for b in c['beats']))

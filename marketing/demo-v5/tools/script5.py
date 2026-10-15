"""v5 script -> data/beats5.json. One video for the whole ecosystem: the smart board (unique features first),
then every other board feature, the ERP, the three mobile apps. Plain words for a 12-15 year old.

A caret (^) marks an anchor word; each anchor starts a clause, so the voice is made in pieces split at the
anchors (tools/tts5.py) and every anchor's start time is exact. The picture for an anchor is the matching
moment of the real recording: board beats use the capture's acts (in order, same count), clip beats use the
clip's marks (indices in `m`)."""
import json, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def B(id, vo, label=None, **k):            # a board capture beat (id = capture beat id)
    return dict(id=id, kind='board', src=id, vo=vo, label=label, **k)
def V(id, src, vo, label=None, m=None, **k):  # a recorded clip: v3d / erp / app
    return dict(id=id, kind=k.pop('kind', 'clip'), src=src, vo=vo, label=label, m=m, **k)
def CARD(id, title, sub='', vo=''):
    return dict(id=id, kind='card', title=title, sub=sub, vo=vo)

CH = []
def chapter(id, title, beats): CH.append(dict(id=id, title=title, beats=beats))

# ---------------------------------------------------------------- opening: the most unusual thing first
chapter('open', '', [
  V('o1', 'v3d/v3d_heart', "^Imagine opening a real human heart, right on your classroom board. ^Cut it in half. ^Then take it apart, piece by piece.", '3D models', m=[0, 1, 2]),
  V('o2', 'v3d/v3d_tour', "^The brain. ^The solar system. ^Even the Taj Mahal.", m=[0, 1, 2]),
  dict(id='o3', kind='brand', vo="^This is Zynetix. One system for the whole school: ^a smart board in every classroom, ^an ERP for the office, ^and apps for teachers, students and parents.",
       shots=['brand', 'board', 'erp', 'apps']),
])

# ---------------------------------------------------------------- part 1: the board's unique features
chapter('c1', 'Lessons come alive', [
  CARD('k1', 'The smart board', 'What makes it different'),
  V('v1', 'v3d/v3d_labels', "Tap any part, ^and the board tells you its name. ^In English, ^in Hindi, ^or in Kannada.", 'Labels in 3 languages', m=[0, 1, 2, 3]),
  B('b51', "There are more than forty models like this. ^The teacher opens one, ^and turns it with her pen.", '3D models'),
  B('b52', "^Virtual labs turn experiments into play. ^Move the light ray, and watch it bend.", 'Virtual labs'),
  B('b53', "And there's more to explore. ^Over a hundred science simulations. ^Animations that explain each idea. ^Short concept videos. ^And a science kit, with every formula.", 'Simulations and videos'),
])
chapter('c2', 'An AI helper for every teacher', [
  B('b61', "Got a question in class? ^Ask Zynetix AI, and it answers in seconds.", 'Ask Zynetix AI'),
  B('b62', "It uses simple words, ^and it shows where the answer came from.", 'Answers with sources'),
  B('b63', "Short on time? ^The lesson builder plans a whole lesson.", 'AI lesson builder'),
  B('b64', "^The goals. ^The steps. ^The activities. ^And a quick check at the end.", 'A complete plan'),
  B('b65', "It can also ^make a quiz, ^write homework, ^draft notes, ^or read what's written on the board.", 'More AI helpers'),
])
chapter('c3', 'The whole class answers', [
  B('b72', "Now ^the teacher asks the whole class a question.", 'Live questions'),
  B('b73', "^Students answer on their phones, ^and the bars move live.", 'Answers arrive live'),
  B('b74', "No phones? ^Students hold up answer cards, and the camera reads them.", 'Answer cards'),
  B('b75', "Then ^she shows the right answer.", 'Reveal the answer'),
  B('b76', "^Ask for one word, ^and watch a word cloud grow.", 'Word cloud'),
  B('b77', "^Pick a random student. ^Set a timer. ^Keep score. ^And give badges for great answers.", 'Classroom toolkit'),
  B('b78', "^Make groups in one tap. ^Or split the board, so students can write together.", 'Groups and zones'),
])
chapter('c4', 'Smart ink', [
  B('b31', "Messy handwriting? ^The AI pen turns it into neat, typed text.", 'AI pen'),
  B('b32', "A wobbly circle? ^Shape AI makes it perfect.", 'Shape AI'),
  B('b33', "^Equations look just like the textbook.", 'Equations'),
  B('b34', "Stuck on a sum? ^The maths solver shows every step, even offline.", 'Maths solver'),
  B('b35', "The tools drawer has something for every subject. ^Science. ^Maths. ^And computer science.", 'Subject tools'),
])
chapter('c5', 'Record every lesson', [
  B('b91', "^Press record, and the board asks for permission first.", 'Record a lesson'),
  B('b92', "^Add chapter markers, ^and star the important moments.", 'Chapters and stars'),
  B('b93', "^Every recording comes with a transcript and a short summary.", 'Transcript and summary'),
  B('b94', "^Live captions, so everyone can follow. ^Students can show their phone screens. ^A second screen helps the back row. ^And freeze pauses the picture.", 'Captions, cast and more'),
])

# ---------------------------------------------------------------- part 2: everything else on the board
chapter('c6', 'Ready in seconds', [
  CARD('k2', 'Every day on the board', 'Everything a teacher needs'),
  B('b11', "Signing in is easy. ^Scan a code with the teacher app, and you're in. No password on a big screen.", 'Scan to sign in'),
  B('b12', "Or, ^type the six-digit code.", '6-digit code'),
  B('b13', "No internet? ^A backup code still works.", 'Works offline'),
  B('b14', "^Each teacher can set her own PIN.", 'Personal PIN'),
  B('b15', "And ^the keys shuffle every time, so nobody can copy it.", 'Shuffled keypad'),
  B('b16', "^The board already knows today's class, from the timetable.", 'Knows your class'),
  B('b17', "^It suggests short videos for today's topic, in three languages.", 'Concept videos'),
  B('b18', "^Today's plan shows each step, with a timer to keep pace.", "Today's plan"),
  B('b19', "^Books shows which chapters are already done.", 'Syllabus progress'),
  B('b1a', "And ^saved boards, recordings and training are one tap away.", 'Everything one tap away'),
])
chapter('c7', 'Writing feels real', [
  B('b21', "Time to write. ^Pick a pen. ^A colour. ^And a thickness.", 'Pens'),
  B('b22', "^The ink keeps up with your hand, just like a real pen.", 'Real-feel ink'),
  B('b23', "^Shapes come out straight and clean.", 'Shapes'),
  B('b24', "^A line. ^And arrows.", 'Lines and arrows'),
  B('b25', "Labels, by hand: ^air, ^and glass.", 'Handwriting'),
  B('b26', "^The highlighter marks the title, without hiding it.", 'Highlighter'),
  B('b27', "^The eraser wipes mistakes away,", 'Eraser'),
  B('b28', "and ^undo brings them back.", 'Undo'),
  B('b29', "^Draw a loop around anything, ^and move it.", 'Lasso'),
  B('b2a', "Need to measure? ^There's a ruler, ^and a protractor.", 'Geometry tools'),
])
chapter('c8', 'Pages, files and sharing', [
  B('b41', "^Need more space? Add a page.", 'Pages'),
  B('b42', "^See every page at once, and jump to any of them.", 'Page overview'),
  B('b43', "Change the background: ^lines, ^a grid, ^or a chalkboard.", 'Backgrounds'),
  B('b54', "^The Add menu brings in anything. ^PDFs. ^Slides. ^Pictures. ^And sticky notes.", 'Add anything'),
  B('b55', "^A safe web browser, for research. ^And a document camera, to show real things.", 'Browser and camera'),
  B('b44', "Later, ^the teacher shares the board with the class. ^On WhatsApp, ^or by email.", 'Share the board'),
])
chapter('c9', 'Attendance and homework', [
  B('b71', "Attendance? ^Just tap who's absent. It goes straight to the school office.", 'Attendance'),
  B('b81', "^Homework AI turns today's lesson into homework questions.", 'Homework AI'),
  B('b82', "^One tap sends it to every student's phone.", 'Sent to students'),
  B('b83', "^Classmates review each other's work. ^And AI suggests marks, for the teacher to approve.", 'Peer review and AI marks'),
  B('b84', "^Each question is linked to a course outcome, for the school's records.", 'Course outcomes'),
])
chapter('c10', 'Comfortable and safe', [
  B('b101', "^Eye comfort makes the screen warmer and easier on the eyes.", 'Eye comfort'),
  B('b102', "Or, ^switch to dark mode.", 'Dark mode'),
  B('b103', "The board speaks three languages: ^Hindi, ^Kannada, and English.", 'Three languages'),
  B('b104', "^Voice commands. ^A reader that reads aloud. ^A screen shade. ^And a spotlight.", 'Help every learner'),
  B('b105', "And for tiny details, ^a magnifier.", 'Magnifier'),
  B('b111', "^Simple mode gives big, easy buttons.", 'Simple mode'),
  B('b112', "^Each teacher can arrange her own toolbar.", 'Your own toolbar'),
  B('b113', "^Touch lock keeps the board safe. ^And health checks keep it running.", 'Lock and health checks'),
  B('b121', "If the Wi-Fi drops, ^nothing is lost. ^Changes wait, and sync when it's back.", 'Works offline'),
  B('b122', "When the bell rings, ^the teacher ends the class.", 'End the class'),
])

if __name__ == '__main__':
    try:
        import script5_tail as T          # ERP + apps + ending, written once those recordings exist
        T.add(chapter, B, V, CARD)
    except ImportError:
        pass
    json.dump({'chapters': CH}, open(os.path.join(HERE, 'data', 'beats5.json'), 'w'), ensure_ascii=False, indent=1)
    n = sum(len(c['beats']) for c in CH)
    print(len(CH), 'chapters', n, 'beats')

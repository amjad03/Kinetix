"""The Before/After board film ("The board that changed the day"), as approved in the storyboard.
Beat kinds: black (text on black), still (a Canva photo, slowly moving), plate (a Canva classroom photo with the real
board screen placed onto its display), board (a beat of the fresh board capture; anchors = its acts), clip (a real
3D viewer clip; anchors = marks), logo, end. A caret (^) marks an anchor word. -> data/beats7.json"""
import json, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def K(id, vo, text='', **k): return dict(id=id, kind='black', vo=vo, text=text, **k)
def S(id, img, vo, move='push', grade='cold', **k): return dict(id=id, kind='still', img=img, vo=vo, move=move, grade=grade, **k)
def P(id, img, vo, screen, **k): return dict(id=id, kind='plate', img=img, vo=vo, screen=screen, **k)
def B(id, vo, title=''): return dict(id='f_' + id, kind='board', src=id, vo=vo, title=title)
def C(id, src, vo, title='', m=None): return dict(id=id, kind='clip', src=src, vo=vo, title=title, m=m)

ACTS = [
 ('before', [
  K('k1', "Every morning, in thousands of classrooms, the same story begins.", '8:40 am  ·  Class 10 B', sfx='chalk', pre=1.4),
  dict(id='s0', kind='still', img='open', vo='', move='push', grade='cold', hold=5.0),
  S('s1', 'heart', "A teacher draws a heart on the board. It is flat. It is dusty. And by the next period, it is gone.", move='push'),
  S('s2', 'bored', "Forty students. One explanation. A few follow. Most quietly drift away.", move='pan'),
  S('s3', 'att', "Minutes go on calling names, one by one.", move='push', sfx='clock'),
  S('s4', 'night', "And tonight, she'll plan tomorrow's lesson by hand. Again.", move='pull'),
  S('s5', 'sick', "If a student misses a day, that lesson is simply lost.", move='push'),
  K('k2', "What if the board on the wall could change all of that?", 'What if the board could help?', sfx='bell'),
 ]),
 ('turn', [
  P('p1', 'plate', "^Meet Zynetix. It runs on the smart board your school already has.", screen='home'),
  dict(id='l1', kind='logo', vo='', hold=2.4),
 ]),
 ('after', [
  C('a1', 'v3d/v3d_heart', "Now, that heart is real. ^Turn it. ^Cut it open. ^Take it apart.", '3D models', m=[0, 1, 2]),
  C('a2', 'v3d/v3d_labels', "Tap a part to see its name, ^in English, ^Hindi, ^or Kannada.", 'Labels in three languages', m=[1, 2, 3]),
  B('b52', "^Experiments become safe and simple. ^Move the light, and watch it bend.", 'Virtual labs'),
  P('p2', 'teacher', "^And every student now has a voice.", screen='b72'),
  B('b73', "^Students answer from their phones, ^and the results appear live.", 'Live class questions'),
  B('b76', "^Ask for one word, ^and see what the whole class is thinking.", 'Word cloud'),
  B('b77', "^A random picker. ^A timer. ^A scoreboard. ^And badges, to keep everyone involved.", 'Classroom toolkit'),
  B('b71', "^Attendance takes one tap, and goes straight to the office.", 'One-tap attendance'),
  B('b63', "That late-night planning? ^The AI lesson builder writes a full plan in seconds.", 'AI lesson builder'),
  B('b64', "^Goals. ^Steps. ^Activities. ^And a quick check at the end.", 'AI lesson builder'),
  B('b61', "^During class, ask any question,", 'Ask Zynetix AI'),
  B('b62', "^and get a clear answer, with its source.", 'Ask Zynetix AI'),
  B('b81', "^Homework is written from the lesson,", 'Homework AI'),
  B('b82', "^and sent to every student in one tap.", 'Homework AI'),
  B('b91', "^Every lesson can be recorded,", 'Lesson recording'),
  B('b93', "^with a transcript and a summary.", 'Lesson recording'),
  S('s6', 'catchup', "So a student at home can catch up on exactly what they missed.", move='push', grade='warm'),
  B('b31', "Even the writing is smart. ^Handwriting becomes neat text.", 'Smart ink'),
  B('b32', "^Rough shapes become perfect.", 'Smart ink'),
  B('b34', "^And the maths solver shows every step.", 'Maths solver'),
  B('b11', "^Teachers sign in with a scan.", 'Scan to sign in'),
  B('b121', "^It works without internet, ^and syncs later.", 'Works offline'),
  B('b103', "^And it speaks Hindi, ^Kannada and English.", 'Three languages'),
 ]),
 ('close', [
  S('s7', 'hands', "Same classroom. Same teacher. A completely different day.", move='push', grade='warm'),
  P('p3', 'plate', "^Zynetix runs on the smart boards you already have.", screen='b52'),
  dict(id='e1', kind='end', vo="^Bring it to your school. Book a demo today."),
 ]),
]

if __name__ == '__main__':
    out = {'chapters': [{'id': a, 'title': '', 'beats': bs} for a, bs in ACTS]}
    json.dump(out, open(os.path.join(HERE, 'data', 'beats7.json'), 'w'), ensure_ascii=False, indent=1)
    print(sum(len(b) for _, b in ACTS), 'beats')

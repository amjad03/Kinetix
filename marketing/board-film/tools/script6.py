"""Board film (v6): a 2-3 minute, Apple-style product film of the Zynetix smart board, highest-value features first.
Each feature appears once, with a big title and a one-line meaning; the voice explains it in plain words.
Beat kinds: 'board' (real board capture beat; anchors = its acts, in order), 'clip' (a recorded clip; anchors = marks m),
'brand' (logo moment). A caret (^) marks an anchor word. -> data/beats6.json"""
import json, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def B(id, vo, title, sub='', **k):
    return dict(id='f_' + id, kind='board', src=id, vo=vo, title=title, sub=sub, **k)
def V(id, src, vo, title, sub='', m=None):
    return dict(id=id, kind='clip', src=src, vo=vo, title=title, sub=sub, m=m)

CH = [
 ('hook', '', [
  V('h1', 'v3d/v3d_heart', "^Imagine holding a human heart in your classroom. ^Cut it open. ^Take it apart.", 'Lessons you can hold', 'Real 3D models on your classroom board', m=[0, 1, 2]),
  dict(id='h2', kind='brand', vo="^This is the Zynetix smart board. ^It turns the board you already have into the smartest assistant in the room.", title='', sub=''),
 ]),
 ('c1', 'Bring lessons to life', [
  V('v_tour', 'v3d/v3d_tour', "^More than forty 3D models. ^The solar system. ^Even the Taj Mahal.", '46 3D models', 'Turn them, cut them, take them apart', m=[0, 1, 2]),
  V('v_lab', 'v3d/v3d_labels', "^Tap a part, and it tells you its name. ^In Hindi, ^or in Kannada.", 'Labels in 3 languages', 'English, Hindi and Kannada', m=[0, 2, 3]),
  B('b52', "^Virtual labs make every experiment safe. ^Move the light, and watch it bend.", 'Virtual labs', 'Experiments without the mess'),
  B('b53', "^Plus a hundred simulations. ^Animations. ^Concept videos. ^And a science kit.", 'Simulations and videos', 'Ready for every topic'),
 ]),
 ('c2', 'An AI assistant for every teacher', [
  B('b63', "^Planning a lesson now takes seconds.", 'AI lesson builder', 'A complete plan in seconds'),
  B('b64', "^Goals. ^Steps. ^Activities. ^And a quick check at the end.", 'AI lesson builder', 'Goals, steps, activities, exit ticket'),
  B('b61', "^Got a question in class? Just ask.", 'Ask Zynetix AI', 'Clear answers in seconds'),
  B('b62', "^It answers in simple words, and shows its source.", 'Ask Zynetix AI', 'Every answer shows its source'),
  B('b65', "^It also makes quizzes, ^homework, ^lecture notes, ^and can read what's on the board.", 'One-tap AI tools', 'Quiz, homework, notes, read the board'),
 ]),
 ('c3', 'Every student takes part', [
  B('b72', "^Ask the whole class a question.", 'Live class questions', 'Every student answers'),
  B('b73', "^Students answer from their phones, ^and the results appear live.", 'Live class questions', 'Results on the board, instantly'),
  B('b74', "^No phones? Students hold up answer cards, and the camera reads them.", 'Answer cards', 'The camera counts every answer'),
  B('b76', "^Ask for one word, ^and watch a word cloud grow.", 'Word cloud', 'See what the class is thinking'),
  B('b77', "^A random picker. ^A timer. ^A scoreboard. ^And badges.", 'Classroom toolkit', 'Everything to run the class'),
 ]),
 ('c4', 'Smart ink', [
  B('b31', "^Handwriting turns into neat, typed text.", 'AI pen', 'Write naturally, get clean text'),
  B('b32', "^A rough circle becomes a perfect one.", 'Shape AI', 'Clean shapes, every time'),
  B('b34', "^And the maths solver shows every step, even offline.", 'Maths solver', 'Step-by-step, works offline'),
 ]),
 ('c5', 'Never miss a lesson', [
  B('b91', "^Record any lesson, after asking for consent.", 'Lesson recording', 'Consent comes first'),
  B('b93', "^Every recording gets a transcript and a summary.", 'Transcripts and summaries', 'Ready to share with students'),
  B('b94', "^Live captions. ^Phone casting. ^A second screen. ^And freeze.", 'Captions and casting', 'Everyone can follow'),
 ]),
 ('c6', 'Built for real classrooms', [
  B('b11', "^Teachers sign in by scanning a code. No passwords on the big screen.", 'Scan to sign in', 'With the teacher app'),
  B('b71', "^Attendance takes one tap, and goes straight to the office.", 'One-tap attendance', 'Sent to the ERP instantly'),
  B('b81', "^Homework AI writes homework from today's lesson,", 'Homework AI', 'From the lesson, in one tap'),
  B('b82', "^and sends it to every student's phone.", 'Homework AI', 'Sent to the student app'),
  B('b121', "^If the Wi-Fi drops, ^nothing is lost. It syncs later.", 'Works offline', 'Syncs when the internet is back', wide=True),
  B('b103', "^It speaks Hindi, ^Kannada, and English.", 'Three languages', 'The whole board, in your language'),
  B('b104', "^Voice commands. ^A reader. ^A screen shade. ^And a spotlight.", 'Help every learner', 'Built-in accessibility', wide=True),
 ]),
 ('end', '', [
  dict(id='e1', kind='end', vo="^Zynetix runs on the smart boards you already have. ^Book your demo today.", title='Runs on your existing boards', sub='Android and Windows interactive panels'),
 ]),
]

if __name__ == '__main__':
    out = {'chapters': [{'id': c, 'title': t, 'beats': bs} for c, t, bs in CH]}
    json.dump(out, open(os.path.join(HERE, 'data', 'beats6.json'), 'w'), ensure_ascii=False, indent=1)
    print(sum(len(b) for _, _, b in CH), 'beats')

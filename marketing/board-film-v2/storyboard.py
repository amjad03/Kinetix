"""Builds the storyboard page (storyboard.html) for the Before/After board film, with frames embedded."""
import base64, html, io, os, sys
from PIL import Image
D = sys.argv[1]
OUT = sys.argv[2]

def img(name, w=480):
    im = Image.open(os.path.join(D, name)).convert('RGB')
    if im.width < w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=80)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

# (timecode, frame, source label, picture, voice, on-screen text)
ACTS = [
 ('before', 'Act I · The old day', 'Cold, quiet, piano and room sound: chalk scratching, a ceiling fan, a distant bell.', [
  ('0:00', None, 'Black', 'Black screen. Chalk scratching on a board.', 'Every morning, in thousands of classrooms, the same story begins.', '8:40 am · Class 10 B'),
  ('0:06', 'c_heart.png', 'Canva AI', 'Slow push-in on a flat chalk heart. Chalk dust drifts through a sunbeam.', 'A teacher draws a heart on the board. It is flat. It is dusty. And by the next period, it is gone.', ''),
  ('0:14', 'c_bored.png', 'Canva AI', 'Slow pan across the rows. A student stares out of the window.', 'Forty students. One explanation. A few follow. Most quietly drift away.', ''),
  ('0:21', 'c_att.png', 'Canva AI', 'Teacher reading names from a register. The clock ticks.', 'Minutes go on calling names, one by one.', ''),
  ('0:26', 'c_night.png', 'Canva AI', 'Night. One lamp. The same teacher planning by hand.', "And tonight, she'll plan tomorrow's lesson by hand. Again.", ''),
  ('0:32', 'c_sick.png', 'Canva AI', 'A student at home, unwell, with an empty notebook.', "If a student misses a day, that lesson is simply lost.", ''),
  ('0:38', None, 'Black', 'Cut to black. The bell fades out.', 'What if the board on the wall could change all of that?', 'What if the board could help?'),
 ]),
 ('turn', 'Act II · The turn', 'The music lifts. The picture warms.', [
  ('0:44', 'c_plate.png', 'Canva AI + real board', "A bright classroom. The blank board on the wall lights up with the real Zynetix board screen, placed into the photo.", 'Meet Zynetix. It runs on the smart board your school already has.', ''),
  ('0:51', None, 'Logo', 'The Zynetix logo resolves over the board glow.', '', 'Zynetix Smart Board'),
 ]),
 ('after', 'Act III · The new day', 'Every problem from Act I is answered, in the same order. All board shots are freshly recorded on a clean board: neat typed content, one feature per shot, nothing repeated.', [
  ('0:55', 'r_heart.jpg', 'Real 3D viewer', 'The flat chalk heart dissolves into a real 3D heart that turns, opens and comes apart.', 'Now, that heart is real. Turn it. Cut it open. Take it apart.', '46 3D models'),
  ('1:04', 'r_labels.jpg', 'Real 3D viewer', 'Labels switch from English to Hindi to Kannada.', 'Tap a part to see its name, in English, Hindi or Kannada.', 'Labels in 3 languages'),
  ('1:10', 'r_b52.jpg', 'New board recording', 'Virtual lab: the teacher drags the light ray and it bends through the glass.', 'Experiments become safe and simple. Move the light, and watch it bend.', 'Virtual labs'),
  ('1:17', 'c_teacher.png', 'Canva AI + real board', 'The teacher at the board, which shows a live question.', 'And every student now has a voice.', ''),
  ('1:21', 'r_b73.jpg', 'New board recording', 'Answers arrive from phones and the bars rise live.', 'Students answer from their phones, and the results appear live.', 'Live class questions'),
  ('1:27', 'r_b76.jpg', 'New board recording', 'A word cloud grows as answers come in.', 'Ask for one word, and see what the whole class is thinking.', 'Word cloud'),
  ('1:33', 'r_b77.jpg', 'New board recording', 'Random picker, timer and badges in quick succession.', 'A random picker, a timer and badges keep everyone involved.', 'Classroom toolkit'),
  ('1:39', 'r_b71.jpg', 'New board recording', 'The register is replaced by one tap on the absent students.', 'Attendance takes one tap, and goes straight to the office.', 'One-tap attendance'),
  ('1:45', 'r_b64.jpg', 'New board recording', 'The lesson builder writes a full plan in seconds.', "That late-night planning? The AI lesson builder writes a full plan in seconds: goals, steps, activities and a quick check.", 'AI lesson builder'),
  ('1:55', 'r_b62.jpg', 'New board recording', 'Ask Zynetix AI answers a question, with its source.', 'During class, ask any question, and get a clear answer, with its source.', 'Ask Zynetix AI'),
  ('2:02', 'r_b82.jpg', 'New board recording', 'Homework made from the lesson, sent to every phone.', 'Homework is written from the lesson, and sent to every student in one tap.', 'Homework AI'),
  ('2:09', 'r_b93.jpg', 'New board recording', 'Recording with consent, then a transcript and summary.', 'Every lesson can be recorded, with a transcript and a summary.', 'Lesson recording'),
  ('2:15', 'c_catchup.png', 'Canva AI', 'The same student at home, now smiling, watching the lesson on a phone.', 'So a student at home can catch up on exactly what they missed.', ''),
  ('2:21', 'r_b31.jpg', 'New board recording', 'Neat handwriting becomes typed text; a rough circle becomes perfect; the maths solver shows each step.', 'Even the writing is smart. Handwriting becomes neat text. Rough shapes become perfect. And the maths solver shows every step.', 'Smart ink'),
  ('2:33', 'r_b11.jpg', 'New board recording', 'Quick, calm montage: scan to sign in, works offline, three languages, accessibility tools.', 'Teachers sign in with a scan. It works without internet. And it speaks your language.', 'Ready for every classroom'),
 ]),
 ('close', 'Act IV · Same classroom, new day', 'Warm and full. The music resolves.', [
  ('2:43', 'c_hands.png', 'Canva AI', 'Students with hands raised, smiling, phones in hand.', 'Same classroom. Same teacher. A completely different day.', ''),
  ('2:50', 'c_open.png', 'Canva AI + real board', 'Callback to the opening shot, but the old chalkboard is now the Zynetix board, glowing.', 'Zynetix runs on the smart boards you already have.', 'Runs on your existing boards'),
  ('2:58', None, 'Logo', 'Logo and call to action.', 'Bring it to your school. Book a demo today.', 'Zynetix · Book a demo'),
 ]),
]

rows = []
for key, title, note, scenes in ACTS:
    rows.append(f'<section class="act act-{key}"><header><h2>{html.escape(title)}</h2><p>{html.escape(note)}</p></header><ol class="shots">')
    for tc, fr, src, pic, vo, ost in scenes:
        if fr:
            thumb = f'<img src="{img(fr)}" alt="{html.escape(pic)}">'
        else:
            thumb = f'<div class="black">{html.escape(ost or "Black")}</div>'
        rows.append(f'''<li class="shot"><div class="frame">{thumb}<span class="src">{html.escape(src)}</span></div>
<div class="meta"><span class="tc">{tc}</span><p class="pic">{html.escape(pic)}</p>
{f'<p class="vo"><span>Voice</span>{html.escape(vo)}</p>' if vo else ''}
{f'<p class="ost"><span>On screen</span>{html.escape(ost)}</p>' if ost else ''}</div></li>''')
    rows.append('</ol></section>')

page = f'''<title>Zynetix Board Film Storyboard</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a film shot list. Acts are bands; each shot is a frame beside its timecode, picture note, voice line and on-screen text. Cold blue marks the old day, warm amber the new day. */
:root {{
  --bg: #f6f5f2; --fg: #1d1f24; --muted: #646872; --line: #dcdad4; --card: #ffffff;
  --cold: #3d6c8f; --warm: #b5701f; --black: #111214;
  --display: "Instrument Serif", Georgia, serif; --body: "IBM Plex Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #141518; --fg: #ececea; --muted: #9a9ea8; --line: #2c2e33; --card: #1c1e22; --cold: #7fb0d6; --warm: #e2a456; --black: #050506; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #141518; --fg: #ececea; --muted: #9a9ea8; --line: #2c2e33; --card: #1c1e22; --cold: #7fb0d6; --warm: #e2a456; --black: #050506; color-scheme: dark; }}
body {{ background: var(--bg); color: var(--fg); font: 400 16px/1.55 var(--body); }}
.wrap {{ max-width: 1080px; margin: 0 auto; padding-block: 40px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }}
h1 {{ font: 400 clamp(40px, 6vw, 64px)/1.02 var(--display); margin: 0 0 12px; text-wrap: balance; }}
.lede {{ color: var(--muted); max-width: 64ch; margin: 0 0 24px; }}
.facts {{ display: flex; flex-wrap: wrap; gap: 8px 24px; font: 500 13px/1.4 var(--mono); color: var(--muted); padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-bottom: 8px; }}
.facts b {{ color: var(--fg); font-weight: 500; }}
.act {{ margin-top: 48px; }}
.act header {{ border-left: 3px solid var(--tone); padding-left: 14px; margin-bottom: 18px; }}
.act h2 {{ font: 400 32px/1.1 var(--display); margin: 0 0 4px; color: var(--tone); }}
.act header p {{ margin: 0; color: var(--muted); max-width: 70ch; }}
.act-before, .act-turn {{ --tone: var(--cold); }} .act-after, .act-close {{ --tone: var(--warm); }}
.shots {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }}
.shot {{ display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 20px; align-items: start; padding: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 6px; }}
.frame {{ position: relative; aspect-ratio: 16 / 9; max-width: 100%; background: var(--black); border-radius: 3px; overflow: hidden; }}
.frame img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
.black {{ height: 100%; display: grid; place-items: center; color: #d9d9d6; font: italic 400 20px/1.2 var(--display); padding: 12px; text-align: center; }}
.src {{ position: absolute; left: 6px; bottom: 6px; font: 500 11px/1 var(--mono); background: rgba(0,0,0,.6); color: #fff; padding: 4px 6px; border-radius: 2px; letter-spacing: .02em; }}
.meta {{ min-width: 0; display: grid; gap: 6px; }}
.tc {{ font: 500 13px/1 var(--mono); color: var(--tone); font-variant-numeric: tabular-nums; }}
.pic {{ margin: 0; color: var(--muted); }}
.vo, .ost {{ margin: 0; }}
.vo span, .ost span {{ display: inline-block; min-width: 80px; font: 500 11px/1 var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-right: 8px; }}
.vo {{ font-size: 17px; }}
.ost {{ font-weight: 600; }}
.notes {{ margin-top: 56px; display: grid; gap: 10px; max-width: 72ch; }}
.notes h2 {{ font: 400 32px/1.1 var(--display); margin: 0; }}
.notes li {{ margin-bottom: 6px; }}
@media (max-width: 640px) {{ .shot {{ grid-template-columns: minmax(0, 1fr); }} }}
</style>
<div class="wrap">
<h1>The board that changed the day</h1>
<p class="lede">A Before and After film for the Zynetix smart board. It opens on the problems every principal recognises, then answers each one with the real board, in the same order. Science lesson, cinematic and emotional, same narrator as before.</p>
<div class="facts"><span>Length <b>about 3:05</b></span><span>Format <b>16:9, 1080p</b></span><span>Voice <b>same narrator</b></span><span>Classroom shots <b>Canva AI</b></span><span>Board shots <b>freshly recorded</b></span></div>
{''.join(rows)}
<section class="notes"><h2>How it will be made</h2><ul>
<li>Classroom scenes are Canva AI photographs, brought to life with slow camera moves, light dust and a film grade: cold for the old day, warm for the new day.</li>
<li>Where a classroom shot shows a board, the real Zynetix screen is placed onto it in perspective, so the product lives inside the scene.</li>
<li>Every board shot is re-recorded from the real app on a clean board: typed, neat content for a Class 10 science lesson, one feature per shot, no repeated writing. The frames above are placeholders from the old recording to show which feature goes where.</li>
<li>Sound: piano and room sound under Act I, the music lifts at the turn, and resolves on the classroom with hands raised.</li>
</ul></section>
</div>'''
open(OUT, 'w').write(page)
print('ok', len(page) // 1024, 'KB')

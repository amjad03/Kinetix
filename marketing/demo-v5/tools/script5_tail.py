"""v5 script, second half: the ERP, the three apps and the ending (anchors use each clip's marks)."""
try:
    from script5_erp import ERP
except ImportError:
    ERP = []

def add(chapter, B, V, CARD):
    for c in ERP:
        chapter(*c)
    chapter('a1', 'Teacher app', [
        CARD('k4', 'The mobile apps', 'For teachers, students and parents'),
        V('a01', 'apps/teacher_connect_board', "The teacher's phone is the key to the board. ^She taps Start class, ^scans the code, ^and the board opens her class.", 'Connect to the board', m=[1, 2, 4]),
        V('a02', 'apps/teacher_attendance', "^Taking attendance? Everyone starts present. ^Tap the ones who are absent, ^and it's saved.", 'Attendance', m=[2, 3, 7]),
        V('a03', 'apps/teacher_homework', "^She sees who handed in their homework, ^opens an answer, ^and marks it checked, with a remark.", 'Homework', m=[3, 6, 8]),
        V('a04', 'apps/teacher_marks', "^Marks are typed in, ^published, ^and families can see them right away.", 'Marks', m=[3, 5, 8]),
        V('a05', 'apps/teacher_plan_syllabus', "^The syllabus shows what's been taught. ^The year plan flags topics that are late. ^And AI drafts the next lesson plan.", 'Syllabus and plans', m=[1, 5, 9]),
        V('a06', 'apps/teacher_messages', "^Teachers and parents can chat, ^and replies arrive instantly.", 'Messages', m=[3, 5]),
    ])
    chapter('a2', 'Student app', [
        V('a07', 'apps/student_home', "Students have their own app. ^They can answer the teacher's live question from their phone, ^and see homework, attendance and results at a glance.", 'Student home', m=[3, 6]),
        V('a08', 'apps/student_homework', "^They open their homework, ^write an answer, ^and hand it in. ^Checked work comes back with the teacher's remark.", 'Hand in homework', m=[1, 3, 5, 8]),
        V('a09', 'apps/student_marks_attendance', "^Results show their marks next to the class average. ^And attendance shows every class, day by day.", 'Results and attendance', m=[2, 5]),
        V('a10', 'apps/student_learn', "Missed a class? ^Watch the recorded lesson, with a summary and key points. ^And see how much of the syllabus is done.", 'Lessons and syllabus', m=[2, 6]),
    ])
    chapter('a3', 'Parent app', [
        V('a11', 'apps/parent_home', "And parents get an app too. ^They see how their child is doing. ^Got two children? ^Switch in one tap.", 'Parent home', m=[2, 4, 6]),
        V('a12', 'apps/parent_attendance', "^Attendance is always up to date, ^class by class.", 'Attendance', m=[1, 3]),
        V('a13', 'apps/parent_fees', "^Fees are clear: what's due, and what's paid. ^Pay online in a few taps, ^and the receipt comes straight away.", 'Fees', m=[1, 6, 8]),
        V('a14', 'apps/parent_reports', "^Results and the teacher's remarks are right there. ^Even an overdue library book.", 'Results', m=[3, 6]),
        V('a15', 'apps/parent_messages', "^And they can message the teacher, ^and get a reply in the same app.", 'Messages', m=[3, 5]),
    ])
    chapter('end', '', [
        dict(id='e1', kind='brand', vo="^Zynetix. ^A smart board that makes every lesson come alive. ^An ERP that runs the whole school. ^And apps that keep everyone connected.", shots=['brand', 'board', 'erp', 'apps']),
        dict(id='e2', kind='end', vo="^Book a demo, and see it in your school.", sub='Smart board  ·  ERP  ·  Mobile apps'),
    ])

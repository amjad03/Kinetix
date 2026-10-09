import type { AptitudeQuestion } from '../db/schema-pathways.js';
import { A4, Pdf } from '../common/pdf-doc.js';

/** Pure career rules: aptitude grading, path recommendations, interview scoring, the coach's offline reply and the resume PDF. */

export interface AptitudeResult {
  score: number;
  total: number;
  percent: number;
  topicScores: Record<string, { right: number; total: number }>;
}

export function gradeAptitude(questions: AptitudeQuestion[], answers: (number | null)[]): AptitudeResult {
  const topicScores: AptitudeResult['topicScores'] = {};
  let score = 0;
  questions.forEach((q, i) => {
    const t = (topicScores[q.topic || 'General'] ??= { right: 0, total: 0 });
    t.total += 1;
    if (answers[i] === q.answerIndex) {
      score += 1;
      t.right += 1;
    }
  });
  const total = questions.length;
  return { score, total, percent: total ? Math.round((score / total) * 10000) / 100 : 0, topicScores };
}

export interface PathLike {
  id: string;
  title: string;
  family: string;
  description: string;
  requiredSkills: string[];
  roles: string[];
}
export interface PathFit {
  pathId: string;
  title: string;
  family: string;
  fit: number;
  matched: string[];
  gaps: string[];
  interestMatch: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();
const same = (a: string, b: string) => a.includes(b) || b.includes(a);

/**
 * Ranks career paths for a student. 70% of the fit is how many of the path's required skills the student has
 * (a skill at level 3 or more counts fully, a lower level counts 60%); 30% is whether an interest names the path.
 */
export function recommendPaths(paths: PathLike[], skills: { name: string; level: number | null }[], interests: string[]): PathFit[] {
  const mine = skills.map((s) => ({ name: norm(s.name), weight: (s.level ?? 0) >= 3 ? 1 : 0.6 }));
  const wants = interests.map(norm).filter(Boolean);
  return paths
    .map((p) => {
      const req = p.requiredSkills.map(norm).filter(Boolean);
      let covered = 0;
      const matched: string[] = [];
      const gaps: string[] = [];
      req.forEach((r, i) => {
        const hit = mine.filter((m) => m.name && same(m.name, r)).sort((a, b) => b.weight - a.weight)[0];
        if (hit) {
          covered += hit.weight;
          matched.push(p.requiredSkills[i]);
        } else gaps.push(p.requiredSkills[i]);
      });
      const hay = norm(`${p.title} ${p.family} ${p.description} ${p.roles.join(' ')}`);
      const interestMatch = wants.some((w) => hay.includes(w));
      const skillShare = req.length ? covered / req.length : 0;
      return { pathId: p.id, title: p.title, family: p.family, fit: Math.round((skillShare * 70 + (interestMatch ? 30 : 0)) * 10) / 10, matched, gaps, interestMatch };
    })
    .sort((a, b) => b.fit - a.fit || a.title.localeCompare(b.title));
}

// ---- Mock interviews ---------------------------------------------------------------------------

export type InterviewKind = 'hr' | 'technical' | 'communication';
export interface InterviewQuestion {
  prompt: string;
  keywords: string[];
}

const BANK: Record<InterviewKind, InterviewQuestion[]> = {
  hr: [
    { prompt: 'Tell me about yourself.', keywords: ['studying', 'project', 'skills', 'interest', 'goal'] },
    { prompt: 'Describe a time you worked in a team and what you contributed.', keywords: ['team', 'task', 'result', 'learned', 'together'] },
    { prompt: 'What are your strengths and one weakness you are working on?', keywords: ['strength', 'weakness', 'improve', 'example', 'working'] },
    { prompt: 'Why should we hire you for this role?', keywords: ['role', 'skills', 'learn', 'contribute', 'value'] },
    { prompt: 'Where do you see yourself in five years?', keywords: ['grow', 'goal', 'learn', 'responsibility', 'skills'] },
  ],
  technical: [
    { prompt: 'Explain a project you built and the choices you made.', keywords: ['problem', 'design', 'tested', 'tools', 'result'] },
    { prompt: 'Explain a core concept from your subject to a beginner.', keywords: ['example', 'because', 'simple', 'works', 'use'] },
    { prompt: 'How would you find and fix an error you cannot explain?', keywords: ['reproduce', 'isolate', 'test', 'cause', 'fix'] },
    { prompt: 'What would you do if you were given a task you have not done before?', keywords: ['learn', 'ask', 'plan', 'steps', 'review'] },
  ],
  communication: [
    { prompt: 'Describe your college in one minute to someone who has never heard of it.', keywords: ['first', 'also', 'finally', 'because', 'example'] },
    { prompt: 'Persuade a friend to join a club you enjoy.', keywords: ['because', 'benefit', 'example', 'join', 'experience'] },
    { prompt: 'Explain a recent news item and what you think about it.', keywords: ['news', 'because', 'think', 'impact', 'opinion'] },
  ],
};

export function interviewQuestions(kind: InterviewKind, count: number): InterviewQuestion[] {
  return BANK[kind].slice(0, Math.max(1, Math.min(count, BANK[kind].length)));
}

const FILLERS = ['um', 'uh', 'umm', 'like', 'you know', 'basically', 'actually', 'kind of', 'sort of'];

export function countFillers(text: string): number {
  const t = ` ${text.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  return FILLERS.reduce((n, f) => n + (t.split(` ${f} `).length - 1), 0);
}

export interface AnswerScore {
  score: number;
  notes: string[];
}

/** Scores one answer 0-10 on length, coverage of the points a good answer makes, and filler words. */
export function scoreAnswer(answer: string, keywords: string[], seconds?: number): AnswerScore {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const notes: string[] = [];
  let score = words.length < 15 ? 2 : words.length < 40 ? 5 : words.length <= 220 ? 7 : 6;
  if (words.length < 15) notes.push('Too short. Aim for 40 to 150 words with an example.');
  else if (words.length < 40) notes.push('Add a specific example to back up your point.');
  else if (words.length > 220) notes.push('Long answers lose the listener. Keep to the main points.');
  const lower = answer.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k.toLowerCase()));
  score += keywords.length ? Math.round((hits.length / keywords.length) * 20) / 10 : 0;
  const missing = keywords.filter((k) => !hits.includes(k));
  if (missing.length && keywords.length) notes.push(`Try to cover: ${missing.slice(0, 3).join(', ')}.`);
  const fillers = countFillers(answer);
  if (fillers > 0) {
    score -= Math.min(2, fillers * 0.5);
    notes.push(`${fillers} filler word${fillers === 1 ? '' : 's'} (um, like, basically). Pause instead.`);
  }
  if (seconds && words.length) {
    const wpm = Math.round((words.length / seconds) * 60);
    if (wpm > 180) notes.push(`You spoke at about ${wpm} words a minute. Slow down a little.`);
    else if (wpm < 90) notes.push(`You spoke at about ${wpm} words a minute. A steadier pace sounds more confident.`);
  }
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  if (notes.length === 0) notes.push('Clear and well structured.');
  return { score, notes };
}

export function scoreInterview(questions: InterviewQuestion[], answers: { answer: string; seconds?: number }[]) {
  const perQuestion = questions.map((q, i) => scoreAnswer(answers[i]?.answer ?? '', q.keywords, answers[i]?.seconds));
  const score = perQuestion.length ? Math.round((perQuestion.reduce((s, x) => s + x.score, 0) / perQuestion.length) * 100) / 100 : 0;
  const overall = score >= 8 ? ['Strong interview. Keep practising to stay sharp.'] : score >= 5 ? ['Decent. Work on examples and structure (situation, action, result).'] : ['Needs practice. Rehearse your answers aloud and use examples.'];
  return { perQuestion, score, overall };
}

// ---- The coach's offline reply -----------------------------------------------------------------

/** What the assistant says when no AI model is connected: built from the same facts the model would get. */
export function offlineCoachReply(question: string, ctx: { topPaths: PathFit[]; skills: string[]; resumeComplete: boolean }): { answer: string; suggestions: string[]; pathways: string[] } {
  const q = question.toLowerCase();
  const best = ctx.topPaths[0];
  const pathways = ctx.topPaths.slice(0, 3).map((p) => p.title);
  if (/resume|cv/.test(q)) {
    return {
      answer: ctx.resumeComplete ? 'Your resume has the main sections. Make each project line say what you did and what came of it.' : 'Your resume is missing sections. Fill in a headline, a short summary, education, projects and skills.',
      suggestions: ['Keep it to one page', 'Lead each point with a verb', 'List links to your best projects'],
      pathways,
    };
  }
  if (/interview|mock/.test(q)) {
    return { answer: 'Practise with the mock interview tool. Start with HR questions, then technical ones, and read the feedback on structure and filler words.', suggestions: ['Take one HR mock interview this week', 'Record yourself answering "Tell me about yourself"'], pathways };
  }
  if (best) {
    return {
      answer: `Based on your skills and interests, ${best.title} is your closest fit (${best.fit}%). ${best.gaps.length ? `To strengthen it, build ${best.gaps.slice(0, 3).join(', ')}.` : 'You already cover its main skills.'}`,
      suggestions: best.gaps.slice(0, 3).map((g) => `Add evidence of ${g} (a project, course or certificate)`),
      pathways,
    };
  }
  return { answer: 'Add skills to your passport and a few interests to your resume, then ask again for a personal recommendation.', suggestions: ['Update your resume interests', 'Ask your mentor to record skill evidence'], pathways: [] };
}

// ---- Resume PDF --------------------------------------------------------------------------------

export interface ResumeData {
  fullName: string;
  rollNo: string;
  className: string;
  headline: string;
  summary: string;
  education: { institution: string; degree: string; years: string; score?: string }[];
  experience: { org: string; role: string; years: string; detail?: string }[];
  projects: { title: string; detail?: string; url?: string }[];
  skills: string[];
  links: { label: string; url: string }[];
}

export function resumePdf(r: ResumeData): Buffer {
  const pdf = new Pdf(`Resume ${r.fullName}`).addPage();
  const left = 50;
  const width = A4.w - 100;
  let y = 60;
  pdf.text(r.fullName, left, y, { size: 20, bold: true });
  y += 18;
  pdf.text(r.headline || `${r.className}, Roll ${r.rollNo}`, left, y, { size: 11, color: '#444444' });
  y += 10;
  pdf.line(left, y, left + width, y);
  y += 18;
  const section = (title: string) => {
    pdf.text(title.toUpperCase(), left, y, { size: 10, bold: true, color: '#1a5fb4' });
    y += 14;
  };
  if (r.summary) {
    section('Summary');
    y = pdf.paragraph(r.summary, left, y, width, { size: 10.5 }) + 10;
  }
  if (r.education.length) {
    section('Education');
    for (const e of r.education) {
      pdf.text(`${e.degree}, ${e.institution}`, left, y, { size: 10.5, bold: true });
      pdf.text(`${e.years}${e.score ? `  |  ${e.score}` : ''}`, left + width, y, { size: 10, align: 'right' });
      y += 15;
    }
    y += 6;
  }
  if (r.experience.length) {
    section('Experience');
    for (const e of r.experience) {
      pdf.text(`${e.role}, ${e.org}`, left, y, { size: 10.5, bold: true });
      pdf.text(e.years, left + width, y, { size: 10, align: 'right' });
      y += 14;
      if (e.detail) y = pdf.paragraph(e.detail, left + 8, y, width - 8, { size: 10 }) + 4;
    }
    y += 6;
  }
  if (r.projects.length) {
    section('Projects');
    for (const p of r.projects) {
      pdf.text(p.title, left, y, { size: 10.5, bold: true });
      y += 14;
      if (p.detail) y = pdf.paragraph(p.detail, left + 8, y, width - 8, { size: 10 }) + 4;
    }
    y += 6;
  }
  if (r.skills.length) {
    section('Skills');
    y = pdf.paragraph(r.skills.join('  |  '), left, y, width, { size: 10.5 }) + 10;
  }
  if (r.links.length) {
    section('Links');
    for (const l of r.links) {
      pdf.text(`${l.label}: ${l.url}`, left, y, { size: 10 });
      y += 13;
    }
  }
  return pdf.build();
}

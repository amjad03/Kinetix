// Types for the question bank desk (v1/question-bank).

export interface QbOptions {
  subjects: { id: string; name: string; code: string; outcomes: { id: string; code: string }[] }[];
  staff: { id: string; name: string }[];
}

export interface QbQuestion {
  id: string;
  subjectId: string;
  topic: string;
  unit: string | null;
  coCode: string | null;
  bloom: string;
  difficulty: string;
  marks: number;
  type: string;
  text: string;
  status: 'draft' | 'reviewed' | 'approved';
  version: number;
  authorId: string;
  authorName: string;
  reviewedByName: string | null;
  approvedByName: string | null;
  examFrequency: { count: number; exams: string[] } | null;
  important: boolean;
  usedCount: number;
}

export interface QbSection {
  name: string;
  count: number;
  questionMarks: number;
  type?: string;
  bloom?: Record<string, number>;
  difficulty?: Record<string, number>;
  coverage?: string[];
}

export interface QbBlueprint {
  id: string;
  subjectId: string;
  title: string;
  totalMarks: number;
  durationMinutes: number;
  sections: QbSection[];
}

export interface QbPaper {
  id: string;
  title: string;
  subject: string;
  status: 'draft' | 'scrutiny' | 'returned' | 'approved' | 'locked';
  seed: string;
  repeats: number;
  remarks: string | null;
  setterId: string;
  setterName: string;
  moderatorId: string | null;
  moderatorName: string | null;
  createdAt: string;
}

export interface QbPaperDetail extends QbPaper {
  totalMarks: number;
  items: { id: string; section: number; position: number; marks: number; snapshot: { text: string; bloom: string; difficulty: string; coCode: string | null } }[];
  blueprint: QbBlueprint;
}

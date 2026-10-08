import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { pastExamQuestions } from '../db/schema.js';

/** How alike two questions must be (pg_trgm similarity) to count as the same exam question. */
const SAME_QUESTION = 0.45;

export interface ExamFrequency {
  /** How many past papers asked it; absent when the question bank has no match. */
  examFrequency?: { count: number; exams: string[] };
  /** Asked in two or more past papers. */
  important?: boolean;
}

/**
 * For each question, the past papers that asked (nearly) the same thing, from the institution's
 * own question bank. With no bank, or no match, nothing is returned: the board shows no badge.
 */
export async function examFrequency(tx: Tx, questions: string[], subjectId?: string): Promise<ExamFrequency[]> {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(pastExamQuestions);
  if (n === 0) return questions.map(() => ({}));
  const out: ExamFrequency[] = [];
  for (const q of questions) {
    const rows = await tx
      .select({ exam: pastExamQuestions.exam, year: pastExamQuestions.year })
      .from(pastExamQuestions)
      .where(and(sql`similarity(${pastExamQuestions.question}, ${q}) > ${SAME_QUESTION}`, subjectId ? or(eq(pastExamQuestions.subjectId, subjectId), isNull(pastExamQuestions.subjectId)) : undefined))
      .orderBy(desc(pastExamQuestions.year))
      .limit(20);
    const exams = [...new Set(rows.map((r) => `${r.exam} ${r.year}`))];
    out.push(exams.length ? { examFrequency: { count: exams.length, exams: exams.slice(0, 6) }, important: exams.length >= 2 } : {});
  }
  return out;
}

const ImportBody = z.object({
  subjectId: z.uuid().optional(),
  rows: z
    .array(z.object({ question: z.string().trim().min(5).max(2000), exam: z.string().trim().min(2).max(120), year: z.number().int().min(1950).max(2100), marks: z.number().int().min(0).max(100).optional() }))
    .min(1)
    .max(2000),
});

/** The past-exam question bank: the exam cell imports papers; teachers and the board read badges from it. */
@Controller('v1/past-exam-questions')
export class PastExamsController {
  constructor(private readonly db: DbService) {}

  @Post('import')
  @HttpCode(200)
  @Auth('user', [...STAFF_ADMIN_ROLES, 'hod'])
  import(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) body: z.infer<typeof ImportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.insert(pastExamQuestions).values(body.rows.map((r) => ({ tenantId: p.tenantId, subjectId: body.subjectId, ...r })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'past_exam_questions.imported', subjectType: 'subject', subjectId: body.subjectId, data: { rows: body.rows.length } });
      return { imported: body.rows.length };
    });
  }

  @Get()
  @Auth('user', [...STAFF_ADMIN_ROLES, ...TEACHING_ROLES])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('subjectId') subjectId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select()
        .from(pastExamQuestions)
        .where(subjectId && /^[0-9a-f-]{36}$/.test(subjectId) ? eq(pastExamQuestions.subjectId, subjectId) : undefined)
        .orderBy(desc(pastExamQuestions.year))
        .limit(500),
    );
  }
}

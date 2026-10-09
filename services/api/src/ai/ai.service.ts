import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { ContentService } from '../content/content.service.js';
import { DbService, type Tx } from '../db/db.service.js';
import { aiCache, aiUsage, sections, subjects, tenants } from '../db/schema.js';
import {
  AiUnavailableError,
  CircuitBreaker,
  FallbackProvider,
  OpenAiCompatibleProvider,
  parseJsonReply,
  PreviewProvider,
  SarvamProvider,
  type LlmProvider,
} from './providers.js';
import { allText, unsafeTerm } from './safety.js';
import {
  buildMessages,
  checkOutput,
  PROMPT_VERSION,
  postProcess,
  previewOutput,
  requestText,
  TaskOutputs,
  type Grounding,
  type Language,
  type TaskInput,
  type TaskName,
  type TaskOutput,
} from './tasks.js';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * Local first: the self-hosted model (AI_BASE_URL), then the pay-per-use fallback. One of them
 * alone is used as is; with neither, the labelled previews.
 */
export function providerFromEnv(env: Env): LlmProvider {
  const chain: LlmProvider[] = [];
  if (env.AI_BASE_URL) chain.push(new OpenAiCompatibleProvider(env.AI_BASE_URL, env.AI_MODEL, env.AI_API_KEY, env.AI_TIMEOUT_MS, env.AI_VISION));
  if (env.AI_FALLBACK_PROVIDER === 'sarvam' && env.SARVAM_API_KEY) {
    chain.push(
      new SarvamProvider(env.SARVAM_API_KEY, env.SARVAM_LLM_MODEL, { inputPerM: env.SARVAM_INR_PER_M_INPUT, outputPerM: env.SARVAM_INR_PER_M_OUTPUT }, env.AI_TIMEOUT_MS, env.SARVAM_BASE_URL),
    );
  }
  if (chain.length === 0) return new PreviewProvider();
  if (chain.length === 1) return chain[0];
  return new FallbackProvider(chain.map((provider) => ({ provider, breaker: new CircuitBreaker(env.AI_BREAKER_FAILURES, env.AI_BREAKER_COOLDOWN_S * 1000) })));
}

/** Who is asking, and about which class. */
export interface AiCaller {
  tenantId: string;
  userId?: string;
  deviceId?: string;
  sectionId?: string | null;
  subjectId?: string | null;
  /** A content-library topic chosen by the teacher; otherwise topics are matched from the request. */
  topicId?: string | null;
}

export interface AiResponse<T extends TaskName> {
  task: T;
  result: TaskOutput<T>;
  meta: {
    provider: string;
    model: string;
    promptVersion: string;
    cached: boolean;
    /** A placeholder answer: no AI server is connected. Apps label it as such. */
    preview: boolean;
    /** Content-library topics the answer was grounded in, for citing. */
    sources: { topicId: string; title: string }[];
  };
}

const MAX_TOKENS: Record<TaskName, number> = { explain: 1200, quiz: 2500, homework: 2500, lessonPlan: 1500, summarize: 1200, readBoard: 1500, boardSummary: 1500, lecture: 2200, selectAsk: 1500, financeInsight: 1200, admissionsInsight: 1200, hrInsight: 1200, syllabusImport: 4000, careerCoach: 1200, gradeAssist: 1200 };
const CACHE_DAYS = 30;
const BLOCKED = "KINETIX AI can't help with that request. Try rephrasing it for the classroom.";

type Outcome = (typeof aiUsage.$inferInsert)['outcome'];

/** Tokens, cost and the provider that actually answered (the fallback may have served it). */
interface Usage {
  promptTokens: number;
  completionTokens: number;
  provider: string;
  model: string;
  costInr?: number;
}

/**
 * The AI gateway: grounding, safety, quota, cache, the model call (with one repair attempt
 * when the reply is not valid), and metering. Model calls happen outside any database
 * transaction so a slow model never holds a connection.
 */
@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);

  constructor(
    private readonly db: DbService,
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Inject(ENV) private readonly env: Env,
    private readonly content: ContentService,
  ) {}

  async run<T extends TaskName>(caller: AiCaller, task: T, input: TaskInput<T>, opts: { fresh?: boolean } = {}): Promise<AiResponse<T>> {
    const p = this.provider;
    const { grounding, key, cached, sources } = await this.db.withTenant(caller.tenantId, async (tx) => {
      const words = requestText(input);
      const { grounding, sources } = await this.grounding(tx, caller, task === 'readBoard' ? '' : words, task, (input as { language?: Language }).language ?? 'en');
      const key = this.cacheKey(task, input, grounding);
      const forMinors = grounding.institutionKind === 'school';

      const bad = unsafeTerm(words, forMinors);
      if (bad) {
        await this.record(tx, caller, task, 'blocked', { detail: `input: ${bad}` });
        return { grounding, key, sources, cached: undefined, refusal: 'blocked' as const };
      }
      if (!opts.fresh && !p.preview) {
        const [hit] = await tx
          .select()
          .from(aiCache)
          .where(and(eq(aiCache.key, key), inArray(aiCache.model, [...(p.models ?? [p.model])]), gte(aiCache.createdAt, new Date(Date.now() - CACHE_DAYS * 86400_000))));
        if (hit) {
          await tx.update(aiCache).set({ hits: sql`${aiCache.hits} + 1` }).where(eq(aiCache.key, key));
          await this.record(tx, caller, task, 'cached');
          return { grounding, key, sources, cached: hit.result as TaskOutput<T> };
        }
      }
      if (!p.preview && (await this.usedToday(tx)) >= this.env.AI_DAILY_LIMIT) {
        await this.record(tx, caller, task, 'quota');
        return { grounding, key, sources, cached: undefined, refusal: 'quota' as const };
      }
      return { grounding, key, sources, cached: undefined };
    }).then((r) => {
      // Refusals are thrown after the transaction commits, so the usage row is kept.
      if ('refusal' in r && r.refusal === 'blocked') throw new UnprocessableEntityException(BLOCKED);
      if ('refusal' in r && r.refusal === 'quota') {
        throw new HttpException("Your institution has used today's KINETIX AI allowance. It resets tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
      }
      return r;
    });

    const meta = { provider: p.name, model: p.model, promptVersion: PROMPT_VERSION, preview: p.preview, sources };
    if (cached) return { task, result: postProcess(task, input, cached), meta: { ...meta, cached: true } };
    if (p.preview) {
      await this.db.withTenant(caller.tenantId, (tx) => this.record(tx, caller, task, 'ok'));
      return { task, result: previewOutput(task, input), meta: { ...meta, cached: false } };
    }

    const started = Date.now();
    const usage: Usage = { promptTokens: 0, completionTokens: 0, provider: p.name, model: p.model };
    let outcome: Outcome = 'ok';
    let detail: string | undefined;
    let result: TaskOutput<T> | undefined;
    try {
      result = await this.generate(task, input, grounding, usage);
      const bad = unsafeTerm(allText(result), grounding.institutionKind === 'school');
      if (bad) {
        outcome = 'blocked';
        detail = `output: ${bad}`;
      }
    } catch (e) {
      outcome = e instanceof AiUnavailableError ? 'unavailable' : 'invalid';
      detail = (e as Error).message.slice(0, 500);
      this.log.warn(`AI ${task} failed: ${detail}`);
    }

    await this.db.withTenant(caller.tenantId, async (tx) => {
      await this.record(tx, caller, task, outcome, { ...usage, latencyMs: Date.now() - started, detail });
      if (outcome === 'ok' && result) {
        await tx
          .insert(aiCache)
          .values({ tenantId: caller.tenantId, key, task, result, model: usage.model })
          .onConflictDoUpdate({ target: [aiCache.tenantId, aiCache.key], set: { result, model: usage.model, createdAt: new Date(), hits: 0 } });
      }
    });
    if (usage.costInr !== undefined) {
      this.log.log(`AI ${task} served by ${usage.provider} (${usage.model}): ${usage.promptTokens}+${usage.completionTokens} tokens, about ₹${usage.costInr.toFixed(4)}`);
    }

    if (outcome === 'unavailable') throw new ServiceUnavailableException('KINETIX AI is not reachable right now. Try again in a minute.');
    if (outcome === 'invalid') throw new BadGatewayException('KINETIX AI could not produce a usable answer. Try again or rephrase.');
    if (outcome === 'blocked') throw new UnprocessableEntityException(BLOCKED);
    return { task, result: result!, meta: { ...meta, provider: usage.provider, model: usage.model, cached: false } };
  }

  /** Calls the model; if the reply is not the right JSON, tells it what was wrong once. */
  private async generate<T extends TaskName>(task: T, input: TaskInput<T>, g: Grounding, usage: Usage): Promise<TaskOutput<T>> {
    // A text-only provider (e.g. the Sarvam fallback on its own) cannot read the board.
    if (task === 'readBoard' && this.provider.vision === false) throw new AiUnavailableError('No vision model is configured', false);
    const messages = buildMessages(task, input, g);
    for (let attempt = 0; ; attempt++) {
      const reply = await this.provider.complete(messages, { maxTokens: MAX_TOKENS[task], temperature: task === 'summarize' || task === 'readBoard' ? 0.1 : 0.5 });
      usage.promptTokens += reply.promptTokens;
      usage.completionTokens += reply.completionTokens;
      usage.provider = reply.provider ?? usage.provider;
      usage.model = reply.model ?? usage.model;
      if (reply.costInr !== undefined) usage.costInr = (usage.costInr ?? 0) + reply.costInr;
      let problem: string;
      try {
        const parsed = TaskOutputs[task].safeParse(parseJsonReply(reply.text));
        if (parsed.success) {
          const out = parsed.data as TaskOutput<T>;
          const wrong = checkOutput(task, input, out);
          // Close enough (or still off after one repair): the minutes are scaled to fit.
          if (!wrong || (attempt >= 1 && task === 'lessonPlan')) return postProcess(task, input, out);
          problem = wrong;
        } else {
          problem = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'reply'}: ${i.message}`).join('; ');
        }
      } catch (e) {
        problem = (e as Error).message;
      }
      if (attempt >= 1) throw new Error(`Invalid ${task} reply: ${problem}`);
      messages.push({ role: 'assistant', content: reply.text }, { role: 'user', content: `That reply was not valid (${problem}). Send the corrected JSON object only.` });
    }
  }

  private async grounding(tx: Tx, caller: AiCaller, request: string, task: TaskName, language: Language): Promise<{ grounding: Grounding; sources: { topicId: string; title: string }[] }> {
    const [tenant] = await tx.select({ name: tenants.name, kind: tenants.kind }).from(tenants).where(eq(tenants.id, caller.tenantId));
    const g: Grounding = { institution: tenant?.name ?? 'an Indian institution', institutionKind: tenant?.kind ?? 'school' };
    if (caller.sectionId) {
      const [s] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, caller.sectionId));
      if (s) g.className = s.name;
    }
    let courseId: string | null = null;
    if (caller.subjectId) {
      const [s] = await tx.select({ name: subjects.name, courseId: subjects.courseId }).from(subjects).where(eq(subjects.id, caller.subjectId));
      if (s) g.subjectName = s.name;
      courseId = s?.courseId ?? null;
    }
    // Syllabus notes from the content library: the chosen topic, or the best matches in the course.
    const found = caller.topicId
      ? await this.content.topicsById(tx, [caller.topicId])
      : courseId
        ? await this.content.matchTopics(tx, courseId, request)
        : [];
    // The notes in the answer's language when the lesson has them in it.
    const inLanguage = (t: (typeof found)[number]) => (language === 'en' ? undefined : t.lesson?.[language]);
    const notes = found.flatMap((t) => (inLanguage(t)?.notes.length ? inLanguage(t)!.notes : t.notes)).slice(0, 12);
    if (notes.length) g.notes = notes;
    // The lesson the curriculum team wrote for the best topic: its terms and worked example, and
    // for a lesson plan how it opens and what the class does.
    const best = found.find((t) => t.lesson);
    if (best?.lesson) {
      const l = inLanguage(best)?.notes.length ? { ...best.lesson, ...inLanguage(best)! } : best.lesson;
      const lesson: NonNullable<Grounding['lesson']> = {};
      if (l.terms.length) lesson.terms = l.terms.slice(0, 15);
      if (l.example) lesson.example = l.example;
      if (task === 'lessonPlan' && l.hook) lesson.hook = l.hook;
      if (task === 'lessonPlan' && l.activity) lesson.activity = l.activity;
      if (Object.keys(lesson).length) g.lesson = lesson;
    }
    return { grounding: g, sources: found.map((t) => ({ topicId: t.id, title: t.title })) };
  }

  private cacheKey(task: TaskName, input: unknown, g: Grounding): string {
    const norm = JSON.stringify({ task, v: PROMPT_VERSION, g, input }).toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256').update(norm).digest('hex');
  }

  private async usedToday(tx: Tx): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(gte(aiUsage.createdAt, sql`now() - interval '1 day'`), inArray(aiUsage.outcome, ['ok', 'invalid', 'blocked'])));
    return row?.n ?? 0;
  }

  private async record(
    tx: Tx,
    caller: AiCaller,
    task: TaskName,
    outcome: Outcome,
    extra: Partial<Usage> & { latencyMs?: number; detail?: string } = {},
  ) {
    const { costInr, provider, model, ...rest } = extra;
    await tx.insert(aiUsage).values({
      tenantId: caller.tenantId,
      userId: caller.userId ?? null,
      deviceId: caller.deviceId ?? null,
      task,
      outcome,
      provider: provider ?? this.provider.name,
      model: model ?? this.provider.model,
      promptVersion: PROMPT_VERSION,
      estCostInr: costInr ?? null,
      ...rest,
    });
  }
}

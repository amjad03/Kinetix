import { Body, Controller, Get, HttpCode, Post, Put, Query, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { resolveProvider, type EmbeddingProvider, type EmbeddingSettings } from '../ai/embeddings.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chapters, topics } from '../db/schema.js';
import { contentEmbeddings } from '../db/schema-integrations.js';
import { INTEGRATION_ADMIN, getSetting, maskSecrets, putSetting, sha256 } from './common.js';

const ADMIN = [...INTEGRATION_ADMIN] as RoleName[];
const READERS = [...INTEGRATION_ADMIN, 'teacher', 'hod'] as RoleName[];
const ConfigBody = z.object({ provider: z.enum(['hashed', 'http', 'local']), url: z.url().optional(), model: z.string().trim().max(120).optional(), apiKey: z.string().trim().max(300).optional() });

/** Semantic retrieval over the syllabus: topic embeddings kept per provider, ranked by cosine in the database. */
@Controller('v1/retrieval')
export class RetrievalController {
  constructor(private readonly db: DbService) {}

  private async provider(tx: Tx, tenantId: string): Promise<EmbeddingProvider> {
    return resolveProvider((await getSetting(tx, tenantId, 'embeddings')) as EmbeddingSettings);
  }

  @Get('status')
  @Auth('user', READERS)
  status(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cfg = await getSetting(tx, p.tenantId, 'embeddings');
      const prov = await this.provider(tx, p.tenantId);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(contentEmbeddings).where(eq(contentEmbeddings.provider, prov.id));
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(topics).where(or(eq(topics.tenantId, p.tenantId), sql`${topics.tenantId} is null`));
      return { provider: prov.id, config: maskSecrets(cfg, ['apiKey']), indexed: n, topics: total };
    });
  }

  @Put('config')
  @Auth('user', ADMIN)
  saveConfig(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConfigBody)) b: z.infer<typeof ConfigBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await putSetting(tx, p.tenantId, 'embeddings', b);
      await auditUser(tx, p, 'retrieval.config_saved', 'integration', undefined, { provider: b.provider });
      return maskSecrets(v, ['apiKey']);
    });
  }

  /** Embeds every topic that is new or changed since it was last indexed with the current provider. */
  @Post('reindex')
  @HttpCode(200)
  @Auth('user', ADMIN)
  reindex(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const prov = await this.provider(tx, p.tenantId);
      const rows = await tx.select({ id: topics.id, title: topics.title, summary: topics.summary, notes: topics.notes, chapter: chapters.title }).from(topics).innerJoin(chapters, eq(chapters.id, topics.chapterId)).where(or(eq(topics.tenantId, p.tenantId), sql`${topics.tenantId} is null`));
      const have = new Map((await tx.select({ id: contentEmbeddings.sourceId, h: contentEmbeddings.textHash }).from(contentEmbeddings).where(and(eq(contentEmbeddings.provider, prov.id), eq(contentEmbeddings.sourceType, 'topic')))).map((r) => [r.id, r.h]));
      const todo = rows.map((r) => ({ r, text: `${r.chapter}. ${r.title}. ${r.summary} ${r.notes.join(' ')}`.trim() })).map((x) => ({ ...x, hash: sha256(x.text) })).filter((x) => have.get(x.r.id) !== x.hash);
      for (let i = 0; i < todo.length; i += 32) {
        const batch = todo.slice(i, i + 32);
        let vecs: Float32Array[];
        try {
          vecs = await prov.embed(batch.map((b) => b.text));
        } catch (e) {
          throw new ServiceUnavailableException((e as Error).message);
        }
        for (let j = 0; j < batch.length; j++) {
          const values = { tenantId: p.tenantId, sourceType: 'topic', sourceId: batch[j].r.id, provider: prov.id, dims: vecs[j].length, vec: Array.from(vecs[j]), label: batch[j].r.title, textHash: batch[j].hash };
          const [cur] = await tx.select({ id: contentEmbeddings.id }).from(contentEmbeddings).where(and(eq(contentEmbeddings.sourceType, 'topic'), eq(contentEmbeddings.sourceId, values.sourceId), eq(contentEmbeddings.provider, prov.id)));
          if (cur) await tx.update(contentEmbeddings).set(values).where(eq(contentEmbeddings.id, cur.id));
          else await tx.insert(contentEmbeddings).values(values);
        }
      }
      await auditUser(tx, p, 'retrieval.reindexed', 'integration', undefined, { provider: prov.id, embedded: todo.length });
      return { provider: prov.id, embedded: todo.length, unchanged: rows.length - todo.length };
    });
  }

  /** The topics closest in meaning to the question. */
  @Get('search')
  @Auth('user', READERS)
  search(@CurrentPrincipal() p: UserPrincipal, @Query('q') q = '', @Query('limit') limit = '5') {
    const k = Math.min(Math.max(Number(limit) || 5, 1), 20);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!q.trim()) return { provider: null, results: [] };
      const prov = await this.provider(tx, p.tenantId);
      const [v] = await prov.embed([q]);
      const lit = `{${Array.from(v).join(',')}}`;
      const rows = (await tx.execute(sql`select source_id as "topicId", label, kx_cosine(vec, ${lit}::real[]) as score from content_embeddings where provider = ${prov.id} and source_type = 'topic' and dims = ${v.length} order by score desc limit ${k}`)).rows as { topicId: string; label: string; score: number }[];
      return { provider: prov.id, results: rows.map((r) => ({ ...r, score: Math.round(r.score * 1000) / 1000 })) };
    });
  }
}

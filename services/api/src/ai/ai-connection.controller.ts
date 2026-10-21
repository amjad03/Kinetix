import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { AiConnections, CLAUDE_MODELS } from './ai-connection.service.js';
import { AiService } from './ai.service.js';

const Model = z.enum(CLAUDE_MODELS);
const ConnectionBody = z
  .object({
    apiKey: z.string().trim().min(20, 'That does not look like an Anthropic API key').max(400).optional(),
    model: Model.optional(),
    fallbackModel: Model.nullable().optional(),
  })
  .strict();

export const NOT_AI_CONNECTION_ADMIN = "Only the institution's admin or principal can change its AI connection";

/**
 * The institution's own Claude connection (Zynetix dashboard, AI settings). Signed-in users only;
 * the handler admits tenant_admin and principal, and the KINETIX platform team. The key is never returned.
 */
@Controller('v1/ai/admin/connection')
export class AiConnectionController {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiService,
    private readonly connections: AiConnections,
    private readonly system: SystemLookups,
  ) {}

  private async requireAdmin(p: UserPrincipal): Promise<void> {
    if (p.roles.some((r) => r === 'tenant_admin' || r === 'principal')) return;
    if (await this.system.isPlatformAdmin(p.userId)) return;
    throw new ForbiddenException(NOT_AI_CONNECTION_ADMIN);
  }

  @Get()
  @Auth('user')
  async get(@CurrentPrincipal() p: UserPrincipal) {
    await this.requireAdmin(p);
    return this.db.withTenant(p.tenantId, (tx) => this.connections.view(tx, this.ai.serverProvider));
  }

  @Put()
  @Auth('user')
  async put(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConnectionBody)) b: z.infer<typeof ConnectionBody>) {
    await this.requireAdmin(p);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.connections.view(tx, this.ai.serverProvider);
      if (!before.keySet && !b.apiKey) throw new BadRequestException('Paste the Anthropic API key first');
      const changed = await this.connections.save(tx, p.tenantId, p.userId, b);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'ai.connection_updated', subjectType: 'tenant', subjectId: p.tenantId, data: { provider: 'anthropic', ...changed } });
      return this.connections.view(tx, this.ai.serverProvider);
    });
  }

  @Delete()
  @Auth('user')
  async remove(@CurrentPrincipal() p: UserPrincipal) {
    await this.requireAdmin(p);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const removed = await this.connections.remove(tx, p.tenantId);
      if (removed) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'ai.connection_removed', subjectType: 'tenant', subjectId: p.tenantId, data: { provider: 'anthropic' } });
      return this.connections.view(tx, this.ai.serverProvider);
    });
  }

  /** One tiny real completion with the institution's key (else the server's AI): { ok, model, latencyMs } or { ok: false, error }. */
  @Post('test')
  @HttpCode(200)
  @Auth('user')
  async test(@CurrentPrincipal() p: UserPrincipal) {
    await this.requireAdmin(p);
    const stored = await this.db.withTenant(p.tenantId, (tx) => this.connections.stored(tx));
    const provider = stored ? this.connections.build(stored, false) : this.ai.serverProvider;
    if (provider.preview) return { ok: false as const, error: 'No AI is connected: paste a Claude API key first' };
    return this.connections.test(provider);
  }
}

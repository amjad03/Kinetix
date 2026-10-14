import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ssoProviders } from '../db/schema.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { Text } from '../records/helpers.js';
import { rowOf } from '../research/kit.js';
import { aad, domain, SSO_ADMIN, SsoService } from './sso.controller.js';

const KINDS: FieldOption[] = [
  { value: 'google', label: 'Google Workspace' },
  { value: 'microsoft', label: 'Microsoft Entra' },
  { value: 'generic', label: 'Another OpenID Connect provider' },
];
type Kind = 'google' | 'microsoft' | 'generic';

/** A list typed one per line or separated by commas. */
const lines = (v: unknown) => [...new Set(String(v ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))];
const Domains = z.union([z.string(), z.null()]).transform((v, ctx) => {
  const list = lines(v).map((d) => d.toLowerCase());
  if (!list.length) ctx.addIssue({ code: 'custom', message: 'Add at least one email domain' });
  for (const d of list) if (!domain.safeParse(d).success) ctx.addIssue({ code: 'custom', message: `Enter a domain like college.edu (${d})` });
  return list.slice(0, 20);
});
const Redirects = z.union([z.string(), z.null()]).transform((v, ctx) => {
  const list = lines(v);
  if (!list.length) ctx.addIssue({ code: 'custom', message: 'Add at least one return address' });
  return list.slice(0, 20).map((x) => x.slice(0, 300));
});
const Secret = z.union([z.string().trim().max(500), z.null()]).transform((v) => (v ? v : null));

/**
 * The institution's OpenID Connect providers as a record kit list: added with their client secret (encrypted, never
 * shown again), edited (a new secret replaces the old one; leaving it empty keeps it), switched on or off in bulk,
 * deleted to the recycle bin and restored.
 */
@Injectable()
export class SsoRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly sso: SsoService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.providers());
  }

  private providers(): RecordEntity {
    const sso = this.sso;
    const set = async (ctx: KitCtx, id: string, values: Partial<typeof ssoProviders.$inferInsert>) => void (await ctx.tx.update(ssoProviders).set(values).where(eq(ssoProviders.id, id)));
    return {
      key: 'sso-providers',
      module: 'settings',
      table: ssoProviders,
      subjectType: 'sso_provider',
      roles: { read: SSO_ADMIN, write: SSO_ADMIN },
      label: (r) => String(r.name),
      list: {
        select: {
          id: ssoProviders.id,
          kind: ssoProviders.kind,
          name: ssoProviders.name,
          clientId: ssoProviders.clientId,
          issuer: ssoProviders.issuer,
          scopes: ssoProviders.scopes,
          allowedDomains: sql<string>`array_to_string(${ssoProviders.allowedDomains}, ', ')`,
          redirectAllowlist: sql<string>`array_to_string(${ssoProviders.redirectAllowlist}, E'\\n')`,
          enabled: ssoProviders.enabled,
          hasSecret: sql<boolean>`${ssoProviders.clientSecretEnc} <> ''`,
          createdAt: ssoProviders.createdAt,
        },
        search: [ssoProviders.name, ssoProviders.clientId, sql`array_to_string(${ssoProviders.allowedDomains}, ' ')`],
        filters: {
          kind: { label: 'Provider', options: KINDS, where: (v) => (KINDS.some((k) => k.value === v) ? eq(ssoProviders.kind, v) : undefined) },
          enabled: { label: 'Switched on', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], where: (v) => (v === 'yes' ? eq(ssoProviders.enabled, true) : v === 'no' ? eq(ssoProviders.enabled, false) : undefined) },
        },
        sorts: { name: ssoProviders.name, kind: ssoProviders.kind, createdAt: ssoProviders.createdAt },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        kind: { label: 'Provider', type: 'select', schema: z.enum(['google', 'microsoft', 'generic']), column: ssoProviders.kind, options: KINDS, required: true, edit: false },
        name: { label: 'Name on the sign-in button', type: 'text', schema: Text(80), column: ssoProviders.name, required: true },
        clientId: { label: 'Client ID', type: 'text', schema: Text(300), column: ssoProviders.clientId, required: true },
        clientSecret: {
          label: 'Client secret',
          type: 'text',
          schema: Secret,
          rowKey: 'secretMask',
          help: 'Stored encrypted and never shown again. Leave empty when editing to keep the current one.',
          apply: async (ctx, id, v) => {
            if (v) await set(ctx, id, { clientSecretEnc: sso.box.encrypt(String(v), aad(ctx.p.tenantId)) });
          },
        },
        directoryId: {
          label: 'Microsoft directory (tenant) ID',
          type: 'text',
          schema: z.union([z.string().trim().max(100), z.null()]),
          rowKey: 'directoryMask',
          help: 'Microsoft only; leave empty to accept any work or school account',
          edit: false,
          apply: async () => undefined,
        },
        issuer: {
          label: 'Issuer address',
          type: 'text',
          schema: z.union([z.url(), z.literal(''), z.null()]).transform((v) => v || null),
          help: 'Another provider only: its settings are read from this address',
          apply: async (ctx, id, v) => {
            if (!v) return;
            const cur = await rowOf(ctx, ssoProviders, id);
            const ep = await sso.endpoints({ kind: cur.kind as Kind, issuer: String(v) });
            await set(ctx, id, ep);
          },
        },
        scopes: { label: 'Scopes', type: 'text', schema: z.string().trim().max(200).default('openid email profile'), column: ssoProviders.scopes },
        allowedDomains: {
          label: 'Email domains',
          type: 'textarea',
          schema: Domains,
          required: true,
          help: 'One per line, for example college.edu',
          apply: async (ctx, id, v) => {
            await sso.assertDomainsFree(ctx.p.tenantId, v as string[], id);
            await set(ctx, id, { allowedDomains: v as string[] });
          },
        },
        redirectAllowlist: { label: 'Return addresses', type: 'textarea', schema: Redirects, required: true, help: 'One per line: the ERP callback, or an app address like kinetix://sso', apply: async (ctx, id, v) => set(ctx, id, { redirectAllowlist: v as string[] }) },
        enabled: { label: 'Switched on', type: 'boolean', schema: z.boolean(), column: ssoProviders.enabled, bulk: true },
      },
      create: async (ctx, v) => {
        const kind = v.kind as Kind;
        if (!v.clientSecret) throw new BadRequestException('Enter the client secret');
        const domains = v.allowedDomains as string[];
        const ep = await sso.endpoints({ kind, directoryId: (v.directoryId as string | null) || undefined, issuer: (v.issuer as string | null) || undefined });
        await sso.assertDomainsFree(ctx.p.tenantId, domains, undefined);
        const [row] = await ctx.tx
          .insert(ssoProviders)
          .values({ tenantId: ctx.p.tenantId, kind, name: String(v.name), clientId: String(v.clientId), clientSecretEnc: sso.box.encrypt(String(v.clientSecret), aad(ctx.p.tenantId)), ...ep, scopes: String(v.scopes || 'openid email profile'), allowedDomains: domains, redirectAllowlist: v.redirectAllowlist as string[], enabled: v.enabled === undefined ? true : !!v.enabled })
          .returning({ id: ssoProviders.id });
        return row.id;
      },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'kind', header: 'Provider', value: (r) => KINDS.find((k) => k.value === r.kind)?.label ?? String(r.kind) },
        { key: 'clientId', header: 'Client ID' },
        { key: 'issuer', header: 'Issuer' },
        { key: 'allowedDomains', header: 'Email domains' },
        { key: 'redirectAllowlist', header: 'Return addresses' },
        { key: 'enabled', header: 'Switched on', value: (r) => (r.enabled ? 'Yes' : 'No') },
      ],
    };
  }
}

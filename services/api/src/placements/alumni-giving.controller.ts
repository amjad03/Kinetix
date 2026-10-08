import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, nextNumber, orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { alumniCampaigns, alumniDonations, alumniPledges, alumniProfiles, alumniVolunteerOpportunities, alumniVolunteerSignups, tenants } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { financialYear, receiptPdf } from './alumni-giving.logic.js';
import { found } from './placements.access.js';

/** Alumni relations plus the accounts office: campaigns, pledges, donations and receipts. */
const GIVING_ROLES: RoleName[] = ['tenant_admin', 'principal', 'placement_officer', 'accountant'];
const VOLUNTEER_ROLES: RoleName[] = ['tenant_admin', 'principal', 'placement_officer'];

const Opt = (n: number) => z.string().trim().max(n).optional();
const Amount = z.number().int().min(1).max(10_000_000_000);
const CampaignBody = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  goalPaise: z.number().int().min(0).max(100_000_000_000).default(0),
  startsOn: Day.optional(),
  endsOn: Day.optional(),
  status: z.enum(['active', 'closed']).default('active'),
  /** Printed on every receipt, e.g. "Donations are exempt under Section 80G, registration no. ...". */
  receiptNote: z.string().trim().max(500).default(''),
});
const PledgeBody = z.object({ alumniId: z.uuid().optional(), donorName: Opt(120), amountPaise: Amount, pledgedOn: Day, dueOn: Day.optional(), note: z.string().trim().max(500).default('') });
const PledgeStatus = z.object({ status: z.enum(['open', 'fulfilled', 'cancelled']) });
const DonationBody = z.object({
  alumniId: z.uuid().optional(),
  pledgeId: z.uuid().optional(),
  donorName: Opt(120),
  donorPan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN looks like ABCDE1234F').optional(),
  donorAddress: z.string().trim().max(400).default(''),
  amountPaise: Amount,
  mode: z.enum(['cash', 'cheque', 'upi', 'bank_transfer', 'card', 'other']),
  reference: Opt(120),
  receivedOn: Day,
  note: z.string().trim().max(500).default(''),
});
const OpportunityBody = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).default(''), startsOn: Day.optional(), slots: z.number().int().min(1).max(10_000).optional(), status: z.enum(['open', 'closed']).default('open') });
const SignupBody = z.object({ alumniId: z.uuid(), note: z.string().trim().max(500).default('') });

/** Alumni giving: donation campaigns with goals and totals, pledges, manually recorded donations with 80G-style receipts, and volunteering sign-ups. */
@Controller('v1/alumni')
export class AlumniGivingController {
  constructor(
    private readonly db: DbService,
    private readonly bus: EventBus,
  ) {}

  private async donor(tx: Tx, alumniId: string | undefined, name: string | undefined) {
    if (alumniId) {
      const a = found((await tx.select().from(alumniProfiles).where(eq(alumniProfiles.id, alumniId)))[0], 'Alumni profile');
      return { alumniId, name: name ?? a.fullName };
    }
    if (!name) throw new BadRequestException('Give the donor name, or pick an alumni profile');
    return { alumniId: null, name };
  }

  // ---- campaigns ----------------------------------------------------------------------------

  @Get('campaigns')
  @Auth('user', GIVING_ROLES)
  campaigns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      (
        await tx.execute(sql`
          select c.*,
            coalesce((select sum(d.amount_paise) from alumni_donations d where d.campaign_id = c.id), 0)::bigint as raised_paise,
            (select count(*) from alumni_donations d where d.campaign_id = c.id)::int as donations,
            (select count(distinct coalesce(d.alumni_id::text, lower(d.donor_name))) from alumni_donations d where d.campaign_id = c.id)::int as donors,
            coalesce((select sum(pl.amount_paise) from alumni_pledges pl where pl.campaign_id = c.id and pl.status = 'open'), 0)::bigint as pledged_open_paise
          from alumni_campaigns c order by c.status, c.created_at desc`)
      ).rows.map((r) => this.campaignOut(r as Record<string, unknown>)),
    );
  }

  private campaignOut(r: Record<string, unknown>) {
    const goal = Number(r.goal_paise);
    const raised = Number(r.raised_paise);
    return { id: r.id, name: r.name, description: r.description, goalPaise: goal, startsOn: r.starts_on, endsOn: r.ends_on, status: r.status, receiptNote: r.receipt_note, createdAt: r.created_at, raisedPaise: raised, donations: r.donations, donors: r.donors, pledgedOpenPaise: Number(r.pledged_open_paise), percent: goal > 0 ? Math.round((raised / goal) * 1000) / 10 : null };
  }

  @Post('campaigns')
  @Auth('user', GIVING_ROLES)
  createCampaign(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CampaignBody)) b: z.infer<typeof CampaignBody>) {
    if (b.startsOn && b.endsOn && b.startsOn > b.endsOn) throw new BadRequestException('The campaign cannot end before it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(alumniCampaigns).values({ tenantId: p.tenantId, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'alumni.campaign_created', 'alumni_campaign', row.id, { name: b.name, goalPaise: b.goalPaise });
      return row;
    });
  }

  @Put('campaigns/:id')
  @Auth('user', GIVING_ROLES)
  updateCampaign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CampaignBody)) b: z.infer<typeof CampaignBody>) {
    if (b.startsOn && b.endsOn && b.startsOn > b.endsOn) throw new BadRequestException('The campaign cannot end before it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(alumniCampaigns).set(b).where(eq(alumniCampaigns.id, id)).returning();
      await auditUser(tx, p, 'alumni.campaign_updated', 'alumni_campaign', id, { status: b.status, goalPaise: b.goalPaise });
      return found(row, 'Campaign');
    });
  }

  /** One campaign with its totals, pledges and donations. */
  @Get('campaigns/:id')
  @Auth('user', GIVING_ROLES)
  campaign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = (
        await tx.execute(sql`
          select c.*,
            coalesce((select sum(d.amount_paise) from alumni_donations d where d.campaign_id = c.id), 0)::bigint as raised_paise,
            (select count(*) from alumni_donations d where d.campaign_id = c.id)::int as donations,
            (select count(distinct coalesce(d.alumni_id::text, lower(d.donor_name))) from alumni_donations d where d.campaign_id = c.id)::int as donors,
            coalesce((select sum(pl.amount_paise) from alumni_pledges pl where pl.campaign_id = c.id and pl.status = 'open'), 0)::bigint as pledged_open_paise
          from alumni_campaigns c where c.id = ${id}::uuid`)
      ).rows as Record<string, unknown>[];
      found(c, 'Campaign');
      const pledges = await tx.select().from(alumniPledges).where(eq(alumniPledges.campaignId, id)).orderBy(desc(alumniPledges.pledgedOn));
      const donations = await tx.select().from(alumniDonations).where(eq(alumniDonations.campaignId, id)).orderBy(desc(alumniDonations.receivedOn), desc(alumniDonations.createdAt));
      return { ...this.campaignOut(c), pledges, donationRows: donations };
    });
  }

  // ---- pledges and donations ----------------------------------------------------------------

  private async activeCampaign(tx: Tx, id: string) {
    const c = found((await tx.select().from(alumniCampaigns).where(eq(alumniCampaigns.id, id)))[0], 'Campaign');
    if (c.status !== 'active') throw new ConflictException('This campaign is closed');
    return c;
  }

  @Post('campaigns/:id/pledges')
  @Auth('user', GIVING_ROLES)
  pledge(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PledgeBody)) b: z.infer<typeof PledgeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.activeCampaign(tx, id);
      const d = await this.donor(tx, b.alumniId, b.donorName);
      const [row] = await tx.insert(alumniPledges).values({ tenantId: p.tenantId, campaignId: id, alumniId: d.alumniId, donorName: d.name, amountPaise: b.amountPaise, pledgedOn: b.pledgedOn, dueOn: b.dueOn ?? null, note: b.note, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'alumni.pledge_recorded', 'alumni_pledge', row.id, { campaignId: id, amountPaise: b.amountPaise });
      return row;
    });
  }

  @Patch('pledges/:id')
  @Auth('user', GIVING_ROLES)
  pledgeStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PledgeStatus)) b: z.infer<typeof PledgeStatus>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(alumniPledges).set({ status: b.status }).where(eq(alumniPledges.id, id)).returning();
      await auditUser(tx, p, 'alumni.pledge_updated', 'alumni_pledge', id, { status: b.status });
      return found(row, 'Pledge');
    });
  }

  /** Records a donation received (cash, cheque, UPI ...) and numbers its receipt `ALR-<financial year>-0001`. */
  @Post('campaigns/:id/donations')
  @Auth('user', GIVING_ROLES)
  donate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DonationBody)) b: z.infer<typeof DonationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.activeCampaign(tx, id);
      const d = await this.donor(tx, b.alumniId, b.donorName);
      let pledge: typeof alumniPledges.$inferSelect | undefined;
      if (b.pledgeId) {
        pledge = found((await tx.select().from(alumniPledges).where(and(eq(alumniPledges.id, b.pledgeId), eq(alumniPledges.campaignId, id))))[0], 'Pledge');
        if (pledge.status === 'cancelled') throw new ConflictException('That pledge was cancelled');
      }
      const serial = await nextNumber(tx, p.tenantId, `ALR-${financialYear(b.receivedOn)}`);
      const [row] = await orConflict('That receipt number is already in use; try again', () =>
        tx
          .insert(alumniDonations)
          .values({ tenantId: p.tenantId, campaignId: id, alumniId: d.alumniId, pledgeId: b.pledgeId ?? null, donorName: d.name, donorPan: b.donorPan ?? null, donorAddress: b.donorAddress, amountPaise: b.amountPaise, mode: b.mode, reference: b.reference ?? null, receivedOn: b.receivedOn, receiptSerial: serial, note: b.note, recordedBy: p.userId })
          .returning(),
      );
      if (pledge) {
        const [paid] = (await tx.execute(sql`select coalesce(sum(amount_paise), 0)::bigint as n from alumni_donations where pledge_id = ${pledge.id}::uuid`)).rows as { n: string }[];
        if (Number(paid.n) >= pledge.amountPaise) await tx.update(alumniPledges).set({ status: 'fulfilled' }).where(eq(alumniPledges.id, pledge.id));
      }
      await auditUser(tx, p, 'alumni.donation_recorded', 'alumni_donation', row.id, { campaignId: id, amountPaise: b.amountPaise, mode: b.mode, receiptSerial: serial });
      await this.bus.emit(tx, p.tenantId, { type: DomainEvents.AlumniDonationReceived, aggregateType: 'alumni_donation', aggregateId: row.id, payload: { campaignId: id, amountPaise: b.amountPaise, mode: b.mode, receiptSerial: serial }, actorId: p.userId });
      return row;
    });
  }

  @Get('donations')
  @Auth('user', GIVING_ROLES)
  donations(@CurrentPrincipal() p: UserPrincipal, @Query('campaignId') campaignId?: string) {
    if (campaignId && !z.uuid().safeParse(campaignId).success) throw new BadRequestException('campaignId must be an id');
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(alumniDonations).where(campaignId ? eq(alumniDonations.campaignId, campaignId) : undefined).orderBy(desc(alumniDonations.receivedOn), desc(alumniDonations.createdAt)).limit(500));
  }

  /** The receipt as a PDF. Downloading a receipt is audited. */
  @Get('donations/:id/receipt')
  @Auth('user', GIVING_ROLES)
  receipt(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = found((await tx.select().from(alumniDonations).where(eq(alumniDonations.id, id)))[0], 'Donation');
      const [c] = await tx.select().from(alumniCampaigns).where(eq(alumniCampaigns.id, d.campaignId));
      const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
      await auditUser(tx, p, 'alumni.receipt_downloaded', 'alumni_donation', id, { receiptSerial: d.receiptSerial });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${d.receiptSerial}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(receiptPdf({ institution: t?.name ?? '', serial: d.receiptSerial, receivedOn: d.receivedOn, donorName: d.donorName, donorPan: d.donorPan, donorAddress: d.donorAddress, amountPaise: d.amountPaise, mode: d.mode, reference: d.reference, campaign: c?.name ?? '', note: c?.receiptNote ?? '' }));
    });
  }

  // ---- volunteering -------------------------------------------------------------------------

  @Get('volunteering')
  @Auth('user', VOLUNTEER_ROLES)
  opportunities(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const opps = await tx.select().from(alumniVolunteerOpportunities).orderBy(desc(alumniVolunteerOpportunities.createdAt));
      const signups = await tx.select({ opportunityId: alumniVolunteerSignups.opportunityId, alumniId: alumniVolunteerSignups.alumniId, note: alumniVolunteerSignups.note, fullName: alumniProfiles.fullName }).from(alumniVolunteerSignups).innerJoin(alumniProfiles, eq(alumniProfiles.id, alumniVolunteerSignups.alumniId)).orderBy(asc(alumniProfiles.fullName));
      return opps.map((o) => ({ ...o, signups: signups.filter((s) => s.opportunityId === o.id) }));
    });
  }

  @Post('volunteering')
  @Auth('user', VOLUNTEER_ROLES)
  createOpportunity(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OpportunityBody)) b: z.infer<typeof OpportunityBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(alumniVolunteerOpportunities).values({ tenantId: p.tenantId, createdBy: p.userId, title: b.title, description: b.description, startsOn: b.startsOn ?? null, slots: b.slots ?? null, status: b.status }).returning();
      await auditUser(tx, p, 'alumni.volunteer_opportunity_created', 'alumni_volunteer_opportunity', row.id, { title: b.title });
      return row;
    });
  }

  @Put('volunteering/:id')
  @Auth('user', VOLUNTEER_ROLES)
  updateOpportunity(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OpportunityBody)) b: z.infer<typeof OpportunityBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(alumniVolunteerOpportunities).set({ title: b.title, description: b.description, startsOn: b.startsOn ?? null, slots: b.slots ?? null, status: b.status }).where(eq(alumniVolunteerOpportunities.id, id)).returning();
      await auditUser(tx, p, 'alumni.volunteer_opportunity_updated', 'alumni_volunteer_opportunity', id, { status: b.status });
      return found(row, 'Opportunity');
    });
  }

  /** Signs an alumnus or alumna up (staff record it on their behalf). Full or closed opportunities refuse. */
  @Post('volunteering/:id/signups')
  @Auth('user', VOLUNTEER_ROLES)
  signUp(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SignupBody)) b: z.infer<typeof SignupBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const o = found((await tx.select().from(alumniVolunteerOpportunities).where(eq(alumniVolunteerOpportunities.id, id)).for('update'))[0], 'Opportunity');
      if (o.status !== 'open') throw new ConflictException('This opportunity is closed');
      found((await tx.select({ id: alumniProfiles.id }).from(alumniProfiles).where(eq(alumniProfiles.id, b.alumniId)))[0], 'Alumni profile');
      const [n] = (await tx.execute(sql`select count(*)::int as n from alumni_volunteer_signups where opportunity_id = ${id}::uuid`)).rows as { n: number }[];
      if (o.slots !== null && n.n >= o.slots) throw new ConflictException('All places are taken');
      const done = await tx.insert(alumniVolunteerSignups).values({ tenantId: p.tenantId, opportunityId: id, alumniId: b.alumniId, note: b.note }).onConflictDoNothing().returning();
      if (done.length === 0) throw new ConflictException('Already signed up');
      await auditUser(tx, p, 'alumni.volunteer_signed_up', 'alumni_volunteer_opportunity', id, { alumniId: b.alumniId });
      return { opportunityId: id, alumniId: b.alumniId };
    });
  }

  @Delete('volunteering/:id/signups/:alumniId')
  @HttpCode(204)
  @Auth('user', VOLUNTEER_ROLES)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('alumniId', ParseUUIDPipe) alumniId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.delete(alumniVolunteerSignups).where(and(eq(alumniVolunteerSignups.opportunityId, id), eq(alumniVolunteerSignups.alumniId, alumniId)));
      await auditUser(tx, p, 'alumni.volunteer_withdrawn', 'alumni_volunteer_opportunity', id, { alumniId });
    });
  }
}

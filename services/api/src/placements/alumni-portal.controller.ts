import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { alumniCampaigns, alumniDonations, alumniPledges, alumniProfiles, alumniVolunteerOpportunities, alumniVolunteerSignups, tenants, userRoles, users } from '../db/schema.js';
import { receiptPdf } from './alumni-giving.logic.js';
import { found } from './placements.access.js';

const ALUMNI: RoleName[] = ['alumni'];
const LINKERS: RoleName[] = ['tenant_admin', 'principal', 'placement_officer'];
const Opt = z.string().trim().max(200).nullable().optional();
const ProfileBody = z.object({
  phone: z.string().trim().max(20).nullable().optional(),
  employer: Opt,
  designation: Opt,
  city: Opt,
  bio: z.string().trim().max(1000).optional(),
  directoryVisible: z.boolean().optional(),
  mentorAvailable: z.boolean().optional(),
});
const PledgeBody = z.object({ amountPaise: z.number().int().min(100).max(10_000_000_000), dueOn: Day.optional(), note: z.string().trim().max(500).default('') });
const LinkBody = z.object({ alumniId: z.uuid(), userId: z.uuid() });
const SignupBody = z.object({ note: z.string().trim().max(500).default('') });

/**
 * The alumni portal API: a graduate with an alumni login manages their own profile, sees and makes pledges,
 * downloads receipts of their own donations and volunteers. Everything is scoped to the caller's own profile.
 */
@Controller('v1/alumni-portal')
export class AlumniPortalController {
  constructor(private readonly db: DbService) {}

  /** The caller's alumni profile, or 404 when no profile is linked to their login. */
  private async mine(tx: Tx, p: UserPrincipal) {
    const [row] = await tx.select().from(alumniProfiles).where(eq(alumniProfiles.userId, p.userId));
    if (!row) throw new NotFoundException('No alumni profile is linked to your login; ask the alumni office');
    return row;
  }

  /** Staff link an alumni profile to a login and give that login the alumni role. */
  @Post('link')
  @HttpCode(200)
  @Auth('user', LINKERS)
  link(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LinkBody)) b: z.infer<typeof LinkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const prof = found((await tx.select().from(alumniProfiles).where(eq(alumniProfiles.id, b.alumniId)))[0], 'Alumni profile');
      found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.userId)))[0], 'User');
      const [taken] = await tx.select({ id: alumniProfiles.id }).from(alumniProfiles).where(eq(alumniProfiles.userId, b.userId));
      if (taken && taken.id !== prof.id) throw new ConflictException('That login is linked to another profile');
      await tx.update(alumniProfiles).set({ userId: b.userId }).where(eq(alumniProfiles.id, prof.id));
      const [has] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, b.userId), eq(userRoles.role, 'alumni')));
      if (!has) await tx.insert(userRoles).values({ tenantId: p.tenantId, userId: b.userId, role: 'alumni' });
      await auditUser(tx, p, 'alumni.portal_linked', 'alumni_profile', prof.id, { userId: b.userId });
      return { alumniId: prof.id, userId: b.userId };
    });
  }

  @Get('me')
  @Auth('user', ALUMNI)
  profile(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.mine(tx, p));
  }

  @Put('me')
  @Auth('user', ALUMNI)
  update(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ProfileBody)) b: z.infer<typeof ProfileBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      const [row] = await tx.update(alumniProfiles).set(b).where(eq(alumniProfiles.id, me.id)).returning();
      await auditUser(tx, p, 'alumni.profile_self_updated', 'alumni_profile', me.id, { fields: Object.keys(b) });
      return row;
    });
  }

  /** Active campaigns I can give to. */
  @Get('campaigns')
  @Auth('user', ALUMNI)
  campaigns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: alumniCampaigns.id, name: alumniCampaigns.name, description: alumniCampaigns.description, goalPaise: alumniCampaigns.goalPaise, endsOn: alumniCampaigns.endsOn }).from(alumniCampaigns).where(eq(alumniCampaigns.status, 'active')).orderBy(desc(alumniCampaigns.createdAt)));
  }

  /** My pledges and the donations received from me (with receipt numbers). */
  @Get('giving')
  @Auth('user', ALUMNI)
  giving(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      const pledges = await tx.select().from(alumniPledges).where(eq(alumniPledges.alumniId, me.id)).orderBy(desc(alumniPledges.pledgedOn));
      const donations = await tx
        .select({ id: alumniDonations.id, campaignId: alumniDonations.campaignId, campaign: alumniCampaigns.name, amountPaise: alumniDonations.amountPaise, mode: alumniDonations.mode, receivedOn: alumniDonations.receivedOn, receiptSerial: alumniDonations.receiptSerial })
        .from(alumniDonations)
        .innerJoin(alumniCampaigns, eq(alumniCampaigns.id, alumniDonations.campaignId))
        .where(eq(alumniDonations.alumniId, me.id))
        .orderBy(desc(alumniDonations.receivedOn));
      return { pledges, donations, totalGivenPaise: donations.reduce((a, d) => a + d.amountPaise, 0) };
    });
  }

  /** I pledge to a campaign. The accounts office records the money when it arrives. */
  @Post('campaigns/:id/pledges')
  @Auth('user', ALUMNI)
  pledge(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PledgeBody)) b: z.infer<typeof PledgeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      const c = found((await tx.select().from(alumniCampaigns).where(eq(alumniCampaigns.id, id)))[0], 'Campaign');
      if (c.status !== 'active') throw new ConflictException('This campaign is closed');
      const today = new Date().toISOString().slice(0, 10);
      const [row] = await tx.insert(alumniPledges).values({ tenantId: p.tenantId, campaignId: id, alumniId: me.id, donorName: me.fullName, amountPaise: b.amountPaise, pledgedOn: today, dueOn: b.dueOn ?? null, note: b.note, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'alumni.pledge_self_recorded', 'alumni_pledge', row.id, { campaignId: id, amountPaise: b.amountPaise });
      return row;
    });
  }

  /** The receipt of one of my own donations. */
  @Get('donations/:id/receipt')
  @Auth('user', ALUMNI)
  receipt(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      const [d] = await tx.select().from(alumniDonations).where(and(eq(alumniDonations.id, id), eq(alumniDonations.alumniId, me.id)));
      if (!d) throw new NotFoundException('Donation not found');
      const [c] = await tx.select().from(alumniCampaigns).where(eq(alumniCampaigns.id, d.campaignId));
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      await auditUser(tx, p, 'alumni.receipt_downloaded', 'alumni_donation', id, { receiptSerial: d.receiptSerial });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${d.receiptSerial}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(receiptPdf({ institution: t?.name ?? '', serial: d.receiptSerial, receivedOn: d.receivedOn, donorName: d.donorName, donorPan: d.donorPan, donorAddress: d.donorAddress, amountPaise: d.amountPaise, mode: d.mode, reference: d.reference, campaign: c?.name ?? '', note: c?.receiptNote ?? '' }));
    });
  }

  /** Open volunteering opportunities, with whether I am signed up. */
  @Get('volunteering')
  @Auth('user', ALUMNI)
  volunteering(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      const opps = await tx.select().from(alumniVolunteerOpportunities).where(eq(alumniVolunteerOpportunities.status, 'open')).orderBy(asc(alumniVolunteerOpportunities.startsOn));
      const counts = (await tx.execute(sql`select opportunity_id, count(*)::int as n from alumni_volunteer_signups group by opportunity_id`)).rows as { opportunity_id: string; n: number }[];
      const mine = new Set((await tx.select({ id: alumniVolunteerSignups.opportunityId }).from(alumniVolunteerSignups).where(eq(alumniVolunteerSignups.alumniId, me.id))).map((r) => r.id));
      return opps.map((o) => ({ id: o.id, title: o.title, description: o.description, startsOn: o.startsOn, slots: o.slots, taken: counts.find((c) => c.opportunity_id === o.id)?.n ?? 0, signedUp: mine.has(o.id) }));
    });
  }

  @Post('volunteering/:id/signup')
  @Auth('user', ALUMNI)
  signUp(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SignupBody)) b: z.infer<typeof SignupBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      const o = found((await tx.select().from(alumniVolunteerOpportunities).where(eq(alumniVolunteerOpportunities.id, id)).for('update'))[0], 'Opportunity');
      if (o.status !== 'open') throw new ConflictException('This opportunity is closed');
      const [again] = await tx.select({ id: alumniVolunteerSignups.opportunityId }).from(alumniVolunteerSignups).where(and(eq(alumniVolunteerSignups.opportunityId, id), eq(alumniVolunteerSignups.alumniId, me.id)));
      if (again) throw new ConflictException('You are already signed up');
      const [n] = (await tx.execute(sql`select count(*)::int as n from alumni_volunteer_signups where opportunity_id = ${id}::uuid`)).rows as { n: number }[];
      if (o.slots !== null && n.n >= o.slots) throw new ConflictException('All places are taken');
      const done = await tx.insert(alumniVolunteerSignups).values({ tenantId: p.tenantId, opportunityId: id, alumniId: me.id, note: b.note }).onConflictDoNothing().returning();
      if (done.length === 0) throw new ConflictException('You are already signed up');
      await auditUser(tx, p, 'alumni.volunteer_self_signed_up', 'alumni_volunteer_opportunity', id, { alumniId: me.id });
      return { opportunityId: id };
    });
  }

  @Delete('volunteering/:id/signup')
  @HttpCode(204)
  @Auth('user', ALUMNI)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.mine(tx, p);
      await tx.delete(alumniVolunteerSignups).where(and(eq(alumniVolunteerSignups.opportunityId, id), eq(alumniVolunteerSignups.alumniId, me.id)));
      await auditUser(tx, p, 'alumni.volunteer_self_withdrawn', 'alumni_volunteer_opportunity', id, { alumniId: me.id });
    });
  }
}

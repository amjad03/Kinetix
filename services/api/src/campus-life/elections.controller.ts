import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { sections, students } from '../db/schema.js';
import { electionBallots, electionCandidates, electionPosts, elections, electionVoters } from '../db/schema-life.js';
import { found } from '../placements/placements.access.js';
import { COMMITTEE_STAFF } from './campus-life.access.js';
import { CampusLifeService } from './campus-life.service.js';
import { qualified } from './kit-shared.js';
import { electedOf } from './life-depth.service.js';

const Window = { votingStartsAt: z.coerce.date(), votingEndsAt: z.coerce.date() };
const ElectionBody = z
  .object({ title: z.string().trim().min(3).max(200), description: z.string().trim().max(4000).default(''), programIds: z.array(z.uuid()).max(100).optional(), ...Window })
  .refine((b) => b.votingEndsAt > b.votingStartsAt, { message: 'Voting must close after it opens', path: ['votingEndsAt'] });
const ElectionPatch = z.object({ title: z.string().trim().min(3).max(200).optional(), description: z.string().trim().max(4000).optional(), programIds: z.array(z.uuid()).max(100).nullable().optional(), votingStartsAt: z.coerce.date().optional(), votingEndsAt: z.coerce.date().optional() });
const PostBody = z.object({ title: z.string().trim().min(2).max(120), seats: z.number().int().min(1).max(50).default(1) });
const CandidateBody = z.object({ studentId: z.uuid(), manifesto: z.string().trim().max(4000).default('') });
const VoteBody = z.object({ studentId: z.uuid().optional(), choices: z.array(z.object({ postId: z.uuid(), candidateIds: z.array(z.uuid()).max(50) })).min(1).max(100) });

type Election = typeof elections.$inferSelect;

/**
 * Student council elections: posts and candidates, a voting window, one secret ballot per student (who voted and
 * how they voted are kept in separate tables), the count when voting closes (a tie at the last seat is reported),
 * and the published results.
 */
@Controller('v1/campus-life')
export class ElectionsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CampusLifeService,
  ) {}

  @Post('elections')
  @Auth('user', COMMITTEE_STAFF)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ElectionBody)) b: z.infer<typeof ElectionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(elections).values({ tenantId: p.tenantId, title: b.title, description: b.description, programIds: b.programIds?.length ? b.programIds : null, votingStartsAt: b.votingStartsAt, votingEndsAt: b.votingEndsAt, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'election.created', subjectType: 'election', subjectId: row.id, after: { title: row.title }, data: { label: row.title } });
      return row;
    });
  }

  @Patch('elections/:id')
  @Auth('user', COMMITTEE_STAFF)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ElectionPatch)) b: z.infer<typeof ElectionPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.load(tx, id, true);
      if (e.status !== 'draft' && (b.votingStartsAt || b.votingEndsAt || b.programIds !== undefined)) throw new ConflictException('The voting window and voters are fixed once voting opens');
      const start = b.votingStartsAt ?? e.votingStartsAt;
      const end = b.votingEndsAt ?? e.votingEndsAt;
      if (end <= start) throw new BadRequestException('Voting must close after it opens');
      const [row] = await tx.update(elections).set({ ...b, programIds: b.programIds === undefined ? e.programIds : b.programIds?.length ? b.programIds : null }).where(eq(elections.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'election.updated', subjectType: 'election', subjectId: id, before: { title: e.title, votingStartsAt: e.votingStartsAt, votingEndsAt: e.votingEndsAt }, after: { title: row.title, votingStartsAt: row.votingStartsAt, votingEndsAt: row.votingEndsAt } });
      return row;
    });
  }

  /** An election with posts, candidates, turnout and (once closed) the count. */
  @Get('elections/:id')
  @Auth('user', COMMITTEE_STAFF)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.load(tx, id);
      const [voters] = await tx.select({ n: sql<number>`count(*)::int` }).from(electionVoters).where(eq(electionVoters.electionId, id));
      return { election: e, posts: await this.posts(tx, id, e.status !== 'draft' && e.status !== 'open'), voted: voters.n, electorate: await this.electorateSize(tx, e) };
    });
  }

  @Post('elections/:id/posts')
  @Auth('user', COMMITTEE_STAFF)
  addPost(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PostBody)) b: z.infer<typeof PostBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.load(tx, id, true);
      if (e.status !== 'draft') throw new ConflictException('Posts are fixed once voting opens');
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(electionPosts).where(eq(electionPosts.electionId, id));
      const [row] = await tx.insert(electionPosts).values({ tenantId: p.tenantId, electionId: id, title: b.title, seats: b.seats, sortOrder: n.n }).returning();
      await auditUser(tx, p, 'election.post_added', 'election', id, { postId: row.id, title: b.title, seats: b.seats });
      return row;
    });
  }

  @Delete('election-posts/:postId')
  @Auth('user', COMMITTEE_STAFF)
  dropPost(@CurrentPrincipal() p: UserPrincipal, @Param('postId', ParseUUIDPipe) postId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const post = found((await tx.select().from(electionPosts).where(eq(electionPosts.id, postId)))[0], 'Post');
      const e = await this.load(tx, post.electionId, true);
      if (e.status !== 'draft') throw new ConflictException('Posts are fixed once voting opens');
      await tx.delete(electionPosts).where(eq(electionPosts.id, postId));
      await auditUser(tx, p, 'election.post_removed', 'election', e.id, { postId, title: post.title });
      return { ok: true };
    });
  }

  @Post('election-posts/:postId/candidates')
  @Auth('user', COMMITTEE_STAFF)
  nominate(@CurrentPrincipal() p: UserPrincipal, @Param('postId', ParseUUIDPipe) postId: string, @Body(new ZodBody(CandidateBody)) b: z.infer<typeof CandidateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const post = found((await tx.select().from(electionPosts).where(eq(electionPosts.id, postId)))[0], 'Post');
      const e = await this.load(tx, post.electionId, true);
      if (e.status !== 'draft') throw new ConflictException('Nominations close when voting opens');
      if (!(await this.eligible(tx, e, b.studentId))) throw new ConflictException('This student is not among the voters of this election');
      const [other] = await tx.select({ id: electionCandidates.id }).from(electionCandidates).innerJoin(electionPosts, eq(electionPosts.id, electionCandidates.postId)).where(and(eq(electionPosts.electionId, e.id), eq(electionCandidates.studentId, b.studentId), eq(electionCandidates.status, 'approved')));
      if (other) throw new ConflictException('This student already stands for another post');
      const [row] = await tx.insert(electionCandidates).values({ tenantId: p.tenantId, postId, studentId: b.studentId, manifesto: b.manifesto }).onConflictDoUpdate({ target: [electionCandidates.postId, electionCandidates.studentId], set: { status: 'approved', manifesto: b.manifesto } }).returning();
      await auditUser(tx, p, 'election.candidate_added', 'election', e.id, { postId, studentId: b.studentId });
      return row;
    });
  }

  @Post('election-candidates/:candidateId/withdraw')
  @Auth('user', COMMITTEE_STAFF)
  @HttpCode(200)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(electionCandidates).where(eq(electionCandidates.id, candidateId)))[0], 'Candidate');
      const [post] = await tx.select().from(electionPosts).where(eq(electionPosts.id, c.postId));
      const e = await this.load(tx, post.electionId, true);
      if (e.status !== 'draft') throw new ConflictException('A candidate can withdraw only before voting opens');
      await tx.update(electionCandidates).set({ status: 'withdrawn' }).where(eq(electionCandidates.id, candidateId));
      await auditUser(tx, p, 'election.candidate_withdrawn', 'election', e.id, { candidateId, studentId: c.studentId });
      return { ok: true };
    });
  }

  /** Opens voting: every post needs at least one candidate. */
  @Post('elections/:id/open')
  @Auth('user', COMMITTEE_STAFF)
  @HttpCode(200)
  open(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.load(tx, id, true);
      if (e.status !== 'draft') throw new ConflictException(`This election is already ${e.status}`);
      const posts = await this.posts(tx, id, false);
      if (!posts.length) throw new ConflictException('Add the posts first');
      const empty = posts.find((x) => !x.candidates.length);
      if (empty) throw new ConflictException(`No candidate stands for ${empty.title}`);
      if (e.votingEndsAt <= this.svc.now()) throw new ConflictException('The voting window has already passed: change it first');
      const [row] = await tx.update(elections).set({ status: 'open' }).where(eq(elections.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'election.opened', subjectType: 'election', subjectId: id, changes: { status: { before: 'draft', after: 'open' } } });
      return row;
    });
  }

  /** Closes voting and counts the ballots. */
  @Post('elections/:id/close')
  @Auth('user', COMMITTEE_STAFF)
  @HttpCode(200)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.load(tx, id, true);
      if (e.status !== 'open') throw new ConflictException('Only an open election can be closed');
      const ties: string[] = [];
      for (const post of await tx.select().from(electionPosts).where(eq(electionPosts.electionId, id))) {
        const cands = await tx.select({ id: electionCandidates.id, votes: sql<number>`(select count(*)::int from election_ballots b where b.candidate_id = ${qualified('election_candidates')})` }).from(electionCandidates).where(and(eq(electionCandidates.postId, post.id), eq(electionCandidates.status, 'approved')));
        const { elected, tie } = electedOf(cands, post.seats);
        if (tie) ties.push(post.title);
        for (const c of cands) await tx.update(electionCandidates).set({ votes: c.votes, elected: elected.includes(c.id) }).where(eq(electionCandidates.id, c.id));
      }
      const [row] = await tx.update(elections).set({ status: 'closed' }).where(eq(elections.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'election.closed', subjectType: 'election', subjectId: id, changes: { status: { before: 'open', after: 'closed' } }, data: { ties } });
      return { ...row, ties };
    });
  }

  /** Publishes the results to students. */
  @Post('elections/:id/publish')
  @Auth('user', COMMITTEE_STAFF)
  @HttpCode(200)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.load(tx, id, true);
      if (e.status !== 'closed') throw new ConflictException('Close the vote before publishing the results');
      const [row] = await tx.update(elections).set({ status: 'published', publishedAt: this.svc.now() }).where(eq(elections.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'election.published', subjectType: 'election', subjectId: id, changes: { status: { before: 'closed', after: 'published' } } });
      return row;
    });
  }

  // ---- students ------------------------------------------------------------------------------------

  /** Elections a student can vote in now, and published results. */
  @Get('me/elections')
  @Auth('user', ['student'])
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, studentId);
      const rows = await tx.select().from(elections).where(inArray(elections.status, ['open', 'published'])).orderBy(asc(elections.votingStartsAt));
      const out = [];
      for (const e of rows) {
        if (!(await this.eligible(tx, e, sid))) continue;
        const [v] = await tx.select({ id: electionVoters.id }).from(electionVoters).where(and(eq(electionVoters.electionId, e.id), eq(electionVoters.studentId, sid)));
        const now = this.svc.now();
        out.push({ id: e.id, title: e.title, description: e.description, status: e.status, votingStartsAt: e.votingStartsAt, votingEndsAt: e.votingEndsAt, canVote: e.status === 'open' && !v && now >= e.votingStartsAt && now < e.votingEndsAt, voted: !!v, posts: await this.posts(tx, e.id, e.status === 'published') });
      }
      return out;
    });
  }

  /** Casts the student's one ballot: up to the post's seats per post. Who voted and how are stored apart. */
  @Post('elections/:id/vote')
  @Auth('user', ['student'])
  @HttpCode(200)
  vote(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VoteBody)) b: z.infer<typeof VoteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, b.studentId);
      const e = await this.load(tx, id, true);
      const now = this.svc.now();
      if (e.status !== 'open' || now < e.votingStartsAt || now >= e.votingEndsAt) throw new ConflictException('Voting is not open');
      if (!(await this.eligible(tx, e, sid))) throw new ForbiddenException('You are not a voter in this election');
      const [already] = await tx.select({ id: electionVoters.id }).from(electionVoters).where(and(eq(electionVoters.electionId, id), eq(electionVoters.studentId, sid)));
      if (already) throw new ConflictException('You have already voted');
      const posts = await tx.select().from(electionPosts).where(eq(electionPosts.electionId, id));
      const ballots: { postId: string; candidateId: string }[] = [];
      for (const c of b.choices) {
        const post = posts.find((x) => x.id === c.postId);
        if (!post) throw new BadRequestException('A choice is for a post not in this election');
        const picks = [...new Set(c.candidateIds)];
        if (picks.length > post.seats) throw new BadRequestException(`Choose at most ${post.seats} for ${post.title}`);
        if (picks.length) {
          const valid = await tx.select({ id: electionCandidates.id }).from(electionCandidates).where(and(eq(electionCandidates.postId, post.id), eq(electionCandidates.status, 'approved'), inArray(electionCandidates.id, picks)));
          if (valid.length !== picks.length) throw new BadRequestException(`A choice for ${post.title} is not a candidate`);
        }
        for (const candidateId of picks) ballots.push({ postId: post.id, candidateId });
      }
      await tx.insert(electionVoters).values({ tenantId: p.tenantId, electionId: id, studentId: sid, votedAt: now });
      if (ballots.length) await tx.insert(electionBallots).values(ballots.map((x) => ({ tenantId: p.tenantId, electionId: id, ...x })));
      // The audit records that a vote was cast, never the choices.
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'election.voted', subjectType: 'election', subjectId: id });
      return { ok: true };
    });
  }

  // ---- helpers -------------------------------------------------------------------------------------

  private async load(tx: Tx, id: string, lock = false): Promise<Election> {
    const q = tx.select().from(elections).where(eq(elections.id, id));
    return found((await (lock ? q.for('update') : q))[0], 'Election');
  }

  private async posts(tx: Tx, electionId: string, withCount: boolean) {
    const posts = await tx.select().from(electionPosts).where(eq(electionPosts.electionId, electionId)).orderBy(asc(electionPosts.sortOrder), asc(electionPosts.title));
    const cands = posts.length
      ? await tx
          .select({ id: electionCandidates.id, postId: electionCandidates.postId, studentId: electionCandidates.studentId, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, manifesto: electionCandidates.manifesto, status: electionCandidates.status, votes: electionCandidates.votes, elected: electionCandidates.elected })
          .from(electionCandidates)
          .innerJoin(students, eq(students.id, electionCandidates.studentId))
          .innerJoin(sections, eq(sections.id, students.sectionId))
          .where(and(inArray(electionCandidates.postId, posts.map((x) => x.id)), eq(electionCandidates.status, 'approved')))
          .orderBy(asc(students.fullName))
      : [];
    return posts.map((post) => ({ ...post, candidates: cands.filter((c) => c.postId === post.id).map(({ votes, elected, ...c }) => (withCount ? { ...c, votes, elected } : c)) }));
  }

  private async eligible(tx: Tx, e: Election, studentId: string): Promise<boolean> {
    const [s] = await tx.select({ status: students.status, programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    return s.status === 'active' && (!e.programIds?.length || e.programIds.includes(s.programId));
  }

  private async electorateSize(tx: Tx, e: Election): Promise<number> {
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(and(eq(students.status, 'active'), e.programIds?.length ? inArray(sections.programId, e.programIds) : undefined));
    return n.n;
  }
}

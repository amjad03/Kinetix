import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { AffiliationService } from './affiliation.service.js';

/** Who sets the affiliation and its overrides: the institution's administrators and the controller of examinations. */
const MANAGE: RoleName[] = [...STAFF_ADMIN_ROLES, 'exam_controller'];
/** Who reads the rules in force (heads and teachers see how grading works). */
const READ: RoleName[] = [...new Set<RoleName>([...MANAGE, ...TEACHING_ROLES])];

const Code = z.string().trim().regex(/^[a-z0-9-]{2,60}$/);
const SelectBody = z.object({ profileCode: Code, schemeCode: Code.nullable().optional() });
const OverridesBody = z.object({ programId: z.uuid().nullable().optional(), overrides: z.record(z.string(), z.unknown()), reason: z.string().trim().min(3).max(300) });
const SheetBody = z.object({
  csv: z.string().min(1).max(5_000_000),
  fileName: z.string().trim().min(1).max(200).default('university-result.csv'),
  academicYear: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Academic year looks like 2025-26'),
  term: z.number().int().min(1).max(12),
  programId: z.uuid().nullable().optional(),
  dryRun: z.boolean().default(true),
});

/** Affiliating university / board profiles (docs/architecture/university-profiles.md). */
@Controller('v1/affiliation')
export class AffiliationController {
  constructor(
    private readonly svc: AffiliationService,
    private readonly db: DbService,
  ) {}

  /** Every university, board and framework with its schemes (the setup wizard's picker). */
  @Get('profiles')
  @Auth('user', READ)
  profiles() {
    return this.svc.catalogue();
  }

  /** One profile with every scheme's rules, sources and notes. */
  @Get('profiles/:code')
  @Auth('user', READ)
  profile(@Param('code') code: string) {
    return this.svc.profile(code);
  }

  @Get()
  @Auth('user', READ)
  overview(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.overview(p);
  }

  /** The rules in force for the institution, or for a programme with `?programId=`. */
  @Get('rules')
  @Auth('user', READ)
  rules(@CurrentPrincipal() p: UserPrincipal, @Query('programId', new ParseUUIDPipe({ optional: true })) programId?: string) {
    return this.svc.rules(p, programId);
  }

  @Put()
  @Auth('user', MANAGE)
  select(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SelectBody)) b: z.infer<typeof SelectBody>) {
    return this.svc.select(p, b);
  }

  @Put('programmes/:programId')
  @Auth('user', MANAGE)
  setProgramme(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(SelectBody)) b: z.infer<typeof SelectBody>) {
    return this.svc.setProgramme(p, programId, b);
  }

  @Delete('programmes/:programId')
  @HttpCode(200)
  @Auth('user', MANAGE)
  clearProgramme(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.svc.clearProgramme(p, programId);
  }

  /** Replaces the overrides (a partial rules object) of the institution or of a programme; audited value by value. */
  @Put('overrides')
  @Auth('user', MANAGE)
  overrides(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OverridesBody)) b: z.infer<typeof OverridesBody>) {
    return this.svc.saveOverrides(p, b);
  }

  @Get('history')
  @Auth('user', MANAGE)
  history(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.history(p);
  }

  /** The marks-card data contract for a student's published result (student, family, staff). */
  @Get('marks-card/:studentId')
  @Auth('user')
  marksCard(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, [...TEACHING_ROLES, 'tenant_admin', 'exam_controller']);
      return this.svc.marksCard(tx, p.tenantId, studentId, sessionId);
    });
  }

  /** Reads a university result sheet in the profile's layout into the marks history (dry run by default). */
  @Post('result-sheet')
  @HttpCode(200)
  @Auth('user', MANAGE)
  resultSheet(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SheetBody)) b: z.infer<typeof SheetBody>) {
    return this.svc.resultSheet(p, b);
  }

  /** Installs the profile's tabulation register as a university-results template. */
  @Post('tabulation-template')
  @HttpCode(200)
  @Auth('user', MANAGE)
  template(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ programId: z.uuid().nullable().optional() }))) b: { programId?: string | null }) {
    return this.svc.installTemplate(p, b.programId);
  }
}

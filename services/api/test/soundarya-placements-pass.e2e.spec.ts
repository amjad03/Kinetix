import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ctx, SectionRef, StudentRef } from '../src/db/soundarya/ctx.js';
import { placements } from '../src/db/soundarya/engagement.js';
import { makeKit } from '../src/db/soundarya/kit.js';
import { placementsPass } from '../src/db/soundarya/placements-pass.js';
import { createTenant, ownerPool } from './helpers.js';

// The Soundarya placements pass sample must load into the schema and give every report a number for every year.
describe('Soundarya placements pass sample', () => {
  const owner = ownerPool();
  afterAll(() => owner.end());
  let t: Awaited<ReturnType<typeof createTenant>>;
  beforeAll(async () => {
    t = await createTenant(owner);
  });

  it('seeds the recruiter log, documents, training, five outgoing batches, apprenticeships and referrals', async () => {
    const q = (sql: string, p: unknown[] = []) => owner.query(sql, [t.tenantId, ...p]);
    const one = async (sql: string, p: unknown[] = []) => (await q(sql, p)).rows[0];
    const year = (await one(`select id from academic_years where tenant_id = $1`)).id as string;
    await q(`insert into academic_years (tenant_id, label, starts_on, ends_on, is_current) values ($1, '2025-26', '2025-08-01', '2026-05-31', false)`);
    const programs: Ctx['programs'] = {};
    const sections: SectionRef[] = [];
    const students: StudentRef[] = [];
    for (const [code, name] of [['BCM', 'BCom'], ['BBA', 'BBA'], ['BCA', 'BCA'], ['BAV', 'BBA Aviation']]) {
      const p = await one(`insert into programs (tenant_id, campus_id, name, level, term_count) values ($1, $2, $3, 'ug', 6) returning id`, [t.campus.id, `${name} (sample)`]);
      programs[code] = { id: p.id, def: { code, name, level: 'ug', terms: 6 } as Ctx['programs'][string]['def'] };
      const s = await one(`insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name) values ($1, $2, $3, 5, 'A', $4) returning id`, [p.id, year, `${name} Sem 5 A`]);
      const mine: StudentRef[] = [];
      for (let i = 0; i < 6; i++) {
        const st = await one(`insert into students (tenant_id, section_id, roll_no, full_name) values ($1, $2, $3, $4) returning id`, [s.id, `${code}5${i}`, `${name} student ${i}`]);
        mine.push({ id: st.id, name: `${name} student ${i}`, rollNo: `${code}5${i}`, sectionId: s.id, prog: code, term: 5, female: i % 2 === 0, presence: 0.7 + i * 0.04, ability: 0.3 + i * 0.1 });
      }
      students.push(...mine);
      sections.push({ id: s.id, programId: p.id, prog: code, def: programs[code].def, term: 5, label: `${name} Sem 5 A`, roomId: t.room.id, subjects: [], students: mine, slotIds: [] });
    }
    await q(`insert into module_settings (tenant_id, module, settings, numbering) values ($1, 'placements', '{"rules": {"offerPolicy": "dream"}, "templates": {}, "defaults": {}}'::jsonb, '{}'::jsonb)`);
    await q(`insert into alumni_profiles (tenant_id, full_name, graduation_year, program, employer, directory_visible, mentor_available) values ($1, 'Deepa Rao', 2021, 'BCom', 'Infosys', true, true)`);
    const me = { id: t.principal.id, name: 'Staff', email: 'x@x.in' };
    let seed = 7;
    const ctx = {
      kit: makeKit(owner, t.tenantId),
      r: { next: () => ((seed = (seed * 9301 + 49297) % 233280) / 233280), int: (a: number) => a, pick: <T>(xs: T[]) => xs[0], chance: () => false },
      tenantId: t.tenantId,
      today: '2026-11-03',
      byEmail: new Proxy({}, { get: () => me }),
      programs,
      sections,
      students,
      teachers: [me, me, me],
    } as unknown as Ctx;
    await placements(ctx);
    await placementsPass(ctx, { files: false });

    // The recruiter log: three follow-ups due by the day (two overdue), every company with an owner and a stage.
    expect(Number((await one(`select count(*)::int as n from placement_interactions where tenant_id = $1 and not follow_up_done and follow_up_on <= '2026-11-03'`)).n)).toBe(3);
    expect(Number((await one(`select count(*)::int as n from placement_companies where tenant_id = $1 and owner_user_id is null`)).n)).toBe(0);
    // Documents in every state; registrations keep a resume.
    const docs = Object.fromEntries((await q(`select status, count(*)::int as n from placement_documents where tenant_id = $1 group by status`)).rows.map((r) => [r.status, r.n]));
    expect(docs.verified).toBeGreaterThan(0);
    expect(docs.pending).toBeGreaterThan(0);
    // Training: sessions with attendance for the final year and two aptitude tests out of 50.
    expect(Number((await one(`select count(*)::int as n from placement_training_attendance where tenant_id = $1`)).n)).toBeGreaterThan(0);
    expect(Number((await one(`select count(distinct test_name)::int as n from placement_training_scores where tenant_id = $1 and max_score = 50`)).n)).toBe(2);
    // Five outgoing batches: each year has graduates, about two in three placed, and someone gone on to higher studies.
    const BATCH = `(extract(year from ay.ends_on)::int + floor((p.term_count - s.term) / 2.0)::int)`;
    const years = (await q(`select ${BATCH} as y, count(*)::int as n,
        count(*) filter (where exists (select 1 from placement_offers o where o.student_id = st.id and o.status = 'accepted'))::int as placed,
        count(*) filter (where exists (select 1 from student_progressions g where g.student_id = st.id and g.kind = 'higher_studies'))::int as hs
      from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id join academic_years ay on ay.id = s.academic_year_id
      where st.tenant_id = $1 and st.status = 'alumni' group by 1 order by 1`)).rows;
    expect(years.map((r) => r.y)).toEqual([2022, 2023, 2024, 2025, 2026]);
    for (const r of years) {
      expect(r.placed / r.n).toBeGreaterThan(0.5);
      expect(r.placed / r.n).toBeLessThan(0.8);
      expect(r.hs).toBeGreaterThan(0);
    }
    // One accepted offer per student, each on a registration of its own drive.
    expect((await q(`select student_id from placement_offers where tenant_id = $1 and status = 'accepted' group by 1 having count(*) > 1`)).rows).toEqual([]);
    expect((await q(`select o.id from placement_offers o join drive_registrations r on r.id = o.registration_id where o.tenant_id = $1 and (r.drive_id <> o.drive_id or r.student_id <> o.student_id)`)).rows).toEqual([]);
    // NATS: half the ₹12,300 graduate minimum, ₹6,150, on every apprenticeship; stipends paid for the months gone.
    expect((await q(`select distinct govt_share_paise from apprenticeships where tenant_id = $1`)).rows).toEqual([{ govt_share_paise: 615000 }]);
    expect(Number((await one(`select count(*)::int as n from apprenticeship_stipends where tenant_id = $1`)).n)).toBe(8);
    // AICTE: a completed internship's 240 hours are 5 credits.
    expect((await q(`select distinct credits::float8 as c from internships where tenant_id = $1 and status = 'completed'`)).rows).toEqual([{ c: 5 }]);
    expect(Number((await one(`select count(*)::int as n from placement_referrals where tenant_id = $1`)).n)).toBeGreaterThan(0);
    // The women-only fellowship is open, and the settings carry the dream lines.
    expect((await one(`select genders from placement_drives where tenant_id = $1 and title like '%Women in Finance%'`)).genders).toEqual(['female']);
    expect((await one(`select settings->'rules'->>'dreamMinLpa' as v from module_settings where tenant_id = $1 and module = 'placements'`)).v).toBe('6');
  });
});

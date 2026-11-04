import { sql } from 'drizzle-orm';
import { PdfWriter } from '../common/pdf.js';
import type { Tx } from '../db/db.service.js';
import { ctcSummary } from './eligibility.js';

const BATCH = sql`(extract(year from ay.ends_on)::int + case when p.level = 'k12' then p.term_count - s.term else floor((p.term_count - s.term) / 2.0)::int end)`;
const lakh = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)} LPA`);
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

/**
 * The placement brochure recruiters are sent: the institution, the year's outcome (students placed, offers,
 * recruiters, highest, median and average package), results by programme, the top recruiters, the training the batch
 * had, the programmes on offer next year, and whom to contact. One or two A4 pages.
 */
export async function brochurePdf(tx: Tx, year: number): Promise<Buffer> {
  const [inst] = (await tx.execute<{ name: string; city: string | null; state: string | null; naac: string | null; aishe: string | null; website: string | null; email: string | null; phone: string | null; affiliation: string | null }>(sql`
    select t.name, ip.city, ip.state, ip.naac_grade as naac, ip.aishe_code as aishe, ip.website, ip.email, ip.phone, ip.board_or_university as affiliation
    from tenants t left join institution_profiles ip on ip.tenant_id = t.id where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid`)).rows;
  const programmes = (await tx.execute<{ program: string; students: number; placed: number; ctcs: number[] | null }>(sql`
    with b as (select st.id, p.name as program from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id join academic_years ay on ay.id = s.academic_year_id
      where st.status not in ('dropped', 'transferred', 'expelled', 'deceased') and ${BATCH} = ${year}
        and not exists (select 1 from placement_optins o where o.student_id = st.id and o.opted_in = false))
    select b.program, count(*)::int as students,
      count(*) filter (where exists (select 1 from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement'))::int as placed,
      array_remove(array_agg((select max(o.ctc_lpa) from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement')), null)::float8[] as ctcs
    from b group by b.program order by b.program`)).rows;
  const offers = (await tx.execute<{ company: string; sector: string; offers: number; ctc: number | null }>(sql`
    select c.name as company, c.sector, count(o.id)::int as offers, max(o.ctc_lpa)::float8 as ctc
    from placement_offers o join placement_drives d on d.id = o.drive_id join placement_companies c on c.id = d.company_id
    where d.kind = 'placement' and o.status in ('offered', 'accepted') and extract(year from o.offered_on) = ${year}
    group by c.id order by count(o.id) desc, c.name limit 12`)).rows;
  const all = (await tx.execute<{ ctc: number }>(sql`
    select o.ctc_lpa::float8 as ctc from placement_offers o join placement_drives d on d.id = o.drive_id
    where d.kind = 'placement' and o.status = 'accepted' and o.ctc_lpa is not null and extract(year from o.offered_on) = ${year}`)).rows.map((r) => Number(r.ctc));
  const [counts] = (await tx.execute<{ offers: number; recruiters: number; internships: number }>(sql`
    select (select count(*)::int from placement_offers o join placement_drives d on d.id = o.drive_id where d.kind = 'placement' and o.status in ('offered', 'accepted') and extract(year from o.offered_on) = ${year}) as offers,
      (select count(distinct d.company_id)::int from placement_drives d where extract(year from coalesce(d.drive_date, (d.created_at at time zone 'Asia/Kolkata')::date)) = ${year} and d.status <> 'cancelled') as recruiters,
      (select count(*)::int from internships i where extract(year from i.starts_on) = ${year} and i.status in ('ongoing', 'completed')) as internships`)).rows;
  const training = (await tx.execute<{ title: string; kind: string; hours: number }>(sql`
    select t.title, t.kind, coalesce((select sum(x.hours) from placement_training_sessions x where x.training_id = t.id), 0)::float8 as hours
    from placement_trainings t where extract(year from t.starts_on) between ${year - 1} and ${year} and t.status <> 'cancelled' order by t.starts_on`)).rows;
  const contacts = (await tx.execute<{ name: string; email: string | null; phone: string | null }>(sql`
    select distinct u.full_name as name, u.email, u.phone from users u join user_roles r on r.user_id = u.id where r.role = 'placement_officer' and u.status = 'active' order by u.full_name limit 3`)).rows;

  const placed = programmes.reduce((s, r) => s + Number(r.placed), 0);
  const eligible = programmes.reduce((s, r) => s + Number(r.students), 0);
  const ctc = ctcSummary(all);
  const pdf = new PdfWriter();
  pdf.text(inst?.name ?? 'Placement cell', { size: 18, bold: true, align: 'center' });
  pdf.text(`Training and Placement Cell: Placement Brochure ${year}`, { size: 12, align: 'center' });
  const place = [inst?.city, inst?.state].filter(Boolean).join(', ');
  const facts = [place, inst?.affiliation ? `Affiliated to ${inst.affiliation}` : '', inst?.naac ? `NAAC ${inst.naac}` : '', inst?.aishe ? `AISHE ${inst.aishe}` : ''].filter(Boolean).join('  |  ');
  if (facts) pdf.text(facts, { size: 9, align: 'center' });
  pdf.rule();
  pdf.text(`The ${year} batch at a glance`, { size: 12, bold: true });
  const xs = [0, 130, 260, 390];
  pdf.row(['Students placed', 'Placement rate', 'Offers made', 'Recruiters'], xs, { bold: true });
  pdf.row([String(placed), pct(placed, eligible), String(counts?.offers ?? 0), String(counts?.recruiters ?? 0)], xs, { size: 11 });
  pdf.gap(4);
  pdf.row(['Highest package', 'Median package', 'Average package', 'Internships'], xs, { bold: true });
  pdf.row([lakh(ctc.highest), lakh(ctc.median), lakh(ctc.average), String(counts?.internships ?? 0)], xs, { size: 11 });
  pdf.gap(8);
  pdf.text('Results by programme', { size: 12, bold: true });
  const px = [0, 170, 250, 310, 370, 440];
  pdf.row(['Programme', 'Students', 'Placed', 'Placed %', 'Median', 'Highest'], px, { bold: true });
  for (const r of programmes) {
    const s = ctcSummary((r.ctcs ?? []).map(Number));
    pdf.row([r.program, String(r.students), String(r.placed), pct(Number(r.placed), Number(r.students)), lakh(s.median), lakh(s.highest)], px);
  }
  if (!programmes.length) pdf.text('No graduating batch on record for this year.', { size: 9 });
  pdf.gap(8);
  if (offers.length) {
    pdf.text('Our recruiters', { size: 12, bold: true });
    const rx = [0, 200, 340, 420];
    pdf.row(['Company', 'Sector', 'Offers', 'Highest'], rx, { bold: true });
    for (const o of offers) pdf.row([o.company, o.sector, String(o.offers), lakh(o.ctc === null ? null : Number(o.ctc))], rx);
    pdf.gap(8);
  }
  if (training.length) {
    pdf.text('Training the batch received', { size: 12, bold: true });
    for (const t of training) pdf.text(`${t.title} (${t.kind.replace('_', ' ')}): ${Number(t.hours)} hours`, { size: 9, x: 8 });
    pdf.gap(8);
  }
  pdf.text('To recruit from our campus', { size: 12, bold: true });
  for (const c of contacts) pdf.text([c.name, c.email, c.phone].filter(Boolean).join('  |  '), { size: 10, x: 8 });
  const reach = [inst?.email, inst?.phone, inst?.website].filter(Boolean).join('  |  ');
  if (reach) pdf.text(reach, { size: 10, x: 8 });
  pdf.gap(6);
  pdf.text('Packages are cost to company in lakh rupees a year, from offers accepted by students of the batch.', { size: 8 });
  return pdf.build();
}
